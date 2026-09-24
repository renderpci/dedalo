/**
 * ONE ZIP ENCODER — census tripwire for the claim src/core/files/zip.ts makes
 * ("the engine's ZIP encoder … one implementation").
 *
 * A uniqueness claim nothing measures is a comment, not an invariant (DEC-12):
 * a second encoder — a tool writing its own PKZIP records, a vendored or
 * installed zip library, a spawned `zip` — would leave every other gate green
 * while the stated invariant quietly stopped being true. This gate measures it.
 *
 * WHAT COUNTS AS ZIP EMISSION (in CODE — comments are stripped first, so a
 * doc that names `Bun.zip` or `PK\x03\x04` is not a hit):
 *  - a ZIP record signature as a 32-bit literal (local file 0x04034b50,
 *    central 0x02014b50, end 0x06054b50, ZIP64 end/locator 0x06064b50 /
 *    0x07064b50, data descriptor 0x08074b50). A byte run `0x50, 0x4b, …` is
 *    NOT a signal: that is how the readers sniff (media/engine/mime.ts,
 *    verify_content.ts, update/code_update.ts) — reading is not emission;
 *  - raw DEFLATE (node:zlib `deflateRaw*` / `createDeflateRaw`, a
 *    `CompressionStream('deflate-raw')`) — ZIP's entry codec, used by nothing else;
 *  - a runtime `Bun.zip`, a spawned `zip` binary, `git archive --format=zip`
 *    (an `allowed_extensions: ['zip', …]` list is not a spawn);
 *  - an import of a ZIP library.
 * And package.json may declare no ZIP library at all (client or server).
 *
 * WHERE: every .ts/.js/.mjs of the SHIPPED first-party trees — the registered
 * shared lister test/helpers/shipped_text_corpus.ts (client/, deploy/,
 * publication/, scripts/, src/, tools/: server modules AND browser code, the
 * client downloads server-built archives now). Gates are not producers: a
 * `.test.ts` and the browser suite under client/dedalo/test/ are left out (the
 * export suite READS the archives it downloads — signatures, `deflate-raw`
 * decompression — which is verification, not emission). The walk is floored.
 *
 * ALLOWED: the encoder itself, plus the EXEMPTIONS below — each named with its
 * reason, shrink-only (an exemption whose file no longer emits is red: delete it).
 *
 * POSITIVE CONTROLS: the detector recognizes the real encoder (non-vacuity
 * floor), and planted spellings of each signal class are hits.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shippedTextFiles } from '../helpers/shipped_text_corpus.ts';

const ROOT = join(import.meta.dir, '..', '..');

/** THE encoder. */
const ENCODER = 'src/core/files/zip.ts';

/**
 * Files that produce ZIP bytes WITHOUT being an in-process encoder, each with
 * its reason. Shrink-only.
 */
const EXEMPTIONS: Readonly<Record<string, string>> = {
	'src/core/update/code_build.ts':
		'release packaging DELEGATES the code archive to `git archive --format=zip`: the release artifact must be exactly what git holds for the ref (the update drill verifies it with unzip/zipinfo), and it never carries user data — an external producer, not a second encoder',
	'scripts/update_probe.ts':
		'the museum-cycle dev probe cuts the release the same way code_build.ts does — `git archive --format=zip` of a ref, never user data; operator tooling that delegates to git, not a second encoder',
};

/** ZIP libraries (encoders, or encoder+reader) — none may be a dependency or an import. */
const ZIP_LIBRARIES = [
	'client-zip',
	'jszip',
	'fflate',
	'archiver',
	'yazl',
	'adm-zip',
	'zip-stream',
	'@zip.js/zip.js',
	'compressing',
	'node-7z',
];

interface Signal {
	name: string;
	pattern: RegExp;
}

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

const SIGNALS: readonly Signal[] = [
	{
		name: 'zip record signature (u32)',
		pattern: /\b0x0?(?:4034b50|2014b50|6054b50|6064b50|7064b50|8074b50)\b/i,
	},
	{
		name: 'raw deflate',
		pattern: /\b(?:createDeflateRaw|deflateRawSync|deflateRaw)\b|deflate-raw/,
	},
	{ name: 'Bun.zip', pattern: /\bBun\s*\.\s*zip\b/ },
	{
		name: 'spawned zip',
		pattern:
			/\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(\s*\[?\s*['"`]zip['"`]|--format=zip/,
	},
	{
		name: 'zip library import',
		pattern: new RegExp(
			`(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*)['"\`](?:${ZIP_LIBRARIES.map(escapeRe).join('|')})(?:/[^'"\`]*)?['"\`]`,
		),
	},
];

/** The code of a source text: block comments and whole-line comments removed. */
function codeOf(text: string): string {
	return text
		.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
		.split('\n')
		.map((line) => (/^\s*\/\//.test(line) ? '' : line))
		.join('\n');
}

/** The signal names a source text's CODE carries. */
function signalsOf(text: string): string[] {
	const code = codeOf(text);
	return SIGNALS.filter((signal) => signal.pattern.test(code)).map((signal) => signal.name);
}

/** The code files of the shipped trees, gates excluded (repo-relative, sorted). */
function zipCensusCorpus(): string[] {
	return shippedTextFiles().filter(
		(file) =>
			/\.(?:ts|js|mjs)$/.test(file) &&
			!file.endsWith('.test.ts') &&
			!file.startsWith('client/dedalo/test/'),
	);
}

function census(corpus: readonly string[]): Map<string, string[]> {
	const hits = new Map<string, string[]>();
	for (const file of corpus) {
		const found = signalsOf(readFileSync(join(ROOT, file), 'utf8'));
		if (found.length > 0) hits.set(file, found);
	}
	return hits;
}

describe('one ZIP encoder (src/core/files/zip.ts) — census', () => {
	const corpus = zipCensusCorpus();
	const hits = census(corpus);

	test('the walk covers the shipped trees (non-vacuity floor)', () => {
		// 1631 code files on 2026-09-24, the old src+tools corpus included.
		expect(corpus.length).toBeGreaterThan(1500);
		for (const root of ['client/', 'scripts/', 'src/', 'tools/']) {
			expect({ root, seen: corpus.some((file) => file.startsWith(root)) }).toEqual({
				root,
				seen: true,
			});
		}
		expect(corpus).toContain(ENCODER);
	});

	test('the detector recognizes the real encoder (non-vacuity floor)', () => {
		const own = hits.get(ENCODER) ?? [];
		expect(own).toContain('zip record signature (u32)');
		expect(own).toContain('raw deflate');
	});

	test('no file outside the encoder and its named exemptions emits ZIP bytes', () => {
		const outside = [...hits.entries()]
			.filter(([file]) => file !== ENCODER && EXEMPTIONS[file] === undefined)
			.map(([file, found]) => `${file}: ${found.join(', ')}`);
		expect(
			outside,
			`a second ZIP producer — import src/core/files/zip.ts (openZipStream / buildStoreZip) instead, or ledger a delegation in EXEMPTIONS with its reason:`,
		).toEqual([]);
	});

	test('every exemption is alive and carries a reason (shrink-only)', () => {
		for (const [file, reason] of Object.entries(EXEMPTIONS)) {
			expect({ file, alive: hits.has(file) }).toEqual({ file, alive: true });
			expect(reason.length).toBeGreaterThan(40);
		}
	});

	test('package.json declares no ZIP library', () => {
		const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<
			string,
			Record<string, string> | undefined
		>;
		const declared = [
			...Object.keys(manifest.dependencies ?? {}),
			...Object.keys(manifest.devDependencies ?? {}),
			...Object.keys(manifest.optionalDependencies ?? {}),
			...Object.keys(manifest.peerDependencies ?? {}),
		];
		expect(declared.filter((name) => ZIP_LIBRARIES.includes(name))).toEqual([]);
	});

	test('positive controls: each signal class is a hit, a comment is not', () => {
		const planted: Record<string, string> = {
			'zip record signature (u32)': 'view.setUint32(0, 0x04034b50, true);',
			'raw deflate': "import { deflateRawSync } from 'node:zlib';",
			'Bun.zip': 'const bytes = await Bun.zip(files);',
			'spawned zip': "Bun.spawn(['zip', '-r', out, dir]);",
			'zip library import': "import { downloadZip } from 'client-zip';",
		};
		for (const [name, text] of Object.entries(planted)) {
			expect({ name, hits: signalsOf(text) }).toEqual({ name, hits: [name] });
		}
		// a doc comment naming the signals is not code
		expect(
			signalsOf('/** the old `Bun.zip` probe; PK 0x04034b50 */\n// deflateRaw\nconst a = 1;'),
		).toEqual([]);
		// the magic SNIFF of a reader (code_update.ts looksLikeZip, mime.ts) is not
		// emission, and neither is an extension list
		expect(signalsOf('return buffer[0] === 0x50 && buffer[1] === 0x4b;')).toEqual([]);
		expect(signalsOf('matchAt(bytes, 0, [0x50, 0x4b, 0x03, 0x04])')).toEqual([]);
		expect(signalsOf("allowed_extensions: ['zip','kml'],")).toEqual([]);
	});
});
