/**
 * Generic has_dataframe LITERAL read — TS-NATIVE half (DEC-14b P1), the
 * survival twin of test/parity/has_dataframe_literal_differential.test.ts
 * (which needs the live PHP oracle and dies without it).
 *
 * Same self-reverting fixture as the differential: a component_dataframe node
 * (test218) provisioned under test52 (input_text), test52 properties gaining
 * has_dataframe:true + a request_config declaring the frame ddo, and a
 * scratch test3 record pairing a test52 value with a test218 dd490 entry
 * (→ dd1706/121 'Zenon'). The list-read projection (the differential's exact
 * `comparable` field set) is DEEP-EQUAL against a GOLDEN captured from the
 * LIVE PHP ORACLE on these exact seeds (2026-07-10 UTC, scratchpad
 * capture_dec14b_p1.ts — the capture run verified TS === PHP on the
 * comparable projection, WC-001 entries:[] adopted on the PHP side only).
 * Goldens live in fixtures/has_dataframe_native/; NEVER regenerate them from
 * TS output — recapture from the PHP oracle with the same seeds.
 *
 * Oracle-pinned semantics frozen here: the frame item precedes the literal
 * (frame mode 'list' — the generic default, unlike dd560's node-declared
 * 'edit'), the frame carries its own sqo_config limit (5), and the literal
 * item carries counter (data.counters[tipo] ?? 0).
 *
 * Scratch id: test3/900311 in matrix_test — the reserved-high (900000+)
 * range, clear of the canonical ids (1/2/27), of createSectionRecord scratch
 * (counter ≤ double digits) and of the sibling gates' 9003xx twins (900312
 * iri / 900313 info_widget). Direct INSERT (no counter bump) so the golden
 * pins section_id byte-stable.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import golden from './fixtures/has_dataframe_native/list_items.golden.json';

const FRAME_TIPO = 'test218'; // provisioned + reverted by this gate
const MAIN_TIPO = 'test52';
const RECORD_ID = 900311;

let tsItems: Record<string, unknown>[] = [];

/** The differential's exact comparable projection — the live-verified contract. */
function comparable(item: Record<string, unknown>): Record<string, unknown> {
	return {
		tipo: item.tipo,
		section_tipo: item.section_tipo,
		section_id: item.section_id,
		mode: item.mode,
		lang: item.lang,
		from_component_tipo: item.from_component_tipo ?? null,
		entries: item.entries ?? null,
		pagination: item.pagination ?? null,
		counter: item.counter ?? null,
		row_section_id: item.row_section_id ?? null,
		parent_tipo: item.parent_tipo ?? null,
	};
}

async function provisionFixture(): Promise<void> {
	const frameProperties = {
		source: {
			request_config: [
				{
					sqo: { section_tipo: [{ value: ['dd1706'], source: 'section' }] },
					show: {
						ddo_map: [{ tipo: 'dd1715', parent: 'self', section_tipo: 'self' }],
						sqo_config: { limit: 5 },
					},
				},
			],
		},
	};
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, model, term, tld, is_model, is_translatable, is_main, order_number, properties)
		 VALUES ($1, $2, 'component_dataframe', '{"lg-spa":"Test frame"}'::jsonb, 'test', false, false, false, 99, $3::text::jsonb)
		 ON CONFLICT DO NOTHING`,
		[FRAME_TIPO, MAIN_TIPO, JSON.stringify(frameProperties)],
	);
	const mainProperties = {
		has_dataframe: true,
		source: {
			request_config: [
				{
					sqo: { section_tipo: [{ value: ['dd1706'], source: 'section' }] },
					show: { ddo_map: [{ tipo: FRAME_TIPO, parent: 'self', section_tipo: 'test3' }] },
				},
			],
		},
	};
	await sql.unsafe('UPDATE dd_ontology SET properties = $2::text::jsonb WHERE tipo = $1', [
		MAIN_TIPO,
		JSON.stringify(mainProperties),
	]);
}

async function revertFixture(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo = $1 AND tld = 'test'`, [FRAME_TIPO]);
	await sql.unsafe('UPDATE dd_ontology SET properties = NULL WHERE tipo = $1', [MAIN_TIPO]);
}

/** TS ontology caches must not serve pre-fixture (or post-revert: fixture) state. */
async function clearOntologyLayerCaches(): Promise<void> {
	const { clearOntologyCaches } = await import('../../src/core/ontology/resolver.ts');
	clearOntologyCaches();
	const { clearListCellConfigCache } = await import(
		'../../src/core/section/list_definitions/section_list.ts'
	);
	clearListCellConfigCache();
}

async function sweepRecord(): Promise<number> {
	const deleted = (await sql.unsafe(
		`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = $1 RETURNING id`,
		[RECORD_ID],
	)) as unknown[];
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo = 'test3' AND section_id = $1`,
		[RECORD_ID],
	);
	return deleted.length;
}

beforeAll(async () => {
	await sweepRecord(); // pre-clean a crashed prior run
	await provisionFixture();
	await clearOntologyLayerCaches();

	const value = [{ id: 1, lang: 'lg-nolan', value: 'FRAME_LITERAL_NATIVE' }];
	const frameBag = [
		{
			id: 1,
			type: 'dd490',
			id_key: 1,
			section_id: '121',
			section_tipo: 'dd1706',
			from_component_tipo: FRAME_TIPO,
			main_component_tipo: MAIN_TIPO,
		},
	];
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, string, relation)
		 VALUES ($1, 'test3', jsonb_build_object($2::text, $3::text::jsonb), jsonb_build_object($4::text, $5::text::jsonb))`,
		[RECORD_ID, MAIN_TIPO, JSON.stringify(value), FRAME_TIPO, JSON.stringify(frameBag)],
	);

	const rqo = {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: 'test3',
			section_tipo: 'test3',
			action: 'search',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: ['test3'],
			limit: 1,
			offset: 0,
			filter_by_locators: [{ section_tipo: 'test3', section_id: String(RECORD_ID) }],
		},
		show: {
			ddo_map: [{ tipo: MAIN_TIPO, section_tipo: 'test3', parent: 'test3', mode: 'list' }],
		},
	};

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsItems = (
		(
			(
				await dispatchRqo(
					structuredClone(rqo) as never,
					{
						requestId: 't',
						clientIp: '127.0.0.1',
						session,
						csrfCandidate: session?.csrfToken ?? null,
						principal,
					} as never,
				)
			).body as { result?: { data?: unknown[] } }
		).result?.data ?? []
	).slice(1) as Record<string, unknown>[];
}, 60000);

afterAll(async () => {
	await revertFixture();
	await clearOntologyLayerCaches();
	// A seeded scratch row that deletes NOTHING means the fixed id collided or
	// something swept it mid-run — fail loudly rather than mask it.
	if ((await sweepRecord()) === 0) {
		throw new Error(
			`Scratch cleanup deleted 0 rows for test3/${RECORD_ID} (matrix_test) — the seed vanished mid-run.`,
		);
	}
});

describe('generic has_dataframe literal read (TS-native, oracle-captured golden)', () => {
	test('frame + label child + literal (with counter) DEEP-EQUAL the golden, in order', () => {
		// Fixture integrity floors — the semantics the differential pinned must
		// be IN the golden (guards a truncated/regenerated fixture; the engine
		// assertion is the deep-equal below).
		const items = golden.items as Record<string, unknown>[];
		expect(items.map((item) => item.tipo)).toEqual([FRAME_TIPO, 'dd1715', MAIN_TIPO]);
		expect(items[0]?.mode).toBe('list'); // generic frame default (not dd560's 'edit')
		expect((items[0]?.pagination as { limit?: unknown })?.limit).toBe(5); // frame sqo_config limit
		expect(items[2]?.counter).toBe(0); // literal carries counter (counters[tipo] ?? 0)
		expect(JSON.stringify(items[0]?.entries)).toContain('"type":"dd490"');

		expect(tsItems.map(comparable)).toEqual(items as never);
	});
});
