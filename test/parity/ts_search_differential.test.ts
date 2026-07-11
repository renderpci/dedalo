/**
 * Tree search differential (plan A6): the area_thesaurus read branch's ts_search
 * injection vs live PHP. A keyword search (source.search_action='search' + an
 * rqo.sqo) pre-executes searchThesaurus and embeds the ancestor-expanded partial
 * tree as data[0].ts_search. This diffs that structure against PHP.
 *
 * The orchestrator owns the full sweep (deep hit, root hit, shared-branch dedup,
 * pinned hierarchy_terms, non-admin filtering); this pins the keyword-hit path.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { normalizeApiResponse } from './normalize.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

// The area tipo of a thesaurus area whose properties gate the tchi hierarchy.
const AREA_TIPO = 'dd100';

let php: PhpApiClient;
let tsContext: Parameters<typeof dispatchRqo>[1];

beforeAll(async () => {
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
				section_tipo: ['tchi1'],
				limit: 5,
				filter: {
					$and: [
						{
							q: 'Tarragona',
							path: [
								{ section_tipo: 'tchi1', component_tipo: 'tchi15', model: 'component_input_text' },
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
		const phpItem = (
			(await php.call(structuredClone(rqo))).body as {
				result?: { data?: { ts_search?: unknown }[] };
			}
		).result?.data?.[0]?.ts_search;
		const tsItem = (
			(await dispatchRqo(structuredClone(rqo) as never, tsContext)).body as {
				result?: { data?: { ts_search?: unknown }[] };
			}
		).result?.data?.[0]?.ts_search;
		// S2-40: assert presence FIRST — without these, an empty response on
		// both sides compared undefined===undefined and the gate passed vacuously.
		expect(phpItem).toBeDefined();
		expect(tsItem).toBeDefined();
		// Both engines must agree on the found set and the assembled node map
		// (PHP dev-mode debug/strQuery blocks stripped by normalizeApiResponse).
		expect(normalizeApiResponse(tsItem)).toEqual(normalizeApiResponse(phpItem));
	}, 60000);
});
