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

import { registerRagRecordHook } from '../../core/section_record/save_event.ts';
import { RagQueue, defaultMatrixQueryer, ensureRagQueueTable } from './queue.ts';
import { isRagEnabled } from './rag_enabled.ts';

/** Register (or clear) the RAG save/delete hook based on the kill-switch. */
export function initRagHooks(): void {
	if (!isRagEnabled()) {
		registerRagRecordHook(null);
		return;
	}
	// enqueue-only queue: the save path never indexes (the drain does), so no
	// indexer needs binding here.
	const queue = new RagQueue(defaultMatrixQueryer());
	registerRagRecordHook((event) =>
		queue.enqueue({ sectionTipo: event.sectionTipo, sectionId: event.sectionId }, event.kind),
	);
	ensureRagQueueTable().catch((error) =>
		console.error('[rag] queue table init failed (enqueues will no-op until fixed):', error),
	);
	console.log('[rag] save/delete hook registered (DEDALO_RAG_ENABLED)');
}
