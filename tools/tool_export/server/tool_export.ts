/**
 * tool_export.get_export_grid — the flat export table (PHP tool_export +
 * export_tabulator NDJSON protocol: meta/col/row/end lines, three data
 * formats, breakdown explosion, streaming/buffered duality).
 *
 * The build lives ENTIRELY in the unified diffusion export engine
 * (src/diffusion/export/ — DIFFUSION_PLAN D8/P6): shared plan compiler +
 * resolver atom entry point + the export_tabulator placement port. This
 * handler is the tools-registry facade only.
 *
 * History: an in-file legacy walker (behind an env kill-switch) coexisted
 * here through the P6 migration; it was DELETED 2026-07-08 when the
 * deep-breakdown rebuild made the unified engine the single implementation
 * (the legacy math mis-placed multi-hop grid_value atoms — see
 * test/parity/tool_export_breakdown_differential.test.ts, the oracle gate
 * that pinned the rebuild).
 */

import type { ToolActionContext, ToolResponse } from '../../../src/core/tools/module.ts';
import { exportGridUnified } from '../../../src/diffusion/export/index.ts';

/** Build the export grid through the unified engine (see module doc). */
export async function toolExportGetExportGrid(context: ToolActionContext): Promise<ToolResponse> {
	return exportGridUnified(context);
}
