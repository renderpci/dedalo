/**
 * SQO conform stage (Phase A of the two-phase search pipeline, spec §3.3).
 *
 * Walks the sanitized SQO's filter tree; for every LEAF:
 *   1. validates all identifiers at the §7.6 chokepoint (tipos, lang),
 *   2. resolves the component's model/column/translatability from the ontology,
 *   3. dispatches to the per-model fragment builder,
 * and returns a ConformedFilter tree whose leaves carry BuilderResults.
 *
 * PHP reference: search::parse_sqo/conform_filter (class.search.php:733/:809)
 * and the per-component resolve_query_object_sql traits.
 *
 * DISPATCH (header re-dated 2026-07-07, S2-45 — the old UNCOVERED list here
 * described long-landed gaps; coverage-state lists live in rewrite/STATUS.md):
 * non-relation models dispatch by their descriptor's `searchBuilder` family
 * (components/registry.ts, S2-26); relation-column models dispatch through
 * the relations registry. A model with no declared family and no relation
 * column throws loudly (plan §9 no-silent-narrowing) — that throw is the
 * ledger, not a bug.
 */

import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import { getSearchBuilderFamily } from '../components/registry.ts';
import type { SqoFilterLeaf, SqoFilterNode } from '../concepts/sqo.ts';
import {
	getColumnNameByModel,
	getModelByTipo,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import { buildDateFragment } from './builders/builder_date.ts';
import { buildIriFragment } from './builders/builder_iri.ts';
import { buildJsonFragment } from './builders/builder_json.ts';
import { buildNumberFragment } from './builders/builder_number.ts';
import { buildSectionIdFragment } from './builders/builder_section_id.ts';
import { buildStringFragment } from './builders/builder_string.ts';
import type { BuilderContext, BuilderResult } from './builders/types.ts';
import { fragment as fragmentResult } from './builders/types.ts';
import { assertValidLang, assertValidTipo, assertValidTipoOrColumn } from './identifier_gate.ts';
import { requireRelationIndex, searchStoreCovers } from './search_store.ts';

/** Default data language of the installation (PHP DEDALO_DATA_LANG). */
const DEFAULT_DATA_LANG = readString('DATA_LANG');

/**
 * NON-relation fragment builders, keyed by the descriptor's `searchBuilder`
 * family (S2-26 — the per-model membership lives on each descriptor, this map
 * only binds family name → builder function). The RELATION family dispatches
 * through the relations registry (getRelationSearchFragmentBuilder — the
 * search face of relations/registry.ts): the shared containment builder for
 * the whole family, explicit uncovered throws for the dedicated unported
 * pipelines (children/index/external).
 */
const FAMILY_BUILDERS: Record<
	NonNullable<ReturnType<typeof getSearchBuilderFamily>>,
	(q: unknown, qOperator: string | null, qSplit: boolean, context: BuilderContext) => BuilderResult
> = {
	string: buildStringFragment,
	number: (q, qOperator, _qSplit, context) => buildNumberFragment(q, qOperator, context),
	date: (q, qOperator, _qSplit, context) => buildDateFragment(q, qOperator, context),
	iri: (q, qOperator, _qSplit, context) => buildIriFragment(q, qOperator, context),
	json: (q, qOperator, _qSplit, context) => buildJsonFragment(q, qOperator, context),
	section_id: (q, qOperator, _qSplit, context) => buildSectionIdFragment(q, qOperator, context),
};

/** One LEFT JOIN chain fragment a multi-hop leaf requires (keyed for dedup). */
export interface JoinFragment {
	alias: string;
	sql: string;
}

export type ConformedFilter =
	| { kind: 'group'; op: string; items: ConformedFilter[] }
	| { kind: 'leaf'; result: BuilderResult; joins?: JoinFragment[] };

/**
 * Build the PHP build_sql_join chain for a multi-hop path: per hop, a
 * LATERAL unnest of the previous alias's relation key + a LEFT JOIN of the
 * target matrix table on the unnested locator identity. Aliases derive
 * deterministically from the path chain (identical paths dedup to the same
 * joined rows — the PHP rule). Used by filter leaves AND order paths.
 */
export async function buildJoinChain(
	path: { section_tipo?: string; component_tipo?: string }[],
	mainAlias: string,
): Promise<{ joins: JoinFragment[]; lastAlias: string; lastTable: string }> {
	const { getMatrixTableFromTipo } = await import('../ontology/resolver.ts');
	const joins: JoinFragment[] = [];
	let previousAlias = mainAlias;
	let lastTable = '';
	const aliasChain: string[] = [];
	for (let index = 1; index < path.length; index++) {
		const step = path[index] as { section_tipo?: string; component_tipo?: string };
		const hopComponent = (path[index - 1] as { component_tipo?: string }).component_tipo;
		const stepSection = step.section_tipo;
		if (stepSection === undefined || hopComponent === undefined) {
			throw new Error('search conform: a multi-hop path step needs section_tipo + component_tipo');
		}
		assertValidTipo(stepSection, 'join path');
		assertValidTipo(hopComponent, 'join path');
		// component_alias (WC-020): stored locators live under the TARGET's key.
		const { resolveDataTipo } = await import('../ontology/alias.ts');
		const hopDataTipo = await resolveDataTipo(hopComponent);
		const stepTable = await getMatrixTableFromTipo(stepSection);
		if (stepTable === null) {
			throw new Error(`search conform: no matrix table for join step '${stepSection}'`);
		}
		aliasChain.push(`${hopDataTipo}_${stepSection}`);
		const joinAlias = `j_${aliasChain.join('_')}`;
		const relationAlias = `rel_${joinAlias}`;
		joins.push({
			alias: joinAlias,
			sql:
				`LEFT JOIN LATERAL jsonb_array_elements(${previousAlias}.relation->'${hopDataTipo}') AS ${relationAlias} ON true\n` +
				`LEFT JOIN ${stepTable} AS ${joinAlias} ON ${joinAlias}.section_id = NULLIF((${relationAlias}->>'section_id'), '')::bigint AND ${joinAlias}.section_tipo = (${relationAlias}->>'section_tipo')::text`,
		});
		previousAlias = joinAlias;
		lastTable = stepTable;
	}
	return { joins, lastAlias: previousAlias, lastTable };
}

const BOOLEAN_OPERATORS: ReadonlySet<string> = new Set(['$and', '$or', '$not', '$nand', '$nor']);

/** Conform one leaf: gates → ontology → builder. */
async function conformLeaf(
	leaf: SqoFilterLeaf,
	alias: string,
	table: string,
): Promise<ConformedFilter> {
	const path = leaf.path ?? [];
	const lastStep = path[path.length - 1];
	if (lastStep === undefined) {
		return { kind: 'leaf', result: false };
	}

	// §7.6 chokepoint — every identifier that will be interpolated.
	for (const step of path) {
		if (step.section_tipo !== undefined) assertValidTipo(step.section_tipo, 'filter path');
		if (step.component_tipo !== undefined)
			assertValidTipoOrColumn(step.component_tipo, 'filter path');
	}
	if (leaf.lang !== undefined) assertValidLang(leaf.lang, 'filter leaf');

	// MULTI-HOP path: each intermediate step is a relation component pointing
	// at the next step's section — build the PHP build_sql_join chain (LATERAL
	// unnest of the relation key + LEFT JOIN on the target identity) and
	// conform the FINAL component against the last join alias.
	let leafAlias = alias;
	let leafTable = table;
	const joins: JoinFragment[] = [];
	if (path.length > 1) {
		const { getMatrixTableFromTipo } = await import('../ontology/resolver.ts');
		let previousAlias = alias;
		const aliasChain: string[] = [];
		for (let index = 1; index < path.length; index++) {
			const step = path[index] as { section_tipo?: string; component_tipo?: string };
			const hopComponent = (path[index - 1] as { component_tipo?: string }).component_tipo;
			const stepSection = step.section_tipo;
			if (stepSection === undefined || hopComponent === undefined) {
				throw new Error(
					'search conform: a multi-hop path step needs section_tipo + component_tipo',
				);
			}
			// component_alias (WC-020): stored locators live under the TARGET's key.
			const { resolveDataTipo } = await import('../ontology/alias.ts');
			const hopDataTipo = await resolveDataTipo(hopComponent);
			const stepTable = await getMatrixTableFromTipo(stepSection);
			if (stepTable === null) {
				throw new Error(`search conform: no matrix table for join step '${stepSection}'`);
			}
			// Deterministic alias from the path chain — identical paths in other
			// clauses reuse the SAME joined rows (PHP legacy alias dedup).
			aliasChain.push(`${hopDataTipo}_${stepSection}`);
			const joinAlias = `j_${aliasChain.join('_')}`;
			const relationAlias = `rel_${joinAlias}`;
			joins.push({
				alias: joinAlias,
				sql:
					`LEFT JOIN LATERAL jsonb_array_elements(${previousAlias}.relation->'${hopDataTipo}') AS ${relationAlias} ON true
` +
					`LEFT JOIN ${stepTable} AS ${joinAlias} ON ${joinAlias}.section_id = NULLIF((${relationAlias}->>'section_id'), '')::bigint AND ${joinAlias}.section_tipo = (${relationAlias}->>'section_tipo')::text`,
			});
			previousAlias = joinAlias;
			leafTable = stepTable;
		}
		leafAlias = previousAlias;
	}

	const componentTipo = lastStep.component_tipo;
	if (componentTipo === undefined) {
		return { kind: 'leaf', result: false };
	}

	// format:'function' — the autocomplete filter_by_list pre-filter (the
	// picker's per-catalogue checkboxes). The clause names a v6-era flat
	// VARIANT plus a flat key ('<fct>_<st>_<si>' …). The names survive as
	// WIRE VOCABULARY ONLY (WC-012): the stored data_relations_flat_*
	// functions were REMOVED 2026-07-20 — the variant is translated to an
	// exact tuple-IN over matrix_relation_index, never to SQL that calls a
	// function. The CLIENT sends the legacy v6 name (no data_ prefix); the
	// live PHP oracle interpolated it verbatim and ERRORED (0 results, probed
	// 2026-07-09), so this is functionality-over-parity: map through the
	// explicit allowlist, never interpolate the client string. The flat key
	// travels as a bound parameter.
	const leafFormat = (leaf as { format?: unknown }).format;
	if (leafFormat === 'function') {
		const FLAT_FUNCTIONS: Record<string, string> = {
			relations_flat_st_si: 'data_relations_flat_st_si',
			relations_flat_fct_st_si: 'data_relations_flat_fct_st_si',
			relations_flat_ty_st_si: 'data_relations_flat_ty_st_si',
			relations_flat_ty_st: 'data_relations_flat_ty_st',
			data_relations_flat_st_si: 'data_relations_flat_st_si',
			data_relations_flat_fct_st_si: 'data_relations_flat_fct_st_si',
			data_relations_flat_ty_st_si: 'data_relations_flat_ty_st_si',
			data_relations_flat_ty_st: 'data_relations_flat_ty_st',
		};
		const useFunction = (leaf as { use_function?: unknown }).use_function;
		const flatFunction = FLAT_FUNCTIONS[String(useFunction ?? '')];
		if (flatFunction === undefined) {
			throw new Error(
				`search conform: format 'function' with unknown use_function '${String(useFunction)}' (allowlist-only, never interpolated)`,
			);
		}
		const rawQ = leaf.q;
		let flatKey = typeof rawQ === 'string' ? rawQ : '';
		try {
			const parsed = JSON.parse(flatKey);
			if (typeof parsed === 'string') flatKey = parsed; // unquote '"a_b_1"'
		} catch {
			// not JSON-quoted — use as-is
		}
		if (flatKey === '' || !/^[A-Za-z0-9_-]+$/.test(flatKey)) {
			return { kind: 'leaf', result: false }; // malformed key — contributes nothing
		}
		// The flat key splits unambiguously on '_' (tipos never contain
		// underscores) into the variant's fields, and the predicate becomes an
		// EXACT tuple-IN over matrix_relation_index — uncorrelated (hashed
		// semi-join, no join-order inversion) and carrying the owner's
		// section_tipo, so it is equivalence, not a superset. The index is the
		// ONLY engine — an uncovered table fails loudly (requireRelationIndex).
		await requireRelationIndex([leafTable]);
		// column layout per variant, in flat-key order; '::int' marks the id
		const VARIANT_COLUMNS: Record<string, [string, string][]> = {
			data_relations_flat_ty_st: [
				['type', 'text'],
				['target_section_tipo', 'text'],
			],
			data_relations_flat_fct_st_si: [
				['from_component_tipo', 'text'],
				['target_section_tipo', 'text'],
				['target_section_id', 'int'],
			],
			data_relations_flat_ty_st_si: [
				['type', 'text'],
				['target_section_tipo', 'text'],
				['target_section_id', 'int'],
			],
			data_relations_flat_st_si: [
				['target_section_tipo', 'text'],
				['target_section_id', 'int'],
			],
		};
		const columns = VARIANT_COLUMNS[flatFunction] as [string, string][];
		const keyParts = flatKey.split('_');
		if (keyParts.length !== columns.length) {
			// wrong arity for the named variant — malformed key, contributes
			// nothing (same contract as the character-class guard above)
			return { kind: 'leaf', result: false };
		}
		const conditions: string[] = [];
		const tokenValues: Record<string, unknown> = {};
		columns.forEach(([column, cast], index) => {
			const name = `_Qf${index + 1}_`;
			conditions.push(`r.${column} = ${name}::${cast}`);
			tokenValues[name] = keyParts[index] as string;
		});
		const result = fragmentResult(
			`(${leafAlias}.section_tipo, ${leafAlias}.section_id) IN ` +
				`(SELECT r.section_tipo, r.section_id FROM matrix_relation_index r WHERE ${conditions.join(' AND ')})`,
			tokenValues,
		);
		return joins.length > 0 ? { kind: 'leaf', result, joins } : { kind: 'leaf', result };
	}

	// Ontology resolution. PHP ontology_utils::check_active_tld:271 allowlists
	// the PSEUDO tipo 'section_id' for SQO paths (the record id addressed as a
	// component — the rsc80 state-vocabulary fixed_filter is the live user);
	// there is no ontology node behind it, so resolve its model directly.
	const model =
		componentTipo === 'section_id' ? 'component_section_id' : await getModelByTipo(componentTipo);
	if (model === null) {
		throw new Error(`search conform: unknown component tipo '${componentTipo}'`);
	}
	const column = getColumnNameByModel(model);
	if (column === null) {
		throw new Error(`search conform: no matrix column for model '${model}'`);
	}
	const translatable = await getTranslatableByTipo(componentTipo);
	// No clause lang ⇒ search ALL langs — PHP component_common::get_search_query
	// (class.component_common.php:3683-86) sets lang='all' unconditionally when
	// the clause carries none. The autocomplete picker relies on it: its free
	// clauses are lang-less and must match any translation (probed 2026-07-09:
	// 'roma' matches a mint whose only 'roma' value is lg-eng). Non-translatable
	// data is all lg-nolan, where the nolan scope is observably identical.
	const lang = leaf.lang ?? (translatable ? 'all' : 'lg-nolan');

	// component_alias (WC-020): the SQL fragment keys the TARGET's data slot.
	const { resolveDataTipo } = await import('../ontology/alias.ts');
	const context: BuilderContext = {
		alias: leafAlias,
		column,
		tipo: await resolveDataTipo(componentTipo),
		sectionTipo: lastStep.section_tipo ?? '',
		table: leafTable,
		lang,
		translatable,
		model,
		// string leaves: let builder_string prepend its search-store pre-filter
		// when the table's sync trigger exists (cached catalog check). ONLY for
		// NON-joined leaves (path length 1): on a hop-joined alias the join
		// already bounds the per-row work, and the prefilter's tiny-cardinality
		// estimate makes the planner FLIP the join order into an unindexed
		// person→records filter join (measured: multi-hop count 150ms → 660ms).
		searchStoreCovered:
			column === 'string' && joins.length === 0 ? await searchStoreCovers(leafTable) : false,
	};

	// Builder dispatch by descriptor facet (S2-26): relation-column models go
	// through the relations registry; everything else through its declared
	// searchBuilder family; no facet = unsearchable, throw loudly (§9).
	let result: BuilderResult;
	const builderFamily = getSearchBuilderFamily(model);
	if (getColumnNameByModel(model) === 'relation') {
		const { getRelationSearchFragmentBuilder } = await import('../relations/registry.ts');
		const buildFragment = await getRelationSearchFragmentBuilder(model);
		result = await buildFragment(leaf.q, leaf.q_operator ?? null, context);
	} else if (builderFamily !== undefined) {
		result = FAMILY_BUILDERS[builderFamily](
			leaf.q,
			leaf.q_operator ?? null,
			leaf.q_split === true,
			context,
		);
	} else {
		throw new Error(
			`search conform: model '${model}' declares no searchBuilder family and is not a relation model — unsearchable through conform (ledgered, never silently narrowed)`,
		);
	}
	return joins.length > 0 ? { kind: 'leaf', result, joins } : { kind: 'leaf', result };
}

/** Recursively conform a filter node ($and/$or trees with leaves). */
export async function conformFilter(
	filter: SqoFilterNode | SqoFilterLeaf | Record<string, unknown>,
	alias: string,
	table: string,
): Promise<ConformedFilter> {
	// A node has exactly one boolean-operator key.
	const keys = Object.keys(filter);
	const opKey = keys.find((key) => BOOLEAN_OPERATORS.has(key));
	if (opKey !== undefined) {
		const rawItems = (filter as Record<string, unknown>)[opKey];
		const items: ConformedFilter[] = [];
		for (const item of Array.isArray(rawItems) ? rawItems : []) {
			if (item === false || item === null || item === undefined) continue;
			items.push(await conformFilter(item as Record<string, unknown>, alias, table));
		}
		return { kind: 'group', op: opKey, items };
	}
	// Leaf (has a path).
	return conformLeaf(filter as SqoFilterLeaf, alias, table);
}
