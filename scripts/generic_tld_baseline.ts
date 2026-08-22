/**
 * GENERIC-TLD BASELINE — generator and drift checker for the
 * generic_tld_tripwire (test/unit/generic_tld_tripwire.test.ts).
 *
 *   bun run scripts/generic_tld_baseline.ts            # rewrite the JSON baseline (default)
 *   bun run scripts/generic_tld_baseline.ts --check    # print drift, exit 1 if any
 *   bun run scripts/generic_tld_baseline.ts --report   # files per install TLD, top files
 *
 * ── WHAT THIS IS ─────────────────────────────────────────────────────────────
 * AGENTS.md hard rules (2026-08-19): a test uses the generic `test` TLD and
 * BUILDS the situation it tests; it never binds a specific install's TLD.
 * On the day the rule was adopted, 307 of 722 test files did (numisdata 159,
 * rsc 151, oh 64, zenon 14, tchi 12 …). A flat "zero install TLDs" gate cannot
 * pass today and was not proposed. What is enforceable — and what this gate is
 * — is a SHRINK-ONLY RATCHET on the FILE SET: every file that binds an
 * install TLD today is frozen, with the TLDs it binds; a file may only drop
 * TLDs or leave the list; a new file may bind none. The migration
 * (engineering/ORACLE_HARVEST.md "Generic-TLD replacement map") pays the debt.
 *
 * ── ONE IMPLEMENTATION ───────────────────────────────────────────────────────
 * The measure is scripts/lib/tld_census.ts and nothing else. This file only
 * shapes it into the artifact and diffs it; the gate imports both.
 *
 * ── THE ARTIFACT ─────────────────────────────────────────────────────────────
 *   { generated_by, rule, files: { <path>: [tld, …] }, summary: { files, by_tld } }
 * `files` lists ONLY files with ≥1 install TLD, keys in codepoint order, each
 * value the sorted TLD list — idempotent bytes across machines. `summary` is
 * the frozen debt; the gate asserts it.
 *
 * ── THE ANTI-LAUNDERING GUARD ────────────────────────────────────────────────
 * Without `--allow-regression` the generator REFUSES to add a file or add a
 * TLD to an existing file's list. Growth is a deliberate, reviewable diff whose
 * reason belongs in the commit message.
 *
 * HERMETIC: tracked-source reads only; no DB, no network, no clock.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	census,
	type FileTldRefs,
	INSTALL_TLDS,
	REPO_ROOT,
	SCAN_ROOTS_LABEL,
	scannedFileCount,
	summarizeByTld,
} from './lib/tld_census.ts';

/** The frozen baseline. In engineering/ because a gate reads it (rewrite/ may not be read). */
export const BASELINE_PATH = 'engineering/generic_tld_baseline.json';

/** The one instruction most failure messages end with. */
export const FIX_COMMAND = 'bun run scripts/generic_tld_baseline.ts';

/**
 * Anti-vacuity floor — far below the ~720 measured test files, so churn never
 * trips it, but a broken glob (0 files) cannot pass by inspecting nothing.
 */
export const CORPUS_FLOOR = 300;

export interface TldBaseline {
	generated_by: string;
	rule: string;
	files: Record<string, string[]>;
	summary: { files: number; by_tld: Record<string, number> };
}

const GENERATED_BY = `${FIX_COMMAND} (Glob().scanSync + readFileSync census of ${SCAN_ROOTS_LABEL} via scripts/lib/tld_census.ts — never grep)`;

const RULE = [
	'SHRINK-ONLY ratchet on the SET of test files that bind a specific-install ontology TLD (a `<tld><digits>` tipo token, comments excluded; the install TLD list is INSTALL_TLDS in scripts/lib/tld_census.ts).',
	'Each entry is that file frozen with the install TLDs it binds today; a file absent from the list may bind NONE.',
	'An entry may only lose TLDs or disappear. Adding a file, or a TLD to a file, is a new corpus binding: a deliberate act — the generator refuses it without --allow-regression, and the commit message MUST say why.',
	'A file now binding FEWER TLDs than its entry, or an entry for a deleted/moved file, is a GATE FAILURE (a stale entry lets the file quietly regress): re-freeze with the generator and commit this file in the same change.',
	'DO NOT hand-edit. Regenerate with: bun run scripts/generic_tld_baseline.ts',
	'Why (AGENTS.md hard rules 2026-08-19): a test uses the generic `test` TLD and BUILDS the situation it tests (src/core/test_data/situations); a gate bound to numisdata/rsc/oh/tch… records is green on one machine and red on every other. The migration ledger is engineering/ORACLE_HARVEST.md "Generic-TLD replacement map".',
	'summary.files and summary.by_tld are the frozen debt and are asserted exactly by test/unit/generic_tld_tripwire.test.ts.',
].join(' ');

/** Build the baseline object from a census. Keys sorted ⇒ idempotent bytes. */
export function buildBaseline(results: readonly FileTldRefs[]): TldBaseline {
	const files: Record<string, string[]> = {};
	for (const r of results) files[r.file] = Object.keys(r.denied);
	return {
		generated_by: GENERATED_BY,
		rule: RULE,
		files,
		summary: { files: results.length, by_tld: summarizeByTld(results) },
	};
}

/**
 * Read the baseline. THROWS loudly if it is missing or malformed — a missing
 * baseline must fail the gate, never silently become "no constraints".
 */
export function loadBaseline(): TldBaseline {
	const path = join(REPO_ROOT, BASELINE_PATH);
	let raw: string;
	try {
		raw = readFileSync(path, 'utf8');
	} catch (error) {
		throw new Error(
			`generic_tld_baseline: ${BASELINE_PATH} is missing or unreadable — the ratchet cannot run without it. Regenerate with: ${FIX_COMMAND}. (${String(error)})`,
		);
	}
	let parsed: TldBaseline;
	try {
		parsed = JSON.parse(raw) as TldBaseline;
	} catch (error) {
		throw new Error(`generic_tld_baseline: ${BASELINE_PATH} is not valid JSON: ${String(error)}`);
	}
	if (
		typeof parsed.files !== 'object' ||
		parsed.files === null ||
		typeof parsed.summary !== 'object'
	) {
		throw new Error(`generic_tld_baseline: ${BASELINE_PATH} lacks files/summary`);
	}
	return parsed;
}

export interface TldDrift {
	/** New file, or a file that gained a TLD: `file: +tld,+tld`. */
	regressions: string[];
	/** File below its entry (lost a TLD) or gone: needs a re-freeze. */
	stale: string[];
	/** summary disagreement. */
	summary: string[];
	/** corpus floor / invariant sanity. */
	vacuity: string[];
}

export function computeDrift(results: readonly FileTldRefs[], baseline: TldBaseline): TldDrift {
	const drift: TldDrift = { regressions: [], stale: [], summary: [], vacuity: [] };
	const measured = new Map(results.map((r) => [r.file, Object.keys(r.denied)]));

	for (const [file, tlds] of measured) {
		const frozen = baseline.files[file];
		if (frozen === undefined) {
			drift.regressions.push(`${file}: NEW file binds ${tlds.map((t) => `+${t}`).join(',')}`);
			continue;
		}
		const gained = tlds.filter((t) => !frozen.includes(t));
		const lost = frozen.filter((t) => !tlds.includes(t));
		if (gained.length > 0)
			drift.regressions.push(`${file}: gained ${gained.map((t) => `+${t}`).join(',')}`);
		if (lost.length > 0) drift.stale.push(`${file}: no longer binds ${lost.join(',')} (re-freeze)`);
	}
	for (const file of Object.keys(baseline.files)) {
		if (!measured.has(file))
			drift.stale.push(`${file}: entry for a file that binds nothing now, or is gone (re-freeze)`);
	}

	const by = summarizeByTld(results);
	if (results.length !== baseline.summary.files) {
		drift.summary.push(`summary.files ${baseline.summary.files} → measured ${results.length}`);
	}
	for (const tld of new Set([...Object.keys(by), ...Object.keys(baseline.summary.by_tld)])) {
		const a = baseline.summary.by_tld[tld] ?? 0;
		const b = by[tld] ?? 0;
		if (a !== b) drift.summary.push(`summary.by_tld.${tld} ${a} → measured ${b}`);
	}

	const scanned = scannedFileCount();
	if (scanned < CORPUS_FLOOR) {
		drift.vacuity.push(
			`only ${scanned} files scanned under ${SCAN_ROOTS_LABEL} (< ${CORPUS_FLOOR}) — a root moved or a glob broke. Fix the scanner, never the floor.`,
		);
	}
	return drift;
}

export function formatDrift(d: TldDrift): string {
	const lines: string[] = [];
	if (d.regressions.length) lines.push('REGRESSIONS:', ...d.regressions.map((l) => `  ${l}`));
	if (d.stale.length) lines.push('STALE:', ...d.stale.map((l) => `  ${l}`));
	if (d.summary.length) lines.push('SUMMARY:', ...d.summary.map((l) => `  ${l}`));
	if (d.vacuity.length) lines.push('VACUITY:', ...d.vacuity.map((l) => `  ${l}`));
	return lines.join('\n');
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.main) {
	const args = new Set(process.argv.slice(2));
	const results = census();

	if (args.has('--report')) {
		console.log(`files scanned: ${scannedFileCount()}; binding an install TLD: ${results.length}`);
		console.log('files per install TLD:', summarizeByTld(results));
		const top = [...results]
			.map((r) => ({ f: r.file, n: Object.values(r.denied).reduce((a, v) => a + v.length, 0) }))
			.sort((a, b) => b.n - a.n)
			.slice(0, 15);
		console.log('top files by distinct tipos:', top);
		console.log('INSTALL_TLDS:', [...INSTALL_TLDS].join(' '));
		process.exit(0);
	}

	if (args.has('--check')) {
		const drift = computeDrift(results, loadBaseline());
		const any =
			drift.regressions.length + drift.stale.length + drift.summary.length + drift.vacuity.length;
		console.log(any ? formatDrift(drift) : 'generic_tld_baseline: no drift');
		process.exit(any ? 1 : 0);
	}

	// default: (re)write
	let existing: TldBaseline | null = null;
	try {
		existing = loadBaseline();
	} catch {
		existing = null;
	}
	if (existing !== null && !args.has('--allow-regression')) {
		const drift = computeDrift(results, existing);
		if (drift.regressions.length > 0) {
			console.error(
				`generic_tld_baseline: REFUSING to write — the census GREW (new corpus bindings). A ratchet cannot absorb growth by regeneration.\n${formatDrift({ ...drift, stale: [], summary: [], vacuity: [] })}\nEither move the test onto the generic test TLD (src/core/test_data/situations), or re-run with --allow-regression and say WHY in the commit message.`,
			);
			process.exit(1);
		}
	}
	const baseline = buildBaseline(results);
	writeFileSync(join(REPO_ROOT, BASELINE_PATH), `${JSON.stringify(baseline, null, '\t')}\n`);
	// The repo's formatter owns JSON layout (short arrays inline). Run it so a
	// regenerated baseline is byte-identical to a linted one — never lint-red.
	Bun.spawnSync(['bunx', 'biome', 'format', '--write', BASELINE_PATH], { cwd: REPO_ROOT });
	console.log(
		`generic_tld_baseline: wrote ${BASELINE_PATH} — ${baseline.summary.files} files bind an install TLD (${Object.entries(
			baseline.summary.by_tld,
		)
			.slice(0, 5)
			.map(([t, n]) => `${t} ${n}`)
			.join(', ')} …)`,
	);
}
