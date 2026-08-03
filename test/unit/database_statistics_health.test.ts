/**
 * database_info statistics-health verdict (WC-073).
 *
 * Guards the detection of a stats-collector reset — the failure that is
 * dangerous precisely because it is SILENT: `autovacuum` reads `on`, every
 * query still answers, and meanwhile autovacuum/autoanalyze have stopped
 * firing because their triggers (`n_mod_since_analyze`, `n_dead_tup`) restart
 * from zero. Observed on dedalo7_mdcat 2026-07-29: 38/43 tables never
 * analyzed, matrix_time_machine reporting 91 live rows against a real
 * 50,993,786.
 *
 * The verdict is pure, so the thresholds are pinned without a database.
 */

import { describe, expect, test } from 'bun:test';
import {
	degradedTableNames,
	summarizeStatisticsHealth,
	type TableStatsRow,
} from '../../src/core/area_maintenance/widgets/database_info.ts';

const MB = 1024 * 1024;

const row = (over: Partial<TableStatsRow> = {}): TableStatsRow => ({
	table: 'matrix',
	reltuples: 1_000_000,
	n_live_tup: 1_000_000,
	never_analyzed: false,
	bytes: 100 * MB,
	...over,
});

describe('database statistics health', () => {
	test('a healthy database is ok', () => {
		const health = summarizeStatisticsHealth([
			row({ table: 'matrix' }),
			row({ table: 'matrix_dd', reltuples: 500, n_live_tup: 500, bytes: 1 * MB }),
		]);
		expect(health.status).toBe('ok');
		expect(health.never_analyzed).toBe(0);
		expect(health.counters_reset).toBe(0);
		expect(health.worst).toEqual([]);
	});

	test('THE RESET SIGNATURE: planner sees a big table, counters see an empty one', () => {
		// The exact mdcat shape: reltuples correct, n_live_tup wiped.
		const health = summarizeStatisticsHealth([
			row({
				table: 'matrix_time_machine',
				reltuples: 50_993_786,
				n_live_tup: 91,
				bytes: 44_000 * MB,
				never_analyzed: true,
			}),
		]);
		expect(health.status).toBe('degraded');
		expect(health.counters_reset).toBe(1);
		expect(health.worst[0]).toContain('matrix_time_machine');
		expect(health.worst[0]).toContain('n_live_tup=91');
		// The operator must be told the CONSEQUENCE, not just the fact.
		expect(health.detail).toContain('will NOT fire');
	});

	test('a never-analyzed table is only loud once it is big enough to matter', () => {
		const small = summarizeStatisticsHealth([
			row({
				table: 'matrix_langs',
				never_analyzed: true,
				bytes: 2 * MB,
				reltuples: 10,
				n_live_tup: 10,
			}),
		]);
		expect(small.status).toBe('ok');
		expect(small.never_analyzed).toBe(1); // counted, just not alarming

		const big = summarizeStatisticsHealth([
			row({ table: 'matrix', never_analyzed: true, bytes: 7_312 * MB }),
		]);
		expect(big.status).toBe('degraded');
	});

	test('a freshly ANALYZEd big table is ok — the fix must clear the alarm', () => {
		// Post-ANALYZE mdcat: counters agree with the planner.
		const health = summarizeStatisticsHealth([
			row({
				table: 'matrix_activity',
				reltuples: 32_944_732,
				n_live_tup: 32_958_721,
				bytes: 81_000 * MB,
				never_analyzed: false,
			}),
		]);
		expect(health.status).toBe('ok');
	});

	test('small tables cannot trip the reset heuristic (ratio is noise there)', () => {
		const health = summarizeStatisticsHealth([
			row({ table: 'matrix_tools', reltuples: 999, n_live_tup: 0, bytes: 1 * MB }),
		]);
		expect(health.counters_reset).toBe(0);
		expect(health.status).toBe('ok');
	});

	test('worst list is largest-first, deduplicated, and capped', () => {
		const rows: TableStatsRow[] = Array.from({ length: 12 }, (_, i) =>
			// every row trips BOTH conditions — dedup must not double-list them
			row({
				table: `matrix_${i}`,
				bytes: (i + 1) * 100 * MB,
				reltuples: 1_000_000,
				n_live_tup: 0,
				never_analyzed: true,
			}),
		);
		const health = summarizeStatisticsHealth(rows);
		expect(health.worst).toHaveLength(8);
		expect(health.worst[0]).toContain('matrix_11');
		expect(new Set(health.worst).size).toBe(8);
	});

	test('an empty catalog is ok, not degraded (repeated below for the scope fn)', () => {
		// Unlike the dataframe scan, nothing is being claimed clean here — this
		// is a readout of what exists, so "no tables" is simply nothing to warn about.
		expect(summarizeStatisticsHealth([]).status).toBe('ok');
	});
});

/**
 * The repair scope (WC-074). `analyze_statistics` must ANALYZE exactly the tables
 * the verdict called offenders — no more (an unrequested whole-database ANALYZE
 * is a different, heavier operation the operator did not authorise) and no fewer
 * (a repair that leaves an offender behind reports success while the warning
 * stays on screen).
 */
describe('degraded table scope for analyze_statistics', () => {
	test('a healthy catalog yields NO tables — the action is a no-op, not a full scan', () => {
		expect(
			degradedTableNames([
				row({ table: 'matrix' }),
				row({ table: 'matrix_dd', reltuples: 500, n_live_tup: 500, bytes: 1 * MB }),
			]),
		).toEqual([]);
		expect(degradedTableNames([])).toEqual([]);
	});

	test('exactly the offenders, largest first', () => {
		const names = degradedTableNames([
			row({ table: 'healthy_big' }),
			row({ table: 'reset_mid', reltuples: 1_000_000, n_live_tup: 0, bytes: 200 * MB }),
			row({
				table: 'small_never',
				never_analyzed: true,
				bytes: 2 * MB,
				reltuples: 10,
				n_live_tup: 10,
			}),
			row({ table: 'reset_big', reltuples: 50_000_000, n_live_tup: 91, bytes: 44_000 * MB }),
		]);
		expect(names).toEqual(['reset_big', 'reset_mid']);
		// the small never-analyzed table is deliberately NOT analyzed: it is
		// counted by the verdict but is not why the verdict is degraded
		expect(names).not.toContain('small_never');
		expect(names).not.toContain('healthy_big');
	});

	test('the scope agrees with the verdict — degraded implies a non-empty scope', () => {
		// The invariant that keeps the button honest: if the panel warns, pressing
		// the button must have something to do.
		const rows = [
			row({ table: 'matrix_activity', reltuples: 32_000_000, n_live_tup: 493, bytes: 81_000 * MB }),
		];
		expect(summarizeStatisticsHealth(rows).status).toBe('degraded');
		expect(degradedTableNames(rows).length).toBeGreaterThan(0);
	});

	test('every returned name is a bare SQL identifier (it gets interpolated)', () => {
		const names = degradedTableNames([
			row({
				table: 'matrix_time_machine',
				reltuples: 50_993_786,
				n_live_tup: 91,
				bytes: 44_000 * MB,
			}),
		]);
		for (const name of names) {
			expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
		}
	});
});
