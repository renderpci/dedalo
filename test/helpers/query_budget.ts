/**
 * QUERY BUDGET — assert how many DATABASE STATEMENTS a piece of work issues.
 *
 * An N+1 is invisible to every assertion about RESULTS: the page renders, the
 * record saves, the export completes — one statement per row instead of one per
 * page, and nothing is red until an install with a real corpus is slow. This
 * helper turns statement COUNT into an assertion, over the tap that
 * `src/core/db/query_tap.ts` opens (all three lanes: pooled, in-transaction and
 * on a reserved connection).
 *
 * THE CORPUS IS MANDATORY, and it is what keeps the assertion honest: a budget
 * measured over an empty situation is satisfied by any ceiling. Pass the number
 * of items the work actually covers (rows read, records saved) and this refuses
 * a zero. A scope that issued NO statement at all is refused for the same
 * reason — it measured nothing.
 *
 * On a breach the failure names the count, the ceiling, the corpus and the
 * CALL SITES that issued the statements, most first: an N+1 is a caller, and a
 * bare number does not say which one.
 */

import { expect } from 'bun:test';
import type { QueryTapReport } from '../../src/core/db/query_tap.ts';
import { runWithQueryTap } from '../../src/core/db/query_tap.ts';

export interface QueryBudget {
	/** Maximum statements the work may issue over this corpus. */
	ceiling: number;
	/** Items the work covers — rows read, records saved. Must be > 0. */
	corpus: number;
}

/** The top call sites, formatted for a failure message. */
function formatCallers(report: QueryTapReport, limit = 5): string {
	if (report.callers.length === 0) return '(no call sites recorded)';
	return report.callers
		.slice(0, limit)
		.map(({ frames, count }) => `  ${count}x ${frames}`)
		.join('\n');
}

/**
 * Run `work` under a query tap and assert it issued at most `ceiling`
 * statements. Returns the work's own result and the tap report, so a caller can
 * assert further (per-lane shares, a specific caller).
 */
export async function expectQueryBudget<T>(
	label: string,
	{ ceiling, corpus }: QueryBudget,
	work: () => Promise<T>,
): Promise<{ result: T; report: QueryTapReport }> {
	expect(
		corpus,
		`query budget "${label}" was given an EMPTY corpus (${corpus}) — a statement count over ` +
			'nothing is satisfied by any ceiling. Build the situation the budget is about first.',
	).toBeGreaterThan(0);

	const { result, report } = await runWithQueryTap(label, work);

	expect(
		report.count,
		`query budget "${label}" saw ZERO statements over a corpus of ${corpus}. Either the work ` +
			'never reached the database, or it bypassed the exported `sql` handle — in both cases ' +
			'the budget measured nothing.',
	).toBeGreaterThan(0);

	expect(
		report.count,
		`query budget "${label}" BREACHED: ${report.count} statements over a corpus of ${corpus} ` +
			`(ceiling ${ceiling}; lanes pooled=${report.byLane.pooled}, ` +
			`transaction=${report.byLane.transaction}, reserved=${report.byLane.reserved}).\n` +
			`Top call sites:\n${formatCallers(report)}`,
	).toBeLessThanOrEqual(ceiling);

	return { result, report };
}
