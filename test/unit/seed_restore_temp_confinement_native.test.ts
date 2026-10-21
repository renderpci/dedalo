/**
 * NATIVE GATE — the seed restore's psql-executed SQL lives in a PRIVATE,
 * unguessable place (cross-ops:r0, finding "seed restore writes psql-executed
 * SQL to a predictable shared-/tmp path without O_EXCL").
 *
 * restoreSeed (src/core/install/db_restore.ts) decompresses the seed (+ the
 * install stamp) to a temp .sql and hands it to `psql -f`, run as the install's
 * database role. The file used to be `<tmpdir>/dedalo_seed_<pid>_<ms>.sql`,
 * opened O_CREAT|O_TRUNC: a local user who planted that name (a regular file
 * they keep writing to, or a symlink) got the seed written THROUGH their entry,
 * and could append SQL psql then executed. The outcome asserted here:
 *
 *   - a regular file planted at the old predictable name is left byte-for-byte
 *     untouched (never truncated, never written, never removed);
 *   - a symlink planted there is never followed — its victim keeps its bytes;
 *   - the file psql is handed sits in a fresh directory only this process can
 *     enter (0700), holds exactly the seed bytes, and is gone after the run,
 *     directory and all.
 *
 * Hermetic: psql is pointed at a closed loopback port, so the restore fails
 * after the temp file was written and handed over — no database is touched.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { isDedaloError } from '../../src/core/errors/index.ts';
import { restoreSeed } from '../../src/core/install/db_restore.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';

const fixtures = mkdtempSync(join(tmpdir(), 'dd-seed-temp-gate-'));
const planted: string[] = [];
afterAll(() => {
	for (const path of planted) rmSync(path, { force: true });
	rmSync(fixtures, { recursive: true, force: true });
});

/** A connection nothing answers: psql fails to connect, after the temp file was handed over. */
const unreachable: DbConnDescriptor = {
	database: 'dd_seed_temp_gate',
	host: '127.0.0.1',
	port: 1,
	user: 'dd_nobody',
	password: '',
};

const SEED_SQL = '-- dd seed temp gate\nSELECT 1;\n';
const seedPath = join(fixtures, 'seed.pgsql.gz');
writeFileSync(seedPath, gzipSync(Buffer.from(SEED_SQL, 'utf8')));

/** The pre-fix temp name for a frozen clock: what an attacker could predict. */
function predictableName(ms: number): string {
	return join(tmpdir(), `dedalo_seed_${process.pid}_${ms}.sql`);
}

interface HandedOver {
	path: string;
	bytes: string;
	dirMode: number;
	fileMode: number;
}

/** Run restoreSeed with a frozen clock; capture the `-f` file psql was handed, at spawn time. */
async function restoreCapturing(frozenMs: number): Promise<HandedOver[]> {
	const handed: HandedOver[] = [];
	const realSpawn = Bun.spawn;
	const clock = spyOn(Date, 'now').mockReturnValue(frozenMs);
	const spawn = spyOn(Bun, 'spawn').mockImplementation(((...args: unknown[]) => {
		const argv = args[0] as string[];
		const flag = argv.indexOf('-f');
		if (flag >= 0) {
			const path = argv[flag + 1] as string;
			handed.push({
				path,
				bytes: readFileSync(path, 'utf8'),
				dirMode: statSync(dirname(path)).mode & 0o777,
				fileMode: statSync(path).mode & 0o777,
			});
		}
		return (realSpawn as (...a: unknown[]) => unknown)(...args);
	}) as typeof Bun.spawn);
	try {
		let refused: unknown = null;
		try {
			await restoreSeed(unreachable, seedPath);
		} catch (error) {
			refused = error;
		}
		// The unreachable server refuses the restore loudly — never a silent success.
		expect(isDedaloError(refused)).toBe(true);
	} finally {
		spawn.mockRestore();
		clock.mockRestore();
	}
	return handed;
}

describe('restoreSeed temp-file confinement', () => {
	test('a regular file planted at the predictable name is never written, truncated or removed', async () => {
		const frozen = 1_700_000_000_123;
		const trap = predictableName(frozen);
		writeFileSync(trap, 'ATTACKER-OWNED\n', { mode: 0o666 });
		planted.push(trap);
		const handed = await restoreCapturing(frozen);
		expect(existsSync(trap)).toBe(true);
		expect(readFileSync(trap, 'utf8')).toBe('ATTACKER-OWNED\n');
		expect(handed.map((entry) => entry.path)).not.toContain(trap);
	});

	test('a symlink planted at the predictable name is never followed', async () => {
		const frozen = 1_700_000_000_456;
		const trap = predictableName(frozen);
		const victim = join(fixtures, 'victim.txt');
		writeFileSync(victim, 'VICTIM\n');
		symlinkSync(victim, trap);
		planted.push(trap);
		await restoreCapturing(frozen);
		expect(readFileSync(victim, 'utf8')).toBe('VICTIM\n');
	});

	test('psql reads the seed from a fresh 0700 directory, and the whole directory is removed after', async () => {
		const handed = await restoreCapturing(1_700_000_000_789);
		expect(handed.length).toBe(1);
		const [file] = handed as [HandedOver];
		expect(file.bytes).toBe(SEED_SQL);
		expect(file.dirMode).toBe(0o700);
		expect(file.fileMode).toBe(0o600);
		// Not a direct child of the shared temp dir: its parent is private to this run.
		expect(dirname(file.path)).not.toBe(tmpdir());
		expect(existsSync(file.path)).toBe(false);
		expect(existsSync(dirname(file.path))).toBe(false);
	});
});
