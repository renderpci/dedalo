/**
 * Phase 3/6 gate: count with SQO mode 'related' (+ group_by) vs live PHP —
 * the relation_list paginator total and its per-section breakdown.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The RQO is written in `test`-TLD terms (the relation_list numisdata308 →
// testcatalogs1010 on numisdata6/1 → testmint1/1) and the frozen PHP counts
// are reached through `unmapRqo` (fixture lookup) + `adoptTipoIdMap`.
//
// KNOWN RED — CORPUS SCALE, NOT A TLD BINDING (measured 2026-08-19). What this
// gate compares IS a count over the whole relation graph: the frozen answer is
// 57, every record in the install that relates to numisdata6/1. The committed
// corpus holds ONE edge into testmint1/1 (the frozen store never revealed the
// other 56 as records — `never_revealed`), so the totals cannot be equal by
// construction and the comparison is left VERBATIM rather than reshaped into
// something a corpus can satisfy. It goes green when the corpus can speak for
// the pointing records, or when this gate's scale field is declared in
// CORPUS_SCALE_FIELDS (test/parity/normalize.ts) the way the relation_index
// pagination total is.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { dropTestCorpus, ensureTestCorpus } from '../../src/core/test_data/test_corpus/ensure.ts';
import { adoptTipoIdMap } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

/** The cloned mint thesaurus and the cloned relation_list that counts its edges. */
const SECTION = 'testmint1';
const RELATION_LIST = 'testcatalogs1010';
/** The corpus this gate OWNS: the counted record's own section. */
const CORPUS_SCOPE = [SECTION];

function countRqo(groupBy?: string[]): Record<string, unknown> {
	return {
		action: 'count',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'relation_list',
			tipo: RELATION_LIST,
			section_tipo: SECTION,
			section_id: '1',
			action: 'count',
			mode: 'edit',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['all'],
			mode: 'related',
			filter_by_locators: [{ section_tipo: SECTION, section_id: '1' }],
			...(groupBy !== undefined ? { group_by: groupBy } : {}),
		},
	};
}

async function tsCount(rqo: Record<string, unknown>): Promise<Record<string, unknown>> {
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
	await ensureTestCorpus(CORPUS_SCOPE);
	if (!hasPhpCredentials()) return;
	php = new PhpApiClient();
	await php.login(config.phpReference.username as string, config.phpReference.password as string);
});

afterAll(async () => {
	expect(await dropTestCorpus(CORPUS_SCOPE)).toBe(0);
});

async function phpCount(rqo: Record<string, unknown>): Promise<Record<string, unknown>> {
	const body = (await (php as PhpApiClient).call(structuredClone(rqo))).body;
	// WC-2026-08-19-test-tld-replay: the frozen install-term body, read in
	// test-TLD terms (`totals_group` is keyed by section tipo).
	const adopted = adoptTipoIdMap(body, 'related_count_differential');
	expect(adopted.detail).toBeNull();
	expect(adopted.matched).toBe(true);
	const result = (adopted.body as { result?: Record<string, unknown> }).result ?? {};
	const { debug: _debug, ...rest } = result;
	return rest;
}

describe.if(hasPhpCredentials())('related count differential (relation_list totals)', () => {
	test('the plain total matches PHP', async () => {
		if (!hasPhpCredentials()) return;
		const phpResult = await phpCount(countRqo());
		const tsResult = await tsCount(countRqo());
		expect(Number(phpResult.total)).toBeGreaterThan(0);
		expect(tsResult).toEqual(phpResult);
	});

	test('group_by section_tipo yields the same per-group totals', async () => {
		if (!hasPhpCredentials()) return;
		const phpResult = await phpCount(countRqo(['section_tipo']));
		const tsResult = await tsCount(countRqo(['section_tipo']));
		expect(tsResult.total).toEqual(phpResult.total);
		// PHP appends one entry per UNION-arm row; order can differ — compare sorted.
		const sortKey = (entry: { key: string[]; value: number }): string =>
			`${entry.key.join('|')}=${entry.value}`;
		const phpGroups = ((phpResult.totals_group ?? []) as { key: string[]; value: number }[])
			.map(sortKey)
			.sort();
		const tsGroups = ((tsResult.totals_group ?? []) as { key: string[]; value: number }[])
			.map(sortKey)
			.sort();
		expect(tsGroups).toEqual(phpGroups);
	});

	test('invalid group_by identifiers are dropped (never interpolated)', async () => {
		const result = await tsCount(countRqo(['section_tipo; DROP TABLE matrix', 'section_tipo']));
		expect(Number(result.total)).toBeGreaterThan(0);
		const groups = (result.totals_group ?? []) as { key: string[] }[];
		// Only the valid identifier survived — keys have exactly one element.
		expect(groups.every((group) => group.key.length === 1)).toBe(true);
	});
});
