/**
 * Port of dd_core_api::get_element_context for a COMPONENT (model component_*).
 *
 * Builds the single structure-context DDO the frontend uses to render a field.
 * The PHP path is: component_common::get_instance(...) → get_json({get_context:
 * true, get_data:false}) → the component's *_json controller → get_structure_context
 * → build_structure_context(_core). For the ported point-read component models
 * (input_text / number / date) the *_json controller calls
 * get_structure_context($permissions, add_rqo=false) with add_rqo=false, so no
 * request_config / columns_map is built (both null → dropped from the DDO).
 *
 * The DDO field order is the dd_object property-declaration order (PHP
 * jsonSerialize = get_object_vars, null-filtered):
 *   typo, type, tipo, section_tipo, parent, parent_grouper, lang, mode, model,
 *   properties, permissions, label, translatable, tools, buttons, css, sortable,
 *   legacy_model, path
 * (view / children_view are null for these models → dropped; request_config /
 * columns_map null → dropped; id / info / labels null → dropped.)
 *
 * FIELD SOURCES (each traced to PHP):
 *   typo='ddo', type='component'  — dd_object constant + resolve_type_from_model.
 *   tipo                          — source.tipo.
 *   section_tipo                  — source.section_tipo.
 *   parent                        — resolve_context_parent(): no session ddo / no
 *                                   from_parent here ⇒ = section_tipo.
 *   parent_grouper                — ontology getParent(tipo).
 *   lang                          — translatable ? requestLang : nolan. The
 *                                   component is instantiated with this lang and
 *                                   get_lang() returns it (non-translatable forces
 *                                   nolan). For these non-translatable fields ⇒ nolan.
 *   mode                          — source.mode.
 *   model                         — get_class = source.model.
 *   properties                    — ontology getProperties(tipo) deep-clone with
 *                                   `css` removed (component, non-list).
 *   permissions                   — ROOT shortcut = 3 (see note). Non-root deferred.
 *   label                         — ontology term in DEDALO_APPLICATION_LANG (fallback).
 *   translatable                  — ontology getTranslatable(tipo).
 *   tools                         — get_tools()+create_tool_simple_context (empty in
 *                                   list mode; component tools only in non-list).
 *   buttons                       — [] (components never carry buttons).
 *   css                           — properties.css (null in list mode → dropped) +
 *                                   the virtual-section override section.css[tipo].
 *   sortable                      — get_sortable(): true except DEDALO_NOTES_TEXT_TIPO.
 *   legacy_model                  — ontology getLegacyModel(tipo) (model_tipo term).
 *   path                          — [] (request_config not built ⇒ get_order_path skipped).
 *
 * PERMISSIONS — ROOT SHORTCUT: security::get_security_permissions returns 3 when
 * the logged user is DEDALO_SUPERUSER (root). We serve only the root path (the
 * TS core does not yet own the session/user-id; like the count handler it assumes
 * the bridged session is root). Full non-root resolution (read_only_scope,
 * permissions_table, the per-section special cases, and the component-level
 * resolve_component_read_permission downgrades) is DEFERRED — components whose
 * tipo triggers those special cases are declined by canHandleRequest.
 */

import type { OntologyRepository } from '@dedalo/ontology';
import {
  filterComponentTools,
  getRegisteredTools,
  type SimpleToolObject,
  type ToolsQueryer,
} from './tools_registry.ts';
import type { ToolPropertiesMap } from './tool_properties_cache.ts';
import type { LabelsCache } from './labels_cache.ts';

/** DEDALO_DATA_NOLAN. */
const NOLAN = 'lg-nolan';
/** DEDALO_NOTES_TEXT_TIPO — sortable=false (the input_text notes timestamp column). */
const NOTES_TEXT_TIPO = 'rsc329';

/**
 * Models whose component get_sortable() override returns false:
 *   - component_geolocation (class override, always false),
 *   - the DEDALO_NOTES_TEXT_TIPO input_text (rsc329, by tipo — handled below).
 * A non-sortable component skips the get_order_path add in build_structure_context
 * (the `$dd_object->sortable===true` gate), so its DDO carries NO `path` key.
 */
const NON_SORTABLE_MODELS: ReadonlySet<string> = new Set(['component_geolocation']);

/** DEDALO_SECTION_PROJECTS_TIPO — the component_filter fixed target section. */
const PROJECTS_SECTION_TIPO = 'dd153';

/**
 * ontology_node::get_color() fallback — the grey returned when the section node
 * carries no properties.color. Used by the component_section_id `color` slot.
 */
const DEFAULT_SECTION_COLOR = '#b9b9b9';

/**
 * SEARCH-MODE operator maps, keyed by ported component model. Each map is the
 * verbatim `search_operators_info()` of the model's search trait (operator token
 * -> label key). Insertion order IS byte-significant (it drives the JSON key order
 * AND the search_options_title item order). Sources:
 *   - string family (input_text/text_area/email): trait.search_component_string_common
 *   - number: trait.search_component_number
 *   - date: trait.search_component_date
 *   - section_id: trait.search_component_section_id
 *   - iri: trait.search_component_iri
 * Models NOT here (select, relation, portal, publication, filter, json, geo, ...)
 * have their own un-ported operator/datalist requirements -> declined by the gate.
 */
const SEARCH_OPERATORS_BY_MODEL: ReadonlyMap<string, ReadonlyArray<[string, string]>> = new Map([
  [
    'component_input_text',
    [
      ['!*', 'empty'],
      ['*', 'no_empty'],
      ['==', 'exactly'],
      ['=', 'similar_to'],
      ['!=', 'different_from'],
      ['-', 'does_not_contain'],
      ['!!', 'duplicated'],
      ['text*', 'begins_with'],
      ['*text', 'end_with'],
      ["'text'", 'literal'],
    ],
  ],
  [
    'component_number',
    [
      ['*', 'no_empty'],
      ['!*', 'empty'],
      ['...', 'between'],
      ['>=', 'greater_than_or_equal'],
      ['<=', 'less_than_or_equal'],
      ['>', 'greater_than'],
      ['<', 'less_than'],
    ],
  ],
  [
    'component_date',
    [
      ['!*', 'empty'],
      ['*', 'no_empty'],
      ['>=', 'greater_than_or_equal'],
      ['<=', 'less_than_or_equal'],
      ['>', 'greater_than'],
      ['<', 'less_than'],
    ],
  ],
  [
    'component_section_id',
    [
      ['...', 'between'],
      [',', 'sequence'],
      ['>=', 'greater_than_or_equal'],
      ['<=', 'less_than_or_equal'],
      ['>', 'greater_than'],
      ['<', 'less_than'],
    ],
  ],
  [
    'component_iri',
    [
      ['!*', 'empty'],
      ['*', 'no_empty'],
      ['==', 'exactly'],
      ['!=', 'different_from'],
      ['=', 'similar_to'],
      ['-', 'does_not_contain'],
      ['!!', 'duplicated'],
      ['text*', 'begins_with'],
      ['*text', 'end_with'],
      ["'text'", 'literal'],
    ],
  ],
]);

/** component_text_area / component_email inherit the string-family operator map. */
const STRING_FAMILY_OPERATOR_MODELS: ReadonlySet<string> = new Set([
  'component_text_area',
  'component_email',
]);

/**
 * Resolve a model's search operator map (with the string-family inheritance).
 * Returns null for models that do not advertise operators (→ search element not
 * byte-reproducible here).
 */
function searchOperatorsFor(model: string): ReadonlyArray<[string, string]> | null {
  if (SEARCH_OPERATORS_BY_MODEL.has(model)) return SEARCH_OPERATORS_BY_MODEL.get(model)!;
  if (STRING_FAMILY_OPERATOR_MODELS.has(model)) {
    return SEARCH_OPERATORS_BY_MODEL.get('component_input_text')!;
  }
  return null;
}

/**
 * Models whose search-mode element context is byte-reproducible (static operator
 * map + the UI-labels cache, no request_config / add_rqo).
 *
 * INTENTIONALLY ABSENT (operator map ported, but the GENERIC context builder is
 * not byte-faithful for them):
 *   - component_iri: every iri here stores `properties.source.request_config`,
 *     forcing the un-ported request_config build (translatable iri also pulls
 *     tool_lang into `tools`). Declined by the gate's source/tool_config check.
 *   - component_section_id: its standalone get_element_context adds a `color`
 *     slot (ontology_node::get_color, between sortable and legacy_model), forces
 *     `tools=[]`, and a `path` with column:'section_id' — the section_id-specific
 *     element build (grouper_section_id_element.ts), NOT the generic component
 *     context this builder emits. Declined here.
 * These stay out of the set so the gate proxies them to PHP.
 */
export const SEARCH_CONTEXT_MODELS: ReadonlySet<string> = new Set([
  'component_input_text',
  'component_text_area',
  'component_email',
  'component_number',
  'component_date',
]);

/**
 * Port of search::search_options_title(): build the operator-tooltip HTML from
 * the operator map + the UI labels cache. Byte-faithful to the PHP string
 * concatenation (no escaping; raw `<`/`>` operator tokens emitted as-is):
 *   <b>{label('search_options')}:</b>
 *   for each [op, key]:
 *     <div class="search_options_title_item"><span>{op}</span><span>{label(key)}</span></div>
 * Empty operator list → '' (PHP returns '' for an empty map).
 */
function buildSearchOptionsTitle(
  operators: ReadonlyArray<[string, string]>,
  labels: LabelsCache,
): string {
  if (operators.length === 0) return '';
  let out = `<b>${labels.getLabel('search_options')}:</b>`;
  for (const [op, key] of operators) {
    out += '<div class="search_options_title_item">';
    out += `<span>${op}</span>`;
    out += `<span>${labels.getLabel(key)}</span>`;
    out += '</div>';
  }
  return out;
}

/**
 * Convert an operator map (ordered pairs) to the `search_operators_info` object,
 * preserving insertion order for byte-identical JSON key ordering.
 */
function searchOperatorsInfoObject(
  operators: ReadonlyArray<[string, string]>,
): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [op, key] of operators) obj[op] = key;
  return obj;
}

/** Install config the context build needs (PHP define()s, injected — no globals). */
export interface ContextConfig {
  /** DEDALO_APPLICATION_LANG (component label lang). */
  applicationLang: string;
  /** DEDALO_STRUCTURE_LANG (legacy_model term lang). */
  structureLang: string;
  /** DEDALO_TOOLS_URL (e.g. '/v7_dev/tools') — base for tool css/icon urls. */
  toolsUrl: string;
  /**
   * DEDALO_GEO_PROVIDER — the install-wide geolocation provider id the
   * component_geolocation `features.geo_provider` slot carries (overridable per
   * component by properties.geo_provider). The sample config default is 'VARIOUS'.
   * Used ONLY by the component_geolocation element context.
   */
  geoProvider: string;
}

/**
 * Build a ContextConfig from a Dédalo-style env map (the DEDALO_* vars).
 * Mirrors the PHP config compiler:
 *   DEDALO_APPLICATION_LANG  ← DEDALO_APPLICATION_LANGS_DEFAULT
 *   DEDALO_STRUCTURE_LANG    (defaults 'lg-spa')
 *   DEDALO_TOOLS_URL         ← DEDALO_TOOLS_URL, else DEDALO_ROOT_WEB + '/tools'
 * Passed explicitly (never read from a module global) so there is no
 * cross-request mutable state.
 */
export function contextConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): ContextConfig {
  const applicationLang = env.DEDALO_APPLICATION_LANGS_DEFAULT ?? 'lg-eng';
  const structureLang = env.DEDALO_STRUCTURE_LANG ?? 'lg-spa';
  const rootWeb = env.DEDALO_ROOT_WEB ?? '/dedalo';
  const toolsUrl = env.DEDALO_TOOLS_URL ?? `${rootWeb.replace(/\/$/, '')}/tools`;
  // DEDALO_GEO_PROVIDER: the value is stored in the config catalog as a quoted
  // PHP literal ("VARIOUS"); env may carry it bare or quoted. Strip surrounding
  // double-quotes. Sample-config default is VARIOUS.
  const geoProvider = (env.DEDALO_GEO_PROVIDER ?? 'VARIOUS').replace(/^"|"$/g, '');
  return { applicationLang, structureLang, toolsUrl, geoProvider };
}

/** RQO source for a component get_element_context. */
export interface ElementContextSource {
  tipo: string;
  section_tipo?: string;
  model?: string;
  lang?: string;
  mode?: string;
  [k: string]: unknown;
}

export interface BuildComponentElementContextOptions {
  ontology: OntologyRepository;
  /** Queryer for the tools registry reads. */
  toolsQueryer: ToolsQueryer;
  contextConfig: ContextConfig;
  /** Default request lang (DEDALO_DATA_LANG) when source.lang is absent. */
  dataLang: string;
  /**
   * Install-time registered-tools cache map (name→properties); when set, tool
   * DDO `properties` come from it verbatim. See tool_properties_cache.ts.
   */
  toolProperties?: ToolPropertiesMap;
  /**
   * UI-labels cache for the active application lang. Required ONLY for the
   * SEARCH-mode element context (`mode:'search'`): the search_options_title HTML
   * is built from label::get_label() lookups. When absent, search-mode contexts
   * decline (gate); list/edit contexts never use it. See labels_cache.ts.
   */
  labelsCache?: LabelsCache;
}

/** The element-context envelope (pre router-decoration). */
export interface ElementContextResponse {
  result: unknown[] | false;
  msg: string;
  errors: string[];
}

/**
 * Build the {result:[DDO], msg, errors} response for a component
 * get_element_context. The router adds action + csrf_token.
 */
export async function buildComponentElementContext(
  source: ElementContextSource,
  opts: BuildComponentElementContextOptions,
): Promise<ElementContextResponse> {
  const { ontology, contextConfig } = opts;

  const tipo = source.tipo;
  const sectionTipo = source.section_tipo ?? source.tipo;
  const model = typeof source.model === 'string' ? source.model : await ontology.getModelByTipo(tipo);
  const requestLang = source.lang ?? opts.dataLang;
  const mode = source.mode ?? 'list';

  if (model === null || !model.startsWith('component_')) {
    return { result: false, msg: 'Error. Request failed', errors: ['unsupported model'] };
  }

  // lang: translatable ? requestLang : nolan (PHP component_lang rule + the
  // instance's fix_language_nolan for non-translatable elements).
  const translatable = await ontology.getTranslatable(tipo);
  const lang = translatable ? requestLang : NOLAN;

  // properties (ontology, deep clone) with css removed.
  const propsSource = (await ontology.getProperties(tipo)) ?? {};
  const properties: Record<string, unknown> = { ...propsSource };
  const ontologyCss = (properties as { css?: unknown }).css;
  delete (properties as { css?: unknown }).css;

  // css: in list mode the component edit-css is removed (null → dropped).
  // Otherwise the component css = properties.css, possibly overridden by the
  // section's virtual-css map (section.properties.css[tipo]).
  let css: unknown = mode === 'list' ? null : (ontologyCss ?? null);
  const sectionProps = await ontology.getProperties(sectionTipo);
  const sectionCss = (sectionProps as { css?: Record<string, unknown> } | null)?.css;
  if (sectionCss && Object.prototype.hasOwnProperty.call(sectionCss, tipo)) {
    css = sectionCss[tipo];
  }

  // parent_grouper: ontology parent.
  const parentGrouper = await ontology.getParent(tipo);

  // SEARCH-mode extras (common.php:1701 + 2010-2013). config.parent_grouper_label
  // is added when mode==='search' AND parent_grouper is set; search_operators_info
  // + search_options_title are the per-model operator map + its localized tooltip
  // HTML. parent_grouper_label = ontology term in DEDALO_DATA_LANG (get_term_by_tipo
  // default lang, fallback=true). Resolved here so the assembly stays declarative.
  let searchConfig: { parent_grouper_label: string } | null = null;
  let searchOperatorsInfo: Record<string, string> | null = null;
  let searchOptionsTitle: string | null = null;
  if (mode === 'search') {
    const operators = searchOperatorsFor(model);
    if (operators !== null && opts.labelsCache !== undefined) {
      searchOperatorsInfo = searchOperatorsInfoObject(operators);
      searchOptionsTitle = buildSearchOptionsTitle(operators, opts.labelsCache);
    }
    if (parentGrouper !== null) {
      const grouperLabel = await ontology.getLabel(parentGrouper, opts.dataLang);
      if (grouperLabel !== null) {
        searchConfig = { parent_grouper_label: grouperLabel };
      }
    }
  }

  // parent: resolve_context_parent → section_tipo (no session/from_parent here).
  const parent = sectionTipo;

  // label: ontology term in DEDALO_APPLICATION_LANG (with fallback). Note: a
  // properties.label override per application lang would win, but the ported
  // models carry no properties.label.
  const label = await ontology.getLabel(tipo, contextConfig.applicationLang);

  // legacy_model: model_tipo term in DEDALO_STRUCTURE_LANG.
  const legacyModel = await ontology.getLegacyModel(tipo);

  // sortable: false for the notes-text input_text (rsc329) AND for
  // component_geolocation (class get_sortable override), true otherwise.
  const sortable = tipo !== NOTES_TEXT_TIPO && !NON_SORTABLE_MODELS.has(model);

  // model-specific `features` block (the *_json controller's full-context add):
  //   - component_json: {allowed_extensions:['json'], default_target_quality:null}
  //     (component_json::get_allowed_extensions() is the fixed ['json']; quality
  //     is always null — see component_json_json.php).
  //   - component_geolocation: {geo_provider} = properties.geo_provider ??
  //     DEDALO_GEO_PROVIDER (component_geolocation_json.php).
  // The standalone get_element_context always takes the full (non-simple) context
  // branch, so `features` is emitted in BOTH list and edit modes for these models.
  let features: Record<string, unknown> | null = null;
  if (model === 'component_json') {
    features = { allowed_extensions: ['json'], default_target_quality: null };
  } else if (model === 'component_geolocation') {
    const override = (propsSource as { geo_provider?: unknown }).geo_provider;
    features = {
      geo_provider: typeof override === 'string' ? override : contextConfig.geoProvider,
    };
  }

  // component_filter target_sections: the filter *_json controller builds its
  // context with add_request_config=false (so NO request_config/columns_map/path
  // recursion — the path is []), then appends a MINIMAL target_sections descriptor
  // = [{tipo, label}] (just those two keys, NO permissions block) for each fixed
  // target section. get_ar_target_section_tipo() returns [DEDALO_SECTION_PROJECTS_TIPO]
  // (='dd153'); the label is the section term in DEDALO_DATA_LANG. The slot sits
  // between css and sortable (the dd_object target_sections property position).
  let filterTargetSections: { tipo: string; label: string }[] | null = null;
  if (model === 'component_filter') {
    const projectsTipo = PROJECTS_SECTION_TIPO;
    const label = (await ontology.getLabel(projectsTipo, opts.dataLang)) ?? '';
    filterTargetSections = [{ tipo: projectsTipo, label }];
  }

  // component_section_id `color`: the section_id *_json controller's full-context
  // branch appends context.color = ontology_node::get_color(section_tipo) =
  // (the SECTION node's) properties.color ?? '#b9b9b9' (DEFAULT_SECTION_COLOR). The
  // standalone get_element_context always takes the full (non-simple) branch, so it
  // is emitted in BOTH list and edit modes. The slot sits between sortable and
  // legacy_model (the dd_object `color` property position).
  let sectionIdColor: string | null = null;
  if (model === 'component_section_id') {
    const secColorProp = (sectionProps as { color?: unknown } | null)?.color;
    sectionIdColor = typeof secColorProp === 'string' ? secColorProp : DEFAULT_SECTION_COLOR;
  }

  // permissions: ROOT shortcut.
  const permissions = 3;

  // tools: only in NON-list mode for components (PHP get_structure_context_core
  // gate: section/area→list, else mode!=='list'). buttons: always []. EXCEPTION:
  // component_section_id::get_tools() is overridden to return [] in every mode, so
  // it never resolves the all-components tool set even in edit mode.
  let tools: unknown[] = [];
  if (mode !== 'list' && model !== 'component_section_id') {
    const registered = await getRegisteredTools(opts.toolsQueryer, ontology, opts.toolProperties);
    const filtered = filterComponentTools(registered, {
      model,
      tipo,
      sectionTipo,
      mode,
      translatable,
      // with_lang_versions is a per-component flag; for the ported models it is
      // false (it only affects requirement_translatable tools, none of which
      // apply to these components).
      withLangVersions: false,
    });
    tools = filtered
      .filter((tool) => {
        // mode check: skip a tool whose properties.mode is set and differs from
        // the current mode (PHP get_structure_context_core tool loop).
        const props = tool.properties;
        const toolMode =
          props && typeof props === 'object' && !Array.isArray(props)
            ? (props as { mode?: unknown }).mode
            : undefined;
        return toolMode === undefined || toolMode === mode;
      })
      .map((tool) => buildToolDdo(tool, contextConfig));
  }

  // Assemble in PHP dd_object property-declaration order, dropping nulls.
  const ddo: Record<string, unknown> = {};
  ddo.typo = 'ddo';
  ddo.type = 'component';
  ddo.tipo = tipo;
  ddo.section_tipo = sectionTipo;
  if (parent !== null) ddo.parent = parent;
  if (parentGrouper !== null) ddo.parent_grouper = parentGrouper;
  if (lang !== null) ddo.lang = lang;
  ddo.mode = mode;
  ddo.model = model;
  ddo.properties = properties;
  ddo.permissions = permissions;
  if (label !== null) ddo.label = label;
  ddo.translatable = translatable;
  ddo.tools = tools;
  ddo.buttons = [];
  if (css !== null) ddo.css = css;
  // target_sections (component_filter only): between css and sortable, mirroring
  // the dd_object property position.
  if (filterTargetSections !== null) ddo.target_sections = filterTargetSections;
  // config (search mode only, when parent_grouper resolves): between css and sortable.
  if (searchConfig !== null) ddo.config = searchConfig;
  ddo.sortable = sortable;
  // color (component_section_id only): between sortable and legacy_model.
  if (sectionIdColor !== null) ddo.color = sectionIdColor;
  if (legacyModel !== null) ddo.legacy_model = legacyModel;
  // search_operators_info + search_options_title (search mode only): between
  // legacy_model and path.
  if (searchOperatorsInfo !== null) ddo.search_operators_info = searchOperatorsInfo;
  if (searchOptionsTitle !== null) ddo.search_options_title = searchOptionsTitle;
  // path: build_structure_context adds it ONLY when sortable===true (the
  // get_order_path gate). A non-sortable component (geolocation) emits no `path`
  // key. The point-read models build with add_request_config=false, so the
  // sortable path is the empty array.
  if (sortable) ddo.path = [];
  // features: emitted last (after path / legacy_model), in the *_json full-context
  // branch order. Only json / geolocation carry it.
  if (features !== null) ddo.features = features;

  return { result: [ddo], msg: 'OK. Request done successfully', errors: [] };
}

/**
 * Build one tool DDO — port of tool_common::create_tool_simple_context for the
 * (no tool_config) case. Field order = dd_object declaration order, null-filtered:
 *   typo, type, section_tipo, mode, model, [properties], label, css, [developer],
 *   name, icon, show_in_inspector, show_in_component
 * developer is ALWAYS dropped: PHP reads $tool_object->developer[0]->value[0]
 * but developer is a plain string, so the access yields null (faithful bug port).
 */
export function buildToolDdo(tool: SimpleToolObject, cfg: ContextConfig): Record<string, unknown> {
  // label: match DEDALO_APPLICATION_LANG, else first lang value, else the name.
  const matched = tool.label.find((l) => l.lang === cfg.applicationLang);
  const label =
    (matched?.value ?? tool.label[0]?.value) || tool.name || 'Unknown';

  const base = `${cfg.toolsUrl}/${tool.name}`;
  const css = { url: `${base}/css/${tool.name}.css` };
  const icon = `${base}/img/icon.svg`;

  const ddo: Record<string, unknown> = {};
  ddo.typo = 'ddo';
  ddo.type = 'tool';
  ddo.section_tipo = tool.sectionTipo;
  ddo.mode = 'edit'; // create_tool_simple_context hardcodes 'edit'
  ddo.model = tool.name;
  if (tool.properties !== null && tool.properties !== undefined) ddo.properties = tool.properties;
  ddo.label = label;
  ddo.css = css;
  // developer dropped (see docblock)
  ddo.name = tool.name;
  ddo.icon = icon;
  ddo.show_in_inspector = tool.showInInspector;
  ddo.show_in_component = tool.showInComponent;
  return ddo;
}
