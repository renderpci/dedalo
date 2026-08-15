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

import { type ApiResult, denied, notAuthorized } from '../api/response.ts';
import {
	AREA_ONTOLOGY_TIPO,
	areaBehaviorOf,
	isAreaModel,
	PICKER_CALLER_MALFORMED_MESSAGE,
	PICKER_CALLER_MIN_PERMISSIONS,
	PICKER_CALLER_SECTIONLESS_MESSAGE,
	PICKER_CALLER_UNKNOWN_MESSAGE,
	PICKER_CALLER_VIEW,
	PICKER_NO_HIERARCHY_MESSAGE,
	type PickerCaller,
	type PickerTermSelectability,
	parsePickerCaller,
	type ThesaurusMode,
} from '../concepts/area.ts';
import type { Rqo } from '../concepts/rqo.ts';
import { canonicalizeStoredSectionId, isSectionId } from '../concepts/section_id.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../ontology/resolver.ts';
import {
	isTermSelectable,
	type PickerConstraint,
	resolvePickerConstraint,
} from '../relations/picker_constraint.ts';
import { buildStructureContext } from '../resolve/structure_context.ts';
import { getPermissions, type Principal, SUPERUSER_ID } from '../security/permissions.ts';
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
		/** Relation mode only — the per-node link affordance (see §5 emission). */
		root_terms_selectable?: PickerTermSelectability[];
	}[];
	typologies: { section_id: string }[];
	ts_search?: unknown;
}

/**
 * What the server DERIVED from a declared picker caller: the mode it grants and
 * the constraint the picker (and the write chokepoint) is bound by.
 *
 * `constraint` is null for a caller that is not a relation-family component: it
 * holds no locators, declares no target and has no `data_limit`, so there is
 * nothing to narrow or to cap. That is not a narrowed scope — the read simply
 * serves the ordinary browse it always served, and relation mode is not
 * granted.
 */
interface ResolvedPickerCaller {
	mode: ThesaurusMode;
	constraint: PickerConstraint | null;
}

/** Distinguish a refusal from a resolution (both are returned by value). */
function isRefusal(value: ResolvedPickerCaller | ApiResult): value is ApiResult {
	return 'status' in value;
}

/**
 * Derive the picker facts from the declared caller (engineering/AREA_SPEC.md §5 — the whole
 * point of the caller-declared design).
 *
 * RELATION MODE IS GRANTED, NEVER READ FROM THE REQUEST. All three conditions
 * must hold: the caller's RESOLVED view is the picker view (resolved through
 * the ordinary structure-context seam, so a ddo_map-injected view counts too),
 * its model is relation-family, and the principal holds EDIT on it. Any of them
 * missing is not an error — the read proceeds in `default` mode and the picker
 * intent is simply not granted.
 *
 * Relation-family is asked STRUCTURALLY (`getColumnNameByModel(model) ===
 * 'relation'` — does this model store locators?) rather than against a second
 * hand-kept model list, and it is the SAME question
 * relations/picker_constraint.ts asks before counting: pre-checking it here is
 * what keeps that resolver's contract throw from firing on an ordinary
 * mis-wired request.
 *
 * The client-input failures (an unknown element, a section that holds no
 * records) refuse as 400 with named reasons. Everything the constraint resolver
 * still throws on — an ontology node declaring an unusable `data_limit` — is a
 * definition defect, not request input, and propagates loudly: degrading it to
 * "uncapped" would silently unbind the very cap the write path re-resolves.
 */
/**
 * Does `tipo` actually live under `sectionTipo`? The honesty check on the
 * caller declaration's two independent client strings.
 *
 * Answered with the ontology's own ancestry walk (virtual-aware through
 * `getSectionRealTipo`, because a virtual section borrows the real one's
 * children — a caller on `rsc170` legitimately names a component defined under
 * `rsc2`). A pair the ontology does not describe is malformed input, not a
 * degraded mode.
 */
async function tipoBelongsToSection(tipo: string, sectionTipo: string): Promise<boolean> {
	const { getAncestorSectionTipo } = await import('../ontology/resolver.ts');
	const { getSectionRealTipo } = await import('../resolve/security_access_datalist.ts');
	const ownSection = await getAncestorSectionTipo(tipo);
	if (ownSection === null) return false;
	if (ownSection === sectionTipo) return true;
	// A VIRTUAL section borrows the real section's children, so a caller on
	// `rsc170` legitimately names a component whose ontology position is under
	// `rsc2`. `getAncestorSectionTipo` reports the REAL position (a virtual
	// section is never on a parent chain), so the declared side is the one that
	// has to be resolved.
	return (await getSectionRealTipo(sectionTipo)) === ownSection;
}

/**
 * The `view` this component is given by its SECTION's ddo_map, or null when the
 * map does not name it (the ordinary case — the node's own `properties.view`
 * then answers).
 *
 * Derived from the section's own ontology request_config, the same door the
 * section read uses, so the server never takes a view from the request.
 */
export async function ddoMapViewFor(tipo: string, sectionTipo: string): Promise<string | null> {
	try {
		const { deriveSectionDdoMap } = await import('../section/read.ts');
		const ddoMap = await deriveSectionDdoMap(sectionTipo, sectionTipo, 'edit');
		const entry = ddoMap.find((ddo) => (ddo as { tipo?: unknown }).tipo === tipo) as
			| { view?: unknown }
			| undefined;
		return typeof entry?.view === 'string' && entry.view !== '' ? entry.view : null;
	} catch (error) {
		// A section whose ddo_map cannot be derived is not a picker failure: the
		// node's own properties still answer. Reported, never silently swallowed.
		console.error(
			`[area/read] could not derive the ddo_map of '${sectionTipo}' for picker caller '${tipo}':`,
			error,
		);
		return null;
	}
}

async function resolvePickerCaller(
	caller: PickerCaller,
	principal: Principal,
	lang: string,
): Promise<ResolvedPickerCaller | ApiResult> {
	const model = await getModelByTipo(caller.tipo);
	if (model === null) {
		return denied(400, PICKER_CALLER_UNKNOWN_MESSAGE);
	}
	if (getColumnNameByModel(model) !== 'relation') {
		return { mode: 'default', constraint: null };
	}
	if ((await getMatrixTableFromTipo(caller.section_tipo)) === null) {
		return denied(400, PICKER_CALLER_SECTIONLESS_MESSAGE);
	}
	// THE PAIR MUST BE REAL. `tipo` and `section_tipo` arrive as two independent
	// client strings, and nothing above ties them together: without this check a
	// request can name any component under any section it can read. That matters
	// because `getPermissions` short-circuits for some sections (the dd655 preset
	// surface answers 2 for any tipo beneath it), so a forged pair could obtain
	// relation mode — and with it the caller's resolved targets and cap — for a
	// component that never declared a picker. The grant is only as honest as the
	// pair it is derived from.
	if (!(await tipoBelongsToSection(caller.tipo, caller.section_tipo))) {
		return denied(400, PICKER_CALLER_UNKNOWN_MESSAGE);
	}

	const permissions = await getPermissions(principal, caller.section_tipo, caller.tipo);
	const constraint = await resolvePickerConstraint(
		caller.tipo,
		caller.section_tipo,
		caller.section_id,
	);
	// THE DDO-INJECTED VIEW IS PART OF THE ANSWER. `structure_context` resolves
	// `options.view ?? properties.view ?? model default`, and `options.view` is
	// the ddo_map channel — the section read passes it while walking the map. A
	// build without it sees ONLY the node's own `properties.view`, so a component
	// that declares `view:'tree'` in its parent's ddo_map (a live mechanism, and
	// how several shipped portals declare it) rendered the tree view on the
	// client while the server refused the grant: an edit affordance that browses
	// and navigates away on every click. The map is derived server-side from the
	// section's own ontology, never taken from the request.
	const injectedView = await ddoMapViewFor(caller.tipo, caller.section_tipo);
	// EDIT mode: the picker is an edit affordance, and `view:'tree'` is
	// registered edit-only on the client. request_config is not needed here —
	// the caller's targets come from the ONE picker resolver, so this build
	// answers exactly one question: which view did the caller resolve to.
	const callerContext = await buildStructureContext({
		tipo: caller.tipo,
		sectionTipo: caller.section_tipo,
		mode: 'edit',
		lang,
		permissions,
		addRequestConfig: false,
		view: injectedView,
	});
	const granted =
		callerContext?.view === PICKER_CALLER_VIEW && permissions >= PICKER_CALLER_MIN_PERMISSIONS;

	return { mode: granted ? 'relation' : 'default', constraint };
}

/**
 * The per-node link affordance for the root terms this read emits (engineering/AREA_SPEC.md §5).
 *
 * The answer is the TERM's, never the caller's: relation mode means the
 * thesaurus itself declares, term by term, what may be linked. Deeper nodes are
 * served by dd_ts_api (get_children_data), which must answer the same way from
 * the same resolver — the rule has ONE implementation
 * (relations/picker_constraint.ts isTermSelectable → ts_object isIndexable).
 *
 * A root term that addresses no record declares nothing, so it carries no link
 * affordance — it still renders, visible and navigable, exactly like a
 * structural node.
 */
async function resolveRootTermSelectability(
	rootTerms: { section_tipo?: unknown; section_id?: unknown }[],
): Promise<PickerTermSelectability[]> {
	const selectability: PickerTermSelectability[] = [];
	for (const rootTerm of rootTerms) {
		const sectionTipo = String(rootTerm.section_tipo);
		const address = canonicalizeStoredSectionId(rootTerm.section_id);
		selectability.push({
			section_tipo: sectionTipo,
			section_id: rootTerm.section_id,
			selectable: isSectionId(address) ? await isTermSelectable(sectionTipo, address) : false,
		});
	}
	return selectability;
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
			return notAuthorized('Insufficient permissions to read');
		}
	}

	if (behavior === 'tree') {
		return await readTreeArea(rqo, principal, model as 'area_thesaurus' | 'area_ontology');
	}

	if (behavior === 'maintenance') {
		// Maintenance-area read (PHP area_maintenance_json): the widget catalog
		// rides as `datalist`. Admin-only, like the PHP area.
		if (!principal.isGlobalAdmin) {
			return notAuthorized('Insufficient permissions to read');
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
 *
 * PICKER READS (engineering/AREA_SPEC.md §5): a read that declares `source.caller` is opening the
 * tree FOR a component instance. It gets, derived from that caller and from
 * nothing the request asserts: the thesaurus mode, the hierarchy narrowing, the
 * selection constraint, per-node selectability — and, when the result is empty,
 * an honest answer about WHY (403 refused vs 409 unconfigured) instead of the
 * empty tree PHP returned for both.
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
		return notAuthorized('Insufficient permissions to read');
	}
	const lang = rqo.source?.lang ?? 'lg-spa';

	// THE PICKER CALLER (engineering/AREA_SPEC.md §5): a read may declare WHICH component instance
	// it is opening the tree for. It declares nothing else — no mode, no target
	// list, no term pinning: those are conclusions, and a client's conclusions
	// are not authority (the same objection dispatchAreaRead already makes about
	// source.model). A present-but-malformed caller refuses; an absent one is an
	// ordinary browse read, byte-unchanged.
	const declaredCaller = (rqo.source as { caller?: unknown } | undefined)?.caller;
	let picker: ResolvedPickerCaller | null = null;
	if (declaredCaller !== undefined && declaredCaller !== null) {
		const caller = parsePickerCaller(declaredCaller);
		if (caller === null) {
			return denied(400, PICKER_CALLER_MALFORMED_MESSAGE);
		}
		const resolved = await resolvePickerCaller(caller, principal, lang);
		if (isRefusal(resolved)) return resolved;
		picker = resolved;
	}

	// terms_are_model (PHP build_options->terms_are_model): the ontology model
	// view. The client sends it in source.build_options.
	const buildOptions = (rqo.source as { build_options?: { terms_are_model?: boolean } })
		?.build_options;
	const termsAreModel = buildOptions?.terms_are_model === true;
	// Hierarchy narrowing (engineering/AREA_SPEC.md §5): the caller's OWN resolved targets, not a
	// client-sent section list. Independent of the mode grant — which thesaurus
	// belongs to this caller does not depend on whether the principal may pick
	// from it.
	const item = (await readAreaHierarchyData(
		areaModel,
		areaTipo,
		lang,
		termsAreModel,
		picker?.constraint?.targets ?? null,
	)) as unknown as HierarchyBootItem;

	// Per-hierarchy read-permission filter (PHP area_thesaurus_json loop):
	// ontology-area global admins bypass; everyone else must hold read on each
	// hierarchy's target section AND on each root term's section.
	//
	// THE TWO EMPTY CASES ARE DIFFERENT FACTS (engineering/AREA_SPEC.md §5) and are counted
	// SEPARATELY as the loop drops each candidate — "nothing survived" alone
	// cannot tell them apart, and answering the wrong one tells a curator their
	// thesaurus is forbidden when it is merely unconfigured (or the reverse,
	// which leaks that it exists).
	const isOntologyArea = areaModel === 'area_ontology';
	const filteredValue: HierarchyBootItem['value'] = [];
	let refusedByAcl = 0;
	let droppedByConfig = 0;
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
			refusedByAcl++;
			continue;
		}
		if (hierarchy.active_in_thesaurus === false) {
			droppedByConfig++;
			continue;
		}
		if (
			hierarchy.children_tipo === undefined ||
			hierarchy.children_tipo === null ||
			hierarchy.children_tipo === ''
		) {
			droppedByConfig++;
			continue;
		}
		const safeRootTerms: typeof hierarchy.root_terms = [];
		let rootTermsRefused = 0;
		for (const rootTerm of hierarchy.root_terms) {
			if (typeof rootTerm.section_tipo !== 'string') continue;
			if ((await getPermissions(principal, rootTerm.section_tipo, rootTerm.section_tipo)) < 1) {
				rootTermsRefused++;
				continue;
			}
			safeRootTerms.push(rootTerm);
		}
		if (safeRootTerms.length === 0) {
			// Root terms the principal may not read → refused. NO root terms (or
			// only unaddressable ones) → the hierarchy declares no entry point.
			if (rootTermsRefused > 0) refusedByAcl++;
			else droppedByConfig++;
			continue;
		}
		filteredValue.push({ ...hierarchy, root_terms: safeRootTerms });
	}
	// Rebuild typologies from the surviving hierarchies (dedup, first-seen).
	const survivingTypologyIds = new Set(filteredValue.map((h) => h.typology_section_id));
	item.value = filteredValue;
	item.typologies = item.typologies.filter((t) => survivingTypologyIds.has(t.section_id));

	// THE REFUSAL SPLIT (engineering/AREA_SPEC.md §5) — for CALLER-DECLARED reads only. An
	// ordinary browse read of an empty tree area keeps answering 200 with an
	// empty projection, which is the shape the frozen parity fixtures pin; a
	// picker that opens on nothing is a broken affordance and must say why.
	if (picker !== null && filteredValue.length === 0) {
		if (refusedByAcl > 0 && droppedByConfig === 0) {
			// The GENERIC message: naming the target sections the caller cannot
			// reach tells them those sections exist (api/response.ts). And it is
			// notAuthorized(), never denied(403, …) — the machine token is what
			// the client dispatches its "no permission" page on.
			return notAuthorized();
		}
		return denied(409, PICKER_NO_HIERARCHY_MESSAGE);
	}

	// Per-node link affordance, relation mode only (engineering/AREA_SPEC.md §5): the picker
	// renders the server's answer per term and re-derives nothing.
	if (picker?.mode === 'relation') {
		for (const hierarchy of filteredValue) {
			hierarchy.root_terms_selectable = await resolveRootTermSelectability(hierarchy.root_terms);
		}
	}

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
		// hierarchy_terms IS NOT READ FROM THE REQUEST, deliberately (engineering/AREA_SPEC.md §5).
		// PHP folded a `hierarchy_terms` URL var onto the page context, but the
		// client sends a DIFFERENT shape there (fixed_filter entries
		// {source:'hierarchy_terms',…}) from the HierarchyTerm[] this pinning
		// consumes, so folding it would wire a var nothing can read. Pinned
		// terms stay the AREA node's own property below; per-caller pinning, if
		// ever wanted, is derived from the caller's own fixed_filter
		// server-side, in its own change.
	} else if (Array.isArray(areaProps.hierarchy_terms) && areaProps.hierarchy_terms.length > 0) {
		const { searchThesaurus, getHierarchyTermsSqo } = await import('../ts_object/search.ts');
		// The pinned-terms shape is OWNED by getHierarchyTermsSqo (HierarchyTerm)
		// — referenced, never re-declared here, so the stored-locator tolerance
		// it documents has ONE definition (WC-2026-08-10-section-id-int-canonical).
		const sqo = getHierarchyTermsSqo(
			areaProps.hierarchy_terms as import('../ts_object/search.ts').HierarchyTerm[],
		);
		item.ts_search = await searchThesaurus(sqo, principal);
	}

	// Structure context (PHP area_thesaurus_json: get_structure_context + the
	// thesaurus_mode stamp). The client REQUIRES a non-empty context to render
	// the tree (area_thesaurus.js:547 guards on result.context.length).
	const context = await buildAreaContext(areaTipo, rqo.source?.mode ?? 'list', lang, level);
	if (context[0] !== undefined) {
		const entry = context[0] as { thesaurus_mode?: ThesaurusMode; picker?: PickerConstraint };
		// A caller-declared read gets the DERIVED mode and only that: the area
		// node's own thesaurus_mode is the install default for ordinary browse
		// reads and must not be able to grant a picker request a mode the
		// caller did not earn.
		entry.thesaurus_mode =
			picker !== null
				? picker.mode
				: ((areaProps as { thesaurus_mode?: ThesaurusMode }).thesaurus_mode ?? 'default');
		// The ONE constraint (selection_limit / remaining / targets), resolved by
		// the same module the write chokepoint re-resolves it with, so the
		// affordance the picker offers and the persistence the save allows are
		// literally the same value.
		if (picker?.mode === 'relation' && picker.constraint !== null) {
			entry.picker = picker.constraint;
		}
	}

	return {
		status: 200,
		body: { result: { context, data: [item] }, msg: 'OK. Request done' },
	};
}
