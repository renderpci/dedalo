/**
 * Generic has_dataframe LITERAL read — TS-NATIVE half (DEC-14b P1), the
 * survival twin of test/parity/has_dataframe_literal_differential.test.ts
 * (which needs the live PHP oracle and dies without it).
 *
 * SELF-SUFFICIENT FIXTURE (2026-07-13). This gate now BUILDS EVERY ROW IT READS
 * and reverts all of it: the frame node (FRAME_TIPO under test52), test52's
 * has_dataframe properties, the scratch test3 record, AND the dataframe's TARGET
 * record. It depends on the installation for ONTOLOGY DEFINITIONS ONLY (dd1706 /
 * dd1715 / dd490, which ship in the seed) — never on any record the install
 * happens to hold.
 *
 * It used to depend on both, and both bit:
 *   - it provisioned tipo `test218`, which the shipped seed LATER defined as a real
 *     component_date — and its revert DELETED that node from the database;
 *   - it read `dd1706/121 'Zenon'`, a record of the old shared dev DB. A fresh
 *     install carries the dd1706 ontology but no dd1706 records, so the gate could
 *     never pass on one.
 * Both are gone: the frame node is a free scratch tipo, and the target record is a
 * scratch coordinate this gate creates itself. Preconditions refuse to run if either
 * coordinate is already taken, so a future ontology/seed can never be eaten again.
 *
 * The list-read projection (the differential's exact `comparable` field set) is
 * DEEP-EQUAL against a GOLDEN captured from the LIVE PHP ORACLE (2026-07-10 UTC,
 * scratchpad capture_dec14b_p1.ts — the capture run verified TS === PHP on the
 * comparable projection, WC-001 entries:[] adopted on the PHP side only).
 * Goldens live in fixtures/has_dataframe_native/; NEVER regenerate them from
 * TS output — recapture from the PHP oracle with the same seeds. The 2026-07-13
 * edit renamed IDENTIFIERS ONLY (frame tipo, target section_id) consistently in the
 * seeds and the golden; every oracle-verified value and the projection shape are
 * byte-identical to the capture (see the golden's `_provenance`).
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
import { assertMatrixTable } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import golden from './fixtures/has_dataframe_native/list_items.golden.json';

/**
 * The scratch frame node this gate provisions and reverts.
 *
 * It used to be `test218` — chosen when that was simply the next free number. The shipped
 * install seed has SINCE grown a real `test218` (component_date, date_mode:period, under
 * test45) and a `test219` (date_range). The gate then:
 *   - INSERTed ... ON CONFLICT DO NOTHING → silently no-op'd against the real node,
 *   - compared a date component against a dataframe golden, and
 *   - in afterAll ran `DELETE FROM dd_ontology WHERE tipo='test218' AND tld='test'`,
 *     DELETING the seeded period-date component from the database.
 * A full `bun test` on a fresh install destroyed shipped ontology. (The tipo is a pure
 * identifier — see the golden's provenance — so it was renamed here and in the frozen
 * golden together; nothing captured from the oracle changed shape.)
 *
 * 900+ is far above the seeded test TLD (highest: 219). The precondition in
 * provisionFixture() is what actually keeps this honest: if the ontology ever grows into
 * this number, the gate FAILS LOUDLY instead of eating the node.
 */
const FRAME_TIPO = 'test900';
const MAIN_TIPO = 'test52';
const RECORD_ID = 900311;

/**
 * The dataframe's TARGET — the record the frame resolves to. This gate CREATES it.
 *
 * dd1706 (section) / dd1715 (component_input_text, non-translatable → `string` column at
 * lg-nolan) / dd490 (relation_type) are ONTOLOGY, and ontology ships in the install seed.
 * The RECORD does not: the golden's original dd1706/121 was a row of the old shared dev DB,
 * so the gate could not pass on a fresh install. We therefore mint our own row at a
 * reserved-high id, in the same 900000+ scratch range as RECORD_ID, and delete it after.
 * 'Zenon' is the value the oracle capture resolved, kept verbatim so the golden's
 * oracle-verified entries stay byte-identical.
 */
const TARGET_SECTION_TIPO = 'dd1706';
const TARGET_ID = 900121; // was 121, a record of the shared dev DB — see the header
const TARGET_LABEL_TIPO = 'dd1715';
const TARGET_LABEL_VALUE = 'Zenon';

let tsItems: Record<string, unknown>[] = [];
/** MAIN_TIPO's properties BEFORE we touched them — restored verbatim on revert. */
let mainPropertiesBefore: string | null = null;
/** The matrix table dd1706 resolves to (matrix_list) — resolved, never hardcoded. */
let targetTable = '';
/**
 * Did WE create these? Revert must undo only what this run made.
 *
 * Not paranoia — the first draft of this very fix set `targetTable` before the
 * occupied-coordinate check threw, so the revert would have DELETED a pre-existing
 * record it refused to touch. "I know what was there" is the assumption that ate
 * test218; the only safe revert is one that undoes what it can PROVE it did.
 */
let frameCreated = false;
let targetCreated = false;
let mainModified = false;

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
	// PRECONDITION 1 (checked FIRST — it is the destructive one): never squat on a node the
	// ontology actually owns. `ON CONFLICT DO NOTHING` used to hide exactly that: the insert
	// quietly did nothing and the revert then deleted someone else's component. A scratch
	// tipo that is no longer free is a fixture bug, and it must STOP the run rather than
	// mutate real ontology.
	const squatted = await sql.unsafe('SELECT model FROM dd_ontology WHERE tipo = $1', [
		FRAME_TIPO,
	]);
	if (squatted.length > 0) {
		throw new Error(
			`has_dataframe gate: '${FRAME_TIPO}' is a REAL ontology node (model ` +
				`'${(squatted[0] as { model: string }).model}') — this gate provisions and then DELETES ` +
				`that tipo, so running it would destroy shipped ontology. Move FRAME_TIPO to a free ` +
				`scratch tipo (and rename it in fixtures/has_dataframe_native/list_items.golden.json, ` +
				`where it appears only as an identifier). This is exactly how test218 was eaten.`,
		);
	}

	// PRECONDITION 2: the TARGET coordinate must be free — we are about to CREATE it. The
	// gate used to READ dd1706/121, a record of the old shared dev DB, so it could never
	// pass on a fresh install (the seed ships the dd1706 ontology, not its records). Now we
	// mint the row ourselves. Same rule as the tipo: if the coordinate is taken, stop —
	// never write over, and never delete, a record this gate did not create.
	const table = await getMatrixTableFromTipo(TARGET_SECTION_TIPO);
	if (table === null) {
		throw new Error(`has_dataframe gate: no matrix table for '${TARGET_SECTION_TIPO}'`);
	}
	assertMatrixTable(table); // identifier allowlist (spec §7.6) — it throws, it does not map
	targetTable = table;
	const occupied = await sql.unsafe(
		`SELECT section_id FROM ${targetTable} WHERE section_tipo = $1 AND section_id = $2`,
		[TARGET_SECTION_TIPO, TARGET_ID],
	);
	if (occupied.length > 0) {
		throw new Error(
			`has_dataframe gate: ${TARGET_SECTION_TIPO}/${TARGET_ID} already exists — this gate ` +
				'creates and then DELETES that record, so it will not touch one it did not make. Move ' +
				'TARGET_ID to a free reserved-high id (and rename it in the golden, where it appears ' +
				'only as an identifier).',
		);
	}
	// The target row: dd1715 is a non-translatable component_input_text, so its value lives
	// in the `string` column at lg-nolan — exactly the entries the golden pins.
	await sql.unsafe(
		`INSERT INTO ${targetTable} (section_id, section_tipo, string)
		 VALUES ($1, $2, jsonb_build_object($3::text, $4::text::jsonb))`,
		[
			TARGET_ID,
			TARGET_SECTION_TIPO,
			TARGET_LABEL_TIPO,
			JSON.stringify([{ id: 1, lang: 'lg-nolan', value: TARGET_LABEL_VALUE }]),
		],
	);
	targetCreated = true;

	// Snapshot MAIN_TIPO's properties so revert RESTORES them. The old revert hard-coded
	// `properties = NULL`, which is only correct while the seed happens to leave test52
	// empty: the moment it ships properties, this gate would silently wipe them.
	const priorMain = (await sql.unsafe('SELECT properties FROM dd_ontology WHERE tipo = $1', [
		MAIN_TIPO,
	])) as { properties: unknown }[];
	const priorValue = priorMain[0]?.properties ?? null;
	mainPropertiesBefore =
		priorValue === null || priorValue === undefined
			? null
			: typeof priorValue === 'string'
				? priorValue
				: JSON.stringify(priorValue);

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
	// No ON CONFLICT clause: the precondition above proved the tipo is free, so a conflict
	// here is a real error and must surface, not be swallowed.
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, model, term, tld, is_model, is_translatable, is_main, order_number, properties)
		 VALUES ($1, $2, 'component_dataframe', '{"lg-spa":"Test frame"}'::jsonb, 'test', false, false, false, 99, $3::text::jsonb)`,
		[FRAME_TIPO, MAIN_TIPO, JSON.stringify(frameProperties)],
	);
	frameCreated = true;
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
	mainModified = true;
}

/**
 * Revert by RESTORING what was there, never by asserting what we think was there.
 *
 * The old version deleted FRAME_TIPO unconditionally and hard-set MAIN_TIPO's properties to
 * NULL. Both are "reverts by assumption": true only while the ontology happens to match the
 * gate's memory of it. When the seed grew a real test218, the first line deleted it.
 *
 * The DELETE is safe now only because provisionFixture() PROVED the tipo was free before
 * creating it — the guarantee comes from the precondition, not from the DELETE.
 */
async function revertFixture(): Promise<void> {
	// The target record we minted (only ours: provisionFixture proved the coordinate was
	// free before creating it, and refuses to run otherwise).
	if (targetCreated && targetTable !== '') {
		await sql.unsafe(
			`DELETE FROM ${targetTable} WHERE section_tipo = $1 AND section_id = $2`,
			[TARGET_SECTION_TIPO, TARGET_ID],
		);
		targetCreated = false;
	}
	if (frameCreated) {
		await sql.unsafe(
			`DELETE FROM dd_ontology WHERE tipo = $1 AND tld = 'test' AND model = 'component_dataframe'`,
			[FRAME_TIPO],
		);
		frameCreated = false;
	}
	if (mainModified) {
		await sql.unsafe('UPDATE dd_ontology SET properties = $2::text::jsonb WHERE tipo = $1', [
			MAIN_TIPO,
			mainPropertiesBefore,
		]);
		mainModified = false;
	}
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
			section_id: String(TARGET_ID),
			section_tipo: TARGET_SECTION_TIPO,
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
