// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/

/**
 * SEARCH_PATHS_FIXTURE
 * ONE relation column in a picker's search map, as BOTH halves see it — the
 * shared fixture that joins the server's search_paths expansion to the client
 * path builder that reads it (WC-2026-10-01-relation-search-display-paths).
 *
 *  - server half (bun): test/unit/search_paths_client_fixture_native.test.ts
 *    asserts the engine's withSearchDisplayPaths emits `search_paths` (on the
 *    keys the client reads) for the `show_ddo_map` below, and that the search
 *    engine ANSWERS `expected_filter_paths` while it refuses the relation leaf
 *    alone (`relation_leaf_path` — a word on a locator column, WC-2026-09-23).
 *  - client half (Mocha): test_service_autocomplete runs the SHIPPED
 *    common.prototype.build_rqo_search over `search_paths` and asserts it mints
 *    exactly `expected_filter_paths`.
 *
 * Neither half hand-builds the other's shape: change one and the other reds.
 *
 * Structure: repo-owned generic `test` TLD nodes — test54
 * (component_relation_related; its list config shows test52 on test3), test52
 * (component_input_text). `zzpicker` is the picker that owns the column (a
 * scratch name: no node is read for it).
 */

/** The picker that owns the search map. */
export const SEARCH_PATHS_OWNER = 'zzpicker';

/** The picker's show map: one relation column declared WITHOUT children. */
export const show_ddo_map = [
	{
		tipo: 'test54',
		parent: SEARCH_PATHS_OWNER,
		section_tipo: ['test3'],
		model: 'component_relation_related',
		mode: 'list',
	},
];

/** What the server emits as the item's `search_paths`, on the keys the client path builder reads. */
export const search_paths = [
	{
		tipo: 'test54',
		parent: SEARCH_PATHS_OWNER,
		section_tipo: ['test3'],
		model: 'component_relation_related',
	},
	{ tipo: 'test52', parent: 'test54', section_tipo: ['test3'], model: 'component_input_text' },
];

/**
 * The filter_free paths the client must mint from `search_paths`: SERVER order
 * (the relation hop first, the display leaf last), section_tipo a string,
 * component_tipo = tipo.
 */
export const expected_filter_paths = [
	[
		{
			tipo: 'test54',
			section_tipo: 'test3',
			component_tipo: 'test54',
			model: 'component_relation_related',
		},
		{
			tipo: 'test52',
			section_tipo: 'test3',
			component_tipo: 'test52',
			model: 'component_input_text',
		},
	],
];

/** The path the client minted BEFORE search_paths: the relation column as a leaf. */
export const relation_leaf_path = [
	{
		tipo: 'test54',
		section_tipo: 'test3',
		component_tipo: 'test54',
		model: 'component_relation_related',
	},
];

// @license-end
