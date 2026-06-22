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
  const emitTargetSections = model === 'component_select';
  const targetSections = emitTargetSections
    ? await buildTargetSections(ontology, targetSectionTipos, permissions, opts.dataLang)
    : null;

  // ── columns_map: [] for these components (get_columns_map null → '?? []'). ──
  const columnsMap: unknown[] = [];

  // ── path: recursive get_query_path. ──
  const path = await buildQueryPath(ontology, tipo, sectionTipo, opts.dataLang);

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
      if (emitTargetSections && targetSections !== null) out.target_sections = targetSections;
      out.request_config = requestConfig;
      out.columns_map = columnsMap;
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
