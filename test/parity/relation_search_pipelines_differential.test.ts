/**
 * relation_children / relation_index SEARCH pipeline differential — the
 * dedicated builders ported 2026-07-10 vs the live PHP oracle.
 *
 * Corpus:
 *  - children: testtema1's hierarchy49 (paired parent hierarchy36) — operators
 *    *, !*, contain (a REAL child locator), !=, !==;
 *  - index: testtema1's hierarchy40 (dd96 references) — operators *, !*.
 *
 * Both engines run the same search RQO; the SECTIONS envelope's entries
 * (locator sets) and totals must match. component_external has no
 * differential — it has no SQL surface at all (its value is DERIVED from a
 * third-party API), so both engines refuse; the TS throw is unit-pinned.
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay-search-group).
// The RQO is written in `test`-TLD terms (the frozen PHP interaction is reached
// through `unmapRqo`) and its reply is read back through `adoptTipoIdMap`.
// `hierarchy36/40/49` are SEED-SHIPPED ontology every installation carries and
// are spelled through `seed()`.
//
// STILL RED, and NOT for a TLD reason: the situation does not exist in the
// committed test corpus. `testtema1` (the clone of the install thesaurus these
// interactions were harvested against) has NO corpus file — no term records, no
// hierarchy36 parent links, no dd96 index edges — so both pipelines correctly
// return the empty set against the frozen, populated reply. What it needs is a
// corpus derive that materializes thesaurus parent/index edges for testtema1;
// nothing in this file can supply it.

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { adoptTipoIdMap } from './normalize.ts';
import { hasPhpCredentials, PhpApiClient } from './php_client.ts';

registerSessionCleanup();

/** A SEED-SHIPPED tipo, spelled out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

const SECTION = 'testtema1';
const CHILDREN_TIPO = seed('hierarchy', 49);
const INDEX_TIPO = seed('hierarchy', 40);
/** Every `test` section stores here (test_corpus/ensure.ts, plan decision 1). */
const TEST_TABLE = 'matrix_test';

let php: PhpApiClient;
let tsContext: Parameters<typeof dispatchRqo>[1];
let childLocator: { section_tipo: string; section_id: string } | null = null;

function searchRqo(
	componentTipo: string,
	model: string,
	q: unknown,
	qOperator: string | null,
): Record<string, unknown> {
	const filterLeaf: Record<string, unknown> = {
		path: [{ section_tipo: SECTION, component_tipo: componentTipo, model }],
	};
	if (q !== null) filterLeaf.q = q;
	if (qOperator !== null) filterLeaf.q_operator = qOperator;
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			type: 'section',
			action: 'search',
			model: 'section',
			tipo: SECTION,
			section_tipo: SECTION,
			mode: 'list',
			lang: 'lg-spa',
		},
		show: { ddo_map: [], fields_separator: ' | ', columns: [] },
		sqo: {
			id: 'tmp',
			mode: 'search',
			section_tipo: [SECTION],
			filter: { $and: [filterLeaf] },
			limit: 30,
			offset: 0,
			order: [{ direction: 'ASC', path: [{ component_tipo: 'section_id' }] }],
		},
	};
}

/**
 * The read payload (`{context, data}`) of either engine: the PHP oracle carries
 * it under the frozen `result` key, the TS envelope v2 under `data`. Callers
 * pass the payload, so neither engine's envelope key leaks in here.
 */
function envelopeEntries(payload: unknown): { section_tipo: string; section_id: string }[] {
	const data =
		((payload as { data?: unknown[] } | undefined)?.data as
			| { typo?: string; entries?: { section_tipo: string; section_id: string }[] }[]
			| undefined) ?? [];
	const envelope = data.find((item) => item.typo === 'sections');
	return envelope?.entries ?? [];
}

const key = (entry: { section_tipo: string; section_id: string | number }): string =>
	`${entry.section_tipo}_${entry.section_id}`;

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
	// A REAL child of some testtema1 parent: any row holding a hierarchy36
	// dd47 parent locator IS a child — its parent is the contain target's owner;
	// the contain q is the CHILD's own locator (PHP searches parents whose
	// children include q).
	const rows = (await sql.unsafe(
		`SELECT section_tipo, section_id::text AS section_id
		 FROM ${TEST_TABLE}
		 WHERE section_tipo = $1 AND relation->$2 IS NOT NULL
		 ORDER BY section_id LIMIT 1`,
		[SECTION, seed('hierarchy', 36)],
	)) as { section_tipo: string; section_id: string }[];
	childLocator = rows[0] ?? null;
}, 120000);

async function diffCase(
	componentTipo: string,
	model: string,
	q: unknown,
	qOperator: string | null,
	expectNonEmpty: boolean,
): Promise<void> {
	const rqo = searchRqo(componentTipo, model, q, qOperator);
	// The frozen (install-term) reply, read in the `test` terms the RQO is
	// written in. `matched` is the totality assertion — an unmapped install
	// token would make the comparison below meaningless.
	const frozen = (await php.call(structuredClone(rqo))).body.result;
	const adopted = adoptTipoIdMap(frozen, 'relation_search_pipelines_differential');
	expect(adopted.matched, adopted.detail ?? '').toBe(true);
	const phpEntries = envelopeEntries(adopted.body);
	const dispatched = await dispatchRqo(structuredClone(rqo) as unknown as Rqo, tsContext);
	const tsEntries = envelopeEntries(dispatched.body.data);
	expect(tsEntries.map(key)).toEqual(phpEntries.map(key));
	if (expectNonEmpty) expect(tsEntries.length).toBeGreaterThan(0);
}

describe.if(hasPhpCredentials())('relation search pipelines differential (testtema1)', () => {
	test("children '*' (has children) matches PHP", async () => {
		if (!hasPhpCredentials()) return;
		await diffCase(CHILDREN_TIPO, 'component_relation_children', 'only_operator', '*', true);
	}, 30000);

	test("children '!*' (no children) matches PHP", async () => {
		if (!hasPhpCredentials()) return;
		// On the harvested corpus every term had children (245/245) — both engines
		// legitimately return the EMPTY set; the assertion is the set equality.
		await diffCase(CHILDREN_TIPO, 'component_relation_children', 'only_operator', '!*', false);
	}, 30000);

	test("children contain / '!=' / '!==' on a real child locator match PHP", async () => {
		if (!hasPhpCredentials()) return;
		if (childLocator === null) throw new Error(`fixture missing: no ${SECTION} child rows`);
		const q = { section_tipo: childLocator.section_tipo, section_id: childLocator.section_id };
		await diffCase(CHILDREN_TIPO, 'component_relation_children', q, null, true);
		await diffCase(CHILDREN_TIPO, 'component_relation_children', q, '!=', false);
		await diffCase(CHILDREN_TIPO, 'component_relation_children', q, '!==', true);
	}, 60000);

	test("index '*' (indexed terms) and '!*' (orphans) match PHP", async () => {
		if (!hasPhpCredentials()) return;
		await diffCase(INDEX_TIPO, 'component_relation_index', 'only_operator', '*', true);
		await diffCase(INDEX_TIPO, 'component_relation_index', 'only_operator', '!*', true);
	}, 60000);
});
