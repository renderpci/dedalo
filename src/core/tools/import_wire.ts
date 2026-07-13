/**
 * THE IMPORT WIRE — the typed contract between the CSV import engine and the
 * tool's client panel. Both sides are written against these types; nothing else
 * is part of the contract.
 *
 * It deliberately does NOT reproduce the PHP shape. PHP's report grew organically
 * (`created_rows` as an int[] of section_ids, `failed_rows` as objects, a `msg`
 * string the client re-parsed for counts, and a progress line assembled from four
 * optional fields, one of them misspelled `compomnent_label`). Here:
 *
 *   - ids and COUNTS are both explicit — the panel lists the ids and shows totals
 *     without parsing prose out of `msg`;
 *   - a row issue has ONE shape (ImportRowIssue), whether it failed or warned;
 *   - progress carries `rows_total`, so the panel can show a real progress BAR
 *     rather than a scrolling text line (PHP never knew the total).
 *
 * The progress frame is published through ToolActionContext.publishProgress and
 * arrives at the client as the `data` of a job frame (core/api/job_stream.ts).
 * The final report arrives as the `data` of the TERMINAL frame — it is the
 * import action's return value.
 */

/** One row/column the import rejected (failed) or accepted with a caveat (warning). */
export interface ImportRowIssue {
	/** The record the issue belongs to (0 when the row had no usable section_id). */
	section_id: number;
	/** The component the cell targeted ('' when the issue is row-level). */
	component_tipo: string;
	/** Human-readable cause — shown verbatim in the panel. */
	msg: string;
	/** The offending value (the raw cell, or the conformed value that was refused). */
	data: unknown;
	/** 1-based CSV row number (header is row 1), for "go look at line N". */
	row?: number;
}

/** The outcome of importing ONE file. */
export interface ImportFileReport {
	/** True when the file was processed (even with failed rows); false when it was refused whole. */
	ok: boolean;
	file: string;
	section_tipo: string;
	/** The dd800 bulk-process record this run wrote under — the revert handle. */
	bulk_process_id: number | null;
	/** section_ids INSERTED by this run. */
	created: number[];
	/** section_ids that already existed and were written to. */
	updated: number[];
	/** Cells the import refused. The record keeps its previous value. */
	failed: ImportRowIssue[];
	/** Cells the import wrote, but that need a human look. */
	warnings: ImportRowIssue[];
	/** File-level errors (unreadable CSV, no mapped column, missing section_id column). */
	errors: string[];
	/** Rows the file offered (excludes the header). */
	rows_total: number;
	/** Wall-clock for this file. */
	ms: number;
}

/** The whole batch — the import action's return value, i.e. the terminal frame's `data`. */
export interface ImportBatchReport {
	/** The per-file reports, in submission order. */
	result: ImportFileReport[];
	msg: string;
	errors: string[];
}

/** What the engine is doing right now (a progress frame's `phase`). */
export type ImportPhase = 'reading' | 'importing' | 'done';

/**
 * One progress tick. Published on a throttle (never once per row — the panel
 * cannot render faster than a frame, and each publish costs a pfile write), and
 * ALWAYS once per phase transition so the panel never lags a stage behind.
 */
export interface ImportProgressFrame {
	phase: ImportPhase;
	/** The file being read/imported. */
	file: string;
	/** 1-based position of `file` in the batch, and the batch size. */
	file_index: number;
	files_total: number;
	/** Rows completed / offered, for the progress bar. Both 0 while `reading`. */
	row: number;
	rows_total: number;
	/** The record and component the engine touched at this tick (panel detail line). */
	section_id: number | null;
	component_label: string | null;
	/** Running totals — the panel shows them live, not only at the end. */
	created: number;
	updated: number;
	failed: number;
	warnings: number;
}
