/**
 * CLIENT COMPAT-READ BASELINE — generator and drift checker for the
 * client_error_contract_tripwire (test/unit/client_error_contract_tripwire.test.ts).
 *
 *   bun run scripts/client_compat_baseline.ts            # rewrite the JSON baseline (default)
 *   bun run scripts/client_compat_baseline.ts --check    # print drift, exit 1 if any
 *   bun run scripts/client_compat_baseline.ts --report   # totals per area + top files
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 * Envelope v2 (engineering/ERRORS_SPEC.md §3.1) keeps a BOUNDED compat block —
 * `result` / `msg` / `errors` mirrored beside `data` / `error` — only while the
 * client still reads those names. This file freezes today's per-file count of
 * such reads into `engineering/client_compat_read_baseline.json`; the gate then
 * forbids any file to grow, demands a re-freeze when a file shrinks (a stale
 * entry silently loosens the ratchet), caps every unlisted file at 0 — and when
 * `summary.total` reaches 0 it flips to asserting the compat block is GONE.
 *
 * ── ONE IMPLEMENTATION ───────────────────────────────────────────────────────
 * The count is scripts/lib/client_compat_census.ts and nothing else. This file
 * only shapes it into the artifact and diffs it; the gate imports both.
 *
 * ── THE ARTIFACT ─────────────────────────────────────────────────────────────
 *   { generated_by, rule, files: { <repo-relative path>: count }, summary: { files, total } }
 * `files` lists ONLY files with count > 0, keys in codepoint order (idempotent
 * bytes). `summary.files` / `summary.total` are the frozen debt; the gate
 * asserts them exactly.
 *
 * ── THE ANTI-LAUNDERING GUARD ────────────────────────────────────────────────
 * Without `--allow-regression` a regeneration REFUSES to raise an entry or add
 * a file: a new compat read is a deliberate, reviewable act with its reason in
 * the commit message.
 *
 * HERMETIC: tracked-source reads only; no DB, no network, no clock.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	byPath,
	census,
	type FileCompatReads,
	REPO_ROOT,
	SCAN_ROOTS,
	summarize,
	totalsByTopLevel,
} from './lib/client_compat_census.ts';

/** The frozen baseline. In engineering/ because a gate reads it (rewrite/ may not be read). */
export const BASELINE_PATH = 'engineering/client_compat_read_baseline.json';

/** The one instruction most failure messages end with. */
export const FIX_COMMAND = 'bun run scripts/client_compat_baseline.ts';

/**
 * Anti-vacuity floor for the corpus, deliberately far BELOW the measured
 * census (over six hundred files today) so ordinary churn never trips it.
 * Fix the scanner, never the floor.
 */
export const CORPUS_FLOOR = 300;

export interface CompatBaseline {
	generated_by: string;
	rule: string;
	files: Record<string, number>;
	summary: { files: number; total: number };
}

const ROOTS_LABEL = SCAN_ROOTS.map((entry) => `${entry.root}/${entry.glob}`).join(', ');

const GENERATED_BY = `${FIX_COMMAND} (Glob().scanSync + readFileSync census of ${ROOTS_LABEL} via scripts/lib/client_compat_census.ts — never grep)`;

const RULE = [
	'SHRINK-ONLY ratchet on client reads of the envelope-v2 COMPAT keys `.msg` / `.errors` / `.result` (engineering/ERRORS_SPEC.md §3.1), per file, comments and string contents excluded, page_globals lines excluded, and the named non-envelope expressions of NON_ENVELOPE_READS (browser APIs, nested server blocks, server job stream frames, payload diagnostic lists, failure extension keys) excused one expression at a time with a reason.',
	"Each entry is that file's count frozen at today's value; a file absent from the list is capped at 0.",
	'An entry may only go DOWN. Raising one, or adding a file, means a new compat read: a deliberate act — the generator refuses it without --allow-regression, and the commit message MUST say why.',
	'A file now BELOW its entry, or an entry for a deleted/moved file, is a GATE FAILURE (a stale entry lets the file quietly regress back up): re-freeze with the generator and commit this file in the same change.',
	'DO NOT hand-edit. Regenerate with: bun run scripts/client_compat_baseline.ts',
	'Why: the compat block (ERROR_ENVELOPE_COMPAT in src/core/errors/convert.ts + compatFields in schema.ts) exists ONLY while a client reads these names; when summary.total reaches 0 the gate flips to asserting the block is deleted (P4).',
	'summary.files and summary.total are the frozen debt and are asserted exactly by test/unit/client_error_contract_tripwire.test.ts.',
].join(' ');

/** Build the baseline object from a census. Keys sorted ⇒ idempotent bytes. */
export function buildBaseline(results: readonly FileCompatReads[]): CompatBaseline {
	const files: Record<string, number> = {};
	for (const result of [...results].sort(byPath)) {
		if (result.reads > 0) files[result.file] = result.reads;
	}
	const totals = summarize(results);
	return {
		generated_by: GENERATED_BY,
		rule: RULE,
		files,
		summary: { files: totals.files, total: totals.total },
	};
}

/** Read the baseline. THROWS loudly if missing or malformed — never silently "no constraints". */
export function loadBaseline(): CompatBaseline {
	const path = join(REPO_ROOT, BASELINE_PATH);
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (error) {
		throw new Error(
			`client_compat_baseline: ${BASELINE_PATH} is missing or unreadable — the ratchet cannot run without it. Regenerate with: ${FIX_COMMAND}. (${String(error)})`,
		);
	}
	let parsed: CompatBaseline;
	try {
		parsed = JSON.parse(raw) as CompatBaseline;
	} catch (error) {
		throw new Error(`client_compat_baseline: ${BASELINE_PATH} is not valid JSON: ${String(error)}`);
	}
	if (
		parsed.files === null ||
		typeof parsed.files !== 'object' ||
		typeof parsed.summary?.files !== 'number' ||
		typeof parsed.summary?.total !== 'number'
	) {
		throw new Error(
			`client_compat_baseline: ${BASELINE_PATH} is malformed (expected an object "files" and a numeric "summary.files"/"summary.total").`,
		);
	}
	for (const [file, count] of Object.entries(parsed.files)) {
		if (!Number.isInteger(count) || count <= 0) {
			throw new Error(
				`client_compat_baseline: ${BASELINE_PATH} entry ${file} = ${String(count)} — entries must be positive integers (a zero or non-numeric entry is a hand edit).`,
			);
		}
	}
	return parsed;
}

export interface Drift {
	/** Files whose count EXCEEDS their frozen entry (or 0 when unlisted). */
	regressions: string[];
	/** Entries that no longer match reality: below-entry files, deleted files. */
	stale: string[];
	/** Frozen-debt summary mismatches (files/total). */
	summary: string[];
	/** The scan itself is implausible. */
	vacuity: string[];
}

export function hasDrift(drift: Drift): boolean {
	return (
		drift.regressions.length > 0 ||
		drift.stale.length > 0 ||
		drift.summary.length > 0 ||
		drift.vacuity.length > 0
	);
}

/** Compare a fresh census against the frozen baseline. Both directions are drift. */
export function computeDrift(results: readonly FileCompatReads[], baseline: CompatBaseline): Drift {
	const measured = new Map(results.map((result) => [result.file, result]));
	const regressions: string[] = [];
	const stale: string[] = [];

	for (const result of results) {
		const frozen = baseline.files[result.file];
		const allowed = frozen ?? 0;
		if (result.reads > allowed) {
			const remedy =
				frozen === undefined
					? ' — NEW file reading compat keys (no baseline entry, cap 0): read `data` / `error.code` instead, or freeze it deliberately with --allow-regression. A plain regeneration will REFUSE'
					: '';
			regressions.push(
				`${result.file}: ${result.reads} compat read(s) > allowed ${allowed}${remedy}`,
			);
		}
	}

	for (const [file, allowed] of Object.entries(baseline.files).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const result = measured.get(file);
		if (!result) {
			stale.push(`${file}: listed in the baseline but no longer present under ${ROOTS_LABEL}`);
			continue;
		}
		if (result.reads < allowed) {
			stale.push(
				`${file}: entry ${allowed} but the file now has ${result.reads} — the ratchet must match reality`,
			);
		}
	}

	const fresh = summarize(results);
	const summary: string[] = [];
	if (baseline.summary.files !== fresh.files)
		summary.push(`summary.files: baseline ${baseline.summary.files} vs measured ${fresh.files}`);
	if (baseline.summary.total !== fresh.total)
		summary.push(`summary.total: baseline ${baseline.summary.total} vs measured ${fresh.total}`);

	const vacuity: string[] = [];
	if (fresh.scanned < CORPUS_FLOOR)
		vacuity.push(
			`only ${fresh.scanned} files scanned under ${ROOTS_LABEL} (floor ${CORPUS_FLOOR}) — the roots moved, the glob broke, or the tree is not checked out. Fix the scanner, never the floor.`,
		);

	return { regressions, stale, summary, vacuity };
}

/** Human-readable drift report. */
export function formatDrift(drift: Drift): string {
	const lines: string[] = [];
	if (drift.regressions.length > 0) {
		lines.push(
			`COMPAT-READ REGRESSION (${drift.regressions.length}) — a file gained \`.msg\`/\`.errors\`/\`.result\` reads past its frozen count. Read \`data\` / \`error.code\`; do NOT raise the number:`,
		);
		for (const entry of drift.regressions) lines.push(`  + ${entry}`);
	}
	if (drift.stale.length > 0) {
		lines.push(
			`STALE BASELINE ENTRIES (${drift.stale.length}) — these no longer match reality; a too-high entry lets the file silently regress back up. Re-freeze with \`${FIX_COMMAND}\`:`,
		);
		for (const entry of drift.stale) lines.push(`  - ${entry}`);
	}
	if (drift.summary.length > 0) {
		lines.push(`FROZEN DEBT MISMATCH (${drift.summary.length}):`);
		for (const entry of drift.summary) lines.push(`  ! ${entry}`);
	}
	if (drift.vacuity.length > 0) {
		lines.push(`VACUOUS SCAN (${drift.vacuity.length}):`);
		for (const entry of drift.vacuity) lines.push(`  # ${entry}`);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function serialize(baseline: CompatBaseline): string {
	return `${JSON.stringify(baseline, null, '\t')}\n`;
}

/** The baseline, or null if none yet (the FIRST run). Only the write guard may treat absent as fine. */
function loadBaselineIfPresent(): CompatBaseline | null {
	try {
		return loadBaseline();
	} catch {
		return null;
	}
}

/** Entries the new baseline would RAISE or add. Message text. */
export function raisedEntries(previous: CompatBaseline, next: CompatBaseline): string[] {
	const raised: string[] = [];
	for (const [file, value] of Object.entries(next.files).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const before = previous.files[file];
		if (before === undefined) raised.push(`${file}: NEW file with ${value} compat read(s)`);
		else if (value > before) raised.push(`${file}: ${before} -> ${value}`);
	}
	return raised;
}

function printReport(results: readonly FileCompatReads[]): void {
	const totals = summarize(results);
	console.log(
		`${ROOTS_LABEL}: ${totals.scanned} files scanned, ${totals.total} compat reads across ${totals.files} files (msg ${totals.byKey.msg}, errors ${totals.byKey.errors}, result ${totals.byKey.result}).`,
	);
	console.log('per area:');
	for (const [dir, count] of Object.entries(totalsByTopLevel(results))) {
		if (count > 0) console.log(`  ${String(count).padStart(5)}  ${dir}`);
	}
	console.log('top files:');
	const top = [...results]
		.filter((result) => result.reads > 0)
		.sort((a, b) => b.reads - a.reads || byPath(a, b))
		.slice(0, 20);
	for (const result of top) console.log(`  ${String(result.reads).padStart(5)}  ${result.file}`);
}

function main(): number {
	const args = new Set(process.argv.slice(2));
	const check = args.has('--check');
	const report = args.has('--report');
	const allowRegression = args.has('--allow-regression');
	const update = !check && !report; // the default action

	const results = census();

	if (report) {
		printReport(results);
		return 0;
	}

	if (update) {
		const baseline = buildBaseline(results);
		if (!allowRegression) {
			const previous = loadBaselineIfPresent();
			const raised = previous === null ? [] : raisedEntries(previous, baseline);
			if (raised.length > 0) {
				console.error(
					[
						`REFUSING to write ${BASELINE_PATH}: this would RAISE ${raised.length} entr${raised.length === 1 ? 'y' : 'ies'} — i.e. freeze NEW compat reads. That is the one thing this ratchet exists to stop.`,
						...raised.map((entry) => `  ^ ${entry}`),
						'',
						'Two legitimate answers, and only two:',
						'  (a) read the envelope-v2 fields (`data`, `error.code`, `error.label_key`) instead; then the regeneration writes cleanly;',
						`  (b) if the compat read genuinely must stay for now, say so out loud: ${FIX_COMMAND} --allow-regression, and state WHY in the commit message.`,
					].join('\n'),
				);
				return 1;
			}
		}
		writeFileSync(join(REPO_ROOT, BASELINE_PATH), serialize(baseline), 'utf8');
		console.log(
			`wrote ${BASELINE_PATH}: ${baseline.summary.total} compat reads across ${baseline.summary.files} files (of ${results.length} scanned).`,
		);
		return 0;
	}

	// --check
	const baseline = loadBaseline();
	const drift = computeDrift(results, baseline);
	if (!hasDrift(drift)) {
		console.log(
			`${BASELINE_PATH} matches the tree (${baseline.summary.total} compat reads across ${baseline.summary.files} files).`,
		);
		return 0;
	}
	console.error(formatDrift(drift));
	return 1;
}

if (import.meta.main) process.exit(main());
