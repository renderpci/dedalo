/**
 * search_operators (search-mode component tooltip) — pure unit gate + a DRIFT
 * GUARD so a newly-added component model can't silently ship without a
 * classification. That the stamp actually reaches every search-mode component
 * is pinned in test/unit/section_elements_context_native.test.ts (the retired
 * differential's twin); here we lock the
 * HTML grammar, the [] vs {} wire shape, the label <mark> fallback, and the
 * "every canonical model is classified" invariant (no DB, no oracle).
 */

import { describe, expect, test } from 'bun:test';
import { allComponentModels } from '../../src/core/components/registry.ts';
import {
	buildSearchOptionsTitle,
	CLASSIFIED_SEARCH_OPERATOR_MODELS,
	MODELS_WITHOUT_SEARCH_OPERATORS,
	searchOperatorsInfo,
	searchOperatorsInfoWire,
} from '../../src/core/search/search_operators.ts';

/** Canonical model of each descriptor (follows the single alias hop). */
const CANONICAL_COMPONENT_MODELS = new Set<string>(
	allComponentModels().map((descriptor) => descriptor.alias ?? descriptor.model),
);

describe('search_operators drift guard', () => {
	test('every canonical component model is classified (has-ops OR explicit-empty)', () => {
		// PHP: EVERY component inherits some search_operators_info() (base returns
		// []). A new model with no classification would emit no tooltip and never
		// be noticed — force a conscious decision here.
		for (const model of CANONICAL_COMPONENT_MODELS) {
			expect(CLASSIFIED_SEARCH_OPERATOR_MODELS.has(model)).toBe(true);
		}
	});

	test('no stale entries — every classified model is a registered canonical model', () => {
		for (const model of CLASSIFIED_SEARCH_OPERATOR_MODELS) {
			expect(CANONICAL_COMPONENT_MODELS.has(model)).toBe(true);
		}
	});

	test('the empty set actually resolves to no operators', () => {
		for (const model of MODELS_WITHOUT_SEARCH_OPERATORS) {
			expect(searchOperatorsInfo(model)).toEqual([]);
		}
	});
});

describe('search_operators wire shape', () => {
	test('empty-operator model → [] (not {}) and empty title (PHP parity)', () => {
		expect(searchOperatorsInfoWire('component_info')).toEqual([]);
		expect(buildSearchOptionsTitle('component_info', {})).toBe('');
	});

	test('unknown/non-component model → [] and empty title (loud-free default)', () => {
		expect(searchOperatorsInfoWire('section')).toEqual([]);
		expect(buildSearchOptionsTitle('section', {})).toBe('');
	});

	test('string model wire map preserves PHP insertion order', () => {
		const wire = searchOperatorsInfoWire('component_input_text') as Record<string, string>;
		expect(Object.keys(wire)).toEqual([
			'!*',
			'*',
			'==',
			'=',
			'!=',
			'-',
			'!!',
			'text*',
			'*text',
			"'text'",
		]);
		expect(wire['!!']).toBe('duplicated');
	});

	test('json uses `duplicate` (not `duplicated`) — a real PHP divergence', () => {
		const wire = searchOperatorsInfoWire('component_json') as Record<string, string>;
		expect(wire['!!']).toBe('duplicate');
	});

	test('relation_children suppresses its trait operators (PHP class override)', () => {
		expect(searchOperatorsInfoWire('component_relation_children')).toEqual([]);
		expect(MODELS_WITHOUT_SEARCH_OPERATORS.has('component_relation_children')).toBe(true);
	});

	test('alias models resolve through canonical (autocomplete → portal → relation)', () => {
		// buildStructureContext passes the canonical model, so the module is keyed
		// by canonical; confirm the relation set is what portal resolves to.
		const portal = searchOperatorsInfoWire('component_portal') as Record<string, string>;
		expect(Object.keys(portal)).toEqual(['!*', '*', '!=', '!==']);
	});
});

describe('buildSearchOptionsTitle HTML grammar', () => {
	test('byte-exact HTML with label resolution + <mark> fallback', () => {
		const labels: Record<string, string> = {
			search_options: 'Search options',
			empty: 'Empty',
			no_empty: 'Not empty',
			different_from: 'Different from',
			// strict_different_from intentionally absent → <mark> fallback
		};
		const html = buildSearchOptionsTitle('component_portal', labels);
		expect(html).toBe(
			'<b>Search options:</b>' +
				'<div class="search_options_title_item"><span>!*</span><span>Empty</span></div>' +
				'<div class="search_options_title_item"><span>*</span><span>Not empty</span></div>' +
				'<div class="search_options_title_item"><span>!=</span><span>Different from</span></div>' +
				'<div class="search_options_title_item"><span>!==</span><span><mark>strict_different_from</mark></span></div>',
		);
	});

	test('operator tokens are inserted raw/unescaped (<, > land verbatim)', () => {
		const labels: Record<string, string> = { search_options: 'x', greater_than: 'gt' };
		const html = buildSearchOptionsTitle('component_date', labels);
		// The `>` operator lands raw inside the span (PHP concatenates unescaped).
		expect(html).toContain('<span>></span><span>gt</span>');
	});
});

/**
 * SERVED-CATALOG CONTRACT — the tests above hand-feed a labels map, which is
 * exactly how a real regression hid: WC-034 (commit 9bf8463882) removed
 * `search_options` + `literal` from the catalog as "unused" while this module
 * still resolved them, so every search-mode component shipped
 * `<b><mark>search_options</mark>:</b>` to the browser and the unit tier stayed
 * green (measured 2026-08-18: 8 red parity assertions). A test must build the
 * situation it tests — here that means reading the SAME catalog the request
 * path reads (structure_context.ts → getLabels(currentApplicationLang())).
 *
 * `strict_different_from` is the ONE pinned exemption: PHP never had a
 * dictionary entry for it either, so the `<mark>` fallback IS the parity
 * behaviour for that key (see the grammar test above).
 */
describe('search_operators labels are served by the real catalog', () => {
	const PINNED_UNTRANSLATED: ReadonlySet<string> = new Set(['strict_different_from']);

	test('every label key the tooltip resolves exists in the master catalog', async () => {
		const { getLabels, MASTER_SOURCE_LANG } = await import('../../src/core/labels/catalog.ts');
		const labels = await getLabels(MASTER_SOURCE_LANG);
		const keys = new Set<string>(['search_options']);
		for (const model of CLASSIFIED_SEARCH_OPERATOR_MODELS) {
			for (const [, labelKey] of searchOperatorsInfo(model)) keys.add(labelKey);
		}
		const missing = [...keys].filter((k) => !(k in labels) && !PINNED_UNTRANSLATED.has(k));
		expect(missing).toEqual([]);
		// The exemption list is shrink-only: a pinned key that IS now served must
		// leave the list, or the pin silently masks nothing.
		for (const k of PINNED_UNTRANSLATED) expect(k in labels).toBe(false);
	});

	test('the served tooltip heading is a translation, never a <mark> placeholder', async () => {
		const { getLabels, MASTER_SOURCE_LANG } = await import('../../src/core/labels/catalog.ts');
		const labels = await getLabels(MASTER_SOURCE_LANG);
		const html = buildSearchOptionsTitle('component_input_text', labels);
		expect(html.startsWith('<b><mark>')).toBe(false);
		expect(html.startsWith(`<b>${labels.search_options}:</b>`)).toBe(true);
	});
});
