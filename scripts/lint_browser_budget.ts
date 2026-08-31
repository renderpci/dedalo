#!/usr/bin/env bun

/**
 * THE BROWSER-CODE LINT BUDGET — a shrink-only ratchet over the trees
 * `biome.jsonc` excludes (P1-17 / GATE-44).
 *
 * WHY THIS EXISTS. `bun run lint` is `biome check .`, and `biome.jsonc` excludes
 * `**​/client` and the tools' `js` trees. So a GREEN LINT SAID NOTHING about
 * ~315k lines of browser UI — the tree AGENTS.md calls "the PRIMARY, TS-OWNED
 * client source" — which is precisely where biome's a11y, DOM-sink and
 * correctness rules fire. Measured 2026-08-31: 1765 errors on `client/` alone.
 *
 * WHY A BUDGET AND NOT A FLAG DAY. Deleting the exclusion turns `verify` red on
 * day one and stays red for as long as the burn-down takes, which is how a gate
 * gets switched off. The budget freezes today's count and lets it only FALL —
 * the same shape as the CRAP ratchet and the source ratchets.
 *
 * ONE RULE SET, NOT TWO. The scope is DERIVED from `biome.jsonc` by removing the
 * browser-tree exclusions and nothing else, into a scratch config. There is no
 * second rule list to drift: change a rule in `biome.jsonc` and this measures
 * the changed rule.
 *
 *   bun run scripts/lint_browser_budget.ts            # check against the budget
 *   bun run scripts/lint_browser_budget.ts --update   # record a LOWER count
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..');
const BIOME_CONFIG = join(REPO_ROOT, 'biome.jsonc');
export const BUDGET_PATH = join(REPO_ROOT, 'engineering', 'lint_browser_budget.json');

/**
 * The exclusions that hide BROWSER CODE. Removing exactly these — and leaving
 * every other exclusion (node_modules, vendored libraries, generated JSON)
 * in place — is what defines this budget's scope.
 */
export const BROWSER_EXCLUSIONS = ['"!**/client",', '"!**/tools/**/*/js",'] as const;

export const BUDGET_NOTE =
	'SHRINK-ONLY lint budget for the BROWSER trees biome.jsonc excludes (client/, tools/**/js). ' +
	'A green `bun run lint` says nothing about them, so this measures them separately with the ' +
	'SAME rule set, derived from biome.jsonc rather than copied. errors may only go DOWN. ' +
	'Regenerate after a burn-down with: bun run scripts/lint_browser_budget.ts --update — which ' +
	'REFUSES to raise the number. warnings/files are advisory context, not asserted.';

/**
 * The floor below which a run cannot have measured the browser trees at all.
 * client/ alone is ~930 files; anything near zero means biome never ran.
 */
export const MINIMUM_FILES = 500;

/**
 * Refuse a run that cannot have measured the browser trees (P1-17).
 *
 * biome printing nothing we recognise — a bad config, a version whose summary
 * changed shape, a panic — parses as a PERFECT SCORE, and `--update` would bank
 * 0 errors over 0 files and permanently destroy the ratchet. A run that measured
 * nothing is an error, never a win. Measured: a corrupted config yields
 * `{files: 0, errors: 0}` from the parser alone.
 */
export function assertMeasured(counts: LintCounts, output = ''): void {
	if (counts.files >= MINIMUM_FILES) return;
	throw new Error(
		`biome reported only ${counts.files} files (expected at least ${MINIMUM_FILES}). ` +
			'Refusing to treat an unmeasured run as a result.\n' +
			output.split('\n').slice(-15).join('\n'),
	);
}

export interface LintCounts {
	files: number;
	errors: number;
	warnings: number;
}

/** Parse biome's summary tail. Absent lines mean zero, which is the good case. */
export function parseBiomeSummary(output: string): LintCounts {
	const number = (pattern: RegExp): number => {
		const raw = output.match(pattern)?.[1]?.replace(/,/g, '');
		return raw === undefined ? 0 : Number.parseInt(raw, 10);
	};
	return {
		files: number(/Checked ([\d,]+) files? in/),
		errors: number(/Found ([\d,]+) errors?\./),
		warnings: number(/Found ([\d,]+) warnings?\./),
	};
}

/** Write the derived scope config and return its path. */
export function materializeScopeConfig(): string {
	const source = readFileSync(BIOME_CONFIG, 'utf8');
	let scoped = source;
	for (const exclusion of BROWSER_EXCLUSIONS) {
		if (!scoped.includes(exclusion)) {
			throw new Error(
				`biome.jsonc no longer excludes ${exclusion} — if the browser tree is now ` +
					'linted for real, DELETE this budget rather than measuring nothing.',
			);
		}
		scoped = scoped.replace(exclusion, '');
	}
	// OUTSIDE THE REPO, deliberately. Writing it to the repo root raced the
	// concurrent `biome check .` stage in verify — biome scanned the scratch
	// config as a source file and the lint stage went red for a file that exists
	// for a few hundred milliseconds. The remaining `!**/…` patterns are all
	// `**/`-anchored, so they keep matching when the config lives elsewhere and
	// the target paths are passed on the command line.
	const dir = mkdtempSync(join(tmpdir(), 'dedalo-lint-scope-'));
	const path = join(dir, 'biome.jsonc');
	writeFileSync(path, scoped);
	return path;
}

export async function measure(): Promise<LintCounts> {
	const configPath = materializeScopeConfig();
	try {
		const result =
			await $`bunx biome check --config-path=${configPath} --reporter=summary client tools`
				.nothrow()
				.quiet();
		const output = result.stdout.toString() + result.stderr.toString();
		const counts = parseBiomeSummary(output);
		// FAIL CLOSED ON A CRASH. biome printing nothing we recognise — a bad
		// config, a version whose summary changed shape, a panic — parses as a
		// PERFECT SCORE, and `--update` would then bank 0 errors over 0 files and
		// permanently destroy the ratchet. A run that measured nothing is an error,
		// never a win.
		assertMeasured(counts, output);
		return counts;
	} finally {
		await $`rm -rf ${dirname(configPath)}`.nothrow().quiet();
	}
}

export function readBudget(): LintCounts & { measured: string } {
	return JSON.parse(readFileSync(BUDGET_PATH, 'utf8')) as LintCounts & { measured: string };
}

if (import.meta.main) {
	const update = process.argv.includes('--update');
	const counts = await measure();
	if (!existsSync(BUDGET_PATH)) {
		console.log('no budget yet — writing the first one');
	}
	const budget = existsSync(BUDGET_PATH) ? readBudget() : { errors: Number.POSITIVE_INFINITY };

	if (update) {
		if (counts.errors > budget.errors) {
			console.error(
				`REFUSED: ${counts.errors} errors is MORE than the recorded ${budget.errors}. ` +
					'This ratchet only shrinks — fix the new findings instead of recording them.',
			);
			process.exit(1);
		}
		writeFileSync(
			BUDGET_PATH,
			`${JSON.stringify({ _: BUDGET_NOTE, ...counts, measured: new Date().toISOString().slice(0, 10) }, null, '\t')}\n`,
		);
		console.log(`wrote ${BUDGET_PATH}: ${counts.errors} errors over ${counts.files} files`);
		process.exit(0);
	}

	if (counts.errors > budget.errors) {
		console.error(
			`BROWSER LINT BUDGET EXCEEDED: ${counts.errors} errors > ${budget.errors} allowed.\n` +
				'  Run `bunx biome check --config-path=<derived> client` to see them.\n' +
				'  The budget only SHRINKS. Fix the finding; do not raise the number.',
		);
		process.exit(1);
	}
	console.log(
		counts.errors < budget.errors
			? `${counts.errors} errors < budget ${budget.errors} — run --update to bank it.`
			: `${counts.errors} errors, at budget.`,
	);
}
