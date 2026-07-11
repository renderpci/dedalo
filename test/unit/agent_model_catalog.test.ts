/**
 * Gate: the assistant model catalog (DEDALO_AGENT_MODELS) — the fail-closed
 * parse/validate rules, the zero-config implicit Anthropic fallback, the
 * secret-free public projection, and per-conversation resolution.
 *
 * Pure/offline: the catalog functions take an injected env map; only the
 * provider-construction tests touch process.env (saved/restored).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { AnthropicProvider } from '../../src/ai/agent/anthropic_provider.ts';
import {
	ModelCatalogError,
	agentModelCatalog,
	publicModelList,
	resolveProvider,
} from '../../src/ai/agent/model_catalog.ts';

const VALID_CATALOG = JSON.stringify([
	{
		id: 'claude',
		label: 'Claude Opus 4.8',
		provider: 'anthropic',
		model: 'claude-opus-4-8',
		egress: 'external',
		vision: true,
	},
	{
		id: 'llama-local',
		label: 'Llama 3.1 (local)',
		provider: 'openai_compatible',
		model: 'llama3.1:70b',
		endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
		egress: 'local',
		timeout_s: 120,
	},
]);

describe('agent model catalog — parse/validate (fail-closed)', () => {
	test('a valid catalog parses; defaults applied (vision, forced fields)', () => {
		const models = agentModelCatalog({ DEDALO_AGENT_MODELS: VALID_CATALOG });
		expect(models.length).toBe(2);
		expect(models[0]?.id).toBe('claude');
		expect(models[0]?.egress).toBe('external');
		expect(models[1]?.egress).toBe('local');
		// vision defaults: anthropic true, openai_compatible false
		expect(models[0]?.vision).toBe(true);
		expect(models[1]?.vision).toBe(false);
	});

	test('malformed JSON rejects the whole catalog', () => {
		expect(() => agentModelCatalog({ DEDALO_AGENT_MODELS: '{not json' })).toThrow(
			ModelCatalogError,
		);
	});

	test('a non-array document is rejected', () => {
		expect(() => agentModelCatalog({ DEDALO_AGENT_MODELS: '{"id":"x"}' })).toThrow(
			ModelCatalogError,
		);
	});

	test('one invalid entry rejects the WHOLE catalog (never a partial list)', () => {
		const catalog = JSON.stringify([
			JSON.parse(VALID_CATALOG)[0],
			{ id: 'bad entry with spaces', label: 'x', provider: 'anthropic', model: 'm' },
		]);
		expect(() => agentModelCatalog({ DEDALO_AGENT_MODELS: catalog })).toThrow(ModelCatalogError);
	});

	test('duplicate ids are rejected', () => {
		const entry = JSON.parse(VALID_CATALOG)[0];
		const catalog = JSON.stringify([entry, entry]);
		expect(() => agentModelCatalog({ DEDALO_AGENT_MODELS: catalog })).toThrow(/duplicate id/);
	});

	test('an anthropic entry declared egress "local" is a config error', () => {
		const catalog = JSON.stringify([
			{ id: 'a', label: 'A', provider: 'anthropic', model: 'claude-opus-4-8', egress: 'local' },
		]);
		expect(() => agentModelCatalog({ DEDALO_AGENT_MODELS: catalog })).toThrow(/local/);
	});

	test('openai_compatible requires an explicit egress declaration', () => {
		const catalog = JSON.stringify([
			{
				id: 'o',
				label: 'O',
				provider: 'openai_compatible',
				model: 'm',
				endpoint: 'http://127.0.0.1:8000/v1/chat/completions',
			},
		]);
		expect(() => agentModelCatalog({ DEDALO_AGENT_MODELS: catalog })).toThrow(/egress/);
	});

	test('api_key_env may only name a *_API_KEY/_KEY/_TOKEN env var (exfil footgun)', () => {
		// The named value is sent as an Authorization header to the entry's
		// endpoint; an unconstrained name would let a mis-authored catalog ship
		// an unrelated secret (e.g. the DB password) to a third party.
		const withDbPassword = JSON.stringify([
			{
				id: 'x',
				label: 'X',
				provider: 'openai_compatible',
				model: 'm',
				endpoint: 'https://attacker.example/v1/chat/completions',
				api_key_env: 'DEDALO_DATABASE_PASSWORD',
				egress: 'external',
			},
		]);
		expect(() => agentModelCatalog({ DEDALO_AGENT_MODELS: withDbPassword })).toThrow(/api_key_env/);

		for (const name of ['MY_API_KEY', 'VLLM_KEY', 'OLLAMA_TOKEN']) {
			const ok = JSON.stringify([
				{
					id: 'x',
					label: 'X',
					provider: 'openai_compatible',
					model: 'm',
					endpoint: 'http://127.0.0.1:8000/v1/chat/completions',
					api_key_env: name,
					egress: 'local',
				},
			]);
			expect(agentModelCatalog({ DEDALO_AGENT_MODELS: ok })[0]?.api_key_env).toBe(name);
		}
	});

	test('openai_compatible requires an endpoint', () => {
		const catalog = JSON.stringify([
			{ id: 'o', label: 'O', provider: 'openai_compatible', model: 'm', egress: 'local' },
		]);
		expect(() => agentModelCatalog({ DEDALO_AGENT_MODELS: catalog })).toThrow(/endpoint/);
	});
});

describe('agent model catalog — implicit zero-config fallback', () => {
	test('unset catalog + ANTHROPIC_API_KEY ⇒ single implicit external Anthropic entry', () => {
		const models = agentModelCatalog({ ANTHROPIC_API_KEY: 'k', AGENT_MODEL: 'claude-opus-4-8' });
		expect(models.length).toBe(1);
		expect(models[0]?.id).toBe('default');
		expect(models[0]?.provider).toBe('anthropic');
		expect(models[0]?.egress).toBe('external');
	});

	test('unset catalog + no key ⇒ empty catalog (assistant disabled)', () => {
		expect(agentModelCatalog({})).toEqual([]);
	});
});

describe('agent model catalog — public projection is secret-free', () => {
	test('publicModelList never exposes endpoint/api_key_env/native model', () => {
		const withSecrets = JSON.stringify([
			{
				id: 'x',
				label: 'X',
				provider: 'openai_compatible',
				model: 'native-model-id',
				endpoint: 'http://internal-host:8000/v1/chat/completions',
				api_key_env: 'MY_SECRET_KEY',
				egress: 'local',
			},
		]);
		const list = publicModelList({ DEDALO_AGENT_MODELS: withSecrets });
		expect(list.length).toBe(1);
		const serialized = JSON.stringify(list);
		expect(serialized).not.toContain('internal-host');
		expect(serialized).not.toContain('MY_SECRET_KEY');
		expect(serialized).not.toContain('native-model-id');
		expect(list[0]).toEqual({ id: 'x', label: 'X', egress: 'local', vision: false, default: true });
	});

	test('the first entry is flagged default', () => {
		const list = publicModelList({ DEDALO_AGENT_MODELS: VALID_CATALOG });
		expect(list[0]?.default).toBe(true);
		expect(list[1]?.default).toBe(false);
	});
});

describe('agent model catalog — resolveProvider', () => {
	const savedEnv: Record<string, string | undefined> = {};

	beforeAll(() => {
		for (const key of ['ANTHROPIC_API_KEY', 'UNSET_TEST_API_KEY']) {
			savedEnv[key] = process.env[key];
		}
		process.env.ANTHROPIC_API_KEY = 'test-key-never-used';
		// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
		delete process.env.UNSET_TEST_API_KEY;
	});

	afterAll(() => {
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	test('empty catalog throws a clear operator error', () => {
		expect(() => resolveProvider(undefined, {})).toThrow(/No assistant models configured/);
	});

	test('unknown id throws with a hint to agent_models', () => {
		expect(() => resolveProvider('nope', { DEDALO_AGENT_MODELS: VALID_CATALOG })).toThrow(
			/Unknown model/,
		);
	});

	test('undefined id resolves the default (first) entry', () => {
		const { model, provider } = resolveProvider(undefined, {
			DEDALO_AGENT_MODELS: VALID_CATALOG,
		});
		expect(model.id).toBe('claude');
		expect(provider).toBeInstanceOf(AnthropicProvider);
	});

	test('an openai_compatible entry resolves to the compat provider', () => {
		const { model, provider } = resolveProvider('llama-local', {
			DEDALO_AGENT_MODELS: VALID_CATALOG,
		});
		expect(model.egress).toBe('local');
		expect(provider.name).toBe('openai_compatible');
	});

	test('an anthropic entry with an UNSET api_key_env fails closed at construction', () => {
		const catalog = JSON.stringify([
			{
				id: 'a',
				label: 'A',
				provider: 'anthropic',
				model: 'claude-opus-4-8',
				api_key_env: 'UNSET_TEST_API_KEY',
			},
		]);
		expect(() => resolveProvider('a', { DEDALO_AGENT_MODELS: catalog })).toThrow(
			/UNSET_TEST_API_KEY/,
		);
	});
});
