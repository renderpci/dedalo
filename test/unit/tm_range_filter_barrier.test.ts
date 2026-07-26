/**
 * TIME MACHINE range-filter PLANNER BARRIER (2026-07-26).
 *
 * A dd15 search whose filter is a RANGE (the dd559 When date search) combined
 * with the default `id` order has no index carrying both the scope and the sort:
 * `("timestamp", id DESC)` orders by timestamp across a range, the PK orders by
 * id but cannot scope. The planner walks the `id` PK filtering inline, betting
 * LIMIT lets it stop early — and on this APPEND-ONLY log the filtered column
 * correlates with `id`, so every match sits at the far end. Measured on the
 * 50.5M-row mdcat log: a 2026 When-search discarded 45,992,453 PK entries to
 * return 10 rows — 51.2 s at offset 30 and 48.9 s at offset 1000 (so it is NOT
 * the deep-page/WC-046 problem). `OFFSET 0` in the innermost select blocks the
 * LIMIT pushdown; the range is then scanned index-only and top-N sorted: 425 ms
 * and 309 ms end-to-end, verified to return the IDENTICAL page (same ids, same
 * order) as the unbarriered query.
 *
 * The rule this gate pins: the barrier applies to (RANGE filter × id order) and
 * to nothing else. An EQUALITY filter is served outright by its `(col, id DESC)`
 * index — 4 ms measured — and barriering it would force a full range scan.
 */

import { describe, expect, test } from 'bun:test';
import { conformTmFilter } from '../../src/core/resolve/tm_filter.ts';
import type { ParamSink } from '../../src/core/resolve/tm_filter.ts';

function conform(filter: unknown): { sql: string | null; sink: ParamSink } {
	const sink: ParamSink = { params: [] };
	return { sql: conformTmFilter(filter, sink), sink };
}

const clause = (componentTipo: string, q: unknown, operator = '') => ({
	$and: [{ q, operator, path: [{ component_tipo: componentTipo, section_tipo: 'dd15' }] }],
});

describe('tm_filter range detection (drives the planner barrier)', () => {
	test('a When (dd559) date search is a RANGE — even a single day', () => {
		for (const q of ['2026', '2026-03', '2026-03-14']) {
			const { sql, sink } = conform(clause('dd559', q));
			expect(sql, `dd559 q=${q} produced no SQL`).not.toBeNull();
			expect(sink.rangePredicate, `dd559 q=${q} not flagged as a range`).toBe(true);
		}
	});

	test('a What (dd577) equality search is NOT a range', () => {
		const { sql, sink } = conform(clause('dd577', 'rsc33'));
		expect(sql).not.toBeNull();
		expect(sink.rangePredicate).toBeUndefined();
	});

	test('a Who (dd578) locator equality is NOT a range', () => {
		const { sql, sink } = conform(clause('dd578', { section_id: '1', section_tipo: 'dd128' }));
		expect(sql).not.toBeNull();
		expect(sink.rangePredicate).toBeUndefined();
	});

	test('a Process (dd1371) numeric EQUALITY is not a range, but >= is', () => {
		const eq = conform(clause('dd1371', '751'));
		expect(eq.sql).not.toBeNull();
		expect(eq.sink.rangePredicate).toBeUndefined();

		const range = conform(clause('dd1371', '>=751'));
		expect(range.sql).not.toBeNull();
		expect(range.sink.rangePredicate).toBe(true);
	});

	test('a Value (dd1574) contains-search is NOT a range (ILIKE, not a comparison)', () => {
		const { sql, sink } = conform(clause('dd1574', 'foo'));
		expect(sql).not.toBeNull();
		expect(sink.rangePredicate).toBeUndefined();
	});

	test('the flag survives nesting — a range inside $or still flags', () => {
		const { sink } = conform({
			$or: [clause('dd577', 'rsc33'), clause('dd559', '2026')],
		});
		expect(sink.rangePredicate).toBe(true);
	});
});
