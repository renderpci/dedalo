/**
 * TRIPWIRE — every ratchet refuses its own LAUNDERING (P2-18).
 *
 * The repo's generators exist so debt cannot grow unnoticed. Measured, debt
 * grew: the crap ratchet's frozen `functionsOverCap` went
 * 672 → 701 → 697 → 702 → 691 across its life — a NET +19 over-cap functions
 * and +1 over-cap file since the day it was created.
 *
 * Three separate holes made that possible, and they are one shape:
 *
 *  - `raisedEntries()` compared each file's MAXIMUM complexity plus "new
 *    over-cap file", and never `summary.functionsOverCap` — the exact case the
 *    census exists for, a new over-cap function hiding under a file already at
 *    its frozen max. Worse, the census leg's failure message named the FLAGLESS
 *    regeneration as the remedy, so the reflex path WAS the laundering path.
 *  - `scripts/ci/audit.ts` had no anti-laundering guard at all: `--update`
 *    overwrote `accepted` with whatever `bun audit` reported this minute, and
 *    the RED message hands the developer that exact command. A NEW advisory
 *    could be accepted by running the thing the failure told you to run.
 *  - `observer_shrink_budget.json` — the ceiling on how many observer locators
 *    an ops sweep may delete over HERITAGE RELATION DATA — had no shrink-only
 *    rule, and the only gate over it built its fixture FROM the limits, so it
 *    asserted a property of `>`: `{1e12, 1e12}` passed byte-identically.
 *
 * THE META-RULE, and why it is here rather than in each generator: a script
 * that writes a baseline must be able to REFUSE. The census is derived from
 * `scripts/` so a seventh generator cannot ship ungoverned.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';

const REPO_ROOT = join(import.meta.dir, '..', '..');

/**
 * A generator: a script that rewrites a committed baseline.
 *
 * NOT "writes a file in its own body". The first draft of this census required
 * BOTH a `--update` literal AND a direct `Bun.write`/`writeFileSync` in the same
 * file, and so MISSED `unit_baseline.ts` and `parity_baseline.ts` — which
 * rewrite by DEFAULT (no flag) and delegate the write to
 * `scripts/lib/red_baseline.ts`. They are correctly guarded there; the point is
 * that my census could not see them, which is the same "the list is not the
 * corpus" defect this whole row is about. A generator is now anything that
 * writes a baseline directly OR through the shared writer.
 */
function generators(): { file: string; source: string }[] {
	const found: { file: string; source: string }[] = [];
	for (const dir of ['scripts', 'scripts/ci'] as const) {
		for (const rel of new Glob('*.ts').scanSync({ cwd: join(REPO_ROOT, dir) })) {
			const file = `${dir}/${rel}`;
			const source = readFileSync(join(REPO_ROOT, file), 'utf8');
			const writesDirectly =
				/['"]--update['"]/.test(source) && /Bun\.write|writeFileSync/.test(source);
			const writesViaSharedWriter = /red_baseline\.ts/.test(source);
			if (!writesDirectly && !writesViaSharedWriter) continue;
			found.push({ file, source });
		}
	}
	return found.sort((a, b) => a.file.localeCompare(b.file));
}

/** The refusal a generator must be able to make, in any of its spellings. */
const REFUSES =
	/--allow-regression|REFUSED|REFUSING|only shrinks|refuses to raise|ABOVE the recorded/;

describe('every ratchet refuses its own laundering', () => {
	const all = generators();

	test('the census finds the generators (anti-vacuity)', () => {
		// Derived, not listed: a glob that matched nothing would make the rule
		// below police zero scripts.
		expect(all.length).toBeGreaterThanOrEqual(6);
		const files = all.map((entry) => entry.file);
		expect(files).toContain('scripts/ci/audit.ts');
		expect(files).toContain('scripts/crap_baseline.ts');
		// The two that delegate their write — the ones the first draft could not see.
		expect(files).toContain('scripts/unit_baseline.ts');
		expect(files).toContain('scripts/parity_baseline.ts');
	});

	test('a generator that rewrites a baseline can REFUSE to raise it', () => {
		// A DELEGATING generator is judged by its WRITER, not by its own prose.
		// Measured: neutering the shared writer's guard left this green, because
		// parity_baseline.ts and unit_baseline.ts both DESCRIBE --allow-regression
		// in their headers. Matching prose instead of the guard is the same defect
		// this row is about, one level up.
		const sharedWriter = readFileSync(join(REPO_ROOT, 'scripts/lib/red_baseline.ts'), 'utf8');
		const sharedWriterRefuses =
			/!args\.has\('--allow-regression'\)/.test(sharedWriter) && /REFUSING/.test(sharedWriter);
		const permissive = all
			.filter((entry) => {
				if (/red_baseline\.ts/.test(entry.source)) return !sharedWriterRefuses;
				return !REFUSES.test(entry.source);
			})
			.map((e) => e.file);
		expect(
			permissive,
			'These scripts rewrite a committed baseline on --update with no way to refuse a ' +
				'REGRESSION. A ratchet that records whatever it measured is not a ratchet, it is ' +
				'a diary — and when the RED message names the regeneration as the remedy, the ' +
				`reflex path is the laundering path.\n  ${permissive.join('\n  ')}`,
		).toEqual([]);
	});

	test('the crap ratchet guards its SUMMARY counters, not only per-file maxima', () => {
		// The specific hole that let +19 over-cap functions through: a new over-cap
		// function under a file already at its frozen max moves no per-file entry.
		const source = readFileSync(join(REPO_ROOT, 'scripts/crap_baseline.ts'), 'utf8');
		// BOUNDED to the function body. Slicing to end-of-file let later mentions
		// of the same identifiers satisfy this — measured: deleting the guard
		// entirely left the assertion green.
		const start = source.indexOf('export function raisedEntries');
		const guard = source.slice(start, source.indexOf('\nfunction ', start));
		expect(guard.length).toBeGreaterThan(200);
		expect(guard, 'raisedEntries ignores summary.functionsOverCap again').toContain(
			'functionsOverCap',
		);
		expect(guard).toContain('filesOverCap');
	});

	test('the dependency ratchet cannot accept MORE advisories by reflex', () => {
		const source = readFileSync(join(REPO_ROOT, 'scripts/ci/audit.ts'), 'utf8');
		// BOUNDED to the `if (update)` block: to end-of-file, a --allow-regression
		// mentioned anywhere later satisfied it — measured, deleting the guard left
		// this green.
		const start = source.indexOf('if (update) {');
		const updateBlock = source.slice(start, source.indexOf('\n\tconst baseline =', start));
		expect(updateBlock.length).toBeGreaterThan(200);
		expect(updateBlock, 'the --update path cannot refuse a regression').toContain(
			'--allow-regression',
		);
		// ...and the refusal must come BEFORE the write, not after it.
		expect(updateBlock.indexOf('REFUSED')).toBeGreaterThan(-1);
		expect(updateBlock.indexOf('REFUSED')).toBeLessThan(updateBlock.indexOf('Bun.write'));
	});

	test('the ONE reason-blacklist is shared by both crap validators', () => {
		// GATE-23: the new-file exemption check validated by WORD COUNT while its
		// own failure message promised the blacklist that lived 180 lines away in
		// another describe block — so "This is temporary and we will refactor it
		// later on" was accepted by the rule whose message named it as rejected.
		const gate = readFileSync(join(REPO_ROOT, 'test/unit/crap_complexity_ratchet.test.ts'), 'utf8');
		const declarations = gate.match(/const THIN_REASONS\s*=/g) ?? [];
		expect(declarations.length, 'THIN_REASONS must be declared ONCE and shared').toBe(1);
		// ...and actually applied at BOTH sites.
		expect((gate.match(/THIN_REASONS\.test\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
	});
});
