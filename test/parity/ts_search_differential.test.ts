/**
 * Tree search differential (plan A6): the area_thesaurus read branch's ts_search
 * injection vs live PHP. A keyword search (source.search_action='search' + an
 * rqo.sqo) pre-executes searchThesaurus and embeds the ancestor-expanded partial
 * tree as data[0].ts_search. This diffs that structure against PHP.
 *
 * The orchestrator owns the full sweep (deep hit, root hit, shared-branch dedup,
 * pinned hierarchy_terms, non-admin filtering); this pins the keyword-hit path.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay). The search
// RQO is written in `test`-TLD terms (`testimmovable1` + its input_text
// `testimmovable1013`, the clone of tchi1/tchi15) and reaches the frozen
// install-term interaction through `unmapRqo`; the frozen body is read back in
// test terms through `adoptTipoIdMap`. Records come from the committed corpus.
//
// STILL RED, and NOT a TLD binding: of the two records the frozen search found,
// only 602 is in the corpus — `tchi1/452` is `never_revealed`
// (src/core/test_data/test_corpus/refused.json) — and 602's reconstructed
// string item carries no `lang`, so its term comes back through the
// untranslated-lang fallback (`<mark>Tarragona</mark>`). Both are corpus
// fidelity, fixed in derive_test_corpus.ts, never by relaxing the comparison.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap, normalizeApiResponse, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

// The area tipo of the thesaurus area (a SEED-shipped `dd` node — it stays).
const AREA_TIPO = 'dd100';
/** The cloned immovables thesaurus and the input_text the filter path walks. */
const SECTION = 'testimmovable1';
const TERM_COMPONENT = 'testimmovable1013';

let php: PhpApiClient;
let tsContext: Parameters<typeof dispatchRqo>[1];

beforeAll(async () => {
	await ensureTestCorpus([SECTION]);
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	} as never;
}, 120000);

afterAll(async () => {
	expect(await dropTestCorpus([SECTION])).toBe(0);
});

describe.if(hasPhpCredentials())('area_thesaurus ts_search injection differential', () => {
	// Two live round-trips (PHP + TS) exceed the default 5s per-test budget.
	test('keyword search embeds a matching ts_search tree', async () => {
		if (!hasPhpCredentials()) return;
		// A read RQO carrying a search SQO (the client's search_action flow).
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			sqo: {
				section_tipo: [SECTION],
				limit: 5,
				filter: {
					$and: [
						{
							q: 'Tarragona',
							path: [
								{
									section_tipo: SECTION,
									component_tipo: TERM_COMPONENT,
									model: 'component_input_text',
								},
							],
						},
					],
				},
			},
			source: {
				typo: 'source',
				model: 'area_thesaurus',
				tipo: AREA_TIPO,
				section_tipo: AREA_TIPO,
				search_action: 'search',
				action: 'get_data',
				mode: 'list',
				lang: 'lg-spa',
			},
		};
		// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in test
		// terms. `matched` + a non-zero rewrite floor keep the adoption honest.
		const adoptedFrozen = adoptTipoIdMap(
			(await php.call(structuredClone(rqo))).body,
			'ts_search_differential',
		);
		expect(adoptedFrozen.matched).toBe(true);
		expect(adoptedFrozen.rewrites.tipos).toBeGreaterThan(0);
		expect(adoptedFrozen.rewrites.ids).toBeGreaterThan(0);
		const phpItem = (adoptedFrozen.body as { result?: { data?: { ts_search?: unknown }[] } }).result
			?.data?.[0]?.ts_search;
		const tsItem = (
			(await dispatchRqo(structuredClone(rqo) as never, tsContext)).body as {
				data?: { data?: { ts_search?: unknown }[] };
			}
		).data?.data?.[0]?.ts_search;
		// S2-40: assert presence FIRST — without these, an empty response on
		// both sides compared undefined===undefined and the gate passed vacuously.
		expect(phpItem).toBeDefined();
		expect(tsItem).toBeDefined();
		// Both engines must agree on the found set and the assembled node map
		// (PHP dev-mode debug/strQuery blocks stripped by normalizeApiResponse).
		// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
		expect(normalizeSectionIdTypes(normalizeApiResponse(tsItem))).toEqual(
			normalizeSectionIdTypes(normalizeApiResponse(phpItem)),
		);
	}, 60000);
});
