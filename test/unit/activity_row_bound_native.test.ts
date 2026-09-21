/**
 * ACTIVITY ROW BOUND — an unauthenticated caller cannot drive the audit trail to
 * unbounded growth, and the retention windows actually delete (audit
 * 2026-08-26 SEC-21 / PUB-14; behavioural, suite database).
 *
 * WHAT WAS MEASURED before this gate existed: a login POST carrying a 32 MiB
 * username stored 67,109,061 bytes in `matrix_activity` in 3.16 s — 2.05× the
 * wire size, because the string was written TWICE (in `msg` and in `username`) —
 * on every denial path INCLUDING the throttled one, so the throttle refused the
 * login and paid the storage anyway. `matrix_activity` had no retention at all.
 *
 * The four legs, each an OUTCOME:
 *   1. one oversize login denial writes ONE row, and that row is bounded;
 *   2. the untrusted string appears exactly ONCE in it (the 2.05× is gone);
 *   3. the THROTTLED denial path is bounded the same way — it was the worst one;
 *   4. the retention prunes DELETE planted aged rows, in `matrix_activity` and
 *      in the dd1758 ledger — and the ledger's PENDING debt survives the window.
 *
 * Scratch hygiene: every row this file appends is deleted in afterAll; the
 * dd1758 seam is a table private to this file, handed back afterwards.
 */

import { afterAll, describe, expect, test } from 'bun:test';

// The dd1758 seam, pinned BEFORE the module that resolves it is imported.
const SCRATCH_ACTIVITY_TABLE = 'dedalo_ts_test_zzret_bound';
const PRELOAD_ACTIVITY_TABLE = process.env.DIFFUSION_ACTIVITY_TABLE;
process.env.DIFFUSION_ACTIVITY_TABLE = SCRATCH_ACTIVITY_TABLE;

import {
	ACTIVITY_DATA_MAX_BYTES,
	ACTIVITY_FIELD_MAX_CHARS,
	logActivity,
} from '../../src/core/api/handlers/activity_log.ts';
import { pruneMatrixEventRowsByAge } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	activityTable,
	DIFFUSION_ACTION,
	pruneSettledLedgerRows,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import { getRetention, listRetentions, runRetention } from '../../src/core/retention/registry.ts';
import '../../src/core/retention/prune.ts';
import { login } from '../../src/core/security/auth.ts';
import { LOGIN_SOURCE_MAX_ATTEMPTS } from '../../src/core/security/session_store.ts';

/** The WHERE tipo every login row carries (auth.ts LOGIN_ACTIVITY_TIPO). */
const LOGIN_TIPO = 'dd229';
/** A username no account can have; the marker this file's rows are found by. */
const PROBE_SUFFIX = `zzret_${process.pid}`;
/** 1 MiB — far past every bound, small enough to keep the gate quick. */
const HUGE = 'A'.repeat(1024 * 1024);

const plantedSectionIds: number[] = [];

async function loginRows(): Promise<
	{ section_id: number; misc: { dd551?: { value?: unknown }[] } }[]
> {
	return (await sql.unsafe(
		`SELECT section_id, misc FROM matrix_activity
		 WHERE section_tipo = 'dd542' AND string->'dd546'->0->>'value' = $1
		 ORDER BY section_id ASC`,
		[LOGIN_TIPO],
	)) as { section_id: number; misc: { dd551?: { value?: unknown }[] } }[];
}

/** The rows THIS run appended, by their probe marker. */
function probeRows(
	rows: { section_id: number; misc: { dd551?: { value?: unknown }[] } }[],
	marker: string,
): { section_id: number; payload: Record<string, unknown> }[] {
	return rows
		.map((row) => ({
			section_id: row.section_id,
			payload: (row.misc?.dd551?.[0]?.value ?? {}) as Record<string, unknown>,
		}))
		.filter((row) => JSON.stringify(row.payload).includes(marker));
}

afterAll(async () => {
	if (plantedSectionIds.length > 0) {
		const ids = [...new Set(plantedSectionIds)].map((id) => Number(id)).join(',');
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND section_id IN (${ids})`,
			[],
		);
	}
	// Every login row this file caused, whatever its id.
	await sql.unsafe(
		`DELETE FROM matrix_activity
		 WHERE section_tipo = 'dd542'
		   AND string->'dd546'->0->>'value' = $1
		   AND misc::text LIKE $2`,
		[LOGIN_TIPO, `%${PROBE_SUFFIX}%`],
	);
	await sql.unsafe(`DROP TABLE IF EXISTS "${SCRATCH_ACTIVITY_TABLE}"`, []);
	await sql.unsafe(`DROP SEQUENCE IF EXISTS "${SCRATCH_ACTIVITY_TABLE}_section_id_seq"`, []);
	if (PRELOAD_ACTIVITY_TABLE === undefined) delete process.env.DIFFUSION_ACTIVITY_TABLE;
	else process.env.DIFFUSION_ACTIVITY_TABLE = PRELOAD_ACTIVITY_TABLE;
}, 60_000);

describe('activity row bound (audit 2026-08-26 SEC-21)', () => {
	test('an oversize login denial stores ONE bounded row, with the string kept once', async () => {
		// The marker leads: the stored value is TRUNCATED, so a trailing marker
		// would be exactly what the bound cuts off.
		const username = `${PROBE_SUFFIX}_a_${HUGE}`;
		// The delta is measured over THIS RUN'S MARKED rows, never over a global
		// count of login rows: `matrix_activity` is shared with every other gate on
		// the suite database, so a sibling's denial would otherwise be charged here
		// and redden a leg that has nothing to do with its invariant.
		const before = probeRows(await loginRows(), `${PROBE_SUFFIX}_a`).length;
		const result = await login(username, 'wrong-password', '203.0.113.77');
		expect(result.ok).toBe(false);
		const mine = probeRows(await loginRows(), `${PROBE_SUFFIX}_a`);

		// ONE row, not zero (the denial is still audited) and not two.
		expect(mine.length - before).toBe(1);
		const payload = mine[0]?.payload as Record<string, unknown>;
		plantedSectionIds.push(mine[0]?.section_id as number);

		// BOUNDED: the whole stored payload is a note, not a copy of the input.
		const storedBytes = JSON.stringify(payload).length;
		expect(
			storedBytes,
			`stored activity payload is ${storedBytes} bytes for a 1 MiB username`,
		).toBeLessThan(ACTIVITY_DATA_MAX_BYTES + 1024);
		expect(storedBytes).toBeLessThan(username.length / 100);

		// STORED ONCE: the untrusted string is in `username` and nowhere else.
		expect(String(payload.msg)).not.toContain('AAAA');
		expect(String(payload.username).startsWith(`${PROBE_SUFFIX}_a_`)).toBe(true);
		expect(String(payload.username).length).toBeLessThan(ACTIVITY_FIELD_MAX_CHARS + 64);
		expect(String(payload.username)).toContain('truncated');
		expect(payload.result).toBe('deny');
	}, 60_000);

	test('the THROTTLED denial path is bounded the same way', async () => {
		// Spend the source-global bucket from one address, then check the row the
		// throttled refusal writes. This is the path the finding singled out: the
		// throttle refuses the login and used to pay the storage in full.
		const ip = '203.0.113.78';
		const before = probeRows(await loginRows(), `${PROBE_SUFFIX}_t`).length;
		let throttledPayload: Record<string, unknown> | undefined;
		for (let attempt = 0; attempt <= LOGIN_SOURCE_MAX_ATTEMPTS + 2; attempt += 1) {
			const username = `${PROBE_SUFFIX}_t${attempt}_${HUGE}`;
			const result = await login(username, 'wrong-password', ip);
			expect(result.ok).toBe(false);
			const rows = probeRows(await loginRows(), `${PROBE_SUFFIX}_t${attempt}`);
			const payload = rows[0]?.payload as Record<string, unknown> | undefined;
			for (const row of rows) plantedSectionIds.push(row.section_id);
			if (payload !== undefined && String(payload.cause).includes('throttled')) {
				throttledPayload = payload;
				break;
			}
		}
		// The source-global bucket must actually engage — a username-rotating
		// caller used to get a fresh bucket at every request and never be refused.
		expect(
			throttledPayload,
			'no throttled refusal after a username-rotating flood from one address',
		).toBeDefined();
		const bytes = JSON.stringify(throttledPayload).length;
		expect(bytes).toBeLessThan(ACTIVITY_DATA_MAX_BYTES + 1024);
		expect(String(throttledPayload?.msg)).not.toContain('AAAA');
		// Marker-scoped again: the flood's own rows, not the table's population.
		expect(probeRows(await loginRows(), `${PROBE_SUFFIX}_t`).length).toBeGreaterThan(before);
	}, 120_000);

	test('a huge emitter payload is truncated and MARKED, never dropped', async () => {
		const marker = `${PROBE_SUFFIX}_p`;
		await logActivity({
			what: 'LOG IN',
			tipo: LOGIN_TIPO,
			userId: -666,
			host: 'localhost',
			data: { msg: `probe ${marker}`, blob: HUGE, nested: { deeper: HUGE } },
		});
		const mine = probeRows(await loginRows(), marker);
		expect(mine.length).toBe(1);
		plantedSectionIds.push(mine[0]?.section_id as number);
		const payload = mine[0]?.payload as Record<string, unknown>;
		// The ROW SURVIVES (an audit row that fails to write is an action nobody
		// can see) and says what was cut.
		expect(String(payload.msg)).toContain(marker);
		expect(JSON.stringify(payload).length).toBeLessThan(ACTIVITY_DATA_MAX_BYTES + 1024);
		expect(JSON.stringify(payload)).toContain('truncated');
	}, 60_000);

	test('the host column is bounded too, not only the dd551 payload', async () => {
		// dd544 comes from the proxy-header hop and dd546 is a tipo: fields a
		// caller can influence, and until this leg they bypassed every ceiling.
		const marker = `${PROBE_SUFFIX}_h`;
		await logActivity({
			what: 'LOG IN',
			tipo: LOGIN_TIPO,
			userId: -666,
			host: `${'H'.repeat(200_000)}${marker}`,
			data: { msg: `host probe ${marker}` },
		});
		const mine = probeRows(await loginRows(), marker);
		expect(mine.length).toBe(1);
		plantedSectionIds.push(mine[0]?.section_id as number);
		const [stored] = (await sql.unsafe(
			`SELECT string->'dd544'->0->>'value' AS host FROM matrix_activity
			 WHERE section_tipo = 'dd542' AND section_id = $1`,
			[mine[0]?.section_id as number],
		)) as { host: string }[];
		expect(stored?.host.length).toBeLessThan(ACTIVITY_FIELD_MAX_CHARS + 64);
		expect(stored?.host).toContain('truncated');
	}, 60_000);
});

describe('retention windows actually delete (audit 2026-08-26 PUB-14)', () => {
	test('the registry declares an executable window for both audited stores', () => {
		expect(listRetentions().length).toBeGreaterThan(5);
		for (const name of ['matrix_activity', 'diffusion_publication_ledger']) {
			const definition = getRetention(name);
			expect(definition?.policy.kind).toBe('window');
		}
	});

	test('EVERY registered window prune EXECUTES — dry runs its statements, and the session store applies', async () => {
		// A prune the engine cannot run is a rule the registry only CLAIMS: the
		// session store's shipped statement addressed a `sessions.expires` column
		// that does not exist (expiry there is idle OR absolute), and every gate
		// stayed green because none of them ever called it. So call all of them.
		const windows = listRetentions().filter((definition) => definition.policy.kind === 'window');
		expect(windows.length).toBeGreaterThan(4);
		for (const definition of windows) {
			const report = await runRetention(definition.name, { apply: false });
			expect(report.deleted, `${definition.name}: a DRY run deleted rows`).toBe(0);
			expect(Number.isFinite(report.candidates), `${definition.name}: no candidate count`).toBe(
				true,
			);
		}

		// And the DELETEs themselves run somewhere: the session store is this run's
		// own scratch sqlite (the bunfig preload repoints it), so applying its
		// window here removes only rows that can no longer affect a decision.
		expect(typeof process.env.DEDALO_SESSION_DB_PATH).toBe('string');
		const applied = await runRetention('session_store', { apply: true });
		expect(Number.isFinite(applied.deleted)).toBe(true);
	}, 60_000);

	test('the matrix_activity prune removes planted AGED rows and spares fresh ones', async () => {
		const marker = `${PROBE_SUFFIX}_age`;
		await logActivity({
			what: 'LOG IN',
			tipo: LOGIN_TIPO,
			userId: -666,
			host: 'localhost',
			data: { msg: `aged ${marker}` },
		});
		await logActivity({
			what: 'LOG IN',
			tipo: LOGIN_TIPO,
			userId: -666,
			host: 'localhost',
			data: { msg: `fresh ${marker}` },
		});
		const mine = probeRows(await loginRows(), marker);
		expect(mine.length).toBe(2);
		for (const row of mine) plantedSectionIds.push(row.section_id);
		const agedId = mine.find((row) => String(row.payload.msg).startsWith('aged'))
			?.section_id as number;
		// Age ONE of them by hand — the engine has no time machine for its clock.
		await sql.unsafe(
			`UPDATE matrix_activity SET "timestamp" = now() - interval '400 days'
			 WHERE section_tipo = 'dd542' AND section_id = $1`,
			[agedId],
		);

		const cut = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
		const dry = await pruneMatrixEventRowsByAge('matrix_activity', cut, { apply: false });
		expect(dry.candidates).toBeGreaterThan(0);
		expect(dry.deleted).toBe(0); // a dry run writes nothing

		const applied = await pruneMatrixEventRowsByAge('matrix_activity', cut, { apply: true });
		expect(applied.deleted).toBe(dry.candidates);

		const left = probeRows(await loginRows(), marker);
		expect(left.length).toBe(1);
		expect(String(left[0]?.payload.msg).startsWith('fresh')).toBe(true);
	}, 90_000);

	test('the record tables are NOT prunable by a clock', async () => {
		// The window door refuses anything that is not an append-only event table:
		// a heritage record is removed by a curator, never by a schedule.
		await expect(
			pruneMatrixEventRowsByAge('matrix', new Date().toISOString(), { apply: true }),
		).rejects.toThrow();
	});

	test('the dd1758 prune removes SETTLED aged rows and NEVER the pending debt', async () => {
		const table = activityTable();
		expect(table).toBe(SCRATCH_ACTIVITY_TABLE);
		// Start from nothing: a previous interrupted run may have left rows in the
		// scratch table, and this leg counts them.
		await sql.unsafe(`DROP TABLE IF EXISTS "${table}"`, []);
		await sql.unsafe(`DROP SEQUENCE IF EXISTS "${table}_section_id_seq"`, []);
		const { logDiffusionActivity } = await import(
			'../../src/core/diffusion_bridge/diffusion_delete.ts'
		);

		const settled = await logDiffusionActivity({
			sectionTipo: 'zzret1',
			sectionId: 101,
			elementTipo: null,
			action: DIFFUSION_ACTION.published,
		});
		const pending = await logDiffusionActivity({
			sectionTipo: 'zzret1',
			sectionId: 102,
			elementTipo: null,
			action: DIFFUSION_ACTION.unpublishPending,
		});
		expect(Number.isFinite(settled)).toBe(true);
		expect(Number.isFinite(pending)).toBe(true);
		await sql.unsafe(`UPDATE "${table}" SET "timestamp" = now() - interval '400 days'`, []);

		const dry = await pruneSettledLedgerRows({ windowDays: 365, apply: false });
		expect(dry.candidates).toBe(1); // the settled row only
		expect(dry.deleted).toBe(0);

		const applied = await pruneSettledLedgerRows({ windowDays: 365, apply: true });
		expect(applied.deleted).toBe(1);

		const remaining = (await sql.unsafe(
			`SELECT section_id FROM "${table}" ORDER BY section_id`,
			[],
		)) as { section_id: number }[];
		expect(remaining.length).toBe(1);
		expect(remaining[0]?.section_id).toBe(pending);

		// A window of 0 means "keep everything": no statement, no deletion.
		const disabled = await pruneSettledLedgerRows({ windowDays: 0, apply: true });
		expect(disabled.deleted).toBe(0);
	}, 90_000);
});
