/**
 * component_info WIDGETS read-time compute — TS-NATIVE half (DEC-14b P1), the
 * survival twin of test/parity/info_widget_differential.test.ts (which needs
 * the live PHP oracle and dies without it).
 *
 * Every case is fully scratch-seeded at FIXED high ids (or reads the
 * self-healing canonical test3 records) and its list+edit `entries` are
 * DEEP-EQUAL against GOLDENS captured from the LIVE PHP ORACLE on these exact
 * seeds (2026-07-10 UTC, scratchpad capture_dec14b_p1.ts — the capture run
 * verified TS === PHP per case/mode, with WC-026 normalizeWidgetEntryKeys
 * applied to the PHP side only, plus the state datalist and the tc slow-path
 * write-back on the PHP side). Goldens live in fixtures/info_widget_native/;
 * NEVER regenerate them from TS output — recapture from the PHP oracle with
 * the same seeds.
 *
 * Coverage (the differential's per-widget map, natively re-seeded):
 *  - get_archive_weights : STORED misc value (scratch — the differential's
 *    stored case rode the mutable numisdata3/4 production record; a synthetic
 *    stored bag pins the same use_db_data branch), live fallback compute over
 *    scratch coins (used/duplicated skips + mean/max/min/count math), and the
 *    empty-portal early [].
 *  - test_info           : canonical test3/1 (full-array get_data quirk —
 *    lg-eng-only record, widget reads item[0] regardless of lang) + test3/27
 *    + the TRUE placeholder fallback on an EMPTY scratch test3 record (the
 *    differential's 'placeholder' record 27 now stores a value — both pinned).
 *  - tags                : scratch rsc2 transcription with tag markup — the
 *    state-letter pair semantics (missing-pair detection compares STATE
 *    letters; 'x' open with no close counts) and the raw-items-lead quirk.
 *  - get_coins_by_period : scratch hoard chain — term-match (dc1/187), the
 *    '?' catch-all (unmatched dc1/1 + missing period), duplicated skip;
 *    use_parent false (numisdata1478) and true (numisdata1479 — dc1/187 has
 *    no matching-model ancestor on this install, everything rolls to '?').
 *  - media_icons + descriptors (oh87): scratch oh1→rsc167 chain with a cached
 *    rsc54 duration and rsc860 descriptor locators — icon rows with
 *    tool_context (user-tools simple context + enriched tool_config) and the
 *    merged dd_grid terms value.
 *  - user_activity       : async widget — skipped at read (entries []) on a
 *    scratch dd128 record (matrix_users, the PHP fixed-case table).
 *  - calculation         : summarize with EMPTY inputs (total 0), the
 *    to_euros/calculate_period formulas on canonical test3/1, and the TS side
 *    of the PHP array_sum defect pin (non-empty input → TS serves [[]]; the
 *    PHP crash itself stays pinned in the parity differential ONLY).
 *  - state               : detail + total items and the EDIT datalist over
 *    the dd501/dd174 install vocabularies.
 *  - tc SLOW PATH        : READ-NO-WRITE — TS emits 00:00:00.000 for a tape
 *    without the cached rsc54 and must NOT write it back (PHP persists it
 *    during the read — that write-back is pinned in the differential ONLY).
 *
 * Live-data dependencies (noted, not seeded): the dc1 chronology thesaurus
 * (term dc1/187 'Periodo' label + hierarchy shape), the dd501/dd174 install
 * vocabularies (state values + datalist option lists), the tools registry +
 * ontology tool_config (media_icons tool_context) and the canonical test3
 * records (self-healed via ensureCanonicalTest3). All are reference/fixture
 * data; if curators edit them, recapture.
 *
 * Scratch ids: 900311..900314 per section — above every live max (largest:
 * numisdata4 at ~181k) and clear of the indexation gates' 90001/90002/
 * 90000002 and the dataframe native gates' matrix_test 900311/900312 (other
 * table). Direct INSERTs (no counter bump) so goldens pin ids byte-stable.
 * Swept in afterAll with the loud 0-row guard (matrix_users lesson,
 * 2026-07-10); belt-and-braces pre-clean in beforeAll for crashed runs.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { ensureCanonicalTest3 } from '../helpers/test_data.ts';
import golden from './fixtures/info_widget_native/entries.golden.json';

const IW = {
	archive: 900311, // numisdata3 live-fallback compute
	archiveEmpty: 900312, // numisdata3 empty portal
	archiveStored: 900313, // numisdata3 stored misc value
	coinA: 900311, // numisdata4: used yes, weights [3.2,3.4] + diameter [17], period dc1/187
	coinB: 900312, // used yes, weight [5.0] only, period dc1/1 (unmatched → '?')
	coinC: 900313, // used '2' (weights skip) + duplicated '2' (period skip)
	coinD: 900314, // no used (weights skip), no period ('?')
	hoard: 900311, // numisdata5 + numisdata276 twin (pairs by SHARED section_id)
	tagsRecord: 900311, // rsc2 with rsc36 markup
	stateRecord: 900312, // rsc2 with rsc156/rsc80 → dd501/2, dd174/1
	tape: 900311, // rsc167 with rsc860 descriptors + cached rsc54
	tapeSlow: 900312, // rsc167 WITHOUT rsc54 (tc slow path)
	interview: 900311, // oh1 → tape
	interviewSlow: 900312, // oh1 → tapeSlow
	userActivity: 900311, // dd128 (matrix_users)
	calc: 900311, // numisdata179 with one metal number
	calcEmpty: 900312, // numisdata179 with NO metals
	emptyTest3: 900313, // matrix_test test3 with NO components (placeholder path)
};

const TAGS_TEXT =
	'<p>Intro [TC_00:00:01.000_TC] hello [index-n-1-Person-data:x:data]world[/index-n-1]' +
	' &amp; more [TC_00:00:05.000_TC] mid [index-x-2]open only [TC_00:00:03.000_TC]' +
	' [index-d-3]gone[/index-d-3] [index-r-4]review[/index-r-4]' +
	' [note-a-1-data:{"k":1}:data] [note-b-2-data:{"k":2}:data] fin&nbsp;.</p>';

/** The client-save stored shape (use_db_data branch — id-keyed items). */
const STORED_ARCHIVE_VALUE = [
	{ id: 'media_weight', key: 0, value: 8.53, widget: 'get_archive_weights' },
	{ id: 'max_weight', key: 0, value: 11.2, widget: 'get_archive_weights' },
	{ id: 'min_weight', key: 0, value: 5.86, widget: 'get_archive_weights' },
	{ id: 'total_elements_weights', key: 0, value: 3, widget: 'get_archive_weights' },
];

const locatorOf = (sectionTipo: string, sectionId: number | string, from: string, id = 1) => ({
	id,
	type: 'dd151',
	section_id: String(sectionId),
	section_tipo: sectionTipo,
	from_component_tipo: from,
});

/** Every seeded scratch row — exact (table, section_tipo, section_id). */
const SCRATCH_ROWS: { table: string; sectionTipo: string; sectionId: number }[] = [
	{ table: 'matrix', sectionTipo: 'numisdata3', sectionId: IW.archive },
	{ table: 'matrix', sectionTipo: 'numisdata3', sectionId: IW.archiveEmpty },
	{ table: 'matrix', sectionTipo: 'numisdata3', sectionId: IW.archiveStored },
	{ table: 'matrix', sectionTipo: 'numisdata4', sectionId: IW.coinA },
	{ table: 'matrix', sectionTipo: 'numisdata4', sectionId: IW.coinB },
	{ table: 'matrix', sectionTipo: 'numisdata4', sectionId: IW.coinC },
	{ table: 'matrix', sectionTipo: 'numisdata4', sectionId: IW.coinD },
	{ table: 'matrix', sectionTipo: 'numisdata5', sectionId: IW.hoard },
	{ table: 'matrix', sectionTipo: 'numisdata276', sectionId: IW.hoard },
	{ table: 'matrix', sectionTipo: 'rsc2', sectionId: IW.tagsRecord },
	{ table: 'matrix', sectionTipo: 'rsc2', sectionId: IW.stateRecord },
	{ table: 'matrix', sectionTipo: 'rsc167', sectionId: IW.tape },
	{ table: 'matrix', sectionTipo: 'rsc167', sectionId: IW.tapeSlow },
	{ table: 'matrix', sectionTipo: 'oh1', sectionId: IW.interview },
	{ table: 'matrix', sectionTipo: 'oh1', sectionId: IW.interviewSlow },
	// the Users section lives in matrix_users (PHP fixed-case table), NOT the
	// default `matrix` — a wrong-table DELETE here leaks a stub user into the
	// real Users list (the dd654 blank-options incident, fixed 2026-07-10).
	{ table: 'matrix_users', sectionTipo: 'dd128', sectionId: IW.userActivity },
	{ table: 'matrix', sectionTipo: 'numisdata179', sectionId: IW.calc },
	{ table: 'matrix', sectionTipo: 'numisdata179', sectionId: IW.calcEmpty },
	{ table: 'matrix_test', sectionTipo: 'test3', sectionId: IW.emptyTest3 },
];

async function insertRow(
	table: string,
	sectionTipo: string,
	sectionId: number,
	columns: Record<string, unknown> = {},
): Promise<void> {
	const names = Object.keys(columns);
	const columnSql = names.length > 0 ? `, ${names.join(', ')}` : '';
	const valueSql = names.map((_, index) => `, $${index + 3}::text::jsonb`).join('');
	await sql.unsafe(
		`INSERT INTO ${table} (section_id, section_tipo${columnSql}) VALUES ($1, $2${valueSql})`,
		[sectionId, sectionTipo, ...names.map((name) => JSON.stringify(columns[name]))],
	);
}

/** Remove every scratch row; returns the per-row deleted counts (guard input). */
async function sweepScratch(): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	for (const row of SCRATCH_ROWS) {
		const deleted = (await sql.unsafe(
			`DELETE FROM ${row.table} WHERE section_tipo = $1 AND section_id = $2 RETURNING id`,
			[row.sectionTipo, row.sectionId],
		)) as unknown[];
		counts.set(`${row.sectionTipo}/${row.sectionId} (table ${row.table})`, deleted.length);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[row.sectionTipo, row.sectionId],
		);
	}
	return counts;
}

async function seedScratch(): Promise<void> {
	// archives
	await insertRow('matrix', 'numisdata3', IW.archive, {
		relation: {
			numisdata77: [IW.coinA, IW.coinB, IW.coinC, IW.coinD].map((coin, index) =>
				locatorOf('numisdata4', coin, 'numisdata77', index + 1),
			),
		},
	});
	await insertRow('matrix', 'numisdata3', IW.archiveEmpty, {});
	await insertRow('matrix', 'numisdata3', IW.archiveStored, {
		misc: { numisdata595: STORED_ARCHIVE_VALUE },
	});
	// coins — shared by get_archive_weights (numisdata3 host) and
	// get_coins_by_period (numisdata5 hoard); branch table in the header.
	await insertRow('matrix', 'numisdata4', IW.coinA, {
		relation: {
			numisdata57: [locatorOf('numisdata341', 1, 'numisdata57')],
			numisdata1373: [locatorOf('dc1', 187, 'numisdata1373')],
		},
		number: {
			numisdata133: [
				{ id: 1, value: 3.2 },
				{ id: 2, value: 3.4 },
			],
			numisdata135: [{ id: 1, value: 17 }],
		},
	});
	await insertRow('matrix', 'numisdata4', IW.coinB, {
		relation: {
			numisdata57: [locatorOf('numisdata341', 1, 'numisdata57')],
			numisdata1373: [locatorOf('dc1', 1, 'numisdata1373')],
		},
		number: { numisdata133: [{ id: 1, value: 5.0 }] },
	});
	await insertRow('matrix', 'numisdata4', IW.coinC, {
		relation: {
			numisdata57: [locatorOf('numisdata341', 2, 'numisdata57')],
			numisdata157: [locatorOf('numisdata341', 2, 'numisdata157')],
		},
		number: { numisdata133: [{ id: 1, value: 99 }] },
	});
	await insertRow('matrix', 'numisdata4', IW.coinD, {});
	// hoard + its numisdata276 twin (pairs by SHARED section_id)
	await insertRow('matrix', 'numisdata5', IW.hoard, {
		relation: {
			numisdata322: [IW.coinA, IW.coinB, IW.coinC, IW.coinD].map((coin, index) =>
				locatorOf('numisdata4', coin, 'numisdata322', index + 1),
			),
		},
	});
	await insertRow('matrix', 'numisdata276', IW.hoard, { data: {} });
	// tags
	await insertRow('matrix', 'rsc2', IW.tagsRecord, {
		string: { rsc36: [{ id: 1, lang: 'lg-spa', value: TAGS_TEXT }] },
	});
	// state (REAL dd501/dd174 vocabulary records: dd501/2, dd174/1)
	await insertRow('matrix', 'rsc2', IW.stateRecord, {
		relation: {
			rsc156: [locatorOf('dd501', 2, 'rsc156')],
			rsc80: [locatorOf('dd174', 1, 'rsc80')],
		},
	});
	// media_icons + descriptors chain
	await insertRow('matrix', 'rsc167', IW.tape, {
		relation: {
			rsc860: [locatorOf('dc1', 187, 'rsc860'), locatorOf('dc1', 3, 'rsc860', 2)],
		},
		string: { rsc54: [{ id: 1, lang: 'lg-nolan', value: '00:42:07' }] },
	});
	await insertRow('matrix', 'oh1', IW.interview, {
		relation: { oh25: [locatorOf('rsc167', IW.tape, 'oh25')] },
	});
	// tc slow path: tape WITHOUT the cached rsc54 duration
	await insertRow('matrix', 'rsc167', IW.tapeSlow, {});
	await insertRow('matrix', 'oh1', IW.interviewSlow, {
		relation: { oh25: [locatorOf('rsc167', IW.tapeSlow, 'oh25')] },
	});
	// user_activity (matrix_users — PHP fixed-case table)
	await insertRow('matrix_users', 'dd128', IW.userActivity, {});
	// calculation
	await insertRow('matrix', 'numisdata179', IW.calc, {
		number: { numisdata182: [{ id: 1, value: 40.5 }] },
	});
	await insertRow('matrix', 'numisdata179', IW.calcEmpty, {});
	// test_info placeholder: an EMPTY test3 record (no test52 → deterministic
	// placeholder string encoding the section context)
	await insertRow('matrix_test', 'test3', IW.emptyTest3, {});
}

let tsContext: ApiRequestContext;

function readRqo(
	sectionTipo: string,
	sectionId: number | string,
	componentTipo: string,
	mode: string,
): Record<string, unknown> {
	return {
		action: 'read',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		options: {},
		source: {
			typo: 'source',
			model: 'section',
			tipo: sectionTipo,
			section_tipo: sectionTipo,
			action: 'search',
			mode,
			lang: 'lg-spa',
		},
		sqo: {
			section_tipo: [sectionTipo],
			limit: 1,
			offset: 0,
			filter_by_locators: [{ section_tipo: sectionTipo, section_id: String(sectionId) }],
		},
		show: {
			ddo_map: [{ tipo: componentTipo, section_tipo: sectionTipo, parent: sectionTipo, mode }],
		},
	};
}

async function tsData(rqo: Record<string, unknown>): Promise<Record<string, unknown>[]> {
	const response = (await dispatchRqo(structuredClone(rqo) as never, tsContext as never)).body as {
		result?: { data?: unknown[] };
	};
	return (response.result?.data ?? []).slice(1) as Record<string, unknown>[];
}

async function tsEntries(rqo: Record<string, unknown>): Promise<unknown[]> {
	return (await tsData(rqo)).map((item) => item.entries);
}

/** Deep-equal BOTH modes of one component read against the case golden. */
async function expectCaseGolden(
	caseName: keyof typeof golden.cases,
	sectionTipo: string,
	sectionId: number | string,
	componentTipo: string,
): Promise<void> {
	for (const mode of ['list', 'edit'] as const) {
		const entries = await tsEntries(readRqo(sectionTipo, sectionId, componentTipo, mode));
		expect(entries).toEqual(golden.cases[caseName][mode] as never);
	}
}

beforeAll(async () => {
	// The test_info + calculation cases read canonical test3 shapes (recs 1/27)
	// that client sweeps mutate — self-heal from the single verified source.
	await ensureCanonicalTest3();
	await sweepScratch(); // pre-clean a crashed prior run
	await seedScratch();
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 't',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	} as ApiRequestContext;
}, 60000);

afterAll(async () => {
	// A seeded scratch row that deletes NOTHING means the fixed id collided or
	// the DELETE targeted the wrong matrix table (matrix_users lesson) — clean
	// everything we can, then fail loudly rather than silently leak/mask.
	const counts = await sweepScratch();
	const missing = [...counts.entries()].filter(([, count]) => count === 0).map(([key]) => key);
	if (missing.length > 0) {
		throw new Error(
			`Scratch cleanup deleted 0 rows for: ${missing.join(', ')} — seed vanished mid-run or wrong table.`,
		);
	}
});

describe('component_info widget read-time compute (TS-native, oracle-captured goldens)', () => {
	test('golden integrity floors: every pinned semantic is IN the fixture', () => {
		// Guards a truncated/regenerated fixture; engine assertions are the
		// per-case deep-equals below.
		const json = JSON.stringify(golden.cases);
		for (const marker of [
			// WC-026: live + stored items carry BOTH id and widget_id
			'"widget_id":"media_weight"',
			'"id":"media_weight"',
			// tags: the raw text item LEADS, then the stat items
			'"widget":"tags"',
			'"widget_id":"total_missing_tags"',
			// coins: the term match and the '?' catch-all sentinel
			'"label":"?"',
			'"section_tipo":"dc1"',
			// media_icons: real tool_context (not {})
			'"tool_config"',
			'"widget":"media_icons"',
			// descriptors: the merged dd_grid terms value
			'"widget":"descriptors"',
			// state: detail + total rows
			'"type":"detail"',
			'"type":"total"',
			// test_info: the true placeholder fallback string
			`test_info widget value for section test3 - ${IW.emptyTest3}`,
		]) {
			expect(json).toContain(marker);
		}
		// state datalist is non-vacuous (the client TypeErrors without it)
		expect(Array.isArray(golden.state_edit_datalist[0])).toBe(true);
		expect((golden.state_edit_datalist[0] as unknown[]).length).toBeGreaterThan(0);
	});

	test('get_archive_weights: STORED misc value serves the use_db_data branch', async () => {
		await expectCaseGolden('archive_stored', 'numisdata3', IW.archiveStored, 'numisdata595');
	}, 30000);

	test('get_archive_weights: live fallback compute over the scratch coins', async () => {
		await expectCaseGolden('archive_live', 'numisdata3', IW.archive, 'numisdata595');
	}, 30000);

	test('get_archive_weights: empty source portal → entries []', async () => {
		await expectCaseGolden('archive_empty', 'numisdata3', IW.archiveEmpty, 'numisdata595');
	}, 30000);

	test('test_info: canonical source values (full-array get_data quirk) + placeholder fallback', async () => {
		await expectCaseGolden('test_info_value', 'test3', 1, 'test212');
		await expectCaseGolden('test_info_27', 'test3', 27, 'test212');
		await expectCaseGolden('test_info_placeholder', 'test3', IW.emptyTest3, 'test212');
	}, 30000);

	test('tags: transcription statistics (state-letter pair semantics)', async () => {
		await expectCaseGolden('tags', 'rsc2', IW.tagsRecord, 'rsc244');
	}, 30000);

	test('get_coins_by_period: direct grouping (use_parent false)', async () => {
		await expectCaseGolden('coins_direct', 'numisdata276', IW.hoard, 'numisdata1478');
	}, 30000);

	test('get_coins_by_period: parent roll-up (use_parent true)', async () => {
		await expectCaseGolden('coins_rollup', 'numisdata276', IW.hoard, 'numisdata1479');
	}, 30000);

	test('media_icons + descriptors (oh87): icon rows, tool_context, term grid', async () => {
		await expectCaseGolden('oh87', 'oh1', IW.interview, 'oh87');
	}, 60000);

	test('user_activity: async widget skipped at read (entries [])', async () => {
		await expectCaseGolden('user_activity', 'dd128', IW.userActivity, 'dd1537');
	}, 30000);

	test('calculation: summarize with EMPTY inputs (total 0) + the formula cases', async () => {
		await expectCaseGolden('calc_empty', 'numisdata179', IW.calcEmpty, 'numisdata1125');
		await expectCaseGolden('calc_to_euros', 'test3', 1, 'test178');
		await expectCaseGolden('calc_period', 'test3', 1, 'test179');
	}, 30000);

	test('calculation defect pin (TS side): non-empty input serves [] — PHP crashes here', async () => {
		// (!) The PHP array_sum crash is pinned in the parity differential; TS
		// computes nothing (sane convergent behavior). When PHP gets fixed the
		// DIFFERENTIAL flags it — then implement the real summarize sum in
		// computeCalculation, reconcile, and recapture this golden set.
		const entries = await tsEntries(readRqo('numisdata179', IW.calc, 'numisdata1125', 'list'));
		expect(entries).toEqual([[]] as never);
	}, 30000);

	test('state: detail + total items over the dd501/dd174 vocabularies', async () => {
		await expectCaseGolden('state', 'rsc2', IW.stateRecord, 'rsc19');
	}, 30000);

	test('state EDIT datalist: the merged vocabulary option lists (client hard-requires it)', async () => {
		const datalist = (await tsData(readRqo('rsc2', IW.stateRecord, 'rsc19', 'edit'))).map(
			(item) => item.datalist,
		);
		expect(datalist).toEqual(golden.state_edit_datalist as never);
	}, 30000);

	test('tc SLOW PATH: TS emits 00:00:00.000 and NEVER writes back during the read', async () => {
		const entries = (await tsEntries(readRqo('oh1', IW.interviewSlow, 'oh87', 'list'))) as {
			tc?: { value?: unknown };
		}[][];
		expect(entries[0]?.[0]?.tc?.value).toBe('00:00:00.000');
		expect(entries).toEqual(golden.tc_slow_list_entries as never);
		// READ-NO-WRITE (deliberate divergence — PHP persists the probed tc
		// during the read; that write-back stays pinned in the differential)
		const after = (await sql.unsafe(
			`SELECT string->'rsc54' AS v FROM matrix WHERE section_tipo = 'rsc167' AND section_id = $1`,
			[IW.tapeSlow],
		)) as { v: unknown }[];
		expect(after[0]?.v ?? null).toBeNull();
	}, 30000);
});
