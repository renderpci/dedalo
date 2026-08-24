/**
 * ACTIVITY listing (dd542 over matrix_activity) — TS-NATIVE twin (DEC-14b) of
 * test/parity/activity_read_differential.test.ts.
 *
 * WHY THE DIFFERENTIAL RETIRED (its own 2026-08-19 header states the fact):
 * `matrix_activity` is the engine's APPEND-ONLY AUDIT LOG — every API call
 * writes a row, including the suite's own — so its frozen `ORDER BY section_id
 * ASC LIMIT 3` replay can only ever return the suite's residue, never the
 * corpus rows the fixture was harvested against, and the RQO cannot be
 * narrowed without breaking the frozen interaction hash. A gate that reads a
 * shared append-only surface through a fixed window measures the residue, not
 * the engine.
 *
 * THE TWIN builds the situation instead: three scratch dd542 rows at explicit
 * ids in the reserved >= 900000 band (the audit counter lives orders of
 * magnitude below, so `ORDER BY section_id DESC LIMIT 3` returns EXACTLY the
 * seeded rows no matter how much residue the run itself appends), read through
 * the REAL pipeline (dispatchRqo, the differential's own ddo_map), asserting
 * the same wire facts the differential compared:
 *  - the dd543 user portal resolves through its dd132 username subdatum;
 *  - the dd545 "what" select resolves the dd42 datalist label;
 *  - the dd546/dd544 input_texts serve the stored values;
 *  - the envelope row carries entries + server-authoritative pagination.
 * Mapping recorded in engineering/ORACLE_HARVEST.md (generic-TLD replacement
 * map). Seed-shipped `dd` ontology only — every installation has it.
 *
 * @twin-of      test/parity/activity_read_differential.test.ts
 * @twin-status  frozen-record
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const ACTIVITY_SECTION = 'dd542';
/** Scratch band 969000-969999 (unused elsewhere — checked 2026-08-23). */
const ROW_IDS = [969001, 969002, 969003] as const;

/** The seeded per-row facts the read must serve back. */
const ROWS = [
	{ sectionId: 969001, where: 'zzact where one', ip: '203.0.113.1' },
	{ sectionId: 969002, where: 'zzact where two', ip: '203.0.113.2' },
	{ sectionId: 969003, where: 'zzact where three', ip: '203.0.113.3' },
] as const;

/** dd545 target: dd42/7 — seed-shipped "what" vocabulary, lg-spa 'Listado'. */
const WHAT_SECTION = 'dd42';
const WHAT_ID = 7;
const WHAT_LABEL_SPA = 'Listado';

const ACTIVITY_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	options: {},
	source: {
		typo: 'source',
		model: 'section',
		tipo: ACTIVITY_SECTION,
		section_tipo: ACTIVITY_SECTION,
		action: 'search',
		mode: 'list',
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: [ACTIVITY_SECTION],
		limit: 3,
		offset: 0,
		// DESC: the seeded band outranks every counter-allocated audit row, so
		// the window is deterministic even while the run appends its own rows.
		order: [{ direction: 'DESC', path: [{ component_tipo: 'section_id' }] }],
	},
	show: {
		ddo_map: [
			{ tipo: 'dd543', section_tipo: ACTIVITY_SECTION, parent: ACTIVITY_SECTION, mode: 'list' },
			{ tipo: 'dd545', section_tipo: ACTIVITY_SECTION, parent: ACTIVITY_SECTION, mode: 'list' },
			{ tipo: 'dd546', section_tipo: ACTIVITY_SECTION, parent: ACTIVITY_SECTION, mode: 'list' },
			{ tipo: 'dd544', section_tipo: ACTIVITY_SECTION, parent: ACTIVITY_SECTION, mode: 'list' },
		],
	},
};

async function sweep(): Promise<number> {
	const deleted = (await sql.unsafe(
		`DELETE FROM matrix_activity WHERE section_tipo = $1 AND section_id = ANY($2::int[]) RETURNING id`,
		[ACTIVITY_SECTION, `{${ROW_IDS.join(',')}}`],
	)) as unknown[];
	return deleted.length;
}

let tsData: Record<string, unknown>[] = [];

beforeAll(async () => {
	await sweep(); // pre-clean a crashed prior run
	for (const row of ROWS) {
		await sql.unsafe(
			`INSERT INTO matrix_activity (section_tipo, section_id, relation, string)
			 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
			[
				ACTIVITY_SECTION,
				row.sectionId,
				JSON.stringify({
					dd543: [
						{ type: 'dd151', section_id: -1, section_tipo: 'dd128', from_component_tipo: 'dd543' },
					],
					dd545: [
						{
							type: 'dd151',
							section_id: WHAT_ID,
							section_tipo: WHAT_SECTION,
							from_component_tipo: 'dd545',
						},
					],
				}),
				JSON.stringify({
					dd544: [{ lang: 'lg-nolan', value: row.ip }],
					dd546: [{ lang: 'lg-nolan', value: row.where }],
				}),
			],
		);
	}

	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	const tsResult = await dispatchRqo(
		structuredClone(ACTIVITY_RQO) as never,
		{
			requestId: 't',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	tsData = ((tsResult.body as { data?: { data?: unknown[] } }).data?.data ?? []) as Record<
		string,
		unknown
	>[];
});

afterAll(async () => {
	// The three seeded rows MUST be there to delete — 0 means the seed
	// vanished mid-run (or the filter is wrong), which would make every
	// assertion above vacuous in the wrong direction.
	expect(await sweep()).toBe(ROW_IDS.length);
});

/** The read items of one seeded row, keyed by component tipo. */
function itemsOfRow(sectionId: number): Map<string, Record<string, unknown>> {
	const items = tsData
		.slice(1)
		.filter((item) => Number(item.row_section_id ?? item.section_id) === sectionId);
	return new Map(items.map((item) => [String(item.tipo), item]));
}

describe('activity listing native (dd542 over matrix_activity, DEC-14b twin)', () => {
	test('the sections envelope serves exactly the three seeded entries', () => {
		const envelope = tsData[0] as
			| { typo?: string; entries?: { section_id?: unknown }[] }
			| undefined;
		expect(envelope, 'no envelope row — the read served nothing').toBeDefined();
		expect(envelope?.typo).toBe('sections');
		expect((envelope?.entries ?? []).map((entry) => Number(entry.section_id)).sort()).toEqual(
			[...ROW_IDS].sort(),
		);
	});

	test('the DESC window returns exactly the three seeded rows', () => {
		const rowIds = [
			...new Set(tsData.slice(1).map((item) => Number(item.row_section_id ?? item.section_id))),
		].sort();
		expect(rowIds).toEqual([...ROW_IDS].sort());
	});

	test('dd546/dd544 input_texts serve the stored where/ip per row', () => {
		for (const row of ROWS) {
			const items = itemsOfRow(row.sectionId);
			const where = items.get('dd546') as { entries?: { value?: unknown }[] } | undefined;
			const ip = items.get('dd544') as { entries?: { value?: unknown }[] } | undefined;
			expect(where, `dd546 item missing for row ${row.sectionId}`).toBeDefined();
			expect(ip, `dd544 item missing for row ${row.sectionId}`).toBeDefined();
			expect(JSON.stringify(where)).toContain(row.where);
			expect(JSON.stringify(ip)).toContain(row.ip);
		}
	});

	test('the dd543 user portal serves the stored locator with per-component pagination', () => {
		// The LIST wire serves relation components as LOCATOR entries (the
		// client resolves labels) — the exact bytes the differential compared.
		for (const row of ROWS) {
			const user = itemsOfRow(row.sectionId).get('dd543') as
				| { entries?: unknown[]; pagination?: { total?: number; limit?: number; offset?: number } }
				| undefined;
			expect(user, `dd543 item missing for row ${row.sectionId}`).toBeDefined();
			expect(user?.entries).toEqual([
				{
					type: 'dd151',
					section_id: -1,
					section_tipo: 'dd128',
					from_component_tipo: 'dd543',
					paginated_key: 0,
				},
			]);
			expect(user?.pagination).toEqual({ total: 1, limit: 1, offset: 0 });
		}
	});

	test('the dd545 what-select RESOLVES the dd42 datalist label in list mode', () => {
		// Unlike the portal, the select's list emission resolves the target
		// record's label (lg-spa slice of dd42/7) — asserting the resolved
		// string proves the datalist hop ran, not just the locator echo.
		for (const row of ROWS) {
			const what = itemsOfRow(row.sectionId).get('dd545') as { entries?: unknown[] } | undefined;
			expect(what, `dd545 item missing for row ${row.sectionId}`).toBeDefined();
			expect(what?.entries).toEqual([WHAT_LABEL_SPA]);
		}
	});
});
