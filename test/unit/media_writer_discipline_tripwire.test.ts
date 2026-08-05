/**
 * MEDIA WRITER DISCIPLINE TRIPWIRE (DEC-12) — 2026-08-04, the layered-TIFF import.
 *
 * A media derivative is produced by exactly ONE shape: an atomic writer builds it
 * under a unique temp sibling, a single runner proves the tool really wrote ONE
 * file, and the temp is renamed into place. Every hand-rolled variant of that
 * shape is what shipped the 2026-08-04 defect, and each of the six invariants
 * below is one of its measured causes:
 *
 *  1. NO `renameSync(` OUTSIDE `src/core/media/atomic.ts`. `processing.ts` and
 *     `tools/rotation.ts` each open-coded produce-then-rename with no cleanup,
 *     so when ImageMagick wrote `<stem>-0.jpg`/`-1.jpg` instead of `<stem>.jpg`
 *     the rename threw ENOENT, the sequence files stayed on disk forever (six
 *     orphans measured under `image/thumb/440000/`), and the ingest died AFTER
 *     the staged original had already been moved irreversibly. Only the atomic
 *     writer has the `finally` that removes the temp and sweeps the siblings.
 *  2. NO AD-HOC TEMP NAMING (`.tmp.${…}` / `.rot.${…}` / `.crop.${…}`) outside
 *     that writer. `tools/rotation.ts` used `${path}.rot.${process.pid}`, which
 *     is wrong TWICE: it drops the extension, so ImageMagick infers the SOURCE
 *     format and writes e.g. TIFF bytes into a `.jpg` tier; and a bare pid is
 *     not unique per call, so two concurrent rotations of the same file share a
 *     temp. `tempSibling` puts the unique token BEFORE the extension and adds a
 *     uuid for exactly these two reasons.
 *  3. EXACTLY ONE `runBinary(` WRITE SITE in `engine/imagemagick.ts`, inside
 *     `runMagickTo`. `runMagickTo` is the output CONTRACT (exists, non-empty,
 *     and holds exactly one scene) plus the hardened `MAGICK_CONFIGURE_PATH`
 *     policy. Before this change `cropImage` spawned magick directly — so it ran
 *     unhardened AND could report success having written nothing, which is the
 *     failure class no stderr check can see (measured: exit 0, empty stderr).
 *  5. EVERY ImageMagick PROCESS CARRIES THE HARDENED POLICY, reads included.
 *     `identify` is spawned only by `runIdentify` in `engine/binaries.ts`, which
 *     passes the same `magickPolicyEnv()`. ImageMagick chooses its coder from the
 *     file's CONTENT: `identify -ping` on a `.png` holding PostScript selects the
 *     PS coder (measured: reports `PS`, exit 0 unpoliced; refused with "not
 *     allowed by the security policy 'PS'" under the policy), and the staged-upload
 *     thumbnail probes RAW UPLOADED BYTES on the request path. A read spawned
 *     bare is the CVE-2018-16509 class re-opened.
 *  6. EVERY RUNNER CALL SITS INSIDE AN ATOMIC PRODUCER. `buildThumb` /
 *     `convertImage` / `rotateImage` / `cropImage` must be called from inside a
 *     `writeAtomically`/`writeAtomicallySync` callback, never handed the FINAL
 *     path. That is the shape `ingest/staged_thumbnail.ts` had — no temp, no
 *     rename, nothing for invariants 1-2 to see — and it returned a
 *     `thumbnail_url` for a file that never existed, leaving `<stem>-N.jpg`
 *     orphans in a live media dir with nothing to sweep them.
 *  4. NO `[0]` SCENE-SELECTOR CONCATENATION outside `engine/scene.ts`.
 *     Callers declare `selection: 'representative' | 'composite'`; `sceneToken`
 *     is the ONE place that turns that into `SOURCE[0]`. `processing.ts` used to
 *     paste `[0]` onto two source paths inline, which is how the pdf/cover gears
 *     were safe while every image gear was not — the incoherence that hid the
 *     bug for as long as it hid. It binds the PROBE as well: `probeMetaChannels`
 *     asks ImageMagick about ONE image and the convert then masks ONE image, so a
 *     divergence there would decide on one image's channels and apply the answer
 *     to another's.
 *
 * TECHNIQUE: a source scan over `src/core/media/**` plus `src/ai/rag/image_source.ts`
 * (the one media writer outside that tree), comments STRIPPED first so the prose
 * explaining an anti-pattern — including this header — is never a false positive.
 * Exemptions are NAMED, each carrying a reason the gate itself asserts is
 * substantive, and each self-tested for staleness: an entry whose file no longer
 * matches must be deleted, or the gate looks stricter than it is.
 *
 * HONEST LIMIT: this proves the SHAPE of every write site, not that a given
 * derivative is correct. Correctness is `media_processing` / `media_atomic` /
 * `media_probe`; this gate is what stops the shape drifting back.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '../..');

/** Directories scanned whole (recursively, .ts only, tests excluded). */
const SCAN_DIRS = ['src/core/media'];

/**
 * Individual files scanned on top of the directories: media writers that live
 * outside `src/core/media/`. `image_source.ts` converts a record image into a
 * scratch raster for the RAG image index — it IS a magick call site, and its
 * degrade-never-throw contract makes an ad-hoc write there especially quiet.
 */
const SCAN_FILES = ['src/ai/rag/image_source.ts'];

/** The single atomic writer — the only legal home of a temp name and a rename. */
const ATOMIC_WRITER = 'src/core/media/atomic.ts';

/** The single ImageMagick argv/runner module (the one `magick` spawn). */
const MAGICK_ENGINE = 'src/core/media/engine/imagemagick.ts';

/** The binary-resolution leaf (the one `identify` spawn, and the policy env). */
const MAGICK_BINARIES = 'src/core/media/engine/binaries.ts';

/**
 * The scene-selector leaf — the ONE home of `sceneToken`, i.e. of the decision
 * "which image of this source do we mean". It is its own module because both the
 * argv recipes and `probe.ts` need it and `imagemagick.ts` already imports
 * `probe.ts`, so either of those as its home would close an import cycle.
 */
const MAGICK_SCENE = 'src/core/media/engine/scene.ts';

// ---------------------------------------------------------------------------
// Scan plumbing
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry === 'node_modules' || entry.startsWith('.')) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) out.push(full);
	}
	return out;
}

/** Every scanned file, as a repo-relative path. */
function scannedFiles(): string[] {
	const files: string[] = [];
	for (const dir of SCAN_DIRS) {
		for (const full of walk(join(ROOT, dir))) files.push(relative(ROOT, full));
	}
	for (const file of SCAN_FILES) files.push(file);
	return files.sort();
}

/** Strip comments — prose about the anti-pattern must not trip the scan. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readCode(file: string): string {
	return stripComments(readFileSync(join(ROOT, file), 'utf-8'));
}

/** Repo-relative paths of every scanned file whose CODE matches `pattern`. */
function filesMatching(pattern: RegExp): string[] {
	return scannedFiles().filter((file) => pattern.test(readCode(file)));
}

/**
 * Assert a named exemption/ratchet map is honest: every reason is substantive
 * (>= 20 chars — a bare `''` or `'ok'` is not a reason), and every named file
 * still actually matches (a stale entry silently widens the gate).
 */
function assertMapHonest(
	label: string,
	map: Record<string, string>,
	matching: readonly string[],
): void {
	const thin = Object.entries(map)
		.filter(([, reason]) => reason.trim().length < 20)
		.map(([file]) => file);
	expect(thin, `${label}: these entries carry no substantive reason: ${thin.join(', ')}`).toEqual(
		[],
	);
	const stale = Object.keys(map).filter((file) => !matching.includes(file));
	expect(
		stale,
		`${label}: stale entries — these files no longer match, delete them (an exemption list that outlives its reason makes this gate look stricter than it is): ${stale.join(', ')}`,
	).toEqual([]);
}

// ---------------------------------------------------------------------------
// 1. renameSync — the atomic writer owns the rename
// ---------------------------------------------------------------------------

const RENAME = /\brenameSync\s*\(/;

/**
 * Files that call `renameSync` to MOVE a file that already exists, never to
 * publish a derivative they just produced. They have no temp, nothing to sweep
 * and nothing to prove about a tool's output, so the atomic writer would add
 * a copy and a failure mode without adding a guarantee.
 */
const MOVE_ONLY_RENAME: Record<string, string> = {
	'src/core/media/ingest/add_file.ts':
		'moves the STAGED UPLOAD into the media tree (the irreversible step every derivative failure now happens after); the bytes already exist and are not produced here',
	'src/core/media/file_ops.ts':
		'moves a file aside into deleted/ (PHP rename_old_files) — a backup move, no producer, no temp',
	'src/core/media/ingest/upload.ts':
		'THREE legitimate uses, none of them a derivative: it claims the FINAL staged name for a completed upload (atomic wx-open then move of the assembled chunks, WC-2026-08-03), publishes the upload meta.json through its own temp, and moves a rejected upload into quarantine. All three move or publish RECEIVED bytes; no ImageMagick run, nothing to sweep',
	'src/core/media/tools/posterframe.ts':
		'moves an UPLOADED posterframe/subtitle file to its av derived path; the thumb it then builds from it does go through the atomic writer',
};

/**
 * KNOWN-OPEN, shrink-only: the AV (ffmpeg) writers still hand-roll the
 * produce-then-rename shape. They were NOT converted by the 2026-08-04
 * image-writer change and are listed here rather than exempted, because they
 * are the same defect class in a different tool: `av_versions.ts` is the writer
 * that leaked the measured `av/404/0/test94_test3_1.mp4.tmp.50160` orphan.
 * Converting one MUST delete its entry (the staleness self-test enforces it).
 */
const AV_WRITER_RATCHET: Record<string, string> = {
	'src/core/media/av_versions.ts':
		'KNOWN-OPEN: two-pass transcode writes `${target}.tmp.${process.pid}` and renames it itself; its finally removes the temp but sweeps no sequence siblings and the pid is not unique per call',
	'src/core/media/engine/ffmpeg.ts':
		'KNOWN-OPEN: conformHeader remuxes through its own `<stem>_temp` and renames the pre-conform source to `<stem>_untouched` — an in-place rewrite the atomic writer does not model yet',
};

describe('media writer discipline: renameSync lives in the atomic writer', () => {
	test('no media producer publishes its own derivative with renameSync', () => {
		const matching = filesMatching(RENAME);
		const violations = matching.filter(
			(file) =>
				file !== ATOMIC_WRITER &&
				MOVE_ONLY_RENAME[file] === undefined &&
				AV_WRITER_RATCHET[file] === undefined,
		);
		expect(
			violations,
			`Hand-rolled produce-then-rename. Use writeAtomically / writeAtomicallySync from src/core/media/atomic.ts — it owns the unique temp, the rename AND the finally that sweeps the <stem>-N sequence files ImageMagick leaves behind: ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('the atomic writer really is the one that renames (positive control)', () => {
		// Without this the invariant above could pass because NOTHING renames —
		// e.g. after a refactor moved the writer and the scan roots went stale.
		expect(filesMatching(RENAME)).toContain(ATOMIC_WRITER);
	});

	test('every renameSync exemption is named, reasoned and still true', () => {
		const matching = filesMatching(RENAME);
		assertMapHonest('MOVE_ONLY_RENAME', MOVE_ONLY_RENAME, matching);
		assertMapHonest('AV_WRITER_RATCHET', AV_WRITER_RATCHET, matching);
	});
});

// ---------------------------------------------------------------------------
// 2. Temp naming — one grammar, one owner
// ---------------------------------------------------------------------------

/** A temp name built inline: `<something>.tmp.${…}`, `.rot.${…}`, `.crop.${…}`. */
const AD_HOC_TEMP = /\.(?:tmp|rot|crop)\.\$\{/;

/**
 * The ONE ad-hoc temp left, same ratchet as above and for the same file: the av
 * transcode temp. It is listed, not exempted — `tempSibling` is what puts the
 * unique token before the extension and adds the uuid.
 */
const AD_HOC_TEMP_RATCHET: Record<string, string> = {
	'src/core/media/av_versions.ts':
		'KNOWN-OPEN: `${target}.tmp.${process.pid}` — extension-last and pid-only, the exact two properties tempSibling exists to fix; the av writers were not converted on 2026-08-04',
};

describe('media writer discipline: temp names come from tempSibling', () => {
	test('no media writer invents its own temp filename', () => {
		const matching = filesMatching(AD_HOC_TEMP);
		const violations = matching.filter(
			(file) => file !== ATOMIC_WRITER && AD_HOC_TEMP_RATCHET[file] === undefined,
		);
		expect(
			violations,
			`Ad-hoc temp name. Use writeAtomically / writeAtomicallySync (src/core/media/atomic.ts): the unique token must sit BEFORE the extension (magick infers the OUTPUT FORMAT from the extension) and must include a uuid (a bare pid is not unique per call): ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('the atomic writer really is the one that names temps (positive control)', () => {
		expect(filesMatching(AD_HOC_TEMP)).toContain(ATOMIC_WRITER);
	});

	test('every ad-hoc-temp ratchet entry is named, reasoned and still true', () => {
		assertMapHonest('AD_HOC_TEMP_RATCHET', AD_HOC_TEMP_RATCHET, filesMatching(AD_HOC_TEMP));
	});
});

// ---------------------------------------------------------------------------
// 3. One magick spawn, inside the output contract
// ---------------------------------------------------------------------------

const RUN_BINARY = /\brunBinary\s*\(/g;

/**
 * Extract a function body by brace matching from its signature. Comments are
 * stripped before this runs, and the bodies concerned hold only balanced
 * template-literal braces, so a naive counter is exact here — and if it ever is
 * not, it throws rather than silently returning a body that proves nothing.
 */
function functionBody(source: string, signature: string, file: string): string {
	const start = source.indexOf(signature);
	if (start === -1) throw new Error(`${file}: '${signature}' not found`);
	const open = source.indexOf('{', start + signature.length);
	if (open === -1) throw new Error(`${file}: no body for '${signature}'`);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') {
			depth--;
			if (depth === 0) return source.slice(open, i + 1);
		}
	}
	throw new Error(`${file}: unbalanced body for '${signature}'`);
}

describe('media writer discipline: one ImageMagick spawn, inside runMagickTo', () => {
	test('engine/imagemagick.ts spawns magick exactly once, and only from runMagickTo', () => {
		const code = readCode(MAGICK_ENGINE);
		const calls = [...code.matchAll(RUN_BINARY)];
		expect(
			calls.length,
			'engine/imagemagick.ts must hold exactly ONE runBinary( call. Every magick run has to go through runMagickTo, which is the only place that applies the hardened MAGICK_CONFIGURE_PATH policy AND proves the run produced exactly one non-empty file (a bypass reports success having written nothing: measured exit 0, empty stderr)',
		).toBe(1);
		const body = functionBody(code, 'async function runMagickTo(', MAGICK_ENGINE);
		expect(
			body,
			'the one runBinary( call is outside runMagickTo — move it inside, or its output is unverified and its policy unhardened',
		).toMatch(/\brunBinary\s*\(/);
	});

	test('engine/binaries.ts spawns identify exactly once, and only from runIdentify', () => {
		// The READ side of the same rule. It lives here rather than in imagemagick.ts
		// because probe.ts needs it and importing back would close a static-import
		// cycle (see the module header there).
		const code = readCode(MAGICK_BINARIES);
		expect(
			[...code.matchAll(RUN_BINARY)].length,
			'engine/binaries.ts must hold exactly ONE runBinary( call — every identify read goes through runIdentify, which is what applies the hardened policy to a file whose coder ImageMagick picks from its CONTENT',
		).toBe(1);
		const body = functionBody(code, 'export async function runIdentify(', MAGICK_BINARIES);
		expect(body).toMatch(/\brunBinary\s*\(/);
	});

	test('both ImageMagick spawn sites carry the hardened policy env', () => {
		// The policy is MEDIA-02's whole mechanism: without MAGICK_CONFIGURE_PATH the
		// process loads the SYSTEM policy.xml (permissive on every box measured), and
		// the PS/EPS Ghostscript-delegate class is reachable from an upload again.
		const magickRun = functionBody(
			readCode(MAGICK_ENGINE),
			'async function runMagickTo(',
			MAGICK_ENGINE,
		);
		expect(
			magickRun,
			'runMagickTo spawns magick without magickPolicyEnv() — the hardened policy.xml is not loaded',
		).toMatch(/magickPolicyEnv\s*\(/);
		const identifyRun = functionBody(
			readCode(MAGICK_BINARIES),
			'export async function runIdentify(',
			MAGICK_BINARIES,
		);
		expect(
			identifyRun,
			'runIdentify spawns identify without magickPolicyEnv() — a read is a full ImageMagick coder dispatch and must be policed too',
		).toMatch(/magickPolicyEnv\s*\(/);
	});

	test("no other media module spawns ImageMagick behind the engine's back", () => {
		// `resolveMagick()` / `resolveIdentify()` are the binary PATH resolvers; a
		// caller holding one and spawning is the same bypass as an extra runBinary
		// inside the engine — and that is exactly how file_date.ts read EXIF off a
		// freshly uploaded file with no policy until 2026-08-04.
		const violations = scannedFiles().filter((file) => {
			if (file === MAGICK_ENGINE || file === MAGICK_BINARIES) return false;
			const code = readCode(file);
			return (
				/\bresolveMagick\s*\(|\bresolveIdentify\s*\(/.test(code) && /\brunBinary\s*\(/.test(code)
			);
		});
		expect(
			violations,
			`These modules build an ImageMagick argv AND spawn it themselves, bypassing runMagickTo's output contract and runIdentify's policy env — call the engine's runner instead: ${violations.join(', ')}`,
		).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// 4. The scene selector is built in exactly one place
// ---------------------------------------------------------------------------

/**
 * A scene selector pasted onto a path: `${source}[0]` in a template literal, or
 * `+ '[0]'`. Deliberately anchored on the CONCATENATION, so ordinary array
 * indexing (`items[0]`, `fields[0]`) is not a false positive.
 */
const SCENE_SELECTOR_CONCAT = /\$\{[^{}]*\}\[0\]|\+\s*['"`]\[0\]['"`]/;

describe('media writer discipline: the scene selector has one home', () => {
	test('no caller pastes a [0] scene selector onto a source path', () => {
		const violations = filesMatching(SCENE_SELECTOR_CONCAT).filter((file) => file !== MAGICK_SCENE);
		expect(
			violations,
			`Inline [0] scene selector. Callers declare selection: 'representative' | 'composite' and sceneToken() (engine/scene.ts) builds the token — one place decides what "the source's own image" means, so a new gear cannot be written without deciding it. This binds the PROBE too: probeMetaChannels asks about one image and the convert then masks one image, and if those disagreed the engine would read one image's channels and apply the answer to another's. Violations: ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('sceneToken is where the selector is actually built (positive control)', () => {
		expect(filesMatching(SCENE_SELECTOR_CONCAT)).toContain(MAGICK_SCENE);
	});
});

// ---------------------------------------------------------------------------
// 6. Every runner call sits inside an atomic producer
// ---------------------------------------------------------------------------

/**
 * The four public ImageMagick runners. `\s*\(` after the exact name keeps
 * `buildThumbAtomically(` — the atomic gear that WRAPS buildThumb — out of the
 * match: what is banned is calling the raw runner with a final path.
 */
const RUNNER_CALL = /\b(?:buildThumb|convertImage|rotateImage|cropImage)\s*\(/g;

/** The same pattern without /g — `.test()` on a global regex is stateful. */
const RUNNER_CALL_ANY = /\b(?:buildThumb|convertImage|rotateImage|cropImage)\s*\(/;

/** Call sites that legitimately write their own target, with the reason. */
const DIRECT_RUNNER_CALL: Record<string, string> = {
	'src/ai/rag/image_source.ts':
		'converts a record image into a SCRATCH raster in os.tmpdir() for the RAG image index: that path IS the final output, nothing else can observe it, and the contract is degrade-never-throw (a failed index entry must not fail a save)',
};

/**
 * Index of the closing paren matching the '(' at `open`. Quoted spans are
 * skipped whole so a paren inside a string or a template literal cannot
 * unbalance the count; an unbalanced call throws rather than reporting a span
 * that would silently swallow the runner calls after it.
 */
function matchingParen(code: string, open: number, file: string): number {
	let depth = 0;
	let quote: string | null = null;
	for (let i = open; i < code.length; i++) {
		const ch = code[i];
		if (quote !== null) {
			if (ch === '\\') i++;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') quote = ch;
		else if (ch === '(') depth++;
		else if (ch === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}
	throw new Error(`${file}: unbalanced writeAtomically( call at ${String(open)}`);
}

/** [start, end] of every `writeAtomically(…)` / `writeAtomicallySync(…)` call. */
function atomicProducerSpans(code: string, file: string): [number, number][] {
	const spans: [number, number][] = [];
	for (const match of code.matchAll(/\bwriteAtomically(?:Sync)?\s*\(/g)) {
		const open = match.index + match[0].length - 1;
		spans.push([open, matchingParen(code, open, file)]);
	}
	return spans;
}

describe('media writer discipline: a runner is only ever called inside an atomic producer', () => {
	test('no media module hands an ImageMagick runner a final path', () => {
		const violations: string[] = [];
		for (const file of scannedFiles()) {
			if (file === MAGICK_ENGINE || DIRECT_RUNNER_CALL[file] !== undefined) continue;
			const code = readCode(file);
			const spans = atomicProducerSpans(code, file);
			for (const call of code.matchAll(RUNNER_CALL)) {
				const at = call.index;
				if (!spans.some(([start, end]) => at > start && at < end)) {
					violations.push(`${file}: ${call[0]}`);
				}
			}
		}
		expect(
			violations,
			`These runner calls write their target directly. Wrap them in writeAtomically / writeAtomicallySync (src/core/media/atomic.ts): a reader (and the web server) must never see a half-written derivative, and when a run splits into <stem>-N.jpg the sweep in the writer's finally is the only thing that collects it — invariants 1 and 2 cannot see this shape at all, because it has neither a temp nor a rename: ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('the runners really are called from inside producers (positive control)', () => {
		// Without this the invariant passes when NOTHING calls a runner — e.g. after a
		// rename that the scan roots did not follow.
		const inside = scannedFiles().filter((file) => {
			if (file === MAGICK_ENGINE) return false;
			const code = readCode(file);
			const spans = atomicProducerSpans(code, file);
			return [...code.matchAll(RUNNER_CALL)].some((call) =>
				spans.some(([start, end]) => call.index > start && call.index < end),
			);
		});
		expect(inside).toContain('src/core/media/processing.ts');
		expect(inside).toContain('src/core/media/tools/rotation.ts');
	});

	test('every direct-runner exemption is named, reasoned and still true', () => {
		assertMapHonest('DIRECT_RUNNER_CALL', DIRECT_RUNNER_CALL, filesMatching(RUNNER_CALL_ANY));
	});
});

// ---------------------------------------------------------------------------
// Scan self-test — a gate over an empty file set passes vacuously
// ---------------------------------------------------------------------------

describe('media writer discipline: the scan itself', () => {
	test('the scan sees the media tree and both named single-owner files', () => {
		const files = scannedFiles();
		expect(files.length).toBeGreaterThan(20);
		expect(files).toContain(ATOMIC_WRITER);
		expect(files).toContain(MAGICK_ENGINE);
		expect(files).toContain(MAGICK_BINARIES);
		for (const file of SCAN_FILES) expect(files).toContain(file);
	});

	test('comment stripping removes prose but keeps code', () => {
		const stripped = stripComments(
			['// renameSync(x, y)', '/* .rot.${pid} */', 'const a = renameSync(t, p);'].join('\n'),
		);
		expect(stripped).not.toMatch(/\.rot\.\$\{/);
		expect(stripped.match(RENAME)).not.toBeNull();
		// One line of code, two lines of prose: the prose must be gone, not the code.
		expect(stripped.split('\n').filter((line) => RENAME.test(line)).length).toBe(1);
	});
});
