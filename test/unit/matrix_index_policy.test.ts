/**
 * Matrix index-policy self-consistency (hermetic — no DB).
 *
 * The policy in src/core/db/matrix_index_policy.ts drives a tool that DROPs
 * indexes on production-scale tables; a policy that contradicts itself is a
 * foot-gun. These gates pin the invariants the tool relies on:
 *  - every structurally-required signature is present as a 'keep' entry (we can
 *    never classify a load-bearing index as droppable);
 *  - no signature is listed twice (ambiguous disposition);
 *  - keep/drop-redundant/drop-dead/review classify as expected, including the
 *    single-tipo gate and the "dead but used ⇒ don't drop" downgrade;
 *  - constraint-backed indexes are never dropped.
 */

import { describe, expect, test } from 'bun:test';
import {
	type LiveIndex,
	MATRIX_INDEX_POLICIES,
	classifyIndex,
	normalizeIndexDef,
	policyForTable,
} from '../../src/core/db/matrix_index_policy.ts';

function liveIndex(overrides: Partial<LiveIndex> & { indexDef: string }): LiveIndex {
	return {
		name: overrides.name ?? 'ix',
		indexDef: overrides.indexDef,
		isConstraint: overrides.isConstraint ?? false,
		idxScan: overrides.idxScan ?? 0,
		sizeBytes: overrides.sizeBytes ?? 1,
	};
}

describe('normalizeIndexDef', () => {
	test('extracts the canonical USING tail, lowercased + whitespace-collapsed', () => {
		expect(
			normalizeIndexDef(
				'CREATE INDEX foo ON public.matrix_activity USING btree (section_tipo, section_id DESC)',
			),
		).toBe('using btree (section_tipo, section_id desc)');
		expect(
			normalizeIndexDef(
				'CREATE UNIQUE INDEX k ON public.matrix_activity USING btree (section_id,  section_tipo)',
			),
		).toBe('using btree (section_id, section_tipo)');
	});
	test('INCLUDE columns survive normalization', () => {
		expect(
			normalizeIndexDef(
				'CREATE INDEX c ON public.matrix_activity USING btree ("timestamp", id) INCLUDE (section_tipo, section_id)',
			),
		).toBe('using btree ("timestamp", id) include (section_tipo, section_id)');
	});
	test('no USING clause ⇒ empty signature', () => {
		expect(normalizeIndexDef('CREATE INDEX weird ON t (a)')).toBe('');
	});
});

describe('policy self-consistency', () => {
	for (const policy of MATRIX_INDEX_POLICIES) {
		describe(policy.table, () => {
			test('every required signature is present as a keep entry', () => {
				for (const required of policy.requiredSignatures) {
					const match = policy.entries.find((entry) => entry.signature === required);
					expect(match, `required signature not in entries: ${required}`).toBeDefined();
					expect(match?.disposition, `required signature must be 'keep': ${required}`).toBe('keep');
				}
			});
			test('no duplicate signatures', () => {
				const seen = new Set<string>();
				for (const entry of policy.entries) {
					expect(seen.has(entry.signature), `duplicate signature: ${entry.signature}`).toBe(false);
					seen.add(entry.signature);
				}
			});
			test('entry signatures are already normalized', () => {
				for (const entry of policy.entries) {
					// A signature that does not round-trip through normalize would never
					// match a live index (it starts at `using`, so prefix it to test).
					expect(normalizeIndexDef(`CREATE INDEX x ON public.t ${entry.signature}`)).toBe(
						entry.signature,
					);
				}
			});
		});
	}
});

describe('classifyIndex', () => {
	const activity = policyForTable('matrix_activity');
	if (activity === undefined) throw new Error('matrix_activity policy missing');

	test('constraint-backed index is always kept, even off-policy', () => {
		const verdict = classifyIndex(
			liveIndex({ indexDef: 'CREATE UNIQUE INDEX pk ON public.matrix_activity USING btree (id)', isConstraint: true }),
			activity,
			{ singleTipo: true, includeReview: false },
		);
		expect(verdict.action).toBe('keep');
	});

	test('keep entry classifies as keep', () => {
		const verdict = classifyIndex(
			liveIndex({ indexDef: 'CREATE INDEX l ON public.matrix_activity USING btree (section_tipo, section_id DESC)' }),
			activity,
			{ singleTipo: true, includeReview: false },
		);
		expect(verdict.action).toBe('keep');
	});

	test('drop-redundant (prefix superset) drops regardless of tipo or scans', () => {
		const verdict = classifyIndex(
			liveIndex({
				indexDef: 'CREATE INDEX o ON public.matrix_activity USING btree (section_tipo, section_id DESC, "timestamp")',
				idxScan: 999,
			}),
			activity,
			{ singleTipo: false, includeReview: false },
		);
		expect(verdict.action).toBe('drop');
	});

	test('single-tipo-only redundancy is downgraded to review on a multi-tipo table', () => {
		const def = 'CREATE INDEX sid ON public.matrix_activity USING btree (section_id DESC NULLS LAST)';
		expect(
			classifyIndex(liveIndex({ indexDef: def }), activity, { singleTipo: true, includeReview: false }).action,
		).toBe('drop');
		expect(
			classifyIndex(liveIndex({ indexDef: def }), activity, { singleTipo: false, includeReview: false }).action,
		).toBe('review');
	});

	test('drop-dead drops when unused but is kept (as review) when the DB proves it used', () => {
		const def = 'CREATE INDEX g ON public.matrix_activity USING gin (misc jsonb_path_ops)';
		expect(
			classifyIndex(liveIndex({ indexDef: def, idxScan: 0 }), activity, { singleTipo: true, includeReview: false }).action,
		).toBe('drop');
		expect(
			classifyIndex(liveIndex({ indexDef: def, idxScan: 3 }), activity, { singleTipo: true, includeReview: false }).action,
		).toBe('review');
	});

	test('unclassified (bespoke) index is left in place', () => {
		const verdict = classifyIndex(
			liveIndex({ indexDef: 'CREATE INDEX bespoke ON public.matrix_activity USING btree (meta)' }),
			activity,
			{ singleTipo: true, includeReview: false },
		);
		expect(verdict.action).toBe('unclassified');
	});

	test('review entry drops only with includeReview', () => {
		const tm = policyForTable('matrix_time_machine');
		if (tm === undefined) throw new Error('tm policy missing');
		const def = 'CREATE INDEX b ON public.matrix_time_machine USING btree (bulk_process_id)';
		expect(classifyIndex(liveIndex({ indexDef: def }), tm, { singleTipo: false, includeReview: false }).action).toBe('review');
		expect(classifyIndex(liveIndex({ indexDef: def }), tm, { singleTipo: false, includeReview: true }).action).toBe('drop');
	});
});
