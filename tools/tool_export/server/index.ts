/**
 * tool_export server module — flat-table (export_tabulator) data export.
 *
 * get_export_grid: READ export. Requires level >= 1 on the exported section (the
 * handler additionally asserts read on every SQO target inside the grid build).
 *
 * components_with_parent: ontology-only lookup (which relation components point
 * at a section carrying a component_relation_parent) for the per-column
 * parents-checkbox gate (WC-049). Same read gate as the export itself:
 * level >= 1 on the exported section.
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import { toolExportComponentsWithParent, toolExportGetExportGrid } from './tool_export.ts';

export const tool: ToolServerModule = {
	name: 'tool_export',
	apiActions: {
		get_export_grid: { permission: 'section', minLevel: 1, handler: toolExportGetExportGrid },
		components_with_parent: {
			permission: 'section',
			minLevel: 1,
			handler: toolExportComponentsWithParent,
		},
	},
};
