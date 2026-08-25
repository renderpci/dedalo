/**
 * `compareSemver` — the sole decision behind the system_info panel's
 * "Bun supported version" requirement row (plan §4.1.3).
 *
 * OPERATOR-VISIBLE FAILURE THIS GATES: the maintenance panel reports an
 * UNDER-FLOOR Bun runtime as supported (a green requirement row), so the
 * operator upgrades nothing and the engine runs on a runtime it is not
 * validated for — or the inverse, a healthy install painted red.
 *
 * The row is `compareSemver(Bun.version, MIN_BUN) >= 0` with MIN_BUN '1.4.0';
 * the cases below are chosen so that a lexical / localeCompare
 * "simplification" cannot pass (a `1.4` vs `1.3` case would — that is theatre).
 */

import { describe, expect, test } from 'bun:test';
import { compareSemver } from '../../src/core/area_maintenance/widgets/system_info.ts';

describe('compareSemver', () => {
	// Numeric, NOT lexical: '1.3.10' < '1.3.9' as strings.
	test('compares each segment NUMERICALLY (1.3.10 is newer than 1.3.9)', () => {
		expect(compareSemver('1.3.10', '1.3.9')).toBeGreaterThan(0);
		expect(compareSemver('1.3.9', '1.3.10')).toBeLessThan(0);
		expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
	});

	test('the requirement row verdict: 1.3.10 passes the 1.3.9 floor, 1.3.8 does not', () => {
		expect(compareSemver('1.3.10', '1.3.9') >= 0).toBe(true);
		expect(compareSemver('1.3.8', '1.3.9') >= 0).toBe(false);
		expect(compareSemver('1.3.9', '1.3.9') >= 0).toBe(true);
	});

	// Missing segments pad with 0 (`?? 0`): a 2-segment version equals its
	// 3-segment spelling. Without the padding '1.4' would read as BELOW '1.4.0'.
	test('missing trailing segments pad with 0 across segment counts', () => {
		expect(compareSemver('1.4', '1.4.0')).toBe(0);
		expect(compareSemver('1.4.0', '1.4')).toBe(0);
		expect(compareSemver('2', '2.0.0')).toBe(0);
		expect(compareSemver('1.4', '1.3.9')).toBeGreaterThan(0);
	});

	test('equal versions compare equal; only the first differing segment decides', () => {
		expect(compareSemver('1.3.9', '1.3.9')).toBe(0);
		expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
	});

	/**
	 * UNPARSABLE INPUT — measured, and it CORRECTS plan §4.4 D6.
	 *
	 * D6 claims "NaN arithmetic makes every diff NaN and the loop falls through
	 * to 0 = EQUAL = SUPPORTED". That is wrong: `NaN !== 0` is TRUE, so the
	 * loop RETURNS on the first segment, and `NaN > 0` is false, so the result
	 * is -1 — the panel reports an unparsable runtime as BELOW the floor, i.e.
	 * fail-closed. That is the behaviour we want from a version floor, so it is
	 * pinned as the contract, not as a defect.
	 *
	 * The residual oddity (named, not fixed here): the function is not
	 * antisymmetric across an unparsable operand — both directions return -1.
	 * Harmless for the sole caller (which only asks `>= 0` against a literal
	 * MIN_BUN), but any second caller must not assume `cmp(a,b) === -cmp(b,a)`.
	 */
	test('an unparsable version fails the floor (-1), and does so in BOTH directions', () => {
		expect(compareSemver('x.y.z', '1.3.9')).toBe(-1);
		expect(compareSemver('x.y.z', '1.3.9') >= 0).toBe(false); // panel says "not supported"
		expect(compareSemver('1.3.9', 'x.y.z')).toBe(-1); // NOT antisymmetric — see above
	});
});
