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
 * state object, never a wire envelope), and the READ_EXCLUSIONS allowlist below
 * blanks the named NON-ENVELOPE expressions (browser APIs, server stream
 * frames, payload keys, failure extension keys), each with its reason.
 * It is a TOKEN count, deliberately: a
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

/**
 * ── THE NON-ENVELOPE ALLOWLIST ───────────────────────────────────────────────
 * `.msg` / `.errors` / `.result` are compat keys ONLY on an API envelope. The
 * same three words are also, legitimately and permanently, the names of:
 *
 *   - browser API members (`FileReader.result`);
 *   - SERVER-OWNED STREAM FRAMES, which are not envelopes (ERRORS_SPEC §5):
 *     the media/tool job frame `{pid, pfile, is_running, data:{msg,…}, errors,
 *     total_time}` and the diffusion progress chunk `{data:{msg,…}, errors,
 *     result:<the persisted job RECORD>}`;
 *   - PAYLOAD keys inside `data` — a per-file/per-record diagnostic list a
 *     handler returns beside its summary (`ok({summary, errors})`), which is a
 *     successful answer, not a failure;
 *   - NAMED FAILURE EXTENSION KEYS (ERRORS_SPEC §3.0), thrown as a
 *     `DedaloError`'s `extend` — the per-check detail behind the one sentence
 *     the dispatcher prints.
 *
 * Those reads must SURVIVE the compat block's deletion, so counting them would
 * pin the census above zero forever and the gate could never flip. Each entry
 * below names one file, the EXACT source expression it excuses (matched
 * literally, so it cannot silently widen), and WHY that expression is not an
 * envelope read. Entries are data, printed by the tripwire; an entry that
 * matches nothing is a GATE FAILURE (see the tripwire's staleness test), so a
 * conversion cannot leave a stale excuse behind.
 */
export interface ReadExclusion {
	/** Repo-relative path, forward slashes. */
	readonly file: string;
	/** The exact expression, matched as a literal substring of the code. */
	readonly expression: string;
	/** One line: what this shape IS, if not an envelope compat read. */
	readonly reason: string;
}

/** The stream-frame reason, shared by every job-progress reader. */
const FRAME_REASON =
	'server-owned job STREAM FRAME (src/core/media/jobs.ts / src/diffusion/jobs/sse.ts), not an API envelope';
/** The payload reason, shared by every handler that returns a diagnostic list beside its summary. */
const PAYLOAD_REASON = 'PAYLOAD key inside `data` (a diagnostic list on a SUCCESSFUL answer)';

export const READ_EXCLUSIONS: readonly ReadExclusion[] = [
	// ── browser APIs ──────────────────────────────────────────────────────────
	{
		file: 'tools/tool_assistant/js/assistant_controller.js',
		expression: 'reader.result',
		reason: 'FileReader.result — a browser API member',
	},
	{
		file: 'tools/tool_error_report/js/render_tool_error_report.js',
		expression: 'reader.result',
		reason: 'FileReader.result — a browser API member',
	},
	// ── the browser's own captured-error buffer (a REQUEST field, never a response) ──
	{
		file: 'tools/tool_error_report/js/render_tool_error_report.js',
		expression: 'item.msg',
		reason:
			'window.dedalo_js_errors entry (the browser error buffer this tool SENDS; src/core/error_report/store.ts js_errors)',
	},
	{
		file: 'tools/tool_error_report/js/tool_error_report.js',
		expression: 'el.msg',
		reason:
			'window.dedalo_js_errors entry (the browser error buffer this tool SENDS; src/core/error_report/store.ts js_errors)',
	},
	// ── the diffusion progress chunk + its persisted job RECORD (WC-2026-08-15-diffusion-job-result-record) ──
	{
		file: 'tools/tool_diffusion/js/report_model.js',
		expression: 'sse.result',
		reason:
			'the persisted diffusion job RECORD carried by the SSE chunk (`{ok, error?, msg?, errors?…}`), not an envelope',
	},
	{
		file: 'tools/tool_diffusion/js/report_model.js',
		expression: 'record.msg',
		reason: "the job RECORD's own headline (WC-2026-08-15-diffusion-job-result-record)",
	},
	{
		file: 'tools/tool_diffusion/js/report_model.js',
		expression: 'record.errors',
		reason:
			"the job RECORD's per-record diagnostic lines — a COMPLETED run collects them (ok:true + errors ⇒ 'partial')",
	},
	{
		file: 'tools/tool_diffusion/js/report_model.js',
		expression: 'sse.data.msg',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_diffusion/js/report_model.js',
		expression: 'sse.errors',
		reason: `${FRAME_REASON} — the JOB-level error list`,
	},
	{
		file: 'tools/tool_diffusion/js/render_tool_diffusion.js',
		expression: 'sse_response?.data?.msg',
		reason: FRAME_REASON,
	},
	// ── media / background job frames ─────────────────────────────────────────
	{
		file: 'tools/tool_media_versions/js/render_tool_media_versions.js',
		expression: 'frame.errors',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_import_dedalo_csv/js/render_tool_import_dedalo_csv.js',
		expression: 'sse_response.errors',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_import_files/js/render_tool_import_files.js',
		expression: 'sse_response.errors',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_import_files/js/render_tool_import_files.js',
		expression: 'sse_response.data.msg',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_import_files/js/render_tool_import_files.js',
		expression: 'data.msg',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_propagate_component_data/js/render_tool_propagate_component_data.js',
		expression: 'sse_response.errors',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_propagate_component_data/js/render_tool_propagate_component_data.js',
		expression: 'sse_response.data.msg',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_propagate_component_data/js/render_tool_propagate_component_data.js',
		expression: 'data.msg',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_update_cache/js/render_tool_update_cache.js',
		expression: 'sse_response.data.msg',
		reason: FRAME_REASON,
	},
	{
		file: 'tools/tool_update_cache/js/render_tool_update_cache.js',
		expression: 'data.msg',
		reason: FRAME_REASON,
	},
	// ── payload keys (a diagnostic list beside the summary) ───────────────────
	{
		file: 'tools/tool_hierarchy/js/render_tool_hierarchy.js',
		expression: 'api_response_data.errors',
		reason: PAYLOAD_REASON,
	},
	{
		file: 'tools/tool_image_rotation/js/render_tool_image_rotation.js',
		expression: 'rotation_data.errors',
		reason: `${PAYLOAD_REASON} — the per-tier rotation failures (tools/tool_image_rotation/server/index.ts)`,
	},
	{
		file: 'tools/tool_import_dedalo_csv/js/render_tool_import_dedalo_csv.js',
		expression: 'report.errors',
		reason: `${PAYLOAD_REASON} — one file's read/import problems in the batch report`,
	},
	{
		file: 'tools/tool_import_dedalo_csv/js/render_tool_import_dedalo_csv.js',
		expression: 'issue.msg',
		reason:
			'a per-row import ISSUE record inside the report payload (src/core/tools/import_conform.ts)',
	},
	{
		file: 'tools/tool_import_dedalo_csv/js/tool_import_dedalo_csv.js',
		expression: 'files_data?.errors',
		reason: `${PAYLOAD_REASON} — the per-file CSV read problems (tools/tool_import_dedalo_csv/server/index.ts getCsvFiles)`,
	},
	{
		file: 'tools/tool_import_files/js/render_tool_import_files.js',
		expression: 'report.errors',
		reason: `${PAYLOAD_REASON} — the per-file import failures`,
	},
	{
		file: 'tools/tool_import_rdf/js/render_tool_import_rdf.js',
		expression: 'rdf_payload.errors',
		reason: `${PAYLOAD_REASON} — the per-URI refusals (tools/tool_import_rdf/server/index.ts getRdfData)`,
	},
	{
		file: 'tools/tool_media_versions/js/render_tool_media_versions.js',
		expression: 'data.errors',
		reason: `${PAYLOAD_REASON} — what a mutating media action reports beside what it did`,
	},
	{
		file: 'tools/tool_ontology/js/render_tool_ontology.js',
		expression: 'ontology_data.errors',
		reason: `${PAYLOAD_REASON} — the per-record notes of an ontology write`,
	},
	{
		file: 'tools/tool_propagate_component_data/js/render_tool_propagate_component_data.js',
		expression: 'report.errors',
		reason: `${PAYLOAD_REASON} — the per-record propagation failures`,
	},
	// ── named FAILURE extension keys (ERRORS_SPEC §3.0) ───────────────────────
	{
		file: 'tools/tool_hierarchy/js/render_tool_hierarchy.js',
		expression: 'api_response.errors',
		reason:
			'NAMED failure extension key (tools/tool_hierarchy/server/tool_hierarchy.ts throws `extend:{state, errors}`) — the per-check detail',
	},
	{
		file: 'tools/tool_ontology_parser/js/render_tool_ontology_parser.js',
		expression: 'api_response.errors',
		reason:
			'NAMED failure extension key (tools/tool_ontology_parser/server/tool_ontology_parser.ts batchFailed `extend:{errors, ar_msg}`) — the per-TLD detail',
	},
];

/** The exclusions declared for one file (repo-relative path). */
export function exclusionsFor(file: string): readonly ReadExclusion[] {
	return READ_EXCLUSIONS.filter((entry) => entry.file === file);
}

/**
 * Blank every allowlisted expression in `source` so the token scan cannot see
 * it, and report how many times each entry matched (0 ⇒ a stale excuse).
 */
export function applyExclusions(
	source: string,
	exclusions: readonly ReadExclusion[],
): { source: string; hits: number[] } {
	let scrubbed = source;
	const hits = exclusions.map((entry) => {
		const parts = scrubbed.split(entry.expression);
		scrubbed = parts.join(' '.repeat(entry.expression.length));
		return parts.length - 1;
	});
	return { source: scrubbed, hits };
}

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
		// The allowlisted non-envelope expressions are blanked FIRST (data +
		// reason, above): they are permanent reads that must outlive the compat
		// block, so counting them would freeze the census above zero.
		const scrubbed = applyExclusions(source, exclusionsFor(file)).source;
		return { file, ...countCompatReads(scrubbed) };
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
