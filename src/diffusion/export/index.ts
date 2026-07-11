/**
 * src/diffusion/export — tool_export unified onto the shared diffusion engine
 * (DIFFUSION_PLAN D8/P6). Modules:
 *
 * - compile_columns.ts — ar_ddo_to_export → PublicationPlan (stage B, the
 *   second plan front-end);
 * - atoms.ts — shared-walk atom events → export atoms (value joins,
 *   grid_value per-target atoms) — export's OWN projection;
 * - grid.ts — the pinned meta/col/row/end NDJSON protocol + the three data
 *   formats + breakdown placement — export's OWN writer.
 *
 * tools/tool_export/server/tool_export.ts is a thin facade over this module —
 * the SINGLE implementation since the ledgered legacy-walker deletion landed
 * (2026-07-08, with the deep-breakdown export_tabulator rebuild).
 */

export { compileExportPlan } from './compile_columns.ts';
export type { ExportDdoInput } from './compile_columns.ts';
export { exportGridUnified } from './grid.ts';
export { ndjsonStream } from './ndjson_stream.ts';
