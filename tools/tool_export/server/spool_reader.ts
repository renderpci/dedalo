/**
 * SPOOL READER — reads what the export job wrote (artifact_store.ts layout),
 * streaming and in BOUNDED memory: one partial line of carry-over, never the
 * whole spool, whatever the export's size.
 *
 * WHILE A JOB RUNS the spool is growing. The writer flushes only at RECORD
 * boundaries and flushes grid.idx after the bytes it points into; a trailing
 * line without its '\n' is never yielded. That is not enough on its own: one
 * flush is one write of up to 256 KiB, and the file grows page by page DURING
 * it, so a read racing it can end after record K's first row but before its
 * sub-rows. A PAGE is therefore read only up to a COMMITTED bound (`gridBytes`:
 * the manifest's grid_bytes, recorded after a flush completed) — bytes past it
 * are never looked at.
 *
 * COLUMN ORDER. The authoritative order is the 'end' line's `columns` (the
 * tabulator's display order). Before 'end' exists the order KNOWN SO FAR is
 * rebuilt from cols.ndjson with the client's live-insert rule (flat_table.js
 * insert_col: the `after` hint; null = first; an unknown predecessor = last),
 * so a preview taken mid-run shows the same order the old live table showed.
 * `columnOrder()` says which of the two it returned (`final`).
 *
 * PAGES are in RECORDS, not rows: a page is never cut through a record, and a
 * page seek reads grid.idx (fixed-width, random access) and skips fewer than R
 * records. A page also has a ROW budget (PREVIEW_ROW_BUDGET): a breakdown can
 * give one record thousands of sub-rows, so 200 records are not a bound on
 * rows. Every record of the page always gets its first row; the rest of the
 * budget goes to sub-rows in record order, and the sub-rows that do not fit are
 * ELIDED from the preview — counted per record in `elided` (the downloads,
 * built from the whole spool, carry every row).
 */

import { join } from 'node:path';
import { config } from '../../../src/config/config.ts';
import { DedaloError } from '../../../src/core/errors/index.ts';
import { INDEX_LINE_BYTES, SPOOL_FILES } from './artifact_store.ts';

/** The preview's hard ceiling IN RECORDS (row_window.js ROW_WINDOW_MAX_ROWS). */
export const PREVIEW_PAGE_SIZE_MAX = 200;

/**
 * The preview's hard ceiling IN ROWS per page (plain <tr>, far lighter than a
 * section_record row): whole records up to it, and every record's first row
 * even past it (so at most max(this, PREVIEW_PAGE_SIZE_MAX) rows). A breakdown
 * sub-row beyond it is elided, never served.
 */
export const PREVIEW_ROW_BUDGET = 1000;

/**
 * The preview's hard ceiling IN COLUMNS per page — the third axis. Records and
 * rows bound the height; a wide export (breakdown 'columns' makes one column
 * per item index: 20 relations x 200 items = 4,000 columns — the spreadsheet
 * writers allow 16,384) would still draw rows x columns cells on every page
 * and re-send every col descriptor on each refresh. So a page carries one
 * WINDOW of the display order (`col_page`), and a page's cells are bounded by
 * PREVIEW_ROW_BUDGET x PREVIEW_COLUMN_BUDGET. The downloads carry every column.
 */
export const PREVIEW_COLUMN_BUDGET = 100;

/**
 * The fourth axis — BYTES. Records, rows and columns bound how many cells a
 * page serves, not how large they are: an oral-history transcription column
 * holds 50-200 KB per cell, so a page of 200 records was tens of MB of JSON on
 * every flip. A preview CELL is therefore cut to this many characters
 * (preview.ts previewCell, marked with a trailing '…'), and a page stops
 * serving breakdown SUB-rows once its served cells pass
 * PREVIEW_PAGE_CHAR_BUDGET (every record still gets its first row; the rest
 * are elided like the row budget's). The downloads carry every full value.
 */
export const PREVIEW_CELL_MAX_CHARS = 1000;

/** Characters of served cells after which a page serves no more sub-rows (see PREVIEW_CELL_MAX_CHARS). */
export const PREVIEW_PAGE_CHAR_BUDGET = 4 * 1024 * 1024;

export interface SpoolColLine {
	t: 'col';
	i: number;
	key?: string;
	group?: unknown;
	path?: { component_tipo?: string; [key: string]: unknown }[];
	label?: string;
	ar_labels?: unknown;
	cell_type?: string;
	model?: string;
	after?: number | null;
	[key: string]: unknown;
}

export interface SpoolRowLine {
	t: 'row';
	rec: number | string;
	sub: number;
	c: Record<string, unknown>;
}

export interface SpoolEndLine {
	t: 'end';
	columns: number[];
	rows: number;
	records: number;
}

export type SpoolLine =
	| SpoolColLine
	| SpoolRowLine
	| SpoolEndLine
	| { t: 'meta'; [key: string]: unknown }
	| { t: string; [key: string]: unknown };

export interface SpoolPage {
	/** 0-based page index, in records. */
	page: number;
	page_size: number;
	/** 0-based index of the page's first record. */
	first_record: number;
	/** Records on this page (each with its first row; see `elided`). */
	records: number;
	rows: SpoolRowLine[];
	/**
	 * The records whose trailing sub-rows did not fit the page's row budget:
	 * `rows` = how many were NOT served (they are always the record's LAST ones);
	 * `after` = the index in `rows` of the record's last SERVED row, where the
	 * marker belongs. The marker is placed by POSITION, never by `rec`: `rec` is
	 * the bare section_id, so two sections of one export repeat it on a page.
	 * Empty when the page is whole.
	 */
	elided: { rec: number | string; rows: number; after: number }[];
	/** A record exists after this page (in what is flushed so far). */
	has_more: boolean;
}

export interface SpoolReader {
	readonly dir: string;
	/** Every complete line, UNPARSED (no trailing '\n'), from `fromOffset` — the bytes as written. */
	rawLines(options?: { fromOffset?: number; signal?: AbortSignal }): AsyncGenerator<string>;
	/** Every complete line from `fromOffset` (a byte offset at a line start), up to `toOffset` when given. */
	lines(options?: {
		fromOffset?: number;
		toOffset?: number;
		signal?: AbortSignal;
	}): AsyncGenerator<SpoolLine>;
	/** Every row line, in spool order. */
	rows(options?: { signal?: AbortSignal }): AsyncGenerator<SpoolRowLine>;
	/** Column descriptors by ordinal (cols.ndjson). */
	readCols(): Promise<Map<number, SpoolColLine>>;
	/** The 'end' line, or null while the export has not ended. */
	readEnd(): Promise<SpoolEndLine | null>;
	/** The 'end' line, or `export.artifact_not_ready`. */
	requireEnd(): Promise<SpoolEndLine>;
	/**
	 * end.columns once ended (final); else the live-insert order known so far.
	 * `liveOnly` skips the 'end' probe (a caller that KNOWS the export still
	 * runs: the grid's last line is then a row, possibly megabytes, and reading
	 * it back could only answer "not ended").
	 */
	columnOrder(options?: { liveOnly?: boolean }): Promise<{ order: number[]; final: boolean }>;
	/**
	 * A LOWER bound on the whole records readable so far: n visible grid.idx
	 * entries prove record (n-1)·R is whole (an entry is flushed only with the
	 * record it points at), so (n-1)·R + 1 — never a whole R-block per entry.
	 */
	indexedRecords(): Promise<number>;
	/**
	 * One page of records (never cut through a record). `pageSize` defaults to
	 * config, clamped to 1..200; `rowBudget` (default PREVIEW_ROW_BUDGET) bounds
	 * the rows served — see the module doc.
	 */
	readPage(options: {
		page: number;
		pageSize?: number;
		rowBudget?: number;
		/**
		 * Applied to every row BEFORE it is kept (preview.ts: the column window's
		 * cells only, each cut to PREVIEW_CELL_MAX_CHARS) — so a page never holds
		 * an out-of-window or oversized cell. Default: the row as parsed.
		 */
		transform?: (row: SpoolRowLine) => SpoolRowLine;
		/** Served characters after which no more sub-rows are served (default PREVIEW_PAGE_CHAR_BUDGET). */
		charBudget?: number;
		signal?: AbortSignal;
	}): Promise<SpoolPage>;
}

/**
 * Apply flat_table.js insert_col's live-insert rule to a col sequence: a col
 * with `after` null/absent goes FIRST, one whose predecessor is placed goes
 * right after it, one whose predecessor is unknown goes LAST; a repeated `i`
 * is ignored. LINEAR — a singly linked list keyed by ordinal (O(1) insert
 * after any placed col), walked once: this runs on every preview of a running
 * export, on the shared event loop, and the array indexOf+splice form of the
 * same rule was quadratic in the column count.
 */
export function liveInsertOrder(cols: Iterable<SpoolColLine>): number[] {
	/** placed ordinal → the ordinal after it (undefined: it is the last). */
	const next = new Map<number, number | undefined>();
	let first: number | undefined;
	let last: number | undefined;
	for (const col of cols) {
		if (next.has(col.i)) continue;
		const atHead = col.after === null || col.after === undefined;
		// undefined = insert at the head; an unknown predecessor appends (after the last).
		const predecessor = atHead ? undefined : next.has(col.after as number) ? col.after : last;
		if (predecessor === undefined || predecessor === null) {
			next.set(col.i, first);
			first = col.i;
			if (last === undefined) last = col.i;
		} else {
			next.set(col.i, next.get(predecessor));
			next.set(predecessor, col.i);
			if (last === predecessor) last = col.i;
		}
	}
	const order: number[] = [];
	for (let at = first; at !== undefined; at = next.get(at)) order.push(at);
	return order;
}

/** Clamp a requested page size to 1..PREVIEW_PAGE_SIZE_MAX (default: DEDALO_EXPORT_PREVIEW_PAGE_SIZE). */
export function clampPageSize(requested: unknown): number {
	const fallback = config.ops.exportPreviewPageSize;
	const n = Number(requested);
	const size = Number.isFinite(n) && n >= 1 ? Math.trunc(n) : fallback;
	return Math.min(PREVIEW_PAGE_SIZE_MAX, Math.max(1, size));
}

/**
 * A spool file that VANISHED under a read (a Stop's abort, the owner's delete
 * from another tab, a failed walk, the TTL sweep — all delete the spool while a
 * preview that already passed the owner check is reading it) reads as ABSENT:
 * the empty page the module promises for an export with no spool, never an
 * internal.unexpected. Bun opens lazily, so `exists()` followed by a read is
 * no guarantee; the ENOENT surfaces at the read.
 */
function vanished(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === 'ENOENT';
}

function checkSignal(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw new DedaloError('export.cancelled', { message: 'spool read aborted' });
	}
}

/** Stream complete '\n'-terminated lines of `path` from `fromOffset` (to `toOffset`, exclusive, when given). */
async function* streamLines(
	path: string,
	fromOffset: number,
	signal: AbortSignal | undefined,
	toOffset?: number,
): AsyncGenerator<string> {
	// No exists() probe: it would only open a window between the probe and the
	// read. An absent file and one deleted under the read are the SAME answer —
	// no lines — through the one ENOENT arm below (`vanished`).
	const file = Bun.file(path);
	if (toOffset !== undefined && toOffset <= fromOffset) return;
	const decoder = new TextDecoder();
	let carry = '';
	let reader: AsyncIterator<Uint8Array>;
	try {
		// Bun may open the file here already (ENOENT synchronously) or at the first read.
		const stream = (
			toOffset === undefined ? file.slice(fromOffset) : file.slice(fromOffset, toOffset)
		).stream();
		reader = (stream as unknown as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
	} catch (error) {
		if (vanished(error)) return;
		throw error;
	}
	let exhausted = false;
	try {
		for (;;) {
			let step: IteratorResult<Uint8Array>;
			try {
				step = await reader.next();
			} catch (error) {
				exhausted = true;
				if (vanished(error)) return; // deleted under the read: no spool (see `vanished`)
				throw error;
			}
			if (step.done === true) {
				exhausted = true;
				break;
			}
			checkSignal(signal);
			carry += decoder.decode(step.value, { stream: true });
			let newline = carry.indexOf('\n');
			let start = 0;
			while (newline !== -1) {
				const line = carry.slice(start, newline);
				if (line !== '') yield line;
				start = newline + 1;
				newline = carry.indexOf('\n', start);
			}
			carry = carry.slice(start);
		}
	} finally {
		// a consumer that stopped early (or a cancel) releases the file stream,
		// as `for await` would
		if (!exhausted) await reader.return?.();
	}
	// a trailing fragment without '\n' is a line still being written: never yielded
}

/** Read the last complete line of `path` (backward scan, bounded by that line's size). */
async function readLastLine(path: string): Promise<string | null> {
	try {
		return await readLastLineOf(path);
	} catch (error) {
		if (vanished(error)) return null; // deleted under the read: no spool
		throw error;
	}
}

async function readLastLineOf(path: string): Promise<string | null> {
	const file = Bun.file(path);
	if (!(await file.exists())) return null;
	const size = file.size;
	if (size === 0) return null;
	// The file must END with '\n' for its last line to be complete.
	const tail = new Uint8Array(await file.slice(size - 1, size).arrayBuffer());
	if (tail[0] !== 0x0a) return null;
	let window = 64 * 1024;
	for (;;) {
		const start = Math.max(0, size - 1 - window);
		const bytes = new Uint8Array(await file.slice(start, size - 1).arrayBuffer());
		const lastNewline = bytes.lastIndexOf(0x0a);
		if (lastNewline !== -1) return new TextDecoder().decode(bytes.subarray(lastNewline + 1));
		if (start === 0) return new TextDecoder().decode(bytes);
		window *= 4;
	}
}

/** Open a reader over one job directory (see artifact_store.ts `ArtifactJobRef.dir`). */
export function openSpoolReader(
	dir: string,
	options: {
		indexEvery: number;
		/**
		 * The COMMITTED grid length (manifest.grid_bytes): readPage never reads
		 * past it. Absent = the file as it is (a closed spool, or a caller that
		 * awaited the writer's own flush).
		 */
		gridBytes?: number;
	},
): SpoolReader {
	const gridPath = join(dir, SPOOL_FILES.grid);
	const colsPath = join(dir, SPOOL_FILES.cols);
	const indexPath = join(dir, SPOOL_FILES.index);
	const indexEvery = options.indexEvery;
	const gridBound =
		Number.isSafeInteger(options.gridBytes) && (options.gridBytes as number) >= 0
			? (options.gridBytes as number)
			: undefined;

	const readEnd = async (): Promise<SpoolEndLine | null> => {
		const last = await readLastLine(gridPath);
		if (last === null) return null;
		try {
			const parsed = JSON.parse(last) as SpoolLine;
			return parsed.t === 'end' ? (parsed as SpoolEndLine) : null;
		} catch {
			return null;
		}
	};

	const indexedRecords = async (): Promise<number> => {
		const file = Bun.file(indexPath);
		if (!(await file.exists())) return 0;
		const entries = Math.floor(file.size / INDEX_LINE_BYTES);
		return entries === 0 ? 0 : (entries - 1) * indexEvery + 1;
	};

	/** grid offset of record k*R, or null when that entry is not flushed yet (or the spool vanished). */
	const indexOffset = async (entry: number): Promise<number | null> => {
		const file = Bun.file(indexPath);
		if (!(await file.exists())) return null;
		const start = entry * INDEX_LINE_BYTES;
		if (start + INDEX_LINE_BYTES > file.size) return null;
		let text: string;
		try {
			text = await file.slice(start, start + INDEX_LINE_BYTES - 1).text();
		} catch (error) {
			if (vanished(error)) return null;
			throw error;
		}
		const offset = Number(text);
		return Number.isSafeInteger(offset) ? offset : null;
	};

	const reader: SpoolReader = {
		dir,

		rawLines(opts = {}) {
			return streamLines(gridPath, opts.fromOffset ?? 0, opts.signal);
		},

		async *lines(opts = {}) {
			for await (const text of streamLines(
				gridPath,
				opts.fromOffset ?? 0,
				opts.signal,
				opts.toOffset,
			)) {
				yield JSON.parse(text) as SpoolLine;
			}
		},

		async *rows(opts = {}) {
			for await (const line of reader.lines({ signal: opts.signal })) {
				if (line.t === 'row') yield line as SpoolRowLine;
			}
		},

		async readCols() {
			const cols = new Map<number, SpoolColLine>();
			for await (const text of streamLines(colsPath, 0, undefined)) {
				const col = JSON.parse(text) as SpoolColLine;
				if (!cols.has(col.i)) cols.set(col.i, col);
			}
			return cols;
		},

		readEnd,

		async requireEnd() {
			const end = await readEnd();
			if (end === null) {
				throw new DedaloError('export.artifact_not_ready', {
					coordinates: { dir },
				});
			}
			return end;
		},

		async columnOrder(opts = {}) {
			const end = opts.liveOnly === true ? null : await readEnd();
			if (end !== null) return { order: [...end.columns], final: true };
			const cols: SpoolColLine[] = [];
			for await (const text of streamLines(colsPath, 0, undefined)) {
				cols.push(JSON.parse(text) as SpoolColLine);
			}
			return { order: liveInsertOrder(cols), final: false };
		},

		indexedRecords,

		async readPage({ page, pageSize, rowBudget, transform, charBudget, signal }) {
			const size = clampPageSize(pageSize);
			const budget =
				Number.isSafeInteger(rowBudget) && (rowBudget as number) > 0
					? (rowBudget as number)
					: PREVIEW_ROW_BUDGET;
			const chars =
				Number.isSafeInteger(charBudget) && (charBudget as number) > 0
					? (charBudget as number)
					: PREVIEW_PAGE_CHAR_BUDGET;
			const pageIndex = Number.isSafeInteger(page) && page > 0 ? page : 0;
			const firstRecord = pageIndex * size;
			const result: SpoolPage = {
				page: pageIndex,
				page_size: size,
				first_record: firstRecord,
				records: 0,
				rows: [],
				elided: [],
				has_more: false,
			};
			const entry = Math.floor(firstRecord / indexEvery);
			const offset = await indexOffset(entry);
			// an entry past the committed bound points at bytes a page may not read
			if (offset === null || (gridBound !== undefined && offset >= gridBound)) return result;
			/**
			 * Walk the page's rows from `offset`: `visit(row, pageRecord)` for every
			 * row of a record ON the page (pageRecord = its 0-based position on the
			 * page). Answers whether a record exists after the page.
			 */
			const walk = async (
				visit: (row: SpoolRowLine, pageRecord: number) => void,
			): Promise<boolean> => {
				// record index of the record starting at `offset`
				let recordIndex = entry * indexEvery - 1;
				for await (const line of reader.lines({
					fromOffset: offset,
					toOffset: gridBound,
					signal,
				})) {
					if (line.t !== 'row') continue;
					const row = line as SpoolRowLine;
					if (Number(row.sub ?? 0) === 0) {
						recordIndex++;
						if (recordIndex >= firstRecord + size) return true;
					}
					if (recordIndex >= firstRecord) visit(row, recordIndex - firstRecord);
				}
				return false;
			};
			// Pass 1 — rows per record of the page (O(page records) memory).
			const counts: number[] = [];
			result.has_more = await walk((_row, pageRecord) => {
				counts[pageRecord] = (counts[pageRecord] ?? 0) + 1;
			});
			result.records = counts.length;
			// Every record keeps its first row; the rest of the budget goes to
			// sub-rows in record order.
			let spare = Math.max(0, budget - counts.length);
			const allowed = counts.map((count) => {
				const extra = Math.min(count - 1, spare);
				spare -= extra;
				return 1 + extra;
			});
			// Pass 2 — serve the allowed rows. Both passes read the same committed
			// bytes, but `elided` is counted from THIS pass's own rows all the same,
			// so no disagreement between the passes can ever serve {rows: 0}.
			// A record's FIRST row is always served; a sub-row also needs the
			// page's character budget, and once one sub-row misses it no further
			// sub-row is served — so what is elided is always a record's LAST rows.
			const served: number[] = [];
			const kept: number[] = [];
			const recOf: (number | string)[] = [];
			const lastServed: number[] = [];
			let servedChars = 0;
			let charBudgetSpent = false;
			await walk((parsed, pageRecord) => {
				if (pageRecord >= allowed.length) return;
				const already = served[pageRecord] ?? 0;
				served[pageRecord] = already + 1;
				if (already === 0) recOf[pageRecord] = parsed.rec;
				if (already >= (allowed[pageRecord] as number)) return;
				const row = transform === undefined ? parsed : transform(parsed);
				const rowChars = JSON.stringify(row.c ?? {}).length;
				if (already > 0) {
					if (charBudgetSpent || servedChars + rowChars > chars) {
						charBudgetSpent = true;
						return;
					}
				}
				servedChars += rowChars;
				kept[pageRecord] = (kept[pageRecord] ?? 0) + 1;
				lastServed[pageRecord] = result.rows.length;
				result.rows.push(row);
			});
			for (let pageRecord = 0; pageRecord < served.length; pageRecord++) {
				const over = (served[pageRecord] ?? 0) - (kept[pageRecord] ?? 0);
				if (over > 0)
					result.elided.push({
						rec: recOf[pageRecord] as number | string,
						rows: over,
						after: lastServed[pageRecord] as number,
					});
			}
			return result;
		},
	};
	return reader;
}
