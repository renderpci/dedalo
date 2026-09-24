/**
 * The EXPORT facade — what a peer of diffusion (tool_export's server, today)
 * may import from the unified export engine (src/diffusion/export/). Callers
 * outside src/diffusion reach the engine through this file only
 * (boundary_seam_tripwire: tools/ and non-diffusion src/ alike), so the
 * engine's module layout stays the engine's to change.
 */

export type {
	ExportDeclarationGateOptions,
	ExportGridContext,
	ExportGridRunOptions,
	OpenedExportGrid,
} from '../export/index.ts';
export {
	assertExportDeclarationReadable,
	exportGridUnified,
	openExportGrid,
} from '../export/index.ts';
