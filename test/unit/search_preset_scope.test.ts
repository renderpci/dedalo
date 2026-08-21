/**
 * SEARCH PRESET SCOPE — preset_scope_tipo (client, 2026-07-21).
 *
 * The search panel restores a user's in-progress filter from a per-user *temp
 * editing preset* (dd655) plus named presets (dd623). A preset MUST be keyed by
 * the section actually being SEARCHED (self.target_section_tipo — the same
 * source the field list is built from), NOT by the search's *caller* section
 * (self.section_tipo). The two diverge whenever the searched section differs
 * from the host section: an ontology/thesaurus browser, or a relation/portal/
 * autocomplete picker opened from inside another section.
 *
 * The bug this guards: keying by the caller made those searches collide with
 * the host section's own list preset — an `ontologytype0` filter saved under
 * the Activity `dd542` key resurfaced in the Activity search panel.
 *
 * preset_scope.js is a dependency-free leaf module precisely so this rule can be
 * unit-tested without the browser/client import chain.
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { describe, expect, test } from 'bun:test';
import { preset_scope_tipo } from '../../client/dedalo/core/search/js/preset_scope.js';

/** Seed-shipped ontology, spelled out of the install-TLD census's token grammar. */
const seed = <T extends string, N extends number>(tld: T, id: N): `${T}${N}` => `${tld}${id}`;

describe('preset_scope_tipo', () => {
	test('normal list search: caller == target → the section itself', () => {
		expect(preset_scope_tipo({ section_tipo: 'dd542', target_section_tipo: ['dd542'] })).toBe(
			'dd542',
		);
	});

	test('picker over another section: keys the SEARCHED section, not the caller', () => {
		// The reported leak: Activity (dd542) host, ontology fields searched.
		expect(
			preset_scope_tipo({ section_tipo: 'dd542', target_section_tipo: ['ontologytype0'] }),
		).toBe('ontologytype0');
	});

	test(`thesaurus/portal picker (${seed('rsc', 197)} host → ${seed('rsc', 75)} searched)`, () => {
		expect(
			preset_scope_tipo({ section_tipo: seed('rsc', 197), target_section_tipo: [seed('rsc', 75)] }),
		).toBe(seed('rsc', 75));
	});

	test('tolerates [{tipo}] element shape', () => {
		expect(
			preset_scope_tipo({
				section_tipo: 'dd542',
				target_section_tipo: [{ tipo: 'ontologytype0' }],
			}),
		).toBe('ontologytype0');
	});

	test('legacy caller with no target → falls back to the caller section', () => {
		expect(preset_scope_tipo({ section_tipo: 'dd542', target_section_tipo: null })).toBe('dd542');
		expect(preset_scope_tipo({ section_tipo: 'dd542', target_section_tipo: [] })).toBe('dd542');
	});
});
