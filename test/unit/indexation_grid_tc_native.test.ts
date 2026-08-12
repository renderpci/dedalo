/**
 * OptimizeTC parity + the indexation grid's AUTHZ-05 scoping — the two majors
 * the 2026-08 oh1 beta audit found in section/indexation_grid.ts (§5.3 "Back
 * office and public site compute different fragment time codes", §5.4 "the
 * thesaurus indexation grid re-implements scoping").
 *
 * ── 1. OptimizeTC ────────────────────────────────────────────────────────
 * The v1 publication API (still PHP, still the supported path for the live
 * oral-history websites) computes a tagged fragment's time codes with
 * v7_php_frozen/master_dedalo/shared/class.OptimizeTC.php (the class has ONE
 * copy in the frozen tree; the v1 API reaches it through
 * publication/server_api/v1/common/class.web_data.php :2535 and
 * .../class.free_node.php :265). The back office must
 * compute the SAME numbers or an operator's grid and the public site disagree
 * about where a fragment starts. The TS grid used to do a bare nearest-mark
 * scan — no 55-char validation margin, no forward fallback, no virtual-TC
 * interpolation — and drifted by up to 57 s on real oral-history data.
 *
 * The expectations here are NOT hand-written: they are CAPTURED FROM THE
 * FROZEN PHP ORACLE (v7_php_frozen/master_dedalo/shared/class.OptimizeTC.php,
 * OptimizeTC v1.0.4) into fixtures/optimize_tc_native/optimize_tc.oracle.json
 * by running the real class over this corpus under PHP 8.5. NEVER regenerate
 * that file from TS output — recapture it from the PHP class.
 *
 * The corpus is deliberately built out of the shapes that SEPARATE the two
 * algorithms (a naive scan fails 13 of the 24 in/out cases): margin hits,
 * forward fallbacks, virtual interpolations, PHP's falsy-position quirk, the
 * +100 out-margin stepping over a nearby mark, astral characters (mb_* counts
 * CHARACTERS, not UTF-16 code units) and the free-search position branch. The
 * AV golden's own seed text is in there too, so this gate and
 * indexation_grid_av_native.test.ts pin the same numbers.
 *
 * ── 2. AUTHZ-05 ──────────────────────────────────────────────────────────
 * The grid used to re-implement the rule with `isRecordInScope` alone, which
 * is only the PROJECTS half. Sections in the projects-filter-exempt tables
 * (matrix_hierarchy, matrix_dd, matrix_list, matrix_langs, …) are in scope for
 * EVERY authenticated user, so the section read grant was the only remaining
 * defence and the grid never asked for it. Both sides are asserted here
 * against real users of the test database (read-only).
 *
 * The read-grant half is a DELIBERATE DIVERGENCE, not a parity restoration:
 * PHP's `get_ar_section_top_tipo()` filters by user PROJECTS only. Declared in
 * WC-2026-08-09-indexation-grid-read-grant-scope. The door registry itself
 * lives in test/unit/security_audit_2026_07_23_tripwire.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	optimizeTcIn,
	optimizeTcOut,
	secondsToTc,
	tcToSeconds,
} from '../../src/core/resolve/optimize_tc.ts';
import { scopeIndexationGroups } from '../../src/core/section/indexation_grid.ts';
import { getPermissions, type Principal } from '../../src/core/security/permissions.ts';
import { isRecordInScope } from '../../src/core/security/record_scope.ts';
import oracle from './fixtures/optimize_tc_native/optimize_tc.oracle.json';

interface OracleCase {
	id: string;
	fn: 'in' | 'out' | 'tc2seg' | 'seg2tc';
	note: string;
	text: string;
	seg?: number;
	tag?: string | null;
	pos?: number | null;
	margin?: number;
	php: string | number | null;
}

const CASES = oracle.cases as OracleCase[];
const caseById = (id: string): OracleCase => {
	const found = CASES.find((c) => c.id === id);
	if (found === undefined) throw new Error(`oracle corpus has no case '${id}'`);
	return found;
};

describe('OptimizeTC: the grid computes the SAME fragment time codes as the v1 publication API', () => {
	test('the oracle corpus is the frozen PHP capture, not a TS regeneration', () => {
		expect(oracle._source).toContain('class.OptimizeTC.php');
		// A corpus that lost its in/out cases would make this whole file green
		// while asserting nothing about the algorithm.
		const inOut = CASES.filter((c) => c.fn === 'in' || c.fn === 'out');
		expect(inOut.length).toBeGreaterThanOrEqual(20);
		expect(CASES.filter((c) => c.fn === 'seg2tc').length).toBeGreaterThanOrEqual(8);
		expect(CASES.filter((c) => c.fn === 'tc2seg').length).toBeGreaterThanOrEqual(6);
	});

	for (const c of CASES.filter((c) => c.fn === 'in')) {
		test(`optimize_tc_in — ${c.id} (${c.note})`, () => {
			expect(optimizeTcIn(c.text, c.tag ?? null, c.pos ?? null, c.margin ?? 100)).toBe(
				c.php as string,
			);
		});
	}

	for (const c of CASES.filter((c) => c.fn === 'out')) {
		test(`optimize_tc_out — ${c.id} (${c.note})`, () => {
			expect(optimizeTcOut(c.text, c.tag ?? null, c.pos ?? null, c.margin ?? 100)).toBe(
				c.php as string,
			);
		});
	}

	for (const c of CASES.filter((c) => c.fn === 'tc2seg')) {
		test(`TC2seg — ${c.id}`, () => {
			expect(tcToSeconds(c.text)).toBeCloseTo(c.php as number, 6);
		});
	}

	for (const c of CASES.filter((c) => c.fn === 'seg2tc')) {
		test(`seg2tc — ${c.id}`, () => {
			// PHP's own formatting quirks included (negative seconds render as
			// '00:00:-5.000', a 999.5+ ms remainder renders as '.1000'): the public
			// site shows exactly these strings, so parity means reproducing them.
			expect(secondsToTc(c.seg as number)).toBe(c.php as string);
		});
	}

	test('the three algorithm halves a naive nearest-mark scan does not have', () => {
		// Forward fallback: the previous mark is beyond the 55-char validation
		// margin and the FOLLOWING one is inside it.
		const forward = caseById('far_prev_near_next_in');
		expect(forward.php).toBe('00:01:40.000');
		expect(optimizeTcIn(forward.text, forward.tag ?? null, null, 0)).not.toBe('00:01:00.000');

		// Virtual TC: neither neighbour is inside the margin, so the time code is
		// interpolated from the characters-per-second rate between them.
		const virtual = caseById('virtual_interpolation_in');
		expect(virtual.php).toBe('00:01:52.886');
		expect(optimizeTcIn(virtual.text, virtual.tag ?? null, null, 0)).not.toBe('00:01:00.000');

		// mb_* character positions: 20 astral characters between the mark and the
		// tag keep it inside the 55-CHARACTER margin although it is 70 UTF-16
		// code units away.
		const astral = caseById('astral_chars_in');
		expect(astral.text).toMatch(/[\uD800-\uDBFF]/);
		expect(optimizeTcIn(astral.text, astral.tag ?? null, null, 0)).toBe('00:03:00.000');
	});

	test('the AV golden fixture and this gate pin the same time codes', () => {
		const tcIn = caseById('av_golden_seed_in');
		const tcOut = caseById('av_golden_seed_out');
		expect(optimizeTcIn(tcIn.text, tcIn.tag ?? null, null, 0)).toBe('00:00:05.000');
		expect(optimizeTcOut(tcOut.text, tcOut.tag ?? null, null, 100)).toBe('00:00:12.500');
		// The AV cell's derived numbers (av_grid.golden.json tc_in_secs /
		// tc_out_secs / duration_tc).
		expect(tcToSeconds('00:00:05.000')).toBe(5);
		expect(tcToSeconds('00:00:12.500')).toBe(12.5);
		expect(secondsToTc(12.5 - 5)).toBe('00:00:07.500');
	});

	test('the intentional zero-position short circuit never scans', () => {
		const zero = caseById('start_position_zero');
		expect(optimizeTcIn(zero.text, null, 0, 100)).toBe('00:00:00.000');
	});
});

// ---------------------------------------------------------------------------
// AUTHZ-05
// ---------------------------------------------------------------------------

/**
 * Real principals of the test database (read-only). user 0 is the shape the
 * audit found: it holds NO read grant on `ad1` yet `ad1` lives in
 * matrix_hierarchy, which the projects filter exempts — so the projects half
 * alone admits the record.
 */
const NON_ADMIN: Principal = { userId: 0, isGlobalAdmin: false, isDeveloper: false };
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

/** UNGATED section + a real record: read grant 0, projects filter says yes. */
const DENIED = { tipo: 'ad1', id: '1' };
/** Same table, but user 0 does hold a read grant. */
const ALLOWED = { tipo: 'dd1000', id: '1' };

function groupsOf(...entries: { tipo: string; id: string }[]): Map<string, Map<string, unknown[]>> {
	const groups = new Map<string, Map<string, unknown[]>>();
	for (const entry of entries) {
		const byId = groups.get(entry.tipo) ?? new Map<string, unknown[]>();
		byId.set(entry.id, [{ section_tipo: entry.tipo, section_id: entry.id }]);
		groups.set(entry.tipo, byId);
	}
	return groups;
}

const flatten = (groups: Map<string, Map<string, unknown[]>>): string[] =>
	[...groups].flatMap(([tipo, byId]) => [...byId.keys()].map((id) => `${tipo}/${id}`)).sort();

describe('AUTHZ-05: the indexation grid scopes through the SHARED helper', () => {
	test('the audit premise holds: the projects half alone admits a record the caller may not read', async () => {
		// If this ever stops being true the DENIED fixture has lost its teeth and
		// the next assertion would pass for the wrong reason.
		expect(await getPermissions(NON_ADMIN, DENIED.tipo, DENIED.tipo)).toBe(0);
		expect(await isRecordInScope(DENIED.tipo, Number(DENIED.id), NON_ADMIN)).toBe(true);
		expect(await getPermissions(NON_ADMIN, ALLOWED.tipo, ALLOWED.tipo)).toBeGreaterThanOrEqual(1);
		expect(await isRecordInScope(ALLOWED.tipo, Number(ALLOWED.id), NON_ADMIN)).toBe(true);
	});

	test('a caller with no read grant on the section loses its rows', async () => {
		const scoped = await scopeIndexationGroups(groupsOf(DENIED, ALLOWED), NON_ADMIN);
		expect(flatten(scoped)).toEqual([`${ALLOWED.tipo}/${ALLOWED.id}`]);
		// An emptied section leaves no husk group behind.
		expect(scoped.has(DENIED.tipo)).toBe(false);
	});

	test('a global admin stays unscoped', async () => {
		const scoped = await scopeIndexationGroups(groupsOf(DENIED, ALLOWED), ADMIN);
		expect(flatten(scoped)).toEqual(
			[`${ALLOWED.tipo}/${ALLOWED.id}`, `${DENIED.tipo}/${DENIED.id}`].sort(),
		);
	});

	test('the grid delegates to scopeInverseReferenceHits and keeps no private copy of the rule', () => {
		const src = readFileSync(
			join(import.meta.dir, '..', '..', 'src', 'core', 'section', 'indexation_grid.ts'),
			'utf8',
		);
		// Under the AUTHZ-05 tripwire: the shared helper, by name.
		expect(src).toContain("import('../security/record_scope.ts')");
		expect(src).toMatch(/scopeInverseReferenceHits\(hits, principal\)/);
		// And NOT a private re-implementation of the projects half: no CALL to
		// isRecordInScope survives anywhere in the grid (prose may name it).
		expect(src).not.toMatch(/\bisRecordInScope\s*\(/);
	});
});
