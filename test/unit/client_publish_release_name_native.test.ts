/**
 * NATIVE GATE — a republish never leaves the live client link DANGLING, not even
 * between two renames (cross-ops:r1, review finding "buildRelease leaves the live
 * client link dangling between its two renames when it replaces a same-id (torn)
 * release").
 *
 * The r0 fix built a torn release's replacement aside — but then put it under the
 * SAME name the live link resolves to: `rename(releases/<id>, .replaced)`, then
 * `rename(staging, releases/<id>)`. Between the two, `dedalo -> releases/<id>/dedalo`
 * named nothing: a request there was a 404, and a cut there left a dangling link
 * until the next boot. client_publish_durability_native's test 3 watched only the
 * copies, so it never saw the gap.
 *
 * THE LAW: a release name is never reused. The replacement takes a fresh
 * `<id>-<nonce>` name and the link is switched to it in one rename.
 *
 * OUTCOMES (real directories, real links; the async fs doors the module uses are
 * observed, never replaced):
 *   1. at EVERY rename and removal of a republish over a torn live release, the
 *      live link resolves to a directory holding the client page;
 *   2. the result is whole, served under a fresh name of the same id, and the torn
 *      directory is gone;
 *   3. the next boot verifies the fresh-named release and answers 'unchanged'
 *      without copying a byte (the link, not a literal releases/<id>, is what is
 *      verified).
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	truncateSync,
	writeFileSync,
} from 'node:fs';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { publishClient } from '../../src/core/install/client_publish.ts';

const scratch: string[] = [];
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(label: string): string {
	const dir = mkdtempSync(join(tmpdir(), `dd-client-name-${label}-`));
	scratch.push(dir);
	return dir;
}

const PAGE = '<!doctype html>page\n';
const MODULE = 'export const a = 1;\n';

function sourceTree(): string {
	const root = scratchDir('src');
	mkdirSync(join(root, 'core', 'page'), { recursive: true });
	mkdirSync(join(root, 'core', 'common', 'js'), { recursive: true });
	writeFileSync(join(root, 'core', 'page', 'index.html'), PAGE);
	writeFileSync(join(root, 'core', 'common', 'js', 'common.js'), MODULE);
	return root;
}

describe('client_publish never reuses a release name', () => {
	test('a republish over a torn live release: the link resolves at every rename; a fresh name; the next boot verifies it', async () => {
		const source = sourceTree();
		const dir = scratchDir('pub');
		const first = await publishClient({ source, dir });
		truncateSync(join(first.release, 'core', 'common', 'js', 'common.js'), 0);
		const page = join(dir, 'dedalo', 'core', 'page', 'index.html');
		expect(existsSync(page)).toBe(true);

		const dangling: string[] = [];
		let renames = 0;
		const realRename = fsp.rename;
		const realRm = fsp.rm;
		const renameSpy = spyOn(fsp, 'rename').mockImplementation((async (...args: unknown[]) => {
			await (realRename as (...a: unknown[]) => Promise<void>)(...args);
			renames++;
			if (!existsSync(page)) dangling.push(`rename ${String(args[0])} -> ${String(args[1])}`);
		}) as typeof fsp.rename);
		const rmSpy = spyOn(fsp, 'rm').mockImplementation((async (...args: unknown[]) => {
			await (realRm as (...a: unknown[]) => Promise<void>)(...args);
			if (!existsSync(page)) dangling.push(`rm ${String(args[0])}`);
		}) as typeof fsp.rm);
		let again: Awaited<ReturnType<typeof publishClient>>;
		try {
			again = await publishClient({ source, dir });
		} finally {
			renameSpy.mockRestore();
			rmSpy.mockRestore();
		}
		expect(renames, 'no rename observed — the gate is vacuous').toBeGreaterThan(0);
		expect(dangling).toEqual([]);

		expect(again.status).toBe('published');
		expect(again.id).toBe(first.id);
		const name = basename(dirname(again.release));
		expect(name.startsWith(`${first.id}-`), name).toBe(true);
		expect(readlinkSync(join(dir, 'dedalo'))).toBe(join('releases', name, 'dedalo'));
		expect(readFileSync(join(dir, 'dedalo', 'core', 'common', 'js', 'common.js'), 'utf8')).toBe(
			MODULE,
		);
		expect(readdirSync(join(dir, 'releases'))).toEqual([name]);

		const third = await publishClient({ source, dir });
		expect(third.status).toBe('unchanged');
		expect(third.release).toBe(again.release);
		expect(readdirSync(join(dir, 'releases'))).toEqual([name]);
	});
});
