/**
 * Read-facade routing — component-source `action:'search'` reads (BUG-0,
 * 2026-07-09). PHP routes a read RQO on `source.action` alone
 * (dd_core_api.php:2050 `$action = $ddo_source->action ?? 'search'`; :2256
 * `case 'search': // Used by section and service autocomplete`) — the model
 * and section_id are never inspected. The TS facade's component get_data
 * branches used to match on `model.startsWith('component_')`, swallowing the
 * service_autocomplete picker search into the get_data-no-id empty shell:
 * the picker rendered empty for EVERY user. These tests pin the routing law:
 *
 *   - autocomplete shape (search, component source, no section_id) → the
 *     generic readSection: non-empty `typo:'sections'` entries (the BUG-0
 *     tripwire — this was `{context:[],data:[]}` before the fix);
 *   - viewer/unsaved get_data with NO section_id → the empty shell stays
 *     (the 31d13c7 deep-link 500 guard is deliberate);
 *   - component source with NO action at all → empty shell (TS residual:
 *     PHP would default the action to 'search'; no client sends this shape,
 *     documented here so the divergence is visible if one ever does);
 *   - find_equal shape (search WITH section_id, empty show.ddo_map) → served
 *     by readSection, not readComponentData (PHP parity), no throw.
 *
 * DB-BACKED, and the records are the ones this gate PROVISIONS: the repo-owned
 * corpus for test6099 (the host) and test6100 (the picker's target). The old
 * shape read whatever the ambient database happened to hold and floored the
 * picker search at "> 0 entries" with a comment counting >1000 matches on a
 * developer's install — on a suite database built from the definitions-only
 * seed there are no such records at all, so the floor measured the fixture.
 * The search term and the expected entry COUNT are now derived from the corpus
 * itself. Cases still guard on a live-connection probe so the file is honest
 * offline.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). Install tipos
// were replaced by their twins from src/core/test_data/test_tld_tipo_map.json; the
// seed-shipped ones (rsc/dd/hierarchy/ontology/lg) have no twin and stay, because they
// ship with every installation.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	dropTestCorpus,
	ensureTestCorpus,
	loadTestCorpus,
	testCorpusResidue,
} from '../../src/core/test_data/test_corpus/ensure.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const HOST_SECTION = 'test6099';
const PORTAL = 'test6157';
const TARGET_SECTION = 'test6100';
// String-family components of the target section (the picker's filter fields).
const Q_FIELD_A = 'test6224';
const Q_FIELD_B = 'test6265';

/** The exact RQO shape service_autocomplete's dedalo_engine sends (no section_id). */
function autocompleteRqo(q: string): Rqo {
	return {
		id: 'facade_routing_ac',
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			type: 'component',
			action: 'search',
			model: 'component_portal',
			tipo: PORTAL,
			section_tipo: HOST_SECTION,
			mode: 'list',
			lang: 'lg-spa',
			config: { read_only: true },
		},
		show: {
			ddo_map: [
				{
					tipo: Q_FIELD_A,
					section_tipo: TARGET_SECTION,
					model: 'component_text_area',
					parent: PORTAL,
					mode: 'list',
					label: 'Contramarca anverso',
				},
				{
					tipo: Q_FIELD_B,
					section_tipo: TARGET_SECTION,
					model: 'component_text_area',
					parent: PORTAL,
					mode: 'list',
					label: 'Contramarca reverso',
				},
			],
			fields_separator: ' | ',
			columns: [],
		},
		sqo: {
			id: 'tmp',
			mode: 'search',
			section_tipo: [TARGET_SECTION],
			filter: {
				$and: [
					{
						$or: [
							{
								q,
								path: [{ section_tipo: TARGET_SECTION, component_tipo: Q_FIELD_A }],
								q_split: true,
							},
							{
								q,
								path: [{ section_tipo: TARGET_SECTION, component_tipo: Q_FIELD_B }],
								q_split: true,
							},
						],
					},
				],
			},
			limit: 10,
			offset: 0,
			full_count: false,
			allow_sub_select_by_id: true,
			skip_projects_filter: true,
		},
	} as unknown as Rqo;
}

type ReadResult = {
	context: unknown[];
	data: { typo?: string; tipo?: string; entries?: unknown[] }[];
};

async function dispatchAsRoot(rqo: Rqo): Promise<{ status: number; result: ReadResult | false }> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const dispatched = await dispatchRqo(structuredClone(rqo), {
		requestId: 'facade-routing-test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	} as never);
	return {
		status: dispatched.status,
		result: (dispatched.body as { data: ReadResult | false }).data,
	};
}

const CORPUS_SCOPE = [HOST_SECTION, TARGET_SECTION] as const;
/** The picker's page size — the rqo above sends limit 10. */
const SEARCH_LIMIT = 10;
/** The term the picker search sends. Any single letter the corpus carries. */
const SEARCH_TERM = 'a';

/**
 * How many target records the corpus itself gives the search — computed from
 * the same JSON the provisioner writes, so the expectation moves WITH the
 * corpus and can never be satisfied by ambient rows.
 */
function corpusMatchCount(): number {
	const section = loadTestCorpus().find((entry) => entry.section_tipo === TARGET_SECTION);
	if (section === undefined) throw new Error(`corpus has no ${TARGET_SECTION} section`);
	let matches = 0;
	for (const record of section.records) {
		const strings = (record.columns as { string?: Record<string, { value?: string }[]> }).string;
		const hit = [Q_FIELD_A, Q_FIELD_B].some((field) =>
			(strings?.[field] ?? []).some((entry) => (entry.value ?? '').includes(SEARCH_TERM)),
		);
		if (hit) matches++;
	}
	return matches;
}

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false; // no shared DB on this machine — DB-backed cases skip honestly
		return;
	}
	await ensureTestCorpus(CORPUS_SCOPE);
});
afterAll(async () => {
	if (!dbReady) return;
	await dropTestCorpus(CORPUS_SCOPE);
	expect(await testCorpusResidue(CORPUS_SCOPE)).toBe(0);
});

describe('read facade routing: component-source action:search (BUG-0)', () => {
	test('autocomplete picker search reaches readSection (NOT the empty shell)', async () => {
		if (!dbReady) return;
		// The corpus decides how many rows the term matches; the picker pages at
		// SEARCH_LIMIT. Both halves come from the fixture this gate provisioned.
		const expectedEntries = Math.min(corpusMatchCount(), SEARCH_LIMIT);
		expect(expectedEntries).toBeGreaterThan(0); // non-vacuity: the corpus must feed the search
		const { status, result } = await dispatchAsRoot(autocompleteRqo(SEARCH_TERM));
		expect(status).toBe(200);
		expect(result).not.toBe(false);
		const read = result as ReadResult;
		// The BUG-0 signature was exactly {context:[],data:[]}.
		expect(read.context.length).toBeGreaterThan(0);
		const sectionsItem = read.data.find((item) => item.typo === 'sections');
		expect(sectionsItem).toBeDefined();
		expect((sectionsItem?.entries ?? []).length).toBe(expectedEntries);
		// Per-ddo values ride along so the client renders each row.
		expect(read.data.some((item) => item.tipo === Q_FIELD_A)).toBe(true);
	});

	test('viewer get_data with NO section_id keeps the empty shell (31d13c7 guard)', async () => {
		if (!dbReady) return;
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			options: {},
			source: {
				typo: 'source',
				action: 'get_data',
				model: 'component_portal',
				tipo: PORTAL,
				section_tipo: HOST_SECTION,
				mode: 'edit',
				lang: 'lg-spa',
			},
		} as unknown as Rqo;
		const { status, result } = await dispatchAsRoot(rqo);
		expect(status).toBe(200);
		expect(result).toEqual({ context: [], data: [] });
	});

	test('component source with NO action keeps the empty shell (TS residual, no client sends it)', async () => {
		if (!dbReady) return;
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			options: {},
			source: {
				typo: 'source',
				model: 'component_portal',
				tipo: PORTAL,
				section_tipo: HOST_SECTION,
				mode: 'edit',
				lang: 'lg-spa',
			},
		} as unknown as Rqo;
		const { status, result } = await dispatchAsRoot(rqo);
		expect(status).toBe(200);
		expect(result).toEqual({ context: [], data: [] });
	});

	test('find_equal shape (search WITH section_id, empty ddo_map) is served, no throw', async () => {
		if (!dbReady) return;
		const rqo = {
			id: 'facade_routing_find_equal',
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			source: {
				typo: 'source',
				type: 'component',
				action: 'search',
				model: 'component_text_area',
				tipo: Q_FIELD_A,
				section_tipo: TARGET_SECTION,
				section_id: '1',
				mode: 'edit',
				lang: 'lg-spa',
			},
			show: { ddo_map: [], fields_separator: ' | ', columns: [] },
			sqo: {
				id: 'tmp',
				mode: 'search',
				section_tipo: [TARGET_SECTION],
				filter: {
					$and: [
						{
							q: 'a',
							path: [{ section_tipo: TARGET_SECTION, component_tipo: Q_FIELD_A }],
							q_split: true,
						},
					],
				},
				limit: 1,
				offset: 0,
			},
		} as unknown as Rqo;
		const { status, result } = await dispatchAsRoot(rqo);
		expect(status).toBe(200);
		expect(result).not.toBe(false);
		// Served by the sections search (a sections envelope), not the
		// component get_data path (whose data items carry the STORED value).
		const read = result as ReadResult;
		expect(read.data.some((item) => item.typo === 'sections')).toBe(true);
	});

	test('component-source edit search keeps its explicit limit (PHP clamp is section-only)', async () => {
		if (!dbReady) return;
		// PHP dd_core_api.php:2259-61 clamps edit limit to 1 ONLY for
		// model==='section' — a component-source edit search with limit 3 must
		// return up to 3 locators, not 1 (the pre-fix TS clamp was unconditional).
		const rqo = {
			id: 'facade_routing_component_edit_limit',
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			source: {
				typo: 'source',
				type: 'component',
				action: 'search',
				model: 'component_text_area',
				tipo: Q_FIELD_A,
				section_tipo: TARGET_SECTION,
				section_id: '1',
				mode: 'edit',
				lang: 'lg-spa',
			},
			show: { ddo_map: [], fields_separator: ' | ', columns: [] },
			sqo: {
				id: 'tmp',
				mode: 'search',
				section_tipo: [TARGET_SECTION],
				filter: {
					$and: [
						{
							q: 'a',
							path: [{ section_tipo: TARGET_SECTION, component_tipo: Q_FIELD_A }],
							q_split: true,
						},
					],
				},
				limit: 3,
				offset: 0,
			},
		} as unknown as Rqo;
		const { status, result } = await dispatchAsRoot(rqo);
		expect(status).toBe(200);
		const read = result as ReadResult;
		const envelope = read.data.find((item) => item.typo === 'sections') as
			| { entries?: unknown[] }
			| undefined;
		expect(envelope).toBeDefined();
		expect((envelope?.entries ?? []).length).toBe(3);
	});

	test('section-source edit read still clamps to one record (PHP :2259-61)', async () => {
		if (!dbReady) return;
		const rqo = {
			id: 'facade_routing_section_edit_clamp',
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			source: {
				typo: 'source',
				type: 'section',
				action: 'read',
				model: 'section',
				tipo: TARGET_SECTION,
				section_tipo: TARGET_SECTION,
				mode: 'edit',
				lang: 'lg-spa',
			},
			show: { ddo_map: [], fields_separator: ' | ', columns: [] },
			sqo: {
				id: 'tmp',
				section_tipo: [TARGET_SECTION],
				limit: 5,
				offset: 0,
			},
		} as unknown as Rqo;
		const { status, result } = await dispatchAsRoot(rqo);
		expect(status).toBe(200);
		const read = result as ReadResult;
		const envelope = read.data.find((item) => item.typo === 'sections') as
			| { entries?: unknown[] }
			| undefined;
		expect(envelope).toBeDefined();
		expect((envelope?.entries ?? []).length).toBe(1);
	});
});

describe('read facade routing: related_search (WC-065)', () => {
	/** The exact RQO shape tool_transcription/tool_indexation send (component
	 * source + action related_search + sqo.mode 'related'). Before the route
	 * existed, the component-model get_data branch swallowed it into an empty
	 * component shell — the tools' parent-record <select> rendered empty. */
	function relatedSearchRqo(sectionId: number | string | undefined): Rqo {
		return {
			id: 'facade_routing_related_search',
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			options: {},
			source: {
				typo: 'source',
				type: 'component',
				action: 'related_search',
				model: 'component_portal',
				tipo: PORTAL,
				section_tipo: HOST_SECTION,
				mode: 'related_list',
				lang: 'lg-spa',
			},
			sqo: {
				id: 'tmp',
				section_tipo: ['all'],
				mode: 'related',
				limit: 10,
				offset: 0,
				full_count: false,
				filter_by_locators:
					sectionId === undefined ? [] : [{ section_tipo: TARGET_SECTION, section_id: sectionId }],
			},
		} as unknown as Rqo;
	}

	test('routes to the related-sections read, never the get_data shell', async () => {
		if (!dbReady) return;
		const { status, result } = await dispatchAsRoot(relatedSearchRqo(1));
		expect(status).toBe(200);
		expect(result).not.toBe(false);
		const read = result as ReadResult;
		// The WC-065 shape: data[0] is ALWAYS the sections item with `value`
		// (the v6-client key the tools read) — zero hits keep the empty array.
		const sections = read.data[0] as
			| { typo?: string; value?: unknown[]; entries?: unknown[] }
			| undefined;
		expect(sections?.typo).toBe('sections');
		expect(Array.isArray(sections?.value)).toBe(true);
		expect('entries' in (sections ?? {})).toBe(false);
	});

	test('missing filter_by_locators is a 400, not an empty success', async () => {
		if (!dbReady) return;
		const { status } = await dispatchAsRoot(relatedSearchRqo(undefined));
		expect(status).toBe(400);
	});
});
