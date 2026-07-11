/**
 * Phase 6 gate: relation_index get_data differential — offset-aware inverse
 * paging + the pool-accumulation child quirk (locator pass i re-emits every
 * pool record so far; offset 0 seeds the pool with the pointing section's
 * representative record, later pages don't).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { adoptEntriesArrayContract } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

const CASES = [
	{ name: 'offset 0', limit: 2, offset: 0 },
	{ name: 'offset 2', limit: 3, offset: 2 },
];

function rqoOf(limit: number, offset: number): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'component_relation_index',
			tipo: 'hierarchy40',
			section_tipo: 'cult1',
			section_id: '1',
			mode: 'list',
			lang: 'lg-spa',
			action: 'get_data',
		},
		sqo: { section_tipo: ['cult1'], limit, offset },
	};
}

function comparable(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		entries: item.entries ?? null,
		pagination: item.pagination ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
		from_component_tipo: item.from_component_tipo ?? null,
	};
}

const results = new Map<
	string,
	{ php: Record<string, unknown>[]; ts: Record<string, unknown>[] }
>();

beforeAll(async () => {
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);

	for (const testCase of CASES) {
		const rqo = rqoOf(testCase.limit, testCase.offset);
		// WC-001 (unified []): rewrite the PHP side only (see engineering/WIRE_CONTRACT.md).
		const phpData = adoptEntriesArrayContract(
			((await php.call(structuredClone(rqo))).body as { result?: { data?: unknown[] } }).result
				?.data ?? [],
		) as Record<string, unknown>[];
		const tsResult = await dispatchRqo(
			structuredClone(rqo) as never,
			{
				requestId: 't',
				clientIp: '127.0.0.1',
				session,
				csrfCandidate: session?.csrfToken ?? null,
				principal,
			} as never,
		);
		const tsData = ((tsResult.body as { result?: { data?: unknown[] } }).result?.data ??
			[]) as Record<string, unknown>[];
		results.set(testCase.name, { php: phpData, ts: tsData });
	}
}, 120000);

describe.if(hasPhpCredentials())(
	'relation_index get_data differential (paging + pool children)',
	() => {
		for (const testCase of CASES) {
			test(`${testCase.name}: item sequence matches PHP`, () => {
				if (!hasPhpCredentials()) return;
				const pair = results.get(testCase.name);
				expect(pair).toBeDefined();
				const phpItems = (pair?.php ?? []).map(comparable);
				const tsItems = (pair?.ts ?? []).map(comparable);
				expect(phpItems.length).toBeGreaterThan(1);
				// ORDER matters here: the pool-accumulation duplicates are positional.
				expect(tsItems).toEqual(phpItems);
			});
		}
	},
);
