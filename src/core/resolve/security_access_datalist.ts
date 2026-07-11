/**
 * component_security_access::get_datalist — the ontology ACL tree.
 *
 * Faithful TS port of PHP core/component_security_access/
 * class.component_security_access.php get_datalist / get_element_datalist /
 * get_children_recursive_security_access, for the GLOBAL-ADMIN (unfiltered)
 * case. Produces the flat datalist the permissions widget renders: every area,
 * section and section-element (component/grouper/tab/button/relation_list/…)
 * reachable from the installed ontology, each carrying its full rolling
 * ancestor chain (`ar_parent`).
 *
 * The datalist carries NO permission values — it is the same structural tree
 * for every profile; the client overlays per-profile integers on top.
 *
 * PORT NOTES / PHP ORACLE MAPPING
 * - area::get_areas() → getAreas(): root area models in the FIXED menu order
 *   (PHP get_ar_root_area_tipos), each root's descendants via the
 *   include/exclude model walk (get_ar_children_areas_recursive), with the
 *   installation config_areas deny applied. `model` = get_model_by_tipo (the
 *   resolved model), `label` = get_term(DEDALO_APPLICATION_LANG, fallback).
 * - get_datalist(): the area loop with ar_check dedup by `tipo_parent`, the
 *   rolling `ar_parent` chain (array_search / array_splice), the datalist_item
 *   shape, and the `model==='section'` → get_element_datalist recursion with
 *   the `[...ar_parent, ...child.ar_parent]` prefix merge.
 * - get_element_datalist(): exclude_elements resolution, the recursive
 *   children walk, the explicit `source.request_config.ddo_map` path, and the second
 *   rolling ar_parent chain over the section's own elements.
 * - get_children_recursive_security_access(): the section vs. area/grouper
 *   branch, the section's virtual-aware child fetch (resolve_virtual + the
 *   without-virtual concat for virtual-specific buttons), the ar_exclude_model
 *   hard list, DEDALO_AR_EXCLUDE_COMPONENTS (empty on this install), and the
 *   per-child recursion.
 *
 * LEDGER — pending principal threading (non-admin filtering): PHP narrows the
 * area list by security::get_user_security_access($user_id) for non-global
 * admins (get_datalist:214-236). This port implements ONLY the global-admin /
 * unfiltered branch, because the TS read path currently runs as admin/root. A
 * future ACL-threading pass must pass the principal here and filter `getAreas`
 * to the areas present in the user's own security-access data.
 *
 * LEDGER — config_areas deny: PHP area::get_areas() always subtracts the
 * installation's config_areas `areas_deny` (entity-specific; for monedaiberica
 * that is dd137,rsc1,hierarchy20,dd222,dd356,dd354,numisdata240,numisdata243,
 * numisdata137,rsc179,numisdata163,numisdata283,mupreva492,qdp188). This module
 * sources the deny from getEffectiveAreasDeny(config.menu.areasDeny) — the same
 * canonical TS deny source the menu uses — so it tracks whatever AREAS_DENY the
 * install is configured with. The TS default omits the entity-specific denies,
 * so exact PHP parity requires AREAS_DENY to be set to the mib list in the
 * environment (a pre-existing menu-config gap, NOT a datalist-algorithm gap).
 */

import { config } from '../../config/config.ts';
import {
	AREA_CHILD_EXCLUDE_MODELS,
	AREA_CHILD_INCLUDE_MODELS,
	MENU_ROOT_MODEL_ORDER,
} from '../concepts/area.ts';
import { sql } from '../db/postgres.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { labelByTipo } from '../ontology/labels.ts';
import { getModelByTipo } from '../ontology/resolver.ts';
import { getEffectiveAreasDeny } from './server_state.ts';

/** One flat datalist item (PHP datalist_item shape — order of keys is not significant). */
export interface SecurityAccessDatalistItem {
	tipo: string;
	section_tipo: string;
	// null (not '') for foreign/unresolvable tipos — get_model_by_tipo /
	// get_term_by_tipo return null there and PHP emits it verbatim.
	model: string | null;
	label: string | null;
	parent: string;
	ar_parent: string[];
}

/** An element item before the ar_parent chain is stamped (PHP get_children_recursive result shape). */
interface ChildItem {
	tipo: string;
	section_tipo: string;
	model: string | null;
	label: string | null;
	parent: string;
}

/** An area/section node from area::get_areas(). */
interface AreaObj {
	tipo: string;
	model: string | null;
	parent: string;
	label: string | null;
}

// -----------------------------------------------------------------------------
// low-level ontology helpers (per-process caches, like the PHP static caches)
// -----------------------------------------------------------------------------

/**
 * ontology_node::get_ar_children_of_this — direct children tipos ordered by
 * order_number ASC (PHP dd_ontology_db_manager::search order=true, which emits
 * exactly `ORDER BY order_number ASC`, Postgres default NULLS LAST).
 */
const childrenOfCache = createOntologyCache<string, string[]>();
async function getChildrenOfThis(tipo: string): Promise<string[]> {
	const cached = childrenOfCache.get(tipo);
	if (cached !== undefined) return cached;
	const rows = (await sql`
		SELECT tipo FROM dd_ontology WHERE parent = ${tipo} ORDER BY order_number ASC
	`) as { tipo: string }[];
	const result = rows.map((row) => row.tipo);
	childrenOfCache.set(tipo, result);
	return result;
}

/** A node's raw `relations` list (ontology_node::get_relations). */
const relationsCache = createOntologyCache<string, { tipo?: unknown }[]>();
async function getRelations(tipo: string): Promise<{ tipo?: unknown }[]> {
	const cached = relationsCache.get(tipo);
	if (cached !== undefined) return cached;
	const rows = (await sql`
		SELECT relations FROM dd_ontology WHERE tipo = ${tipo} LIMIT 1
	`) as { relations: { tipo?: unknown }[] | null }[];
	const result = Array.isArray(rows[0]?.relations)
		? (rows[0]?.relations as { tipo?: unknown }[])
		: [];
	relationsCache.set(tipo, result);
	return result;
}

/** ontology_node::get_relation_nodes(tipo, simple=true) — the clean list of relation tipos. */
async function getRelationNodesSimple(tipo: string): Promise<string[]> {
	const relations = await getRelations(tipo);
	const out: string[] = [];
	for (const relation of relations) {
		if (typeof relation?.tipo === 'string' && relation.tipo) out.push(relation.tipo);
	}
	return out;
}

/** A node's raw `properties` JSON (ontology_node::get_properties). */
const propertiesCache = createOntologyCache<string, Record<string, unknown> | null>();
async function getProperties(tipo: string): Promise<Record<string, unknown> | null> {
	if (propertiesCache.has(tipo)) return propertiesCache.get(tipo) ?? null;
	const rows = (await sql`
		SELECT properties FROM dd_ontology WHERE tipo = ${tipo} LIMIT 1
	`) as { properties: Record<string, unknown> | null }[];
	const result = (rows[0]?.properties as Record<string, unknown> | null) ?? null;
	propertiesCache.set(tipo, result);
	return result;
}

/**
 * section::get_section_real_tipo_static — the first `related` node whose model
 * is 'section' (common::get_ar_related_by_model('section', tipo)[0]); the input
 * tipo itself when there is none (i.e. it is already a real section).
 */
const realTipoCache = createOntologyCache<string, string>();
async function getSectionRealTipo(sectionTipo: string): Promise<string> {
	const cached = realTipoCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	let real = sectionTipo;
	for (const relation of await getRelations(sectionTipo)) {
		if (typeof relation?.tipo !== 'string') continue;
		if ((await getModelByTipo(relation.tipo)) === 'section') {
			real = relation.tipo;
			break;
		}
	}
	realTipoCache.set(sectionTipo, real);
	return real;
}

/** Drop the four ontology-derived walk caches of this module. */
export function clearSecurityAccessCaches(): void {
	childrenOfCache.clear();
	relationsCache.clear();
	propertiesCache.clear();
	realTipoCache.clear();
}
registerOntologyCacheClearer(clearSecurityAccessCaches);

/**
 * ontology_node::get_ar_tipo_by_model_and_relation(tipo, 'exclude_elements',
 * 'children', true) — direct children whose resolved model === 'exclude_elements'.
 */
async function getExcludeElementsChildren(sectionTipo: string): Promise<string[]> {
	const out: string[] = [];
	for (const childTipo of await getChildrenOfThis(sectionTipo)) {
		if ((await getModelByTipo(childTipo)) === 'exclude_elements') out.push(childTipo);
	}
	return out;
}

/**
 * ontology_node::get_ar_recursive_children(tipo, exclude_models) — depth-first
 * descendants (excluding the starting node), skipping any subtree whose model is
 * in the exclude list. Used to expand grouper excludes during resolve_virtual.
 */
const RECURSIVE_DEFAULT_EXCLUDE_MODELS: ReadonlySet<string> = new Set([
	'box elements',
	'area',
	'component_semantic_node',
]);
async function getArRecursiveChildren(
	tipo: string,
	excludeModels: ReadonlySet<string>,
	collector: string[],
	isRecursion = false,
): Promise<string[]> {
	if (isRecursion) collector.push(tipo);
	for (const childTipo of await getChildrenOfThis(tipo)) {
		if (excludeModels.size > 0) {
			const model = await getModelByTipo(childTipo);
			if (model !== null && excludeModels.has(model)) continue;
		}
		await getArRecursiveChildren(childTipo, excludeModels, collector, true);
	}
	return collector;
}

// -----------------------------------------------------------------------------
// section child resolution (PHP get_ar_children_tipo_by_model_name_in_section)
// -----------------------------------------------------------------------------

/**
 * The model-name substrings the security walk keeps for a section's direct
 * children (PHP ar_modelo_name_required). Matched with str_contains (not exact).
 */
const SECTION_CHILD_MODEL_REQUIRED: readonly string[] = [
	'section_group',
	'section_tab',
	'tab',
	'button_',
	'relation_list',
	'time_machine_list',
	'component_',
];

/** filter_children_by_models: keep children whose resolved model contains any required substring (deduped, order-preserving). */
async function filterChildrenByModels(children: readonly string[]): Promise<string[]> {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const childTipo of children) {
		if (seen.has(childTipo)) continue;
		const model = (await getModelByTipo(childTipo)) ?? '';
		if (SECTION_CHILD_MODEL_REQUIRED.some((required) => model.includes(required))) {
			result.push(childTipo);
			seen.add(childTipo);
		}
	}
	return result;
}

/**
 * get_ar_children_tipo_by_model_name_in_section(section, required, from_cache,
 * resolve_virtual=true, recursive=false, search_exact=false) — as invoked by the
 * security section branch. count(required)>1 && recursive=false ⇒ the children
 * source is get_ar_children_of_this on the REAL section (resolve_virtual maps the
 * virtual tipo to its real section and subtracts the virtual's exclude_elements,
 * expanding grouper excludes recursively); then filter by the required models.
 */
async function getSectionChildrenResolveVirtual(sectionTipo: string): Promise<string[]> {
	const realTipo = await getSectionRealTipo(sectionTipo);

	// exclude_elements are read from the ORIGINAL (possibly virtual) tipo.
	const excludeSet = new Set<string>();
	const excludeElementsChildren = await getExcludeElementsChildren(sectionTipo);
	const excludeElementsTipo = excludeElementsChildren[0];
	if (excludeElementsTipo !== undefined) {
		const excludedTipos = await getRelationNodesSimple(excludeElementsTipo);
		for (const excludedTipo of excludedTipos) {
			excludeSet.add(excludedTipo);
			const model = await getModelByTipo(excludedTipo);
			if (model === 'section_group' || model === 'section_tab' || model === 'tab') {
				const grouperChildren: string[] = [];
				await getArRecursiveChildren(
					excludedTipo,
					RECURSIVE_DEFAULT_EXCLUDE_MODELS,
					grouperChildren,
				);
				for (const grouperChild of grouperChildren) excludeSet.add(grouperChild);
			}
		}
	}

	const directChildren = await getChildrenOfThis(realTipo);
	const kept = directChildren.filter((childTipo) => !excludeSet.has(childTipo));
	return filterChildrenByModels(kept);
}

/**
 * get_ar_children_tipo_by_model_name_in_section(section, required, …,
 * resolve_virtual=false, recursive=false, …) — the virtual-section second fetch:
 * the virtual node's OWN direct children (virtual-specific buttons), filtered by
 * the required models, with no exclude subtraction.
 */
async function getSectionChildrenNoVirtual(sectionTipo: string): Promise<string[]> {
	const directChildren = await getChildrenOfThis(sectionTipo);
	return filterChildrenByModels(directChildren);
}

// -----------------------------------------------------------------------------
// get_children_recursive_security_access
// -----------------------------------------------------------------------------

/** Hard-coded model names never included in the permission tree (PHP ar_exclude_model). */
const AR_EXCLUDE_MODEL: ReadonlySet<string> = new Set([
	'component_security_administrator',
	'section_list',
	'search_list',
	'component_semantic_node',
	'box_elements',
	'exclude_elements',
	'edit_view',
]);

/** DEDALO_AR_EXCLUDE_COMPONENTS — installation opt-out (config-driven, default empty). */
const AR_EXCLUDE_COMPONENTS: ReadonlySet<string> = new Set<string>(
	config.features.arExcludeComponents,
);

/**
 * get_children_recursive_security_access — recursively walk the ontology under
 * `tipo`, collecting eligible elements. `parent`/`section_tipo` of each element
 * are set to `tipo` (matches PHP, and differs from the child's own ontology
 * parent for virtual sections).
 */
async function getChildrenRecursiveSecurityAccess(
	tipo: string,
	excludeTipos: ReadonlySet<string> | null,
): Promise<ChildItem[]> {
	const elements: ChildItem[] = [];

	const sourceModel = await getModelByTipo(tipo);
	let childTipos: string[];
	if (sourceModel === 'section') {
		childTipos = await getSectionChildrenResolveVirtual(tipo);
		const realTipo = await getSectionRealTipo(tipo);
		if (tipo !== realTipo) {
			// Virtual section: also fetch the virtual node's own children (buttons).
			childTipos = [...childTipos, ...(await getSectionChildrenNoVirtual(tipo))];
		}
	} else {
		// Areas / section_groups / …
		childTipos = await getChildrenOfThis(tipo);
	}

	for (const elementTipo of childTipos) {
		if (excludeTipos?.has(elementTipo)) continue;
		const model = await getModelByTipo(elementTipo);
		if (model !== null && AR_EXCLUDE_MODEL.has(model)) continue;
		if (AR_EXCLUDE_COMPONENTS.has(elementTipo)) continue;

		elements.push({
			tipo: elementTipo,
			section_tipo: tipo,
			model,
			label: await labelByTipo(elementTipo),
			parent: tipo,
		});

		const sub = await getChildrenRecursiveSecurityAccess(elementTipo, excludeTipos);
		for (const item of sub) elements.push(item);
	}

	return elements;
}

// -----------------------------------------------------------------------------
// get_element_datalist
// -----------------------------------------------------------------------------

/**
 * get_element_datalist — the flat datalist of all elements inside one section,
 * WITH their own rolling ar_parent chain (the caller prepends the area-level
 * chain). Handles the explicit `source.request_config.ddo_map` path.
 */
async function getElementDatalist(sectionTipo: string): Promise<SecurityAccessDatalistItem[]> {
	// exclude_elements defined in the ontology → tipos removed from the walk.
	let excludeTipos: ReadonlySet<string> | null = null;
	const excludeElementsChildren = await getExcludeElementsChildren(sectionTipo);
	const excludeElementsTipo = excludeElementsChildren[0];
	if (excludeElementsTipo !== undefined) {
		excludeTipos = new Set(await getRelationNodesSimple(excludeElementsTipo));
	}

	const childrenRecursive = await getChildrenRecursiveSecurityAccess(sectionTipo, excludeTipos);

	// explicit request_config.ddo_map path.
	let childrenList: ChildItem[];
	const properties = await getProperties(sectionTipo);
	const source = properties?.source as { request_config?: unknown } | undefined;
	if (source !== undefined && source !== null && Array.isArray(source.request_config)) {
		const explicitChildren: { tipo?: unknown; parent?: unknown; parent_grouper?: unknown }[] = [];
		for (const requestConfigItem of source.request_config as {
			show?: { ddo_map?: unknown };
		}[]) {
			const ddoMap = requestConfigItem?.show?.ddo_map;
			if (Array.isArray(ddoMap)) {
				for (const ddo of ddoMap as { parent?: unknown }[]) {
					// Only DDOs whose parent is 'self' or the section itself.
					if (ddo?.parent === 'self' || ddo?.parent === sectionTipo) {
						explicitChildren.push(
							ddo as { tipo?: unknown; parent?: unknown; parent_grouper?: unknown },
						);
					}
				}
			}
		}

		childrenList = [];
		for (const ddo of explicitChildren) {
			if (typeof ddo !== 'object' || ddo === null || typeof ddo.tipo !== 'string') continue;
			const parentGrouper =
				typeof ddo.parent_grouper === 'string' ? ddo.parent_grouper : sectionTipo;
			childrenList.push({
				tipo: ddo.tipo,
				section_tipo: sectionTipo,
				model: await getModelByTipo(ddo.tipo),
				label: await labelByTipo(ddo.tipo),
				parent: parentGrouper,
			});
		}
		// Append 'default' calculated items excluding components and section_groups.
		for (const item of childrenRecursive) {
			if (item.model?.startsWith('component_') || item.model === 'section_group') {
				continue;
			}
			childrenList.push(item);
		}
	} else {
		childrenList = childrenRecursive;
	}

	// Rolling ar_parent chain over the section's own elements.
	const datalist: SecurityAccessDatalistItem[] = [];
	const arParent: string[] = [];
	for (const child of childrenList) {
		const position = arParent.indexOf(child.parent);
		if (position === -1) arParent.push(child.parent);
		else arParent.splice(position + 1);

		datalist.push({
			tipo: child.tipo,
			section_tipo: sectionTipo,
			model: child.model,
			label: child.label,
			parent: child.parent,
			ar_parent: [...arParent],
		});
	}

	return datalist;
}

// -----------------------------------------------------------------------------
// area::get_areas
// -----------------------------------------------------------------------------

/**
 * area::get_areas() — the ordered area/section list. Root area models in the
 * fixed menu order, each root's descendants via the include/exclude model walk,
 * with the config_areas deny applied (both to roots and descendants).
 */
async function getAreas(): Promise<AreaObj[]> {
	const denySet = new Set(getEffectiveAreasDeny(config.menu.areasDeny));

	// Resolve each root area MODEL to its tipo (ontology_utils::get_ar_tipo_by_model
	// → search on the raw `model` column, first match).
	const areas: AreaObj[] = [];

	const toAreaObj = async (tipo: string, parent: string | null): Promise<AreaObj> => ({
		tipo,
		model: await getModelByTipo(tipo),
		parent: parent ?? '',
		label: await labelByTipo(tipo),
	});

	// get_ar_children_areas_recursive: pre-order DFS, keeping nodes whose resolved
	// model is in include AND not in exclude; recursion descends only into kept nodes.
	const walkChildren = async (parentTipo: string): Promise<void> => {
		for (const childTipo of await getChildrenOfThis(parentTipo)) {
			const model = (await getModelByTipo(childTipo)) ?? '';
			if (!AREA_CHILD_INCLUDE_MODELS.has(model) || AREA_CHILD_EXCLUDE_MODELS.has(model)) continue;
			if (!denySet.has(childTipo)) {
				const parentRow = (await sql`
					SELECT parent FROM dd_ontology WHERE tipo = ${childTipo} LIMIT 1
				`) as { parent: string | null }[];
				areas.push(await toAreaObj(childTipo, parentRow[0]?.parent ?? parentTipo));
			}
			await walkChildren(childTipo);
		}
	};

	for (const rootModel of MENU_ROOT_MODEL_ORDER) {
		const rootRows = (await sql`
			SELECT tipo, parent FROM dd_ontology WHERE model = ${rootModel} LIMIT 1
		`) as { tipo: string; parent: string | null }[];
		const rootRow = rootRows[0];
		if (rootRow === undefined) continue; // model not defined on this install
		if (!denySet.has(rootRow.tipo)) {
			areas.push(await toAreaObj(rootRow.tipo, rootRow.parent));
		}
		await walkChildren(rootRow.tipo);
	}

	return areas;
}

// -----------------------------------------------------------------------------
// get_datalist (global-admin / unfiltered)
// -----------------------------------------------------------------------------

/**
 * Build the full ontology ACL datalist for the global-admin (unfiltered) case,
 * exactly reproducing PHP component_security_access::get_datalist($admin_id).
 */
export async function getSecurityAccessDatalist(): Promise<SecurityAccessDatalistItem[]> {
	const areas = await getAreas();

	const datalist: SecurityAccessDatalistItem[] = [];
	const arCheck = new Set<string>();
	const arParent: string[] = [];

	for (const area of areas) {
		const sectionTipo = area.tipo; // same as tipo for an area

		// dedup by `tipo_parent`.
		const duplicateKey = `${sectionTipo}_${area.parent}`;
		if (arCheck.has(duplicateKey)) continue;
		arCheck.add(duplicateKey);

		// rolling ancestor chain.
		const position = arParent.indexOf(area.parent);
		if (position === -1) arParent.push(area.parent);
		else arParent.splice(position + 1);

		datalist.push({
			tipo: area.tipo,
			section_tipo: sectionTipo,
			model: area.model,
			label: area.label,
			parent: area.parent,
			ar_parent: [...arParent],
		});

		// section case: add its recursive elements, prefixing the area-level chain.
		if (area.model === 'section') {
			const children = await getElementDatalist(area.tipo);
			for (const child of children) {
				child.ar_parent = [...arParent, ...child.ar_parent];
				datalist.push(child);
			}
		}
	}

	return datalist;
}
