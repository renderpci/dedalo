/**
 * MEDIA COPY — desired set, local sha cache, planner (publication-host `copy` mode;
 * engineering/PUBLICATION_HOST_SPEC.md §5.2). A MARKED scratch media root, a temp state
 * dir, the generic `test` TLD, no agent and no network: the agent manifest is injected
 * through planCopy's deps seam. Also pins that the module makes NO synchronous fs call:
 * it joins the server's reachable set in Task 9 (sync_io_on_request_path_tripwire).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { RUNTIME_PATH_CENSUS } from '../../src/core/install/runtime_paths.ts';
import { overrideMediaProtectionPathsForTests } from '../../src/core/media/protection.ts';
import type { MediaManifest } from '../../src/core/publication_host/agent_client.ts';
import {
	type AgentManifestView,
	type DesiredFile,
	desiredPublicFiles,
	diffCopyPlan,
	mediaCopyStateDir,
	openShaCache,
	overrideMediaCopyStateDirForTests,
	planCopy,
	publicFileKey,
	toManifestView,
} from '../../src/diffusion/targets/mediastore/media_copy.ts';
import { overrideMediaIndexBaseForTests } from '../../src/diffusion/targets/mediastore/media_index.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const QUALITIES = ['image/1.5MB', 'av/404'];
const FIXED = new Date('2026-01-01T00:00:00Z');
const IMG1 = 'image/1.5MB/0/test94_test3_1.jpg';
const IMG2 = 'image/1.5MB/0/test94_test3_2.jpg';
const AV1 = 'av/404/test95_test3_1.mp4';

let root: string;
let stateDir: string;

function plant(rel: string, bytes = 'payload'): string {
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, bytes);
	utimesSync(abs, FIXED, FIXED);
	return abs;
}

function publish(key: string): void {
	const dir = join(root, '.publication', 'pub');
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, key), '');
}

function sha(text: string): string {
	return new Bun.CryptoHasher('sha256').update(text).digest('hex');
}

async function collect(files: AsyncIterable<DesiredFile>): Promise<DesiredFile[]> {
	const out: DesiredFile[] = [];
	for await (const file of files) out.push(file);
	return out;
}

function desired(rel: string, key: string): DesiredFile {
	const st = statSync(join(root, rel));
	return { path: rel, key, size: st.size, mtimeMs: st.mtimeMs };
}

function codeOf(fn: () => unknown): string | undefined {
	try {
		fn();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
}

function cacheFile(): string {
	return join(stateDir, 'sha_cache.ndjson');
}

beforeEach(() => {
	root = scratchMediaRoot('dedalo_media_copy_');
	stateDir = mkdtempSync(join(tmpdir(), 'dedalo_media_copy_state_'));
	overrideMediaProtectionPathsForTests({
		mediaRoot: root,
		authStorePath: join(stateDir, 'auth_store'),
	});
	overrideMediaIndexBaseForTests(join(root, '.publication'));
	overrideMediaCopyStateDirForTests(stateDir);
});

afterEach(() => {
	overrideMediaCopyStateDirForTests(null);
	overrideMediaIndexBaseForTests(null);
	overrideMediaProtectionPathsForTests(null);
	rmSync(root, { recursive: true, force: true });
	rmSync(stateDir, { recursive: true, force: true });
});

describe('publicFileKey — Rule B decides, the hardening denials subtract', () => {
	test('a public-quality grammar file at any depth maps to its record key (greedy prefix)', () => {
		expect(publicFileKey(IMG1, QUALITIES)).toBe('test3_1');
		expect(publicFileKey('av/404/deep/x/test95_test3_22_lg-spa.mp4', QUALITIES)).toBe('test3_22');
	});

	test('masters, non-public qualities, an unescaped dot and non-grammar names are not public', () => {
		expect(
			publicFileKey('image/original/0/test94_test3_1.tif', ['image/original', ...QUALITIES]),
		).toBeNull();
		expect(publicFileKey('image/1x5MB/0/test94_test3_1.jpg', QUALITIES)).toBeNull();
		expect(publicFileKey('image/1.5MBX/0/test94_test3_1.jpg', QUALITIES)).toBeNull();
		expect(publicFileKey('image/1.5MB/0/custom_name.jpg', QUALITIES)).toBeNull();
		expect(publicFileKey(IMG1, [])).toBeNull();
	});

	test('what the agent would refuse to hold is never desired: hidden segments, a master tier below the quality', () => {
		expect(publicFileKey('image/1.5MB/0/.x_test3_1.jpg', QUALITIES)).toBeNull();
		expect(publicFileKey('image/1.5MB/.cache/test94_test3_1.jpg', QUALITIES)).toBeNull();
		expect(publicFileKey('image/1.5MB/Original/test94_test3_1.jpg', QUALITIES)).toBeNull();
		expect(publicFileKey('image/1.5MB/modified/test94_test3_1.jpg', QUALITIES)).toBeNull();
	});

	test('working, script and active-document files are never public, in any letter case', () => {
		for (const ext of ['tmp', 'TMP', 'csv', 'deleted', 'import', 'php', 'PHAR', 'html', 'swf']) {
			expect(publicFileKey(`image/1.5MB/0/test94_test3_1.${ext}`, QUALITIES), ext).toBeNull();
		}
	});
});

describe('desiredPublicFiles — pub/ ∩ public files', () => {
	test('yields exactly the published, public, grammar files, with size and mtime', async () => {
		plant(IMG1, 'aaa');
		plant(IMG2); // record test3_2 is NOT published
		plant('image/original/0/test94_test3_1.tif'); // master tier
		plant('image/1.5MB/0/test94_test3_1.tmp'); // working file
		plant('image/1.5MB/0/custom_name.jpg'); // non-grammar (login-only by design)
		plant('image/1.5MB/0/.hidden_test3_1.jpg'); // hidden: the agent refuses to hold it
		plant(AV1, 'vvvvv');
		publish('test3_1');

		expect(await collect(desiredPublicFiles(QUALITIES))).toEqual([
			{ path: IMG1, key: 'test3_1', size: 3, mtimeMs: FIXED.getTime() },
			{ path: AV1, key: 'test3_1', size: 5, mtimeMs: FIXED.getTime() },
		]);
	});

	test('a symlink inside a public quality is never followed (it could point at a master)', async () => {
		const master = plant('image/original/0/test94_test3_1.tif');
		publish('test3_1');
		mkdirSync(join(root, 'image/1.5MB/0'), { recursive: true });
		symlinkSync(master, join(root, IMG1));
		symlinkSync(join(root, 'image/original'), join(root, 'image/1.5MB/linkdir'));

		expect(await collect(desiredPublicFiles(QUALITIES))).toEqual([]);
	});

	test('a master quality in the list is dropped, never walked', async () => {
		plant('image/original/0/test94_test3_1.tif');
		publish('test3_1');
		expect(await collect(desiredPublicFiles(['image/original', 'image/1.5MB']))).toEqual([]);
	});

	test('no surviving public quality is refused loudly, never an empty set', async () => {
		await expect(collect(desiredPublicFiles(['image/original']))).rejects.toMatchObject({
			code: 'publication_host.unconfigured',
		});
	});

	test('unpublishing removes the record from the next walk', async () => {
		plant(IMG1);
		publish('test3_1');
		expect((await collect(desiredPublicFiles(QUALITIES))).map((f) => f.path)).toEqual([IMG1]);
		unlinkSync(join(root, '.publication', 'pub', 'test3_1'));
		expect(await collect(desiredPublicFiles(QUALITIES))).toEqual([]);
	});
});

describe('sha cache — (path, size, mtime) → sha256 in <private>/media_copy', () => {
	test('a hit is keyed by size+mtime: a same-size rewrite at the same mtime is NOT rehashed, a new mtime is', async () => {
		const abs = plant(IMG1, 'aaaa');
		const cache = await openShaCache();
		expect(await cache.sha256(desired(IMG1, 'test3_1'))).toBe(sha('aaaa'));

		writeFileSync(abs, 'bbbb');
		utimesSync(abs, FIXED, FIXED);
		expect(await cache.sha256(desired(IMG1, 'test3_1'))).toBe(sha('aaaa')); // the hit proves no rehash
		expect(cache.stats).toMatchObject({ hits: 1, misses: 1 });

		const later = new Date(FIXED.getTime() + 5000);
		utimesSync(abs, later, later);
		expect(await cache.sha256(desired(IMG1, 'test3_1'))).toBe(sha('bbbb'));
	});

	test('persisted: a fresh cache reads the ndjson; corrupt and unsafe lines are skipped, not fatal', async () => {
		plant(IMG1, 'aaaa');
		await (await openShaCache()).sha256(desired(IMG1, 'test3_1'));
		appendFileSync(
			cacheFile(),
			`not json\n${JSON.stringify({ p: '../escape', s: 1, m: 1, h: 'a'.repeat(64) })}\n`,
		);

		const fresh = await openShaCache();
		expect(await fresh.sha256(desired(IMG1, 'test3_1'))).toBe(sha('aaaa'));
		expect(fresh.stats).toMatchObject({ hits: 1, misses: 0, skipped_lines: 2 });
	});

	test('modes: the state dir is 0700, the cache file 0600', async () => {
		const sub = join(stateDir, 'sub');
		overrideMediaCopyStateDirForTests(sub);
		plant(IMG1);
		await (await openShaCache()).sha256(desired(IMG1, 'test3_1'));
		expect(statSync(sub).mode & 0o777).toBe(0o700);
		expect(statSync(join(sub, 'sha_cache.ndjson')).mode & 0o777).toBe(0o600);
	});

	test('a file that is not what the walk saw (changed or gone) hashes to null and is never cached', async () => {
		const abs = plant(IMG1);
		const cache = await openShaCache();
		const seen = desired(IMG1, 'test3_1');
		expect(await cache.sha256({ ...seen, mtimeMs: seen.mtimeMs - 1000 })).toBeNull();
		unlinkSync(abs);
		expect(await cache.sha256(seen)).toBeNull();
		expect(cache.stats.unstable).toBe(2);
		expect(existsSync(cacheFile())).toBe(false);
	});

	test('compaction keeps one line per still-matching file and drops vanished ones', async () => {
		const a = plant(IMG1, 'a0');
		const b = plant(IMG2, 'b0');
		const cache = await openShaCache();
		await cache.sha256(desired(IMG2, 'test3_2'));
		for (let round = 1; round <= 4; round++) {
			const when = new Date(FIXED.getTime() + round * 1000);
			utimesSync(a, when, when);
			await cache.sha256(desired(IMG1, 'test3_1'));
		}
		unlinkSync(b);
		expect(readFileSync(cacheFile(), 'utf8').trim().split('\n')).toHaveLength(5);
		expect(await cache.maybeCompact()).toBe(false); // far under the slack: no rewrite

		expect(await cache.compact()).toBe(1);
		const lines = readFileSync(cacheFile(), 'utf8').trim().split('\n');
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0] as string).p).toBe(IMG1);
		expect(statSync(cacheFile()).mode & 0o777).toBe(0o600);
	});
});

describe('diffCopyPlan — the pure planner', () => {
	const f = (n: number, size = 3): DesiredFile => ({
		path: `image/1.5MB/0/a_test3_${n}.jpg`,
		key: `test3_${n}`,
		size,
		mtimeMs: 1,
	});

	test('missing/size-different → put unhashed; equal sha → present; other sha → put; unstable → deferred', async () => {
		const agent: AgentManifestView = {
			entries: new Map([
				[f(2).path, { size: 4, sha256: sha('x') }],
				[f(3).path, { size: 3, sha256: sha('h3') }],
				[f(4).path, { size: 3, sha256: sha('old') }],
				[f(5).path, { size: 3, sha256: sha('x') }],
			]),
			irregular: new Set(),
			markers: new Set(['test3_1', 'test3_2', 'test3_3', 'test3_4', 'test3_5']),
		};
		const local = new Map<string, string | null>([
			[f(3).path, sha('h3')],
			[f(4).path, sha('new')],
			[f(5).path, null],
		]);
		const hashed: string[] = [];
		const plan = await diffCopyPlan([f(1), f(2), f(3), f(4), f(5)], agent, async (file) => {
			hashed.push(file.path);
			return local.get(file.path) ?? null;
		});

		expect(plan.put.map((p) => p.path)).toEqual([f(1).path, f(2).path, f(4).path]);
		expect(plan.present).toBe(1);
		expect(plan.deferred).toEqual([f(5).path]);
		expect(plan.desired).toBe(5);
		expect(plan.del).toEqual([]);
		expect(plan.mark).toEqual([]);
		expect(hashed).toEqual([f(3).path, f(4).path, f(5).path]);
	});

	test('agent files outside the desired set are deleted; markers are withdrawn BEFORE granted', async () => {
		const agent: AgentManifestView = {
			entries: new Map([
				[f(1).path, { size: 3, sha256: sha('one') }],
				['image/1.5MB/0/a_test3_9.jpg', { size: 3, sha256: sha('nine') }],
				['av/404/stale_test3_1.mp4', { size: 9, sha256: sha('stale') }],
			]),
			irregular: new Set(),
			markers: new Set(['test3_9', 'test3_7']),
		};
		const plan = await diffCopyPlan([f(1)], agent, async () => sha('one'));

		expect(plan.del).toEqual(['av/404/stale_test3_1.mp4', 'image/1.5MB/0/a_test3_9.jpg']);
		expect(plan.mark).toEqual([
			{ key: 'test3_7', published: false },
			{ key: 'test3_9', published: false },
			{ key: 'test3_1', published: true },
		]);
		expect(plan.present).toBe(1);
	});

	test('every irregular agent path is deleted as drift; a desired path held irregularly is deferred, never put over it', async () => {
		const agent: AgentManifestView = {
			entries: new Map([[f(1).path, { size: 3, sha256: sha('one') }]]),
			irregular: new Set([f(2).path, 'image/.DS_Store', 'image/1.5MB/0/link_test3_1.jpg']),
			markers: new Set(['test3_1', 'test3_2']),
		};
		const hashed: string[] = [];
		const plan = await diffCopyPlan([f(1), f(2)], agent, async (file) => {
			hashed.push(file.path);
			return sha('one');
		});

		expect(plan.del).toEqual([
			'image/.DS_Store',
			'image/1.5MB/0/a_test3_2.jpg',
			'image/1.5MB/0/link_test3_1.jpg',
		]);
		expect(plan.put).toEqual([]);
		expect(plan.deferred).toEqual([f(2).path]);
		expect(plan.present).toBe(1);
		expect(plan.mark).toEqual([]);
		expect(hashed).toEqual([f(1).path]);
	});

	test('toManifestView refuses unsafe paths, bad digests, duplicates and non-marker keys', () => {
		const ok = { path: IMG1, size: 1, sha256: sha('x') };
		const none = { entries: [], irregular: [], markers: [] };
		const bad: MediaManifest[] = [
			{ ...none, entries: [{ ...ok, path: '../etc/passwd' }] },
			{ ...none, entries: [{ ...ok, path: '/abs.jpg' }] },
			{ ...none, entries: [{ ...ok, path: 'a//b.jpg' }] },
			{ ...none, entries: [{ ...ok, path: 'image/1.5MB/0/x\u0001_test3_1.jpg' }] },
			{ ...none, entries: [{ ...ok, path: `image/${'x'.repeat(1100)}_test3_1.jpg` }] },
			{ ...none, entries: [{ ...ok, path: '.publication/pub/test3_1' }] },
			{ ...none, entries: [{ ...ok, sha256: 'nothex' }] },
			{ ...none, entries: [{ ...ok, size: -1 }] },
			{ ...none, entries: [ok, ok] },
			{ ...none, markers: ['a/../b_1'] },
			{ ...none, markers: ['a_b_1'] },
			{ ...none, irregular: ['../x'] },
			{ ...none, irregular: ['image/a', 'image/a'] },
			{ ...none, irregular: ['.dedalo_host_agent_instance'] },
			{ ...none, irregular: ['.publication/copy/x'] },
			{ ...none, entries: [ok], irregular: [IMG1] },
		];
		for (const raw of bad) {
			expect(
				codeOf(() => toManifestView(raw)),
				JSON.stringify(raw),
			).toBe('publication_host.failed');
		}
		const view = toManifestView({
			entries: [ok],
			irregular: ['image/.DS_Store', 'image/1.5MB/0/link_test3_9.jpg'],
			markers: ['test3_1'],
		});
		expect(view.entries.get(IMG1)).toEqual({ size: 1, sha256: sha('x') });
		expect([...view.markers]).toEqual(['test3_1']);
		expect([...view.irregular].sort()).toEqual([
			'image/.DS_Store',
			'image/1.5MB/0/link_test3_9.jpg',
		]);
	});
});

describe('planCopy — desired set × injected agent manifest × sha cache', () => {
	test('a newly published file is put, an unpublished record is withdrawn and deleted, hashes are cached', async () => {
		plant(IMG1, 'aaa');
		plant(IMG2); // test3_2: on the agent from an earlier publish, now unpublished
		publish('test3_1');
		const qualities = () => QUALITIES;

		const first = await planCopy('scratch', {
			qualities,
			manifest: async () => ({
				entries: [{ path: IMG2, size: 7, sha256: sha('payload') }],
				irregular: [],
				markers: ['test3_2'],
			}),
		});
		expect(first.put.map((p) => p.path)).toEqual([IMG1]);
		expect(first.del).toEqual([IMG2]);
		expect(first.mark).toEqual([
			{ key: 'test3_2', published: false },
			{ key: 'test3_1', published: true },
		]);
		expect(existsSync(cacheFile())).toBe(false); // nothing needed hashing

		const second = await planCopy('scratch', {
			qualities,
			manifest: async () => ({
				entries: [{ path: IMG1, size: 3, sha256: sha('aaa') }],
				irregular: [],
				markers: ['test3_1'],
			}),
		});
		expect(second).toMatchObject({
			put: [],
			del: [],
			mark: [],
			deferred: [],
			desired: 1,
			present: 1,
		});
		expect(readFileSync(cacheFile(), 'utf8').trim().split('\n')).toHaveLength(1);
	});

	test('a malformed agent manifest aborts the plan', async () => {
		await expect(
			planCopy('scratch', {
				qualities: () => QUALITIES,
				manifest: async () => ({ entries: [], irregular: [], markers: ['a/../b_1'] }),
			}),
		).rejects.toMatchObject({ code: 'publication_host.failed' });
	});
});

describe('state dir: censused, and the seam refuses a real path', () => {
	test('the census resolves the same <private>/media_copy the module uses', () => {
		overrideMediaCopyStateDirForTests(null);
		const entry = RUNTIME_PATH_CENSUS.find((e) => e.id === 'media_copy_state_dir');
		expect(entry?.resolve()).toBe(mediaCopyStateDir());
	});

	test('overrideMediaCopyStateDirForTests refuses a non-temp path', () => {
		expect(codeOf(() => overrideMediaCopyStateDirForTests('/srv/dedalo/private/media_copy'))).toBe(
			'internal.invariant',
		);
	});
});

describe('no synchronous fs call (the module joins the server reachable set in Task 9)', () => {
	test('media_copy.ts calls no *Sync function — the sync_io ledgers are shrink-only', () => {
		const source = stripComments(
			readFileSync(join(REPO_ROOT, 'src/diffusion/targets/mediastore/media_copy.ts'), 'utf8'),
		);
		expect(source.length).toBeGreaterThan(1000); // anti-vacuity: the module was read
		expect(source.match(/\b[A-Za-z]+Sync\s*\(/g) ?? []).toEqual([]);
	});
});
