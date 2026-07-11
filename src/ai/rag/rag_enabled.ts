/**
 * The RAG global kill-switch (port of `src/ai/rag2/src/rag_enabled.ts`).
 *
 * RAG costs zero unless explicitly enabled: the save/delete hook skips enqueue
 * and the API handler declines every action when this is false. Toggled by
 * DEDALO_RAG_ENABLED in ../private/.env.
 */

import { readEnv } from '../../config/env.ts';

/** True only when DEDALO_RAG_ENABLED is 'true' or '1'. */
export function isRagEnabled(): boolean {
	const value = String(readEnv('DEDALO_RAG_ENABLED', '') ?? '')
		.trim()
		.toLowerCase();
	return value === 'true' || value === '1';
}
