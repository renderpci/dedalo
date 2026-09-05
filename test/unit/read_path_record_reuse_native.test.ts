/**
 * ONE ROW, ONE READ — the behavioural half of audit PERF-06.
 *
 * `read_path_record_reuse_tripwire.test.ts` pins the SHAPE (no bare
 * `readMatrixRecord` left on the read path). This gate measures the OUTCOME on
 * a real database: inside one section-read scope, resolving K different columns
 * that all live on the SAME matrix row costs ONE statement, not K.
 *
 * WHY THAT NUMBER MATTERS. `readMatrixRecord` fetches a whole row — every JSONB
 * column plus its `::text` twin. The multiplier the audit measured is the
 * reference-label path: `relations/related.ts` labelOfReference resolves each
 * reference through `resolve/relation_list.ts` once per show-column and passed
 * no loader, so R references × K columns cost R×K full-row reads of R rows.
 * That default is now the read-scoped memo, which is exactly what leg 1
 * measures — and leg 2 is its own mutation control: the SAME work outside the
 * scope, where the count must rise with K.
 *
 * THE CORPUS is the museum-scale scratch corpus (built here, torn down here,
 * residue asserted 0). Every leg asserts the column count it measured over: a
 * "1 statement" claim over ONE column is satisfied by any implementation.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { runWithRecordMemo } from '../../src/core/db/record_memo.ts';
import {
	resolveCellValue,
	resolveRelationTargetValues,
} from '../../src/core/resolve/relation_list.ts';
import {
	ZZSCALE_INDEX_OWNER_COMPONENT,
	ZZSCALE_INDEX_OWNER_ID,
	ZZSCALE_ORDER_COMPONENT,
	ZZSCALE_PARENT_COMPONENT,
	ZZSCALE_SECTION,
	ZZSCALE_TERM_COMPONENT,
	ZZSCALE_WIDE_PARENT_ID,
} from '../../src/core/test_data/situations/zzscale_constants.ts';
import {
	dropZzScaleCorpus,
	ensureZzScaleCorpus,
} from '../../src/core/test_data/situations/zzscale_corpus.ts';
import { expectQueryBudget } from '../helpers/query_budget.ts';

/**
 * The show-columns of one row: a term, a number, the parent link and the portal
 * — four DIFFERENT components, one matrix row. This is the shape a list column
 * set and a reference label both have.
 */
const SHOW_COLUMNS = [
	ZZSCALE_TERM_COMPONENT,
	ZZSCALE_ORDER_COMPONENT,
	ZZSCALE_PARENT_COMPONENT,
	ZZSCALE_INDEX_OWNER_COMPONENT,
] as const;

/** The floor every leg's claim is only meaningful above. */
const COLUMN_FLOOR = 3;

/**
 * CEILING — K columns of ONE row inside a read scope. Arithmetic: one row read.
 * Measured 1; the ceiling is 2 so one extra resolver read cannot fail the gate,
 * and it is far below K = 4, which is what a per-column read would cost.
 */
const MEMOIZED_CEILING = 2;

/**
 * CEILING — the same K columns PLUS the portal target walk on the same row.
 * Arithmetic: the owner row ONCE (that is the shared read the memo owns) plus
 * one read per distinct dd96 TARGET row (2) and their label resolution. Measured
 * 5; the ceiling is 6. The unmemoized twin below is what says the number means
 * something.
 */
const TWO_DOOR_CEILING = 6;

async function resolveShowColumns(sectionId: number): Promise<(string | null)[]> {
	const unresolved: string[] = [];
	const values: (string | null)[] = [];
	for (const column of SHOW_COLUMNS) {
		values.push(await resolveCellValue(ZZSCALE_SECTION, sectionId, column, 'lg-nolan', unresolved));
	}
	return values;
}

beforeAll(async () => {
	await ensureZzScaleCorpus();
}, 120000);

afterAll(async () => {
	expect(await dropZzScaleCorpus()).toBe(0);
}, 120000);

test('K columns of one row cost ONE row read inside a section-read scope', async () => {
	expect(SHOW_COLUMNS.length).toBeGreaterThanOrEqual(COLUMN_FLOOR);
	// Warm: the ontology/model resolver reads happen once per process, not per row.
	await runWithRecordMemo(() => resolveShowColumns(ZZSCALE_WIDE_PARENT_ID));

	const { result } = await expectQueryBudget(
		'show columns of one row, memoized',
		{ ceiling: MEMOIZED_CEILING, corpus: SHOW_COLUMNS.length },
		async () => runWithRecordMemo(() => resolveShowColumns(ZZSCALE_WIDE_PARENT_ID)),
	);
	// The columns really resolved — a gate over four nulls would measure nothing.
	expect((result as (string | null)[]).filter((value) => value !== null).length).toBeGreaterThan(0);
});

test('MUTATION CONTROL — outside the scope the same work pays one read PER COLUMN', async () => {
	// The memo degrades to a direct read with no scope active, which makes this
	// the honest neutering of leg 1: same code, same corpus, no memo. If the
	// count did NOT rise here, leg 1's ceiling would be measuring nothing.
	await resolveShowColumns(ZZSCALE_WIDE_PARENT_ID); // warm, same as leg 1

	await expect(
		expectQueryBudget(
			'show columns of one row, unmemoized',
			{ ceiling: MEMOIZED_CEILING, corpus: SHOW_COLUMNS.length },
			async () => resolveShowColumns(ZZSCALE_WIDE_PARENT_ID),
		),
	).rejects.toThrow(/BREACHED/);
});

test('two DIFFERENT doors on the same row still share the one read', async () => {
	// resolveCellValue and resolveRelationTargetValues are separate entry points
	// with separate callers (a list cell and the export/portal target walk); the
	// memo is what makes them one read rather than two.
	const owner = ZZSCALE_INDEX_OWNER_ID;
	await runWithRecordMemo(async () => {
		await resolveShowColumns(owner);
		await resolveRelationTargetValues(
			ZZSCALE_SECTION,
			owner,
			ZZSCALE_INDEX_OWNER_COMPONENT,
			'lg-nolan',
			[],
		);
	});

	const { result } = await expectQueryBudget(
		'two doors, one row',
		{ ceiling: TWO_DOOR_CEILING, corpus: SHOW_COLUMNS.length + 1 },
		async () =>
			runWithRecordMemo(async () => {
				await resolveShowColumns(owner);
				return resolveRelationTargetValues(
					ZZSCALE_SECTION,
					owner,
					ZZSCALE_INDEX_OWNER_COMPONENT,
					'lg-nolan',
					[],
				);
			}),
	);
	// The portal door really resolved its locators (the corpus's two dd96 targets).
	expect((result as unknown[]).length).toBeGreaterThan(0);

	// …and the same combined work WITHOUT the scope pays strictly more, which is
	// this leg's own mutation control.
	const { report: unmemoized } = await expectQueryBudget(
		'two doors, one row, unmemoized',
		{ ceiling: 100, corpus: SHOW_COLUMNS.length + 1 },
		async () => {
			await resolveShowColumns(owner);
			return resolveRelationTargetValues(
				ZZSCALE_SECTION,
				owner,
				ZZSCALE_INDEX_OWNER_COMPONENT,
				'lg-nolan',
				[],
			);
		},
	);
	expect(unmemoized.count).toBeGreaterThan(TWO_DOOR_CEILING);
});
