/**
 * request_config BUILD ENTRY (RELATIONS_SPEC.md §4) — the single place that
 * decides HOW an element's request_config resolves:
 *
 * 1. LIST/TM cells substitute the element's own properties with its
 *    section_list ontology child's (PHP resolve_source_properties): the
 *    child's explicit config when it has one, else the implicit graph walk
 *    over the child's relation nodes.
 * 2. Otherwise the branch is DATA-DRIVEN, never per-model (PHP
 *    common::get_ar_request_config, class.common.php:3502, mirrored by the
 *    pure concepts/request_config.ts selectRequestConfigStrategy): explicit
 *    iff properties.source.request_config exists, else the implicit fallback —
 *    component relation nodes for components, the full edit form tree for
 *    sections in edit mode.
 *
 * Explicit parsing lives in ./explicit.ts, the legacy graph walk in
 * ./implicit.ts. PHP oracle nomenclature: explicit ≡ v6, implicit ≡ v5.
 */

import { selectRequestConfigStrategy } from '../../concepts/request_config.ts';
import { sql } from '../../db/postgres.ts';
import { getNode } from '../../ontology/resolver.ts';
import {
	type ParsedRequestConfigItem,
	type RequestConfigContext,
	buildExplicitRequestConfig,
	extractSqoSectionTipos,
} from './explicit.ts';
import { buildImplicitComponentListConfig, buildImplicitSectionEditConfig } from './implicit.ts';

/**
 * Find an element's list-definition child tipo (dd_ontology, PLAIN direct
 * children — the Site-B trait's lookup is get_ar_children_of_this, never
 * resolve_virtual; class.ontology_node.php:1586-88). FIRST by order_number —
 * PHP takes $ar_terms[0] of a children list ordered `order_number asc`
 * (class.ontology_node.php:1250-1253), and multi-child parents exist
 * (tch546×4, oh123×2, tch20×2), so the ordering is load-bearing.
 */
export async function findSectionListChild(
	ownerTipo: string,
	model = 'section_list',
): Promise<string | null> {
	const rows = (await sql`
		SELECT tipo FROM dd_ontology WHERE parent = ${ownerTipo} AND model = ${model}
		ORDER BY order_number ASC LIMIT 1
	`) as { tipo: string }[];
	return rows[0]?.tipo ?? null;
}

/**
 * Resolve an element's request_config with the PHP source-property rules:
 * in LIST/TM/LIST_THESAURUS mode the section_list(_thesaurus) child's
 * properties replace the element's own (PHP resolve_source_properties
 * :264-309) — UNLESS the owner is a SECTION with a direct
 * source.request_config (:274, keeps its own). When the child's properties
 * are absent, the implicit fallback derives the map from its relation_nodes.
 *
 * STAGE-2 user PRESET override (PHP build_request_config → resolve_preset_properties,
 * class.common.php:2986/3156): SECTION owners first look for an active dd1244
 * layout preset for this (tipo, section_tipo, mode) + user. When one matches,
 * its request_config is injected into a CLONE of the element's properties (the
 * cached ontology properties are never mutated) so the section_list swap and
 * strategy selection below run over the preset exactly as PHP's
 * resolve_source_properties runs over resolve_preset_properties' override.
 */
export async function buildRequestConfigForElement(
	ownProperties: unknown,
	context: RequestConfigContext,
): Promise<ParsedRequestConfigItem[]> {
	// STAGE 2 preset: section owners only (PHP resolve_preset_properties gates on
	// get_called_class()==='section'). tipo === section_tipo for a section, so
	// both feed the match. The current user is read live inside the resolver.
	// `sourceProperties` is the element's own properties UNLESS an active preset
	// injects its request_config onto a clone (never the shared/cached original).
	let sourceProperties = ownProperties;
	if (context.ownerIsSection) {
		const { resolvePresetRequestConfig } = await import('./presets.ts');
		const preset = await resolvePresetRequestConfig(
			context.ownerTipo,
			context.ownerSectionTipo,
			context.mode,
		);
		if (preset !== null) {
			// Inject the override onto a fresh clone — never touch the shared/cached
			// ontology properties (PHP builds the override on a json round-trip clone).
			const base = (ownProperties ?? {}) as Record<string, unknown>;
			const clonedSource = { ...((base.source as Record<string, unknown>) ?? {}) };
			clonedSource.request_config = preset;
			sourceProperties = { ...base, source: clonedSource };
		}
	}

	const listLikeMode =
		context.mode === 'list' || context.mode === 'tm' || context.mode === 'list_thesaurus';
	// PHP :274 — a SECTION with a DIRECT source.request_config skips the
	// section_list swap (isset semantics: any non-null value).
	const ownConfig = (sourceProperties as { source?: { request_config?: unknown } } | null)?.source
		?.request_config;
	const sectionKeepsOwn = context.ownerIsSection && ownConfig !== undefined && ownConfig !== null;
	if (listLikeMode && !sectionKeepsOwn) {
		const listModel = context.mode === 'list_thesaurus' ? 'section_list_thesaurus' : 'section_list';
		const sectionListTipo = await findSectionListChild(context.ownerTipo, listModel);
		if (sectionListTipo !== null) {
			const childNode = await getNode(sectionListTipo);
			const childProperties = childNode?.properties ?? null;
			if (selectRequestConfigStrategy(childProperties) === 'explicit') {
				return buildExplicitRequestConfig(childProperties, context);
			}
			// NULL / config-less child properties → implicit from its relation_nodes.
			return buildImplicitComponentListConfig(sectionListTipo, context);
		}
	}
	if (selectRequestConfigStrategy(sourceProperties) === 'explicit') {
		return buildExplicitRequestConfig(sourceProperties, context);
	}
	// No explicit config anywhere: implicit from the COMPONENT's own
	// relation_nodes (the classic select/radio/check_box target definition —
	// e.g. [dd501, dd503]).
	if (!context.ownerIsSection) {
		return buildImplicitComponentListConfig(context.ownerTipo, context);
	}
	// SECTION in EDIT mode without explicit config: the FULL form tree (PHP
	// resolve_ar_related_edit 'section' case) — every component/grouper child.
	if (context.mode === 'edit') {
		return buildImplicitSectionEditConfig(context);
	}
	return [];
}

/**
 * The element's target section tipos (PHP get_ar_target_section_tipo): the
 * section_tipo targets of the resolved request_config sqo — deduped WITHIN each
 * config (extractSqoSectionTipos, PHP array_unique) but CONCATENATED across
 * configs (PHP get_ar_target_section_ddo spreads per-config lists without
 * dedup, class.component_common.php:3070-77 — a multi-config element repeats
 * its shared targets). Defaults to SEARCH mode: PHP get_section_elements_context
 * instantiates each element in mode 'search' (class.common.php:3915-22), NOT
 * 'list' — list mode applies the section_list source substitution and resolves
 * a DIFFERENT config (oh27: list→rsc205 vs search→rsc332 = PHP). Empty when
 * the element declares no sqo target.
 */
export async function getElementTargetSectionTipos(
	tipo: string,
	sectionTipo: string,
	mode = 'search',
): Promise<string[]> {
	const node = await getNode(tipo);
	const requestConfig = await buildRequestConfigForElement(node?.properties ?? null, {
		ownerTipo: tipo,
		ownerSectionTipo: sectionTipo,
		mode,
		ownerIsSection: false,
	});
	const targetTipos: string[] = [];
	for (const item of requestConfig) {
		targetTipos.push(...extractSqoSectionTipos(item));
	}
	return targetTipos;
}

/**
 * The element's base columns_map (PHP common::get_columns_map): in LIST/TM
 * mode the section_list child's properties.source.columns_map (falling back to
 * the element's own when no section_list exists); otherwise the element's own.
 * Null when no columns_map is declared anywhere — the client then derives the
 * grid columns from the request_config show ddo_map in JS.
 */
export async function getElementColumnsMap(
	ownerTipo: string,
	ownProperties: unknown,
	mode: string,
): Promise<unknown[] | null> {
	let properties = ownProperties as { source?: { columns_map?: unknown[] } } | null;
	if (mode === 'list' || mode === 'tm') {
		const sectionListTipo = await findSectionListChild(ownerTipo);
		if (sectionListTipo !== null) {
			const node = await getNode(sectionListTipo);
			properties = node?.properties as typeof properties;
		}
	}
	return properties?.source?.columns_map ?? null;
}
