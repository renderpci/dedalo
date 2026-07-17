/**
 * DESCRIPTOR-COMPLETENESS tripwire (S2-26 / DEC-12 — every documented
 * invariant gets a mechanical gate or is deleted from the text).
 *
 * The component registry is the extension story: "add a model = write a
 * descriptor". That story is only as honest as the facets a descriptor is
 * FORCED to declare. This gate makes the requirements mechanical:
 *
 *  1. every registered descriptor names a storage route (column or alias);
 *  2. every canonical relation-column model declares its full relation face
 *     (resolveData + search + defaultRelationType, minus the ledgered
 *     PHP-component_common exception);
 *  3. facet placement is coherent (searchBuilder families match their matrix
 *     column; relation-only facets never appear on non-relation models);
 *  4. the derived engine sets (CSV import value-property, propagate's
 *     relation set) still equal the PHP oracle lists — a descriptor edit
 *     that silently changes an engine set fails HERE, with the diff visible;
 *  5. every canonical non-relation model has made an EXPLICIT search
 *     decision: declare a searchBuilder family or appear in the ledgered
 *     unsearchable list below. Adding a model without deciding fails.
 *
 * ALLOWLIST LIFECYCLE (DEC-12 refinement — who clears these and when):
 * entries here are cleared by whoever ports the missing behavior, in the
 * same commit that adds the facet/builder; the list may only shrink.
 */

import { describe, expect, test } from 'bun:test';
import {
	allComponentModels,
	getComponentModel,
	getSearchBuilderFamily,
	relationDataModels,
} from '../../src/core/components/registry.ts';
import { IMPORT_CONFORM } from '../../src/core/tools/import_conform.ts';
import { VALUE_PROPERTY_MODELS } from '../../src/core/tools/import_data.ts';
import { COMPONENTS_WITH_RELATIONS } from '../../tools/tool_propagate_component_data/server/propagate.ts';

/** searchBuilder family → the matrix column it is allowed to build over. */
const FAMILY_COLUMN: Record<string, string> = {
	string: 'string',
	number: 'number',
	date: 'date',
	iri: 'iri',
	section_id: 'section_id',
	json: 'misc', // component_json stores in the shared `misc` column
};

/**
 * Canonical NON-relation models with NO SQO builder — each is a deliberate,
 * ledgered decision (PHP has no search trait for them either, or the trait is
 * a dedicated unported pipeline). Cleared per entry by the commit that ports
 * its builder and declares `searchBuilder` on the descriptor.
 */
const LEDGERED_UNSEARCHABLE: ReadonlySet<string> = new Set([
	'component_3d', // media — unsearchable in PHP too
	'component_av', // media
	'component_image', // media
	'component_pdf', // media
	'component_svg', // media
	'component_geolocation', // dedicated geo search unported (rewrite/STATUS.md)
	'component_info', // computed display, no stored searchable value
	'component_password', // never searchable (PHP posture)
	'component_filter_records', // row-ACL editor, dedicated semantics
	'component_security_access', // ontology-permission editor
	'component_inverse', // computed backlinks, searched via search_related
]);

/**
 * Canonical relation-column models WITHOUT a class-level default relation
 * type: PHP bases them on component_common (no $default_relation_type), so
 * requiring the facet would fabricate an oracle value. Cleared only if PHP
 * ever grows a default for them.
 */
const NO_DEFAULT_RELATION_TYPE: ReadonlySet<string> = new Set(['component_external']);

/**
 * PHP get_sortable() → false, resolved per CANONICAL model (component_media_common
 * / component_relation_common / geolocation / info / security_access). The alias
 * models inherit their canonical target's value via getModelByTipo
 * (calculation/state → info → false; autocomplete → portal → true; security_tools
 * → check_box → true), so ONLY canonical models declare the facet. Every model
 * NOT listed here is sortable by omission (component_common base = true). Cleared
 * only if PHP flips a model's get_sortable. Pins buildCore's resolveSortable.
 */
const PHP_NON_SORTABLE_CANONICAL = [
	'component_3d',
	'component_av',
	'component_geolocation',
	'component_image',
	'component_info',
	'component_pdf',
	'component_relation_children',
	'component_relation_index',
	'component_security_access',
	'component_svg',
].sort();

/** PHP component_common::$components_using_value_property — the oracle pin. */
const PHP_VALUE_PROPERTY_MODELS = [
	'component_email',
	'component_filter_records',
	'component_info',
	'component_input_text',
	'component_json',
	'component_number',
	'component_password',
	'component_text_area',
].sort();

/** PHP component_relation_common::get_components_with_relations() — oracle pin. */
const PHP_COMPONENTS_WITH_RELATIONS = [
	'component_autocomplete',
	'component_autocomplete_hi',
	'component_check_box',
	'component_dataframe',
	'component_filter',
	'component_filter_master',
	'component_inverse',
	'component_portal',
	'component_publication',
	'component_radio_button',
	'component_relation_children',
	'component_relation_index',
	'component_relation_model',
	'component_relation_parent',
	'component_relation_related',
	'component_relation_struct',
	'component_select',
	'component_select_lang',
].sort();

/** A descriptor is CANONICAL when it is not an alias-only/alias-carrying stub. */
function isCanonical(descriptor: { alias?: string }): boolean {
	return descriptor.alias === undefined;
}

describe('descriptor completeness (S2-26 tripwire)', () => {
	const descriptors = allComponentModels();

	test('every descriptor names a storage route (column or alias)', () => {
		for (const descriptor of descriptors) {
			expect(
				descriptor.column !== undefined || descriptor.alias !== undefined,
				`${descriptor.model}: declares neither column nor alias`,
			).toBe(true);
		}
	});

	test('canonical relation models declare the full relation face', () => {
		for (const descriptor of descriptors) {
			if (!isCanonical(descriptor) || descriptor.column !== 'relation') continue;
			expect(
				descriptor.resolveData,
				`${descriptor.model}: relation model without resolveData`,
			).toBeDefined();
			expect(
				descriptor.search,
				`${descriptor.model}: relation model without search face`,
			).toBeDefined();
			if (descriptor.search?.status === 'unported') {
				expect(
					typeof descriptor.search.reason === 'string' && descriptor.search.reason.length > 0,
					`${descriptor.model}: unported search without a ledgered reason`,
				).toBe(true);
			}
			if (!NO_DEFAULT_RELATION_TYPE.has(descriptor.model)) {
				expect(
					descriptor.defaultRelationType,
					`${descriptor.model}: relation model without defaultRelationType (PHP class default)`,
				).toMatch(/^dd\d+$/);
			}
		}
	});

	test('relation-only facets never appear on non-relation models', () => {
		for (const descriptor of descriptors) {
			if (descriptor.column === 'relation') continue;
			if (!isCanonical(descriptor)) continue; // alias stubs carry nothing
			expect(
				descriptor.resolveData,
				`${descriptor.model}: resolveData on non-relation model`,
			).toBeUndefined();
			expect(
				descriptor.search,
				`${descriptor.model}: search face on non-relation model`,
			).toBeUndefined();
			expect(
				descriptor.defaultRelationType,
				`${descriptor.model}: defaultRelationType on non-relation model`,
			).toBeUndefined();
			expect(
				descriptor.flatValue === 'datalist' ? descriptor.model : undefined,
				`${descriptor.model}: flatValue 'datalist' needs a datalist (relation) model`,
			).toBeUndefined();
		}
	});

	test('searchBuilder families match their matrix column, never relation', () => {
		for (const descriptor of descriptors) {
			if (descriptor.searchBuilder === undefined) continue;
			expect(
				descriptor.column,
				`${descriptor.model}: searchBuilder '${descriptor.searchBuilder}' on column '${descriptor.column}'`,
			).toBe(FAMILY_COLUMN[descriptor.searchBuilder]);
		}
	});

	test('every canonical non-relation model made an explicit search decision', () => {
		for (const descriptor of descriptors) {
			if (!isCanonical(descriptor) || descriptor.column === 'relation') continue;
			const decided =
				descriptor.searchBuilder !== undefined || LEDGERED_UNSEARCHABLE.has(descriptor.model);
			expect(
				decided,
				`${descriptor.model}: no searchBuilder and not in the LEDGERED_UNSEARCHABLE list — decide and declare`,
			).toBe(true);
		}
	});

	test('the ledgered-unsearchable list carries no dead entries', () => {
		for (const model of LEDGERED_UNSEARCHABLE) {
			const descriptor = getComponentModel(model);
			expect(
				descriptor,
				`LEDGERED_UNSEARCHABLE: '${model}' is not a registered model`,
			).toBeDefined();
			expect(
				descriptor?.searchBuilder,
				`LEDGERED_UNSEARCHABLE: '${model}' now declares a searchBuilder — remove the ledger entry`,
			).toBeUndefined();
		}
	});

	test('alias models search as their canonical target', () => {
		expect(getSearchBuilderFamily('component_html_text')).toBe('string');
		expect(getSearchBuilderFamily('component_input_text_large')).toBe('string');
		// autocomplete aliases resolve to portal — a relation model, no family.
		expect(getSearchBuilderFamily('component_autocomplete')).toBeUndefined();
	});

	test('derived CSV value-property set equals the PHP oracle list', () => {
		expect([...VALUE_PROPERTY_MODELS].sort()).toEqual(PHP_VALUE_PROPERTY_MODELS);
	});

	test('every importConform facet names a real parser', () => {
		// The facet is DATA (an id), so a typo would otherwise fail at import time on
		// one unlucky cell — in the middle of a 10k-row run — rather than at boot.
		for (const descriptor of descriptors) {
			if (descriptor.importConform === undefined) continue;
			expect(
				Object.hasOwn(IMPORT_CONFORM, descriptor.importConform),
				`${descriptor.model} names an import parser that does not exist: '${descriptor.importConform}'`,
			).toBe(true);
		}
	});

	test('every relation-column model declares an import parser', () => {
		// PHP gives EVERY relation component conform_import_data by class inheritance
		// (component_relation_common). A relation model without the facet would refuse
		// every flat section_id list ('273,418') — a silent capability hole, which is
		// exactly the class of bug this tripwire family exists to prevent.
		const missing = descriptors
			.filter((d) => d.alias === undefined && d.column === 'relation')
			.filter((d) => d.importConform === undefined)
			.map((d) => d.model);
		expect(missing).toEqual([]);
	});

	test('no parser in IMPORT_CONFORM is dead (every id is claimed by a descriptor)', () => {
		const claimed = new Set(
			descriptors.map((d) => d.importConform).filter((id) => id !== undefined),
		);
		const dead = Object.keys(IMPORT_CONFORM).filter((id) => !claimed.has(id as never));
		expect(dead).toEqual([]);
	});

	test('derived propagate relation set equals the PHP oracle list', () => {
		expect([...COMPONENTS_WITH_RELATIONS].sort()).toEqual(PHP_COMPONENTS_WITH_RELATIONS);
	});

	test('descriptor sortable:false set equals the PHP get_sortable() oracle', () => {
		const declaredFalse = descriptors
			.filter((d) => d.sortable === false)
			.map((d) => d.model)
			.sort();
		expect(declaredFalse).toEqual(PHP_NON_SORTABLE_CANONICAL);
	});

	test('no descriptor declares sortable:true (omitted = true is the base)', () => {
		for (const descriptor of descriptors) {
			expect(
				descriptor.sortable,
				`${descriptor.model}: sortable:true is redundant — omit it (component_common base is true)`,
			).not.toBe(true);
		}
	});

	test('relationDataModels derivation covers the legacy autocomplete aliases', () => {
		const derived = relationDataModels();
		expect(derived).toContain('component_autocomplete');
		expect(derived).toContain('component_autocomplete_hi');
		expect(derived).toContain('component_portal');
		expect(derived).not.toContain('component_input_text');
	});
});
