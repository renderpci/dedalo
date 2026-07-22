/**
 * tm_record — component_section_id tolerance (regression, 2026-07-21).
 *
 * A dd15 (Time Machine) read on a corpus whose history contains a change to a
 * component_section_id component (e.g. mdcat's numisdata15) crashed the whole
 * section read: buildTmSectionRecord's per-component branch called
 * injectComponentData directly under row.tipo, and injectComponentData THROWS
 * for a model with no storable jsonb column — component_section_id's "column"
 * is the section_id PK, not a jsonb column. The sibling injectTmField already
 * guarded that case (PHP set_component_data logs + continues past it); the
 * direct call did not.
 *
 * The fix mirrors the injectTmField guard. This gate pins it: a TM row whose
 * tipo is a component_section_id component must build a well-formed virtual
 * dd15 record WITHOUT throwing, its data must NOT land under its own tipo in
 * any jsonb column (nowhere to store it), and no bogus `section_id` column may
 * appear — while the ordinary who/when/where header fields still build, proving
 * the whole record materialized past the previously-throwing line.
 *
 * DB-touching unit (ontology + notes lookup only — read-only, no PHP oracle,
 * no writes). dd1001 is a stable base-ontology component_section_id tipo.
 */

import { describe, expect, test } from 'bun:test';
import '../../src/core/components/registry.ts';
import { MATRIX_JSONB_COLUMNS } from '../../src/core/db/matrix.ts';
import type { TimeMachineRow } from '../../src/core/db/time_machine.ts';
import { TIME_MACHINE_SECTION_TIPO } from '../../src/core/db/time_machine.ts';
import { TM_COLUMN_SECTION_ID, buildTmSectionRecord } from '../../src/core/tm_record/tm_record.ts';

const SECTION_ID_TIPO = 'dd1001'; // base-ontology component_section_id
const SOURCE_SECTION_ID = 42;

function tmRow(tipo: string, data: unknown): TimeMachineRow {
	return {
		id: 999_999_001,
		section_id: SOURCE_SECTION_ID,
		section_tipo: 'dd64',
		tipo,
		lang: 'lg-spa',
		timestamp: '2026-07-01 10:13:08',
		user_id: 7,
		bulk_process_id: null,
		data,
		dataText: null,
	};
}

describe('tm_record component_section_id tolerance', () => {
	test('a component_section_id TM row builds a dd15 record without throwing', async () => {
		const record = await buildTmSectionRecord(tmRow(SECTION_ID_TIPO, [{ id: 1, value: 42 }]), 'lg-spa');

		// Well-formed virtual dd15 record keyed under the TM row id.
		expect(record.section_tipo).toBe(TIME_MACHINE_SECTION_TIPO);
		expect(record.section_id).toBe(999_999_001);

		// The whole record materialized: the who/when/where header still built
		// (dd1212 = the source record's numeric id) — i.e. execution passed the
		// per-component injection that used to throw.
		expect((record.columns.number as Record<string, unknown>)?.[TM_COLUMN_SECTION_ID]).toEqual([
			{ id: 1, value: SOURCE_SECTION_ID },
		]);

		// The component_section_id data has NO jsonb column to land in: it must
		// not be injected under its own tipo anywhere, and no `section_id`
		// (the PK) column may leak into the jsonb columns map.
		const leaked = MATRIX_JSONB_COLUMNS.filter(
			(column) => (record.columns[column] as Record<string, unknown> | undefined)?.[SECTION_ID_TIPO] !== undefined,
		);
		expect(leaked).toEqual([]);
		expect('section_id' in record.columns).toBe(false);
	});
});
