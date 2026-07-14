/**
 * Embedding providers for the TS RAG pipeline (spec §8, greenfield).
 *
 * The pipeline depends only on this interface, so swapping a real API-backed
 * provider (Voyage, OpenAI, …) in production is a one-module change wired by
 * env config. Shipping a DETERMINISTIC LOCAL provider makes the whole
 * index→retrieve pipeline testable offline and reproducible in CI — no keys,
 * no network, no flaky scores.
 */

import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';

/** The provider contract: embed a batch of texts into fixed-dimension vectors. */
export interface EmbeddingProvider {
	/** Registry name stored per chunk (rag_embeddings.provider). */
	readonly name: string;
	/** Model id — also the store's partition key. */
	readonly model: string;
	readonly dimension: number;
	embed(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic bag-of-words hashing embedder. Each token hashes (FNV-1a)
 * into a dimension bucket with a sign, vectors are L2-normalized — so texts
 * sharing vocabulary have HIGHER cosine similarity, which is the property the
 * retrieval tests exercise. NOT a semantic model: dev/test provider only.
 */
export class DeterministicHashProvider implements EmbeddingProvider {
	readonly name = 'deterministic_hash';
	readonly model = 'det-hash-v1';
	readonly dimension: number;

	constructor(dimension = 128) {
		this.dimension = dimension;
	}

	async embed(texts: string[]): Promise<number[][]> {
		return texts.map((text) => this.embedOne(text));
	}

	private embedOne(text: string): number[] {
		const vector = new Array<number>(this.dimension).fill(0);
		const tokens = text
			.toLowerCase()
			.normalize('NFD')
			// biome-ignore lint/suspicious/noMisleadingCharacterClass: NFD above decomposes \u2014 combining marks ARE standalone here (standard unaccent idiom)
			.replace(/[\u0300-\u036f]/g, '') // strip combining diacritics (mirrors unaccent)
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length > 1);
		for (const token of tokens) {
			// FNV-1a 32-bit hash.
			let hash = 0x811c9dc5;
			for (let index = 0; index < token.length; index++) {
				hash ^= token.charCodeAt(index);
				hash = Math.imul(hash, 0x01000193);
			}
			const bucket = Math.abs(hash) % this.dimension;
			const sign = (hash & 1) === 0 ? 1 : -1;
			vector[bucket] = (vector[bucket] as number) + sign;
		}
		// L2 normalize (cosine-ready); zero vector stays zero.
		const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
		return norm === 0 ? vector : vector.map((value) => value / norm);
	}
}

/** Default multilingual embedding model served by the sidecar (bge-m3, 1024-dim). */
export const DEFAULT_SIDECAR_MODEL = 'bge-m3';

/**
 * HTTP client for a real embedding sidecar (port of the rag2 provider), per the
 * contract  POST {endpoint}/embed { model, input:[…] } → { embeddings:[[…],…] }.
 * On any transport/protocol failure it returns `[]`, which the indexer treats as
 * a retryable failure (never a garbage write). Batched to `maxBatch` per request.
 * The declared `dimension` is the model default; the actual per-chunk dimension
 * written by the indexer comes from each returned vector's length.
 */
export class SidecarEmbeddingProvider implements EmbeddingProvider {
	readonly name = 'sidecar';
	readonly model: string;
	readonly dimension: number;
	private readonly endpoint: string;
	private readonly maxBatch: number;
	private readonly timeoutMs: number;
	private readonly fetchImpl: typeof fetch;

	constructor(config: {
		endpoint: string;
		model?: string;
		dimension?: number;
		maxBatch?: number;
		timeoutMs?: number;
		fetchImpl?: typeof fetch;
	}) {
		this.endpoint = config.endpoint.replace(/\/+$/, '');
		this.model = config.model ?? DEFAULT_SIDECAR_MODEL;
		this.dimension = config.dimension ?? 1024;
		this.maxBatch = config.maxBatch ?? 32;
		this.timeoutMs = config.timeoutMs ?? 30000;
		this.fetchImpl = config.fetchImpl ?? fetch;
	}

	async embed(texts: string[]): Promise<number[][]> {
		const out: number[][] = [];
		for (let offset = 0; offset < texts.length; offset += this.maxBatch) {
			const batch = texts.slice(offset, offset + this.maxBatch);
			const vectors = await this.embedBatch(batch);
			if (vectors.length !== batch.length) return []; // fail closed: retryable
			out.push(...vectors);
		}
		return out;
	}

	private async embedBatch(texts: string[]): Promise<number[][]> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const response = await this.fetchImpl(`${this.endpoint}/embed`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: this.model, input: texts }),
				signal: controller.signal,
			});
			if (!response.ok) return [];
			const body = (await response.json()) as { embeddings?: unknown };
			if (!Array.isArray(body.embeddings)) return [];
			const out: number[][] = [];
			for (const row of body.embeddings) {
				if (!Array.isArray(row) || row.some((value) => typeof value !== 'number')) return [];
				out.push(row as number[]);
			}
			return out;
		} catch {
			return [];
		} finally {
			clearTimeout(timer);
		}
	}
}

/**
 * Resolve the configured provider. The deterministic dev provider is the default
 * (offline, reproducible); set RAG_EMBEDDING_PROVIDER=sidecar +
 * RAG_EMBEDDING_ENDPOINT (and optionally RAG_EMBEDDING_MODEL) to use a real
 * embedding sidecar in production — a one-env change, no code edits.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
	const provider = String(readString('DEDALO_RAG_EMBEDDING_PROVIDER') ?? '')
		.trim()
		.toLowerCase();
	if (provider === 'sidecar') {
		const endpoint = String(readString('DEDALO_RAG_EMBEDDING_ENDPOINT') ?? '').trim();
		if (endpoint !== '') {
			const model = String(readString('DEDALO_RAG_EMBEDDING_MODEL') ?? '').trim() || undefined;
			// Install-level tuning (PHP rag catalog): batch size and provider
			// timeout (PHP value is SECONDS; the ctor takes ms).
			const batch = Number(readString('DEDALO_RAG_BATCH_SIZE'));
			const timeoutSeconds = Number(readString('DEDALO_RAG_PROVIDER_TIMEOUT'));
			return new SidecarEmbeddingProvider({
				endpoint,
				model,
				maxBatch: Number.isFinite(batch) && batch > 0 ? Math.trunc(batch) : undefined,
				timeoutMs:
					Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
						? Math.trunc(timeoutSeconds * 1000)
						: undefined,
			});
		}
	}
	return new DeterministicHashProvider();
}
