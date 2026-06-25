/**
 * Per-component WHERE builders + $and/$or/$not assembly for the Mango SQO filter.
 *
 * Read-side port of the per-component search traits and trait.where.php's
 * filter_parser, for the filter shapes the filtered-count path serves natively:
 *
 *   string / input_text (component_input_text, component_text_area, component_email):
 *     - exactly-equal  (==)  → resolve_exactly_equal_sql  (string_common 309-323)
 *     - contains (default)   → resolve_contains_sql       (string_common 511-525)
 *   number (component_number):
 *     - equal (=, default)   → resolve_*_sql              (number 570-586)
 *
 * Every other operator / family is DECLINED upstream (the count handler proxies it
 * to PHP), so this builder only ever sees the supported shapes; it throws
 * UnsupportedFilterError on anything else as a fail-closed guard.
 *
 * SQL FIDELITY (verified byte-green against live PHP, dedalo7_mib):
 *
 *   string ==  : (T.string @? '$.{tipo}[*] ? (@.lang == "{lang}")') AND EXISTS (
 *                  SELECT 1
 *                  FROM jsonb_path_query(T.string, '$.{tipo}[*] ? (@.lang == "{lang}")') AS elem
 *                  WHERE f_unaccent(elem->>'value') = f_unaccent($n)
 *                 )
 *   string ~* : ...same shape... WHERE f_unaccent(elem->>'value') ~* f_unaccent($n)
 *   number =  : (T.number @? '$.{tipo}[*]') AND EXISTS (
 *                  SELECT 1
 *                  FROM jsonb_array_elements(T.number->'{tipo}') AS elem
 *                  WHERE (elem->>'value')::numeric = ($n)::numeric
 *                 )
 *
 * INJECTION-SENSITIVE INTERPOLATION (all pre-validated by conformFilter, NEVER
 * reached otherwise): table_alias `{T}`, column `{C}`, component_tipo (the
 * `$.{tipo}[*]` member step), and `lang` inside the double-quoted jsonpath filter
 * `@.lang == "{lang}"`. The user search VALUE is always a bound `$n` param. When
 * lang === 'all' the jsonpath omits the `? (@.lang == "…")` filter entirely.
 *
 * ASSEMBLY (filter_parser, trait.where.php:281-351): collect non-empty fragments,
 * then implode with `\n AND ` ($and) / `\n OR ` ($or); $not/$nand wrap the AND join
 * in `NOT (…)`, $nor wraps the OR join. Nested groups are parenthesised `( … )`.
 * The leading-space prefixes (` AND `, ` OR `) match PHP's PHP_EOL.' AND ' exactly.
 *
 * PARAM MODEL: a 0-indexed positional list shared with the section_tipo predicate
 * (section params come first). Each leaf emits its value via getPlaceholder (strict
 * === dedup), so `_Qn_` is resolved straight to `$n` here rather than as a later
 * str_replace — the net SQL/param output is identical to PHP's two-phase model.
 */

import type { FilterClause } from '@dedalo/contract';
import type { ConformedClause, ConformedFilter } from './filter_validate.ts';

const EOL = '\n';

/** Defence-in-depth: re-assert the validated identifier shape at the SQL seam. */
const SAFE_TIPO = /^[a-z]+[0-9]+$/;
const SAFE_LANG = /^(lg-[a-z0-9_]+|all)$/;
const SAFE_ALIAS = /^[a-z_][a-z0-9_]*$/;
const SAFE_COLUMN = /^[a-z_]+$/;

/** A filter clause/family the native path does not port → caller must proxy to PHP. */
export class UnsupportedFilterError extends Error {
  constructor(reason: string) {
    super(`unsupported filter: ${reason}`);
    this.name = 'UnsupportedFilterError';
  }
}

/** Append a value to the positional param list (strict === dedup) → its `$n`. */
function getPlaceholder(params: unknown[], value: unknown): string {
  const idx = params.findIndex((p) => p === value);
  if (idx !== -1) return `$${idx + 1}`;
  params.push(value);
  return `$${params.length}`;
}

/** Models whose data lives in the JSONB `string` column (string-family search). */
const STRING_MODELS = new Set(['component_input_text', 'component_text_area', 'component_email']);

/** Normalize a clause's `q` (port of extract_normalized_q): unwrap array/value-object. */
function extractQ(clause: FilterClause): string | null {
  const raw = Array.isArray(clause.q) ? clause.q[0] : clause.q;
  const qOp = (clause as { q_operator?: unknown }).q_operator;
  const rawEmpty =
    raw === undefined ||
    raw === null ||
    raw === '' ||
    (typeof raw === 'object' && raw !== null && !(raw as { value?: unknown }).value);
  const opEmpty = qOp === undefined || qOp === null || qOp === '';
  if (rawEmpty && opEmpty) return null;
  const v = typeof raw === 'object' && raw !== null ? (raw as { value?: unknown }).value : raw;
  return v === undefined || v === null ? '' : String(v);
}

/**
 * Build the jsonpath member step with the optional lang filter (string family).
 *   lang === 'all'  → $.{tipo}[*]
 *   else            → $.{tipo}[*] ? (@.lang == "{lang}")
 */
function stringJsonPath(componentTipo: string, lang: string): string {
  return lang === 'all'
    ? `$.${componentTipo}[*]`
    : `$.${componentTipo}[*] ? (@.lang == "${lang}")`;
}

/**
 * Resolve ONE conformed leaf clause to its SQL fragment, pushing the value param
 * onto the shared positional list. Returns null for an empty/unbuildable clause
 * (PHP resolve_query_object_sql → false → filter_parser skips it).
 *
 * Only the ported operators are produced; anything else throws
 * UnsupportedFilterError (the count handler's canHandleRequest guarantees this is
 * never reached for an un-ported shape, but we fail closed regardless).
 */
function buildClauseSql(conformed: ConformedClause, params: unknown[]): string | null {
  const { clause, model, lang, componentTipo } = conformed;

  if (!SAFE_TIPO.test(componentTipo)) throw new UnsupportedFilterError('component_tipo shape');
  if (!SAFE_LANG.test(lang)) throw new UnsupportedFilterError('lang shape');

  const tableAlias = String((clause as { table_alias?: unknown }).table_alias ?? '');
  if (!SAFE_ALIAS.test(tableAlias)) throw new UnsupportedFilterError('table_alias shape');

  const q = extractQ(clause);
  if (q === null) return null;

  const qOp = (clause as { q_operator?: unknown }).q_operator ?? null;

  // q_split is not ported (it fans a multi-word q into an $and of contains clauses).
  if ((clause as { q_split?: unknown }).q_split === true) {
    throw new UnsupportedFilterError('q_split');
  }
  // `column`/`format` formats and `use_function` are not ported.
  if ((clause as { format?: unknown }).format === 'column') {
    throw new UnsupportedFilterError("format 'column'");
  }

  if (STRING_MODELS.has(model)) {
    const column = 'string';
    return buildStringSql(q, qOp, tableAlias, column, componentTipo, lang, params);
  }
  if (model === 'component_number') {
    const column = 'number';
    return buildNumberSql(q, qOp, tableAlias, column, componentTipo, params);
  }

  throw new UnsupportedFilterError(`model ${model}`);
}

/**
 * String family WHERE fragment. PORTED OPERATORS ONLY:
 *   ==  (leading '==' in q, or q_operator '==')  → exactly-equal (=)
 *   default                                       → contains (~*)
 * Every other operator (!*, *, !=, -, !!, wildcard/literal) is DECLINED.
 */
function buildStringSql(
  q: string,
  qOp: unknown,
  tableAlias: string,
  column: string,
  componentTipo: string,
  lang: string,
  params: unknown[],
): string | null {
  if (!SAFE_COLUMN.test(column)) throw new UnsupportedFilterError('column shape');

  // Reject the operators we do NOT port, mirroring dispatch_operator_sql's order so
  // the handler never reaches an un-ported branch with a half-built fragment.
  if (q === '!*' || qOp === '!*') throw new UnsupportedFilterError('string !* (empty)');
  if (q === '*' || qOp === '*') throw new UnsupportedFilterError('string * (not-empty)');
  if (q.startsWith('!=') || qOp === '!=') throw new UnsupportedFilterError('string != (different)');
  if (q.startsWith('-') || qOp === '-') throw new UnsupportedFilterError('string - (not-contain)');
  if (q.startsWith('!!') || qOp === '!!') throw new UnsupportedFilterError('string !! (duplicated)');

  const jsonPath = stringJsonPath(componentTipo, lang);

  // == exactly-equal (resolve_exactly_equal_sql, string_common:309)
  if (q.startsWith('==') || qOp === '==') {
    const qClean = q.replace(/==/g, '').trim();
    const value = getPlaceholder(params, qClean);
    return (
      `(${tableAlias}.${column} @? '${jsonPath}') AND EXISTS (${EOL}` +
      `  SELECT 1${EOL}` +
      `  FROM jsonb_path_query(${tableAlias}.${column}, '${jsonPath}') AS elem${EOL}` +
      `  WHERE f_unaccent(elem->>'value') = f_unaccent(${value})${EOL} )`
    );
  }

  // Wildcard / literal forms (*q, q*, 'q') are a distinct PHP branch → DECLINE.
  if (q.startsWith('*') || q.endsWith('*') || isLiteral(q)) {
    throw new UnsupportedFilterError('string wildcard/literal');
  }

  // default: contains (resolve_contains_sql, string_common:511). PHP strips +,*,=.
  const qClean = q.replace(/[+*=]/g, '');
  const value = getPlaceholder(params, qClean);
  return (
    `(${tableAlias}.${column} @? '${jsonPath}') AND EXISTS (${EOL}` +
    `  SELECT 1${EOL}` +
    `  FROM jsonb_path_query(${tableAlias}.${column}, '${jsonPath}') AS elem${EOL}` +
    `  WHERE f_unaccent(elem->>'value') ~* f_unaccent(${value})${EOL} )`
  );
}

/** Port of search::is_literal — a value wrapped in single quotes 'like this'. */
function isLiteral(q: string): boolean {
  return q.length >= 2 && q.startsWith("'") && q.endsWith("'");
}

/**
 * Number family WHERE fragment. PORTED OPERATOR ONLY:
 *   = (default)  → equal. Every operator op (!*, *, between '...', >=, <=, >, <) is DECLINED.
 * (number trait: dispatch_number_operator_sql / resolve default 570-586.)
 */
function buildNumberSql(
  q: string,
  qOp: unknown,
  tableAlias: string,
  column: string,
  componentTipo: string,
  params: unknown[],
): string | null {
  if (!SAFE_COLUMN.test(column)) throw new UnsupportedFilterError('column shape');

  if (q === '!*' || qOp === '!*') throw new UnsupportedFilterError('number !* (empty)');
  if (q === '*' || qOp === '*') throw new UnsupportedFilterError('number * (not-empty)');
  if (q.includes('...')) throw new UnsupportedFilterError('number between');
  if (q.startsWith('>=') || qOp === '>=') throw new UnsupportedFilterError('number >=');
  if (q.startsWith('<=') || qOp === '<=') throw new UnsupportedFilterError('number <=');
  if (q.startsWith('>') || qOp === '>') throw new UnsupportedFilterError('number >');
  if (q.startsWith('<') || qOp === '<') throw new UnsupportedFilterError('number <');

  // default = equal (number trait default). PHP cleans '+' and ',', commas→dots.
  const qClean = q.replace(/\+/g, '').replace(/,/g, '.');
  // Non-numeric / empty coerces to '0' (PHP). Keep the cleaned string as the value
  // (it is cast ::numeric in SQL); guard against an empty value.
  const value = getPlaceholder(params, qClean === '' ? '0' : qClean);
  const jsonPath = `$.${componentTipo}[*]`;
  return (
    `(${tableAlias}.${column} @? '${jsonPath}') AND EXISTS (${EOL}` +
    `  SELECT 1${EOL}` +
    `  FROM jsonb_array_elements(${tableAlias}.${column}->'${componentTipo}') AS elem${EOL}` +
    `  WHERE (elem->>'value')::numeric = (${value})::numeric${EOL} )`
  );
}

/**
 * Assemble a conformed filter tree into a single WHERE fragment (port of
 * filter_parser). Collect-then-implode: empty fragments are dropped so no dangling
 * operator can survive. Returns '' for an all-empty tree (caller omits the AND).
 *
 * @throws UnsupportedFilterError on an un-ported operator/family (fail-closed).
 */
export function buildFilterWhere(conformed: ConformedFilter, params: unknown[]): string {
  const operator = conformed.op.slice(1).toUpperCase(); // '$and' → 'AND'
  const VALID = new Set(['AND', 'OR', 'NOT', 'NAND', 'NOR']);
  if (!VALID.has(operator)) {
    // PHP filter_parser: invalid operator → return '' (skip), no throw.
    return '';
  }

  const fragments: string[] = [];
  for (const item of conformed.items) {
    if ('op' in item) {
      // Nested group → recurse and wrap the non-empty result in ( … ).
      const nested = buildFilterWhere(item, params);
      if (nested !== '') fragments.push(`( ${nested} )`);
    } else {
      const frag = buildClauseSql(item, params);
      if (frag !== null && frag !== '') fragments.push(frag);
    }
  }

  if (fragments.length === 0) return '';

  switch (operator) {
    case 'AND':
      return fragments.join(`${EOL} AND `);
    case 'OR':
      return fragments.join(`${EOL} OR `);
    case 'NOT':
    case 'NAND':
      return `NOT (${fragments.join(`${EOL} AND `)})`;
    case 'NOR':
      return `NOT (${fragments.join(`${EOL} OR `)})`;
    default:
      return '';
  }
}
