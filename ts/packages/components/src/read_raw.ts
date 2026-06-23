/**
 * Port of the dd_core_api `read_raw` action — a RAW record read driven by a search.
 *
 * PHP path (class.dd_core_api.php::read_raw):
 *   1. validate options.section_tipo (mandatory) + options.tipo (mandatory).
 *   2. permission gate: section::get_section_permissions per sqo.section_tipo AND
 *      common::get_permissions(section_tipo) — both must be >= 1 (read). root is
 *      >= 1 everywhere, so the native path assumes the logged user has access
 *      (same DEFERRED-permissions stance as count/list — see count_response.ts).
 *   3. when sqo is non-empty: run search::get_instance($sqo)->search() (the SAME
 *      base records search the list path uses — section_id ASC, project-security
 *      filtered, LIMIT/OFFSET), then per `type`:
 *        - 'section'   : result = db_result->fetch_all() — the FULL raw matrix rows
 *          with the DEFAULT projection (section_id, section_tipo, data, relation,
 *          string, date, iri, geo, number, media, misc, meta), section_id as a
 *          STRING, JSONB columns decoded, null columns present as null.
 *        - 'component' : result = [ section_record->{column}->{tipo} ] per matched
 *          record — the raw stored data-column slice for the component tipo (the
 *          column resolved from the model via section_record_data::$column_map),
 *          or null when the record has no data for that tipo.
 *        - 'target_section' : scans every relation column for locators whose
 *          section_tipo === tipo. NOT ported here (declined → proxy).
 *   4. response (key order result, msg, errors, table):
 *        { result:<raw_data>, msg:'OK. Request done', errors:[],
 *          table:<matrix table for section_tipo> }
 *      An empty sqo → result:[] (the search is skipped) + table set.
 *
 * SCOPE — what is byte-reproducible here (the caller gates this; everything else
 * proxies):
 *   - type 'section' OR 'component' (the model→column resolvable for component),
 *   - the search must be the NO-FILTER section_tipo list (reused via searchRecords:
 *     ordered, paginated, project-security filtered) OR a fully-ported conformed
 *     filter. A custom order / filter_by_locators / un-ported filter declines.
 *   - the empty-sqo case (result:[]).
 * DECLINED → proxy: type 'target_section' (relation scan), an un-resolvable model.
 */

import type { OntologyRepository } from '@dedalo/ontology';
import type { MatrixDbManager } from '@dedalo/db';
import type { ConformedFilter } from '@dedalo/search';
import { resolveMatrixTable } from './matrix_table.ts';

/** model → matrix family column (section_record_data::$column_map). */
const COLUMN_MAP: Readonly<Record<string, string>> = {
  component_3d: 'media',
  component_av: 'media',
  component_check_box: 'relation',
  component_autocomplete_hi: 'relation',
  component_dataframe: 'relation',
  component_date: 'date',
  component_email: 'string',
  component_external: 'relation',
  component_filter: 'relation',
  component_filter_master: 'relation',
  component_filter_records: 'misc',
  component_geolocation: 'geo',
  component_image: 'media',
  component_info: 'misc',
  component_input_text: 'string',
  component_inverse: 'misc',
  component_iri: 'iri',
  component_json: 'misc',
  component_number: 'number',
  component_password: 'string',
  component_pdf: 'media',
  component_portal: 'relation',
  component_publication: 'relation',
  component_radio_button: 'relation',
  component_relation_children: 'relation',
  component_relation_index: 'relation',
  component_relation_model: 'relation',
  component_relation_parent: 'relation',
  component_relation_related: 'relation',
  component_section_id: 'section_id',
  component_security_access: 'misc',
  component_select: 'relation',
  component_select_lang: 'relation',
  component_svg: 'media',
  component_text_area: 'string',
  section: 'data',
};

/**
 * The DEFAULT search projection (trait.select.php build_sql_query_select fallback):
 * section_id + section_tipo + the ten JSONB columns, IN THIS ORDER. read_raw's
 * 'section' result rows carry exactly these keys (section_id as a STRING; absent
 * columns present as null). relation_search / id / lang / properties etc. are NOT
 * in the default projection.
 */
const SECTION_ROW_KEYS: ReadonlyArray<string> = [
  'data',
  'relation',
  'string',
  'date',
  'iri',
  'geo',
  'number',
  'media',
  'misc',
  'meta',
];

/** read_raw RQO `options` block. */
export interface ReadRawOptions {
  section_tipo?: unknown;
  tipo?: unknown;
  model?: unknown;
  type?: unknown;
}

/** read_raw RQO `sqo` (the subset the base records search consumes). */
export interface ReadRawSqo {
  section_tipo?: unknown;
  limit?: unknown;
  offset?: unknown;
  filter?: unknown;
  order?: unknown;
  filter_by_locators?: unknown;
  [k: string]: unknown;
}

export interface ReadRawRequest {
  options?: ReadRawOptions;
  sqo?: ReadRawSqo | null;
}

/** One ordered record locator from the base list search. */
export interface ReadRawLocator {
  section_tipo: string;
  section_id: number;
}

export interface ReadRawOptionsDeps {
  ontology: OntologyRepository;
  matrix: MatrixDbManager;
  /**
   * Run the base list search for the sqo's section_tipo set and return ordered,
   * paginated locators (section_id ASC, project-security filtered, LIMIT/OFFSET).
   * Mirrors search::get_instance($sqo)->search() for the no-filter / conformed-filter
   * case. Injected by the handler (wraps searchRecords).
   */
  recordSearch: (
    sqo: { section_tipo: string[]; limit?: number | string; offset?: number },
    filter?: ConformedFilter,
  ) => Promise<ReadRawLocator[]>;
}

export interface ReadRawResult {
  result: unknown;
  msg: string;
  errors: string[];
  table?: string;
}

/** Thrown for an input the read_raw path declines (the caller proxies to PHP). */
export class UnsupportedReadRaw extends Error {}

/**
 * Resolve the matrix family column for a component model (section_record_data::
 * get_column_name). Returns null when the model is unknown.
 */
function columnForModel(model: string): string | null {
  return COLUMN_MAP[model] ?? null;
}

/**
 * Execute the read_raw action. Reproduces the {result, msg, errors, table}
 * envelope (in that key order) for the 'section' and 'component' types over a
 * no-filter / conformed-filter list search. The empty-sqo case returns result:[].
 *
 * @throws UnsupportedReadRaw when the input hits a declined case (target_section,
 *   un-resolvable model, an un-ported search shape detected here). The caller
 *   proxies to PHP.
 */
export async function readRaw(
  req: ReadRawRequest,
  deps: ReadRawOptionsDeps,
  conformedFilter?: ConformedFilter,
): Promise<ReadRawResult> {
  const options = req.options ?? {};
  const sectionTipo = typeof options.section_tipo === 'string' ? options.section_tipo : '';

  // options.section_tipo is mandatory (PHP returns an error envelope, not a proxy).
  if (sectionTipo === '') {
    return {
      result: false,
      msg: "API Error: (read_raw) Empty options 'section_tipo' (is mandatory)",
      errors: ['empty options section_tipo'],
    };
  }

  const tipo = typeof options.tipo === 'string' ? options.tipo : '';
  // options.tipo is mandatory; PHP appends the message + returns the error envelope.
  if (tipo === '') {
    return {
      result: false,
      msg: "Error. Request failed [read_raw] Empty options 'tipo' (is mandatory)",
      errors: ['empty options tipo'],
    };
  }

  const type = typeof options.type === 'string' ? options.type : null;
  const model =
    typeof options.model === 'string'
      ? options.model
      : await deps.ontology.getModelByTipo(tipo);

  const table = (await resolveMatrixTable(deps.ontology, sectionTipo)) ?? 'matrix';

  const sqo = req.sqo ?? null;

  // EMPTY sqo → the search is skipped, result is [] (PHP's `if (!empty($sqo))`).
  const sqoEmpty =
    sqo === null ||
    (typeof sqo === 'object' && Object.keys(sqo as Record<string, unknown>).length === 0);
  if (sqoEmpty) {
    return { result: [], msg: 'OK. Request done', errors: [], table };
  }

  // The search shape we reproduce: a section_tipo list + limit/offset (the base list
  // search). A custom order / filter_by_locators / an un-conformed filter is NOT
  // ported here → decline (proxy). When a `filter` is present it MUST have conformed
  // (the caller passes conformedFilter only when it did).
  const sqoObj = sqo as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(sqoObj, 'filter_by_locators')) {
    throw new UnsupportedReadRaw('filter_by_locators search not ported');
  }
  if (Object.prototype.hasOwnProperty.call(sqoObj, 'order')) {
    throw new UnsupportedReadRaw('custom order not ported');
  }
  if (
    Object.prototype.hasOwnProperty.call(sqoObj, 'filter') &&
    conformedFilter === undefined
  ) {
    throw new UnsupportedReadRaw('un-ported / non-conforming filter');
  }

  const stArr = Array.isArray(sqoObj.section_tipo)
    ? (sqoObj.section_tipo as unknown[]).filter((s): s is string => typeof s === 'string')
    : [sectionTipo];
  if (stArr.length === 0) {
    throw new UnsupportedReadRaw('empty sqo.section_tipo');
  }

  const rawLimit = sqoObj.limit;
  const limit =
    typeof rawLimit === 'number' || typeof rawLimit === 'string'
      ? (rawLimit as number | string)
      : undefined;
  const rawOffset = sqoObj.offset;
  const offset =
    typeof rawOffset === 'number'
      ? rawOffset
      : typeof rawOffset === 'string'
        ? Number.parseInt(rawOffset, 10)
        : 0;

  const searchSqo: { section_tipo: string[]; limit?: number | string; offset?: number } = {
    section_tipo: stArr,
    ...(limit !== undefined ? { limit } : {}),
    ...(Number.isInteger(offset) && offset > 0 ? { offset } : {}),
  };
  const locators = await deps.recordSearch(searchSqo, conformedFilter);

  let rawData: unknown[] = [];

  switch (type) {
    case 'component': {
      if (model === null) {
        throw new UnsupportedReadRaw('cannot resolve model for component read_raw');
      }
      const column = columnForModel(model);
      if (column === null) {
        // PHP returns an explicit error envelope here (not a proxy).
        return {
          result: false,
          msg: `API Error: (read_raw) Cannot resolve data column from model ${model}`,
          errors: [`cannot resolve data column from model ${model}`],
        };
      }
      // section_id / data / meta etc. are valid matrix families; resolve each record's
      // column-slice for the tipo (== $section_record->$column->$tipo). null when absent.
      for (const loc of locators) {
        const locTable = (await resolveMatrixTable(deps.ontology, loc.section_tipo)) ?? table;
        const slice = await fetchColumnSlice(
          deps.matrix,
          locTable,
          loc.section_tipo,
          loc.section_id,
          column,
          tipo,
        );
        rawData.push(slice);
      }
      break;
    }
    case 'section': {
      for (const loc of locators) {
        const locTable = (await resolveMatrixTable(deps.ontology, loc.section_tipo)) ?? table;
        const row = await deps.matrix.getRow(locTable, loc.section_tipo, loc.section_id);
        rawData.push(buildSectionRow(loc, row));
      }
      break;
    }
    case 'target_section':
      // Relation-column scan for locators pointing at `tipo`. Not ported → proxy.
      throw new UnsupportedReadRaw('target_section relation scan not ported');
    default:
      // PHP's switch falls through (no case): raw_data stays []. An absent/other type
      // simply yields result:[] (no decline — the empty-result branch is reproducible).
      rawData = [];
      break;
  }

  return { result: rawData, msg: 'OK. Request done', errors: [], table };
}

/**
 * Build a 'section'-type raw row: section_id as a STRING, section_tipo, then the ten
 * default-projection JSONB columns in order (null when absent). Mirrors
 * db_result->fetch_all() over the default select projection. A missing row (deleted
 * mid-flight) yields the locator keys with all-null columns (PHP would not return it
 * at all, but the search only returns existing rows, so row is non-null in practice).
 */
function buildSectionRow(
  loc: ReadRawLocator,
  row: Record<string, unknown> | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    section_id: String(loc.section_id),
    section_tipo: loc.section_tipo,
  };
  for (const key of SECTION_ROW_KEYS) {
    out[key] = row && row[key] !== undefined ? row[key] : null;
  }
  return out;
}

/**
 * Fetch one record's raw column-slice for a tipo (== $section_record->$column->$tipo).
 * For the JSONB family columns (string/relation/date/number/iri/geo/media/misc) the
 * slice is the items array (or null when absent). section_id / data are direct-object
 * columns whose tipo-keyed sub-value is read the same way. Returns null when the record
 * or the tipo key is absent.
 */
async function fetchColumnSlice(
  matrix: MatrixDbManager,
  table: string,
  sectionTipo: string,
  sectionId: number,
  column: string,
  tipo: string,
): Promise<unknown> {
  const row = await matrix.getRow(table, sectionTipo, sectionId);
  if (row === null) return null;
  const col = row[column];
  if (col === null || col === undefined || typeof col !== 'object') return null;
  const value = (col as Record<string, unknown>)[tipo];
  return value === undefined ? null : value;
}
