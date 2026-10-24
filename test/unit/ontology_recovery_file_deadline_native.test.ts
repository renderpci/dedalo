/**
 * The dd_ontology RECOVERY FILE — the child processes run under a DEADLINE
 * while the single-flight lock is held (cross-write:r3, review of
 * b095553e22..ffc2a8479b, S3 ops-durability).
 *
 * THE DEFECT. The build spawned pg_dump (and the restore psql) with no
 * timeout, inside withRecoverySliceLock: a pg_dump waiting on a table lock or a
 * stalled server held the single-flight lock forever, and every later build or
 * restore was refused "already running" until the process died.
 *
 * THE OUTCOMES PINNED (the deadline is the only variable; production passes
 * none and gets the module's bound):
 *   - a build whose pg_dump outlives its deadline (a server that never answers)
 *     is KILLED: not ok, the slot's
 *     previous good dump byte-identical, no temp sibling left, the slice table
 *     dropped — and the lock is free: the next build (default deadline) runs;
 *   - a restore whose psql outlives its deadline is killed: not ok, and the next
 *     restore runs.
 *
 * Scratch: a mkdtemp() directory; the slice table is dropped by the code under
 * test (and by the teardown) and asserted absent. Nothing else is written.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { sql } from '../../src/core/db/postgres.ts';
import { connFromConfig, type DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import {
	buildRecoveryVersionFile,
	restoreDdOntologyRecoveryFromFile,
} from '../../src/core/ontology/recovery_file.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

let workDir = '';
let conn: DbConnDescriptor;

async function sliceTable(): Promise<string | null> {
	const rows = (await sql.unsafe(`SELECT to_regclass('dd_ontology_recovery')::text AS t`, [])) as {
		t: string | null;
	}[];
	return rows[0]?.t ?? null;
}

beforeAll(async () => {
	await assertTestDatabase('ontology_recovery_file_deadline_native');
	conn = connFromConfig();
	workDir = mkdtempSync(join(tmpdir(), 'zzrdl-recovery-'));
	expect(/^[a-zA-Z0-9_/.-]+$/.test(workDir)).toBe(true);
});

afterAll(async () => {
	rmSync(workDir, { recursive: true, force: true });
	await sql.unsafe(`DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE`, []);
	expect(await sliceTable()).toBeNull();
});

describe('the recovery file children run under a deadline', () => {
	test('a build whose pg_dump never gets an answer is killed: slot untouched, no temp left, lock free', async () => {
		const dir = mkdtempSync(join(workDir, 'build-'));
		const outFile = join(dir, 'slot.sql.gz');
		const previous = gzipSync(Buffer.from('-- previous good dump\n'));
		writeFileSync(outFile, previous);
		// A server that accepts the connection and never answers: pg_dump waits
		// on it FOREVER (no connect timeout of its own). Only the deadline's kill
		// ends it — a deadline that only flagged the outcome would hang here.
		const silent = Bun.listen({
			hostname: '127.0.0.1',
			port: 0,
			socket: { data() {}, open() {} },
		});
		const silentConn: DbConnDescriptor = {
			...conn,
			host: '127.0.0.1',
			port: silent.port,
			socket: '',
		};
		const started = Date.now();
		let killed: Awaited<ReturnType<typeof buildRecoveryVersionFile>>;
		try {
			killed = await buildRecoveryVersionFile(silentConn, outFile, { deadlineMs: 500 });
		} finally {
			silent.stop(true);
		}
		expect(Date.now() - started).toBeLessThan(15_000);
		expect(killed.ok).toBe(false);
		expect(killed.errors.some((line) => line.includes('deadline'))).toBe(true);
		expect(readFileSync(outFile).equals(previous)).toBe(true);
		expect(readdirSync(dir)).toEqual(['slot.sql.gz']);
		expect(await sliceTable()).toBeNull();

		// The lock was released with the killed build: the next one runs.
		const next = await buildRecoveryVersionFile(conn, outFile);
		expect(next.errors).toEqual([]);
		expect(next.ok).toBe(true);
		expect(readFileSync(outFile).equals(previous)).toBe(false);
		// FLOOR: the new slot is a real dump of the slice (its COPY block is there).
		expect(
			gunzipSync(readFileSync(outFile))
				.toString('utf8')
				.indexOf('COPY public.dd_ontology_recovery'),
		).toBeGreaterThan(-1);
	}, 120_000);

	test('a restore past its deadline is killed; the next restore runs', async () => {
		const dir = mkdtempSync(join(workDir, 'restore-'));
		const source = join(dir, 'source.sql.gz');
		expect((await buildRecoveryVersionFile(conn, source)).ok).toBe(true);

		const killed = await restoreDdOntologyRecoveryFromFile(conn, source, { deadlineMs: 1 });
		expect(killed.ok).toBe(false);
		expect(killed.errors.some((line) => line.includes('deadline'))).toBe(true);

		const next = await restoreDdOntologyRecoveryFromFile(conn, source);
		expect(next.errors).toEqual([]);
		expect(next.ok).toBe(true);
		// FLOOR: the restore really loaded the slice's rows.
		const loaded = (await sql.unsafe(
			'SELECT count(*)::int AS n FROM dd_ontology_recovery',
			[],
		)) as {
			n: number;
		}[];
		expect(Number(loaded[0]?.n ?? 0)).toBeGreaterThan(0);
		expect(readdirSync(dir)).toEqual(['source.sql.gz']);
		await sql.unsafe(`DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE`, []);
	}, 120_000);
});
