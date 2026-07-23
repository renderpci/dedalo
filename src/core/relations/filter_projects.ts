/**
 * component_filter / component_filter_master authorized-projects datalist +
 * list value — the per-section PROJECTS gate whose options are the projects the
 * logged user may see.
 *
 * PHP: component_filter_master::get_user_authorized_projects (the option set),
 * component_filter::get_datalist (the {type:'project',…} edit datalist, sorted
 * strcasecmp) and get_list_value (the labels of authorized options that appear
 * in the stored data, in authorized order).
 *
 * Each authorized project resolves: label = dd156 name (DEDALO_DATA_LANG, with
 * fallback), order = dd1631 number, parent = the nearest recursive ancestor that
 * is itself authorized (so the client can draw a limited tree).
 *
 * SCOPE: the current read path runs as global admin (the parity harness / root),
 * so the authorized set is EVERY dd153 project. Per-user narrowing
 * (get_user_projects) is LEDGERED pending principal-threading into the resolver
 * context (rewrite/STATUS.md).
 *
 * PHP constants: DEDALO_SECTION_PROJECTS_TIPO 'dd153', DEDALO_PROJECTS_NAME_TIPO
 * 'dd156', order component 'dd1631'.
 */

import { type Locator, compareLocators } from '../concepts/locator.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../ontology/resolver.ts';
import { resolveComponentValue } from '../resolve/component_data.ts';
import { currentDataLang } from '../resolve/request_lang.ts';
import { registerSectionDataListener } from '../section_record/save_event.ts';
import { getUserProjects } from '../security/permissions.ts';
import { currentPrincipal } from '../security/request_context.ts';
import { getParentsRecursive } from './parent.ts';

const PROJECTS_SECTION_TIPO = 'dd153';
const PROJECTS_NAME_TIPO = 'dd156'; // DEDALO_PROJECTS_NAME_TIPO (component_input_text)
const PROJECTS_ORDER_TIPO = 'dd1631'; // component_number 'Order'

/** One authorized project (PHP get_user_authorized_projects element). */
export interface AuthorizedProject {
	label: string;
	locator: { section_tipo: string; section_id: string };
	parent: { section_tipo: string; section_id: string } | null;
	order: number;
}

/** One filter datalist option (PHP component_filter get_datalist item). */
export interface FilterDatalistItem {
	type: 'project';
	label: string;
	section_tipo: string;
	section_id: string;
	value: { section_tipo: string; section_id: string };
	parent: { section_tipo: string; section_id: string } | null;
	order: number;
}

/** Cache of the authorized projects, keyed by projects-scope + data lang. */
const authorizedProjectsCache = createOntologyCache<string, AuthorizedProject[]>();

/**
 * The projects cache key. Today every caller gets the global-admin projection
 * (all dd153), so the scope is user-independent and keyed 'all'. The key is
 * deliberately FUTURE-SAFE: when the per-user narrowing branch (PHP
 * get_user_projects) lands, a non-admin caller MUST key by their own project
 * scope — a lang-only key would bleed one user's authorized list into another's
 * cache in this long-lived process (spec §4 request isolation). Do NOT revert
 * to a lang-only key when adding per-user filtering.
 */
function authorizedProjectsCacheKey(dataLang: string): string {
	const principal = currentPrincipal();
	// Fail CLOSED on a missing principal (foundation audit ISO-01): an unanchored
	// call (context loss / a future non-dispatch caller) must NOT collapse to the
	// global-admin 'all' projection. undefined ⇒ 'none' (deny), never 'all'.
	const scope =
		principal === undefined ? 'none' : principal.isGlobalAdmin ? 'all' : `u${principal.userId}`;
	return `${scope}_${dataLang}`;
}

/** PHP strcasecmp — case-insensitive byte comparison. */
function strcasecmp(a: string, b: string): number {
	return Buffer.compare(Buffer.from(a.toLowerCase(), 'utf8'), Buffer.from(b.toLowerCase(), 'utf8'));
}

/**
 * The authorized projects (global-admin path: every dd153 record, in section_id
 * order), each with its resolved label / order / nearest-authorized parent.
 */
export async function getUserAuthorizedProjects(): Promise<AuthorizedProject[]> {
	// AUTHZ-06 — per-user narrowing + value-level deny (PHP
	// component_filter_master::get_user_authorized_projects branches
	// is_global_admin ? all : get_user_projects). Before this fix EVERY caller —
	// any authenticated non-admin, zero grants — got the full dd153 catalog + tree
	// (the datalist leaked every tenant's project names/order/parentage), because
	// currentPrincipal() was read only for the cache KEY, never to filter the VALUE.
	const principal = currentPrincipal();
	// Fail CLOSED on an unanchored call (currentPrincipal() undefined): no
	// authority ⇒ no projects (the 'none' cache key's value-level deny, ISO-01
	// polarity). The real callers (portal.ts get_data/list) are all on the
	// authenticated dispatch path, so a principal is always present there.
	if (principal === undefined) return [];
	const dataLang = currentDataLang();
	const cacheKey = authorizedProjectsCacheKey(dataLang);
	const cached = authorizedProjectsCache.get(cacheKey);
	if (cached !== undefined) return cached;
	// Non-admins see ONLY their dd170-assigned projects (get_user_projects — the
	// SAME set the per-record projects ACL filters records by, so the datalist
	// stays consistent with what records the caller can actually reach). A global
	// admin keeps the full catalog (allowedIds === null = no filter).
	const allowedIds = principal.isGlobalAdmin
		? null
		: new Set(await getUserProjects(principal.userId));
	const table = await getMatrixTableFromTipo(PROJECTS_SECTION_TIPO);
	if (table === null) return [];
	const rows = (await sql.unsafe(
		`SELECT section_id FROM "${table}" WHERE section_tipo = $1 ORDER BY section_id`,
		[PROJECTS_SECTION_TIPO],
	)) as { section_id: number }[];
	const ids = rows
		.map((row) => Number(row.section_id))
		.filter((id) => allowedIds === null || allowedIds.has(id));
	const idSet = new Set(ids);
	const nameModel = (await getModelByTipo(PROJECTS_NAME_TIPO)) ?? 'component_input_text';
	const orderModel = (await getModelByTipo(PROJECTS_ORDER_TIPO)) ?? 'component_number';

	const projects: AuthorizedProject[] = [];
	for (const id of ids) {
		const record = await readMatrixRecord(table, PROJECTS_SECTION_TIPO, id);
		if (record === null) continue;
		// label — dd156 name in the data lang (fallback chain via resolveComponentValue)
		const name = await resolveComponentValue(record, PROJECTS_NAME_TIPO, nameModel, dataLang);
		const labelRaw = ((name.value ?? name.fallbackValue)?.[0] as { value?: unknown } | undefined)
			?.value;
		// order — dd1631 number (0 when unset)
		const orderRes = await resolveComponentValue(
			record,
			PROJECTS_ORDER_TIPO,
			orderModel,
			'lg-nolan',
		);
		const order = Number(
			((orderRes.value ?? orderRes.fallbackValue)?.[0] as { value?: unknown } | undefined)?.value ??
				0,
		);
		// parent — nearest recursive ancestor that is itself authorized
		let parent: { section_tipo: string; section_id: string } | null = null;
		const { ancestors } = await getParentsRecursive(id, PROJECTS_SECTION_TIPO);
		for (const ancestor of ancestors) {
			if (
				String(ancestor.section_tipo) === PROJECTS_SECTION_TIPO &&
				idSet.has(Number(ancestor.section_id))
			) {
				parent = { section_tipo: PROJECTS_SECTION_TIPO, section_id: String(ancestor.section_id) };
				break;
			}
		}
		projects.push({
			label: typeof labelRaw === 'string' ? labelRaw : '',
			locator: { section_tipo: PROJECTS_SECTION_TIPO, section_id: String(id) },
			parent,
			order: Number.isFinite(order) ? order : 0,
		});
	}
	authorizedProjectsCache.set(cacheKey, projects);
	return projects;
}

/** The edit-mode datalist (PHP get_datalist): filter options sorted by label. */
export async function getFilterDatalist(): Promise<FilterDatalistItem[]> {
	const projects = await getUserAuthorizedProjects();
	const items: FilterDatalistItem[] = projects.map((project) => ({
		type: 'project',
		label: project.label,
		section_tipo: project.locator.section_tipo,
		section_id: project.locator.section_id,
		value: project.locator,
		parent: project.parent,
		order: project.order,
	}));
	items.sort((a, b) => strcasecmp(a.label, b.label));
	return items;
}

/**
 * The list-mode value (PHP get_list_value): labels of the authorized options
 * whose locator is in the stored data, in authorized (section_id) order.
 */
export async function getFilterListValue(
	storedLocators: { section_tipo?: unknown; section_id?: unknown }[],
): Promise<string[]> {
	if (storedLocators.length === 0) return [];
	const projects = await getUserAuthorizedProjects();
	const labels: string[] = [];
	for (const project of projects) {
		// Locator law (DEC-21): value-based section_tipo+section_id match via
		// compareLocators (loose section_id — a numeric stored id matches the
		// string form the projects list carries, same as the String() coercion
		// this replaced).
		const matched = storedLocators.some((locator) =>
			compareLocators(locator as Locator, project.locator, ['section_tipo', 'section_id']),
		);
		if (matched) labels.push(project.label);
	}
	return labels;
}

/** Drop the authorized-projects cache (hub/event invalidation + tests). */
export function clearFilterProjectsCache(): void {
	authorizedProjectsCache.clear();
}
// Ontology-derived too (component/model resolution) — hub-cleared (S1-11 stopgap).
registerOntologyCacheClearer(clearFilterProjectsCache);
// Data-derived: any write/delete of a dd153 project record rebuilds the list
// (the durable S1-11 channel).
registerSectionDataListener((sectionTipo) => {
	if (sectionTipo === PROJECTS_SECTION_TIPO) clearFilterProjectsCache();
});
