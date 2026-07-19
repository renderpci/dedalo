/**
 * children_view emission (PHP get_children_view, class.common.php:5286-5316).
 *
 * The value a component imposes on the section_record children it builds. The
 * byte-identical client reads it in `view_line_edit_portal.js:146`
 * (`context.children_view || context.view || 'default'`), so a MISSING value
 * silently degrades to the parent's own view — a relation cell then renders as
 * `view_default_list_section_record`'s even column grid instead of the
 * `view_text_section_record` phrase joined by `fields_separator` spans.
 *
 * That is exactly how this regressed: v7 never emitted the field at all, so
 * `numisdata161` / `rsc368` (ontology `children_view: "text"`) rendered stacked
 * grid cells with ZERO ` | ` separators while v6 rendered
 * `MIB | 49 | Arse, Saguntum | …`. The correct values were already sitting in
 * the PHP-harvested `samples/context.json` reference sets — as documentation
 * NOTHING asserted against. Hence this gate (DEC-12: tripwired or deleted).
 *
 * PHP precedence, in order:
 *   1. ddo_map-injected children_view  (isset($this->children_view))
 *   2. the element's own properties.children_view  (isset() — null falls through)
 *   3. the legacy_model default table below
 *   4. null
 *
 * Steps 1-2 need the ontology and are covered by the read-path gates; this file
 * pins step 3 (the pure table) and reconciles it against the frozen samples.
 */

import { describe, expect, test } from 'bun:test';
import { resolveDefaultChildrenView } from '../../src/core/resolve/structure_context.ts';

/** PHP :5301-5308 — the SIX legacy models that impose 'text' on their children. */
const TEXT_MODELS = [
	'component_relation_children',
	'component_relation_parent',
	'component_relation_index',
	'component_relation_related',
	'component_autocomplete',
	'component_autocomplete_hi',
];

describe('legacy_model default table (PHP get_children_view :5299-5313)', () => {
	test('the six relation-family legacy models resolve to text', () => {
		for (const legacyModel of TEXT_MODELS) {
			expect(resolveDefaultChildrenView('component_portal', legacyModel)).toBe('text');
		}
	});

	test('every other model resolves to null (PHP default branch)', () => {
		for (const legacyModel of [
			'component_portal',
			'component_input_text',
			'component_select',
			'component_dataframe',
			'section',
			'section_list',
		]) {
			expect(resolveDefaultChildrenView(legacyModel, legacyModel)).toBeNull();
		}
	});

	test('dispatch is on legacy_model, NOT the post-replacement model', () => {
		// MODEL_REPLACEMENT_MAP rewrites component_autocomplete -> component_portal.
		// PHP reads get_legacy_model_name_by_tipo (the STORED term), so the
		// autocomplete family must still resolve to 'text' even though the
		// runtime model it travels with is component_portal.
		expect(resolveDefaultChildrenView('component_portal', 'component_autocomplete')).toBe('text');
		expect(resolveDefaultChildrenView('component_portal', 'component_autocomplete_hi')).toBe(
			'text',
		);
		// …and a genuine portal (legacy === runtime) still imposes nothing.
		expect(resolveDefaultChildrenView('component_portal', 'component_portal')).toBeNull();
	});
});

describe('frozen PHP-harvested samples agree with the table', () => {
	// These context.json sets were harvested from the PHP oracle. They carried
	// the right answer while the engine emitted nothing — turn them into a gate
	// so the reference and the code cannot drift apart again.
	const EXPECTED: Record<string, string | null> = {
		component_relation_parent: 'text',
		component_relation_related: 'text',
		component_relation_index: 'text',
		component_portal: null,
		component_input_text: null,
		component_date: null,
		component_check_box: null,
	};

	for (const [model, expected] of Object.entries(EXPECTED)) {
		test(`${model}/samples/context.json children_view === ${JSON.stringify(expected)}`, async () => {
			const sample = await import(`../../src/core/components/${model}/samples/context.json`).then(
				(m) => m.default as { children_view?: unknown },
			);
			// The key must be PRESENT (PHP assigns it unconditionally, so it is
			// on the wire as null rather than absent) and carry the PHP value.
			expect(Object.hasOwn(sample, 'children_view')).toBe(true);
			expect(sample.children_view ?? null).toBe(expected);
		});
	}
});
