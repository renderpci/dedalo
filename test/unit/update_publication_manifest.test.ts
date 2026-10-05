/**
 * THE PUBLICATION MANIFEST (publication host phase 4, decision L1) — what the
 * code updater verified about `publication/server_api/**`, carried across the
 * restart in the installed tree itself.
 *
 * The verified release zip is deleted after the swap, so this file is the ONLY
 * evidence of what the release shipped. These gates pin: the writer hashes
 * exactly the Publication API files (tolerated paths excluded, non-regular
 * entries refused); the verifier refuses a missing/corrupt manifest, a manifest
 * from another archive than the tree's stamp OR than the caller's release
 * (swap landed, restart pending), and every kind of drift, per API and
 * independently; the tolerance list stays equal to the ignore files it mirrors;
 * the manifest is gitignored (it must never ride a `git archive` into another
 * install).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { IGNORED_ROOT_ENTRIES } from '../../src/core/update/code_update.ts';
import { INSTALL_STAMP_PATH } from '../../src/core/update/install_stamp.ts';
import {
	isToleratedPath,
	manifestFilesFor,
	PUBLICATION_MANIFEST_PATH,
	parsePublicationManifest,
	readPublicationManifest,
	verifyPublicationTree,
	writePublicationManifest,
} from '../../src/core/update/publication_manifest.ts';
import { refusalOf } from '../helpers/refusal.ts';

const REPO = resolve(import.meta.dir, '..', '..');
const DIGEST = 'a'.repeat(64);
const OTHER_DIGEST = 'b'.repeat(64);
const SCRATCH = mkdtempSync(join(tmpdir(), 'dedalo_pubmanifest_'));
afterAll(() => {
	rmSync(SCRATCH, { recursive: true, force: true });
});

/** What a release archive ships under the Publication API, plus one engine file outside it. */
const RELEASE_FILES: Readonly<Record<string, string>> = {
	'publication/server_api/v1/json/index.php': '<?php // v1 entry',
	'publication/server_api/v1/json/.htaccess': 'Require all granted',
	'publication/server_api/v1/config_api/sample.server_config_api.php': '<?php // sample',
	'publication/server_api/v2/package.json': '{"name":"v2"}',
	'publication/server_api/v2/bun.lock': '{}',
	'publication/server_api/v2/src/server.ts': '// v2 server',
	'src/server.ts': '// engine code, outside the publication tree',
};

const V1_INDEX = 'publication/server_api/v1/json/index.php';
const V2_SERVER = 'publication/server_api/v2/src/server.ts';

let treeCounter = 0;

function plant(root: string, rel: string, content: string): void {
	const full = join(root, rel);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, content);
}

function sha(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

/** A synthetic extracted release + its install stamp: what updateCode holds at the extract phase. */
function releaseTree(stampDigest: string | null = DIGEST): string {
	const root = join(SCRATCH, `tree_${treeCounter++}`);
	for (const [rel, content] of Object.entries(RELEASE_FILES)) plant(root, rel, content);
	if (stampDigest !== null) {
		plant(root, INSTALL_STAMP_PATH, JSON.stringify({ digest: stampDigest, channel: 'master' }));
	}
	return root;
}

/** A release tree whose manifest was written, i.e. an installed tree. */
async function installedTree(): Promise<string> {
	const root = releaseTree();
	await writePublicationManifest(root, DIGEST);
	return root;
}

describe('the I/O functions are async (sync_io_on_request_path_tripwire; plan Interfaces)', () => {
	test('writer, verifier and reader return Promises; the parser stays pure', async () => {
		const root = releaseTree();
		const written = writePublicationManifest(root, DIGEST);
		expect(written).toBeInstanceOf(Promise);
		await written;
		const verdict = verifyPublicationTree(root, 'v1');
		const read = readPublicationManifest(root);
		expect(verdict).toBeInstanceOf(Promise);
		expect(read).toBeInstanceOf(Promise);
		await Promise.all([verdict, read]);
		expect(parsePublicationManifest('nope')).toBeNull();
	});
});

describe('writePublicationManifest', () => {
	test('hashes every Publication API file, both APIs, sorted, and nothing outside the tree', async () => {
		const root = await installedTree();
		const manifest = JSON.parse(readFileSync(join(root, PUBLICATION_MANIFEST_PATH), 'utf8'));
		const expected = Object.fromEntries(
			Object.entries(RELEASE_FILES)
				.filter(([rel]) => rel.startsWith('publication/server_api/'))
				.sort(([a], [b]) => (a < b ? -1 : 1))
				.map(([rel, content]) => [rel, sha(content)]),
		);
		expect(manifest).toEqual({ version: 1, digest: DIGEST, files: expected });
		expect(Object.keys(manifest.files)).toEqual(Object.keys(expected));
	});

	test('the same tree always writes the same bytes (no timestamp, sorted keys)', async () => {
		const a = await installedTree();
		const b = await installedTree();
		expect(readFileSync(join(a, PUBLICATION_MANIFEST_PATH), 'utf8')).toBe(
			readFileSync(join(b, PUBLICATION_MANIFEST_PATH), 'utf8'),
		);
	});

	test('tolerated paths are never manifested', async () => {
		const root = releaseTree();
		plant(root, 'publication/server_api/v2/node_modules/dep/index.js', '// dep');
		plant(root, 'publication/server_api/v1/config_api/server_config_api.php', '<?php $pw="x";');
		plant(root, 'publication/server_api/v2/.DS_Store', '');
		plant(root, 'publication/server_api/v2/tsconfig.tsbuildinfo', '{}');
		plant(root, 'publication/server_api/v2/dist/out.js', '// built');
		plant(root, 'publication/server_api/v2/.env', 'SECRET=1');
		await writePublicationManifest(root, DIGEST);
		const manifest = await readPublicationManifest(root);
		expect(manifest).not.toBeNull();
		for (const key of Object.keys(manifest?.files ?? {})) {
			expect({ key, tolerated: isToleratedPath(key) }).toEqual({ key, tolerated: false });
		}
		expect(Object.keys(manifest?.files ?? {}).length).toBe(6);
	});

	test('a release with no Publication API tree writes an empty manifest (not a throw)', async () => {
		const root = join(SCRATCH, `bare_${treeCounter++}`);
		plant(root, 'src/server.ts', '// engine only');
		await writePublicationManifest(root, DIGEST);
		expect(await readPublicationManifest(root)).toEqual({ version: 1, digest: DIGEST, files: {} });
	});

	test('a non-regular entry in the API tree REFUSES the update and writes nothing', async () => {
		const root = releaseTree();
		symlinkSync('/etc/passwd', join(root, 'publication/server_api/v1/json/link.php'));
		const refusal = await refusalOf(writePublicationManifest(root, DIGEST));
		expect(refusal.code).toBe('update.refused');
		expect(refusal.message).toContain('publication/server_api/v1/json/link.php');
		expect(existsSync(join(root, PUBLICATION_MANIFEST_PATH))).toBe(false);
	});

	test('a digest that is not a sha256 is refused', async () => {
		const refusal = await refusalOf(writePublicationManifest(releaseTree(), 'not-a-sha'));
		expect(refusal.code).toBe('update.failed');
	});
});

describe('parsePublicationManifest (evidence that does not parse is absent)', () => {
	const good = { version: 1 as const, digest: DIGEST, files: { [V1_INDEX]: sha('x') } };
	test('a well-formed manifest parses', () => {
		expect(parsePublicationManifest(JSON.stringify(good))).toEqual(good);
	});
	test.each([
		['not json', 'nope'],
		['wrong version', JSON.stringify({ ...good, version: 2 })],
		['bad digest', JSON.stringify({ ...good, digest: 'abc' })],
		['files not an object', JSON.stringify({ ...good, files: [] })],
		['bad file sha', JSON.stringify({ ...good, files: { [V1_INDEX]: 'not-a-sha' } })],
		['key outside the API root', JSON.stringify({ ...good, files: { 'src/server.ts': sha('x') } })],
		[
			'traversal key',
			JSON.stringify({ ...good, files: { 'publication/server_api/../x': sha('x') } }),
		],
		[
			'empty segment',
			JSON.stringify({ ...good, files: { 'publication/server_api//x': sha('x') } }),
		],
	])('%s → null', (_label, content) => {
		expect(parsePublicationManifest(content)).toBeNull();
	});
});

describe('readPublicationManifest', () => {
	test('absent → null; written → exactly what the parser makes of the file', async () => {
		expect(await readPublicationManifest(releaseTree())).toBeNull();
		const root = await installedTree();
		expect(await readPublicationManifest(root)).toEqual(
			parsePublicationManifest(readFileSync(join(root, PUBLICATION_MANIFEST_PATH), 'utf8')),
		);
	});
});

describe('verifyPublicationTree', () => {
	test('a freshly installed tree verifies for both APIs', async () => {
		const root = await installedTree();
		expect(await verifyPublicationTree(root, 'v1')).toEqual({ ok: true });
		expect(await verifyPublicationTree(root, 'v2')).toEqual({ ok: true });
	});

	test('no manifest (a dev checkout or a pre-feature install) → missing_manifest', async () => {
		const root = releaseTree();
		expect(await verifyPublicationTree(root, 'v1')).toEqual({
			ok: false,
			reason: 'missing_manifest',
			drift: [],
		});
	});

	test('a corrupt manifest → missing_manifest, never a partial trust', async () => {
		const root = await installedTree();
		writeFileSync(join(root, PUBLICATION_MANIFEST_PATH), '{"version":1,');
		expect((await verifyPublicationTree(root, 'v2')).ok).toBe(false);
		expect(await verifyPublicationTree(root, 'v2')).toMatchObject({ reason: 'missing_manifest' });
	});

	test('a manifest from another archive than the stamp → digest_mismatch', async () => {
		const root = releaseTree(OTHER_DIGEST);
		await writePublicationManifest(root, DIGEST);
		expect(await verifyPublicationTree(root, 'v1')).toEqual({
			ok: false,
			reason: 'digest_mismatch',
			drift: [],
		});
	});

	test('a manifest with no install stamp → digest_mismatch', async () => {
		const root = releaseTree(null);
		await writePublicationManifest(root, DIGEST);
		expect(await verifyPublicationTree(root, 'v1')).toMatchObject({ reason: 'digest_mismatch' });
	});

	test('expectedDigest equal to the manifest and the stamp → ok', async () => {
		const root = await installedTree();
		expect(await verifyPublicationTree(root, 'v1', DIGEST)).toEqual({ ok: true });
		expect(await verifyPublicationTree(root, 'v2', DIGEST)).toEqual({ ok: true });
	});

	test('swap landed, restart pending: a self-consistent tree from ANOTHER release than the caller names → digest_mismatch', async () => {
		// The tree on disk is release B (stamp B, manifest B); the running process is still A.
		const root = releaseTree(OTHER_DIGEST);
		await writePublicationManifest(root, OTHER_DIGEST);
		expect(await verifyPublicationTree(root, 'v1')).toEqual({ ok: true });
		expect(await verifyPublicationTree(root, 'v1', DIGEST)).toEqual({
			ok: false,
			reason: 'digest_mismatch',
			drift: [],
		});
	});

	test('expectedDigest never rescues a manifest the stamp disowns', async () => {
		const root = releaseTree(OTHER_DIGEST);
		await writePublicationManifest(root, DIGEST);
		expect(await verifyPublicationTree(root, 'v2', DIGEST)).toMatchObject({
			reason: 'digest_mismatch',
		});
	});

	test('an edited file is drift, NAMED, and only for its own API', async () => {
		const root = await installedTree();
		writeFileSync(join(root, V1_INDEX), '<?php // hot-patched on the server');
		expect(await verifyPublicationTree(root, 'v1')).toEqual({
			ok: false,
			reason: 'drift',
			drift: [`${V1_INDEX} (modified)`],
		});
		expect(await verifyPublicationTree(root, 'v2')).toEqual({ ok: true });
	});

	test('a deleted file is drift', async () => {
		const root = await installedTree();
		unlinkSync(join(root, V2_SERVER));
		expect(await verifyPublicationTree(root, 'v2')).toEqual({
			ok: false,
			reason: 'drift',
			drift: [`${V2_SERVER} (missing)`],
		});
	});

	test('an added file is drift', async () => {
		const root = await installedTree();
		plant(root, 'publication/server_api/v1/json/shell.php', '<?php system($_GET[1]);');
		expect(await verifyPublicationTree(root, 'v1')).toEqual({
			ok: false,
			reason: 'drift',
			drift: ['publication/server_api/v1/json/shell.php (not in the manifest)'],
		});
	});

	test('a symlink planted after the install is drift (not a regular file)', async () => {
		const root = await installedTree();
		symlinkSync('/etc/passwd', join(root, 'publication/server_api/v2/src/leak.ts'));
		expect(await verifyPublicationTree(root, 'v2')).toEqual({
			ok: false,
			reason: 'drift',
			drift: ['publication/server_api/v2/src/leak.ts (not a regular file)'],
		});
	});

	test('tolerated paths appearing after the install are NOT drift', async () => {
		const root = await installedTree();
		plant(root, 'publication/server_api/v2/node_modules/dep/index.js', '// installed');
		plant(root, 'publication/server_api/v1/config_api/server_config_api.php', '<?php $pw="x";');
		plant(root, 'publication/server_api/v1/json/.DS_Store', '');
		plant(root, 'publication/server_api/v2/tsconfig.tsbuildinfo', '{}');
		plant(root, 'publication/server_api/v2/coverage/lcov.info', '');
		plant(root, 'publication/server_api/v2/dist/out.js', '');
		plant(root, 'publication/server_api/v2/.cache/x', '');
		plant(root, 'publication/server_api/v2/server.log', '');
		plant(root, 'publication/server_api/v2/.env', 'X=1');
		expect(await verifyPublicationTree(root, 'v1')).toEqual({ ok: true });
		expect(await verifyPublicationTree(root, 'v2')).toEqual({ ok: true });
	});

	test('an API with no files in the manifest is drift, never a vacuous ok', async () => {
		const root = join(SCRATCH, `empty_${treeCounter++}`);
		plant(root, INSTALL_STAMP_PATH, JSON.stringify({ digest: DIGEST, channel: 'master' }));
		await writePublicationManifest(root, DIGEST);
		expect(await verifyPublicationTree(root, 'v1')).toEqual({
			ok: false,
			reason: 'drift',
			drift: ['publication/server_api/v1/ (no files in the manifest)'],
		});
	});

	test('manifestFilesFor lists one API only, sorted', async () => {
		const manifest = await readPublicationManifest(await installedTree());
		if (manifest === null) throw new Error('manifest not written');
		expect(manifestFilesFor(manifest, 'v1')).toEqual([
			'publication/server_api/v1/config_api/sample.server_config_api.php',
			'publication/server_api/v1/json/.htaccess',
			V1_INDEX,
		]);
	});
});

describe('the tolerance list mirrors the ignore files (no second copy to drift)', () => {
	/** A concrete path a gitignore line matches under `base` — or a loud failure for a shape we do not translate. */
	function sampleFor(base: string, pattern: string): string {
		expect({ pattern, unsupported: /[[?!]|\*\*|\/./.test(pattern) }).toEqual({
			pattern,
			unsupported: false,
		});
		if (pattern.endsWith('/')) return `${base}/${pattern}x/file.js`;
		if (pattern.startsWith('*')) return `${base}/sample${pattern.slice(1)}`;
		return `${base}/${pattern}`;
	}

	function patterns(lines: string[]): string[] {
		return lines.map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
	}

	test('every publication/server_api/v2/.gitignore pattern is tolerated', () => {
		const lines = readFileSync(join(REPO, 'publication/server_api/v2/.gitignore'), 'utf8').split(
			'\n',
		);
		const found = patterns(lines);
		expect(found.length).toBeGreaterThanOrEqual(5);
		for (const pattern of found) {
			const path = sampleFor('publication/server_api/v2', pattern);
			expect({ path, tolerated: isToleratedPath(path) }).toEqual({ path, tolerated: true });
		}
	});

	test("every pattern of the root .gitignore's Publication API block is tolerated", () => {
		const lines = readFileSync(join(REPO, '.gitignore'), 'utf8').split('\n');
		const start = lines.findIndex((line) => line.startsWith('# Publication API'));
		expect(start).toBeGreaterThan(-1);
		const end = lines.findIndex((line, i) => i > start && line.trim() === '');
		const found = patterns(lines.slice(start, end));
		expect(found).toContain('server_config_api.php');
		for (const pattern of found) {
			const path = sampleFor('publication/server_api/v1/config_api', pattern);
			expect({ path, tolerated: isToleratedPath(path) }).toEqual({ path, tolerated: true });
		}
	});

	test("the updater's OS-metadata names are tolerated anywhere in the API tree", () => {
		for (const name of IGNORED_ROOT_ENTRIES) {
			const path = `publication/server_api/v1/json/${name}`;
			expect({ path, tolerated: isToleratedPath(path) }).toEqual({ path, tolerated: true });
		}
	});

	test('a real API file is not tolerated', () => {
		expect(isToleratedPath(V1_INDEX)).toBe(false);
		expect(isToleratedPath(V2_SERVER)).toBe(false);
	});
});

describe('the manifest is install provenance, never source', () => {
	test("it is gitignored (a `git archive` can never ship one install's manifest to another)", () => {
		const probe = Bun.spawnSync([
			'git',
			'-C',
			REPO,
			'check-ignore',
			'-q',
			PUBLICATION_MANIFEST_PATH,
		]);
		expect(probe.exitCode).toBe(0);
	});
});
