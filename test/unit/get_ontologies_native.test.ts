/**
 * tool_ontology_parser::get_ontologies — TS-NATIVE twin (DEC-14b) of
 * test/parity/get_ontologies_differential.test.ts.
 *
 * WHY THE DIFFERENTIAL RETIRED: its frozen body is the monedaiberica install's
 * ~230-TLD ontology census, i.e. WHICH ontologies that install had registered
 * in matrix_ontology_main — a fact about the install, not the engine. On the
 * suite database the registered set is the seed's + the test clones', so the
 * set compare measures which database is loaded and can never pass by
 * construction (verified 2026-08-23: the two TLD sets are disjoint).
 *
 * THE TWIN asserts the census DERIVATION over rows it seeds itself
 * (src/core/ontology/data_io.ts getActiveOntologies — the shared walk behind
 * get_ontologies AND updateOntologyInfo):
 *  - the five-field wire descriptor {target_section_tipo, tld, name,
 *    typology_id, typology_name} including the typology-name hop
 *    (hierarchy13/<id> → hierarchy16 lang slice);
 *  - a record missing its tld is skipped NON-fatally into `errors` (which
 *    ride the envelope's `errors` extension key, never inside `data`);
 *  - `activeOnly` filters on the hierarchy4 → dd64/1 locator, the full census
 *    does not;
 *  - the developer gates, formerly credential-gated in the differential for no
 *    reason (they are fully native): non-developer refused, export_ontologies
 *    registered + developer-gated, empty options passes.
 * Mapping recorded in engineering/ORACLE_HARVEST.md.
 *
 * Scratch: three ontology35 rows at explicit ids 969101-969103 (reserved
 * >= 900000 band), zz* TLD names, swept with a loud 0-row guard.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getActiveOntologies } from '../../src/core/ontology/data_io.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { dispatchToolRequest } from '../../src/core/tools/dispatch.ts';

const ONTOLOGY_SECTION = 'ontology35';
const ROW_IDS = [969101, 969102, 969103] as const;
const FULL_ROW_ID = 969101; // complete metadata, ACTIVE
const NO_TLD_ROW_ID = 969102; // missing hierarchy6 → skipped into errors
const INACTIVE_ROW_ID = 969103; // hierarchy4 → dd64/2: censused, not "active"

const ZZ_TLD = 'zzgo';
const ZZ_TARGET = 'zzgo1';
const ZZ_INACTIVE_TLD = 'zzgi';
const ZZ_INACTIVE_TARGET = 'zzgi1';
const ZZ_NAME = 'zz get_ontologies census fixture';
/** Typology 2 — the seed-shipped thesaurus typology record (hierarchy13/2). */
const TYPOLOGY_ID = 2;

const appLang = config.menu.applicationLang;

function activeLocator(target: 1 | 2) {
	return [
		{
			id: 1,
			type: 'dd151',
			section_id: target,
			section_tipo: 'dd64',
			from_component_tipo: 'hierarchy4',
		},
	];
}

async function sweep(): Promise<number> {
	const deleted = (await sql.unsafe(
		`DELETE FROM matrix_ontology_main WHERE section_tipo = $1 AND section_id = ANY($2::int[]) RETURNING id`,
		[ONTOLOGY_SECTION, `{${ROW_IDS.join(',')}}`],
	)) as unknown[];
	return deleted.length;
}

async function insertRow(sectionId: number, columns: Record<string, unknown>): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_ontology_main (section_tipo, section_id, string, relation)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			ONTOLOGY_SECTION,
			sectionId,
			JSON.stringify(columns.string ?? {}),
			JSON.stringify(columns.relation ?? {}),
		],
	);
}

beforeAll(async () => {
	await sweep(); // pre-clean a crashed prior run
	await insertRow(FULL_ROW_ID, {
		string: {
			hierarchy5: [{ id: 1, lang: appLang, value: ZZ_NAME }],
			hierarchy6: [{ id: 1, lang: 'lg-nolan', value: ZZ_TLD }],
			hierarchy53: [{ id: 1, lang: 'lg-nolan', value: ZZ_TARGET }],
		},
		relation: {
			hierarchy4: activeLocator(1),
			hierarchy9: [
				{
					id: 1,
					type: 'dd151',
					section_id: TYPOLOGY_ID,
					section_tipo: 'hierarchy13',
					from_component_tipo: 'hierarchy9',
				},
			],
		},
	});
	// Target but NO tld — the census must skip it into `errors`, never throw.
	await insertRow(NO_TLD_ROW_ID, {
		string: { hierarchy53: [{ id: 1, lang: 'lg-nolan', value: 'zzgx1' }] },
		relation: { hierarchy4: activeLocator(1) },
	});
	// Complete but INACTIVE — full census yes, activeOnly no.
	await insertRow(INACTIVE_ROW_ID, {
		string: {
			hierarchy6: [{ id: 1, lang: 'lg-nolan', value: ZZ_INACTIVE_TLD }],
			hierarchy53: [{ id: 1, lang: 'lg-nolan', value: ZZ_INACTIVE_TARGET }],
		},
		relation: { hierarchy4: activeLocator(2) },
	});
});

afterAll(async () => {
	// 0 deletions = the seed vanished mid-run or the filter is wrong.
	expect(await sweep()).toBe(ROW_IDS.length);
});

interface Descriptor {
	target_section_tipo: string;
	tld: string;
	name: string | null;
	typology_id: number | null;
	typology_name: string | null;
}

describe('get_ontologies census derivation (DEC-14b twin)', () => {
	test('the tool serves the five-field descriptor, typology name resolved', async () => {
		const principal = await resolvePrincipal(-1);
		const response = await dispatchToolRequest(
			principal,
			-1,
			{ model: 'tool_ontology_parser', action: 'get_ontologies' },
			{},
		);
		const data = (Array.isArray(response.data) ? response.data : []) as Descriptor[];
		expect(data.length).toBeGreaterThan(0);
		const zz = data.find((entry) => entry.tld === ZZ_TLD);
		expect(zz, `the census does not carry the seeded '${ZZ_TLD}' ontology`).toBeDefined();
		// Field-exact, including the hierarchy13/2 → hierarchy16 name hop.
		const expectedTypologyName = await (async () => {
			// The same table resolution + lang pick the census uses, derived
			// independently of it (hierarchy13 routes through the resolver, not
			// a hardcoded table).
			const { getMatrixTableFromTipo } = await import('../../src/core/ontology/resolver.ts');
			const table = await getMatrixTableFromTipo('hierarchy13');
			const rows = (await sql.unsafe(
				`SELECT string->'hierarchy16' AS items FROM "${table}" WHERE section_tipo = 'hierarchy13' AND section_id = $1`,
				[TYPOLOGY_ID],
			)) as { items: { lang?: string; value?: unknown }[] | null }[];
			const items = rows[0]?.items ?? [];
			const match =
				items.find((item) => item.lang === appLang) ??
				items.find((item) => item.lang === 'lg-nolan') ??
				items[0];
			return typeof match?.value === 'string' ? match.value : null;
		})();
		expect(zz).toEqual({
			target_section_tipo: ZZ_TARGET,
			tld: ZZ_TLD,
			name: ZZ_NAME,
			typology_id: TYPOLOGY_ID,
			typology_name: expectedTypologyName,
		});
		// Only the five wire fields — name_data stays internal.
		expect(Object.keys(zz as object).sort()).toEqual([
			'name',
			'target_section_tipo',
			'tld',
			'typology_id',
			'typology_name',
		]);
		// The tld-less row is a NON-fatal skip riding the errors extension key.
		const errors = (response as { errors?: unknown }).errors;
		expect(Array.isArray(errors)).toBe(true);
		expect(
			(errors as string[]).some((line) => line.includes(String(NO_TLD_ROW_ID))),
			'the tld-less seeded row must be reported in the census errors',
		).toBe(true);
		// The INACTIVE row is still in the FULL census (get_ontologies walks all).
		expect(data.some((entry) => entry.tld === ZZ_INACTIVE_TLD)).toBe(true);
	});

	test('activeOnly filters on the hierarchy4 → dd64/1 locator', async () => {
		const active = await getActiveOntologies({ activeOnly: true });
		const tlds = new Set(active.ontologies.map((entry) => entry.tld));
		expect(tlds.has(ZZ_TLD)).toBe(true);
		expect(tlds.has(ZZ_INACTIVE_TLD)).toBe(false);
	});
});

describe('developer security gates (native — formerly credential-gated in the differential)', () => {
	test('non-developer principal is refused', async () => {
		const nonDev = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
		const thrown = await dispatchToolRequest(
			nonDev,
			999999,
			{ model: 'tool_ontology_parser', action: 'get_ontologies' },
			{},
		).catch((error: unknown) => error);
		expect((thrown as { code?: string }).code).toBe('tool.not_authorized');
	});

	test('export_ontologies is REGISTERED and developer-gated (refuses a non-developer)', async () => {
		const nonDev = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
		const thrown = await dispatchToolRequest(
			nonDev,
			999999,
			{ model: 'tool_ontology_parser', action: 'export_ontologies' },
			{ selected_ontologies: ['dd'] },
		).catch((error: unknown) => error);
		expect(typeof (thrown as { code?: string }).code).toBe('string');
		expect((thrown as { code?: string }).code).not.toBe('tool.method_not_allowed');
	});

	test('empty options passes the developer gate', async () => {
		const principal = await resolvePrincipal(-1);
		const response = await dispatchToolRequest(
			principal,
			-1,
			{ model: 'tool_ontology_parser', action: 'get_ontologies' },
			{},
		);
		expect(Array.isArray(response.data)).toBe(true);
		expect(Array.isArray((response as { errors?: unknown }).errors)).toBe(true);
	});
});
