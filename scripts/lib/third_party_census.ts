/**
 * THIRD-PARTY BYTE CENSUS — the ONE derivation of "which committed files LOOK
 * like third-party code", behind the committed arm of
 * test/unit/dependency_integrity_tripwire.test.ts.
 *
 * WHY THIS EXISTS (P2-5-residue: CLI-12, PUB-12, 2026-09-04). The committed arm
 * of the integrity gate used to be `vendor/` ↔ `vendor_manifest.json` and nothing
 * else — so a third-party bundle committed ANYWHERE ELSE was outside every axis
 * the manifest enforces (digest, version binding, advisories, licence). There
 * were seven: a byte-identical @huggingface/transformers dist under
 * tools/tool_lang/**, EasyQRCodeJS twice under tools/tool_qr/lib/, client-zip
 * under tools/tool_export/js/lib/, lz-string and a dead findAndReplaceDOMText UMD
 * under client/**, and a 16 MB swagger-ui-dist 4.5.2 under publication/. Nobody
 * had listed them because the census was a directory, not a question asked of the
 * tree. This module asks the question of the tree — and the first run found the
 * seventh, which no audit had.
 *
 * ── WHAT IS SCANNED ─────────────────────────────────────────────────────────
 * Every git-TRACKED `.js` / `.mjs` / `.cjs` / `.css` / `.less` file under
 * `SCAN_ROOTS` — the trees that ship to a browser or an installation: the client,
 * the tools, the publication subsystem, the vendored trees themselves, the
 * installer and the deploy stacks — PLUS every tracked MODEL ARTIFACT under the
 * same roots: a compiled-model extension (`MODEL_ARTIFACT_EXTENSIONS`) or a
 * Hugging Face model-card file (`MODEL_CARD_BASENAMES`, and a `config.json`
 * that declares a `model_type`). Code is not the only third-party byte: the
 * second run of this census (the reviewer's, 2026-09-04) found 20 MB of a
 * Google TranslateGemma tokenizer committed under tools/tool_lang/** — served
 * to browsers from the tools tree instead of the install's model store, under
 * terms that are not in the closed licence set, with no digest and no row. A
 * model belongs in the store (`src/core/ai/model_store.ts`, pinned by
 * `model_pins.json`), never in the code tree. `src/` and `scripts/` are TypeScript the
 * engine runs and are not third-party carriers (a `.ts` file that embeds a
 * library would be a dependency, which the lockfile arm covers); `test/` is
 * gates. Discovery is `git ls-files`, never a directory walk: the question is
 * about COMMITTED bytes, and an untracked file is a local accident the
 * integrity manifest has no business hashing. node_modules is never tracked, so
 * it never appears.
 *
 * ── WHAT IS A HIT ───────────────────────────────────────────────────────────
 * A file is a HIT when it carries at least one third-party SIGNATURE and no
 * first-party MARKER. The signatures are the shapes a redistributed bundle wears
 * and hand-written source does not:
 *   minified name     `.min.` / `-min.` in the basename
 *   minified line     a line over MINIFIED_LINE_LENGTH characters
 *   preserved banner  a `/*!` comment (the minifier-preserved licence banner)
 *   source map        a `sourceMappingURL=` pointer (build output, not source)
 *   foreign copyright a copyright/licence notice in the head of the file that
 *                     names neither Dédalo nor its AGPL tag
 *   model artifact    a compiled-model / wasm extension (always a hit — there is
 *                     no first-party shape for a .onnx), or a model-card file
 *                     (`tokenizer.json`, `generation_config.json`, a
 *                     `config.json` with a `model_type`…)
 * The markers are the shapes ONLY first-party code wears here:
 *   agpl banner       the LibreJS `@license magnet:…agpl-3.0.txt` line every
 *                     first-party client file opens with
 *   built from less   a `.css` whose stem (minus `-min`/`.min`) has a `.less`
 *                     source beside it or one directory up (the `css/dist/`
 *                     layout) — the CSS build output committed because deploy
 *                     is a checkout (.gitattributes), which inherits a
 *                     sourceMappingURL pointer and long lines from the build
 * A marker beats a signature: a first-party file that happens to be minified is
 * not a redistributed dependency.
 *
 * ── WHAT THE GATE DOES WITH A HIT ───────────────────────────────────────────
 * Every hit must lie under a manifest row's root (`vendor/<id>` or the row's
 * explicit `root`), or be an ENUMERATED exemption below with a per-file reason.
 * The exemption list is shrink-only and every entry is re-proved (the file
 * exists, is still a hit, is still not under a root) so a stale entry is red.
 *
 * ── HONEST LIMITS ───────────────────────────────────────────────────────────
 *  - A third-party file that is pretty-printed, unbannered, unmapped and carries
 *    no copyright line is invisible to the signatures. That is the shape a
 *    hand-pasted snippet has, and no lexical census can tell it from source; the
 *    positive control in the gate proves the signatures, not omniscience.
 *  - `.less` partials are scanned so an inlined stylesheet (normalize.css inside
 *    reset.less) is SEEN, but such a partial is not a servable tree and cannot be
 *    a manifest row — it is an exemption with its licence in the reason.
 *  - Binary assets other than model artifacts (fonts, images) are out of scope:
 *    they are not code, and the vendored ones sit under a row's root and are
 *    hashed there. A model artifact under an unlisted extension (a bare
 *    `.bin`) is invisible until the extension list grows — the list is the
 *    claim, the positive control proves it.
 *
 * HERMETIC: `git ls-files` + filesystem reads of tracked files. No DB, no
 * network, no clock; imports nothing from src/. Deterministic: repo-relative
 * forward-slash paths in codepoint order.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Repo root (this file lives at scripts/lib/third_party_census.ts). */
export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The scanned trees, repo-relative — every tree whose bytes ship to a browser or an installation. */
export const SCAN_ROOTS = [
	'client',
	'deploy',
	'install',
	'publication',
	'tools',
	'vendor',
] as const;

/** The extensions a third-party bundle can wear. */
export const SCAN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.css', '.less'] as const;

/**
 * Compiled-model / runtime-binary extensions: a tracked file wearing one is a
 * hit on its name alone, never read as text.
 */
export const MODEL_ARTIFACT_EXTENSIONS = [
	'.onnx',
	'.safetensors',
	'.gguf',
	'.pt',
	'.pth',
	'.tflite',
	'.h5',
	'.ckpt',
	'.msgpack',
	'.wasm',
] as const;

/** Hugging Face model-card files: a tracked file with one of these basenames is a hit. */
export const MODEL_CARD_BASENAMES = [
	'tokenizer.json',
	'tokenizer_config.json',
	'generation_config.json',
	'preprocessor_config.json',
	'special_tokens_map.json',
	'vocab.json',
	'merges.txt',
] as const;

/** A `config.json` is a model card when it declares what kind of model it configures. */
const MODEL_CONFIG_KEYS = /"(model_type|transformers_version|architectures)"\s*:/;

/** A line longer than this is a minifier's, not a person's. */
export const MINIFIED_LINE_LENGTH = 1000;

/** How far into a file the copyright/licence head is looked for. */
const HEAD_BYTES = 4000;

/** The LibreJS tag every first-party client file opens with. */
const AGPL_MAGNET = 'magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt';

export type ThirdPartySignature =
	| 'minified name'
	| 'minified line'
	| 'preserved banner'
	| 'source map'
	| 'foreign copyright'
	| 'model artifact';

export interface ThirdPartyHit {
	/** Repo-relative POSIX path. */
	file: string;
	signatures: ThirdPartySignature[];
}

export interface ThirdPartyCensus {
	/** Every file the scan read, repo-relative, sorted. */
	scanned: string[];
	/** The files that look third-party and carry no first-party marker, sorted. */
	hits: ThirdPartyHit[];
	/** Files that carried a signature but also a marker, with the marker — for the report. */
	markedFirstParty: { file: string; marker: string }[];
}

/** An ENUMERATED exemption: a hit that is deliberately NOT under a manifest root, with its reason. */
export interface ThirdPartyExemption {
	file: string;
	reason: string;
}

/**
 * THE EXEMPTIONS. Shrink-only: every entry is a file the census flags, that is
 * not under any manifest root, and that a human has decided is not a
 * redistributed tree — with the reason and the licence written here. The gate
 * re-proves each entry every run and refuses a stale one.
 */
export const THIRD_PARTY_EXEMPTIONS: readonly ThirdPartyExemption[] = [
	{
		file: 'client/dedalo/core/page/css/layout/reset.less',
		reason:
			'normalize.css v8.0.1 (MIT, github.com/necolas/normalize.css) inlined as a LESS partial of the first-party stylesheet build, its `/*!` MIT banner kept verbatim. A stylesheet reset, not executable code, and a partial — not a servable tree a manifest row could hash; the MIT terms are the banner itself.',
	},
	{
		file: 'client/dedalo/core/services/service_ckeditor/plug-ins/reference/theme/link.css',
		reason:
			"The 416-byte theme stub of the bespoke `reference` CKEditor 5 plugin, kept from CKSource's plugin scaffold with its header (`For licensing, see LICENSE.md` — GPL-2.0-or-later, the same terms as vendor/ckeditor, whose bundle this plugin's source is compiled into). Plugin SOURCE, not a redistributed tree. (The plugin's .js sources carry the same scaffold header but name Dédalo in their own docblocks, so the census reads them as first-party; this stub is the one file of the plugin that says nothing about itself.)",
	},
];

/** Every git-tracked file under the roots with a scanned extension, repo-relative, sorted. */
export function listCensusFiles(): string[] {
	const result = Bun.spawnSync(['git', 'ls-files', '--', ...SCAN_ROOTS], {
		cwd: REPO_ROOT,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (result.exitCode !== 0) {
		throw new Error(`third_party_census: git ls-files failed: ${result.stderr.toString()}`);
	}
	// THE SUBJECT IS THE WORKING TREE, consistently: a tracked file's bytes are read
	// from disk (a local edit is judged as edited, not as committed), so a tracked
	// path deleted from disk is judged as deleted — skipped, not crashed on. The
	// COMMITTED answer is the one CI gives: it runs on a clean checkout, where the
	// working tree IS the commit, so a deletion that never reaches the commit
	// cannot hide there (nor can an edit that never reaches it).
	return result.stdout
		.toString()
		.split('\n')
		.filter((line) => line.trim() !== '')
		.filter((line) => isScannedPath(line))
		.filter((line) => existsSync(join(REPO_ROOT, line)))
		.sort();
}

/** True when a tracked path is part of the census: a code extension, a model artifact, or a model-card file. */
export function isScannedPath(file: string): boolean {
	return (
		SCAN_EXTENSIONS.some((ext) => file.endsWith(ext)) ||
		isModelArtifactPath(file) ||
		isModelCardPath(file)
	);
}

/** True when `file` wears a compiled-model / runtime-binary extension. */
export function isModelArtifactPath(file: string): boolean {
	return MODEL_ARTIFACT_EXTENSIONS.some((ext) => file.endsWith(ext));
}

/** True when `file` is named like a Hugging Face model-card file (a `config.json` needs its text to decide). */
export function isModelCardPath(file: string): boolean {
	const name = basename(file);
	return (MODEL_CARD_BASENAMES as readonly string[]).includes(name) || name === 'config.json';
}

/** The third-party signatures `text` (at `file`) wears. Pure. */
export function thirdPartySignatures(file: string, text: string): ThirdPartySignature[] {
	const out: ThirdPartySignature[] = [];
	// A model artifact is a hit on its name; a model-card file on its name or, for
	// the generic `config.json`, on the keys a Hugging Face model config carries.
	if (isModelArtifactPath(file)) return ['model artifact'];
	if (isModelCardPath(file)) {
		const isCard =
			basename(file) !== 'config.json' ? true : MODEL_CONFIG_KEYS.test(text.slice(0, HEAD_BYTES));
		return isCard ? ['model artifact'] : [];
	}
	if (/[.-]min\.(js|mjs|cjs|css)$/.test(basename(file))) out.push('minified name');
	let longest = 0;
	let start = 0;
	for (let i = 0; i <= text.length; i++) {
		if (i === text.length || text.charCodeAt(i) === 10) {
			if (i - start > longest) longest = i - start;
			start = i + 1;
			if (longest > MINIFIED_LINE_LENGTH) break;
		}
	}
	if (longest > MINIFIED_LINE_LENGTH) out.push('minified line');
	if (/^[ \t]*\/\*!/m.test(text)) out.push('preserved banner');
	if (/sourceMappingURL=/.test(text)) out.push('source map');
	// The head minus the first-party AGPL tag line: that line is itself an
	// `@license`, and it must not make every first-party file wear the signature
	// (the marker would still win, but the census report would be noise).
	const head = text
		.slice(0, HEAD_BYTES)
		.split('\n')
		.filter((line) => !line.includes(AGPL_MAGNET))
		.join('\n');
	if (/copyright|\(c\)\s*\d{4}|©|@license/i.test(head) && !/d[ée]dalo/i.test(head)) {
		out.push('foreign copyright');
	}
	return out;
}

/**
 * The first-party marker `text` (at `file`) carries, or null. Pure apart from
 * the `lessExists` probe, injected so the gate can prove the rule on a scratch
 * tree.
 */
export function firstPartyMarker(
	file: string,
	text: string,
	lessExists: (candidate: string) => boolean = (candidate) =>
		existsSync(join(REPO_ROOT, candidate)),
): string | null {
	if (text.slice(0, HEAD_BYTES).includes(AGPL_MAGNET)) return 'agpl banner';
	if (file.endsWith('.css')) {
		const stem = basename(file, '.css').replace(/[.-]min$/, '');
		const dir = dirname(file);
		for (const candidate of [join(dir, `${stem}.less`), join(dirname(dir), `${stem}.less`)]) {
			if (lessExists(candidate)) return `built from ${candidate}`;
		}
	}
	return null;
}

/** The census over the tracked tree (or over the given files, for a scratch corpus). */
export function thirdPartyCensus(files: string[] = listCensusFiles()): ThirdPartyCensus {
	const hits: ThirdPartyHit[] = [];
	const markedFirstParty: { file: string; marker: string }[] = [];
	for (const file of files) {
		// A binary artifact is never read: its name is the whole verdict.
		const text = isModelArtifactPath(file) ? '' : readFileSync(join(REPO_ROOT, file), 'utf8');
		const signatures = thirdPartySignatures(file, text);
		if (signatures.length === 0) continue;
		const marker = firstPartyMarker(file, text);
		if (marker !== null) {
			markedFirstParty.push({ file, marker });
			continue;
		}
		hits.push({ file, signatures });
	}
	return { scanned: files, hits, markedFirstParty };
}

/** True when `file` lies under `root` (repo-relative POSIX paths). */
export function isUnderRoot(file: string, root: string): boolean {
	return file === root || file.startsWith(`${root}/`);
}
