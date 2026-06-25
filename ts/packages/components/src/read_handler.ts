import type { ApiHandler, ApiResponse, RqoLike, GateSession } from '@dedalo/core-api';
import {
  resolveGetValue,
  SUPPORTED_GET_VALUE_MODELS,
  type GetValueSource,
  type ResolveGetValueOptions,
} from './get_value_response.ts';
import { resolveCount, analyzeCountFilter, type CountSource } from './count_response.ts';
import { resolveMatrixTable } from './matrix_table.ts';
import {
  buildComponentElementContext,
  SEARCH_CONTEXT_MODELS,
  type ContextConfig,
  type ElementContextSource,
} from './component_element_context.ts';
import { buildRelationSelectComponentContext } from './relation_select_context.ts';
import type { LabelsCache } from './labels_cache.ts';
import {
  buildSectionElementContext,
  sectionHasUnportedButtonTools,
  sectionUsesV6RequestConfig,
} from './section_element_context.ts';
import { buildJsonRows, type ReadLocator } from './build_json_rows.ts';
import {
  buildDataElement,
  UnsupportedDataElement,
  type DataElementModel,
  type DataElementSource,
} from './component_data_element.ts';
import type { ToolsQueryer } from './tools_registry.ts';
import type { ToolPropertiesMap } from './tool_properties_cache.ts';
import type { MediaConfig } from './media_config.ts';
import type { Filter } from '@dedalo/contract';
import { searchRecords, trimTipo, type ConformedFilter } from '@dedalo/search';
import { tryCtx } from '@dedalo/runtime';
import type { Db } from '@dedalo/db';
import {
  saveInputText,
  UnsupportedSave,
  type ChangedDataUpdate,
  type SaveSource,
} from './save_input_text.ts';
import { createRecord, UnsupportedCreate, type CreateSource } from './create_record.ts';
import {
  deleteRecord,
  UnsupportedDelete,
  type DeleteSource,
} from './delete_record.ts';
import {
  duplicateRecord,
  UnsupportedDuplicate,
  DUPLICATE_RESAVE_MODELS,
  SECTION_INFO_TIPOS,
  SKIP_COLUMNS,
  MEDIA_COMPONENT_MODELS,
  type DuplicateSource,
} from './duplicate_record.ts';
import {
  buildInputTextElement,
  UnsupportedInputTextElement,
  type InputTextElementSource,
} from './input_text_element.ts';
import {
  readRaw,
  UnsupportedReadRaw,
  type ReadRawRequest,
} from './read_raw.ts';

/**
 * The relation-bearing matrix tables the inverse-reference scan covers — the exact
 * set common::get_matrix_tables_with_relations() returns on the dev/test install
 * (verified live against dedalo7_mib_test). The delete inverse-ref cleanup scans
 * these tables for records that point at the deleted record. matrix_test is included
 * (the live PHP-on-test-DB runs in DEVELOPMENT_SERVER context). matrix_activity /
 * matrix_dataframe / matrix_counter are intentionally absent (no inverse relations).
 */
const RELATION_TABLES: ReadonlyArray<string> = [
  'matrix',
  'matrix_activities',
  'matrix_hierarchy',
  'matrix_langs',
  'matrix_list',
  'matrix_test',
  'matrix_nexus',
  'matrix_ontology_main',
  'matrix_ontology',
];

/**
 * The component models whose PHP parent class is component_relation_common — the
 * models remove_all_inverse_references reproduces with the plain "remove the locator,
 * re-save the component" path (no id_key/dataframe handling). PHP gates on
 * get_parent_class($model)==='component_relation_common'; this is that set. A
 * referencing component outside it (or component_dataframe) declines the delete.
 */
const RELATION_COMMON_MODELS: ReadonlySet<string> = new Set([
  'component_portal',
  'component_select',
  'component_radio_button',
  'component_check_box',
  'component_filter',
  'component_publication',
  'component_relation_children',
  'component_relation_parent',
  'component_relation_related',
  'component_autocomplete',
]);

/**
 * The largest sqo.limit the native build_json_rows path accepts. The brick
 * renders an EXPLICIT locator set (sqo.filter_by_locators); we keep the cap small
 * so the native path serves only the smallest, fully-verified record renders and
 * everything larger proxies to PHP.
 */
const MAX_BUILD_JSON_ROWS_LIMIT = 1;

/**
 * The largest sqo.limit the native plain-sqo LIST path (searchRecords) accepts.
 * The list path renders the section's paginated page; we keep the cap modest so
 * only small, fully-verified pages serve natively and larger pages proxy to PHP.
 */
const MAX_BUILD_JSON_ROWS_LIST_LIMIT = 10;

/**
 * Component models with a byte-green build_json_rows element builder. A section is
 * eligible for the native build_json_rows path only when EVERY rendered column is
 * one of these (see sectionColumnsAllPorted). Widen this set as element builders
 * are ported.
 */
const PORTED_ELEMENT_MODELS: ReadonlySet<string> = new Set([
  'component_input_text',
  'component_text_area',
  'component_number',
  'component_email',
  // component_date: DATA element + in-section component structure-context are both
  // byte-green (date adds no `features` and is sortable, so its list context matches
  // the generic structure-context builder exactly).
  'component_date',
  // component_select: DATA element (get_value → flat label) + in-section component
  // structure-context are now both byte-green. The context carries the relation
  // request_config block (target_sections + request_config + columns_map) and the
  // recursive get_query_path `path`, built by buildRelationSelectComponentContext
  // (wired into the build_json_rows per-column CONTEXT). Verified against the live
  // dd1010 build_json_rows section render (input_text + 2 selects, byte-green).
  'component_select',
  // NOTE: component_relation_parent / component_relation_related are NOT here.
  // Their DATA element + standalone get_element_context are byte-green, but a
  // build_json_rows section column for them additionally emits the per-locator
  // SUBDATUM label items (the relation's own get_subdatum), each re-stamped by the
  // OUTER section get_subdatum (row_section_id/parent_tipo). No available content
  // section carries a relation_parent/related list column whose records resolve a
  // single-input_text label ddo_map AND survive the section gate, so the in-section
  // relation column is left un-gated (declined) until such a section is captured.
  // NOTE: component_json / component_geolocation are deliberately NOT here. Their
  // DATA element builders ARE ported + byte-gated (the standalone get_data element),
  // but their in-section LIST component structure-context diverges from the generic
  // builder: the json controller adds context.features.{allowed_extensions,
  // default_target_quality} and the geo controller adds context.features.geo_provider
  // AND is sortable=false. Reproducing those model-specific context fields is the
  // element-context phase's job, not this one. Since no available-record section
  // carries json/geo as a fully-ported list column anyway (they are never in a list
  // ddo_map), declining them here keeps the build_json_rows section gate byte-honest.
  // NOTE: component_iri is intentionally NOT here either — its element controller
  // always resolves a dd560 label-dataframe subdatum + emits counter/
  // transliterate_value (with_lang_versions is forced true), none of which is ported.
]);

/**
 * Component (data) models whose EDIT-mode build_json_rows element is byte-green.
 * The edit branch additionally handles the GROUPER models + component_section_id
 * (see sectionEditChildrenAllPorted). This is intentionally NARROW for the first
 * editable-section render: component_input_text's edit element (context WITH tools/
 * css/path + the get_data_lang data item) is byte-verified. text_area/number/email/
 * date edit elements carry edit-mode specials (toolbar/features/tags, etc.) that
 * buildDataElement declines, so they stay out until each is captured + verified.
 */
const PORTED_EDIT_COMPONENT_MODELS: ReadonlySet<string> = new Set([
  'component_input_text',
  // component_number: edit element = the generic structure-context (NO edit-mode
  // context specials — verified vs live: same key set as input_text edit) + the
  // get_data_lang DATA item (parent_tipo + parent_section_id). Byte-green.
  'component_number',
  // component_date: edit element = the generic structure-context (NO context
  // specials; date is sortable, non-translatable) + the base-7 DATA item (the
  // structured raw datum via get_data_lang; controller appends nothing). Byte-green.
  'component_date',
  // component_text_area: edit element adds context.toolbar_buttons (=[] for the
  // gated no-tag case) + context.features (the fixed dd_tipos.php source-constant
  // bag, with references_component_model resolved from the ontology). DATA =
  // get_data_lang (edit) + parent_tipo + fallback_value. Byte-green ONLY for the
  // COMMON text_area: a tags_persons/reference/draw property, a related
  // component_geolocation (button_geo) or component_select_lang (get_original_lang
  // context.options), or tm mode each DECLINE precisely (sectionTextAreaEditPorted /
  // buildDataElement guards) — those edit subsystems are not ported.
  'component_text_area',
  // component_filter (the project/scope filter every editable section carries): its
  // EDIT element = the base component structure-context PLUS `target_sections`
  // ({tipo,label} only — NO permissions block, since component_filter builds its
  // context with add_request_config=false, so NO request_config/columns_map/
  // config_warnings) + the two-step order path; DATA = the raw stored locators
  // (get_data_lang, lg-nolan) + a `datalist` of the user-authorized PROJECTS
  // (get_user_authorized_projects). Byte-green ONLY for the GLOBAL-ADMIN (root)
  // datalist = ALL dd153 projects, each resolved to label (dd156)/order (dd1631)/
  // nearest-in-set parent and sorted by label. The regular-user datalist (the user's
  // own dd170 assignments) and the list/tm get_list_value path are DECLINED — no
  // guessed bytes. Needs the projects datalist search (gated on searchQueryer below).
  'component_filter',
  // component_select (EDIT): its element = the relation request_config context
  // (target_sections + request_config + columns_map + the recursive get_query_path
  // path, ALL reused from the byte-green LIST select in-section context — the PHP
  // controller's context branch is mode-independent) + a DATA item carrying the raw
  // stored locators (get_data_lang) and a `datalist` = get_list_of_values over the
  // target section (each option {value,label,section_id,hide}, sorted). target_sections
  // permissions_new IS reproduced (button_new probe), and `config_warnings` is NEVER
  // emitted in the parity output (SHOW_DEBUG-only; differ-dropped). Byte-green ONLY
  // for the SINGLE-label V5 select (selectEditDatalistPorted): exactly one target
  // section + one input_text-family/generic show-label component; a multi-label
  // select (the get_list_of_values ' | ' join, e.g. dd1016 "Name | code"), a V6
  // source.request_config or filtered_by_search* select DECLINES. Needs the target-
  // section datalist search (gated on searchQueryer + the eligibility gate).
  'component_select',
]);

/**
 * Component models whose value SAVE (update/insert/remove) is ported + byte-verified.
 * canHandleSave gates on these; every other model declines → proxy. Their data
 * column + save-time transform + response element are reproduced in save_component.ts
 * (input_text/text_area → `string`, number → `number`, date → `date`).
 */
const SUPPORTED_SAVE_MODELS: ReadonlySet<string> = new Set([
  'component_input_text',
  'component_text_area',
  'component_number',
  'component_date',
  // component_select (RELATION family): add/remove a target locator. The save mutates
  // ONLY the source row's `relation` slice (locator id from the meta counter, select is
  // monovalue so insert REPLACES) + the audit stamp + source TM/activity — NO inverse
  // ref is written to the target (proven by live capture; component_relation_common has
  // no save override, observers are a no-op for plain selects). relation_parent/related
  // are NOT here: their EDIT response element (main-item + subdatum walk) is un-ported,
  // and parent inverse is dd_ts_api's job — declined → proxy.
  'component_select',
]);

/**
 * Component models whose TIME-MACHINE read (the single-component `get_data` action
 * with source.data_source='tm' + a matrix_id) is byte-reproducible.
 *
 * The tm read renders the historical snapshot from matrix_time_machine.data as the
 * standalone single-component get_data element ({context:[ddo], data:[item]}). It is
 * IDENTICAL to the same component's EDIT get_data element EXCEPT:
 *   - context[0].mode = 'tm' (vs 'edit') — the only context delta,
 *   - data[0].mode = 'tm',
 *   - data[0].entries come from the tm snapshot (resolveDataEntries(mode='tm') =
 *     the list/tm get_list_value transform) instead of the live matrix column.
 * Everything else (tools/permissions/label/path + parent_tipo/parent_section_id/
 * fallback_value) is byte-identical (verified live: input_text/number/email/date/
 * json/geolocation tm vs edit differ ONLY in `mode` + entries source).
 *
 * EXCLUDED (declined → proxy, no guessed bytes) — all verified live:
 *   - component_text_area: tm emits EXTRA data fields the edit element does not
 *     (parent_section_tipo / created_by_user_id / matrix_id) — verified live — and
 *     its tm context drops the edit toolbar_buttons/features; un-ported.
 *   - the RELATION/SELECT family WHOSE TM CONTEXT IS THE RICH RELATION CONTEXT
 *     (select/radio/check_box/relation_parent/related, portal): their tm context
 *     carries target_sections/request_config/columns_map/path, which the tm dispatch's
 *     generic context builder does NOT emit (only buildRelationSelectComponentContext
 *     does, and it is not wired into the tm dispatch). Their tm DATA half (the dd490
 *     relation-filter + datalist) IS now reproducible, but the rich context is not →
 *     declined. (component_publication is the exception: its standalone context is the
 *     BARE generic structure-context — see above — so its tm element is fully ported.)
 *   - component_filter / component_iri tm: filter's tm context is the bare context but
 *     its tm DATA half resolves the projects datalist (get_list_value over dd153) which
 *     is the regular-user-vs-admin branch (not the simple datalist) — declined; iri's
 *     get_properties unconditionally injects a source.request_config (component_dataframe
 *     title) so its context is un-ported → declined.
 *   - the DATAFRAME pairing branch (component_dataframe / from_component_tipo / id_key
 *     pairing-key filtering over the merged tm row, component_common.php lines 1214-1225),
 *     NOT reproduced — has_dataframe / dataframe_ddo components are gated out below.
 */
const SUPPORTED_TM_READ_MODELS: ReadonlySet<string> = new Set([
  'component_input_text',
  'component_number',
  'component_date',
  // component_email: NOW reproducible. The earlier decline was a real (latent) bug in
  // the generic email value path, not a genuine divergence: PHP's get_data_lang filters
  // by the CLASS-level supports_translation flag (TRUE for email, which extends
  // component_string_common) — NOT the ontology `translatable` property (false for
  // email). The tm/list `entries` come from get_list_value() = get_data_lang() over the
  // tm snapshot, with the lang filter `el.lang === lg-nolan`: a snapshot item WITHOUT a
  // `lang` key (the common email storage shape `{id,value}`) is filtered out →
  // null-collapse → entries:null; an item WITH `lang:lg-nolan` is kept. ComponentGeneric
  // now sets supportsTranslation=true for email so getFormattedDataLang applies that
  // exact filter, making the email tm element byte-identical to the (already byte-green)
  // email LIST/EDIT element + the generic structure-context. The same generic-path gate
  // below excludes dataframe / non-default-view / tool_config / with_lang_versions.
  'component_email',
  // component_json / component_geolocation: NOW reproducible. Their COMPONENT
  // structure-context's model-specific `features` block (json:
  // {allowed_extensions:['json'], default_target_quality:null}; geo: {geo_provider})
  // AND geo's sortable=false / no-`path` are ported in buildComponentElementContext
  // (the get_element_context features work), so the tm element's context half now
  // matches. The DATA half was already reproducible (the base-7 get_data_item off the
  // tm snapshot via buildDataElement's tmData path — json→misc col, geo→geo col,
  // entries verbatim from the snapshot). Verified byte-green vs the live PHP tm read
  // (test18 json / test100 + numisdata264 geolocation). The same gate excludes the
  // dataframe / non-default-view / tool_config / with_lang_versions specials.
  'component_json',
  'component_geolocation',
  // component_publication: NOW reproducible. Publication is a relation-family component
  // but its standalone get_element_context is the BARE generic structure-context (already
  // byte-green via the generic builder + in SUPPORTED_ELEMENT_CONTEXT_MODELS), and its
  // list/tm `entries` come from get_list_value() = the matched datalist labels. The tm
  // get_data() relation-filter (drop dd490 frames + non-locators) is reproduced by
  // ComponentRelationCommon.filterTmData; the datalist is enumerated by the injected
  // record search. Byte-green ONLY for the V5 single-target / single-input_text-label
  // shape (the same gate the publication LIST element uses) — a V6 / multi-target /
  // multi-label / filtered_by_search* publication declines (the getListValue loud guard
  // → UnsupportedDataElement, pre-declined by canHandleTmRead). Needs searchQueryer.
  'component_publication',
  // component_radio_button / component_check_box: NOW reproducible. Their tm context is
  // the RICH relation request_config context (target_sections / request_config /
  // columns_map / recursive path), which the tm dispatch rebuilds via
  // buildRelationSelectComponentContext (mode 'tm') — the SAME byte-green builder the
  // standalone get_element_context uses (mode-independent except the `mode` field). The
  // tm DATA half = get_list_value() over the dd490-filtered tm snapshot (filterTmData)
  // matched against the datalist (record-search enumerated). Byte-green ONLY for the V5
  // single-target / single-input_text-label shape (selectLabelColumnsPorted for the
  // context + selectEditDatalistPorted for the datalist) — a V6 / multi-target /
  // multi-label radio/check declines. Needs searchQueryer.
  'component_radio_button',
  'component_check_box',
]);

/**
 * Component models whose get_element_context is fully ported + byte-verified.
 * canHandleRequest gates on these for the get_element_context action; every
 * other model / element kind (section, area, tool, other components) declines →
 * the server proxies to PHP.
 */
export const SUPPORTED_ELEMENT_CONTEXT_MODELS: ReadonlySet<string> = new Set([
  'component_input_text',
  'component_number',
  'component_date',
  // component_email / component_publication: their standalone get_element_context
  // is the BARE generic structure-context (typo…path) in BOTH modes — no
  // model-specific context fields (verified live). The generic builder reproduces
  // them byte-exactly (same family as input_text/number/date).
  'component_email',
  'component_publication',
  // component_text_area: LIST-MODE ONLY. The text_area *_json controller adds
  // context.toolbar_buttons + context.features (the dd_tipos source-constant bag)
  // ONLY in the EDIT-mode branch; the LIST context is the bare generic shape. The
  // EDIT mode is declined (those edit-only fields are not ported here) — gated by
  // the per-mode check in canHandleElementContext.
  'component_text_area',
  // component_json: the generic structure-context PLUS context.features =
  // {allowed_extensions:['json'], default_target_quality:null} (the fixed
  // component_json_json full-context add — present in BOTH modes because the
  // standalone get_element_context always takes the full context branch). Ported
  // in buildComponentElementContext.
  'component_json',
  // component_geolocation: the generic structure-context PLUS context.features =
  // {geo_provider} (properties.geo_provider ?? DEDALO_GEO_PROVIDER), sortable=false
  // (the class get_sortable override → NO `path` key). Both modes. Ported in
  // buildComponentElementContext. Needs DEDALO_GEO_PROVIDER in ContextConfig.
  'component_geolocation',
  // component_filter: the generic structure-context (add_request_config=false → NO
  // request_config/columns_map, path=[]) PLUS a MINIMAL target_sections =
  // [{tipo:'dd153', label}] (just tipo+label, NO permissions). Both modes. Ported
  // in buildComponentElementContext.
  'component_filter',
  // component_select: the relation request_config context (target_sections +
  // request_config + columns_map + recursive path) reused from the byte-green
  // build_json_rows in-section select context. The standalone context is identical
  // (the controller's context branch is mode-independent). Routed to
  // buildRelationSelectComponentContext.
  'component_select',
  // component_relation_parent / component_relation_related: the relation
  // request_config context (request_config + columns_map + view='line' +
  // children_view='text' + path), NO target_sections (select-only). relation_parent
  // uses the generic recursive get_query_path; relation_related uses its fixed
  // two-step get_order_path override (self + hierarchy25). Both carry a stored V6
  // source.request_config (buildRequestConfigV6List). Routed to
  // buildRelationSelectComponentContext. Gated: no section_list child with a
  // properties.view override (the list-mode view-from-section_list path is not
  // reproduced — decline → proxy).
  'component_relation_parent',
  'component_relation_related',
  // component_radio_button: its standalone get_element_context is the SAME shape as
  // component_select (the radio_button_json controller builds get_structure_context
  // with add_request_config=true) EXCEPT target_sections is the MINIMAL {tipo,label}
  // descriptor (the array_map over get_ar_target_section_tipo(), no permissions block)
  // — NOT the rich select descriptor. request_config (V5), columns_map and the
  // recursive get_order_path `path` are byte-identical to the select shape. Routed to
  // buildRelationSelectComponentContext. Gated: V5 only (no source.request_config),
  // and the V5 target-section enumeration must resolve cleanly (no config_warnings).
  'component_radio_button',
  // component_check_box: the check_box_json controller builds get_structure_context
  // with add_request_config=FALSE, so the DDO carries NO request_config / columns_map
  // and path stays [] (the sortable get_order_path add needs add_request_config=true).
  // It then appends the MINIMAL target_sections ({tipo,label}) over
  // get_ar_target_section_tipo() — same shape as component_filter but with the
  // V5-relation targets instead of the fixed dd153. Routed to
  // buildRelationSelectComponentContext (which builds the V5 request_config ONLY to
  // enumerate the target sections, then suppresses it from the output). Same gates as
  // radio.
  'component_check_box',
  // component_section_id: its standalone get_element_context = the generic
  // structure-context PLUS context.color = ontology_node::get_color(section_tipo)
  // (the SECTION node's properties.color ?? '#b9b9b9'), inserted between sortable
  // and legacy_model, AND tools=[] (component_section_id::get_tools() is overridden
  // to [] in every mode). The standalone context build takes add_request_config but
  // its single-component request_config yields no columns → path stays [] (NOT the
  // in-section build_json_rows `column:'section_id'` step, which only appears under
  // add_rqo=true in the section walk). Both modes (list+edit) take the full-context
  // branch (color present in both). Ported in buildComponentElementContext. Verified
  // byte-green vs live (numisdata1522/numisdata8, list+edit).
  'component_section_id',
  // component_iri: INTENTIONALLY ABSENT — confirmed un-gatable (final sweep,
  // re-checked live). There is NO non-source iri to gate: component_iri::get_properties()
  // UNCONDITIONALLY injects `source.request_config` carrying the dd560 "Title dataframe"
  // (a component_dataframe) ddo_map into EVERY iri's properties (class.component_iri.php
  // :476-523), so for any iri the standalone get_element_context (a) emits a `properties`
  // object whose `source` the ontology-verbatim generic builder does NOT have, and (b)
  // builds a FULL V6 request_config over that injected component_dataframe ddo_map —
  // resolving the target section ddo (buttons/color/matrix_table) AND emitting
  // `config_warnings` from the dataframe-ddo_map validation. The class additionally forces
  // with_lang_versions=true + supports_translation=true. None of the request_config-over-
  // dataframe build is ported, and the injection is class-universal (verified: even iris
  // whose ontology properties are only {css} — e.g. numisdata98 — show the injected
  // source.request_config + request_config[] + config_warnings live). → DECLINE → proxy.
]);

/**
 * The SUPPORTED_ELEMENT_CONTEXT_MODELS that route to the relation/select context
 * builder (buildRelationSelectComponentContext) instead of the generic
 * buildComponentElementContext: the models whose standalone context carries the
 * relation request_config block (or, for check_box, derives target_sections from it).
 */
const RELATION_CONTEXT_MODELS: ReadonlySet<string> = new Set([
  'component_select',
  'component_relation_parent',
  'component_relation_related',
  'component_radio_button',
  'component_check_box',
]);

/** Models whose standalone get_element_context is byte-reproducible ONLY in LIST mode. */
const LIST_ONLY_ELEMENT_CONTEXT_MODELS: ReadonlySet<string> = new Set([
  'component_text_area',
]);

/**
 * Handler deps: the value-resolution deps minus matrixTable (resolved per
 * request). `searchQueryer` is required for the `count` action (and for
 * component_relation_children get_value). `contextConfig` + `toolsQueryer` enable
 * the `get_element_context` action (install lang/url config + the tools registry
 * reads). Both are optional: without them the element-context action declines and
 * the request proxies to PHP.
 */
export type CoreApiReadHandlerOptions = Omit<ResolveGetValueOptions, 'matrixTable'> & {
  contextConfig?: ContextConfig;
  toolsQueryer?: ToolsQueryer;
  /**
   * Install-time registered-tools cache map (name→properties), injected at boot
   * (server) or pinned (tests). Required for SECTION-list get_element_context to
   * be accepted: it supplies the exact per-tool `properties` bytes (e.g.
   * tool_print's FLAT shape) the live PHP server serves. See
   * tool_properties_cache.ts.
   */
  toolProperties?: ToolPropertiesMap;
  /**
   * UI-labels cache (application lang) for the SEARCH-mode element context: the
   * search_options_title operator tooltip is built from label::get_label() reads.
   * Injected at boot (server) or pinned (tests). Optional: without it, search-mode
   * get_element_context declines → proxies to PHP. See labels_cache.ts.
   */
  labelsCache?: LabelsCache;
  /**
   * Per-instance media config (the frozen DEDALO_IMAGE_* constants, built via
   * mediaConfigFromEnv at boot). Threaded into the element builder so the
   * component_image LIST data element (get_list_value quality/extension filter)
   * can be served natively. Optional: when absent the image element declines →
   * proxies to PHP. component_image is NOT yet a PORTED_ELEMENT_MODEL, so this is
   * plumbed-but-not-dispatched in the section walk today; the standalone image
   * element is byte-gated in the integration test with a pinned MediaConfig.
   */
  mediaConfig?: MediaConfig;
  /**
   * The connection pool, used by the `save` action to RESERVE a per-request
   * connection for the matrix UPDATE (writes never go through the read pool's
   * implicit pooling — they take a reserved connection). Optional: without it the
   * save action declines → proxies to PHP. Required (with contextConfig +
   * toolsQueryer) for native saves.
   */
  db?: Db;
};

/**
 * Native dd_core_api handler for the `read` AND `count` actions.
 *
 * The core-api registry maps a ddApi to exactly ONE handler, so the dd_core_api
 * handler owns every natively-served action and routes by action internally:
 *
 *   - read  → the get_value sub-path for the ported component models
 *     (input_text, text_area, email, number, date, iri, json, geolocation,
 *     select, radio_button, check_box, relation_parent/related/children).
 *     canHandleRequest gates on source.action==='get_value' AND a ported model;
 *     everything else is declined → server proxies to PHP.
 *
 *   - count → the BASE no-filter list-pagination record-count
 *     (COUNT(DISTINCT section_id) over the section's resolved matrix table(s)
 *     filtered by section_tipo). canHandleRequest gates on sqo.section_tipo
 *     present AND NO filter / filter_by_locators (filtered counts are DECLINED →
 *     proxied to PHP, which has the conform_filter + Mango WHERE machinery).
 *
 * dispatch resolves the section's matrix table per request and returns
 * {result, msg, errors}; the router adds action + csrf_token, reproducing
 * dd_manager's decoration. Both responses are byte-identical to PHP (verified by
 * the parity gate; the differ drops the SHOW_DEBUG `debug` sub-object).
 *
 * PERMISSIONS (count): PHP checks common::get_permissions per section_tipo and
 * returns {total:0} if any is <1. The root user is ≥1 everywhere, so the native
 * path assumes the logged-in user has access. Non-root permission-zero is DEFERRED
 * until the permissions layer is ported (see count_response.ts).
 */
export function createCoreApiReadHandler(opts: CoreApiReadHandlerOptions): ApiHandler {
  /** Conform + support-probe the count sqo's filter; null → decline (proxy). */
  async function supportedCountFilter(
    sqoObj: Record<string, unknown>,
  ): Promise<ReturnType<typeof analyzeCountFilter> extends Promise<infer T> ? T : never> {
    const filter = sqoObj.filter as Filter;
    return analyzeCountFilter(filter, {
      resolveModel: (tipo) => opts.ontology.getModelByTipo(tipo),
      dataLang: opts.langConfig.dataLang,
    });
  }

  /**
   * canHandleRequest for the get_element_context action: accept only COMPONENT
   * models we fully support, with no tool_config in properties (deferred), and
   * only when the install config + tools queryer are wired. Everything else →
   * decline → proxy to PHP.
   */
  async function canHandleElementContext(rqo: RqoLike): Promise<boolean> {
    if (opts.contextConfig === undefined || opts.toolsQueryer === undefined) return false;
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source || typeof source.tipo !== 'string') return false;
    const tipo = source.tipo;
    const model =
      typeof source.model === 'string' ? source.model : await opts.ontology.getModelByTipo(tipo);
    if (model === null) return false;

    // SECTION / AREA branch.
    if (model === 'section' || model.startsWith('area')) {
      const mode = typeof source.mode === 'string' ? source.mode : 'list';
      // Only LIST mode reaches parity (edit/tm/search request_config uses the
      // un-ported recursive section-walk). Decline otherwise → proxy.
      if (mode !== 'list') return false;
      // SECTION list now reaches byte parity: each tool DDO's `properties` is
      // sourced from the install-time registered-tools cache (toolProperties),
      // which serves the exact bytes the live server serves (e.g. tool_print's
      // FLAT shape vs the legacy lang-wrapped tools). Without that cache map we
      // cannot reproduce the flat/wrapped distinction → decline → proxy.
      if (model === 'section' && opts.toolProperties === undefined) return false;
      // Decline sections/areas carrying tool_config (the 'self' ddo_map path is
      // not ported).
      const props = await opts.ontology.getProperties(tipo);
      if (props && Object.prototype.hasOwnProperty.call(props, 'tool_config')) return false;
      // Decline sections with a button_import/button_trigger/button_tool child: their
      // get_buttons_context emits the un-ported per-button tool-resolution (resolved
      // `tools` + the button's `properties`) — e.g. rsc170's button_import rsc1427.
      if (model === 'section' && (await sectionHasUnportedButtonTools(opts.ontology, tipo))) {
        return false;
      }
      // SECTION list now reaches byte parity for BOTH the V5 list path (cont2) and
      // the V6 source.request_config path (e.g. oh1): the section_list child's
      // stored ddo_map is enriched (info/width/column_id/fixed_mode/fields_separator)
      // and columns_map is sourced verbatim from the same child. (Edit/tm/search
      // request_config — the recursive section-walk — is still declined above via
      // the LIST-only mode gate. sectionUsesV6RequestConfig is retained as an
      // exported discriminator for callers/tests but no longer declines on its own.)
      return true;
    }

    // SEARCH-mode component branch (mode:'search'): the search-builder UI requests
    // a component element to render its search input. The context is the same
    // structure-context PLUS config.parent_grouper_label + search_operators_info +
    // search_options_title. It is byte-reproducible for the scalar models whose
    // operator map is static (SEARCH_CONTEXT_MODELS) AND only when the UI-labels
    // cache is wired (search_options_title is built from label::get_label). Other
    // models (select/relation/portal/publication/filter/json/geo/…) carry an
    // un-ported search-form config (target sections, datalists, operator overrides)
    // → decline → proxy.
    const ctxMode = typeof source.mode === 'string' ? source.mode : 'list';
    if (ctxMode === 'search') {
      if (opts.labelsCache === undefined) return false;
      if (!SEARCH_CONTEXT_MODELS.has(model)) return false;
      const sProps = (await opts.ontology.getProperties(tipo)) as Record<string, unknown> | null;
      if (sProps) {
        // Decline any component whose context build needs request_config / add_rqo:
        //  - tool_config: the tool ddo_map 'self' resolution path (not ported).
        //  - source: a STORED request_config in properties (e.g. component_iri's
        //    properties.source.request_config) → the full request_config build.
        //  - unique / has_dataframe: set add_rqo=true in the *_json controller →
        //    request_config + dataframe subdatum (not ported).
        if (
          Object.prototype.hasOwnProperty.call(sProps, 'tool_config') ||
          Object.prototype.hasOwnProperty.call(sProps, 'source') ||
          sProps.unique === true ||
          sProps.has_dataframe === true
        ) {
          return false;
        }
      }
      return true;
    }

    // LIST/EDIT component branch (the standalone structure-context).
    if (!SUPPORTED_ELEMENT_CONTEXT_MODELS.has(model)) return false;
    // LIST-only models (text_area: its EDIT context adds the un-ported
    // toolbar_buttons/features) decline in any non-list mode → proxy.
    if (LIST_ONLY_ELEMENT_CONTEXT_MODELS.has(model) && ctxMode !== 'list') return false;
    // Decline components carrying tool_config in their ontology properties: the
    // tool ddo_map 'self' resolution path is not ported in this phase.
    const props = await opts.ontology.getProperties(tipo);
    if (props && Object.prototype.hasOwnProperty.call(props, 'tool_config')) return false;
    // component_geolocation: a per-component properties.geo_provider override is
    // reproduced, but DEDALO_GEO_PROVIDER must be wired (it always is via the env
    // ContextConfig). No extra gate beyond tool_config.
    // The relation-family models (select / relation_parent / relation_related)
    // route to buildRelationSelectComponentContext. Apply the per-model gates that
    // mirror its un-ported paths:
    if (RELATION_CONTEXT_MODELS.has(model)) {
      const p = props as Record<string, unknown> | null;
      // A V5 select whose label columns are not all ported (nested relations /
      // media labels / V6 source / section_list children) would diverge in the
      // request_config build → decline (mirrors selectLabelColumnsPorted).
      if (model === 'component_select' && !(await selectLabelColumnsPorted(tipo))) return false;
      // component_radio_button / component_check_box: their standalone context's
      // target_sections (and, for radio, the request_config block + recursive path)
      // are built from the SAME V5 relation-node request_config as a select. They are
      // byte-reproducible under the identical constraints: V5 only (no
      // source.request_config), no section_list children, and every show-label column
      // a ported leaf input_text-family/generic model (selectLabelColumnsPorted). A
      // V6/nested/media-label radio/check would diverge → decline → proxy.
      if (model === 'component_radio_button' || model === 'component_check_box') {
        if (!(await selectLabelColumnsPorted(tipo))) return false;
      }
      // relation_parent / relation_related: decline when the component carries a
      // section_list child with a properties.view override (the LIST-mode
      // view-from-section_list resolution is not reproduced), or a non-default
      // dataframe/lang special. The common case (a plain V6 relation column) has
      // no section_list child, so this rarely declines.
      if (model === 'component_relation_parent' || model === 'component_relation_related') {
        if (p && (p.has_dataframe === true || p.with_lang_versions === true)) return false;
        const children = await opts.ontology.getChildren(tipo);
        for (const child of children) {
          if ((await opts.ontology.getModelByTipo(child)) === 'section_list') {
            const cp = (await opts.ontology.getProperties(child)) as { view?: unknown } | null;
            if (cp && cp.view !== undefined) return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Extract the explicit record locators from an sqo.filter_by_locators array,
   * coercing section_id to int (PHP (int) cast). Returns null when any entry is
   * malformed (→ decline; the live record search is not ported here).
   */
  function explicitLocators(sqo: Record<string, unknown> | undefined): ReadLocator[] | null {
    if (!sqo) return null;
    const fbl = sqo.filter_by_locators;
    if (!Array.isArray(fbl) || fbl.length === 0) return null;
    const out: ReadLocator[] = [];
    for (const raw of fbl) {
      if (raw === null || typeof raw !== 'object') return null;
      const o = raw as Record<string, unknown>;
      const st = o.section_tipo;
      const sid = o.section_id;
      if (typeof st !== 'string' || st === '') return null;
      const sidNum = typeof sid === 'number' ? sid : Number.parseInt(String(sid), 10);
      if (!Number.isInteger(sidNum)) return null;
      out.push({ section_tipo: st, section_id: sidNum });
    }
    return out;
  }

  /**
   * Enrich a request sqo's `filter` exactly as PHP conform_filter does, returning a
   * NEW request-sqo object whose `filter` carries the per-clause fields the live
   * read surfaces in `sqo_session.filter` AND in the overlaid request_config sqo:
   *   - join_id      : null for single-step paths (the only shape served natively),
   *   - table_alias  : trim_tipo(main_section_tipo) (the records-search main alias),
   *   - table        : the resolved matrix table for the clause's section_tipo,
   *   - component_path: [last path step's component_tipo].
   * Key order (…path, join_id, table_alias, table, component_path) mirrors PHP's
   * mutation order (search.php sets join_id/table_alias/table; get_search_query then
   * appends component_path) so the serialized bytes match. Nested $and/$or/$not
   * groups recurse; non-clause group items pass through. The original sqo is NOT
   * mutated. The data the WHERE builder consumes is the SEPARATE conformed tree
   * (analyzeCountFilter) — this enrichment is ONLY for the surfaced session sqo.
   */
  async function enrichRequestSqoFilter(
    sqoObj: Record<string, unknown>,
    mainSectionTipo: string,
  ): Promise<Record<string, unknown>> {
    const rawFilter = sqoObj.filter;
    if (rawFilter === null || typeof rawFilter !== 'object') return sqoObj;
    const mainAlias = trimTipo(mainSectionTipo) ?? 'mix';
    const tableCache = new Map<string, string>();
    const resolveTable = async (st: string): Promise<string> => {
      const cached = tableCache.get(st);
      if (cached !== undefined) return cached;
      const t = (await resolveMatrixTable(opts.ontology, st)) ?? 'matrix';
      tableCache.set(st, t);
      return t;
    };

    const enrichGroup = async (group: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const out: Record<string, unknown> = {};
      for (const [op, items] of Object.entries(group)) {
        if (!Array.isArray(items)) {
          out[op] = items;
          continue;
        }
        const enrichedItems: unknown[] = [];
        for (const item of items) {
          if (item === null || typeof item !== 'object') {
            enrichedItems.push(item);
            continue;
          }
          const obj = item as Record<string, unknown>;
          // A leaf clause carries `path`; a nested group does not.
          if (!Object.prototype.hasOwnProperty.call(obj, 'path')) {
            enrichedItems.push(await enrichGroup(obj));
            continue;
          }
          const path = Array.isArray(obj.path) ? (obj.path as Array<Record<string, unknown>>) : [];
          const last = path[path.length - 1];
          const compTipo =
            last && typeof last.component_tipo === 'string' ? last.component_tipo : undefined;
          const stepSt =
            last && typeof last.section_tipo === 'string' ? last.section_tipo : mainSectionTipo;
          const table = await resolveTable(stepSt);
          // Preserve original key order, then append the enrichment keys in PHP order.
          const enriched: Record<string, unknown> = { ...obj };
          enriched.join_id = null;
          enriched.table_alias = mainAlias;
          enriched.table = table;
          if (compTipo !== undefined) {
            enriched.component_path = [compTipo];
          }
          enrichedItems.push(enriched);
        }
        out[op] = enrichedItems;
      }
      return out;
    };

    const enrichedFilter = await enrichGroup(rawFilter as Record<string, unknown>);
    return { ...sqoObj, filter: enrichedFilter };
  }

  /**
   * Whether a component_select's label resolution is byte-ported: it must take the
   * V5 path (NO source.request_config), have NO children (the section_list ddo_map
   * descent is not ported), and every label column on its target section must be a
   * leaf input_text-family / generic model (the models buildDataElement → the
   * relation resolver accepts). Mirrors the loud guards in
   * component_relation_common.resolveLabelComponents so the section gate declines a
   * select whose render would throw UnsupportedDataElement. Sections in the
   * select's relations are dropped (target_section_tipo, locator wins at read).
   */
  async function selectLabelColumnsPorted(selectTipo: string): Promise<boolean> {
    const props = await opts.ontology.getProperties(selectTipo);
    const source = props && typeof props === 'object' ? (props as { source?: unknown }).source : undefined;
    const hasV6 =
      source && typeof source === 'object' && !Array.isArray(source)
        ? Object.prototype.hasOwnProperty.call(source, 'request_config')
        : false;
    if (hasV6) return false; // V6 ddo_map path not ported for select labels.
    const children = await opts.ontology.getChildren(selectTipo);
    if (children.length > 0) return false; // section_list ddo_map descent not ported.
    const relTipos = (await opts.ontology.getRelationTipos(selectTipo)) ?? [];
    const PORTED_LABEL_MODELS = new Set([
      'component_input_text',
      'component_text_area',
      'component_email',
      'component_number',
      'component_json',
      'component_geolocation',
    ]);
    let labelCount = 0;
    for (const rt of relTipos) {
      const m = await opts.ontology.getModelByTipo(rt);
      if (m === null) continue;
      if (m === 'section' || m === 'exclude_elements') continue;
      if (rt === 'dd249') continue; // deprecated security component, dropped.
      if (!PORTED_LABEL_MODELS.has(m)) return false; // nested-relation / media label not ported.
      labelCount++;
    }
    return labelCount > 0;
  }

  /**
   * Whether a component_select's EDIT `datalist` (get_list_of_values) is
   * byte-reproducible. STRICTER than selectLabelColumnsPorted: the datalist builder
   * (ComponentRelationCommon.getListOfValues) requires EXACTLY ONE target section
   * (the `section` model in the select's relations) AND EXACTLY ONE show-label
   * component (input_text-family / generic leaf). PHP joins multiple show components
   * with ' | ' (e.g. dd1016's "Name | code" labels); with one component the join
   * never fires, so the label is unambiguous. >1 label, >1 target, V6
   * source.request_config, filtered_by_search*, or children all make the datalist
   * diverge → decline. Mirrors getListOfValues' loud guards so the section gate
   * declines a select whose edit render would throw UnsupportedSelect.
   */
  async function selectEditDatalistPorted(selectTipo: string): Promise<boolean> {
    const props = await opts.ontology.getProperties(selectTipo);
    const source =
      props && typeof props === 'object' ? (props as { source?: unknown }).source : undefined;
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      if (Object.prototype.hasOwnProperty.call(source, 'request_config')) return false; // V6.
    }
    const p = props as { filtered_by_search?: unknown; filtered_by_search_dynamic?: unknown } | null;
    if (p && (p.filtered_by_search != null || p.filtered_by_search_dynamic != null)) return false;
    const children = await opts.ontology.getChildren(selectTipo);
    if (children.length > 0) return false; // section_list ddo_map descent not ported.
    const relTipos = (await opts.ontology.getRelationTipos(selectTipo)) ?? [];
    const PORTED_LABEL_MODELS = new Set([
      'component_input_text',
      'component_text_area',
      'component_email',
      'component_number',
      'component_json',
      'component_geolocation',
    ]);
    let targetCount = 0;
    let labelCount = 0;
    for (const rt of relTipos) {
      const m = await opts.ontology.getModelByTipo(rt);
      if (m === null) continue;
      if (m === 'section') {
        targetCount++;
        continue;
      }
      if (m === 'exclude_elements') continue;
      if (rt === 'dd249') continue; // deprecated security component, dropped.
      if (!PORTED_LABEL_MODELS.has(m)) return false; // nested-relation / media label not ported.
      labelCount++;
    }
    return targetCount === 1 && labelCount === 1;
  }

  /**
   * Whether EVERY column of a section's (virtual-unaware) section_list child is a
   * PORTED element model: component_input_text, component_text_area,
   * component_number, component_email (the models with byte-green element builders).
   * The V5 list path sources its ddo_map from the section_list child's relations; we
   * resolve them directly and require all to be ported. Sections/exclude_elements
   * columns are dropped by cleanAndExtractRelated, so an un-ported relation makes the
   * whole section ineligible → decline.
   */
  async function sectionColumnsAllPorted(sectionTipo: string): Promise<boolean> {
    const children = await opts.ontology.getChildren(sectionTipo);
    let sectionListTipo: string | null = null;
    for (const child of children) {
      if ((await opts.ontology.getModelByTipo(child)) === 'section_list') {
        sectionListTipo = child;
        break;
      }
    }
    if (sectionListTipo === null) return false;
    const relTipos = (await opts.ontology.getRelationTipos(sectionListTipo)) ?? [];
    if (relTipos.length === 0) return false;
    let portedCount = 0;
    for (const rt of relTipos) {
      const m = await opts.ontology.getModelByTipo(rt);
      if (m === 'section' || m === 'exclude_elements') continue; // dropped by the cleaner
      if (!PORTED_ELEMENT_MODELS.has(m ?? '')) return false;
      // input_text specials the element builder declines (dataframe/transliterate/
      // activity). Decline the whole section so we never emit a half-ported shape.
      if (rt === 'rsc329' || rt === 'dd546') return false;
      // component_select: its DATA element resolves the target-section label columns
      // (get_value). Only the V5 single-level leaf-label shape is byte-ported; a
      // select with children (section_list ddo_map path), a V6 source.request_config,
      // or a non-leaf / non-input_text-family label column would make buildDataElement
      // throw UnsupportedDataElement at render time. Pre-gate it here so the whole
      // section declines (→ proxy) rather than the dispatch erroring.
      if (m === 'component_select' && !(await selectLabelColumnsPorted(rt))) return false;
      const props = await opts.ontology.getProperties(rt);
      if (props) {
        const p = props as {
          has_dataframe?: unknown;
          with_lang_versions?: unknown;
          view?: unknown;
        };
        if (p.has_dataframe === true || p.with_lang_versions === true) return false;
        // A non-default `view` (e.g. colorpicker) surfaces a `view` field in the
        // component context the standalone builder does not emit → decline.
        if (p.view !== undefined && p.view !== 'default') return false;
        // text_area carrying edit-mode tag/transcription config has list-mode parity
        // (the toolbar/features are edit-only), but tags_index/tags_draw can trigger
        // fix_broken_index_tags on list data and TR markup; the element builder
        // declines TR markup at runtime, so we keep the section eligible and let the
        // per-record gate (existence + tag-free) own divergence. No extra decline here.
      }
      portedCount++;
    }
    return portedCount > 0;
  }

  /**
   * Whether EVERY child of a section's FULL RECURSIVE EDIT ddo_map is a model the
   * edit build_json_rows branch byte-reproduces:
   *   - the GROUPER models (section_group / section_group_div / section_tab / tab)
   *     → buildGrouperElement (context-only, byte-green),
   *   - component_section_id → buildSectionIdElement,
   *   - the simple data components in PORTED_EDIT_COMPONENT_MODELS (input_text/
   *     text_area/number/email/date) whose edit element is byte-green.
   * Mirrors resolve_ar_related_edit: the recursive child tree (depth-first
   * pre-order) excluding the box/area/semantic_node/dataframe subtrees, filtered to
   * the component_/grouper models. A child whose model is NOT ported → decline →
   * proxy (e.g. component_filter, relation/portal/media, select-in-edit). The
   * input_text specials (rsc329 notes, dd546 activity) and has_dataframe /
   * with_lang_versions / non-default-view components also decline.
   */
  /**
   * Whether a component_text_area's EDIT element is byte-reproducible: NO tag
   * properties (tags_persons / tags_reference / tags_draw) and NO related
   * component_geolocation (button_geo) or component_select_lang (get_original_lang
   * → context.options). Mirrors the buildDataElement edit guards so the section gate
   * declines a text_area whose edit render would throw UnsupportedDataElement.
   */
  async function textAreaEditChildPorted(tipo: string): Promise<boolean> {
    const props = await opts.ontology.getProperties(tipo);
    if (props) {
      const p = props as {
        tags_persons?: unknown;
        tags_reference?: unknown;
        tags_draw?: unknown;
      };
      if (
        p.tags_persons !== undefined ||
        p.tags_reference !== undefined ||
        p.tags_draw !== undefined
      ) {
        return false;
      }
    }
    const relTipos = (await opts.ontology.getRelationTipos(tipo)) ?? [];
    for (const rt of relTipos) {
      const rm = await opts.ontology.getModelByTipo(rt);
      if (rm === 'component_geolocation' || rm === 'component_select_lang') return false;
    }
    return true;
  }

  async function sectionEditChildrenAllPorted(sectionTipo: string): Promise<boolean> {
    const excludeModels = [
      'box elements',
      'area',
      'component_semantic_node',
      'component_dataframe',
    ];
    const recursive = await opts.ontology.getRecursiveChildren(sectionTipo, excludeModels);
    const required = ['component_', 'section_group', 'section_group_div', 'section_tab', 'tab'];
    let componentCount = 0;
    const seen = new Set<string>();
    for (const childTipo of recursive) {
      if (seen.has(childTipo)) continue;
      const m = (await opts.ontology.getModelByTipo(childTipo)) ?? '';
      if (!required.some((r) => m.includes(r))) continue; // not in the edit ddo_map
      seen.add(childTipo);
      // GROUPER models: context-only, always ported.
      if (
        m === 'section_group' ||
        m === 'section_group_div' ||
        m === 'section_tab' ||
        m === 'tab'
      ) {
        // grouper css is the ontology .content_data block — reproduced verbatim; no
        // extra gate. (A grouper with tool_config would still emit tools=[], so the
        // gate is unaffected.)
        continue;
      }
      // component_section_id: ported (context color + path.column + base-7 data).
      if (m === 'component_section_id') {
        componentCount++;
        continue;
      }
      // component_filter: ported in EDIT mode, but ONLY the GLOBAL-ADMIN (root)
      // datalist (= ALL projects via the projects search). It needs the SQL queryer
      // to enumerate the projects section; without it the datalist cannot be built →
      // decline (proxy to PHP). The element builder itself has no other special.
      if (m === 'component_filter') {
        if (opts.searchQueryer === undefined) return false;
        componentCount++;
        continue;
      }
      // component_select (EDIT): its element = the relation request_config context
      // (target_sections + request_config + columns_map + recursive path) + a
      // `datalist` = get_list_of_values over the target section. Byte-green ONLY for
      // the SINGLE-label V5 shape (selectEditDatalistPorted): V5 (no
      // source.request_config), no children, EXACTLY ONE target section, and EXACTLY
      // ONE input_text-family/generic show-label component. A multi-label select (the
      // get_list_of_values ' | ' join — e.g. dd1016) or a V6/filtered select would
      // make the datalist diverge, so it declines. Needs the SQL queryer to enumerate
      // the target section; without it the datalist cannot be built → decline.
      if (m === 'component_select') {
        if (opts.searchQueryer === undefined) return false;
        if (!(await selectEditDatalistPorted(childTipo))) return false;
        componentCount++;
        continue;
      }
      // simple data components: require the byte-green edit element model.
      if (!PORTED_EDIT_COMPONENT_MODELS.has(m)) return false;
      // input_text specials the element builder declines.
      if (childTipo === 'rsc329' || childTipo === 'dd546') return false;
      const props = await opts.ontology.getProperties(childTipo);
      if (props) {
        const p = props as { has_dataframe?: unknown; with_lang_versions?: unknown; view?: unknown };
        if (p.has_dataframe === true || p.with_lang_versions === true) return false;
        if (p.view !== undefined && p.view !== 'default') return false;
      }
      // component_text_area EDIT specials the element builder declines (toolbar/
      // features/tags/get_original_lang). Mirror the buildDataElement guards so a
      // section carrying a tag-configured / geo-/select_lang-related text_area
      // declines whole rather than erroring mid-walk.
      if (m === 'component_text_area' && !(await textAreaEditChildPorted(childTipo))) {
        return false;
      }
      componentCount++;
    }
    return componentCount > 0;
  }

  /**
   * canHandleRequest for the TIME-MACHINE single-component read: the `get_data`
   * action with source.data_source='tm' + a numeric matrix_id. Accept only:
   *   - the context wiring is present (contextConfig + toolsQueryer; the element
   *     reuses the byte-green component structure-context builder),
   *   - source is a COMPONENT in a SUPPORTED_TM_READ_MODELS model (input_text /
   *     number / email / date / json / geolocation),
   *   - the component is NON-dataframe (has_dataframe true or a non-empty
   *     dataframe_ddo would trigger the merged-tm-row filtering, un-ported) and
   *     carries no non-default `view` / `with_lang_versions` / `tool_config`
   *     (those surface extra context fields the standalone builder does not emit),
   *   - the input_text specials (rsc329 notes / dd546 activity) decline,
   *   - a positive integer section_id + matrix_id are present.
   * Everything else declines → proxy to PHP (which has the full tm + dataframe
   * machinery). The matrix_time_machine read itself can't fail the gate (a missing
   * row → entries=null, exactly as PHP renders it).
   */
  async function canHandleTmRead(rqo: RqoLike): Promise<boolean> {
    if (opts.contextConfig === undefined || opts.toolsQueryer === undefined) return false;
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source) return false;
    if (source.data_source !== 'tm') return false;
    // matrix_id must be a positive integer (the tm row PK).
    const midRaw = source.matrix_id;
    const matrixId =
      typeof midRaw === 'number' ? midRaw : Number.parseInt(String(midRaw ?? ''), 10);
    if (!Number.isInteger(matrixId) || matrixId < 1) return false;
    if (typeof source.tipo !== 'string') return false;
    const tipo = source.tipo;
    const model =
      typeof source.model === 'string' ? source.model : await opts.ontology.getModelByTipo(tipo);
    if (model === null || !SUPPORTED_TM_READ_MODELS.has(model)) return false;
    // section_id must be a concrete positive integer.
    const sidRaw = source.section_id;
    const sectionId =
      typeof sidRaw === 'number' ? sidRaw : Number.parseInt(String(sidRaw ?? ''), 10);
    if (!Number.isInteger(sectionId) || sectionId < 1) return false;
    // input_text specials the element builder declines.
    if (tipo === 'rsc329' || tipo === 'dd546') return false;
    // dataframe / lang-versions / non-default view / tool_config specials decline.
    const props = (await opts.ontology.getProperties(tipo)) ?? {};
    const p = props as {
      has_dataframe?: unknown;
      dataframe_ddo?: unknown;
      with_lang_versions?: unknown;
      view?: unknown;
      tool_config?: unknown;
    };
    if (p.has_dataframe === true || p.with_lang_versions === true) return false;
    if (Object.prototype.hasOwnProperty.call(props, 'dataframe_ddo') && p.dataframe_ddo) {
      return false;
    }
    if (p.view !== undefined && p.view !== 'default') return false;
    if (Object.prototype.hasOwnProperty.call(props, 'tool_config')) return false;
    // component_publication (DATALIST family): the tm `entries` = get_list_value()
    // over the datalist, which needs the SQL queryer to enumerate the target section
    // AND the byte-reproducible single-target / single-input_text-label V5 shape (the
    // getListOfValues loud guard would otherwise throw → decline). Reuse the select
    // edit datalist gate (same shape: exactly one target section + one leaf label, no
    // V6 source / filtered_by_search* / section_list children).
    if (model === 'component_publication') {
      if (opts.searchQueryer === undefined) return false;
      if (!(await selectEditDatalistPorted(tipo))) return false;
    }
    // component_radio_button / component_check_box: the tm element needs BOTH the rich
    // relation CONTEXT (buildRelationSelectComponentContext — byte-green only for the V5
    // leaf-label shape, selectLabelColumnsPorted) AND the datalist DATA (get_list_value
    // — selectEditDatalistPorted: exactly one target + one leaf input_text label). Needs
    // the SQL queryer to enumerate the target section's datalist.
    if (model === 'component_radio_button' || model === 'component_check_box') {
      if (opts.searchQueryer === undefined) return false;
      if (!(await selectLabelColumnsPorted(tipo))) return false;
      if (!(await selectEditDatalistPorted(tipo))) return false;
    }
    return true;
  }

  /**
   * canHandleRequest for the build_json_rows `read` (default action) path: accept
   * only the narrow, byte-verified case — a SECTION in LIST mode whose
   * request_config columns are ALL input_text, V5 (not V6), no tool_config /
   * button-tools, with an EXPLICIT small filter_by_locators record set. Everything
   * else declines → the server proxies the full action to PHP.
   */
  async function canHandleBuildJsonRows(rqo: RqoLike): Promise<boolean> {
    // Requires the same wiring the section-context path needs.
    if (
      opts.contextConfig === undefined ||
      opts.toolsQueryer === undefined ||
      opts.toolProperties === undefined
    ) {
      return false;
    }
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source || typeof source.tipo !== 'string') return false;
    const tipo = source.tipo;
    const sectionTipo =
      typeof source.section_tipo === 'string' ? source.section_tipo : tipo;
    const model =
      typeof source.model === 'string' ? source.model : await opts.ontology.getModelByTipo(tipo);
    if (model !== 'section') return false;
    const mode = typeof source.mode === 'string' ? source.mode : 'list';
    // Only LIST and EDIT modes reach native parity. EDIT renders the section's full
    // recursive ddo_map (groupers + section_id + the ported edit components); tm /
    // search remain declined → proxy.
    if (mode !== 'list' && mode !== 'edit') return false;
    const isEdit = mode === 'edit';

    const sqo = (rqo as { sqo?: unknown }).sqo;
    const sqoObj =
      sqo !== null && typeof sqo === 'object' ? (sqo as Record<string, unknown>) : undefined;

    // ── path selection ──
    //  - EXPLICIT locators (sqo.filter_by_locators present, well-formed): the
    //    capped explicit-record render.
    //  - FILTERED search (sqo.filter present, NO filter_by_locators, EXPLICIT
    //    limit+offset, NO custom order, fully-ported filter): the real SEARCH-RESULTS
    //    view → searchRecords WITH the conformed filter WHERE. Needs the SQL queryer.
    //  - PLAIN sqo (section_tipo + limit/offset, NO filter_by_locators, NO filter,
    //    NO order): the real LIST view → searchRecords. DECLINED (session-stateful).
    const hasFbl =
      sqoObj !== undefined &&
      Object.prototype.hasOwnProperty.call(sqoObj, 'filter_by_locators');
    const hasFilter =
      sqoObj !== undefined && Object.prototype.hasOwnProperty.call(sqoObj, 'filter');
    const locators = hasFbl ? explicitLocators(sqoObj) : null;

    // The limit (cap differs per path: explicit is single-record; list is paginated).
    const rawLimit = sqoObj?.limit;
    const limit =
      typeof rawLimit === 'number' ? rawLimit : Number.parseInt(String(rawLimit ?? ''), 10);

    if (hasFbl) {
      // ── explicit-locator path ──
      if (locators === null) return false;
      if (Number.isInteger(limit) && limit > MAX_BUILD_JSON_ROWS_LIMIT) return false;
      if (locators.length > MAX_BUILD_JSON_ROWS_LIMIT) return false;
      // every locator must target the request's section_tipo (single-section render).
      if (locators.some((l) => l.section_tipo !== sectionTipo)) return false;
    } else if (hasFilter) {
      // ── FILTERED-search path (searchRecords + conformed filter WHERE) ──
      // VERIFIED LIVE (rsc205, str-contains 'ed' on rsc141, limit 5 offset 0): the
      // matched, paginated section_ids — and the WHOLE rendered response — are
      // BYTE-STABLE across (a) a fresh session, (b) a session with a prior plain
      // read, and (c) a session with a prior filtered read. That is because PHP's
      // session merge (dd_core_api build_json_rows, lines 2170-2198) only fills SQO
      // properties the request OMITS (`!property_exists($sqo, …)`): when the request
      // carries `filter` AND `limit` AND `offset`, NONE are inherited from session, so
      // the explicit filter is authoritative and the search is byte-stable
      // statelessly. We therefore serve it natively, gating tightly so the session
      // merge can never change the result:
      //   - section_tipo must be exactly [sectionTipo] (single-section search),
      //   - LIST mode only (edit forces limit=1 + a different shape),
      //   - EXPLICIT limit AND offset present (else session could inject them),
      //   - NO custom sqo.order (a custom order flips $use_window=true — not ported),
      //   - NO filter_by_locators in the sqo (handled above),
      //   - the filter must CONFORM (security gate) AND use ONLY ported operators/
      //     families (string ==/contains, number =) — else decline → proxy.
      if (mode !== 'list') return false;
      if (opts.searchQueryer === undefined) return false;
      const stArr = sqoObj?.section_tipo;
      if (!Array.isArray(stArr) || stArr.length !== 1 || stArr[0] !== sectionTipo) return false;
      // limit + offset must be EXPLICIT integers in the request (no session merge).
      if (!Object.prototype.hasOwnProperty.call(sqoObj!, 'limit')) return false;
      if (!Object.prototype.hasOwnProperty.call(sqoObj!, 'offset')) return false;
      if (!Number.isInteger(limit) || limit < 0) return false;
      const rawOffset = sqoObj!.offset;
      const offsetNum =
        typeof rawOffset === 'number' ? rawOffset : Number.parseInt(String(rawOffset ?? ''), 10);
      if (!Number.isInteger(offsetNum) || offsetNum < 0) return false;
      // A custom order is not ported (would flip $use_window=true → wrapper subquery).
      if (Object.prototype.hasOwnProperty.call(sqoObj!, 'order')) return false;
      // The filter must conform + be fully ported (analyzeCountFilter never throws;
      // invalid/unsupported/empty → null → decline → proxy).
      const conformed = await analyzeCountFilter(sqoObj!.filter as Filter, {
        resolveModel: (tipo) => opts.ontology.getModelByTipo(tipo),
        dataLang: opts.langConfig.dataLang,
      });
      if (conformed === null) return false;
    } else {
      // ── plain-sqo LIST path (searchRecords) — DECLINED → proxy to PHP ──
      // PHP's plain-sqo list (no explicit filter_by_locators) is SESSION-STATEFUL:
      // dd_core_api persists the section's sqo in the PHP session, so a prior request
      // (e.g. an explicit-locator read, or a search) for the SAME section leaves a
      // stored filter_by_locators/limit/offset that the next plain list INHERITS and
      // merges. searchRecords here is STATELESS (request-sqo only): byte-green for a
      // fresh session, but it diverges from live PHP inside a real browser session
      // that has accumulated sqo state (verified live — same plain list returns the
      // full page from TS but the prior locator's single row from PHP). Until the
      // sqo_session overlay (PHP's get/merge of the session-stored sqo per section)
      // is ported, the plain list must PROXY so it never diverges in a stateful
      // session. The explicit-locator render above is stateless and byte-stable, so
      // it stays native. See task: port session/security sqo overlay.
      return false;
    }

    // The section context itself must be byte-reproducible (same gates the
    // get_element_context section branch uses). The V6-request_config gate only
    // applies to LIST mode (the V6 source.request_config is a list-only stored
    // config; edit always takes the recursive V5 walk), so it is skipped for edit.
    if (!isEdit && (await sectionUsesV6RequestConfig(opts.ontology, sectionTipo))) return false;
    if (await sectionHasUnportedButtonTools(opts.ontology, sectionTipo)) return false;
    const props = await opts.ontology.getProperties(sectionTipo);
    if (props && Object.prototype.hasOwnProperty.call(props, 'tool_config')) return false;

    // every rendered element must be a ported model: LIST → the section_list columns;
    // EDIT → the full recursive ddo_map (groupers + section_id + ported components).
    if (isEdit) {
      if (!(await sectionEditChildrenAllPorted(sectionTipo))) return false;
    } else if (!(await sectionColumnsAllPorted(sectionTipo))) {
      return false;
    }

    if (hasFbl && locators !== null) {
      // EVERY explicit locator must resolve to an EXISTING record. The empty /
      // missing-record path takes the sections_json empty branch whose
      // request_config sqo_config is re-derived (session-limit overlay) and is NOT
      // byte-reproduced here → decline so the live search owns it. (Cheap: one
      // matrix probe per locator; the cap keeps this to a single row.) The
      // searchRecords list path needs no probe: it only ever returns rows that
      // exist.
      const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
      for (const loc of locators) {
        const row = await opts.matrix.getRow(matrixTable, loc.section_tipo, loc.section_id);
        if (row === null) return false;
      }
    }

    return true;
  }

  /**
   * canHandleRequest for the `save` action — a single-component value mutation.
   * Accept only:
   *   - the wiring is present (db + contextConfig + toolsQueryer, for the write +
   *     the response element),
   *   - source.type==='component', model ∈ {input_text, text_area, number, date},
   *   - mode is edit (or absent → edit; list/tm/search saves diverge),
   *   - EXACTLY ONE changed_data item, action ∈ {update, insert, remove}
   *     (sort_data / add_new_element / set_data change the array shape differently →
   *     declined),
   *   - per action: update/remove carry a numeric id (the found-by-id replace/remove
   *     path); update/insert carry a data-item OBJECT value (a bare-string wipes the
   *     column in PHP and is not ported),
   *   - the component is NON-translatable + carries no element special the response
   *     builder declines (dataframe / dataframe_ddo / with_lang_versions / non-default
   *     view / tool_config / the rsc329/dd546/activity specials),
   *   - the target matrix row EXISTS (an absent row takes a different write path).
   * Everything else declines → proxy to PHP.
   */
  async function canHandleSave(rqo: RqoLike): Promise<boolean> {
    if (
      opts.db === undefined ||
      opts.contextConfig === undefined ||
      opts.toolsQueryer === undefined
    ) {
      return false;
    }
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source || source.type !== 'component') return false;
    if (typeof source.tipo !== 'string' || typeof source.section_tipo !== 'string') return false;
    const tipo = source.tipo;
    const sectionTipo = source.section_tipo;
    const model =
      typeof source.model === 'string' ? source.model : await opts.ontology.getModelByTipo(tipo);
    if (model === null || !SUPPORTED_SAVE_MODELS.has(model)) return false;
    const mode = typeof source.mode === 'string' ? source.mode : 'edit';
    if (mode !== 'edit') return false;

    // section_id must be a concrete positive integer (an existing record).
    const sidRaw = source.section_id;
    const sectionId =
      typeof sidRaw === 'number' ? sidRaw : Number.parseInt(String(sidRaw ?? ''), 10);
    if (!Number.isInteger(sectionId) || sectionId < 1) return false;

    // changed_data: exactly one item with a supported action + the per-action shape.
    const data = (rqo as { data?: Record<string, unknown> }).data;
    const changedData = data?.changed_data;
    if (!Array.isArray(changedData) || changedData.length !== 1) return false;
    const item = changedData[0] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') return false;
    const action = item.action;
    if (action !== 'update' && action !== 'insert' && action !== 'remove') return false;

    // element specials the response builder declines + the dataframe cascade the
    // remove/insert array mutation does not reproduce + the translatable gate.
    const props = (await opts.ontology.getProperties(tipo)) ?? {};
    const p = props as {
      has_dataframe?: unknown;
      dataframe_ddo?: unknown;
      with_lang_versions?: unknown;
      translatable?: unknown;
      view?: unknown;
      tool_config?: unknown;
    };
    if (p.has_dataframe === true || p.with_lang_versions === true) return false;
    if (Object.prototype.hasOwnProperty.call(props, 'dataframe_ddo') && p.dataframe_ddo) {
      return false;
    }
    if (p.view !== undefined && p.view !== 'default') return false;
    if (Object.prototype.hasOwnProperty.call(props, 'tool_config')) return false;
    // Translatable literal components (input_text / text_area) are SUPPORTED: the save
    // path mutates only the effective-lang slice of the mixed-lang column, with the
    // cross-lang id-sync on insert/update and the remove-all-langs on remove
    // (applyTranslatableMutation). number/date are nolan-by-class (never translatable).
    // with_lang_versions (transliterate) is declined above; a translatable model OTHER
    // than input_text/text_area (none today, defensively) declines here.
    const translatable = p.translatable === true || (await opts.ontology.getTranslatable(tipo));
    if (translatable && model !== 'component_input_text' && model !== 'component_text_area') {
      return false;
    }

    // DATAFRAME slot detection. A literal main can host frame pairing locators (a
    // component_dataframe slot in the `relation` column) WITHOUT carrying has_dataframe/
    // dataframe_ddo on its OWN ontology node (the slot is declared in the RQO ddo_map,
    // which the save RQO does not carry). On REMOVE this fires the id_key cascade
    // (remove_dataframe_data_by_id) — PORTED for the NON-translatable case (the cascade
    // unlinks the removed item's frames, writes the slot, logs the slot SAVE activity,
    // merges remaining frames into the main TM row). insert/update never cascade.
    // Detect by scanning the stored relation column for a frame whose main_component_tipo
    // === this tipo. DECLINE the translatable+dataframe REMOVE (the PHP "gone from EVERY
    // language" guard before the cascade is not reproduced) → proxy to PHP.
    if (action === 'remove') {
      const matrixTableDf = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
      const relationColumn = await opts.matrix.getColumn(
        matrixTableDf,
        sectionTipo,
        sectionId,
        'relation',
      );
      let ownsFrames = false;
      if (relationColumn !== null && typeof relationColumn === 'object') {
        for (const value of Object.values(relationColumn)) {
          if (!Array.isArray(value)) continue;
          if (
            value.some(
              (el) =>
                el !== null &&
                typeof el === 'object' &&
                (el as { type?: unknown }).type === 'dd490' &&
                (el as { main_component_tipo?: unknown }).main_component_tipo === tipo,
            )
          ) {
            ownsFrames = true;
            break;
          }
        }
      }
      if (ownsFrames && translatable) return false;
    }

    // Per-action id/key shape (depends on translatable):
    //   remove : a numeric id is always required (id===null is the remove-all-langs
    //            path, declined). The translatable remove drops the id from EVERY lang.
    //   update : a numeric id locates the item; OR (translatable only) a null id WITH a
    //            numeric key resolves the id from another lang at the same position
    //            (the canonical "fill an empty lang for an existing item" path).
    const idAsInt = (raw: unknown): number =>
      typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
    if (action === 'remove') {
      if (!Number.isInteger(idAsInt(item.id))) return false;
    }
    if (action === 'update') {
      const idNum = idAsInt(item.id);
      if (!Number.isInteger(idNum)) {
        // null id is admissible ONLY for a translatable component with a numeric key.
        if (!translatable) return false;
        const keyNum = typeof item.key === 'number' ? item.key : Number.NaN;
        if (!Number.isInteger(keyNum)) return false;
      }
    }
    if (action === 'update' || action === 'insert') {
      // value must be the full data-item OBJECT (the frontend contract).
      if (item.value === null || typeof item.value !== 'object' || Array.isArray(item.value)) {
        return false;
      }
      // text_area: only a plain (markup/backslash-free) value is byte-stable through
      // the PHP sanitize_text denylist — decline anything else (no regex-port risk).
      if (model === 'component_text_area') {
        const v = (item.value as { value?: unknown }).value;
        if (typeof v !== 'string' || v.includes('<') || v.includes('\\')) return false;
      }
      // component_select: the value must be a well-formed locator (section_id +
      // section_tipo present). A bad-formed locator PHP would drop diverges → decline.
      // An autoreference locator (pointing at the OWN record) is dropped by PHP → decline.
      if (model === 'component_select') {
        const loc = item.value as { section_id?: unknown; section_tipo?: unknown };
        if (
          loc.section_id === undefined ||
          loc.section_id === null ||
          typeof loc.section_tipo !== 'string' ||
          loc.section_tipo === ''
        ) {
          return false;
        }
        if (loc.section_tipo === sectionTipo && String(loc.section_id) === String(sectionId)) {
          return false; // autoreference (own record) — PHP drops it.
        }
      }
    }
    // component_select: the EDIT response element needs the datalist (get_list_of_values)
    // + the SQL queryer to enumerate the target section. Decline when the datalist shape
    // is not byte-reproducible (V6 / filtered_by_search* / multi-target / multi-label /
    // children) or no search queryer is wired. translatable selects are gated above.
    if (model === 'component_select') {
      if (opts.searchQueryer === undefined) return false;
      if (!(await selectEditDatalistPorted(tipo))) return false;
    }
    // input_text specials (notes rsc329 / activity dd546) the element builder declines.
    if (tipo === 'rsc329' || tipo === 'dd546') return false;

    // The row must EXIST (absent → different write path, declined).
    const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
    const row = await opts.matrix.getRow(matrixTable, sectionTipo, sectionId);
    return row !== null;
  }

  /**
   * canHandleRequest for the `create` action — the NARROW first CREATE. Accept only:
   *   - the db is wired (for the reserved-conn allocator + INSERT),
   *   - source.section_tipo present + a real SECTION model (not the activity section
   *     dd542, never created through this path),
   *   - NO create-time side-effect specials beyond the single 'NEW' activity row:
   *     the create_record cache-reset switch fires for the request_config_presets /
   *     register_tools / projects sections — those are cache invalidations (no DB
   *     parity impact), but the PROJECTS section additionally mutates the user's
   *     dd170 filter_master via set_projects (a real extra write), so it is DECLINED.
   *     A section carrying tool_config (the un-ported tool ddo_map path) is declined.
   * The fresh row carries NO component data, so there is nothing to render — the
   * response is just { result:<id> }, identical for any simple section. Everything
   * else declines → proxy to PHP.
   */
  async function canHandleCreate(rqo: RqoLike): Promise<boolean> {
    if (opts.db === undefined) return false;
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source || typeof source.section_tipo !== 'string' || source.section_tipo === '') {
      return false;
    }
    const sectionTipo = source.section_tipo;
    // The activity section (dd542) is logger-managed; never created here.
    if (sectionTipo === 'dd542') return false;
    // Must be a real section.
    const model = await opts.ontology.getModelByTipo(sectionTipo);
    if (model !== 'section') return false;
    // The PROJECTS section (dd153) triggers set_projects_to_new_section_record (a
    // dd170 filter_master write) — an extra side-effect not ported. Decline.
    if (sectionTipo === 'dd153') return false;
    // Sections carrying tool_config (the 'self' tool ddo_map path) are not ported.
    const props = await opts.ontology.getProperties(sectionTipo);
    if (props && Object.prototype.hasOwnProperty.call(props, 'tool_config')) return false;
    return true;
  }

  /**
   * canHandleRequest for the `duplicate` action — copy a section record → NEW record.
   * Accept ONLY an all-ported-save-model section, gated on the ACTUAL populated source
   * columns (the duplicate re-saves only what is stored). Accept when:
   *   - the db is wired (reserved-conn allocator + INSERT + re-save cascade),
   *   - the session is GLOBAL-ADMIN (root): permission >= 2 AND the only byte-stable
   *     component_filter::set_data branch (the regular-user non-access-locator merge is
   *     not reproducible),
   *   - source.section_tipo + a concrete section_id (>=1), a real SECTION model that is
   *     NOT the activity section (dd542) nor the projects section (dd153, the extra
   *     set_projects write), NOT carrying tool_config,
   *   - the source row EXISTS and its relation_search column is NULL (the hierarchical
   *     ancestor-index builder is un-ported),
   *   - EVERY populated component (skipping the data/meta/relation_search columns + the
   *     dd196 audit group) is a ported NOLAN re-save model (input_text/text_area/number/
   *     date/select/filter/publication/radio_button/check_box), NOT media/portal/
   *     relation_parent/children, and NOT translatable.
   * Everything else declines → proxy to PHP.
   */
  async function canHandleDuplicate(rqo: RqoLike, session?: GateSession): Promise<boolean> {
    if (opts.db === undefined) return false;
    // Only a global-admin session is byte-reproducible (filter pass-through + perm>=2).
    // The session is the gate-time snapshot (server passes it to canHandleRequest BEFORE
    // the request context exists, so tryCtx() is empty here — use the param).
    if (!session || session.isGlobalAdmin !== true || session.userId === null) return false;

    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source || typeof source.section_tipo !== 'string' || source.section_tipo === '') {
      return false;
    }
    const sectionTipo = source.section_tipo;
    if (sectionTipo === 'dd542' || sectionTipo === 'dd153') return false;
    const sidRaw = source.section_id;
    const sectionId =
      typeof sidRaw === 'number' ? sidRaw : Number.parseInt(String(sidRaw ?? ''), 10);
    if (!Number.isInteger(sectionId) || sectionId < 1) return false;

    // Must be a real section, no tool_config.
    const model = await opts.ontology.getModelByTipo(sectionTipo);
    if (model !== 'section') return false;
    const props = await opts.ontology.getProperties(sectionTipo);
    if (props && Object.prototype.hasOwnProperty.call(props, 'tool_config')) return false;

    // The source row must EXIST.
    const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
    const row = await opts.matrix.getRow(matrixTable, sectionTipo, sectionId);
    if (row === null) return false;

    // relation_search must be NULL (the ancestor-index build is un-ported).
    const relSearch = (row as Record<string, unknown>).relation_search;
    if (relSearch !== null && relSearch !== undefined) return false;

    // EVERY populated non-skip component must be a ported NOLAN re-save model.
    const RESAVE_COLUMNS = ['relation', 'string', 'date', 'iri', 'geo', 'number', 'media', 'misc'];
    for (const col of RESAVE_COLUMNS) {
      if (SKIP_COLUMNS.has(col)) continue;
      const colData = (row as Record<string, unknown>)[col];
      if (colData === null || colData === undefined || typeof colData !== 'object') continue;
      for (const [tipo, items] of Object.entries(colData as Record<string, unknown>)) {
        if (items === null) continue;
        if (SECTION_INFO_TIPOS.has(tipo)) continue; // dd196 audit group skipped
        const cm = await opts.ontology.getModelByTipo(tipo);
        if (cm === null) return false;
        if (MEDIA_COMPONENT_MODELS.has(cm)) return false;
        if (cm === 'component_portal') return false;
        if (cm === 'component_relation_parent' || cm === 'component_relation_children') return false;
        if (!DUPLICATE_RESAVE_MODELS.has(cm)) return false;
        // Translatable input_text/text_area produce per-lang TM rows — not ported.
        if (
          (cm === 'component_input_text' || cm === 'component_text_area') &&
          (await opts.ontology.getTranslatable(tipo))
        ) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * canHandleRequest for the `delete` action — the NARROW first DELETE. Accept only:
   *   - the db is wired (reserved-conn pipeline),
   *   - delete_mode==='delete_record' (delete_data, the data-only empty, is not ported),
   *   - source.tipo present + a real SECTION model that is NOT the activity section,
   *   - a concrete single section_id (>=1); the sqo/multi-record path is declined,
   *   - the section is NOT a thesaurus/hierarchy/ontology section — it must NOT carry a
   *     component_relation_children or component_relation_parent child (those trigger
   *     sections::delete's remove_parent_references + the ontology-node delete, un-ported),
   *   - the target row EXISTS,
   *   - EVERY referencing component (inverse ref) is a component_relation_common-parented
   *     model (portal/select/radio/check/publication/...) — NOT component_dataframe
   *     (its id_key cleanup path is un-ported). A referencing model we cannot reproduce
   *     declines the whole delete → proxy.
   * Everything else declines → proxy to PHP.
   */
  async function canHandleDelete(rqo: RqoLike): Promise<boolean> {
    if (opts.db === undefined) return false;
    const source = (rqo as { source?: Record<string, unknown> }).source;
    if (!source || typeof source.tipo !== 'string' || source.tipo === '') return false;
    // Only delete_record (the row delete) is ported.
    const deleteMode =
      typeof source.delete_mode === 'string' ? source.delete_mode : 'delete_data';
    if (deleteMode !== 'delete_record') return false;
    // A multi-record sqo delete is declined (the single-record source.section_id path
    // is the only one ported).
    if (Object.prototype.hasOwnProperty.call(rqo as object, 'sqo') &&
        (rqo as { sqo?: unknown }).sqo != null) {
      return false;
    }
    const tipo = source.tipo;
    const sectionTipo =
      typeof source.section_tipo === 'string' ? source.section_tipo : tipo;
    if (sectionTipo === 'dd542') return false; // activity section never deleted here.
    // Must be a real section.
    const model =
      typeof source.model === 'string' ? source.model : await opts.ontology.getModelByTipo(tipo);
    if (model !== 'section') return false;

    // Concrete single section_id (>=1).
    const sidRaw = source.section_id;
    const sectionId =
      typeof sidRaw === 'number' ? sidRaw : Number.parseInt(String(sidRaw ?? ''), 10);
    if (!Number.isInteger(sectionId) || sectionId < 1) return false;

    // Decline thesaurus/hierarchy/ontology sections: a component_relation_children or
    // component_relation_parent child means sections::delete runs the un-ported
    // parent-reference removal + (for ontology sections) the dd_ontology node delete.
    const recursive = await opts.ontology.getRecursiveChildren(sectionTipo, [
      'box elements',
      'area',
      'component_semantic_node',
    ]);
    for (const childTipo of recursive) {
      const m = await opts.ontology.getModelByTipo(childTipo);
      if (m === 'component_relation_children' || m === 'component_relation_parent') {
        return false;
      }
    }

    // The row must EXIST.
    const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
    const row = await opts.matrix.getRow(matrixTable, sectionTipo, sectionId);
    if (row === null) return false;

    // EVERY referencing component must be a component_relation_common-parented model
    // (the cleanup path we reproduce) — NOT component_dataframe (id_key path un-ported).
    const seenComponents = new Set<string>();
    for (const table of RELATION_TABLES) {
      const hits = await opts.matrix.findInverseReferences(table, sectionTipo, sectionId);
      for (const ref of hits) {
        if (seenComponents.has(ref.fromComponentTipo)) continue;
        seenComponents.add(ref.fromComponentTipo);
        const cm = await opts.ontology.getModelByTipo(ref.fromComponentTipo);
        if (cm === null) return false;
        if (!RELATION_COMMON_MODELS.has(cm)) return false;
      }
    }
    return true;
  }

  /**
   * canHandleRequest for the `read_raw` action — a RAW record read driven by a base
   * list search. Accept only the byte-reproducible shape:
   *   - the SQL queryer is wired (drives the records search),
   *   - options.section_tipo + options.tipo present,
   *   - type ∈ {section, component} (target_section's relation scan is declined),
   *   - for component: the model resolves to a known matrix column,
   *   - the sqo is EITHER empty (→ result:[]) OR a NO-filter / fully-CONFORMING-filter
   *     section_tipo list with NO custom order / filter_by_locators. An un-ported /
   *     non-conforming filter, a custom order, or filter_by_locators DECLINES → proxy.
   * Everything else proxies to PHP (PHP owns the un-ported search shapes + the
   * target_section scan + non-superuser permission checks).
   */
  async function canHandleReadRaw(rqo: RqoLike): Promise<boolean> {
    if (opts.searchQueryer === undefined) return false;
    const options = (rqo as { options?: Record<string, unknown> }).options;
    if (!options || typeof options.section_tipo !== 'string' || options.section_tipo === '') {
      // PHP returns an error envelope (not a proxy) for empty section_tipo; serve it
      // natively so the byte-identical error is reproduced.
      return options !== undefined;
    }
    const tipo = typeof options.tipo === 'string' ? options.tipo : '';
    if (tipo === '') return true; // the (reproducible) empty-tipo error envelope.
    const type = typeof options.type === 'string' ? options.type : null;
    if (type === 'target_section') return false; // relation scan not ported → proxy.
    if (type !== 'section' && type !== 'component') return false;

    if (type === 'component') {
      const model =
        typeof options.model === 'string'
          ? options.model
          : await opts.ontology.getModelByTipo(tipo);
      // An un-resolvable model declines (proxy); a resolvable one whose column is
      // unknown is served natively (the byte-identical error envelope, in readRaw).
      if (model === null) return false;
    }

    const sqo = (rqo as { sqo?: unknown }).sqo;
    const sqoEmpty =
      sqo === null ||
      sqo === undefined ||
      (typeof sqo === 'object' && Object.keys(sqo as Record<string, unknown>).length === 0);
    if (sqoEmpty) return true; // result:[] — reproducible.

    if (typeof sqo !== 'object') return false;
    const sqoObj = sqo as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(sqoObj, 'filter_by_locators')) return false;
    if (Object.prototype.hasOwnProperty.call(sqoObj, 'order')) return false;
    if (Object.prototype.hasOwnProperty.call(sqoObj, 'filter')) {
      // Only a fully-conforming + ported filter is served (else proxy).
      const conformed = await analyzeCountFilter(sqoObj.filter as Filter, {
        resolveModel: (t) => opts.ontology.getModelByTipo(t),
        dataLang: opts.langConfig.dataLang,
      });
      if (conformed === null) return false;
    }
    return true;
  }

  return {
    ddApi: 'dd_core_api',
    apiActions: new Set([
      'read',
      'read_raw',
      'count',
      'get_element_context',
      'save',
      'create',
      'duplicate',
      'delete',
    ]),

    async canHandleRequest(rqo: RqoLike, session?: GateSession): Promise<boolean> {
      const action = (rqo as { action?: unknown }).action;

      if (action === 'create') {
        return canHandleCreate(rqo);
      }

      if (action === 'duplicate') {
        return canHandleDuplicate(rqo, session);
      }

      if (action === 'read_raw') {
        return canHandleReadRaw(rqo);
      }

      if (action === 'delete') {
        return canHandleDelete(rqo);
      }

      if (action === 'save') {
        return canHandleSave(rqo);
      }

      if (action === 'get_element_context') {
        return canHandleElementContext(rqo);
      }

      // count: sqo with section_tipo (non-empty). A no-filter sqo is served by the
      // base path; a sqo.filter is served ONLY when it conforms (security gate) AND
      // uses exclusively ported operators/families — otherwise DECLINE → proxy.
      if (action === 'count') {
        // count needs a SQL queryer; without one, proxy to PHP.
        if (opts.searchQueryer === undefined) return false;
        const sqo = (rqo as { sqo?: unknown }).sqo;
        if (sqo === null || typeof sqo !== 'object') return false;
        const sqoObj = sqo as Record<string, unknown>;
        const sectionTipo = sqoObj.section_tipo;
        if (!Array.isArray(sectionTipo) || sectionTipo.length === 0) return false;
        if (sectionTipo.some((st) => typeof st !== 'string')) return false;
        // filter_by_locators is not ported here → proxy to PHP.
        if (Object.prototype.hasOwnProperty.call(sqoObj, 'filter_by_locators')) return false;
        // No filter → base no-filter count (served natively).
        if (!Object.prototype.hasOwnProperty.call(sqoObj, 'filter')) return true;
        // Filtered: serve natively only if the filter is valid AND fully ported.
        // analyzeCountFilter never throws (invalid/unsupported → null → decline).
        const conformed = await supportedCountFilter(sqoObj);
        return conformed !== null;
      }

      // read: three native sub-paths.
      //  - source.action==='get_value' → the per-component plain-value path.
      //  - source.data_source==='tm'   → the single-component TIME-MACHINE read.
      //  - the DEFAULT action (no/other source.action) → build_json_rows, the
      //    section record-render. All decline → proxy when not fully ported.
      const source = (rqo as { source?: Record<string, unknown> }).source;
      if (!source) return false;
      if (source.action === 'get_value') {
        const tipo = source.tipo;
        if (typeof tipo !== 'string') return false;
        const model =
          typeof source.model === 'string' ? source.model : await opts.ontology.getModelByTipo(tipo);
        return model !== null && SUPPORTED_GET_VALUE_MODELS.has(model);
      }
      // TIME-MACHINE single-component read (get_data with data_source='tm').
      if (source.data_source === 'tm') {
        return canHandleTmRead(rqo);
      }
      // build_json_rows default action.
      return canHandleBuildJsonRows(rqo);
    },

    async dispatch(action: string, rqo: RqoLike): Promise<ApiResponse> {
      if (action === 'read_raw') {
        if (opts.searchQueryer === undefined) {
          return {
            result: false,
            msg: 'Error. Request failed [read_raw] ',
            errors: ['read_raw not wired'],
          };
        }
        const searchQueryer = opts.searchQueryer;
        const recordSearch = async (
          searchSqo: { section_tipo: string[]; limit?: number | string; offset?: number },
          filter?: ConformedFilter,
        ) =>
          searchRecords(searchSqo, {
            queryer: searchQueryer,
            resolveTable: async (st) => (await resolveMatrixTable(opts.ontology, st)) ?? 'matrix',
            ...(filter ? { filter } : {}),
          });
        // Re-conform the filter (stateless) so dispatch never depends on
        // canHandleRequest having run. canHandleRequest already proved it conforms.
        const sqoObj = (rqo as { sqo?: unknown }).sqo;
        const conformed =
          sqoObj !== null &&
          typeof sqoObj === 'object' &&
          Object.prototype.hasOwnProperty.call(sqoObj, 'filter')
            ? await analyzeCountFilter((sqoObj as Record<string, unknown>).filter as Filter, {
                resolveModel: (t) => opts.ontology.getModelByTipo(t),
                dataLang: opts.langConfig.dataLang,
              })
            : null;
        try {
          const { result, msg, errors, table } = await readRaw(
            rqo as ReadRawRequest,
            { ontology: opts.ontology, matrix: opts.matrix, recordSearch },
            conformed ?? undefined,
          );
          return table !== undefined
            ? { result, msg, errors, table }
            : { result, msg, errors };
        } catch (err) {
          if (err instanceof UnsupportedReadRaw) {
            return {
              result: false,
              msg: 'Error. Request failed [read_raw] ',
              errors: [err.message],
            };
          }
          throw err;
        }
      }

      if (action === 'create') {
        if (opts.db === undefined) {
          return { result: false, msg: 'Error. Request failed [create]', errors: ['create not wired'] };
        }
        const source = (rqo as { source?: CreateSource }).source;
        if (!source || typeof source.section_tipo !== 'string') {
          return {
            result: false,
            msg: 'API Error: (create) Empty section_tipo (is mandatory)',
            errors: [],
          };
        }
        const session = tryCtx()?.session;
        try {
          const { result, msg, errors } = await createRecord(
            { source },
            {
              db: opts.db,
              ontology: opts.ontology,
              langConfig: opts.langConfig,
              session: {
                userId: session?.userId ?? null,
                isGlobalAdmin: session?.isGlobalAdmin ?? false,
              },
            },
          );
          return { result, msg, errors };
        } catch (err) {
          if (err instanceof UnsupportedCreate) {
            return { result: false, msg: 'Error. Request failed [create]', errors: [err.message] };
          }
          throw err;
        }
      }

      if (action === 'duplicate') {
        if (opts.db === undefined) {
          return {
            result: false,
            msg: 'Error. Request failed [duplicate] ',
            errors: ['duplicate not wired'],
          };
        }
        const source = (rqo as { source?: DuplicateSource }).source;
        if (!source || typeof source.section_tipo !== 'string') {
          return {
            result: false,
            msg: 'API Error: (duplicate) Empty section_tipo (is mandatory)',
            errors: ['empty section tipo'],
          };
        }
        const session = tryCtx()?.session;
        try {
          const { result, msg, errors } = await duplicateRecord(
            { source },
            {
              db: opts.db,
              ontology: opts.ontology,
              langConfig: opts.langConfig,
              matrix: opts.matrix,
              session: {
                userId: session?.userId ?? null,
                isGlobalAdmin: session?.isGlobalAdmin ?? false,
              },
            },
          );
          return { result, msg, errors };
        } catch (err) {
          if (err instanceof UnsupportedDuplicate) {
            return {
              result: false,
              msg: 'Error. Request failed [duplicate] ',
              errors: [err.message],
            };
          }
          throw err;
        }
      }

      if (action === 'delete') {
        if (opts.db === undefined) {
          return { result: false, msg: 'Error. Request failed. ', errors: ['delete not wired'] };
        }
        const source = (rqo as { source?: DeleteSource }).source;
        if (!source || typeof source.tipo !== 'string') {
          return {
            result: false,
            msg: 'Error. Request failed.  [1] Missing ddo_source.',
            errors: ['missing dd_source'],
          };
        }
        const session = tryCtx()?.session;
        try {
          const { result, msg, delete_mode, errors } = await deleteRecord(
            { source },
            {
              db: opts.db,
              ontology: opts.ontology,
              langConfig: opts.langConfig,
              matrix: opts.matrix,
              relationTables: RELATION_TABLES,
              session: {
                userId: session?.userId ?? null,
                isGlobalAdmin: session?.isGlobalAdmin ?? false,
              },
            },
          );
          // delete_mode is a top-level response field (sections::delete) only on
          // success. PHP's $response is built {result, msg, errors} then delete_mode
          // is appended LAST, so the key order is result, msg, errors, delete_mode.
          return delete_mode !== undefined
            ? { result, msg, errors, delete_mode }
            : { result, msg, errors };
        } catch (err) {
          if (err instanceof UnsupportedDelete) {
            return { result: false, msg: 'Error. Request failed. ', errors: [err.message] };
          }
          throw err;
        }
      }

      if (action === 'save') {
        if (
          opts.db === undefined ||
          opts.contextConfig === undefined ||
          opts.toolsQueryer === undefined
        ) {
          return { result: false, msg: 'Error. Request failed [save]', errors: ['save not wired'] };
        }
        const source = (rqo as { source?: SaveSource }).source;
        const data = (rqo as { data?: { changed_data?: unknown } }).data;
        if (!source || !data || !Array.isArray(data.changed_data)) {
          return { result: false, msg: 'Error. Request failed [save]', errors: ['empty source/data'] };
        }
        // Session info (user id + global-admin) from the per-request context (set by
        // the server from the PHP session bridge). Anonymous → no user id → the save
        // declines below (UnsupportedSave) and the response reflects the failure.
        const session = tryCtx()?.session;
        // component_select save: the EDIT response element needs the structure lang +
        // a target-section datalist search (get_list_of_values). Wire them from the SQL
        // queryer, identically to the EDIT-mode select read element. The save gate
        // (canHandleSave) requires the queryer present for a select, so this is set.
        const saveSearchQueryer = opts.searchQueryer;
        const saveDatalistSearch =
          saveSearchQueryer !== undefined
            ? async (sectionTipos: string[]) =>
                searchRecords(
                  { section_tipo: sectionTipos, limit: 0 },
                  {
                    queryer: saveSearchQueryer,
                    resolveTable: async (st) =>
                      (await resolveMatrixTable(opts.ontology, st)) ?? 'matrix',
                  },
                )
            : undefined;
        try {
          const { result, msg, errors } = await saveInputText(
            {
              source,
              changedData: data.changed_data as ChangedDataUpdate[],
            },
            {
              db: opts.db,
              ontology: opts.ontology,
              langConfig: opts.langConfig,
              matrix: opts.matrix,
              context: {
                toolsQueryer: opts.toolsQueryer,
                contextConfig: opts.contextConfig,
                ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
              },
              session: {
                userId: session?.userId ?? null,
                isGlobalAdmin: session?.isGlobalAdmin ?? false,
              },
              structureLang: opts.contextConfig.structureLang,
              ...(saveDatalistSearch !== undefined
                ? { datalistRecordSearch: saveDatalistSearch }
                : {}),
            },
          );
          return { result, msg, errors };
        } catch (err) {
          // A declined special case that slipped past canHandleSave (or a runtime
          // divergence): surface as a failed save envelope. The server's
          // canHandleRequest gate should prevent most of these from dispatching.
          if (err instanceof UnsupportedSave || err instanceof UnsupportedInputTextElement) {
            return {
              result: false,
              msg: 'Error. Request failed [save]',
              errors: [err.message],
            };
          }
          throw err;
        }
      }

      if (action === 'get_element_context') {
        if (opts.contextConfig === undefined || opts.toolsQueryer === undefined) {
          return { result: false, msg: 'Error. Request failed', errors: ['no context config'] };
        }
        const source = (rqo as { source?: ElementContextSource }).source;
        if (!source) {
          return { result: false, msg: 'Error. Request failed', errors: ['empty source'] };
        }
        const ctxModel =
          typeof source.model === 'string'
            ? source.model
            : await opts.ontology.getModelByTipo(source.tipo);
        if (ctxModel !== null && (ctxModel === 'section' || ctxModel.startsWith('area'))) {
          const { result, msg, errors } = await buildSectionElementContext(source, {
            ontology: opts.ontology,
            toolsQueryer: opts.toolsQueryer,
            contextConfig: opts.contextConfig,
            dataLang: opts.langConfig.dataLang,
            structureLang: opts.contextConfig.structureLang,
            ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
          });
          return { result, msg, errors };
        }
        // Relation-family components (select / relation_parent / relation_related):
        // route to the relation/select context builder (request_config block).
        if (ctxModel !== null && RELATION_CONTEXT_MODELS.has(ctxModel)) {
          const { result, msg, errors } = await buildRelationSelectComponentContext(
            {
              tipo: source.tipo,
              section_tipo:
                typeof source.section_tipo === 'string' ? source.section_tipo : source.tipo,
              model: ctxModel,
              ...(typeof source.lang === 'string' ? { lang: source.lang } : {}),
              ...(typeof source.mode === 'string' ? { mode: source.mode } : {}),
            },
            {
              ontology: opts.ontology,
              toolsQueryer: opts.toolsQueryer,
              contextConfig: opts.contextConfig,
              dataLang: opts.langConfig.dataLang,
              structureLang: opts.contextConfig.structureLang,
              ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
            },
          );
          return { result, msg, errors };
        }
        const { result, msg, errors } = await buildComponentElementContext(source, {
          ontology: opts.ontology,
          toolsQueryer: opts.toolsQueryer,
          contextConfig: opts.contextConfig,
          dataLang: opts.langConfig.dataLang,
          ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
          ...(opts.labelsCache ? { labelsCache: opts.labelsCache } : {}),
        });
        return { result, msg, errors };
      }

      if (action === 'count') {
        if (opts.searchQueryer === undefined) {
          return { result: false, msg: 'Error. Request failed', errors: ['no search queryer'] };
        }
        const sqo = (rqo as { sqo?: CountSource }).sqo;
        if (!sqo) {
          return { result: false, msg: 'Error. Request failed', errors: ['empty sqo'] };
        }
        // Re-conform the filter (stateless) so dispatch never depends on
        // canHandleRequest having run. canHandleRequest already proved it
        // conforms + is supported, so this returns a usable tree (or undefined
        // for the no-filter case).
        const conformedFilter =
          sqo.filter !== undefined
            ? await supportedCountFilter(sqo as unknown as Record<string, unknown>)
            : null;
        const baseOpts = {
          ontology: opts.ontology,
          searchQueryer: opts.searchQueryer,
          langConfig: opts.langConfig,
        };
        const { result, msg, errors } = await resolveCount(
          sqo,
          conformedFilter ? { ...baseOpts, conformedFilter } : baseOpts,
        );
        return { result, msg, errors };
      }

      // read
      const source = (rqo as { source?: GetValueSource }).source;
      if (!source) {
        return { result: false, msg: 'Error. Request failed', errors: ['empty source'] };
      }

      // TIME-MACHINE single-component read (get_data + data_source='tm'): render the
      // matrix_time_machine snapshot as the standalone single-component get_data
      // element {context:[ddo(mode:tm)], data:[item(mode:tm, entries=snapshot)]}.
      // dispatch re-derives eligibility statelessly; canHandleTmRead already proved
      // the model/wiring conform.
      if (
        (source as { data_source?: unknown }).data_source === 'tm' &&
        (source as { action?: unknown }).action !== 'get_value'
      ) {
        if (opts.contextConfig === undefined || opts.toolsQueryer === undefined) {
          return { result: false, msg: 'Error. Request failed', errors: ['no context config'] };
        }
        const tmSrc = source as unknown as Record<string, unknown>;
        const tipo = tmSrc.tipo as string;
        const sectionTipo =
          typeof tmSrc.section_tipo === 'string' ? (tmSrc.section_tipo as string) : tipo;
        const model =
          typeof tmSrc.model === 'string'
            ? (tmSrc.model as string)
            : await opts.ontology.getModelByTipo(tipo);
        const sidRaw = tmSrc.section_id;
        const sectionId =
          typeof sidRaw === 'number' ? sidRaw : Number.parseInt(String(sidRaw ?? ''), 10);
        const midRaw = tmSrc.matrix_id;
        const matrixId =
          typeof midRaw === 'number' ? midRaw : Number.parseInt(String(midRaw ?? ''), 10);
        const matrixTable = (await resolveMatrixTable(opts.ontology, sectionTipo)) ?? 'matrix';
        // Read the snapshot datum from matrix_time_machine (PHP get_component_tm_data).
        const tmData = await opts.matrix.getTimeMachineData(sectionTipo, tipo, matrixId);
        const contextDeps = {
          toolsQueryer: opts.toolsQueryer,
          contextConfig: opts.contextConfig,
          ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
        };
        try {
          // input_text has its OWN element builder (fallback_value handling); the
          // other simple models go through the generic buildDataElement.
          let element: { context: unknown[]; data: unknown[] };
          if (model === 'component_input_text') {
            const itSource: InputTextElementSource = {
              tipo,
              section_tipo: sectionTipo,
              section_id: sectionId,
              mode: 'tm',
              model,
              ...(typeof tmSrc.lang === 'string' ? { lang: tmSrc.lang as string } : {}),
              tmData,
            };
            const it = await buildInputTextElement(itSource, {
              matrix: opts.matrix,
              ontology: opts.ontology,
              langConfig: opts.langConfig,
              matrixTable,
              context: contextDeps,
            });
            element = { context: it.context, data: it.data };
          } else {
            const dataSource: DataElementSource = {
              tipo,
              section_tipo: sectionTipo,
              section_id: sectionId,
              mode: 'tm',
              model: model as DataElementModel,
              ...(typeof tmSrc.lang === 'string' ? { lang: tmSrc.lang as string } : {}),
              tmData,
            };
            // DATALIST family (publication / radio_button / check_box) tm: the
            // entries come from get_list_value() = match the tm-filtered locators
            // against the target section's datalist. That needs the record search.
            const searchQueryer = opts.searchQueryer;
            const datalistRecordSearch =
              searchQueryer !== undefined
                ? async (sectionTipos: string[]) =>
                    searchRecords(
                      { section_tipo: sectionTipos, limit: 0 },
                      {
                        queryer: searchQueryer,
                        resolveTable: async (st) =>
                          (await resolveMatrixTable(opts.ontology, st)) ?? 'matrix',
                      },
                    )
                : undefined;
            const el = await buildDataElement(dataSource, {
              matrix: opts.matrix,
              ontology: opts.ontology,
              langConfig: opts.langConfig,
              matrixTable,
              context: contextDeps,
              ...(datalistRecordSearch !== undefined ? { datalistRecordSearch } : {}),
            });
            // RELATION-CONTEXT models (radio_button / check_box): their tm context is
            // the RICH relation request_config context (target_sections / request_config
            // / columns_map / recursive path), which buildDataElement's generic context
            // builder does NOT emit. Re-build it via buildRelationSelectComponentContext
            // (mode 'tm') — the same byte-green builder the standalone get_element_context
            // uses, mode-independent except for the `mode` field. publication keeps its
            // bare generic context (NOT a RELATION_CONTEXT model).
            let context = el.context;
            if (model !== null && RELATION_CONTEXT_MODELS.has(model)) {
              const { result } = await buildRelationSelectComponentContext(
                {
                  tipo,
                  section_tipo: sectionTipo,
                  model,
                  ...(typeof tmSrc.lang === 'string' ? { lang: tmSrc.lang as string } : {}),
                  mode: 'tm',
                },
                {
                  ontology: opts.ontology,
                  toolsQueryer: opts.toolsQueryer,
                  contextConfig: opts.contextConfig,
                  dataLang: opts.langConfig.dataLang,
                  structureLang: opts.contextConfig.structureLang,
                  ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
                },
              );
              context = result === false ? [] : result;
            }
            element = { context, data: el.data };
          }
          return {
            result: { context: element.context, data: element.data },
            msg: 'OK. Request done successfully',
            errors: [],
          };
        } catch (e) {
          if (e instanceof UnsupportedDataElement || e instanceof UnsupportedInputTextElement) {
            // Should not happen (canHandleTmRead pre-gates), but fail soft to proxy.
            return { result: false, msg: 'Error. Request failed', errors: ['tm read declined'] };
          }
          throw e;
        }
      }

      // build_json_rows (default action): the section record-render. dispatch
      // re-derives eligibility (stateless) so it never depends on canHandleRequest
      // having run, then assembles the {context,data}.
      if ((source as { action?: unknown }).action !== 'get_value') {
        if (
          opts.contextConfig === undefined ||
          opts.toolsQueryer === undefined ||
          opts.toolProperties === undefined
        ) {
          return { result: false, msg: 'Error. Request failed', errors: ['no context config'] };
        }
        const bjrSource = source as unknown as Record<string, unknown>;
        const sectionTipo =
          typeof bjrSource.section_tipo === 'string'
            ? (bjrSource.section_tipo as string)
            : (bjrSource.tipo as string);
        const sqo = (rqo as { sqo?: unknown }).sqo;
        const sqoObj =
          sqo !== null && typeof sqo === 'object' ? (sqo as Record<string, unknown>) : undefined;
        const hasFbl =
          sqoObj !== undefined &&
          Object.prototype.hasOwnProperty.call(sqoObj, 'filter_by_locators');
        const locators = hasFbl ? (explicitLocators(sqoObj) ?? []) : undefined;
        const rawOffset = sqoObj?.offset;
        const offset =
          typeof rawOffset === 'number' ? rawOffset : Number.parseInt(String(rawOffset ?? '0'), 10);

        // LIST / SEARCH path: wire the records search + the section_tipo/limit/offset
        // SQO that drives it. buildJsonRows calls recordSearch when no explicit
        // locator set was supplied, passing through the optional conformed filter (the
        // FILTERED search). The resolver maps each section_tipo to its matrix table
        // (same resolveMatrixTable the section render uses). The conformed filter is
        // re-derived here statelessly (so dispatch never depends on canHandleRequest
        // having run) and threaded into searchRecords' deps as `filter`, which reuses
        // the SAME per-component WHERE builders the filtered count uses.
        const hasFilter =
          sqoObj !== undefined && Object.prototype.hasOwnProperty.call(sqoObj, 'filter');
        const searchFilter =
          !hasFbl && hasFilter && sqoObj?.filter !== undefined
            ? await analyzeCountFilter(sqoObj.filter as Filter, {
                resolveModel: (tipo) => opts.ontology.getModelByTipo(tipo),
                dataLang: opts.langConfig.dataLang,
              })
            : null;
        // The request sqo surfaced as `sqo_session` / overlaid onto the request_config
        // sqo. For a FILTERED search PHP enriches each filter clause (join_id /
        // table_alias / table / component_path); reproduce that so those surfaces are
        // byte-green. The plain / explicit-locator paths surface the raw sqo verbatim.
        const requestSqoForSession =
          searchFilter !== null && sqoObj !== undefined
            ? await enrichRequestSqoFilter(sqoObj, sectionTipo)
            : sqoObj;
        const searchQueryer = opts.searchQueryer;
        const recordSearch =
          !hasFbl && searchQueryer !== undefined
            ? async (
                searchSqoArg: {
                  section_tipo: string[];
                  limit?: number | string;
                  offset?: number;
                },
                filter?: unknown,
              ) =>
                searchRecords(searchSqoArg, {
                  queryer: searchQueryer,
                  resolveTable: async (st) =>
                    (await resolveMatrixTable(opts.ontology, st)) ?? 'matrix',
                  ...(filter ? { filter: filter as ConformedFilter } : {}),
                })
            : undefined;
        const searchSqo =
          !hasFbl && sqoObj !== undefined
            ? {
                section_tipo: [sectionTipo],
                ...(sqoObj.limit !== undefined
                  ? { limit: sqoObj.limit as number | string }
                  : {}),
                ...(Number.isInteger(offset) && offset > 0 ? { offset } : {}),
              }
            : undefined;

        // EDIT filter datalist: the GLOBAL-ADMIN projects enumeration (the unlimited
        // search behind get_user_authorized_projects). Wired from the SQL queryer so
        // a filter-bearing editable section renders natively; absent → the filter
        // element declines (the edit gate already required the queryer present).
        const projectsSearch =
          searchQueryer !== undefined
            ? async (sectionTipos: string[]) =>
                searchRecords(
                  { section_tipo: sectionTipos, limit: 0 },
                  {
                    queryer: searchQueryer,
                    resolveTable: async (st) =>
                      (await resolveMatrixTable(opts.ontology, st)) ?? 'matrix',
                  },
                )
            : undefined;

        // EDIT select datalist: enumerate the select's target-section rows (the
        // get_list_of_values search — limit 0, all rows, default project filter). Same
        // shape as the projects search, but parameterized on the select's target
        // section(s). Wired from the SQL queryer so a single-label-V5-select-bearing
        // editable section renders natively; absent → the select element declines.
        const datalistRecordSearch =
          searchQueryer !== undefined
            ? async (sectionTipos: string[]) =>
                searchRecords(
                  { section_tipo: sectionTipos, limit: 0 },
                  {
                    queryer: searchQueryer,
                    resolveTable: async (st) =>
                      (await resolveMatrixTable(opts.ontology, st)) ?? 'matrix',
                  },
                )
            : undefined;

        const result = await buildJsonRows(
          {
            tipo: bjrSource.tipo as string,
            section_tipo: sectionTipo,
            model: 'section',
            ...(typeof bjrSource.mode === 'string' ? { mode: bjrSource.mode as string } : {}),
            ...(typeof bjrSource.lang === 'string' ? { lang: bjrSource.lang as string } : {}),
          },
          {
            ontology: opts.ontology,
            langConfig: opts.langConfig,
            contextConfig: opts.contextConfig,
            section: {
              toolsQueryer: opts.toolsQueryer,
              structureLang: opts.contextConfig.structureLang,
              ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
            },
            element: {
              matrix: opts.matrix,
              context: {
                toolsQueryer: opts.toolsQueryer,
                contextConfig: opts.contextConfig,
                ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
              },
            },
            ...(locators !== undefined ? { locators } : {}),
            ...(recordSearch !== undefined ? { recordSearch } : {}),
            ...(searchSqo !== undefined ? { searchSqo } : {}),
            ...(searchFilter !== null ? { searchFilter } : {}),
            ...(projectsSearch !== undefined ? { projectsSearch } : {}),
            ...(datalistRecordSearch !== undefined ? { datalistRecordSearch } : {}),
            offset: Number.isInteger(offset) ? offset : 0,
            ...(requestSqoForSession ? { requestSqo: requestSqoForSession } : {}),
          },
        );
        const msg = 'OK. Request done successfully';
        return { result, msg, errors: [] };
      }

      const sectionTipo = source.section_tipo ?? source.tipo;
      const matrixTable = await resolveMatrixTable(opts.ontology, sectionTipo);
      const { result, msg, errors } = await resolveGetValue(source, { ...opts, matrixTable });
      return { result, msg, errors };
    },
  };
}
