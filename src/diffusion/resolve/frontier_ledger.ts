/**
 * THE FRONTIER LEDGER — the relation frontier of a publication run as an
 * event stream, and its replay (DIFF-1). Pure: no SQL, no I/O.
 *
 * A run's resumable state is not its primary keyset cursor alone. The
 * resolver (resolve/resolver.ts) also holds, in memory:
 *   - the FRONTIER: `${level}:${section_tipo}` → the ids queued for top-level
 *     publication by the records already processed, drained FIFO after the
 *     primaries (PHP $datum_unresolved);
 *   - the USED set: `${section_tipo}:${section_id}` of every record already
 *     emitted (PHP is_used).
 * No queue-time PUBLISHABLE decision is part of it: the drain asks the live
 * publication gate (resolver.ts enqueueFrontier — a replayed snapshot of that
 * gate could only fail open, days later, across a resume).
 * Every change to them is emitted as a RunLedgerEvent — only when the state
 * actually changes — and travels with the batch that caused it
 * (ResolvedBatch.ledger); the runner appends a batch's events to the job's run
 * ledger in the batch's own transaction (jobs/run_ledger.ts). `replayFrontier`
 * folds the committed events back into exactly the state the resolver held
 * after the last committed batch — which is what a resumed run starts from.
 *
 * The fold does not depend on the resolver draining breadth-first: it replays
 * the Map/Set operations themselves (a key re-queued after it was opened goes
 * to the TAIL, exactly like `Map.delete` + `Map.set`), so a different drain
 * order stays correctly replayed — PROVIDED the resolver emits `open` when it
 * takes a key off the frontier (resolver.ts). Under today's level-ordered BFS
 * a missing `open` would still replay to the right drain by coincidence, so
 * the emission is gated on its own: diffusion_frontier_replay (b2).
 */

/** One run-state transition of the resolver (camelCase; the ledger stores snake_case). */
export interface RunLedgerEvent {
	/**
	 * `queue` — `sectionId` was added to frontier key `${level}:${sectionTipo}`;
	 * `open`  — the key `${level}:${sectionTipo}` was taken off the frontier to
	 *           be drained (its ids are the DRAINING set until the next open);
	 * `used`  — `${sectionTipo}:${sectionId}` was emitted (or dropped) this run.
	 */
	kind: 'queue' | 'open' | 'used';
	level?: number;
	sectionTipo: string;
	sectionId?: number | string;
}

/** The resolver state a resumed run starts from (ResolveOptions.resume). */
export interface ResumeState {
	/** `${level}:${sectionTipo}` → queued ids, in FIFO key order. */
	frontier: Map<string, Set<number | string>>;
	/** `${sectionTipo}:${sectionId}` of every record already used. */
	used: Set<string>;
	/**
	 * The key that was being drained when the run stopped (its ids as queued
	 * at open; the ones not in `used` are the remainder to drain FIRST), or
	 * null when no drain had started.
	 */
	draining: { level: number; sectionTipo: string; ids: (number | string)[] } | null;
}

/** The frontier key grammar (resolver.ts shares it). */
export function frontierKey(level: number, sectionTipo: string): string {
	return `${level}:${sectionTipo}`;
}

/** The used-set key grammar (resolver.ts RECORD_KEY). */
export function recordKey(sectionTipo: string, sectionId: number | string): string {
	return `${sectionTipo}:${sectionId}`;
}

/** An empty resume state. */
export function emptyResumeState(): ResumeState {
	return { frontier: new Map(), used: new Set(), draining: null };
}

/** Fold one event into `state` (the reducer). */
export function applyFrontierEvent(state: ResumeState, event: RunLedgerEvent): void {
	switch (event.kind) {
		case 'queue': {
			const level = Number(event.level);
			const sectionId = event.sectionId as number | string;
			const key = frontierKey(level, event.sectionTipo);
			const bucket = state.frontier.get(key);
			if (bucket === undefined) state.frontier.set(key, new Set([sectionId]));
			else bucket.add(sectionId);
			return;
		}
		case 'open': {
			const level = Number(event.level);
			const key = frontierKey(level, event.sectionTipo);
			const ids = [...(state.frontier.get(key) ?? [])];
			state.frontier.delete(key);
			state.draining = { level, sectionTipo: event.sectionTipo, ids };
			return;
		}
		case 'used':
			state.used.add(recordKey(event.sectionTipo, event.sectionId as number | string));
			return;
	}
}

/** Replay a committed event stream (ledger order) into the resolver state. */
export async function replayFrontier(
	events: AsyncIterable<RunLedgerEvent> | Iterable<RunLedgerEvent>,
): Promise<ResumeState> {
	const state = emptyResumeState();
	for await (const event of events) applyFrontierEvent(state, event);
	return state;
}
