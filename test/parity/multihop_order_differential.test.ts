/**
 * Phase 3/6 gate: MULTI-HOP ORDER paths vs live PHP — sort a section by a
 * RELATED section's component value (coin types ordered by their Ceca's
 * name). The paged id sequence must match exactly.
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

/** The two hops: the coin-type section and the mint thesaurus it sorts by. */
const CORPUS_SECTIONS = ['test6099', 'testmint1'] as const;

const ORDER_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'section',
		tipo: 'test6099',
		section_tipo: 'test6099',
		action: 'search',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: ['test6099'],
		limit: 8,
		offset: 0,
		order: [
			{
				direction: 'ASC',
				lang: 'lg-spa',
				path: [
					{ section_tipo: 'test6099', component_tipo: 'test6113' },
					{ section_tipo: 'testmint1', component_tipo: 'testmint1002' },
				],
			},
		],
	},
	show: { ddo_map: [] },
};

let phpIds: number[] = [];
let tsIds: number[] = [];

beforeAll(async () => {
	await ensureTestCorpus([...CORPUS_SECTIONS]);
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const phpBody = (await php.call(structuredClone(ORDER_RQO) as Record<string, unknown>)).body as {
		result?: { data?: { entries?: { section_id: unknown }[] }[] };
	};
	// The frozen (install-term) reply, read in the `test` terms the RQO is
	// written in. `matched` is the totality assertion; the floors are the
	// anti-vacuity check — a reply over cloned sections cannot map with zero
	// rewrites.
	const adopted = adoptTipoIdMap(phpBody.result?.data ?? [], 'multihop_order_differential');
	expect(adopted.matched, adopted.detail ?? '').toBe(true);
	expect(adopted.rewrites.tipos).toBeGreaterThan(0);
	expect(adopted.rewrites.ids).toBeGreaterThan(0);
	phpIds = (adopted.body[0]?.entries ?? []).map((entry) => Number(entry.section_id));

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(ORDER_RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	const tsBody = tsResult.body as {
		data?: { data?: { entries?: { section_id: unknown }[] }[] };
	};
	tsIds = (tsBody.data?.data?.[0]?.entries ?? []).map((entry) => Number(entry.section_id));
}, 60000);

afterAll(async () => {
	expect(await dropTestCorpus([...CORPUS_SECTIONS])).toBe(0);
});

describe.if(hasPhpCredentials())(
	'multi-hop order differential (sort by a related section value)',
	() => {
		test('the ordered paged id sequence matches PHP', () => {
			expect(phpIds.length).toBeGreaterThan(0);
			expect(tsIds).toEqual(phpIds);
		});
	},
);
