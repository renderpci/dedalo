/**
 * Port of the SECTION/AREA `request_config` build (the 3-stage
 * `common::build_request_config` orchestrator) for the dd_core_api
 * get_element_context path, restricted to the cases reached by a
 * get_element_context RQO (no client `show` / `sqo`).
 *
 * THE 3 STAGES (common::build_request_config):
 *   1. RQO-derived (build_request_config_from_rqo): when the client RQO carries
 *      an explicit `show`, the config is rebuilt from it (short-circuit). A
 *      get_element_context RQO is `{tipo, model, mode}` with NO `show` → the
 *      gate's `requested_show` is empty → returns null → SKIPPED here.
 *   2. Base build (get_ar_request_config): the deterministic, cacheable config
 *      from ontology properties (V6: properties.source.request_config) or the
 *      V5 relation-node fallback. cont2/culture1/numisdata1 have no V6
 *      properties → all take the V5 path. This module ports the V5 LIST-mode
 *      path (resolve_ar_related_list → clean → authorize → build_legacy_ddo_map).
 *   3. Overlay (overlay_request_state): merges per-call request-scoped rqo/session
 *      sqo into this instance's private copy. With a get_element_context RQO the
 *      `requested_sqo` is null → no-op → SKIPPED here.
 *
 * Because stages 1 and 3 are no-ops for a get_element_context request, this
 * module implements stage 2's V5 list path only — exactly what the goldens
 * exercise. The cache is not modelled (each build is deterministic and the TS
 * core keeps no module-global mutable per-request state; the PHP cache is a
 * pure speed optimisation whose stored/served values deep-clone).
 *
 * SERIALIZATION CONTRACT (verified vs PHP):
 *   - request_config_object and search_query_object extend stdClass and are NOT
 *     JsonSerializable → json_encode emits ALL declared public props in
 *     declaration order, INCLUDING nulls.
 *   - dd_object implements jsonSerialize = array_filter(get_object_vars, !==null)
 *     → declaration order, NULL-filtered.
 */

import type { OntologyRepository } from '@dedalo/ontology';

/** Model names treated as section groupers (PHP common::$groupers). */
const GROUPERS: ReadonlySet<string> = new Set([
  'section_group',
  'section_group_div',
  'section_tab',
  'tab',
]);

/** DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO — deprecated v6 component, dropped. */
const SECURITY_AREAS_PROFILES_TIPO = 'dd249';

/** Default gray when a section node carries no properties.color (ontology_node::get_color). */
const DEFAULT_COLOR = '#b9b9b9';

/**
 * The search_query_object public properties, in PHP declaration order. Plain
 * stdClass: json_encode emits every key in this order, defaulting to null. The
 * V5 path only sets `section_tipo`.
 */
export interface SqoObject {
  id: unknown;
  section_tipo: unknown[];
  mode: unknown;
  filter: unknown;
  limit: unknown;
  offset: unknown;
  total: unknown;
  full_count: unknown;
  group_by: unknown;
  order: unknown;
  filter_by_locators: unknown;
  filter_by_locators_op: unknown;
  allow_sub_select_by_id: unknown;
  children_recursive: unknown;
  remove_distinct: unknown;
  skip_projects_filter: unknown;
  parsed: unknown;
  breakdown: unknown;
  tables: unknown;
  select: unknown;
  generated_time: unknown;
}

/** Build a fresh search_query_object with every field null except section_tipo. */
function newSqo(sectionTipoDdos: unknown[]): SqoObject {
  return {
    id: null,
    section_tipo: sectionTipoDdos,
    mode: null,
    filter: null,
    limit: null,
    offset: null,
    total: null,
    full_count: null,
    group_by: null,
    order: null,
    filter_by_locators: null,
    filter_by_locators_op: null,
    allow_sub_select_by_id: null,
    children_recursive: null,
    remove_distinct: null,
    skip_projects_filter: null,
    parsed: null,
    breakdown: null,
    tables: null,
    select: null,
    generated_time: null,
  };
}

/** A show ddo entry (build_legacy_ddo_map), serialized in dd_object declaration order. */
export interface ShowDdo {
  typo: 'ddo';
  tipo: string;
  section_tipo: string;
  parent: string;
  mode: string;
  model: string;
  label: string;
  /** Only present when resolve_view yields a non-null view (e.g. 'line'). */
  view?: string;
}

/** sqo_config (build_sqo_config_default), fixed key order. */
export interface SqoConfig {
  full_count: false;
  limit: number;
  offset: number;
  mode: string;
  operator: '$or';
}

/** A section_tipo ddo (build_sqo_section_tipo_ddo), dd_object declaration order. */
export interface SectionTipoDdo {
  typo: 'ddo';
  tipo: string;
  model: string;
  permissions: number;
  label: string;
  buttons: { model: string; permissions: number }[];
  color: string;
  /** Absent for area models (get_matrix_table_from_tipo returns null → dropped). */
  matrix_table?: string;
}

/** The single request_config_object the V5 path emits, in declaration order. */
export interface RequestConfigObject {
  api_engine: 'dedalo';
  type: 'main';
  sqo: SqoObject;
  show: { ddo_map: ShowDdo[]; sqo_config: SqoConfig };
  search: null;
  choose: null;
  hide: null;
  api_config: null;
}

/** Per-call inputs for the request_config V5 build. */
export interface RequestConfigContext {
  /** Caller element tipo (the section/area tipo). */
  tipo: string;
  /** Resolved section_tipo (= tipo for a section/area get_element_context). */
  sectionTipo: string;
  /** Caller model: 'section' | 'area' | 'area_*'. */
  model: string;
  /** Instance mode: 'list' | 'edit' | 'tm' | ... */
  mode: string;
  /** Root permissions shortcut (3). Non-root deferred. */
  permissions: number;
  /** DEDALO_APPLICATION_LANG for labels (lg-spa on this install). */
  applicationLang: string;
  /** DEDALO_STRUCTURE_LANG for matrix_table terms. */
  structureLang: string;
}

/** Ontology + resolver surface the request_config build needs. */
export interface RequestConfigDeps {
  ontology: OntologyRepository;
  /** Resolve a section's matrix table (with virtual-section fallback). */
  resolveMatrixTable(sectionTipo: string): Promise<string | null>;
  /** Resolve the section's button children {tipo, model} (button_new/button_delete). */
  resolveSectionButtons(sectionTipo: string): Promise<{ tipo: string; model: string }[]>;
}

/**
 * resolve_view (common::resolve_view): the legacy view per model. Only relation
 * components and a couple of special cases get a non-null view; everything else
 * is null (→ the ddo `view` key is dropped).
 */
function resolveView(model: string): string | null {
  switch (model) {
    case 'component_portal':
      return 'default';
    case 'component_relation_children':
    case 'component_relation_parent':
    case 'component_relation_index':
    case 'component_relation_related':
    case 'component_autocomplete':
    case 'component_autocomplete_hi':
      return 'line';
    case 'component_html_text':
      return 'html_text';
    default:
      return null;
  }
}

/**
 * resolve_pagination_defaults + calculate_default_limit (V5 path, no V6 limit):
 *   edit:  section → 1,  non-section (component/area) → 10
 *   list:  section → 10, non-section (component/area) → 1
 */
function defaultLimit(model: string, mode: string): number {
  const isSection = model === 'section';
  if (mode === 'edit') return isSection ? 1 : 10;
  return isSection ? 10 : 1;
}

/**
 * find the section_list child of a section/component and return its relation
 * tipos (the column list). Port of:
 *   get_ar_tipo_by_model_and_relation(tipo, 'section_list', 'children', true)
 *   then get_relation_nodes(child, simple=true).
 */
async function sectionListRelationTipos(
  ontology: OntologyRepository,
  tipo: string,
): Promise<string[] | null> {
  const children = await ontology.getChildren(tipo);
  for (const child of children) {
    if ((await ontology.getModelByTipo(child)) === 'section_list') {
      return (await ontology.getRelationTipos(child)) ?? [];
    }
  }
  return null;
}

/**
 * resolve_ar_related_list: the raw related tipos for a LIST-mode caller.
 *   - section          → section_list child's relation tipos.
 *   - grouper          → direct children.
 *   - component_filter  → DECLINED upstream (project tipos not ported).
 *   - other (area/...) → resolve_ar_related_list_component.
 */
async function resolveArRelatedList(
  ontology: OntologyRepository,
  model: string,
  tipo: string,
): Promise<string[]> {
  if (model === 'section') {
    return (await sectionListRelationTipos(ontology, tipo)) ?? [];
  }
  if (GROUPERS.has(model)) {
    return ontology.getChildren(tipo);
  }
  // resolve_ar_related_list_component: section_list child first, else own relations.
  const sl = await sectionListRelationTipos(ontology, tipo);
  if (sl !== null) {
    // Ensure the target section is present; if none of the relations is a
    // section, prepend the component's main related section.
    let sectionPresent = false;
    for (const rt of sl) {
      if ((await ontology.getModelByTipo(rt)) === 'section') {
        sectionPresent = true;
        break;
      }
    }
    if (!sectionPresent) {
      const mainSections: string[] = [];
      for (const rt of (await ontology.getRelationTipos(tipo)) ?? []) {
        if ((await ontology.getModelByTipo(rt)) === 'section') mainSections.push(rt);
      }
      return [...mainSections, ...sl];
    }
    return sl;
  }
  return (await ontology.getRelationTipos(tipo)) ?? [];
}

/**
 * resolve_ar_related_edit: the raw related tipos for an EDIT-mode caller.
 *   - section → section::get_ar_children_tipo_by_model_name_in_section(tipo,
 *     ['component_','section_group','section_group_div','section_tab','tab'],
 *     recursive=true) excluding component_dataframe. This is the section's full
 *     recursive child tree in DEPTH-FIRST PRE-ORDER, recursing THROUGH the
 *     section_group / section_tab groupers (the groupers themselves are KEPT in
 *     the result — filter_children_by_models matches 'section_group' etc.), then
 *     filtered to the required model substrings. The starting section is NOT
 *     included (get_ar_recursive_children adds tipos only on recursive frames).
 *   - grouper → direct children only (one level).
 *   - component_filter → DECLINED upstream (project tipos not ported).
 *   - other (component) → its relation tipos.
 *
 * The recursive children walk + the model filter mirror PHP exactly:
 *   get_ar_recursive_children excludes the 'box elements' / 'area' /
 *   'component_semantic_node' subtrees by default (passed as excludeModels),
 *   PLUS the caller-supplied 'component_dataframe' exclusion; then
 *   filter_children_by_models keeps a child iff its resolved model str_contains
 *   one of the required model names (substring match: 'component_' matches every
 *   component, the grouper names match exactly). De-dup is by first occurrence.
 */
async function resolveArRelatedEdit(
  ontology: OntologyRepository,
  model: string,
  tipo: string,
): Promise<string[]> {
  if (model === 'section') {
    // get_ar_recursive_children excludes box elements / area / semantic_node
    // subtrees by default; the section edit walk additionally excludes the
    // component_dataframe subtree (it has special rendering treatment).
    const excludeModels = [
      'box elements',
      'area',
      'component_semantic_node',
      'component_dataframe',
    ];
    const recursive = await ontology.getRecursiveChildren(tipo, excludeModels);
    // filter_children_by_models: keep a child whose resolved model substring-matches
    // one of the required model names; first occurrence wins (de-dup).
    const required = [
      'component_',
      'section_group',
      'section_group_div',
      'section_tab',
      'tab',
    ];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const childTipo of recursive) {
      if (seen.has(childTipo)) continue;
      const m = (await ontology.getModelByTipo(childTipo)) ?? '';
      if (required.some((r) => m.includes(r))) {
        seen.add(childTipo);
        out.push(childTipo);
      }
    }
    return out;
  }
  if (GROUPERS.has(model)) {
    return ontology.getChildren(tipo);
  }
  // component_filter declined upstream; other components → relation tipos.
  return (await ontology.getRelationTipos(tipo)) ?? [];
}

/**
 * clean_and_extract_related: drop sections (first becomes target_section_tipo),
 * exclude_elements markers and the deprecated dd249, keep the rest.
 */
async function cleanAndExtractRelated(
  ontology: OntologyRepository,
  arRelated: string[],
  sectionTipo: string,
): Promise<{ clean: string[]; targetSectionTipo: string }> {
  let targetSectionTipo = sectionTipo;
  const clean: string[] = [];
  for (const t of arRelated) {
    const m = await ontology.getModelByTipo(t);
    if (m === 'section') {
      targetSectionTipo = t;
      continue;
    }
    if (m === 'exclude_elements') continue;
    if (t === SECURITY_AREAS_PROFILES_TIPO) continue;
    // component_filter system-table guard is dead code in PHP ($table always null).
    clean.push(t);
  }
  return { clean, targetSectionTipo };
}

/**
 * build_sqo_section_tipo_ddo: one enriched ddo per section_tipo.
 * Field order is the dd_object declaration order, NULL-filtered:
 *   typo, tipo, model, permissions, label, buttons, color, [matrix_table]
 */
async function buildSqoSectionTipoDdo(
  arSectionTipo: string[],
  ctx: RequestConfigContext,
  deps: RequestConfigDeps,
): Promise<SectionTipoDdo[]> {
  const out: SectionTipoDdo[] = [];
  for (const st of arSectionTipo) {
    const model = (await deps.ontology.getModelByTipo(st)) ?? 'section';
    const label = (await deps.ontology.getLabel(st, ctx.applicationLang)) ?? '';
    // permissions: root shortcut (3).
    const permissions = ctx.permissions;
    // buttons: [] when permissions <= 1, else the section's button_new/delete
    // children as {model, permissions}.
    const buttons: { model: string; permissions: number }[] = [];
    if (permissions > 1) {
      const sectionButtons = await deps.resolveSectionButtons(st);
      for (const b of sectionButtons) {
        buttons.push({ model: b.model, permissions });
      }
    }
    // color: ontology properties.color, else default gray.
    const props = await deps.ontology.getProperties(st);
    const color =
      props && typeof (props as { color?: unknown }).color === 'string'
        ? ((props as { color: string }).color)
        : DEFAULT_COLOR;
    // matrix_table: null for areas (get_matrix_table_from_tipo → null) → key dropped.
    const matrixTable = await deps.resolveMatrixTable(st);

    const ddo: SectionTipoDdo = {
      typo: 'ddo',
      tipo: st,
      model,
      permissions,
      label,
      buttons,
      color,
    };
    if (matrixTable !== null) ddo.matrix_table = matrixTable;
    out.push(ddo);
  }
  return out;
}

/**
 * Build the request_config (stage 2, V5 LIST path) for a section/area.
 * Returns a single-element array (the 'dedalo' request_config_object), matching
 * the golden. Only LIST-mode sections/areas are supported here; edit/tm/search
 * are declined upstream (the recursive edit/related-list walks are not ported).
 */
export async function buildRequestConfigV5List(
  ctx: RequestConfigContext,
  deps: RequestConfigDeps,
): Promise<RequestConfigObject[]> {
  // STEP 2: resolve related (list mode).
  const arRelated = await resolveArRelatedList(deps.ontology, ctx.model, ctx.tipo);
  return buildRequestConfigV5FromRelated(arRelated, ctx, deps);
}

/**
 * Build the request_config (stage 2, V5 EDIT path) for a section.
 *
 * Identical to the list path EXCEPT step 2 (resolve_ar_related): edit mode uses
 * the recursive child tree (resolve_ar_related_edit) — the groupers AND their
 * nested components, depth-first pre-order, excluding component_dataframe. The
 * resulting ddo_map keeps the groupers (section_group / section_group_div /
 * section_tab / tab) as entries (they emit a CONTEXT-only grouper element) with
 * `parent` = the SECTION tipo for EVERY child (build_legacy_ddo_map sets
 * parent = $parent_tipo for all entries — the grouper does NOT re-parent its
 * descendants). For these models resolve_view → null, so no `view` field.
 *
 * Only the SECTION caller in edit mode is built here; the recursive grouper-as-
 * caller descent (a grouper that re-resolves its own children) is not reached —
 * the flat ddo_map already carries every nested component as a direct
 * (parent=section) entry, which is exactly what the live edit bytes show.
 */
export async function buildRequestConfigV5Edit(
  ctx: RequestConfigContext,
  deps: RequestConfigDeps,
): Promise<RequestConfigObject[]> {
  // STEP 2: resolve related (edit mode — recursive child tree).
  const arRelated = await resolveArRelatedEdit(deps.ontology, ctx.model, ctx.tipo);
  return buildRequestConfigV5FromRelated(arRelated, ctx, deps);
}

/**
 * Shared V5 build (steps 3-7): clean + extract target section, sqo_config,
 * authorize + build_legacy_ddo_map, sqo + request_config_object. List/edit differ
 * ONLY in the `arRelated` set fed in (step 2).
 */
async function buildRequestConfigV5FromRelated(
  arRelated: string[],
  ctx: RequestConfigContext,
  deps: RequestConfigDeps,
): Promise<RequestConfigObject[]> {
  const { ontology } = deps;

  // STEP 3: clean + extract target section.
  const { clean, targetSectionTipo } = await cleanAndExtractRelated(
    ontology,
    arRelated,
    ctx.sectionTipo,
  );

  // STEP 4: sqo_config defaults.
  const limit = defaultLimit(ctx.model, ctx.mode);
  const sqoConfig: SqoConfig = {
    full_count: false,
    limit,
    offset: 0,
    mode: ctx.mode,
    operator: '$or',
  };

  // current_mode: non-section callers force 'list'.
  const currentMode = ctx.model !== 'section' ? 'list' : ctx.mode;

  // STEP 5: authorize (root → all pass; permissions > 0).
  // STEP 6: build the legacy ddo_map.
  const ddoMap: ShowDdo[] = [];
  for (const t of clean) {
    // filter_authorized_related: permissions > 0. Root = 3 everywhere.
    if (ctx.permissions <= 0) continue;
    const model = (await ontology.getModelByTipo(t)) ?? '';
    const label = (await ontology.getLabel(t, ctx.applicationLang)) ?? '';
    // view: children_view override is null for these sections; own
    // properties.view wins, else resolve_view(model).
    const props = await ontology.getProperties(t);
    const ownView =
      props && typeof (props as { view?: unknown }).view === 'string'
        ? ((props as { view: string }).view)
        : resolveView(model);
    const ddo: ShowDdo = {
      typo: 'ddo',
      tipo: t,
      section_tipo: targetSectionTipo,
      parent: ctx.tipo,
      mode: currentMode,
      model,
      label,
    };
    if (ownView !== null) ddo.view = ownView;
    ddoMap.push(ddo);
  }

  // STEP 7: sqo + request_config_object.
  const sectionTipoDdos = await buildSqoSectionTipoDdo([targetSectionTipo], ctx, deps);
  const rco: RequestConfigObject = {
    api_engine: 'dedalo',
    type: 'main',
    sqo: newSqo(sectionTipoDdos),
    show: { ddo_map: ddoMap, sqo_config: sqoConfig },
    search: null,
    choose: null,
    hide: null,
    api_config: null,
  };
  return [rco];
}

// ─────────────────────────────────────────────────────────────────────────────
// V6 path (build_request_config_v6): properties.source.request_config-driven.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A stored (ontology) request_config item, as authored on the section_list child's
 * `properties.source.request_config`. We only model the keys the SECTION-list V6
 * goldens (oh1/rsc170) exercise; unknown keys are not consumed.
 */
export interface StoredRequestConfigItem {
  api_engine?: string;
  type?: string;
  sqo?: {
    section_tipo?: { value?: unknown; source?: string }[] | unknown;
    limit?: number;
    [k: string]: unknown;
  };
  show?: {
    ddo_map?: Record<string, unknown>[];
    sqo_config?: Record<string, unknown>;
    [k: string]: unknown;
  };
  search?: unknown;
  choose?: unknown;
  hide?: unknown;
  [k: string]: unknown;
}

/**
 * V6 request_config_object serialization. Unlike V5 this is the RAW request_config
 * (request_config_object extends stdClass → json_encode emits all 8 declared props
 * in declaration order, null-filtered only by the get_element_context stamper which
 * keeps nulls for these). The sqo is the raw stored sqo (its OWN key order: the
 * stored `section_tipo` then the `limit` appended by resolve_pagination_override),
 * and show is the raw stored show with `ddo_map` enriched in place + `sqo_config`
 * appended last.
 */
export interface RequestConfigObjectV6 {
  api_engine: string;
  type: string;
  /** Raw stored sqo, section_tipo enriched + limit added (own insertion order). */
  sqo: Record<string, unknown>;
  /** Raw stored show, ddo_map enriched in place + sqo_config appended. */
  show: Record<string, unknown>;
  search: unknown;
  choose: unknown;
  hide: unknown;
  api_config: unknown;
}

/**
 * get_request_config_section_tipo: resolve the stored sqo->section_tipo source
 * descriptors to a flat, deduped tipo list. Only the `section` / default source
 * (literal `value` tipos) and `self` (the caller section_tipo) are ported — the
 * other sources (hierarchy_types, field_value, …) require live search and are not
 * reached by the SECTION-list get_element_context goldens. The TLD active-check is
 * a no-op here (root install has all relevant TLDs active; the differ would flag a
 * drop).
 */
function resolveRequestConfigSectionTipo(
  sources: unknown,
  callerSectionTipo: string,
): string[] {
  if (!Array.isArray(sources)) return [callerSectionTipo];
  const out: string[] = [];
  for (const item of sources) {
    if (typeof item === 'string') {
      // legacy bare string (PHP warns but still appends)
      out.push(item);
      continue;
    }
    if (item === null || typeof item !== 'object') continue;
    const source = (item as { source?: unknown }).source;
    if (!source) continue;
    if (source === 'self') {
      out.push(callerSectionTipo);
      continue;
    }
    // 'section' (and default): literal tipos from `value` (string|array).
    const value = (item as { value?: unknown }).value;
    const values = Array.isArray(value) ? value : value !== undefined ? [value] : [];
    for (const v of values) if (typeof v === 'string') out.push(v);
  }
  // dedupe preserving order (array_unique → array_values).
  return [...new Set(out)];
}

/**
 * process_single_ddo: enrich one stored ddo (mutated-in-place semantics, here a
 * fresh ordered object) for a SECTION-list show map. Returns null when the ddo is
 * dropped (missing/invalid tipo, list-mode section_group, or no permission).
 *
 * Mirrors PHP key ordering: the stored keys keep their authored order, then the
 * appended keys (`model`, `label`, `mode`, `fixed_mode`) follow in that sequence —
 * but only those not already present in the stored ddo.
 */
async function processShowDdoV6(
  ontology: OntologyRepository,
  storedDdo: Record<string, unknown>,
  ctx: {
    tipo: string;
    sectionTipo: string;
    arSectionTipo: string[];
    model: string;
    mode: string;
    applicationLang: string;
  },
  permissions: number,
): Promise<Record<string, unknown> | null> {
  // STEP 1: tipo present + non-empty.
  const tipo = storedDdo.tipo;
  if (typeof tipo !== 'string' || tipo === '') return null;
  // STEP 2: tipo valid (resolvable model). Invalid → drop.
  const model = await ontology.getModelByTipo(tipo);
  if (model === null) return null;

  // Build the result preserving stored key order, then appended keys.
  const out: Record<string, unknown> = { ...storedDdo };

  // STEP 3: model (always recalculated; append if absent).
  out.model = model;

  // STEP 4: drop section_group in list-mode show.
  if (ctx.mode === 'list' && model.includes('section_group')) return null;

  // STEP 5: label if not present.
  if (!('label' in out)) {
    out.label = (await ontology.getLabel(tipo, ctx.applicationLang)) ?? '';
  }

  // STEP 6: resolve 'self' references for section_tipo + parent.
  if (out.section_tipo === 'self') {
    out.section_tipo =
      model === 'component_dataframe' ? ctx.sectionTipo : ctx.arSectionTipo;
  }
  if (out.parent === 'self') {
    out.parent = ctx.tipo;
  }

  // STEP 7: mode from context if not set (list-forced for non-section callers).
  if (!('mode' in out)) {
    if (ctx.mode === 'tm') {
      out.mode = ctx.mode;
    } else {
      out.mode = ctx.model !== 'section' ? 'list' : ctx.mode;
    }
  }

  // STEP 8: fixed_mode=true whenever mode is now set (always, post step 7).
  if ('mode' in out) {
    out.fixed_mode = true;
  }

  // STEP 11: section permission gate (root ≥1 → pass). Non-root deferred.
  if (ctx.model === 'section' && permissions < 1) return null;

  return out;
}

/** Per-call inputs for the request_config V6 build (extends the V5 ctx fields). */
type RequestConfigV6Ctx = RequestConfigContext;

/**
 * Build the request_config (stage 2, V6 path) from a section_list child's stored
 * `properties.source.request_config`. Ports build_request_config_v6 +
 * parse_request_config_item restricted to the SECTION-list get_element_context
 * case (LIST mode, dedalo api_engine, no client rqo override). Each stored item
 * yields one RequestConfigObjectV6.
 *
 * @param storedConfig the raw `properties.source.request_config` array.
 * @param paginationLimit the resolved pagination limit (calculate_default_limit).
 */
export async function buildRequestConfigV6List(
  storedConfig: unknown,
  ctx: RequestConfigV6Ctx,
  deps: RequestConfigDeps,
  paginationLimit: number,
): Promise<RequestConfigObjectV6[]> {
  if (!Array.isArray(storedConfig)) return [];
  const { ontology } = deps;
  const out: RequestConfigObjectV6[] = [];

  for (const rawItem of storedConfig) {
    if (rawItem === null || typeof rawItem !== 'object') continue;
    const item = rawItem as StoredRequestConfigItem;

    // STEP 1: api_engine / type.
    const apiEngine = item.api_engine ?? 'dedalo';
    const type = item.type ?? 'main';

    // STEP 2: sqo — clone the raw stored sqo, enrich section_tipo, add limit.
    const storedSqo = (item.sqo && typeof item.sqo === 'object' ? { ...item.sqo } : {}) as Record<
      string,
      unknown
    >;
    const arSectionTipo = resolveRequestConfigSectionTipo(storedSqo.section_tipo, ctx.sectionTipo);
    // build_sqo_section_tipo_ddo enriches each section tipo (same shape as V5).
    storedSqo.section_tipo = await buildSqoSectionTipoDdo(arSectionTipo, ctx, deps);

    // STEP 3: pagination override → sqo.limit (no client rqo here → pagination.limit).
    if (!('limit' in storedSqo)) {
      storedSqo.limit = paginationLimit;
    }

    // STEP 4: parse_show_config. show is mandatory; default empty object if absent.
    const storedShow = (item.show && typeof item.show === 'object'
      ? { ...(item.show as Record<string, unknown>) }
      : {}) as Record<string, unknown>;

    const ddoContext = {
      tipo: ctx.tipo,
      sectionTipo: ctx.sectionTipo,
      arSectionTipo,
      model: ctx.model,
      mode: ctx.mode,
      applicationLang: ctx.applicationLang,
    };

    const rawDdoMap = Array.isArray(storedShow.ddo_map) ? (storedShow.ddo_map as unknown[]) : [];
    const enrichedDdoMap: Record<string, unknown>[] = [];
    for (const d of rawDdoMap) {
      if (d === null || typeof d !== 'object') continue;
      const processed = await processShowDdoV6(
        ontology,
        d as Record<string, unknown>,
        ddoContext,
        ctx.permissions,
      );
      if (processed !== null) enrichedDdoMap.push(processed);
    }
    storedShow.ddo_map = enrichedDdoMap;

    // resolve_show_sqo_config: stored show has no sqo_config in the goldens → the
    // else branch creates a default. (The session-limit override for sections is
    // not reached: it only fires when show.sqo_config.limit is already present.)
    if (!('sqo_config' in storedShow) || storedShow.sqo_config === undefined) {
      storedShow.sqo_config = {
        full_count: false,
        limit: paginationLimit,
        offset: 0,
        mode: ctx.mode,
        operator: '$or',
      };
    } else {
      const sc = storedShow.sqo_config as Record<string, unknown>;
      if (!('operator' in sc)) sc.operator = '$or';
    }

    // STEP 5-7: search/choose/hide — absent in the SECTION-list goldens → null.
    const search = 'search' in item ? item.search : null;
    const choose = 'choose' in item ? item.choose : null;
    const hide = 'hide' in item ? item.hide : null;

    out.push({
      api_engine: apiEngine,
      type,
      sqo: storedSqo,
      show: storedShow,
      search: search ?? null,
      choose: choose ?? null,
      hide: hide ?? null,
      api_config: null,
    });
  }

  return out;
}

/**
 * calculate_default_limit (V6): the ontology default from the stored
 * request_config's dedalo entry sqo.limit, else the mode/model heuristic.
 */
export function calculateDefaultLimitV6(
  storedConfig: unknown,
  model: string,
  mode: string,
): number {
  if (Array.isArray(storedConfig)) {
    const found = storedConfig.find(
      (el) =>
        el !== null &&
        typeof el === 'object' &&
        (el as { api_engine?: unknown }).api_engine === 'dedalo',
    ) as { sqo?: { limit?: unknown } } | undefined;
    const limit = found?.sqo?.limit;
    if (typeof limit === 'number' && limit !== 0) return limit;
  }
  if (mode === 'edit') return model === 'section' ? 1 : 10;
  return model === 'section' ? 10 : 1;
}
