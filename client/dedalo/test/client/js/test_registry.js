// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
 * TEST_REGISTRY
 * Single source of truth for client test suites and groups.
 *
 * Each suite maps to one iframe run (one Mocha file via frame_runner).
 * - area: JS module name under test/client/js/ (without .js)
 * - model: optional query param for parameterized suites (e.g. test_component_full)
 *
 * ── TS-rewrite migration tiering (see docs/client_tests.md) ─────────────────
 * These suites were ported verbatim from the PHP client. Against the TS server
 * they are enabled in WAVES as the corresponding server models/tools land
 * (Phase 6). Only migrated groups are pushed into `test_groups` below, so the
 * `run all` gate stays meaningful. The full inventory of every suite — migrated
 * AND deferred (with the reason) — lives in the coverage ledger docs/client_tests.md;
 * nothing is silently dropped. To enable a wave, add its group to `test_groups`.
 *   Wave 1 (ACTIVE): generic infra + pure-unit suites
 *   Wave 2 (deferred): per-component life-cycle suites  → as models port
 *   Wave 3 (deferred): per-tool suites                  → as tools port
 */

import {elements} from './elements.js'

/**
 * Generic integration / infrastructure suites that pass against the TS server
 * today — the Wave 1 gate. (Split from the breadth-sweeping generic suites below,
 * which depend on Phase 6 component/model breadth; see docs/client_tests.md.)
 */
export const generic_suites_green = [
	'test_key_instances',
	'test_get_instance',
	'test_delete_instance',
	'test_instances_lifecycle',
	'test_event_manager',
	'test_components_activate',      // green after component fixes (was flaky, now stable 3/3)
	'test_components_data_changes', // green after save-response DataItem-shape fix (dispatch.ts)
	'test_no_logged_error',
	'test_unknown_error',
	'test_page',
	'test_ts_object',
	'test_ts_object_extended',
	'test_component_common_changed_data',
	'test_section_record',
	'test_service_autocomplete',
	'test_service_time_machine',
	'test_components_lifecycle',     // green after component_iri label-dataframe port (dd560 request_config + context) + external search fix
	'test_components_render',        // same — component_iri list/text + component_external search now render
	'test_others_lifecycle',         // green after get_install_context + list_uploaded_files ports (dispatch.ts)
	'test_additional_text_area'      // green after (1) dispatch catches handler throws → graceful result:false (was raw 500), (2) the dmm480 "map of grapes" demo seed (test/parity/fixtures/dmm_map_of_grapes.seed.sql) with dmm506's key_up_f2 observe, (3) the text_area edit-mode features.av_player port (structure_context.ts) that binds F2→build_tag. Matches the PHP oracle client 16/16.
]

/**
 * Generic-group suites that are DEFERRED against TS: they are named "generic" but
 * actually sweep every component/special model, so they fail on the subset not yet
 * ported (Phase 6). Kept here (and in docs/client_tests.md, with per-failure
 * reasons + file:line) so nothing is silently dropped — move each back into
 * generic_suites_green once its underlying TS gap closes.
 */
export const generic_suites_deferred = [
	'test_diffusion'                 // PHP-BROKEN selector: asserts `button.diffusion`, but the only client producers are the inspector's `span.diffusion` (PHP source identical — span) and the section tool `button.warning.tool_diffusion` (model 'tool_diffusion' per live-PHP capture). Neither is a `button.diffusion` → fails on PHP too. (Inspector also not rendered in TS — separate gap, would not fix the selector.)
]

/** Full generic inventory (green + deferred) — back-compat export. */
export const generic_suites = [...generic_suites_green, ...generic_suites_deferred]

/**
 * Per-component life-cycle suites (one Mocha file per component type) that pass
 * against the TS server today — Wave 2 gate. Each drives the full mode/view
 * matrix + data ops for a single model. (Stable set: passed in two independent
 * runs; see docs/client_tests.md.)
 */
export const lifecycle_suites_green = [
	'test_component_3d',
	'test_component_av',
	'test_component_email',            // green after save-response DataItem-shape fix (dispatch.ts)
	'test_component_external',
	'test_component_geolocation',      // green after save-response DataItem-shape fix (dispatch.ts)
	'test_component_image',
	'test_component_info',
	'test_component_input_text',       // green after save-response DataItem-shape fix (dispatch.ts)
	'test_component_check_box',        // green after select_family search-datalist + entries→[] fix
	'test_component_filter',           // green after filterResolver search-datalist + entries→[] fix
	'test_component_inverse',          // green after inverse empty-value → [] fix (read.ts)
	'test_component_radio_button',     // green after save-response datalist fix (dispatch.ts)
	'test_component_select',            // green after select_family fixes (stable)
	'test_component_password',          // green after literal empty→[] fix (read.ts)
	'test_component_text_area',         // green after literal empty→[] fix (read.ts)
	'test_component_iri',              // green after save-response DataItem-shape fix (dispatch.ts)
	'test_component_json',             // green after save-response DataItem-shape fix (dispatch.ts)
	'test_component_number',           // green after save-response DataItem-shape fix (dispatch.ts)
	'test_component_pdf',
	'test_component_portal_pagination',
	'test_component_publication',
	'test_component_relation_model',
	'test_component_relation_parent',  // green after save context+pagination + resolve_data context fix
	'test_component_relation_index',   // green after resolve_data search-context fix (dispatch.ts)
	'test_component_relation_related',  // green after show_interface.button_add override (structure_context.ts)
	'test_component_section_id',
	'test_component_security_access',
	'test_component_select_lang',
	'test_component_svg',
	'test_component_relation_children',  // green after children-insert target-existence validation (save_component.ts)
	'test_component_portal',            // green after save auto-creates the missing host record (PHP set_dato upsert parity)
	'test_component_filter_records'     // green after get_datalist port (authorized sections datalist, dispatch.ts)
]

/**
 * Life-cycle suites DEFERRED against TS — they fail on the broader mode/view
 * matrix (esp. SEARCH-mode render) and/or save round-trip parity for models not
 * yet complete in Phase 6. NOTE: the parameterized `component` group below
 * (test_component_full, edit-focused matrix) passes for many of these same
 * models — the dedicated life-cycle suite is stricter. Per-suite reasons +
 * file:line live in docs/client_tests.md. Move each here → _green as its gap closes.
 */
export const lifecycle_suites_deferred = [
	// test_component_date now OWNS test3/11 (elements.js date_section_id, a clone
	// of record 1 the save-sweep no longer poisons) — WC-021 record isolation is
	// in place and the shared-test3/1 date pollution is gone. It is STILL deferred
	// for a DIFFERENT, deterministic reason surfaced by the isolation work: its
	// period-mode block (tipo_period 'test218') fails 4/49 even in ISOLATION —
	// test218 is ABSENT from the test3 ontology subtree on this instance, so
	// component_date.get_date_mode (component_date.js:563) reads null.properties.
	// That is an ontology-provisioning gap (add test218 period-date to test3),
	// NOT a harness/record-pollution issue, so record isolation cannot promote it.
	'test_component_date'
]

/** Full life-cycle inventory (green + deferred) — back-compat export. */
export const lifecycle_suites = [...lifecycle_suites_green, ...lifecycle_suites_deferred]

/**
 * Per-tool suites (one Mocha file per tool under tools/) that pass against TS —
 * Wave 3 gate. These are synchronous structural checks (module exports /
 * prototype wiring); they run now that the harness no longer forces async-only
 * (test_bootstrap.js). The tool client modules are served from the TS-owned
 * repo `tools/` tree at /dedalo/tools/*.
 */
export const tool_suites_green = [
	'test_tool_qr',
	'test_tool_assistant',
	'test_tool_cataloging',
	'test_tool_dd_label',
	'test_tool_dev_template',
	'test_tool_export',
	'test_tool_hierarchy',
	'test_tool_image_rotation',
	'test_tool_import_dedalo_csv',
	'test_tool_import_files',
	'test_tool_import_marc21',
	'test_tool_import_rdf',
	'test_tool_import_zotero',
	'test_tool_lang',
	'test_tool_lang_multi',
	'test_tool_media_versions',
	'test_tool_numisdata_epigraphy',
	'test_tool_numisdata_order_coins',
	'test_tool_ontology',
	'test_tool_ontology_parser',
	'test_tool_pdf_extractor',
	'test_tool_posterframe',
	'test_tool_print',
	'test_tool_propagate_component_data',
	'test_tool_subtitles',
	'test_tool_tc',
	'test_tool_time_machine',
	'test_tool_tr_print',
	'test_tool_transcription',
	'test_tool_update_cache',
	'test_tool_upload',
	'test_tool_user_admin'
]

/** Tool suites still failing (module load/structural gaps) — see docs/client_tests.md. */
export const tool_suites_deferred = [
	'test_tool_diffusion',   // diffusion tool structural/module gap
	'test_tool_indexation'   // indexation tool structural/module gap
]

/** Full tool inventory — back-compat export. */
export const tool_suites = [...tool_suites_green, ...tool_suites_deferred]

// Group definitions (built once, activated per wave below).
// Each group renders BOTH its gated (green) suites and its deferred suites so the
// whole inventory is visible in the sidebar. Deferred suites carry `deferred:true`;
// the list marks them and the `run all` gate + stats skip them (they are not green
// yet — see docs/client_tests.md), so the gate stays meaningful while nothing is
// hidden from view.
const withDeferred = (green, deferred) => [
	...green.map(name => ({ id: name, area: name })),
	...deferred.map(name => ({ id: name, area: name, deferred: true }))
]
const generic_group = {
	id		: 'generic',
	title	: 'generic',
	type	: 'generic',
	suites	: withDeferred(generic_suites_green, generic_suites_deferred)
}
const lifecycle_group = {
	id		: 'lifecycle',
	title	: 'life-cycle',
	type	: 'generic',
	suites	: withDeferred(lifecycle_suites_green, lifecycle_suites_deferred)
}
const tools_group = {
	id		: 'tools',
	title	: 'tools',
	type	: 'generic',
	suites	: withDeferred(tool_suites_green, tool_suites_deferred)
}
const component_group = {
	id		: 'component',
	title	: 'components',
	type	: 'component',
	suites	: elements.map(el => ({
		id		: el.model,
		area	: 'test_component_full',
		model	: el.model,
		tipo	: el.tipo,
		element	: el
	}))
}

/**
 * Test groups rendered in the sidebar AND run by the `run all` gate.
 *
 * TS-rewrite tiering: only the currently-migrated wave(s) are listed here. The
 * deferred groups below are kept defined (and exported) for the ledger and for
 * one-line re-activation as Phase 6 breadth lands — move a group into this array
 * to enable its wave. See docs/client_tests.md for per-suite status + reasons.
 */
export const test_groups = [
	generic_group,   // Wave 1 — generic infra
	lifecycle_group, // Wave 2 — per-component life-cycle, green subset
	component_group, // parameterized component matrix, all 33 models green
	tools_group      // Wave 3 — per-tool structural suites (32 green)
]

/**
 * No whole groups are deferred now (tools promoted, 32/34 green). Per-suite
 * deferrals live in generic_suites_deferred, lifecycle_suites_deferred, and
 * tool_suites_deferred — each with its reason. See docs/client_tests.md.
 */
export const deferred_groups = []

// @license-end
