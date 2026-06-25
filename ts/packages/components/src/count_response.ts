import {
  countRecords,
  conformFilter,
  FilterValidationError,
  UnsupportedFilterError,
  buildFilterWhere,
  type CountSqo,
  type ConformedFilter,
} from '@dedalo/search';
import type { Filter } from '@dedalo/contract';
import type { ComponentInit } from './component_common.ts';
import { resolveMatrixTable } from './matrix_table.ts';

/**
 * Native dd_core_api `count` action — the record-count behind list pagination.
 *
 * Port of core/api/v1/common/class.dd_core_api.php::count, now covering BOTH:
 *   - the NO-FILTER / section_tipo case (COUNT(DISTINCT section_id) over the
 *     section's resolved matrix table(s) filtered by section_tipo), AND
 *   - the FILTERED case for the SUPPORTED Mango-filter shapes (the conform_filter
 *     security gate + the string equals/contains and number equals WHERE builders
 *     + $and/$or/$not assembly injected into the inner SELECT DISTINCT). The filter
 *     WHERE merges into the inner SELECT as `WHERE (section_pred)\n AND <filter>`,
 *     exactly as PHP parse_sql_full_count assembles main_where + filter.
 *
 * Returns {result:{total:N}, msg, errors}; the router decorates with action +
 * csrf_token. The differ drops `debug`, so the contract surface is
 * {result:{total:N}, msg, errors, action, csrf_token}.
 *
 * SECURITY: the filter goes through conformFilter (the injection chokepoint) BEFORE
 * any SQL is built — it validates every path step (component_tipo / section_tipo /
 * lang) against allowlists and fails closed (throws) on anything invalid. A request
 * whose filter is invalid OR uses an un-ported operator/family is DECLINED by
 * canHandleRequest (→ proxied to PHP), so this resolver only ever serves a
 * fully-validated, fully-supported filter (see read_handler.ts / analyzeCountFilter).
 *
 * PERMISSIONS: PHP runs common::get_permissions(st,st) per section_tipo and, if any
 * is <1, returns {total:0}. For the root user every section is ≥1, so this passes.
 * Non-root permission-zero handling is DEFERRED until the permissions layer is
 * ported (the reason canHandleRequest gates count strictly).
 */

/** The sqo shape the count reads (a strict subset of the PHP SQO). */
export interface CountSource {
  /** Sections to count. PHP: sqo.section_tipo (array). */
  section_tipo: string[];
  /** Optional Mango filter (the FILTERED count path). */
  filter?: Filter;
  [k: string]: unknown;
}

export interface ResolveCountOptions {
  /** OntologyRepository (satisfies resolveMatrixTable's OntologyForMatrixTable). */
  ontology: ComponentInit['ontology'];
  /** Parameterised SQL queryer (a Db). */
  searchQueryer: NonNullable<ComponentInit['searchQueryer']>;
  /** Lang config — supplies the default data lang for filter clauses without one. */
  langConfig: ComponentInit['langConfig'];
}

/** The pre-decoration count envelope (PHP dd_core_api::count response, sans router). */
export interface CountResult {
  result: { total: number } | 0;
  msg: string;
  errors: string[];
}

/**
 * Determine whether a count's filter can be served NATIVELY. Conforms the filter
 * (running the security gate) and probes that every leaf builds with the ported
 * operators. Returns the conformed tree when supported, or `null` when the request
 * must be DECLINED → proxied to PHP (invalid filter OR un-ported shape OR empty).
 *
 * NEVER throws: invalid/unsupported filters resolve to `null` so the handler can
 * cleanly decline. PHP will re-validate and throw its own exception envelope for
 * the genuinely-invalid case. This keeps the security boundary fail-closed (a shape
 * we cannot prove safe + supported is never served natively).
 */
export async function analyzeCountFilter(
  filter: Filter,
  opts: { resolveModel: (tipo: string) => Promise<string | null>; dataLang: string },
): Promise<ConformedFilter | null> {
  // conformFilter needs a synchronous model resolver, but ontology lookups are
  // async. Pre-resolve every component_tipo's model up front, then feed a sync
  // closure. Any lookup failure / un-ported shape → decline (null).
  const tipos = collectComponentTipos(filter);
  const modelByTipo = new Map<string, string | null>();
  for (const t of tipos) {
    try {
      modelByTipo.set(t, await opts.resolveModel(t));
    } catch {
      return null;
    }
  }

  let conformed: ConformedFilter;
  try {
    conformed = conformFilter(filter, {
      resolveModel: (tipo) => modelByTipo.get(tipo) ?? null,
      dataLang: opts.dataLang,
    });
  } catch (err) {
    // FilterValidationError (invalid identifier) or any conform failure → decline.
    if (err instanceof FilterValidationError) return null;
    return null;
  }

  if (conformed.items.length === 0) return null;

  // Probe-build the WHERE with a throwaway param list: if any leaf uses an un-ported
  // operator/family, buildFilterWhere throws UnsupportedFilterError → decline.
  try {
    const probe = aliasForProbe(conformed);
    const where = buildFilterWhere(probe, []);
    if (where === '') return null; // all-empty filter → nothing to serve
  } catch (err) {
    if (err instanceof UnsupportedFilterError) return null;
    return null;
  }

  return conformed;
}

/** Stamp a placeholder alias so the probe build can resolve table_alias. */
function aliasForProbe(filter: ConformedFilter): ConformedFilter {
  return {
    op: filter.op,
    items: filter.items.map((item) =>
      'op' in item
        ? aliasForProbe(item)
        : { ...item, clause: { ...item.clause, table_alias: 'mix' } },
    ),
  };
}

/** Gather every leaf clause's last-step component_tipo from a filter tree. */
function collectComponentTipos(filter: Filter): string[] {
  const out = new Set<string>();
  function walk(node: unknown): void {
    if (node === null || typeof node !== 'object') return;
    if (Object.prototype.hasOwnProperty.call(node, 'path')) {
      const path = (node as { path?: unknown }).path;
      if (Array.isArray(path) && path.length > 0) {
        const last = path[path.length - 1] as { component_tipo?: unknown } | undefined;
        if (last && typeof last.component_tipo === 'string') out.add(last.component_tipo);
      }
      return;
    }
    for (const k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      const v = (node as Record<string, unknown>)[k];
      if (Array.isArray(v)) for (const it of v) walk(it);
    }
  }
  walk(filter);
  return [...out];
}

/**
 * Resolve a count request (filtered or not) to its {result:{total:N}, msg, errors}.
 *
 * Mirrors PHP's empty-section_tipo early return (result = 0) and the success
 * envelope. When `conformedFilter` is provided (the caller already validated +
 * confirmed support via analyzeCountFilter), the filter WHERE is injected into the
 * inner SELECT DISTINCT.
 */
export async function resolveCount(
  sqo: CountSource,
  opts: ResolveCountOptions & { conformedFilter?: ConformedFilter },
): Promise<CountResult> {
  const sectionTipos = Array.isArray(sqo.section_tipo) ? sqo.section_tipo : [];

  // PHP: empty section_tipo → response.result = 0 (no msg/errors change → stays
  // 'Error. Request failed'). Reproduced exactly.
  if (sectionTipos.length === 0) {
    return { result: 0, msg: 'Error. Request failed', errors: [] };
  }

  const countSqo: CountSqo = { section_tipo: sectionTipos, full_count: true };
  const countDeps = {
    queryer: opts.searchQueryer,
    resolveTable: (st: string) => resolveMatrixTable(opts.ontology, st),
  };
  const total = await countRecords(
    countSqo,
    opts.conformedFilter ? { ...countDeps, filter: opts.conformedFilter } : countDeps,
  );

  return {
    result: { total },
    msg: 'OK. Request done successfully',
    errors: [],
  };
}
