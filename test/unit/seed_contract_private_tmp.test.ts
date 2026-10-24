/**
 * restoreSeedRaw (test/helpers/seed_contract.ts) stages the plain seed SQL in a
 * PRIVATE directory, never at a predictable name in the shared tmpdir.
 *
 * The defect: `join(tmpdir(), dedalo_seed_contract_<pid>_<Date.now()>.sql)` — pid and
 * clock are guessable, and writeFileSync FOLLOWS a symlink planted at that name, so a
 * local user could aim the gate's write at any file the suite can write. The outcome
 * measured: with the clock pinned and a symlink planted at the old name, the victim
 * file is untouched, and the run leaves nothing of its own in the tmpdir.
 *
 * Hermetic: the connection points at a closed port, so psql fails at once AFTER the
 * staging write (restoreSeedRaw's own expect throws); no database is touched.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { restoreSeedRaw } from '../helpers/seed_contract.ts';

const PINNED_NOW = 1_700_000_000_123;
const PREFIX = 'dedalo_seed_contract_';
const work = mkdtempSync(join(tmpdir(), 'dedalo_seed_contract_gate_'));
const planted = join(tmpdir(), `${PREFIX}${process.pid}_${PINNED_NOW}.sql`);

afterAll(() => {
	rmSync(work, { recursive: true, force: true });
	rmSync(planted, { force: true });
});

/** A connection psql cannot reach (closed port): the run fails after staging. */
const UNREACHABLE: DbConnDescriptor = {
	database: 'dedalo_seed_contract_gate',
	host: '127.0.0.1',
	port: 1,
	user: 'nobody',
	password: '',
};

describe('restoreSeedRaw stages the seed in a private directory', () => {
	test('a symlink planted at the predictable name is never written through; nothing is left behind', async () => {
		const victim = join(work, 'victim.txt');
		writeFileSync(victim, 'untouched');
		const seed = join(work, 'seed.pgsql.gz');
		writeFileSync(seed, gzipSync('SELECT 1;\n'));
		rmSync(planted, { force: true });
		symlinkSync(victim, planted);
		const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith(PREFIX)));
		const clock = spyOn(Date, 'now').mockReturnValue(PINNED_NOW);
		try {
			await expect(restoreSeedRaw(UNREACHABLE, seed)).rejects.toThrow();
		} finally {
			clock.mockRestore();
		}
		// The control: the plant really sits at the old name and points at the victim.
		expect(existsSync(planted)).toBe(true);
		expect(readFileSync(victim, 'utf8')).toBe('untouched');
		// The scan reads the tmpdir: it sees this gate's own plant and work dir.
		const listing = readdirSync(tmpdir()).filter((name) => name.startsWith(PREFIX));
		expect(listing.length).toBeGreaterThan(1);
		const left = listing.filter((name) => !before.has(name));
		expect(left).toEqual([]);
	}, 30000);
});
