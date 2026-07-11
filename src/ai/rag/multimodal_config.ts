import { envSnapshot } from '../../config/env.ts';
import {
	DEFAULT_MULTIMODAL_MODEL,
	DeterministicMultimodalProvider,
	type MultimodalEmbeddingProvider,
	SidecarMultimodalProvider,
} from './multimodal_embedding_provider.ts';

/**
 * Runtime config + builders for the MULTIMODAL IMAGE layer, resolved from the
 * DEDALO_RAG_* env (TS port of the rag.php config-catalog image keys).
 *
 *   DEDALO_RAG_MEDIA_ENABLED              bool   (default false) — master image switch
 *   DEDALO_RAG_MULTIMODAL_PROVIDER        string (default 'local')
 *   DEDALO_RAG_MULTIMODAL_MODEL           string (default 'clip-ViT-B-32')
 *   DEDALO_RAG_MULTIMODAL_ENDPOINT        string (default '' → deterministic in dev)
 *   DEDALO_RAG_MULTIMODAL_API_KEY         string (secret)
 *   DEDALO_RAG_IMAGE_MAX_PX               int    (default 512)
 *   DEDALO_RAG_IMAGE_HYBRID               bool   (default true)
 *   DEDALO_RAG_NEAR_DUPLICATE_SIMILARITY  float  (default 0.93)
 *   DEDALO_RAG_CHARACTERIZE_TOP_K         int    (default 20)
 *
 * Pure functions of the env map — no module-global state.
 */

export interface MultimodalRuntimeConfig {
	mediaEnabled: boolean;
	provider: string;
	model: string;
	endpoint: string;
	apiKey: string | undefined;
	imageMaxPx: number;
	imageHybrid: boolean;
	nearDuplicateSimilarity: number;
	characterizeTopK: number;
}

function envBool(v: string | undefined): boolean {
	return v === 'true' || v === '1';
}

function envInt(v: string | undefined, def: number): number {
	if (v === undefined || v === '') return def;
	const n = Number.parseInt(v, 10);
	return Number.isInteger(n) ? n : def;
}

function envFloat(v: string | undefined, def: number): number {
	if (v === undefined || v === '') return def;
	const n = Number.parseFloat(v);
	return Number.isFinite(n) ? n : def;
}

/**
 * True when DEDALO_RAG_MEDIA_ENABLED is explicitly on (the master image switch).
 * Default env map is envSnapshot(), NOT bare process.env: the bare default
 * silently ignored values set in ../private/.env — the documented config home
 * (audit S2-21).
 */
export function isMediaEnabled(env: Record<string, string | undefined> = envSnapshot()): boolean {
	return envBool(env.DEDALO_RAG_MEDIA_ENABLED);
}

export function multimodalConfigFromEnv(
	env: Record<string, string | undefined> = envSnapshot(),
): MultimodalRuntimeConfig {
	return {
		mediaEnabled: isMediaEnabled(env),
		provider: env.DEDALO_RAG_MULTIMODAL_PROVIDER || 'local',
		model: env.DEDALO_RAG_MULTIMODAL_MODEL || DEFAULT_MULTIMODAL_MODEL,
		endpoint: env.DEDALO_RAG_MULTIMODAL_ENDPOINT || '',
		apiKey: env.DEDALO_RAG_MULTIMODAL_API_KEY || undefined,
		imageMaxPx: envInt(env.DEDALO_RAG_IMAGE_MAX_PX, 512),
		imageHybrid:
			env.DEDALO_RAG_IMAGE_HYBRID === undefined ? true : envBool(env.DEDALO_RAG_IMAGE_HYBRID),
		nearDuplicateSimilarity: envFloat(env.DEDALO_RAG_NEAR_DUPLICATE_SIMILARITY, 0.93),
		characterizeTopK: envInt(env.DEDALO_RAG_CHARACTERIZE_TOP_K, 20),
	};
}

/**
 * Build the multimodal provider: the sidecar when an endpoint is configured, else
 * the network-free DeterministicMultimodalProvider (so the image layer works in dev
 * with NO CLIP sidecar — mirrors the text embedder fallback). The deterministic
 * provider stays 'local' so egress is never gated open.
 */
export function buildMultimodalProvider(cfg: MultimodalRuntimeConfig): MultimodalEmbeddingProvider {
	if (cfg.endpoint !== '') {
		return new SidecarMultimodalProvider({
			endpoint: cfg.endpoint,
			provider: cfg.provider,
			model: cfg.model,
			...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
		});
	}
	return new DeterministicMultimodalProvider({ model: 'deterministic-multimodal' });
}
