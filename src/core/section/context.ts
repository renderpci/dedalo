/**
 * Section CONTEXT stamping (SECTION_SPEC §6) — the section-only extras a
 * structure-context entry carries beyond a component: matrix_table,
 * config.relation_list_tipo, buttons, tools (and, Phase B, the section_map
 * stamp + sqo_session). Extracted from resolve/structure_context.ts into the
 * section module home; invoked from buildStructureContext for model 'section'.
 *
 * PHP reference: common::build_structure_context_core, the $model==='section'
 * block (class.common.php:2056-2101).
 */

import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import { getSectionMap } from '../ontology/section_map.ts';
import type { StructureContextEntry } from '../resolve/structure_context.ts';
import type { Principal } from '../security/permissions.ts';
import { buildSectionButtons, sectionRelationListTipo } from './buttons.ts';

/** Inputs the section stamp needs from the calling structure-context build. */
export interface SectionStampParams {
	tipo: string;
	permissions: number;
	/** The element's ontology properties (already deep-cloned by the caller). */
	properties: unknown;
	/** When present, buttons use the real per-button ACL (Phase B). */
	principal?: Principal;
}

/**
 * Stamp the section-only context extras onto `entry` in place (PHP :2056-2100):
 * - matrix_table (the section's storage table);
 * - config.relation_list_tipo (the inverse-references inspector trigger);
 * - buttons (the section's permission-gated button_* children);
 * - tools (admin path — the section toolbar).
 */
export async function stampSectionContext(
	entry: StructureContextEntry,
	params: SectionStampParams,
): Promise<void> {
	// The four lookups are independent reads — fetched concurrently (ALS
	// request context flows into every Promise.all branch, docs/
	// REQUEST_ISOLATION.md), then assigned in the original field order (the
	// stamped key order is wire surface).
	const [matrixTable, relationListTipo, sectionMap, buttons] = await Promise.all([
		getMatrixTableFromTipo(params.tipo),
		sectionRelationListTipo(params.tipo),
		// section_map: the section_map child node's properties (PHP :2075) — maps
		// functional roles (term/parent/order/…) to component tipos per scope.
		getSectionMap(params.tipo),
		// Buttons: the section's ontology button_* children, permission-gated
		// (PHP get_buttons_context). With a principal the per-button ACL applies;
		// without one the caller-cap proxy (admin path exact).
		buildSectionButtons(params.tipo, params.permissions, params.principal),
	]);
	entry.matrix_table = matrixTable;
	entry.config = { relation_list_tipo: relationListTipo };
	entry.section_map = sectionMap;
	entry.buttons = buttons;
	// sqo_session (PHP class.common.php:1695-98, stamped PER CALL — session
	// pagination state changes between calls, never cached): the section's
	// stored navigation SQO (sqo_id = the section tipo, section::build_sqo_id
	// is the identity), null when the session holds none. The client syncs its
	// pagination from this ("propagation data problem"); readSectionRows is
	// the writer. ALS-read at call time.
	const { currentRequestContext } = await import('../security/request_context.ts');
	entry.sqo_session = currentRequestContext()?.session?.sqoSession?.[params.tipo] ?? null;

	// Tools: the section's toolbar (PHP common::get_tools). Admin path only in
	// the current wiring (non-admin security-tools-profile filter ledgered).
	if (params.permissions >= 3) {
		const { getSectionTools } = await import('../tools/registry.ts');
		const toolConfigKeys = Object.keys(
			(params.properties as { tool_config?: Record<string, unknown> } | null)?.tool_config ?? {},
		);
		const sectionTools = await getSectionTools(params.tipo, toolConfigKeys);
		entry.tools = sectionTools.tools;
	}
}
