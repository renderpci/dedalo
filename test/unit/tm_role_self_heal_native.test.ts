/**
 * THE tm_role COLUMN SELF-HEALS OR FAILS CLOSED (WC-2026-09-27-bulk-revert-undo-log
 * §1; record_generation.ts ensureTmRoleColumn).
 *
 * Migration 0010_tm_role.sql adds `matrix_time_machine.tm_role` at boot. The boot
 * runner gives up after its lock retries and the server serves on — and every
 * history reader (`withTmHistory` / `tmVisiblePredicate`) and every undo-log
 * INSERT names the column. Without a heal, one busy boot left the dd15 UI, every
 * delete and every bulk run dying on `column "tm_role" does not exist` behind a
 * healthy-looking server. The outcomes pinned here:
 *   - a caller OUTSIDE a transaction adds the column exactly as 0010 does (same
 *     type, nullability, CHECK definition — compared against the real table);
 *   - a caller INSIDE a transaction never takes the ACCESS EXCLUSIVE lock: it
 *     fails closed with a typed error and the column stays absent;
 *   - a heal that cannot get its lock in time fails closed with the same typed
 *     error (never a hang, never a half-added column);
 *   - the BOOT hook heals it after a failed migration run, before serving, so
 *     the in-transaction doors never meet the missing column on a healthy DB.
 *
 * Driven on SCRATCH tables (`dedalo_ts_test_tm_role_heal_*`), never on
 * matrix_time_machine: dropping the real column would break every concurrent
 * reader of the suite database. assertTestDatabase before the first write.
 *
 * THE WIRING (the last describe) is the one exception, and it never lets the
 * real column go: it is dropped INSIDE a transaction that always rolls back
 * (DDL is transactional; concurrent readers wait on the lock for an instant,
 * none sees the column missing). Pinned there:
 *   - a counter-allocated create never depends on tm_role (the epoch store's
 *     bootstrap is not the column's heal);
 *   - a reader after a FAILED heal retries it — never the raw
 *     `column "tm_role" does not exist` of a memo that swallowed the heal.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { runBootSchema } from '../../install/db/migrate.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import {
	ensureRecordGenerationTable,
	ensureTmRoleColumn,
	resetSchemaMemosForTests,
} from '../../src/core/db/record_generation.ts';
import { readTimeMachineHistory } from '../../src/core/db/time_machine.ts';
import { isDedaloError } from '../../src/core/errors/dedalo_error.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { withLiveBulkRun } from '../../src/core/tools/bulk_run_registry.ts';
import { toolTimeMachineBulkRevert } from '../../tools/tool_time_machine/server/bulk_revert.ts';

/**
 * One scratch table PER CASE: the heal's memo is per table name for the life of
 * the process (it is set only on success), so a case reusing a healed name
 * would read the memo, not the table.
 */
const SCRATCH_PREFIX = 'dedalo_ts_test_tm_role_heal';
const created: string[] = [];

async function recreateScratch(suffix: string): Promise<string> {
	const table = `${SCRATCH_PREFIX}_${suffix}`;
	await sql.unsafe(`DROP TABLE IF EXISTS "${table}"`, []);
	await sql.unsafe(`CREATE TABLE "${table}" (id serial PRIMARY KEY)`, []);
	created.push(table);
	return table;
}

/** The tm_role column's shape and CHECK on a table, or null when absent. */
async function shapeOf(
	table: string,
): Promise<{ type: string; nullable: boolean; check: string | null } | null> {
	const rows = (await sql.unsafe(
		`SELECT format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
		        (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
		          WHERE c.conrelid = a.attrelid AND c.conname = $1 || '_tm_role_check') AS check
		 FROM pg_attribute a
		 WHERE a.attrelid = to_regclass($1) AND a.attname = 'tm_role' AND NOT a.attisdropped`,
		[table],
	)) as { type: string; nullable: boolean; check: string | null }[];
	return rows[0] ?? null;
}

async function refusalOf(work: () => Promise<unknown>): Promise<string> {
	try {
		await work();
		return 'no refusal';
	} catch (error) {
		return isDedaloError(error) ? error.code : String(error);
	}
}

beforeAll(async () => {
	await assertTestDatabase('tm_role_self_heal_native');
});

afterAll(async () => {
	for (const table of created) await sql.unsafe(`DROP TABLE IF EXISTS "${table}"`, []);
});

describe('ensureTmRoleColumn', () => {
	test('outside a transaction it adds the column EXACTLY as migration 0010 does', async () => {
		const SCRATCH = await recreateScratch('outside');
		expect(await shapeOf(SCRATCH)).toBeNull();
		await ensureTmRoleColumn(SCRATCH);
		const healed = await shapeOf(SCRATCH);
		const real = await shapeOf('matrix_time_machine');
		// FLOOR: the real table carries the migration's column and CHECK.
		expect(real).not.toBeNull();
		expect(real?.check).not.toBeNull();
		expect(healed).toEqual(real);
	});

	test('the healed column gets STATISTICS (never a default-selectivity guess)', async () => {
		// A column added by ALTER has no pg_stats row until an ANALYZE: the planner
		// then guessed `tm_role IS NULL` at 61,356 rows where 29.27M matched
		// (measured). ANALYZE writes nothing for an empty table — hence rows.
		const SCRATCH = await recreateScratch('stats');
		await sql.unsafe(`INSERT INTO "${SCRATCH}" SELECT FROM generate_series(1, 200)`, []);
		await ensureTmRoleColumn(SCRATCH);
		const [row] = (await sql.unsafe(
			`SELECT null_frac FROM pg_stats WHERE tablename = $1 AND attname = 'tm_role'`,
			[SCRATCH],
		)) as { null_frac: number }[];
		expect(Number(row?.null_frac)).toBe(1);
	});

	test('inside a caller transaction it FAILS CLOSED and never alters the table', async () => {
		const SCRATCH = await recreateScratch('inside');
		const refusal = await refusalOf(() =>
			withTransaction(async () => {
				await ensureTmRoleColumn(SCRATCH);
			}),
		);
		expect(refusal).toBe('internal.invariant');
		expect(await shapeOf(SCRATCH)).toBeNull();
	});

	test('a heal that cannot get its lock in time FAILS CLOSED — no hang, no column', async () => {
		const SCRATCH = await recreateScratch('locked');
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let locked: () => void = () => {};
		const lockTaken = new Promise<void>((resolve) => {
			locked = resolve;
		});
		// Another session holds a lock ADD COLUMN must wait behind.
		const holder = withTransaction(async () => {
			await sql.unsafe(`LOCK TABLE "${SCRATCH}" IN ACCESS SHARE MODE`, []);
			locked();
			await held;
		});
		await lockTaken;
		const refusal = await refusalOf(() => ensureTmRoleColumn(SCRATCH, '200ms'));
		release();
		await holder;
		expect(refusal).toBe('internal.invariant');
		expect(await shapeOf(SCRATCH)).toBeNull();
		// ...and the NEXT caller, the lock gone, heals (the memo was not set).
		await ensureTmRoleColumn(SCRATCH, '200ms');
		expect(await shapeOf(SCRATCH)).not.toBeNull();
	});

	test('the STATISTICS half is lock-bounded and best-effort: a blocked ANALYZE never hangs the heal nor reports the column missing', async () => {
		const SCRATCH = await recreateScratch('analyze_blocked');
		await sql.unsafe(`INSERT INTO "${SCRATCH}" SELECT FROM generate_series(1, 50)`, []);
		const gate = (): { wait: Promise<void>; open: () => void } => {
			let open: () => void = () => {};
			const wait = new Promise<void>((resolve) => {
				open = resolve;
			});
			return { wait, open };
		};
		const [gTaken, gRelease, hRelease] = [gate(), gate(), gate()];
		// G holds ACCESS SHARE: the heal's ALTER queues behind it.
		const holderG = withTransaction(async () => {
			await sql.unsafe(`LOCK TABLE "${SCRATCH}" IN ACCESS SHARE MODE`, []);
			gTaken.open();
			await gRelease.wait;
		});
		await gTaken.wait;
		let settled: 'pending' | 'resolved' | string = 'pending';
		const heal = ensureTmRoleColumn(SCRATCH, '800ms').then(
			() => {
				settled = 'resolved';
			},
			(error: unknown) => {
				settled = isDedaloError(error) ? error.code : String(error);
			},
		);
		await waitingLock(SCRATCH, 'AccessExclusiveLock');
		// H asks for SHARE UPDATE EXCLUSIVE: queued behind the ALTER, granted the
		// moment the ALTER commits — ahead of the heal's ANALYZE, which then waits
		// behind H (the anti-wraparound-vacuum shape) until its bound runs out.
		const holderH = withTransaction(async () => {
			await sql.unsafe(`LOCK TABLE "${SCRATCH}" IN SHARE UPDATE EXCLUSIVE MODE`, []);
			await hRelease.wait;
		});
		await waitingLock(SCRATCH, 'ShareUpdateExclusiveLock');
		gRelease.open();
		await Promise.race([heal, Bun.sleep(8_000)]);
		const whileHeld = settled;
		hRelease.open();
		await Promise.all([holderG, holderH, heal]);
		expect(whileHeld).toBe('resolved');
		expect(await shapeOf(SCRATCH)).not.toBeNull();
	}, 20_000);
});

describe('the BOOT hook (install/db/migrate.ts runBootSchema)', () => {
	test('a FAILED migration run still heals the column before serving: an in-transaction door then works', async () => {
		// 0010 out of lock retries: the run throws, startServer serves on. The
		// hook heals OUTSIDE any transaction, so the doors that name tm_role
		// INSIDE their own (a referenced record's delete, a data wipe, an
		// observer mirror write) find it — never the fail-closed refusal.
		const SCRATCH = await recreateScratch('boot');
		await runBootSchema({
			migrate: async () => {
				throw new Error('0010: lock wait timed out (simulated)');
			},
			tmTable: SCRATCH,
		});
		expect(await shapeOf(SCRATCH)).toEqual(await shapeOf('matrix_time_machine'));
		const inDoor = await refusalOf(() =>
			withTransaction(async () => {
				await ensureTmRoleColumn(SCRATCH);
			}),
		);
		expect(inDoor).toBe('no refusal');
	});
});

/** Wait until some session waits (ungranted) for `mode` on `table`. */
async function waitingLock(table: string, mode: string): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const rows = (await sql.unsafe(
			`SELECT 1 FROM pg_locks WHERE relation = to_regclass($1) AND mode = $2 AND NOT granted`,
			[table, mode],
		)) as unknown[];
		if (rows.length > 0) return;
		await Bun.sleep(25);
	}
	throw new Error(`no session ever waited for ${mode} on ${table}`);
}

/** A throw that rolls a transaction back on purpose. */
class Rollback extends Error {}

/**
 * Run `work` in a transaction where `matrix_time_machine.tm_role` is GONE, then
 * roll it back — the column is never missing for anyone else. `memos` is the
 * process state to replay: `'all'` = the first call of a process, `'tm_role'`
 * = the epoch store latched, the column's heal failed.
 */
async function withoutTmRole(memos: 'all' | 'tm_role', work: () => Promise<void>): Promise<void> {
	try {
		await withTransaction(async () => {
			await sql.unsafe(`SET LOCAL lock_timeout = '10s'`, []);
			await sql.unsafe('ALTER TABLE matrix_time_machine DROP COLUMN tm_role', []);
			resetSchemaMemosForTests(memos);
			await work();
			throw new Rollback();
		});
	} catch (error) {
		if (!(error instanceof Rollback)) throw error;
	} finally {
		resetSchemaMemosForTests();
	}
	// FLOOR: the rollback put the real column back.
	expect(await shapeOf('matrix_time_machine')).not.toBeNull();
}

/** The code of a thrown DedaloError, or the raw text of anything else. */
async function thrownBy(work: () => Promise<unknown>): Promise<string> {
	try {
		await work();
		return 'no throw';
	} catch (error) {
		return isDedaloError(error) ? error.code : `raw: ${String(error)}`;
	}
}

describe('the wiring: the epoch bootstrap is not the column heal', () => {
	test('a counter-allocated create SUCCEEDS inside a transaction while tm_role is missing', async () => {
		let created = 0;
		await withoutTmRole('all', async () => {
			created = await createSectionRecord('test3', -1);
		});
		expect(created).toBeGreaterThan(0);
	});

	test('a BULK RUN heals at its start, before its first write — typed refusal here (inside a transaction), work never run', async () => {
		// Every undo-log writer runs inside a transaction, where the heal refuses:
		// the run's start is the one place outside one. Replayed inside the
		// rolled-back transaction, the start's heal refuses TYPED before `work`
		// runs — outside one it adds the column (ensureTmRoleColumn, above).
		let ran = false;
		let outcome = '';
		await withoutTmRole('all', async () => {
			outcome = await thrownBy(() =>
				withLiveBulkRun(2_147_483_001, async () => {
					ran = true;
				}),
			);
		});
		expect(outcome).toBe('internal.invariant');
		expect(ran).toBe(false);
	});

	test('a reader after a FAILED heal retries it: a typed refusal, never the raw column error', async () => {
		// The epoch store latched by a caller outside a transaction…
		resetSchemaMemosForTests();
		await ensureRecordGenerationTable();
		const reader = await resolvePrincipal(-1);
		const readers: Record<string, () => Promise<unknown>> = {
			readTimeMachineHistory: () => readTimeMachineHistory('test3', 1, 'test52'),
			bulk_revert: () =>
				toolTimeMachineBulkRevert({
					principal: reader,
					userId: -1,
					options: { bulk_process_id: 2_147_483_000 },
					background: false,
				}),
		};
		const outcomes: Record<string, string> = {};
		for (const [name, read] of Object.entries(readers)) {
			// …then a heal that did not land (the column memo is empty): inside a
			// transaction the retried heal refuses TYPED, naming the migration.
			await withoutTmRole('tm_role', async () => {
				outcomes[name] = await thrownBy(read);
			});
		}
		expect(outcomes).toEqual({
			readTimeMachineHistory: 'internal.invariant',
			bulk_revert: 'internal.invariant',
		});
	});
});
