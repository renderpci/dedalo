/**
 * Port of the in-section / get_element_context COMPONENT structure-context for the
 * RELATION/SELECT family (component_select and, where reachable,
 * component_relation_parent / component_relation_related), built with
 * add_request_config=true — the shape get_subdatum injects (and the select/relation
 * *_json controllers emit) for these columns inside a build_json_rows section render.
 *
 * PHP path (build_json_rows → common::get_subdatum):
 *   The section walk instantiates each child component, calls
 *   `$child->build_request_config()` and injects it as `$child->request_config`
 *   BEFORE `$child->get_json()`. The child's *_json controller then calls
 *   get_structure_context($permissions, add_request_config=true), so the context
 *   DDO carries `request_config` (the component's own default config — its target
 *   section + label columns) AND a recursive `path` (get_order_path →
 *   search::get_query_path, which descends into the first related label component).
 *   The select controller ALSO appends `target_sections` (per linked section:
 *   {tipo,label,permissions,permissions_new}).
 *
 * KEY PARITY FACTS (verified vs live dd1010 build_json_rows + the standalone
 * select_single_list element-context golden):
 *   - The in-section select column's `request_config` is IDENTICAL to its
 *     standalone get_element_context request_config: get_subdatum's children
 *     inheritance only overwrites a child's show.ddo_map when the SECTION's
 *     request_config carries deeper descendant ddos of that child. The flat
 *     section list ddo_map has none, so the select keeps its OWN default
 *     build_request_config (target-section list path). → reuse buildRequestConfigV5List.
 *   - The base component context (typo…buttons) is byte-identical to
 *     buildComponentElementContext for the same model/mode (selects carry no
 *     model-specific context fields beyond the relation request_config block).
 *   - DDO field order (dd_object declaration), null-filtered, with the
 *     relation-family block:
 *       typo,type,tipo,section_tipo,parent,parent_grouper,lang,mode,model,
 *       properties,permissions,label,translatable,tools,buttons,
 *       target_sections, request_config, columns_map, sortable, legacy_model, path
 *     (target_sections is emitted only by the select controller; the relation
 *     controllers omit it. request_config/columns_map sit BEFORE sortable.)
 *
 * SCOPE: LIST mode only (the build_json_rows section render). The V5 list path
 * (select / relation with no source.request_config) is byte-ported. The V6 path
 * (relation_parent/related's stored source.request_config) is supported via the
 * existing buildRequestConfigV6List orchestrator; callers gate the reachable models.
 */

import type { OntologyRepository } from '@dedalo/ontology';
import {
  buildComponentElementContext,
  type BuildComponentElementContextOptions,
  type ElementContextResponse,
} from './component_element_context.ts';
import {
  buildRequestConfigV5List,
  buildRequestConfigV6List,
  calculateDefaultLimitV6,
  type RequestConfigContext,
  type RequestConfigDeps,
} from './request_config.ts';
import {
  resolveSectionMatrixTable,
  resolveRealSectionTipo,
} from './section_element_context.ts';

/** DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO — deprecated v6 component, dropped. */
const SECURITY_AREAS_PROFILES_TIPO = 'dd249';

/** A single get_query_path step (search::get_query_path), plain-object key order. */
export interface OrderPathStep {
  name: string;
  model: string;
  section_tipo: string;
  component_tipo: string;
}

/** A target_sections descriptor (component_select_json target_sections add). */
export interface TargetSectionDescriptor {
  tipo: string;
  label: string;
  permissions: number;
  permissions_new: number | null;
}

/**
 * The MINIMAL target_sections descriptor emitted by component_radio_button_json /
 * component_check_box_json (and component_filter): just {tipo, label} — NO
 * permissions / permissions_new block. Built by the `array_map` in those
 * controllers over get_ar_target_section_tipo(), label = ontology term in
 * DEDALO_DATA_LANG (get_term_by_tipo(..., DEDALO_DATA_LANG, true, true)).
 */
export interface MinimalTargetSectionDescriptor {
  tipo: string;
  label: string;
}

/** strip_tags — the term is plain text here; minimal port. */
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

/** Models that have relations (search::get_query_path recursion trigger). */
const COMPONENTS_WITH_RELATIONS: ReadonlySet<string> = new Set([
  'component_autocomplete',
  'component_autocomplete_hi',
  'component_check_box',
  'component_filter',
  'component_filter_master',
  'component_portal',
  'component_publication',
  'component_radio_button',
  'component_relation_children',
  'component_relation_index',
  'component_relation_model',
  'component_relation_parent',
  'component_relation_related',
  'component_relation_struct',
  'component_select',
  'component_select_lang',
  'component_inverse',
  'component_dataframe',
]);

/**
 * Port of search::get_query_path (the get_order_path body for a direct section
 * child — no from_section_tipo portal prefix). Builds the path step for `tipo`
 * then, for a relation-family component, recurses into the FIRST related label
 * component on the first related section (the toponymy/select descent). `name`
 * uses DEDALO_DATA_LANG (get_query_path passes DEDALO_DATA_LANG to get_term).
 */
export async function buildQueryPath(
  ontology: OntologyRepository,
  tipo: string,
  sectionTipo: string,
  dataLang: string,
): Promise<OrderPathStep[]> {
  const model = (await ontology.getModelByTipo(tipo)) ?? '';
  const path: OrderPathStep[] = [];

  const term = (await ontology.getLabel(tipo, dataLang)) ?? '';
  path.push({
    name: stripTags(term),
    model,
    section_tipo: sectionTipo,
    component_tipo: tipo,
  });

  if (COMPONENTS_WITH_RELATIONS.has(model)) {
    const relatedTerms = (await ontology.getRelationTipos(tipo)) ?? [];
    // first related 'section' model = the related section.
    let relatedSectionTipo: string | null = null;
    for (const rt of relatedTerms) {
      if ((await ontology.getModelByTipo(rt)) === 'section') {
        relatedSectionTipo = rt;
        break;
      }
    }
    if (relatedSectionTipo !== null) {
      for (const currentTipo of relatedTerms) {
        const modelName = await ontology.getModelByTipo(currentTipo);
        if (modelName === null || !modelName.startsWith('component')) continue;
        // recursion (only first related component; break after).
        const sub = await buildQueryPath(ontology, currentTipo, relatedSectionTipo, dataLang);
        for (const s of sub) path.push(s);
        break;
      }
    }
  }

  return path;
}

/** DEDALO_THESAURUS_TERM_TIPO — the relation_related fixed second path step. */
const THESAURUS_TERM_TIPO = 'hierarchy25';

/**
 * Port of component_relation_related::get_order_path (the override): a fixed
 * two-step path — the component itself, then DEDALO_THESAURUS_TERM_TIPO
 * (hierarchy25, the thesaurus term input_text) — BOTH carrying the SAME
 * `section_tipo` (the caller's section_tipo, NOT hierarchy25's own section).
 * Key order is component_tipo, model, name, section_tipo (the PHP object literal
 * order, which differs from the generic get_query_path order). `name` uses the
 * ontology term in DEDALO_DATA_LANG (get_term_by_tipo default lang).
 */
export async function buildRelationRelatedOrderPath(
  ontology: OntologyRepository,
  componentTipo: string,
  sectionTipo: string,
  dataLang: string,
): Promise<OrderPathStep[]> {
  const step = async (tipo: string): Promise<OrderPathStep> => ({
    component_tipo: tipo,
    model: (await ontology.getModelByTipo(tipo)) ?? '',
    name: stripTags((await ontology.getLabel(tipo, dataLang)) ?? ''),
    section_tipo: sectionTipo,
  });
  return [await step(componentTipo), await step(THESAURUS_TERM_TIPO)];
}

/**
 * Resolve a select's target_sections (component_select_json target_sections add):
 * one descriptor per linked section tipo (the request_config sqo section_tipo).
 * permissions = root (3); permissions_new = root (3) when the section has a
 * button_new child (security::get_section_new_permissions), else null. The label
 * is the section term in DEDALO_DATA_LANG (get_term_by_tipo(..., DEDALO_DATA_LANG)).
 */
async function buildTargetSections(
  ontology: OntologyRepository,
  targetSectionTipos: string[],
  permissions: number,
  dataLang: string,
): Promise<TargetSectionDescriptor[]> {
  const out: TargetSectionDescriptor[] = [];
  for (const st of targetSectionTipos) {
    if (permissions <= 0) continue;
    const label = (await ontology.getLabel(st, dataLang)) ?? '';
    // permissions_new: root permission (3) when a button_new child exists, else null.
    const real = await resolveRealSectionTipo(ontology, st);
    const sources = real === st ? [st] : [real, st];
    let hasButtonNew = false;
    for (const src of sources) {
      for (const child of await ontology.getChildren(src)) {
        if ((await ontology.getModelByTipo(child)) === 'button_new') {
          hasButtonNew = true;
          break;
        }
      }
      if (hasButtonNew) break;
    }
    out.push({
      tipo: st,
      label,
      permissions,
      permissions_new: hasButtonNew ? permissions : null,
    });
  }
  return out;
}

/**
 * Resolve the MINIMAL target_sections for component_radio_button / component_check_box:
 * one {tipo,label} per linked section tipo (the request_config sqo section_tipo),
 * label = ontology term in DEDALO_DATA_LANG. NO permissions block (the radio/check
 * controllers' array_map over get_ar_target_section_tipo()).
 */
async function buildMinimalTargetSections(
  ontology: OntologyRepository,
  targetSectionTipos: string[],
  dataLang: string,
): Promise<MinimalTargetSectionDescriptor[]> {
  const out: MinimalTargetSectionDescriptor[] = [];
  for (const st of targetSectionTipos) {
    out.push({ tipo: st, label: (await ontology.getLabel(st, dataLang)) ?? '' });
  }
  return out;
}

/** Options for the relation/select component context build. */
export interface BuildRelationSelectContextOptions {
  ontology: OntologyRepository;
  toolsQueryer: BuildComponentElementContextOptions['toolsQueryer'];
  contextConfig: BuildComponentElementContextOptions['contextConfig'];
  /** DEDALO_DATA_LANG (path/target_sections term lang, child instance lang). */
  dataLang: string;
  /** DEDALO_STRUCTURE_LANG (matrix_table terms). */
  structureLang: string;
  toolProperties?: BuildComponentElementContextOptions['toolProperties'];
}

/** RQO source identifying the relation/select column. */
export interface RelationSelectContextSource {
  tipo: string;
  section_tipo: string;
  model: string;
  lang?: string;
  mode?: string;
}

/**
 * Build the relation/select component structure-context DDO (add_request_config=true):
 * the base component context PLUS the relation request_config block (target_sections
 * for select, request_config, columns_map) and the recursive path.
 *
 * Returns false-result when the base context build declines (non-component model).
 * Throws nothing on the supported V5 list path; the caller (build_json_rows / the
 * section gate) restricts the reachable models/modes.
 */
export async function buildRelationSelectComponentContext(
  source: RelationSelectContextSource,
  opts: BuildRelationSelectContextOptions,
): Promise<ElementContextResponse> {
  const { ontology, contextConfig } = opts;
  const tipo = source.tipo;
  const sectionTipo = source.section_tipo;
  const model = source.model;
  const mode = source.mode ?? 'list';

  // ── base component context (typo…buttons + sortable/legacy_model/path) ──
  const base = await buildComponentElementContext(
    {
      tipo,
      section_tipo: sectionTipo,
      model,
      mode,
      ...(source.lang !== undefined ? { lang: source.lang } : {}),
    },
    {
      ontology,
      toolsQueryer: opts.toolsQueryer,
      contextConfig,
      dataLang: opts.dataLang,
      ...(opts.toolProperties ? { toolProperties: opts.toolProperties } : {}),
    },
  );
  if (base.result === false) return base;
  const baseDdo = base.result[0] as Record<string, unknown>;

  // ── relation_parent / relation_related properties mutation ──
  // Both *_json controllers force context.properties.show_interface.button_add =
  // false (defaulting show_interface to {} when absent), suppressing the inline
  // 'add' affordance. The mutation preserves any pre-existing show_interface keys
  // and only overrides button_add; when show_interface is absent it is appended as
  // the LAST properties key (object insertion order). component_select does NOT do
  // this (its controller has no such mutation).
  if (model === 'component_relation_parent' || model === 'component_relation_related') {
    const baseProps =
      baseDdo.properties && typeof baseDdo.properties === 'object'
        ? (baseDdo.properties as Record<string, unknown>)
        : {};
    const existingSi =
      baseProps.show_interface && typeof baseProps.show_interface === 'object'
        ? (baseProps.show_interface as Record<string, unknown>)
        : {};
    baseDdo.properties = {
      ...baseProps,
      show_interface: { ...existingSi, button_add: false },
    };
  }

  // ── request_config (the component's OWN build_request_config). The select /
  //    radio / check_box take the V5 list path; relation_parent/related carry a
  //    stored source.request_config → V6 path. permissions: root. ──
  const permissions = 3;
  const rcCtx: RequestConfigContext = {
    tipo,
    sectionTipo,
    model,
    mode,
    permissions,
    applicationLang: contextConfig.applicationLang,
    structureLang: opts.structureLang,
  };
  const rcDeps: RequestConfigDeps = {
    ontology,
    resolveMatrixTable: (st) => resolveSectionMatrixTable(ontology, st, opts.structureLang),
    resolveSectionButtons: (st) => resolveSqoSectionButtons(ontology, st),
  };

  const properties = await ontology.getProperties(tipo);
  const storedRequestConfig = (() => {
    const src = properties && typeof properties === 'object'
      ? (properties as { source?: unknown }).source
      : undefined;
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      return (src as { request_config?: unknown }).request_config;
    }
    return undefined;
  })();

  let requestConfig: unknown[];
  if (Array.isArray(storedRequestConfig)) {
    const limit = calculateDefaultLimitV6(storedRequestConfig, model, mode);
    requestConfig = await buildRequestConfigV6List(storedRequestConfig, rcCtx, rcDeps, limit);
  } else {
    requestConfig = await buildRequestConfigV5List(rcCtx, rcDeps);
  }

  // ── target_sections (select controller only) ── the sqo section_tipo tipos.
  const targetSectionTipos: string[] = [];
  for (const rco of requestConfig as Record<string, unknown>[]) {
    const sqo = rco?.sqo as { section_tipo?: unknown } | undefined;
    const st = sqo?.section_tipo;
    if (Array.isArray(st)) {
      for (const ddo of st) {
        const t = (ddo as { tipo?: unknown })?.tipo;
        if (typeof t === 'string') targetSectionTipos.push(t);
      }
    }
  }
  // ── target_sections. component_select emits the RICH descriptor
  //    ({tipo,label,permissions,permissions_new}); component_radio_button and
  //    component_check_box emit the MINIMAL descriptor ({tipo,label}) via their
  //    controllers' array_map over get_ar_target_section_tipo(). The relation
  //    (parent/related) controllers emit none. ──
  const isCheckBox = model === 'component_check_box';
  const isRadio = model === 'component_radio_button';
  let targetSections: unknown[] | null = null;
  if (model === 'component_select') {
    targetSections = await buildTargetSections(
      ontology,
      targetSectionTipos,
      permissions,
      opts.dataLang,
    );
  } else if (isRadio || isCheckBox) {
    targetSections = await buildMinimalTargetSections(ontology, targetSectionTipos, opts.dataLang);
  }

  // ── columns_map: [] for these components (get_columns_map null → '?? []'). ──
  const columnsMap: unknown[] = [];

  // ── view / children_view (relation-family non-select): get_view() resolves to
  //    'line' and get_children_view() to 'text' via the legacy-model default for
  //    component_relation_parent / component_relation_related (common::resolve_view
  //    / get_children_view). component_select / radio_button resolve view=null
  //    (dropped), so they emit neither. These sit BETWEEN columns_map and sortable. ──
  let view: string | null = null;
  let childrenView: string | null = null;
  if (model === 'component_relation_parent' || model === 'component_relation_related') {
    view = 'line';
    childrenView = 'text';
  }

  // component_check_box builds its context with add_request_config=FALSE (the
  // check_box_json controller), so the DDO carries NO request_config / columns_map
  // and the sortable path-add is skipped (path stays []). radio_button / select /
  // relation build with add_request_config=true → the request_config block + the
  // recursive get_order_path.
  const emitRequestConfig = !isCheckBox;

  // ── path: get_order_path. component_relation_related OVERRIDES get_order_path
  //    with a fixed two-step path (self + the thesaurus-term input_text hierarchy25,
  //    both keyed component_tipo/model/name/section_tipo, sharing the SAME
  //    section_tipo). All other relation models use the generic recursive
  //    get_query_path (buildQueryPath). check_box: path is [] (add_request_config
  //    false → the sortable get_order_path gate is not reached). ──
  const path = isCheckBox
    ? []
    : model === 'component_relation_related'
      ? await buildRelationRelatedOrderPath(ontology, tipo, sectionTipo, opts.dataLang)
      : await buildQueryPath(ontology, tipo, sectionTipo, opts.dataLang);

  // ── reassemble in dd_object declaration order, inserting the relation block
  //    (target_sections / request_config / columns_map) at its dd_object property
  //    position and replacing the base `path`. ──
  // The dd_object declaration order places `css` (the component css block, present in
  // EDIT mode, dropped in LIST mode) BEFORE target_sections; so the relation block is
  // inserted after the LAST emitted field of {buttons, css}. In list mode (no css)
  // that is `buttons`; in edit mode it is `css`. Anchoring on css-when-present keeps
  // both modes byte-exact (verified vs the live dd1037 list + edit element contexts).
  const insertAnchor = Object.prototype.hasOwnProperty.call(baseDdo, 'css') ? 'css' : 'buttons';
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(baseDdo)) {
    if (k === 'path') continue; // re-emitted at the end with the recursive value
    out[k] = v;
    if (k === insertAnchor) {
      if (targetSections !== null) out.target_sections = targetSections;
      if (emitRequestConfig) {
        out.request_config = requestConfig;
        out.columns_map = columnsMap;
        // view / children_view sit right after columns_map (relation non-select).
        if (view !== null) out.view = view;
        if (childrenView !== null) out.children_view = childrenView;
      }
    }
  }
  // base always emits `legacy_model` then `path`; path goes last.
  out.path = path;

  return { result: [out], msg: base.msg, errors: base.errors };
}

/**
 * build_section_buttons: ONLY button_new then button_delete (each at most once),
 * fixed order, for the sqo->section_tipo ddo's `buttons`. (Local copy mirroring
 * section_element_context's resolveSqoSectionButtons — kept here to avoid a
 * circular dependency on an un-exported helper.)
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

export { SECURITY_AREAS_PROFILES_TIPO };
