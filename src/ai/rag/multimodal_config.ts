import { envSnapshot } from '../../config/env.ts';
import {
	DEFAULT_MULTIMODAL_MODEL,
	DeterministicMultimodalProvider,
	type MultimodalEmbeddingProvider,
	SidecarMultimodalProvider,
} from './multimodal_embedding_provider.ts';

/**
 * Runtime config + builders for the MULTIMODAL IMAGE layer, resolved from the
 * DEDALO_RAG_* env.
 *
 * Every key it reads is DECLARED in `src/config/catalog/ai.ts` — the single source
 * of truth for each default and its operator-facing prose — and is read here through
 * `envKey()` so that the census gates can SEE it (read the note on that helper: a
 * property access is invisible to them, and these keys were invisible for exactly
 * that reason).
 *
 * Pure functions of the env map — no module-global state.
 */

type Env = Record<string, string | undefined>;

/**
 * The institution's decision about whether object images may be embedded by a
 * service outside its own server.
 *   'local_only'     — never (the default);
 *   'allow_external' — permitted, deliberately.
 */
export type ImageEgressPolicy = 'local_only' | 'allow_external';

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
	imageEgressPolicy: ImageEgressPolicy;
}

/**
 * Read ONE key out of the injected env map, with the key name as a LITERAL first
 * argument.
 *
 * WHY A HELPER FOR WHAT IS A PROPERTY ACCESS. `config_census_tripwire` and
 * `config_docs_tripwire` discover the keys the engine reads by scanning src/ for a
 * call whose first argument is an uppercase-snake literal. `env.DEDALO_RAG_IMAGE_MAX_PX`
 * is not one, so every key of this module was invisible to both gates: absent from
 * the catalog, from install/sample.env and from the settings reference, while the
 * gates stayed green because they had never heard of the keys at all. Reading through
 * this helper puts each key back in call position, so adding one without a catalog
 * entry now FAILS.
 *
 * The env MAP stays injected (tests pass their own snapshot); the production default
 * is `envSnapshot()`, which applies the documented precedence — real process
 * environment over ../private/.env. A bare `process.env` here would drop that second
 * half (audit S2-21) and is banned outside src/config/ anyway.
 */
function envKey(key: string, env: Env): string | undefined {
	return env[key];
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
 * The egress policy, defaulting to the closed one. An unrecognized value is a typo
 * ('local', 'external'), and coercing a typo to the permissive side would ship images
 * off the host on a misspelling — so it logs loudly and stays closed.
 */
function readImageEgressPolicy(env: Env): ImageEgressPolicy {
	const configured = (envKey('DEDALO_RAG_IMAGE_EGRESS_POLICY', env) ?? '').trim();
	if (configured === '') return 'local_only';
	if (configured === 'local_only' || configured === 'allow_external') return configured;
	console.error(
		`[config] DEDALO_RAG_IMAGE_EGRESS_POLICY='${configured}' is not a valid policy ('local_only' | 'allow_external') — keeping 'local_only' (images stay on this host). Fix the value or unset it.`,
	);
	return 'local_only';
}

/**
 * True when DEDALO_RAG_MEDIA_ENABLED is explicitly on (the master image switch).
 * Default env map is envSnapshot(), NOT bare process.env: the bare default
 * silently ignored values set in ../private/.env — the documented config home
 * (audit S2-21).
 */
export function isMediaEnabled(env: Env = envSnapshot()): boolean {
	return envBool(envKey('DEDALO_RAG_MEDIA_ENABLED', env));
}

export function multimodalConfigFromEnv(env: Env = envSnapshot()): MultimodalRuntimeConfig {
	const hybrid = envKey('DEDALO_RAG_IMAGE_HYBRID', env);
	return {
		mediaEnabled: isMediaEnabled(env),
		provider: envKey('DEDALO_RAG_MULTIMODAL_PROVIDER', env) || 'local',
		model: envKey('DEDALO_RAG_MULTIMODAL_MODEL', env) || DEFAULT_MULTIMODAL_MODEL,
		endpoint: envKey('DEDALO_RAG_MULTIMODAL_ENDPOINT', env) || '',
		apiKey: envKey('DEDALO_RAG_MULTIMODAL_API_KEY', env) || undefined,
		imageMaxPx: envInt(envKey('DEDALO_RAG_IMAGE_MAX_PX', env), 512),
		imageHybrid: hybrid === undefined ? true : envBool(hybrid),
		nearDuplicateSimilarity: envFloat(envKey('DEDALO_RAG_NEAR_DUPLICATE_SIMILARITY', env), 0.93),
		characterizeTopK: envInt(envKey('DEDALO_RAG_CHARACTERIZE_TOP_K', env), 20),
		imageEgressPolicy: readImageEgressPolicy(env),
	};
}

/** Hostnames that are genuinely on this machine or its private network. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
	'localhost',
	'127.0.0.1',
	'::1',
	'[::1]',
	'0.0.0.0',
]);

/**
 * Whether an endpoint URL actually leaves this host, judged by its ADDRESS.
 *
 * The `provider` label cannot be trusted for this: it is optional, defaults to
 * 'local', and looks decorative next to the endpoint that does the real work.
 * An operator who sets only `DEDALO_RAG_MULTIMODAL_ENDPOINT=https://api.vendor.com/v1`
 * would otherwise be declared local by default, and every object photograph
 * would be POSTed to that vendor under a `local_only` policy — precisely the
 * "no image leaves the building through an oversight in a settings file"
 * promise the policy key makes.
 *
 * Unparseable is treated as EXTERNAL: fail closed.
 */
export function endpointIsLocal(endpoint: string): boolean {
	if (endpoint.trim() === '') return true; // no endpoint ⇒ nothing transmitted
	let host: string;
	try {
		host = new URL(endpoint).hostname.toLowerCase();
	} catch {
		return false;
	}
	if (LOOPBACK_HOSTS.has(host)) return true;
	// Unique-local IPv6 (fc00::/7). URL.hostname strips the brackets.
	if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;

	// RFC1918 + link-local, matched only against a REAL IPv4 literal. A prefix
	// test on the raw hostname is a bypass: `10.0.0.5.evil.com` starts with
	// "10." and is a public domain someone else controls.
	const octets = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
	if (octets === null) return false;
	const [a, b] = [Number(octets[1]), Number(octets[2])];
	if ([a, b, Number(octets[3]), Number(octets[4])].some((part) => part > 255)) return false;
	if (a === 10) return true;
	if (a === 127) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 169 && b === 254) return true;
	return false;
}

/**
 * The egress decision, enforced at the ONE place an image can leave the host:
 * constructing the provider that would transmit it.
 *
 * A provider is external when EITHER its declared label says so OR its endpoint
 * address is off-host — the label alone is not enough (see endpointIsLocal).
 * Refusing LOUDLY rather than falling back to the deterministic provider is
 * deliberate: the fallback would keep indexing happily and write meaningless vectors
 * under a real model's name, which is a worse failure than a stopped feature and a
 * legible error.
 */
function assertEgressAllowed(cfg: MultimodalRuntimeConfig): void {
	if (cfg.imageEgressPolicy === 'allow_external') return;
	const labelledLocal = cfg.provider === 'local';
	const addressLocal = endpointIsLocal(cfg.endpoint);
	if (labelledLocal && addressLocal) return;
	const reason = addressLocal
		? `provider '${cfg.provider}' is declared external`
		: `endpoint '${cfg.endpoint}' is not on this host or its private network`;
	throw new Error(
		`Multimodal image embedding would send object images off this host (${reason}), but DEDALO_RAG_IMAGE_EGRESS_POLICY is 'local_only'. Set it to allow_external to permit it, or point the image layer at a provider you run yourself.`,
	);
}

/**
 * Build the multimodal provider: the sidecar when an endpoint is configured, else
 * the network-free DeterministicMultimodalProvider (so the image layer works in dev
 * with NO CLIP sidecar — mirrors the text embedder fallback). The deterministic
 * provider stays 'local' so egress is never gated open.
 */
export function buildMultimodalProvider(cfg: MultimodalRuntimeConfig): MultimodalEmbeddingProvider {
	if (cfg.endpoint !== '') {
		assertEgressAllowed(cfg);
		return new SidecarMultimodalProvider({
			endpoint: cfg.endpoint,
			provider: cfg.provider,
			model: cfg.model,
			...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
		});
	}
	// The fixed model name here is NOT an oversight, and DEDALO_RAG_MULTIMODAL_MODEL
	// is deliberately not honoured: the model name is the vector partition key, so
	// naming these synthetic vectors after a real model would file them in the same
	// partition as genuine ones. Configuring a sidecar later would then search a
	// partition half-full of meaningless vectors, with nothing to distinguish them.
	// Say so out loud rather than ignoring the operator's setting in silence.
	if (cfg.model !== DEFAULT_MULTIMODAL_MODEL) {
		console.warn(
			`[rag] DEDALO_RAG_MULTIMODAL_MODEL='${cfg.model}' is ignored: no DEDALO_RAG_MULTIMODAL_ENDPOINT is configured, so images are embedded by the local deterministic provider and stored under its own model name. Set an endpoint to use that model.`,
		);
	}
	return new DeterministicMultimodalProvider({ model: 'deterministic-multimodal' });
}
