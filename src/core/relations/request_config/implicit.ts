/**
 * request_config IMPLICIT — the LEGACY builder (RELATIONS_SPEC.md §4):
 * no explicit config on the ontology node; targets and child ddos derive
 * from the ontology relation graph. Deprecated for new ontologies but
 * load-bearing for classic simple relations (select/radio/check_box target
 * definitions like numisdata967 → dd501, numisdata1562 → numisdata1554, and
 * legacy `source` objects without request_config like numisdata55).
 * PHP oracle nomenclature: implicit ≡ v5, explicit ≡ v6.
 *
 * PHP reference: trait.request_config_v5.php —
 *   build_request_config_v5 :78 (pipeline), resolve_ar_related :186,
 *   resolve_ar_related_edit :232, resolve_ar_related_list_component :441,
 *   clean_and_extract_related :508, build_legacy_ddo_map :618.
 *
 * Faithful rules ported here:
 * - component_relation_parent/children are NOT resolvable implicitly — throw
 *   (PHP :88; their nodes must carry explicit config);
 * - the first 'section'-model relation node becomes the TARGET SECTION and
 *   is stripped from the ddo list (clean_and_extract_related);
 * - 'exclude_elements' marker nodes and the deprecated dd249 security
 *   component are skipped (clean_and_extract_related :531-538);
 * - component_filter always targets the projects section (PHP :261-264);
 * - when a section_list's relation nodes contain NO section, the component's
 *   main 'related' section is used (resolve_ar_related_list_component :454-473)
 *   — exposed as getMainRelatedSectionTipo for the list-cell path too;
 * - non-section callers force ddo mode 'list' (PHP :117).
 *
 * The per-user permissions filter (PHP STEP 5 filter_authorized_related)
 * LANDED 2026-07-10 — filterAuthorizedRelated below, applied to all three
 * builder paths (component list, projects/filter, section edit).
 * Ledgered (deny/no-op loudly, never silently): grouper direct-children
 * resolution (groupers build their context through structure_context, not
 * this path).
 */

import { EXPLICIT_CONFIG_REQUIRED_MODELS } from '../../concepts/request_config.ts';
import { sql } from '../../db/postgres.ts';
import { getModelByTipo, getNode } from '../../ontology/resolver.ts';
import { contextLabelOf } from '../../resolve/structure_context.ts';
import {
	type ParsedRequestConfigItem,
	type ProcessedDdo,
	type RequestConfigContext,
	buildSqoSectionTipoDdos,
} from './explicit.ts';

/** PHP DEDALO_SECTION_PROJECTS_TIPO — the projects section every component_filter targets. */
const SECTION_PROJECTS_TIPO = 'dd153';
/** PHP DEDALO_PROJECTS_NAME_TIPO (dd_tipos.php:76) — the project name component (input_text). */
const PROJECTS_NAME_TIPO = 'dd156';
/** PHP DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO — deprecated, always skipped. */
const DEPRECATED_SECURITY_AREAS_TIPO = 'dd249';

/**
 * PHP filter_authorized_related (trait.request_config_v5.php:574-86, applied
 * as build_request_config_v5 STEP 5 :123-27): only components the actor holds
 * level ≥ 1 on — checked against the resolved TARGET section — survive the
 * implicit map. The principal is read from the request-context ALS at CALL
 * TIME (never module-hoisted); absent principal (internal resolutions,
 * harnesses) = no filter. Admin-flagged users go through the matrix like PHP
 * (no bypass); the superuser passes via getPermissions' own short-circuit.
 */
async function filterAuthorizedRelated(
	componentTipos: string[],
	targetSectionTipo: string,
): Promise<Set<string>> {
	const { currentPrincipal } = await import('../../security/request_context.ts');
	const principal = currentPrincipal();
	if (principal === undefined) return new Set(componentTipos);
	const { ddoIsAuthorized } = await import('../../security/permissions.ts');
	const kept = new Set<string>();
	for (const tipo of componentTipos) {
		if (await ddoIsAuthorized(principal, targetSectionTipo, tipo)) kept.add(tipo);
	}
	return kept;
}

/**
 * The component's MAIN related section (PHP get_ar_tipo_by_model_and_relation
 * (tipo, 'section', 'related')): the first relation node whose model is
 * 'section'. Used when a section_list's relation nodes omit the target
 * section (PHP resolve_ar_related_list_component :454-473).
 */
export async function getMainRelatedSectionTipo(componentTipo: string): Promise<string | null> {
	const rows = (await sql`
		SELECT relations FROM dd_ontology WHERE tipo = ${componentTipo}
		  AND jsonb_typeof(relations) = 'array'
		LIMIT 1
	`) as { relations: { tipo?: string }[] | null }[];
	for (const link of rows[0]?.relations ?? []) {
		if (typeof link.tipo !== 'string') continue;
		if ((await getModelByTipo(link.tipo)) === 'section') return link.tipo;
	}
	return null;
}

/**
 * Implicit config from a node's ontology relation nodes (PHP resolve_ar_related_*
 * + clean_and_extract_related + build_legacy_ddo_map): the first
 * section-model node is the TARGET SECTION (stripped from the map), the rest
 * become ddos with mode forced 'list'. `sourceTipo` is the section_list
 * child (list mode) or the COMPONENT ITSELF (edit mode / no section_list).
 */
export async function buildImplicitComponentListConfig(
	sourceTipo: string,
	context: RequestConfigContext,
): Promise<ParsedRequestConfigItem[]> {
	// PHP :88 — parent/children are not resolvable via the implicit graph walk.
	const ownerModel = await getModelByTipo(context.ownerTipo);
	if (ownerModel !== null && EXPLICIT_CONFIG_REQUIRED_MODELS.includes(ownerModel)) {
		throw new Error(
			`Invalid component [${ownerModel}] configuration. v5 resolution fallback is ` +
				`no longer supported. Configure an RQO for the node ${context.ownerTipo}`,
		);
	}

	// component_filter always targets the projects section (PHP :261-264).
	if (ownerModel === 'component_filter' || ownerModel === 'component_filter_master') {
		// PHP STEP 5 filter_authorized_related applies to this branch too.
		const projectsDdoMap = (
			await filterAuthorizedRelated([PROJECTS_NAME_TIPO], SECTION_PROJECTS_TIPO)
		).has(PROJECTS_NAME_TIPO)
			? [
					{
						tipo: PROJECTS_NAME_TIPO,
						model: (await getModelByTipo(PROJECTS_NAME_TIPO)) ?? 'component_input_text',
						section_tipo: SECTION_PROJECTS_TIPO,
						parent: context.ownerTipo,
						mode: 'list',
						label: await contextLabelOf(PROJECTS_NAME_TIPO),
					},
				]
			: [];
		return [
			{
				api_engine: 'dedalo',
				type: 'main',
				sqo: { section_tipo: await buildSqoSectionTipoDdos([SECTION_PROJECTS_TIPO]) },
				show: {
					ddo_map: projectsDdoMap,
				},
				search: null,
				choose: null,
				hide: null,
			},
		];
	}

	const rows = (await sql`
		SELECT relations FROM dd_ontology WHERE tipo = ${sourceTipo}
		  AND jsonb_typeof(relations) = 'array'
		LIMIT 1
	`) as { relations: { tipo?: string }[] | null }[];
	const relationNodes = rows[0]?.relations ?? [];

	let targetSectionTipo: string | null = null;
	const ddoMap: ProcessedDdo[] = [];
	for (const link of relationNodes) {
		if (typeof link.tipo !== 'string') continue;
		const model = await getModelByTipo(link.tipo);
		if (model === null) continue;
		if (model === 'section' && targetSectionTipo === null) {
			targetSectionTipo = link.tipo; // PHP clean_and_extract_related :508
			continue;
		}
		// PHP clean_and_extract_related :531-538: marker nodes + deprecated skip.
		// Everything else survives (PHP keeps non-component nodes in the map).
		if (model === 'exclude_elements' || link.tipo === DEPRECATED_SECURITY_AREAS_TIPO) {
			continue;
		}
		ddoMap.push({
			tipo: link.tipo,
			model,
			// Implicit legacy ddos carry a SCALAR section_tipo (build_legacy_ddo_map),
			// unlike the explicit array form.
			section_tipo: targetSectionTipo ?? context.ownerSectionTipo,
			parent: context.ownerTipo,
			mode: 'list', // PHP trait.request_config_v5.php:117 — non-section callers force list
			label: await contextLabelOf(link.tipo),
		});
	}
	// section_list nodes may omit the target section — fall back to the
	// component's main related section (PHP :454-473).
	if (targetSectionTipo === null && sourceTipo !== context.ownerTipo) {
		targetSectionTipo = await getMainRelatedSectionTipo(context.ownerTipo);
	}
	// Fix section_tipo for ddos read before the section node appeared.
	if (targetSectionTipo !== null) {
		for (const ddo of ddoMap) {
			ddo.section_tipo = targetSectionTipo;
		}
	}
	// A node with NO relation graph at all yields NO config (PHP omits the
	// request_config — hierarchy40's source {mode:'external'} case: its data
	// resolves at runtime through the inverse engine, not a config).
	if (targetSectionTipo === null && ddoMap.length === 0) {
		return [];
	}
	// PHP STEP 5 (filter_authorized_related :123-27): per-user drop against the
	// resolved target section.
	const authorizedTipos = await filterAuthorizedRelated(
		ddoMap.map((ddo) => ddo.tipo),
		targetSectionTipo ?? context.ownerSectionTipo,
	);
	const authorizedDdoMap = ddoMap.filter((ddo) => authorizedTipos.has(ddo.tipo));
	return [
		{
			api_engine: 'dedalo',
			type: 'main',
			sqo: {
				section_tipo:
					targetSectionTipo !== null ? await buildSqoSectionTipoDdos([targetSectionTipo]) : [],
			},
			show: { ddo_map: authorizedDdoMap },
			search: null,
			choose: null,
			hide: null,
		},
	];
}

/** Model-name PREFIXES an edit-form child may have (PHP resolve_ar_related_edit). */
const EDIT_CHILD_MODEL_PREFIXES = [
	'component_',
	'section_group',
	'section_group_div',
	'section_tab',
	'tab',
] as const;

/**
 * The implicit EDIT config for a SECTION (PHP resolve_ar_related_edit 'section' +
 * build_legacy_ddo_map): a FLAT ddo list — every descendant whose model starts
 * with component_/section_group/section_tab/tab (recursive ontology walk,
 * component_dataframe excluded: it renders through its main component), each
 * with parent = the SECTION, mode 'edit', SCALAR section_tipo (implicit legacy
 * shape), view from own properties or the legacy default. This is what the
 * client renders the edit FORM BODY from.
 */
/**
 * Resolve a section tipo to its REAL section (for virtual sections) plus the set
 * of tipos to exclude from the edit form (PHP resolve_virtual + exclude_elements,
 * class.section.php:897-940). Real (non-virtual) sections resolve to themselves
 * with an empty exclude set.
 */
export async function resolveVirtualEditScope(
	sectionTipo: string,
): Promise<{ realTipo: string; excludeSet: Set<string> }> {
	const excludeSet = new Set<string>();
	// A virtual section's node relations[0].tipo points at the real section.
	const nodeRows = (await sql`
		SELECT relations FROM dd_ontology WHERE tipo = ${sectionTipo} LIMIT 1
	`) as { relations: { tipo?: unknown }[] | null }[];
	const candidate = nodeRows[0]?.relations?.[0]?.tipo;
	if (typeof candidate !== 'string' || candidate === sectionTipo) {
		return { realTipo: sectionTipo, excludeSet };
	}
	if ((await getModelByTipo(candidate)) !== 'section') {
		return { realTipo: sectionTipo, excludeSet };
	}
	// The FIRST exclude_elements child (by order) of the VIRTUAL section names
	// the excluded tipos in its `relations` (PHP uses [0] only).
	const exRows = (await sql`
		SELECT relations FROM dd_ontology
		WHERE parent = ${sectionTipo} AND model = 'exclude_elements'
		ORDER BY order_number NULLS LAST, id LIMIT 1
	`) as { relations: { tipo?: unknown }[] | null }[];
	for (const rel of exRows[0]?.relations ?? []) {
		if (typeof rel?.tipo === 'string') excludeSet.add(rel.tipo);
	}
	return { realTipo: candidate, excludeSet };
}

export async function buildImplicitSectionEditConfig(
	context: RequestConfigContext,
): Promise<ParsedRequestConfigItem[]> {
	// VIRTUAL SECTION resolution (PHP get_ar_children_tipo_by_model_name_in_section
	// with resolve_virtual=true, class.section.php:897-940): a virtual section
	// (its node's relations[0].tipo points at a real section) borrows the REAL
	// section's edit components, MINUS the tipos named by its FIRST
	// exclude_elements child. Without this, a virtual section's edit form is
	// empty (its own children are only exclude_elements/section_list/buttons).
	const { realTipo, excludeSet } = await resolveVirtualEditScope(context.ownerTipo);

	// Recursive DFS pre-order over ontology children (order_number, id tie).
	// An excluded tipo is skipped AND not recursed into — so excluding a grouper
	// drops its whole subtree (matches PHP's flat exclude of the recursive children).
	const collectChildren = async (parentTipo: string, collected: string[]): Promise<void> => {
		const rows = (await sql`
			SELECT tipo, model FROM dd_ontology
			WHERE parent = ${parentTipo}
			ORDER BY order_number, id
		`) as { tipo: string; model: string | null }[];
		for (const row of rows) {
			if (excludeSet.has(row.tipo)) continue;
			const model = (await getModelByTipo(row.tipo)) ?? row.model ?? '';
			const matches = EDIT_CHILD_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix));
			if (!matches || model === 'component_dataframe') continue;
			collected.push(row.tipo);
			await collectChildren(row.tipo, collected);
		}
	};
	const childTipos: string[] = [];
	await collectChildren(realTipo, childTipos);
	// PHP STEP 5 (filter_authorized_related :123-27): the edit form only carries
	// components the actor can read — checked against the OWNER section.
	const authorizedChildren = await filterAuthorizedRelated(childTipos, context.ownerSectionTipo);
	const visibleChildTipos = childTipos.filter((tipo) => authorizedChildren.has(tipo));

	const { resolveDefaultView } = await import('../../resolve/structure_context.ts');
	const ddoMap: ProcessedDdo[] = [];
	for (const tipo of visibleChildTipos) {
		const model = await getModelByTipo(tipo);
		if (model === null) continue;
		const node = await getNode(tipo);
		// View: own properties, else the legacy-model default (PHP resolve_view —
		// autocomplete→line, portal→default, relation family→line, html_text).
		const legacyModel = node !== null && node.model !== model ? node.model : null;
		const view =
			(node?.properties as { view?: string } | null)?.view ??
			resolveDefaultView(model, legacyModel);
		const ddo: ProcessedDdo = {
			tipo,
			model,
			// Implicit legacy shape: SCALAR section_tipo (vs the explicit array form).
			section_tipo: context.ownerSectionTipo,
			parent: context.ownerTipo,
			mode: 'edit',
			label: await contextLabelOf(tipo),
		};
		if (view !== null) ddo.view = view;
		ddoMap.push(ddo);
	}

	return [
		{
			api_engine: 'dedalo',
			type: 'main',
			sqo: {
				section_tipo: await buildSqoSectionTipoDdos([context.ownerSectionTipo]),
				limit: 1,
				offset: 0,
			},
			show: { ddo_map: ddoMap },
			search: null,
			choose: null,
			hide: null,
		} as unknown as ParsedRequestConfigItem,
	];
}
