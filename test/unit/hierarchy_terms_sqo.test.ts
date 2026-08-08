/**
 * getHierarchyTermsSqo (src/core/ts_object/search.ts) — the pinned-nodes SQO
 * built from a hierarchy_terms selection (PHP get_hierarchy_terms_sqo :764).
 *
 * NOTE ON THE PLAN: the item names src/core/relations/search.ts; the function
 * actually lives in src/core/ts_object/search.ts (no relations/search.ts exists).
 *
 * The load-bearing thing pinned here is the SHARED-$path MUTATION QUIRK: the id
 * `path` object is ONE reference mutated per iteration, exactly like the PHP
 * original, so every $and group serializes with the LAST node's section_tipo.
 * That is NOT desired behaviour — it is a LEDGERED parity quirk (the live PHP
 * JSON is the wire contract). These assertions exist so that a future fix has to
 * be a deliberate edit HERE, with a wire-contract entry, and can never happen by
 * accident.
 */

import { describe, expect, it } from 'bun:test';
import { getHierarchyTermsSqo } from '../../src/core/ts_object/search.ts';

type PathStep = {
	component_tipo?: string;
	model?: string;
	name?: string;
	section_tipo?: string;
};
type IdFilter = { q: unknown; path: PathStep[] };
type Group = { $and: IdFilter[] };

function orGroups(sqo: Record<string, unknown>): Group[] {
	return (sqo.filter as { $or: Group[] }).$or;
}

describe('getHierarchyTermsSqo', () => {
	it('empty input → the canonical empty-selection envelope', () => {
		// Callers (area/read.ts) feed this straight to the search assembler, so the
		// envelope must stay well-formed even with nothing selected: an $or with no
		// groups, NOT a missing filter (which would widen the search to everything).
		const sqo = getHierarchyTermsSqo([]);
		expect(sqo).toEqual({
			id: 'thesaurus',
			section_tipo: [],
			limit: 100,
			filter: { $or: [] },
			select: [],
		});
	});

	it('a term with no value key contributes nothing (the `?? []` branch)', () => {
		// hierarchy_terms rows arrive from client data; a value-less row must be a
		// no-op rather than a throw on `for (… of undefined)`.
		const sqo = getHierarchyTermsSqo([{}, { value: [] }]);
		expect(orGroups(sqo)).toEqual([]);
		expect(sqo.section_tipo).toEqual([]);
	});

	it('one node → one $and group pairing numeric id and section_tipo', () => {
		const sqo = getHierarchyTermsSqo([{ value: [{ section_tipo: 'aa1', section_id: 5 }] }]);
		const or = orGroups(sqo);
		expect(or).toHaveLength(1);
		// id half: component_section_id hierarchy22, q = the numeric id.
		expect(or[0]?.$and[0]).toEqual({
			q: 5,
			path: [
				{
					component_tipo: 'hierarchy22',
					model: 'component_section_id',
					name: 'Id',
					section_tipo: 'aa1',
				},
			],
		});
		// tipo half: the virtual `section` model column, q = the tipo itself.
		expect(or[0]?.$and[1]).toEqual({
			q: 'aa1',
			path: [{ model: 'section', name: 'Section tipo column' }],
		});
		expect(sqo.section_tipo).toEqual(['aa1']);
	});

	it('QUIRK (pinned, not desired): every group.path[0].section_tipo is the LAST node', () => {
		// The plan's canonical case: two nodes inside ONE term's value array.
		const sqo = getHierarchyTermsSqo([
			{
				value: [
					{ section_tipo: 'a1', section_id: 5 },
					{ section_tipo: 'b1', section_id: 7 },
				],
			},
		]);
		const or = orGroups(sqo);
		expect(or).toHaveLength(2);
		// BOTH id-paths read 'b1' — the first node's own tipo is lost from the path.
		expect(or[0]?.$and[0]?.path[0]?.section_tipo).toBe('b1');
		expect(or[1]?.$and[0]?.path[0]?.section_tipo).toBe('b1');
		// …while q stays per-node (q is copied by value, the path is not).
		expect(or[0]?.$and[0]?.q).toBe(5);
		expect(or[1]?.$and[0]?.q).toBe(7);
		// The tipo half IS per-node, which is what keeps the query usable at all
		// despite the mutated path — if this ever collapses too, the SQO would
		// silently match only the last node's section.
		expect(or[0]?.$and[1]?.q).toBe('a1');
		expect(or[1]?.$and[1]?.q).toBe('b1');
		expect(sqo.section_tipo).toEqual(['a1', 'b1']);
	});

	it('QUIRK source: the path objects are literally the SAME reference in every group', () => {
		// Identity, not just equality — this is the mechanism. If someone clones the
		// path per iteration (the "fix"), this assertion is the one that reddens and
		// forces the wire-contract conversation.
		const sqo = getHierarchyTermsSqo([
			{ value: [{ section_tipo: 'a1', section_id: 1 }] },
			{ value: [{ section_tipo: 'b1', section_id: 2 }] },
		]);
		const or = orGroups(sqo);
		expect(or[0]?.$and[0]?.path[0]).toBe(or[1]?.$and[0]?.path[0] as never);
		// pathSection is shared too, but it is never mutated, so sharing it is inert.
		expect(or[0]?.$and[1]?.path[0]).toBe(or[1]?.$and[1]?.path[0] as never);
		// The quirk spans terms as well as items within a term.
		expect(or[0]?.$and[0]?.path[0]?.section_tipo).toBe('b1');
	});

	it('section_tipo list is a positional collector: duplicates are kept, order preserved', () => {
		// Not a Set — the PHP list is appended per item. Dedup here would be a wire
		// change (the array is echoed back to the client / fed to the assembler).
		const sqo = getHierarchyTermsSqo([
			{
				value: [
					{ section_tipo: 'a1', section_id: 1 },
					{ section_tipo: 'a1', section_id: 2 },
					{ section_tipo: 'c1', section_id: 3 },
				],
			},
		]);
		expect(sqo.section_tipo).toEqual(['a1', 'a1', 'c1']);
		expect(orGroups(sqo)).toHaveLength(3);
	});

	it('section_id is passed through verbatim, including string ids', () => {
		// Client payloads carry ids as strings; the function must NOT coerce, because
		// the PHP oracle emits whatever came in and the assembler binds it downstream.
		const sqo = getHierarchyTermsSqo([{ value: [{ section_tipo: 'a1', section_id: '12' }] }]);
		expect(orGroups(sqo)[0]?.$and[0]?.q).toBe('12');
	});

	it('static envelope fields are fixed regardless of selection size', () => {
		// limit 100 is the safety cap; select [] means "default columns". A regression
		// on either silently changes what the thesaurus search returns.
		const sqo = getHierarchyTermsSqo([
			{ value: [{ section_tipo: 'a1', section_id: 1 }] },
			{ value: [{ section_tipo: 'b1', section_id: 2 }] },
		]);
		expect(sqo.id).toBe('thesaurus');
		expect(sqo.limit).toBe(100);
		expect(sqo.select).toEqual([]);
	});
});
