/**
 * Section-diffusion map (PHP diffusion_utils::get_section_diffusion_map):
 * which sections participate in ANY diffusion output — the O(1) lookup
 * behind tool_diffusion::is_available.
 *
 * Build (one flat VIRTUAL diffusion tree walk, v7 conventions — aliases
 * resolve flat, no v6 nested maps):
 *   1. domain node = the dd1190 child of model 'diffusion_domain' whose term
 *      equals the configured DEDALO_DIFFUSION_DOMAIN name;
 *   2. real nodes CONSUMED by an alias anywhere in the domain are skipped in
 *      their raw position (the alias re-parents them virtually);
 *   3. walk top-down; every node that sits UNDER a diffusion_element /
 *      diffusion_element_alias contributes its related 'section' tipos (the
 *      alias's REAL node's relations as fallback when the alias declares
 *      none); alias nodes also descend into their real node's children.
 *
 * No configured domain (env DEDALO_DIFFUSION_DOMAIN unset / no match) →
 * EMPTY map, matching PHP's fresh-install early return.
 */

import { readEnv } from '../../config/env.ts';
import { sql } from '../db/postgres.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { type OntologySubtreeNode, getOrderedSubtree } from '../ontology/resolver.ts';

const DIFFUSION_ROOT = 'dd1190'; // DEDALO_DIFFUSION_TIPO

interface OntologyNodeRow {
	tipo: string;
	parent: string | null;
	model: string;
	term: Record<string, string> | null;
	relations: { tipo?: string }[] | null;
}

let mapCache: Set<string> | null = null;

export function clearDiffusionMapCache(): void {
	mapCache = null;
}

/** Accessor node → this module's row shape (same fields the raw walk selected). */
function toNodeRow(node: OntologySubtreeNode): OntologyNodeRow {
	return {
		tipo: node.tipo,
		parent: node.parent,
		model: node.model ?? '',
		term: node.term,
		relations: node.relations as { tipo?: string }[] | null,
	};
}

function termOf(node: OntologyNodeRow | undefined): string | null {
	const term = node?.term;
	if (term === null || term === undefined) return null;
	return term['lg-spa'] ?? Object.values(term).find((value) => value !== '') ?? null;
}

/** Sections with diffusion (the map keys). Cached per process. */
export async function getSectionDiffusionMap(): Promise<Set<string>> {
	if (mapCache !== null) return mapCache;
	const map = new Set<string>();

	const domainName = readEnv('DEDALO_DIFFUSION_DOMAIN');
	if (domainName === undefined || domainName === '') {
		mapCache = map;
		return map;
	}

	// The whole diffusion subtree via the canonical accessor (S2-19/T3): full
	// structural walk (crossSections — dd1190 nests freely), root included.
	// The DFS pre-order groups siblings in canonical order, so the childrenOf
	// lists built below inherit it.
	const rows = (
		await getOrderedSubtree(DIFFUSION_ROOT, { includeRoot: true, crossSections: true })
	).map(toNodeRow);
	const byTipo = new Map(rows.map((row) => [row.tipo, row]));
	const childrenOf = new Map<string, string[]>();
	for (const row of rows) {
		if (row.parent === null) continue;
		const list = childrenOf.get(row.parent) ?? [];
		list.push(row.tipo);
		childrenOf.set(row.parent, list);
	}

	// Models of nodes OUTSIDE the subtree (alias targets, related sections).
	const externalModel = new Map<string, string>();
	const modelOf = async (tipo: string): Promise<string | null> => {
		const inTree = byTipo.get(tipo);
		if (inTree !== undefined) return inTree.model;
		const cached = externalModel.get(tipo);
		if (cached !== undefined) return cached;
		const found = (await sql.unsafe('SELECT model FROM dd_ontology WHERE tipo = $1', [tipo])) as {
			model: string;
		}[];
		const model = found[0]?.model ?? '';
		externalModel.set(tipo, model);
		return model === '' ? null : model;
	};
	const relationsOf = async (tipo: string): Promise<string[]> => {
		const inTree = byTipo.get(tipo);
		if (inTree !== undefined) {
			return (inTree.relations ?? [])
				.map((link) => link.tipo)
				.filter((t): t is string => typeof t === 'string');
		}
		const found = (await sql.unsafe('SELECT relations FROM dd_ontology WHERE tipo = $1', [
			tipo,
		])) as { relations: { tipo?: string }[] | null }[];
		return (found[0]?.relations ?? [])
			.map((link) => link.tipo)
			.filter((t): t is string => typeof t === 'string');
	};
	const relatedByModel = async (tipo: string, wanted: string): Promise<string[]> => {
		const out: string[] = [];
		for (const target of await relationsOf(tipo)) {
			if ((await modelOf(target)) === wanted) out.push(target);
		}
		return out;
	};

	// Domain node: dd1190 child of model diffusion_domain, term === configured name.
	let domainTipo: string | null = null;
	for (const child of childrenOf.get(DIFFUSION_ROOT) ?? []) {
		const node = byTipo.get(child);
		if (node?.model === 'diffusion_domain' && termOf(node) === domainName) {
			domainTipo = child;
			break;
		}
	}
	if (domainTipo === null) {
		mapCache = map;
		return map;
	}

	// Alias resolution: target = first RELATED node of model (alias's model
	// minus '_alias'), chained up to 10 hops.
	const resolveAlias = async (tipo: string, depth = 10): Promise<string | null> => {
		if (depth <= 0) return null;
		const model = (await modelOf(tipo)) ?? '';
		if (!model.includes('_alias')) return null;
		const targets = await relatedByModel(tipo, model.replace('_alias', ''));
		const target = targets[0] ?? null;
		if (target === null) return null;
		const targetModel = (await modelOf(target)) ?? '';
		return targetModel.includes('_alias') ? resolveAlias(target, depth - 1) : target;
	};

	// Real nodes consumed by an alias anywhere under the domain.
	const consumed = new Set<string>();
	const subtreeTipos: string[] = [];
	const collect = (tipo: string): void => {
		for (const child of childrenOf.get(tipo) ?? []) {
			subtreeTipos.push(child);
			collect(child);
		}
	};
	collect(domainTipo);
	for (const tipo of subtreeTipos) {
		const model = byTipo.get(tipo)?.model ?? '';
		if (model.includes('_alias')) {
			const real = await resolveAlias(tipo);
			if (real !== null) consumed.add(real);
		}
	}

	// External children lookup (alias real nodes may live outside the subtree).
	const externalChildren = new Map<string, string[]>();
	const childTipos = async (tipo: string): Promise<string[]> => {
		const inTree = childrenOf.get(tipo);
		if (inTree !== undefined || byTipo.has(tipo)) return inTree ?? [];
		const cached = externalChildren.get(tipo);
		if (cached !== undefined) return cached;
		const found = (await sql.unsafe('SELECT tipo FROM dd_ontology WHERE parent = $1', [tipo])) as {
			tipo: string;
		}[];
		const list = found.map((row) => row.tipo);
		externalChildren.set(tipo, list);
		return list;
	};

	const ELEMENT_MODELS = new Set(['diffusion_element', 'diffusion_element_alias']);
	const walk = async (tipo: string, underElement: boolean, depth: number): Promise<void> => {
		if (depth > 20) return;
		const model = (await modelOf(tipo)) ?? '';
		const isAlias = model.includes('_alias');
		if (!isAlias && consumed.has(tipo)) return; // re-parented by an alias
		const realTipo = isAlias ? await resolveAlias(tipo) : null;

		if (underElement) {
			let sections = await relatedByModel(tipo, 'section');
			if (sections.length === 0 && realTipo !== null) {
				sections = await relatedByModel(realTipo, 'section');
			}
			for (const sectionTipo of sections) map.add(sectionTipo);
		}

		const nextUnder = underElement || ELEMENT_MODELS.has(model);
		const children = new Set(await childTipos(tipo));
		if (isAlias && realTipo !== null) {
			for (const child of await childTipos(realTipo)) children.add(child);
		}
		for (const child of children) {
			await walk(child, nextUnder, depth + 1);
		}
	};
	await walk(domainTipo, false, 0);

	mapCache = map;
	return map;
}

/** tool_diffusion::is_available — sections only, O(1) map lookup. */
export async function haveSectionDiffusion(sectionTipo: string): Promise<boolean> {
	return (await getSectionDiffusionMap()).has(sectionTipo);
}

/** One publish target of a section (PHP diffusion_delete step 2). */
export interface DiffusionSqlTarget {
	element_tipo: string;
	type: string;
	database_name: string;
	table_name: string;
	/** true when the emitting node is a table_alias (real tables win selection). */
	table_is_alias?: boolean;
}

let targetsCache: Map<string, DiffusionSqlTarget[]> | null = null;

export function clearDiffusionTargetsCache(): void {
	targetsCache = null;
}

/**
 * Per-section publish targets (PHP get_section_diffusion_nodes + the
 * diffusion_delete grouping): every virtual node under a diffusion element
 * that relates to the section becomes a target — for 'sql'/'socrata'
 * elements the pair (database node label under the element, the related
 * node's alias-aware label) is the published table address. File-based
 * types (rdf/xml/markdown) are collected with empty db/table (the caller
 * ledgers them).
 */
export async function getSectionDiffusionTargets(
	sectionTipo: string,
): Promise<DiffusionSqlTarget[]> {
	if (targetsCache === null) {
		targetsCache = await buildDiffusionTargets();
	}
	return targetsCache.get(sectionTipo) ?? [];
}

/** One media-index publication target (PHP resolve_media_index_targets). */
export interface MediaIndexTarget {
	database_name: string;
	table_name: string;
	section_tipo: string;
}

/**
 * EVERY sql/socrata publication target of the diffusion map, deduped by
 * (database, table, section) — PHP
 * dd_diffusion_api::resolve_media_index_targets. File-based elements
 * (rdf/xml/markdown) and targets without a database or table name are
 * skipped, as PHP does. PHP's per-section node selection is mirrored: a
 * section related by BOTH a real 'table' node and a 'table_alias' (e.g.
 * rsc197 → 'people' + alias 'other_people') publishes to the REAL table —
 * the engine only ever writes there, so only that table holds rows worth
 * indexing (diffusion_utils::get_section_node_for_element, real-preferred,
 * first-alias fallback). Order is section-major — the engine treats the
 * list as a set.
 */
export async function getAllMediaIndexTargets(): Promise<MediaIndexTarget[]> {
	if (targetsCache === null) {
		targetsCache = await buildDiffusionTargets();
	}
	const targets: MediaIndexTarget[] = [];
	for (const [sectionTipo, list] of targetsCache) {
		// per (database, section): real table wins, else the first alias
		const chosen = new Map<string, DiffusionSqlTarget>();
		for (const target of list) {
			if (target.type !== 'sql' && target.type !== 'socrata') continue;
			if (target.database_name === '' || target.table_name === '') continue;
			const current = chosen.get(target.database_name);
			if (
				current === undefined ||
				(current.table_is_alias === true && target.table_is_alias !== true)
			) {
				chosen.set(target.database_name, target);
			}
		}
		for (const target of chosen.values()) {
			targets.push({
				database_name: target.database_name,
				table_name: target.table_name,
				section_tipo: sectionTipo,
			});
		}
	}
	return targets;
}

async function buildDiffusionTargets(): Promise<Map<string, DiffusionSqlTarget[]>> {
	const map = new Map<string, DiffusionSqlTarget[]>();
	const domainName = readEnv('DEDALO_DIFFUSION_DOMAIN');
	if (domainName === undefined || domainName === '') return map;

	// Canonical accessor walk (S2-19/T3). Sibling order matters: PHP walks
	// children ORDER BY order_number ASC (dd_ontology_db_manager::search), and
	// the walk order decides FIRST-hit selections downstream (e.g. which
	// table_alias indexes a section when no real table matches). The accessor's
	// DFS pre-order applies exactly that policy (compareSiblingOrder: order ASC
	// nulls-last, tipo tiebreak), so the grouped childrenOf lists below are
	// already canonically sorted.
	const rows = (
		await getOrderedSubtree(DIFFUSION_ROOT, { includeRoot: true, crossSections: true })
	).map(toNodeRow);
	const byTipo = new Map(rows.map((row) => [row.tipo, row]));
	const childrenOf = new Map<string, string[]>();
	for (const row of rows) {
		if (row.parent === null) continue;
		const list = childrenOf.get(row.parent) ?? [];
		list.push(row.tipo);
		childrenOf.set(row.parent, list);
	}

	const external = new Map<string, OntologyNodeRow | null>();
	const nodeOf = async (tipo: string): Promise<OntologyNodeRow | null> => {
		const inTree = byTipo.get(tipo);
		if (inTree !== undefined) return inTree;
		const cached = external.get(tipo);
		if (cached !== undefined) return cached;
		const found = (await sql.unsafe(
			'SELECT tipo, parent, model, term, relations FROM dd_ontology WHERE tipo = $1',
			[tipo],
		)) as OntologyNodeRow[];
		const node = found[0] ?? null;
		external.set(tipo, node);
		return node;
	};
	const relationsOf = async (tipo: string): Promise<string[]> =>
		((await nodeOf(tipo))?.relations ?? [])
			.map((link) => link.tipo)
			.filter((t): t is string => typeof t === 'string');
	const relatedByModel = async (tipo: string, wanted: string): Promise<string[]> => {
		const out: string[] = [];
		for (const target of await relationsOf(tipo)) {
			if ((await nodeOf(target))?.model === wanted) out.push(target);
		}
		return out;
	};
	const resolveAlias = async (tipo: string, depth = 10): Promise<string | null> => {
		if (depth <= 0) return null;
		const model = (await nodeOf(tipo))?.model ?? '';
		if (!model.includes('_alias')) return null;
		const target = (await relatedByModel(tipo, model.replace('_alias', '')))[0] ?? null;
		if (target === null) return null;
		const targetModel = (await nodeOf(target))?.model ?? '';
		return targetModel.includes('_alias') ? resolveAlias(target, depth - 1) : target;
	};
	const propsOf = async (tipo: string): Promise<Record<string, unknown> | null> => {
		const found = (await sql.unsafe('SELECT properties FROM dd_ontology WHERE tipo = $1', [
			tipo,
		])) as { properties: Record<string, unknown> | null }[];
		return found[0]?.properties ?? null;
	};

	// domain node
	let domainTipo: string | null = null;
	for (const child of childrenOf.get(DIFFUSION_ROOT) ?? []) {
		const node = byTipo.get(child);
		if (node?.model === 'diffusion_domain' && termOf(node) === domainName) {
			domainTipo = child;
			break;
		}
	}
	if (domainTipo === null) return map;

	// consumed-by-alias reals
	const consumed = new Set<string>();
	const subtree: string[] = [];
	const collect = (tipo: string): void => {
		for (const child of childrenOf.get(tipo) ?? []) {
			subtree.push(child);
			collect(child);
		}
	};
	collect(domainTipo);
	for (const tipo of subtree) {
		if ((byTipo.get(tipo)?.model ?? '').includes('_alias')) {
			const real = await resolveAlias(tipo);
			if (real !== null) consumed.add(real);
		}
	}

	const externalChildren = new Map<string, string[]>();
	const childTipos = async (tipo: string): Promise<string[]> => {
		const inTree = childrenOf.get(tipo);
		if (inTree !== undefined || byTipo.has(tipo)) return inTree ?? [];
		const cached = externalChildren.get(tipo);
		if (cached !== undefined) return cached;
		const found = (await sql.unsafe('SELECT tipo FROM dd_ontology WHERE parent = $1', [tipo])) as {
			tipo: string;
		}[];
		const list = found.map((row) => row.tipo);
		externalChildren.set(tipo, list);
		return list;
	};

	interface ElementContext {
		realTipo: string;
		type: string;
		database: string | null;
	}
	const ELEMENT_MODELS = new Set(['diffusion_element', 'diffusion_element_alias']);
	const pending: {
		section: string;
		element: ElementContext;
		table: string | null;
		tableIsAlias: boolean;
	}[] = [];

	const walk = async (
		tipo: string,
		element: ElementContext | null,
		depth: number,
	): Promise<void> => {
		if (depth > 20) return;
		const node = await nodeOf(tipo);
		const model = node?.model ?? '';
		const isAlias = model.includes('_alias');
		if (!isAlias && consumed.has(tipo)) return;
		const realTipo = isAlias ? await resolveAlias(tipo) : null;
		const label = termOf(node ?? undefined);

		let currentElement = element;
		if (ELEMENT_MODELS.has(model)) {
			// the element context: real tipo + diffusion type (alias inherits the
			// real node's properties when it declares none — PHP resolve_node).
			let properties = await propsOf(tipo);
			if ((properties === null || Object.keys(properties).length === 0) && realTipo !== null) {
				properties = await propsOf(realTipo);
			}
			const diffusionType =
				((properties as { diffusion?: { type?: string } } | null)?.diffusion?.type ?? 'unknown') ||
				'unknown';
			currentElement = { realTipo: realTipo ?? tipo, type: diffusionType, database: null };
		} else if (element !== null && (model === 'database' || model === 'database_alias')) {
			if (element.database === null && label !== null) element.database = label;
		}

		if (element !== null) {
			// related sections of the node (alias real fallback)
			let sections = await relatedByModel(tipo, 'section');
			if (sections.length === 0 && realTipo !== null) {
				sections = await relatedByModel(realTipo, 'section');
			}
			for (const section of sections) {
				pending.push({ section, element, table: label, tableIsAlias: model === 'table_alias' });
			}
		}

		const children = new Set(await childTipos(tipo));
		if (isAlias && realTipo !== null) {
			for (const child of await childTipos(realTipo)) children.add(child);
		}
		for (const child of children) {
			await walk(child, currentElement, depth + 1);
		}
	};
	await walk(domainTipo, null, 0);

	// materialize (database labels resolved after the full walk), dedup per
	// section by db|table
	for (const hit of pending) {
		const list = map.get(hit.section) ?? [];
		const databaseName = hit.element.database ?? '';
		const tableName = hit.table ?? '';
		const exists = list.some(
			(t) =>
				t.element_tipo === hit.element.realTipo &&
				t.database_name === databaseName &&
				t.table_name === tableName,
		);
		if (!exists) {
			list.push({
				element_tipo: hit.element.realTipo,
				type: hit.element.type,
				database_name: databaseName,
				table_name: tableName,
				table_is_alias: hit.tableIsAlias,
			});
			map.set(hit.section, list);
		}
	}
	return map;
}

// Both caches are pure dd_ontology interpretation (dd1190 is runtime-mutable
// by design), so any ontology write invalidates them — register with the
// write-chokepoint hub at module load (the hub is a leaf import; an unloaded
// module holds no stale cache).
registerOntologyCacheClearer(clearDiffusionMapCache);
registerOntologyCacheClearer(clearDiffusionTargetsCache);
