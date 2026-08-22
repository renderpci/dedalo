/**
 * RAG bootstrap — wires the save/delete seam to the deferred index queue
 * (Brick 3). Called once from startServer().
 *
 * When DEDALO_RAG_ENABLED is on, every record write/delete fires
 * `fireRagRecordEvent` (record_write.ts) → this hook → best-effort enqueue into
 * the matrix-DB `rag_index_queue`. Actual embedding happens later, off the save
 * path, when the drain CLI (cli/rag_drain.ts) runs. When RAG is off, the hook is
 * cleared so writes stay zero-cost.
 *
 * The hook is registered SYNCHRONOUSLY (no save-event window is dropped); the
 * queue table is ensured in the background. Enqueue is best-effort: a write
 * during the tiny boot window simply no-ops and that record stays unindexed
 * until its next save — or until the reconcile pass repairs the drift (S2-13:
 * `bun run src/ai/rag/cli/rag_drain.ts --reconcile <section_tipo>` runs
 * indexer.reconcileSection; nothing schedules it automatically).
 */

import { registerMediaIngestHook } from '../../core/media/ingest/ingest_event.ts';
import { registerRagRecordHook } from '../../core/section_record/save_event.ts';
import { defaultMatrixQueryer, ensureRagQueueTable, RagQueue } from './queue.ts';
import { isRagEnabled } from './rag_enabled.ts';

/** Register (or clear) the RAG save/delete hook based on the kill-switch. */
export function initRagHooks(): void {
	if (!isRagEnabled()) {
		registerRagRecordHook(null);
		registerMediaIngestHook(null);
		// The install-level fact is stated HERE, once, to the operator — never to
		// the user: an install that deliberately never implemented RAG must look
		// like a normal install in the client (the capability probe answers
		// `{groups: []}` and the semantic UI simply does not appear, api.ts).
		console.log('[rag] disabled (DEDALO_RAG_ENABLED off) — no indexing, no semantic search');
		return;
	}
	// enqueue-only queue: the save path never indexes (the drain does), so no
	// indexer needs binding here.
	const queue = new RagQueue(defaultMatrixQueryer());
	registerRagRecordHook((event) =>
		queue.enqueue({ sectionTipo: event.sectionTipo, sectionId: event.sectionId }, event.kind),
	);
	// Uploads do not go through the record save path (files_info is written
	// directly, with no save event), so new media needs its own notification or
	// a photo stays unindexed until the record happens to be edited again.
	// It rides the SAME per-record marker: the queue is keyed
	// (section_tipo, section_id) with no modality, and indexRecord fans out to
	// both halves — so nothing about the queue or the drain changes.
	registerMediaIngestHook((event) =>
		queue.enqueue({ sectionTipo: event.sectionTipo, sectionId: event.sectionId }, 'index'),
	);
	ensureRagQueueTable().catch((error) =>
		console.error('[rag] queue table init failed (enqueues will no-op until fixed):', error),
	);
	console.log('[rag] save/delete hook registered (DEDALO_RAG_ENABLED)');
}
