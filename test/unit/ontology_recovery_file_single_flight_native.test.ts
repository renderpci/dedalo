/**
 * The dd_ontology RECOVERY FILE — single-flight and per-session temp files
 * (cross-write:r2, review of b095553e22..73ff5d88a4, S2 ops-durability).
 *
 * THE DEFECT. Every build wrote a FIXED `${slot}.part` (createWriteStream 'w'
 * truncates) and removed it in its `finally`; every restore gunzipped to a
 * FIXED `${file minus .gz}` and removed it in its `finally`; both DROP/CREATE
 * the ONE shared `dd_ontology_recovery` table — with no latch. Two builds (two
 * admins, a double submit) wrote one inode at two offsets, the first renamed
 * the mixed bytes onto the slot and answered ok while the second kept writing
 * into it; one session's `finally` unlinked the other's file or dropped its
 * slice mid-dump. The ontology update's safety net, torn after an "OK".
 *
 * THE OUTCOMES PINNED:
 *   - two builds at once: exactly ONE runs, the other is refused "already
 *     running" (nothing of its own touched), and the slot gunzips COMPLETELY
 *     into a full COPY block;
 *   - a build and a restore at once: the same — they share the slice table;
 *   - a file at the OLD fixed names (another session's in-flight artifact, as
 *     far as this session can know) is never truncated, renamed or removed;
 *   - a stale temp sibling of the slot (a crashed build's leftover, older than
 *     twice the children's deadline) is swept by the lock holder; a FRESH one
 *     (another installation's in-flight file — the lock is per database) is
 *     left alone;
 *   - the lock is free after a call: the next build replaces the slot.
 *
 * Scratch: a mkdtemp() directory; the slice table is dropped by the code under
 * test and asserted absent after. Nothing else is written.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { sql } from '../../src/core/db/postgres.ts';
import { connFromConfig, type DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import {
	buildRecoveryVersionFile,
	RECOVERY_CHILD_DEADLINE_MS,
	type RecoveryFileResponse,
	restoreDdOntologyRecoveryFromFile,
} from '../../src/core/ontology/recovery_file.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

let workDir = '';
let conn: DbConnDescriptor;

const BUSY_MSG = 'Error. A recovery-file build or restore is already running';

/** The dd_ontology_recovery COPY block of a plain dump: its data rows, terminator required. */
function copyRows(plain: string): number {
	const start = plain.indexOf('COPY public.dd_ontology_recovery');
	expect(start).toBeGreaterThanOrEqual(0);
	const body = plain.slice(plain.indexOf('\n', start) + 1);
	const end = body.indexOf('\n\\.\n');
	// A torn dump has no terminator: the block never closes.
	expect(end).toBeGreaterThanOrEqual(0);
	return body
		.slice(0, end)
		.split('\n')
		.filter((line) => line !== '').length;
}

async function sliceTable(): Promise<string | null> {
	const rows = (await sql.unsafe(`SELECT to_regclass('dd_ontology_recovery')::text AS t`, [])) as {
		t: string | null;
	}[];
	return rows[0]?.t ?? null;
}

beforeAll(async () => {
	await assertTestDatabase('ontology_recovery_file_single_flight_native');
	conn = connFromConfig();
	workDir = mkdtempSync(join(tmpdir(), 'zzrsf-recovery-'));
	expect(/^[a-zA-Z0-9_/.-]+$/.test(workDir)).toBe(true);
});

afterAll(async () => {
	rmSync(workDir, { recursive: true, force: true });
	await sql.unsafe(`DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE`, []);
	expect(await sliceTable()).toBeNull();
});

describe('one build or restore at a time, each on its own temp files', () => {
	test('two builds at once: one runs, one is refused; the slot gunzips whole', async () => {
		const dir = mkdtempSync(join(workDir, 'two_builds-'));
		const outFile = join(dir, 'slot.sql.gz');
		const results = await Promise.all([
			buildRecoveryVersionFile(conn, outFile),
			buildRecoveryVersionFile(conn, outFile),
		]);
		const done = results.filter((r) => r.ok);
		const refused = results.filter((r) => !r.ok);
		expect(done.length).toBe(1);
		expect(refused.map((r) => r.msg)).toEqual([BUSY_MSG]);
		expect(copyRows(gunzipSync(readFileSync(outFile)).toString('utf8'))).toBeGreaterThan(0);
		expect(readdirSync(dir)).toEqual(['slot.sql.gz']);
		expect(await sliceTable()).toBeNull();
	}, 120_000);

	test('a build and a restore at once: one runs, one is refused (they share the slice table)', async () => {
		const dir = mkdtempSync(join(workDir, 'build_restore-'));
		const source = join(dir, 'source.sql.gz');
		expect((await buildRecoveryVersionFile(conn, source)).ok).toBe(true);
		const outFile = join(dir, 'slot.sql.gz');
		const results: RecoveryFileResponse[] = await Promise.all([
			buildRecoveryVersionFile(conn, outFile),
			restoreDdOntologyRecoveryFromFile(conn, source),
		]);
		expect(results.filter((r) => r.ok).length).toBe(1);
		expect(results.filter((r) => !r.ok).map((r) => r.msg)).toEqual([BUSY_MSG]);
		await sql.unsafe(`DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE`, []);
	}, 120_000);

	test('a file at the OLD fixed names is never touched; a STALE temp sibling of the slot is swept, a fresh one is not', async () => {
		const dir = mkdtempSync(join(workDir, 'foreign-'));
		const outFile = join(dir, 'slot.sql.gz');
		const foreignPart = `${outFile}.part`;
		writeFileSync(foreignPart, 'another session is writing this');
		const stale = `${outFile}.tmp-zz0000`;
		writeFileSync(stale, 'a crashed build left this');
		// Older than twice the children's deadline: no live writer can own it.
		const old = (Date.now() - 3 * RECOVERY_CHILD_DEADLINE_MS) / 1000;
		utimesSync(stale, old, old);
		const fresh = `${outFile}.tmp-zz0001`;
		writeFileSync(fresh, 'another installation is writing this');
		const built = await buildRecoveryVersionFile(conn, outFile);
		expect(built.errors).toEqual([]);
		expect(built.ok).toBe(true);
		expect(readFileSync(foreignPart, 'utf8')).toBe('another session is writing this');
		expect(existsSync(stale)).toBe(false);
		expect(readFileSync(fresh, 'utf8')).toBe('another installation is writing this');
		rmSync(fresh);

		const foreignPlain = join(dir, 'slot.sql');
		writeFileSync(foreignPlain, 'another session is restoring this');
		const restored = await restoreDdOntologyRecoveryFromFile(conn, outFile);
		expect(restored.errors).toEqual([]);
		expect(restored.ok).toBe(true);
		expect(readFileSync(foreignPlain, 'utf8')).toBe('another session is restoring this');
		expect(readdirSync(dir).sort()).toEqual(['slot.sql', 'slot.sql.gz', 'slot.sql.gz.part']);
		await sql.unsafe(`DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE`, []);
	}, 120_000);

	test('the lock is free after a call: the next build replaces the slot with a whole dump', async () => {
		const dir = mkdtempSync(join(workDir, 'after-'));
		const outFile = join(dir, 'slot.sql.gz');
		writeFileSync(outFile, gzipSync(Buffer.from('-- previous good dump\n')));
		const built = await buildRecoveryVersionFile(conn, outFile);
		expect(built.ok).toBe(true);
		expect(copyRows(gunzipSync(readFileSync(outFile)).toString('utf8'))).toBeGreaterThan(0);
	}, 120_000);
});
