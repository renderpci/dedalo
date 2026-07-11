/**
 * Component-model REGISTRY equivalence + coverage gate.
 *
 * The per-model descriptors (src/core/components/) replaced five scattered
 * model-keyed dispatch tables. This test is the guard rail for that migration:
 * it hardcodes the OLD tables as GOLDEN values and asserts the registry-backed
 * accessors return exactly the same answers — so the refactor is provably
 * behavior-preserving. It also asserts the registry's structural invariants.
 *
 * DB-free by design (pure dispatch data) — runs on any machine.
 */

import { describe, expect, test } from 'bun:test';
import { allComponentModels, getComponentModel } from '../../src/core/components/registry.ts';
import { getColumnNameByModel } from '../../src/core/ontology/resolver.ts';
import {
	getRelationResolver,
	getRelationSearchFragmentBuilder,
} from '../../src/core/relations/registry.ts';

// --- GOLDEN: the pre-refactor tables, verbatim -----------------------------

/** Old MODEL_COLUMN_MAP (ontology/resolver.ts), incl. the non-component `section`. */
const GOLDEN_COLUMN: Readonly<Record<string, string>> = {
	component_3d: 'media',
	component_av: 'media',
	component_check_box: 'relation',
	component_autocomplete_hi: 'relation',
	component_dataframe: 'relation',
	component_date: 'date',
	component_email: 'string',
	component_external: 'relation',
	component_filter: 'relation',
	component_filter_master: 'relation',
	component_filter_records: 'misc',
	component_geolocation: 'geo',
	component_image: 'media',
	component_info: 'misc',
	component_input_text: 'string',
	component_inverse: 'misc',
	component_iri: 'iri',
	component_json: 'misc',
	component_number: 'number',
	component_password: 'string',
	component_pdf: 'media',
	component_portal: 'relation',
	component_publication: 'relation',
	component_radio_button: 'relation',
	component_relation_children: 'relation',
	component_relation_index: 'relation',
	component_relation_model: 'relation',
	component_relation_parent: 'relation',
	component_relation_related: 'relation',
	component_section_id: 'section_id',
	component_security_access: 'misc',
	component_select: 'relation',
	component_select_lang: 'relation',
	component_svg: 'media',
	component_text_area: 'string',
	section: 'data',
};

/** Old CLASS_SUPPORTS_TRANSLATION set (resolve/component_data.ts). */
const GOLDEN_TRANSLATION: readonly string[] = [
	'component_input_text',
	'component_text_area',
	'component_email',
	'component_password',
	'component_iri',
];

/** Old MODEL_REPLACEMENT_MAP entries that are COMPONENT aliases (now descriptor.alias). */
const GOLDEN_COMPONENT_ALIAS: Readonly<Record<string, string>> = {
	component_input_text_large: 'component_text_area',
	component_html_text: 'component_text_area',
	component_autocomplete: 'component_portal',
	component_autocomplete_hi: 'component_portal',
	component_state: 'component_info',
	component_calculation: 'component_info',
	component_security_tools: 'component_check_box',
};

/** Old relations RESOLVERS map keys — every model that must resolve to a resolver. */
const GOLDEN_RESOLVER_MODELS: readonly string[] = [
	'component_portal',
	'component_relation_parent',
	'component_relation_children',
	'component_filter',
	'component_filter_master',
	'component_external',
	'component_dataframe',
	'component_select',
	'component_select_lang',
	'component_radio_button',
	'component_check_box',
	'component_publication',
	'component_relation_model',
	'component_relation_index',
	'component_relation_related',
];

/** The remaining deliberate search throw (children/index PORTED 2026-07-10 —
 * their dispatch is pinned in relation_search_builders.test.ts; external's
 * throw IS the faithful port of a PHP fatal). */
const GOLDEN_SEARCH_UNCOVERED: Readonly<Record<string, string>> = {
	component_external: 'not searchable',
};

// --- column parity ----------------------------------------------------------

describe('getColumnNameByModel matches the old MODEL_COLUMN_MAP', () => {
	for (const [model, column] of Object.entries(GOLDEN_COLUMN)) {
		test(`${model} → ${column}`, () => {
			expect(getColumnNameByModel(model)).toBe(column);
		});
	}
	test('unknown model → null', () => {
		expect(getColumnNameByModel('component_does_not_exist')).toBeNull();
	});
});

// --- class-translation parity ----------------------------------------------

describe('classSupportsTranslation matches the old set', () => {
	for (const model of GOLDEN_TRANSLATION) {
		test(`${model} is class-translatable`, () => {
			expect(getComponentModel(model)?.classSupportsTranslation).toBe(true);
		});
	}
	test('a non-listed model is NOT class-translatable', () => {
		expect(getComponentModel('component_number')?.classSupportsTranslation).not.toBe(true);
		expect(getComponentModel('component_portal')?.classSupportsTranslation).not.toBe(true);
	});
});

// --- alias parity -----------------------------------------------------------

describe('component aliases match the old MODEL_REPLACEMENT_MAP', () => {
	for (const [source, target] of Object.entries(GOLDEN_COMPONENT_ALIAS)) {
		test(`${source} → ${target}`, () => {
			expect(getComponentModel(source)?.alias).toBe(target);
		});
	}
});

// --- relation resolver parity ----------------------------------------------

describe('getRelationResolver matches the old RESOLVERS map', () => {
	for (const model of GOLDEN_RESOLVER_MODELS) {
		test(`${model} resolves to a resolver`, () => {
			const resolver = getRelationResolver(model);
			expect(typeof resolver.emitDdoItems).toBe('function');
			// the descriptor names the binding as DATA (S2-20); the registry maps
			// the ID to the implementation — assert the ID is declared and the
			// resolved implementation serves it.
			expect(getComponentModel(model)?.resolveData).toBeDefined();
			expect(typeof getComponentModel(model)?.resolveData).toBe('string');
		});
	}
	test('a non-relation model throws (uncovered scope)', () => {
		expect(() => getRelationResolver('component_input_text')).toThrow('no registered resolver');
	});
});

// --- relation search parity -------------------------------------------------

describe('getRelationSearchFragmentBuilder matches the old SEARCH_UNCOVERED ledger', () => {
	for (const [model, reason] of Object.entries(GOLDEN_SEARCH_UNCOVERED)) {
		test(`${model} throws its ledgered reason`, async () => {
			await expect(getRelationSearchFragmentBuilder(model)).rejects.toThrow(reason);
		});
	}
	test('a ported relation model returns a builder function', async () => {
		const builder = await getRelationSearchFragmentBuilder('component_portal');
		expect(typeof builder).toBe('function');
	});
	test('a non-relation model throws (uncovered scope)', async () => {
		await expect(getRelationSearchFragmentBuilder('component_input_text')).rejects.toThrow(
			'no registered resolver',
		);
	});
});

// --- registry structural invariants ----------------------------------------

describe('registry integrity', () => {
	test('every descriptor key equals its model field', () => {
		for (const descriptor of allComponentModels()) {
			expect(getComponentModel(descriptor.model)).toBe(descriptor);
		}
	});
	test('every model carrying a resolver stores in the relation column', () => {
		for (const descriptor of allComponentModels()) {
			if (descriptor.resolveData !== undefined) {
				expect(descriptor.column).toBe('relation');
			}
		}
	});
	test('an unported search descriptor carries a reason', () => {
		for (const descriptor of allComponentModels()) {
			if (descriptor.search?.status === 'unported') {
				expect(typeof descriptor.search.reason).toBe('string');
			}
		}
	});
	test('every canonical column model in GOLDEN has a descriptor (coverage)', () => {
		for (const model of Object.keys(GOLDEN_COLUMN)) {
			if (model === 'section') continue; // non-component pseudo-model
			expect(getComponentModel(model)).toBeDefined();
		}
	});
});
