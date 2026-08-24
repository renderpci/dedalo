/**
 * Portal drag-reorder: authentic client wire replay — TS-NATIVE half
 * (DEC-14b P1), the survival twin of
 * test/parity/portal_drag_capture_replay.test.ts (which compares against the
 * live PHP oracle and dies without it). The RQOs replayed here are the REAL
 * browser-client captures (fixtures/portal_drag_client_capture.json, Chrome
 * against live PHP 2026-07-02) and every expectation is capture- or
 * differential-pinned — never unverified TS output:
 *
 *  - sort_data source_key/target_key are ABSOLUTE locator indices even on
 *    page 2 (offset 9 → keys 10 → 9), value carries the paginated_key;
 *  - the client save data ships the FULL PAGE entries (incl. the dragged
 *    locator appended once more) + pagination + parent decoration — page-1
 *    saves stamp parent_tipo = HOST SECTION + row_section_id, page-2 saves
 *    stamp parent_tipo = the PORTAL and no row_section_id; the server must
 *    tolerate both payloads (replaying them successfully IS the pin);
 *  - end order after page-1 (2→0) then page-2 (10→9) drags: the differential
 *    pinned slices ['103','101','102'] and ['109','111','110','112'] against
 *    live PHP — the full 12-locator end state re-derived here follows from
 *    those pins + the PHP rebuild loop (class.component_common.php:4447-4467);
 *  - persisted locators keep exactly {id, type, section_id, section_tipo,
 *    from_component_tipo} — paginated_key never persists;
 *  - the paginator get_data (offset 9 of 12): the portal item answers
 *    pagination {total:12, limit:9, offset:9} and entries = the 3-locator
 *    window stamped with ABSOLUTE paginated_key 9/10/11 — the golden bytes
 *    are the capture itself (the client echoes the get_data entries verbatim
 *    into the next save's data.entries, sort_data_page2.data.entries[0..2]).
 *
 * SOFTENED vs the differential (oracle-only): the per-child ddo item
 * projection (fallback_value / external_source / parent_section_id / datalist
 * presence across the test6227/164/154/165/197 children) resolves REAL
 * mutable test6100 records and only means anything as a live TS-vs-PHP
 * presence diff — it stays in the parity gate.
 *
 * Scratch hygiene: fresh test6099 twins via createSectionRecord (distinct
 * counter-minted ids — no collision with sibling gates); twins + TM rows +
 * the dd542 activity rows the dispatch save chokepoint appends for OUR hosts
 * are swept in afterAll.
 *
 * @twin-of      test/parity/portal_drag_capture_replay.test.ts
 * @twin-status  retired
 */
// Migrated to the generic `test` TLD 2026-08-19 (AGENTS.md hard rules): every
// install tipo was rewritten through src/core/test_data/test_tld_tipo_map.json;
// seed-shipped ontology (dd/rsc/hierarchy/lg) stays and is spelled through `seed()`,
// which keeps it out of the install-TLD census's `<tld><digits>` token grammar.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { adoptTipoIdMap } from '../parity/normalize.ts';

registerSessionCleanup();

const fixtureText = readFileSync(
	join(import.meta.dir, '..', 'parity', 'fixtures', 'portal_drag_client_capture.json'),
	'utf8',
);
/** The capture's host id, patched to a twin id at replay. */
const CAPTURED_HOST = '42621';

/**
 * The capture is a FROZEN 2026-07-02 browser RQO and still speaks the install's
 * ontology — the store bytes cannot be re-harvested, so the fixture is adopted
 * into the generic `test` TLD at replay through the committed clone map
 * (test/parity/normalize.ts `adoptTipoIdMap`, pinned by
 * test/parity/tipo_map_transform.test.ts). A refusal is a HARD failure: a
 * half-translated RQO would replay against the wrong ontology and pass or fail
 * for the wrong reason.
 */
function fixtureFor(name: string, hostId: number): Record<string, unknown> {
	const all = JSON.parse(fixtureText.replaceAll(CAPTURED_HOST, String(hostId))) as Record<
		string,
		Record<string, unknown>
	>;
	const fixture = all[name];
	if (fixture === undefined) throw new Error(`no captured fixture named '${name}'`);
	const adopted = adoptTipoIdMap(fixture, `portal_drag_capture_native/${name}`);
	if (!adopted.matched) throw new Error(`${adopted.detail} (kind ${adopted.kind})`);
	return adopted.body;
}

/** The seeded/persisted locator shape (capture-pinned; NO paginated_key). */
const storedLocator = (id: number) => ({
	id,
	type: 'dd151',
	section_id: String(100 + id),
	section_tipo: 'test6100',
	from_component_tipo: 'test6157',
});

let tsContext: Record<string, unknown>;
const created: number[] = [];

async function seedTwin(): Promise<number> {
	const id = await createSectionRecord('test6099', -1);
	created.push(id);
	const locators = Array.from({ length: 12 }, (_, index) => storedLocator(index + 1));
	await sql.unsafe(
		`UPDATE matrix_test SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object('test6157', $1::text::jsonb)
		 WHERE section_tipo = 'test6099' AND section_id = $2`,
		[JSON.stringify(locators), id],
	);
	return id;
}

async function storedPortalOf(hostId: number): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT relation->'test6157' AS v FROM matrix_test WHERE section_tipo = 'test6099' AND section_id = $1`,
		[hostId],
	)) as { v: unknown }[];
	return rows[0]?.v ?? null;
}

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 'portal_drag_native_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
}, 60000);

afterAll(async () => {
	for (const id of created) {
		await sql.unsafe(
			`DELETE FROM matrix_test WHERE section_tipo = 'test6099' AND section_id = $1`,
			[id],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'test6099' AND section_id = $1`,
			[id],
		);
	}
	if (created.length > 0) {
		await sql.unsafe(
			`DELETE FROM matrix_activity
			 WHERE section_tipo = 'dd542'
			   AND string->'dd546'->0->>'value' = 'test6157'
			   AND misc->'dd551'->0->'value'->>'section_id' = ANY($1::text[])`,
			[`{${created.map(String).join(',')}}`],
		);
	}
});

describe('portal drag-reorder: captured client RQOs, TS-native', () => {
	test('page-1 then page-2 drags land the pinned 12-locator end state', async () => {
		const host = await seedTwin();

		// page-1 drag (absolute keys 2 → 0): 103 moves to the front.
		const page1 = (
			await dispatchRqo(fixtureFor('sort_data_page1', host) as unknown as Rqo, tsContext as never)
		).body as { ok?: boolean };
		expect(page1.ok).toBe(true);
		// full stored array after page 1 (differential pin: leading slice
		// ['103','101','102']; the rest untouched, paginated_key ABSENT).
		const afterPage1 = [3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(storedLocator);
		expect(await storedPortalOf(host)).toEqual(afterPage1);

		// page-2 drag (ABSOLUTE keys 10 → 9 despite offset 9): 111 before 110.
		const page2 = (
			await dispatchRqo(fixtureFor('sort_data_page2', host) as unknown as Rqo, tsContext as never)
		).body as { ok?: boolean };
		expect(page2.ok).toBe(true);
		// differential pin: trailing slice ['109','111','110','112'].
		const afterPage2 = [3, 1, 2, 4, 5, 6, 7, 8, 9, 11, 10, 12].map(storedLocator);
		expect(await storedPortalOf(host)).toEqual(afterPage2);
	}, 60000);

	test('the paginator get_data rqo: pagination + absolute-key entries window', async () => {
		const host = await seedTwin();
		const body = (
			await dispatchRqo(fixtureFor('paginate_offset9', host) as unknown as Rqo, tsContext as never)
		).body as { data?: { data?: Record<string, unknown>[] } };
		const data = body.data?.data ?? [];
		const portalItem = data.find(
			(item) => item.tipo === 'test6157' && String(item.section_id) === String(host),
		) as Record<string, unknown> | undefined;
		expect(portalItem).toBeDefined();
		const item = portalItem as Record<string, unknown>;

		// item identity (the capture's request echo surface)
		expect(item.section_tipo).toBe('test6099');
		expect(item.mode).toBe('edit');
		expect(item.lang).toBe('lg-nolan');
		expect(item.from_component_tipo).toBe('test6157');

		// the paged window: 3 locators (offset 9 of 12), full total.
		expect(item.pagination).toEqual({ total: 12, limit: 9, offset: 9 });

		// entries golden = the CAPTURE bytes (the client echoed these exact
		// get_data entries into sort_data_page2.data.entries[0..2]): the stored
		// locators of the window stamped with ABSOLUTE paginated_key 9/10/11.
		expect(item.entries).toEqual([
			{ ...storedLocator(10), paginated_key: 9 },
			{ ...storedLocator(11), paginated_key: 10 },
			{ ...storedLocator(12), paginated_key: 11 },
		]);
	}, 60000);
});
