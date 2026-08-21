/**
 * section_tab tab-bar client contract (v7-native, no PHP oracle).
 *
 * The byte-identical client's render_section_tab.js:139 reads
 * `self.context.children.length` UNCONDITIONALLY in the 'section_tab' view. When
 * the server omits `children`, that is `undefined.length` — a TypeError that
 * aborts the ENTIRE edit render (common.render → view_default_edit_section_record
 * → blank record), which is exactly how this regressed: the structure context
 * never emitted the field.
 *
 * Two invariants pin the fix (DEC-12: tripwired or deleted):
 *   1. attachSectionTabChildren fills every section_tab entry's `children` from
 *      the sibling entries whose parent_grouper points at it — the FLAT legacy
 *      ddo_map parents every element to the SECTION, so `parent` cannot be used;
 *      `parent_grouper` is the ontology parent and the client's own placement key
 *      (view_default_edit_section_record.js:196).
 *   2. resolveDefaultView distinguishes the OUTER container ('section_tab' view →
 *      tab bar) from each INNER tab ('tab' view → hidden panel). Both nodes
 *      canonicalize to model 'section_tab'; only the legacy_model ('section_tab'
 *      vs 'tab') tells them apart. Without it the inner tab falls to the default
 *      'section_tab' branch and wrongly builds its OWN nested tab bar.
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { describe, expect, test } from 'bun:test';
import {
	resolveDefaultView,
	type StructureContextEntry,
} from '../../src/core/resolve/structure_context.ts';
import { attachSectionTabChildren } from '../../src/core/section/read.ts';

/** Minimal entry stub — only the fields attachSectionTabChildren reads. */
function entry(over: Partial<StructureContextEntry>): StructureContextEntry {
	return {
		model: 'component_input_text',
		tipo: 'x',
		label: null,
		parent_grouper: null,
		...over,
	} as StructureContextEntry;
}

describe('attachSectionTabChildren (client tab-bar contract)', () => {
	test('a section_tab gets {tipo,label} for each entry parented to it, in order', () => {
		const context: StructureContextEntry[] = [
			entry({
				tipo: 'testheritagecatalog1004',
				model: 'section_tab',
				parent_grouper: 'testheritagecatalog1',
			}),
			entry({
				tipo: 'testheritagecatalog1064',
				model: 'section_tab',
				parent_grouper: 'testheritagecatalog1004',
				label: 'Ingreso',
			}),
			entry({
				tipo: 'testheritagecatalog1016',
				model: 'section_tab',
				parent_grouper: 'testheritagecatalog1004',
				label: 'Descripción',
			}),
			// a component INSIDE the first tab — not a direct child of the container,
			// must NOT appear as a tab label.
			entry({
				tipo: 'f1',
				model: 'component_input_text',
				parent_grouper: 'testheritagecatalog1064',
			}),
		];

		attachSectionTabChildren(context);

		const outer = context.find((e) => e.tipo === 'testheritagecatalog1004');
		expect(outer?.children).toEqual([
			{ tipo: 'testheritagecatalog1064', label: 'Ingreso' },
			{ tipo: 'testheritagecatalog1016', label: 'Descripción' },
		]);
	});

	test('a childless section_tab gets [] — never undefined (the crash guard)', () => {
		const context: StructureContextEntry[] = [
			entry({ tipo: 'empty', model: 'section_tab', parent_grouper: 'sec' }),
		];
		attachSectionTabChildren(context);
		// The literal contract: render_section_tab reads .length, so the field must
		// be an array even with no tabs.
		expect(context[0]!.children).toEqual([]);
	});

	test('non-section_tab entries are left untouched (no children field added)', () => {
		const context: StructureContextEntry[] = [entry({ tipo: 'c', model: 'component_input_text' })];
		attachSectionTabChildren(context);
		expect(context[0]!.children).toBeUndefined();
	});
});

describe('resolveDefaultView (section_tab outer vs inner tab)', () => {
	test('the OUTER section_tab container renders the tab bar (section_tab view)', () => {
		// stored model === canonical → legacy_model is section_tab.
		expect(resolveDefaultView('section_tab', 'section_tab')).toBe('section_tab');
		expect(resolveDefaultView('section_tab', null)).toBe('section_tab');
	});

	test('an INNER tab renders as a panel (tab view) — legacy_model "tab" wins', () => {
		// a 'tab' node canonicalizes to section_tab but keeps legacy_model 'tab'.
		expect(resolveDefaultView('section_tab', 'tab')).toBe('tab');
	});
});
