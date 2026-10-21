/**
 * THE KIT IS PUBLISHED ATOMICALLY, DURABLY, AND LEAVES NOTHING BEHIND ON FAILURE
 * (review 2026-10-21, cross-diffusion r1: scripts/publication_host_pack.ts).
 *
 * THE FINDING. `runPack` wrote the kit to `.<out>.<pid>.tmp`, chmodded it and renamed it over
 * `--out` with no cleanup: a write, chmod or rename that failed left the temp beside the
 * operator's kit for good (and nothing was fsynced, so a power cut right after "written" could
 * lose the kit the output had just told the operator to carry).
 *
 * WHAT IS ASSERTED — outcomes of `publishKit` (the one door runPack writes through):
 *   1. a rename that fails (the out path is a non-empty directory) throws and leaves NO temp in
 *      the directory;
 *   2. a published kit survives a power cut at the moment the door returns (page-cache model,
 *      test/helpers/power_loss_model.ts) with exactly its bytes;
 *   3. the kit is 0644 whatever the umask (it is carried to another host and read there).
 * WRITES: one os-tmp scratch dir, removed.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishKit } from '../../scripts/publication_host_pack.ts';
import { startPowerLossModel } from '../helpers/power_loss_model.ts';

const SCRATCH = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'dd_kit_publish_')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

const BYTES = new TextEncoder().encode('kit bytes');

function freshDir(name: string): string {
	const dir = join(SCRATCH, name);
	mkdirSync(dir);
	return dir;
}

describe('publishKit', () => {
	test('a failed rename throws and leaves no temp beside the out path', () => {
		const dir = freshDir('fail');
		const out = join(dir, 'museum.tar.gz');
		mkdirSync(out);
		writeFileSync(join(out, 'occupant'), 'x'); // a non-empty directory: the rename cannot replace it
		expect(() => publishKit(out, BYTES)).toThrow();
		expect(readdirSync(dir), 'a failed publish left its temp behind').toEqual(['museum.tar.gz']);
	});

	test('a published kit survives a power cut with exactly its bytes', () => {
		const dir = freshDir('durable');
		const out = join(dir, 'museum.tar.gz');
		const model = startPowerLossModel(SCRATCH);
		try {
			publishKit(out, BYTES);
			expect(model.survives(out), model.explain(out)).toBe(true);
			expect(model.seen.renames).toBe(1);
		} finally {
			model.restore();
		}
		expect(readFileSync(out, 'utf8')).toBe('kit bytes');
		expect(readdirSync(dir)).toEqual(['museum.tar.gz']);
	});

	test('the kit is 0644 whatever the umask', () => {
		const dir = freshDir('mode');
		const out = join(dir, 'museum.tar.gz');
		const previous = process.umask(0o077);
		try {
			publishKit(out, BYTES);
		} finally {
			process.umask(previous);
		}
		expect(statSync(out).mode & 0o777).toBe(0o644);
	});
});
