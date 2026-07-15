/**
 * Maintenance widget_request — TS-NATIVE half, the DEC-14b survival twin of
 * test/parity/widget_request_differential.test.ts (that gate's PHP-vs-TS
 * comparisons die with the oracle; the contracts it pinned equal to live PHP
 * survive HERE, asserted against the TS engine alone, through the same
 * dispatchRqo door).
 *
 * Re-expressed contracts:
 *  - dispatch gates — non-admin 'unauthorized', unknown widget ('Invalid
 *    widget name'), unregistered method ('unauthorized_method'), and the
 *    database_info.get_value allowlist denial (widget_request must NOT reach
 *    a panel-only getValue) — the differential's envelope pins verbatim;
 *  - counters_status.get_value — envelope msg + the datalist item shape
 *    {section_tipo,label,counter_value,last_section_id}. The differential
 *    byte-compared the FULL list against PHP over the SHARED mutable
 *    matrix_counter, so the native half asserts the pinned per-item shape and
 *    per-row consistency with the live counter/MAX instead of full bytes.
 *    The non-section counter row error message is pinned from PHP source
 *    (core/common/class.counter.php:415) on a synthetic test52 counter row;
 *  - database_info get_widget_value (compute) — the tables/indexes catalog
 *    read shape: pg_indexes row anatomy {schemaname,tablename,indexname,
 *    index_size,indexdef}, membership anchors, pg_size_pretty format +
 *    size-DESC ordering, and the differential-pinned engine-native
 *    info.server containing 'PostgreSQL';
 *  - counters_status.modify_counter — the differential's TS-side surviving
 *    contract verbatim (the PHP path is a pinned live defect there: every
 *    well-formed request dies on 'empty mandatory section_tipo'): fix
 *    consolidates the counter to the section's real MAX(section_id) (drift
 *    injected upward first so the consolidation is observable; the counter
 *    state is restored UNCONDITIONALLY in afterAll), reset deletes the
 *    counter row (synthetic zztc2 row, removed in finally, fail-loud);
 *  - database_info.rebuild_user_stats — the differential's exact synthetic
 *    provisioning (user 424252 here, 2 days of activity incl. a dd1223
 *    publish event and a skipped dd271 'where'). The dd1521 aggregate rows
 *    were byte-compared PHP↔TS there, so their content HERE is pinned from
 *    the PHP algorithm (class.diffusion_section_stats.php: the what-code→term
 *    map, the where-skip set, dd1223→publish routing, the hour histogram,
 *    save_user_activity's row anatomy incl. the virtual-calendar `time`).
 *
 * SOFTENED / TS-side notes (never oracle-pinned by the differential):
 *  - ontology term labels (counters datalist `label`, stats what-item
 *    `label`) are shared MUTABLE ontology values — asserted AS the term for
 *    that tipo via termByTipo, never as literal strings;
 *  - datalist ordering (DB collation vs JS string order) is not re-asserted;
 *  - the reset success msg + the refreshed datalist modify_counter attaches
 *    come from PHP source (class.counters_status.php:150-160 — PHP's own
 *    modify_counter dies before reaching them);
 *  - the database_info panel envelope msg is the TS widget's (the
 *    differential only compared result.tables/indexes/info).
 *
 * NOT re-expressed here (owned elsewhere / oracle-only): make_backup
 * (ops_backup.test.ts), register_tools (register_tools_widget.test.ts),
 * error_reports (error_reports_widget.test.ts), dataframe_control run_fix
 * (ws_a_write_path.test.ts §S2-06 + the sibling dataframe gates),
 * analyze_db / consolidate_tables / optimize_tables / rebuild_db_* /
 * unit_test / export_hierarchy / update_data_version / move_* / media panels
 * (shared-DB byte parity or covered by their own native gates).
 *
 * Scratch hygiene: one fresh test3 record (counter materialization), one
 * synthetic test52 + one zztc2 matrix_counter row, synthetic matrix_activity
 * rows + the dd1521 aggregates they produce — all swept fail-loud.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { virtualDateSeconds } from '../../src/core/area_maintenance/user_stats.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { termByTipo } from '../../src/core/ontology/labels.ts';
import { currentApplicationLang } from '../../src/core/resolve/request_lang.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const WIDGET_RQO = {
	action: 'widget_request',
	dd_api: 'dd_area_maintenance_api',
	prevent_lock: true,
	options: {},
	source: { typo: 'source', model: 'counters_status', action: 'get_value' },
};

/** The differential's tsCall — the SAME dispatchRqo door, root or non-admin. */
async function tsCall(
	rqo: Record<string, unknown>,
	admin = true,
): Promise<Record<string, unknown>> {
	const token = admin ? createSession(-1, 'root', true) : createSession(999999, 'nobody', false);
	const session = getSession(token);
	const principal = await resolvePrincipal(admin ? -1 : 999999);
	const result = await dispatchRqo(
		structuredClone(rqo) as never,
		{
			requestId: 'widget_native_test',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
	return result.body;
}

describe('widget_request dispatch gates (differential-pinned envelopes)', () => {
	test('non-admin is refused with unauthorized', async () => {
		const nonAdmin = await tsCall(WIDGET_RQO, false);
		expect((nonAdmin.errors as string[])[0]).toBe('unauthorized');
	});

	test('unknown widget id is refused with Invalid widget name', async () => {
		const badWidget = await tsCall({
			...WIDGET_RQO,
			source: { typo: 'source', model: 'not_a_widget', action: 'get_value' },
		});
		expect((badWidget.errors as string[])[0]).toContain('Invalid widget name');
	});

	test('unregistered method is refused with unauthorized_method', async () => {
		const badMethod = await tsCall({
			...WIDGET_RQO,
			source: { typo: 'source', model: 'counters_status', action: 'drop_everything' },
		});
		expect(badMethod.errors as string[]).toContain('unauthorized_method');
	});

	test('widget_request DENIES database_info.get_value (panel-only allowlist)', async () => {
		const denied = await tsCall({
			...WIDGET_RQO,
			source: { typo: 'source', model: 'database_info', action: 'get_value' },
		});
		expect(denied.result).toBe(false);
		expect(denied.errors as string[]).toContain('unauthorized_method');
	});
});

describe('counters_status.get_value (datalist shape + audit consistency)', () => {
	test('datalist item shape, live consistency, non-section row error', async () => {
		let removed: unknown[] = [];
		// synthetic NON-SECTION counter row: test52 is a component_input_text
		// tipo — the audit must report it in errors and keep it OFF the datalist
		// (message pinned from PHP core/common/class.counter.php:415).
		await sql.unsafe(
			`INSERT INTO matrix_counter (tipo, value, ref) VALUES ('test52', 7, 'synthetic native gate row')`,
			[],
		);
		try {
			// live anchors read independently right before the audit call
			const counterRows = (await sql.unsafe(
				`SELECT value FROM matrix_counter WHERE tipo = 'test3'`,
				[],
			)) as { value: number | string }[];
			const maxRows = (await sql.unsafe(
				`SELECT COALESCE(MAX(section_id), 0) AS max FROM matrix_test WHERE section_tipo = 'test3'`,
				[],
			)) as { max: number | string }[];

			const body = await tsCall(WIDGET_RQO);
			expect(body.msg).toBe('OK. Request done successfully');
			const result = body.result as { datalist?: Record<string, unknown>[]; errors?: string[] };

			// every item carries EXACTLY the differential-pinned key set
			expect((result.datalist?.length ?? 0) > 0).toBe(true);
			for (const item of result.datalist ?? []) {
				expect(Object.keys(item).sort()).toEqual([
					'counter_value',
					'label',
					'last_section_id',
					'section_tipo',
				]);
				expect(typeof item.section_tipo).toBe('string');
				expect(typeof item.counter_value).toBe('number');
				expect(typeof item.last_section_id).toBe('number');
				expect(item.label === null || typeof item.label === 'string').toBe(true);
			}

			// the test3 audit row agrees with the live counter + MAX(section_id)
			const test3 = (result.datalist ?? []).find((item) => item.section_tipo === 'test3');
			expect(test3).toBeDefined();
			if (counterRows.length > 0) {
				expect(test3?.counter_value).toBe(Number(counterRows[0]?.value));
			}
			expect(test3?.last_section_id).toBe(Number(maxRows[0]?.max));
			// label is the shared ontology term (mutable — asserted AS the term)
			expect(test3?.label).toBe((await termByTipo('test3', 'lg-spa')) as never);

			// the synthetic non-section row: pinned error message, off the datalist
			expect(result.errors).toContain(
				"Counter row with tipo: 'test52' is a 'component_input_text' . Only sections can use counters. Fix ASAP",
			);
			expect((result.datalist ?? []).some((item) => item.section_tipo === 'test52')).toBe(false);
			expect(body.errors).toEqual([]);
		} finally {
			removed = (await sql.unsafe(
				`DELETE FROM matrix_counter WHERE tipo = 'test52' RETURNING tipo`,
				[],
			)) as unknown[];
		}
		// fail-loud tracked cleanup (outside finally so it never masks the
		// original assertion error — the DELETE itself already ran)
		expect(removed.length).toBe(1);
	}, 60000);
});

/** pg_size_pretty → bytes (for the size-DESC ordering assertion). */
function prettyToBytes(pretty: string): number {
	const match = /^(\d+(?:\.\d+)?) (bytes|kB|MB|GB|TB|PB)$/.exec(pretty);
	if (match === null) throw new Error(`not a pg_size_pretty value: ${pretty}`);
	const unit = { bytes: 1, kB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, PB: 1024 ** 5 }[
		match[2] as 'bytes'
	];
	return Number(match[1]) * unit;
}

describe('database_info compute (get_widget_value catalog read)', () => {
	test('tables + per-table indexes shape; info.server is PostgreSQL', async () => {
		const body = await tsCall({
			action: 'get_widget_value',
			dd_api: 'dd_area_maintenance_api',
			prevent_lock: true,
			options: {},
			source: { typo: 'source', model: 'database_info' },
		});
		const result = body.result as {
			tables?: string[];
			indexes?: Record<string, Record<string, unknown>[]>;
			info?: { server?: unknown; host?: unknown };
		};

		// tables: the public-schema catalog — the shared-install anchors present
		expect(Array.isArray(result.tables)).toBe(true);
		for (const anchor of [
			'matrix',
			'matrix_test',
			'matrix_counter',
			'matrix_activity',
			'matrix_stats',
			'matrix_time_machine',
			'dd_ontology',
		]) {
			expect(result.tables).toContain(anchor);
		}

		// indexes: keyed by table (⊆ tables), each row the pinned pg_indexes
		// anatomy, pg_size_pretty format, size-DESC order within the table
		const indexes = result.indexes ?? {};
		expect(Object.keys(indexes).length > 0).toBe(true);
		expect(indexes.matrix_test).toBeDefined();
		for (const [table, rows] of Object.entries(indexes)) {
			expect(result.tables).toContain(table);
			expect(rows.length > 0).toBe(true);
			let previousBytes = Number.POSITIVE_INFINITY;
			for (const row of rows) {
				expect(Object.keys(row).sort()).toEqual([
					'index_size',
					'indexdef',
					'indexname',
					'schemaname',
					'tablename',
				]);
				expect(row.schemaname).toBe('public');
				expect(row.tablename).toBe(table);
				expect(typeof row.indexname).toBe('string');
				expect(String(row.indexdef).startsWith('CREATE ')).toBe(true);
				const bytes = prettyToBytes(String(row.index_size));
				expect(bytes).toBeLessThanOrEqual(previousBytes);
				previousBytes = bytes;
			}
		}

		// engine-native by design (differential-pinned assertion, verbatim)
		expect(String(result.info?.server ?? '')).toContain('PostgreSQL');
		expect(typeof result.info?.host).toBe('string');
	}, 120000);
});

describe('counters_status.modify_counter (fix + reset, scratch-only)', () => {
	let scratchId = 0;
	let counterSnapshot: number | null = null;

	beforeAll(async () => {
		const rows = (await sql.unsafe(
			`SELECT value FROM matrix_counter WHERE tipo = 'test3'`,
			[],
		)) as {
			value: number | string;
		}[];
		counterSnapshot = rows.length > 0 ? Number(rows[0]?.value) : null;
		// materializes the test3 counter row and gives fix a known newest id
		scratchId = await createSectionRecord('test3', -1);
	});

	afterAll(async () => {
		const leaked: string[] = [];
		if (scratchId > 0) {
			const deleted = (await sql.unsafe(
				`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = $1 RETURNING id`,
				[scratchId],
			)) as unknown[];
			if (deleted.length === 0) leaked.push(`test3/${scratchId}`);
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = 'test3' AND section_id = $1`,
				[scratchId],
			);
		}
		// UNCONDITIONAL counter restore: never below the pre-test value, the
		// issued scratch id, or the surviving MAX(section_id) — a failed
		// assertion must not leave the injected drift (or a rewound counter
		// that would re-issue live ids) behind.
		await sql.unsafe(
			`UPDATE matrix_counter
			 SET value = GREATEST($1::bigint, (SELECT COALESCE(MAX(section_id), 0) FROM matrix_test WHERE section_tipo = 'test3'))
			 WHERE tipo = 'test3'`,
			[Math.max(counterSnapshot ?? 0, scratchId)],
		);
		// defensive sweep of the reset fixture (its test cleans up fail-loud)
		await sql.unsafe(`DELETE FROM matrix_counter WHERE tipo = 'zztc2'`, []);
		if (leaked.length > 0) {
			throw new Error(`cleanup leaked scratch rows: ${leaked.join(', ')}`);
		}
	});

	test('fix consolidates the counter to the section MAX(section_id)', async () => {
		// inject upward drift so the consolidation is observable
		await sql.unsafe(`UPDATE matrix_counter SET value = value + 500 WHERE tipo = 'test3'`, []);

		const fixed = (await tsCall({
			...WIDGET_RQO,
			options: { section_tipo: 'test3', counter_action: 'fix' },
			source: { typo: 'source', model: 'counters_status', action: 'modify_counter' },
		})) as { result?: unknown; msg?: string; datalist?: Record<string, unknown>[] };
		// TS-side surviving contract, verbatim from the differential
		expect(fixed.result).toBe(true);
		expect(fixed.msg).toBe('OK. fix counter successfully test3');

		const maxRows = (await sql.unsafe(
			`SELECT section_id FROM matrix_test WHERE section_tipo = 'test3' ORDER BY section_id DESC LIMIT 1`,
			[],
		)) as { section_id: number }[];
		const counterRows = (await sql.unsafe(
			`SELECT value FROM matrix_counter WHERE tipo = 'test3'`,
			[],
		)) as { value: number }[];
		expect(Number(counterRows[0]?.value)).toBe(Number(maxRows[0]?.section_id));

		// PHP re-runs check_counters and attaches the refreshed audit datalist
		// (PHP source class.counters_status.php:150-160; PHP's own path dies
		// earlier, so this is source-derived, not differential-compared).
		const audited = (fixed.datalist ?? []).find((item) => item.section_tipo === 'test3');
		expect(audited?.counter_value).toBe(Number(maxRows[0]?.section_id));
		expect(audited?.last_section_id).toBe(Number(maxRows[0]?.section_id));
	}, 60000);

	test('reset deletes the counter row (synthetic zztc2)', async () => {
		await sql.unsafe(
			`INSERT INTO matrix_counter (tipo, value, ref) VALUES ('zztc2', 999, 'synthetic native gate row')`,
			[],
		);
		try {
			const reset = (await tsCall({
				...WIDGET_RQO,
				options: { section_tipo: 'zztc2', counter_action: 'reset' },
				source: { typo: 'source', model: 'counters_status', action: 'modify_counter' },
			})) as { result?: unknown; msg?: string };
			expect(reset.result).toBe(true);
			// msg from the same PHP template the fix variant pinned (softened:
			// the reset wording itself was never differential-compared)
			expect(reset.msg).toBe('OK. reset counter successfully zztc2');
			const left = (await sql.unsafe(
				`SELECT 1 FROM matrix_counter WHERE tipo = 'zztc2'`,
				[],
			)) as unknown[];
			expect(left.length).toBe(0);
		} finally {
			// a failed assertion must still remove the synthetic row
			await sql.unsafe(`DELETE FROM matrix_counter WHERE tipo = 'zztc2'`, []);
		}
	}, 60000);
});

describe('database_info.rebuild_user_stats (dd1521 aggregate anatomy)', () => {
	// distinct synthetic user — the differential owns 424242
	const UID = 424252;
	const dayA = new Date(Date.now() - 2 * 86400000);
	const dayB = new Date(Date.now() - 1 * 86400000);
	const isoDay = (date: Date): string =>
		`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
			date.getDate(),
		).padStart(2, '0')}`;

	const activityIds: number[] = [];
	let body: Record<string, unknown> = {};
	let statsRows: Record<string, unknown>[] = [];
	const labels: Record<string, string | null> = {};

	const userFilter = JSON.stringify({
		dd1522: [{ section_tipo: 'dd128', section_id: String(UID) }],
	});

	/** The differential's exact synthetic activity row (direct SQL — dd542 is consultation-only). */
	const insertActivity = async (
		date: Date,
		hour: number,
		code: number,
		where: string,
		dataMessage: Record<string, unknown> | null = null,
	): Promise<void> => {
		const timestamp = `${isoDay(date)} ${String(hour).padStart(2, '0')}:15:00`;
		const rows = (await sql.unsafe(
			`INSERT INTO matrix_activity (section_tipo, relation, string, date, misc, timestamp)
			 VALUES ('dd542', $1::text::jsonb, $2::text::jsonb, $3::text::jsonb, $4::text::jsonb, $5)
			 RETURNING id`,
			[
				JSON.stringify({
					dd543: [
						{
							id: 1,
							type: 'dd151',
							section_id: String(UID),
							section_tipo: 'dd128',
							from_component_tipo: 'dd543',
						},
					],
					dd545: [
						{
							id: 1,
							type: 'dd151',
							section_id: String(code),
							section_tipo: 'dd552',
							from_component_tipo: 'dd545',
						},
					],
				}),
				JSON.stringify({ dd546: [{ id: 1, lang: 'lg-nolan', value: where }] }),
				JSON.stringify({
					dd547: [
						{
							id: 1,
							start: {
								year: date.getFullYear(),
								month: date.getMonth() + 1,
								day: date.getDate(),
								hour,
								minute: 15,
								second: 0,
							},
						},
					],
				}),
				JSON.stringify(
					dataMessage ? { dd551: [{ id: 1, lang: 'lg-nolan', value: dataMessage }] } : {},
				),
				timestamp,
			],
		)) as { id: number }[];
		activityIds.push(Number(rows[0]?.id));
	};

	const readStatsRows = async (): Promise<Record<string, unknown>[]> =>
		(await sql.unsafe(
			`SELECT relation->'dd1522' AS u, string->'dd1531' AS t, date->'dd1530' AS d,
			        misc->'dd1523' AS totals, meta
			 FROM matrix_stats
			 WHERE section_tipo = 'dd1521' AND relation @> $1::text::jsonb
			 ORDER BY id`,
			[userFilter],
		)) as Record<string, unknown>[];

	beforeAll(async () => {
		// defensive sweep of any leftovers from an earlier aborted run
		await sql.unsafe(
			`DELETE FROM matrix_stats WHERE section_tipo = 'dd1521' AND relation @> $1::text::jsonb`,
			[userFilter],
		);
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND relation @> $1::text::jsonb`,
			[JSON.stringify({ dd543: [{ section_tipo: 'dd128', section_id: String(UID) }] })],
		);

		// the differential's exact 2-day provisioning
		await insertActivity(dayA, 9, 1, 'dd542'); // login
		await insertActivity(dayA, 9, 5, 'numisdata3'); // save
		await insertActivity(dayA, 10, 5, 'numisdata3'); // save
		await insertActivity(dayA, 10, 6, 'numisdata4'); // edit
		await insertActivity(dayA, 11, 5, 'dd1223', { top_tipo: 'numisdata6' }); // publish
		await insertActivity(dayB, 14, 7, 'numisdata3'); // list
		await insertActivity(dayB, 14, 8, 'dd271'); // where SKIPPED

		body = await tsCall({
			...WIDGET_RQO,
			options: { users: [UID] },
			source: { typo: 'source', model: 'database_info', action: 'rebuild_user_stats' },
		});
		statsRows = await readStatsRows();

		// what-labels are mutable shared ontology terms — resolve, never pin
		for (const tipo of ['dd696', 'dd700', 'dd694', 'dd693', 'dd699']) {
			labels[tipo] = await termByTipo(tipo, currentApplicationLang());
		}
	}, 60000);

	afterAll(async () => {
		const leaked: string[] = [];
		const statsIds = (await sql.unsafe(
			`SELECT section_id FROM matrix_stats WHERE section_tipo = 'dd1521' AND relation @> $1::text::jsonb`,
			[userFilter],
		)) as { section_id: number }[];
		await sql.unsafe(
			`DELETE FROM matrix_stats WHERE section_tipo = 'dd1521' AND relation @> $1::text::jsonb`,
			[userFilter],
		);
		for (const row of statsIds) {
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd1521' AND section_id = $1`,
				[row.section_id],
			);
		}
		for (const id of activityIds) {
			const deleted = (await sql.unsafe(
				`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND id = $1 RETURNING id`,
				[id],
			)) as unknown[];
			if (deleted.length === 0) leaked.push(`matrix_activity id ${id}`);
		}
		if (leaked.length > 0) {
			throw new Error(`cleanup leaked tracked rows: ${leaked.join(', ')}`);
		}
	});

	test('envelope: result true, OK msg, one updated-days batch per user', () => {
		expect(body.result).toBe(true);
		expect(body.msg).toBe('OK. Request done.');
		expect(body.errors).toEqual([]);
		expect(body.updated_days).toEqual([
			[
				{ user: UID, date: isoDay(dayA) },
				{ user: UID, date: isoDay(dayB) },
			],
		]);
	});

	test('one dd1521 aggregate row per provisioned day, PHP-algorithm content', () => {
		expect(statsRows.length).toBe(2);

		const userLocator = [
			{
				id: 1,
				type: 'dd151',
				section_id: String(UID),
				section_tipo: 'dd128',
				from_component_tipo: 'dd1522',
			},
		];
		const dayItem = [{ value: 'day', lang: 'lg-nolan', id: 1 }];
		const meta = {
			dd1522: [{ count: 1 }],
			dd1523: [{ count: 1 }],
			dd1530: [{ count: 1 }],
			dd1531: [{ count: 1 }],
		};
		const startOf = (date: Date) => ({
			year: date.getFullYear(),
			month: date.getMonth() + 1,
			day: date.getDate(),
			time: virtualDateSeconds(date.getFullYear(), date.getMonth() + 1, date.getDate()),
		});

		// day A: login + 3 saves (incl. the publish event's code 5) + 1 edit;
		// where dd542/numisdata3×2/numisdata4 (dd1223 routed to publish);
		// hours 9×2, 10×2, 11; one numisdata6 publish
		const dayATotals = [
			{ type: 'what', tipo: 'dd696', value: 1, label: labels.dd696 },
			{ type: 'what', tipo: 'dd700', value: 3, label: labels.dd700 },
			{ type: 'what', tipo: 'dd694', value: 1, label: labels.dd694 },
			{ type: 'where', tipo: 'dd542', value: 1 },
			{ type: 'where', tipo: 'numisdata3', value: 2 },
			{ type: 'where', tipo: 'numisdata4', value: 1 },
			{ type: 'when', hour: 9, value: 2 },
			{ type: 'when', hour: 10, value: 2 },
			{ type: 'when', hour: 11, value: 1 },
			{ type: 'publish', tipo: 'numisdata6', value: 1 },
		];
		// day B: list + search; the dd271 'where' is SKIPPED; hour 14×2
		const dayBTotals = [
			{ type: 'what', tipo: 'dd693', value: 1, label: labels.dd693 },
			{ type: 'what', tipo: 'dd699', value: 1, label: labels.dd699 },
			{ type: 'where', tipo: 'numisdata3', value: 1 },
			{ type: 'when', hour: 14, value: 2 },
		];

		const expected = [
			{ day: dayA, totals: dayATotals },
			{ day: dayB, totals: dayBTotals },
		];
		for (let index = 0; index < expected.length; index++) {
			const row = statsRows[index] as Record<string, unknown>;
			const entry = expected[index] as { day: Date; totals: unknown[] };
			expect(row.u).toEqual(userLocator as never);
			expect(row.t).toEqual(dayItem as never);
			expect(row.d).toEqual([{ id: 1, start: startOf(entry.day) }] as never);
			expect(row.totals).toEqual([{ id: 1, lang: 'lg-nolan', value: entry.totals }] as never);
			expect(row.meta).toEqual(meta as never);
		}
	});
});

describe('add_hierarchy (panel value + import/reset routing)', () => {
	test('get_widget_value: real panel shape; installed marker = term data, not the registry', async () => {
		const body = await tsCall({
			action: 'get_widget_value',
			dd_api: 'dd_area_maintenance_api',
			prevent_lock: true,
			options: {},
			source: { typo: 'source', model: 'add_hierarchy' },
		});
		const result = body.result as {
			hierarchies?: { tld: string }[];
			installed_hierarchies?: { tld: string }[];
			hierarchy_typologies?: unknown[];
			hierarchy_files_dir_path?: string;
		};

		// The widget no longer returns the empty coexistence stub: the offered list is
		// the vendored files, and the dir path is real.
		expect(Array.isArray(result.hierarchies)).toBe(true);
		expect((result.hierarchies?.length ?? 0) > 0).toBe(true);
		expect(Array.isArray(result.hierarchy_typologies)).toBe(true);
		expect(String(result.hierarchy_files_dir_path ?? '').replaceAll('\\', '/')).toContain(
			'install/import/hierarchy',
		);

		// The marker is renamed AND re-sourced: no stale active_hierarchies key, and the
		// installed set EQUALS the tlds with actual `<tld>1` term rows in matrix_hierarchy
		// (the reported bug marked ~all declared hierarchies because it read the registry).
		expect('active_hierarchies' in result).toBe(false);
		expect(Array.isArray(result.installed_hierarchies)).toBe(true);
		const widgetTlds = (result.installed_hierarchies ?? []).map((h) => h.tld).sort();
		const dbTlds = (
			(await sql.unsafe(
				`SELECT DISTINCT substring(section_tipo from '^([a-z]+)1$') AS tld
				 FROM matrix_hierarchy WHERE section_tipo ~ '^[a-z]+1$'`,
				[],
			)) as { tld: string | null }[]
		)
			.map((r) => r.tld)
			.filter((tld): tld is string => Boolean(tld))
			.sort();
		expect(widgetTlds).toEqual(dbTlds);
	}, 60000);

	test('install_hierarchies routes and is a no-op for an empty selection', async () => {
		const body = await tsCall({
			...WIDGET_RQO,
			options: { hierarchies: [] },
			source: { typo: 'source', model: 'add_hierarchy', action: 'install_hierarchies' },
		});
		expect(body.result).toBe(true);
		expect(String(body.msg)).toContain('Imported 0');
		expect(body.errors).toEqual([]);
	});

	test('reset_hierarchies routes (replace verb) and is a no-op for an empty selection', async () => {
		const body = await tsCall({
			...WIDGET_RQO,
			options: { hierarchies: [] },
			source: { typo: 'source', model: 'add_hierarchy', action: 'reset_hierarchies' },
		});
		expect(body.result).toBe(true);
		expect(String(body.msg)).toContain('Reset 0');
		expect(body.errors).toEqual([]);
	});
});
