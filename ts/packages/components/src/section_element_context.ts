/**
 * Port of dd_core_api::get_element_context for a SECTION or AREA (models
 * `section` / `area*`) — the section/area structure-context DDO.
 *
 * PHP path: dd_core_api::get_element_context →
 *   section: section::get_instance(section_tipo, mode)
 *   area:    area::get_instance(model, tipo, mode)
 * → element->get_json({get_context:true}) → the *_json controller calls
 * get_structure_context($permissions, add_request_config=true) →
 * build_structure_context(core) which assembles the DDO.
 *
 * The DDO field order is the dd_object property-declaration order
 * (jsonSerialize = array_filter(get_object_vars), null-filtered):
 *   typo, type, tipo, section_tipo, parent, parent_grouper, lang, mode, model,
 *   properties, permissions, label, translatable, tools, buttons, request_config,
 *   columns_map, config, sortable, section_map, matrix_table, legacy_model
 * (id/info/labels/css/view/children_view null → dropped; config/section_map/
 * matrix_table set only for the section model branch.)
 *
 * FIELD SOURCES (each traced to PHP):
 *   typo='ddo'            — dd_object constant.
 *   type                  — resolve_type_from_model(model): 'section' / 'area'.
 *   tipo                  — source.tipo.
 *   section_tipo          — section: source.section_tipo ?? source.tipo; area:
 *                           area_common::get_section_tipo() = tipo.
 *   parent                — resolve_context_parent(): no session ddo here ⇒
 *                           = section_tipo.
 *   parent_grouper        — ontology getParent(tipo) (dropped when null, e.g.
 *                           culture1 root).
 *   lang                  — section: DEDALO_DATA_NOLAN (constructor hardcodes it);
 *                           area: DEDALO_DATA_LANG (constructor set_lang()).
 *   mode                  — source.mode (default 'list').
 *   model                 — source.model ('section' / 'area').
 *   properties            — ontology getProperties(tipo) with css removed.
 *   permissions           — ROOT shortcut = 3 (non-root deferred).
 *   label                 — ontology term in DEDALO_APPLICATION_LANG.
 *   translatable          — ontology getTranslatable(tipo).
 *   tools                 — get_tools()+create_tool_simple_context. Sections/areas
 *                           get tools in LIST mode (the gate differs from
 *                           components).
 *   buttons               — get_buttons_context(): the section's button children
 *                           {typo,type,tipo,model,label}. [] for areas (no button
 *                           children).
 *   request_config        — build_request_config() (V5 list path).
 *   columns_map           — [] (get_columns_map null → '?? []' via the stamper
 *                           when request_config is present).
 *   config                — {relation_list_tipo} (section only).
 *   sortable              — get_sortable() — false for sections/areas here.
 *   section_map           — section::get_section_map() (section only; virtual
 *                           resolve to the real section's section_map node).
 *   matrix_table          — get_matrix_table_from_tipo() (section only; virtual
 *                           fallback to the real section's matrix_table relation).
 *   legacy_model          — ontology getLegacyModel(tipo) (= 'section' / 'area').
 *
 * SUPPORTED (byte-green): the AREA list path (numisdata1) reaches full parity.
 * DECLINED upstream (canHandleRequest): see read_handler.ts — the SECTION
 * branch is declined because of the tool-registry per-tool properties
 * lang-wrap quirk (tool_print serializes its dd1335 flat in the install-time
 * tool cache, a distinction not present in the matrix_tools DB), and the
 * edit-mode request_config recursive section-walk is not ported.
 */

import type { OntologyRepository } from '@dedalo/ontology';
import {
  getRegisteredTools,
  filterSectionAreaTools,
  type SimpleToolObject,
  type ToolsQueryer,
} from './tools_registry.ts';
import {
  buildRequestConfigV5List,
  buildRequestConfigV5Edit,
  buildRequestConfigV6List,
  calculateDefaultLimitV6,
  type RequestConfigContext,
  type RequestConfigDeps,
  type RequestConfigObject,
  type RequestConfigObjectV6,
} from './request_config.ts';
import type { ContextConfig, ElementContextSource, ElementContextResponse } from './component_element_context.ts';
import type { ToolPropertiesMap } from './tool_properties_cache.ts';

/** DEDALO_DATA_NOLAN. */
const NOLAN = 'lg-nolan';

/** Options for the section/area context build. */
export interface BuildSectionElementContextOptions {
  ontology: OntologyRepository;
  toolsQueryer: ToolsQueryer;
  contextConfig: ContextConfig;
  /** DEDALO_DATA_LANG — the area instance lang. */
  dataLang: string;
  /** DEDALO_STRUCTURE_LANG — matrix_table terms / legacy_model lang. */
  structureLang: string;
  /**
   * Install-time registered-tools cache map (name→properties). When set, each
   * tool DDO's `properties` comes from this map verbatim (the exact bytes the
   * live PHP server serves); tools absent from it fall back to the DB-derived
   * lang-wrapped form. See tool_properties_cache.ts.
   */
  toolProperties?: ToolPropertiesMap;
}

/**
 * resolve the matrix table for a section tipo with the virtual-section fallback
 * (common::get_matrix_table_from_tipo). Returns null for area models.
 *   1. a related ontology node of model 'matrix_table' → its term (structure lang).
 *   2. else resolve the virtual section to its real section and retry.
 *   3. else 'matrix'.
 */
export async function resolveSectionMatrixTable(
  ontology: OntologyRepository,
  tipo: string,
  structureLang: string,
): Promise<string | null> {
  const model = await ontology.getModelByTipo(tipo);
  if (model === null) return null;
  if (model.startsWith('area') || model === 'menu' || model === 'section_tool') return null;
  if (model !== 'section') return null;

  // direct matrix_table relation
  const direct = await matrixTableFromRelations(ontology, tipo, structureLang);
  if (direct !== null) return direct;

  // virtual fallback: resolve real section
  const real = await resolveRealSectionTipo(ontology, tipo);
  if (real !== tipo) {
    const viaReal = await matrixTableFromRelations(ontology, real, structureLang);
    if (viaReal !== null) return viaReal;
  }
  return 'matrix';
}

/** Find a 'matrix_table'-model relation of `tipo` and return its structure-lang term. */
async function matrixTableFromRelations(
  ontology: OntologyRepository,
  tipo: string,
  structureLang: string,
): Promise<string | null> {
  for (const relTipo of (await ontology.getRelationTipos(tipo)) ?? []) {
    if ((await ontology.getModelByTipo(relTipo)) === 'matrix_table') {
      const table = await ontology.getLabel(relTipo, structureLang);
      if (table) return table;
    }
  }
  return null;
}

/**
 * resolve the real (backing) section tipo for a virtual section: the first
 * 'section'-model relation of `tipo`, else `tipo` itself.
 * Port of section::get_section_real_tipo_static → get_ar_related_by_model('section').
 */
export async function resolveRealSectionTipo(
  ontology: OntologyRepository,
  tipo: string,
): Promise<string> {
  for (const relTipo of (await ontology.getRelationTipos(tipo)) ?? []) {
    if ((await ontology.getModelByTipo(relTipo)) === 'section') return relTipo;
  }
  return tipo;
}

/**
 * get_section_buttons_tipo: ALL `button_*` model children of the section, in
 * order_number order (the section DDO `buttons` field). For a virtual section the
 * real section's buttons come first, then the virtual's own buttons. We approximate
 * the virtual+real merge with the children of the real section (the common case;
 * the virtual-only extra buttons are not exercised by the goldens). Used by
 * get_buttons_context.
 */
async function resolveSectionButtonChildren(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<{ tipo: string; model: string }[]> {
  const real = await resolveRealSectionTipo(ontology, sectionTipo);
  const sources = real === sectionTipo ? [sectionTipo] : [real, sectionTipo];
  const out: { tipo: string; model: string }[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    for (const child of await ontology.getChildren(src)) {
      if (seen.has(child)) continue;
      const model = await ontology.getModelByTipo(child);
      if (model && model.startsWith('button')) {
        seen.add(child);
        out.push({ tipo: child, model });
      }
    }
  }
  return out;
}

/**
 * build_section_buttons: ONLY button_new then button_delete (each at most once),
 * fixed order, for the sqo->section_tipo ddo's `buttons` (the request_config). PHP
 * looks up button_new then button_delete independently, so other button models
 * (button_print, button_stats, …) never appear here.
 */
async function resolveSqoSectionButtons(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<{ tipo: string; model: string }[]> {
  const real = await resolveRealSectionTipo(ontology, sectionTipo);
  const children = await ontology.getChildren(real);
  const out: { tipo: string; model: string }[] = [];
  for (const wanted of ['button_new', 'button_delete']) {
    for (const child of children) {
      if ((await ontology.getModelByTipo(child)) === wanted) {
        out.push({ tipo: child, model: wanted });
        break;
      }
    }
  }
  return out;
}

/**
 * get_section_map (section::get_section_map): the section_map ontology node's
 * properties, located via the (virtual-resolved) real section's direct children
 * of model 'section_map'.
 */
async function resolveSectionMap(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<unknown | null> {
  const mapTipo = await findChildByModel(ontology, sectionTipo, 'section_map', true);
  if (mapTipo === null) return null;
  return (await ontology.getProperties(mapTipo)) ?? null;
}

/**
 * config.relation_list_tipo: the section's 'relation_list'-model child tipo
 * (virtual-resolved). null when absent.
 */
async function resolveRelationListTipo(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<string | null> {
  return findChildByModel(ontology, sectionTipo, 'relation_list', true);
}

/**
 * Models of button children whose get_buttons_context emission requires the
 * un-ported per-button tool-resolution path (get_user_tools + tool_config →
 * create_tool_simple_context, plus the button's own `properties`). When a section
 * carries such a button child its `buttons` DDO is NOT byte-reproducible here → the
 * handler declines (e.g. rsc170's `button_import` rsc1427). Plain new/delete/print/
 * stats buttons serialize without this machinery and stay native.
 */
const BUTTON_TOOLS_MODELS: ReadonlySet<string> = new Set([
  'button_import',
  'button_trigger',
  'button_tool',
]);

/**
 * Whether the (virtual-resolved) section has a button child whose model is in
 * BUTTON_TOOLS_MODELS — the un-ported button-tools path. Used by the handler to
 * decline such sections (their buttons context carries resolved `tools`).
 */
export async function sectionHasUnportedButtonTools(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<boolean> {
  const real = await resolveRealSectionTipo(ontology, sectionTipo);
  const sources = real === sectionTipo ? [sectionTipo] : [real, sectionTipo];
  for (const src of sources) {
    for (const child of await ontology.getChildren(src)) {
      const model = await ontology.getModelByTipo(child);
      if (model && BUTTON_TOOLS_MODELS.has(model)) return true;
    }
  }
  return false;
}

/**
 * Whether this section's request_config takes the un-ported V6 strategy
 * (properties.source.request_config), which produces the richer ddo_map
 * (info/width/column_id/fixed_mode + show.fields_separator) instead of the simple
 * V5 list path this module ports. The V6 config lives on the section's
 * (virtual-resolved) `section_list` child's properties. When present, the
 * section-list context is NOT byte-reproducible here → the handler declines it.
 *
 * Port note: PHP's build_request_config runs on the section instance, but the V6
 * `source.request_config` for sections is authored on the section_list node
 * (e.g. oh7 for oh1, rsc172 for rsc170); cont2's section_list (cont4) has none →
 * V5. This gate mirrors that discriminator.
 */
export async function sectionUsesV6RequestConfig(
  ontology: OntologyRepository,
  sectionTipo: string,
): Promise<boolean> {
  const sectionListTipo = await findChildByModel(ontology, sectionTipo, 'section_list', true);
  if (sectionListTipo === null) return false;
  const props = await ontology.getProperties(sectionListTipo);
  const source = props && typeof props === 'object' ? (props as { source?: unknown }).source : undefined;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return Object.prototype.hasOwnProperty.call(source, 'request_config');
  }
  return false;
}

/**
 * Find the first direct child of `sectionTipo` (or its virtual-resolved real
 * section when `resolveVirtual`) whose resolved model equals `modelName`.
 */
async function findChildByModel(
  ontology: OntologyRepository,
  sectionTipo: string,
  modelName: string,
  resolveVirtual: boolean,
): Promise<string | null> {
  const direct = await firstChildByModel(ontology, sectionTipo, modelName);
  if (direct !== null) return direct;
  if (!resolveVirtual) return null;
  const real = await resolveRealSectionTipo(ontology, sectionTipo);
  if (real === sectionTipo) return null;
  return firstChildByModel(ontology, real, modelName);
}

async function firstChildByModel(
  ontology: OntologyRepository,
  tipo: string,
  modelName: string,
): Promise<string | null> {
  for (const child of await ontology.getChildren(tipo)) {
    if ((await ontology.getModelByTipo(child)) === modelName) return child;
  }
  return null;
}

/**
 * Whether `sectionTipo` is a diffusion target — port of
 * diffusion_utils::have_section_diffusion. A section is a diffusion target when
 * it is a 'section'-model relation of some diffusion_element / diffusion_element_alias
 * node (with the real_tipo fallback when a node's related sections are empty).
 * Implemented as one batched ontology read, request-cacheable.
 */
export async function sectionHasDiffusion(
  ontology: OntologyRepository,
  queryer: ToolsQueryer,
  sectionTipo: string,
): Promise<boolean> {
  const sql =
    'SELECT relations FROM "dd_ontology" ' +
    "WHERE model IN ('diffusion_element','diffusion_element_alias') " +
    "AND jsonb_typeof(relations) = 'array'";
  const rows = await queryer.query<{ relations: { tipo?: unknown }[] | null }>(sql, []);
  for (const row of rows) {
    for (const rel of row.relations ?? []) {
      if (typeof rel?.tipo === 'string' && rel.tipo === sectionTipo) {
        if ((await ontology.getModelByTipo(rel.tipo)) === 'section') return true;
      }
    }
  }
  return false;
}

/** A per-tool context DDO entry (create_tool_simple_context). */
interface ToolDdo {
  typo: 'ddo';
  type: 'tool';
  section_tipo: string;
  mode: 'edit';
  model: string;
  properties?: unknown;
  label: string;
  css: { url: string };
  name: string;
  icon: string;
  show_in_inspector: boolean;
  show_in_component: boolean;
}

/** Build one tool DDO (create_tool_simple_context, no tool_config case). */
function buildToolDdo(tool: SimpleToolObject, cfg: ContextConfig): ToolDdo {
  const matched = tool.label.find((l) => l.lang === cfg.applicationLang);
  const label = (matched?.value ?? tool.label[0]?.value) || tool.name || 'Unknown';
  const base = `${cfg.toolsUrl}/${tool.name}`;
  const ddo: ToolDdo = {
    typo: 'ddo',
    type: 'tool',
    section_tipo: tool.sectionTipo,
    mode: 'edit',
    model: tool.name,
    label, // placeholder; reordered below
    css: { url: `${base}/css/${tool.name}.css` },
    name: tool.name,
    icon: `${base}/img/icon.svg`,
    show_in_inspector: tool.showInInspector,
    show_in_component: tool.showInComponent,
  };
  // properties is declared BEFORE label in dd_object; rebuild to preserve order
  // (typo,type,section_tipo,mode,model,[properties],label,css,name,icon,...).
  const ordered: ToolDdo = {
    typo: 'ddo',
    type: 'tool',
    section_tipo: tool.sectionTipo,
    mode: 'edit',
    model: tool.name,
    ...(tool.properties !== null && tool.properties !== undefined ? { properties: tool.properties } : {}),
    label,
    css: ddo.css,
    name: tool.name,
    icon: ddo.icon,
    show_in_inspector: tool.showInInspector,
    show_in_component: tool.showInComponent,
  };
  return ordered;
}

/**
 * Build the {result:[DDO], msg, errors} response for a SECTION/AREA
 * get_element_context. The router adds action + csrf_token.
 *
 * Only LIST mode is supported (edit/tm/search request_config is declined
 * upstream). The handler's canHandleRequest gates the exact models/modes that
 * reach full byte-parity.
 */
export async function buildSectionElementContext(
  source: ElementContextSource,
  opts: BuildSectionElementContextOptions,
): Promise<ElementContextResponse> {
  const { ontology, contextConfig } = opts;

  const model = typeof source.model === 'string' ? source.model : await ontology.getModelByTipo(source.tipo);
  if (model === null || (model !== 'section' && !model.startsWith('area'))) {
    return { result: false, msg: 'Error. Request failed', errors: ['unsupported model'] };
  }
  const isSection = model === 'section';
  const tipo = source.tipo;
  // section_tipo: section uses source.section_tipo ?? tipo; area = tipo.
  const sectionTipo = isSection ? (source.section_tipo ?? source.tipo) : source.tipo;
  const mode = source.mode ?? 'list';

  // type from model (resolve_type_from_model).
  const type = isSection ? 'section' : 'area';

  // lang: section → nolan; area → DEDALO_DATA_LANG.
  const lang = isSection ? NOLAN : opts.dataLang;

  // parent_grouper: ontology parent (dropped when null).
  const parentGrouper = await ontology.getParent(tipo);

  // parent: resolve_context_parent → section_tipo.
  const parent = sectionTipo;

  // properties: in LIST mode a section/component_portal reads its display
  // properties from the (virtual-resolved) `section_list` child node when present
  // (build_structure_context). For sections WITHOUT a section_list child (or for
  // areas / edit mode) the element's own properties are used. css is always
  // stripped from the section DDO properties.
  let propsSource: Record<string, unknown> = (await ontology.getProperties(tipo)) ?? {};
  if (isSection && mode === 'list') {
    const sectionListTipo = await findChildByModel(ontology, tipo, 'section_list', true);
    if (sectionListTipo !== null) {
      propsSource = (await ontology.getProperties(sectionListTipo)) ?? {};
    }
  }
  const properties: Record<string, unknown> = { ...propsSource };
  delete (properties as { css?: unknown }).css;

  // permissions: ROOT shortcut.
  const permissions = 3;

  // label: ontology term in DEDALO_APPLICATION_LANG.
  const label = (await ontology.getLabel(tipo, contextConfig.applicationLang)) ?? '';

  // translatable.
  const translatable = await ontology.getTranslatable(tipo);

  // legacy_model.
  const legacyModel = await ontology.getLegacyModel(tipo);

  // sortable: get_sortable() — false for sections/areas (the goldens show false).
  const sortable = false;

  // tools: sections/areas compute tools in list mode.
  const registered = await getRegisteredTools(opts.toolsQueryer, ontology, opts.toolProperties);
  const diffusionSection = isSection
    ? await sectionHasDiffusion(ontology, opts.toolsQueryer, sectionTipo)
    : false;
  const filtered = filterSectionAreaTools(registered, {
    model,
    tipo,
    sectionTipo,
    mode,
    diffusionSection,
  }).filter((tool) => {
    const props = tool.properties;
    const toolMode =
      props && typeof props === 'object' && !Array.isArray(props)
        ? (props as { mode?: unknown }).mode
        : undefined;
    return toolMode === undefined || toolMode === mode;
  });
  const tools = filtered.map((tool) => buildToolDdo(tool, contextConfig));

  // buttons: section button children (areas have none). get_buttons_context skips
  // buttons whose properties.disable===true and those with permissions<2.
  const buttons: { typo: 'ddo'; type: 'button'; tipo: string; model: string; label: string }[] = [];
  if (permissions >= 2) {
    const buttonChildren = await resolveSectionButtonChildren(ontology, sectionTipo);
    for (const b of buttonChildren) {
      const bProps = await ontology.getProperties(b.tipo);
      if (bProps && (bProps as { disable?: unknown }).disable === true) continue;
      const bl = (await ontology.getLabel(b.tipo, contextConfig.applicationLang)) ?? '';
      buttons.push({ typo: 'ddo', type: 'button', tipo: b.tipo, model: b.model, label: bl });
    }
  }

  // request_config (V5 list path or V6 source.request_config path). The sqo
  // section_tipo ddo buttons are ONLY button_new + button_delete (build_section_buttons).
  const rcDeps: RequestConfigDeps = {
    ontology,
    resolveMatrixTable: (st) => resolveSectionMatrixTable(ontology, st, opts.structureLang),
    resolveSectionButtons: (st) => resolveSqoSectionButtons(ontology, st),
  };
  const rcCtx: RequestConfigContext = {
    tipo,
    sectionTipo,
    model,
    mode,
    permissions,
    applicationLang: contextConfig.applicationLang,
    structureLang: opts.structureLang,
  };

  // In LIST mode the request_config + columns_map source is the section_list
  // child's properties (resolve_source_properties / get_columns_map). When that
  // child carries `source.request_config` the V6 strategy applies; else V5.
  const storedRequestConfig = (() => {
    const src = (propsSource as { source?: unknown }).source;
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      return (src as { request_config?: unknown }).request_config;
    }
    return undefined;
  })();

  let requestConfig: RequestConfigObject[] | RequestConfigObjectV6[];
  if (isSection && mode === 'list' && Array.isArray(storedRequestConfig)) {
    const limit = calculateDefaultLimitV6(storedRequestConfig, model, mode);
    requestConfig = await buildRequestConfigV6List(storedRequestConfig, rcCtx, rcDeps, limit);
  } else if (isSection && mode === 'edit') {
    // EDIT mode: the recursive child tree (groupers + nested components),
    // depth-first pre-order, excluding component_dataframe. Source.request_config
    // (V6) is a LIST-only stored config — edit always takes the V5 recursive walk.
    requestConfig = await buildRequestConfigV5Edit(rcCtx, rcDeps);
  } else {
    requestConfig = await buildRequestConfigV5List(rcCtx, rcDeps);
  }

  // columns_map: get_columns_map() = section_list child's source.columns_map (list
  // mode), verbatim; null → '?? []' via the stamper (request_config present).
  const columnsMap: unknown[] = (() => {
    const src = (propsSource as { source?: unknown }).source;
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      const cm = (src as { columns_map?: unknown }).columns_map;
      if (Array.isArray(cm)) return cm;
    }
    return [];
  })();

  // section-only fields.
  let config: { relation_list_tipo: string | null } | undefined;
  let sectionMap: unknown | undefined;
  let matrixTable: string | undefined;
  if (isSection) {
    const relationListTipo = await resolveRelationListTipo(ontology, sectionTipo);
    config = { relation_list_tipo: relationListTipo };
    const sm = await resolveSectionMap(ontology, sectionTipo);
    if (sm !== null) sectionMap = sm;
    const mt = await resolveSectionMatrixTable(ontology, sectionTipo, opts.structureLang);
    if (mt !== null) matrixTable = mt;
  }

  // Assemble in dd_object declaration order, dropping nulls.
  const ddo: Record<string, unknown> = {};
  ddo.typo = 'ddo';
  ddo.type = type;
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
  ddo.buttons = buttons;
  ddo.request_config = requestConfig;
  ddo.columns_map = columnsMap;
  if (config !== undefined) ddo.config = config;
  ddo.sortable = sortable;
  if (sectionMap !== undefined) ddo.section_map = sectionMap;
  if (matrixTable !== undefined) ddo.matrix_table = matrixTable;
  if (legacyModel !== null) ddo.legacy_model = legacyModel;

  return { result: [ddo], msg: 'OK. Request done successfully', errors: [] };
}
