/**
 * NATIVE GATE — the engine publishes its own client (installer unification D2).
 *
 * src/core/install/client_publish.ts copies the client of the code it runs into
 * the volume nginx serves, switches `<dir>/dedalo` atomically, and never
 * publishes a symlink (nginx would follow it). Everything here is EXECUTED in
 * scratch directories: a real source tree, real copies, real links, real modes.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	CLIENT_ROOT,
	publishClient,
	publishClientAtBoot,
} from '../../src/core/install/client_publish.ts';
import { scratchRunEntries } from '../helpers/scratch_run_entries.ts';

const scratch: string[] = [];
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(label: string): string {
	const dir = mkdtempSync(join(tmpdir(), `dd-client-publish-${label}-`));
	scratch.push(dir);
	return dir;
}

/** A small client tree: a page, a nested module, an empty-ish subdir. */
function sourceTree(): string {
	const root = scratchDir('src');
	mkdirSync(join(root, 'core', 'page'), { recursive: true });
	mkdirSync(join(root, 'core', 'common', 'js'), { recursive: true });
	writeFileSync(join(root, 'core', 'page', 'index.html'), '<!doctype html>page\n');
	writeFileSync(join(root, 'core', 'common', 'js', 'common.js'), 'export const a = 1;\n');
	return root;
}

const FIXED_NOW = () => new Date('2026-10-09T10:00:00.000Z');

function releases(dir: string): string[] {
	return scratchRunEntries(join(dir, 'releases'));
}

describe('publishClient', () => {
	test('first publish: release copied, relative link switched, stamp written', async () => {
		const source = sourceTree();
		const dir = scratchDir('pub');
		const result = await publishClient({ source, dir, now: FIXED_NOW });
		expect(result.status).toBe('published');
		expect(result.id).toMatch(/^[0-9a-f]{16}$/);
		expect(result.files).toBe(2);
		expect(result.skipped).toEqual([]);
		const link = join(dir, 'dedalo');
		expect(lstatSync(link).isSymbolicLink()).toBe(true);
		// RELATIVE: it must resolve in nginx's container too, mounted elsewhere.
		expect(readlinkSync(link)).toBe(join('releases', result.id, 'dedalo'));
		expect(readFileSync(join(link, 'core', 'page', 'index.html'), 'utf8')).toBe(
			'<!doctype html>page\n',
		);
		expect(JSON.parse(readFileSync(join(dir, '.published'), 'utf8'))).toEqual({
			id: result.id,
			published_at: '2026-10-09T10:00:00.000Z',
			files: 2,
			bytes: result.bytes,
		});
		expect(result.bytes).toBe(20 + 20);
		expect(releases(dir)).toEqual([result.id]);
		// No temporary left behind.
		expect(scratchRunEntries(dir)).toEqual(['.published', 'dedalo', 'releases']);
	});

	test('modes: directories 0750, files 0640 — read through the engine group only', async () => {
		const source = sourceTree();
		const dir = scratchDir('modes');
		const { release } = await publishClient({ source, dir });
		const mode = (path: string) => statSync(path).mode & 0o777;
		expect(mode(release)).toBe(0o750);
		expect(mode(join(release, 'core', 'common', 'js'))).toBe(0o750);
		expect(mode(join(release, 'core', 'common', 'js', 'common.js'))).toBe(0o640);
		expect(mode(join(dir, '.published'))).toBe(0o640);
		expect(mode(join(dir, 'releases'))).toBe(0o750);
	});

	test('republishing unchanged content copies nothing', async () => {
		const source = sourceTree();
		const dir = scratchDir('same');
		const first = await publishClient({ source, dir, now: FIXED_NOW });
		const marker = join(first.release, 'core', 'page', 'index.html');
		const before = statSync(marker).ino;
		const again = await publishClient({ source, dir });
		expect(again.status).toBe('unchanged');
		expect(again.id).toBe(first.id);
		expect(statSync(marker).ino).toBe(before); // the very same file: no copy happened
		expect(JSON.parse(readFileSync(join(dir, '.published'), 'utf8')).published_at).toBe(
			'2026-10-09T10:00:00.000Z',
		);
	});

	test('a content change: new id, atomic switch, old release pruned', async () => {
		const source = sourceTree();
		const dir = scratchDir('change');
		const first = await publishClient({ source, dir });
		writeFileSync(join(source, 'core', 'common', 'js', 'common.js'), 'export const a = 2;\n');
		const second = await publishClient({ source, dir });
		expect(second.status).toBe('published');
		expect(second.id).not.toBe(first.id);
		expect(readlinkSync(join(dir, 'dedalo'))).toBe(join('releases', second.id, 'dedalo'));
		expect(readFileSync(join(dir, 'dedalo', 'core', 'common', 'js', 'common.js'), 'utf8')).toBe(
			'export const a = 2;\n',
		);
		expect(releases(dir)).toEqual([second.id]);
		// A RENAME changes the id too (the path is part of it), not only the bytes.
		writeFileSync(join(source, 'core', 'page', 'other.html'), '<!doctype html>page\n');
		rmSync(join(source, 'core', 'page', 'index.html'));
		expect((await publishClient({ source, dir })).id).not.toBe(second.id);
	});

	test('the stamp alone does not fake a publication: a missing link republishes', async () => {
		const source = sourceTree();
		const dir = scratchDir('nolink');
		const first = await publishClient({ source, dir });
		rmSync(join(dir, 'dedalo'));
		const again = await publishClient({ source, dir });
		expect(again.status).toBe('published');
		expect(again.id).toBe(first.id);
		expect(existsSync(join(dir, 'dedalo', 'core', 'page', 'index.html'))).toBe(true);
	});

	test('a symlink in the source is NEVER published, nor followed', async () => {
		const source = sourceTree();
		const secret = scratchDir('secret');
		writeFileSync(join(secret, 'passwd'), 'root:x:0:0\n');
		symlinkSync(join(secret, 'passwd'), join(source, 'core', 'page', 'leak.txt'));
		symlinkSync(secret, join(source, 'core', 'leakdir'));
		const dir = scratchDir('symlink');
		const result = await publishClient({ source, dir });
		expect(result.skipped).toEqual(['core/leakdir', 'core/page/leak.txt']);
		expect(existsSync(join(result.release, 'core', 'page', 'leak.txt'))).toBe(false);
		expect(existsSync(join(result.release, 'core', 'leakdir'))).toBe(false);
		expect(result.files).toBe(2);
		// Control: the same tree without the links has the same id — they never counted.
		rmSync(join(source, 'core', 'page', 'leak.txt'));
		rmSync(join(source, 'core', 'leakdir'));
		expect((await publishClient({ source, dir })).id).toBe(result.id);
	});

	test('a legacy real `dedalo/` directory is migrated to the link', async () => {
		const source = sourceTree();
		const dir = scratchDir('legacy');
		mkdirSync(join(dir, 'dedalo', 'old'), { recursive: true });
		writeFileSync(join(dir, 'dedalo', 'old', 'stale.js'), 'stale\n');
		const result = await publishClient({ source, dir });
		expect(lstatSync(join(dir, 'dedalo')).isSymbolicLink()).toBe(true);
		expect(existsSync(join(dir, 'dedalo', 'old'))).toBe(false);
		expect(scratchRunEntries(dir)).toEqual(['.published', 'dedalo', 'releases']);
		expect(realpathSync(join(dir, 'dedalo'))).toBe(realpathSync(result.release));
	});
});

describe('publishClientAtBoot', () => {
	test('no-op with the key unset, and in a smoke boot', async () => {
		const dir = scratchDir('noop');
		expect(await publishClientAtBoot({ smokeBoot: false, publishDir: undefined })).toBeNull();
		expect(await publishClientAtBoot({ smokeBoot: false, publishDir: '  ' })).toBeNull();
		expect(await publishClientAtBoot({ smokeBoot: true, publishDir: dir })).toBeNull();
		expect(scratchRunEntries(dir)).toEqual([]);
	});

	test('never throws: a relative or unwritable directory is a logged null', async () => {
		expect(await publishClientAtBoot({ smokeBoot: false, publishDir: 'relative/dir' })).toBeNull();
		const blocked = join(scratchDir('blocked'), 'file');
		writeFileSync(blocked, 'not a directory\n');
		expect(
			await publishClientAtBoot({ smokeBoot: false, publishDir: blocked, source: sourceTree() }),
		).toBeNull();
	});

	test('publishes the REAL client tree (the boot default) with nothing skipped', async () => {
		const dir = scratchDir('real');
		const result = await publishClientAtBoot({ smokeBoot: false, publishDir: dir });
		expect(result?.status).toBe('published');
		expect(result?.skipped).toEqual([]);
		// Floor: the shipped client is a real tree, not a stub.
		expect(result?.files ?? 0).toBeGreaterThan(500);
		expect(existsSync(join(dir, 'dedalo', 'core', 'page', 'index.html'))).toBe(
			existsSync(join(CLIENT_ROOT, 'core', 'page', 'index.html')),
		);
	});
});
