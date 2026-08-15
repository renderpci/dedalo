/**
 * CLIENT COMPAT-READ CENSUS — the ONE counting implementation behind the
 * client_error_contract_tripwire (test/unit/client_error_contract_tripwire.test.ts)
 * and its baseline generator (scripts/client_compat_baseline.ts). Neither
 * computes anything on its own: the number the gate enforces must be, by
 * construction, the number the generator wrote (the throw_census.ts law).
 *
 * ── WHAT IS COUNTED ─────────────────────────────────────────────────────────
 * Property READS of the envelope-v2 COMPAT keys — `.msg`, `.errors`, `.result`
 * (engineering/ERRORS_SPEC.md §3.1: the bounded block `ERROR_ENVELOPE_COMPAT`
 * mirrors `data`→`result` and `error`→`result:false/msg/errors[code]` ONLY
 * while a client still reads those names). The token is `\.(msg|errors|result)\b`
 * in CODE: comments AND string/template contents are blanked first (a doc line
 * or a label mentioning `.msg` is not a read). `\b` after the key already
 * excludes `.result_options` / `.result_id` (`_` is a word char), and a line
 * that mentions `page_globals` is skipped (page_globals is the client's own
 * state object, never a wire envelope). It is a TOKEN count, deliberately: a
 * write `.msg = …` counts too — a client that still WRITES the compat name is
 * still living on it, and the removal condition is "the name is gone".
 *
 * ── WHAT IS SCANNED ─────────────────────────────────────────────────────────
 * `client/dedalo/**\/*.js` minus `client/dedalo/test/**` (the browser test
 * suite fakes envelopes on purpose), plus `tools/*\/js/**\/*.js`. Discovery is
 * `Glob().scanSync()` (dot + followSymlinks + loud on a dangling link), every
 * file read with `readFileSync` — NEVER a shell-out to grep. `*-min.js` build
 * artefacts are excluded (their source twin is counted).
 *
 * ── THE TWO REGIMES ─────────────────────────────────────────────────────────
 * total > 0  → shrink-only ratchet against engineering/client_compat_read_baseline.json;
 * total = 0  → the compat block must be GONE (`ERROR_ENVELOPE_COMPAT` absent from
 *              convert.ts, `compatFields` absent from schema.ts) — the gate flips
 *              on the baseline's `summary.total`, no edit needed (P4 exit).
 *
 * HERMETIC: tracked-source reads only. No DB, no network, no clock; imports
 * nothing from src/.
 */

import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Glob } from 'bun';
import { stripComments } from '../../test/helpers/strip_comments.ts';

/** Repo root (this file lives at scripts/lib/client_compat_census.ts). */
export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The scanned trees, repo-relative: `{root, glob}` pairs. */
export const SCAN_ROOTS = [
	{ root: 'client/dedalo', glob: '**/*.js' },
	{ root: 'tools', glob: '*/js/**/*.js' },
] as const;

/** Excluded PATH PREFIXES (repo-relative) — the browser test suite fakes envelopes on purpose. */
export const EXCLUDED_PREFIXES = ['client/dedalo/test/'] as const;

/** Excluded by SHAPE: minified build twins (their source is counted) and vendored code. */
export const EXCLUDED_SUFFIXES = ['-min.js', '.min.js'] as const;
export const EXCLUDED_SEGMENTS = ['dist', 'node_modules', 'vendor'] as const;

/** The compat keys (ERRORS_SPEC §3.1) — the ONE place they are named for counting. */
export const COMPAT_KEYS = ['msg', 'errors', 'result'] as const;

/** `.msg` / `.errors` / `.result` as a whole word (`.result_options` is NOT a match). */
export const COMPAT_READ = /\.(msg|errors|result)\b/g;

/** A line naming the client's own state object is never a wire read. */
const LINE_EXCLUSION = /page_globals/;

export interface FileCompatReads {
	/** Repo-relative, forward slashes. */
	file: string;
	/** Compat-key reads in code (comments/strings blanked, page_globals lines skipped). */
	reads: number;
	/** Per-key breakdown of `reads` (informational). */
	byKey: Record<(typeof COMPAT_KEYS)[number], number>;
}

/** Count the compat reads in one source text. Pure; exported so it can be self-tested. */
export function countCompatReads(source: string): {
	reads: number;
	byKey: FileCompatReads['byKey'];
} {
	const code = stripComments(source, { blankStrings: true });
	const byKey: FileCompatReads['byKey'] = { msg: 0, errors: 0, result: 0 };
	let reads = 0;
	for (const line of code.split('\n')) {
		if (LINE_EXCLUSION.test(line)) continue;
		for (const match of line.matchAll(COMPAT_READ)) {
			const key = match[1] as (typeof COMPAT_KEYS)[number];
			byKey[key]++;
			reads++;
		}
	}
	return { reads, byKey };
}

/** Repo-relative, forward-slash path — stable across machines. */
export function toRepoRelative(absPath: string): string {
	return relative(REPO_ROOT, absPath).split(sep).join('/');
}

/** Codepoint order — NOT localeCompare (ICU would reorder `/` and `_`). */
export function byPath(a: { file: string }, b: { file: string }): number {
	return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
}

const SCAN_OPTIONS = {
	dot: true,
	followSymlinks: true,
	throwErrorOnBrokenSymlink: true,
} as const;

/** True for the repo-relative paths the census measures. */
export function isMeasured(repoRelative: string): boolean {
	if (!repoRelative.endsWith('.js')) return false;
	if (EXCLUDED_PREFIXES.some((prefix) => repoRelative.startsWith(prefix))) return false;
	if (EXCLUDED_SUFFIXES.some((suffix) => repoRelative.endsWith(suffix))) return false;
	const segments = repoRelative.split('/');
	return !segments.some((segment) => (EXCLUDED_SEGMENTS as readonly string[]).includes(segment));
}

/** Every measured file under the scan roots, repo-relative, codepoint-sorted, deduplicated. */
export function discoverFiles(): string[] {
	const seen = new Set<string>();
	for (const { root, glob } of SCAN_ROOTS) {
		const absRoot = join(REPO_ROOT, root);
		for (const match of new Glob(glob).scanSync({ cwd: absRoot, ...SCAN_OPTIONS })) {
			const repoRelative = `${root}/${match.split(sep).join('/')}`;
			if (isMeasured(repoRelative)) seen.add(repoRelative);
		}
	}
	return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The census: one entry per measured file (zero-count files included, so the
 * gate can pin files by name and prove the scan saw them). An unreadable file
 * THROWS — a skipped file is a file outside the gate.
 */
export function census(): FileCompatReads[] {
	return discoverFiles().map((file) => {
		const source = readFileSync(join(REPO_ROOT, file), 'utf8');
		return { file, ...countCompatReads(source) };
	});
}

/** Aggregate totals — the SAME reduce the baseline summary and the gate use. */
export function summarize(results: readonly FileCompatReads[]): {
	scanned: number;
	files: number;
	total: number;
	byKey: FileCompatReads['byKey'];
} {
	let files = 0;
	let total = 0;
	const byKey: FileCompatReads['byKey'] = { msg: 0, errors: 0, result: 0 };
	for (const result of results) {
		if (result.reads > 0) files++;
		total += result.reads;
		for (const key of COMPAT_KEYS) byKey[key] += result.byKey[key];
	}
	return { scanned: results.length, files, total, byKey };
}

/** Read totals keyed by top-level area (`client/dedalo/core`, `tools/<name>`, …). */
export function totalsByTopLevel(results: readonly FileCompatReads[]): Record<string, number> {
	const totals: Record<string, number> = {};
	for (const result of results) {
		const parts = result.file.split('/');
		const key = parts[0] === 'tools' ? `tools/${parts[1]}` : parts.slice(0, 3).join('/');
		totals[key] = (totals[key] ?? 0) + result.reads;
	}
	return Object.fromEntries(
		Object.entries(totals).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);
}
