/**
 * get_section_terms differential — TS dispatch vs live PHP
 * dd_core_api::get_section_terms (:3482), the batch section_map term resolver
 * the graph view (client build_graph_data.js fetch_section_terms) labels its
 * nodes with. Gates: the result MAP is byte-equal for a mixed batch (termed
 * section + cross-section + duplicate + malformed locators), the lang is
 * honored, and the bad-locators error envelope matches.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay). The batch is
// written in `test`-TLD terms — `test2827` (the clone of the Spain hierarchy
// section) and `testmint1` (the clone of the numisdata6 mints thesaurus) — and
// reaches the frozen install-term interaction through `unmapRqo`; the frozen
// body is read back in test terms through `adoptTipoIdMap`. The record ids are
// FIXED (the corpus id map pairs them 1:1 with the frozen request's), replacing
// the old `SELECT … FROM matrix_hierarchy WHERE section_tipo=<Spain's terms tipo>` probe of
// whatever the ambient database happened to hold.
//
// STILL RED, and NOT a TLD binding: the cross-section leg RESOLVES
// (`testmint1_1` → "Desconocida", byte-equal to the frozen `numisdata6_1`), but
// the two termed records are refused by the corpus derive as
// `term_label_only` (src/core/test_data/test_corpus/refused.json: source records 1 and 3
// — the store revealed their labels, never a storable row), so the resolver
// answers "" where the frozen body carries the term. The gate goes green when
// the corpus can hold those two rows.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { CATEGORY_STATUS, specOf } from '../../src/core/errors/registry.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptErrorEnvelopeV2, adoptTipoIdMap } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The termed hierarchy section (was the Spain hierarchy) and the cross-section thesaurus (was numisdata6). */
const TERM_SECTION = 'test2827';
const OTHER_SECTION = 'testmint1';
/** The two records the frozen batch addressed, in corpus terms (id_map: source 1,3 ↔ test2827/1,3). */
const TERM_IDS = ['1', '3'] as const;

function adminContext(): ApiRequestContext {
	return {
		requestId: 'test',
		clientIp: '127.0.0.1',
		session: {
			userId: -1,
			username: 'root',
			isGlobalAdmin: true,
			csrfToken: 'tok',
			applicationLang: null,
			dataLang: null,
		},
		csrfCandidate: 'tok',
		principal: { userId: -1, isGlobalAdmin: true, isDeveloper: true },
	};
}

async function tsTerms(rqoExtras: Record<string, unknown>): Promise<{
	status: number;
	body: Record<string, unknown>;
}> {
	const outcome = await dispatchRqo(
		{ action: 'get_section_terms', dd_api: 'dd_core_api', ...rqoExtras } as unknown as Rqo,
		adminContext(),
	);
	return { status: outcome.status, body: outcome.body };
}

describe.if(hasPhpCredentials())('get_section_terms differential', () => {
	let client: PhpApiClient;

	beforeAll(async () => {
		await ensureTestCorpus([TERM_SECTION, OTHER_SECTION]);
		client = new PhpApiClient();
		await client.login(
			config.phpReference.username as string,
			config.phpReference.password as string,
		);
	});

	afterAll(async () => {
		expect(await dropTestCorpus([TERM_SECTION, OTHER_SECTION])).toBe(0);
	});

	async function phpTerms(rqoExtras: Record<string, unknown>): Promise<Record<string, unknown>> {
		const { body } = await client.call({
			action: 'get_section_terms',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			...rqoExtras,
		});
		return body;
	}

	/**
	 * The frozen install-term body, read in test terms (WC-2026-08-19-test-tld-replay).
	 * `matched` + a non-zero rewrite floor are the anti-vacuity check: a body that
	 * needed no rewrite would mean this is not the migrated gate.
	 */
	function adoptFrozen(body: Record<string, unknown>): Record<string, unknown> {
		const adopted = adoptTipoIdMap(body, 'section_terms_differential');
		expect(adopted.matched).toBe(true);
		expect(adopted.rewrites.tipos).toBeGreaterThan(0);
		expect(adopted.rewrites.ids).toBeGreaterThan(0);
		return adopted.body;
	}

	test('mixed batch resolves the SAME term map as PHP', async () => {
		const locators: unknown[] = [
			...TERM_IDS.map((id) => ({ section_tipo: TERM_SECTION, section_id: id })),
			// duplicate — first occurrence wins, no double entry
			{ section_tipo: TERM_SECTION, section_id: TERM_IDS[0] },
			// malformed: bad tipo grammar, missing id, non-object — all silently skipped
			{ section_tipo: 'DROP TABLE', section_id: '1' },
			{ section_tipo: TERM_SECTION },
			'not-an-object',
			// cross-section record (no thesaurus term expected; both engines must agree)
			{ section_tipo: OTHER_SECTION, section_id: '1' },
		];
		const ts = await tsTerms({ locators, lang: 'lg-spa' });
		const php = adoptFrozen(await phpTerms({ locators, lang: 'lg-spa' }));
		expect(ts.status).toBe(200);
		// TS speaks envelope v2 (`data`); the frozen PHP oracle body keeps `result`.
		expect(ts.body.data).toEqual(php.result as Record<string, unknown>);
		// the gate is not vacuous: the termed records DID resolve a term
		const resolved = ts.body.data as Record<string, unknown>;
		expect(Object.keys(resolved)).toContain(`${TERM_SECTION}_${TERM_IDS[0]}`);
		expect(typeof resolved[`${TERM_SECTION}_${TERM_IDS[0]}`]).toBe('string');
	});

	test('lang is honored identically', async () => {
		const locators = TERM_IDS.map((id) => ({ section_tipo: TERM_SECTION, section_id: id }));
		const ts = await tsTerms({ locators, lang: 'lg-eng' });
		const php = adoptFrozen(await phpTerms({ locators, lang: 'lg-eng' }));
		expect(ts.body.data).toEqual(php.result as Record<string, unknown>);
	});

	test('bad locators → the SAME refusal, restated as envelope v2 (section.bad_locators, 400)', async () => {
		const ts = await tsTerms({ locators: [] });
		const php = await phpTerms({ locators: [] });
		// The frozen PHP body is projected through the parity reconciler
		// (FROZEN_ERROR_BODIES → registry code); TS answers the registry status
		// (envelope v2: ok:false ⇒ status ∉ 2xx — ERRORS_SPEC §3).
		const adopted = adoptErrorEnvelopeV2(php);
		expect(adopted.matched).toBe(true);
		expect(adopted.kind).toBe('error');
		expect(ts.status).toBe(CATEGORY_STATUS[specOf('section.bad_locators').category]);
		expect(ts.body.ok).toBe(false);
		expect((ts.body.error as { code: string }).code).toBe(
			(adopted.projection as { error: { code: string } }).error.code,
		);
	});
});
