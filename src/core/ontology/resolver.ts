/**
 * Ontology resolver — READ-ONLY registry over the dd_ontology table (spec §3.1).
 *
 * Every runtime structure in Dédalo derives from ontology nodes. This module
 * answers the questions the engines need:
 *   - tipo → model            (which behavior resolves this node)
 *   - tipo → translatable     (does its data carry language variants)
 *   - model → matrix column   (which jsonb column stores its data)
 *   - section tipo → matrix table
 *
 * Data source: the SAME dd_ontology table the PHP server installs/maintains
 * (columns: tipo, parent, term, model, relations, properties, is_translatable…).
 * Ontology import/update stays PHP-owned (plan risk A5.3) — this resolver
 * never writes.
 *
 * CACHING: module-level Maps, keyed by tipo only. Ontology content carries no
 * request identity (no user/lang/session), so a process-wide cache is one of
 * the few legitimate module-level states (spec §4 discipline). PHP bounds its
 * caches for worker safety (COMP-05); we mirror that with a simple size cap.
 *
 * PHP references: ontology_node::get_model_by_tipo (:1109),
 * common::get_matrix_table_from_tipo (:828), section_record_data::$column_map.
 */

import { isInTransaction, sql } from '../db/postgres.ts';
import { createOntologyCache } from './cache_factory.ts';
import { registerOntologyCacheClearer } from './cache_invalidation.ts';
import { getSectionIdFromTipo } from './tld.ts';

/**
 * Non-component models that still resolve to a matrix column. Component models'
 * columns live in the component registry (descriptor.column); only the `section`
 * pseudo-model — which is not a component — remains here.
 * (PHP section_record_data::$column_map covered both; we split by concern.)
 */
const NON_COMPONENT_COLUMN_MAP: Readonly<Record<string, string>> = {
	section: 'data',
};

/**
 * S2-20 inversion seam: the ontology layer must not import components/registry
 * (that static edge closed the 33-file import SCC through descriptors →
 * relation models → back into this resolver). Instead the component registry
 * REGISTERS its model lookup here at its own module load — the
 * cache_invalidation.ts pattern: the registration target lives in the lower
 * module; the registrant calls it as a load side effect.
 *
 * Ordering: every real entrypoint (server.ts, diffusion/runner.ts,
 * ai/rag/cli/rag_drain.ts, the bun test preload) loads components/registry.ts
 * before resolving models. A caller that needs a component-model answer before
 * the registry is loaded is a boot-order bug — we throw loudly (never silently
 * misresolve an alias or column) with the one-line fix in the message.
 */

/** The two descriptor fields this resolver consumes (alias map + column map). */
type ComponentModelFieldsLookup = (
	model: string,
) => { readonly alias?: string; readonly column?: string } | undefined;

let componentModelFieldsLookup: ComponentModelFieldsLookup | null = null;

/** Called by components/registry.ts at module load (see the seam note above). */
export function registerComponentModelFieldsLookup(lookup: ComponentModelFieldsLookup): void {
	componentModelFieldsLookup = lookup;
}

function componentModelFields(
	model: string,
): { readonly alias?: string; readonly column?: string } | undefined {
	if (componentModelFieldsLookup === null) {
		throw new Error(
			'ontology/resolver: component-model lookup not registered — import ' +
				"'core/components/registry.ts' before resolving component models " +
				'(the server/runner/test-preload entrypoints do; a standalone script or test must too)',
		);
	}
	return componentModelFieldsLookup(model);
}

/** One resolved ontology node (the fields the engines consume). */
export interface ResolvedNode {
	tipo: string;
	model: string | null;
	parent: string | null;
	translatable: boolean;
	/** Raw properties JSON (request_config etc. live here). */
	properties: unknown;
	/** Raw relations JSON (links to matrix_table nodes etc.). */
	relations: unknown;
}

/** Bounded module cache (mirrors PHP COMP-05 worker-safety cap). */
const MAX_CACHE_ENTRIES = 10000;
const nodeCache = createOntologyCache<string, ResolvedNode | null>();

/**
 * S1-14 in-tx-read guard: never SEED a shared cache from inside an open
 * transaction. An in-tx read can observe rows the transaction itself has just
 * written (hierarchy provisioning reads nodes mid-provision); memoizing that
 * answer would leak uncommitted — or, after ROLLBACK, never-committed — state
 * process-wide. The read itself stays correct (it runs on the tx connection);
 * only the memoization is skipped. Cache HITS from before the tx are still
 * served: the hub's deferred clear (post-COMMIT replay) is what invalidates
 * those. The `<tld>0` matrix-table short-circuit is tipo-derived and
 * cache-independent, so mid-provisioning table resolution never lands here.
 */
function cacheWrite<K, V>(cache: Map<K, V>, key: K, value: V): void {
	if (isInTransaction()) return;
	cache.set(key, value);
}

/**
 * Clear ALL resolver caches (ontology fixtures in tests, ontology writes).
 *
 * Must drop the matrix-table and component-filter caches too, not just the node
 * cache: after a dd_ontology write those derived answers can be stale (e.g. a
 * freshly-provisioned `<tld>0` section resolves its matrix table from the new
 * node). Registered with the invalidation hub so any dd_ontology mutation fans
 * out to it.
 */
export function clearOntologyCaches(): void {
	nodeCache.clear();
	matrixTableCache.clear();
	componentFilterTipoCache.clear();
	descendantByModelCache.clear();
	relatedTipoByModelCache.clear();
}
registerOntologyCacheClearer(clearOntologyCaches);

function cacheSet(tipo: string, node: ResolvedNode | null): void {
	if (isInTransaction()) return; // S1-14 guard — see cacheWrite
	if (nodeCache.size >= MAX_CACHE_ENTRIES) {
		// Drop the oldest entries (Map preserves insertion order).
		const dropCount = Math.floor(MAX_CACHE_ENTRIES / 10);
		let dropped = 0;
		for (const key of nodeCache.keys()) {
			nodeCache.delete(key);
			if (++dropped >= dropCount) break;
		}
	}
	nodeCache.set(tipo, node);
}

/** Load one ontology node (cached). Returns null when the tipo does not exist. */
export async function getNode(tipo: string): Promise<ResolvedNode | null> {
	const cached = nodeCache.get(tipo);
	if (cached !== undefined) {
		return cached;
	}
	const rows = (await sql`
		SELECT tipo, model, parent, is_translatable, properties, relations
		FROM dd_ontology
		WHERE tipo = ${tipo}
		LIMIT 1
	`) as {
		tipo: string;
		model: string | null;
		parent: string | null;
		is_translatable: boolean | null;
		properties: unknown;
		relations: unknown;
	}[];
	const row = rows[0];
	const node: ResolvedNode | null =
		row === undefined
			? null
			: {
					tipo: row.tipo,
					model: row.model,
					parent: row.parent,
					translatable: row.is_translatable === true,
					properties: row.properties,
					relations: row.relations,
				};
	cacheSet(tipo, node);
	return node;
}

/**
 * Forced models for specific tipos (PHP ontology_node::get_model :420-450 —
 * v6/v7 transition overrides + temporal Time Machine column models).
 */
const FORCED_MODELS: Readonly<Record<string, string>> = {
	dd244: 'component_radio_button', // DEDALO_SECURITY_ADMINISTRATOR_TIPO
	dd1725: 'component_select', // DEDALO_USER_PROFILE_TIPO
	dd546: 'component_input_text', // activity where
	dd545: 'component_select', // activity what
	dd544: 'component_input_text', // activity ip
	dd551: 'component_json', // activity data
	hierarchy48: 'component_number', // hierarchy order
	dd1067: 'component_check_box', // tools component_security_tools
	hierarchy45: 'component_portal', // hierarchy main: General term
	hierarchy59: 'component_portal', // hierarchy main: General term model
	// temporal TM column models (until the ontology is updated)
	dd1573: 'component_number',
	dd1212: 'component_number',
	dd1772: 'component_input_text',
	dd577: 'component_input_text',
	dd559: 'component_date',
	dd578: 'component_portal',
	dd1371: 'component_number',
	dd1574: 'component_json',
};

/**
 * Legacy STRUCTURAL model replacements (PHP ontology_node::get_model :493-507).
 * Component-model aliases (component_input_text_large → component_text_area,
 * component_autocomplete(_hi) → component_portal, …) now live in the component
 * registry as descriptor.alias; only these non-component structural aliases
 * (section groups/tabs and the "box elements" containers) remain here.
 */
const STRUCTURAL_MODEL_REPLACEMENT_MAP: Readonly<Record<string, string>> = {
	section_group_div: 'section_group',
	tab: 'section_tab',
	component_relation_struct: 'box elements',
	dataframe: 'box elements',
};

/**
 * tipo → RUNTIME model name (PHP ontology_node::get_model_by_tipo): forced
 * tipo overrides win, then the stored model passes through the legacy
 * replacement map (component aliases via the component registry, structural
 * aliases via the residual map). Null when unknown.
 */
export async function getModelByTipo(tipo: string): Promise<string | null> {
	const forced = FORCED_MODELS[tipo];
	if (forced !== undefined) return forced;
	const storedModel = (await getNode(tipo))?.model ?? null;
	if (storedModel === null) return null;
	// component_alias hop (WC-020, ontology/alias.ts owns the contract): the
	// alias behaves as its TARGET everywhere the runtime model is consumed —
	// the client instantiates the target's JS class, the engines dispatch the
	// target's behavior. Single hop; the full validation (retired keys etc.)
	// lives in resolveAliasTargetTipo — here only the minimal fail-loud reads
	// (this module must not import alias.ts: alias.ts imports getNode).
	if (storedModel === 'component_alias') {
		return getModelByTipo(await aliasTargetTipoOf(tipo));
	}
	return (
		componentModelFields(storedModel)?.alias ??
		STRUCTURAL_MODEL_REPLACEMENT_MAP[storedModel] ??
		storedModel
	);
}

/** Minimal alias_of read shared by the two resolver hops — target tipo of a
 * KNOWN component_alias node (fail loud on the contract basics; the richer
 * checks live in ontology/alias.ts). */
async function aliasTargetTipoOf(tipo: string): Promise<string> {
	const aliasOf = ((await getNode(tipo))?.properties as { alias_of?: unknown } | null)?.alias_of;
	if (typeof aliasOf !== 'string' || aliasOf === '') {
		throw new Error(`component_alias '${tipo}': properties.alias_of is required (WC-020)`);
	}
	const target = await getNode(aliasOf);
	if (target === null) {
		throw new Error(`component_alias '${tipo}': alias_of target '${aliasOf}' does not exist`);
	}
	if (target.model === 'component_alias') {
		throw new Error(
			`component_alias '${tipo}': alias-of-alias refused ('${tipo}' → '${aliasOf}' → …) — single hop only (WC-020)`,
		);
	}
	return aliasOf;
}

/** tipo → translatable flag (PHP ontology_node::get_translatable). */
export async function getTranslatableByTipo(tipo: string): Promise<boolean> {
	const node = await getNode(tipo);
	if (node?.model === 'component_alias') {
		return getTranslatableByTipo(await aliasTargetTipoOf(tipo));
	}
	return node?.translatable ?? false;
}

/** model → matrix jsonb column (PHP section_record_data::get_column_name). */
export function getColumnNameByModel(model: string): string | null {
	return componentModelFields(model)?.column ?? NON_COMPONENT_COLUMN_MAP[model] ?? null;
}

/**
 * All descendant component tipos of a section, walking the ontology subtree by
 * `parent` without crossing into nested sections/areas (same containment rule
 * as getComponentFilterTipo). Used by the RAG config to enumerate a section's
 * embeddable text components. Not cached — callers cache the filtered result.
 */
export async function getRecursiveChildrenTipos(sectionTipo: string): Promise<string[]> {
	const rows = (await sql`
		WITH RECURSIVE subtree AS (
			SELECT tipo, model FROM dd_ontology WHERE parent = ${sectionTipo}
			UNION ALL
			SELECT child.tipo, child.model
			FROM dd_ontology child
			JOIN subtree ON child.parent = subtree.tipo
			WHERE subtree.model NOT IN ('section')
			  AND subtree.model NOT LIKE 'area%'
		)
		SELECT tipo FROM subtree
	`) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

/**
 * tipo → term (label) in a given lang, or null. Reads the dd_ontology `term`
 * translations map; used for the RAG chunker's contextual document title.
 * Best-effort: falls back to the structure lang, then any non-empty term.
 */
export async function getTermByTipo(tipo: string, lang: string): Promise<string | null> {
	const rows = (await sql`SELECT term FROM dd_ontology WHERE tipo = ${tipo} LIMIT 1`) as {
		term: Record<string, string> | null;
	}[];
	const term = rows[0]?.term ?? null;
	if (term === null) return null;
	return term[lang] ?? term['lg-spa'] ?? Object.values(term).find((value) => value) ?? null;
}

// ---------------------------------------------------------------------------
// T3 CANONICAL SUBTREE ACCESSORS (audit S2-19 / DEC-09 tier T3).
//
// dd_ontology tree reads consolidate HERE: this module is the one place that
// decides the walk semantics every caller used to re-decide independently —
// the section containment rule, the virtual-section fallback, and the sibling
// ORDER/TIEBREAK policy. New code must use these instead of hand-rolling a
// `WITH RECURSIVE` over dd_ontology; the existing direct walks are being
// burned down behind the count-ratchet in
// test/unit/sql_confinement_tripwire.test.ts.
// ---------------------------------------------------------------------------

/** One node of an ordered ontology subtree walk. */
export interface OntologySubtreeNode {
	tipo: string;
	parent: string | null;
	model: string | null;
	term: Record<string, string> | null;
	properties: unknown;
	relations: unknown;
	/** Numeric order_number; Infinity when the column is NULL (sorts last). */
	orderNumber: number;
}

/**
 * THE canonical sibling order policy (single source of truth): order_number
 * ASC with NULLs last, lexicographic tipo tiebreak. PHP walks children ORDER
 * BY order_number ASC (dd_ontology_db_manager::search) and leaves equal
 * order_numbers UNORDERED; the tipo tiebreak pins the observed live order
 * deterministically (same rule the diffusion walks documented at
 * diffusion_bridge/diffusion_map.ts:306-328 / diffusion/plan/virtual_tree.ts:191-195).
 */
export function compareSiblingOrder(
	a: Pick<OntologySubtreeNode, 'orderNumber' | 'tipo'>,
	b: Pick<OntologySubtreeNode, 'orderNumber' | 'tipo'>,
): number {
	if (a.orderNumber !== b.orderNumber) return a.orderNumber < b.orderNumber ? -1 : 1;
	return a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : 0;
}

function toSubtreeNode(row: {
	tipo: string;
	parent: string | null;
	model: string | null;
	term: Record<string, string> | null;
	properties: unknown;
	relations: unknown;
	order_number: number | string | null;
}): OntologySubtreeNode {
	return {
		tipo: row.tipo,
		parent: row.parent,
		model: row.model,
		term: row.term,
		properties: row.properties,
		relations: row.relations,
		orderNumber:
			row.order_number === null || row.order_number === undefined
				? Number.POSITIVE_INFINITY
				: Number(row.order_number),
	};
}

/**
 * ORDERED SUBTREE WALK: every descendant of `rootTipo` in depth-first
 * pre-order, siblings ordered by the canonical policy (compareSiblingOrder).
 *
 * Containment: by default the walk does NOT descend through nested section /
 * area nodes (the standard section-subtree rule shared with
 * getComponentFilterTipo; the pruned node itself IS returned). Pass
 * `crossSections: true` for a full structural walk (the diffusion-map shape).
 *
 * NOT cached — the full-tree consumers cache their derived structures; the
 * per-lookup consumers use the cached findFirstDescendantTipoByModel below.
 */
export async function getOrderedSubtree(
	rootTipo: string,
	options: { includeRoot?: boolean; crossSections?: boolean } = {},
): Promise<OntologySubtreeNode[]> {
	const guard = options.crossSections
		? ''
		: `WHERE subtree.model IS DISTINCT FROM 'section' AND (subtree.model IS NULL OR subtree.model NOT LIKE 'area%')`;
	const rows = (await sql.unsafe(
		`WITH RECURSIVE subtree AS (
			SELECT tipo, parent, model, term, properties, relations, order_number
			FROM dd_ontology WHERE parent = $1
			UNION ALL
			SELECT child.tipo, child.parent, child.model, child.term, child.properties, child.relations, child.order_number
			FROM dd_ontology child
			JOIN subtree ON child.parent = subtree.tipo
			${guard}
		)
		SELECT tipo, parent, model, term, properties, relations, order_number FROM subtree`,
		[rootTipo],
	)) as Parameters<typeof toSubtreeNode>[0][];
	const nodes = rows.map(toSubtreeNode);
	const byParent = new Map<string, OntologySubtreeNode[]>();
	for (const node of nodes) {
		if (node.parent === null) continue;
		const siblings = byParent.get(node.parent) ?? [];
		siblings.push(node);
		byParent.set(node.parent, siblings);
	}
	for (const siblings of byParent.values()) siblings.sort(compareSiblingOrder);
	// Depth-first pre-order from the root using the sorted sibling lists.
	const ordered: OntologySubtreeNode[] = [];
	const walk = (parentTipo: string): void => {
		for (const child of byParent.get(parentTipo) ?? []) {
			ordered.push(child);
			walk(child.tipo);
		}
	};
	walk(rootTipo);
	if (options.includeRoot) {
		const rootRows = (await sql.unsafe(
			`SELECT tipo, parent, model, term, properties, relations, order_number
			 FROM dd_ontology WHERE tipo = $1 LIMIT 1`,
			[rootTipo],
		)) as Parameters<typeof toSubtreeNode>[0][];
		const rootRow = rootRows[0];
		if (rootRow !== undefined) ordered.unshift(toSubtreeNode(rootRow));
	}
	return ordered;
}

/**
 * CHILDREN-OF: the DIRECT children of one node, in canonical sibling order.
 */
export async function getChildrenNodes(parentTipo: string): Promise<OntologySubtreeNode[]> {
	const rows = (await sql`
		SELECT tipo, parent, model, term, properties, relations, order_number
		FROM dd_ontology WHERE parent = ${parentTipo}
	`) as Parameters<typeof toSubtreeNode>[0][];
	return rows.map(toSubtreeNode).sort(compareSiblingOrder);
}

/**
 * PROPERTIES-OF: one node's raw properties JSON (request_config, diffusion
 * config, tool config … all live here), through the cached node loader — so
 * a properties read after an ontology write is hub-coherent instead of racing
 * a stale nodeCache against a fresh ad-hoc SELECT. Null for unknown tipos and
 * for nodes without properties.
 */
export async function getPropertiesByTipo(tipo: string): Promise<unknown> {
	return (await getNode(tipo))?.properties ?? null;
}

/**
 * FIRST DESCENDANT BY MODEL: the classic
 * `get_ar_children_tipo_by_model_name_in_section(...) → first hit` shape that
 * children.ts / ts_object.ts / area/tree.ts / section_id_component.ts each
 * hand-rolled (audit S2-19). Recursive parent-link walk from `rootTipo`, NOT
 * descending through nested section/area nodes; the first match by
 * lexicographic tipo (the deterministic tiebreak the diffusion resolver
 * pinned — these are singleton-by-design components, so the tiebreak only
 * matters for pathological duplicate declarations).
 *
 * `virtualFallback` (default true): when the walk finds nothing, resolve a
 * VIRTUAL section through its real section (relations[0].tipo) and walk that
 * — the shared fallback every migrated caller implemented separately. Pass
 * false to preserve strict own-subtree semantics (component_section_id).
 * component_filter MUST use the fallback: a virtual section's records are
 * gated by the real section's filter (see getComponentFilterTipo).
 *
 * Cached per (root, model, fallback); registered with the invalidation hub.
 */
const descendantByModelCache = createOntologyCache<string, string | null>();

export async function findFirstDescendantTipoByModel(
	rootTipo: string,
	model: string,
	options: { virtualFallback?: boolean } = {},
): Promise<string | null> {
	const virtualFallback = options.virtualFallback !== false;
	const cacheKey = `${rootTipo}|${model}|${virtualFallback ? 'v' : 's'}`;
	const cached = descendantByModelCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const walk = async (root: string): Promise<string | null> => {
		const rows = (await sql`
			WITH RECURSIVE subtree AS (
				SELECT tipo, model FROM dd_ontology WHERE parent = ${root}
				UNION ALL
				SELECT child.tipo, child.model
				FROM dd_ontology child
				JOIN subtree ON child.parent = subtree.tipo
				WHERE subtree.model NOT IN ('section')
				  AND subtree.model NOT LIKE 'area%'
			)
			SELECT tipo FROM subtree WHERE model = ${model} ORDER BY tipo LIMIT 1
		`) as { tipo: string }[];
		return rows[0]?.tipo ?? null;
	};

	let found = await walk(rootTipo);
	if (found === null && virtualFallback) {
		// Virtual section: its relations point at the REAL section — walk that.
		const relations = (await getNode(rootTipo))?.relations;
		const realTipo = Array.isArray(relations)
			? (relations[0] as { tipo?: unknown } | undefined)?.tipo
			: undefined;
		if (typeof realTipo === 'string' && realTipo !== rootTipo) {
			found = await walk(realTipo);
		}
	}
	cacheWrite(descendantByModelCache, cacheKey, found);
	return found;
}

/**
 * The component_filter child tipo of a section (PHP
 * section::get_ar_children_tipo_by_model_name_in_section(...,['component_filter'],
 * …, resolve_virtual=TRUE — trait.where.php build_sql_projects_filter)), or
 * null when the section is NOT project-gated.
 *
 * VIRTUAL SECTIONS MUST FALL THROUGH to their real section: records of a
 * virtual section (e.g. rsc170 images) are stored under the VIRTUAL tipo but
 * gated by the REAL section's component_filter (rsc2 → rsc28). The previous
 * strict own-subtree lookup returned null for them, which silently DISABLED
 * the projects ACL — every non-admin saw all 438k images (fail-open,
 * 2026-07-19). PHP resolves virtual→real before walking; the shared helper's
 * own-subtree-then-real fallback is equivalent because virtual sections carry
 * only list/config children, never components.
 */
const componentFilterTipoCache = createOntologyCache<string, string | null>();

export async function getComponentFilterTipo(sectionTipo: string): Promise<string | null> {
	const cached = componentFilterTipoCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	const filterTipo = await findFirstDescendantTipoByModel(sectionTipo, 'component_filter', {
		virtualFallback: true,
	});
	cacheWrite(componentFilterTipoCache, sectionTipo, filterTipo);
	return filterTipo;
}

/**
 * The first tipo in a node's `relations` JSON whose model CONTAINS `model`
 * (PHP ontology_node::get_ar_tipo_by_model_and_relation(tipo, model, 'related')
 * first hit — substring match, search_exact=false, so 'component_av' also
 * matches hypothetical variants; PHP str_contains). Null when the node has no
 * matching relation. Used by e.g. component_text_area::
 * get_related_component_av_tipo (the transcription text ↔ AV player pairing
 * tool_transcription's build_subtitles_file resolves through).
 *
 * Cached per (tipo, model) — the value is pure ontology (no lang/principal
 * dimension), so the hub-registered ontology cache is the right lifecycle.
 */
const relatedTipoByModelCache = createOntologyCache<string, string | null>();

export async function relatedTipoByModel(tipo: string, model: string): Promise<string | null> {
	const cacheKey = `${tipo}|${model}`;
	const cached = relatedTipoByModelCache.get(cacheKey);
	if (cached !== undefined) return cached;

	let resolved: string | null = null;
	const relations = (await getNode(tipo))?.relations;
	if (Array.isArray(relations)) {
		for (const relation of relations) {
			const relatedTipo = (relation as { tipo?: unknown } | null)?.tipo;
			if (typeof relatedTipo !== 'string' || relatedTipo === '') continue;
			const relatedModel = await getModelByTipo(relatedTipo);
			if (relatedModel?.includes(model)) {
				resolved = relatedTipo;
				break;
			}
		}
	}
	cacheWrite(relatedTipoByModelCache, cacheKey, resolved);
	return resolved;
}

/**
 * section tipo → matrix table (PHP common::get_matrix_table_from_tipo).
 * Resolution: hardcoded users/projects cases, then the section's ontology
 * relations pointing at a node of model 'matrix_table' whose term holds the
 * table name; default 'matrix'.
 */
const matrixTableCache = createOntologyCache<string, string | null>();

export async function getMatrixTableFromTipo(sectionTipo: string): Promise<string | null> {
	const cached = matrixTableCache.get(sectionTipo);
	if (cached !== undefined) {
		return cached;
	}
	let table: string | null;
	if (sectionTipo === 'all') {
		table = null;
	} else if (getSectionIdFromTipo(sectionTipo) === '0') {
		// ONTOLOGY SECTIONS exception (PHP common::get_matrix_table_from_tipo
		// :861-870): any tipo whose section_id part is '0' is an ontology main
		// section and lives in matrix_ontology — resolved BEFORE the node lookup
		// so a not-yet-installed local `<tld>0` (whose dd_ontology node may be
		// absent mid-provisioning) still routes to the right table.
		table = 'matrix_ontology';
	} else {
		// PHP contract: unknown tipos and non-section models resolve to NULL —
		// only a real section falls back to the default 'matrix' table when it
		// carries no explicit matrix_table relation.
		const node = await getNode(sectionTipo);
		if (node === null || node.model !== 'section') {
			table = null;
		} else if (sectionTipo === 'dd153') {
			table = 'matrix_projects'; // PHP fixed case (DEDALO_SECTION_PROJECTS_TIPO)
		} else if (sectionTipo === 'dd128') {
			table = 'matrix_users'; // PHP fixed case (DEDALO_SECTION_USERS_TIPO)
		} else {
			table = await relatedMatrixTable(sectionTipo);
			if (table === null) {
				// VIRTUAL SECTION fallback (PHP get_section_real_tipo_static): a
				// virtual section's relations point at its REAL section — resolve
				// the real tipo and read ITS matrix_table relation instead.
				const realRows = (await sql`
					SELECT t.tipo
					FROM dd_ontology s,
					     jsonb_array_elements(s.relations) AS rel(link)
					JOIN dd_ontology t ON t.tipo = rel.link->>'tipo' AND t.model = 'section'
					WHERE s.tipo = ${sectionTipo}
					  AND jsonb_typeof(s.relations) = 'array'
					LIMIT 1
				`) as { tipo: string }[];
				const realTipo = realRows[0]?.tipo;
				if (realTipo !== undefined && realTipo !== sectionTipo) {
					table = await relatedMatrixTable(realTipo);
				}
			}
			table = table ?? 'matrix'; // PHP default-table fallback
		}
	}
	// INJ-02 central identifier guard: the resolved table name is interpolated
	// verbatim into `"${table}"` at ~20 write/resolve SQL sites that (unlike the
	// read path) do not re-assert it. A poisoned ontology term (dd627 label) is
	// only reachable with ontology-write compromise, but this makes it structurally
	// impossible for such a value to break out of the identifier quoting. Every
	// real matrix table (incl. matrix_time_machine, matrix_structurations — which
	// are outside MATRIX_TABLE_ALLOWLIST) matches this safe SQL-identifier shape.
	if (table !== null && !/^[a-z_][a-z0-9_]*$/.test(table)) {
		throw new Error(
			`ontology: refusing unsafe matrix table name '${table}' for '${sectionTipo}' (INJ-02 identifier guard)`,
		);
	}
	cacheWrite(matrixTableCache, sectionTipo, table);
	return table;
}

/**
 * The matrix_table related to one section node, or null when the node carries
 * no explicit matrix_table relation. dd_ontology.relations is an array of
 * {tipo} links — join against nodes of model 'matrix_table' and read the
 * table name from their term (any language key; they are plain). Guard: only
 * unnest when relations is a JSON array — some nodes carry a non-array (or
 * null) relations column, which would make jsonb_array_elements raise 22023.
 */
async function relatedMatrixTable(sectionTipo: string): Promise<string | null> {
	const rows = (await sql`
		SELECT t.term
		FROM dd_ontology s,
		     jsonb_array_elements(s.relations) AS rel(link)
		JOIN dd_ontology t ON t.tipo = rel.link->>'tipo' AND t.model = 'matrix_table'
		WHERE s.tipo = ${sectionTipo}
		  AND jsonb_typeof(s.relations) = 'array'
		LIMIT 1
	`) as { term: Record<string, string> | null }[];
	const term = rows[0]?.term ?? null;
	if (term === null) return null;
	// PHP reads the table name in DEDALO_STRUCTURE_LANG (lg-spa) — some
	// matrix_table nodes carry stray terms in other langs (e.g. dd1200).
	return term['lg-spa'] ?? Object.values(term).find((value) => value) ?? null;
}

/** One entry of the section census (listSectionNodes). */
export interface SectionNodeEntry {
	tipo: string;
	/** Multilingual term object (raw dd_ontology.term). */
	term: Record<string, string> | null;
}

/**
 * SECTION CENSUS: every dd_ontology node of model 'section', with its raw
 * multilingual term. This is the discovery backbone (MCP dedalo_list_sections,
 * name→tipo resolution): callers filter it further (matrix-table resolution,
 * per-principal ACL) — the census itself is ontology-only and carries no
 * permission semantics. Cached; hub-cleared on any dd_ontology write.
 */
const sectionCensusCache = createOntologyCache<string, SectionNodeEntry[]>();

export async function listSectionNodes(): Promise<SectionNodeEntry[]> {
	const cached = sectionCensusCache.get('census');
	if (cached !== undefined) return cached;
	const rows = (await sql`
		SELECT tipo, term FROM dd_ontology WHERE model = 'section' ORDER BY tipo
	`) as { tipo: string; term: Record<string, string> | null }[];
	const census = rows.map((row) => ({ tipo: row.tipo, term: row.term }));
	cacheWrite(sectionCensusCache, 'census', census);
	return census;
}
