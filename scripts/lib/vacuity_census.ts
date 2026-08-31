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

/** The opening of a test body we care about. `test.skip`/`todo` are the honest forms. */
const TEST_OPEN = /\b(?:test|it)\s*(?:\.(?:only|each\([^)]*\)))?\s*\(/;

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
		for (const [index, raw] of lines.entries()) {
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
		// A floor is any assertion that something was actually counted.
		const hasFloor = /toBeGreaterThan(?:OrEqual)?\s*\(|\.length\s*\)\s*\.toBe\s*\(\s*[1-9]/.test(
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
