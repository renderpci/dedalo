/**
 * Phase 3/6 gate: autocomplete_hi relation search vs live PHP.
 *
 * FINDING (probed 2026-07-02): PHP's add_relation_search wrap is
 * LIVE-DEFECTIVE on this version — the clone clause's component_path
 * ['relation_search'] is ignored by the default-operator resolver, so the
 * emitted SQL is `relation @> $2 OR relation @> $2` (the same clause twice,
 * observed via debug strQuery). Ancestor-term searches therefore return 0 on
 * PHP itself. The TS engine's single containment clause is RESULT-EQUIVALENT
 * to that live behavior; this gate pins the equivalence on both fixtures:
 *  - a DIRECT locator (object1/2 — stored in `relation`): counts match;
 *  - an ANCESTOR-ONLY locator (object1/1 — present only in
 *    `relation_search`): both engines return 0.
 * If PHP fixes the wrap, this test will fail on the ancestor fixture and the
 * TS side should then implement the relation_search clone for real.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

function countRqo(sectionId: string): Record<string, unknown> {
	return {
		action: 'count',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: 'numisdata4',
			section_tipo: 'numisdata4',
			action: 'count',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['numisdata4'],
			limit: 10,
			offset: 0,
			filter: {
				$and: [
					{
						q: [{ section_tipo: 'object1', section_id: sectionId }],
						path: [{ section_tipo: 'numisdata4', component_tipo: 'numisdata155' }],
					},
				],
			},
		},
	};
}

async function tsTotal(rqo: Record<string, unknown>): Promise<number> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const result = await dispatchRqo(
		structuredClone(rqo) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	return Number((result.body as { result?: { total?: unknown } }).result?.total);
}

let php: PhpApiClient | null = null;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
}, 30000);

async function phpTotal(rqo: Record<string, unknown>): Promise<number> {
	const body = (await (php as PhpApiClient).call(structuredClone(rqo))).body as {
		result?: { total?: unknown };
	};
	return Number(body.result?.total);
}

describe.if(hasPhpCredentials())(
	'autocomplete_hi search differential (relation_search wrap parity)',
	() => {
		test('DIRECT locator: counts match on a large real fixture', async () => {
			if (!hasPhpCredentials()) return;
			const phpCount = await phpTotal(countRqo('2'));
			const tsCount = await tsTotal(countRqo('2'));
			expect(phpCount).toBeGreaterThan(0);
			expect(tsCount).toBe(phpCount);
			// ~5s per engine on this 131k-record containment count — the bun 5s
			// default flaked; explicit timeout per the parity-suite convention.
		}, 60000);

		test('ANCESTOR-only locator: both engines return 0 (the live PHP wrap defect)', async () => {
			if (!hasPhpCredentials()) return;
			const phpCount = await phpTotal(countRqo('1'));
			const tsCount = await tsTotal(countRqo('1'));
			// If this starts failing with phpCount > 0, PHP fixed add_relation_search —
			// implement the relation_search clone in conform.ts (see test doc).
			expect(phpCount).toBe(0);
			expect(tsCount).toBe(phpCount);
		}, 60000);
	},
);
