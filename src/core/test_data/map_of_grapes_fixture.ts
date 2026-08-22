/**
 * "Map of grapes" demo fixture (test480 section + test507/test506) — TS-native,
 * idempotent port of the former `test/parity/fixtures/dmm_map_of_grapes.seed.sql`.
 *
 * MOVED TO THE GENERIC `test` TLD 2026-08-22. It was authored with the upstream
 * install's own tipos (`dmm480/507/506`, tld `dmm`) and — because a section with
 * no matrix_table relation falls back to the PHP default — it wrote its record
 * into `matrix`, the INSTALLATION's table. Both are the accident the migration
 * exists to prevent: a fixture named after one install, storing where that
 * install's records live. It is now `test480`/`test507`/`test506`, declaring
 * `test24` so it stores in `matrix_test`. The tipos sit below the 1000 band,
 * which is the hand-authored zone of the `test` TLD
 * (`test_tld_tipo_map.json` `_band_doc`) — this structure is authored, not
 * cloned, so it takes no map entry.
 *
 * AND IT NO LONGER CARRIES THE ONTOLOGY. The three nodes live in
 * `test_tld_ontology.json`, the ONE source of record for this TLD, and reach the
 * database the way every other `test` node does — `materializeTestTldOntology()`
 * → `rebuildOntology()`, via the installer or `bun run test:db:setup`. Keeping a
 * second copy of the definitions here would be a fork of that source, and
 * `test_tld_ontology_gate` reads the two against each other precisely so one
 * cannot drift from the other. What is left is what a fixture actually owns: the
 * RECORD.
 *
 * The byte-identical client suite `test_additional_text_area.js` (block 1,
 * "COMPONENT_TEXT_AREA WITH COMPONENT_GEOLOCATION TEST") hard-codes a demo
 * ontology that ships with the upstream "mapa de fosas" install but is ABSENT
 * from a from-scratch instance's ontology. Without it the read throws
 * "unknown component tipo 'test507'" (src/core/section/read.ts), so the client
 * suite depended on whichever installation happened to already have this demo
 * data — the opposite of a stable, reproducible test suite.
 *
 * This module provisions the MINIMAL real ontology the suite needs — a
 * section with a text_area and a geolocation child, plus one empty record —
 * through the SAME write paths the application itself uses
 * (`upsertDdOntologyNode` — dd_ontology.ts's own "ONLY dd_ontology SQL" rule —
 * and the matrix_write helpers), so no server restart is needed: both fan out
 * their own cache invalidation. Modeled on the proven-working rsc170 (Image)
 * section / rsc30 (text_area) / test31 (geolocation) rows.
 *
 * GENERALIZED 2026-08-19 as `./situations/situation.ts` (ensureSituation /
 * dropSituation on a reserved zz* TLD) — the standard way for ANY test to build
 * its structure + data. This file stays because the client suite hard-codes
 * the test480/test507/test506 tipos; new tests use situations, never a hand-rolled
 * upsert list like this one.
 *
 * Idempotent: safe to call on every client-test run (scripts/client_test_runner.ts),
 * exactly like the canonical test3 reseed (seed.ts) — the suite must not depend
 * on whatever demo data a given installation happens to carry.
 */

import { searchDdOntology } from '../db/dd_ontology.ts';
import { deleteMatrixRecord, insertMatrixRecordWithExplicitId } from '../db/matrix_write.ts';
import { withTransaction } from '../db/postgres.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { fireSaveEvent } from '../section_record/save_event.ts';
import { assertTestDatabase } from './test_database_marker.ts';

const SECTION_TIPO = 'test480';
const TEXT_AREA_TIPO = 'test507';
const GEOLOCATION_TIPO = 'test506';
const SECTION_TABLE = 'matrix_test';
const RECORD_SECTION_ID = 1;

export async function ensureMapOfGrapesFixture(): Promise<void> {
	// GUARDED SINCE 2026-08-19. This used to be the ONE test-data writer with a
	// standing exemption, because the client suite drove a server on the
	// APPLICATION's database. That hole is closed: `bun run test:client` now
	// starts its own server on the suite database (scripts/client_test_server.ts),
	// so this fixture is a test-only writer like every other and asks the marker
	// first — outside the transaction, before a single row moves.
	await assertTestDatabase('ensureMapOfGrapesFixture');
	// The ontology is NOT ours to write (see the header) — it is materialized from
	// test_tld_ontology.json. Assert it arrived, and say exactly how to get it if
	// it did not: a silent miss here surfaces much later as "unknown component
	// tipo 'test507'" from a client suite, which is the confusion this fixture was
	// created to end.
	const present = new Set(await searchDdOntology({ tld: 'test' }));
	const missing = [SECTION_TIPO, TEXT_AREA_TIPO, GEOLOCATION_TIPO].filter(
		(tipo) => !present.has(tipo),
	);
	if (missing.length > 0) {
		// Typed, like the sibling corpus fixture's `refuse()`: a precondition this
		// module cannot repair, carrying its coordinates for the log rather than a
		// bare string on the wire.
		throw new DedaloError('internal.invariant', {
			message:
				"map of grapes fixture: the 'test' TLD ontology is missing these nodes — build the " +
				'suite database first (`bun run test:db:setup`), which materializes ' +
				'src/core/test_data/test_tld_ontology.json',
			coordinates: { missing: missing.join(', ') },
		});
	}

	await withTransaction(async () => {
		// One empty record (section_id = 1) in the SUITE's table so the component
		// get_data reads a real row (an empty component renders blank).
		await deleteMatrixRecord(SECTION_TABLE, SECTION_TIPO, RECORD_SECTION_ID);
		await insertMatrixRecordWithExplicitId(SECTION_TABLE, SECTION_TIPO, RECORD_SECTION_ID, {
			data: { section_id: RECORD_SECTION_ID, section_tipo: SECTION_TIPO, label: 'Map of grapes 1' },
		});

		await fireSaveEvent(SECTION_TIPO);
	});
}
