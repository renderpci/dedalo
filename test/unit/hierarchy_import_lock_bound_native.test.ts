/**
 * A THESAURUS IMPORT / RESET WAITS FOR A LOCK UNDER THE MAINTENANCE BOUND, AND IS
 * ENDABLE (cross-ops:r4 S2).
 *
 * THE DEFECT. `runImportUnit` ships one tld's whole import as ONE psql transaction
 * (BEGIN → reset DELETE → `\copy` of every file → counter → COMMIT). psql children
 * never receive the maintenance pool's startup `lock_timeout` (PGOPTIONS carries the
 * keepalive bound only) and the script set none, so a reset meeting ONE row lock on a
 * `<tld>N` row — a curator's open transaction, a session idle in transaction — waited
 * with no limit, holding the locks of every row it had already deleted; and nothing
 * could end it (the only kill was the script stream's own failure). The documented
 * law (engineering/PRODUCTION.md: "the ceiling is lifted; the lock-wait bound is
 * not", add_hierarchy install/reset in the maintenance census) did not hold for it.
 *
 * THE LAW (measured through the REAL psql path on scratch tld `zzhil`, the lane
 * SUITE database, a reserved pool session holding the lock):
 *  (a) BOUNDED: a reset whose DELETE meets a held row lock gives up at the
 *      MAINTENANCE_LOCK_TIMEOUT bound — it waited (≥ the bound, non-vacuity), it
 *      answered (well before the test ceiling), it says the lock and "nothing
 *      changed", and the operator's rows are exactly as they were;
 *  (b) RETRIED WHOLE: a lock wait that ran out is retried as a whole unit after the
 *      backoff; the lock released meanwhile, the retry lands the seed;
 *  (c) ENDABLE: the caller's abort signal kills the waiting psql at once (well inside
 *      the bound), the answer says aborted, and the transaction rolls back — rows
 *      intact once the lock is released;
 *  (d) a batch whose signal already fired runs no tld ("not run");
 *  (e) the unit's bound IS the maintenance bound (the psql-channel file holds it by
 *      value: it may not import the pool module — sql_confinement_tripwire).
 *
 * SURFACES. assertTestDatabase first; `zzhil1/2` rows of matrix_hierarchy and their
 * matrix_counter rows, swept before and after; seed files in a mkdtemp dir.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeCopyField } from '../../src/core/db/copy_text.ts';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';
import { MAINTENANCE_LOCK_TIMEOUT, sql } from '../../src/core/db/postgres.ts';
import {
	HIERARCHY_UNIT_LOCK_TIMEOUT,
	importHierarchyRows,
	installHierarchies,
} from '../../src/core/install/hierarchy_import.ts';
import { connFromConfig } from '../../src/core/install/pg_exec.ts';
import {
	type HierarchyDataFile,
	sha256Hex,
} from '../../src/core/ontology/hierarchy_manifest_format.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const TLD = 'zzhil';
const conn = connFromConfig();
const BOUND_MS = Number.parseInt(MAINTENANCE_LOCK_TIMEOUT, 10) * 1000;
let importDir = '';

/** A held row lock: a reserved session's open transaction (`release` rolls it back). */
type Holder = { release: () => Promise<void> };
const holders: Holder[] = [];

async function sweep(): Promise<void> {
	await sql.unsafe(`DELETE FROM matrix_hierarchy WHERE section_tipo ~ '^${TLD}[0-9]+$'`, []);
	await sql.unsafe(`DELETE FROM matrix_counter WHERE tipo ~ '^${TLD}[0-9]+$'`, []);
}

async function holdRowLock(sectionTipo: string, sectionId: number): Promise<Holder> {
	const session = await sql.reserve();
	await session.unsafe('BEGIN', []);
	const locked = (await session.unsafe(
		`SELECT section_id FROM matrix_hierarchy WHERE section_tipo = '${sectionTipo}' AND section_id = ${sectionId} FOR UPDATE`,
		[],
	)) as unknown[];
	expect(locked).toHaveLength(1); // non-vacuity: the lock is really on a row
	let released = false;
	const holder: Holder = {
		release: async () => {
			if (released) return;
			released = true;
			await session.unsafe('ROLLBACK', []);
			session.release();
		},
	};
	holders.push(holder);
	return holder;
}

/** One COPY row (MATRIX_COPY_COLUMNS order). */
function copyRow(sectionTipo: string, sectionId: number, data: unknown): string {
	return MATRIX_COPY_COLUMNS.map((column) => {
		if (column === 'section_id') return String(sectionId);
		if (column === 'section_tipo') return sectionTipo;
		return encodeCopyField(column === 'data' ? JSON.stringify(data) : null);
	}).join('\t');
}

function writeListed(section: string, rows: string[]): HierarchyDataFile {
	const bytes = gzipSync(Buffer.from(`${rows.join('\n')}\n`));
	writeFileSync(join(importDir, `${section}.copy.gz`), bytes);
	return { file: `${section}.copy.gz`, sha256: sha256Hex(bytes) };
}

/** The operator's rows a reset would discard: what (a)/(c) must find intact. */
async function seedOperatorRows(): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_hierarchy (section_id, section_tipo, data) VALUES (1, '${TLD}1', '{"label":"operator one"}'), (2, '${TLD}1', '{"label":"operator two"}')`,
		[],
	);
}

async function rowsNow(): Promise<string[]> {
	const rows = (await sql.unsafe(
		`SELECT section_id, data->>'label' AS label FROM matrix_hierarchy WHERE section_tipo ~ '^${TLD}[0-9]+$' ORDER BY section_tipo, section_id`,
		[],
	)) as { section_id: number; label: string }[];
	return rows.map((row) => `${row.section_id}:${row.label}`);
}

/** Wait until no backend still runs a statement on the scratch tld (a killed psql's backend ends at its lock bound). */
async function noBackendOnTld(): Promise<void> {
	const deadline = Date.now() + BOUND_MS + 10_000;
	while (Date.now() < deadline) {
		const [row] = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND query LIKE '%${TLD}%' AND state <> 'idle'`,
			[],
		)) as { n: number }[];
		if (row?.n === 0) return;
		await Bun.sleep(50);
	}
	throw new Error('a backend still runs a statement on the scratch tld');
}

/** Resolves once a backend is WAITING on a lock for a statement naming the scratch tld. */
async function backendWaitingOnLock(): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		const [row] = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%${TLD}%'`,
			[],
		)) as { n: number }[];
		if ((row?.n ?? 0) > 0) return;
		await Bun.sleep(20);
	}
	throw new Error('the import never waited on the held lock');
}

const SEED = () => writeListed(`${TLD}1`, [copyRow(`${TLD}1`, 1, { label: 'seed one' })]);

beforeAll(async () => {
	await assertTestDatabase('hierarchy_import_lock_bound_native');
	const [db] = (await sql.unsafe('SELECT current_database() AS name', [])) as { name: string }[];
	expect(conn.database).toBe(db?.name ?? '');
	importDir = mkdtempSync(join(tmpdir(), 'dedalo-hierarchy-lock-'));
});

afterAll(async () => {
	for (const holder of holders) await holder.release();
	await noBackendOnTld();
	await sweep();
	rmSync(importDir, { recursive: true, force: true });
});

beforeEach(async () => {
	for (const holder of holders.splice(0)) await holder.release();
	await sweep();
	await seedOperatorRows();
});

describe('hierarchy import unit: bounded lock wait, whole-unit retry, abortable', () => {
	test('(a) a reset meeting a held row lock gives up at the bound; nothing changed', async () => {
		const holder = await holdRowLock(`${TLD}1`, 2);
		const dataFiles = [SEED()];
		const startedAt = performance.now();
		const result = await importHierarchyRows(conn, TLD, {
			replace: true,
			importDir,
			dataFiles,
			lockRetryDelaysMs: [],
		});
		const elapsed = performance.now() - startedAt;
		expect(result.ok, JSON.stringify(result)).toBe(false);
		expect(result.msg).toContain('reset failed — nothing changed');
		expect(result.msg).toContain(`lock_timeout ${MAINTENANCE_LOCK_TIMEOUT}`);
		// It WAITED (the lock was really contended) and it ANSWERED at the bound.
		expect(elapsed).toBeGreaterThanOrEqual(BOUND_MS - 500);
		expect(elapsed).toBeLessThan(BOUND_MS + 8_000);
		await holder.release();
		expect(await rowsNow()).toEqual(['1:operator one', '2:operator two']);
	}, 30_000);

	test('(b) a lock wait that ran out is retried whole; released meanwhile, the seed lands', async () => {
		const holder = await holdRowLock(`${TLD}1`, 2);
		const dataFiles = [SEED()];
		const retries: number[] = [];
		const result = await importHierarchyRows(conn, TLD, {
			replace: true,
			importDir,
			dataFiles,
			lockRetryDelaysMs: [100],
			onLockRetry: (attempt) => {
				retries.push(attempt);
				void holder.release();
			},
		});
		expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
		expect(retries).toEqual([1]);
		expect(await rowsNow()).toEqual(['1:seed one']);
	}, 30_000);

	test('(c) the abort signal kills the waiting psql at once; the unit rolls back', async () => {
		const holder = await holdRowLock(`${TLD}1`, 2);
		const dataFiles = [SEED()];
		const stop = new AbortController();
		const startedAt = performance.now();
		const pending = importHierarchyRows(conn, TLD, {
			replace: true,
			importDir,
			dataFiles,
			lockRetryDelaysMs: [],
			signal: stop.signal,
		});
		await backendWaitingOnLock();
		stop.abort(new Error('operator stop'));
		const result = await pending;
		const elapsed = performance.now() - startedAt;
		expect(result.ok, JSON.stringify(result)).toBe(false);
		expect(result.msg).toContain('aborted');
		expect(result.msg).toContain('nothing changed');
		// Ended by the KILL, not by the lock bound running out.
		expect(elapsed).toBeLessThan(BOUND_MS - 1_000);
		await holder.release();
		await noBackendOnTld();
		expect(await rowsNow()).toEqual(['1:operator one', '2:operator two']);
	}, 30_000);

	test('(d) a batch whose signal already fired runs no tld', async () => {
		const stop = new AbortController();
		stop.abort(new Error('shutdown'));
		const result = await installHierarchies([TLD], conn, -1, {
			replace: true,
			importDir,
			signal: stop.signal,
		});
		expect(result.ok).toBe(false);
		expect(result.responses).toEqual([
			{ tld: TLD, ok: false, msg: 'not run — the operation was aborted; nothing changed' },
		]);
		expect(await rowsNow()).toEqual(['1:operator one', '2:operator two']);
	});

	test('(e) the unit bound is the maintenance bound', () => {
		expect(HIERARCHY_UNIT_LOCK_TIMEOUT).toBe(MAINTENANCE_LOCK_TIMEOUT);
	});
});
