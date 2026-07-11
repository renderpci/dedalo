/**
 * tool_export server module — flat-table (export_tabulator) data export.
 *
 * get_export_grid: READ export. Requires level >= 1 on the exported section (the
 * handler additionally asserts read on every SQO target inside the grid build).
 */

import type { ToolServerModule } from '../../../src/core/tools/module.ts';
import { toolExportGetExportGrid } from './tool_export.ts';

export const tool: ToolServerModule = {
	name: 'tool_export',
	apiActions: {
		get_export_grid: { permission: 'section', minLevel: 1, handler: toolExportGetExportGrid },
	},
};
