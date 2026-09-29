/**
 * Politeness: one request at a time per ORIGIN, at least an interval apart.
 *
 * An origin is scheme + host + port (`https://www.example.org`) — so
 * `example.org` and `www.example.org` are paced separately, as they are separate
 * servers as far as anyone can tell. The caller keys it with `siteKey`
 * (`follow.ts`), which drops a host's trailing root dot: `example.org.` is the
 * same server as `example.org`, and must not get a queue of its own. Shared across every user and job on
 * purpose: the remote site sees one Dédalo, so the pace is the installation's,
 * not the request's.
 *
 * STRICTLY SERIAL. Each caller takes a place in a per-origin queue (a promise
 * chain) before it looks at the clock, and HOLDS its turn until its request has
 * finished (`acquireTurn` returns the `done` that releases it). So two jobs cannot
 * both read "the last request was long ago" and fire together — the check-then-act
 * race a `lastRequestAt` map has across its `await` — and a slow site is never
 * sent a second request while the first is still being answered. The interval
 * runs from the END of one request to the start of the next. Each redirect hop is
 * a request of its own, and takes its own turn.
 *
 * THE INTERVAL IS CLAMPED: never below `MIN_INTERVAL_MS` (a `Crawl-delay: 0`
 * cannot make us faster than our own floor) and never above `MAX_INTERVAL_MS` (a
 * hostile `Crawl-delay: 86400` — or `Retry-After` — cannot park a background lane
 * for a day). A request that answered 429/503 with `Retry-After` hands that wait
 * to `done`, and the NEXT caller on the origin waits for it (clamped the same).
 *
 * The waits honour the running job's signal (media/job_scope.ts): a stopped job
 * leaves the queue or its pause at once, and its place still releases the next
 * caller — never before the caller ahead of it has finished.
 */

import { currentJobSignal } from '../media/job_scope.ts';
import { jobStoppedError, untilJobStopped } from './abort.ts';

/** Our own floor between two requests to one origin. */
export const MIN_INTERVAL_MS = 3_000;
/** The ceiling a site's Crawl-delay or Retry-After is clamped to. */
export const MAX_INTERVAL_MS = 60_000;

/**
 * The interval for a site that asked for `crawlDelayMs` (null: it did not ask).
 * NaN also means "did not ask" — it would turn every later comparison false, i.e.
 * no pace at all. An infinite value is an ask like any other and is CLAMPED: a
 * `Crawl-delay` of 400 nines overflows to Infinity, and a site that asked for the
 * slowest pace must get our slowest (`MAX_INTERVAL_MS`), never our fastest.
 */
export function paceInterval(crawlDelayMs: number | null): number {
	const asked = crawlDelayMs === null || Number.isNaN(crawlDelayMs) ? 0 : crawlDelayMs;
	return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, asked));
}

interface OriginPace {
	/** Resolves when the previous caller has finished its request. */
	tail: Promise<void>;
	/** Earliest time the next request may go. */
	nextAt: number;
	/** Callers queued, waiting, or holding the turn on this origin. */
	waiting: number;
}

/**
 * Per-origin queue state. NOT a content cache — a serialization primitive (the
 * external/transport.ts concurrencySlots precedent). Lifecycle: SELF-DRAINING —
 * an entry is deleted once nobody waits on it AND its interval has passed, so an
 * idle origin holds nothing; `clearPacingForTests` empties it for test isolation.
 * Keys are an origin, never request identity.
 */
const originPaces = new Map<string, OriginPace>();

/** Injectable clock, sleep and timer. Tests supply them; production supplies none. */
export interface PacingDeps {
	readonly now?: () => number;
	readonly sleep?: (ms: number, signal: AbortSignal | undefined) => Promise<void>;
	/** Schedules the idle-origin drain (a real, unref'd timer by default). */
	readonly setTimer?: (callback: () => void, ms: number) => void;
}

/** Told how long a request will wait before it may start. See `acquireTurn`. */
export type WaitObserver = (ms: number, origin: string) => void;

/**
 * Releases a held turn. `minimumIntervalMs` (a 429/503 `Retry-After`) lengthens
 * the interval before the next request, never past `MAX_INTERVAL_MS`.
 */
export type TurnDone = (minimumIntervalMs?: number) => void;

/** One caller's place in an origin's queue. */
interface QueuePlace {
	readonly origin: string;
	readonly pace: OriginPace;
	/** Settles when the caller ahead has finished. */
	readonly previous: Promise<void>;
	/** Lets the caller behind through. */
	readonly release: () => void;
	/** Was somebody already queued or holding the turn when this place was taken? */
	readonly queued: boolean;
}

/**
 * Sleep that rejects when `signal` aborts. On abort the timer is cleared (it
 * would otherwise hold a closure for up to a minute); the timer is unref'd, so a
 * paced wait never keeps a stopping server alive on its own.
 */
function abortableSleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
	if (signal?.aborted === true) return Promise.reject(jobStoppedError('pace'));
	return new Promise<void>((resolve, reject) => {
		const onAbort = (): void => {
			clearTimeout(timer);
			reject(jobStoppedError('pace'));
		};
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		timer.unref?.();
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

function unrefTimer(callback: () => void, ms: number): void {
	setTimeout(callback, ms).unref?.();
}

/**
 * Wait for this origin's turn and HOLD it. Call the returned `done` when the
 * request has finished (success or failure): it starts the interval and lets the
 * next caller through. A second call is a no-op.
 *
 * `onWait` hears about each wait before it starts: while queued behind another
 * request to the same origin, with the least it can last (this origin's interval —
 * the request ahead must finish first); then, when the pause before this request
 * is known, with that pause.
 */
export async function acquireTurn(
	origin: string,
	intervalMs: number,
	deps: PacingDeps = {},
	onWait?: WaitObserver,
): Promise<TurnDone> {
	const now = deps.now ?? Date.now;
	const signal = currentJobSignal();
	const place = joinQueue(origin);
	if (place.queued) notifyWait(onWait, intervalMs, origin);
	await waitInQueue(place, signal, deps);
	await waitForInterval(place, signal, deps, onWait);
	return turnRelease(place, intervalMs, now, deps);
}

/**
 * Tell the caller's observer about a wait. The observer runs while this caller HOLDS
 * a place in a queue every job on the origin stands behind, so its failure must not
 * escape: a throw here would skip the release and wedge the origin for the life of
 * the process. It is reported and ignored — the wait itself goes on as planned.
 */
function notifyWait(onWait: WaitObserver | undefined, ms: number, origin: string): void {
	try {
		onWait?.(ms, origin);
	} catch (error) {
		console.error('[harvest] onWait observer threw; ignored', origin, error);
	}
}

/** Take the next place in `origin`'s queue (creating the queue if idle). */
function joinQueue(origin: string): QueuePlace {
	const pace = originPaces.get(origin) ?? { tail: Promise.resolve(), nextAt: 0, waiting: 0 };
	originPaces.set(origin, pace);
	const queued = pace.waiting > 0;
	let release = (): void => {};
	const mine = new Promise<void>((resolve) => {
		release = resolve;
	});
	const previous = pace.tail;
	pace.tail = mine;
	pace.waiting++;
	return { origin, pace, previous, release, queued };
}

/** Wait for the caller ahead. A stopped job leaves at once, but its place releases late. */
async function waitInQueue(
	place: QueuePlace,
	signal: AbortSignal | undefined,
	deps: PacingDeps,
): Promise<void> {
	try {
		await untilJobStopped(place.previous, signal, 'queue');
	} catch (error) {
		// Left the queue EARLY (the job was stopped): the place must not let the
		// next caller past the one still ahead of it, so it releases only once that
		// caller has finished.
		void place.previous.then(() => finishTurn(place, deps));
		throw error;
	}
}

/** Sleep out the origin's interval, if it has not passed yet. */
async function waitForInterval(
	place: QueuePlace,
	signal: AbortSignal | undefined,
	deps: PacingDeps,
	onWait: WaitObserver | undefined,
): Promise<void> {
	const wait = place.pace.nextAt - (deps.now ?? Date.now)();
	if (!(wait > 0)) return;
	notifyWait(onWait, wait, place.origin);
	try {
		await (deps.sleep ?? abortableSleep)(wait, signal);
	} catch (error) {
		finishTurn(place, deps);
		throw error;
	}
}

/** The held turn's release: sets the next start, then lets the next caller through. Once. */
function turnRelease(
	place: QueuePlace,
	intervalMs: number,
	now: () => number,
	deps: PacingDeps,
): TurnDone {
	let finished = false;
	return (minimumIntervalMs = 0) => {
		if (finished) return;
		finished = true;
		const asked = Number.isFinite(minimumIntervalMs) ? minimumIntervalMs : 0;
		place.pace.nextAt = now() + Math.min(MAX_INTERVAL_MS, Math.max(intervalMs, asked));
		finishTurn(place, deps);
	};
}

/** Give up a place in the queue: count it out, wake the next caller, maybe drain. */
function finishTurn(place: QueuePlace, deps: PacingDeps): void {
	place.pace.waiting--;
	place.release();
	scheduleDrain(place.origin, place.pace, deps);
}

/** Forget an origin once it is idle and its interval has run out. */
function scheduleDrain(origin: string, pace: OriginPace, deps: PacingDeps): void {
	const now = deps.now ?? Date.now;
	const setTimer = deps.setTimer ?? unrefTimer;
	setTimer(() => drainIfIdle(origin, pace, deps), Math.max(0, pace.nextAt - now()));
}

/**
 * Delete an idle origin whose interval is over. A caller still on it schedules
 * its own drain when it finishes; a timer that fired early re-arms itself, so an
 * idle entry can never be stranded.
 */
function drainIfIdle(origin: string, pace: OriginPace, deps: PacingDeps): void {
	if (pace.waiting > 0 || originPaces.get(origin) !== pace) return;
	if (pace.nextAt > (deps.now ?? Date.now)()) {
		scheduleDrain(origin, pace, deps);
		return;
	}
	originPaces.delete(origin);
}

/** Origins currently tracked — observability for the gates. */
export function trackedOrigins(): number {
	return originPaces.size;
}

/**
 * Forget every origin's pace — TEST ISOLATION ONLY (a gate must not inherit the
 * previous gate's `nextAt`). A waiter already queued keeps its own place.
 */
export function clearPacingForTests(): void {
	originPaces.clear();
}
