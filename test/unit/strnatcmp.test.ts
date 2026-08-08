/**
 * strnatcmp — the DEFAULT ordering of every datalist (select / checkbox /
 * autocomplete option list) and of resolveLocatorLabels results. Faithful
 * port of the C natsort (Martin Pool's strnatcmp.c, which PHP embeds), so
 * the contract is PHP's, NOT JS's `localeCompare` nor a plain `<`.
 *
 * Pure logic: no DB, no network, no fs. Every case below pins one branch of
 * the three unbounded `for(;;)` loops (main walk, compareRight, compareLeft)
 * — a regression there is either a WRONG ORDER (silently reshuffles every
 * user-facing list) or a HANG (a loop that stops advancing an index blocks
 * the whole Bun process, which is why the sentinel/end-of-string cases are
 * asserted explicitly and kept to short inputs).
 */

import { describe, expect, test } from 'bun:test';
import { strnatcmp } from '../../src/core/relations/datalist.ts';

/** The comparator's sign is the contract (magnitude is not) — compare signs. */
function sign(n: number): number {
	return n < 0 ? -1 : n > 0 ? 1 : 0;
}

/**
 * Antisymmetry is part of the contract: Array.prototype.sort is free to call
 * the comparator in either argument order, so a rule that only holds one way
 * round produces an order that depends on the engine's sort implementation.
 */
function expectOrdered(smaller: string, larger: string): void {
	expect(sign(strnatcmp(smaller, larger))).toBe(-1);
	expect(sign(strnatcmp(larger, smaller))).toBe(1);
}

describe('strnatcmp — whitespace skipping', () => {
	// The reason this port exists: PHP skips whitespace BEFORE each comparison
	// step, so the separator in "Petit 1981" is invisible and '-' (0x2D) is
	// compared against '1' (0x31). A plain `<` comparison would order these
	// the other way round ("Petit 1981" first, because ' ' < '-').
	test('skips whitespace before each step: "Petit-Aledón" < "Petit 1981"', () => {
		expectOrdered('Petit-Aledón', 'Petit 1981');
	});

	// Interior runs of whitespace are not merely collapsed, they are ABSENT:
	// the two strings must compare EQUAL. Catches a "trim() is enough" rewrite.
	test('interior whitespace is invisible: "x  1" === "x1"', () => {
		expect(strnatcmp('x  1', 'x1')).toBe(0);
		expect(strnatcmp('x1', 'x  1')).toBe(0);
	});

	// isSpace covers ' ' plus the \t..\r control range — not just the space
	// character. Tabs/newlines reach labels through pasted data.
	test('tab, newline, vertical tab, form feed and CR all count as space', () => {
		expect(strnatcmp('a\tb', 'ab')).toBe(0);
		expect(strnatcmp('a\nb', 'ab')).toBe(0);
		expect(strnatcmp('ab', 'ab')).toBe(0);
		expect(strnatcmp('a\fb', 'ab')).toBe(0);
		expect(strnatcmp('a\rb', 'ab')).toBe(0);
	});

	// A string that is ONLY whitespace must reach the both-exhausted return.
	// If the space-skip loop ever stops advancing, this HANGS rather than fails.
	test('all-whitespace vs empty terminates and compares equal', () => {
		expect(strnatcmp('   ', '')).toBe(0);
		expect(strnatcmp('', '   ')).toBe(0);
		expect(strnatcmp(' \t\n ', '')).toBe(0);
	});
});

describe('strnatcmp — digit runs compare numerically (compareRight)', () => {
	// The whole point of "natural" order: the LONGER digit run wins, so 12 > 2
	// even though the byte '1' < '2'. Catches a fall-back to byte ordering.
	test('longer digit run is greater', () => {
		expectOrdered('img2', 'img12');
		expectOrdered('a9', 'a10');
		expectOrdered('Item 2', 'Item 10');
	});

	// Equal-length runs: the FIRST digit difference decides — but only once
	// (`bias` is latched). Catches a compareRight that lets a later digit
	// overwrite the remembered bias.
	test('equal-length runs: first digit difference decides and is latched', () => {
		expectOrdered('a19', 'a21');
		// 3<5 at position 1, then 9>1 at position 2 — the latched -1 must win.
		expectOrdered('a139', 'a151');
	});

	// The latched bias must survive to the END of the run: both runs stop on a
	// non-digit and compareRight returns `bias`, not 0. Catches a compareRight
	// that returns 0 once the runs end, which would make these compare equal
	// and leave the order to sort stability.
	test('bias is carried to the end of the run (both runs end on a non-digit)', () => {
		expectOrdered('a13x', 'a15x');
		expectOrdered('v1.2.9', 'v1.3.1');
	});

	// Digit run vs a shorter one that ends mid-string.
	test('run that ends while the other continues is smaller', () => {
		expectOrdered('a1b', 'a12b');
	});
});

describe('strnatcmp — leading zeros compare fractionally (compareLeft)', () => {
	// A leading '0' on EITHER side switches the dispatch to compareLeft, where
	// the first difference decides immediately (0.1 < 0.9 semantics) instead of
	// run length. Dropping the `'0'` dispatch makes "a01" sort AFTER "a1".
	test("either side starting with '0' dispatches to fractional comparison", () => {
		expectOrdered('a01', 'a1');
		expectOrdered('a001', 'a01');
		expectOrdered('a0', 'a1');
	});

	// In compareLeft the SHORTER run is the smaller one when the digits so far
	// are equal (0.1 < 0.10) — the opposite of compareRight's rule. Pins the
	// two helpers as genuinely different code paths.
	test('fractional: shorter equal-prefix run is smaller', () => {
		expectOrdered('a01x', 'a010x');
	});

	// Fractional comparison of equal-length zero-led runs is plain digit order.
	test('fractional: first digit difference decides regardless of run length', () => {
		expectOrdered('a019', 'a02');
	});

	// Both runs identical under compareLeft → 0, and the main loop must
	// `continue` from there rather than return, so the tail still decides.
	test('equal zero-led runs fall through to the tail', () => {
		expectOrdered('a01b', 'a01c');
		expect(strnatcmp('a01b', 'a01b')).toBe(0);
	});
});

describe('strnatcmp — byte ordering, case sensitivity, sentinels', () => {
	// PHP strnatcmp is case SENSITIVE: uppercase sorts before lowercase. A
	// `toLowerCase()` "improvement" (or a swap to localeCompare) flips this.
	test('case-sensitive: uppercase before lowercase', () => {
		expectOrdered('A', 'a');
		expectOrdered('Zulu', 'alpha');
	});

	// Code-point ordering, not locale collation: 'Á' (U+00C1) is GREATER than
	// 'Z'. localeCompare would put 'Ábaco' first — this is the canary for that.
	test('code-point ordering, not locale collation', () => {
		expectOrdered('Zulu', 'Ábaco');
	});

	// A digit and a letter meeting is NOT a numeric comparison — both must be
	// digits to enter compareRight/compareLeft. Digit bytes are below letters.
	test('digit vs letter is a plain byte comparison', () => {
		expectOrdered('a1', 'ab');
		expectOrdered('a9', 'aA');
	});

	// End of string is modelled as the '' sentinel, which is less than every
	// real character — a prefix sorts first. If the sentinel handling regresses
	// so neither index advances, these HANG instead of failing.
	test('end-of-string sentinel: a prefix is smaller', () => {
		expectOrdered('abc', 'abcd');
		expectOrdered('', 'a');
		expectOrdered('a', 'a1');
	});

	test('two empty strings compare equal', () => {
		expect(strnatcmp('', '')).toBe(0);
	});

	test('identical strings compare equal', () => {
		expect(strnatcmp('Petit 1981', 'Petit 1981')).toBe(0);
		expect(strnatcmp('img12', 'img12')).toBe(0);
	});
});

describe('strnatcmp — as a sort comparator', () => {
	// The shape the datalist actually consumes it in.
	test('orders a numbered option list naturally', () => {
		const options = ['Item 10', 'Item 2', 'Item 1'];
		expect(options.sort(strnatcmp)).toEqual(['Item 1', 'Item 2', 'Item 10']);
	});

	test('orders a mixed real-world label list', () => {
		const options = ['fig10', 'fig9', 'fig1', 'Fig2', 'fig 3'];
		// 'Fig2' first (uppercase F < lowercase f); the rest natural-numeric,
		// with 'fig 3' equal to a bare 'fig3' because the space is skipped.
		expect(options.sort(strnatcmp)).toEqual(['Fig2', 'fig1', 'fig 3', 'fig9', 'fig10']);
	});
});
