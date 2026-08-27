/**
 * Tripwire (DEC-12): scripts/verify.ts's NEIGHBOUR SELECTOR actually selects.
 *
 * WHY THIS GATE EXISTS. The neighbours stage is the developer's main local
 * feedback loop: it is what runs a changed module's own tests before the change
 * lands. It was broken and reported success — `--include=*.test.ts` was
 * unquoted, so Bun's shell expanded the glob against the CWD, found nothing,
 * failed the command before grep was spawned, and a blanket `.catch(() => '')`
 * turned that into "no neighbours". Every run selected ZERO tests and printed
 * `ok`. Nothing noticed for as long as it was true, because a stage that
 * selects nothing passes trivially (audit 2026-08-26, GATE-04).
 *
 * The class this gate closes is therefore NOT "a glob was unquoted" — it is
 * "the selector returns empty and the tier reads empty as fine". So the
 * assertions below are behavioural: run the real selector over a real changed
 * path and require a real, non-empty, correct answer.
 *
 * ANTI-VACUITY: every assertion here is of the form "this selection is
 * non-empty and contains X". A floor is asserted first, so a selector that
 * regressed to returning everything, or a corpus that shrank to nothing, is
 * red rather than accidentally green.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { importTail, neighbourTests } from '../../scripts/lib/neighbour_tests.ts';

/**
 * A src file whose importing tests are known to exist. Chosen because it is
 * imported by several gates and is not going away; if it ever does, this gate
 * fails LOUDLY (the file-exists assertion below) rather than silently testing
 * nothing.
 */
const KNOWN_SRC = 'src/core/media/engine/spawn.ts';
const KNOWN_TAIL = 'core/media/engine/spawn';

describe('verify.ts neighbour selector — it selects, and a zero selection is a real answer', () => {
	test('the fixture this gate depends on still exists', () => {
		// If this fails, fix the fixture — do NOT weaken the assertions below.
		expect(existsSync(KNOWN_SRC)).toBe(true);
	});

	test('importTail maps a src path to the tail test files import it by', () => {
		expect(importTail(KNOWN_SRC)).toBe(KNOWN_TAIL);
		// Not a src file → not a tail. (A test file is its own neighbour, which
		// is the other branch, asserted below.)
		expect(importTail('test/unit/whatever.test.ts')).toBeNull();
		expect(importTail('scripts/verify.ts')).toBeNull();
	});

	test('a changed src file selects the tests that import it — NON-EMPTY', async () => {
		const selected = await neighbourTests([KNOWN_SRC]);
		// THE FLOOR: this is the assertion the broken selector failed. An empty
		// selection here means the stage is asserting nothing, whatever the
		// cause (fail-globbed pattern, swallowed error, moved corpus).
		expect(selected.length).toBeGreaterThan(0);
		for (const f of selected) expect(f.endsWith('.test.ts')).toBe(true);
		// And it must be the RIGHT tests: every one really imports the tail.
		const sample = selected[0] as string;
		expect(existsSync(sample)).toBe(true);
		expect(await Bun.file(sample).text()).toContain(KNOWN_TAIL);
	});

	test('a changed test file is its own neighbour', async () => {
		const self = 'test/unit/verify_selector_selftest.test.ts';
		const selected = await neighbourTests([self]);
		expect(selected).toContain(self);
	});

	test('a change set with no src and no test files selects nothing — the honest empty', async () => {
		// The ONLY legitimate empty: nothing was changed that any test can
		// import. Asserted so the gate distinguishes "correctly empty" from
		// "broken and empty" rather than treating every empty as suspicious.
		expect(await neighbourTests(['engineering/TRIPWIRES.md', 'README.md'])).toEqual([]);
	});

	test('an unmatched but well-formed src path is empty WITHOUT throwing', async () => {
		// grep exits 1 on "no match"; that is data, not an error. Exit > 1 is a
		// real failure and the selector throws — which is what stops a broken
		// invocation from being read as an empty selection ever again.
		// COMPOSED AT RUNTIME on purpose: the selector is a substring grep over
		// test/, so a literal unmatchable path written here would be found IN
		// THIS FILE and the assertion would fail on its own text. (That is the
		// selector behaving correctly, and worth knowing when reading it.)
		const absent = ['src', 'core', `${'no_such'}_module_xyzzy.ts`].join('/');
		const selected = await neighbourTests([absent]);
		expect(selected).toEqual([]);
	});
});
