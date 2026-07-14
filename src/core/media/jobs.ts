/**
 * MEDIA JOB MANAGER — supervised async jobs with a client-compatible poll wire.
 *
 * PHP ran long media conversions as detached `nohup`/`sh` processes tracked in a
 * `processes` DB table + on-disk process files, and the client polled a status
 * stream. This rewrite keeps the CLIENT contract (a process file + status
 * frames `{pid, pfile, is_running, data, errors, total_time}`) but modernizes
 * the internals: in-process supervised jobs, a concurrency cap, progress ticks,
 * real cancellation, and idempotent recovery (engineering/MEDIA_SPEC.md §5.5). Jobs are
 * TS-visible only — TS never reads PHP's `processes` table or pfiles.
 *
 * Not a persistent queue: on restart, running pfiles are marked interrupted —
 * lazily on pfile-fallback read AND by the boot sweep `reconcileProcessFiles`
 * (audit S2-15/DEC-22: records stamp the owning process pid; a 'running'
 * pfile whose owner is not alive can never complete and is flipped to
 * 'interrupted' so the poll wire stops reporting a dead job as live). The
 * derivative work is safe to re-request because every derivative rebuilds from
 * the untouched original and outputs are atomic (temp+rename).
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { privateDir, readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';

/** A job's lifecycle status. */
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'interrupted' | 'stopped';

/** The persisted job record (also the poll payload the client reads). */
export interface JobRecord {
	id: string;
	kind: string;
	pid: number | null;
	/** The SERVER process that owns this in-process job (reconcile identity,
	 * audit S2-15). Optional: pfiles written before stamping lack it. */
	owner_pid?: number;
	/**
	 * The USER who started the job. Job ids are derived (kind_pid_counter), i.e.
	 * guessable, so any job whose payload is user data must carry its owner — the
	 * status stream refuses a poll from anyone else (see api/process_status.ts).
	 * Absent = unowned (the AV/backup records, whose frames expose only
	 * operational shape); a job that returns record data MUST set it.
	 */
	user_id?: number | null;
	status: JobStatus;
	/** 0..100 progress when the worker reports it, else null. */
	progress: number | null;
	/** Arbitrary result payload (e.g. built file paths). */
	data: unknown;
	errors: string[];
	startedAt: number;
	updatedAt: number;
}

/** The status frame the vendored client expects (render_common.js SSE shape). */
export interface JobStatusFrame {
	pid: number | null;
	pfile: string;
	is_running: boolean;
	data: unknown;
	errors: string[];
	total_time: number;
}

/**
 * A worker: does the job, may report progress, returns a result payload.
 * `onData` publishes an INTERMEDIATE payload into the record (and its pfile), so
 * a poller sees something truthful before the job ends — the final return value
 * still overwrites it. Without it a long job streams `data:null` frames and the
 * client's progress line renders "undefined" until completion.
 */
export type JobWorker = (ctx: {
	onProgress: (percent: number) => void;
	onData: (data: unknown) => void;
	signal: AbortSignal;
}) => Promise<unknown>;

/**
 * Directory holding the TS process files (its own private tree, not PHP's).
 * DEDALO_MEDIA_PROCESSES_DIR override: the test seam (the session-store
 * DEDALO_SESSION_DB_PATH pattern) — suites must never sweep/mutate the live
 * ../private/processes tree. Read per call so it stays test-settable.
 */
function processesDir(): string {
	const dir = readEnv('DEDALO_MEDIA_PROCESSES_DIR') ?? join(privateDir, 'processes');
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o750 });
	return dir;
}

/** The pfile path for a job id. */
export function jobFilePath(id: string): string {
	return join(processesDir(), `${id}.json`);
}

/** The client status frame for an already-resolved record (no reconcile read). */
function frameOf(record: JobRecord): JobStatusFrame {
	return {
		pid: record.pid,
		pfile: jobFilePath(record.id),
		is_running: record.status === 'queued' || record.status === 'running',
		data: record.data,
		errors: record.errors,
		total_time: record.updatedAt - record.startedAt,
	};
}

/** True when a pid answers signal 0 (still running, same host). */
function pidIsAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** How long a legacy pfile (no owner_pid stamp) may sit 'running' before the
 * reconcile treats it as stale — generous, transcodes are long. */
const LEGACY_STALE_AFTER_MS = 60 * 60 * 1000;

/** Terminal pfiles older than this are pruned by the boot sweep (S3-46/62). */
const PFILE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** In-memory retention of TERMINAL records; the pfile mirror stays readable. */
const TERMINAL_EVICT_AFTER_MS = 60 * 60 * 1000;

/**
 * Whether a persisted record claims to be live but provably is not: jobs are
 * IN-PROCESS, so a 'running'/'queued' pfile is genuine only while its owning
 * process is alive AND is not us (a registry-missed read in the owner process
 * means a previous life with a reused pid). Legacy pfiles without the stamp
 * fall back to an mtime staleness window.
 */
function isStaleLiveRecord(record: JobRecord, pfileMtimeMs: number): boolean {
	if (record.status !== 'running' && record.status !== 'queued') return false;
	if (typeof record.owner_pid === 'number') {
		if (record.owner_pid === process.pid) return true; // pid reuse of ourselves
		return !pidIsAlive(record.owner_pid);
	}
	return Date.now() - pfileMtimeMs > LEGACY_STALE_AFTER_MS;
}

/**
 * Boot sweep (audit S2-15 mandatory reconcile + S3-46 residue GC): flip stale
 * live pfiles to 'interrupted' (console.error each — a crashed transcode must
 * never be silent) and prune terminal pfiles past retention. Idempotent; safe
 * with a second live server instance sharing ../private/processes (its live
 * jobs' owner pids answer signal 0 and are left alone).
 */
export function reconcileProcessFiles(): { interrupted: string[]; pruned: number } {
	const dir = processesDir();
	const interrupted: string[] = [];
	let pruned = 0;
	for (const name of readdirSync(dir)) {
		if (!name.endsWith('.json')) continue;
		const filePath = join(dir, name);
		try {
			const mtimeMs = statSync(filePath).mtimeMs;
			const record = JSON.parse(readFileSync(filePath, 'utf-8')) as JobRecord;
			if (isStaleLiveRecord(record, mtimeMs)) {
				record.status = 'interrupted';
				record.errors.push('interrupted: owning server process died (boot reconcile)');
				writeFileSync(filePath, JSON.stringify(record));
				interrupted.push(record.id);
				console.error(
					`[media jobs] reconcile: job ${record.id} (${record.kind}) was 'running' under a dead process — marked interrupted`,
				);
			} else if (
				record.status !== 'running' &&
				record.status !== 'queued' &&
				Date.now() - mtimeMs > PFILE_RETENTION_MS
			) {
				unlinkSync(filePath);
				pruned += 1;
			}
		} catch {
			// Unparseable/vanished pfile: leave it; never let hygiene break boot.
		}
	}
	return { interrupted, pruned };
}

/**
 * The job manager: a bounded-concurrency supervisor. Default 3 lanes (2 heavy
 * transcodes + 1 CPU-bound image/OCR); tune via DEDALO_MEDIA_JOB_CONCURRENCY.
 */
export class MediaJobManager {
	private readonly registry = new Map<string, JobRecord>();
	private readonly controllers = new Map<string, AbortController>();
	private readonly maxConcurrent: number;
	private active = 0;
	private readonly queue: (() => void)[] = [];
	private counter = 0;
	/** Live push consumers per job id (see subscribe) — empty sets are dropped. */
	private readonly subscribers = new Map<string, Set<(frame: JobStatusFrame) => void>>();
	/** A monotonic clock injected for determinism in tests (default Date.now via performance origin). */
	private readonly clock: () => number;

	constructor(maxConcurrent = 3, clock?: () => number) {
		this.maxConcurrent = Math.max(1, maxConcurrent);
		this.clock = clock ?? (() => Math.round(globalThis.performance.now()));
	}

	/** Allocate a deterministic job id (no Date/Math.random — resume-safe). */
	private nextId(kind: string): string {
		this.counter += 1;
		return `${kind}_${process.pid}_${this.counter}`;
	}

	/** Persist the record to its pfile (best-effort mirror). */
	private persist(record: JobRecord): void {
		try {
			writeFileSync(jobFilePath(record.id), JSON.stringify(record));
		} catch {
			/* pfile is a best-effort mirror; the in-memory registry is authoritative */
		}
	}

	/**
	 * Commit one state change: mirror it to the pfile AND wake every live
	 * subscriber. Every mutation goes through here, so a PUSH consumer can never
	 * miss a transition the pfile mirror recorded.
	 */
	private commit(record: JobRecord): void {
		this.persist(record);
		const listeners = this.subscribers.get(record.id);
		if (listeners === undefined) return;
		const frame = frameOf(record);
		for (const listener of listeners) {
			try {
				listener(frame);
			} catch {
				/* a broken consumer must never take down the job */
			}
		}
	}

	/**
	 * Subscribe to a job's frames (PUSH). Returns the unsubscribe function.
	 *
	 * This is the native transport: the job runs IN THIS PROCESS, so a consumer
	 * can be woken on the state change itself instead of re-reading a file on a
	 * timer. `get_process_status` keeps its poll loop for the pfile-shaped
	 * consumers (AV transcodes, the backup widget); anything new should subscribe.
	 */
	subscribe(id: string, listener: (frame: JobStatusFrame) => void): () => void {
		let listeners = this.subscribers.get(id);
		if (listeners === undefined) {
			listeners = new Set();
			this.subscribers.set(id, listeners);
		}
		listeners.add(listener);
		return () => {
			const live = this.subscribers.get(id);
			if (live === undefined) return;
			live.delete(listener);
			if (live.size === 0) this.subscribers.delete(id);
		};
	}

	/** Acquire a concurrency slot (resolves when a lane is free). */
	private acquire(): Promise<void> {
		if (this.active < this.maxConcurrent) {
			this.active += 1;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => this.queue.push(resolve));
	}

	/** Release a slot and start the next queued job. */
	private release(): void {
		this.active -= 1;
		const next = this.queue.shift();
		if (next) {
			this.active += 1;
			next();
		}
	}

	/**
	 * Submit a job. Returns the record immediately (status 'queued'); the worker
	 * runs under the concurrency cap. Poll `status(id)` for progress/completion.
	 * `meta.userId` stamps the owner — REQUIRED for any job whose payload is user
	 * data, because the status stream authorizes the poll against it.
	 */
	submit(kind: string, worker: JobWorker, meta: { userId?: number } = {}): JobRecord {
		const id = this.nextId(kind);
		const now = this.clock();
		const record: JobRecord = {
			id,
			kind,
			pid: null,
			owner_pid: process.pid,
			user_id: meta.userId ?? null,
			status: 'queued',
			progress: null,
			data: null,
			errors: [],
			startedAt: now,
			updatedAt: now,
		};
		this.registry.set(id, record);
		const controller = new AbortController();
		this.controllers.set(id, controller);
		this.commit(record);

		void this.run(record, worker, controller);
		return record;
	}

	private async run(
		record: JobRecord,
		worker: JobWorker,
		controller: AbortController,
	): Promise<void> {
		await this.acquire();
		if (controller.signal.aborted) {
			this.finish(record, 'stopped');
			this.release();
			return;
		}
		record.status = 'running';
		record.updatedAt = this.clock();
		this.commit(record);
		try {
			const result = await worker({
				onProgress: (percent: number) => {
					record.progress = Math.max(0, Math.min(100, Math.round(percent)));
					record.updatedAt = this.clock();
					this.commit(record);
				},
				onData: (data: unknown) => {
					record.data = data;
					record.updatedAt = this.clock();
					this.commit(record);
				},
				signal: controller.signal,
			});
			record.data = result;
			this.finish(record, controller.signal.aborted ? 'stopped' : 'done');
		} catch (error) {
			record.errors.push((error as Error).message);
			this.finish(record, controller.signal.aborted ? 'stopped' : 'error');
		} finally {
			this.release();
		}
	}

	private finish(record: JobRecord, status: JobStatus): void {
		record.status = status;
		record.progress = status === 'done' ? 100 : record.progress;
		record.updatedAt = this.clock();
		// The TERMINAL frame: subscribers see is_running:false and close their
		// stream. Committed before the subscriber set is dropped below.
		this.commit(record);
		this.subscribers.delete(record.id);
		this.controllers.delete(record.id);
		// Terminal visibility (audit S2-15/DEC-22 mandatory logging): a failed or
		// interrupted job must never be memory-only news nobody polls.
		if (status === 'error' || status === 'interrupted') {
			console.error(
				`[media jobs] job ${record.id} (${record.kind}) finished '${status}': ${record.errors.join('; ') || 'no error detail'}`,
			);
		}
		// Bounded registry (S3-62): evict terminal records after a grace period —
		// status() falls back to the pfile mirror, so nothing observable changes.
		const evictionTimer = setTimeout(
			() => this.registry.delete(record.id),
			TERMINAL_EVICT_AFTER_MS,
		);
		if (typeof (evictionTimer as { unref?: () => void }).unref === 'function') {
			(evictionTimer as unknown as { unref: () => void }).unref();
		}
	}

	/** Current record, or null (in-memory first, then the pfile mirror). */
	status(id: string): JobRecord | null {
		const record = this.registry.get(id);
		if (record) return record;
		const file = jobFilePath(id);
		if (existsSync(file)) {
			try {
				const persisted = JSON.parse(readFileSync(file, 'utf-8')) as JobRecord;
				// Lazy reconcile (audit S2-15): a registry miss on a 'running' pfile
				// means the owning process life is over — a dead job must not report
				// is_running:true forever. Flip, persist, log; the caller sees truth.
				if (isStaleLiveRecord(persisted, statSync(file).mtimeMs)) {
					persisted.status = 'interrupted';
					persisted.errors.push('interrupted: owning server process died (lazy reconcile)');
					writeFileSync(file, JSON.stringify(persisted));
					console.error(
						`[media jobs] reconcile: job ${persisted.id} (${persisted.kind}) was 'running' under a dead process — marked interrupted`,
					);
				}
				return persisted;
			} catch {
				return null;
			}
		}
		return null;
	}

	/**
	 * Graceful-shutdown hook (audit S2-17): abort every live job and mark its
	 * record 'interrupted' in the pfile so post-restart polls see the truth.
	 * Returns the interrupted job ids.
	 */
	interruptLive(reason: string): string[] {
		const interrupted: string[] = [];
		for (const record of this.registry.values()) {
			if (record.status !== 'running' && record.status !== 'queued') continue;
			this.controllers.get(record.id)?.abort();
			record.status = 'interrupted';
			record.errors.push(`interrupted: ${reason}`);
			record.updatedAt = this.clock();
			this.commit(record);
			this.subscribers.delete(record.id);
			this.controllers.delete(record.id);
			interrupted.push(record.id);
		}
		return interrupted;
	}

	/** The client SSE status frame for a job. */
	frame(id: string): JobStatusFrame | null {
		const record = this.status(id);
		if (record === null) return null;
		return frameOf(record);
	}

	/** Request cancellation. Returns true when the job was live. */
	stop(id: string): boolean {
		const controller = this.controllers.get(id);
		if (controller === undefined) return false;
		controller.abort();
		return true;
	}

	/** Whether a concurrency lane is free (PHP get_server_ready_status equivalent). */
	hasHeadroom(): boolean {
		return this.active < this.maxConcurrent;
	}
}

/** The process-wide media job manager (single instance per server). */
export const mediaJobs = new MediaJobManager(
	// readEnv, NOT process.env: keeps ../private/.env — the documented config
	// home — working for this key (audit S2-21; the runtime-reproduced trap).
	Number(readString('DEDALO_MEDIA_JOB_CONCURRENCY')) || 3,
);
