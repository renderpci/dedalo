/**
 * Phase 3/6 gate: MULTI-HOP search paths vs live PHP — a filter whose path
 * traverses a relation into another section (coins' Ceca → the ceca's name).
 * Counts and the paged id set must match exactly.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

function multiHopSqo(): Record<string, unknown> {
	return {
		section_tipo: ['numisdata3'],
		limit: 10,
		offset: 0,
		filter: {
			$and: [
				{
					q: 'Emporion',
					lang: 'lg-spa',
					path: [
						{ section_tipo: 'numisdata3', component_tipo: 'numisdata30' },
						{ section_tipo: 'numisdata6', component_tipo: 'numisdata16' },
					],
				},
			],
		},
		order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
	};
}

function rqoFor(action: 'count' | 'search'): Record<string, unknown> {
	return {
		action: action === 'count' ? 'count' : 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: 'numisdata3',
			section_tipo: 'numisdata3',
			action: action === 'count' ? 'count' : 'search',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: multiHopSqo(),
	};
}

async function tsCall(rqo: Record<string, unknown>): Promise<Record<string, unknown>> {
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
	return (result.body as { result?: Record<string, unknown> }).result ?? {};
}

let php: PhpApiClient | null = null;

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
});

describe.if(hasPhpCredentials())('multi-hop search differential (relation joins)', () => {
	test('the 2-hop count matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const phpBody = (await (php as PhpApiClient).call(rqoFor('count'))).body as {
			result?: { total?: number };
		};
		const tsResult = await tsCall(rqoFor('count'));
		expect(Number(phpBody.result?.total)).toBeGreaterThan(0);
		expect(Number(tsResult.total)).toBe(Number(phpBody.result?.total));
	});

	test('the 2-hop paged record set matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const phpBody = (await (php as PhpApiClient).call(rqoFor('search'))).body as {
			result?: { data?: { entries?: { section_id: unknown }[] }[] };
		};
		const phpIds = (phpBody.result?.data?.[0]?.entries ?? []).map((entry) =>
			Number(entry.section_id),
		);
		const tsResult = (await tsCall(rqoFor('search'))) as {
			data?: { entries?: { section_id: unknown }[] }[];
		};
		const tsIds = (tsResult.data?.[0]?.entries ?? []).map((entry) => Number(entry.section_id));
		expect(phpIds.length).toBeGreaterThan(0);
		expect(tsIds).toEqual(phpIds);
	});
});
