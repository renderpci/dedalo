/**
 * THE UNBOUND EXTERNAL COMPONENT — a component_external OWNED by a section that
 * names no service (no `api_config`). That is the `misconfigured` case of
 * engineering/EXTERNAL_SPEC.md §8.2 "a section with no api_config".
 *
 * Why a situation and not an ordinary section: since the ownership rule (§3
 * addendum 2026-09-24) a component_external derived for a record of ANOTHER
 * section is FOREIGN — the column does not apply, nothing is asked and nothing
 * is marked. The old way to reach `misconfigured` (derive `test215` for a
 * `test2` record) now measures the foreign rule instead, so the gates that pin
 * `misconfigured` need a component whose OWN section is unbound. Built with the
 * engine's own node door (situation.ts), dropped by the caller.
 */

import { situation } from '../../src/core/test_data/situations/situation.ts';

/** The unbound section: an ordinary section, NO api_config. */
export const UNBOUND_SECTION = 'zzxu1';
/** Its component_external, with a well-formed fields_map. */
export const UNBOUND_COMPONENT = 'zzxu2';

export const UNBOUND_EXTERNAL_SITUATION = situation({
	name: 'component_external owned by a section with no api_config',
	tld: 'zzxu',
	nodes: [
		{
			tipo: UNBOUND_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz unbound section' },
		},
		{
			tipo: UNBOUND_COMPONENT,
			parent: UNBOUND_SECTION,
			model: 'component_external',
			term: { 'lg-spa': 'zz unbound external' },
			properties: { fields_map: [{ local: 'dato', remote: 'title' }] },
		},
	],
});
