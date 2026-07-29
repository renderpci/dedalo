/**
 * database_info statistics-health verdict (WC-070).
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
	type TableStatsRow,
	summarizeStatisticsHealth,
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

	test('an empty catalog is ok, not degraded', () => {
		// Unlike the dataframe scan, nothing is being claimed clean here — this
		// is a readout of what exists, so "no tables" is simply nothing to warn about.
		expect(summarizeStatisticsHealth([]).status).toBe('ok');
	});
});
