/**
 * Phase 3/6 gate: MULTI-HOP search paths vs live PHP — a filter whose path
 * traverses a relation into another section (coins' Ceca → the ceca's name).
 * Counts and the paged id set must match exactly.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay-search-group).
// The SQO is written in `test`-TLD terms; the frozen PHP interaction is reached
// through `unmapRqo` and its rows are read back through `adoptTipoIdMap`. The
// records are the committed test corpus, owned by this gate.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The two hops: the coin-type section and the mint thesaurus it relates to. */
const CORPUS_SECTIONS = ['test6099', 'testmint1'] as const;

/**
 * The frozen (install-term) reply, read in the `test` terms the SQO is written
 * in. `matched` is the totality assertion; the floors are the anti-vacuity
 * check — a reply over cloned sections cannot be mapped with zero rewrites.
 */
function adopt<T>(value: T): T {
	const adopted = adoptTipoIdMap(value, 'multihop_search_differential');
	expect(adopted.matched, adopted.detail ?? '').toBe(true);
	expect(adopted.rewrites.tipos).toBeGreaterThan(0);
	expect(adopted.rewrites.ids).toBeGreaterThan(0);
	return adopted.body;
}

function multiHopSqo(): Record<string, unknown> {
	return {
		section_tipo: ['test6099'],
		limit: 10,
		offset: 0,
		filter: {
			$and: [
				{
					q: 'Emporion',
					lang: 'lg-spa',
					path: [
						{ section_tipo: 'test6099', component_tipo: 'test6113' },
						{ section_tipo: 'testmint1', component_tipo: 'testmint1002' },
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
			tipo: 'test6099',
			section_tipo: 'test6099',
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
	return (result.body as { data?: Record<string, unknown> }).data ?? {};
}

let php: PhpApiClient | null = null;

beforeAll(async () => {
	await ensureTestCorpus([...CORPUS_SECTIONS]);
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
});

afterAll(async () => {
	expect(await dropTestCorpus([...CORPUS_SECTIONS])).toBe(0);
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
		const phpIds =
			adopt(phpBody.result?.data ?? [])[0]?.entries?.map((entry) => Number(entry.section_id)) ?? [];
		const tsResult = (await tsCall(rqoFor('search'))) as {
			data?: { entries?: { section_id: unknown }[] }[];
		};
		const tsIds = (tsResult.data?.[0]?.entries ?? []).map((entry) => Number(entry.section_id));
		expect(phpIds.length).toBeGreaterThan(0);
		expect(tsIds).toEqual(phpIds);
	});
});
