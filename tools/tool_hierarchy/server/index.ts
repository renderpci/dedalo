/**
 * tool_hierarchy server module — hierarchy consistency.
 *
 * inspect_hierarchy: READ. The invariant checklist (level >= 1 — seeing WHY a
 *   hierarchy is broken is a read, and the panel renders on every open).
 * generate_virtual_section: WRITE. Converge to the invariant (ensureHierarchy), or
 *   rebuild the ontology when force_to_create is set.
 *
 * Both gates are the 'targets' kind bound to the record the writer is PINNED to:
 * `hierarchy1/<options.section_id>` (hierarchyTargets). The state module writes
 * HIERARCHY_SECTION by constant and takes only the id, so a gate over
 * `options.section_tipo` authorized a sibling field — any section the caller
 * held write on passed it, while the hierarchy record was rewritten ungated
 * (audit CARRY-08 / TOOLS-04). Level 2 for the write, 1 for the inspect.
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import {
	hierarchyTargets,
	toolHierarchyGenerateVirtualSection,
	toolHierarchyInspect,
} from './tool_hierarchy.ts';

export const tool: ToolServerModule = {
	name: 'tool_hierarchy',
	apiActions: {
		inspect_hierarchy: {
			permission: 'targets',
			minLevel: 1,
			targets: hierarchyTargets,
			handler: toolHierarchyInspect,
		},
		generate_virtual_section: {
			permission: 'targets',
			minLevel: 2,
			targets: hierarchyTargets,
			handler: toolHierarchyGenerateVirtualSection,
		},
	},
};
