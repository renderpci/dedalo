/**
 * get_relation_list narrowing + limit-0 contract (PHP class.relation_list.php
 * get_inverse_references — the CLIENT sqo runs straight through
 * sections::get_instance, so its section_tipo axis narrows the owning
 * sections and set_limit(0) means ALL records).
 *
 * This is the relation_list_header open flow (client relation_list.js
 * get_related_records): the header click sends {section_tipo:[target],
 * limit:0} expecting EVERY related id in that one section. The facade
 * previously dropped the narrowing (always 'all') and forwarded limit 0
 * verbatim, which search_related clamps to LIMIT 1 — the opened window
 * then filtered on one arbitrary id. The parity differential can't catch
 * this: its corpus only sends ['all'] with positive limits.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The gate
// used to open the panel on the install host `numisdata6` §1 and then RANK
// whatever sections happened to reference it, skipping every assertion when the
// database held none — on the suite DB both cases passed vacuously. It now
// BUILDS its situation (`zzln`: one host, two referencing sections with 3 and 1
// records, all on matrix_test through the test24 matrix_table node) so the
// counts are EXACT and the limit-0→LIMIT-1 regression it exists for cannot hide
// behind an empty corpus. Torn down with an asserted residue of 0.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

/** The host every referencing record points at. */
const HOST = { section_tipo: 'zzln1', section_id: '900701' };
/** Referencing section A — THREE records, so limit 0 ≠ LIMIT 1 is observable. */
const REF_A = 'zzln3';
const REF_A_IDS = [900711, 900712, 900713];
/** Referencing section B — one record, so ['all'] spans more than one section. */
const REF_B = 'zzln7';
const REF_B_ID = 900721;

/** A locator pointing at the host record (what makes a record a REFERENCE). */
const hostLocator = { section_tipo: 'zzln1', section_id: 900701, type: 'dd571' };

const S = situation({
	name: 'zzln relation_list narrowing',
	tld: 'zzln',
	nodes: [
		// HOST section — data on matrix_test through the test24 matrix_table node.
		{
			tipo: 'zzln1',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Anfitrión', 'lg-eng': 'Host' },
			relations: [{ tipo: 'test24' }],
		},
		// The host's own relation_list node — the panel's `source.tipo`.
		{ tipo: 'zzln2', parent: 'zzln1', model: 'relation_list', term: { 'lg-spa': 'Referencias' } },

		// REFERENCING SECTION A (three records).
		{
			tipo: REF_A,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Sección A', 'lg-eng': 'Section A' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzln4',
			parent: REF_A,
			model: 'component_input_text',
			is_translatable: true,
			term: { 'lg-spa': 'Título', 'lg-eng': 'Title' },
		},
		{
			tipo: 'zzln5',
			parent: REF_A,
			model: 'component_portal',
			order_number: 2,
			term: { 'lg-spa': 'Portal al anfitrión A' },
			relations: [{ tipo: 'zzln1' }],
		},
		{
			tipo: 'zzln6',
			parent: REF_A,
			model: 'relation_list',
			order_number: 3,
			term: { 'lg-spa': 'relation_list' },
			relations: [{ tipo: 'zzln4' }],
		},

		// REFERENCING SECTION B (one record) — so ['all'] is multi-section.
		{
			tipo: REF_B,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Sección B', 'lg-eng': 'Section B' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzln8',
			parent: REF_B,
			model: 'component_input_text',
			is_translatable: true,
			term: { 'lg-spa': 'Nota', 'lg-eng': 'Note' },
		},
		{
			tipo: 'zzln9',
			parent: REF_B,
			model: 'component_portal',
			order_number: 2,
			term: { 'lg-spa': 'Portal al anfitrión B' },
			relations: [{ tipo: 'zzln1' }],
		},
		{
			tipo: 'zzln10',
			parent: REF_B,
			model: 'relation_list',
			order_number: 3,
			term: { 'lg-spa': 'relation_list' },
			relations: [{ tipo: 'zzln8' }],
		},
	],
	records: [
		{ section_tipo: 'zzln1', section_id: 900701, columns: { data: {} } },
		...REF_A_IDS.map((sectionId, index) => ({
			section_tipo: REF_A,
			section_id: sectionId,
			columns: {
				string: { zzln4: [{ lang: 'lg-spa', value: `Alpha ${index}` }] },
				relation: { zzln5: [hostLocator] },
			},
		})),
		{
			section_tipo: REF_B,
			section_id: REF_B_ID,
			columns: {
				string: { zzln8: [{ lang: 'lg-spa', value: 'Beta' }] },
				relation: { zzln9: [hostLocator] },
			},
		},
	],
});

beforeAll(async () => {
	await ensureSituation(S);
});
afterAll(async () => {
	expect(await dropSituation(S)).toBe(0);
});

function relationListRqo(sqoOverrides: Record<string, unknown>): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'relation_list',
			tipo: 'zzln2',
			section_tipo: HOST.section_tipo,
			section_id: HOST.section_id,
			action: 'get_relation_list',
			mode: 'edit',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['all'],
			mode: 'related',
			filter_by_locators: [HOST],
			offset: 0,
			...sqoOverrides,
		},
	};
}

async function tsCall(rqo: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const result = await dispatchRqo(
		structuredClone(rqo) as never,
		{
			requestId: 'relation_list_narrowing_test',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	const body = result.body as { data?: { data?: Record<string, unknown>[] } };
	return body.data?.data ?? [];
}

/** id rows per owning section — the shape both cases measure. */
function idRowsBySection(rows: Record<string, unknown>[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		if (row.component_tipo !== 'id') continue;
		const sectionTipo = String(row.section_tipo);
		counts.set(sectionTipo, (counts.get(sectionTipo) ?? 0) + 1);
	}
	return counts;
}

describe('get_relation_list sqo narrowing (header-open contract)', () => {
	test('section_tipo narrows to ONE owning section and limit 0 returns ALL its ids', async () => {
		// Full picture first: every related record, no cap. EXACT, because this
		// file wrote every one of them.
		const all = await tsCall(relationListRqo({ limit: 0 }));
		expect([...idRowsBySection(all).entries()].sort()).toEqual([
			[REF_A, REF_A_IDS.length],
			[REF_B, 1],
		]);

		const narrowed = await tsCall(relationListRqo({ section_tipo: [REF_A], limit: 0 }));
		// Narrowing: no other owning section leaks through.
		expect(narrowed.length).toBeGreaterThan(0);
		expect(narrowed.every((row) => row.section_tipo === REF_A)).toBe(true);
		// limit 0 = ALL (PHP set_limit(0)). THREE, not one: the regression this
		// gate exists for forwarded 0 to search_related, which clamps to LIMIT 1.
		expect(idRowsBySection(narrowed).get(REF_A)).toBe(REF_A_IDS.length);
	});

	test("['all'] stays un-narrowed (the panel's default request)", async () => {
		const all = await tsCall(relationListRqo({ limit: 0 }));
		const sections = new Set(
			all.filter((row) => row.component_tipo === 'id').map((row) => String(row.section_tipo)),
		);
		expect([...sections].sort()).toEqual([REF_A, REF_B]);
	});
});
