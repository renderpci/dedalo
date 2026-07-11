/**
 * Pluggable JOINT image+text embedding providers (CLIP / SigLIP / jina-clip style).
 *
 * Port of core/rag/class.embedding_provider_multimodal.php. The defining property
 * of a multimodal provider is that the image tower and the text tower share ONE
 * vector space, so a TEXT query can be compared against IMAGE vectors. That is why
 * text→image search MUST go through embedTextForImageSearch() (this model's text
 * tower), NEVER through the default text EmbeddingProvider — those live in different
 * spaces and the cosine between them is noise.
 *
 *   embedImage(images)            → number[][]   (one vector per image, or [] on failure)
 *   embedTextForImageSearch(txts) → number[][]   (one vector per text,  or [] on failure)
 *   dimension()                   → number|null  (discovered after the first success)
 *   model()                       → string
 *   provider()                    → string       (e.g. 'local' | 'external')
 *   isExternal()                  → boolean      (anything other than 'local')
 *
 * The dimension is DISCOVERED from the response, never hard-coded. A count/dimension
 * mismatch is a SKIP, not a guess: the whole batched call returns [] so the caller
 * never writes a garbage vector.
 *
 * No module-global mutable state: construct one provider and inject it.
 */

/** Default LOCAL joint image+text model id. */
export const DEFAULT_MULTIMODAL_MODEL = 'clip-ViT-B-32';

/** An image given to embedImage(): raw bytes or a base64 string (no data: prefix). */
export type ImageInput = Uint8Array | string;

export interface MultimodalEmbeddingProvider {
	/** Embed a batch of images (bytes or base64). One vector per image, or [] on failure. */
	embedImage(images: ImageInput[]): Promise<number[][]>;
	/**
	 * Embed a batch of texts THROUGH THE JOINT TOWER (so a text query can match an
	 * image vector). One vector per text, or [] on failure. This is NOT the default
	 * text embedder.
	 */
	embedTextForImageSearch(texts: string[]): Promise<number[][]>;
	/** Discovered embedding dimension, or null before the first successful call. */
	dimension(): number | null;
	/** The model id (e.g. 'clip-ViT-B-32'). */
	model(): string;
	/** The provider id (e.g. 'local'). */
	provider(): string;
	/** True when the provider is NOT local (egress leaves the host). */
	isExternal(): boolean;
}

/** Encode an ImageInput to a base64 string (bytes → base64; string is assumed base64). */
export function imageToBase64(image: ImageInput): string {
	if (typeof image === 'string') return image;
	return Buffer.from(image).toString('base64');
}

/**
 * Base class supplying batching + dimension discovery + uniformity validation,
 * shared by the sidecar + deterministic providers. Concrete providers implement
 * callImage()/callText() (one transport call for a batch). The base:
 *  - batches by maxBatch,
 *  - aborts cleanly (returns []) if a batch returns the wrong count,
 *  - discovers the dimension from the first vector and validates every vector
 *    matches it (mismatch → [], so a mis-shaped response is never stored).
 */
export abstract class BaseMultimodalProvider implements MultimodalEmbeddingProvider {
	protected discoveredDimension: number | null = null;

	protected constructor(
		protected readonly providerId: string,
		protected readonly modelId: string,
		protected readonly maxBatch: number = 16,
	) {}

	/** One transport call for a batch of base64 images. [] on failure. */
	protected abstract callImage(imagesBase64: string[]): Promise<number[][]>;
	/** One transport call for a batch of texts (joint tower). [] on failure. */
	protected abstract callText(texts: string[]): Promise<number[][]>;

	async embedImage(images: ImageInput[]): Promise<number[][]> {
		if (images.length === 0) return [];
		const base64 = images.map(imageToBase64);
		return this.batched(base64, (b) => this.callImage(b));
	}

	async embedTextForImageSearch(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return [];
		return this.batched(texts, (b) => this.callText(b));
	}

	/** Batch + count-check + dimension discovery + uniformity validation. */
	private async batched<I>(
		items: I[],
		call: (batch: I[]) => Promise<number[][]>,
	): Promise<number[][]> {
		const batchSize = Math.max(1, this.maxBatch);
		const vectors: number[][] = [];
		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, i + batchSize);
			let batchVectors: number[][];
			try {
				batchVectors = await call(batch);
			} catch {
				return []; // transport failure: skip, never mis-align
			}
			if (batchVectors.length !== batch.length) return []; // partial/failed batch
			for (const v of batchVectors) vectors.push(v);
		}

		const dimension = vectors[0]?.length ?? 0;
		if (dimension < 1) return [];
		for (const v of vectors) {
			if (v.length !== dimension) return []; // inconsistent → skip
		}
		this.discoveredDimension = dimension;
		return vectors;
	}

	dimension(): number | null {
		return this.discoveredDimension;
	}
	model(): string {
		return this.modelId;
	}
	provider(): string {
		return this.providerId;
	}
	isExternal(): boolean {
		return this.providerId !== 'local';
	}
}

export interface SidecarMultimodalConfig {
	/** Base endpoint of the multimodal sidecar, e.g. 'http://127.0.0.1:8089'. */
	endpoint: string;
	/** Provider id (default 'local'). 'local' ⇒ isExternal() is false. */
	provider?: string;
	/** Model id sent to the sidecar. Default 'clip-ViT-B-32'. */
	model?: string;
	/** Optional bearer token. */
	apiKey?: string;
	/** Max items per HTTP request. Default 16. */
	maxBatch?: number;
	/** Request timeout (ms). Default 60000. */
	timeoutMs?: number;
	/** Optional injected fetch (tests). Defaults to global fetch. */
	fetchImpl?: typeof fetch;
}

/**
 * HTTP client for the multimodal sidecar, per the skill's contract:
 *   POST {endpoint}/image  { model, images: [base64, …] }  →  { embeddings: [[…], …] }
 *   POST {endpoint}/text   { model, input:  [text,   …] }  →  { embeddings: [[…], …] }
 *
 * Tolerates the OpenAI-style { data: [{ embedding: [...] }, …] } shape as a fallback.
 * Auth via an optional 'Authorization: Bearer <apiKey>' header.
 *
 * The sidecar is NOT running in this environment — that is expected. Tests use the
 * DeterministicMultimodalProvider instead; this client exists so a real deployment
 * can wire CLIP/SigLIP without code changes. Dimension is discovered from the
 * response by the base class.
 */
export class SidecarMultimodalProvider extends BaseMultimodalProvider {
	private readonly endpoint: string;
	private readonly apiKey: string | undefined;
	private readonly timeoutMs: number;
	private readonly fetchImpl: typeof fetch;

	constructor(config: SidecarMultimodalConfig) {
		super(
			config.provider ?? 'local',
			config.model ?? DEFAULT_MULTIMODAL_MODEL,
			config.maxBatch ?? 16,
		);
		this.endpoint = config.endpoint.replace(/\/+$/, '');
		this.apiKey = config.apiKey;
		this.timeoutMs = config.timeoutMs ?? 60000;
		this.fetchImpl = config.fetchImpl ?? fetch;
	}

	protected override async callImage(imagesBase64: string[]): Promise<number[][]> {
		return this.post('/image', 'images', imagesBase64);
	}

	protected override async callText(texts: string[]): Promise<number[][]> {
		return this.post('/text', 'input', texts);
	}

	private async post(path: string, field: string, items: string[]): Promise<number[][]> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
		try {
			const res = await this.fetchImpl(`${this.endpoint}${path}`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ model: this.modelId, [field]: items }),
				signal: controller.signal,
			});
			if (!res.ok) return [];
			return extractVectors(await res.json());
		} catch {
			return [];
		} finally {
			clearTimeout(timer);
		}
	}
}

/** Normalise the two accepted response shapes to number[][]. [] on anything else. */
export function extractVectors(decoded: unknown): number[][] {
	if (decoded === null || typeof decoded !== 'object') return [];
	const body = decoded as { embeddings?: unknown; data?: unknown };

	// Primary: { embeddings: [[…], …] }
	if (Array.isArray(body.embeddings)) {
		const out: number[][] = [];
		for (const row of body.embeddings) {
			if (!Array.isArray(row) || row.some((n) => typeof n !== 'number')) return [];
			out.push(row as number[]);
		}
		return out;
	}

	// Fallback: { data: [{ embedding: [...] }, …] } (OpenAI-style)
	if (Array.isArray(body.data)) {
		const out: number[][] = [];
		for (const item of body.data) {
			const emb = (item as { embedding?: unknown })?.embedding;
			if (!Array.isArray(emb) || emb.some((n) => typeof n !== 'number')) return [];
			out.push(emb as number[]);
		}
		return out;
	}
	return [];
}

/**
 * A deterministic, network-free multimodal provider for TESTS.
 *
 * Images and text are projected into the SAME joint space by hashing, so a text
 * query CAN match an image: an image's vector is derived from a stable digest of
 * its bytes, AND from any tokens the test author embeds in the bytes/base64 — but
 * the key property the integration test relies on is that embedTextForImageSearch
 * and embedImage land near each other when they SHARE tokens. To make text→image
 * matching meaningful without a real CLIP, the provider hashes the input the same
 * way for both towers: image bytes are interpreted as their UTF-8/base64 string and
 * tokenised exactly like text, so a caption-bearing or token-bearing input matches.
 *
 * It is NOT a semantic encoder — it is a deterministic stand-in chosen so the whole
 * image pipeline (extract → embed → store → similar/text-image) is reproducible and
 * the cosine geometry is exercised end to end.
 */
export class DeterministicMultimodalProvider extends BaseMultimodalProvider {
	private readonly dim: number;

	constructor(
		opts: { dimension?: number; model?: string; provider?: string; maxBatch?: number } = {},
	) {
		super(
			opts.provider ?? 'local',
			opts.model ?? 'deterministic-multimodal-test',
			opts.maxBatch ?? 16,
		);
		this.dim = opts.dimension ?? 64;
		if (this.dim < 1) throw new Error('DeterministicMultimodalProvider dimension must be >= 1');
	}

	protected override async callImage(imagesBase64: string[]): Promise<number[][]> {
		// Project the image into the SAME joint space as text: decode the base64 to its
		// underlying bytes and interpret them as a UTF-8 string, then tokenise exactly
		// like text. So a token-bearing image (the test uses captioned/token bytes) and
		// a text query that SHARE tokens land near each other — the joint-space property
		// a text→image query relies on. Two identical images → identical vectors.
		return imagesBase64.map((b64) => this.vectorFor(decodeBase64Utf8(b64), 'img'));
	}

	protected override async callText(texts: string[]): Promise<number[][]> {
		return texts.map((t) => this.vectorFor(t, 'txt'));
	}

	/**
	 * Stable joint-space vector for a token-bearing string. Tokens deposit weight on
	 * a few coordinates regardless of which tower produced them, so an image and a
	 * text that share tokens land near each other (the joint-space property). Exposed
	 * for tests.
	 */
	vectorFor(input: string, _tower: 'img' | 'txt'): number[] {
		const vec = new Array<number>(this.dim).fill(0);
		const tokens = input
			.toLowerCase()
			.split(/[^\p{L}\p{N}]+/u)
			.filter((s) => s.length > 0);
		const source = tokens.length > 0 ? tokens : [input];

		for (const token of source) {
			const h = fnv1a(token);
			for (let j = 0; j < 3; j++) {
				const mixed = fnv1a(`${token}#${j}#${h}`);
				const idx = mixed % this.dim;
				const sign = (mixed & 1) === 0 ? 1 : -1;
				const weight = 0.25 + ((mixed >>> 8) % 256) / 256;
				vec[idx] = (vec[idx] ?? 0) + sign * weight;
			}
		}

		let norm = 0;
		for (const v of vec) norm += v * v;
		norm = Math.sqrt(norm);
		if (norm === 0) {
			const h = fnv1a(input || 'empty');
			vec[h % this.dim] = 1;
			this.discoveredDimension = this.dim;
			return vec;
		}
		this.discoveredDimension = this.dim;
		return vec.map((v) => v / norm);
	}
}

/** Decode base64 → UTF-8 string (lossy: non-text bytes still tokenise stably). */
function decodeBase64Utf8(b64: string): string {
	try {
		return Buffer.from(b64, 'base64').toString('utf8');
	} catch {
		return b64;
	}
}

/** FNV-1a 32-bit hash → unsigned int. Stable across runs/platforms. */
function fnv1a(str: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}
