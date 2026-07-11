/**
 * Phase 6 gate: get_relation_list (the Referencias panel) vs live PHP —
 * context columns AND every value cell byte-for-byte, exercising the flat
 * display-value contract (string family joins + datalist label resolution)
 * on real data.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

function relationListRqo(limit: number, offset: number): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'relation_list',
			tipo: 'numisdata308',
			section_tipo: 'numisdata6',
			section_id: '1',
			action: 'get_relation_list',
			mode: 'edit',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['all'],
			mode: 'related',
			filter_by_locators: [{ section_tipo: 'numisdata6', section_id: '1' }],
			limit,
			offset,
		},
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

async function phpCall(rqo: Record<string, unknown>): Promise<Record<string, unknown>> {
	const result =
		(
			(await (php as PhpApiClient).call(structuredClone(rqo))).body as {
				result?: Record<string, unknown>;
			}
		).result ?? {};
	const { debug: _debug, ...rest } = result;
	return rest;
}

describe.if(hasPhpCredentials())('relation_list differential (Referencias panel)', () => {
	test('context + every value cell match PHP byte-for-byte (page 1)', async () => {
		if (!hasPhpCredentials()) return;
		const phpResult = await phpCall(relationListRqo(5, 0));
		const tsResult = await tsCall(relationListRqo(5, 0));
		expect((phpResult.data as unknown[]).length).toBeGreaterThan(0);
		expect(JSON.stringify(tsResult.context)).toBe(JSON.stringify(phpResult.context));
		expect(JSON.stringify(tsResult.data)).toBe(JSON.stringify(phpResult.data));
	});

	test('page 2 matches PHP as well (offset applied to records)', async () => {
		if (!hasPhpCredentials()) return;
		const phpResult = await phpCall(relationListRqo(5, 5));
		const tsResult = await tsCall(relationListRqo(5, 5));
		expect(JSON.stringify(tsResult.data)).toBe(JSON.stringify(phpResult.data));
	});

	test('non-edit mode returns the empty shell (PHP relation_list_json)', async () => {
		const rqo = relationListRqo(5, 0);
		(rqo.source as { mode: string }).mode = 'list';
		const tsResult = await tsCall(rqo);
		expect(tsResult).toEqual({ context: [], data: [] });
	});
});
