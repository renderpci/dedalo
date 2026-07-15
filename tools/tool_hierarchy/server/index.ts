/**
 * tool_hierarchy server module — hierarchy consistency.
 *
 * inspect_hierarchy: READ. The invariant checklist (level >= 1 — seeing WHY a
 *   hierarchy is broken is a read, and the panel renders on every open).
 * generate_virtual_section: WRITE. Converge to the invariant (ensureHierarchy), or
 *   rebuild the ontology when force_to_create is set. Requires level >= 2 on the
 *   source section_tipo (PHP security::assert_section_permission).
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import { toolHierarchyGenerateVirtualSection, toolHierarchyInspect } from './tool_hierarchy.ts';

export const tool: ToolServerModule = {
	name: 'tool_hierarchy',
	apiActions: {
		inspect_hierarchy: {
			permission: 'section',
			minLevel: 1,
			handler: toolHierarchyInspect,
		},
		generate_virtual_section: {
			permission: 'section',
			minLevel: 2,
			handler: toolHierarchyGenerateVirtualSection,
		},
	},
};
