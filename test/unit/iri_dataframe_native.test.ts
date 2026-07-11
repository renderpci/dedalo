/**
 * LITERAL-main dataframe read (component_iri + its dd560 label frame) —
 * TS-NATIVE half (DEC-14b P1), the survival twin of
 * test/parity/iri_dataframe_differential.test.ts (which needs the live PHP
 * oracle and dies without it).
 *
 * Same seed as the differential: a scratch test3 record carrying a test140
 * iri item plus a paired dd560 dd490 entry (id_key 1 → dd1706/121 'Zenon').
 * The list-read projection (the differential's exact `comparable` field set)
 * is DEEP-EQUAL against a GOLDEN captured from the LIVE PHP ORACLE on this
 * exact seed (2026-07-10 UTC, scratchpad capture_dec14b_p1.ts — the capture
 * run verified TS === PHP byte-for-byte on the comparable projection).
 * Goldens live in fixtures/iri_dataframe_native/; NEVER regenerate them from
 * TS output — recapture from the PHP oracle with the same seed.
 *
 * Oracle-pinned semantics frozen here, IN ORDER:
 *   1. the dd560 frame item (mode 'edit' from the frame node, entries = the
 *      paired dd490 entry + paginated_key, pagination {1, 30, 0});
 *   2. the dd1715 label child at dd1706/121 (mode 'list' default);
 *   3. the test140 iri item itself (frames precede the literal — PHP
 *      component_iri_json merges the subdatum first).
 *
 * Scratch id: test3/900312 in matrix_test — the reserved-high (900000+)
 * range, clear of the canonical ids (1/2/27) and of the sibling gates'
 * 900311/900313 twins. Direct INSERT (no counter bump) so the golden pins
 * section_id byte-stable. NO ontology mutation: dd560/test140 ship in the
 * ontology (unlike the has_dataframe gate's provisioned test218).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import golden from './fixtures/iri_dataframe_native/list_items.golden.json';

const SECTION = 'test3';
const RECORD_ID = 900312;

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

async function sweepRecord(): Promise<number> {
	const deleted = (await sql.unsafe(
		'DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2 RETURNING id',
		[SECTION, RECORD_ID],
	)) as unknown[];
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SECTION,
		RECORD_ID,
	]);
	return deleted.length;
}

beforeAll(async () => {
	await sweepRecord(); // pre-clean a crashed prior run
	const iriValue = [{ id: 1, iri: 'https://example.org/frame-native', lang: 'lg-nolan' }];
	const frameBag = [
		{
			id: 1,
			type: 'dd490',
			id_key: 1,
			section_id: '121',
			section_tipo: 'dd1706',
			from_component_tipo: 'dd560',
			main_component_tipo: 'test140',
		},
	];
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, iri, relation)
		 VALUES ($1, $2, jsonb_build_object('test140', $3::text::jsonb), jsonb_build_object('dd560', $4::text::jsonb))`,
		[RECORD_ID, SECTION, JSON.stringify(iriValue), JSON.stringify(frameBag)],
	);

	const rqo = {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: SECTION,
			section_tipo: SECTION,
			action: 'search',
			mode: 'list',
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: [SECTION],
			limit: 1,
			offset: 0,
			filter_by_locators: [{ section_tipo: SECTION, section_id: String(RECORD_ID) }],
		},
		show: {
			ddo_map: [{ tipo: 'test140', section_tipo: SECTION, parent: SECTION, mode: 'list' }],
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
	// A seeded scratch row that deletes NOTHING means the fixed id collided or
	// something swept it mid-run — fail loudly rather than mask it.
	if ((await sweepRecord()) === 0) {
		throw new Error(
			`Scratch cleanup deleted 0 rows for ${SECTION}/${RECORD_ID} (matrix_test) — the seed vanished mid-run.`,
		);
	}
});

describe('iri label-dataframe read (TS-native, oracle-captured golden)', () => {
	test('frame + label child + iri item DEEP-EQUAL the golden, in order', () => {
		// Fixture integrity floors — the semantics the differential pinned must
		// be IN the golden (guards a truncated/regenerated fixture; the engine
		// assertion is the deep-equal below).
		const items = golden.items as Record<string, unknown>[];
		expect(items.map((item) => item.tipo)).toEqual(['dd560', 'dd1715', 'test140']);
		expect(items[0]?.mode).toBe('edit'); // dd560's node-declared frame mode
		expect(items[0]?.pagination).toEqual({ total: 1, limit: 30, offset: 0 } as never);
		expect(JSON.stringify(items[0]?.entries)).toContain('"paginated_key":0');
		expect(items[2]?.counter).toBe(0); // literal carries counter

		expect(tsItems.map(comparable)).toEqual(items as never);
	});
});
