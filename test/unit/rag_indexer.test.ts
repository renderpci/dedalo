import { describe, expect, test } from 'bun:test';
import { chunk } from '../../src/ai/rag/chunker.ts';
import { type OntologyPort, RagConfig } from '../../src/ai/rag/config.ts';
import { DeterministicHashProvider } from '../../src/ai/rag/embedding_provider.ts';
import { RagIndexer, type RagStore } from '../../src/ai/rag/indexer.ts';
import type { EmbeddingRow, RecordLocator } from '../../src/ai/rag/types.ts';

/**
 * Unit tests for the indexer's HASH-DIFF (ported from
 * `src/ai/rag2/test/rag_indexer.test.ts`, Brick 2): an unchanged chunk must NOT
 * call the embedding provider and must NOT be upserted (stored source_hash
 * matches); a changed value re-embeds + upserts; an emptied value prunes. Runs
 * fully offline via fakes for the ontology, store, provider and text reader.
 */

const SECTION = 'dd_rt';
const COMPONENT = 'c_text1';
const MODEL = 'component_input_text';
const TITLE = 'Test Record';

function fakeOntology(): OntologyPort {
	const props: Record<string, Record<string, unknown>> = {
		[SECTION]: { rag: { enabled: true } },
		[COMPONENT]: { rag: { embed: true } },
	};
	const models: Record<string, string> = { [SECTION]: 'section', [COMPONENT]: MODEL };
	return {
		getProperties: async (t: string) => props[t] ?? null,
		getModelByTipo: async (t: string) => models[t] ?? null,
		getRecursiveChildren: async (t: string) => (t === SECTION ? [COMPONENT] : []),
		getTranslatable: async () => false,
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

function buildIndexer(store: FakeStore, provider: SpyProvider, values: Map<number, string>) {
	const ontology = fakeOntology();
	return new RagIndexer({
		ontology,
		config: new RagConfig(ontology),
		store,
		provider,
		langs: [],
		nolan: 'lg-nolan',
		resolveMatrixTable: async () => 'matrix',
		readText: async ({ sectionId }) => values.get(sectionId) ?? '',
		recordTitle: async () => TITLE,
	});
}

/** The source_hashes the chunker WOULD produce for a text (to pre-seed diffHashes). */
function hashesFor(text: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const c of chunk(text, { documentTitle: TITLE })) {
		out.set(`${COMPONENT}|lg-nolan|${c.chunkIndex}`, c.sourceHash);
	}
	return out;
}

describe('RagIndexer hash-diff', () => {
	test('UNCHANGED value: no embed call, no upsert (skip via matching source_hash)', async () => {
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

	test('CHANGED value: re-embeds and upserts the changed chunks', async () => {
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
		expect(row.componentTipo).toBe(COMPONENT);
		expect(row.modality).toBe('text');
		expect(row.embedding.length).toBe(64);
	});

	test('EMPTIED value: no upsert, no embed (record had no embeddable text)', async () => {
		const store = new FakeStore();
		const provider = new SpyProvider(64);
		const indexer = buildIndexer(store, provider, new Map([[10, '']]));

		const ok = await indexer.indexRecord({ sectionTipo: SECTION, sectionId: 10 });
		expect(ok).toBe(true);
		expect(store.upserts.length).toBe(0);
		expect(provider.embedCalls).toBe(0);
	});

	test('non-RAG section is a clean no-op (true, no work)', async () => {
		const ontology: OntologyPort = {
			getProperties: async () => ({}), // no rag.enabled
			getModelByTipo: async () => 'section',
			getRecursiveChildren: async () => [],
			getTranslatable: async () => false,
		};
		const store = new FakeStore();
		const provider = new SpyProvider(64);
		const indexer = new RagIndexer({
			ontology,
			config: new RagConfig(ontology),
			store,
			provider,
			langs: [],
			nolan: 'lg-nolan',
			resolveMatrixTable: async () => 'matrix',
			readText: async () => '',
			recordTitle: async () => '',
		});
		const ok = await indexer.indexRecord({ sectionTipo: 'dd_off', sectionId: 1 });
		expect(ok).toBe(true);
		expect(provider.embedCalls).toBe(0);
		expect(store.upserts.length).toBe(0);
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

	test('no embeddable components → clears prior text vectors (deleteRecordModality)', async () => {
		const ontology: OntologyPort = {
			getProperties: async (t: string) => (t === SECTION ? { rag: { enabled: true } } : null),
			getModelByTipo: async (t: string) => (t === SECTION ? 'section' : null),
			getRecursiveChildren: async () => [], // no children → no embeddable components
			getTranslatable: async () => false,
		};
		const store = new FakeStore();
		const provider = new SpyProvider(64);
		const indexer = new RagIndexer({
			ontology,
			config: new RagConfig(ontology),
			store,
			provider,
			langs: [],
			nolan: 'lg-nolan',
			resolveMatrixTable: async () => 'matrix',
			readText: async () => '',
			recordTitle: async () => '',
		});
		const ok = await indexer.indexRecord({ sectionTipo: SECTION, sectionId: 10 });
		expect(ok).toBe(true);
		expect(store.modalityDeletes).toEqual(['text']);
	});
});
