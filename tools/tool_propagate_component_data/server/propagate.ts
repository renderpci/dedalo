/**
 * propagate_component_data mutation core (PHP tool_propagate_component_data::
 * propagate_component_data, the replace/delete/add switch at class.tool_
 * propagate_component_data.php). Pure over a component's current lang-data array:
 * given the action + the client-supplied value, compute the new array and whether
 * it changed (so the caller skips a no-op save). The DB half — search the target
 * set, write each record, TM-batch under a bulk_process_id — is the module's job.
 *
 * Relation-family components (component_relation_*, portal, select, autocomplete,
 * …) match values by LOCATOR identity (section_tipo + section_id) per PHP
 * locator::get_key_in_array_locator; everything else matches by deep value.
 */

import { relationDataModels } from '../../../src/core/components/registry.ts';
import { sameItemValue } from '../../../src/core/concepts/item_value.ts';

export type PropagateAction = 'replace' | 'delete' | 'add';

/**
 * PHP component_relation_common::get_components_with_relations() — the models
 * whose data items are locators (matched by section_tipo+section_id, not value).
 *
 * DERIVED from the component registry (S2-26): every registered model whose
 * resolved matrix column is 'relation' (including the legacy autocomplete
 * aliases), with the PHP-fidelity deltas the derivation cannot see:
 * + component_relation_struct: excluded-legacy model (PHP $ar_excluded_models)
 *   with no registered descriptor, but present in PHP's relation set;
 * + component_inverse: stores in 'misc' yet its items are locator-shaped
 *   backlinks, and PHP lists it;
 * - component_external: relation-column storage in TS, but PHP's list omits it
 *   (component_common base — its computed read-only items match by deep value);
 * - component_security_tools: an ontology alias name PHP never matches against
 *   (class resolution yields component_check_box before this check runs).
 * Membership vs the PHP 18-name list is pinned by
 * test/unit/descriptor_completeness_tripwire.test.ts.
 */
const PHP_LIST_EXCLUSIONS: ReadonlySet<string> = new Set([
	'component_external',
	'component_security_tools',
]);
export const COMPONENTS_WITH_RELATIONS: ReadonlySet<string> = new Set([
	...relationDataModels().filter((model) => !PHP_LIST_EXCLUSIONS.has(model)),
	'component_relation_struct',
	'component_inverse',
]);

function normalizeToArray(value: unknown): unknown[] {
	if (value === null || value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

/**
 * Whether the STORED item `stored` carries the value of the CLIENT item
 * `candidate` — id-blind when the candidate names none (the save door stamps
 * every stored item with an id a propagated value never carries). The ONE rule,
 * shared with the save door's set_data id carry-over: concepts/item_value.ts.
 */
const sameValue = sameItemValue;

/** Two item sequences hold the same values, position by position (see sameValue). */
function sameSequence(stored: readonly unknown[], candidate: readonly unknown[]): boolean {
	return (
		stored.length === candidate.length &&
		stored.every((item, index) => sameValue(item, candidate[index]))
	);
}

/** Whether a stored item is "the same" as a value item — locator identity or value. */
function itemsMatch(stored: unknown, candidate: unknown, withRelations: boolean): boolean {
	if (withRelations && isLocator(stored) && isLocator(candidate)) {
		return (
			stored.section_tipo === candidate.section_tipo &&
			String(stored.section_id) === String(candidate.section_id)
		);
	}
	return sameValue(stored, candidate);
}

function isLocator(value: unknown): value is { section_tipo: string; section_id: unknown } {
	return (
		typeof value === 'object' && value !== null && 'section_tipo' in value && 'section_id' in value
	);
}

export interface PropagationResult {
	final: unknown[];
	changed: boolean;
}

/**
 * Apply one propagation action to a component's current lang-data array.
 * - replace: the whole slice becomes `value` (null/scalar normalized to an array).
 * - delete:  remove every current item matching any value item.
 * - add:     append each value item not already present.
 */
export function applyPropagation(
	current: readonly unknown[],
	action: PropagateAction,
	value: unknown,
	withRelations: boolean,
): PropagationResult {
	const currentArr = [...current];
	switch (action) {
		case 'replace': {
			const final = normalizeToArray(value);
			return { final, changed: !sameSequence(currentArr, final) };
		}
		case 'delete': {
			const toRemove = normalizeToArray(value);
			const final = currentArr.filter(
				(item) => !toRemove.some((rem) => itemsMatch(item, rem, withRelations)),
			);
			return { final, changed: !sameSequence(currentArr, final) };
		}
		case 'add': {
			const toAdd = normalizeToArray(value);
			const final = [...currentArr];
			for (const candidate of toAdd) {
				if (!final.some((item) => itemsMatch(item, candidate, withRelations))) {
					final.push(candidate);
				}
			}
			return { final, changed: !sameSequence(currentArr, final) };
		}
	}
}
