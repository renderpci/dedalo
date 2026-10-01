/**
 * THE `_hi` OBSERVER FIXTURE — an observer whose OWN model is
 * `component_autocomplete_hi`, so the mirror it writes carries an ancestor
 * index (`relation_search`) that search READS (conform.ts: `direct OR
 * ancestor` for the legacy hi model).
 *
 * WHY IT EXISTS (CORE-2, audit 2026-09-26). Every other observer fixture has a
 * plain `component_autocomplete` mirror, whose relation_search the save law
 * never writes. An `_hi` mirror is the case where the observer recompute
 * (`observers.ts` recomputeExternalRelation → persistRecordKeys) writes a
 * relation key WITH save semantics and must re-derive the ancestor index in the
 * same write — or a broader-term search misses every record the mirror lists.
 *
 * THE SHAPE (a thesaurus-shaped A, observed by B through A's portal):
 *   TERM_A     term section — a3 → a2 → a1 through PARENT (the section_map
 *              TERM_MAP names it, so the ancestor walk finds it)
 *     PORTAL   component_autocomplete on A pointing at B records; declares O
 *              as its forward observer (the OBSERVED slot)
 *     HI_INFO  a same-record component_info observer of PORTAL (the receipt)
 *   HOST_B     the observer's host section
 *     O        component_autocomplete_hi — set_dato_external +
 *              use_observable_dato: "the A terms whose PORTAL points at me".
 *              Its items are A terms, so its ancestor index is their chain.
 *
 * Every record lands in `matrix_test` (situation default `test24`). The
 * reserved `zzoh` TLD is owned HERE; built, used, dropped whole, residue
 * asserted by the caller.
 */

import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

/** The term section (a1..a3). */
export const TERM_A = 'zzoh1';
/** component_relation_parent on TERM_A. */
export const HI_PARENT = 'zzoh2';
/** The section_map naming HI_PARENT as the thesaurus parent. */
export const HI_TERM_MAP = 'zzoh3';
/** The OBSERVED portal on TERM_A (points at HOST_B records). */
export const PORTAL = 'zzoh4';
/** The observer's host section. */
export const HOST_B = 'zzoh5';
/** The OBSERVER: component_autocomplete_hi on HOST_B. */
export const HI_OBSERVER = 'zzoh6';
/**
 * A SAME-RECORD component_info observer of PORTAL (`server:{filter:false}`):
 * the edge whose recompute rides the save response (`observersData`) — the
 * interactive receipt the obligation ledger must keep delivering.
 */
export const HI_INFO = 'zzoh7';

/** a3 → a2 → a1, closest-first. */
export const HI_TERM_CHAIN: [number, number | null][] = [
	[3, 2],
	[2, 1],
	[1, null],
];
/** The one host record. */
export const B1 = 1;

function termRecord(id: number, parentId: number | null) {
	return {
		section_tipo: TERM_A,
		section_id: id,
		columns: {
			relation:
				parentId === null
					? {}
					: {
							[HI_PARENT]: [
								{
									id: 1,
									type: 'dd47',
									section_id: parentId,
									section_tipo: TERM_A,
									from_component_tipo: HI_PARENT,
								},
							],
						},
		},
	};
}

export const OBSERVER_HI_SITUATION = situation({
	tld: 'zzoh',
	name: 'observer hi fixture',
	nodes: [
		{ tipo: TERM_A, model: 'section', parent: 'dd14' },
		{ tipo: HI_PARENT, model: 'component_relation_parent', parent: TERM_A },
		{
			tipo: HI_TERM_MAP,
			model: 'section_map',
			parent: TERM_A,
			properties: { thesaurus: { parent: HI_PARENT, term: HI_PARENT } },
		},
		{
			tipo: PORTAL,
			model: 'component_autocomplete',
			parent: TERM_A,
			properties: {
				config_relation: { relation_type: 'dd151' },
				observers: [{ section_tipo: HOST_B, component_tipo: HI_OBSERVER }],
			},
		},
		{
			tipo: HI_INFO,
			model: 'component_info',
			parent: TERM_A,
			properties: { observe: [{ component_tipo: PORTAL, server: { filter: false } }] },
		},
		{ tipo: HOST_B, model: 'section', parent: 'dd14' },
		{
			tipo: HI_OBSERVER,
			model: 'component_autocomplete_hi',
			parent: HOST_B,
			properties: {
				source: {
					mode: 'external',
					section_to_search: [TERM_A],
					component_to_search: [PORTAL],
				},
				observe: [
					{
						component_tipo: PORTAL,
						server: {
							config: { use_self_section: false, use_observable_dato: true },
							perform: {
								function: 'set_dato_external',
								params: { save: true, changed: false, current_dato: false, references_limit: 0 },
							},
						},
					},
				],
			},
		},
	],
	records: [
		...HI_TERM_CHAIN.map(([id, parentId]) => termRecord(id, parentId)),
		{ section_tipo: HOST_B, section_id: B1, columns: { relation: {} } },
	],
});

export async function ensureObserverHi(): Promise<void> {
	await ensureSituation(OBSERVER_HI_SITUATION);
}

/** Drop it whole and RETURN THE RESIDUE (0 on success). */
export async function dropObserverHi(): Promise<number> {
	return dropSituation(OBSERVER_HI_SITUATION);
}
