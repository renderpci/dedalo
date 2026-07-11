/**
 * Area read dispatch — the ONE hook the API dispatcher calls for an area-model
 * `read` (engineering/AREA_SPEC.md §2). Replaces the inline area branches that lived in
 * api/dispatch.ts; routes by area behavior (tree / maintenance / dashboard).
 *
 * Returns an ApiResult when it handled the read, or null to let the dispatcher
 * fall through to its generic path (dashboard-behavior areas return null in
 * Phase A — the dashboard engine lands in Phase B; today they fall through
 * exactly as before, so this relocation is zero behavior change).
 */

import { type ApiResult, denied } from '../api/response.ts';
import { AREA_ONTOLOGY_TIPO, areaBehaviorOf, isAreaModel } from '../concepts/area.ts';
import type { Rqo } from '../concepts/rqo.ts';
import { getModelByTipo } from '../ontology/resolver.ts';
import { type Principal, SUPERUSER_ID, getPermissions } from '../security/permissions.ts';
import { readAreaHierarchyData } from './tree.ts';

/** Shape of the tree-area boot item (subset consumed by the permission filter). */
interface HierarchyBootItem {
	tipo: string;
	value: {
		target_section_tipo: string;
		children_tipo?: string | null;
		active_in_thesaurus?: boolean;
		typology_section_id: string;
		root_terms: { section_tipo?: unknown; section_id?: unknown }[];
	}[];
	typologies: { section_id: string }[];
	ts_search?: unknown;
}

/**
 * Fail-closed guard for WRITE actions (engineering/AREA_SPEC.md §9): an area is a
 * non-data definition with no matrix row, so save/create/delete/duplicate
 * addressed at an area tipo (by declared model OR by the resolved model of the
 * target section_tipo) must be refused — never routed into section write code
 * via the duck-type shims. Returns a denial, or null when the target is not an
 * area.
 */
export async function refuseAreaWrite(
	sectionTipo: string | undefined,
	declaredModel: string | null | undefined,
): Promise<ApiResult | null> {
	if (declaredModel != null && isAreaModel(declaredModel)) {
		return denied(400, 'Areas hold no data — write refused');
	}
	if (sectionTipo !== undefined) {
		const model = await getModelByTipo(sectionTipo);
		if (model !== null && isAreaModel(model)) {
			return denied(400, 'Areas hold no data — write refused');
		}
	}
	return null;
}

/**
 * The area's structure context (PHP area_*_json get_structure_context). EVERY
 * area read must return a non-empty context: the client bails and renders the
 * area BLANK when result.context is empty (area_thesaurus.js:547; area.js /
 * area_maintenance.js guard the same way). Built exactly like
 * get_element_context so it stays identical to that (already-gated) surface.
 */
async function buildAreaContext(
	areaTipo: string,
	mode: string,
	lang: string,
	permissions: number,
): Promise<Record<string, unknown>[]> {
	const { buildStructureContext } = await import('../resolve/structure_context.ts');
	const entry = await buildStructureContext({
		tipo: areaTipo,
		sectionTipo: areaTipo,
		mode,
		lang,
		permissions,
	});
	return entry !== null ? [entry as unknown as Record<string, unknown>] : [];
}

/**
 * Handle a read whose source.model is an area model. Returns null when the area
 * behavior has no dedicated resolver yet (dashboard — Phase B) so the caller
 * falls through unchanged.
 */
export async function dispatchAreaRead(rqo: Rqo, principal: Principal): Promise<ApiResult | null> {
	const model = rqo.source?.model ?? '';
	const behavior = areaBehaviorOf(model);

	// Model-vs-tipo validation (engineering/AREA_SPEC.md §9): PHP dispatches area reads on
	// source.model without checking the tipo actually IS that model (the dd917
	// quirk — a field_text accepted as area_ontology). TS refuses the mismatch:
	// an unvalidated client model string must not choose server code paths.
	const areaTipo = rqo.source?.tipo;
	if (areaTipo !== undefined) {
		const actualModel = await getModelByTipo(areaTipo);
		if (actualModel !== null && actualModel !== model) {
			return denied(400, `read: source.model '${model}' does not match tipo '${areaTipo}'`);
		}
	}

	// area_ontology is SUPERUSER-ONLY (engineering/AREA_SPEC.md §9 — a deliberate
	// strengthening; PHP has no hard gate, only a positive global-admin bypass).
	// Fail-closed: reject any non-superuser before touching the ontology.
	if (model === 'area_ontology' || areaTipo === AREA_ONTOLOGY_TIPO) {
		if (principal.userId !== SUPERUSER_ID) {
			return denied(403, 'Insufficient permissions to read');
		}
	}

	if (behavior === 'tree') {
		return await readTreeArea(rqo, principal, model as 'area_thesaurus' | 'area_ontology');
	}

	if (behavior === 'maintenance') {
		// Maintenance-area read (PHP area_maintenance_json): the widget catalog
		// rides as `datalist`. Admin-only, like the PHP area.
		if (!principal.isGlobalAdmin) {
			return denied(403, 'Insufficient permissions to read');
		}
		const maintTipo = rqo.source?.tipo ?? '';
		const permissions = await getPermissions(principal, maintTipo, maintTipo);
		const context = await buildAreaContext(
			maintTipo,
			rqo.source?.mode ?? 'list',
			rqo.source?.lang ?? 'lg-spa',
			permissions,
		);
		const { buildMaintenanceDataItem } = await import('../area_maintenance/widgets/registry.ts');
		return {
			status: 200,
			body: { result: { context, data: [await buildMaintenanceDataItem()] }, msg: 'OK' },
		};
	}

	if (behavior === 'dashboard') {
		return await readDashboardArea(rqo, principal);
	}

	// An area model with no behavior resolver (area_graph — dead/excluded, or any
	// unmapped area model): refuse loudly rather than silently fall into the
	// section path (engineering/AREA_SPEC.md §9 — never silently narrow).
	return denied(400, `read: area model '${model}' is not supported`);
}

/**
 * Dashboard-area read (PHP area_common_json): the area's structure context plus
 * one data item carrying the statistics dashboard of the sections inside
 * (engineering/AREA_SPEC.md §4). Context is built exactly like get_element_context so
 * the area context stays identical to that (already-gated) surface; the
 * dashboard is attached only when read permission > 0 and it is not disabled by
 * properties.dashboard.disabled.
 */
async function readDashboardArea(rqo: Rqo, principal: Principal): Promise<ApiResult> {
	const areaTipo = rqo.source?.tipo;
	if (areaTipo === undefined) {
		return denied(400, 'read: source.tipo is required');
	}
	const mode = rqo.source?.mode ?? 'list';
	const lang = rqo.source?.lang ?? 'lg-spa';
	const permissions = await getPermissions(principal, areaTipo, areaTipo);

	const context = await buildAreaContext(areaTipo, mode, lang, permissions);

	const dataItem: Record<string, unknown> = {
		tipo: areaTipo,
		section_tipo: areaTipo,
		section_id: null,
	};
	// Dashboard payload (PHP: only when get_data && permissions > 0; omitted when
	// properties.dashboard.disabled).
	if (permissions > 0) {
		const { getNode } = await import('../ontology/resolver.ts');
		const props = ((await getNode(areaTipo))?.properties ?? {}) as {
			dashboard?: { disabled?: boolean; metrics?: string[] };
		};
		if (props.dashboard?.disabled !== true) {
			const metricNames = props.dashboard?.metrics ?? ['total'];
			const { getDashboardData } = await import('./dashboard.ts');
			dataItem.dashboard = await getDashboardData(principal, areaTipo, metricNames);
		}
	}

	return {
		status: 200,
		body: { result: { context, data: [dataItem] }, msg: 'OK. Request done' },
	};
}

/**
 * Thesaurus / ontology tree-area boot data (PHP area_thesaurus_json): the
 * active-hierarchies projection + typologies, per-hierarchy read-permission
 * filtered, with the optional pre-executed thesaurus search (ts_search).
 * Gate: read on the area tipo (the ontology area applies its global-admin
 * bypass — the PHP controller grants admins everything).
 */
async function readTreeArea(
	rqo: Rqo,
	principal: Principal,
	areaModel: 'area_thesaurus' | 'area_ontology',
): Promise<ApiResult> {
	const areaTipo = rqo.source?.tipo;
	if (areaTipo === undefined) {
		return denied(400, 'read: source.tipo is required');
	}
	const level = await getPermissions(principal, areaTipo, areaTipo);
	if (level < 1 && !principal.isGlobalAdmin) {
		return denied(403, 'Insufficient permissions to read');
	}

	// terms_are_model (PHP build_options->terms_are_model): the ontology model
	// view. The client sends it in source.build_options.
	const buildOptions = (rqo.source as { build_options?: { terms_are_model?: boolean } })
		?.build_options;
	const termsAreModel = buildOptions?.terms_are_model === true;
	const item = (await readAreaHierarchyData(
		areaModel,
		areaTipo,
		rqo.source?.lang ?? 'lg-spa',
		termsAreModel,
	)) as unknown as HierarchyBootItem;

	// Per-hierarchy read-permission filter (PHP area_thesaurus_json loop):
	// ontology-area global admins bypass; everyone else must hold read on each
	// hierarchy's target section AND on each root term's section.
	const isOntologyArea = areaModel === 'area_ontology';
	const filteredValue: HierarchyBootItem['value'] = [];
	for (const hierarchy of item.value) {
		if (isOntologyArea && principal.isGlobalAdmin) {
			filteredValue.push(hierarchy);
			continue;
		}
		if (
			(await getPermissions(
				principal,
				hierarchy.target_section_tipo,
				hierarchy.target_section_tipo,
			)) < 1
		) {
			continue;
		}
		if (hierarchy.active_in_thesaurus === false) continue;
		if (
			hierarchy.children_tipo === undefined ||
			hierarchy.children_tipo === null ||
			hierarchy.children_tipo === ''
		) {
			continue;
		}
		const safeRootTerms: typeof hierarchy.root_terms = [];
		for (const rootTerm of hierarchy.root_terms) {
			if (typeof rootTerm.section_tipo !== 'string') continue;
			if ((await getPermissions(principal, rootTerm.section_tipo, rootTerm.section_tipo)) < 1) {
				continue;
			}
			safeRootTerms.push(rootTerm);
		}
		if (safeRootTerms.length === 0) continue;
		filteredValue.push({ ...hierarchy, root_terms: safeRootTerms });
	}
	// Rebuild typologies from the surviving hierarchies (dedup, first-seen).
	const survivingTypologyIds = new Set(filteredValue.map((h) => h.typology_section_id));
	item.value = filteredValue;
	item.typologies = item.typologies.filter((t) => survivingTypologyIds.has(t.section_id));

	// ts_search injection (PHP area_thesaurus_json): a client search request
	// (source.search_action==='search' with an rqo.sqo) or the area's pinned
	// properties.hierarchy_terms both pre-execute a thesaurus search.
	const { getNode } = await import('../ontology/resolver.ts');
	const areaProps = ((await getNode(areaTipo))?.properties ?? {}) as { hierarchy_terms?: unknown };
	const searchAction = (rqo.source as { search_action?: string })?.search_action;
	if (searchAction === 'search' && rqo.sqo !== undefined) {
		const { searchThesaurus } = await import('../ts_object/search.ts');
		item.ts_search = await searchThesaurus(
			rqo.sqo as unknown as Record<string, unknown>,
			principal,
		);
	} else if (Array.isArray(areaProps.hierarchy_terms) && areaProps.hierarchy_terms.length > 0) {
		const { searchThesaurus, getHierarchyTermsSqo } = await import('../ts_object/search.ts');
		const sqo = getHierarchyTermsSqo(
			areaProps.hierarchy_terms as {
				value?: { section_tipo: string; section_id: number | string }[];
			}[],
		);
		item.ts_search = await searchThesaurus(sqo, principal);
	}

	// Structure context (PHP area_thesaurus_json: get_structure_context + the
	// thesaurus_mode stamp). The client REQUIRES a non-empty context to render
	// the tree (area_thesaurus.js:547 guards on result.context.length).
	const context = await buildAreaContext(
		areaTipo,
		rqo.source?.mode ?? 'list',
		rqo.source?.lang ?? 'lg-spa',
		level,
	);
	if (context[0] !== undefined) {
		(context[0] as { thesaurus_mode?: string }).thesaurus_mode =
			(areaProps as { thesaurus_mode?: string }).thesaurus_mode ?? 'default';
	}

	return {
		status: 200,
		body: { result: { context, data: [item] }, msg: 'OK. Request done' },
	};
}
