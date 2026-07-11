/**
 * tool_hierarchy server module — generate a virtual (hierarchy) section.
 *
 * generate_virtual_section: WRITE. Requires level >= 2 on the source
 * section_tipo (PHP security::assert_section_permission).
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import { toolHierarchyGenerateVirtualSection } from './tool_hierarchy.ts';

export const tool: ToolServerModule = {
	name: 'tool_hierarchy',
	apiActions: {
		generate_virtual_section: {
			permission: 'section',
			minLevel: 2,
			handler: toolHierarchyGenerateVirtualSection,
		},
	},
};
