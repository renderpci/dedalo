/**
 * MEDIA INGEST EVENT — the "a record's media just changed on disk" seam.
 *
 * Why this exists at all: an upload does NOT go through the record save path.
 * `persistUploadedMedia` writes `files_info` with a direct per-key jsonb write —
 * deliberately, since files_info is a filesystem-derived cache and not
 * authoritative history — so it fires no save event and leaves no Time Machine
 * entry. Anything that must react to new media (the RAG image index) therefore
 * has nothing to listen to unless this event exists.
 *
 * SHAPE: the same inversion `section_record/save_event.ts` uses for record
 * saves — a nullable module-level hook, registered once at boot by the
 * subsystem that cares, fired best-effort by the low-level chokepoint. Core
 * never imports the subsystem; the subsystem registers itself.
 *
 * IDENTITY IS EXPLICIT, NEVER AMBIENT. The multipart upload branch bypasses
 * `dispatchRqo`, so the request-scoped principal/language stores are not open
 * on every path that reaches here (the MCP media tool has none either). A
 * listener must therefore treat this event as its whole world and never reach
 * for `currentPrincipal()` / `currentDataLang()`.
 *
 * BEST-EFFORT: a listener that throws is logged and swallowed. Indexing must
 * never be able to fail somebody's upload.
 */

/** One media component of one record whose files just changed. */
export interface MediaIngestEvent {
	componentTipo: string;
	sectionTipo: string;
	sectionId: number;
	/** The media model (`component_image`, `component_av`, …). */
	model: string;
}

export type MediaIngestHook = (event: MediaIngestEvent) => Promise<void> | void;

let mediaIngestHook: MediaIngestHook | null = null;

/** Register (or clear, with null) the single media-ingest listener. */
export function registerMediaIngestHook(hook: MediaIngestHook | null): void {
	mediaIngestHook = hook;
}

/**
 * Fire the event. Never throws, never rejects: a downstream indexing failure is
 * a logged warning, not a failed upload.
 */
export async function fireMediaIngestEvent(event: MediaIngestEvent): Promise<void> {
	if (mediaIngestHook === null) return;
	try {
		await mediaIngestHook(event);
	} catch (error) {
		console.warn(
			`[media_ingest] hook failed for ${event.sectionTipo}/${event.sectionId} (${event.componentTipo}): ${String(error)}`,
		);
	}
}
