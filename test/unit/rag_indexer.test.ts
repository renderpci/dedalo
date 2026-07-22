import { describe, expect, test } from 'bun:test';
import { chunk } from '../../src/ai/rag/chunker.ts';
import { type OntologyPort, RagConfig } from '../../src/ai/rag/config.ts';
import type { EmbedDoc } from '../../src/ai/rag/embed_source.ts';
import { DeterministicHashProvider } from '../../src/ai/rag/embedding_provider.ts';
import { RagIndexer, type RagStore } from '../../src/ai/rag/indexer.ts';
import type { EmbeddingRow, RecordLocator } from '../../src/ai/rag/types.ts';

/**
 * Unit tests for the indexer's HASH-DIFF over GROUP documents (2026-07-22): an
 * unchanged doc must NOT call the embedding provider and must NOT be upserted
 * (stored source_hash matches); a changed doc re-embeds + upserts under the
 * `rag:<group>` storage key; an emptied doc prunes; a group REMOVED from the
 * descriptor is swept. Runs fully offline via fakes for the ontology, store,
 * provider and the resolveDocs seam.
 */

const SECTION = 'dd_rt';
const GROUP = 'default';
const STORAGE_TIPO = `rag:${GROUP}`;
const TITLE = 'Test Record';

const CARD_GROUP = {
	id: GROUP,
	ddo_map: [{ tipo: 'c_text1', section_tipo: 'self', mode: 'list' }],
};

function fakeOntology(sectionMapRag: Record<string, unknown> | null): OntologyPort {
	return {
		getProperties: async () => null,
		getModelByTipo: async (t: string) => (t === SECTION ? 'section' : 'component_input_text'),
		getTranslatable: async () => false,
		getSectionMapRag: async (t: string) => (t === SECTION ? sectionMapRag : null),
	};
}

/** A store double recording upserts + stale-deletes; diffHashes is scriptable. */
class FakeStore implements RagStore {
	upserts: EmbeddingRow[][] = [];
	staleCalls: Array<{ componentTipo: string; lang: string; validCount: number }> = [];
	modalityDeletes: string[] = [];
	hashes = new Map<string, string>();
	sectionIds: number[] = [];
	recordDeleted = false;

	async diffHashes(): Promise<Map<string, string>> {
		return new Map(this.hashes);
	}
	async upsertEmbeddingRows(rows: EmbeddingRow[]): Promise<void> {
		this.upserts.push(rows);
	}
	async deleteStale(
		_locator: RecordLocator,
		componentTipo: string,
		lang: string,
		_model: string,
		validCount: number,
	): Promise<number> {
		this.staleCalls.push({ componentTipo, lang, validCount });
		return 0;
	}
	async deleteRecordModality(_locator: RecordLocator, modality: string): Promise<void> {
		this.modalityDeletes.push(modality);
	}
	async deleteRecord(): Promise<void> {
		this.recordDeleted = true;
	}
	async listSectionIds(): Promise<number[]> {
		return this.sectionIds;
	}
}

/** A provider that counts embed() calls (to assert the skip-unchanged path). */
class SpyProvider extends DeterministicHashProvider {
	embedCalls = 0;
	override async embed(texts: string[]): Promise<number[][]> {
		this.embedCalls += 1;
		return super.embed(texts);
	}
}

/** Build an indexer whose resolveDocs returns the given per-record doc texts. */
function buildIndexer(store: FakeStore, provider: SpyProvider, values: Map<number, string>) {
	const ontology = fakeOntology({ embed: [CARD_GROUP] });
	return new RagIndexer({
		ontology,
		config: new RagConfig(ontology),
		store,
		provider,
		langs: [],
		nolan: 'lg-nolan',
		resolveDocs: async ({ sectionId }): Promise<EmbedDoc[]> => {
			const text = values.get(sectionId) ?? '';
			if (text === '') return [];
			return [
				{
					group: GROUP,
					lang: 'lg-nolan',
					text,
					contributors: [{ componentTipo: 'c_text1', sectionTipos: [SECTION] }],
				},
			];
		},
		recordTitle: async () => TITLE,
	});
}

/** The source_hashes the chunker WOULD produce for a text (to pre-seed diffHashes). */
function hashesFor(text: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const c of chunk(text, { documentTitle: TITLE })) {
		out.set(`${STORAGE_TIPO}|lg-nolan|${c.chunkIndex}`, c.sourceHash);
	}
	return out;
}

describe('RagIndexer group hash-diff', () => {
	test('UNCHANGED doc: no embed call, no upsert (skip via matching source_hash)', async () => {
		const text = 'A short record about a Roman silver denarius coin.';
		const store = new FakeStore();
		store.hashes = hashesFor(text); // stored hashes already match
		const provider = new SpyProvider(64);
		const indexer = buildIndexer(store, provider, new Map([[10, text]]));

		const ok = await indexer.indexRecord({ sectionTipo: SECTION, sectionId: 10 });
		expect(ok).toBe(true);
		expect(provider.embedCalls).toBe(0); // nothing changed → no provider call
		expect(store.upserts.length).toBe(0); // no upsert
		expect(store.staleCalls.length).toBe(1); // stale-prune still runs (idempotent)
	});

	test('CHANGED doc: re-embeds and upserts under the rag:<group> storage key', async () => {
		const text = 'A short record about a Roman silver denarius coin.';
		const store = new FakeStore(); // empty stored hashes → everything is "changed"
		const provider = new SpyProvider(64);
		const indexer = buildIndexer(store, provider, new Map([[10, text]]));

		const ok = await indexer.indexRecord({ sectionTipo: SECTION, sectionId: 10 });
		expect(ok).toBe(true);
		expect(provider.embedCalls).toBe(1);
		expect(store.upserts.length).toBe(1);
		expect(store.upserts[0]!.length).toBeGreaterThanOrEqual(1);
		const row = store.upserts[0]![0]!;
		expect(row.sectionTipo).toBe(SECTION);
		expect(row.sectionId).toBe(10);
		expect(row.componentTipo).toBe(STORAGE_TIPO);
		expect(row.modality).toBe('text');
		expect(row.embedding.length).toBe(64);
		// contributors ride on every chunk's meta (the ask-path egress input)
		expect((row.chunkMeta as { contributors: unknown }).contributors).toEqual([
			{ componentTipo: 'c_text1', sectionTipos: [SECTION] },
		]);
	});

	test('EMPTIED doc: no upsert, no embed (record had no embeddable text)', async () => {
		const store = new FakeStore();
		const provider = new SpyProvider(64);
		const indexer = buildIndexer(store, provider, new Map([[10, '']]));

		const ok = await indexer.indexRecord({ sectionTipo: SECTION, sectionId: 10 });
		expect(ok).toBe(true);
		expect(store.upserts.length).toBe(0);
		expect(provider.embedCalls).toBe(0);
	});

	test('REMOVED/RENAMED group: stored chunks under the old key are swept', async () => {
		const text = 'A short record about a Roman silver denarius coin.';
		const store = new FakeStore();
		// The store still holds chunks of a group the descriptor no longer names…
		store.hashes = new Map([['rag:oldgroup|lg-nolan|0', 'deadbeef']]);
		const provider = new SpyProvider(64);
		const indexer = buildIndexer(store, provider, new Map([[10, text]]));

		const ok = await indexer.indexRecord({ sectionTipo: SECTION, sectionId: 10 });
		expect(ok).toBe(true);
		// …and the orphan sweep prunes them (validCount 0 removes all).
		expect(store.staleCalls).toContainEqual({
			componentTipo: 'rag:oldgroup',
			lang: 'lg-nolan',
			validCount: 0,
		});
	});

	test('NO descriptor (no groups) → clears prior text vectors (deleteRecordModality)', async () => {
		const ontology = fakeOntology(null); // no section_map rag scope
		const store = new FakeStore();
		const provider = new SpyProvider(64);
		const indexer = new RagIndexer({
			ontology,
			config: new RagConfig(ontology),
			store,
			provider,
			langs: [],
			nolan: 'lg-nolan',
			resolveDocs: async () => [],
			recordTitle: async () => '',
		});
		const ok = await indexer.indexRecord({ sectionTipo: SECTION, sectionId: 10 });
		expect(ok).toBe(true);
		expect(provider.embedCalls).toBe(0);
		expect(store.upserts.length).toBe(0);
		expect(store.modalityDeletes).toEqual(['text']);
	});

	test('deleteRecord removes a record vectors (true)', async () => {
		const store = new FakeStore();
		const provider = new SpyProvider(64);
		const indexer = buildIndexer(store, provider, new Map());
		const ok = await indexer.deleteRecord({ sectionTipo: SECTION, sectionId: 10 });
		expect(ok).toBe(true);
		expect(store.recordDeleted).toBe(true);
	});

	test('reconcileSection enqueues matrix-only as index, vector-only as delete', async () => {
		const store = new FakeStore();
		store.sectionIds = [2, 3]; // vector ids
		const provider = new SpyProvider(64);
		const indexer = buildIndexer(store, provider, new Map());

		const enqueued: Array<{ id: number; op: string }> = [];
		const out = await indexer.reconcileSection(
			SECTION,
			async () => [1, 2], // matrix ids
			async (loc, op) => {
				enqueued.push({ id: loc.sectionId, op });
			},
		);
		// matrix-only {1} → index ; vector-only {3} → delete ; {2} in both → nothing
		expect(out).toEqual({ missing: 1, orphan: 1 });
		expect(enqueued).toContainEqual({ id: 1, op: 'index' });
		expect(enqueued).toContainEqual({ id: 3, op: 'delete' });
		expect(enqueued.find((e) => e.id === 2)).toBeUndefined();
	});
});
