/**
 * Port of the dd_core_api `read` DEFAULT action (NOT get_value) → build_json_rows
 * for the section LIST/record-render response: the `{context, data}` the UI list
 * (and edit/list render) consumes for a section's records.
 *
 * PHP path (the parity-critical core):
 *   dd_core_api::read → build_json_rows (action!=='get_value' default) →
 *   sections::get_instance(...)->get_json() (sections_json.php) →
 *     per row a `sections` MARKER + per section_tipo a section::get_json()
 *     (section_json.php) → section structure_context(add_rqo=true) +
 *     common::get_subdatum($tipo, $section_records) which, per locator × per
 *     request_config ddo, instantiates the child component, injects the narrowed
 *     request_config, and emits its {context,data} element. Each data item is then
 *     STAMPED (row_section_id = locator.section_id; parent_tipo = caller tipo;
 *     from_component_tipo = caller tipo ONLY when the caller is a component).
 *     Contexts are deduped by common::context_key (tipo+section_tipo+mode).
 *
 * ── THIS BRICK'S SCOPE (REALISTIC, PARITY-GATED) ──
 * The full action is DECLINED at the handler (→ proxy). This module BYTE-EXACTLY
 * assembles the response for the narrow, fully-ported case the differ gates:
 *   - caller is a SECTION (model 'section') in LIST mode,
 *   - whose request_config ddo_map columns are ALL `component_input_text`
 *     (the only ported element builder),
 *   - for the rows of either an EXPLICIT record set supplied as
 *     sqo.filter_by_locators ({section_tipo, section_id}), OR — the real LIST
 *     view — a PLAIN sqo (section_tipo + limit/offset, NO filter_by_locators):
 *     the section's records are searched (searchRecords: section_id ASC,
 *     LIMIT/OFFSET) and the returned page is rendered. Both feed the same
 *     per-locator render + sections-wrapper paginated_key=key+offset.
 *
 * The assembly REUSES:
 *   - buildSectionElementContext (the byte-green section structure-context, with
 *     request_config — = read ctx[0]) for the CONTEXT half's section DDO + the
 *     request_config ddo_map the walk iterates,
 *   - buildInputTextElement (the byte-green input_text {context,data} element) for
 *     each column's DATA + component context, PLUS the `path` field this module
 *     adds (the assembly's add_rqo=true component context carries get_order_path;
 *     the standalone component-context builder omits it).
 *
 * ── THE `path` FIELD (add_rqo component context) ──
 * In build_structure_context, a component whose instance has request_config set
 * AND sortable===true gets `path = get_order_path(tipo, section_tipo)`. For a
 * direct SECTION child (from_section_tipo NOT set) that reduces to
 * search::get_query_path(tipo, section_tipo): a single path step for input_text
 * (input_text is NOT a relation component → no recursion). The step is, in
 * dd_object-less plain-object key order:
 *   { name, model, section_tipo, component_tipo }
 * where name = strip_tags(get_term_by_tipo(tipo, DEDALO_DATA_LANG)) (the DATA
 * lang, not the application lang) and model = component model. sortable is true
 * for every input_text except DEDALO_NOTES_TEXT_TIPO (rsc329).
 *
 * ── STAMPING (post get_json, per data item) ──
 *   row_section_id      = current_locator.section_id   (ALWAYS)
 *   parent_tipo         = caller tipo                   (ALWAYS; overwrites the
 *                         component-controller default of the component's own tipo)
 *   from_component_tipo = caller tipo                   (ONLY when caller is a
 *                         component/portal; a SECTION caller does NOT overwrite it,
 *                         so it stays the component's own tipo — buildInputTextElement
 *                         already defaults to that)
 * The sections MARKER data item is unstamped.
 *
 * ── CONTEXT DEDUP ──
 * common::merge_unique_context / the seen_context map: first occurrence per
 * context_key (tipo + (json-encoded if array) section_tipo + mode) wins. The
 * section DDO is added first; each column's component context is added once.
 *
 * ── DECLINED (handler proxies; NOT assembled here) ──
 *   - any non-input_text column (relation/portal/select/date/number/… element
 *     builders not wired into the walk here),
 *   - V6 section_list source.request_config sections (richer ddo_map),
 *   - sections with button-tools or tool_config (section context declines),
 *   - a FILTERED list (sqo.filter present): needs the conform_filter + Mango WHERE
 *     in the records search; the read handler declines it (proxied to PHP),
 *   - a custom sqo.order (flips PHP's $use_window → wrapper subquery; not ported),
 *   - tm/edit/search modes, dataframe/transliterate/activity input_text specials.
 */

import type { OntologyRepository } from '@dedalo/ontology';
import {
  buildInputTextElement,
  type BuildInputTextElementOptions,
  type InputTextDataItem,
} from './input_text_element.ts';
import {
  buildDataElement,
  type DataElementModel,
} from './component_data_element.ts';
import {
  buildSectionElementContext,
  type BuildSectionElementContextOptions,
} from './section_element_context.ts';
import { buildRelationSelectComponentContext } from './relation_select_context.ts';
import {
  buildGrouperElement,
  buildSectionIdElement,
} from './grouper_section_id_element.ts';
import { buildFilterElement } from './filter_element.ts';
import { buildSelectElement } from './select_element.ts';
import type { ProjectsRecordSearch } from './component_filter.ts';
import type { DatalistRecordSearch } from './component_relation_common.ts';
import type { ContextConfig } from './component_element_context.ts';
import type { LangConfig } from './lang_config.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/** Grouper models — emit a CONTEXT-only grouper element (no data). */
const GROUPER_MODELS: ReadonlySet<string> = new Set([
  'section_group',
  'section_group_div',
  'section_tab',
  'tab',
]);

/** DEDALO_NOTES_TEXT_TIPO — the only component with sortable=false (no path). */
const NOTES_TEXT_TIPO = 'rsc329';

/**
 * RELATION/SELECT family column models whose in-section context carries the
 * relation request_config block (target_sections / request_config / columns_map)
 * + a recursive path — built via buildRelationSelectComponentContext, NOT the
 * plain buildComponentElementContext used for scalar columns. Their DATA half is
 * built by buildDataElement (already byte-green); their CONTEXT half is built by
 * the dedicated relation/select context builder.
 */
const RELATION_SELECT_COLUMN_MODELS: ReadonlySet<string> = new Set([
  'component_select',
  'component_relation_parent',
  'component_relation_related',
]);

/** A locator {section_tipo, section_id} from sqo.filter_by_locators. */
export interface ReadLocator {
  section_tipo: string;
  section_id: number;
}

/**
 * The base records search the assembly uses to resolve the LIST page when no
 * explicit locator set was supplied. Returns the ordered, paginated locators
 * (section_id ASC, LIMIT/OFFSET applied). Injected by the handler so this module
 * does not depend on @dedalo/search. Signature matches searchRecords' core.
 *
 * The optional second argument carries an already-conformed Mango filter (the
 * FILTERED search path): when present the records SELECT adds the per-component
 * WHERE clauses (the SAME builders the filtered count uses) so the returned page
 * is the matched, paginated section_ids. Absent → the plain (no-filter) page. The
 * filter is typed `unknown` here so this module stays free of @dedalo/search; the
 * handler passes the ConformedFilter through verbatim to searchRecords.
 */
export type RecordSearch = (
  sqo: {
    section_tipo: string[];
    limit?: number | string;
    offset?: number;
  },
  filter?: unknown,
) => Promise<ReadLocator[]>;

/** The sections-marker entry per row (sections_json $current_value). */
export interface SectionsEntry {
  section_tipo: string;
  section_id: number;
  paginated_key: number;
}

/** The top-level `sections` marker data item (sections_json $item). */
export interface SectionsMarker {
  typo: 'sections';
  tipo: string;
  section_tipo: unknown[];
  entries: SectionsEntry[];
}

/** The {context, data} read response result. */
export interface BuildJsonRowsResult {
  context: unknown[];
  data: unknown[];
}

/** A single path step (search::get_query_path), plain-object key order. */
interface OrderPathStep {
  name: string;
  model: string;
  section_tipo: string;
  component_tipo: string;
}

/** Inputs identifying the read request this brick assembles. */
export interface BuildJsonRowsSource {
  /** The caller (section) tipo. */
  tipo: string;
  section_tipo?: string;
  model?: string;
  /** 'list' (default). */
  mode?: string;
  /** Requested data lang (default langConfig.dataLang). */
  lang?: string;
}

/** Assembly deps: ontology + lang/context config + the element/section builders' deps. */
export interface BuildJsonRowsOptions {
  ontology: OntologyRepository;
  langConfig: LangConfig;
  contextConfig: ContextConfig;
  /** Section-context deps (tools queryer + tool cache). */
  section: Pick<BuildSectionElementContextOptions, 'toolsQueryer' | 'structureLang' | 'toolProperties'>;
  /** Input-text element deps (matrix + context-half). */
  element: Pick<BuildInputTextElementOptions, 'matrix' | 'context'>;
  /**
   * The record set to render. When the request carried an EXPLICIT
   * sqo.filter_by_locators, this is that already-limited/ordered set and is used
   * verbatim. When ABSENT (or empty) the assembly searches the section's records
   * via `recordSearch` (the real LIST-view path): the paginated, section_id-ASC
   * ordered page the live `read` renders. Exactly one of these supplies the rows.
   */
  locators?: ReadLocator[];
  /**
   * The base records search (port of dd_core_api `read` action 'search' →
   * sections::get_data → search::search). Injected so build_json_rows owns the
   * search path WITHOUT importing @dedalo/search directly: when `locators` is
   * absent the assembly calls this with the request's section_tipo + limit/offset
   * and renders the returned page. The handler wires it from the request-scoped
   * SQL queryer. Absent → only the explicit-locator path is available.
   */
  recordSearch?: RecordSearch;
  /**
   * The request sqo's section_tipo / limit / offset, used to drive `recordSearch`
   * when there is no explicit locator set. Mirrors the sections SQO the live read
   * builds (section_tipo array + limit/offset; select forced to []).
   */
  searchSqo?: { section_tipo: string[]; limit?: number | string; offset?: number };
  /**
   * An already-conformed Mango filter (the FILTERED search path). When present it
   * is passed verbatim to `recordSearch` so the LIST page is the matched, paginated
   * section_ids (the per-component WHERE clauses + $and/$or/$not assembly the count
   * already byte-reproduces). Absent → the plain no-filter page. Typed `unknown` so
   * this module does not import @dedalo/search; the handler supplies the
   * ConformedFilter and threads it straight to searchRecords.
   */
  searchFilter?: unknown;
  /**
   * Enumerate ALL projects (dd153) — the global-admin unlimited search behind a
   * component_filter's datalist (get_user_authorized_projects). Required ONLY for
   * EDIT renders of filter-bearing sections; absent for every other case. Injected
   * by the handler so this module stays free of @dedalo/search. When a section
   * carries a component_filter and this is absent, the filter element declines (the
   * handler gates eligibility on its presence).
   */
  projectsSearch?: ProjectsRecordSearch;
  /**
   * Enumerate a select column's TARGET-SECTION rows (the search behind
   * get_list_of_values — limit 0, all rows, default project filter). Required ONLY
   * for EDIT renders of single-label-V5-select-bearing sections (the select edit
   * `datalist`); absent for every other case. Injected by the handler so this module
   * stays free of @dedalo/search. When a section carries an editable select and this
   * is absent, the select element declines (the handler gates eligibility on it).
   */
  datalistRecordSearch?: DatalistRecordSearch;
  /** sqo.offset (paginated_key = key + offset). Default 0. */
  offset?: number;
  /**
   * The RAW request sqo (rqo.sqo). build_json_rows stores it in session during
   * the search action; the section structure-context then surfaces it as
   * `sqo_session` AND overlays its keys (except section_tipo) onto the dedalo
   * request_config_object's sqo (overlay_request_state). Pass it so the section
   * DDO matches the live read response (the standalone get_element_context path
   * has no session sqo → these fields stay null/absent there).
   */
  requestSqo?: Record<string, unknown>;
}

/** strip_tags — PHP strips ALL tags; the term is plain text here, so a minimal port. */
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

/**
 * Mutate the section DDO to reflect the request SQO carried through the search:
 *   - `sqo_session` (build_structure_context section branch = get_session_sqo):
 *     the raw request sqo, appended after legacy_model.
 *   - overlay_request_state: copy every request-sqo key EXCEPT `section_tipo`
 *     onto the dedalo request_config_object's sqo (so limit/offset/
 *     filter_by_locators populate; the V5 sqo's enriched section_tipo ddo array
 *     is preserved). The null-limit special case (don't overwrite a present
 *     limit with null) is reproduced.
 * No-op when there is no request sqo (the get_element_context path).
 */
function applySectionSqoState(
  sectionDdo: Record<string, unknown>,
  requestSqo: Record<string, unknown> | undefined,
): void {
  if (!requestSqo) return;

  // overlay onto the dedalo request_config_object sqo.
  const requestConfig = (sectionDdo as { request_config?: unknown }).request_config;
  if (Array.isArray(requestConfig)) {
    const dedaloRco = requestConfig.find(
      (el) =>
        el !== null &&
        typeof el === 'object' &&
        (el as { api_engine?: unknown }).api_engine === 'dedalo',
    ) as { sqo?: Record<string, unknown> } | undefined;
    if (dedaloRco && dedaloRco.sqo && typeof dedaloRco.sqo === 'object') {
      const sqo = dedaloRco.sqo;
      for (const [k, v] of Object.entries(requestSqo)) {
        if (k === 'section_tipo') continue;
        if (k === 'limit') {
          // null limit does not overwrite a present value.
          sqo[k] = v ?? sqo[k] ?? null;
        } else {
          sqo[k] = v;
        }
      }
    }
  }

  // sqo_session: the raw request sqo, appended (after legacy_model). PHP stores a
  // clone of rqo->sqo in session; we surface the same object.
  sectionDdo.sqo_session = requestSqo;
}

/**
 * Build the `path` (get_order_path → search::get_query_path) for a direct
 * SECTION-child column. input_text/text_area/email/number are NOT relation
 * components, so the path is a single step. `name` uses DEDALO_DATA_LANG
 * (get_query_path passes DEDALO_DATA_LANG to get_term_by_tipo); `model` is the
 * column's OWN model (get_model_by_tipo), not hardcoded.
 */
async function buildSimpleOrderPath(
  ontology: OntologyRepository,
  tipo: string,
  sectionTipo: string,
  dataLang: string,
  model: string,
): Promise<OrderPathStep[]> {
  if (tipo === NOTES_TEXT_TIPO) return []; // sortable===false → no path
  const term = (await ontology.getLabel(tipo, dataLang)) ?? '';
  return [
    {
      name: stripTags(term),
      model,
      section_tipo: sectionTipo,
      component_tipo: tipo,
    },
  ];
}

/** context_key (common::context_key): tipo + (json if array) section_tipo + mode. */
function contextKey(item: unknown): string {
  const o = (item ?? {}) as Record<string, unknown>;
  const st = o.section_tipo;
  const stKey = Array.isArray(st) ? JSON.stringify(st) : String(st ?? '');
  return `${String(o.tipo ?? '')}_${stKey}_${String(o.mode ?? '')}`;
}

/**
 * Assemble the build_json_rows `{context, data}` for the ported section-list case.
 *
 * Caller must have already proven (canHandleRequest) that the section is LIST
 * mode, its request_config columns are all ported element models, and it is not
 * V6 / tool_config / button-tools. The rows come EITHER from an explicit
 * sqo.filter_by_locators set OR — for a real list view — from `recordSearch`
 * (the paginated section_id-ASC page). This function does NOT re-gate; it
 * assembles to byte parity.
 */
export async function buildJsonRows(
  source: BuildJsonRowsSource,
  opts: BuildJsonRowsOptions,
): Promise<BuildJsonRowsResult> {
  const { ontology, langConfig, contextConfig } = opts;
  const callerTipo = source.tipo;
  const sectionTipo = source.section_tipo ?? source.tipo;
  const mode = source.mode ?? 'list';
  const requestLang = source.lang ?? langConfig.dataLang;
  const offset = opts.offset ?? 0;

  const context: unknown[] = [];
  const data: unknown[] = [];
  const seenContext = new Map<string, true>();

  const matrixTable = (await resolveMatrixTable(ontology, sectionTipo)) ?? 'matrix';
  const matrix = opts.element.matrix;

  // Resolve the rows to render. Two mutually exclusive paths, mirroring the live
  // read flow:
  //   - EXPLICIT locators (sqo.filter_by_locators present): render that set in
  //     request order. A locator pointing at a non-existent record is skipped
  //     exactly as the underlying search would skip it (one cheap matrix probe per
  //     locator; the differ-gated explicit case is small).
  //   - SEARCH page (no explicit locators): the real LIST view — searchRecords
  //     returns the section's paginated, section_id-ASC page; those rows are
  //     already EXISTING (the search only returns rows that are in the matrix), so
  //     no per-row existence probe is needed (and the page may be large).
  const presentLocators: ReadLocator[] = [];
  if (opts.locators !== undefined && opts.locators.length > 0) {
    for (const loc of opts.locators) {
      const row = await matrix.getRow(matrixTable, loc.section_tipo, loc.section_id);
      if (row !== null) presentLocators.push(loc);
    }
  } else if (opts.recordSearch !== undefined && opts.searchSqo !== undefined) {
    const page = await opts.recordSearch(opts.searchSqo, opts.searchFilter);
    for (const loc of page) presentLocators.push(loc);
  }

  // Empty result: sections_json emits ONLY the per-section_tipo context (no data
  // marker, no rows). For the no-record case the section context is still served.
  if (presentLocators.length === 0) {
    const sectionCtx = await buildSectionElementContext(
      { tipo: callerTipo, section_tipo: sectionTipo, model: 'section', mode },
      {
        ontology,
        toolsQueryer: opts.section.toolsQueryer,
        contextConfig,
        dataLang: langConfig.dataLang,
        structureLang: opts.section.structureLang,
        ...(opts.section.toolProperties ? { toolProperties: opts.section.toolProperties } : {}),
      },
    );
    if (sectionCtx.result !== false) {
      for (const c of sectionCtx.result) {
        applySectionSqoState(c as Record<string, unknown>, opts.requestSqo);
        const k = contextKey(c);
        if (seenContext.has(k)) continue;
        seenContext.set(k, true);
        context.push(c);
      }
    }
    return { context, data };
  }

  // ── sections MARKER (sections_json $item) ── one per request, accumulating
  // entries for every row. tipo = caller_tipo; section_tipo = [] (resolved per
  // entry); each entry carries the row locator + paginated_key.
  const marker: SectionsMarker = {
    typo: 'sections',
    tipo: callerTipo,
    section_tipo: [],
    entries: [],
  };
  data.push(marker);

  // ── section structure-context (section_json: $context[] = section ctx) ──
  // Built once; it carries the request_config whose ddo_map the walk iterates.
  const sectionCtxResp = await buildSectionElementContext(
    { tipo: callerTipo, section_tipo: sectionTipo, model: 'section', mode },
    {
      ontology,
      toolsQueryer: opts.section.toolsQueryer,
      contextConfig,
      dataLang: langConfig.dataLang,
      structureLang: opts.section.structureLang,
      ...(opts.section.toolProperties ? { toolProperties: opts.section.toolProperties } : {}),
    },
  );
  const sectionDdo =
    sectionCtxResp.result === false ? null : (sectionCtxResp.result[0] as Record<string, unknown>);
  if (sectionDdo !== null) {
    applySectionSqoState(sectionDdo, opts.requestSqo);
    const k = contextKey(sectionDdo);
    seenContext.set(k, true);
    context.push(sectionDdo);
  }

  // request_config → full_ddo_map (the columns to render). For the V5 list path
  // each request_config_object.show.ddo_map entry is a direct section child.
  const requestConfig =
    sectionDdo && Array.isArray((sectionDdo as { request_config?: unknown }).request_config)
      ? ((sectionDdo as { request_config: unknown[] }).request_config as Record<string, unknown>[])
      : [];
  const fullDdoMap: Record<string, unknown>[] = [];
  const seenDdo = new Set<string>();
  for (const rco of requestConfig) {
    const show = (rco as { show?: { ddo_map?: unknown } }).show;
    const ddoMap = Array.isArray(show?.ddo_map) ? (show!.ddo_map as Record<string, unknown>[]) : [];
    for (const ddo of ddoMap) {
      // dedupe by composite key (tipo_parent_section_tipo), like get_subdatum.
      const key = `${String(ddo.tipo)}_${String(ddo.parent ?? '')}_${JSON.stringify(ddo.section_tipo)}`;
      if (seenDdo.has(key)) continue;
      seenDdo.add(key);
      fullDdoMap.push(ddo);
    }
  }

  const elementOpts: BuildInputTextElementOptions = {
    matrix: opts.element.matrix,
    ontology,
    langConfig,
    matrixTable,
    context: opts.element.context,
  };

  // ── get_subdatum walk: per locator (row) × per ddo (column) ──
  let key = 0;
  for (const locator of presentLocators) {
    // sections marker entry for this row.
    marker.entries.push({
      section_tipo: locator.section_tipo,
      section_id: locator.section_id,
      paginated_key: key + offset,
    });
    key++;

    for (const ddo of fullDdoMap) {
      // Only direct children of the caller are resolved here; deeper ddos are
      // resolved by their parent in the recursive walk (not reached for a flat
      // input_text section). PHP: skip when ddo.parent !== $this->tipo.
      if (ddo.parent !== undefined && ddo.parent !== callerTipo) continue;
      // section_tipo compat: the ddo must target the locator's section_tipo.
      const ddoSectionTipo = ddo.section_tipo;
      const compatible = Array.isArray(ddoSectionTipo)
        ? ddoSectionTipo.includes(locator.section_tipo)
        : ddoSectionTipo === locator.section_tipo;
      if (!compatible) continue;

      const colTipo = String(ddo.tipo);
      const colMode = typeof ddo.mode === 'string' ? ddo.mode : mode;
      const colModel =
        typeof ddo.model === 'string'
          ? ddo.model
          : ((await ontology.getModelByTipo(colTipo)) ?? '');

      // ── GROUPER (section_group / section_group_div / section_tab / tab) ──
      // CONTEXT-only element (no data, no path). Deduped per column like any other.
      if (GROUPER_MODELS.has(colModel)) {
        const grouper = await buildGrouperElement(
          {
            tipo: colTipo,
            section_tipo: locator.section_tipo,
            section_id: locator.section_id,
            model: colModel,
            mode: colMode,
            lang: langConfig.dataLang,
          },
          {
            ontology,
            dataLang: langConfig.dataLang,
            context: {
              toolsQueryer: opts.section.toolsQueryer,
              contextConfig,
              ...(opts.section.toolProperties ? { toolProperties: opts.section.toolProperties } : {}),
            },
          },
        );
        for (const ctxItem of grouper.context) {
          const ddoCtx = ctxItem as Record<string, unknown>;
          const k = contextKey(ddoCtx);
          if (seenContext.has(k)) continue;
          seenContext.set(k, true);
          context.push(ddoCtx);
        }
        // groupers emit NO data item.
        continue;
      }

      // ── component_section_id ── its own context (color + path.column) + data
      // (entries:[<id>]), then the section-stamp (row_section_id, parent_tipo). The
      // path/color are baked by the builder, so withOrderPath is NOT applied.
      if (colModel === 'component_section_id') {
        const sidElement = await buildSectionIdElement(
          {
            tipo: colTipo,
            section_tipo: locator.section_tipo,
            section_id: locator.section_id,
            model: 'component_section_id',
            mode: colMode,
            lang: langConfig.dataLang,
          },
          {
            ontology,
            dataLang: langConfig.dataLang,
            context: {
              toolsQueryer: opts.section.toolsQueryer,
              contextConfig,
              ...(opts.section.toolProperties ? { toolProperties: opts.section.toolProperties } : {}),
            },
          },
        );
        for (const ctxItem of sidElement.context) {
          const ddoCtx = ctxItem as Record<string, unknown>;
          const k = contextKey(ddoCtx);
          if (seenContext.has(k)) continue;
          seenContext.set(k, true);
          context.push(ddoCtx);
        }
        for (const item of sidElement.data) {
          const stamped: Record<string, unknown> = { ...(item as Record<string, unknown>) };
          stamped.row_section_id = locator.section_id; // set first (PHP order)
          stamped.parent_tipo = callerTipo; // set second
          data.push(stamped);
        }
        continue;
      }

      // ── component_filter (EDIT mode) ── its own context (target_sections + the
      // order path) + data (entries:[locators] + datalist), then the section-stamp
      // (row_section_id, parent_tipo). The path/target_sections are baked by the
      // builder, so withOrderPath is NOT applied. Needs the projects datalist search.
      if (colModel === 'component_filter') {
        const filterElement = await buildFilterElement(
          {
            tipo: colTipo,
            section_tipo: locator.section_tipo,
            section_id: locator.section_id,
            mode: colMode,
            lang: requestLang,
          },
          {
            matrix: opts.element.matrix,
            ontology,
            langConfig,
            matrixTable,
            context: opts.element.context,
            ...(opts.projectsSearch !== undefined ? { projectsSearch: opts.projectsSearch } : {}),
          },
        );
        for (const ctxItem of filterElement.context) {
          const ddoCtx = ctxItem as Record<string, unknown>;
          const k = contextKey(ddoCtx);
          if (seenContext.has(k)) continue;
          seenContext.set(k, true);
          context.push(ddoCtx);
        }
        for (const item of filterElement.data) {
          const stamped: Record<string, unknown> = { ...(item as unknown as Record<string, unknown>) };
          stamped.row_section_id = locator.section_id; // set first (PHP order)
          stamped.parent_tipo = callerTipo; // set second
          data.push(stamped);
        }
        continue;
      }

      // ── component_select (EDIT mode) ── its own context (the relation
      // request_config block: target_sections + request_config + columns_map + the
      // recursive path, built by buildRelationSelectComponentContext) + data
      // (entries = raw stored locators + datalist = get_list_of_values), then the
      // section-stamp (row_section_id, parent_tipo). The context is complete (path
      // baked in), so withOrderPath is NOT applied. Needs the target-section datalist
      // search. LIST mode still flows through the relation/select context + get_value
      // DATA path below (buildDataElement). Byte-green for the single-label-V5 select.
      if (colModel === 'component_select' && colMode === 'edit') {
        const selectElement = await buildSelectElement(
          {
            tipo: colTipo,
            section_tipo: locator.section_tipo,
            section_id: locator.section_id,
            mode: colMode,
            lang: requestLang,
          },
          {
            matrix: opts.element.matrix,
            ontology,
            langConfig,
            matrixTable,
            context: opts.element.context,
            structureLang: opts.section.structureLang,
            ...(opts.datalistRecordSearch !== undefined
              ? { datalistRecordSearch: opts.datalistRecordSearch }
              : {}),
          },
        );
        for (const ctxItem of selectElement.context) {
          const ddoCtx = ctxItem as Record<string, unknown>;
          const k = contextKey(ddoCtx);
          if (seenContext.has(k)) continue;
          seenContext.set(k, true);
          context.push(ddoCtx);
        }
        for (const item of selectElement.data) {
          const stamped: Record<string, unknown> = { ...(item as unknown as Record<string, unknown>) };
          stamped.row_section_id = locator.section_id; // set first (PHP order)
          stamped.parent_tipo = callerTipo; // set second
          data.push(stamped);
        }
        continue;
      }

      // Build the column's {context,data} element for this column × row, dispatching
      // on the column model. Section caller: from_component_tipo is NOT overwritten
      // (stays own tipo); parent_tipo IS overwritten with the section (caller) tipo.
      const element =
        colModel === 'component_input_text'
          ? await buildInputTextElement(
              {
                tipo: colTipo,
                section_tipo: locator.section_tipo,
                section_id: locator.section_id,
                model: 'component_input_text',
                lang: requestLang,
                mode: colMode,
                caller_tipo: callerTipo,
              },
              elementOpts,
            )
          : await buildDataElement(
              {
                tipo: colTipo,
                section_tipo: locator.section_tipo,
                section_id: locator.section_id,
                model: colModel as DataElementModel,
                lang: requestLang,
                mode: colMode,
                caller_tipo: callerTipo,
              },
              elementOpts,
            );

      // CONTEXT: deduped per column. RELATION/SELECT columns get the dedicated
      // add_rqo=true context (target_sections / request_config / columns_map +
      // recursive path) built by buildRelationSelectComponentContext — the shape
      // get_subdatum injects via the child's build_request_config. SCALAR columns
      // keep the plain component context + the single-step add_rqo `path`
      // (withOrderPath) — UNCHANGED, so they never regress.
      const isRelationSelect = RELATION_SELECT_COLUMN_MODELS.has(colModel);
      if (isRelationSelect) {
        const relCtx = await buildRelationSelectComponentContext(
          { tipo: colTipo, section_tipo: locator.section_tipo, model: colModel, lang: requestLang, mode: colMode },
          {
            ontology,
            toolsQueryer: opts.section.toolsQueryer,
            contextConfig,
            dataLang: langConfig.dataLang,
            structureLang: opts.section.structureLang,
            ...(opts.section.toolProperties ? { toolProperties: opts.section.toolProperties } : {}),
          },
        );
        if (relCtx.result !== false) {
          for (const ctxItem of relCtx.result) {
            const ddoCtx = ctxItem as Record<string, unknown>;
            const k = contextKey(ddoCtx);
            if (seenContext.has(k)) continue;
            seenContext.set(k, true);
            context.push(ddoCtx);
          }
        }
      } else {
        for (const ctxItem of element.context) {
          const ddoCtx = ctxItem as Record<string, unknown>;
          const k = contextKey(ddoCtx);
          if (seenContext.has(k)) continue;
          seenContext.set(k, true);
          // add_rqo=true component context carries `path` (get_order_path). The
          // standalone element-context builder omits it; add it here in the
          // dd_object property-declaration position (after legacy_model).
          const withPath = await withOrderPath(ddoCtx, ontology, langConfig.dataLang);
          context.push(withPath);
        }
      }

      // DATA: stamp each item then append, mirroring get_subdatum's per-item
      // assignment ORDER (row_section_id set FIRST, parent_tipo SECOND). PHP object
      // property assignment keeps an existing key in place and appends a new one:
      //   - scalar columns (input_text/number/email/text_area) carry parent_tipo
      //     already → row_section_id is appended LAST (after fallback_value/
      //     parent_section_id), parent_tipo stays in its slot.
      //   - relation/select columns are base-7 only (no parent_tipo yet) →
      //     row_section_id then parent_tipo are BOTH appended, in that order.
      for (const item of element.data) {
        const stamped: Record<string, unknown> = { ...item };
        stamped.row_section_id = locator.section_id; // set first (PHP order)
        stamped.parent_tipo = callerTipo; // set second
        data.push(stamped);
      }
    }
  }

  return { context, data };
}

/**
 * Insert the `path` field into a component context DDO at the dd_object
 * declaration position (immediately after `legacy_model`, before any trailing
 * keys). The standalone component-context builder emits keys in declaration
 * order ending …, sortable, legacy_model; the add_rqo path slots right after.
 */
export async function withOrderPath(
  ddo: Record<string, unknown>,
  ontology: OntologyRepository,
  dataLang: string,
): Promise<Record<string, unknown>> {
  // Only component DDOs that are sortable carry a path.
  if (ddo.type !== 'component') return ddo;
  const tipo = String(ddo.tipo);
  const sectionTipo = String(ddo.section_tipo);
  const sortable = ddo.sortable === true;
  if (!sortable) return ddo;
  // The path step's model is the column's own model (search::get_query_path).
  const model =
    typeof ddo.model === 'string' ? ddo.model : ((await ontology.getModelByTipo(tipo)) ?? '');
  const path = await buildSimpleOrderPath(ontology, tipo, sectionTipo, dataLang, model);
  // The standalone component-context builder already emits `path` (as []) at the
  // dd_object declaration position (after legacy_model). Overwrite it IN PLACE so
  // key order is preserved; if it were absent, append it after legacy_model.
  if ('path' in ddo) {
    const out: Record<string, unknown> = {};
    for (const [kk, vv] of Object.entries(ddo)) {
      out[kk] = kk === 'path' ? path : vv;
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [kk, vv] of Object.entries(ddo)) {
    out[kk] = vv;
    if (kk === 'legacy_model') out.path = path;
  }
  if (!('path' in out)) out.path = path;
  return out;
}
