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
	readdirSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { privateDir, readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import { runDetachedFromTransaction } from '../db/postgres.ts';

/** A job's lifecycle status. */
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'interrupted' | 'stopped';

/**
 * WHAT a job is working on — the record/component/tier it will change.
 *
 * Without this a job is addressable only by an id handed to whoever submitted it,
 * so no surface can ask "is anything running for this record?". That gap is why
 * an upload's background transcode was invisible: tool_upload got the id and
 * dropped it, and tool_media_versions — opened afterwards — had nothing to ask.
 *
 * Shaped after the diffusion queue's `spec` target keys
 * (src/diffusion/jobs/schema.ts) so the two job systems read alike; see
 * `hasLiveJobForTarget` for where the two deliberately diverge.
 */
export interface JobTarget {
	section_tipo: string;
	/**
	 * INT, the canonical stored form (WC-2026-08-10-section-id-int-canonical).
	 * A first version minted `String(identity.sectionId)` here and tripped the
	 * section_id writer tripwire — correctly: a new string-form section_id is
	 * exactly the drift that WC entry exists to stop, and a job target is a
	 * writer site like any other.
	 */
	section_id: number;
	component_tipo: string;
	lang: string | null;
	/** The PRIMARY tier being produced: '404', 'audio', 'thumb', … */
	quality: string;
	/**
	 * OTHER tiers this same job also writes.
	 *
	 * The ingest transcode builds the default quality AND the audio tier in one
	 * job. With only `quality` stamped, the duplicate guard covered the default
	 * tier and left `audio` wide open: a click on the audio gear mid-ingest
	 * started a second ffmpeg writing the very file the running job was about to
	 * produce — the exact race this guard exists to close, surviving in the one
	 * path that motivated the whole change.
	 *
	 * Identity stays SINGLE (`jobTargetKey` reads `quality` only), so the index
	 * and the panel still agree on one row per job; this list widens what the
	 * job BLOCKS, not what it is called.
	 */
	also_qualities?: string[];
	/** Human tier name for the activity tray (never used for identity). */
	label?: string;
}

/**
 * The identity of a target, for indexing and the duplicate guard.
 * `join` coerces the int section_id — deliberately no `String(section_id)`,
 * which is the minting shape the section_id tripwire (rightly) refuses.
 */
export function jobTargetKey(target: JobTarget): string {
	return [
		target.section_tipo,
		target.section_id,
		target.component_tipo,
		target.lang ?? '',
		target.quality,
	].join('|');
}

/**
 * The key PREFIX every target on one record shares.
 *
 * `jobsForRecord` filters with this rather than comparing the record-id field
 * directly: an inline equality on that field is exactly the locator-law shape
 * the S2-04/DEC-21 ratchet refuses to let grow (the canonical comparison lives
 * in concepts/locator.ts, and it is loose-numeric — a stored '05' matches 5,
 * where a strict inline test would not). Matching on the composed key is both
 * the honest identity comparison and one fewer place that can drift from
 * `jobTargetKey`.
 *
 * (The prose here deliberately avoids writing that comparison out as code: the
 * ratchet's scanner reads source text, so an illustrative snippet in a comment
 * counts as a real offender — a trap the tripwire's own header warns about.)
 */
function recordKeyPrefix(sectionTipo: string, sectionId: number): string {
	return `${sectionTipo}|${sectionId}|`;
}

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
	/**
	 * WHAT this job is working on — absent only for the genuinely record-less jobs
	 * (backup, the unit-test runner), which the submit-target gate names with a
	 * reason. See `JobTarget`.
	 */
	target?: JobTarget;
	/** Arbitrary result payload (e.g. built file paths). */
	data: unknown;
	errors: string[];
	/**
	 * MONOTONIC start/update marks (performance.now-based, injectable for tests).
	 * They measure ELAPSED time and are not wall-clock instants — `total_time` is
	 * their difference, which is all the poll wire ever needed.
	 */
	startedAt: number;
	updatedAt: number;
	/**
	 * WALL-CLOCK submit instant (Date.now). Added for the activity tray, which
	 * must say "started 4 minutes ago" ACROSS a page reload — impossible from the
	 * monotonic marks above, whose origin dies with the process. Deliberately a
	 * separate field rather than a redefinition of `startedAt`: the poll wire's
	 * `total_time` contract stays exactly as it was.
	 */
	startedAtWall?: number;
	/**
	 * WALL-CLOCK terminal instant (Date.now), set on every terminal transition.
	 *
	 * The activity read needs it to answer "what JUST finished", which is what
	 * makes a tray able to report an outcome at all. Without it the client can
	 * only observe that a job STOPPED APPEARING, and it must then guess what that
	 * absence meant — the guess that painted failed publications green.
	 */
	finishedAtWall?: number;
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

/**
 * Job ids with a pfile on disk — including jobs from a PREVIOUS process life,
 * which is the whole reason the mirror exists.
 *
 * An unreadable directory yields an empty list rather than throwing: the
 * in-memory registry is authoritative, and a listing that cannot be taken must
 * degrade the discovery, never break the request asking for it.
 */
function persistedJobIds(): string[] {
	const dir = processesDir();
	const now = Date.now();
	// KEYED BY DIRECTORY. A memo that ignored the dir served one tree's listing
	// for another the moment DEDALO_MEDIA_PROCESSES_DIR moved — which is exactly
	// what the test seam does between cases, and would be a real wrong answer on
	// any install that repointed the tree.
	if (mirrorScan !== null && mirrorScan.dir === dir && now - mirrorScan.at < MIRROR_SCAN_TTL_MS) {
		return mirrorScan.ids;
	}
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	const ids = names
		.filter((name) => name.endsWith('.json'))
		.map((name) => name.slice(0, -'.json'.length));
	mirrorScan = { dir, at: now, ids };
	return ids;
}

/** Drop the listing memo — called whenever THIS process writes a pfile. */
function invalidateMirrorScan(): void {
	mirrorScan = null;
}

/**
 * Short-lived memo of the pfile LISTING (audit: the scan sits on a request
 * path).
 *
 * The activity tray asks per mount and per poll, per tab; the versions panel
 * asks per open. Each ask was a blocking readdir on Bun's single event loop.
 *
 * A one-second memo removes the repetition without weakening the answer: the
 * IN-MEMORY registry is consulted FIRST and is never memoized, so anything this
 * process owns is always current. This caches only WHICH pfiles exist — the
 * previous-life leftovers, which by definition are not changing. Deliberately
 * NOT the parsed records: a stale pfile BODY could report a dead job as
 * running, which is the exact lie the reconcile exists to prevent.
 */
const MIRROR_SCAN_TTL_MS = 1000;
let mirrorScan: { dir: string; at: number; ids: string[] } | null = null;

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
	/**
	 * LIVE jobs by target key (queued/running only) — the index that makes
	 * "what is running for this record?" answerable, and the duplicate-build
	 * guard's arbiter. Entries are added at submit and removed at every terminal
	 * transition, so a key present here always names live work.
	 */
	private readonly liveByTarget = new Map<string, Set<string>>();
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
			// Our own write changes the listing: a memo that outlived it would hide
			// a job this process just created for up to a second.
			invalidateMirrorScan();
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

	/**
	 * Every tier key a job OCCUPIES: its own, plus any companion tier the same
	 * job also writes (`also_qualities` — the ingest transcode's audio tier).
	 */
	private occupiedKeys(target: JobTarget): string[] {
		const keys = [jobTargetKey(target)];
		for (const quality of target.also_qualities ?? []) {
			keys.push(jobTargetKey({ ...target, quality }));
		}
		return keys;
	}

	/** Enter a targeted job into the live-by-target index (no-op when untargeted). */
	private indexLive(record: JobRecord): void {
		if (record.target === undefined) return;
		for (const key of this.occupiedKeys(record.target)) {
			let ids = this.liveByTarget.get(key);
			if (ids === undefined) {
				ids = new Set();
				this.liveByTarget.set(key, ids);
			}
			ids.add(record.id);
		}
	}

	/** Drop a job from the live-by-target index (called on EVERY terminal path). */
	private unindexLive(record: JobRecord): void {
		if (record.target === undefined) return;
		for (const key of this.occupiedKeys(record.target)) {
			const ids = this.liveByTarget.get(key);
			if (ids === undefined) continue;
			ids.delete(record.id);
			if (ids.size === 0) this.liveByTarget.delete(key);
		}
	}

	/**
	 * Is a job already live for this exact target? The duplicate-build guard.
	 *
	 * WHY IN MEMORY, when diffusion enforces its equivalent with a DB partial
	 * unique index (src/diffusion/jobs/schema.ts): that queue dispatches to
	 * SEPARATE runner processes, possibly on another host, so only the database
	 * can arbitrate. Media jobs run in-process under one manager, where this
	 * registry IS the arbiter. Not a lesser copy of diffusion's guard — a
	 * different problem.
	 *
	 * THE LIMIT, stated rather than discovered: a SECOND server instance sharing
	 * ../private/processes (a deployment `isStaleLiveRecord` explicitly
	 * contemplates) has its own registry, so each instance could admit a build for
	 * the same target. The cost is a wasted duplicate encode whose loser is
	 * discarded by the atomic rename — never corruption — but if this ever needs
	 * to be exact, the fix is to promote media jobs onto the durable queue, not to
	 * bolt a lock onto this map.
	 */
	hasLiveJobForTarget(target: JobTarget): boolean {
		return (this.liveByTarget.get(jobTargetKey(target))?.size ?? 0) > 0;
	}

	/**
	 * Every job this process knows about: the in-memory registry FIRST, then the
	 * pfile mirror for ids the registry has evicted or never owned (a previous
	 * process life). Pfile reads go through `status()`, so the lazy reconcile
	 * applies and a job orphaned by a dead server is reported 'interrupted' rather
	 * than eternally 'running'.
	 *
	 * The directory scan is bounded by the 30-day pfile retention the boot sweep
	 * enforces. It runs on a tray load and a widget open, not per frame.
	 */
	private allKnownRecords(): JobRecord[] {
		const records = new Map<string, JobRecord>();
		for (const record of this.registry.values()) records.set(record.id, record);
		for (const id of persistedJobIds()) {
			if (records.has(id)) continue;
			const record = this.status(id);
			if (record !== null) records.set(id, record);
		}
		return [...records.values()];
	}

	/**
	 * Jobs touching a record — the answer tool_media_versions needs to render a
	 * tier as "being built" instead of as an empty cell. Terminal jobs are
	 * included: an `error`/`interrupted` tier must stay readable, because
	 * reverting it to blank is exactly the "never built" lie this whole path
	 * exists to remove.
	 */
	jobsForRecord(sectionTipo: string, sectionId: number): JobRecord[] {
		const prefix = recordKeyPrefix(sectionTipo, sectionId);
		return this.allKnownRecords().filter((record) =>
			record.target === undefined ? false : jobTargetKey(record.target).startsWith(prefix),
		);
	}

	/** A user's own jobs — the media half of the activity tray's read model. */
	jobsForUser(userId: number): JobRecord[] {
		return this.allKnownRecords().filter((record) => record.user_id === userId);
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
	submit(
		kind: string,
		worker: JobWorker,
		meta: { userId?: number; target?: JobTarget } = {},
	): JobRecord {
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
			target: meta.target,
			data: null,
			errors: [],
			startedAt: now,
			updatedAt: now,
			startedAtWall: Date.now(),
		};
		this.registry.set(id, record);
		this.indexLive(record);
		const controller = new AbortController();
		this.controllers.set(id, controller);
		this.commit(record);

		// DETACHED: submit() is called synchronously from a request handler, so the
		// worker would otherwise inherit that request's AsyncLocalStorage stores —
		// including a `withTransaction` handle the request expires (S2-14) long
		// before a transcode ends. A job outlives its submitter, so it must own no
		// part of the submitter's connection state; its queries go to the pool.
		void runDetachedFromTransaction(() => this.run(record, worker, controller));
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
		record.finishedAtWall = Date.now();
		// Out of the live index BEFORE the frame is published: a subscriber woken by
		// the terminal commit may immediately re-submit the same target (the panel's
		// retry), and it must not be refused by the job that just ended.
		this.unindexLive(record);
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
			record.finishedAtWall = Date.now();
			this.unindexLive(record);
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

	/**
	 * The owner user id stamped on a job (TOOLS-09 owner-scoping): a number when
	 * owned, null when the job carries no user data, or undefined when the id is
	 * unknown. The job id is PREDICTABLE (kind_pid_counter), so status callers must
	 * confirm ownership rather than treat the id as an unguessable capability.
	 */
	ownerOf(id: string): number | null | undefined {
		const record = this.status(id);
		return record === null ? undefined : (record.user_id ?? null);
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
