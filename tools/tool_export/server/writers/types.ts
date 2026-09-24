/**
 * THE WRITER CONTRACT — every downloadable format is one function of this
 * shape, registered in writers/index.ts:
 *
 *   (input: {spool, manifest, options}, sink, signal) => Promise<{bytes, rows}>
 *
 * - `spool` is the job's SpoolReader (spool_reader.ts). A writer reads it in
 *   ONE streaming pass after 'end' (`spool.requireEnd()` gives the
 *   authoritative `columns` order; a missing ordinal in a row is an empty cell
 *   — the server twin of flat_table.js finalize) and never holds the grid.
 * - `sink` is a bounded-memory byte sink onto a temp file (artifact_store.ts
 *   `openFileSink`); the caller commits (rename) only when the writer resolved.
 *   Quota overflow throws from `sink.write`.
 * - `signal` is the job's abort signal: check it with `throwIfCancelled` at
 *   least once per record, so Stop is prompt.
 * - Header and cell TEXT come from writers/cells.ts (the port of the client's
 *   semantics) — a writer never re-derives a label or a media URL.
 *
 * `rows` is the number of DATA rows written (header excluded).
 */

import { DedaloError } from '../../../../src/core/errors/index.ts';
import type { ExportFormat, ExportManifest, FileSink } from '../artifact_store.ts';
import type { SpoolReader } from '../spool_reader.ts';

export type { ExportFormat, FileSink } from '../artifact_store.ts';

export interface ExportWriterOptions {
	/** Public origin for absolute media URLs (captured from the user's request). */
	origin: string;
	/** flat_table config.show_tipo_in_label. */
	showTipoInLabel: boolean;
	/** media_zip: ONE quality for every media model present. */
	mediaQuality?: string;
	/** media_zip: the quality PER media model ({component_image: 'original', …}); wins over mediaQuality. */
	mediaQualities?: Record<string, string>;
	/** Format-specific knobs a gate may inject (e.g. a small sheet row cap). */
	[key: string]: unknown;
}

export interface ExportWriterInput {
	spool: SpoolReader;
	manifest: ExportManifest;
	options: ExportWriterOptions;
}

export interface ExportWriterResult {
	bytes: number;
	rows: number;
}

export type ExportWriter = (
	input: ExportWriterInput,
	sink: FileSink,
	signal: AbortSignal,
) => Promise<ExportWriterResult>;

/** Stop promptly when the job is stopped (stop_process / deadline). */
export function throwIfCancelled(signal: AbortSignal | undefined): void {
	if (signal?.aborted) {
		throw new DedaloError('export.cancelled', { message: 'export writer cancelled' });
	}
}

/**
 * Refuse a value past a format's HARD ceiling (one that cannot be split
 * around — XLSX/ODS columns). `details` carries the format and the limit.
 */
export function assertFormatLimit(format: ExportFormat, value: number, limit: number): void {
	if (value > limit) {
		throw new DedaloError('export.format_limit', {
			details: { format, limit },
			coordinates: { value },
		});
	}
}
