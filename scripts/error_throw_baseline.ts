/**
 * UNTYPED-THROW BASELINE — generator and drift checker for the
 * error_throw_ratchet (test/unit/error_throw_ratchet.test.ts).
 *
 *   bun run scripts/error_throw_baseline.ts            # rewrite the JSON baseline (default)
 *   bun run scripts/error_throw_baseline.ts --check    # print drift, exit 1 if any
 *   bun run scripts/error_throw_baseline.ts --report   # totals per dir + zero-tier + top files
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 * The error-taxonomy plan (decision 4, "middle") retires the untyped
 * `throw new Error(` as the engine's failure signal: every non-internal throw
 * gets a registered code, and the internal ones that remain live under a
 * SHRINK-ONLY RATCHET. This file freezes today's per-file counts into
 * `engineering/error_throw_baseline.json`; the gate then forbids any file to
 * grow, demands a re-freeze when a file shrinks (a stale entry silently
 * loosens the ratchet), and caps every unlisted file at 0.
 *
 * ── ONE IMPLEMENTATION ───────────────────────────────────────────────────────
 * The count is scripts/lib/throw_census.ts and nothing else. This file only
 * shapes it into the artifact and diffs it; the gate imports both.
 *
 * ── THE ARTIFACT ─────────────────────────────────────────────────────────────
 *   { generated_by, rule, files: { <repo-relative path>: count }, summary: { files, total } }
 * `files` lists ONLY files with count > 0, keys in codepoint order, so the
 * bytes are idempotent across machines. `summary.files` / `summary.total` are
 * the frozen debt; the gate asserts them (a new site under an already-listed
 * file cannot hide: the file's own entry moves).
 *
 * ── THE ANTI-LAUNDERING GUARD ────────────────────────────────────────────────
 * Every gate failure message points here, so a plain regeneration must never
 * absorb growth: without `--allow-regression` it REFUSES to raise an entry or
 * add a new file. A raised number is a deliberate, reviewable diff whose reason
 * belongs in the commit message.
 *
 * HERMETIC: tracked-source reads only; no DB, no network, no clock.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	byPath,
	census,
	type FileThrows,
	REPO_ROOT,
	SCAN_ROOTS,
	summarize,
	totalsByTopLevel,
	ZERO_TIER_ENFORCED,
	zeroTierOf,
	zeroTierTotals,
} from './lib/throw_census.ts';

/** The frozen baseline. In engineering/ because a gate reads it (rewrite/ may not be read). */
export const BASELINE_PATH = 'engineering/error_throw_baseline.json';

/** The one instruction most failure messages end with. */
export const FIX_COMMAND = 'bun run scripts/error_throw_baseline.ts';

/**
 * Anti-vacuity floor for the corpus, deliberately far BELOW the measured
 * census (over six hundred files today) so ordinary churn never trips it.
 * Every other check is "this violation list is empty"; a broken glob would make
 * them all pass having inspected nothing. Fix the scanner, never the floor.
 */
export const CORPUS_FLOOR = 300;

export interface ThrowBaseline {
	generated_by: string;
	rule: string;
	files: Record<string, number>;
	summary: { files: number; total: number };
}

const GENERATED_BY = `${FIX_COMMAND} (Glob().scanSync + readFileSync census of ${SCAN_ROOTS.join(', ')} via scripts/lib/throw_census.ts — never grep)`;

const RULE = [
	'SHRINK-ONLY ratchet on untyped `throw new Error(` sites, per file, comments and string contents excluded.',
	"Each entry is that file's count frozen at today's value; a file absent from the list is capped at 0.",
	'An entry may only go DOWN. Raising one, or adding a file, means a new untyped throw: a deliberate act — the generator refuses it without --allow-regression, and the commit message MUST say why.',
	'A file now BELOW its entry, or an entry for a deleted/moved file, is a GATE FAILURE (a stale entry lets the file quietly regress back up): re-freeze with the generator and commit this file in the same change.',
	'DO NOT hand-edit. Regenerate with: bun run scripts/error_throw_baseline.ts',
	'Why: error-taxonomy plan decision 4 ("middle") — every NON-internal throw gets a registered code, engine-invariant throws stay untyped under this ratchet, and the ZERO_TIER prefixes (scripts/lib/throw_census.ts) must reach 0 by the P3 exit.',
	'summary.files and summary.total are the frozen debt and are asserted exactly by test/unit/error_throw_ratchet.test.ts.',
].join(' ');

/** Build the baseline object from a census. Keys sorted ⇒ idempotent bytes. */
export function buildBaseline(results: readonly FileThrows[]): ThrowBaseline {
	const files: Record<string, number> = {};
	for (const result of [...results].sort(byPath)) {
		if (result.untyped > 0) files[result.file] = result.untyped;
	}
	const totals = summarize(results);
	return {
		generated_by: GENERATED_BY,
		rule: RULE,
		files,
		summary: { files: totals.files, total: totals.total },
	};
}

/**
 * Read the baseline. THROWS loudly if it is missing or malformed — a missing
 * baseline must fail the gate, never silently become "no constraints".
 */
export function loadBaseline(): ThrowBaseline {
	const path = join(REPO_ROOT, BASELINE_PATH);
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (error) {
		throw new Error(
			`error_throw_baseline: ${BASELINE_PATH} is missing or unreadable — the ratchet cannot run without it. Regenerate with: ${FIX_COMMAND}. (${String(error)})`,
		);
	}
	let parsed: ThrowBaseline;
	try {
		parsed = JSON.parse(raw) as ThrowBaseline;
	} catch (error) {
		throw new Error(`error_throw_baseline: ${BASELINE_PATH} is not valid JSON: ${String(error)}`);
	}
	if (
		parsed.files === null ||
		typeof parsed.files !== 'object' ||
		typeof parsed.summary?.files !== 'number' ||
		typeof parsed.summary?.total !== 'number'
	) {
		throw new Error(
			`error_throw_baseline: ${BASELINE_PATH} is malformed (expected an object "files" and a numeric "summary.files"/"summary.total").`,
		);
	}
	for (const [file, count] of Object.entries(parsed.files)) {
		if (!Number.isInteger(count) || count <= 0) {
			throw new Error(
				`error_throw_baseline: ${BASELINE_PATH} entry ${file} = ${String(count)} — entries must be positive integers (a zero or non-numeric entry is a hand edit).`,
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
	/** Zero-tier files holding untyped throws — enforced only when ZERO_TIER_ENFORCED. */
	zeroTier: string[];
}

export function hasDrift(drift: Drift): boolean {
	return (
		drift.regressions.length > 0 ||
		drift.stale.length > 0 ||
		drift.summary.length > 0 ||
		drift.vacuity.length > 0 ||
		(ZERO_TIER_ENFORCED && drift.zeroTier.length > 0)
	);
}

/** Compare a fresh census against the frozen baseline. Both directions are drift. */
export function computeDrift(results: readonly FileThrows[], baseline: ThrowBaseline): Drift {
	const measured = new Map(results.map((result) => [result.file, result]));
	const regressions: string[] = [];
	const stale: string[] = [];
	const zeroTier: string[] = [];

	for (const result of results) {
		const frozen = baseline.files[result.file];
		const allowed = frozen ?? 0;
		if (result.untyped > allowed) {
			const remedy =
				frozen === undefined
					? ' — NEW file with untyped throws (no baseline entry, cap 0): give the failure a registered code, or freeze it deliberately with --allow-regression. A plain regeneration will REFUSE'
					: '';
			regressions.push(
				`${result.file}: ${result.untyped} untyped throw(s) > allowed ${allowed}${remedy}`,
			);
		}
		if (result.untyped > 0 && zeroTierOf(result.file) !== null) {
			zeroTier.push(`${result.file}: ${result.untyped} (zero-tier ${zeroTierOf(result.file)})`);
		}
	}

	for (const [file, allowed] of Object.entries(baseline.files).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const result = measured.get(file);
		if (!result) {
			stale.push(
				`${file}: listed in the baseline but no longer present under ${SCAN_ROOTS.join('/, ')}/`,
			);
			continue;
		}
		if (result.untyped < allowed) {
			stale.push(
				`${file}: entry ${allowed} but the file now has ${result.untyped} — the ratchet must match reality`,
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
			`only ${fresh.scanned} files scanned under ${SCAN_ROOTS.join('/, ')}/ (floor ${CORPUS_FLOOR}) — the roots moved, the glob broke, or the tree is not checked out. Fix the scanner, never the floor.`,
		);

	return { regressions, stale, summary, vacuity, zeroTier };
}

/** Human-readable drift report. */
export function formatDrift(drift: Drift): string {
	const lines: string[] = [];
	if (drift.regressions.length > 0) {
		lines.push(
			`UNTYPED-THROW REGRESSION (${drift.regressions.length}) — a file gained \`throw new Error(\` sites past its frozen count. Give the failure a registered code; do NOT raise the number:`,
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
	if (ZERO_TIER_ENFORCED && drift.zeroTier.length > 0) {
		lines.push(
			`ZERO-TIER VIOLATION (${drift.zeroTier.length}) — these prefixes must hold ZERO untyped throws (plan §3 P3 exit); no baseline entry can excuse them:`,
		);
		for (const entry of drift.zeroTier) lines.push(`  0 ${entry}`);
	}
	return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function serialize(baseline: ThrowBaseline): string {
	return `${JSON.stringify(baseline, null, '\t')}\n`;
}

/** The baseline, or null if none yet (the FIRST run). Only the write guard may treat absent as fine. */
function loadBaselineIfPresent(): ThrowBaseline | null {
	try {
		return loadBaseline();
	} catch {
		return null;
	}
}

/** Entries the new baseline would RAISE or add. Message text. */
export function raisedEntries(previous: ThrowBaseline, next: ThrowBaseline): string[] {
	const raised: string[] = [];
	for (const [file, value] of Object.entries(next.files).sort(([a], [b]) =>
		a < b ? -1 : a > b ? 1 : 0,
	)) {
		const before = previous.files[file];
		if (before === undefined) raised.push(`${file}: NEW file with ${value} untyped throw(s)`);
		else if (value > before) raised.push(`${file}: ${before} -> ${value}`);
	}
	return raised;
}

function printReport(results: readonly FileThrows[]): void {
	const totals = summarize(results);
	console.log(
		`${SCAN_ROOTS.join(', ')}: ${totals.scanned} files scanned, ${totals.total} untyped throws across ${totals.files} files (${totals.builtin} builtin TypeError/RangeError throws, informational).`,
	);
	console.log('per top-level dir:');
	for (const [dir, count] of Object.entries(totalsByTopLevel(results))) {
		console.log(`  ${String(count).padStart(5)}  ${dir}`);
	}
	console.log(`zero-tier (${ZERO_TIER_ENFORCED ? 'ENFORCED' : 'informational until P3 exit'}):`);
	for (const [prefix, count] of Object.entries(zeroTierTotals(results))) {
		console.log(`  ${String(count).padStart(5)}  ${prefix}`);
	}
	console.log('top files:');
	const top = [...results]
		.filter((result) => result.untyped > 0)
		.sort((a, b) => b.untyped - a.untyped || byPath(a, b))
		.slice(0, 20);
	for (const result of top) console.log(`  ${String(result.untyped).padStart(5)}  ${result.file}`);
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
						`REFUSING to write ${BASELINE_PATH}: this would RAISE ${raised.length} entr${raised.length === 1 ? 'y' : 'ies'} — i.e. freeze NEW untyped throws. That is the one thing this ratchet exists to stop.`,
						...raised.map((entry) => `  ^ ${entry}`),
						'',
						'Two legitimate answers, and only two:',
						'  (a) give the failure a registered error code (the typed throw is not counted); then the regeneration writes cleanly;',
						`  (b) if the throw is a genuine engine invariant that must stay untyped, say so out loud: ${FIX_COMMAND} --allow-regression, and state WHY in the commit message.`,
					].join('\n'),
				);
				return 1;
			}
		}
		writeFileSync(join(REPO_ROOT, BASELINE_PATH), serialize(baseline), 'utf8');
		console.log(
			`wrote ${BASELINE_PATH}: ${baseline.summary.total} untyped throws across ${baseline.summary.files} files (of ${results.length} scanned).`,
		);
		return 0;
	}

	const drift = computeDrift(results, loadBaseline());
	if (!hasDrift(drift)) {
		const totals = summarize(results);
		console.log(
			`error_throw baseline clean: ${totals.total} untyped throws across ${totals.files} files (${totals.scanned} scanned).`,
		);
		return 0;
	}
	console.error(formatDrift(drift));
	return 1;
}

if (import.meta.main) process.exit(main());
