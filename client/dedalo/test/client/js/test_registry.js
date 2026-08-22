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
	'test_unsaved_guard',             // THE data-loss guard, per model: typing into an edit-mode field must arm window.unsaved_data BEFORE any commit/blur. Driven off elements.js so a new component model inherits the gate. Regression for the blur-committed views (component_input_text, component_date, select, …) that reached no registry until blur, so a reload dropped the typing with no prompt — component_text_area was immune only because it debounces on keystrokes.
	'test_events',                    // when_in_dom shared-observer gate: sync fast path + return forwarding, exactly-once deferred fire, multi-callback per node, drain→re-arm lifecycle, throw isolation, re-entrant registration (events.js JSDoc invariants)
	'test_components_activate',      // green after component fixes (was flaky, now stable 3/3)
	'test_components_data_changes', // green after save-response DataItem-shape fix (dispatch.ts)
	'test_no_logged_error',
	'test_unknown_error',
	'test_api_error',                 // THE client error model + transport (envelope v2 / transport class → ApiError code; the v1 mirror is never read; fetch_api retry keyed on retryable + Retry-After; data_manager.request failure contract). Backend-free: window.fetch stubbed and restored.
	'test_error_policy',              // the pure code → action table (exact → domain.* → *), bare v1 tokens are no longer aliases, additive registration that refuses core overrides; handle_api_error surfaces without a backend (relogin asserted NOT to open when not logged in).
	'test_render_api_error',          // the one renderer: label → ${param}/%s → message → code; XSS — every surface renders '<img onerror>' as TEXT; the panel always carries request_id; debug suffix only under SHOW_DEBUG.
	'test_error_stream',              // streams reject with an ApiError (server code on a non-2xx envelope, client.* otherwise); read_stream's unparseable frame carries client.bad_response under `error`; normalize_stream_error on v2 frames (the v1 frame shape is not read). Backend-free.
	'test_page',
	'test_ts_object',
	'test_ts_object_extended',
	'test_component_common_changed_data',
	'test_section_record',           // the row engine between the section's shared datum and its children: the two child-build error paths (edit must not HANG on a rejected child; the list waiter must reset so a retry can rebuild) plus the whole backend-free surface — init defaults/double-init guard, get_component_data (identity tuple, stubs, section_group, component_dataframe id_key pairing ladder), get_component_info, the edit context filter (dataframe in/out by caller model) and the list column build (order, dedup, search ddo_map fallback, missing-context skip, one shared build pass, fixed_mode). Children are FAKE instances pre-registered under the exact key build_instance will ask for, so a built child PROVES the key contract — including the dataframe's `_<id_key>_<main_component_tipo>` id_variant, which is what makes the exclusion cases prove an absence rather than a cache miss.
	'test_open_related_data',         // the "open relationships" dialog's SQO scoping — the edit-mode found-set offset used to skip the single pinned row, so read_raw returned nothing and no window opened; backend-free (data_manager.request patched on the shared singleton)
	'test_ui_render_edit_modal',      // the per-cell edit modal's caller chain — the surface that makes component tools reachable from a section LIST (WC-059 sibling work); backend-free (fake instance pre-registered in the shared registry)
	'test_service_autocomplete',
	'test_components_lifecycle',     // green after component_iri label-dataframe port (dd560 request_config + context) + external search fix
	'test_components_render',        // same — component_iri list/text + component_external search now render
	'test_others_lifecycle',         // green after list_uploaded_files port (dispatch.ts); 'installer' element excluded — get_install_context 404s once install_status is sealed (permanent on this box), which can never reach 'rendered' (see test_others_lifecycle.js get_elelemnts comment)
	'test_job_tray',                  // the LONG-PROCESS monitoring surface: format_elapsed's boundaries (the readout an operator watches during an hour-long transcode), the shared #floating_dock reuse law, and THE CONNECTION-RELEASE law (a cancelled follower must close its stream — six abandoned ones starve the origin's six HTTP/1.1 slots and freeze the whole page). Backend-free: pure/DOM + a stubbed request_stream — a rendered tray needs a logged-in backend with live jobs.
	'test_thesaurus_pane',            // the picker SURFACE: the thesaurus mounted inline in the caller's own wrapper. Separate from test_thesaurus_picker because it DOES import component_portal (that file's not importing it is one of its assertions). Pins the liveness rule — reuse is decided by asking the area instance, never by a "built" flag, because the refresh() every pick triggers destroys it through ar_instances.
	'test_thesaurus_picker',          // the relation view:'tree' term picker — the shared picker module (selection set, capacity, per-node selectability) and the in-page host's teardown. Backend-free: pure/DOM against a synthetic caller, no component_portal in scope (that isolation is itself an assertion — it is what lets edit-in-list add a host rather than a second picker).
	'test_diffusion',                // needs the RUN'S PINNED diffusion domain (scripts/client_test_server.ts SUITE_DIFFUSION_DOMAIN='test'): matched by term, the installation's domain name resolves to a truncated clone on the suite database and the section map comes back empty, so the inspector draws no opener. Green after the selector fix: the inspector's diffusion opener is a SPAN (`.button.diffusion`), never a `button.diffusion` — nothing else was wrong. Its Publish cases now assert the button renders and is confirm-gated, and ANSWER THE CONFIRM WITH NO: a confirmed click fires a real publish to the configured target and returns before the stream ends, so the old click asserted nothing while writing to a live target every run.
	'test_additional_text_area'      // green after (1) dispatch catches handler throws → graceful result:false (was raw 500), (2) the test480 "map of grapes" demo ontology (src/core/test_data/map_of_grapes_fixture.ts, auto-provisioned by scripts/client_test_runner.ts pre-run) with test506's key_up_f2 observe, (3) the text_area edit-mode features.av_player port (structure_context.ts) that binds F2→build_tag. Matches the PHP oracle client 16/16.
]

/**
 * Generic-group suites DEFERRED against TS. EMPTY since 2026-08-20: the last row
 * (test_diffusion) was never a port gap — it asserted a selector that matched no
 * element. Anything added here needs a reason that names the TS gap, and it must
 * be a gap, not a stale assertion.
 */
export const generic_suites_deferred = []

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
	'test_component_filter',           // needs the run's projects fixture (src/core/test_data/projects_fixture.ts): the install seed ships ONE dd153 project and the record selects it, so check/uncheck have nothing to work with. Green after filterResolver search-datalist + entries→[] fix
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
	'test_component_filter_records',    // green after get_datalist port (authorized sections datalist, dispatch.ts)
	'test_component_date'               // green after the period tipo fix: the suite named test218, which exists in NO ontology; the test3 period-date component is test173 (test3 → test115 → test34). It was never a provisioning gap.
]

/**
 * Life-cycle suites DEFERRED against TS — a model whose broader mode/view matrix
 * (esp. SEARCH-mode render) or save round-trip is not complete. EMPTY since
 * 2026-08-20: the last row (test_component_date) was ledgered as an ontology
 * PROVISIONING gap ("add test218 period-date to test3"), but test218 exists in no
 * ontology on any instance — the test3 period component is test173 and always
 * was. A deferral reason that names a missing thing is worth re-checking before
 * it is believed.
 */
export const lifecycle_suites_deferred = []

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
	'test_tool_user_admin',
	'test_tool_diffusion',   // green after the assertion fix: it required a prototype `get_diffusion_status`, the PHP-era API ACTION name. WC-076 moved the engine in-process and the client method is get_engine_advisory; no client method ever carried the old name.
	'test_tool_indexation'   // two layers: the locked tool template (module export + constructor seed + prototype wiring — green after the assertion fix: it required `new_tag_note` on the prototype, but that is a module-private helper inside tag_note.js, so it asserted the opposite of the contract), plus the BEHAVIOUR block — the tag-info pub/sub (active_value dedup, one-to-many fan-out), _ensure_lazy_instance (already-built short-circuit, unconfigured-role throw, per-role wiring, the ddo.lang > nolan > data_lang ladder), load_related_sections_list's RQO shape, delete_tag's two-confirm destructive path (composite locator key dd96, data/datum observed null FROM INSIDE refresh, step 2 survives a thrown step 1) and render_indexation_note's single-quoted dataset locator. Fixture-free: fake children pre-registered under the exact get_instance key, data_manager patched on the shared singleton, confirm/alert stubbed (a real dialog FREEZES the headless renderer).
]

/**
 * Tool suites still failing (module load/structural gaps). EMPTY since
 * 2026-08-20: both rows were ledgered as "structural/module gaps" and neither
 * was — each asserted ONE prototype name that does not exist by design.
 */
export const tool_suites_deferred = []

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
	tools_group      // Wave 3 — per-tool structural suites (34 green)
]

/**
 * No whole groups are deferred, and since 2026-08-20 no SUITES are either:
 * generic_suites_deferred, lifecycle_suites_deferred and tool_suites_deferred
 * are all empty, so the gate runs the whole inventory.
 */
export const deferred_groups = []

// @license-end
