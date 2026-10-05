/**
 * pub/ TRANSITION SEAM (PUBLICATION_HOST_SPEC §5.2, decision M3): the marker
 * store (media_index.ts) calls `emitPubTransition(key, published)` whenever
 * `pub/<key>` really flips — the gate's own decision changed. The media-copy
 * worker registers here (through media_copy.ts `registerMediaCopySink`) to
 * forward the flip to every copy-mode publication host: LATENCY. Correctness is
 * the media_copy reconcile, which recomputes from ground truth whatever a sink
 * missed.
 *
 * A LEAF on purpose: media_index.ts and media_copy.ts both import it, never each
 * other's values in a cycle (import_scc_tripwire).
 *
 * Best-effort by contract: a sink runs synchronously and must only enqueue; a
 * sink that throws is logged and never fails the marker write that fired it
 * (marker failures must never fail a publication — media_index.ts header). A
 * flip may be emitted from inside a writer's transaction (a runner batch, the
 * fenced reconcile): a sink that schedules work must detach it from that
 * transaction (media_copy_worker.ts does).
 */

export type PubTransitionSink = (key: string, published: boolean) => void;

// Boot-registered sinks (module_state_tripwire MAPSET row): process wiring added
// at boot and removed by the returned unregister (shutdown, tests) — never
// request identity.
const sinks = new Set<PubTransitionSink>();

/** Register a sink; the returned function removes it. */
export function registerPubTransitionSink(sink: PubTransitionSink): () => void {
	sinks.add(sink);
	return () => {
		sinks.delete(sink);
	};
}

/** Tell every sink that `pub/<key>` flipped. Never throws. */
export function emitPubTransition(key: string, published: boolean): void {
	for (const sink of sinks) {
		try {
			sink(key, published);
		} catch (error) {
			console.error(`[media_copy] pub/ transition sink failed for ${key}:`, error);
		}
	}
}
