/**
 * Phase 6 gate: resolve_data (portal search-mode locator resolution) vs live
 * PHP — the main item (injected id-stamped entries, search mode, null record
 * identity) and every locator-target child item, compared on the normalized
 * read-differential fields.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The RQO is written in `test`-TLD terms (the autocomplete numisdata30 →
// test6113 on the coins section numisdata3 → test6099, resolving a locator
// into the cloned mint thesaurus numisdata6/1 → testmint1/1) and the frozen
// PHP interaction is reached through `unmapRqo` (fixture lookup) +
// `adoptTipoIdMap` (the frozen body, read in test-TLD terms). The resolved
// record comes from the committed corpus.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptEntriesArrayContract, adoptTipoIdMap, normalizeSectionIdTypes } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The cloned coins section, its cloned autocomplete, and the resolved term. */
const SECTION = 'test6099';
const AUTOCOMPLETE = 'test6113';
const TARGET_SECTION = 'testmint1';
/** The corpus this gate OWNS: the record the resolved locator points at. */
const CORPUS_SCOPE = [TARGET_SECTION];

const RESOLVE_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'component_autocomplete',
		tipo: AUTOCOMPLETE,
		section_tipo: SECTION,
		section_id: null,
		mode: 'search',
		lang: 'lg-spa',
		action: 'resolve_data',
		value: [
			{
				section_tipo: TARGET_SECTION,
				section_id: '1',
				type: 'dd151',
				from_component_tipo: AUTOCOMPLETE,
			},
		],
	},
	sqo: { section_tipo: [SECTION], limit: 10, offset: 0 },
};

function comparableItem(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		from_component_tipo: item.from_component_tipo ?? null,
		entries: item.entries ?? null,
		fallback_value: item.fallback_value ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
		parent_section_id: item.parent_section_id ?? null,
		pagination: item.pagination ?? null,
	};
}

let phpData: Record<string, unknown>[] = [];
let tsData: Record<string, unknown>[] = [];

beforeAll(async () => {
	await ensureTestCorpus(CORPUS_SCOPE);
	if (!hasPhpCredentials()) return;
	const php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
	const phpResult = await php.call(structuredClone(RESOLVE_RQO) as Record<string, unknown>);
	// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
	// test-TLD terms. `detail === null` is `matched === true` carrying its own
	// reason; the rewrite floors are the anti-vacuity check.
	const adopted = adoptTipoIdMap(phpResult.body, 'resolve_data_differential');
	expect(adopted.detail).toBeNull();
	expect(adopted.matched).toBe(true);
	expect(adopted.rewrites.tipos).toBeGreaterThan(0);
	expect(adopted.rewrites.ids).toBeGreaterThan(0);
	// WC-001 (unified []): PHP emits entries:null for empty values; the TS
	// engine emits [] for EVERY model. Rewrite the PHP side only.
	// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
	phpData = normalizeSectionIdTypes(
		adoptEntriesArrayContract(
			(adopted.body as { result?: { data?: unknown[] } }).result?.data ?? [],
		) as Record<string, unknown>[],
	);

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(RESOLVE_RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	// WC-2026-08-10-section-id-int-canonical: address keys compared by VALUE on BOTH sides (fixtures keep the PHP-era numeric strings).
	tsData = normalizeSectionIdTypes(
		((tsResult.body as { data?: { data?: unknown[] } }).data?.data ?? []) as Record<
			string,
			unknown
		>[],
	);
});

afterAll(async () => {
	expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
});

describe.if(hasPhpCredentials())('resolve_data differential (portal search chips)', () => {
	test('the main item carries the injected id-stamped entries in search mode', () => {
		if (!hasPhpCredentials()) return;
		const phpMain = phpData.find((item) => item.tipo === AUTOCOMPLETE);
		const tsMain = tsData.find((item) => item.tipo === AUTOCOMPLETE);
		expect(phpMain).toBeDefined();
		expect(comparableItem(tsMain as Record<string, unknown>)).toEqual(
			comparableItem(phpMain as Record<string, unknown>),
		);
	});

	test('every locator-target child item matches PHP on the normalized fields', () => {
		if (!hasPhpCredentials()) return;
		const keyOf = (item: Record<string, unknown>): string =>
			`${item.tipo}|${item.section_tipo}|${item.section_id}`;
		const phpByKey = new Map(
			phpData.filter((item) => item.tipo !== AUTOCOMPLETE).map((item) => [keyOf(item), item]),
		);
		const tsByKey = new Map(
			tsData.filter((item) => item.tipo !== AUTOCOMPLETE).map((item) => [keyOf(item), item]),
		);
		expect([...tsByKey.keys()].sort()).toEqual([...phpByKey.keys()].sort());
		for (const [key, phpItem] of phpByKey) {
			expect(comparableItem(tsByKey.get(key) as Record<string, unknown>)).toEqual(
				comparableItem(phpItem),
			);
		}
	});
});
