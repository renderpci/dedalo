/**
 * Port of the component_filter JSON CONTROLLER {context, data} element
 * (core/component_filter/component_filter_json.php) for EDIT mode — the
 * project/scope filter every editable section carries.
 *
 * ── CONTEXT half (default branch, $options->get_context===true) ──
 *   get_structure_context($permissions, add_request_config=false) — the base
 *   component structure-context (reused from buildComponentElementContext: it
 *   resolves the edit-mode tools / sortable / legacy_model for component_filter),
 *   THEN:
 *     - set_target_sections([{tipo, label}, …]) — one descriptor per
 *       get_ar_target_section_tipo() (= ['dd153']); label = the section term at
 *       DEDALO_DATA_LANG. component_filter does NOT carry request_config /
 *       columns_map / config_warnings (add_request_config=false), so the filter
 *       context is SIMPLER than the select/relation family: just target_sections
 *       (tipo+label, NO permissions block) inserted after `buttons`.
 *     - get_order_path() — the two-step sortable path (this component, then the
 *       project-name field dd156 on dd153), replacing the base empty `path`.
 *   Field order (verified vs live rsc232 edit context):
 *     typo,type,tipo,section_tipo,parent,parent_grouper,lang(nolan),mode,model,
 *     properties,permissions,label,translatable,tools,buttons,
 *     target_sections, sortable, legacy_model, path
 *
 * ── DATA half (edit branch, $options->get_data && permissions>0) ──
 *   value = get_data_lang() — the RAW stored filter locators (lg-nolan slot), or
 *           null when no project is assigned;
 *   item  = get_data_item(value) — the base 7 fields (section_id, section_tipo,
 *           tipo, mode, lang=lg-nolan, from_component_tipo=tipo, entries=value);
 *   item->datalist = get_datalist() — the user-authorized project list (ROOT/global
 *           admin = ALL dd153 projects), each {type:'project', label, section_tipo,
 *           section_id, value:{section_tipo,section_id}, parent, order}, sorted by
 *           label ASC. See ComponentFilter.getDatalist.
 *   The standalone controller appends NOTHING after datalist; the build_json_rows
 *   assembly stamps row_section_id + parent_tipo separately.
 *
 * ── DECLINES (no guessed bytes) ──
 *   - non-edit modes (list/tm: get_list_value LABELS, no datalist) — declined.
 *   - non-global-admin (regular-user) datalist (the user's own dd170 assignments) —
 *     declined (ComponentFilter only ports the root/all-projects branch).
 */

import { buildComponentElementContext } from './component_element_context.ts';
import type {
  BuildComponentElementContextOptions,
  ElementContextSource,
} from './component_element_context.ts';
import {
  ComponentFilter,
  UnsupportedFilter,
  type FilterDatalistItem,
  type ProjectsRecordSearch,
} from './component_filter.ts';
import type { ComponentInit } from './component_common.ts';
import type { ComponentDatum } from '@dedalo/db';

/** Inputs identifying the component_filter element to build. */
export interface FilterElementSource {
  tipo: string;
  section_tipo: string;
  section_id: number | string | null;
  /** Requested lang (effective lang is forced to lg-nolan). */
  lang?: string;
  /** 'edit' (the only ported mode). */
  mode?: string;
  /** ASSEMBLY caller tipo → stamped onto parent_tipo by build_json_rows. */
  caller_tipo?: string;
  /** ASSEMBLY caller from_component_tipo override (relation/portal callers only). */
  from_component_tipo?: string;
}

/** Deps: the data init deps + the context-half deps + the projects datalist search. */
export interface BuildFilterElementOptions {
  matrix: ComponentInit['matrix'];
  ontology: ComponentInit['ontology'];
  langConfig: ComponentInit['langConfig'];
  /** Matrix table the host section lives in. */
  matrixTable: string;
  context: Pick<
    BuildComponentElementContextOptions,
    'toolsQueryer' | 'contextConfig' | 'toolProperties'
  >;
  /**
   * Enumerate ALL projects (dd153) — the global-admin unlimited search behind
   * get_user_authorized_projects. Required for the datalist; absent → the element
   * declines (no datalist can be built). Injected so this module stays free of
   * @dedalo/search.
   */
  projectsSearch?: ProjectsRecordSearch;
}

/** The component_filter DATA-half item (base 7 + datalist). */
export interface FilterDataItem {
  section_id: number | string | null;
  section_tipo: string;
  tipo: string;
  mode: string;
  lang: string;
  from_component_tipo: string;
  entries: ComponentDatum[] | null;
  datalist: FilterDatalistItem[];
}

/** The {context, data} element a component_filter get_json() returns. */
export interface FilterElement {
  context: unknown[];
  data: FilterDataItem[];
}

/** section_id may arrive as a numeric string; PHP coerces with (int) for the matrix read. */
function normalizeSectionId(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Build the {context, data} element for component_filter (EDIT mode).
 *
 * @throws UnsupportedFilter for non-edit modes or when no projectsSearch was
 *   provided (the datalist cannot be byte-reproduced).
 */
export async function buildFilterElement(
  source: FilterElementSource,
  opts: BuildFilterElementOptions,
): Promise<FilterElement> {
  const tipo = source.tipo;
  const sectionTipo = source.section_tipo;
  const mode = source.mode ?? 'edit';
  const requestedLang = source.lang ?? opts.langConfig.dataLang;
  const dataLang = opts.langConfig.dataLang;

  if (mode !== 'edit') {
    throw new UnsupportedFilter(
      `component_filter ${tipo}: ${mode} mode (get_list_value labels, no datalist) not ported — edit only`,
    );
  }
  if (opts.projectsSearch === undefined) {
    throw new UnsupportedFilter(
      `component_filter ${tipo}: edit datalist needs a projectsSearch (none provided)`,
    );
  }

  // ── CONTEXT half: base component context, then insert target_sections + path. ──
  const contextSource: ElementContextSource = {
    tipo,
    section_tipo: sectionTipo,
    model: 'component_filter',
    lang: requestedLang,
    mode,
  };
  const ctxResponse = await buildComponentElementContext(contextSource, {
    ontology: opts.ontology,
    toolsQueryer: opts.context.toolsQueryer,
    contextConfig: opts.context.contextConfig,
    dataLang,
    ...(opts.context.toolProperties ? { toolProperties: opts.context.toolProperties } : {}),
  });

  const targetSections = await ComponentFilter.targetSections(opts.ontology, dataLang);
  const path = await ComponentFilter.orderPath(opts.ontology, tipo, sectionTipo, dataLang);

  const context: unknown[] = [];
  if (ctxResponse.result !== false) {
    for (const ctxItem of ctxResponse.result) {
      const base = ctxItem as Record<string, unknown>;
      // Rebuild in dd_object declaration order: insert target_sections right after
      // `buttons`, replace the base empty `path` (appended last) with the order path.
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(base)) {
        if (k === 'path') continue; // re-appended at the end with the order path
        out[k] = v;
        if (k === 'buttons') out.target_sections = targetSections;
      }
      out.path = path;
      context.push(out);
    }
  }

  // ── DATA half: entries = get_data_lang (raw locators), datalist = get_datalist. ──
  const init: ComponentInit = {
    tipo,
    sectionTipo,
    sectionId: normalizeSectionId(source.section_id),
    lang: requestedLang,
    dataColumnName: 'relation',
    matrixTable: opts.matrixTable,
    matrix: opts.matrix,
    ontology: opts.ontology,
    langConfig: opts.langConfig,
  };
  const component = await ComponentFilter.create(init);
  const entries = await component.dataLocators();
  const datalist = await component.getDatalist(opts.projectsSearch);

  const item: FilterDataItem = {
    section_id: source.section_id ?? null,
    section_tipo: sectionTipo,
    tipo,
    mode,
    lang: component.effectiveLang(),
    from_component_tipo: source.from_component_tipo ?? tipo,
    entries: (entries ?? null) as ComponentDatum[] | null,
    datalist,
  };

  return { context, data: [item] };
}
