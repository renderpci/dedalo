-- SHARED-ROW SEED CORRECTION: every shipped diffusion element declares its
-- output format with the RETIRED v6 key `properties.diffusion.class_name`
-- (`diffusion_mysql`, `diffusion_rdf`, `diffusion_socrata`); the engine reads
-- ONLY `properties.diffusion.type` (src/diffusion/plan/compile.ts, formats.ts
-- KNOWN_FORMATS) and has no alias for the old spelling — so on a fresh install
-- not one shipped element compiles (audit 2026-08-26, PUB-04 / P1-13).
-- (The tag names the ONE class of shared-schema DML the TS migration lane
-- admits — see install/db/migrate.ts header + migration_shared_row_tripwire.)
--
-- 0008_diffusion_element_type — correct the VOCABULARY, not five rows.
--
-- The defect is one fact spelled in a retired language, so the correction is
-- the mapping itself, applied wherever the exact retired value stands:
--
--     class_name 'diffusion_mysql'   ->  type 'sql'
--     class_name 'diffusion_rdf'     ->  type 'rdf'
--     class_name 'diffusion_socrata' ->  type 'socrata'
--
-- `class_name` is dropped, every other key of the block (service_name,
-- service_type, xmlns siblings) is kept byte-identical, and a block that ALREADY
-- carries `type` keeps it (only the stale key goes). A value outside the
-- mapping is left exactly as it is: `diffusion_section_stats` (dd60, the v6
-- section-statistics renderer) has no v7 format, and this lane is UPDATE-only —
-- it cannot retire the node. It keeps failing loudly at compile, which the
-- seed gate (test/unit/diffusion_seed_compiles_native.test.ts) pins as the
-- positive control of the loud branch.
--
-- TWO DEFECT SHAPES, measured on the seed (install/db/dedalo_install.pgsql.gz)
-- and on the generic `test` TLD source of record:
--   (a) the block sits in the v7 properties with the retired key
--       (dd60, test5, and the clone twins test5942/test6336/test6359);
--   (b) the node has NO v7 diffusion block at all — the block exists only in
--       the v5 `propiedades` text (dd_ontology) / `ontology19` (matrix_ontology),
--       the v7 `ontology18` entry absent (dd1099, dd1513, oh63) or present but
--       EMPTY (`[{"id": 1, "value": {}}]` — test143, and the navarra/render/
--       tch/tchi/mdcat rows of the importable packages). The engine never read
--       the v5 copy, so these elements were never compilable by this engine;
--       the whole v5 diffusion block minus `class_name` is ported into the v7
--       properties.
--
-- THREE live copies per node move together, exactly as 0004 did, or the
-- correction reverts on the next operator action:
--   1. matrix_ontology.misc `ontology18` (the SOURCE record's v7 properties;
--      dd_ontology.properties is DERIVED from it by src/core/ontology/parser.ts,
--      so correcting only the derived row lets the next regenerate resurrect
--      the retired key). Shape (b) ADDS the `ontology18` dataframe entry from
--      the `ontology19` block, since the parser folds only `ontology18`.
--   2. dd_ontology.properties — the runtime row the compiler reads.
--   3. dd_ontology_recovery — the operator restore slice, guarded by
--      to_regclass (absent until an operator first builds a recovery file).
-- The v5 copies (`ontology19`, `propiedades`) are LEFT BYTE-IDENTICAL: a v5
-- text blob is history the engine never reads, not configuration.
--
-- Every statement is pinned by a jsonb `@>` containment on the EXACT retired
-- value — a row an operator has since changed, or already corrected, is never
-- overwritten. The v5 text column is cast only behind a CASE that first proves
-- it parses (pg_input_is_valid), so a non-JSON legacy blob cannot abort the
-- boot migration.
--
-- NO TM (time-machine) audit row is written, and that is deliberate: this is an
-- install-level correction of a shipped seed defect, not a user edit, and the
-- migration runner is the operator-facing record of it (dedalo_ts_schema_
-- migrations). The normal write law (save_component.ts, tx-wrapped + TM-audited)
-- governs user writes and is not weakened here.
--
-- The OTHER shipped copies of the same vocabulary — the generic `test` TLD JSON
-- (src/core/test_data/test_tld_ontology.json) and the operator-importable
-- ontology packages (install/import/ontology/7.0/*.copy.gz) — are corrected in
-- the same change and held by test/unit/diffusion_seed_vocabulary_tripwire.

-- 1a. the SOURCE record, shape (a): rename inside the `ontology18` entries.
UPDATE public.matrix_ontology AS source_record
SET misc = jsonb_set(
		source_record.misc,
		'{ontology18}',
		(
			SELECT jsonb_agg(
				CASE
					WHEN entry->'value'->'diffusion'->>'class_name' = vocabulary.class_name
						THEN jsonb_set(
							entry,
							'{value,diffusion}',
							((entry->'value'->'diffusion') - 'class_name'::text)
								|| CASE
									WHEN entry->'value'->'diffusion' ? 'type' THEN '{}'::jsonb
									ELSE jsonb_build_object('type', vocabulary.type)
								END
						)
					ELSE entry
				END
				ORDER BY entry_order
			)
			FROM jsonb_array_elements(source_record.misc->'ontology18')
				WITH ORDINALITY AS items(entry, entry_order)
		)
	)
FROM (VALUES
		('diffusion_mysql', 'sql'),
		('diffusion_rdf', 'rdf'),
		('diffusion_socrata', 'socrata')
	) AS vocabulary(class_name, type)
WHERE jsonb_typeof(source_record.misc->'ontology18') = 'array'
	AND source_record.misc @> jsonb_build_object(
		'ontology18',
		jsonb_build_array(jsonb_build_object('value', jsonb_build_object('diffusion', jsonb_build_object('class_name', vocabulary.class_name))))
	);

-- 1b. the SOURCE record, shape (b): no `ontology18` at all, the block only in
--     the v5 `ontology19` entry — add the v7 entry from it.
UPDATE public.matrix_ontology AS source_record
SET misc = source_record.misc || jsonb_build_object(
		'ontology18',
		jsonb_build_array(jsonb_build_object(
			'id', 1,
			'value', jsonb_build_object(
				'diffusion',
				((source_record.misc->'ontology19'->0->'value'->'diffusion') - 'class_name'::text)
					|| jsonb_build_object('type', vocabulary.type)
			)
		))
	)
FROM (VALUES
		('diffusion_mysql', 'sql'),
		('diffusion_rdf', 'rdf'),
		('diffusion_socrata', 'socrata')
	) AS vocabulary(class_name, type)
WHERE jsonb_typeof(source_record.misc->'ontology18') IS DISTINCT FROM 'array'
	AND source_record.misc->'ontology19'->0->'value'->'diffusion'->>'class_name' = vocabulary.class_name
	AND source_record.misc @> jsonb_build_object(
		'ontology19',
		jsonb_build_array(jsonb_build_object('value', jsonb_build_object('diffusion', jsonb_build_object('class_name', vocabulary.class_name))))
	);

-- 1c. the SOURCE record, shape (b) with an EMPTY v7 entry: `ontology18` is
--     `[{"id": 1, "value": {}}]` (which the parser folds to properties NULL —
--     navarra/render/tch/tchi/mdcat rows in the packages, test143 in the
--     seed) — port the block into that first entry.
UPDATE public.matrix_ontology AS source_record
SET misc = jsonb_set(
		source_record.misc,
		'{ontology18,0,value,diffusion}',
		((source_record.misc->'ontology19'->0->'value'->'diffusion') - 'class_name'::text)
			|| jsonb_build_object('type', vocabulary.type)
	)
FROM (VALUES
		('diffusion_mysql', 'sql'),
		('diffusion_rdf', 'rdf'),
		('diffusion_socrata', 'socrata')
	) AS vocabulary(class_name, type)
WHERE jsonb_typeof(source_record.misc->'ontology18'->0->'value') = 'object'
	AND NOT (source_record.misc @> '{"ontology18": [{"value": {"diffusion": {}}}]}'::jsonb)
	AND source_record.misc->'ontology19'->0->'value'->'diffusion'->>'class_name' = vocabulary.class_name
	AND source_record.misc @> jsonb_build_object(
		'ontology19',
		jsonb_build_array(jsonb_build_object('value', jsonb_build_object('diffusion', jsonb_build_object('class_name', vocabulary.class_name))))
	);

-- 2a. the derived runtime row, shape (a): rename inside properties.diffusion.
UPDATE public.dd_ontology AS node
SET properties = jsonb_set(
		node.properties,
		'{diffusion}',
		((node.properties->'diffusion') - 'class_name'::text)
			|| CASE
				WHEN node.properties->'diffusion' ? 'type' THEN '{}'::jsonb
				ELSE jsonb_build_object('type', vocabulary.type)
			END
	)
FROM (VALUES
		('diffusion_mysql', 'sql'),
		('diffusion_rdf', 'rdf'),
		('diffusion_socrata', 'socrata')
	) AS vocabulary(class_name, type)
WHERE node.properties @> jsonb_build_object('diffusion', jsonb_build_object('class_name', vocabulary.class_name));

-- 2b. the derived runtime row, shape (b): no v7 diffusion block, the block only
--     in the v5 `propiedades` text — port it (minus the retired key).
UPDATE public.dd_ontology AS node
SET properties = COALESCE(node.properties, '{}'::jsonb) || jsonb_build_object(
		'diffusion',
		((node.propiedades::jsonb->'diffusion') - 'class_name'::text)
			|| jsonb_build_object('type', vocabulary.type)
	)
FROM (VALUES
		('diffusion_mysql', 'sql'),
		('diffusion_rdf', 'rdf'),
		('diffusion_socrata', 'socrata')
	) AS vocabulary(class_name, type)
WHERE node.model LIKE 'diffusion_element%'
	AND (node.properties IS NULL OR NOT (node.properties ? 'diffusion'))
	AND node.propiedades IS NOT NULL
	AND CASE
		WHEN pg_input_is_valid(node.propiedades, 'jsonb')
			THEN node.propiedades::jsonb @> jsonb_build_object('diffusion', jsonb_build_object('class_name', vocabulary.class_name))
		ELSE false
	END;

-- 3. the operator restore slice, only if it has ever been built here
--    (same two shapes as 2a/2b).
DO $$
BEGIN
	IF to_regclass('public.dd_ontology_recovery') IS NOT NULL THEN
		UPDATE public.dd_ontology_recovery AS node
		SET properties = jsonb_set(
				node.properties,
				'{diffusion}',
				((node.properties->'diffusion') - 'class_name'::text)
					|| CASE
						WHEN node.properties->'diffusion' ? 'type' THEN '{}'::jsonb
						ELSE jsonb_build_object('type', vocabulary.type)
					END
			)
		FROM (VALUES
				('diffusion_mysql', 'sql'),
				('diffusion_rdf', 'rdf'),
				('diffusion_socrata', 'socrata')
			) AS vocabulary(class_name, type)
		WHERE node.properties @> jsonb_build_object('diffusion', jsonb_build_object('class_name', vocabulary.class_name));

		UPDATE public.dd_ontology_recovery AS node
		SET properties = COALESCE(node.properties, '{}'::jsonb) || jsonb_build_object(
				'diffusion',
				((node.propiedades::jsonb->'diffusion') - 'class_name'::text)
					|| jsonb_build_object('type', vocabulary.type)
			)
		FROM (VALUES
				('diffusion_mysql', 'sql'),
				('diffusion_rdf', 'rdf'),
				('diffusion_socrata', 'socrata')
			) AS vocabulary(class_name, type)
		WHERE node.model LIKE 'diffusion_element%'
			AND (node.properties IS NULL OR NOT (node.properties ? 'diffusion'))
			AND node.propiedades IS NOT NULL
			AND CASE
				WHEN pg_input_is_valid(node.propiedades, 'jsonb')
					THEN node.propiedades::jsonb @> jsonb_build_object('diffusion', jsonb_build_object('class_name', vocabulary.class_name))
				ELSE false
			END;
	END IF;
END
$$;

-- 4. THE SAME LAW, ONE MORE SHIPPED DEFECT: the generic `test` TLD's playground
--    diffusion table (test209 `unit_test_diffusion`, section test3 — reached
--    from the shipped element test6868 through the table_alias test21) carries
--    the field test75 labelled "3d". A field label IS the published column
--    name, and the SQL identifier chokepoint (DIFFUSION_SPEC §8.3) refuses a
--    leading digit — so the element could not compile even with its format
--    typed. Renamed to "model_3d" (the component_3d model it publishes); the
--    component node test26 keeps its "3d" label — a component label is not a
--    column name. Same three copies as above; the term lives in the SOURCE
--    record's `string` column (ontology5) and its `data.label`.
UPDATE public.matrix_ontology AS source_record
SET string = jsonb_set(
		source_record.string,
		'{ontology5}',
		(
			SELECT jsonb_agg(
				CASE
					WHEN entry->>'lang' = 'lg-spa' AND entry->>'value' = '3d'
						THEN jsonb_set(entry, '{value}', '"model_3d"'::jsonb)
					ELSE entry
				END
				ORDER BY entry_order
			)
			FROM jsonb_array_elements(source_record.string->'ontology5')
				WITH ORDINALITY AS items(entry, entry_order)
		)
	),
	data = CASE
		WHEN source_record.data->>'label' = '3d' THEN jsonb_set(source_record.data, '{label}', '"model_3d"'::jsonb)
		ELSE source_record.data
	END
WHERE source_record.section_tipo = 'test0'
	AND source_record.section_id = 75
	AND jsonb_typeof(source_record.string->'ontology5') = 'array'
	AND source_record.string @> '{"ontology5": [{"lang": "lg-spa", "value": "3d"}]}'::jsonb;

UPDATE public.dd_ontology
SET term = jsonb_set(term, '{lg-spa}', '"model_3d"'::jsonb)
WHERE tipo = 'test75'
	AND model = 'field_text'
	AND term @> '{"lg-spa": "3d"}'::jsonb;

DO $$
BEGIN
	IF to_regclass('public.dd_ontology_recovery') IS NOT NULL THEN
		UPDATE public.dd_ontology_recovery
		SET term = jsonb_set(term, '{lg-spa}', '"model_3d"'::jsonb)
		WHERE tipo = 'test75'
			AND model = 'field_text'
			AND term @> '{"lg-spa": "3d"}'::jsonb;
	END IF;
END
$$;
