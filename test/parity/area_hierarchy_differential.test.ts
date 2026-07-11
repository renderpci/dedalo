/**
 * Phase 6 gate: the thesaurus / ontology tree-area boot data vs live PHP
 * (area_thesaurus_json — active hierarchies projection + typologies). Both
 * areas must serialize byte-equal: 37 thesaurus hierarchies (skips applied:
 * inactive, no target/typology/root-terms/children_tipo) and all 80 ontology
 * entries (no skips, children ontology14, typology pinned '14').
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const CASES = [
	{ model: 'area_thesaurus', tipo: 'dd100' },
	// The REAL area_ontology tipo (was 'dd917', a field_text — see the model-vs-
	// tipo quirk pinned in area_model_tipo_validation.test.ts; the boot data is
	// independent of the area tipo, so this only anchors item.tipo to dd5).
	{ model: 'area_ontology', tipo: 'dd5' },
];

const results = new Map<
	string,
	{
		php: Record<string, unknown>;
		ts: Record<string, unknown>;
		phpContext: Record<string, unknown>[];
		tsContext: Record<string, unknown>[];
	}
>();

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);

	for (const testCase of CASES) {
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			source: {
				typo: 'source',
				model: testCase.model,
				tipo: testCase.tipo,
				section_tipo: testCase.tipo,
				action: 'get_data',
				mode: 'list',
				lang: 'lg-spa',
			},
		};
		const phpResult = (await php.call(structuredClone(rqo))).body as {
			result?: { data?: Record<string, unknown>[]; context?: Record<string, unknown>[] };
		};
		const tsResult = (
			await dispatchRqo(
				structuredClone(rqo) as never,
				{
					requestId: 't',
					clientIp: '127.0.0.1',
					session,
					csrfCandidate: session?.csrfToken ?? null,
					principal,
				} as never,
			)
		).body as {
			result?: { data?: Record<string, unknown>[]; context?: Record<string, unknown>[] };
		};
		results.set(testCase.model, {
			php: (phpResult.result?.data?.[0] ?? {}) as Record<string, unknown>,
			ts: (tsResult.result?.data?.[0] ?? {}) as Record<string, unknown>,
			phpContext: phpResult.result?.context ?? [],
			tsContext: tsResult.result?.context ?? [],
		});
	}
}, 120000);

describe.if(hasPhpCredentials())('tree-area boot data differential (thesaurus + ontology)', () => {
	for (const testCase of CASES) {
		test(`${testCase.model} value + typologies match PHP byte-for-byte`, () => {
			if (!hasPhpCredentials()) return;
			const pair = results.get(testCase.model);
			expect(pair).toBeDefined();
			const phpValue = pair?.php.value as unknown[];
			expect(Array.isArray(phpValue)).toBe(true);
			expect(phpValue.length).toBeGreaterThan(10);
			expect(pair?.ts.value).toEqual(pair?.php.value);
			expect(pair?.ts.typologies).toEqual(pair?.php.typologies);
			expect(pair?.ts.tipo).toBe(pair?.php.tipo as string);
		});

		// The client (area_thesaurus.js:547) bails when result.context is empty —
		// an empty context left both tree areas BLANK in the browser even though
		// the data matched. Pin the non-empty context + its client-load-bearing
		// fields against PHP so the regression cannot recur.
		test(`${testCase.model} returns a non-empty context matching PHP (client render contract)`, () => {
			if (!hasPhpCredentials()) return;
			const pair = results.get(testCase.model);
			expect(pair).toBeDefined();
			expect(pair?.tsContext.length).toBe(1);
			const php = pair?.phpContext[0] ?? {};
			const ts = pair?.tsContext[0] ?? {};
			for (const key of ['tipo', 'model', 'type', 'typo', 'section_tipo', 'thesaurus_mode']) {
				expect({ key, value: ts[key] }).toEqual({ key, value: php[key] });
			}
			// request_config MUST be a non-empty array (the client calls
			// context.request_config.find(...) unguarded — a missing key crashes
			// the render). Byte-equal to PHP's 'main' skeleton.
			expect(Array.isArray(ts.request_config)).toBe(true);
			expect(ts.request_config).toEqual(php.request_config);
		});
	}
});
