/**
 * TRIPWIRE — the dataframe integrity scan may never claim a completeness it
 * did not earn (DEC-12: an invariant stated in a header is tripwired or it is
 * deleted).
 *
 * The defect this guards against is not a crash, it is a LIE: a scan that
 * skipped 21 of 24 tables reporting `orphans: 0` reads to an operator as "the
 * database is clean". WC-068 made the panel honest about a scan that never
 * ran; this keeps it honest about a scan that ran PARTIALLY.
 *
 * These assertions are pure — `summarizeCoverage` takes a coverage array and
 * returns the verdict, so the rule is testable without a database and without
 * reproducing an 85 s timeout.
 */

import { describe, expect, test } from 'bun:test';
import {
	DATAFRAME_SCAN_EXEMPT_TABLES,
	type TableCoverage,
	summarizeCoverage,
} from '../../src/core/area_maintenance/widgets/dataframe_control.ts';

const entry = (over: Partial<TableCoverage> & Pick<TableCoverage, 'status'>): TableCoverage => ({
	table: 'matrix_x',
	rows_scanned: 0,
	last_id: 0,
	batches: 0,
	...over,
});

describe('dataframe scan coverage tripwire', () => {
	test('every named exemption carries a non-empty reason', () => {
		const names = Object.keys(DATAFRAME_SCAN_EXEMPT_TABLES);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			const reason = DATAFRAME_SCAN_EXEMPT_TABLES[name] ?? '';
			// A bare allowlist is exactly what "never silently narrow scope"
			// forbids — the operator must be told WHY a table was skipped.
			expect({ name, reason: typeof reason }).toEqual({ name, reason: 'string' });
			expect({ name, long_enough: reason.trim().length > 20 }).toEqual({
				name,
				long_enough: true,
			});
		}
	});

	test('an all-walked scan is complete', () => {
		const verdict = summarizeCoverage([
			entry({ table: 'matrix', status: 'complete', rows_scanned: 49009 }),
			entry({ table: 'matrix_dd', status: 'complete', rows_scanned: 7 }),
		]);
		expect(verdict).toEqual({ complete: true, uncovered: [] });
	});

	test('a table with no relation column still counts as covered (structural)', () => {
		// Unlike an exemption, this is proven by the column check, not assumed.
		const verdict = summarizeCoverage([
			entry({ table: 'matrix', status: 'complete' }),
			entry({ table: 'matrix_counter', status: 'no_relation_column', reason: 'no jsonb relation' }),
		]);
		expect(verdict.complete).toBe(true);
	});

	test.each([
		['exempt', 'append-only activity log'],
		['budget_exhausted', 'stopped after 3 batches'],
		['error', 'canceling statement due to statement timeout'],
	] as const)('status %s makes the whole scan INCOMPLETE', (status, reason) => {
		const verdict = summarizeCoverage([
			entry({ table: 'matrix', status: 'complete', rows_scanned: 49009 }),
			entry({ table: 'matrix_activity', status, reason }),
		]);
		expect(verdict.complete).toBe(false);
		expect(verdict.uncovered).toHaveLength(1);
		// The uncovered line must name the table AND the reason — a bare count
		// would leave the operator unable to act on it.
		expect(verdict.uncovered[0]).toContain('matrix_activity');
		expect(verdict.uncovered[0]).toContain(status);
		expect(verdict.uncovered[0]).toContain(reason);
	});

	test('a partial scan cannot hide behind zero findings', () => {
		// The regression shape: everything the scan DID look at was clean, and
		// the one table it skipped is the 32.9M-row one.
		const verdict = summarizeCoverage([
			entry({ table: 'matrix', status: 'complete' }),
			entry({ table: 'matrix_activity', status: 'exempt', reason: 'append-only activity log' }),
		]);
		expect(verdict.complete).toBe(false);
	});

	test('an exemption with a missing reason is still reported, not swallowed', () => {
		const verdict = summarizeCoverage([entry({ table: 'matrix_activity', status: 'exempt' })]);
		expect(verdict.complete).toBe(false);
		expect(verdict.uncovered[0]).toContain('no reason given');
	});

	test('empty coverage FAILS CLOSED — no completeness by vacuous truth', () => {
		// A discovery pass that found nothing means the discovery query is
		// broken, not that the database is clean. `uncovered.length === 0` would
		// otherwise make the emptiest possible scan the most confident one.
		const verdict = summarizeCoverage([]);
		expect(verdict.complete).toBe(false);
		expect(verdict.uncovered[0]).toContain('examined nothing');
	});
});
