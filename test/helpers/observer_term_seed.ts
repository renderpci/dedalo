/**
 * THE OBSERVER TERM FIXTURE — a term with an ancestor chain, a referencing
 * section, and the observed/observer component pair the observer family drives.
 *
 * BUILT, NOT BORROWED (generic-TLD migration, 2026-08-20). This helper used to
 * seed the install anchor `on1/58` into `matrix_hierarchy` — plus a hand-made
 * `on1` section node, because hierarchy SECTION nodes only exist after
 * hierarchy activation — and then hedge: seed only if absent, sweep only what it
 * seeded, so that a restored live snapshot (where `on1/58` is a REAL term whose
 * mirror a recompute would silently rewrite) survived a test run.
 *
 * That hedge is what an install-bound fixture costs. The situation is now OURS:
 * a reserved `zzot` scratch ontology nothing else can name, so there is no live
 * record to protect, no presence guard, no "did we plant it?" handle, and no
 * case that skips because the database happened to carry the install. It is
 * built, used, and dropped whole — with the residue ASSERTED, not trusted.
 *
 * THE SHAPE, and why each piece is here (copied field for field from the
 * shipped pair this fixture used to drive, `hierarchy93` ← `rsc387`):
 *   TERM_SECTION  the term whose mirror is reconciled (was `on1`)
 *     PARENT      component_relation_parent — carries the ancestor locators, so
 *                 the 58 → 8 → 2 → 1 chain is walkable (was `hierarchy36`)
 *     TERM_MAP    section_map naming PARENT as the thesaurus parent, because
 *                 that is where the resolver LOOKS for it
 *     MIRROR      the OBSERVER slot: use_observable_dato + set_dato_external
 *                 (was `hierarchy93`)
 *   REF_SECTION   the records that reference the term (was `rsc205`)
 *     INDEXER     the OBSERVED slot: component_autocomplete_hi whose
 *                 config_relation is dd96, declaring MIRROR as its forward
 *                 observer (was `rsc387`)
 *
 * Every record lands in `matrix_test`: a situation section carries the `test24`
 * matrix_table relation by default (src/core/test_data/situations/situation.ts),
 * because a section without one falls back to `matrix` — the installation's own
 * table.
 */

import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

/** The term whose mirror the observer gates reconcile. */
export const TERM_SECTION = 'zzot1';
/** component_relation_parent — the ancestor locators live here. */
export const PARENT = 'zzot2';
/** The section_map that tells the resolver PARENT is the thesaurus parent. */
export const TERM_MAP = 'zzot3';
/** The OBSERVER slot on the term (the `hierarchy93` role). */
export const MIRROR = 'zzot4';
/**
 * A SECOND term section hosting the same MIRROR, so INDEXER is a genuinely
 * multi-host observer. The `--section` narrowing cases need a tuple set with
 * more than one member to narrow; the shipped edge got that from being declared
 * on three install thesauri, which is a fact about one ontology, so the fixture
 * declares its own.
 */
export const TERM_SECTION_B = 'zzot7';
/** The referencing section (the `rsc205` role). */
export const REF_SECTION = 'zzot5';
/** The OBSERVED slot on a referencer (the `rsc387` role). */
export const INDEXER = 'zzot6';

/** The anchor term every observer gate drives. */
export const SEED_TERM = { section_tipo: TERM_SECTION, section_id: 58 };

/** 58 → 8 → 2 → 1 (closest-first — the relation_search golden derives from it). */
export const SEED_TERM_CHAIN: [number, number | null][] = [
	[58, 8],
	[8, 2],
	[2, 1],
	[1, null],
];

/** A term row with its parent locator, in the shape the parent component stores. */
function termRecord(id: number, parentId: number | null) {
	return {
		section_tipo: TERM_SECTION,
		section_id: id,
		columns: {
			relation:
				parentId === null
					? {}
					: {
							[PARENT]: [
								{
									id: 1,
									type: 'dd47',
									section_id: parentId,
									section_tipo: TERM_SECTION,
									from_component_tipo: PARENT,
								},
							],
						},
		},
	};
}

export const OBSERVER_TERM_SITUATION = situation({
	tld: 'zzot',
	name: 'observer term fixture',
	nodes: [
		{ tipo: TERM_SECTION, model: 'section', parent: 'dd14' },
		{ tipo: PARENT, model: 'component_relation_parent', parent: TERM_SECTION },
		{
			tipo: TERM_MAP,
			model: 'section_map',
			parent: TERM_SECTION,
			properties: { thesaurus: { parent: PARENT, term: PARENT } },
		},
		{
			// The OBSERVER: fed from the referencing section, through INDEXER.
			tipo: MIRROR,
			model: 'component_autocomplete',
			parent: TERM_SECTION,
			properties: {
				source: {
					mode: 'external',
					section_to_search: [REF_SECTION],
					component_to_search: [INDEXER],
				},
				observe: [
					{
						component_tipo: INDEXER,
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
		{ tipo: TERM_SECTION_B, model: 'section', parent: 'dd14' },
		{ tipo: REF_SECTION, model: 'section', parent: 'dd14' },
		{
			// The OBSERVED: its relation type is dd96 and it names MIRROR as the
			// forward observer — the edge the reconcile law walks.
			tipo: INDEXER,
			model: 'component_autocomplete_hi',
			parent: REF_SECTION,
			properties: {
				config_relation: { relation_type: 'dd96' },
				observers: [
					{ section_tipo: TERM_SECTION, component_tipo: MIRROR },
					{ section_tipo: TERM_SECTION_B, component_tipo: MIRROR },
				],
			},
		},
	],
	records: SEED_TERM_CHAIN.map(([id, parentId]) => termRecord(id, parentId)),
});

/**
 * Materialize the fixture. Idempotent (ensureSituation upserts nodes and
 * rewrites records), and unconditional: the situation is ours, so unlike the
 * install-anchored version it never has to ask whether it may write.
 */
export async function ensureObserverTerm(): Promise<void> {
	await ensureSituation(OBSERVER_TERM_SITUATION);
}

/**
 * Drop it whole and RETURN THE RESIDUE (0 on success) so a caller asserts
 * hermeticity instead of trusting the sweep. Records, their time-machine tail,
 * their counters and the scratch ontology all go.
 */
export async function dropObserverTerm(): Promise<number> {
	return dropSituation(OBSERVER_TERM_SITUATION);
}
