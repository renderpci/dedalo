/**
 * RAG PRESENCE RECONCILE — the vector index against the matrix, as a registry
 * definition (core/reconcile/registry.ts, S-10).
 *
 * The comparison is `RagIndexer.reconcileSection` (indexer.ts), untouched:
 * matrix record ids of a RAG-enabled section versus the ids that hold at least
 * one vector. Matrix-only ids are MISSING (never indexed, or an event dropped
 * in the enqueue-unavailable boot window); vector-only ids are ORPHANS (a
 * delete that never reached the store). The correction is never applied here
 * directly: apply ENQUEUES `index`/`delete` markers for the drain
 * (`rag_index_queue`), exactly as `rag_drain --reconcile <section>` does — the
 * indexing itself stays with the drain, which is what owns the embedder.
 *
 * `scope` = section tipos; unscoped, every section whose section_map declares
 * an embed group is walked (the cheap ontology gate, `sectionIsRagEnabled`).
 */

import { sql } from '../../core/db/postgres.ts';
import { getMatrixTableFromTipo, listSectionNodes } from '../../core/ontology/resolver.ts';
import type { ReconcileDefinition } from '../../core/reconcile/registry.ts';
import { defaultOntologyPort, RagConfig } from './config.ts';
import { buildRagIndexer } from './indexer.ts';
import { buildRagQueue, ensureRagQueueTable } from './queue.ts';
import type { RecordLocator } from './types.ts';

/** The sections a full run walks: those whose ontology intent enables RAG. */
export async function listRagEnabledSections(): Promise<string[]> {
	const ragConfig = new RagConfig(defaultOntologyPort());
	const out: string[] = [];
	for (const node of await listSectionNodes()) {
		if (await ragConfig.sectionIsRagEnabled(node.tipo)) out.push(node.tipo);
	}
	return out;
}

export const RAG_INDEX_RECONCILE: ReconcileDefinition = {
	name: 'rag_index',
	stores: ['matrix records (RAG-enabled sections)', 'rag_embeddings (vector store)'],
	description:
		'Compare record presence between the matrix and the vector index — apply enqueues an index for every missing record and a delete for every orphan vector (the drain does the work).',
	scopeLabel: 'section tipo',
	// Walks every RAG-enabled section's ids on both stores: an operator sweep.
	schedule: 'operator',
	sources: ['src/ai/rag/reconcile.ts', 'src/ai/rag/indexer.ts', 'src/ai/rag/cli/rag_drain.ts'],
	async run({ apply, scope }) {
		const sections = scope === undefined ? await listRagEnabledSections() : [...scope];
		const indexer = buildRagIndexer();
		const queue = apply ? buildRagQueue() : null;
		if (queue !== null) await ensureRagQueueTable();
		const perSection: Record<string, { missing: number; orphan: number; skipped?: string }> = {};
		let missing = 0;
		let orphan = 0;
		let enqueued = 0;
		const corrections: { locator: RecordLocator; op: 'index' | 'delete' }[] = [];
		for (const sectionTipo of sections) {
			const table = await getMatrixTableFromTipo(sectionTipo);
			if (table === null) {
				perSection[sectionTipo] = { missing: 0, orphan: 0, skipped: 'no matrix table' };
				continue;
			}
			const outcome = await indexer.reconcileSection(
				sectionTipo,
				async () => {
					const rows = (await sql.unsafe(
						`SELECT section_id FROM "${table}" WHERE section_tipo = $1`,
						[sectionTipo],
					)) as { section_id: number }[];
					return rows.map((row) => Number(row.section_id));
				},
				async (locator, op) => {
					corrections.push({ locator, op });
					if (queue !== null) {
						await queue.enqueue(locator, op);
						enqueued++;
					}
				},
			);
			perSection[sectionTipo] = outcome;
			missing += outcome.missing;
			orphan += outcome.orphan;
		}
		return {
			drift: missing + orphan,
			applied: enqueued,
			detail: { sections: perSection, missing, orphan, enqueued, corrections },
		};
	},
};
