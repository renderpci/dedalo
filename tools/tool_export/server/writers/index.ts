/**
 * WRITER REGISTRY — format → writer, TOTAL over EXPORT_FORMATS (the
 * `Record<ExportFormat, …>` type refuses a missing format at compile time; the
 * gate refuses it at run time), plus `buildArtifactFile`, the ONE way a built
 * file comes into existence: ended spool → writer → temp file → rename →
 * manifest entry. A writer that throws (cancel, quota, format limit) leaves no
 * file and no temp behind. (NDJSON is the one exception to "writer → temp":
 * the ended spool is hard-linked into place — see buildArtifactFile.)
 */

import { createHash } from 'node:crypto';
import { DedaloError } from '../../../../src/core/errors/index.ts';
import {
	type AllocatedArtifactFile,
	type ArtifactJobRef,
	type ArtifactStore,
	type ExportArtifactFile,
	type ExportFormat,
	SPOOL_FILES,
} from '../artifact_store.ts';
import { openSpoolReader } from '../spool_reader.ts';
import { csvWriter, tsvWriter } from './delimited.ts';
import { htmlWriter } from './html.ts';
import { mediaZipVariant, mediaZipWriter } from './media_zip.ts';
import { ndjsonWriter } from './ndjson.ts';
import { odsWriter } from './ods.ts';
import type { ExportWriter, ExportWriterOptions } from './types.ts';
import { throwIfCancelled } from './types.ts';
import { xlsxWriter } from './xlsx.ts';

export const EXPORT_WRITERS: Readonly<Record<ExportFormat, ExportWriter>> = {
	csv: csvWriter,
	tsv: tsvWriter,
	html: htmlWriter,
	xlsx: xlsxWriter,
	ods: odsWriter,
	ndjson: ndjsonWriter,
	media_zip: mediaZipWriter,
};

/** The writer of a format (throws request.invalid_options for an unknown one). */
export function getExportWriter(format: string): ExportWriter {
	if (!Object.hasOwn(EXPORT_WRITERS, format)) {
		throw new DedaloError('request.invalid_options', {
			message: `tool_export: unknown export format '${format.slice(0, 32)}'`,
		});
	}
	return EXPORT_WRITERS[format as ExportFormat];
}

/** The formats whose bytes depend on the header/link options (writers/cells.ts). */
const LABELLED_FORMATS: ReadonlySet<ExportFormat> = new Set(['csv', 'tsv', 'html', 'xlsx', 'ods']);

/** The wire's writer options; every OTHER key is a gate knob (see writerKnobs). */
const WIRE_WRITER_OPTIONS: ReadonlySet<string> = new Set([
	'origin',
	'showTipoInLabel',
	'mediaQuality',
	'mediaQualities',
]);

/**
 * The format knobs a gate injects (`sheetRowCap`, `zip64Limits`, …) — never
 * from the wire, but they change the bytes, so they are part of the name like
 * any other option. Null when there are none (every production build).
 */
function writerKnobs(options: ExportWriterOptions): Record<string, unknown> | null {
	const keys = Object.keys(options)
		.filter((key) => !WIRE_WRITER_OPTIONS.has(key) && options[key] !== undefined)
		.sort();
	if (keys.length === 0) return null;
	return Object.fromEntries(keys.map((key) => [key, options[key]]));
}

function shortHash(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

/**
 * THE FILE NAME IS A FUNCTION OF EVERYTHING THAT CHANGES THE BYTES. Two builds
 * of one format with different options must never share a file: the later
 * commit would replace the earlier one under the same URL, a client that
 * cached the first URL (render_tool_export.js keys its per-option cache on the
 * options) would download bytes built from the other options — and
 * buildArtifactFile REUSES a file already committed under the name (BUILT
 * ONCE), so a name shared by two option sets would serve one set's bytes for
 * the other.
 *
 *  - csv / tsv / html / xlsx / ods: the header (`showTipoInLabel`) and the
 *    absolute media links (`origin`) — `export_<hash>.<ext>`, ALWAYS (no
 *    option set owns the bare name);
 *  - media_zip: the quality choice (mediaZipVariant); no choice = `media.zip`
 *    (the defaults' archive);
 *  - ndjson: the spool itself, option-independent — `export.ndjson`;
 *  - and, for every format, the gate knobs when present (writerKnobs) — so a
 *    production name never changes and a gate's knobbed build never shares one.
 */
export function artifactFileVariant(
	format: ExportFormat,
	options: ExportWriterOptions,
): string | undefined {
	const knobs = writerKnobs(options);
	if (format === 'media_zip') {
		const chosen =
			options.mediaQuality !== undefined || options.mediaQualities !== undefined
				? mediaZipVariant(options)
				: undefined;
		if (knobs === null) return chosen;
		return `${(chosen ?? '').slice(0, 20)}${shortHash({ chosen: chosen ?? null, knobs })}`;
	}
	if (!LABELLED_FORMATS.has(format)) return knobs === null ? undefined : shortHash({ knobs });
	const canonical: Record<string, unknown> = {
		show_tipo_in_label: options.showTipoInLabel === true,
		origin: typeof options.origin === 'string' ? options.origin : '',
	};
	if (knobs !== null) canonical.knobs = knobs;
	return shortHash(canonical);
}

export interface BuildArtifactFileArgs {
	store: ArtifactStore;
	job: ArtifactJobRef;
	format: ExportFormat;
	options: ExportWriterOptions;
	signal: AbortSignal;
	/** Test seam: replace the registered writer. */
	writer?: ExportWriter;
}

/**
 * Build one downloadable file from an ENDED export. Refuses
 * (`export.artifact_not_ready`) unless the manifest says 'ended' AND the spool
 * carries its 'end' line. Records the file in the manifest and returns it — or
 * returns the file ALREADY committed under the same name (see BUILT ONCE).
 */
export async function buildArtifactFile(args: BuildArtifactFileArgs): Promise<ExportArtifactFile> {
	const { store, job, format, options, signal } = args;
	const writer = args.writer ?? getExportWriter(format);
	const manifest = await store.readManifest(job);
	if (manifest.status !== 'ended') {
		throw new DedaloError('export.artifact_not_ready', {
			coordinates: { job_id: job.jobId, status: manifest.status },
		});
	}
	throwIfCancelled(signal);

	const file: AllocatedArtifactFile = store.allocateFile(
		job,
		format,
		artifactFileVariant(format, options),
	);
	// BUILT ONCE — for the formats whose bytes are a function of the spool and
	// the options alone. An ended export's spool never changes, and the file
	// name is a function of every option that changes the bytes
	// (artifactFileVariant): a file already committed under this name IS this
	// build. It is answered as recorded — no second walk of the spool, no lane
	// time, no second copy against the quota — whoever asks again (a reopened
	// tool, another tab).
	//
	// NOT the media ZIP: its bytes also depend on LIVE state read at build time
	// (the owner's grants and record scope, each record's stored files_info,
	// the files on the media disk — derivatives still being generated after an
	// import, a file re-uploaded or regenerated). Reusing it would serve the
	// first build's refusals and old image bytes until the TTL; it is rebuilt
	// on every request and replaces the committed file (rename under the lease).
	const committed = manifest.files?.[file.basename];
	if (
		format !== 'media_zip' &&
		committed !== undefined &&
		(await store.resolveArtifactFile(job.userId, job.jobId, file.basename)) !== null
	) {
		return committed;
	}

	// NDJSON IS THE SPOOL, byte for byte (writers/ndjson.ts): the ended grid is
	// hard-linked into place — never a second copy of a possibly huge file
	// against the owner's quota and the volume. Only where the filesystem cannot
	// hard-link does the registered writer copy it (the same bytes).
	if (format === 'ndjson' && args.writer === undefined) {
		// the 'end' line's own row count (the spool's, whatever the manifest says)
		const end = await openSpoolReader(job.dir, { indexEvery: manifest.index_every }).requireEnd();
		throwIfCancelled(signal);
		const linked = await store.linkSpoolAsFile(job, file, {
			source: SPOOL_FILES.grid,
			rows: end.rows,
		});
		if (linked !== null) return linked;
	}

	// The build's LEASE first (openFileSink takes it under the manifest lock):
	// from here on the TTL sweep keeps this export; before it, a sweep that
	// already removed the export answers export.artifact_not_found — typed.
	const opened = await store.openFileSink(job, file);
	let entry: ExportArtifactFile;
	try {
		const spool = openSpoolReader(job.dir, { indexEvery: manifest.index_every });
		await spool.requireEnd();
		throwIfCancelled(signal);
		const result = await writer({ spool, manifest, options }, opened.sink, signal);
		throwIfCancelled(signal);
		// Rename + record + lease release: one step (the sweep never sees the file
		// built but unrecorded, nor the directory without the build's lease).
		entry = await opened.commit({ rows: result.rows });
	} catch (error) {
		// Cleanup is best-effort: the WRITER's error is the build's outcome (a
		// Stop stays export.cancelled, a quota refusal keeps its code/details).
		// A lease left behind by a failed release is harmless — liveBuildTemps
		// skips a lease whose temp file is gone.
		await opened.abort().catch((abortError: unknown) => {
			console.warn(`[tool_export] file build cleanup of ${file.basename} failed`, abortError);
		});
		throw error;
	}
	return entry;
}
