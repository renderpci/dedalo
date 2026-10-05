/**
 * MEDIA COPY WORKER (PUBLICATION_HOST_SPEC §5.2, decisions M3/M4): the in-process,
 * per-host SERIALIZED lane between the pub/ transition seam (and every other copy
 * caller) and the copy apply.
 *
 *  - Unpublish (`published:false`) is flushed on the next microtask, to every host,
 *    twice: into the queued sync (withdraw-only pass first, then the plan deletes the
 *    files), AND into the host's PRE-EMPT set, which the round already running there
 *    drains before its next unit (media_copy_apply.ts ApplyOptions.takeWithdrawn). So the
 *    agent marker drops at the next unit boundary — at most one in-flight put (bounded by
 *    MEDIA_PUT_TIMEOUT_MS) — never only after the whole round (M2: the first command the
 *    lane can send). Publish is debounced (PUBLISH_DEBOUNCE_MS): one planning walk.
 *  - Per host: ONE run at a time, and at most ONE queued sync, which absorbs every
 *    transition arriving meanwhile (its withdrawn keys merge). Hosts never wait on
 *    each other. A failed run is logged; the lane goes on.
 *  - ONE LANE FOR EVERY CALLER: `exclusive(host, work)` / `inMediaCopyLane` chain
 *    arbitrary work (the media_copy reconcile's plan → apply → re-plan, the widget's
 *    round) onto the same tail, so no caller applies a stale plan beside a hook run.
 *  - In-process only: a long AV transfer must not hold a diffusion runner slot.
 *    Cross-process ordering is the advisory target lock each unit takes
 *    (media_copy_apply.ts, `media:<host>`).
 *  - DETACHED FROM THE WRITER'S TRANSACTION. A flip is emitted from inside a marker
 *    writer's transaction (a runner batch's fenced unit, the fenced media_index
 *    reconcile), and a timer or microtask scheduled there inherits its async context.
 *    A run is background work that outlives that writer (its handle expires at COMMIT),
 *    so the sink and every queued run leave the transaction context
 *    (runDetachedFromTransaction) — a run never joins, or outlives, a batch's
 *    transaction. So does every `exclusive` / `inMediaCopyLane` unit, worker or not.
 *
 * Correctness does not depend on this worker: the media_copy reconcile recomputes
 * from ground truth whatever it missed (a registry it could not read, a crash).
 * Lanes and queues are INSTANCE state; the one module binding is `activeWorker`.
 */

import { runDetachedFromTransaction } from '../../../core/db/postgres.ts';
import { DedaloError } from '../../../core/errors/index.ts';
import { isAgentMarkerKey } from '../../../core/publication_host/agent_client.ts';
import { registerMediaCopySink } from './media_copy.ts';
import type { CopyApplyReport } from './media_copy_apply.ts';

export const PUBLISH_DEBOUNCE_MS = 2_000;

export interface MediaCopyWorkerDeps {
	/** Every registry host name (copy mode is decided per run by syncHost). */
	listHosts(): string[];
	/**
	 * One run for one host (media_copy.ts syncHost). `takeWithdrawn` drains the keys
	 * withdrawn while the run is in flight (the run pre-empts its units with them).
	 */
	syncHost(
		host: string,
		withdrawnKeys: readonly string[],
		takeWithdrawn: () => readonly string[],
	): Promise<CopyApplyReport | null>;
	publishDebounceMs: number;
	/** Told after every run that produced a report (the phase-6 probe trigger). */
	afterSync?(host: string, report: CopyApplyReport): void;
}

interface QueuedRun {
	keys: Set<string>;
	done: Promise<CopyApplyReport | null>;
}

interface HostLane {
	tail: Promise<void>;
	queued: QueuedRun | null;
	/** Keys withdrawn since the running unit began: drained by it between its units. */
	preempt: Set<string>;
}

/** What a lane unit drains to pre-empt itself with the keys withdrawn meanwhile. */
export type TakeWithdrawn = () => readonly string[];

export class MediaCopyWorker {
	private readonly lanes = new Map<string, HostLane>();
	private readonly withdrawn = new Set<string>();
	private publishTimer: ReturnType<typeof setTimeout> | null = null;
	private flushScheduled = false;
	private stopped = false;
	private readonly deps: MediaCopyWorkerDeps;

	constructor(deps: MediaCopyWorkerDeps) {
		this.deps = deps;
	}

	/**
	 * A pub/ flip from the seam. Never throws, only enqueues. An unpublished key outside the
	 * agent's marker grammar is dropped (logged): the agent can hold no marker for it, so
	 * there is nothing to withdraw — and media.mark would refuse it inside the batch.
	 */
	notify(key: string, published: boolean): void {
		if (this.stopped) return;
		if (published) {
			this.armPublishTimer();
			return;
		}
		if (!isAgentMarkerKey(key)) {
			console.error(
				`[media_copy] unpublished key ${JSON.stringify(key)} is outside the agent marker grammar: nothing to withdraw (dropped)`,
			);
			return;
		}
		this.withdrawn.add(key);
		this.scheduleFlush();
	}

	/** One run for `host` (joins the queued one when there is one). */
	sync(host: string): Promise<CopyApplyReport | null> {
		return this.enqueue(host, []);
	}

	/**
	 * Run `work` in `host`'s lane: after everything already queued there, before anything
	 * later. `work` gets the lane's pre-empt drain (pass it to applyCopy's takeWithdrawn).
	 */
	exclusive<T>(host: string, work: (takeWithdrawn: TakeWithdrawn) => Promise<T>): Promise<T> {
		const lane = this.lane(host);
		// Detached: a caller inside a transaction must not lend it to the lane's units.
		const done = lane.tail.then(() =>
			runDetachedFromTransaction(() => work(() => this.drain(lane))),
		);
		this.advance(host, lane, done);
		return done;
	}

	/** Resolves once nothing is queued, running or about to be flushed (gates, shutdown). */
	async idle(): Promise<void> {
		for (;;) {
			if (this.lanes.size > 0) await Promise.all([...this.lanes.values()].map((lane) => lane.tail));
			else if (this.flushScheduled || this.publishTimer !== null) await Bun.sleep(1);
			else return;
		}
	}

	stop(): void {
		this.stopped = true;
		this.withdrawn.clear();
		this.clearPublishTimer();
	}

	private armPublishTimer(): void {
		if (this.publishTimer !== null) return;
		this.publishTimer = setTimeout(() => this.flush(), this.deps.publishDebounceMs);
		this.publishTimer.unref?.();
	}

	private clearPublishTimer(): void {
		if (this.publishTimer === null) return;
		clearTimeout(this.publishTimer);
		this.publishTimer = null;
	}

	private scheduleFlush(): void {
		if (this.flushScheduled) return;
		this.flushScheduled = true;
		queueMicrotask(() => this.flush());
	}

	private flush(): void {
		this.flushScheduled = false;
		this.clearPublishTimer();
		const keys = [...this.withdrawn];
		this.withdrawn.clear();
		if (this.stopped) return;
		for (const host of this.hostsOrNone()) {
			for (const key of keys) this.lane(host).preempt.add(key);
			this.enqueue(host, keys).catch((error) => {
				console.error(
					`[media_copy] ${host}: sync failed (the media_copy reconcile retries):`,
					error,
				);
			});
		}
	}

	private hostsOrNone(): string[] {
		try {
			return this.deps.listHosts();
		} catch (error) {
			console.error(
				'[media_copy] publication host registry unreadable — pub/ transition not forwarded (the media_copy reconcile retries):',
				error,
			);
			return [];
		}
	}

	private lane(host: string): HostLane {
		const existing = this.lanes.get(host);
		if (existing !== undefined) return existing;
		const created: HostLane = { tail: Promise.resolve(), queued: null, preempt: new Set() };
		this.lanes.set(host, created);
		return created;
	}

	/** Make `done` the lane's new tail; drop the lane once it drains. */
	private advance(host: string, lane: HostLane, done: Promise<unknown>): void {
		const tail = done.then(
			() => undefined,
			() => undefined,
		);
		lane.tail = tail;
		void tail.then(() => {
			if (this.lanes.get(host) === lane && lane.tail === tail) this.lanes.delete(host);
		});
	}

	private enqueue(host: string, keys: readonly string[]): Promise<CopyApplyReport | null> {
		const lane = this.lane(host);
		if (lane.queued !== null) {
			for (const key of keys) lane.queued.keys.add(key);
			return lane.queued.done;
		}
		const run: QueuedRun = { keys: new Set(keys), done: Promise.resolve(null) };
		run.done = lane.tail.then(() =>
			runDetachedFromTransaction(() => this.runQueued(host, lane, run)),
		);
		lane.queued = run;
		this.advance(host, lane, run.done);
		return run.done;
	}

	private async runQueued(
		host: string,
		lane: HostLane,
		run: QueuedRun,
	): Promise<CopyApplyReport | null> {
		if (lane.queued === run) lane.queued = null;
		// Every key pre-empt holds now was merged into this run's keys at the same flush.
		lane.preempt.clear();
		if (this.stopped) return null;
		const report = await this.deps.syncHost(host, [...run.keys], () => this.drain(lane));
		if (report !== null) this.tell(host, report);
		return report;
	}

	private drain(lane: HostLane): string[] {
		const keys = [...lane.preempt];
		lane.preempt.clear();
		return keys;
	}

	private tell(host: string, report: CopyApplyReport): void {
		try {
			this.deps.afterSync?.(host, report);
		} catch (error) {
			console.error(`[media_copy] ${host}: afterSync listener failed:`, error);
		}
	}
}

// The one started worker (module_state_tripwire LET row): boot wiring set by
// startMediaCopyWorker and cleared by its stop — never request identity.
let activeWorker: MediaCopyWorker | null = null;

/** Start THE worker and hook it to the pub/ seam. Returns its stop (shutdown drain). */
export function startMediaCopyWorker(deps: MediaCopyWorkerDeps): () => void {
	if (activeWorker !== null) {
		throw new DedaloError('internal.invariant', { message: 'media copy worker started twice' });
	}
	const worker = new MediaCopyWorker(deps);
	// Detached: the flip may come from inside a writer's transaction (see the header).
	const unregister = registerMediaCopySink((key, published) =>
		runDetachedFromTransaction(() => worker.notify(key, published)),
	);
	activeWorker = worker;
	return () => {
		unregister();
		worker.stop();
		if (activeWorker === worker) activeWorker = null;
	};
}

/** The started worker, or null (a CLI process, a disabled scheduler). */
export function activeMediaCopyWorker(): MediaCopyWorker | null {
	return activeWorker;
}

/**
 * Run a copy round for `host` in THE host lane: through the started worker when there
 * is one (serialized with the hook's runs), else directly (a CLI process — the advisory
 * lock orders it against the server). Never call it from inside a lane run (syncHost):
 * that would wait on itself.
 */
export function inMediaCopyLane<T>(
	host: string,
	work: (takeWithdrawn: TakeWithdrawn) => Promise<T>,
): Promise<T> {
	return activeWorker === null
		? runDetachedFromTransaction(() => work(() => []))
		: activeWorker.exclusive(host, work);
}
