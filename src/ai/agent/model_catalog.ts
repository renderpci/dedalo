/**
 * The server-defined model catalog for the in-app assistant — the ONE place
 * a deployment declares which LLMs the assistant may use and what each one's
 * egress class is (REWRITE_SPEC §8; "Memory projects" privacy requirement).
 *
 * Source: `DEDALO_AGENT_MODELS` in ../private/.env — a JSON array of entries
 * validated per request (no module cache — module_state-clean; the string is
 * tiny). FAIL-CLOSED rules:
 *   - malformed JSON or ANY invalid entry rejects the WHOLE catalog (a coded
 *     throw the handlers surface as a clear denied()) — never a partial list;
 *   - `provider:"anthropic"` entries are FORCED egress:"external" (an
 *     Anthropic API call always leaves the box; declaring it "local" is a
 *     config error and is rejected);
 *   - `provider:"openai_compatible"` requires an explicit `egress` — a
 *     deployer must consciously declare an endpoint local;
 *   - `api_key_env` NAMES another env key (read via readEnv at construction);
 *     secrets never live inside the JSON, and `publicModelList()` never
 *     exposes endpoint/api_key_env/provider-native model ids.
 *
 * Unset/empty: an implicit Anthropic-only catalog iff ANTHROPIC_API_KEY is
 * configured (zero-migration for existing deployments — today's agent_chat
 * behavior); otherwise the catalog is empty and the assistant is disabled
 * (the same fail-closed outcome as the keyless provider constructor).
 */

import { z } from 'zod';
import { readEnv } from '../../config/env.ts';
import { AnthropicProvider, defaultMaxTokens } from './anthropic_provider.ts';
import type { AgentLlmProvider } from './llm_provider.ts';
import { OpenAiCompatProvider } from './openai_compat_provider.ts';

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';

const catalogEntrySchema = z.object({
	id: z.string().regex(/^[a-z0-9_-]{1,64}$/, 'id must be [a-z0-9_-]{1,64}'),
	label: z.string().min(1).max(120),
	provider: z.enum(['anthropic', 'openai_compatible']),
	model: z.string().min(1).max(200),
	endpoint: z.string().url().optional(),
	// Only *_API_KEY / *_KEY / *_TOKEN names may be dereferenced. The value is
	// sent as an Authorization header to the entry's endpoint, so an
	// unconstrained name would let a copy-pasted catalog turn ANY env secret
	// (e.g. DEDALO_DATABASE_PASSWORD) into an outbound header. The deployer
	// owns ../private/.env, but this keeps a mis-authored catalog from
	// silently exfiltrating an unrelated secret.
	api_key_env: z
		.string()
		.regex(
			/^[A-Z0-9_]{1,80}(_API_KEY|_KEY|_TOKEN)$/,
			'api_key_env must name an env key ending in _API_KEY, _KEY or _TOKEN',
		)
		.optional(),
	egress: z.enum(['external', 'local']).optional(),
	vision: z.boolean().optional(),
	max_tokens: z.number().int().positive().optional(),
	timeout_s: z.number().int().positive().max(3600).optional(),
});

export interface CatalogModel {
	id: string;
	label: string;
	provider: 'anthropic' | 'openai_compatible';
	/** Provider-native model id — never sent to the client. */
	model: string;
	endpoint?: string;
	api_key_env?: string;
	egress: 'external' | 'local';
	vision: boolean;
	max_tokens?: number;
	timeout_s?: number;
}

/** Thrown for any catalog/config problem; handlers surface message verbatim. */
export class ModelCatalogError extends Error {}

type Env = Record<string, string | undefined>;

/** Assemble the env slice the catalog reads (readEnv: process env > private .env). */
export function defaultAgentEnv(): Env {
	return {
		DEDALO_AGENT_MODELS: readEnv('DEDALO_AGENT_MODELS'),
		ANTHROPIC_API_KEY: readEnv('ANTHROPIC_API_KEY'),
		AGENT_MODEL: readEnv('AGENT_MODEL'),
	};
}

/**
 * Parse + validate the deployment catalog. Throws ModelCatalogError on ANY
 * problem (fail-closed — a broken catalog disables the assistant, it never
 * partially works). An empty result means "assistant disabled".
 */
export function agentModelCatalog(env: Env = defaultAgentEnv()): CatalogModel[] {
	const raw = env.DEDALO_AGENT_MODELS;
	if (raw === undefined || raw.trim() === '') {
		return implicitCatalog(env);
	}
	let decoded: unknown;
	try {
		decoded = JSON.parse(raw);
	} catch {
		throw new ModelCatalogError('DEDALO_AGENT_MODELS is not valid JSON (assistant disabled)');
	}
	if (!Array.isArray(decoded)) {
		throw new ModelCatalogError('DEDALO_AGENT_MODELS must be a JSON array');
	}
	const models: CatalogModel[] = [];
	const seen = new Set<string>();
	for (const [index, entry] of decoded.entries()) {
		const parsed = catalogEntrySchema.safeParse(entry);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			throw new ModelCatalogError(
				`DEDALO_AGENT_MODELS[${index}]: ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'invalid'}`,
			);
		}
		const value = parsed.data;
		if (seen.has(value.id)) {
			throw new ModelCatalogError(`DEDALO_AGENT_MODELS[${index}]: duplicate id "${value.id}"`);
		}
		seen.add(value.id);
		if (value.provider === 'anthropic') {
			if (value.egress === 'local') {
				throw new ModelCatalogError(
					`DEDALO_AGENT_MODELS[${index}]: an anthropic entry cannot be egress "local" — API calls leave the host`,
				);
			}
			models.push({ ...value, egress: 'external', vision: value.vision ?? true });
			continue;
		}
		// openai_compatible
		if (value.endpoint === undefined) {
			throw new ModelCatalogError(
				`DEDALO_AGENT_MODELS[${index}]: openai_compatible requires "endpoint"`,
			);
		}
		if (value.egress === undefined) {
			throw new ModelCatalogError(
				`DEDALO_AGENT_MODELS[${index}]: openai_compatible requires an explicit "egress" ("local" or "external")`,
			);
		}
		models.push({ ...value, egress: value.egress, vision: value.vision ?? false });
	}
	return models;
}

/** The zero-config fallback: Anthropic-only iff a key is configured. */
function implicitCatalog(env: Env): CatalogModel[] {
	const key = env.ANTHROPIC_API_KEY;
	if (key === undefined || key === '') return [];
	const model = env.AGENT_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
	return [
		{
			id: 'default',
			label: model,
			provider: 'anthropic',
			model,
			egress: 'external',
			vision: true,
		},
	];
}

/** The client-safe projection — NO endpoint, NO api_key_env, NO native model id. */
export function publicModelList(env: Env = defaultAgentEnv()): {
	id: string;
	label: string;
	egress: 'external' | 'local';
	vision: boolean;
	default: boolean;
}[] {
	return agentModelCatalog(env).map((model, index) => ({
		id: model.id,
		label: model.label,
		egress: model.egress,
		vision: model.vision,
		default: index === 0,
	}));
}

/**
 * Resolve a per-conversation model choice against the catalog and construct
 * its provider. `modelId` undefined ⇒ the default (first) entry. Throws
 * ModelCatalogError for an unknown id or an unusable entry (e.g. missing key).
 */
export function resolveProvider(
	modelId: string | undefined,
	env: Env = defaultAgentEnv(),
): { model: CatalogModel; provider: AgentLlmProvider } {
	const catalog = agentModelCatalog(env);
	if (catalog.length === 0) {
		throw new ModelCatalogError(
			'No assistant models configured (set DEDALO_AGENT_MODELS or ANTHROPIC_API_KEY)',
		);
	}
	const model = modelId === undefined ? catalog[0] : catalog.find((m) => m.id === modelId);
	if (model === undefined) {
		throw new ModelCatalogError(`Unknown model "${modelId}" — pick one from agent_models`);
	}
	if (model.provider === 'anthropic') {
		return {
			model,
			provider: new AnthropicProvider({
				model: model.model,
				...(model.api_key_env !== undefined ? { apiKeyEnvKey: model.api_key_env } : {}),
				...(model.max_tokens !== undefined ? { maxTokens: model.max_tokens } : {}),
			}),
		};
	}
	const apiKey = model.api_key_env !== undefined ? readEnv(model.api_key_env) : undefined;
	return {
		model,
		provider: new OpenAiCompatProvider({
			// endpoint presence is enforced by agentModelCatalog above.
			endpoint: model.endpoint as string,
			model: model.model,
			...(apiKey !== undefined && apiKey !== '' ? { apiKey } : {}),
			maxTokens: model.max_tokens ?? defaultMaxTokens(),
			...(model.timeout_s !== undefined ? { timeoutMs: model.timeout_s * 1000 } : {}),
		}),
	};
}
