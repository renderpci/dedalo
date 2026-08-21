/**
 * dd542 Activity "Who" (dd543) search — emitted against the indexed locator
 * EXPRESSION instead of jsonb containment (WC-056).
 *
 * THE PROBLEM. `relation @> '{"dd543":[{…}]}'` cannot be combined with the
 * list's `("timestamp", id)` order: no index carries both the actor and the
 * sort key, so the planner walks the ordered index applying containment as a
 * Filter and stops at the LIMIT. On an append-only log every row of a given
 * actor sits in one contiguous block, so the walk is fast only when that actor
 * is ALSO recent. Measured on the 32.9M-row mdcat log (25-row page):
 *
 *   actor      rows     no index    GIN(relation)   GIN + OFFSET-0 barrier   this
 *   user 3      1 021   >300 s        12.5 ms              —                2.7 ms
 *   user 40    52 000   >300 s       >300 s                —                2.5 ms
 *   user 95   206 000   >300 s       >300 s              4.4 s              3.8 ms
 *   user 2  8 100 000    90 ms        90 ms             69.5 s              3.1 ms
 *
 * A GIN on `relation` rescues only the RARE actor (the one case the estimate is
 * small enough for a bitmap scan) and the WC-053 `OFFSET 0` barrier is actively
 * harmful for a heavy actor — 90 ms → 69.5 s — because this filter's
 * selectivity spans four orders of magnitude between actors, so no static plan
 * choice is right. Only an index carrying BOTH the actor and the sort key is
 * flat, and it needs the predicate written as an equality on the same
 * expression the index is built on.
 *
 * THE INVARIANT IT RESTS ON. The emitted predicate reads element 0 of the
 * dd543 array, so it is exact only while an activity row carries exactly ONE
 * actor locator. That is how the engine writes it (api/handlers/activity_log.ts
 * emits a single dd543 locator) and how the data reads: 2.5M rows sampled on
 * mdcat (2M newest + 500k oldest) are all `length 1`, `section_tipo dd128`.
 * activity_log_single_actor.test.ts gates the writer; if that invariant ever
 * breaks, a second locator becomes invisible to Who search — which is why the
 * predicate ALSO binds section_tipo rather than trusting it.
 *
 * SCOPE. dd542/dd543 only. Every other relation search — including dd545 What
 * on the same column, and every ordinary section — keeps containment, which is
 * what the restored GIN serves (WC-056 flips that index back to `keep`).
 */
// Migrated to the generic `test` TLD 2026-08-19: the ordinary-section control is the
// `test3` playground alias — this gate only builds SQL fragments, it reads no records.

import { describe, expect, test } from 'bun:test';
import { buildRelationFragment } from '../../src/core/search/builders/builder_relation.ts';
import type { BuilderContext } from '../../src/core/search/builders/types.ts';

const WHO_LOCATOR = [{ section_id: '115', section_tipo: 'dd128' }];

function whoCtx(overrides: Partial<BuilderContext> = {}): BuilderContext {
	return {
		alias: 'dd542',
		column: 'relation',
		tipo: 'dd543',
		sectionTipo: 'dd542',
		table: 'matrix_activity',
		lang: 'lg-nolan',
		translatable: false,
		model: 'component_portal',
		...overrides,
	};
}

const sentenceOf = (result: unknown): string => (result as { sentence: string }).sentence;
const tokensOf = (result: unknown): Record<string, unknown> =>
	(result as { tokenValues: Record<string, unknown> }).tokenValues;

describe('dd543 Who → indexed expression predicate (WC-056)', () => {
	test('default containment becomes an equality on the indexed expression', () => {
		const result = buildRelationFragment(WHO_LOCATOR, '', whoCtx());
		const sentence = sentenceOf(result);
		// Both locator fields equality-bound — that is what leaves the trailing
		// ("timestamp", id) columns of the index free to serve the ORDER BY.
		expect(sentence).toContain("dd542.relation->'dd543'->0->>'section_id'");
		expect(sentence).toContain("dd542.relation->'dd543'->0->>'section_tipo'");
		expect(sentence).not.toContain('@>');
		// Values travel as BOUND params, never interpolated.
		expect(Object.values(tokensOf(result))).toContain('115');
		expect(Object.values(tokensOf(result))).toContain('dd128');
	});

	test("'==' takes the same path as the default", () => {
		expect(sentenceOf(buildRelationFragment(WHO_LOCATOR, '==', whoCtx()))).toBe(
			sentenceOf(buildRelationFragment(WHO_LOCATOR, '', whoCtx())),
		);
	});

	test('negative operators negate the SAME expression (no containment fallback)', () => {
		for (const op of ['!=', '!=='] as const) {
			const sentence = sentenceOf(buildRelationFragment(WHO_LOCATOR, op, whoCtx()));
			expect(sentence, `operator '${op}'`).not.toContain('@>');
			expect(sentence).toContain("->0->>'section_id'");
		}
	});

	test("'*' / '!*' existence stay on the cheap key test", () => {
		expect(sentenceOf(buildRelationFragment(null, '*', whoCtx()))).toContain('?');
		expect(sentenceOf(buildRelationFragment(null, '!*', whoCtx()))).toContain('NOT');
	});

	test('a malformed / empty locator drops the clause instead of matching everything', () => {
		expect(buildRelationFragment([], '', whoCtx())).toBe(false);
		expect(buildRelationFragment([{ section_tipo: 'dd128' }], '', whoCtx())).toBe(false);
	});
});

describe('the rewrite is scoped — everything else keeps containment', () => {
	test('dd545 What on the SAME table and column still uses @>', () => {
		const sentence = sentenceOf(
			buildRelationFragment(
				[{ section_id: '5', section_tipo: 'dd42' }],
				'',
				whoCtx({ tipo: 'dd545' }),
			),
		);
		expect(sentence).toContain('@>');
	});

	test('dd543 in an ORDINARY section (different table) still uses @>', () => {
		const sentence = sentenceOf(
			buildRelationFragment(WHO_LOCATOR, '', whoCtx({ table: 'matrix', alias: 'test3' })),
		);
		expect(sentence).toContain('@>');
	});

	test('matrix_time_machine keeps its flat user_id twin', () => {
		const sentence = sentenceOf(
			buildRelationFragment(
				WHO_LOCATOR,
				'',
				whoCtx({ table: 'matrix_time_machine', tipo: 'dd578' }),
			),
		);
		expect(sentence).toContain('user_id');
		expect(sentence).not.toContain('@>');
	});
});
