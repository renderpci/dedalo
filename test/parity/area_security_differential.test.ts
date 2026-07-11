/**
 * Phase D divergence pin (engineering/AREA_SPEC.md §9): the model-vs-tipo quirk. PHP
 * dispatches an area read on source.model WITHOUT checking the tipo is that
 * model — so `{model: area_ontology, tipo: dd917}` (dd917 is a field_text) is
 * ACCEPTED by PHP and returns the ontology boot data. TS REFUSES it (400): an
 * unvalidated client model string must not select server code paths.
 *
 * This is an asymmetric pin — it asserts BOTH behaviors so that if PHP ever adds
 * the validation (its output for dd917 changes to an error), this test flags the
 * moment the divergence closes.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'area_ontology',
		tipo: 'dd917', // a field_text, NOT the area_ontology node (dd5)
		section_tipo: 'dd917',
		action: 'get_data',
		mode: 'list',
		lang: 'lg-spa',
	},
};

let phpBody: { result?: { data?: unknown[] } } | null = null;
let tsStatus = 0;
let tsResultFalse = false;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	phpBody = (await php.call(structuredClone(RQO) as Record<string, unknown>)).body as {
		result?: { data?: unknown[] };
	};

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	tsStatus = tsResult.status;
	tsResultFalse = tsResult.body.result === false;
}, 60000);

describe.if(hasPhpCredentials())('model-vs-tipo quirk divergence (dd917 as area_ontology)', () => {
	test('PHP ACCEPTS the mismatch and returns boot data', () => {
		if (!hasPhpCredentials()) return;
		// PHP has no model-vs-tipo validation — it returns the ontology projection.
		expect(Array.isArray(phpBody?.result?.data)).toBe(true);
		expect(phpBody?.result?.data?.length ?? 0).toBeGreaterThan(0);
	});

	test('TS REFUSES the mismatch (400)', () => {
		if (!hasPhpCredentials()) return;
		expect(tsStatus).toBe(400);
		expect(tsResultFalse).toBe(true);
	});
});
