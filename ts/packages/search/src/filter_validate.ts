/**
 * conformFilter — the SECURITY chokepoint for the Mango SQO `filter`.
 *
 * Verbatim port of the PHP injection gate that guards EVERY per-component search
 * builder at one point (core/search/class.search.php::conform_filter, lines
 * 809-936, with the validators from core/search/trait.utils.php):
 *
 *   - is_valid_tipo        /^[a-z]+[0-9]+$/
 *   - is_valid_lang        /^(lg-[a-z0-9_]+|all)$/
 *   - is_valid_data_column strict 17-value allowlist
 *
 * WHY THIS EXISTS (do NOT loosen): the per-component WHERE builders string-
 * interpolate `component_tipo` as a JSONB key / jsonpath member step ($.{tipo}[*])
 * and `lang` as a jsonpath string literal (@.lang == "{lang}"). Those values
 * CANNOT be parameterized (a jsonpath member accessor / string literal is not a
 * bindable param), so they MUST be validated against an allowlist BEFORE any SQL
 * is built, and the whole request fails closed on any invalid step.
 *
 * PHP failure modes reproduced EXACTLY:
 *   - non-object filter item            → skipped (continue), NOT thrown
 *   - invalid section_tipo              → throw FilterValidationError (section_tipo)
 *   - invalid component_tipo            → throw FilterValidationError (component_tipo)
 *     (component_tipo passes if EITHER is_valid_tipo OR is_valid_data_column)
 *   - invalid lang                      → throw FilterValidationError (lang)
 *   - empty/unresolvable model          → skipped (continue), NOT thrown
 *
 * The throw messages mirror PHP's Exception strings so the proxy path (which
 * declines anything that would throw and lets PHP emit its own envelope) and the
 * native path agree on the boundary. NEVER build SQL from a rejected filter.
 *
 * This module is pure validation + a conformed-tree producer; it does NOT build
 * SQL (filter_where.ts does). No module-global mutable per-request state.
 */

import type { Filter, FilterClause } from '@dedalo/contract';

/** Port of search::is_valid_tipo (trait.utils.php:180). */
const VALID_TIPO = /^[a-z]+[0-9]+$/;
export function isValidTipo(tipo: string): boolean {
  return VALID_TIPO.test(tipo);
}

/** Port of search::is_valid_lang (trait.utils.php:197). */
const VALID_LANG = /^(lg-[a-z0-9_]+|all)$/;
export function isValidLang(lang: string): boolean {
  return VALID_LANG.test(lang);
}

/**
 * Port of search::is_valid_data_column (trait.utils.php:213) — the strict
 * allowlist of legitimate pseudo-tipo / matrix-column path terminals. A
 * component_tipo path step is accepted if it is EITHER a well-formed tipo
 * (is_valid_tipo) OR one of these fixed identifiers.
 */
const VALID_DATA_COLUMNS: ReadonlySet<string> = new Set([
  // matrix data columns (jsonb)
  'data', 'relation', 'string', 'date', 'iri', 'geo', 'number', 'media', 'misc', 'relation_search', 'meta',
  // structural columns
  'section_id', 'section_tipo',
  // time machine columns (matrix_time_machine)
  'id', 'tipo', 'lang', 'type',
]);
export function isValidDataColumn(column: string): boolean {
  return VALID_DATA_COLUMNS.has(column);
}

/**
 * Thrown (fail-closed) when a filter path step / lang fails the allowlist. Carries
 * the offending `field` so callers can map it to PHP's exact Exception message.
 * The presence of this error MUST abort the request — never build SQL.
 */
export class FilterValidationError extends Error {
  readonly field: 'section_tipo' | 'component_tipo' | 'lang';
  constructor(field: 'section_tipo' | 'component_tipo' | 'lang') {
    super(`Error: invalid ${field} in search ${field === 'lang' ? 'filter' : 'path'}`);
    this.name = 'FilterValidationError';
    this.field = field;
  }
}

/** A filter group object keyed by exactly one logical operator ($and/$or/$not). */
type FilterGroupKey = '$and' | '$or' | '$not' | '$nand' | '$nor';

/** Is this filter item a logical group (has an operator key) rather than a leaf clause? */
function isGroup(item: unknown): item is Filter {
  if (item === null || typeof item !== 'object') return false;
  // A leaf clause carries `path`; a group does not (PHP: !property_exists($o,'path')).
  return !Object.prototype.hasOwnProperty.call(item, 'path');
}

/** First own-enumerable key of a plain object (PHP array_key_first(get_object_vars)). */
function firstKey(obj: object): string | undefined {
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return k;
  }
  return undefined;
}

/**
 * The conformed clause the WHERE builder consumes: the original clause plus the
 * resolved `model` and effective `lang` (the per-step validation having passed).
 * The PHP conform_filter additionally dispatches to the component's
 * get_search_query here; we keep that as a separate pass (filter_where.ts) so the
 * security gate is independently testable, but we DO resolve+attach the model and
 * default the lang exactly as PHP's get_search_context does.
 */
export interface ConformedClause {
  /** The original leaf clause (q / q_operator / path / lang / format …). */
  clause: FilterClause;
  /** Resolved model for the LAST path step (the searched component). */
  model: string;
  /** Effective lang: clause.lang if set, else the instance dataLang default. */
  lang: string;
  /** The searched component_tipo (last path step). Validated. */
  componentTipo: string;
}

/** A conformed filter tree: a logical operator mapping to conformed items. */
export interface ConformedFilter {
  op: FilterGroupKey;
  items: Array<ConformedClause | ConformedFilter>;
}

/** Resolve a component_tipo to its model (port of ontology_node::get_model_by_tipo). */
export type ModelResolver = (componentTipo: string) => string | null;

export interface ConformOptions {
  /**
   * Resolve a path step's model when the clause omits `model`. PHP falls back to
   * ontology_node::get_model_by_tipo; here the caller injects the ontology lookup.
   * May return null/empty → clause skipped (PHP: empty model → continue).
   */
  resolveModel: ModelResolver;
  /** Default lang when a clause omits one (PHP get_search_context: DEDALO_DATA_LANG). */
  dataLang: string;
}

/**
 * conformFilter — validate (fail-closed) the whole filter tree and produce a
 * conformed tree of {clause, model, lang} the WHERE builder can consume.
 *
 * Faithful to PHP conform_filter: takes ONE top-level operator (the first key),
 * recurses into nested groups, validates every path step + lang, resolves the
 * component model (skipping empty-model clauses), and rejects the WHOLE request
 * (throws FilterValidationError) on any invalid identifier.
 *
 * @throws FilterValidationError on any invalid section_tipo / component_tipo / lang.
 */
export function conformFilter(filter: Filter, opts: ConformOptions): ConformedFilter {
  const op = firstKey(filter) as FilterGroupKey | undefined;
  if (op === undefined) {
    return { op: '$and', items: [] };
  }
  const rawItems = (filter as Record<string, unknown>)[op];
  const itemsArray: unknown[] = Array.isArray(rawItems) ? rawItems : [];
  return conformGroup(op, itemsArray, opts);
}

function conformGroup(op: FilterGroupKey, items: unknown[], opts: ConformOptions): ConformedFilter {
  const out: Array<ConformedClause | ConformedFilter> = [];

  for (const item of items) {
    // PHP: non-object item → debug_log + continue (skip, NOT thrown).
    if (item === null || typeof item !== 'object') {
      continue;
    }

    if (isGroup(item)) {
      // Nested logical group: recurse. Append only when it conforms to non-empty.
      const nestedOp = firstKey(item) as FilterGroupKey | undefined;
      if (nestedOp === undefined) continue;
      const nestedRaw = (item as Record<string, unknown>)[nestedOp];
      const nestedItems: unknown[] = Array.isArray(nestedRaw) ? nestedRaw : [];
      const nested = conformGroup(nestedOp, nestedItems, opts);
      if (nested.items.length > 0) {
        out.push(nested);
      }
      continue;
    }

    const clause = item as FilterClause;
    const path = Array.isArray(clause.path) ? clause.path : [];

    // ── SECURITY CHOKEPOINT ── validate every path step BEFORE any model dispatch.
    for (const step of path) {
      const stepSectionTipo = step?.section_tipo;
      const stepComponentTipo = step?.component_tipo;

      if (stepSectionTipo !== undefined && stepSectionTipo !== null) {
        if (!isValidTipo(String(stepSectionTipo))) {
          throw new FilterValidationError('section_tipo');
        }
      }
      if (stepComponentTipo !== undefined && stepComponentTipo !== null) {
        const ct = String(stepComponentTipo);
        // component_tipo passes if EITHER a well-formed tipo OR an allowlisted column.
        if (!isValidTipo(ct) && !isValidDataColumn(ct)) {
          throw new FilterValidationError('component_tipo');
        }
      }
    }

    // lang (optional) — string-interpolated into jsonpath literals, so allowlist it.
    const clauseLang = (clause as { lang?: unknown }).lang;
    if (clauseLang !== undefined && clauseLang !== null) {
      if (!isValidLang(String(clauseLang))) {
        throw new FilterValidationError('lang');
      }
    }

    // Resolve the searched component (the LAST path step). Empty path → skip.
    const lastStep = path[path.length - 1];
    if (!lastStep || lastStep.component_tipo === undefined || lastStep.component_tipo === null) {
      continue;
    }
    const componentTipo = String(lastStep.component_tipo);

    // model: explicit on the step, else resolve via ontology. Empty → skip (PHP continue).
    const model =
      typeof lastStep.model === 'string' && lastStep.model.length > 0
        ? lastStep.model
        : opts.resolveModel(componentTipo);
    if (!model) {
      continue;
    }

    // Effective lang (PHP get_search_context: clause.lang ?? DEDALO_DATA_LANG).
    const lang = clauseLang !== undefined && clauseLang !== null ? String(clauseLang) : opts.dataLang;

    out.push({ clause, model, lang, componentTipo });
  }

  return { op, items: out };
}
