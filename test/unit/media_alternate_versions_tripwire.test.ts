/**
 * ALTERNATE-EXTENSION TWIN TRIPWIRE (DEC-12) — 2026-08-07.
 *
 * `DEDALO_*_ALTERNATIVE_EXTENSIONS` was read by seven modules and written by
 * NONE. v6's `component_image::create_alternative_version` was never ported, so
 * the engine scanned for, indexed, advertised and offered files that nothing in
 * `src/` could ever produce — and the one twin class that did exist (v6-migrated)
 * silently depicted a superseded master while `files_info` reported it current.
 * That is CONFIG READ BUT NOT HONOURED, and this gate is what stops it coming
 * back one call site at a time.
 *
 * The seven invariants, each with the failure it is made of:
 *
 *  1. THE CONFIGURED LIST IS READ ONLY THROUGH THE NARROWED SPEC. `mediaTypeOf`
 *     filters the configured extensions to the models that HAVE a writer and
 *     keeps the rest in `refusedAlternateExtensions`. A module that reached back
 *     to `config.media.<type>.alternateExtensions` would re-advertise exactly the
 *     phantom files that filtering removed — and nothing would be dropped
 *     silently either: filtered + refused must still be everything configured.
 *  2. A TWIN LIVES ONLY IN A DERIVED TIER. Never a master (a machine-authored
 *     file parked in a master tier becomes resolvable AS the master —
 *     `resolveMaster` walks `allowedExtensions`, which holds png/heic/webp), and
 *     never the thumb (`scanFilesInfo` walks the thumb tier with
 *     `config.media.thumb.extension` ALONE, so a twin there is permanently
 *     unindexable: it would cost an encode per upload and be invisible forever).
 *  3. A TWIN IS RETIRED, NEVER DELETED. The reconciler's failure branch MOVES a
 *     twin it cannot rebuild into `deleted/` — honestly twin-less beats quietly
 *     stale — and the engine's No-hard-delete law says that move is
 *     `moveToDeleted` / `renameOldFiles`, never an unlink.
 *  4. **EVERY BUILDER THE CENSUS DECLARES REALLY EXISTS AND WRITES FROM THE
 *     LIST.** This is the load-bearing one: the defect was not a missing list, it
 *     was a list that only SCANNERS read. It is asserted against the CENSUS and
 *     not as "some file mentions both names", because the weaker shape was
 *     GREEN on the tree this change replaced (its processing.ts had
 *     `for (const extension of spec.alternateExtensions)` in the retire-only loop
 *     and three `buildImageVersion(` calls — verified against HEAD~). What is red
 *     there, for every model with a builder, is that the declared function exists
 *     and its own body turns the configured list into written files.
 *  5. THE MODEL-CAPABILITY CENSUS IS TOTAL AND EXACT. `ALTERNATE_BUILDER_BY_MODEL`
 *     and `NO_ALTERNATE_BUILDER_REASON` are exact complements over the five
 *     `component_*` model strings — the SAME key space `mediaTypeOf` dispatches
 *     on, verified here to intersect it, because a census keyed on the type-FOLDER
 *     names ('image', 'av', …) would never meet a single model and could report
 *     total coverage of nothing.
 *  6. EVERY ENUMERATION OF A RECORD'S FILES IS THE **MANAGED** LIST, NOT THE BUILT
 *     ONE. `files_info` and `duplicateMediaFiles` must both read
 *     `spec.managedExtensions`. Measured: three hand-kept unions drifted, and
 *     duplicate_record silently dropped a pdf's jpg COVER (the only visual a pdf
 *     has in a list view) plus every configured-but-refused legacy file. A file
 *     the engine will not BUILD is still a file it must not LOSE.
 *  7. THE PER-FILE ROTATION BACKGROUND IS NOT DEFEATED BY ITS CALLER. The tool
 *     that PRODUCES alpha twins is the same one that rewrites every extension of a
 *     tier, and it passed a literal white while discarding the operator's own
 *     'Transparent' flag — the per-file rule was dead code from the only tool that
 *     reaches it.
 *
 * TECHNIQUE: `media_writer_discipline_tripwire`'s — a source scan over
 * `src/core/media/**` plus `src/core/concepts/media.ts` and the one tool that
 * both produces and rewrites a twin, COMMENTS STRIPPED first
 * so the prose explaining an anti-pattern (this header included) is never a false
 * positive, and a positive control per invariant so that no assertion can pass
 * because the scan found nothing. No binaries, no DB: every claim here is about
 * the SHAPE of the subsystem, and the behaviour is gated in
 * media_alternate_versions / media_two_masters / media_processing.
 *
 * Registered in engineering/TRIPWIRES.md + scripts/verify.ts.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { config } from '../../src/config/config.ts';
import {
	ALTERNATE_BUILDER_BY_MODEL,
	type MediaModel,
	mediaTypeOf,
	NO_ALTERNATE_BUILDER_REASON,
} from '../../src/core/concepts/media.ts';
import { derivedTwinQualities } from '../../src/core/media/processing.ts';

const ROOT = join(import.meta.dir, '../..');

/** Directories scanned whole (recursively, .ts only, tests excluded). */
const SCAN_DIRS = ['src/core/media'];

/**
 * The ONE tool that both PRODUCES an alpha twin (its background removal) and
 * rewrites every extension of a tier in place. Scanned because the per-file
 * background rule that protects the twin lives in `rotation.ts` but is DEFEATED
 * from here — see invariant 7.
 */
const ROTATION_HANDLER = 'tools/tool_image_rotation/server/index.ts';

/**
 * Scanned on top of the directories: the media CONTRACT itself. It is the one
 * legal reader of the raw config list (invariant 1) and the home of the census
 * (invariant 5), so a scan that could not see it would exempt the very file the
 * gate is about.
 */
const SCAN_FILES = ['src/core/concepts/media.ts', ROTATION_HANDLER, 'src/ai/rag/image_source.ts'];

/** The contract module — the ONLY legal reader of the raw config list. */
const MEDIA_CONTRACT = 'src/core/concepts/media.ts';

/** The twin reconciler's home. */
const PROCESSING = 'src/core/media/processing.ts';

/** The disk scanner — the enumerator that must read the MANAGED list (invariant 6). */
const FILES_INFO = 'src/core/media/files_info.ts';

/** The boot pre-flight: reads the configured list, writes nothing (the control for 4). */
const ALTERNATE_PREFLIGHT = 'src/core/media/alternate_preflight.ts';

/**
 * The five media model strings. Declared here rather than derived from the census
 * under test, so a census that lost a model cannot make the gate agree with it.
 */
const MEDIA_MODELS: readonly MediaModel[] = [
	'component_3d',
	'component_av',
	'component_image',
	'component_pdf',
	'component_svg',
];

// ---------------------------------------------------------------------------
// Scan plumbing (media_writer_discipline_tripwire's, verbatim in behaviour)
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
 * Index of the delimiter matching the one at `open`. Quoted spans are skipped
 * whole, so a brace or paren inside a string cannot unbalance the count.
 */
function matching(code: string, open: number, close: string, file: string): number {
	const opener = code[open] as string;
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
		else if (ch === opener) depth++;
		else if (ch === close) {
			depth--;
			if (depth === 0) return i;
		}
	}
	throw new Error(`${file}: unbalanced '${opener}' at ${String(open)}`);
}

/**
 * The BODY of a function, given a signature ending in its opening paren.
 *
 * It steps over the PARAMETER LIST and the RETURN TYPE — deliberately unlike the
 * simpler "first `{` after the signature" helper in
 * media_writer_discipline_tripwire. Both shortcuts were measured to read the
 * wrong span here, and a gate reading the wrong span is a gate proving nothing:
 *
 *  - `buildAlternateVersions`' last parameter is an inline options OBJECT TYPE,
 *    so "first `{` after the signature" returns `{ qualities…; extensions?… }`;
 *  - `buildPdfCovers` returns `Promise<{ created: string[]; errors: string[] }>`,
 *    so "first `{` after the parameters" returns the RETURN TYPE — which is how
 *    this helper was caught claiming that a builder looping over
 *    `spec.coverExtensions` never reads an extension list.
 *
 * The body brace is therefore taken as the LAST `{` on the line that closes the
 * parameter list (every declaration here puts it there), with the naive scan kept
 * as the fallback for a signature whose `{` opens on a line of its own.
 */
function functionBody(source: string, signature: string, file: string): string {
	const start = source.indexOf(signature);
	if (start === -1) throw new Error(`${file}: '${signature}' not found`);
	const paren = start + signature.length - 1;
	if (source[paren] !== '(') throw new Error(`${file}: '${signature}' must end at its '('`);
	const afterParams = matching(source, paren, ')', file);
	const lineEnd = source.indexOf('\n', afterParams);
	const sameLine = source.slice(afterParams, lineEnd === -1 ? source.length : lineEnd);
	const open =
		sameLine.lastIndexOf('{') === -1
			? source.indexOf('{', afterParams)
			: afterParams + sameLine.lastIndexOf('{');
	if (open === -1) throw new Error(`${file}: no body for '${signature}'`);
	return source.slice(open, matching(source, open, '}', file) + 1);
}

// ---------------------------------------------------------------------------
// 1. The configured list is read only through the narrowed spec
// ---------------------------------------------------------------------------

/** A read of the RAW catalog list, bypassing the capability filter. */
const RAW_CONFIG_READ =
	/config\.media\.[A-Za-z0-9_]+\.alternateExtensions|\bcfg\.alternateExtensions/;

describe('alternate twins: the configured list is read through the narrowed spec', () => {
	test('only the media contract reads the raw catalog list', () => {
		const violations = filesMatching(RAW_CONFIG_READ).filter((file) => file !== MEDIA_CONTRACT);
		expect(
			violations,
			`These modules read DEDALO_*_ALTERNATIVE_EXTENSIONS straight from the catalog, bypassing mediaTypeOf's capability filter. Read spec.alternateExtensions instead: the raw list still names formats this engine has no writer for (component_av/svg/3d), and re-reading it re-advertises files nothing can produce — the exact defect the filter exists to end: ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('the contract really is the reader (positive control)', () => {
		// Without this the invariant above passes when NOBODY reads the config at
		// all — e.g. after a rename the scan roots did not follow, which would also
		// mean the key had silently stopped being honoured.
		expect(filesMatching(RAW_CONFIG_READ)).toEqual([MEDIA_CONTRACT]);
	});

	test('nothing configured is silently DROPPED: filtered + refused = configured', () => {
		// The filter is a narrowing, and a narrowing that loses its input is
		// indistinguishable from the old silence. Every configured extension must
		// still be somewhere the operator (and the boot log) can see it.
		const configured: Record<MediaModel, readonly string[]> = {
			component_image: config.media.image.alternateExtensions,
			component_av: config.media.av.alternateExtensions,
			component_pdf: config.media.pdf.alternateExtensions,
			component_svg: config.media.svg.alternateExtensions,
			component_3d: config.media.threeD.alternateExtensions,
		};
		for (const model of MEDIA_MODELS) {
			const spec = mediaTypeOf(model);
			expect(spec).not.toBeNull();
			const seen = [...spec!.alternateExtensions, ...spec!.refusedAlternateExtensions].sort();
			const expected = [
				...new Set(configured[model].map((extension) => extension.toLowerCase())),
			].sort();
			expect([model, seen]).toEqual([model, expected]);
			// A refusal that cannot name the key it refuses is not a refusal.
			expect([model, spec!.alternateExtensionsConfigKey]).toEqual([
				model,
				spec!.alternateExtensionsConfigKey,
			]);
			expect(spec!.alternateExtensionsConfigKey).toMatch(
				/^DEDALO_[A-Z0-9_]+_ALTERNATIVE_EXTENSIONS$/,
			);
		}
	});
});

// ---------------------------------------------------------------------------
// 2. A twin lives only in a derived tier
// ---------------------------------------------------------------------------

describe('alternate twins: only DERIVED tiers, never a master, never the thumb', () => {
	test('derivedTwinQualities excludes every master and the thumb, for every model', () => {
		for (const model of MEDIA_MODELS) {
			const spec = mediaTypeOf(model)!;
			const twinTiers = derivedTwinQualities(spec);
			for (const master of spec.masterQualities) {
				expect([model, master, twinTiers.includes(master)]).toEqual([model, master, false]);
			}
			expect([model, twinTiers.includes(config.media.thumb.quality)]).toEqual([model, false]);
			// It is the ladder MINUS those two classes — not a hand-kept list that
			// could quietly stop following a renamed tier.
			expect([model, twinTiers]).toEqual([
				model,
				spec.qualities.filter(
					(quality) =>
						!spec.masterQualities.includes(quality) && quality !== config.media.thumb.quality,
				),
			]);
		}
	});

	test('the exclusion is not vacuous: image really has derived tiers (positive control)', () => {
		const image = mediaTypeOf('component_image')!;
		const twinTiers = derivedTwinQualities(image);
		// A ladder whose every tier were a master would satisfy the exclusion above
		// while building nothing at all.
		expect(twinTiers.length).toBeGreaterThan(0);
		expect(twinTiers).toContain(image.defaultQuality);
		// And the two excluded classes are really populated, or there was nothing to
		// exclude: image has TWO masters and a thumb.
		expect(image.masterQualities.length).toBe(2);
		expect(image.hasThumb).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// 3. A twin is retired, never deleted
// ---------------------------------------------------------------------------

/** An unlink of a media file — the No-hard-delete law's forbidden shape. */
const HARD_DELETE = /\b(?:unlinkSync|unlink|rmdirSync)\s*\(|\brmSync\s*\(/;

/** The No-hard-delete movers: a file leaves a tier by MOVING into deleted/. */
const SOFT_DELETE = /\bmoveToDeleted\s*\(|\brenameOldFiles\s*\(/;

/**
 * The modules that retire or replace a twin. `atomic.ts` and `engine/*` are NOT
 * here on purpose: they remove their own TEMPS (and a probe artefact in
 * os.tmpdir()), which is the opposite of removing a record's file.
 */
const TWIN_RETIRING_MODULES = [
	PROCESSING,
	'src/core/media/tools/versions.ts',
	'src/core/media/repair.ts',
];

describe('alternate twins: retired to deleted/, never hard-deleted', () => {
	test('no twin producer unlinks a media file', () => {
		const violations = TWIN_RETIRING_MODULES.filter((file) => HARD_DELETE.test(readCode(file)));
		expect(
			violations,
			`A media file leaves its tier by MOVING into the sibling deleted/ directory (moveToDeleted / renameOldFiles — PHP rename_old_files, the engine's No-hard-delete law). A twin the host can no longer encode must be retired, not destroyed: the operator's bytes are one move away, and on a box that simply lacks the delegate that move is the difference between "honestly twin-less" and "silently gone": ${violations.join(', ')}`,
		).toEqual([]);
	});

	test('they really do retire — the movers are there (positive control)', () => {
		// Without this the invariant above is satisfied by a reconciler that neither
		// deletes NOR retires, i.e. one that leaves every stale twin serving.
		for (const file of TWIN_RETIRING_MODULES) {
			expect([file, SOFT_DELETE.test(readCode(file))]).toEqual([file, true]);
		}
		// And specifically inside the reconciler: the ⟺ invariant's other direction
		// (tier file absent ⇒ the twin goes) is a MOVE.
		const body = functionBody(
			readCode(PROCESSING),
			'export async function buildAlternateVersions(',
			PROCESSING,
		);
		expect(body).toMatch(SOFT_DELETE);
	});
});

// ---------------------------------------------------------------------------
// 4. spec.alternateExtensions must be referenced by a WRITE site
// ---------------------------------------------------------------------------

/** Any reference to the narrowed list. */
const ALTERNATE_LIST = /\balternateExtensions\b/;

/** The ONE image derivative writer — what makes a module a write site, not a reader. */
const IMAGE_WRITER = /\bbuildImageVersion\s*\(/;

/** Every engine call that actually PRODUCES a derivative file. */
const DERIVATIVE_WRITER = /\bbuildImageVersion\s*\(|\bconvertImage\s*\(/;

/**
 * Where a declared builder may take its extension list from: the type's own
 * narrowed list, its cover list, or the ONE named helper that derives from them
 * (`twinExtensions`, pinned to `spec.alternateExtensions` by its own assertion
 * below — a one-hop indirection is legible; two would not be).
 */
const EXTENSION_SOURCE =
	/\bspec\.(?:alternateExtensions|coverExtensions)\b|\btwinExtensions\s*\(\s*spec\s*\)/;

describe('alternate twins: the list is referenced by a WRITE site, not only by scanners', () => {
	test('EVERY builder the census declares really exists and really writes from the list', () => {
		// THE ANTI-RECREATION ASSERTION, and it is written against the CENSUS rather
		// than against "some file mentions both names" for a measured reason: the tree
		// this change replaced ALSO matched that weaker shape. Its processing.ts had
		// `for (const extension of spec.alternateExtensions)` in the retire-only loop
		// and three `buildImageVersion(` calls, so a readers ∩ writers test was GREEN
		// on the exact defect it claimed to refuse (verified against HEAD~). What is
		// red there — for every model with a builder — is this: the declared function
		// must EXIST and its own body must turn the configured list into written files.
		const declared = Object.entries(ALTERNATE_BUILDER_BY_MODEL).filter(
			([, builder]) => builder !== null,
		);
		expect(declared.length).toBeGreaterThan(0);
		for (const [model, builder] of declared) {
			const [, fn, path] = /^([A-Za-z0-9_]+)\s+\((.+)\)$/.exec(
				builder as string,
			) as RegExpExecArray;
			const file = join('src', path as string);
			const body = functionBody(readCode(file), `export async function ${fn as string}(`, file);
			expect(
				[model, EXTENSION_SOURCE.test(body)],
				`${model}'s declared builder ${String(fn)} does not read the type's extension list at all — a "builder" that ignores DEDALO_*_ALTERNATIVE_EXTENSIONS is the read-but-never-honoured defect wearing a function name`,
			).toEqual([model, true]);
			expect(
				[model, DERIVATIVE_WRITER.test(body)],
				`${model}'s declared builder ${String(fn)} produces no derivative file (no buildImageVersion / convertImage call). For two years the key was read by seven modules and written by none, so the engine scanned for, indexed and offered files nothing could produce`,
			).toEqual([model, true]);
		}
	});

	test('the one-hop helper really resolves to the configured list', () => {
		// `twinExtensions(spec)` is admitted above as an extension SOURCE, so what it
		// derives from is part of the invariant: pointed at anything else, every
		// builder could satisfy the gate while honouring a different list.
		const body = functionBody(readCode(PROCESSING), 'function twinExtensions(', PROCESSING);
		expect(body).toMatch(/\bspec\.alternateExtensions\b/);
	});

	test('the reconciler itself reads the list and builds through the one recipe', () => {
		// Not merely "the file mentions both somewhere": the function that owns the
		// ⟺ invariant must be the one doing it, or a refactor could move the build
		// out and leave the mention behind.
		const body = functionBody(
			readCode(PROCESSING),
			'export async function buildAlternateVersions(',
			PROCESSING,
		);
		expect(
			body,
			"buildAlternateVersions does not default to the type's configured twin list — it would then only ever be honoured when a caller happened to pass one",
		).toMatch(EXTENSION_SOURCE);
		expect(
			body,
			'buildAlternateVersions does not build through buildImageVersion — a twin must come from the SAME recipe as the tier it accompanies (measured: two recipes drift, and every extension-dependent decision — the flatten background, the -quality — is already derived from the target path inside it)',
		).toMatch(IMAGE_WRITER);
		// AND IT BUILDS FROM THE `master` PARAMETER, never from the tier's sibling
		// file. Transcoding the sibling jpg is the cheap shortcut and it is WRONG:
		// that file has already been composited onto white by backgroundForTarget, so
		// the alpha the twin exists to carry is gone before the transcode starts.
		// MEASURED on the layered medal master through this exact recipe — from the
		// MASTER the avif comes out `srgba`, `opaque=False`, PSNR 44.56; from the
		// tier's jpg `opaque=True`, PSNR 3.31, the cut-out destroyed. Every existence
		// check passes either way, which is why it is pinned on the ARGUMENT.
		expect(
			body,
			'buildAlternateVersions does not pass its `master` argument to buildImageVersion — a twin built from anything else depicts a flattened copy, and nothing downstream can tell',
		).toMatch(/buildImageVersion\(\s*spec,\s*identity,\s*quality,\s*master\s*,/);
	});

	test('read-only readers still exist — the gate distinguishes (positive control)', () => {
		// "Reads the list" is genuinely weaker than "writes the files", and the tree
		// must still contain a module of the first kind or the assertions above are
		// only ever met by construction. The boot pre-flight is exactly that: it reads
		// the configured list to WARN about it and writes no derivative at all.
		const readers = filesMatching(ALTERNATE_LIST);
		expect(readers.length).toBeGreaterThan(2);
		expect(readers).toContain(ALTERNATE_PREFLIGHT);
		expect(DERIVATIVE_WRITER.test(readCode(ALTERNATE_PREFLIGHT))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// 6. Every enumeration of a record's files is the MANAGED list, not the BUILT one
// ---------------------------------------------------------------------------

/**
 * The three places that enumerate "every extension this record may have on disk"
 * in order to SEE, COPY or SOFT-DELETE those files. They must all read the same
 * list, and it must be `spec.managedExtensions` — not the built one.
 *
 * MEASURED, on the tree this gate was added to: `files_info` had the union
 * hand-written inline while `duplicateMediaFiles` enumerated
 * `[default, allowed, alternates]`, so duplicate_record silently dropped a pdf's
 * jpg COVER whenever `DEDALO_PDF_ALTERNATIVE_EXTENSIONS` did not happen to list
 * jpg — the only visual a pdf record has in a list view — and dropped every
 * configured-but-REFUSED legacy file (a v6 `404/<id>.ogg`) on every model. Three
 * hand-kept unions is how one of them stops matching the other two.
 */
const FILE_ENUMERATORS = [
	'src/core/media/files_info.ts',
	'src/core/media/file_ops.ts',
	// Outside the scan dirs, and in the list for the same reason
	// media_writer_discipline_tripwire scans it: it is the one media file-resolver
	// living outside src/core/media, and it asks exactly this question ("which
	// file of this tier is on disk") for the RAG image index.
	'src/ai/rag/image_source.ts',
];

/** A hand-rolled union of the extension lists — the shape that drifts. */
const HAND_ROLLED_UNION =
	/\[\s*(?:\.\.\.)?spec\.(?:defaultExtension|allowedExtensions)\s*,[\s\S]{0,200}?\.\.\.spec\.(?:allowedExtensions|alternateExtensions)\b/;

describe('alternate twins: one managed-extension list, not three hand-kept unions', () => {
	test('the scanner and the duplicator read spec.managedExtensions', () => {
		for (const file of FILE_ENUMERATORS) {
			const code = readCode(file);
			expect(
				[file, /\bspec\.managedExtensions\b/.test(code)],
				`${file} enumerates a record's files without spec.managedExtensions. A file the engine will not BUILD is still a file it must not LOSE: the pdf cover is built whether or not the config lists it, and a configured-but-refused extension may already be on disk from v6`,
			).toEqual([file, true]);
			expect(
				[file, HAND_ROLLED_UNION.test(code)],
				`${file} rebuilds the union by hand instead of reading spec.managedExtensions — that is how the three enumerations drifted apart in the first place`,
			).toEqual([file, false]);
		}
	});

	test('the managed list really is a superset, default-first (positive control)', () => {
		for (const model of MEDIA_MODELS) {
			const spec = mediaTypeOf(model)!;
			// Default FIRST: files_info emits in this order and four component_image
			// views plus resolve/relation_list.ts pick a tier by QUALITY alone.
			expect([model, spec.managedExtensions[0]]).toEqual([model, spec.defaultExtension]);
			for (const extension of [
				...spec.allowedExtensions,
				...spec.alternateExtensions,
				...spec.refusedAlternateExtensions,
				...spec.coverExtensions,
			]) {
				expect([model, extension, spec.managedExtensions.includes(extension)]).toEqual([
					model,
					extension,
					true,
				]);
			}
		}
		// And it is not vacuously equal to the built list: pdf's cover is in it while
		// the upload allowlist refuses that very extension.
		const pdf = mediaTypeOf('component_pdf')!;
		expect(pdf.managedExtensions).toContain('jpg');
		expect(pdf.allowedExtensions).not.toContain('jpg');
	});
});

// ---------------------------------------------------------------------------
// 5. The model-capability census is total and exact
// ---------------------------------------------------------------------------

describe('alternate twins: the model-capability census', () => {
	test('the two maps are exact complements over the five component_* models', () => {
		expect(Object.keys(ALTERNATE_BUILDER_BY_MODEL).sort()).toEqual([...MEDIA_MODELS]);
		expect(Object.keys(NO_ALTERNATE_BUILDER_REASON).sort()).toEqual([...MEDIA_MODELS]);
		for (const model of MEDIA_MODELS) {
			const builder = ALTERNATE_BUILDER_BY_MODEL[model];
			const reason = NO_ALTERNATE_BUILDER_REASON[model];
			expect(
				[model, builder === null, reason === null],
				`${model} is in BOTH halves of the census, or in neither. Adding a builder means MOVING the model from NO_ALTERNATE_BUILDER_REASON to ALTERNATE_BUILDER_BY_MODEL — a model with a builder and a "why not" reads as an engine that cannot decide what it can do, and mediaTypeOf would filter on one while the boot log printed the other`,
			).toEqual([model, reason !== null, builder !== null]);
		}
	});

	test('THE KEYS INTERSECT THE DISPATCH KEY SPACE — they are models, not folders', () => {
		// The census is only a census if it is keyed on what mediaTypeOf dispatches
		// on. Keyed on the type-FOLDER names ('image', 'av', 'pdf', 'svg', '3d') it
		// would look complete and never meet a single model: every lookup would miss,
		// every model would silently read as "has a builder", and the filter would
		// stop filtering. So this asserts the intersection rather than assuming it.
		for (const key of Object.keys(ALTERNATE_BUILDER_BY_MODEL)) {
			const spec = mediaTypeOf(key);
			expect([key, spec === null]).toEqual([key, false]);
			expect([key, spec!.model]).toEqual([key, key]);
		}
		// …and the folder names really are the OTHER key space (they resolve to
		// nothing), which is what makes the check above meaningful.
		for (const folder of ['image', 'av', 'pdf', 'svg', '3d']) {
			expect([folder, mediaTypeOf(folder)]).toEqual([folder, null]);
		}
	});

	test('every declared builder names a real exported function in a real file', () => {
		const named = Object.entries(ALTERNATE_BUILDER_BY_MODEL).filter(
			([, builder]) => builder !== null,
		);
		// Positive control: the census must claim at least one builder, or invariant
		// 4 above is asserting a write site the census says does not exist.
		expect(named.length).toBeGreaterThan(0);
		for (const [model, builder] of named) {
			const match = /^([A-Za-z0-9_]+)\s+\((.+)\)$/.exec(builder as string);
			expect(
				[model, match === null],
				`${model}'s builder must read '<functionName> (<path under src/>)' so the census points AT the code instead of describing it — got '${String(builder)}'`,
			).toEqual([model, false]);
			const [, fn, path] = match as RegExpExecArray;
			const file = join(ROOT, 'src', path as string);
			expect([model, path, existsSync(file)]).toEqual([model, path, true]);
			const code = stripComments(readFileSync(file, 'utf-8'));
			expect(
				[model, fn, new RegExp(`export\\s+(?:async\\s+)?function\\s+${fn}\\b`).test(code)],
				`${model}'s census names ${String(fn)} in ${String(path)}, and that file does not export it — a census entry that has outlived its function is worse than none: it reports a capability nothing provides`,
			).toEqual([model, fn, true]);
		}
	});

	test('every refusal carries a substantive reason that names the code', () => {
		const refused = Object.entries(NO_ALTERNATE_BUILDER_REASON).filter(
			([, reason]) => reason !== null,
		);
		// Positive control: the refusal half is populated too — three models really
		// have no builder, and this is the text the operator meets in the boot log.
		expect(refused.length).toBeGreaterThan(0);
		for (const [model, reason] of refused) {
			const text = reason as string;
			expect(
				[model, text.length > 80],
				`${model}'s refusal reason must say WHAT WOULD HAVE TO CHANGE, not merely "unsupported": the operator reads it beside their own config key and has no other way to learn why the format they asked for is not being written`,
			).toEqual([model, true]);
			// It names a file the reader can open — a reason nobody can follow up is
			// the same dead end as no reason.
			expect([model, /\.ts\b/.test(text)]).toEqual([model, true]);
			// And the model it refuses really advertises nothing.
			expect([model, mediaTypeOf(model)!.alternateExtensions]).toEqual([model, []]);
		}
	});
});

// ---------------------------------------------------------------------------
// 7. The per-file rotation background is not defeated by its only caller
// ---------------------------------------------------------------------------

describe('alternate twins: the rotation seam keeps the per-file background', () => {
	test("the rotation handler READS the operator's transparency flag", () => {
		// MEASURED on the tree that shipped D10: `rotation.ts` resolved the background
		// per file, and `tool_image_rotation`'s handler passed
		// `background_color ?? '#ffffff'` — while the client ALWAYS sends
		// `background_color` (a colour picker that defaults to white) and ALSO sends an
		// `alpha` checkbox the server read NOWHERE. So the new rule was dead code from
		// the only tool that reaches it, and the flag the operator actually ticks was
		// discarded: config read but never honoured, one layer up from the key this
		// tripwire is named after.
		const code = readCode(ROTATION_HANDLER);
		expect(
			/\balpha\b/.test(code),
			`${ROTATION_HANDLER} does not read the client's 'alpha' (Transparent) flag. It is sent on every apply_rotation call, and it is what tells the engine whether the corners a rotation EXPOSES should be filled with the picker's colour or left to each file (transparent on an alpha twin, white on its jpg companion)`,
		).toBe(true);
		expect(
			/background:\s*'#|background:\s*"#/.test(code),
			`${ROTATION_HANDLER} pins a literal background colour, which overrides rotation.ts's per-file rule for every file of the tier — including the alpha twin whose whole reason to exist is the transparency a background removal produced`,
		).toBe(false);
	});

	test('rotation.ts really resolves it per file (positive control)', () => {
		// Without this the assertion above is satisfied by a rotation seam that has no
		// per-file rule left to defeat.
		const body = functionBody(
			readCode('src/core/media/tools/rotation.ts'),
			'export async function applyRotationCore(',
			'src/core/media/tools/rotation.ts',
		);
		expect(body).toMatch(/backgroundForTarget\s*\(/);
		expect(body).toMatch(/options\.background === undefined/);
	});
});

// ---------------------------------------------------------------------------
// Scan self-test — a gate over an empty file set passes vacuously
// ---------------------------------------------------------------------------

describe('alternate twins: the scan itself', () => {
	test('the scan sees the media tree and every named file', () => {
		const files = scannedFiles();
		expect(files.length).toBeGreaterThan(20);
		for (const file of [MEDIA_CONTRACT, PROCESSING, FILES_INFO, ...TWIN_RETIRING_MODULES]) {
			expect(files).toContain(file);
		}
	});

	test('comment stripping removes prose but keeps code', () => {
		const stripped = stripComments(
			[
				'// config.media.image.alternateExtensions',
				'/* rmSync(twin) */',
				'const a = spec.alternateExtensions;',
			].join('\n'),
		);
		expect(stripped).not.toMatch(RAW_CONFIG_READ);
		expect(stripped).not.toMatch(HARD_DELETE);
		expect(stripped).toMatch(ALTERNATE_LIST);
	});
});
