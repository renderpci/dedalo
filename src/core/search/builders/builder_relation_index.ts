/**
 * component_relation_index SEARCH builder — the computed-inverse pipeline
 * (PHP trait.search_component_relation_index.php). Only `*` (indexed) and
 * `!*` (orphan) exist; any other operator returns no clause (PHP leaves the
 * SQO sentence-less → the WHERE builder drops it; TS-native `false`).
 *
 * `*`  → `<alias>.section_id IN (id1, id2, …)` — the ids of the SEARCHED
 *        section's records referenced by a dd96 (indexation) locator anywhere
 *        (PHP get_references_to_section, class.component_relation_index.php
 *        :733-770 → get_referenced_locators breakdown, ALL rows, dedup).
 *        Empty reference set → literal `1=0` (:184).
 * `!*` → `NOT IN (…)`; empty set → `1=1` (:225).
 *
 * The id list is interpolated as intval'd LITERALS exactly like PHP
 * (implode(',', array_map('intval', …)) — zero params). No module cache:
 * PHP's static cache is a per-request optimization only (module_state rule).
 * NO _tm twin exists — matrix_time_machine searches throw loudly.
 */

import { type BuilderContext, type BuilderResult, fragment } from './types.ts';

/** DEDALO_RELATION_TYPE_INDEX_TIPO — the indexation locator type. */
const INDEX_RELATION_TYPE = 'dd96';

export async function buildRelationIndexFragment(
	_rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): Promise<BuilderResult> {
	if (context.table === 'matrix_time_machine') {
		throw new Error(
			'relation_index search: no time-machine twin exists (PHP has none; the computed-inverse scan targets live relation columns)',
		);
	}
	if (qOperator !== '*' && qOperator !== '!*') return false; // PHP :135-149

	if (context.sectionTipo === '') return false; // unresolvable leaf section
	const { findInverseReferenceLocators } = await import('../search_related.ts');
	const hits = await findInverseReferenceLocators(
		[{ type: INDEX_RELATION_TYPE, section_tipo: context.sectionTipo }],
		{ limit: false, order: 'section_id' },
	);
	// PHP dedups the REFERENCED ids (locator->section_id of the matching
	// entries — the searched-section records being pointed at).
	const references = new Set<number>();
	for (const hit of hits) {
		const referenced = Number((hit.locator_data as { section_id?: unknown }).section_id);
		if (Number.isInteger(referenced)) references.add(referenced);
	}

	if (qOperator === '*') {
		if (references.size === 0) return fragment('1=0'); // PHP :184
		return fragment(`${context.alias}.section_id IN (${[...references].join(',')})`);
	}
	if (references.size === 0) return fragment('1=1'); // PHP :225
	return fragment(`${context.alias}.section_id NOT IN (${[...references].join(',')})`);
}
