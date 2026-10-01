/**
 * Shared file-target infrastructure for the file-format diffusion writers
 * (DIFFUSION_SPEC §4.3 rdf/xml/markdown/csv/json; this slice serves the
 * tabular trio csv/json/markdown).
 *
 * Layout contract — NOT restated here (PUB-03, 2026-09-03): the root, the
 * per-target directory and the per-record file names come from the ONE
 * producer both sides import, src/core/diffusion_bridge/published_files.ts
 * (the delete side, diffusion_delete.ts resolvePublishedFilePath, reads the
 * same functions). This module re-exports the root resolver and wraps the
 * grammar for the writers; `diffusion_scope_tripwire` proves per writer that
 * the file the producer names is the file the writer's removeRecords unlinks.
 *
 *   <root>/<format>/<dirLabel>/            one directory per format × target
 *   <root>/markdown/<service>/<st>_<id>.md per-record files (delete grammar)
 *
 * Root resolution: DEDALO_DIFFUSION_FILES_ROOT (ops override; tests point it
 * at a MARKED scratch dir so the real media tree is never touched) falling
 * back to `config.media.rootPath`. Missing both = loud typed error at open(),
 * never a silent write to a guessed path.
 *
 * All finalization is temp+rename on the SAME filesystem (atomicWriteFile);
 * ZIP creation ports the old engine's PKZIP-STORE archive
 * (diffusion/api/v1/lib/rdf_file_utils.ts:138-248) — flat archive, basename
 * entries, method STORE, zeroed timestamps (deterministic archives).
 *
 * The ZIP bytes are the engine's ONE encoder, a neutral kernel outside this
 * subsystem (src/core/files/zip.ts `openZipStream` — `createZip` drives its
 * STORE-from-disk door, tool_export its streamed entries), and the temp-sibling
 * name is the kernel's too (src/core/files/temp_path.ts) — both imported,
 * never forked. Memory is BOUNDED whatever the archive's size (PERF-2/DIFF-4):
 * every entry is streamed from disk twice (CRC + size, then bytes) straight
 * into the temp file — nothing is ever held whole.
 *
 * THE RUN'S ARTIFACTS (DIFF-1). A consolidated artifact (a zip, a merged
 * document) covers the whole RUN, which a resumed runner never saw whole in
 * memory: the writers therefore report each per-record file they write or
 * remove as an ArtifactEvent (writers/types.ts), the runner appends those to
 * the job's run ledger in the batch's own transaction, and close() reads the
 * run's manifest back from it (WriterCloseContext). `localCloseContext` is
 * the same contract over one session's own events — a caller that drives a
 * session by hand (the harness script, writer-level tests) and never ran a
 * ledger. Only such a session keeps that history (ArtifactEventLog): a
 * JOB-scoped session's memory is O(batch), never O(run).
 */

import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
	writeSync,
} from 'node:fs';
import { open, rename, stat, truncate, unlink } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import {
	diffusionFilesRoot,
	MissingDiffusionFilesRootError,
	publishedRecordFileName,
	publishedTargetDir,
} from '../../core/diffusion_bridge/published_files.ts';
import { DedaloError } from '../../core/errors/index.ts';
import { isTempSibling, tempPathFor } from '../../core/files/temp_path.ts';
import { openZipStream, type ZipStreamWriter } from '../../core/files/zip.ts';
import type { PublicationPlan, SectionPlan } from '../plan/types.ts';
import {
	type ArtifactEvent,
	type ManifestEntry,
	restoredCounters,
	type TableCounters,
	type WriterCloseContext,
	type WriterContinuity,
	type WriterOpenContext,
	type WriterRunSummary,
} from './types.ts';

// The root resolver and its error are the core producer's; writers and their
// tests keep importing them from here.
export { diffusionFilesRoot, MissingDiffusionFilesRootError };

/**
 * The per-target directory label: serviceName for 'files' targets (PHP
 * /{format}/{service_name}/), database for 'table' targets published to a
 * file format (csv/json exports of a table plan).
 */
export function fileTargetDirLabel(plan: PublicationPlan): string {
	return plan.target.kind === 'files' ? plan.target.serviceName : plan.target.database;
}

/** `<root>/<format>/<dirLabel>` — the run's output directory (the producer's grammar). */
export function formatTargetDir(format: string, dirLabel: string): string {
	return publishedTargetDir(diffusionFilesRoot(), format, dirLabel);
}

/**
 * Per-record file name of the xml / markdown writers — THE producer's grammar
 * (published_files.ts publishedRecordFileName; PHP get_record_file_path
 * `$section_tipo .'_'. $section_id .'.md'`). `extension` is the writer's file
 * extension ('xml' | 'md'); a format with no per-record file is a caller bug.
 */
export function recordFileName(
	sectionTipo: string,
	sectionId: number | string,
	extension: 'xml' | 'md',
): string {
	const name = publishedRecordFileName(
		extension === 'md' ? 'markdown' : 'xml',
		sectionTipo,
		sectionId,
	);
	if (name === null) {
		throw new DedaloError('internal.invariant', {
			message: `recordFileName: no per-record file grammar for extension '${extension}'`,
		});
	}
	return name;
}

/**
 * Ordered emitted column names of a section plan — excludeColumn fields
 * participate in resolution only and never reach a file (same filter the
 * mariadb writer applies via tableColumnFields).
 */
export function planColumnNames(section: SectionPlan): string[] {
	return section.fields
		.filter((field) => field.excludeColumn !== true)
		.map((field) => field.columnName);
}

/**
 * Atomic write: mkdir -p parents, write `<final>.tmp-<random>`, rename over
 * the final path. A failed write never leaves a partial final file; the temp
 * is cleaned on error.
 */
export function atomicWriteFile(finalPath: string, content: string | Uint8Array): void {
	mkdirSync(dirname(finalPath), { recursive: true });
	const tempPath = tempPathFor(finalPath);
	try {
		writeFileSync(tempPath, content);
		renameSync(tempPath, finalPath);
	} catch (error) {
		if (existsSync(tempPath)) unlinkSync(tempPath);
		throw error;
	}
}

/**
 * The job-scoped PARTIAL of a full-export file (csv / json, DIFF-1):
 * `<final>.part-<jobId>` in the same directory. Unlike a `.tmp-*` sibling it
 * OUTLIVES its session — a resumed runner of the same job truncates it back to
 * the last checkpoint and appends — so it is named by the JOB, never randomly.
 */
export function partialPathFor(finalPath: string, jobId: string): string {
	return `${finalPath}.part-${jobId}`;
}

/** `<name>.part-<uuid>` → the uuid (null for any other name). */
export function partialJobIdOf(name: string): string | null {
	const match = /\.part-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(name);
	return match?.[1] ?? null;
}

/** The manifest identity of one record: ids of different JS types stay distinct (1 ≠ '1'). */
function manifestKey(sectionTipo: string, sectionId: number | string): string {
	return `${sectionTipo}:${typeof sectionId}:${sectionId}`;
}

/**
 * The close context of ONE session's own artifact events — the run ledger's
 * replay rule, in memory: `wrote` appends a record if absent, `removed` deletes
 * it (a re-write goes to the tail). For a session driven by hand, never by the
 * runner (which hands close() the job's ledger).
 */
export function localCloseContext(history: readonly ArtifactEvent[]): WriterCloseContext {
	return {
		async *manifest(): AsyncIterable<ManifestEntry> {
			const manifest = new Map<string, ManifestEntry>();
			for (const event of history) {
				const key = manifestKey(event.sectionTipo, event.sectionId);
				if (event.op === 'wrote') {
					if (!manifest.has(key)) {
						manifest.set(key, { sectionTipo: event.sectionTipo, sectionId: event.sectionId });
					}
				} else {
					manifest.delete(key);
				}
			}
			yield* manifest.values();
		},
		async *removed(sectionTipo: string): AsyncIterable<number | string> {
			for (const event of history) {
				if (event.op === 'removed' && event.sectionTipo === sectionTipo) yield event.sectionId;
			}
		},
	};
}

/**
 * The manifest's records as EXISTING file paths, in manifest order. A record
 * whose file is gone is reported through `onMissing` (the writer's summary
 * error — "Partial success") and skipped: a consolidated artifact never names a
 * file that is not there, and never crashes on one.
 */
export async function* manifestPaths(
	context: WriterCloseContext,
	pathOf: (entry: ManifestEntry) => string | null,
	onMissing: (path: string, entry: ManifestEntry) => void = () => {},
): AsyncIterable<string> {
	for await (const entry of context.manifest()) {
		const path = pathOf(entry);
		if (path === null) continue;
		if (!existsSync(path)) {
			onMissing(path, entry);
			continue;
		}
		yield path;
	}
}

/**
 * Read one part a manifest pass yielded, as utf-8 text — or `null` when the
 * file is GONE by the read. manifestPaths checked existence when it yielded,
 * but the files-unlink door (a record unpublished while the close runs) is not
 * fenced, so the file can vanish between that check and this read; a vanished
 * part is the same fact as a missing one — the caller reports it through its
 * onMissing line and goes on — never a crash of the whole close. Any other
 * read error is thrown.
 */
export function readManifestPart(path: string): string | null {
	try {
		return readFileSync(path, 'utf-8');
	} catch (error) {
		if (isMissingPathError(error)) return null;
		throw error;
	}
}

/**
 * ZIP the given files into `zipPath` — flat archive keyed by basename (old
 * engine posture, rdf_file_utils.ts create_zip), in input order. ALWAYS the
 * deterministic PKZIP STORE archive of the engine's one encoder
 * (core/files/zip.ts `addStoredFile`: zeroed timestamps, sizes + CRC in the
 * local header — byte-identical to the frozen in-memory writer, gate
 * zip_stream_native A/F). The old engine's runtime `Bun.zip` probe was
 * deliberately removed (audit S2-36) — a Bun release shipping Bun.zip would
 * have silently switched the archive bytes with zero code change; the outcome
 * gate is ops_runtime_pin.
 *
 * BOUNDED MEMORY (PERF-2/DIFF-4): each file is streamed from disk twice (CRC +
 * size, then bytes) straight into a temp sibling through an awaited file
 * handle, fsynced, then renamed over the final path — never held whole. (A
 * long archive inside the runner's close unit needs nothing of its own to keep
 * the fence alive: the unit's timer keepalive does, jobs/target_fence.ts.)
 *
 * Missing source files are skipped with a warning and reported through
 * `onMissing` (a close's summary line). A file opened for archiving is
 * archived WHOLE even if the files-unlink door removes its path meanwhile
 * (both passes read one open handle — core/files/zip.ts addStoredFile). Zero
 * valid entries: REFUSED by default (`empty: 'refuse'` — a caller that just
 * wrote its inputs has a bug if none is there); `empty: 'none'` (a close over
 * a manifest whose files can all be unpublished mid-close) lands NOTHING and
 * answers `entries: 0`. Always REFUSED, typed (`internal.invariant`), leaving
 * nothing behind: a DUPLICATE entry name (case-insensitive — extractors on
 * case-insensitive filesystems would overwrite one entry with the other; a
 * silently dropped entry is data loss).
 */
/** A filesystem error that says the path is gone. */
function isMissingPathError(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === 'ENOENT';
}

/**
 * Add every regular file of `filePaths` to `writer` as a STORE entry (its
 * basename); returns the number added. A path that is MISSING — at the stat,
 * or gone by the time addStoredFile opens it (a record unpublished by the
 * files-unlink door while the close runs) — is skipped with a warning and
 * reported through `onMissing`: the archive is still whole (nothing is written
 * and no name claimed before that open). Once open, an unlink cannot break the
 * entry (one handle serves both passes). A source that fails AFTER its local
 * header was emitted (writer no longer writable) cannot be skipped — a partial
 * entry is in the sink — and is the typed `internal.invariant` (the caller
 * aborts the archive). Exported for the gates that drive the stat → open
 * window and a mid-entry failure (no real file hits either on cue).
 */
export async function addZipFiles(
	writer: ZipStreamWriter,
	filePaths: Iterable<string> | AsyncIterable<string>,
	onMissing: (path: string) => void = () => {},
): Promise<number> {
	let entries = 0;
	for await (const filePath of filePaths as AsyncIterable<string>) {
		let isFile = false;
		try {
			isFile = (await stat(filePath)).isFile();
		} catch (error) {
			console.warn(`diffusion createZip: skipping missing file '${filePath}':`, error);
			onMissing(filePath);
			continue;
		}
		if (!isFile) {
			console.warn(`diffusion createZip: skipping '${filePath}': not a regular file`);
			continue;
		}
		try {
			await writer.addStoredFile(basename(filePath), filePath);
		} catch (error) {
			if (!isMissingPathError(error)) throw error;
			if (writer.writable) {
				console.warn(`diffusion createZip: skipping missing file '${filePath}':`, error);
				onMissing(filePath);
				continue;
			}
			throw new DedaloError('internal.invariant', {
				message: `diffusion createZip: '${basename(filePath)}' failed inside its entry (a partial entry is in the archive) — the archive is abandoned`,
				cause: error,
			});
		}
		entries++;
	}
	return entries;
}

/** createZip's options (see its doc). */
export interface CreateZipOptions {
	/** A skipped missing input (the close's summary line). */
	onMissing?: (path: string) => void;
	/** Zero valid entries: refuse (default) or land nothing. */
	empty?: 'refuse' | 'none';
}

export async function createZip(
	filePaths: Iterable<string> | AsyncIterable<string>,
	zipPath: string,
	options: CreateZipOptions = {},
): Promise<{ entries: number }> {
	mkdirSync(dirname(zipPath), { recursive: true });
	const tempPath = tempPathFor(zipPath);
	const handle = await open(tempPath, 'w');
	let closed = false;
	const writer = openZipStream({
		async write(chunk) {
			let written = 0;
			while (written < chunk.byteLength) {
				const { bytesWritten } = await handle.write(chunk, written, chunk.byteLength - written);
				written += bytesWritten;
			}
		},
	});
	try {
		const entries = await addZipFiles(writer, filePaths, options.onMissing);
		if (entries === 0 && options.empty === 'none') {
			writer.abort();
			await handle.close();
			closed = true;
			await unlink(tempPath).catch(() => {});
			return { entries: 0 };
		}
		if (entries === 0) {
			throw new DedaloError('internal.invariant', {
				message: `diffusion createZip: no valid files to include in '${basename(zipPath)}'`,
			});
		}
		await writer.finish();
		await handle.sync();
		await handle.close();
		closed = true;
		await rename(tempPath, zipPath);
		return { entries };
	} catch (error) {
		writer.abort();
		if (!closed) await handle.close().catch(() => {});
		await unlink(tempPath).catch(() => {});
		throw error;
	}
}

/** Most summary error lines a writer session keeps (and carries in its checkpoint). */
const MAX_WRITER_ERRORS = 50;

/**
 * A session's ARTIFACT EVENTS: pending until the runner takes them into the
 * run ledger (take), and — ONLY for a session opened without a job — the
 * session's own history, the stand-in manifest of a close without a ledger
 * (localCloseContext). A job-scoped session keeps nothing past its batch: a
 * run of N records costs O(batch) here, never O(N) (the run ledger is the
 * run's memory), and closing it without the ledger's context is refused.
 */
export class ArtifactEventLog {
	private readonly history: ArtifactEvent[] | null;
	private pending: ArtifactEvent[] = [];

	constructor(context?: WriterOpenContext) {
		this.history = context?.jobId === undefined ? [] : null;
	}

	note(op: ArtifactEvent['op'], sectionTipo: string, sectionId: number | string): void {
		const event: ArtifactEvent = { op, sectionTipo, sectionId };
		this.history?.push(event);
		this.pending.push(event);
	}

	take(): ArtifactEvent[] {
		const taken = this.pending;
		this.pending = [];
		return taken;
	}

	/** The close context to use: the runner's ledger, else this session's own events. */
	closeContext(context: WriterCloseContext | undefined): WriterCloseContext {
		if (context !== undefined) return context;
		if (this.history === null) {
			throw new DedaloError('internal.invariant', {
				message:
					"diffusion writer: close() of a JOB-scoped session needs the run ledger's close context — the session keeps no run history",
			});
		}
		return localCloseContext(this.history);
	}
}

/**
 * A session's summary ERROR LINES, deduplicated and capped, restored from the
 * resume checkpoint: a resumed run's summary names what the batches BEFORE the
 * crash reported (its "Partial success" verdict survives the crash), and a
 * line the resumed session reports again (an rdf unknown prefix) is not
 * doubled.
 */
export class WriterErrors {
	private readonly lines: string[] = [];

	constructor(resume: unknown = null) {
		const restored = (resume as { errors?: unknown } | null)?.errors;
		if (Array.isArray(restored)) for (const line of restored) this.add(String(line));
	}

	add(line: string): void {
		if (this.lines.length >= MAX_WRITER_ERRORS || this.lines.includes(line)) return;
		this.lines.push(line);
	}

	list(): string[] {
		return [...this.lines];
	}
}

/**
 * The run-scoped bookkeeping every per-record writer shares (markdown, rdf,
 * xml; mariadb keeps the counters half): per-table counters restored from the
 * resume checkpoint (so a resumed run's summary counts the whole run), the
 * summary error lines (restored too), and the artifact events
 * (ArtifactEventLog).
 */
export class WriterRunLog {
	readonly continuity: WriterContinuity;
	/** Insertion-ordered so summaries report tables in plan order. */
	private readonly counters = new Map<string, TableCounters>();
	readonly errors: WriterErrors;
	private readonly events: ArtifactEventLog;

	constructor(tableNames: readonly string[], context?: WriterOpenContext) {
		const resume = context?.resume ?? null;
		const restored = restoredCounters(resume);
		for (const tableName of tableNames) {
			this.counters.set(
				tableName,
				restored.get(tableName) ?? { records_affected: 0, records_count: 0 },
			);
		}
		for (const [tableName, counters] of restored) {
			if (!this.counters.has(tableName)) this.counters.set(tableName, counters);
		}
		this.errors = new WriterErrors(resume);
		this.events = new ArtifactEventLog(context);
		this.continuity = resume === null ? 'fresh' : 'resumed';
	}

	countersFor(tableName: string): TableCounters {
		let counters = this.counters.get(tableName);
		if (counters === undefined) {
			counters = { records_affected: 0, records_count: 0 };
			this.counters.set(tableName, counters);
		}
		return counters;
	}

	note(op: ArtifactEvent['op'], sectionTipo: string, sectionId: number | string): void {
		this.events.note(op, sectionTipo, sectionId);
	}

	take(): ArtifactEvent[] {
		return this.events.take();
	}

	/** The resumable state: the counters and the error lines (JSON, bounded). */
	checkpoint(): { tables: Record<string, TableCounters>; errors: string[] } {
		return {
			tables: Object.fromEntries(
				[...this.counters].map(([tableName, counters]) => [tableName, { ...counters }]),
			),
			errors: this.errors.list(),
		};
	}

	/** The close context to use: the runner's ledger, else this session's own events. */
	closeContext(context: WriterCloseContext | undefined): WriterCloseContext {
		return this.events.closeContext(context);
	}

	summary(extraTables: WriterRunSummary['tables'] = []): WriterRunSummary {
		return {
			tables: [
				...[...this.counters].map(([tableName, counters]) => ({
					table_name: tableName,
					records_affected: counters.records_affected,
					records_count: counters.records_count,
				})),
				...extraTables,
			],
			errors: this.errors.list(),
		};
	}
}

/** `paths`, then `last` — the zip pass of a consolidation (records, then the merged document). */
export async function* withTrailingPath(
	paths: AsyncIterable<string>,
	last: string,
): AsyncIterable<string> {
	yield* paths;
	yield last;
}

/** A full-export file's resumable state (csv / json checkpoint, per table). */
export interface FullExportCheckpoint {
	/** Durable byte length of the partial at the checkpoint (fsynced). */
	bytes: number;
	written: number;
	deleted: number;
	/** The partial holds this run's header / rows. */
	started: boolean;
}

/**
 * ONE streamed full-export file (csv's `<table>.csv`, json's `<table>.ndjson`):
 * a complete snapshot of the run, appended batch by batch onto a partial and
 * renamed over the final path at close (DIFF-1).
 *
 * The partial is JOB-SCOPED when the session belongs to a job
 * (`<final>.part-<jobId>`, partialPathFor): it outlives the session, and a
 * resumed session of the same job truncates it back to the last checkpoint's
 * durable length and appends — the rows written before a crash are neither
 * lost (a fresh temp would publish a truncated snapshot) nor duplicated (torn
 * or uncommitted bytes past the checkpoint are cut). Without a job (a session
 * driven by hand) it is a random `.tmp-*` sibling this session alone owns.
 *
 * Writes go through a numeric file descriptor opened for append (synchronous
 * writes, like atomicWriteFile's): every byte a writeRows call returned for is
 * in the OS, and `durable()` fsyncs before it reports the length — the
 * checkpoint the runner commits never names bytes a power loss could take
 * back. (A numeric descriptor, not a FileHandle object: a session abandoned by
 * a dying process must not turn into a garbage-collection error.)
 *
 * OPENING A SESSION NEVER MODIFIES THE PARTIAL. The partial is named by job, not
 * by epoch, so every epoch of a job shares it — and the runner opens its writer
 * OUTSIDE the target fence. A revoked epoch frozen before its open (SIGSTOP, a
 * paused VM) would, on thawing, cut the partial back to ITS stale checkpoint
 * while the live epoch appends to it: rows lost from the finalized file. So
 * resume() only VALIDATES (the partial is there and long enough); the cut
 * back to the checkpoint happens at the first mutating call — append, durable,
 * finalize — which the runner makes only inside a fenced unit, where a revoked
 * epoch never gets.
 */
export class FullExportFile {
	readonly partialPath: string;
	private readonly jobScoped: boolean;
	private fd: number | null = null;
	/** The checkpointed length a resumed partial is cut back to — deferred to the first mutating call. */
	private pendingTruncate: number | null = null;
	started = false;
	written = 0;
	deleted = 0;

	constructor(
		readonly finalPath: string,
		jobId: string | null,
	) {
		this.jobScoped = jobId !== null;
		this.partialPath = jobId === null ? tempPathFor(finalPath) : partialPathFor(finalPath, jobId);
	}

	/**
	 * Honour a checkpoint: counters restored; a started partial must still hold
	 * at least the checkpointed bytes (it is cut back to exactly them by the
	 * first mutating call — see the class note: never here, at open). False =
	 * the checkpoint cannot be honoured (partial gone or short) — restart.
	 */
	async resume(state: Partial<FullExportCheckpoint> | undefined): Promise<boolean> {
		if (state === undefined) return true;
		this.written = Number(state.written) || 0;
		this.deleted = Number(state.deleted) || 0;
		if (state.started !== true) return true;
		const bytes = Number(state.bytes);
		if (!this.jobScoped || !Number.isInteger(bytes) || bytes < 0) return false;
		let size: number;
		try {
			size = (await stat(this.partialPath)).size;
		} catch {
			return false;
		}
		if (size < bytes) return false;
		this.pendingTruncate = bytes;
		this.started = true;
		return true;
	}

	/** Cut a resumed partial back to its checkpoint (once; the first mutating call). */
	private async settleResume(): Promise<void> {
		if (this.pendingTruncate === null) return;
		await truncate(this.partialPath, this.pendingTruncate);
		this.pendingTruncate = null;
	}

	/** Append `text` (the first append of a fresh file creates/truncates the partial). */
	async append(text: string): Promise<void> {
		if (this.fd === null) {
			await this.settleResume();
			mkdirSync(dirname(this.partialPath), { recursive: true });
			this.fd = openSync(this.partialPath, this.started ? 'a' : 'w');
			this.started = true;
		}
		const bytes = Buffer.from(text, 'utf-8');
		let offset = 0;
		while (offset < bytes.byteLength) {
			offset += writeSync(this.fd, bytes, offset, bytes.byteLength - offset);
		}
	}

	/** Durability barrier: fsync, then the checkpoint (the partial's durable length). */
	async durable(): Promise<FullExportCheckpoint> {
		await this.settleResume();
		if (this.fd !== null) fsyncSync(this.fd);
		const bytes = this.started ? (await stat(this.partialPath)).size : 0;
		return { bytes, written: this.written, deleted: this.deleted, started: this.started };
	}

	/** Close the descriptor (the partial stays). */
	release(): void {
		const fd = this.fd;
		this.fd = null;
		if (fd !== null) {
			try {
				closeSync(fd);
			} catch {
				// already closed — nothing held
			}
		}
	}

	/**
	 * Finalize: rename the partial over the final path — through `filter`
	 * first when the run removed records (it writes the kept records to a
	 * sibling temp and reports how many it dropped).
	 */
	async finalize(
		removed: ReadonlySet<string>,
		filter: (
			input: string,
			output: string,
			removedIds: ReadonlySet<string>,
		) => Promise<{ dropped: number }>,
	): Promise<void> {
		await this.settleResume();
		if (this.fd !== null) fsyncSync(this.fd);
		this.release();
		if (removed.size > 0) {
			const filteredPath = tempPathFor(this.finalPath);
			const { dropped } = await filter(this.partialPath, filteredPath, removed);
			this.deleted += dropped;
			this.written -= dropped;
			await unlink(this.partialPath);
			await rename(filteredPath, this.finalPath);
		} else {
			await rename(this.partialPath, this.finalPath);
		}
	}

	/**
	 * Abort: release the descriptor. A session-owned `.tmp-*` partial is deleted
	 * (this session created it and nothing can resume it); a JOB-scoped one is
	 * KEPT — the job's next attempt resumes from it.
	 */
	async abort(): Promise<void> {
		this.release();
		if (!this.jobScoped && existsSync(this.partialPath)) unlinkSync(this.partialPath);
	}
}

/** The ids the run removed from one section (the full-export filter set, as text). */
export async function removedIdSet(
	context: WriterCloseContext,
	sectionTipo: string,
): Promise<Set<string>> {
	const removed = new Set<string>();
	for await (const id of context.removed(sectionTipo)) removed.add(String(id));
	return removed;
}

/**
 * Sweep leftover `.part-<jobId>` partials of OTHER jobs in a target directory
 * whose job is gone for good (context.partialIsOrphan) — runs inside a
 * successful close, i.e. under the target's fence. Never touches a partial of
 * a job that can still resume, nor anything without the job-scoped grammar.
 */
export async function sweepOrphanPartials(
	targetDir: string,
	context: WriterCloseContext,
	ownJobId: string | null,
): Promise<void> {
	const isOrphan = context.partialIsOrphan;
	if (isOrphan === undefined || !existsSync(targetDir)) return;
	for (const name of readdirSync(targetDir)) {
		const jobId = partialJobIdOf(name);
		if (jobId === null || jobId === ownJobId) continue;
		if (await isOrphan.call(context, jobId)) await unlink(`${targetDir}/${name}`).catch(() => {});
	}
}

/**
 * Sweep leftover `.tmp-*` siblings (core/files/temp_path.ts isTempSibling) in a
 * target directory — the temps a holder killed mid-write left behind (a crashed
 * createZip, a streamed merge, an atomicWriteFile). ONLY inside a close that
 * runs under the target's fence (`context.fenced`): every temp in the directory
 * is created by a fence holder, and this close IS the holder, so none of them
 * can be another session's in-flight write. Runs BEFORE the close writes its own
 * temps. abort() never sweeps (it may run unfenced). `ownPaths` are temps THIS
 * session is still using — a job-less csv/json session streams onto a `.tmp-*`
 * partial it has not finalized yet — and are never swept.
 */
export async function sweepStaleTemps(
	targetDir: string,
	context: WriterCloseContext,
	ownPaths: Iterable<string> = [],
): Promise<void> {
	if (context.fenced !== true || !existsSync(targetDir)) return;
	const own = new Set([...ownPaths].map((path) => basename(path)));
	for (const name of readdirSync(targetDir)) {
		if (isTempSibling(name) && !own.has(name)) {
			await unlink(`${targetDir}/${name}`).catch(() => {});
		}
	}
}
