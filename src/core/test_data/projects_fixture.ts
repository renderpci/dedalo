/**
 * THE SUITE'S PROJECTS CATALOG — the situation `component_filter` needs.
 *
 * WHAT THE WIDGET IS. `component_filter` is the per-record PROJECTS filter: its
 * option set is the caller's authorized `dd153` projects
 * (src/core/relations/filter_projects.ts getFilterDatalist), one checkbox each,
 * checked when the record's stored locators name that project. Its two data
 * operations are therefore only expressible against a catalog that offers MORE
 * options than the record has selected: with a single option that is already
 * checked there is nothing to check, and unchecking it hits the widget's
 * minimum-one-checked refusal instead of the remove path.
 *
 * WHY IT DID NOT EXIST. The vendored install seed carries EXACTLY ONE project
 * (`install/db/dedalo_install.pgsql.gz`, `COPY public.matrix_projects` → dd153/1
 * "General project"), and the canonical playground record test3/1 relates to it
 * (test3_canonical.json, `test101`). While the client suite drove a server on the
 * developer's APPLICATION database — a real install with many projects — an
 * unchecked box always happened to be there, so the suite READ an ambient corpus
 * instead of BUILDING its situation. The move to the suite database
 * (scripts/client_test_server.ts) removed the corpus and the two cases turned
 * red. The engine never changed; the fixture was simply missing.
 *
 * WHY RUNNER-SCOPED, NOT SEEDED. A second project is the filter suite's
 * situation, not the installation's shape: seeding it in
 * `scripts/test_db_setup.ts` would widen the projects catalog for every unit and
 * parity gate that shares this database. The runner installs it before the
 * server spawns and sweeps it after the run.
 *
 * SCRATCH-ID LAW (test/helpers/acl_identity_fixture.ts). `matrix_projects` is an
 * identity table: the id is EXPLICIT, in the reserved >= 900000 band, asserted
 * before any INSERT or DELETE, and never allocated through
 * `insertMatrixRecordWithCounter` (which would leave residue in the shared
 * counters). 930031 is distinct from that helper's 930021 so the two can coexist.
 */

import { encodeForJsonb } from '../db/json_codec.ts';
import { deleteMatrixRecord } from '../db/matrix_write.ts';
import { sql } from '../db/postgres.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { fireSaveEvent } from '../section_record/save_event.ts';
import { assertTestDatabase } from './test_database_marker.ts';

const PROJECTS_SECTION = 'dd153';
const PROJECTS_TABLE = 'matrix_projects';
/** dd156 — the project NAME component the datalist label is resolved from. */
const PROJECTS_NAME_TIPO = 'dd156';
/** dd1631 — the project order component (0 when unset). */
const PROJECTS_ORDER_TIPO = 'dd1631';

/** The second project this fixture owns. */
export const SUITE_SECOND_PROJECT_ID = 930031;

/**
 * A TYPO GUARD on the one id this fixture owns — NOT a reserved band.
 *
 * This module sweeps by an explicit hardcoded id, so the only way it can touch
 * an installed record is if that constant is edited to a low value. The floor
 * refuses that.
 *
 * (!) It asserts nothing about the counter and reserves nothing: there is no
 * reserved `section_id` range in this system. Test isolation is the dedicated
 * test DATABASE and its markers, and a real heritage section may legitimately
 * reach any id — so an allocator CEILING at this number (the shape audit row
 * GATE-51/P2-24 prescribes) would be a DEFECT: it would refuse a legitimate
 * record on a large section. The counter also moves through this id, by design
 * — `insertMatrixRecordWithExplicitId` raises it with GREATEST.
 */
const SCRATCH_ID_FLOOR = 900000;

function assertScratchId(): void {
	if (!Number.isInteger(SUITE_SECOND_PROJECT_ID) || SUITE_SECOND_PROJECT_ID < SCRATCH_ID_FLOOR) {
		// Typed, like every other test-data refusal: an invariant this module
		// cannot repair, carrying its coordinates for the log.
		throw new DedaloError('internal.invariant', {
			message: `suite_projects_fixture: id ${SUITE_SECOND_PROJECT_ID} is below the scratch floor ${SCRATCH_ID_FLOOR} — refusing to touch an installed record`,
			coordinates: { table: PROJECTS_TABLE, section: PROJECTS_SECTION },
		});
	}
}

/**
 * Add the second project. Idempotent: a crashed previous run's row is swept
 * first, so a re-run never collides on the explicit id.
 *
 * Fires the dd153 save event afterwards, which is the durable channel that drops
 * the authorized-projects cache (filter_projects.ts) — this process's copy of it.
 * The run's own server is spawned AFTER this call, so it reads the row cold.
 */
export async function ensureSuiteProjectsFixture(): Promise<void> {
	// An identity table on a shared database: the marker answers first, before a
	// single row moves.
	await assertTestDatabase('ensureSuiteProjectsFixture');
	assertScratchId();
	await removeRow();
	await sql.unsafe(
		`INSERT INTO "${PROJECTS_TABLE}" ("section_tipo", "section_id", "string", "number") VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			PROJECTS_SECTION,
			SUITE_SECOND_PROJECT_ID,
			// Component values live in the TYPED COLUMNS, never inside `data` — the
			// shape the real dd153 rows carry and readMatrixRecord reads.
			encodeForJsonb({
				// The label the datalist renders. Sorted case-insensitively against the
				// seed's project, whose dd156 is UNSET (label ''), so this one is always
				// the second option — deterministic ordering for the suite.
				[PROJECTS_NAME_TIPO]: [{ id: 1, lang: 'lg-eng', value: 'zz suite second project' }],
			}),
			encodeForJsonb({ [PROJECTS_ORDER_TIPO]: [{ id: 1, value: 2 }] }),
		],
	);
	await fireSaveEvent(PROJECTS_SECTION);
}

/**
 * Sweep it. THROWS when nothing was deleted: a sweep that removes no row means
 * the filter is wrong, and the leftover widens the projects catalog for every
 * other tier sharing this database.
 */
export async function removeSuiteProjectsFixture(): Promise<void> {
	await assertTestDatabase('removeSuiteProjectsFixture');
	assertScratchId();
	const removed = await removeRow();
	if (removed === 0) {
		throw new DedaloError('internal.invariant', {
			message:
				'suite_projects_fixture: the sweep deleted 0 rows — the fixture row is unaccounted for',
			coordinates: {
				table: PROJECTS_TABLE,
				section: PROJECTS_SECTION,
				section_id: SUITE_SECOND_PROJECT_ID,
			},
		});
	}
	await fireSaveEvent(PROJECTS_SECTION);
}

async function removeRow(): Promise<number> {
	assertScratchId();
	return await deleteMatrixRecord(PROJECTS_TABLE, PROJECTS_SECTION, SUITE_SECOND_PROJECT_ID);
}
