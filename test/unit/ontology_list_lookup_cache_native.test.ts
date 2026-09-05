/**
 * THE TWO PER-ELEMENT ONTOLOGY LOOKUPS ARE CACHED — AND EXACT (audit PERF-12).
 *
 * `request_config/build.ts findSectionListChild` ("this element's
 * section_list child") and `request_config/implicit.ts
 * getMainRelatedSectionTipo` ("this component's related SECTION") each ran a
 * RAW dd_ontology SELECT per list element — measured 24× and 8× in ONE read.
 * Both answers are pure ontology: no principal, no language, no record. They
 * are now answered from hub-registered ontology caches, so an ontology write
 * drops them and nothing has to remember to invalidate.
 *
 * THE EXACTNESS HALF IS NOT AN OPTIMISATION, IT IS THE BUG THE OBVIOUS FIX
 * WOULD HAVE INTRODUCED. The resolver already had `relatedTipoByModel`, and
 * reusing it here would have been wrong: it matches with
 * `relatedModel.includes(model)`, so asking it for `'section'` also answers a
 * `section_list` or a `section_group` — silently the wrong node, on a path
 * that decides where a list element's options come from. The third leg builds
 * exactly that trap (a component whose relations name a section_list FIRST)
 * and pins both answers: the substring matcher takes the bait, the exact
 * matcher does not.
 *
 * THE SITUATION IS BUILT HERE on a reserved `zz` scratch TLD and torn down
 * (residue asserted 0). Every cache leg states the number of calls it measured
 * over — "cached" over one call is satisfied by any implementation.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { relatedTipoByExactModel, relatedTipoByModel } from '../../src/core/ontology/resolver.ts';
import { findSectionListChild } from '../../src/core/relations/request_config/build.ts';
import { getMainRelatedSectionTipo } from '../../src/core/relations/request_config/implicit.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { expectQueryBudget } from '../helpers/query_budget.ts';

const TLD = 'zzolc';
const SECTION = 'zzolc1';
const SECTION_LIST = 'zzolc2';
const SECTION_LIST_LATE = 'zzolc3';
/** The trap: a component whose relations name a section_list BEFORE the section. */
const TRAP_COMPONENT = 'zzolc4';

const SITUATION = situation({
	tld: TLD,
	name: 'ontology list-lookup cache',
	nodes: [
		{ tipo: SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'zzolc section' } },
		{ tipo: SECTION_LIST, parent: SECTION, model: 'section_list', order_number: 2 },
		{ tipo: SECTION_LIST_LATE, parent: SECTION, model: 'section_list', order_number: 9 },
		{
			tipo: TRAP_COMPONENT,
			parent: SECTION,
			model: 'component_portal',
			order_number: 3,
			// section_list FIRST — a substring matcher for 'section' stops here.
			relations: [{ tipo: SECTION_LIST }, { tipo: SECTION }],
		},
	],
});

/** How many repeats each budget measures over — one call proves nothing. */
const REPEATS = 40;

/**
 * CEILING — ONE cold statement for {@link REPEATS} calls. 2 leaves room for the
 * resolver's own node read on the first call; a per-call SELECT would cost 40.
 */
const CACHED_CEILING = 2;

beforeAll(async () => {
	await ensureSituation(SITUATION);
}, 120000);

afterAll(async () => {
	expect(await dropSituation(SITUATION)).toBe(0);
}, 120000);

test('findSectionListChild answers 40 calls with ONE statement', async () => {
	clearOntologyDerivedCaches();
	const { result } = await expectQueryBudget(
		'findSectionListChild x40',
		{ ceiling: CACHED_CEILING, corpus: REPEATS },
		async () => {
			let last: string | null = null;
			for (let i = 0; i < REPEATS; i++) last = await findSectionListChild(SECTION);
			return last;
		},
	);
	// It answered the RIGHT node: the lowest order_number wins (PHP $ar_terms[0]).
	expect(result).toBe(SECTION_LIST);
});

test('an ontology write DROPS the cached answer (the hub, not a TTL)', async () => {
	expect(await findSectionListChild(SECTION)).toBe(SECTION_LIST);
	// Re-materialize with the LATE node moved in front of the early one. The
	// upsert fans invalidation out through the hub; nothing here clears by hand.
	await ensureSituation(
		situation({
			tld: TLD,
			name: SITUATION.name,
			nodes: [
				{ tipo: SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'zzolc section' } },
				{ tipo: SECTION_LIST, parent: SECTION, model: 'section_list', order_number: 9 },
				{ tipo: SECTION_LIST_LATE, parent: SECTION, model: 'section_list', order_number: 1 },
			],
		}),
	);
	expect(
		await findSectionListChild(SECTION),
		'the cached section_list child survived an ontology write — the cache is not hub-registered',
	).toBe(SECTION_LIST_LATE);
	// Put the situation back the way the other legs expect it.
	await ensureSituation(SITUATION);
	expect(await findSectionListChild(SECTION)).toBe(SECTION_LIST);
});

test('getMainRelatedSectionTipo is EXACT — a section_list must not answer for a section', async () => {
	// The trap, stated as an assertion: the substring matcher the resolver
	// already had answers the section_list…
	expect(await relatedTipoByModel(TRAP_COMPONENT, 'section')).toBe(SECTION_LIST);
	// …and the exact matcher, which is what this door uses, answers the SECTION.
	expect(await relatedTipoByExactModel(TRAP_COMPONENT, 'section')).toBe(SECTION);
	expect(await getMainRelatedSectionTipo(TRAP_COMPONENT)).toBe(SECTION);
	// A component with no related section at all answers null, not a near-miss.
	expect(await getMainRelatedSectionTipo(SECTION_LIST)).toBe(null);
});

test('getMainRelatedSectionTipo answers 40 calls with a constant number of statements', async () => {
	clearOntologyDerivedCaches();
	const { result, report } = await expectQueryBudget(
		'getMainRelatedSectionTipo x40',
		// Cold it reads the component node and the related nodes' models through
		// the resolver; every later call is answered from the (tipo|model) cache.
		{ ceiling: 6, corpus: REPEATS },
		async () => {
			let last: string | null = null;
			for (let i = 0; i < REPEATS; i++) last = await getMainRelatedSectionTipo(TRAP_COMPONENT);
			return last;
		},
	);
	expect(result).toBe(SECTION);
	expect(report.count).toBeLessThan(REPEATS);
});
