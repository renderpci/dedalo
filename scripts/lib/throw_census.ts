/**
 * UNTYPED-THROW CENSUS — the ONE counting implementation behind the
 * error_throw_ratchet (test/unit/error_throw_ratchet.test.ts) and its baseline
 * generator (scripts/error_throw_baseline.ts). Neither computes anything on its
 * own: the number the gate enforces must be, by construction, the number the
 * generator wrote, so a second implementation of this count anywhere would make
 * the ratchet worthless.
 *
 * ── WHAT IS COUNTED ─────────────────────────────────────────────────────────
 *  - `untyped`  — occurrences of the literal token `throw new Error(` in CODE:
 *    comments AND string/template contents are blanked first (the shared
 *    scanner in test/helpers/strip_comments.ts, `blankStrings: true`), so a
 *    header that explains the ban, or a message that mentions the token, is
 *    never a count. This is the number the ratchet freezes.
 *  - `builtin`  — `throw new TypeError(` + `throw new RangeError(`. Recorded
 *    per file and INFORMATIONAL only (the error-taxonomy plan treats builtin
 *    throws as engine-invariant signals that a converter maps, not as debt to
 *    burn down here). Not baselined, not asserted.
 *
 * It is a TOKEN count, deliberately: `throw new Error(` is the exact shape the
 * error-taxonomy plan (decision 4, "middle") retires — every NON-internal throw
 * gets a registered code, internal ones stay under this shrink-only ratchet.
 * `throw new DedaloError(...)` / `throw codeError(...)` are the typed
 * replacements and are NOT counted; `throw err` re-throws are not counted;
 * `new Error(` without `throw` (a stored/returned error) is not counted.
 * Whitespace inside the token is normalised (`throw  new Error (`) so a
 * formatter cannot move a site out of the census.
 *
 * ── WHAT IS SCANNED ─────────────────────────────────────────────────────────
 * `src/**\/*.ts` and `tools/**\/*.ts`, minus `*.test.ts`, `*.d.ts`, and
 * anything under a `dist/` or `node_modules/` segment. Discovery is Bun's
 * `Glob().scanSync()` with `dot` + `followSymlinks` (this repo has a symlink
 * culture and a file the glob never returns is a file outside the gate), and
 * every file is read with `readFileSync(f, 'utf8')` — NEVER a shell-out to
 * grep. Three files in this tree contain bytes grep classifies as binary
 * (src/core/media/ingest/upload.ts, src/core/identify/match.ts,
 * src/core/search/bare_count.ts) and a grep-based census silently drops them;
 * the gate pins those three by name for exactly that reason.
 *
 * HERMETIC: filesystem reads of tracked source only. No DB, no network, no
 * clock; imports nothing from src/, so the config catalog is never loaded.
 * Deterministic: repo-relative forward-slash paths in codepoint order.
 */

import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { Glob } from 'bun';
import { stripComments } from '../../test/helpers/strip_comments.ts';

/** Repo root (this file lives at scripts/lib/throw_census.ts). */
export const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The scanned trees, repo-relative. Both the engine and the tools subsystem. */
export const SCAN_ROOTS = ['src', 'tools'] as const;

/** The ONE extension counted. */
export const MEASURED_EXTENSION = '.ts';

/** Excluded by SHAPE inside the roots (never by name). */
export const EXCLUDED_SUFFIXES = ['.test.ts', '.d.ts'] as const;

/** Excluded PATH SEGMENTS — build output and vendored code are not source. */
export const EXCLUDED_SEGMENTS = ['dist', 'node_modules'] as const;

/**
 * The zero-tier: directories (and one file) that the error-taxonomy plan §3 P3
 * requires to reach ZERO untyped throws — the request chokepoints, the security
 * layer, the tools dispatch, the write path, the DB layer, and the section_id
 * grammar. Prefix match on the repo-relative path (a trailing `/` marks a
 * directory; a bare file path matches exactly that file). Exported so the
 * gate, the generator's `--report`, and the future error_taxonomy_tripwire
 * share ONE list.
 */
export const ZERO_TIER = [
	'src/core/api/',
	'src/core/security/',
	'src/core/tools/',
	'tools/',
	'src/core/section/record/',
	'src/core/db/',
	'src/core/concepts/section_id.ts',
] as const;

/**
 * Whether the zero-tier is ENFORCED at 0 by the ratchet.
 *
 * P0 (2026-08-15): false — the zero-tier still holds untyped throws (the gate
 * REPORTS the per-prefix totals, informational). P3 EXIT CRITERION (plan §3):
 * flip to `true` in the same commit that lands the last zero-tier burn-down
 * commit (the serialized `db/matrix_write.ts` + `section/record/**` +
 * `relations/save.ts` batch with its `*_write_failure_native` gates); the
 * enforced test then fails on ANY untyped throw under a ZERO_TIER prefix, no
 * baseline entry can excuse it, and the baseline generator refuses to write an
 * entry for a zero-tier file.
 */
export const ZERO_TIER_ENFORCED = false;

/** Whitespace-tolerant shapes of the counted tokens. */
const UNTYPED_THROW = /\bthrow\s+new\s+Error\s*\(/g;
const BUILTIN_THROW = /\bthrow\s+new\s+(?:TypeError|RangeError)\s*\(/g;

export interface FileThrows {
	/** Repo-relative, forward slashes. */
	file: string;
	/** `throw new Error(` sites in code (comments/strings blanked). THE metric. */
	untyped: number;
	/** `throw new TypeError(` + `throw new RangeError(` sites. Informational. */
	builtin: number;
}

/** Count both metrics in one source text. Pure; exported so it can be unit-tested. */
export function countThrows(source: string): { untyped: number; builtin: number } {
	const code = stripComments(source, { blankStrings: true });
	return {
		untyped: (code.match(UNTYPED_THROW) ?? []).length,
		builtin: (code.match(BUILTIN_THROW) ?? []).length,
	};
}

/** Repo-relative, forward-slash path — stable across machines. */
export function toRepoRelative(absPath: string): string {
	return relative(REPO_ROOT, absPath).split(sep).join('/');
}

/**
 * Codepoint order — NOT `localeCompare` (ICU collation ignores `/` and `_` at
 * the primary level and would reorder the baseline under a different ICU).
 */
export function byPath(a: { file: string }, b: { file: string }): number {
	return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
}

/**
 * Glob options — load-bearing for "no silent skips": `dot` reaches into
 * dot-directories, `followSymlinks` through symlinked files AND directories,
 * and a dangling link is loud rather than dropped.
 */
const SCAN_OPTIONS = {
	dot: true,
	followSymlinks: true,
	throwErrorOnBrokenSymlink: true,
} as const;

/** True for the repo-relative paths the census measures. */
export function isMeasured(repoRelative: string): boolean {
	if (!repoRelative.endsWith(MEASURED_EXTENSION)) return false;
	if (EXCLUDED_SUFFIXES.some((suffix) => repoRelative.endsWith(suffix))) return false;
	const segments = repoRelative.split('/');
	return !segments.some((segment) => (EXCLUDED_SEGMENTS as readonly string[]).includes(segment));
}

/** Every measured file under the scan roots, repo-relative, codepoint-sorted, deduplicated. */
export function discoverFiles(): string[] {
	const seen = new Set<string>();
	for (const root of SCAN_ROOTS) {
		const absRoot = join(REPO_ROOT, root);
		const glob = new Glob(`**/*${MEASURED_EXTENSION}`);
		for (const match of glob.scanSync({ cwd: absRoot, ...SCAN_OPTIONS })) {
			const repoRelative = `${root}/${match.split(sep).join('/')}`;
			if (isMeasured(repoRelative)) seen.add(repoRelative);
		}
	}
	return [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The census: one entry per measured file (including zero-count files, so the
 * gate can pin files by name and prove the scan saw them). An unreadable file
 * THROWS — never skipped, a skipped file is a file outside the gate.
 */
export function census(): FileThrows[] {
	return discoverFiles().map((file) => {
		const source = readFileSync(join(REPO_ROOT, file), 'utf8');
		return { file, ...countThrows(source) };
	});
}

/** Aggregate totals — the SAME reduce the baseline summary and the gate use. */
export function summarize(results: readonly FileThrows[]): {
	scanned: number;
	files: number;
	total: number;
	builtin: number;
} {
	let files = 0;
	let total = 0;
	let builtin = 0;
	for (const result of results) {
		if (result.untyped > 0) files++;
		total += result.untyped;
		builtin += result.builtin;
	}
	return { scanned: results.length, files, total, builtin };
}

/** Untyped totals keyed by top-level directory (`src/core`, `src/ai`, `tools`, …). */
export function totalsByTopLevel(results: readonly FileThrows[]): Record<string, number> {
	const totals: Record<string, number> = {};
	for (const result of results) {
		const parts = result.file.split('/');
		const key = parts[0] === 'src' ? `${parts[0]}/${parts[1]}` : (parts[0] as string);
		totals[key] = (totals[key] ?? 0) + result.untyped;
	}
	return Object.fromEntries(
		Object.entries(totals).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);
}

/** The ZERO_TIER prefix a file falls under, or null. */
export function zeroTierOf(file: string): (typeof ZERO_TIER)[number] | null {
	for (const prefix of ZERO_TIER) {
		if (prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix) return prefix;
	}
	return null;
}

/** Untyped totals per ZERO_TIER prefix (every prefix present, 0 when clean). */
export function zeroTierTotals(results: readonly FileThrows[]): Record<string, number> {
	const totals: Record<string, number> = Object.fromEntries(ZERO_TIER.map((p) => [p, 0]));
	for (const result of results) {
		const prefix = zeroTierOf(result.file);
		if (prefix !== null) totals[prefix] = (totals[prefix] ?? 0) + result.untyped;
	}
	return totals;
}
