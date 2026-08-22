/**
 * THE SECOND PROJECT — the situation `component_filter` needs to be testable.
 *
 * WHY IT EXISTS. `component_filter` renders one checkbox per AUTHORIZED PROJECT
 * (src/core/relations/filter_projects.ts: every `dd153` record for a global
 * admin), and `client/dedalo/test/client/js/test_component_filter.js` asserts
 * both directions of the widget: CHECK an unchecked box, then UNCHECK one of two
 * checked ones (the widget refuses to clear the last one, and alert()s).
 *
 * The install seed ships exactly ONE project, and the canonical test3 record
 * already stores it — so on a from-scratch suite database every rendered box is
 * already checked, there is nothing left to check, and both cases fail on their
 * setup assertion. The suite was green only where the developer's own database
 * happened to hold several projects: the ambient-data dependency the generic-TLD
 * law exists to kill.
 *
 * `dd153` is a CORE section (`dd`), present on every installation — not an
 * install TLD — so the fixture is portable. It is still a test-data writer: it
 * asks the marker first and refuses a database that does not declare itself
 * disposable.
 *
 * WHY NOT A `situation()`. A situation's teardown is section-scoped
 * (`dropSituation` sweeps every row of each section it touches), which for
 * `dd153` would delete the INSTALL'S OWN project along with the fixture's. This
 * door owns a fixed, reserved id range instead and removes exactly those rows.
 *
 * THAT CHOICE COSTS THE COUNTER, SO THE COUNTER IS RESTORED BY HAND. Every
 * explicit-id insert raises `matrix_counter` to GREATEST(value, section_id)
 * (matrix_write.ts `raise_counter`), and a situation's teardown DELETES the
 * counter row outright — which this door must not do, because the install's own
 * project owns that row. Measured before the cure: a run left `dd153` at 9002
 * with only record 1 present, so the next project created on the suite database
 * would be 9003 — a counter no test wrote, growing every run, exactly the
 * residue `situations/situation.ts` was fixed for. `dropFilterProjects` lowers
 * it back to the highest id that actually survives.
 */

import { readMatrixRecord } from '../db/matrix.ts';
import { deleteMatrixRecord, insertMatrixRecordWithExplicitId } from '../db/matrix_write.ts';
import { sql, withTransaction } from '../db/postgres.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import { fireSaveEvent } from '../section_record/save_event.ts';
import { assertTestDatabase } from './test_database_marker.ts';

const PROJECTS_SECTION_TIPO = 'dd153';
/** DEDALO_PROJECTS_NAME_TIPO — the name the datalist labels the option with. */
const PROJECTS_NAME_TIPO = 'dd156';
/** DEDALO_PROJECTS_CODE_TIPO — the code the install's own project also carries. */
const PROJECTS_CODE_TIPO = 'dd155';

/**
 * The ids this fixture OWNS, and the only ones it ever deletes. High enough to
 * stay clear of the seed's own project(s) on any installation.
 */
/** A FIXED stamp: a fixture row must be byte-identical on every run. */
const FIXTURE_TIMESTAMP = '2026-08-22 00:00:00';

const FIXTURE_RECORDS: readonly { section_id: number; code: string; name: string }[] = [
	{ section_id: 9001, code: '901', name: 'Test project A' },
	{ section_id: 9002, code: '902', name: 'Test project B' },
];

/**
 * The table `dd153` resolves to — ontology-driven, like every situation writer
 * (`matrix_projects` on every install today, but the ontology is the authority).
 */
async function projectsTable(): Promise<string> {
	const table = await getMatrixTableFromTipo(PROJECTS_SECTION_TIPO);
	if (table === null) {
		throw new Error(
			`filter_projects_fixture: the ontology resolves no matrix table for '${PROJECTS_SECTION_TIPO}' — the projects section is missing from this database.`,
		);
	}
	return table;
}

/**
 * Lower `matrix_counter` back to the highest project id that SURVIVES, so the
 * fixture's reserved ids leave no trace. Never a DELETE: the row belongs to the
 * install's own project, not to this fixture.
 */
async function restoreProjectsCounter(table: string): Promise<void> {
	await sql.unsafe(
		`UPDATE matrix_counter
		 SET value = COALESCE(
			 (SELECT MAX(section_id) FROM "${table}" WHERE section_tipo = $1), 0)
		 WHERE tipo = $1`,
		[PROJECTS_SECTION_TIPO],
	);
}

/** Provision the fixture projects (idempotent). Returns how many were created. */
export async function ensureFilterProjects(): Promise<{ created: number }> {
	await assertTestDatabase('ensureFilterProjects');
	const PROJECTS_TABLE = await projectsTable();
	let created = 0;
	await withTransaction(async () => {
		for (const record of FIXTURE_RECORDS) {
			const existing = await readMatrixRecord(
				PROJECTS_TABLE,
				PROJECTS_SECTION_TIPO,
				record.section_id,
			);
			if (existing !== null) continue;
			await insertMatrixRecordWithExplicitId(
				PROJECTS_TABLE,
				PROJECTS_SECTION_TIPO,
				record.section_id,
				{
					// The same `data` keys the install seed's own project carries —
					// a dd153 list read emits them as columns, and a fixture row
					// that omits them renders holes next to the seed's row.
					data: {
						section_id: record.section_id,
						section_tipo: PROJECTS_SECTION_TIPO,
						label: record.name,
						created_date: FIXTURE_TIMESTAMP,
						modified_date: FIXTURE_TIMESTAMP,
						created_by_user_id: -1,
						modified_by_user_id: -1,
						diffusion_info: null,
					},
					string: {
						[PROJECTS_CODE_TIPO]: [{ id: 1, lang: 'lg-nolan', value: record.code }],
						[PROJECTS_NAME_TIPO]: [{ id: 1, lang: 'lg-eng', value: record.name }],
					},
				},
			);
			created++;
		}
		await fireSaveEvent(PROJECTS_SECTION_TIPO);
	});
	return { created };
}

/** Remove them again (rows AND the counter raise). Returns rows deleted. */
export async function dropFilterProjects(): Promise<number> {
	await assertTestDatabase('dropFilterProjects');
	const PROJECTS_TABLE = await projectsTable();
	let removed = 0;
	await withTransaction(async () => {
		for (const record of FIXTURE_RECORDS) {
			const existing = await readMatrixRecord(
				PROJECTS_TABLE,
				PROJECTS_SECTION_TIPO,
				record.section_id,
			);
			if (existing === null) continue;
			await deleteMatrixRecord(PROJECTS_TABLE, PROJECTS_SECTION_TIPO, record.section_id);
			removed++;
		}
		await restoreProjectsCounter(PROJECTS_TABLE);
		await fireSaveEvent(PROJECTS_SECTION_TIPO);
	});
	return removed;
}
