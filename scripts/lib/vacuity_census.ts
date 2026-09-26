/**
 * THE VACUITY CENSUS (P2-19 / GATE-25..29, GATE-32).
 *
 * A test that returns before it asserts anything is counted by Bun as a PASS.
 * The repo had ~350 such sites. The sharpest: the P5 install gate's header says
 * it "Skips loudly when no admin Postgres connection is available" while its
 * body returns bare with no output at all — so the entire PHP-free install path
 * reported two green ticks having spawned nothing whenever the developer's role
 * lacked CREATEDB.
 *
 * The honest idiom is `test.skip` with the reason in the test NAME: the runner
 * then says out loud what did not run. This module finds the dishonest ones.
 */

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

export interface VacuitySite {
	file: string;
	line: number;
	text: string;
}

/** Anything that makes a test body actually assert something. */
const ASSERTION = /\bexpect\s*\(|\bexpectTypeOf\s*\(|\.toThrow\b|assert[A-Z]\w*\s*\(/;

/**
 * The opening of a test body we care about. `test.skip`/`todo` are the honest
 * forms.
 *
 * NOT a method call: `\b` alone matched `regex.test(value)` and `node.it(...)`,
 * which opened a phantom body over whatever followed — every guard clause in
 * the parsing helpers underneath a `.test(` call was then counted as a test
 * returning before it asserted. A leading `.` (or an identifier character)
 * disqualifies the match; a bare `test(`, `it(`, `test.only(`, `test.each(…)(`
 * at the start of an expression still opens one.
 *
 * CONDITIONAL REGISTRATIONS COUNT. `test.if(cond)(…)` and its siblings were in
 * no version of this pattern, so 212 registrations across test/ could not open
 * a body at all — a bare `return;` in any of them was invisible to this census
 * and a PASS to bun. One such body (widgets_differential's sequences_status,
 * which guards on hasLivePhpOracle() twice) was only ever counted because a
 * PROSE comment above it opened a phantom body by accident; fixing the prose
 * bug exposed the real hole rather than creating it.
 */
const MODIFIER_ARGUMENT = '\\((?:[^()]|\\([^()]*\\))*\\)';
const TEST_OPEN = new RegExp(
	`(?:^|[^.\\w$])(?:test|it)\\s*(?:\\.(?:only|skip|todo|failing|(?:each|if|skipIf|todoIf|failingIf)${MODIFIER_ARGUMENT}))?\\s*\\(`,
);

/**
 * Bare `return;` (or `return` with nothing but whitespace/comment after) — the
 * silent form. `return someValue` is not this shape, and neither is a `return`
 * that follows an assertion, which is ordinary control flow.
 */
const BARE_RETURN = /^\s*(?:if\s*\(.*\)\s*)?return\s*;/;

/**
 * Walk each test body and report a bare `return` reached before the body's
 * first assertion. Brace-matched, so a nested helper's early return inside an
 * already-asserting body is not reported.
 */
export function vacuitySites(repoRoot: string): VacuitySite[] {
	const found: VacuitySite[] = [];
	for (const match of new Glob('**/*.test.ts').scanSync({ cwd: join(repoRoot, 'test') })) {
		const file = relative(repoRoot, join(repoRoot, 'test', match));
		const lines = readFileSync(join(repoRoot, file), 'utf8').split('\n');
		let depth = 0;
		let inBody = false;
		let asserted = false;
		let inComment = false;
		for (const [index, raw] of lines.entries()) {
			// PROSE IS NOT CODE. A header sentence like "a rule knows it (leg 5)"
			// matched TEST_OPEN and opened a phantom body over the parsing helpers
			// below it, whose guard clauses were then counted as tests returning
			// before they asserted. Comment lines are skipped outright — a `test(`
			// inside a comment opens nothing and a `return;` inside one is not code.
			const trimmed = raw.trim();
			const wasInComment = inComment;
			if (inComment) {
				if (trimmed.includes('*/')) inComment = false;
			} else if (/^\/\*/.test(trimmed) && !trimmed.includes('*/')) {
				inComment = true;
			}
			if (wasInComment || inComment || trimmed.startsWith('//') || trimmed.startsWith('*')) {
				continue;
			}
			if (!inBody && TEST_OPEN.test(raw)) {
				inBody = true;
				asserted = false;
				depth = 0;
			}
			if (!inBody) continue;
			if (ASSERTION.test(raw)) asserted = true;
			if (!asserted && BARE_RETURN.test(raw)) {
				found.push({ file, line: index + 1, text: raw.trim() });
			}
			for (const char of raw) {
				if (char === '{') depth += 1;
				else if (char === '}') depth -= 1;
			}
			// Body closed (the opening line's braces balance back out).
			if (depth <= 0 && raw.includes('}')) inBody = false;
		}
	}
	return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/**
 * Gates whose verdict is `toEqual([])` — "this list is empty". Such an
 * assertion passes when the census that feeds it read NOTHING, so each one
 * needs a corpus floor (a minimum the scan must have seen) and ideally a
 * planted-offender positive control.
 */
export function emptinessAssertions(repoRoot: string): VacuitySite[] {
	const found: VacuitySite[] = [];
	for (const match of new Glob('**/*.test.ts').scanSync({ cwd: join(repoRoot, 'test') })) {
		const file = relative(repoRoot, join(repoRoot, 'test', match));
		const source = readFileSync(join(repoRoot, file), 'utf8');
		// A floor is any assertion that something was actually counted —
		// INCLUDING `toHaveLength(n)` with n > 0, which is the same statement in
		// bun's own vocabulary and was being missed, so a gate that proves its
		// corpus with `expect(regions).toHaveLength(2)` counted as floorless.
		const hasFloor =
			/toBeGreaterThan(?:OrEqual)?\s*\(|\.length\s*\)\s*\.toBe\s*\(\s*[1-9]|toHaveLength\s*\(\s*[1-9]/.test(
				source,
			);
		if (hasFloor) continue;
		for (const [index, raw] of source.split('\n').entries()) {
			if (/\.toEqual\(\s*\[\s*\]\s*\)/.test(raw)) {
				found.push({ file, line: index + 1, text: raw.trim() });
			}
		}
	}
	return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/**
 * The corpus floor {@link testFilesScanned} must CLEAR (strictly above), in ONE place:
 * test/unit/gate_vacuity_tripwire.test.ts asserts it and scripts/gate_vacuity_budget.ts
 * `--check --json` calls a walk at or under it a regression (a blind census would look
 * like the best burn-down ever). Two literals would drift apart and let one door accept
 * what the other refuses.
 */
export const CORPUS_FLOOR = 400;

/**
 * How many `*.test.ts` files the two censuses above walk.
 *
 * The anti-vacuity probe used to floor the number of OFFENDING files, which is
 * a ratchet read backwards: both counts are meant to fall to zero, so the day
 * the suite gets clean the probe that proves the walk happened goes red. The
 * corpus size is the honest witness — it only grows.
 */
export function testFilesScanned(repoRoot: string): number {
	return [...new Glob('**/*.test.ts').scanSync({ cwd: join(repoRoot, 'test') })].length;
}
