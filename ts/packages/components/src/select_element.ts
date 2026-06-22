/**
 * Port of the component_select JSON CONTROLLER {context, data} element
 * (core/component_select/component_select_json.php) for EDIT mode — completing
 * select across all render modes (its LIST element + in-section LIST context are
 * already byte-green; see component_data_element.ts + relation_select_context.ts).
 *
 * ── CONTEXT half (default branch, mode-independent) ──
 *   IDENTICAL to the LIST select in-section context: get_structure_context(
 *   permissions, add_request_config=true) + the `target_sections` add (one
 *   descriptor per linked section tipo: {tipo,label,permissions,permissions_new}).
 *   The PHP controller's context branch does NOT switch on mode (the `default:`
 *   case serves both list and edit), so the relation request_config block
 *   (target_sections / request_config / columns_map / recursive path) is the same
 *   as the byte-green LIST context — only the MODE-DEPENDENT base fields differ
 *   (edit `tools`/`css`/`mode` + `request_config[..].show.sqo_config.{limit,mode}`),
 *   all of which buildRelationSelectComponentContext already reproduces via the
 *   mode-aware buildComponentElementContext + buildRequestConfigV5List. Verified
 *   vs the live dd1037 edit/list element contexts (byte-identical save those mode
 *   fields).
 *   `config_warnings` is NEVER emitted in the parity output: build_structure_context
 *   sets it ONLY under SHOW_DEBUG===true (class.common.php:1675), which the differ
 *   drops alongside the `debug` block. So there is NO config_warnings delta to port.
 *
 * ── DATA half (edit branch, get_data && permissions>0) ──
 *   value    = get_data_lang() — the RAW stored locators (the relation column slot),
 *              or null when no selection is saved;
 *   item     = get_data_item(value) — the base 7 fields (section_id, section_tipo,
 *              tipo, mode, lang=lg-nolan, from_component_tipo=tipo, entries=value);
 *   item->datalist = get_list_of_values(DEDALO_DATA_LANG, true)->result ?? [] — the
 *              full set of selectable options over the select's target section, each
 *              {value:{section_tipo,section_id}, label, section_id, hide:[]}, sorted
 *              (sort_by / label). See ComponentRelationCommon.getListOfValues.
 *   The standalone controller appends NOTHING after datalist (the subdatum path only
 *   fires for a component_dataframe ddo, declined); the build_json_rows assembly
 *   stamps row_section_id + parent_tipo separately.
 *
 * ── DECLINES (no guessed bytes) ──
 *   - non-edit modes (list/tm: entries = [get_value()] flat label, NO datalist) —
 *     served by the existing LIST data element (buildDataElement), not here.
 *   - the un-ported datalist shapes (V6 source.request_config, filtered_by_search*,
 *     multi-target, MULTI show-label join — e.g. dd1016's "X | y" labels): the
 *     getListOfValues loud guard throws → converted to UnsupportedSelect so a
 *     half-ported element fails closed.
 *   - has_dataframe (subdatum context/data) — declined.
 */

import { buildRelationSelectComponentContext } from './relation_select_context.ts';
import type { BuildRelationSelectContextOptions } from './relation_select_context.ts';
import { ComponentSelect } from './component_select.ts';
import type {
  ComponentRelationCommon,
  DatalistItem,
  DatalistRecordSearch,
} from './component_relation_common.ts';
import type { ComponentInit } from './component_common.ts';
import type { ComponentDatum } from '@dedalo/db';

/** Thrown when the select edit element hits a special case this phase declines. */
export class UnsupportedSelect extends Error {}

/** Inputs identifying the component_select edit element to build. */
export interface SelectElementSource {
  tipo: string;
  section_tipo: string;
  section_id: number | string | null;
  /** Requested lang (effective lang is forced to lg-nolan for the relation column). */
  lang?: string;
  /** 'edit' (the only mode this builder ports). */
  mode?: string;
  /** ASSEMBLY caller tipo → stamped onto parent_tipo by build_json_rows. */
  caller_tipo?: string;
  /** ASSEMBLY caller from_component_tipo override (relation/portal callers only). */
  from_component_tipo?: string;
}

/** Deps: the data init deps + the context-half deps + the datalist target-section search. */
export interface BuildSelectElementOptions {
  matrix: ComponentInit['matrix'];
  ontology: ComponentInit['ontology'];
  langConfig: ComponentInit['langConfig'];
  /** Matrix table the host section lives in. */
  matrixTable: string;
  /** Context-half deps (the relation/select component structure-context builder). */
  context: Pick<BuildRelationSelectContextOptions, 'toolsQueryer' | 'contextConfig' | 'toolProperties'>;
  /** DEDALO_STRUCTURE_LANG (matrix_table terms in the request_config). */
  structureLang: string;
  /**
   * Enumerate the select's target-section rows (the search behind get_list_of_values
   * — limit 0, all rows, default project filter). Required for the datalist; absent →
   * the element declines. Injected so this module stays free of @dedalo/search.
   */
  datalistRecordSearch?: DatalistRecordSearch;
}

/** The component_select EDIT DATA-half item (base 7 + datalist). */
export interface SelectDataItem {
  section_id: number | string | null;
  section_tipo: string;
  tipo: string;
  mode: string;
  lang: string;
  from_component_tipo: string;
  entries: ComponentDatum[] | null;
  datalist: DatalistItem[];
}

/** The {context, data} element a component_select get_json() returns (edit mode). */
export interface SelectElement {
  context: unknown[];
  data: SelectDataItem[];
}

/** section_id may arrive as a numeric string; PHP coerces with (int) for the matrix read. */
function normalizeSectionId(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Build the {context, data} element for component_select (EDIT mode).
 *
 * @throws UnsupportedSelect for non-edit modes, when no datalistRecordSearch was
 *   provided, or when the datalist hits an un-ported shape (multi-label join, V6,
 *   filtered_by_search*, multi-target) so a half-ported element never escapes.
 */
export async function buildSelectElement(
  source: SelectElementSource,
  opts: BuildSelectElementOptions,
): Promise<SelectElement> {
  const tipo = source.tipo;
  const sectionTipo = source.section_tipo;
  const mode = source.mode ?? 'edit';
  const requestedLang = source.lang ?? opts.langConfig.dataLang;

  if (mode !== 'edit') {
    throw new UnsupportedSelect(
      `component_select ${tipo}: ${mode} mode (entries=[get_value()], no datalist) not ported here — edit only`,
    );
  }
  if (opts.datalistRecordSearch === undefined) {
    throw new UnsupportedSelect(
      `component_select ${tipo}: edit datalist needs a datalistRecordSearch (none provided)`,
    );
  }

  // ── DECLINE has_dataframe (extra subdatum context/data). ──
  const properties = (await opts.ontology.getProperties(tipo)) ?? {};
  if ((properties as { has_dataframe?: unknown }).has_dataframe === true) {
    throw new UnsupportedSelect(`component_select ${tipo}: has_dataframe (subdatum) not ported`);
  }

  // ── CONTEXT half: the relation/select component structure-context (mode-aware:
  //    edit tools/css + the request_config block + recursive path). REUSED from the
  //    byte-green LIST builder — the controller's context branch is mode-independent. ──
  const ctxResponse = await buildRelationSelectComponentContext(
    { tipo, section_tipo: sectionTipo, model: 'component_select', lang: requestedLang, mode },
    {
      ontology: opts.ontology,
      toolsQueryer: opts.context.toolsQueryer,
      contextConfig: opts.context.contextConfig,
      dataLang: opts.langConfig.dataLang,
      structureLang: opts.structureLang,
      ...(opts.context.toolProperties ? { toolProperties: opts.context.toolProperties } : {}),
    },
  );
  const context: unknown[] = ctxResponse.result === false ? [] : ctxResponse.result;

  // ── DATA half: entries = get_data_lang (raw locators or null), datalist = get_list_of_values. ──
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
  const component = await ComponentSelect.create(init);
  const entries = await component.dataLocators();

  // get_list_of_values loud-throws for the un-ported datalist shapes (multi-label,
  // V6, filtered_by_search*, multi-target). Convert to this builder's contract type
  // so a select whose datalist diverges fails closed (no guessed bytes).
  let datalist: DatalistItem[];
  try {
    datalist = await (component as ComponentRelationCommon).getListOfValues(opts.datalistRecordSearch);
  } catch (e) {
    throw new UnsupportedSelect(
      `component_select ${tipo}: edit datalist not ported (${(e as Error).message})`,
    );
  }

  const item: SelectDataItem = {
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
