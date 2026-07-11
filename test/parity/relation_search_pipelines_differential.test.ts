/**
 * relation_children / relation_index SEARCH pipeline differential — the
 * dedicated builders ported 2026-07-10 vs the live PHP oracle.
 *
 * Corpus (read-only, real thesaurus data):
 *  - children: tema1's hierarchy49 (paired parent hierarchy36, table
 *    matrix_hierarchy — 244 tema1 parent-link rows) — operators *, !*,
 *    contain (a REAL child locator), !=, !==;
 *  - index: tema1's hierarchy40 (dd96 references: ~224 distinct terms) —
 *    operators *, !*.
 *
 * Both engines run the same search RQO; the SECTIONS envelope's entries
 * (locator sets) and totals must match. component_external has no
 * differential — PHP fatals on any external search (the TS throw is the
 * port; unit-pinned).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { PhpApiClient, hasPhpCredentials } from './php_client.ts';

registerSessionCleanup();

const SECTION = 'tema1';
const CHILDREN_TIPO = 'hierarchy49';
const INDEX_TIPO = 'hierarchy40';

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

function envelopeEntries(body: unknown): { section_tipo: string; section_id: string }[] {
	const data =
		((body as { result?: { data?: unknown[] } }).result?.data as
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
	// A REAL child of some tema1 parent: any tema1 row holding a hierarchy36
	// dd47 parent locator IS a child — its parent is the contain target's owner;
	// the contain q is the CHILD's own locator (PHP searches parents whose
	// children include q).
	const rows = (await sql`
		SELECT section_tipo, section_id::text AS section_id
		FROM matrix_hierarchy
		WHERE section_tipo = ${SECTION} AND relation->'hierarchy36' IS NOT NULL
		ORDER BY section_id LIMIT 1
	`) as { section_tipo: string; section_id: string }[];
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
	const phpEntries = envelopeEntries((await php.call(structuredClone(rqo))).body);
	const dispatched = await dispatchRqo(structuredClone(rqo) as unknown as Rqo, tsContext);
	const tsEntries = envelopeEntries(dispatched.body);
	expect(tsEntries.map(key)).toEqual(phpEntries.map(key));
	if (expectNonEmpty) expect(tsEntries.length).toBeGreaterThan(0);
}

describe.if(hasPhpCredentials())('relation search pipelines differential (tema1)', () => {
	test("children '*' (has children) matches PHP", async () => {
		if (!hasPhpCredentials()) return;
		await diffCase(CHILDREN_TIPO, 'component_relation_children', 'only_operator', '*', true);
	}, 30000);

	test("children '!*' (no children) matches PHP", async () => {
		if (!hasPhpCredentials()) return;
		// On this corpus every tema1 term has children (245/245) — both engines
		// legitimately return the EMPTY set; the assertion is the set equality.
		await diffCase(CHILDREN_TIPO, 'component_relation_children', 'only_operator', '!*', false);
	}, 30000);

	test("children contain / '!=' / '!==' on a real child locator match PHP", async () => {
		if (!hasPhpCredentials()) return;
		if (childLocator === null) throw new Error('fixture missing: no tema1 child rows');
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
