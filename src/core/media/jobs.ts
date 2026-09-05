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
 *
 * LANES (PERF-11). There used to be ONE cap for everything: a transcode queue,
 * an ASR batch, a 10k-row import and an operator's code update all drew from the
 * same three slots, so a full ingest starved the update the operator was waiting
 * on. Work is now classed into LANES with independent budgets, and the class is
 * DECLARED at the submit site (`meta.lane`) — never inferred from the `kind`
 * string, which is how a new job silently lands in the wrong lane and the
 * starvation comes back without anyone editing a budget.
 *
 * DEADLINES. Each lane carries a default wall-clock budget (per-submit
 * override), armed from RUN START — after the slot is acquired, not from submit:
 * a job that waited behind a full lane must not be killed for having waited.
 * When it fires it aborts the job's controller (which is now also the AMBIENT
 * job signal, media/job_scope.ts, so an awaited outbound call is cancelled too)
 * and marks the record terminal. It does NOT release the lane slot: the slot is
 * released when the worker actually settles, because releasing it while ffmpeg
 * still holds the CPU would over-subscribe the box. A worker that has not
 * settled `JOB_DEADLINE_SETTLE_GRACE_MS` after its abort bumps the
 * `job_deadline_lane_held` counter, so a wedged lane is observable rather than
 * silent.
 *
 * WHAT AN ABORT DOES NOT REACH, stated rather than discovered: child processes.
 * `Bun.spawn` sites (ffmpeg, pg_dump, the transcriber sidecar) do not subscribe
 * to the job signal — their cancellation is their own subprocess handle, and
 * wiring it is a separate change with its own gate. The deadline therefore stops
 * the JS work and frees the record; a spawned child of a deadlined job runs to
 * its own end, which is exactly what the held-lane counter above measures.
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
import { incrementCounter } from '../api/counters.ts';
import { runDetachedFromTransaction } from '../db/postgres.ts';
import { runWithJobSignal } from './job_scope.ts';

/** A job's lifecycle status. */
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'interrupted' | 'stopped';

/**
 * THE WORK CLASS a job draws its slot from — its LANE.
 *
 * Four classes, because four kinds of work compete for genuinely different
 * resources and have genuinely different urgencies:
 *
 *  - `media`         ffmpeg/ImageMagick derivative building. CPU + IO heavy, and
 *                    legitimately hours long (a master transcode).
 *  - `transcription` speech-to-text batches: mostly WAITING on a sidecar, so its
 *                    slots are cheap to hold but must not eat the media budget.
 *  - `rag`           embedding/index building against the vector store.
 *  - `maintenance`   the operator's own work — code update, data update, cache
 *                    rebuild, imports, the dev long-process probe. This is the
 *                    lane the single shared cap used to starve, which is the
 *                    whole reason lanes exist.
 *
 * THERE IS DELIBERATELY NO `publication` LANE. Publication/diffusion work runs
 * on the DURABLE queue (src/diffusion/), which has its own depth, its own
 * dispatcher and its own budget; a lane here that no call site can reach would
 * publish a permanently-zero row on /api/v1/counters and read as coverage that
 * does not exist. If in-process publication work is ever submitted here, the
 * lane is added WITH its call site, in the same change.
 */
export type JobLane = 'media' | 'transcription' | 'rag' | 'maintenance';

/** Every lane, in the order the counters payload publishes them. */
export const JOB_LANES: readonly JobLane[] = [
	'media',
	'transcription',
	'rag',
	'maintenance',
] as const;

/** Per-lane {active, queued, max} — the in-process twin of the diffusion depth. */
export interface JobLaneDepth {
	active: number;
	queued: number;
	max: number;
}

/**
 * How long after a deadline abort a still-unsettled worker counts as HOLDING its
 * lane. Generous: a cooperative worker checks its signal at loop boundaries, and
 * a boundary can legitimately be a minute wide.
 */
const JOB_DEADLINE_SETTLE_GRACE_MS = 60_000;

/**
 * PER-LANE SLOT BUDGETS (the shipped defaults; every one is an operator key).
 *
 *  media 3         two heavy transcodes + one CPU-bound image/OCR — the historical
 *                  DEDALO_MEDIA_JOB_CONCURRENCY default, unchanged.
 *  transcription 2 sidecar-bound, so slots are cheap; two keeps a long interview
 *                  from blocking a short one.
 *  rag 2           embedding batches against the vector store.
 *  maintenance 2   the operator's own work. Two, not one: an import must not be
 *                  unable to start because a cache rebuild is running — that is
 *                  the starvation, one lane deeper.
 */
const DEFAULT_LANE_BUDGETS: Record<JobLane, number> = {
	media: 3,
	transcription: 2,
	rag: 2,
	maintenance: 2,
};

/**
 * PER-LANE DEADLINE DEFAULTS in ms (0 = none; every one is an operator key).
 *
 *  media 0         NO deadline by default. A 4-hour master transcode is
 *                  legitimate work and killing it would be the defect, not the
 *                  guard. An installation that knows its own ceiling sets one.
 *  transcription 4h a batch longer than this is a wedged sidecar, not an interview.
 *  rag 1h          an embedding pass over one group.
 *  maintenance 6h  generous enough for a full cache rebuild or a large import;
 *                  a code update is minutes.
 */
const DEFAULT_LANE_DEADLINES_MS: Record<JobLane, number> = {
	media: 0,
	transcription: 4 * 60 * 60 * 1000,
	rag: 60 * 60 * 1000,
	maintenance: 6 * 60 * 60 * 1000,
};

/** Read a lane budget from its operator key, falling back to the shipped default. */
function laneBudgetFromEnv(key: string, lane: JobLane): number {
	return Number(readString(key)) || DEFAULT_LANE_BUDGETS[lane];
}

/**
 * Read a lane deadline from its operator key (SECONDS on the wire, ms inside).
 * An explicit `0` means "no deadline" and must survive, so the empty/absent case
 * is distinguished from the zero case rather than collapsed by `||`.
 */
function laneDeadlineFromEnv(key: string, lane: JobLane): number {
	const raw = readString(key).trim();
	if (raw === '') return DEFAULT_LANE_DEADLINES_MS[lane];
	const seconds = Number(raw);
	if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_LANE_DEADLINES_MS[lane];
	return Math.trunc(seconds) * 1000;
}

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
	/**
	 * The work class this job draws its slot from — DECLARED at the submit site.
	 * Stamped on the record (and its pfile) so a lane census and a post-mortem can
	 * both answer "which budget was this job spending?" without re-deriving it
	 * from the kind string.
	 */
	lane: JobLane;
	/**
	 * The job's wall-clock budget in ms, measured from RUN START. 0 = no deadline
	 * (the `media` lane's default: a legitimate master transcode is hours long).
	 */
	deadline_ms: number;
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

/**
 * Is this status a LIVE one? The `queued || running` pair was written out at five
 * sites and read as a two-branch test at each; one named predicate is the same
 * rule once, and it is the rule the terminal transition, the reconcile and the
 * frame all have to agree on.
 */
function isLiveStatus(status: JobStatus): boolean {
	return status === 'queued' || status === 'running';
}

/** The client status frame for an already-resolved record (no reconcile read). */
function frameOf(record: JobRecord): JobStatusFrame {
	return {
		pid: record.pid,
		pfile: jobFilePath(record.id),
		is_running: isLiveStatus(record.status),
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
	if (!isLiveStatus(record.status)) return false;
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
/**
 * One per-lane number map: the caller's overrides over the shipped defaults, each
 * truncated and floored. Shared by the budget and the deadline maps — the same
 * resolution written twice inside the constructor is the same rule with two
 * chances to drift.
 */
function resolveLaneMap(
	overrides: Partial<Record<JobLane, number>> | undefined,
	defaults: Record<JobLane, number>,
	floor: number,
): Record<JobLane, number> {
	const resolved = {} as Record<JobLane, number>;
	for (const lane of JOB_LANES) {
		resolved[lane] = Math.max(floor, Math.trunc(overrides?.[lane] ?? defaults[lane]));
	}
	return resolved;
}

/** Construction options: per-lane budgets/deadlines and the injectable clock. */
export interface MediaJobManagerOptions {
	budgets?: Partial<Record<JobLane, number>>;
	/** Per-lane deadline in ms; 0 disables. Per-submit override: `JobSubmitMeta.deadlineMs`. */
	deadlinesMs?: Partial<Record<JobLane, number>>;
	clock?: () => number;
}

/** What a submit site must declare. `lane` is REQUIRED — see `submit`. */
export interface JobSubmitMeta {
	/** The work class. Explicit at the call site; never inferred from `kind`. */
	lane: JobLane;
	userId?: number;
	target?: JobTarget;
	/** Override the lane's default deadline for THIS job (ms; 0 = none). */
	deadlineMs?: number;
}

export class MediaJobManager {
	private readonly registry = new Map<string, JobRecord>();
	private readonly controllers = new Map<string, AbortController>();
	/** Per-lane budget (slots) and per-lane deadline (ms, 0 = none). */
	private readonly budgets: Record<JobLane, number>;
	private readonly deadlinesMs: Record<JobLane, number>;
	/** Per-lane occupancy: `active` slots taken, `queue` of waiters for a free one. */
	private readonly lanes = {} as Record<JobLane, { active: number; queue: (() => void)[] }>;
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
	/** Armed deadline timers by job id — cleared on every settle. */
	private readonly deadlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(options: MediaJobManagerOptions = {}) {
		this.budgets = resolveLaneMap(options.budgets, DEFAULT_LANE_BUDGETS, 1);
		this.deadlinesMs = resolveLaneMap(options.deadlinesMs, DEFAULT_LANE_DEADLINES_MS, 0);
		for (const lane of JOB_LANES) this.lanes[lane] = { active: 0, queue: [] };
		this.clock = options.clock ?? (() => Math.round(globalThis.performance.now()));
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

	/** Acquire a slot IN ONE LANE (resolves when that lane has a free one). */
	private acquire(lane: JobLane): Promise<void> {
		const state = this.lanes[lane];
		if (state.active < this.budgets[lane]) {
			state.active += 1;
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => state.queue.push(resolve));
	}

	/** Release a slot in one lane and start the next job WAITING ON THAT LANE. */
	private release(lane: JobLane): void {
		const state = this.lanes[lane];
		state.active -= 1;
		const next = state.queue.shift();
		if (next) {
			state.active += 1;
			next();
		}
	}

	/**
	 * Per-lane {active, queued, max} — what /api/v1/counters publishes. The
	 * in-process twin of the diffusion queue's depth: a boolean "has headroom"
	 * could not tell an operator WHICH work is backed up, which is the only
	 * question worth asking of a saturated box.
	 */
	laneDepths(): Record<JobLane, JobLaneDepth> {
		const depths = {} as Record<JobLane, JobLaneDepth>;
		for (const lane of JOB_LANES) {
			depths[lane] = {
				active: this.lanes[lane].active,
				queued: this.lanes[lane].queue.length,
				max: this.budgets[lane],
			};
		}
		return depths;
	}

	/**
	 * Submit a job. Returns the record immediately (status 'queued'); the worker
	 * runs under the concurrency cap OF ITS LANE. Poll `status(id)` for
	 * progress/completion. `meta.userId` stamps the owner — REQUIRED for any job
	 * whose payload is user data, because the status stream authorizes the poll
	 * against it. `meta.lane` is REQUIRED and has no default: a lane that could be
	 * omitted would be a lane inferred, and an inferred class is how a new job
	 * silently spends another kind of work's budget.
	 */
	submit(kind: string, worker: JobWorker, meta: JobSubmitMeta): JobRecord {
		const id = this.nextId(kind);
		const now = this.clock();
		const record: JobRecord = {
			id,
			kind,
			lane: meta.lane,
			deadline_ms: Math.max(0, Math.trunc(meta.deadlineMs ?? this.deadlinesMs[meta.lane])),
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
		await this.acquire(record.lane);
		if (controller.signal.aborted) {
			this.finish(record, 'stopped');
			this.release(record.lane);
			return;
		}
		record.status = 'running';
		record.updatedAt = this.clock();
		this.commit(record);
		// THE DEADLINE IS ARMED HERE, not at submit: a job that waited behind a full
		// lane must not be killed for having waited (the clock decision, header).
		this.armDeadline(record, controller);
		try {
			const result = await this.runWorker(record, controller, worker, {
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
			this.clearDeadline(record.id);
			this.release(record.lane);
		}
	}

	/**
	 * Run the worker INSIDE the job's cancellation scope (media/job_scope.ts), so
	 * an awaited outbound call three frames down aborts with the job instead of
	 * outliving it holding a socket. The scope is opened here, once, rather than
	 * threaded through every provider signature.
	 */
	private runWorker(
		_record: JobRecord,
		controller: AbortController,
		worker: JobWorker,
		ctx: Parameters<JobWorker>[0],
	): Promise<unknown> {
		return runWithJobSignal(controller.signal, () => worker(ctx));
	}

	/**
	 * Arm the per-job deadline. On expiry: abort (which cancels awaited outbound
	 * work through the ambient scope) and mark the record terminal — but do NOT
	 * release the lane slot, which stays held until the worker actually settles.
	 * A worker still unsettled after the grace bumps `job_deadline_lane_held`.
	 */
	private armDeadline(record: JobRecord, controller: AbortController): void {
		if (record.deadline_ms <= 0) return;
		const timer = setTimeout(() => {
			this.deadlineTimers.delete(record.id);
			if (!isLiveStatus(record.status)) return;
			incrementCounter('job_deadline_fired');
			record.errors.push(
				`deadline: exceeded ${record.deadline_ms} ms in lane '${record.lane}' — aborted`,
			);
			controller.abort();
			this.finish(record, 'stopped');
			console.error(
				`[media jobs] job ${record.id} (${record.kind}, lane ${record.lane}) exceeded its ${record.deadline_ms} ms deadline — aborted`,
			);
			const grace = setTimeout(() => {
				// The worker never settled: its lane slot is STILL held. Say so.
				incrementCounter('job_deadline_lane_held');
				console.error(
					`[media jobs] job ${record.id} still holds a '${record.lane}' slot ${JOB_DEADLINE_SETTLE_GRACE_MS} ms after its deadline abort`,
				);
			}, JOB_DEADLINE_SETTLE_GRACE_MS);
			unrefTimer(grace);
			this.deadlineTimers.set(`${record.id}::grace`, grace);
		}, record.deadline_ms);
		unrefTimer(timer);
		this.deadlineTimers.set(record.id, timer);
	}

	/** Disarm a job's deadline (and its held-lane grace) — called on every settle. */
	private clearDeadline(id: string): void {
		for (const key of [id, `${id}::grace`]) {
			const timer = this.deadlineTimers.get(key);
			if (timer !== undefined) {
				clearTimeout(timer);
				this.deadlineTimers.delete(key);
			}
		}
	}

	private finish(record: JobRecord, status: JobStatus): void {
		// IDEMPOTENT. A deadline finishes the record the moment it fires; the worker
		// settles afterwards and calls in again. The FIRST terminal transition is
		// the true one — a second would overwrite 'stopped' with 'error' (the abort
		// exception) and tell the operator the wrong story about why the job ended.
		if (!isLiveStatus(record.status)) return;
		this.clearDeadline(record.id);
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
		// `unrefTimer` (the shared helper the deadline timers use) instead of an
		// inlined `typeof … .unref` test: the same guard written twice is the same
		// rule with two chances to drift.
		unrefTimer(setTimeout(() => this.registry.delete(record.id), TERMINAL_EVICT_AFTER_MS));
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
			if (!isLiveStatus(record.status)) continue;
			this.controllers.get(record.id)?.abort();
			this.clearDeadline(record.id);
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

	/**
	 * Whether a slot is free in ONE lane (PHP get_server_ready_status equivalent).
	 * Defaults to `media` — the lane that question was always about — rather than
	 * to "any lane", which would answer true while the asked-about work is queued.
	 */
	hasHeadroom(lane: JobLane = 'media'): boolean {
		return this.lanes[lane].active < this.budgets[lane];
	}
}

/** `unref` a timer when the runtime supports it (a job timer must not hold the process). */
function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
	if (typeof (timer as { unref?: () => void }).unref === 'function') {
		(timer as unknown as { unref: () => void }).unref();
	}
}

/** The process-wide media job manager (single instance per server). */
export const mediaJobs = new MediaJobManager({
	budgets: {
		// readEnv, NOT process.env: keeps ../private/.env — the documented config
		// home — working for these keys (audit S2-21; the runtime-reproduced trap).
		// DEDALO_MEDIA_JOB_CONCURRENCY is UNCHANGED and un-renamed: it was always
		// the media budget, and it keeps being exactly that.
		media: laneBudgetFromEnv('DEDALO_MEDIA_JOB_CONCURRENCY', 'media'),
		transcription: laneBudgetFromEnv('DEDALO_JOB_LANE_TRANSCRIPTION_CONCURRENCY', 'transcription'),
		rag: laneBudgetFromEnv('DEDALO_JOB_LANE_RAG_CONCURRENCY', 'rag'),
		maintenance: laneBudgetFromEnv('DEDALO_JOB_LANE_MAINTENANCE_CONCURRENCY', 'maintenance'),
	},
	deadlinesMs: {
		media: laneDeadlineFromEnv('DEDALO_JOB_DEADLINE_MEDIA_S', 'media'),
		transcription: laneDeadlineFromEnv('DEDALO_JOB_DEADLINE_TRANSCRIPTION_S', 'transcription'),
		rag: laneDeadlineFromEnv('DEDALO_JOB_DEADLINE_RAG_S', 'rag'),
		maintenance: laneDeadlineFromEnv('DEDALO_JOB_DEADLINE_MAINTENANCE_S', 'maintenance'),
	},
});
