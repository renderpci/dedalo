/**
 * TIME MACHINE columns + scope are SERVER-OWNED
 * (WC-2026-08-14-tm-scope-server-owned).
 *
 * WHAT THIS REPLACES. `service_time_machine.build_request_config()` hand-built
 * the dd15 column list in the browser — literal ddo objects, a per-caller-model
 * choice of filter, and `permissions:1` stamped client-side — and the server
 * MIRRORED that back as dd15's structure-context. A list whose columns, filter
 * and permissions are all chosen by the caller is not a permission boundary; it
 * is a suggestion. It also made the tool impossible to build on the ordinary
 * `section` class, because a section takes its columns from the section CONTEXT
 * and cannot carry a caller-supplied ddo_map.
 *
 * Both halves — the structure-context and the emitted data — now resolve their
 * columns through `tmListColumns`, so they cannot disagree. That matters more
 * than it sounds: the byte-identical client binds a cell to its context by an
 * EXACT (tipo, mode, section_tipo) match and silently DROPS any column where the
 * two differ, so a divergence shows up as a blank column, never as an error.
 *
 * The scope is DERIVED from the SQO rather than taken as a new client field: the
 * SQO is what the read is actually executed against (`buildTmWhere` reads the
 * same three surfaces), so deriving keeps the columns and the WHERE describing
 * the same rows.
 *
 * Pure — no DB, no request scope.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). Two moves:
// the install section/component tipos became their phase-2 clones (pure pass-through
// tokens here — only the `snapshot` builder resolves a section, and this file drives
// it through the pure resolver); and the ANNOTATION column stopped being spelled at
// all — it is the engine's own constant (`TM_NOTES_TEXT`, src/core/tm_record), so the
// gate now IMPORTS it instead of re-declaring the same string a second time.

import { describe, expect, test } from 'bun:test';
import {
	resolveTimeMachineScope,
	tmListColumns,
} from '../../src/core/section/list_definitions/time_machine_list.ts';
import { TM_NOTES_TEXT } from '../../src/core/tm_record/tm_record.ts';

/** The meta block every scoped surface leads with, in display order. */
const META = ['dd1371', 'dd559', 'dd578', 'dd577'];

const tipos = (columns: { tipo: string }[] | null): string[] =>
	columns === null ? [] : columns.map((column) => column.tipo);

describe('scope derivation from the SQO', () => {
	test('a component history is COMPONENT scope (locator carries a tipo)', () => {
		expect(
			resolveTimeMachineScope({
				filter_by_locators: [{ section_tipo: 'test6813', section_id: 7, tipo: 'test6837', lang: 'lg-spa' }],
			}),
		).toEqual({ kind: 'component', sectionTipo: 'test6813', tipo: 'test6837' });
	});

	test('a record history is RECORD scope (locator carries no tipo)', () => {
		expect(
			resolveTimeMachineScope({ filter_by_locators: [{ section_tipo: 'test6813', section_id: 7 }] }),
		).toEqual({ kind: 'record', sectionTipo: 'test6813' });
	});

	test('a `tipo` column filter is SNAPSHOT scope (whole-record saves of a section)', () => {
		expect(
			resolveTimeMachineScope({ filter: { $and: [{ column_name: 'tipo', q: 'test6813' }] } }),
		).toEqual({
			kind: 'snapshot',
			sectionTipo: 'test6813',
		});
	});

	test('no scope at all is the BROWSE surface', () => {
		expect(resolveTimeMachineScope(undefined)).toEqual({ kind: 'browse', sectionTipo: null });
		expect(resolveTimeMachineScope({ section_tipo: ['dd15'] })).toEqual({
			kind: 'browse',
			sectionTipo: null,
		});
	});

	test('a read spanning two sections is NOT scoped (and so is admin-only)', () => {
		// One section's grant cannot authorize another's history. Falling back to
		// 'browse' is the fail-closed answer, not a convenience.
		expect(
			resolveTimeMachineScope({
				filter_by_locators: [
					{ section_tipo: 'test6813', section_id: 7 },
					{ section_tipo: 'test6099', section_id: 3 },
				],
			}),
		).toEqual({ kind: 'browse', sectionTipo: null });
	});
});

describe('the columns each scope derives', () => {
	test('COMPONENT: meta + annotation + the component itself', async () => {
		const columns = await tmListColumns({ kind: 'component', sectionTipo: 'test6813', tipo: 'test6837' });
		expect(tipos(columns)).toEqual([...META, TM_NOTES_TEXT, 'test6837']);
	});

	test('COMPONENT renders its value AND its annotation as flat text', async () => {
		// The history cell is an inline preview, not the click-to-edit default
		// view; in the TOOL the annotation shows its VALUE too, not the note icon
		// (WC-2026-08-16-tm-tool-note-value) — the icon survives only in the
		// inspector's narrow block.
		const columns =
			(await tmListColumns({ kind: 'component', sectionTipo: 'test6813', tipo: 'test6837' })) ?? [];
		expect(columns.find((column) => column.tipo === 'test6837')?.view).toBe('text');
		expect(columns.find((column) => column.tipo === TM_NOTES_TEXT)?.view).toBe('text');
	});

	test('RECORD shows the annotation VALUE, not the note icon', async () => {
		const columns = (await tmListColumns({ kind: 'record', sectionTipo: 'test6813' })) ?? [];
		expect(columns.find((column) => column.tipo === TM_NOTES_TEXT)?.view).toBe('text');
	});

	test('RECORD: meta + annotation, no component column', async () => {
		const columns = await tmListColumns({ kind: 'record', sectionTipo: 'test6813' });
		expect(tipos(columns)).toEqual([...META, TM_NOTES_TEXT]);
	});

	test('INSPECTOR component block KEEPS the note icon', async () => {
		// The narrow side panel has no room for the value, and it is the surface
		// that still creates/edits annotations through the note modal.
		const columns =
			(await tmListColumns({
				kind: 'inspector_component',
				sectionTipo: 'test6813',
				tipo: 'test6837',
			})) ?? [];
		expect(columns.find((column) => column.tipo === TM_NOTES_TEXT)?.view).toBe('note');
	});

	test('BROWSE returns NO server opinion — dd15 falls back to its own ontology', async () => {
		// null is meaningful: the bare browse is an ordinary section list of dd15
		// and must derive its columns exactly as any other section does.
		expect(await tmListColumns({ kind: 'browse', sectionTipo: null })).toBeNull();
	});

	test('every scoped surface leads with the meta block, in order', async () => {
		for (const scope of [
			{ kind: 'component' as const, sectionTipo: 'test6813', tipo: 'test6837' },
			{ kind: 'record' as const, sectionTipo: 'test6813' },
		]) {
			expect(tipos(await tmListColumns(scope)).slice(0, META.length)).toEqual(META);
		}
	});

	test('no scoped surface emits the dd15 Id column (dd1573)', async () => {
		// The client's own synthetic Id column already shows the TM row id and
		// carries the row action; a second one would be a duplicate.
		for (const scope of [
			{ kind: 'component' as const, sectionTipo: 'test6813', tipo: 'test6837' },
			{ kind: 'record' as const, sectionTipo: 'test6813' },
		]) {
			expect(tipos(await tmListColumns(scope))).not.toContain('dd1573');
		}
	});
});
