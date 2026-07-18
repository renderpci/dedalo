/**
 * "Map of grapes" demo fixture (dmm480 section + dmm507/dmm506) — TS-native,
 * idempotent port of the former `test/parity/fixtures/dmm_map_of_grapes.seed.sql`.
 *
 * The byte-identical client suite `test_additional_text_area.js` (block 1,
 * "COMPONENT_TEXT_AREA WITH COMPONENT_GEOLOCATION TEST") hard-codes a demo
 * ontology that ships with the upstream "mapa de fosas" install but is ABSENT
 * from a from-scratch instance's ontology. Without it the read throws
 * "unknown component tipo 'dmm507'" (src/core/section/read.ts), so the client
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
 * Idempotent: safe to call on every client-test run (scripts/client_test_runner.ts),
 * exactly like the canonical test3 reseed (seed.ts) — the suite must not depend
 * on whatever demo data a given installation happens to carry.
 */

import { upsertDdOntologyNode } from '../db/dd_ontology.ts';
import { deleteMatrixRecord, insertMatrixRecordWithExplicitId } from '../db/matrix_write.ts';
import { withTransaction } from '../db/postgres.ts';
import { fireSaveEvent } from '../section_record/save_event.ts';

const SECTION_TIPO = 'dmm480';
const SECTION_TABLE = 'matrix';
const RECORD_SECTION_ID = 1;

export async function ensureMapOfGrapesFixture(): Promise<void> {
	await withTransaction(async () => {
		// Section dmm480 — a plain section under the resource area (dd14), like
		// rsc170. Empty relations → get_matrix_table_from_tipo falls back to the
		// default 'matrix' table, where the record below lives.
		await upsertDdOntologyNode({
			tipo: 'dmm480',
			parent: 'dd14',
			term: { 'lg-eng': 'Map of grapes', 'lg-spa': 'Mapa de fosas', 'lg-cat': 'Mapa de fosses' },
			model: 'section',
			order_number: 1,
			relations: [],
			tld: 'dmm',
			properties: { color: '#4d7c2a' },
			model_tipo: 'dd6',
			is_model: false,
			is_translatable: false,
			is_main: false,
			propiedades: null,
		});

		// dmm507 — component_text_area ("Site"), like rsc30 (auto_init_editor on).
		await upsertDdOntologyNode({
			tipo: 'dmm507',
			parent: 'dmm480',
			term: { 'lg-eng': 'Site', 'lg-spa': 'Yacimiento', 'lg-cat': 'Jaciment' },
			model: 'component_text_area',
			order_number: 1,
			relations: [],
			tld: 'dmm',
			properties: {
				auto_init_editor: true,
				css: { '.wrapper_component': { 'grid-column': 'span 1' } },
			},
			model_tipo: 'dd10',
			is_model: false,
			is_translatable: true,
			is_main: false,
			propiedades: null,
		});

		// dmm506 — component_geolocation ("Location"), like test31. The `observe`
		// config subscribes it to the sibling text_area's (dmm507) key_up_f2 event
		// so F2 renders the text_area's layer_selector from this component's
		// layers (get_data_tag always yields a default layer_1) — exactly the
		// test31→test32 pairing. Without it the layer_selector never appears and
		// the draw/geo-tag flow (which mutates the editor → sets changed_data)
		// never fires.
		await upsertDdOntologyNode({
			tipo: 'dmm506',
			parent: 'dmm480',
			term: { 'lg-eng': 'Location', 'lg-spa': 'Localización', 'lg-cat': 'Localització' },
			model: 'component_geolocation',
			order_number: 2,
			relations: [],
			tld: 'dmm',
			properties: {
				observe: [
					{
						client: { event: 'click_tag_geo', perform: { function: 'load_tag_into_geo_editor' } },
						component_tipo: 'dmm507',
					},
					{
						client: { event: 'key_up_f2', perform: { function: 'get_data_tag' } },
						component_tipo: 'dmm507',
					},
				],
			},
			model_tipo: 'dd66',
			is_model: false,
			is_translatable: false,
			is_main: false,
			propiedades: null,
		});

		// One empty record (section_id = 1) in the default matrix table so the
		// component get_data reads a real row (an empty component renders blank).
		await deleteMatrixRecord(SECTION_TABLE, SECTION_TIPO, RECORD_SECTION_ID);
		await insertMatrixRecordWithExplicitId(SECTION_TABLE, SECTION_TIPO, RECORD_SECTION_ID, {
			data: { section_id: RECORD_SECTION_ID, section_tipo: SECTION_TIPO, label: 'Map of grapes 1' },
		});

		await fireSaveEvent(SECTION_TIPO);
	});
}
