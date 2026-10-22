/**
 * D1 + D3 (owner decisions 2026-10-21) — THE RELATED SEARCH ANSWERS ONE SCOPED
 * QUESTION, AND A NON-SUPERUSER MAY ASK IT.
 *
 * D1 — ONE SCOPE PREDICATE. The related search (sqo.mode 'related': the
 * References panel, its graph, the tools' related_search) has three askers —
 * the paginator COUNT (dd_core_api count), the PAGE (get_relation_list /
 * related_search → findInverseReferences) and the past-the-page PROBE
 * (anyInverseReferencePast, the search.page_clamped decision). They must
 * answer about the SAME record set, or the paginator lies: before, the page
 * windowed the UNSCOPED owner sequence and dropped hidden records afterwards,
 * while the non-admin count enumerated every owner into JS and filtered there
 * — so a reader walking ceil(total / limit) pages saw FEWER records than the
 * total announced, and the count's cost grew with the hidden references.
 * Pinned here, for a non-admin with PARTIAL project scope and one referencing
 * section it cannot read, on a situation this file builds:
 *   - count == the length of the full paged walk the client does (pages
 *     0 .. ceil(total/limit)-1) == the probe's boundary (something past
 *     total-1, nothing past total) — at several limits, on both page doors;
 *   - the walk is EXACTLY the in-scope referrers: nothing out of scope leaks,
 *     nothing in scope is lost, no record twice;
 *   - the admin control sees every referrer (the contrast is live);
 *   - THE QUERY BUDGET: the reader's count costs the same statements and the
 *     same rows on a host with 3 hidden referrers and on one with 80 — no
 *     statement of the related search carries more rows than the sections in
 *     play (+1): the count is bounded SQL, never an owner enumeration.
 *
 * D3 — GATE THE HOST, NOT THE LITERAL ['all']. The panel and the graph send
 * sqo.section_tipo ['all'] (relation_list.js, build_graph_data.js). Gate B read
 * 'all' as a section tipo, so every non-superuser got perm.denied. For mode
 * 'related' the gate is the HOST locator's section (filter_by_locators); the
 * rows stay scoped by D1's predicate. Pinned: a reader with read on the host
 * gets 200 + only in-scope referrers (read on both doors, and count); a host in
 * a section the reader may not read is 403 on read AND count; the admin is the
 * positive control there; and past the host gate 'all' is still no section (a
 * related sqo without a relation route is refused by the search's identifier
 * gate, for the reader exactly as for the admin).
 *
 * Wire: WC-2026-10-22-related-search-one-scope.
 *
 * Situation `zzrsq` (matrix_test via test24), swept with a residue-0 assertion.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { runWithQueryTap } from '../../src/core/db/query_tap.ts';
import { clearUserFilterRecordsCache } from '../../src/core/security/filter_records.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	ensureSuiteProjectsFixture,
	removeSuiteProjectsFixture,
	SUITE_SECOND_PROJECT_ID,
} from '../../src/core/test_data/projects_fixture.ts';
import {
	dropSituation,
	ensureSituation,
	type SituationRecord,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import {
	ACL_NON_ADMIN_PROFILE_ID,
	ACL_NON_ADMIN_USER_ID,
	ACL_PROJECT_ID,
	clearAclIdentityCaches,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const HOST_SECTION = 'zzrsq1';
const HOST_RELATION_LIST = 'zzrsq9';
/** The referencing section the reader MAY read (records split by project). */
const REF_SECTION = 'zzrsq3';
/** A referencing section the reader may NOT read (every record hidden by the grant). */
const OTHER_SECTION = 'zzrsq11';
/** A host section the reader may NOT read (D3's 403 leg). */
const DENIED_HOST_SECTION = 'zzrsq20';

const HOST_ID = 1;
/** The budget leg's second host: the same visible referrers, a long hidden tail. */
const HOST_LONG_ID = 2;
const DENIED_HOST_ID = 1;

/**
 * zzrsq3 referrers of HOST, in section_id order, visible (reader's project) or
 * hidden (the second suite project) — interleaved so an UNSCOPED window cuts
 * through hidden runs: windows of 2, 3 or 4 over this sequence each hold a
 * different number of visible records.
 */
const REFS: readonly { id: number; visible: boolean }[] = [
	{ id: 1, visible: true },
	{ id: 2, visible: false },
	{ id: 3, visible: false },
	{ id: 4, visible: true },
	{ id: 5, visible: false },
	{ id: 6, visible: true },
	{ id: 7, visible: true },
	{ id: 8, visible: false },
	{ id: 9, visible: false },
	{ id: 10, visible: false },
	{ id: 11, visible: true },
	{ id: 12, visible: true },
];
/** zzrsq11 referrers of HOST and HOST_LONG — all hidden by the section grant. */
const OTHER_REF_IDS = [1, 2, 3];
/** Hidden zzrsq3 referrers of HOST_LONG only (the budget leg's long tail). */
const LONG_HIDDEN_IDS = Array.from({ length: 80 }, (_, index) => 100 + index);
/** The zzrsq3 record that also references the DENIED host (visible to the reader). */
const DENIED_HOST_REFERRER = 1;

const marker = (section: string, id: number): string => `ZZRSQ_${section}_${id}`;
const MARKER_RE = /ZZRSQ_zzrsq\d+_\d+/g;

const visibleIds = REFS.filter((ref) => ref.visible).map((ref) => ref.id);
const expectedReaderMarkers = visibleIds.map((id) => marker(REF_SECTION, id)).sort();
const expectedAdminMarkers = [
	...REFS.map((ref) => marker(REF_SECTION, ref.id)),
	...OTHER_REF_IDS.map((id) => marker(OTHER_SECTION, id)),
].sort();

function projectLocator(tipo: string, projectId: number) {
	return [
		{
			id: 1,
			type: 'dd151',
			section_tipo: 'dd153',
			section_id: projectId,
			from_component_tipo: tipo,
		},
	];
}

function hostLocators(tipo: string, sectionTipo: string, hostIds: readonly number[]) {
	return hostIds.map((hostId, index) => ({
		id: index + 1,
		type: 'dd151',
		section_tipo: sectionTipo,
		section_id: hostId,
		from_component_tipo: tipo,
	}));
}

function refRecord(
	id: number,
	hostIds: readonly number[],
	projectId: number,
	deniedHost = false,
): SituationRecord {
	return {
		section_tipo: REF_SECTION,
		section_id: id,
		columns: {
			string: { zzrsq4: [{ id: 1, lang: 'lg-nolan', value: marker(REF_SECTION, id) }] },
			relation: {
				zzrsq10: projectLocator('zzrsq10', projectId),
				zzrsq5: hostLocators('zzrsq5', HOST_SECTION, hostIds),
				...(deniedHost
					? { zzrsq7: hostLocators('zzrsq7', DENIED_HOST_SECTION, [DENIED_HOST_ID]) }
					: {}),
			},
		},
	};
}

const S = situation({
	name: 'zzrsq related scope equivalence',
	tld: 'zzrsq',
	nodes: [
		{
			tipo: HOST_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Anfitrión relacionado', 'lg-eng': 'Related host' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: HOST_RELATION_LIST,
			parent: HOST_SECTION,
			model: 'relation_list',
			term: { 'lg-spa': 'Referencias' },
		},
		{
			tipo: REF_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Referencias relacionadas', 'lg-eng': 'Related refs' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzrsq4',
			parent: REF_SECTION,
			model: 'component_input_text',
			term: { 'lg-spa': 'Marca', 'lg-eng': 'Marker' },
		},
		{
			tipo: 'zzrsq5',
			parent: REF_SECTION,
			model: 'component_portal',
			order_number: 2,
			term: { 'lg-spa': 'Portal al anfitrión' },
			relations: [{ tipo: HOST_SECTION }],
		},
		{
			tipo: 'zzrsq7',
			parent: REF_SECTION,
			model: 'component_portal',
			order_number: 3,
			term: { 'lg-spa': 'Portal al anfitrión vedado' },
			relations: [{ tipo: DENIED_HOST_SECTION }],
		},
		{
			tipo: 'zzrsq10',
			parent: REF_SECTION,
			model: 'component_filter',
			order_number: 6,
			term: { 'lg-eng': 'Projects' },
			relations: [{ tipo: 'dd153' }],
		},
		{
			tipo: 'zzrsq6',
			parent: REF_SECTION,
			model: 'relation_list',
			order_number: 4,
			term: { 'lg-spa': 'relation_list' },
			relations: [{ tipo: 'zzrsq4' }],
		},
		{
			tipo: OTHER_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Otras referencias', 'lg-eng': 'Other refs' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzrsq12',
			parent: OTHER_SECTION,
			model: 'component_input_text',
			term: { 'lg-spa': 'Marca 2', 'lg-eng': 'Marker 2' },
		},
		{
			tipo: 'zzrsq13',
			parent: OTHER_SECTION,
			model: 'component_portal',
			order_number: 2,
			term: { 'lg-spa': 'Portal al anfitrión 2' },
			relations: [{ tipo: HOST_SECTION }],
		},
		{
			tipo: 'zzrsq14',
			parent: OTHER_SECTION,
			model: 'relation_list',
			order_number: 3,
			term: { 'lg-spa': 'relation_list' },
			relations: [{ tipo: 'zzrsq12' }],
		},
		{
			tipo: DENIED_HOST_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Anfitrión vedado', 'lg-eng': 'Denied host' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzrsq21',
			parent: DENIED_HOST_SECTION,
			model: 'relation_list',
			term: { 'lg-spa': 'Referencias' },
		},
	],
	records: [
		{ section_tipo: HOST_SECTION, section_id: HOST_ID, columns: { data: {} } },
		{ section_tipo: HOST_SECTION, section_id: HOST_LONG_ID, columns: { data: {} } },
		{ section_tipo: DENIED_HOST_SECTION, section_id: DENIED_HOST_ID, columns: { data: {} } },
		...REFS.map(({ id, visible }) =>
			refRecord(
				id,
				// The visible referrers of HOST also reference HOST_LONG: the two hosts
				// serve the reader the same records, and differ only in hidden ones.
				visible ? [HOST_ID, HOST_LONG_ID] : [HOST_ID],
				visible ? ACL_PROJECT_ID : SUITE_SECOND_PROJECT_ID,
				id === DENIED_HOST_REFERRER,
			),
		),
		...LONG_HIDDEN_IDS.map((id) => refRecord(id, [HOST_LONG_ID], SUITE_SECOND_PROJECT_ID)),
		...OTHER_REF_IDS.map((id) => ({
			section_tipo: OTHER_SECTION,
			section_id: id,
			columns: {
				string: { zzrsq12: [{ id: 1, lang: 'lg-nolan', value: marker(OTHER_SECTION, id) }] },
				relation: { zzrsq13: hostLocators('zzrsq13', HOST_SECTION, [HOST_ID, HOST_LONG_ID]) },
			},
		})),
	],
});

/** The reader's read grants: the host section + its relation_list, the readable referencing section. */
async function grantReader(): Promise<void> {
	await assertTestDatabase('related_scope_equivalence_native');
	const grants = [
		{ id: 201, tipo: HOST_SECTION, section_tipo: HOST_SECTION, value: 1 },
		{ id: 202, tipo: HOST_RELATION_LIST, section_tipo: HOST_SECTION, value: 1 },
		{ id: 203, tipo: REF_SECTION, section_tipo: REF_SECTION, value: 1 },
		{ id: 204, tipo: 'zzrsq4', section_tipo: REF_SECTION, value: 1 },
	];
	await sql.unsafe(
		`UPDATE matrix_profiles
		    SET misc = jsonb_set(coalesce(misc, '{}'::jsonb), '{dd774}',
		                         coalesce(misc->'dd774', '[]'::jsonb) || $1::text::jsonb)
		  WHERE section_tipo = 'dd234' AND section_id = $2`,
		[JSON.stringify(grants), ACL_NON_ADMIN_PROFILE_ID],
	);
	clearUserFilterRecordsCache();
	clearAclIdentityCaches();
}

type Caller = 'admin' | 'reader';

async function contextFor(caller: Caller): Promise<Record<string, unknown>> {
	// The root superuser is the admin control: it holds every grant by rule.
	const userId = caller === 'admin' ? -1 : ACL_NON_ADMIN_USER_ID;
	const token = createSession(userId, `related_scope_equivalence_${caller}`, caller === 'admin');
	const session = getSession(token);
	return {
		requestId: 'related_scope_equivalence_native',
		clientIp: '127.0.0.1',
		session,
		sessionToken: token,
		csrfCandidate: session?.csrfToken ?? null,
		principal: await resolvePrincipal(userId),
	};
}

type Door = 'get_relation_list' | 'related_search';
const PAGE_DOORS: Door[] = ['get_relation_list', 'related_search'];

interface Host {
	section_tipo: string;
	section_id: number;
	relationList: string;
}
const HOST: Host = {
	section_tipo: HOST_SECTION,
	section_id: HOST_ID,
	relationList: HOST_RELATION_LIST,
};
const HOST_LONG: Host = { ...HOST, section_id: HOST_LONG_ID };
const DENIED_HOST: Host = {
	section_tipo: DENIED_HOST_SECTION,
	section_id: DENIED_HOST_ID,
	relationList: 'zzrsq21',
};

/** The sqo the panel and the graph send (relation_list.js / build_graph_data.js): ['all']. */
function relatedSqo(host: Host, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		section_tipo: ['all'],
		mode: 'related',
		filter_by_locators: [{ section_tipo: host.section_tipo, section_id: host.section_id }],
		...extra,
	};
}

function pageRqo(door: Door, host: Host, limit: number, offset: number): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			model: 'relation_list',
			tipo: host.relationList,
			section_tipo: host.section_tipo,
			section_id: host.section_id,
			mode: 'edit',
			lang: 'lg-spa',
			action: door,
		},
		sqo: relatedSqo(host, { limit, offset }),
	};
}

function countRqo(host: Host, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		action: 'count',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			model: 'relation_list',
			tipo: host.relationList,
			section_tipo: host.section_tipo,
			section_id: host.section_id,
			mode: 'edit',
			lang: 'lg-spa',
		},
		sqo: relatedSqo(host, extra),
	};
}

async function dispatchAs(caller: Caller, rqo: Record<string, unknown>) {
	return dispatchRqo(rqo as never, (await contextFor(caller)) as never);
}

function markersOf(body: Record<string, unknown>): string[] {
	return JSON.stringify(body.data ?? null).match(MARKER_RE) ?? [];
}

/** Distinct markers in a page — a record's marker may repeat across its columns. */
function pageMarkers(body: Record<string, unknown>): string[] {
	return [...new Set(markersOf(body))];
}

function errorCodeOf(body: Record<string, unknown>): string | undefined {
	return (body.error as { code?: string } | undefined)?.code;
}

async function countOf(caller: Caller, host: Host): Promise<number> {
	const answer = await dispatchAs(caller, countRqo(host));
	expect({ status: answer.status, error: errorCodeOf(answer.body) ?? null }).toEqual({
		status: 200,
		error: null,
	});
	return (answer.body.data as { total: number }).total;
}

/** The client's walk: pages 0 .. ceil(total/limit)-1, as the paginator draws them. */
async function walk(caller: Caller, door: Door, host: Host, total: number, limit: number) {
	const pages: string[][] = [];
	for (let offset = 0; offset < total; offset += limit) {
		const answer = await dispatchAs(caller, pageRqo(door, host, limit, offset));
		expect({
			door,
			offset,
			status: answer.status,
			error: errorCodeOf(answer.body) ?? null,
		}).toEqual({ door, offset, status: 200, error: null });
		pages.push(pageMarkers(answer.body));
	}
	return pages;
}

describe.if(DB_READY)('D1/D3 — the related search: one scoped question, gated on the host', () => {
	beforeAll(async () => {
		await installAclIdentityFixture();
		await ensureSuiteProjectsFixture();
		await ensureSituation(S);
		await grantReader();
	});

	afterAll(async () => {
		expect(await dropSituation(S)).toBe(0);
		await removeSuiteProjectsFixture();
		await removeAclIdentityFixture();
		clearUserFilterRecordsCache();
	});

	test('the contrast is live: partial project scope, one unreadable referencing section', async () => {
		const reader = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		expect(reader.isGlobalAdmin).toBe(false);
		expect(visibleIds.length).toBeGreaterThan(0);
		expect(visibleIds.length).toBeLessThan(REFS.length);
		expect(await countOf('admin', HOST)).toBe(expectedAdminMarkers.length);
	});

	test('D1: count == the full paged walk == the probe boundary, and the walk is exactly the in-scope referrers', async () => {
		const total = await countOf('reader', HOST);
		expect(total).toBe(expectedReaderMarkers.length);
		const { anyInverseReferencePast } = await import('../../src/core/search/search_related.ts');
		const { rowScopeFor } = await import('../../src/core/security/record_scope.ts');
		const reader = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		const locators = [{ section_tipo: HOST_SECTION, section_id: HOST_ID }];
		const probe = (past: number) =>
			anyInverseReferencePast(locators, { sectionTipos: 'all', scope: rowScopeFor(reader) }, past);
		expect({ beforeLast: await probe(total - 1), atTotal: await probe(total) }).toEqual({
			beforeLast: true,
			atTotal: false,
		});
		for (const door of PAGE_DOORS) {
			for (const limit of [2, 3, 4]) {
				const pages = await walk('reader', door, HOST, total, limit);
				const walked = pages.flat();
				expect({ door, limit, walked: walked.length }).toEqual({ door, limit, walked: total });
				expect({ door, limit, records: [...new Set(walked)].sort() }).toEqual({
					door,
					limit,
					records: expectedReaderMarkers,
				});
				// Every page but the last is FULL: a short page is not the end.
				expect({ door, limit, sizes: pages.map((page) => page.length) }).toEqual({
					door,
					limit,
					sizes: pages.map((_, index) =>
						index < pages.length - 1 ? limit : total - limit * (pages.length - 1),
					),
				});
				// Past the walk there is nothing for the reader.
				const past = await dispatchAs('reader', pageRqo(door, HOST, limit, total));
				expect({ door, limit, past: pageMarkers(past.body) }).toEqual({ door, limit, past: [] });
			}
		}
	});

	test('D1: the grouped count is scoped like the total', async () => {
		const grouped = await dispatchAs('reader', countRqo(HOST, { group_by: ['section_tipo'] }));
		expect(grouped.status).toBe(200);
		expect(grouped.body.data).toEqual({
			total: expectedReaderMarkers.length,
			totals_group: [{ key: [REF_SECTION], value: expectedReaderMarkers.length }],
		});
		const admin = await dispatchAs('admin', countRqo(HOST, { group_by: ['section_tipo'] }));
		const adminData = admin.body.data as { total: number; totals_group: unknown[] };
		expect(adminData.total).toBe(expectedAdminMarkers.length);
		// Ordered by section_tipo (the count's own ORDER BY — a stable fold).
		expect(adminData.totals_group).toEqual([
			{ key: [OTHER_SECTION], value: OTHER_REF_IDS.length },
			{ key: [REF_SECTION], value: REFS.length },
		]);
	});

	test('D1: the admin control walks every referrer', async () => {
		const total = await countOf('admin', HOST);
		for (const door of PAGE_DOORS) {
			const pages = await walk('admin', door, HOST, total, 4);
			expect({ door, records: pages.flat().sort() }).toEqual({
				door,
				records: expectedAdminMarkers,
			});
		}
	});

	test('D1: the count is bounded SQL — a long hidden tail costs the reader the same statements and rows', async () => {
		// Warm what a first request reads once (grants, ontology, projects).
		await countOf('reader', HOST);
		await countOf('reader', HOST_LONG);
		const measure = async (host: Host) => {
			const context = await contextFor('reader');
			const tapped = await runWithQueryTap(`related count ${host.section_id}`, () =>
				dispatchRqo(countRqo(host) as never, context as never),
			);
			const sink = tapped.report.callers.filter(
				(caller) =>
					caller.frames.includes('search_related.ts') || caller.frames.includes('record_scope.ts'),
			);
			return {
				total: (tapped.result.body.data as { total: number }).total,
				statements: tapped.report.count,
				rows: tapped.report.callers.reduce((sum, caller) => sum + caller.sumRows, 0),
				sinkMaxRows: sink.reduce((max, caller) => Math.max(max, caller.maxRows), 0),
				reachedSink: sink.length > 0,
			};
		};
		const short = await measure(HOST);
		const long = await measure(HOST_LONG);
		// Non-degeneracy: the two hosts serve the same visible set, and the long
		// one hides far more than any page.
		expect(long.total).toBe(short.total);
		expect(LONG_HIDDEN_IDS.length).toBeGreaterThan(10 * short.total);
		expect(short.reachedSink).toBe(true);
		expect({ statements: long.statements, rows: long.rows }).toEqual({
			statements: short.statements,
			rows: short.rows,
		});
		// No statement of the related search carries an owner list into the
		// process: at most one row per section in play (+1 for the total).
		expect(long.sinkMaxRows).toBeLessThanOrEqual(3);
	});

	test("D3: a reader with read on the host gets 200 for sqo.section_tipo ['all'] — only in-scope referrers", async () => {
		for (const door of PAGE_DOORS) {
			const answer = await dispatchAs('reader', pageRqo(door, HOST, 50, 0));
			expect({ door, status: answer.status, error: errorCodeOf(answer.body) ?? null }).toEqual({
				door,
				status: 200,
				error: null,
			});
			expect({ door, records: pageMarkers(answer.body).sort() }).toEqual({
				door,
				records: expectedReaderMarkers,
			});
		}
		expect(await countOf('reader', HOST)).toBe(expectedReaderMarkers.length);
	});

	test('D3: a host in a section the reader may not read is 403 on read and count; the admin control is 200', async () => {
		for (const door of PAGE_DOORS) {
			const refused = await dispatchAs('reader', pageRqo(door, DENIED_HOST, 50, 0));
			expect({ door, status: refused.status, code: errorCodeOf(refused.body) }).toEqual({
				door,
				status: 403,
				code: 'perm.denied',
			});
			const allowed = await dispatchAs('admin', pageRqo(door, DENIED_HOST, 50, 0));
			expect({ door, status: allowed.status, records: pageMarkers(allowed.body) }).toEqual({
				door,
				status: 200,
				records: [marker(REF_SECTION, DENIED_HOST_REFERRER)],
			});
		}
		// Count — no source.tipo, so only the related host gate can refuse it.
		const count = (caller: Caller) =>
			dispatchAs(caller, {
				action: 'count',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				sqo: relatedSqo(DENIED_HOST),
			});
		const refusedCount = await count('reader');
		expect({ status: refusedCount.status, code: errorCodeOf(refusedCount.body) }).toEqual({
			status: 403,
			code: 'perm.denied',
		});
		const adminCount = await count('admin');
		expect({
			status: adminCount.status,
			total: (adminCount.body.data as { total: number }).total,
		}).toEqual({ status: 200, total: 1 });
	});

	test('D3: Gate B itself refuses an unreadable HOST — a related read with no relation route reaches no other host gate', async () => {
		// No source.action route and no source.tipo: Gate A does not run and no
		// read_facade host check exists on this path — only Gate B's host leg
		// stands between the reader and the generic read of ['all'].
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: { typo: 'source', model: 'section', mode: 'list', lang: 'lg-spa' },
			sqo: relatedSqo(DENIED_HOST, { limit: 10, offset: 0 }),
		};
		const refused = await dispatchAs('reader', rqo);
		expect({ status: refused.status, code: errorCodeOf(refused.body) }).toEqual({
			status: 403,
			code: 'perm.denied',
		});
	});

	test("D3: past the host gate, ['all'] is still no section — a generic read refuses it for reader and admin alike", async () => {
		// The skip is for the RELATED routes' owning-section axis only. A read that
		// carries a related sqo but no relation route reaches the generic search,
		// whose identifier gate refuses 'all' — the same answer for both callers,
		// so the host gate opened no section read.
		const rqo = {
			action: 'read',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				typo: 'source',
				model: 'section',
				tipo: HOST_SECTION,
				section_tipo: HOST_SECTION,
				mode: 'list',
				lang: 'lg-spa',
			},
			sqo: relatedSqo(HOST, { limit: 10, offset: 0 }),
		};
		const answers = [];
		for (const caller of ['reader', 'admin'] as const) {
			const answer = await dispatchAs(caller, rqo);
			answers.push({ caller, status: answer.status, code: errorCodeOf(answer.body) });
		}
		expect(answers).toEqual([
			{ caller: 'reader', status: 400, code: 'request.invalid_tipo' },
			{ caller: 'admin', status: 400, code: 'request.invalid_tipo' },
		]);
	});

	test("D3: a related sqo naming NO host keeps the literal check — ['all'] alone never passes", async () => {
		const rqo = pageRqo('get_relation_list', HOST, 50, 0);
		const { filter_by_locators: _hosts, ...withoutHosts } = rqo.sqo as Record<string, unknown>;
		// No host key, an empty host list, a host with no section: none names a host.
		const hostless = [
			withoutHosts,
			{ ...withoutHosts, filter_by_locators: [] },
			{ ...withoutHosts, filter_by_locators: [{ section_id: HOST_ID }] },
		];
		const answers = [];
		for (const sqo of hostless) {
			const refused = await dispatchAs('reader', { ...rqo, sqo });
			answers.push({ status: refused.status, code: errorCodeOf(refused.body) });
		}
		expect(answers).toEqual(hostless.map(() => ({ status: 403, code: 'perm.denied' })));
		// CONTROL: the same request WITH its host is served.
		const served = await dispatchAs('reader', rqo);
		expect(served.status).toBe(200);
	});
});
