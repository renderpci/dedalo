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

/**
 * One relation-leaf locator resolved to matrix_relation_index columns:
 * ordered [column, cast, value] triples ready for tuple-IN emission.
 */
type RelationLeafLocator = [string, 'text' | 'int', string][];

/** format:'relation' q fields → index columns (the locator vocabulary). */
const RELATION_LEAF_FIELDS: Record<string, [string, 'text' | 'int']> = {
	section_tipo: ['target_section_tipo', 'text'],
	section_id: ['target_section_id', 'int'],
	from_component_tipo: ['from_component_tipo', 'text'],
	type: ['type', 'text'],
};

/**
 * Parse one format:'relation' locator object — strict: unknown fields,
 * invalid tipos, a non-integer section_id or a missing section_tipo throw.
 */
function parseRelationLeafLocator(raw: unknown): RelationLeafLocator {
	if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
		throw new Error(
			"search conform: format 'relation' q must be a locator object or an array of them",
		);
	}
	const record = raw as Record<string, unknown>;
	if (typeof record.section_tipo !== 'string' || record.section_tipo === '') {
		throw new Error("search conform: format 'relation' locator needs a section_tipo");
	}
	const resolved: RelationLeafLocator = [];
	for (const [field, value] of Object.entries(record)) {
		const mapped = RELATION_LEAF_FIELDS[field];
		if (mapped === undefined) {
			throw new Error(
				`search conform: format 'relation' unknown locator field '${field}' ` +
					`(allowed: ${Object.keys(RELATION_LEAF_FIELDS).join(', ')})`,
			);
		}
		const [column, cast] = mapped;
		if (cast === 'int') {
			const id = String(value);
			if (!/^-?[0-9]+$/.test(id)) {
				throw new Error(
					`search conform: format 'relation' section_id '${String(value)}' is not an integer`,
				);
			}
			resolved.push([column, cast, id]);
		} else {
			resolved.push([column, cast, assertValidTipo(String(value), `relation leaf ${field}`)]);
		}
	}
	return resolved;
}

/** format:'relation' q: one locator object, or an array (OR within the leaf). */
function parseRelationLeafQ(rawQ: unknown): RelationLeafLocator[] {
	const items = Array.isArray(rawQ) ? rawQ : [rawQ];
	if (items.length === 0) {
		throw new Error("search conform: format 'relation' q array is empty");
	}
	return items.map(parseRelationLeafLocator);
}

/**
 * DEPRECATED format:'function' reader (WC-012): resolve the allowlisted
 * variant name + flattened key into the same locator triples. Unknown names
 * throw (allowlist-only, never interpolated); a malformed key returns null
 * (contributes nothing — the legacy contract).
 */
const LEGACY_FLAT_VARIANTS: Record<string, [string, 'text' | 'int'][]> = {
	relations_flat_st_si: [
		['target_section_tipo', 'text'],
		['target_section_id', 'int'],
	],
	relations_flat_fct_st_si: [
		['from_component_tipo', 'text'],
		['target_section_tipo', 'text'],
		['target_section_id', 'int'],
	],
	relations_flat_ty_st_si: [
		['type', 'text'],
		['target_section_tipo', 'text'],
		['target_section_id', 'int'],
	],
	relations_flat_ty_st: [
		['type', 'text'],
		['target_section_tipo', 'text'],
	],
};

function parseLegacyFunctionLeaf(leaf: {
	use_function?: unknown;
	q?: unknown;
}): RelationLeafLocator | null {
	// accept both the v6 client spelling and the data_-prefixed form
	const name = String(leaf.use_function ?? '').replace(/^data_/, '');
	const columns = LEGACY_FLAT_VARIANTS[name];
	if (columns === undefined) {
		throw new Error(
			`search conform: format 'function' with unknown use_function '${String(leaf.use_function)}' (allowlist-only, never interpolated)`,
		);
	}
	let flatKey = typeof leaf.q === 'string' ? leaf.q : '';
	try {
		const parsed = JSON.parse(flatKey);
		if (typeof parsed === 'string') flatKey = parsed; // unquote '"a_b_1"'
	} catch {
		// not JSON-quoted — use as-is
	}
	if (flatKey === '' || !/^[A-Za-z0-9_-]+$/.test(flatKey)) {
		return null;
	}
	const keyParts = flatKey.split('_'); // tipos never contain underscores
	if (keyParts.length !== columns.length) {
		return null; // wrong arity for the named variant
	}
	return columns.map(([column, cast], index) => [column, cast, keyParts[index] as string]);
}

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

	// RELATION LEAVES — filter records whose `relation` column holds a locator
	// matching the given fields (the autocomplete filter_by_list pre-filter,
	// the picker's per-catalogue checkboxes). Both wire shapes resolve to the
	// SAME exact tuple-IN over matrix_relation_index — uncorrelated (hashed
	// semi-join, no join-order inversion) and carrying the owner's
	// section_tipo, so it is equivalence, not a superset. The index is the
	// ONLY engine — an uncovered table fails loudly (requireRelationIndex).
	//
	// format:'relation' (CANONICAL, 2026-07-21): q is one partial-locator
	//   object or an array of them (array = OR within the leaf, the
	//   filter_by_locators semantics). Fields = the locator vocabulary:
	//   section_tipo (required), section_id, from_component_tipo, type.
	//   Strictly validated — unknown fields, invalid tipos or a non-integer
	//   section_id throw (a new contract owes loud errors, not bug-compat).
	//
	// format:'function' (DEPRECATED reader, WC-012): the v6-era variant names
	//   (relations_flat_* / data_relations_flat_*) plus a flattened
	//   '<a>_<b>_<c>' key. The stored functions were REMOVED 2026-07-20 — the
	//   allowlisted name only selects the field layout the key parses into
	//   (tipos never contain underscores; the flat key travels as bound
	//   parameters). Kept so beta-era saved searches keep working; nothing in
	//   this tree emits it anymore.
	const leafFormat = (leaf as { format?: unknown }).format;
	if (leafFormat === 'relation' || leafFormat === 'function') {
		let locators: RelationLeafLocator[];
		if (leafFormat === 'relation') {
			locators = parseRelationLeafQ(leaf.q);
		} else {
			const legacy = parseLegacyFunctionLeaf(leaf as { use_function?: unknown; q?: unknown });
			if (legacy === null) {
				// malformed flat key — contributes nothing (the legacy contract)
				return { kind: 'leaf', result: false };
			}
			locators = [legacy];
		}
		await requireRelationIndex([leafTable]);
		const conditions: string[] = [];
		const tokenValues: Record<string, unknown> = {};
		let tokenIndex = 0;
		for (const locator of locators) {
			const parts: string[] = [];
			for (const [column, cast, value] of locator) {
				tokenIndex += 1;
				const name = `_Qf${tokenIndex}_`;
				parts.push(`r.${column} = ${name}::${cast}`);
				tokenValues[name] = value;
			}
			conditions.push(`(${parts.join(' AND ')})`);
		}
		const result = fragmentResult(
			`(${leafAlias}.section_tipo, ${leafAlias}.section_id) IN ` +
				`(SELECT r.section_tipo, r.section_id FROM matrix_relation_index r WHERE ${conditions.join(' OR ')})`,
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
