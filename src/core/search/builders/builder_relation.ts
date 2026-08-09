/**
 * Relation-family fragment builder — select/check_box/radio_button/portal/
 * publication/filter/relation_parent/related/model/dataframe (column 'relation').
 *
 * PHP reference: core/component_relation_common/trait.search_component_relation_common.php.
 * Data shape: {"<tipo>": [locator, …]} — locators are the q payload.
 *
 * Operators: '!*' empty (no key), '*' not-empty (key exists), '!=' has-key-and-
 * not-contains, '!==' strict not-contains, default/'==' containment (@>).
 *
 * _tm TWIN (trait.search_component_relation_common_tm): on the
 * matrix_time_machine table the relation data is the flat scalar `user_id`
 * INTEGER column (the dd578 user portal of the TM envelope) — every operator
 * emits column-direct SQL there; buildRelationFragment dispatches by
 * context.table exactly like the PHP dispatch_relation_operator_sql.
 *
 * ANCESTOR WRAP (buildRelationSearchAncestorFragment): the relation_search
 * wrap for the legacy component_autocomplete_hi model — LIVE since 2026-08-09
 * (audits/2026-08_oh1_beta §5.5, and the ledger entry
 * WC-2026-08-09-autocomplete-hi-ancestor-search). conform.ts applies it
 * whenever the leaf's STORED model is component_autocomplete_hi — exactly when
 * save_component.ts maintains the index. It was withheld while PHP shared the
 * database, because PHP's own wrap is defective for '=='; PHP is decommissioned
 * and the withholding turned a maintained-on-write index into an index that was
 * never read — a broader-term search silently under-returned.
 */

import type { BuilderContext, BuilderResult } from './types.ts';
import { compound, fragment } from './types.ts';

/**
 * Normalize the q payload to the JSON text injected inside {"tipo":[ … ]}
 * (PHP extract_normalized_relation_q): accepts a locator object or an array
 * of locators; strips the transient 'id' field; returns the array content
 * WITHOUT the outer brackets. Null q → null (operator-only searches).
 */
function normalizeRelationQ(rawQ: unknown): string | null {
	if (rawQ === undefined || rawQ === null || rawQ === '') {
		return null;
	}
	const locators = Array.isArray(rawQ) ? rawQ : [rawQ];
	const cleaned = locators.map((locator) => {
		if (locator === null || typeof locator !== 'object') {
			// Safety gate (PHP coerces non-object content to '[]'): refuse quietly.
			return null;
		}
		const { id: _transientId, ...rest } = locator as Record<string, unknown>;
		return rest;
	});
	if (cleaned.some((entry) => entry === null)) {
		return null;
	}
	const jsonArray = JSON.stringify(cleaned);
	return jsonArray.slice(1, -1); // strip outer [ ]
}

/**
 * The _tm operator handlers (PHP dispatch_relation_operator_sql_tm): the TM
 * table stores the relation datum as the scalar `user_id` column; q carries a
 * locator whose section_id IS the user id. '!=' and '!==' are identical on a
 * scalar (the JSONB containment-vs-EXISTS distinction has no meaning here).
 */
function buildRelationFragmentTm(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const operator = qOperator ?? '';
	const columnRef = `${context.alias}.user_id`;
	if (operator === '!*') return fragment(`${columnRef} IS NULL`);
	if (operator === '*') return fragment(`${columnRef} IS NOT NULL`);

	// q → the user id (a locator {section_id: N} or its JSON string). Bound
	// as TEXT: the live user_id column is VARCHAR (PHP binds string params).
	const locator = typeof rawQ === 'string' ? JSON.parse(rawQ) : rawQ;
	const first = Array.isArray(locator) ? locator[0] : locator;
	const userId = Number((first as { section_id?: unknown } | null)?.section_id);
	if (!Number.isFinite(userId)) return false;

	if (operator === '!=' || operator === '!==') {
		return fragment(`${columnRef} != _Q1_`, { _Q1_: String(userId) });
	}
	return fragment(`${columnRef} = _Q1_`, { _Q1_: String(userId) });
}

/**
 * The dd542 Activity "Who" (dd543) twin — the actor as an indexed EXPRESSION
 * instead of jsonb containment (WC-056).
 *
 * WHY. The dd542 list orders by `("timestamp", id)` (WC-054) and `relation @> …`
 * cannot ride that index, so the planner walks the ordered index with
 * containment as a Filter and stops at the LIMIT. On an append-only log an
 * actor's rows are one contiguous block, so that walk is fast only when the
 * actor is ALSO recent: measured on the 32.9M-row mdcat log, an actor last seen
 * in 2016 never completed (>300 s), while the newest actor answered in 90 ms.
 * A GIN on `relation` fixes only the RARE actor (12.5 ms) — for a departed
 * actor with 206k rows the planner still prefers the walk — and the WC-053
 * `OFFSET 0` barrier makes the HEAVY actor catastrophically worse (90 ms →
 * 69.5 s). Selectivity here spans four orders of magnitude between actors, so
 * no static plan choice is right; only an index carrying the actor AND the sort
 * key is flat, and it needs the predicate written as an equality on the same
 * expression. With `matrix_activity_who_ts_idx` in place every actor class
 * answers in 1.1–4.3 ms, index-served, no sort node.
 *
 * THE INVARIANT. This reads element 0, so it is exact only while a row carries
 * exactly ONE actor locator — how the engine writes it (activity_log.ts) and
 * how the data reads (2.5M rows sampled on mdcat: all length 1, all dd128).
 * `activity_log_single_actor.test.ts` gates the writer. section_tipo is bound
 * explicitly rather than assumed, so a locator pointing at another section can
 * never be a false positive.
 *
 * Existence operators are NOT routed here: `?`-key tests are already cheap and
 * index-independent, and they carry no locator to compare.
 */
function buildActivityWhoFragment(
	rawQ: unknown,
	operator: string,
	context: BuilderContext,
): BuilderResult {
	const locator = typeof rawQ === 'string' ? JSON.parse(rawQ) : rawQ;
	const first = (Array.isArray(locator) ? locator[0] : locator) as {
		section_id?: unknown;
		section_tipo?: unknown;
	} | null;
	const sectionId = first?.section_id;
	const sectionTipo = first?.section_tipo;
	// A locator missing either half cannot address an actor — drop the clause
	// rather than emit a half-predicate that would match every row.
	if (
		(typeof sectionId !== 'string' && typeof sectionId !== 'number') ||
		typeof sectionTipo !== 'string'
	) {
		return false;
	}
	const idExpr = `${context.alias}.${context.column}->'${context.tipo}'->0->>'section_id'`;
	const tipoExpr = `${context.alias}.${context.column}->'${context.tipo}'->0->>'section_tipo'`;
	const match = `(${idExpr} = _Q1_ AND ${tipoExpr} = _Q2_)`;
	const tokens = { _Q1_: String(sectionId), _Q2_: sectionTipo };
	// '!=' keeps PHP's "has relations for this component AND does not match"
	// semantics; '!==' is the strict form that also admits rows without the key.
	if (operator === '!=') {
		return fragment(`(${context.alias}.${context.column} ? _Q3_) AND NOT ${match}`, {
			...tokens,
			_Q3_: context.tipo,
		});
	}
	if (operator === '!==') {
		return fragment(`NOT ${match}`, tokens);
	}
	return fragment(match, tokens);
}

/**
 * The SQL expression a relation leaf compares against: `<alias>.<column>` by
 * default, or the context's explicit `columnExpr` (the NULL-safe ancestor
 * column — see BuilderContext.columnExpr).
 */
function columnRefOf(context: BuilderContext): string {
	return context.columnExpr ?? `${context.alias}.${context.column}`;
}

/** matrix_activity components whose actor/target rides an expression index. */
const ACTIVITY_EXPRESSION_INDEXED: ReadonlySet<string> = new Set(['dd543']);

/** Operators whose two column clauses must BOTH hold (a negation excludes). */
const NEGATING_RELATION_OPERATORS: ReadonlySet<string> = new Set(['!*', '!=', '!==']);

/**
 * The autocomplete_hi ancestor wrap — PHP add_relation_search
 * (trait.search_component_relation_common.php:512), consulting BOTH the direct
 * `relation` column and the `relation_search` ancestor index the save path
 * maintains (relations/save.ts maintainRelationSearchIndex) in ONE pass. A
 * search on a BROADER term therefore returns the records filed under its
 * narrower ones ("search Spain matches Madrid"), as v6 did.
 *
 * GROUPING (PHP's own rule, corrected in two places — the ledger entry
 * WC-2026-08-09-autocomplete-hi-ancestor-search states each correction):
 *   - positive operators ('', '==', '*') → `$or`: a hit in EITHER column
 *     satisfies the filter;
 *   - negating operators ('!*', '!=', '!==') → `$and`: the record must fail
 *     BOTH, or a record excluded by name would come back through its ancestors.
 *
 * Two corrections to PHP-as-shipped, both closing SILENT UNDER/OVER-RETURNS:
 *   1. PHP skipped repointing the clone's column for `'=='`, so its "ancestor"
 *      clause searched `relation` twice and the index was never read on the
 *      one operator the picker actually sends. We always repoint.
 *   2. PHP grouped `'!=='` with `$or` (`NOT direct OR NOT ancestor`), which
 *      matches a record contained in `relation` whenever it is absent from
 *      `relation_search` — the opposite of "different from". It is `$and` here.
 * The `'!='` ancestor clause additionally uses the STRICT not-contains form:
 *   PHP's `'!='` also demands `relation_search ? tipo`, which drops every
 *   record whose term is a hierarchy ROOT (no ancestors are indexed for it).
 *
 * NULL-SAFETY ON THE NEGATING ARM. `relation_search` is written only when a
 * term HAS ancestors, so it is NULL on most rows — 1964 of 2175 on the live
 * `matrix`, 72 of 76 `oh1` records. Under three-valued logic
 * `NOT (NULL @> q)` is NULL, not TRUE, so an `$and` of [direct, ancestor] is
 * NULL for every such row and the row vanishes: a strict-different search that
 * must return all 76 `oh1` records returned 4. A NULL index means "this record
 * has no indexed ancestors", never "unknown", so the negating arm compares
 * against `COALESCE(relation_search, '{}')`. It is applied ONLY there: a
 * negation cannot ride the `matrix_relation_search_gin_idx` GIN index anyway,
 * while the POSITIVE arm keeps the bare column and stays index-served (and is
 * already NULL-safe, because `$or` absorbs a NULL beside a TRUE).
 */
export function buildRelationSearchAncestorFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	const operator = qOperator ?? '';
	const direct = buildRelationFragment(rawQ, qOperator, context);
	if (direct === false) return false;
	const negating = NEGATING_RELATION_OPERATORS.has(operator);
	// '!=' on the ancestor column would additionally require the key to exist
	// there; roots have no ancestors, so use the strict not-contains twin.
	const ancestorOperator = operator === '!=' ? '!==' : qOperator;
	const ancestorColumn = `${context.alias}.relation_search`;
	const ancestor = buildRelationFragment(rawQ, ancestorOperator, {
		...context,
		column: 'relation_search',
		columnExpr: negating ? `COALESCE(${ancestorColumn}, '{}'::jsonb)` : ancestorColumn,
	});
	if (ancestor === false) return direct;
	return compound(negating ? '$and' : '$or', [direct, ancestor]);
}

export function buildRelationFragment(
	rawQ: unknown,
	qOperator: string | null,
	context: BuilderContext,
): BuilderResult {
	// TM-table twin: flat scalar column instead of JSONB containment (PHP
	// dispatch_relation_operator_sql detects the table and delegates).
	if (context.table === 'matrix_time_machine') {
		return buildRelationFragmentTm(rawQ, qOperator, context);
	}
	const operator = qOperator ?? '';
	const qJson = normalizeRelationQ(rawQ);
	const columnRef = columnRefOf(context);

	// '!*' — empty: the component key is absent from the relation column.
	if (operator === '!*') {
		return fragment(`NOT (${columnRef} ? _Q1_)`, { _Q1_: context.tipo });
	}

	// dd542 Activity's actor column rides an expression index instead of the
	// GIN-less containment walk (WC-056) — value operators only; '*'/'!*' stay
	// on the cheap key test above/below.
	if (
		context.table === 'matrix_activity' &&
		ACTIVITY_EXPRESSION_INDEXED.has(context.tipo) &&
		operator !== '*'
	) {
		return buildActivityWhoFragment(rawQ, operator, context);
	}

	// '*' — not-empty: key exists.
	if (operator === '*') {
		return fragment(`(${columnRef} ? _Q1_)`, { _Q1_: context.tipo });
	}

	// '!=' — has relations for this component AND does not contain q.
	if (operator === '!=' && qJson !== null) {
		return fragment(`(${columnRef} ? _Q2_) AND NOT (${columnRef} @> _Q1_::text::jsonb)`, {
			_Q1_: `{"${context.tipo}":[${qJson}]}`,
			_Q2_: context.tipo,
		});
	}

	// '!==' — strict different: not-contains (includes records with no key).
	if (operator === '!==' && qJson !== null) {
		return fragment(`NOT (${columnRef} @> _Q1_::text::jsonb)`, {
			_Q1_: `{"${context.tipo}":[${qJson}]}`,
		});
	}

	// Default / '==' — containment.
	if (qJson === null) {
		return false;
	}
	return fragment(`${columnRef} @> _Q1_::text::jsonb`, {
		_Q1_: `{"${context.tipo}":[${qJson}]}`,
	});
}
