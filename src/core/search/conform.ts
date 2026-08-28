/**
 * SQO conform stage (Phase A of the two-phase search pipeline, spec §3.3).
 *
 * Walks the sanitized SQO's filter tree; for every LEAF:
 *   1. validates all identifiers at the §7.6 chokepoint (tipos, lang),
 *   2. resolves the component's model/column/translatability from the ontology,
 *   3. dispatches to the per-model fragment builder,
 * and returns a ConformedFilter tree whose leaves carry BuilderResults
 * (`fragment` — never an envelope `result`).
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

import { readString } from '../../config/readers.ts';
import { getSearchBuilderFamily } from '../components/registry.ts';
import type { SqoFilterLeaf, SqoFilterNode } from '../concepts/sqo.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import {
	getColumnNameByModel,
	getModelByTipo,
	getNode,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import {
	frontierComponentAllowed,
	noteFrontierRefusal,
	type SqlFrontierScope,
} from '../security/frontier_scope.ts';
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
const _DEFAULT_DATA_LANG = readString('DATA_LANG');

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
	/** `fragment` is the leaf's BuilderResult — the SQL it contributes, `false` when it contributes nothing. */
	| { kind: 'leaf'; fragment: BuilderResult; joins?: JoinFragment[] };

/**
 * THE PER-REQUEST ACL A MULTI-HOP PATH MUST OBEY (SEC-02, 2026-08-28).
 *
 * A hop is a READ of another section's records: `LEFT JOIN LATERAL` unnests a
 * stored locator and joins the target row, and the leaf predicate is then built
 * against THAT alias. Before this scope existed neither `conformLeaf` nor
 * {@link buildJoinChain} received a principal, and `buildSearchSql` emitted its
 * ACL clauses (projects containment + the dd478 record filter) against the MAIN
 * alias ONLY — so the WHERE clause of a listing the caller IS allowed to run
 * could name a component of a record the caller is NOT allowed to see, and the
 * row's presence answered a question about it. With begins-with, ends-with,
 * contains and `==` all available, that is a PREFIX ORACLE: the hidden value
 * comes out character by character.
 *
 * THE SCOPE OBJECT ITSELF LIVES IN `core/security/frontier_scope.ts` — one
 * shape for the search, the export and the diffusion frontier, with the refusal
 * law for all three written down beside it. This module only re-exports the
 * name it threads, so a reader of the search path finds the type without a
 * second definition existing anywhere.
 */
export type { SqlFrontierScope } from '../security/frontier_scope.ts';

/**
 * Build the PHP build_sql_join chain for a multi-hop path: per hop, a
 * LATERAL unnest of the previous alias's relation key + a LEFT JOIN of the
 * target matrix table on the unnested locator identity. Aliases derive
 * deterministically from the path chain (identical paths dedup to the same
 * joined rows — the PHP rule). Used by filter leaves AND order paths.
 *
 * ACL (SEC-02): when a {@link SqlFrontierScope} is threaded in, every hop
 * carries BOTH frontier keys (frontier_scope.ts property 2):
 *
 *   1. the RECORD key — the caller's projects/dd478 predicate, emitted in the
 *      join's ON clause (never the WHERE: see SqlFrontierScope's docblock).
 *   2. the COMPONENT key — `frontierComponentAllowed`, i.e. `ddoIsAuthorized`
 *      on this step's own (section, component), under the frontier exemptions.
 *      That is the SAME predicate that decides whether the client could
 *      legitimately BUILD this path at all: a multi-hop filter path is minted
 *      by the client from `search.ddo_map` / `show.ddo_map` (common.js
 *      build_rqo_search → get_ar_inverted_paths, one path per leaf ddo), and
 *      `section/read.ts` buildStructureContextEntries DROPS any ddo that fails
 *      `ddoIsAuthorized(principal, ddoSectionTipo, ddo.tipo)`.
 *
 * A refused step is reported through `authorized:false` — never thrown, never
 * silent: the caller applies the SEARCH refusal law (identical hit and miss)
 * and `noteFrontierRefusal` has already written the operator log line and the
 * request's notice.
 *
 * The step's DECLARED section is authoritative for both keys, exactly as it
 * already is for the table, the component model and the data column: a stored
 * locator naming another section in the same table is being interpreted with
 * this section's ontology either way.
 */
export async function buildJoinChain(
	path: { section_tipo?: string; component_tipo?: string }[],
	mainAlias: string,
	scope?: SqlFrontierScope,
): Promise<{
	joins: JoinFragment[];
	lastAlias: string;
	lastTable: string;
	/** False when the principal holds no read grant on some step's component. */
	authorized: boolean;
}> {
	const { getMatrixTableFromTipo } = await import('../ontology/resolver.ts');
	const joins: JoinFragment[] = [];
	let previousAlias = mainAlias;
	let lastTable = '';
	let authorized = true;
	const aliasChain: string[] = [];
	for (let index = 1; index < path.length; index++) {
		const step = path[index] as { section_tipo?: string; component_tipo?: string };
		const hopComponent = (path[index - 1] as { component_tipo?: string }).component_tipo;
		const stepSection = step.section_tipo;
		if (stepSection === undefined || hopComponent === undefined) {
			throw new DedaloError('search.invalid_sqo', {
				message: 'search conform: a multi-hop path step needs section_tipo + component_tipo',
				publicMessage: 'Every step of a multi-hop search path needs a section and a component',
			});
		}
		assertValidTipo(stepSection, 'join path');
		// A HOP component is unnested as `relation-><tipo>`, so it must be a real
		// ontology tipo — never one of the bare data columns the §7.6 gate also
		// admits for a LEAF (`assertValidTipoOrColumn`, e.g. ordering by
		// 'section_id'). This is the ORDER twin's long-standing strictness; the
		// FILTER twin inherited it when conformLeaf stopped copy-pasting this loop
		// (2026-08-28). It narrows nothing a producer sends — measured, no shipped
		// caller names a column at an INTERMEDIATE step (the client builds every
		// path step from a ddo's own tipo, and the suite ontology holds zero
		// multi-hop fixed_filter paths) — and what it used to do instead was
		// unnest a key no relation column has and match nothing, silently.
		assertValidTipo(hopComponent, 'join path');
		// component_alias (WC-020): stored locators live under the TARGET's key.
		const { resolveDataTipo } = await import('../ontology/alias.ts');
		const hopDataTipo = await resolveDataTipo(hopComponent);
		const stepTable = await getMatrixTableFromTipo(stepSection);
		if (stepTable === null) {
			throw new DedaloError('search.invalid_sqo', {
				message: `search conform: no matrix table for join step '${stepSection}'`,
				publicMessage: 'A section named in the search path holds no records',
				coordinates: { step_section_tipo: stepSection },
			});
		}
		aliasChain.push(`${hopDataTipo}_${stepSection}`);
		const joinAlias = `j_${aliasChain.join('_')}`;
		const relationAlias = `rel_${joinAlias}`;
		// ON-clause conjuncts: the locator identity, then the caller's record ACL.
		const onParts = [
			`${joinAlias}.section_id = NULLIF((${relationAlias}->>'section_id'), '')::bigint`,
			`${joinAlias}.section_tipo = (${relationAlias}->>'section_tipo')::text`,
		];
		if (scope !== undefined) {
			// This step's OWN component: the leaf component on the last step, the
			// next hop's relation component on an intermediate one — both are read
			// through this alias, so both need the grant.
			const frontierStep = {
				sectionTipo: stepSection,
				...(step.component_tipo === undefined ? {} : { componentTipo: step.component_tipo }),
				table: stepTable,
			};
			if (!(await frontierComponentAllowed(scope, frontierStep))) {
				authorized = false;
				noteFrontierRefusal(scope, {
					surface: scope.surface,
					door: scope.door,
					sectionTipo: stepSection,
					...(step.component_tipo === undefined ? {} : { componentTipo: step.component_tipo }),
					key: 'component',
				});
			}
			const predicate = await scope.recordPredicate({
				sectionTipo: stepSection,
				table: stepTable,
				alias: joinAlias,
			});
			if (predicate !== '') onParts.push(`(${predicate})`);
		}
		joins.push({
			alias: joinAlias,
			sql:
				`LEFT JOIN LATERAL jsonb_array_elements(${previousAlias}.relation->'${hopDataTipo}') AS ${relationAlias} ON true\n` +
				`LEFT JOIN ${stepTable} AS ${joinAlias} ON ${onParts.join(' AND ')}`,
		});
		previousAlias = joinAlias;
		lastTable = stepTable;
	}
	return { joins, lastAlias: previousAlias, lastTable, authorized };
}

const BOOLEAN_OPERATORS: ReadonlySet<string> = new Set(['$and', '$or', '$not', '$nand', '$nor']);

/** Tables with no `relation_search` ancestor index (scalar TM relation data). */
const TIME_MACHINE_TABLES: ReadonlySet<string> = new Set([
	'matrix_time_machine',
	'matrix_activity',
]);

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
		throw new DedaloError('search.invalid_sqo', {
			message: "search conform: format 'relation' q must be a locator object or an array of them",
			publicMessage: "A 'relation' filter value must be a locator or an array of locators",
		});
	}
	const record = raw as Record<string, unknown>;
	if (typeof record.section_tipo !== 'string' || record.section_tipo === '') {
		throw new DedaloError('search.invalid_sqo', {
			message: "search conform: format 'relation' locator needs a section_tipo",
			publicMessage: "A 'relation' filter locator needs a section_tipo",
		});
	}
	const resolved: RelationLeafLocator = [];
	for (const [field, value] of Object.entries(record)) {
		const mapped = RELATION_LEAF_FIELDS[field];
		if (mapped === undefined) {
			throw new DedaloError('search.invalid_sqo', {
				message:
					`search conform: format 'relation' unknown locator field '${field}' ` +
					`(allowed: ${Object.keys(RELATION_LEAF_FIELDS).join(', ')})`,
				publicMessage: `A 'relation' filter locator accepts only: ${Object.keys(RELATION_LEAF_FIELDS).join(', ')}`,
				coordinates: { field },
			});
		}
		const [column, cast] = mapped;
		if (cast === 'int') {
			const id = String(value);
			if (!/^-?[0-9]+$/.test(id)) {
				throw new DedaloError('search.invalid_sqo', {
					message: `search conform: format 'relation' section_id '${String(value)}' is not an integer`,
					publicMessage: "A 'relation' filter section_id must be an integer",
				});
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
		throw new DedaloError('search.invalid_sqo', {
			message: "search conform: format 'relation' q array is empty",
			publicMessage: "A 'relation' filter needs at least one locator",
		});
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
		throw new DedaloError('search.invalid_sqo', {
			message: `search conform: format 'function' with unknown use_function '${String(leaf.use_function)}' (allowlist-only, never interpolated)`,
			publicMessage: "A 'function' filter names an unknown use_function",
			coordinates: { use_function: String(leaf.use_function) },
		});
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
	scope?: SqlFrontierScope,
): Promise<ConformedFilter> {
	const path = leaf.path ?? [];
	const lastStep = path[path.length - 1];
	if (lastStep === undefined) {
		return { kind: 'leaf', fragment: false };
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
	//
	// buildJoinChain IS the chain builder (it used to be copy-pasted here, which
	// is how the ORDER twin and the FILTER twin could drift): one home, so the
	// SEC-02 hop ACL cannot land on one of them only.
	let leafAlias = alias;
	let leafTable = table;
	const joins: JoinFragment[] = [];
	if (path.length > 1) {
		const chain = await buildJoinChain(
			path as { section_tipo?: string; component_tipo?: string }[],
			alias,
			scope,
		);
		joins.push(...chain.joins);
		leafAlias = chain.lastAlias;
		leafTable = chain.lastTable;
		if (!chain.authorized) {
			// SEC-02. A step names a component this principal holds 0 on. The leaf
			// answers FALSE for EVERY row — never a throw, and never a silent drop:
			//
			//  - FALSE makes HIT and MISS identical, which is precisely what closes
			//    the prefix oracle. The caller learns nothing about the hidden
			//    value, not even that a probe was refused (a refusal is itself a
			//    signal, and an error would also break the ONE unauthorized leaf of
			//    an autocomplete's `$or` filter_free for every user);
			//  - DROPPING the leaf ({fragment:false}) would be sound under `$or`
			//    and FAIL-OPEN under `$and`/`$not`, where removing a conjunct
			//    WIDENS the result set. `1=0` is safe under every operator: it
			//    contributes nothing to an OR, empties an AND, and negates to the
			//    same answer for every record.
			//
			// The join chain is still emitted (aliases dedup with other clauses'
			// identical paths, and the sort-select of an ORDER on the same path
			// must still resolve); it simply carries no leaf predicate that can
			// distinguish one hidden value from another.
			//
			// LOUD, THOUGH: buildJoinChain has already written the named
			// `[frontier] REFUSED …` operator log line and recorded the request's
			// `perm.out_of_scope` notice. The CALLER's answer is identical for hit
			// and miss — the oracle stays closed — while the OPERATOR can see that
			// the result set was narrowed and why. A narrowing nobody can observe
			// is what AGENTS.md forbids; a narrowing the attacker cannot observe is
			// what the refusal law requires. Both hold here.
			return { kind: 'leaf', fragment: fragmentResult('1=0'), joins };
		}
	}

	const componentTipo = lastStep.component_tipo;
	if (componentTipo === undefined) {
		return { kind: 'leaf', fragment: false };
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
				return { kind: 'leaf', fragment: false };
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
		return joins.length > 0
			? { kind: 'leaf', fragment: result, joins }
			: { kind: 'leaf', fragment: result };
	}

	// Ontology resolution. PHP ontology_utils::check_active_tld:271 allowlists
	// the PSEUDO tipo 'section_id' for SQO paths (the record id addressed as a
	// component — the rsc80 state-vocabulary fixed_filter is the live user);
	// there is no ontology node behind it, so resolve its model directly.
	const model =
		componentTipo === 'section_id' ? 'component_section_id' : await getModelByTipo(componentTipo);
	if (model === null) {
		throw new DedaloError('request.invalid_tipo', {
			message: `search conform: unknown component tipo '${componentTipo}'`,
			coordinates: { tipo: componentTipo },
		});
	}
	const column = getColumnNameByModel(model);
	if (column === null) {
		throw new DedaloError('request.invalid_model', {
			message: `search conform: no matrix column for model '${model}'`,
			coordinates: { tipo: componentTipo, model },
		});
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
	// date_mode (PHP get_date_search_context: `$properties->date_mode ?? 'date'`)
	// selects the per-mode date SQL handler. Read ONLY for date leaves — every
	// other family ignores it, and the effective-properties read is one more
	// (cached) ontology hop per leaf.
	let dateMode: string | undefined;
	if (model === 'component_date') {
		const { getEffectivePropertiesByTipo } = await import('../ontology/alias.ts');
		const properties = (await getEffectivePropertiesByTipo(componentTipo)) as {
			date_mode?: unknown;
		} | null;
		if (typeof properties?.date_mode === 'string' && properties.date_mode !== '') {
			dateMode = properties.date_mode;
		}
	}
	const context: BuilderContext = {
		alias: leafAlias,
		column,
		tipo: await resolveDataTipo(componentTipo),
		sectionTipo: lastStep.section_tipo ?? '',
		table: leafTable,
		lang,
		translatable,
		model,
		...(dateMode === undefined ? {} : { dateMode }),
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
		// ANCESTOR INDEX (PHP resolve_query_object_sql step 4 + add_relation_search):
		// the LEGACY component_autocomplete_hi model ALSO searches the
		// `relation_search` column, so a broader term matches the records filed
		// under its narrower ones ("search Spain, match Madrid" — the index
		// save_component.ts maintains on every save of one of these components).
		// Ledger: WC-2026-08-09-autocomplete-hi-ancestor-search.
		//
		// The decision belongs HERE and not in the relations registry: the
		// registry dispatches on the RUNTIME model, and component_autocomplete_hi
		// has already been replaced by component_portal by the time it gets
		// there. This is the last place holding the tipo — PHP resolves the same
		// question the same way, via ontology_node::get_legacy_model_by_tipo.
		//
		// The test must match the WRITER exactly (save_component.ts reads the
		// node's OWN stored model before calling maintainRelationSearchIndex):
		// wrapping a leaf whose index is never maintained would widen nothing and
		// would cost a second GIN probe per row. TM tables carry no such index
		// (their relation datum is the scalar user_id column) and are excluded.
		const usesAncestorIndex =
			!TIME_MACHINE_TABLES.has(leafTable) &&
			(await getNode(componentTipo))?.model === 'component_autocomplete_hi';
		if (usesAncestorIndex) {
			const { buildRelationSearchAncestorFragment } = await import(
				'./builders/builder_relation.ts'
			);
			result = buildRelationSearchAncestorFragment(leaf.q, leaf.q_operator ?? null, context);
		} else {
			const { getRelationSearchFragmentBuilder } = await import('../relations/registry.ts');
			const buildFragment = await getRelationSearchFragmentBuilder(model);
			result = await buildFragment(leaf.q, leaf.q_operator ?? null, context);
		}
	} else if (builderFamily !== undefined) {
		result = FAMILY_BUILDERS[builderFamily](
			leaf.q,
			leaf.q_operator ?? null,
			leaf.q_split === true,
			context,
		);
	} else {
		throw new DedaloError('engine.uncovered_scope', {
			message: `search conform: model '${model}' declares no searchBuilder family and is not a relation model — unsearchable through conform (ledgered, never silently narrowed)`,
			coordinates: { model },
		});
	}
	return joins.length > 0
		? { kind: 'leaf', fragment: result, joins }
		: { kind: 'leaf', fragment: result };
}

/** Recursively conform a filter node ($and/$or trees with leaves). */
export async function conformFilter(
	filter: SqoFilterNode | SqoFilterLeaf | Record<string, unknown>,
	alias: string,
	table: string,
	scope?: SqlFrontierScope,
): Promise<ConformedFilter> {
	// A node has exactly one boolean-operator key.
	const keys = Object.keys(filter);
	const opKey = keys.find((key) => BOOLEAN_OPERATORS.has(key));
	if (opKey !== undefined) {
		const rawItems = (filter as Record<string, unknown>)[opKey];
		const items: ConformedFilter[] = [];
		for (const item of Array.isArray(rawItems) ? rawItems : []) {
			if (item === false || item === null || item === undefined) continue;
			items.push(await conformFilter(item as Record<string, unknown>, alias, table, scope));
		}
		return { kind: 'group', op: opKey, items };
	}
	// Leaf (has a path).
	return conformLeaf(filter as SqoFilterLeaf, alias, table, scope);
}
