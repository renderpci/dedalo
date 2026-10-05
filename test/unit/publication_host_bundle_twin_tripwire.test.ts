/**
 * PUBLICATION-HOST BUNDLE TWIN TRIPWIRE (DEC-12; publication host phase 4, L4).
 *
 * ONE FORMAT, TWO DEPLOYABLES. The engine WRITES release bundles
 * (src/core/publication_host/bundle_writer.ts) and the publication agent READS them
 * (publication/host_agent/src/releases/ustar.ts, `extractBundle`). They share no module —
 * the agent is its own package on another machine — so nothing but this gate keeps the
 * two spellings of D7 equal. A drift is not a cosmetic bug: the engine pushes a release
 * after every update (L5), and a bundle the agent refuses leaves the public API on the old
 * release while the engine moved on (spec §3 lockstep).
 *
 * WHAT IS PINNED, in the order the rules appear below:
 *   1. ROUND TRIP. A tree with nested and implicit-parent dirs, exec bits, empty files,
 *      multi-block and non-block-aligned files, a streamed file, PAX paths (ASCII and
 *      multibyte) and a 255-byte segment is written by the engine and extracted by the
 *      AGENT'S OWN reader, streamed end to end. Every file's bytes and mode, the entry and
 *      byte counts, and the agent's sha256 equal what the engine wrote.
 *   2. THE LIMITS ARE ONE NUMBER EACH. The writer's path and segment caps equal the
 *      reader's constants, and a path AT the path cap is never a BundleRefused (it lands on
 *      Linux; on a PATH_MAX-1024 OS the filesystem answers ENAMETOOLONG after validation).
 *   3. A WRITER FAILURE NEVER LANDS. A bundle whose stream errors half-way (a source file
 *      shorter than its stated size) is refused by the reader, which removes its staging
 *      directory.
 *   4. ONE WRITER. Across the shipped trees (test/helpers/shipped_text_corpus.ts — the
 *      registered lister, so this gate chooses no walk root of its own), test trees out, the
 *      only source line that spells the ustar magic as a string literal is in
 *      bundle_writer.ts (the phase-2 drill kit's interim writer was retired into it).
 *   5. BOTH SIDES STAY IMPORTABLE. bundle_writer.ts imports only `node:` builtins (so the
 *      drill kit can use it without the engine config); the agent's reader is zero-dep by
 *      its own package gate.
 *
 * HERMETIC: a mkdtemp scratch dir under the OS temp dir, removed after, plus a read of the
 * shipped source trees. No DB, no network, no ../private. Honest limits: the agent's
 * per-install caps (MAX_BUNDLE_BYTES, MAX_BUNDLE_ENTRIES) are agent config, exercised by
 * the reader's own suite, not here; rule 4's comment filter is line-based.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	BundleRefused,
	DEFAULT_MAX_PATH_LENGTH,
	extractBundle,
	MAX_SEGMENT_BYTES,
} from '../../publication/host_agent/src/releases/ustar.ts';
import {
	BUNDLE_MAX_PATH_BYTES,
	BUNDLE_MAX_SEGMENT_BYTES,
	type BundleWriterEntry,
	compareBundlePaths,
	writeBundle,
} from '../../src/core/publication_host/bundle_writer.ts';
import { scratchRunEntries } from '../helpers/scratch_run_entries.ts';
import { shippedTextFiles } from '../helpers/shipped_text_corpus.ts';

const REPO = join(import.meta.dir, '..', '..');
const WRITER = 'src/core/publication_host/bundle_writer.ts';
const scratch = mkdtempSync(join(tmpdir(), 'dd_pubhost_bundle_twin_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const LIMITS = { maxBytes: 64 << 20, maxEntries: 10_000, maxPathLength: DEFAULT_MAX_PATH_LENGTH };
const text = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function* listOf(entries: readonly BundleWriterEntry[]): AsyncGenerator<BundleWriterEntry> {
	for (const entry of entries) yield entry;
}

function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
	let offset = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (offset >= bytes.length) {
				controller.close();
				return;
			}
			controller.enqueue(bytes.slice(offset, offset + size));
			offset += size;
		},
	});
}

/** Tees the writer's stream: one branch to the agent, one hashed here. */
async function roundTrip(entries: readonly BundleWriterEntry[], dest: string) {
	mkdirSync(dest);
	const out = await writeBundle(listOf(entries));
	const [toAgent, toHash] = out.stream.tee();
	const seen = new Response(toHash).arrayBuffer();
	const result = await extractBundle(toAgent, dest, LIMITS, []);
	return { result, written: await out.sha256, seen: sha(new Uint8Array(await seen)) };
}

/**
 * Every regular file under `root` — the scratch extraction this gate made — relative and
 * sorted. Listed through the registered scratch lister (census_derivation SHARED_LISTERS),
 * so the gate chooses no walk root of its own.
 */
function filesUnder(root: string, rel = ''): string[] {
	return scratchRunEntries(rel === '' ? root : join(root, rel)).flatMap((name) => {
		const path = rel === '' ? name : `${rel}/${name}`;
		return statSync(join(root, path)).isDirectory() ? filesUnder(root, path) : [path];
	});
}

const BLOCKY = Uint8Array.from({ length: 1536 }, (_, i) => i % 256); // exactly 3 blocks
const RAGGED = Uint8Array.from({ length: 70_001 }, (_, i) => (i * 13) % 256); // not block-aligned
const STREAMED = Uint8Array.from({ length: 200_003 }, (_, i) => (i * 7 + 3) % 256);
const DEEP = `node_modules/${'a'.repeat(70)}/${'b'.repeat(70)}`; // > 100 bytes: PAX
const WIDE = `${'ñ'.repeat(60)}/índice.js`; // multibyte, > 100 bytes: PAX, UTF-8 cut
const SEG255 = `${'é'.repeat(127)}z`; // 255 bytes in one segment
const AT_CAP = `${`${'c'.repeat(254)}/`.repeat(4)}cccc`; // 1024 bytes exactly, 5 levels
const DIR_AT_CAP = `${`${'d'.repeat(254)}/`.repeat(4)}ddd`; // 1023 bytes + its `/` = 1024

const TREE_ENTRIES: BundleWriterEntry[] = [
	{ path: 'src', type: 'dir', mode: 0o700 },
	{ path: 'src/index.ts', type: 'file', mode: 0o600, data: text('export {};\n') },
	{ path: 'bin/run', type: 'file', mode: 0o750, data: text('#!/bin/sh\nexit 0\n') }, // implicit parent
	{ path: 'blocky.bin', type: 'file', mode: 0o644, data: BLOCKY },
	{ path: 'ragged.bin', type: 'file', mode: 0o644, data: RAGGED },
	{
		path: 'streamed.bin',
		type: 'file',
		mode: 0o644,
		data: chunked(STREAMED, 4093),
		size: STREAMED.length,
	},
	{ path: 'empty', type: 'file', mode: 0o644 },
	{ path: 'node_modules', type: 'dir', mode: 0o755 },
	{ path: DEEP, type: 'dir', mode: 0o755 },
	{ path: `${DEEP}/index.js`, type: 'file', mode: 0o644, data: text('x'.repeat(700)) },
	{ path: WIDE, type: 'file', mode: 0o644, data: text('wide') },
	{ path: SEG255, type: 'file', mode: 0o644, data: text('seg') },
];
const TREE = [...TREE_ENTRIES].sort((a, b) => compareBundlePaths(a.path, b.path));

describe('bundle twin — 1. engine writer → agent reader round trip', () => {
	test('every file, mode and count survives; the agent hashes what the engine wrote', async () => {
		const dest = join(scratch, 'tree');
		const { result, written, seen } = await roundTrip(TREE, dest);

		expect(result.sha256).toBe(written);
		expect(seen).toBe(written);
		expect(result.entries).toBe(TREE.length);
		expect(result.bytes).toBe(11 + 17 + 1536 + 70_001 + 200_003 + 0 + 700 + 4 + 3);

		const read = (p: string) => new Uint8Array(readFileSync(join(dest, p)));
		expect(read('src/index.ts')).toEqual(text('export {};\n'));
		expect(read('blocky.bin')).toEqual(BLOCKY);
		expect(read('ragged.bin')).toEqual(RAGGED);
		expect(read('streamed.bin')).toEqual(STREAMED);
		expect(read('empty').length).toBe(0);
		expect(read(`${DEEP}/index.js`)).toEqual(text('x'.repeat(700)));
		expect(read(WIDE)).toEqual(text('wide'));
		expect(read(SEG255)).toEqual(text('seg'));

		const mode = (p: string) => statSync(join(dest, p)).mode & 0o777;
		expect(mode('src')).toBe(0o755);
		expect(mode('bin')).toBe(0o755);
		expect(mode('bin/run')).toBe(0o755);
		expect(mode('src/index.ts')).toBe(0o644);

		const files = TREE.filter((e) => e.type === 'file').map((e) => e.path);
		expect(filesUnder(dest).sort()).toEqual([...files].sort());
	});

	test('the same tree written twice is the same bundle', async () => {
		const plain = TREE.map((e) =>
			e.path === 'streamed.bin' ? { ...e, data: STREAMED, size: undefined } : e,
		);
		const a = await roundTrip(plain, join(scratch, 'twice_a'));
		const b = await roundTrip(
			plain.map((e) =>
				e.path === 'ragged.bin' ? { ...e, data: chunked(RAGGED, 1000), size: RAGGED.length } : e,
			),
			join(scratch, 'twice_b'),
		);
		expect(b.written).toBe(a.written);
		expect(b.result.sha256).toBe(a.result.sha256);
	});
});

describe('bundle twin — 2. the limits are one number each', () => {
	test('writer caps equal the reader constants', () => {
		expect(BUNDLE_MAX_PATH_BYTES).toBe(DEFAULT_MAX_PATH_LENGTH);
		expect(BUNDLE_MAX_SEGMENT_BYTES).toBe(MAX_SEGMENT_BYTES);
		expect(new TextEncoder().encode(AT_CAP).length).toBe(BUNDLE_MAX_PATH_BYTES);
		expect(new TextEncoder().encode(`${DIR_AT_CAP}/`).length).toBe(BUNDLE_MAX_PATH_BYTES);
		expect(new TextEncoder().encode(SEG255).length).toBe(BUNDLE_MAX_SEGMENT_BYTES);
	});

	// A 1024-byte RELATIVE path cannot exist under any directory on an OS whose PATH_MAX is
	// 1024 (macOS): there the reader passes validation and the filesystem answers
	// ENAMETOOLONG. On Linux — the agent's platform — it lands. Either way it is never a
	// BundleRefused, which is the twin claim.
	const capCases: Array<[string, BundleWriterEntry, string]> = [
		['file', { path: AT_CAP, type: 'file', mode: 0o644, data: text('cap') }, AT_CAP],
		['dir', { path: DIR_AT_CAP, type: 'dir', mode: 0o755 }, DIR_AT_CAP],
	];
	for (const [kind, entry, path] of capCases) {
		test(`a ${kind} path AT the cap is never refused by the reader`, async () => {
			const dest = join(scratch, `cap_${kind}`);
			mkdirSync(dest);
			const out = await writeBundle(listOf([entry]));
			const err = await extractBundle(out.stream, dest, LIMITS, []).then(
				() => null,
				(e: unknown) => e,
			);
			if (err === null) {
				expect(existsSync(join(dest, path))).toBe(true);
				return;
			}
			expect(err).not.toBeInstanceOf(BundleRefused);
			expect((err as NodeJS.ErrnoException).code).toBe('ENAMETOOLONG');
		});
	}
});

describe('bundle twin — 3. a writer failure never lands', () => {
	test('a stream that errors half-way is refused and the staging dir removed', async () => {
		const dest = join(scratch, 'broken');
		mkdirSync(dest);
		const out = await writeBundle(
			listOf([
				{ path: 'a.bin', type: 'file', mode: 0o644, data: RAGGED },
				{ path: 'b.bin', type: 'file', mode: 0o644, data: chunked(text('short'), 2), size: 4096 },
			]),
		);
		const err = await extractBundle(out.stream, dest, LIMITS, []).then(
			() => null,
			(e: unknown) => e,
		);
		expect(err).not.toBeNull();
		expect(existsSync(dest)).toBe(false);
		expect(
			await out.sha256.then(
				() => 'resolved',
				() => 'rejected',
			),
		).toBe('rejected');
	});
});

describe('bundle twin — 4. one writer', () => {
	test('across the shipped trees (test trees out), only bundle_writer.ts spells the ustar magic as a string literal', () => {
		const sources = shippedTextFiles()
			.filter((f) => /\.(ts|js|mjs)$/.test(f))
			.filter((f) => !/(^|\/)(node_modules|tests?)\//.test(f) && !/\.test\.ts$/.test(f));
		expect(sources.length).toBeGreaterThan(1500); // anti-vacuity: the corpus was seen
		expect(sources).toContain(WRITER);
		const MAGIC = /['"`]ustar\\0/;
		const holders = sources.filter((f) =>
			readFileSync(join(REPO, f), 'utf8')
				.split('\n')
				.some((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && MAGIC.test(line)),
		);
		expect(
			holders,
			'a second ustar writer: route it through writeBundle (one writer, never two)',
		).toEqual([WRITER]);
	});
});

describe('bundle twin — 5. both sides stay importable', () => {
	test('bundle_writer.ts imports only node: builtins', () => {
		const src = readFileSync(join(REPO, WRITER), 'utf8');
		const specs = [...src.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
		expect(specs.length).toBeGreaterThan(0);
		for (const s of specs) expect(s).toMatch(/^node:/);
	});
});
