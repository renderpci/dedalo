-- ---------------------------------------------------------------------------
-- CLIENT-TEST FIXTURE: "map of grapes" demo (dmm480 section + dmm507/dmm506)
-- ---------------------------------------------------------------------------
-- The byte-identical client suite `test_additional_text_area.js` (block 1,
-- "COMPONENT_TEXT_AREA WITH COMPONENT_GEOLOCATION TEST") hard-codes a demo
-- ontology that ships with the upstream "mapa de fosas" install but is ABSENT
-- from this instance's ontology (dd_ontology count = 0 for dmm480/507/506).
-- Without it BOTH engines error identically on the get_data read
-- (TS: "unknown component tipo 'dmm507'"; PHP: "set_view() on null"), so the
-- suite can never go green.
--
-- This seed provisions the MINIMAL real ontology the suite needs — a section
-- with a text_area and a geolocation child, plus one empty record — so PHP and
-- TS resolve dmm480/507/506 IDENTICALLY (parity preserved: both engines read
-- the same shared Postgres). Modeled on the proven-working rsc170 (Image)
-- section / rsc30 (text_area) / test31 (geolocation) rows.
--
-- Idempotent: safe to re-run. Apply with:
--   psql -h /tmp -U render dedalo_mib_v7 -f test/parity/fixtures/dmm_map_of_grapes.seed.sql
-- Restart the TS server afterwards (the ontology node cache memoizes the
-- previous NULL lookups).
-- ---------------------------------------------------------------------------

BEGIN;

-- Ontology rows (re-seed cleanly).
DELETE FROM dd_ontology WHERE tipo IN ('dmm480', 'dmm507', 'dmm506');

-- Section dmm480 — a plain section under the resource area (dd14), like rsc170.
-- Empty relations → get_matrix_table_from_tipo falls back to the default
-- 'matrix' table, where the record below lives.
INSERT INTO dd_ontology
	(tipo, parent, term, model, order_number, relations, tld, properties, model_tipo, is_model, is_translatable, is_main)
VALUES
	('dmm480', 'dd14',
	 '{"lg-eng": "Map of grapes", "lg-spa": "Mapa de fosas", "lg-cat": "Mapa de fosses"}'::jsonb,
	 'section', 1, '[]'::jsonb, 'dmm', '{"color": "#4d7c2a"}'::jsonb, 'dd6', false, false, false);

-- dmm507 — component_text_area ("Site"), like rsc30 (auto_init_editor on).
INSERT INTO dd_ontology
	(tipo, parent, term, model, order_number, relations, tld, properties, model_tipo, is_model, is_translatable, is_main)
VALUES
	('dmm507', 'dmm480',
	 '{"lg-eng": "Site", "lg-spa": "Yacimiento", "lg-cat": "Jaciment"}'::jsonb,
	 'component_text_area', 1, '[]'::jsonb, 'dmm',
	 '{"auto_init_editor": true, "css": {".wrapper_component": {"grid-column": "span 1"}}}'::jsonb,
	 'dd10', false, true, false);

-- dmm506 — component_geolocation ("Location"), like test31. The `observe`
-- config subscribes it to the sibling text_area's (dmm507) key_up_f2 event so
-- F2 renders the text_area's layer_selector from this component's layers
-- (get_data_tag always yields a default layer_1) — exactly the test31→test32
-- pairing. Without it the layer_selector never appears and the draw/geo-tag
-- flow (which mutates the editor → sets changed_data) never fires.
INSERT INTO dd_ontology
	(tipo, parent, term, model, order_number, relations, tld, properties, model_tipo, is_model, is_translatable, is_main)
VALUES
	('dmm506', 'dmm480',
	 '{"lg-eng": "Location", "lg-spa": "Localización", "lg-cat": "Localització"}'::jsonb,
	 'component_geolocation', 2, '[]'::jsonb, 'dmm',
	 '{"observe": [{"client": {"event": "click_tag_geo", "perform": {"function": "load_tag_into_geo_editor"}}, "component_tipo": "dmm507"}, {"client": {"event": "key_up_f2", "perform": {"function": "get_data_tag"}}, "component_tipo": "dmm507"}]}'::jsonb,
	 'dd66', false, false, false);

-- One empty record (section_id = 1) in the default matrix table so the
-- component get_data reads a real row (an empty component renders blank).
DELETE FROM matrix WHERE section_tipo = 'dmm480' AND section_id = 1;
INSERT INTO matrix (section_id, section_tipo, data)
VALUES (1, 'dmm480',
	'{"section_id": 1, "section_tipo": "dmm480", "label": "Map of grapes 1"}'::jsonb);

COMMIT;
