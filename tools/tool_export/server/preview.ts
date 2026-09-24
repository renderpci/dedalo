/**
 * tool_export.get_export_preview — ONE PAGE of an export, read from its spool.
 *
 * The browser never holds the export: it asks for a page. A page is counted in
 * RECORDS, never rows, so a record's breakdown sub-rows always travel together
 * (spool_reader.ts readPage seeks through grid.idx and skips fewer than R
 * records). The page size is clamped HERE, on the server, to
 * [1, PREVIEW_PAGE_SIZE_MAX = 200] (the client's row_window ROW_WINDOW_MAX_ROWS),
 * the default coming from config (DEDALO_EXPORT_PREVIEW_PAGE_SIZE) — a client
 * asking for a million records gets 200. Records are not a bound on ROWS (one
 * record can break down into thousands of sub-rows), so a page also carries at
 * most PREVIEW_ROW_BUDGET rows: every record's first row, then sub-rows in
 * record order; the rest are elided and counted per record (`elided`).
 *
 * A page is also bounded in COLUMNS (spool_reader.ts PREVIEW_COLUMN_BUDGET):
 * `cols` is one window of the display order (`col_page`, clamped to the last
 * window), and every served row carries only that window's cells — so a
 * page's cells are bounded whatever the export's width. `col_models` names the
 * leaf models of EVERY column (what the client offers the media download
 * from), never their descriptors. The window is applied WHILE the page is read
 * (readPage `transform`), so an out-of-window cell is never kept.
 *
 * And a page is bounded in BYTES (spool_reader.ts PREVIEW_CELL_MAX_CHARS /
 * PREVIEW_PAGE_CHAR_BUDGET): each served cell is cut (previewCell) and sub-rows
 * past the page's character budget are elided. The downloads carry every full
 * value.
 *
 * WHILE THE JOB RUNS the page is served from what is flushed so far (whole
 * records only) and the columns come in the order known so far (the client's
 * live-insert rule); once it ends, in the authoritative 'end' order — taken
 * from the MANIFEST (`columns`, recorded with the end), so a preview never
 * scans the grid's tail: while the export runs that tail is a row that can be
 * megabytes, and the answer could only ever be "not ended". The response says
 * which (`final_order`) and how far the job got (`written_records` of
 * `total_records`).
 *
 * Owner-only through the same door as every other read of an export
 * (export_job.ts resolveOwnedJob): not the caller's, not this section, or a
 * build gate that no longer passes (exportStillReadable) — all
 * `export.artifact_not_found`.
 */

import { isMediaModel } from '../../../src/core/concepts/media.ts';
import { ok } from '../../../src/core/errors/index.ts';
import type { Principal } from '../../../src/core/security/permissions.ts';
import {
	type ToolActionContext,
	type ToolResponse,
	toolRequestId,
} from '../../../src/core/tools/module.ts';
import type { ExportExternalDegradation } from '../../../src/diffusion/api/export.ts';
import { type ArtifactStore, type ExportJobStatus, openArtifactStore } from './artifact_store.ts';
import { effectiveStatus, resolveOwnedJob } from './export_job.ts';
import {
	clampPageSize,
	openSpoolReader,
	PREVIEW_CELL_MAX_CHARS,
	PREVIEW_COLUMN_BUDGET,
	type SpoolColLine,
	type SpoolRowLine,
} from './spool_reader.ts';
import { legacyColumnMayHoldMedia } from './writers/media_zip.ts';

/** The preview wire (data of get_export_preview). */
export interface ExportPreview {
	job_id: string;
	status: ExportJobStatus;
	/** Column descriptors ('col' lines) of THIS column window, in display order. */
	cols: SpoolColLine[];
	/** 0-based column window (clamped to the last one). */
	col_page: number;
	/** Columns per window (PREVIEW_COLUMN_BUDGET). */
	col_page_size: number;
	/** 0-based display index of the window's first column. */
	first_col: number;
	/** Columns of the whole export (so far, while it runs). */
	total_cols: number;
	/** The distinct leaf models of EVERY column (not only the window's). */
	col_models: string[];
	/**
	 * THE MEDIA MODELS THE MEDIA ZIP CAN ARCHIVE (2026-09-24) — what the
	 * client's media download reads (offered at all, and which quality
	 * selectors its modal lists): every column's own media model (`col_models`
	 * filtered) PLUS, for an export built with media capture, the models the
	 * walk READ at any path depth (manifest `media_models` — a portal's image
	 * child, a portal→image path, a dedalo_raw portal's targets). Sorted.
	 * `col_models` keeps its meaning (leaf column models) and is no longer the
	 * media signal: a portal column's model is component_portal.
	 */
	media_models: string[];
	/**
	 * TRUE ONLY for an ended export built WITHOUT media capture (manifest
	 * `media_models` absent — made before 2026-09-24) that has a column which
	 * may hold related media (writers/media_zip.ts legacyColumnMayHoldMedia):
	 * the client offers the media ZIP anyway, and its info.txt lists those
	 * columns as `rerun_required` — else a portal-only legacy export would show
	 * a disabled button and never the reason. False otherwise.
	 */
	media_rerun_required: boolean;
	/** True once the order is the export's final ('end') order. */
	final_order: boolean;
	/** The page's rows, each carrying only the window's cells. */
	rows: SpoolRowLine[];
	/**
	 * Records whose trailing breakdown sub-rows exceed the page's row budget
	 * (spool_reader.ts PREVIEW_ROW_BUDGET): `rows` = how many were not served,
	 * `after` = the index in `rows` of the record's last served row (the marker
	 * is placed by position — `rec` repeats across sections). The downloads
	 * carry every row.
	 */
	elided: { rec: number | string; rows: number; after: number }[];
	/** 0-based page, in records. */
	page: number;
	page_size: number;
	/** 0-based index of the page's first record. */
	first_record: number;
	/** Records on this page. */
	records: number;
	has_more: boolean;
	total_records: number | null;
	written_records: number;
	/**
	 * The export's external-source summary so far (the manifest's, LIVE at each
	 * checkpoint while it runs — export_job.ts ExportArtifactSummary
	 * .external_degraded); null when nothing degraded.
	 */
	external_degraded: ExportExternalDegradation | null;
}

/** A 0-based page index from the wire (anything else is page 0). */
function parsePage(value: unknown): number {
	const n = Number(value);
	return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export interface ExportPreviewRequest {
	store: ArtifactStore;
	principal: Principal;
	userId: number;
	sectionTipo: string;
	jobId: unknown;
	page: unknown;
	pageSize: unknown;
	/** The column window (0-based; anything else is window 0). */
	colPage?: unknown;
}

/** One column window of the display order: its cols, the clamped page, its first display index. */
export function columnWindowOf(
	ordered: readonly SpoolColLine[],
	requestedPage: unknown,
	size: number = PREVIEW_COLUMN_BUDGET,
): { cols: SpoolColLine[]; colPage: number; firstCol: number } {
	const lastPage = Math.max(0, Math.ceil(ordered.length / size) - 1);
	const colPage = Math.min(parsePage(requestedPage), lastPage);
	const firstCol = colPage * size;
	return { cols: ordered.slice(firstCol, firstCol + size), colPage, firstCol };
}

/**
 * A row cut to a window: only the window's cells, each through previewCell.
 * Walks the WINDOW (at most PREVIEW_COLUMN_BUDGET lookups), never the row's
 * every cell — a 4,000-column row costs a window's worth, not its width.
 */
export function windowRow(row: SpoolRowLine, cols: readonly SpoolColLine[]): SpoolRowLine {
	const source = row.c ?? {};
	const c: Record<string, unknown> = {};
	for (const col of cols) {
		const ordinal = String(col.i);
		if (Object.hasOwn(source, ordinal)) c[ordinal] = previewCell(col, source[ordinal]);
	}
	return { ...row, c };
}

/**
 * One preview cell, at most PREVIEW_CELL_MAX_CHARS characters (+ '…'). The
 * client renders a cell as `String(value)` (flat_table.js), so an oversized
 * NON-string (a raw object/array) is served as that very string, cut — the
 * rendering is the same text, only bounded. A media cell ('img'/'av': URLs
 * joined by ' | ') is cut at a URL boundary, never inside a URL (a cut URL is
 * a broken thumbnail, not a shorter one). The downloads keep the full value.
 */
export function previewCell(col: SpoolColLine | undefined, value: unknown): unknown {
	if (value === null || value === undefined) return value;
	const max = PREVIEW_CELL_MAX_CHARS;
	if (typeof value !== 'string') {
		if (typeof value !== 'object') return value;
		const serialized = JSON.stringify(value);
		if (serialized === undefined || serialized.length <= max) return value;
		return previewCell(col, String(value));
	}
	if (value.length <= max) return value;
	if (col?.cell_type === 'img' || col?.cell_type === 'av') {
		const urls = value.split(' | ');
		let kept = '';
		for (const url of urls) {
			const next = kept === '' ? url : `${kept} | ${url}`;
			if (next.length > max) break;
			kept = next;
		}
		return kept;
	}
	return `${value.slice(0, max)}…`;
}

/** One column window of the display order, and the rows cut to it (see columnWindowOf / windowRow). */
export function columnWindow(
	ordered: readonly SpoolColLine[],
	rows: readonly SpoolRowLine[],
	requestedPage: unknown,
	size: number = PREVIEW_COLUMN_BUDGET,
): { cols: SpoolColLine[]; rows: SpoolRowLine[]; colPage: number; firstCol: number } {
	const window = columnWindowOf(ordered, requestedPage, size);
	return { ...window, rows: rows.map((row) => windowRow(row, window.cols)) };
}

/**
 * The preview's `media_models`: the column models that are media models, plus
 * the models the capturing walk recorded (manifest `media_models`, absent on
 * an export built without capture), deduplicated and sorted.
 */
export function previewMediaModels(
	colModels: Iterable<string>,
	captured: readonly unknown[] | undefined,
): string[] {
	const media = new Set<string>();
	for (const model of colModels) if (isMediaModel(model)) media.add(model);
	for (const model of captured ?? []) {
		if (typeof model === 'string' && isMediaModel(model)) media.add(model);
	}
	return [...media].sort();
}

/**
 * Does an UNCAPTURED spool hold a column the media ZIP would list as
 * `rerun_required`? The same columns the writer checks: every one whose own
 * model is not a media model (those are read from their cells).
 */
async function uncapturedColumnsMayHoldMedia(cols: readonly SpoolColLine[]): Promise<boolean> {
	for (const col of cols) {
		if (typeof col.model === 'string' && isMediaModel(col.model)) continue;
		if (await legacyColumnMayHoldMedia(col)) return true;
	}
	return false;
}

/** Read one page of an export the caller owns. */
export async function readExportPreview(request: ExportPreviewRequest): Promise<ExportPreview> {
	const { job, manifest } = await resolveOwnedJob(
		request.store,
		request.principal,
		request.userId,
		request.sectionTipo,
		request.jobId,
	);
	const status = effectiveStatus(manifest, request.store);
	// Bounded by the COMMITTED grid (manifest.grid_bytes): never a flush in flight.
	const reader = openSpoolReader(job.dir, {
		indexEvery: manifest.index_every,
		gridBytes: manifest.grid_bytes ?? 0,
	});
	const pageSize = clampPageSize(request.pageSize);
	// The display order FIRST (the window decides which cells a page keeps):
	// ended → the manifest's recorded end order; otherwise the live order known
	// so far — never a scan of the grid's tail (see the module doc).
	const recorded = manifest.status === 'ended' && Array.isArray(manifest.columns);
	const { order, final } = recorded
		? { order: [...(manifest.columns as number[])], final: true }
		: await reader.columnOrder({ liveOnly: manifest.status === 'running' });
	const byOrdinal = await reader.readCols();
	const ordered: SpoolColLine[] = [];
	for (const ordinal of order) {
		const col = byOrdinal.get(ordinal);
		if (col !== undefined) ordered.push(col);
	}
	const windowed = columnWindowOf(ordered, request.colPage);
	// A cancelled / failed / interrupted export has no spool: an empty page.
	const page = await reader.readPage({
		page: parsePage(request.page),
		pageSize,
		transform: (row) => windowRow(row, windowed.cols),
	});
	const models = new Set<string>();
	for (const col of ordered)
		if (typeof col.model === 'string' && col.model !== '') models.add(col.model);
	const mediaModels = previewMediaModels(models, manifest.media_models);
	const mediaRerunRequired =
		manifest.status === 'ended' &&
		!Array.isArray(manifest.media_models) &&
		(await uncapturedColumnsMayHoldMedia(ordered));
	return {
		job_id: job.jobId,
		status,
		cols: windowed.cols,
		col_page: windowed.colPage,
		col_page_size: PREVIEW_COLUMN_BUDGET,
		first_col: windowed.firstCol,
		total_cols: ordered.length,
		col_models: [...models],
		media_models: mediaModels,
		media_rerun_required: mediaRerunRequired,
		final_order: final,
		rows: page.rows,
		elided: page.elided,
		page: page.page,
		page_size: page.page_size,
		first_record: page.first_record,
		records: page.records,
		has_more: page.has_more,
		total_records: manifest.total ?? null,
		written_records: manifest.records,
		external_degraded: manifest.external_degraded ?? null,
	};
}

/** tool_export.get_export_preview {job_id, page, page_size, col_page} — owner-only. */
export async function toolExportGetPreview(context: ToolActionContext): Promise<ToolResponse> {
	const preview = await readExportPreview({
		store: openArtifactStore(),
		principal: context.principal,
		userId: context.userId,
		sectionTipo: String(context.options.section_tipo ?? ''),
		jobId: context.options.job_id,
		page: context.options.page,
		pageSize: context.options.page_size,
		colPage: context.options.col_page,
	});
	return ok(preview, { requestId: toolRequestId(context) });
}
