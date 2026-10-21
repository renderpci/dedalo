/**
 * NATIVE GATE — the published client survives a POWER CUT, and a stamp never
 * vouches for bytes that are not there (cross-ops:r0, finding "client_publish
 * copies without fsync, then records a stamp that makes every later boot skip
 * a re-copy").
 *
 * src/core/install/client_publish.ts copies the client into the volume nginx
 * serves, switches `<dir>/dedalo` by a rename, and writes `.published`. Before
 * the fix nothing was fsynced and the next boot trusted the stamp alone: after
 * a cut that kept the link and the stamp but not the copied files' data
 * (delayed allocation brings new files back EMPTY), every later boot answered
 * 'unchanged' and nginx served a torn client until the content changed. And a
 * crash between the link switch and the stamp made the next boot `rm` the very
 * release the live link resolved to, before copying it again (404s meanwhile).
 *
 * OUTCOMES asserted here:
 *   1. a torn live release (a file truncated, the stamp and link intact) is
 *      detected and republished — the next boot never answers 'unchanged' over
 *      bytes that do not hash to the stamp's id;
 *   2. a lost stamp over a complete live release (crash after the switch) is
 *      repaired WITHOUT copying, and at no instant of that boot does the live
 *      link stop resolving to the full client;
 *   3. a republish over a torn live release keeps the link resolving at every
 *      copy — the replacement is built aside, never by emptying the live one;
 *   4. the durability ORDER, observed through the async fs doors the module
 *      uses: every file and directory of a release is fsynced before the link
 *      is switched to it, the publish directory is fsynced after the switch,
 *      and the stamp is fsynced before its rename and its directory after it.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	statSync,
	truncateSync,
	writeFileSync,
} from 'node:fs';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { publishClient } from '../../src/core/install/client_publish.ts';

const scratch: string[] = [];
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(label: string): string {
	const dir = mkdtempSync(join(tmpdir(), `dd-client-durable-${label}-`));
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

/** True when the live link serves the whole client, byte for byte. */
function liveIsWhole(dir: string, module = MODULE): boolean {
	try {
		return (
			readFileSync(join(dir, 'dedalo', 'core', 'page', 'index.html'), 'utf8') === PAGE &&
			readFileSync(join(dir, 'dedalo', 'core', 'common', 'js', 'common.js'), 'utf8') === module
		);
	} catch {
		return false;
	}
}

const stampOf = (dir: string): { id: string } =>
	JSON.parse(readFileSync(join(dir, '.published'), 'utf8')) as { id: string };

describe('client_publish durability', () => {
	test('1. a torn live release (stamp + link intact) is republished, never answered unchanged', async () => {
		const source = sourceTree();
		const dir = scratchDir('torn');
		const first = await publishClient({ source, dir });
		// What a power cut under delayed allocation leaves: the name, zero bytes.
		truncateSync(join(first.release, 'core', 'common', 'js', 'common.js'), 0);
		expect(stampOf(dir).id).toBe(first.id);
		const again = await publishClient({ source, dir });
		expect(again.status).toBe('published');
		expect(again.id).toBe(first.id);
		expect(liveIsWhole(dir)).toBe(true);
		expect(readdirSync(join(dir, 'releases'))).toEqual([first.id]);
		expect(readdirSync(dir).sort()).toEqual(['.published', 'dedalo', 'releases']);
	});

	test('2. a lost stamp over a complete live release is repaired without a copy, the link never failing', async () => {
		const source = sourceTree();
		const dir = scratchDir('nostamp');
		await publishClient({ source, dir });
		writeFileSync(join(source, 'core', 'common', 'js', 'common.js'), 'export const a = 2;\n');
		const second = await publishClient({ source, dir });
		// The crash: the link switched to `second`, the stamp still names the old id —
		// and the killed run's prune never ran (a replaced copy is still there).
		writeFileSync(join(dir, '.published'), `${JSON.stringify({ id: 'f'.repeat(16) })}\n`);
		mkdirSync(join(dir, 'releases', `.${second.id}.replaced-999`, 'dedalo'), { recursive: true });
		const live = realpathSync(join(dir, 'dedalo'));
		const liveFile = join(live, 'core', 'page', 'index.html');
		const inode = statSync(liveFile).ino;
		const broken: string[] = [];
		const realRm = fsp.rm;
		const realCopy = fsp.copyFile;
		const rmSpy = spyOn(fsp, 'rm').mockImplementation((async (...args: unknown[]) => {
			await (realRm as (...a: unknown[]) => Promise<void>)(...args);
			if (!liveIsWhole(dir, 'export const a = 2;\n')) broken.push(`rm ${String(args[0])}`);
		}) as typeof fsp.rm);
		const copySpy = spyOn(fsp, 'copyFile').mockImplementation((async (...args: unknown[]) => {
			if (!liveIsWhole(dir, 'export const a = 2;\n')) broken.push(`copy ${String(args[1])}`);
			return (realCopy as (...a: unknown[]) => Promise<void>)(...args);
		}) as typeof fsp.copyFile);
		let third: Awaited<ReturnType<typeof publishClient>>;
		try {
			third = await publishClient({ source, dir });
		} finally {
			rmSpy.mockRestore();
			copySpy.mockRestore();
		}
		expect(broken).toEqual([]);
		expect(third.id).toBe(second.id);
		expect(stampOf(dir).id).toBe(second.id);
		expect(statSync(liveFile).ino).toBe(inode); // the same file: nothing was re-copied
		expect(liveIsWhole(dir, 'export const a = 2;\n')).toBe(true);
		expect(readdirSync(join(dir, 'releases'))).toEqual([second.id]);
	});

	test('3. a republish over a torn live release builds the replacement aside', async () => {
		const source = sourceTree();
		const dir = scratchDir('aside');
		const first = await publishClient({ source, dir });
		const torn = join(first.release, 'core', 'common', 'js', 'common.js');
		truncateSync(torn, 0);
		// The live link resolves (to the torn copy) — it must keep resolving to a
		// directory holding the page at every copy of the repair.
		const dangling: string[] = [];
		const realCopy = fsp.copyFile;
		const copySpy = spyOn(fsp, 'copyFile').mockImplementation((async (...args: unknown[]) => {
			if (!existsSync(join(dir, 'dedalo', 'core', 'page', 'index.html'))) {
				dangling.push(String(args[1]));
			}
			return (realCopy as (...a: unknown[]) => Promise<void>)(...args);
		}) as typeof fsp.copyFile);
		try {
			await publishClient({ source, dir });
		} finally {
			copySpy.mockRestore();
		}
		expect(dangling).toEqual([]);
		expect(liveIsWhole(dir)).toBe(true);
		expect(readlinkSync(join(dir, 'dedalo'))).toBe(join('releases', first.id, 'dedalo'));
	});

	test('4. every release byte is fsynced before the switch; the switch and the stamp are made durable', async () => {
		const source = sourceTree();
		const dir = scratchDir('order');
		const events: { kind: 'sync' | 'rename'; path: string }[] = [];
		const realOpen = fsp.open;
		const realRename = fsp.rename;
		const openSpy = spyOn(fsp, 'open').mockImplementation((async (...args: unknown[]) => {
			const handle = await (realOpen as (...a: unknown[]) => Promise<fsp.FileHandle>)(...args);
			const path = resolve(String(args[0]));
			const sync = handle.sync.bind(handle);
			(handle as { sync: () => Promise<void> }).sync = async () => {
				await sync();
				events.push({ kind: 'sync', path });
			};
			return handle;
		}) as typeof fsp.open);
		const renameSpy = spyOn(fsp, 'rename').mockImplementation((async (
			from: unknown,
			to: unknown,
		) => {
			await realRename(from as string, to as string);
			events.push({ kind: 'rename', path: resolve(String(to)) });
		}) as typeof fsp.rename);
		let result: Awaited<ReturnType<typeof publishClient>>;
		try {
			result = await publishClient({ source, dir });
		} finally {
			openSpy.mockRestore();
			renameSpy.mockRestore();
		}
		const root = resolve(dir);
		const at = (kind: 'sync' | 'rename', path: string): number =>
			events.findIndex((event) => event.kind === kind && event.path === path);
		const firstSyncAfter = (path: string, after: number): number =>
			events.findIndex((event, i) => i > after && event.kind === 'sync' && event.path === path);

		const switched = at('rename', join(root, 'dedalo'));
		expect(switched, 'the link switch was observed').toBeGreaterThanOrEqual(0);
		// Every release file and directory (and the releases/<id> entry) is durable
		// BEFORE the link points at it. The release was built aside and renamed in:
		// its bytes were synced under the staging name — so the check is on the
		// FINAL tree's entries, each of which must have been synced under some name
		// before the switch, plus the directories whose entries changed.
		const release = resolve(result.release);
		const releaseRoot = join(root, 'releases', result.id);
		const syncedBefore = events
			.slice(0, switched)
			.filter((event) => event.kind === 'sync')
			.map((event) => event.path);
		const relFiles = ['core/page/index.html', 'core/common/js/common.js'];
		const relDirs = ['', 'core', 'core/page', 'core/common', 'core/common/js'];
		for (const rel of relFiles) {
			const synced = syncedBefore.some((path) => path.endsWith(`/dedalo/${rel}`));
			expect(synced, `file ${rel} fsynced before the switch`).toBe(true);
		}
		for (const rel of relDirs) {
			const suffix = rel === '' ? '/dedalo' : `/dedalo/${rel}`;
			const synced = syncedBefore.some((path) => path.endsWith(suffix));
			expect(synced, `directory '${rel}' fsynced before the switch`).toBe(true);
		}
		// The rename that put releases/<id> in place is itself made durable before the switch.
		const placed = at('rename', releaseRoot);
		expect(placed, 'the release was built aside and renamed in').toBeGreaterThanOrEqual(0);
		expect(placed).toBeLessThan(switched);
		const releasesSynced = firstSyncAfter(join(root, 'releases'), placed);
		expect(releasesSynced, 'releases/ fsynced after the release landed').toBeGreaterThan(placed);
		expect(releasesSynced).toBeLessThan(switched);
		// The switch is made durable (the publish dir fsynced after it) before the stamp lands.
		const stampRename = at('rename', join(root, '.published'));
		expect(stampRename, 'the stamp rename was observed').toBeGreaterThan(switched);
		const dirAfterSwitch = firstSyncAfter(root, switched);
		expect(dirAfterSwitch, 'publish dir fsynced after the switch').toBeGreaterThan(switched);
		expect(dirAfterSwitch).toBeLessThan(stampRename);
		// The stamp's bytes are fsynced (under its temp name) before its rename, and its name after.
		const stampBytesSynced = events
			.slice(switched, stampRename)
			.some(
				(event) =>
					event.kind === 'sync' &&
					event.path.startsWith(join(root, '.published')) &&
					event.path !== join(root, '.published'),
			);
		expect(stampBytesSynced, 'the stamp temp fsynced before its rename').toBe(true);
		expect(
			firstSyncAfter(root, stampRename),
			'publish dir fsynced after the stamp',
		).toBeGreaterThan(stampRename);
		expect(release.startsWith(releaseRoot)).toBe(true);
		expect(liveIsWhole(dir)).toBe(true);
	});
});
