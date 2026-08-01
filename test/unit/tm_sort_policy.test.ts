/**
 * TIME MACHINE (dd15) list-sort policy — the TS-native contract for the
 * append-only history log, twin of the dd542 policy in activity_sort_policy.test.ts
 * (WC-044's family; this one is ledgered in engineering/wire_contract/).
 *
 * dd15's list columns ARE matrix_time_machine's own flat columns, so a header
 * click maps 1:1 to a real column (read_tm.ts TM_ORDER_COLUMN) — there is no
 * jsonb sort here, which is what makes this policy DIFFERENT from dd542's. The
 * cost comes from index DIRECTION: read_tm.ts emits `ORDER BY <col> <dir>, id
 * <dir>` while every composite index is `(col, id DESC)`, so those sorts degrade
 * to an Incremental Sort over a full index scan — measured on the 50.5M-row
 * mdcat log at 1.4 s (What), 7.9 s (Who) and > 25 s (Process, Value).
 *
 * The columns an index serves outright stay sortable:
 *   dd1573 Id         → the `id` PK
 *   dd1212 Section id → the `section_id` column
 *   dd559  When       → the `timestamp` column
 * plus the client's built-in Id box, whose `section_id` pseudo-column resolves
 * to `id` on dd15 (see the test below — it is what that box displays).
 *
 * Columns that are not in TM_ORDER_COLUMN at all (the section's own components,
 * shown as columns in the record-snapshot list) also emit sortable:false — a
 * header click on those used to THROW 'uncovered scope' (a 500), so refusing the
 * icon is strictly better than the previous behaviour. That leg is asserted too.
 */

import { describe, expect, test } from 'bun:test';
import {
	TIME_MACHINE_SECTION_TIPO,
	TIME_MACHINE_SORTABLE_TIPOS,
} from '../../src/core/concepts/section.ts';
import { TM_ORDER_COLUMN, buildTmOrderSql } from '../../src/core/resolve/read_tm.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { buildStructureContext } from '../../src/core/resolve/structure_context.ts';
import { buildOrderPath } from '../../src/core/search/order_path.ts';

/** The dd15 meta columns the time-machine service requests (service_time_machine.js). */
const TM_META_COLUMNS = [
	{ tipo: 'dd1371', label: 'Process' },
	{ tipo: 'dd559', label: 'When' },
	{ tipo: 'dd578', label: 'Who' },
	{ tipo: 'dd577', label: 'What' },
	{ tipo: 'dd1573', label: 'Id' },
	{ tipo: 'dd1212', label: 'Section id' },
	{ tipo: 'dd1772', label: 'Section tipo' },
	{ tipo: 'dd1574', label: 'Value' },
	{ tipo: 'rsc329', label: 'Annotation' },
];

async function tmColumnContext(tipo: string): Promise<{ sortable?: unknown } | null> {
	return runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-eng' }, () =>
		buildStructureContext({
			tipo,
			sectionTipo: TIME_MACHINE_SECTION_TIPO,
			mode: 'tm',
			lang: 'lg-eng',
			permissions: 1,
			parent: TIME_MACHINE_SECTION_TIPO,
		}),
	) as Promise<{ sortable?: unknown } | null>;
}

describe('time machine (dd15) sort policy', () => {
	test('the allowlist is exactly the index-served columns', () => {
		expect([...TIME_MACHINE_SORTABLE_TIPOS].sort()).toEqual(['dd1212', 'dd1573', 'dd559']);
	});

	// The two id-ish dd15 columns. dd1573 "Id" is the TM ROW's own PK; dd1212
	// "Section id" is the CALLER record's id (its lg-spa term is literally
	// "section_id"). dd1573 was missing from TM_ORDER_COLUMN while tm_filter
	// already resolved it to `id`, so the Id column could be filtered but not
	// sorted, and dd1212 was the only id-ish column that sorted.
	test('Id (dd1573) orders by the `id` PK, Section id (dd1212) by `section_id`', () => {
		expect(TM_ORDER_COLUMN.dd1573).toBe('id');
		expect(TM_ORDER_COLUMN.dd1212).toBe('section_id');
		expect(TM_ORDER_COLUMN.dd1573).not.toBe(TM_ORDER_COLUMN.dd1212);
	});

	test("the client's built-in Id box sorts by what it DISPLAYS (the `section_id` pseudo-column)", () => {
		// view_default_list_section.rebuild_columns_map hardcodes the leading Id
		// column as `tipo:'section_id' // used to sort only`, path component_tipo
		// 'section_id' — a descriptor meaning "the record's OWN id", not the literal
		// column. dd15's envelope addresses each snapshot by the TM row PK
		// (`section_id: row.id`), so that box DISPLAYS `id`. Mapping its sort to the
		// `section_id` COLUMN made it sort by the caller record's id instead — the
		// column showed 61468923, 4, 38, 28, 1344, 105 while claiming to be sorted.
		expect(TM_ORDER_COLUMN.section_id).toBe('id');
		// …and the caller's id keeps its own column, under its own tipo.
		expect(TM_ORDER_COLUMN.dd1212).toBe('section_id');
	});

	test('the ORDER BY is TABLE-QUALIFIED — a bare `timestamp` binds to the text alias', () => {
		// `timestamp` IS a real, indexed column. The select list also aliases
		// `timestamp::text AS timestamp`, and SQL resolves a bare ORDER BY
		// identifier to the OUTPUT name first — so the sort silently became an
		// unindexable computed text expression (Sort Key: (("timestamp")::text)),
		// a parallel seq scan + top-N sort of all 50.5M rows: 17,863 ms measured,
		// 19,583 ms live. Qualified, the (timestamp, id DESC) index serves it with
		// NO sort node at all — 0.359 ms.
		expect(buildTmOrderSql('timestamp', 'DESC')).toBe('tm."timestamp" DESC, tm."id" DESC');
		expect(buildTmOrderSql('timestamp', 'ASC')).toBe('tm."timestamp" ASC, tm."id" ASC');
		// The unique keys keep their single-column SQL (byte-gated tie behaviour).
		expect(buildTmOrderSql('id', 'DESC')).toBe('tm."id" DESC');
		expect(buildTmOrderSql('section_id', 'ASC')).toBe('tm."section_id" ASC');
		// EVERY mapped column is qualified — no bare identifier may reach the SQL.
		for (const column of new Set(Object.values(TM_ORDER_COLUMN))) {
			const sql = buildTmOrderSql(column, 'DESC');
			expect(sql.startsWith(`tm."${column}"`), `${column} not qualified: ${sql}`).toBe(true);
			expect(/(^|[ ,])(?!tm\.)[a-z_]+ (ASC|DESC)/.test(sql), `bare identifier in: ${sql}`).toBe(
				false,
			);
		}
	});

	test('every sortable dd15 column has an order-column mapping (no uncovered-scope throw)', () => {
		for (const tipo of TIME_MACHINE_SORTABLE_TIPOS) {
			expect(TM_ORDER_COLUMN[tipo], `${tipo} is sortable but unmapped`).toBeDefined();
		}
	});

	test('the order path the client sends back names the column tipo', async () => {
		// The client turns context.path into sqo.order; queryTmRows reads
		// path[0].component_tipo and looks it up in TM_ORDER_COLUMN. If these two
		// ever disagree the header click 500s, which is what dd1573 used to do.
		for (const tipo of TIME_MACHINE_SORTABLE_TIPOS) {
			const path = (await runWithRequestLangs(
				{ applicationLang: 'lg-eng', dataLang: 'lg-eng' },
				() => buildOrderPath(tipo, TIME_MACHINE_SECTION_TIPO),
			)) as { component_tipo?: string }[];
			expect(TM_ORDER_COLUMN[String(path[0]?.component_tipo)], `${tipo} path mismatch`).toBe(
				TM_ORDER_COLUMN[tipo],
			);
		}
	});

	test('the dd15 map does NOT change ordinary sections: their id column stays section_id', async () => {
		// order_path.ts owns that rule (component_section_id → section_id) and is
		// untouched — in a normal section the record's id IS section_id. dd15 is the
		// exception because its rows carry their own PK.
		// dd1001 is an ordinary section's component_section_id "Id" column — the
		// exact shape that must KEEP ordering by section_id.
		const path = (await runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-eng' }, () =>
			buildOrderPath('dd1001', 'dd1003'),
		)) as { column?: string; component_tipo?: string }[];
		expect(path[0]?.component_tipo).toBe('dd1001');
		expect(path[0]?.column).toBe('section_id');
	});

	for (const column of TM_META_COLUMNS) {
		const allowed = TIME_MACHINE_SORTABLE_TIPOS.has(column.tipo);
		test(`${column.label} (${column.tipo}) is ${allowed ? 'sortable' : 'NOT sortable'}`, async () => {
			const entry = await tmColumnContext(column.tipo);
			// A column the ontology does not resolve yields no entry; the policy claim
			// is only meaningful for columns that DO render.
			if (entry === null) return;
			expect(entry.sortable).toBe(allowed);
		});
	}

	test("a section's own component under dd15 is not sortable (was an 'uncovered scope' throw)", async () => {
		// rsc33 is an ordinary component_input_text of a real section; in the
		// record-snapshot list it renders as a dd15 column but has no TM_ORDER_COLUMN
		// mapping, so a header click threw before this policy.
		const entry = await tmColumnContext('rsc33');
		if (entry === null) return;
		expect(entry.sortable).toBe(false);
	});

	test('the policy is scoped to dd15 — the same component sorts elsewhere', async () => {
		const entry = (await runWithRequestLangs(
			{ applicationLang: 'lg-eng', dataLang: 'lg-eng' },
			() =>
				buildStructureContext({
					tipo: 'rsc33',
					sectionTipo: 'rsc170',
					mode: 'list',
					lang: 'lg-eng',
					permissions: 1,
					parent: 'rsc170',
				}),
		)) as { sortable?: unknown } | null;
		if (entry === null) return;
		expect(entry.sortable).toBe(true);
	});
});
