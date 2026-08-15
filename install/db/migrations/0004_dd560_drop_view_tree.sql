-- 0004_dd560_drop_view_tree — correct ONE ontology mistake on live installs:
-- dd560 ("Label", parent dd555, component_dataframe, data_limit 1) declares
-- properties."view" = "tree" — the thesaurus-picker view — while its own
-- request_config sqo targets {"value":["dd1706"],"source":"section"}. dd1706
-- ("URI Labels", parent rsc1255) is NOT a thesaurus: its shown field dd1715 is
-- a component_input_text. The picker can therefore never open on dd560; the
-- declaration has never done anything but promise a surface that cannot exist.
-- Confirmed an ontology mistake by the project owner (2026-08-14) — every OTHER
-- node declaring view:'tree' is legitimate and is left untouched.
--
-- THREE live copies carry it, and all three must move together or the
-- correction reverts on the next operator action:
--   1. matrix_ontology  id 42660 (section_tipo 'dd0', section_id 560) — the
--      SOURCE record's misc."ontology18" value. dd_ontology.properties is
--      DERIVED from it (src/core/ontology/parser.ts:291-308 folds ontology18 +
--      css/ontology16 + source/ontology17), so correcting only the derived row
--      lets the next tool_ontology_parser regenerate resurrect the mistake.
--   2. dd_ontology     tipo 'dd560' — the runtime row the resolver reads.
--   3. dd_ontology_recovery tipo 'dd560' — the operator restore slice
--      (src/core/ontology/recovery_file.ts). It is merged back into
--      dd_ontology by hand, so an uncorrected copy there is one restore away
--      from re-introducing the mistake. Guarded by to_regclass: the table is
--      absent until an operator first builds a recovery file.
--
-- ONLY the "view" key is removed. The css block, mode, source (with its
-- request_config) and data_limit stay byte-identical — the `- 'view'` operator
-- rewrites nothing else, and every statement is additionally pinned by a
-- WHERE that requires the value to be exactly 'tree', so an operator who has
-- since set a different view (or already fixed this) is never overwritten.
--
-- NO TM (time-machine) audit row is written, and that is deliberate: this is an
-- install-level correction of a shipped seed defect, not a user edit, and the
-- migration runner is the operator-facing record of it (dedalo_ts_schema_
-- migrations). The normal write law (save_component.ts, tx-wrapped + TM-audited)
-- governs user writes and is not weakened here.

-- 1. the SOURCE record (matrix_ontology.misc → "ontology18" dataframe entries).
UPDATE public.matrix_ontology AS source_record
SET misc = jsonb_set(
		source_record.misc,
		'{ontology18}',
		(
			SELECT jsonb_agg(
				CASE
					WHEN entry->'value'->>'view' = 'tree'
						THEN jsonb_set(entry, '{value}', (entry->'value') - 'view')
					ELSE entry
				END
				ORDER BY entry_order
			)
			FROM jsonb_array_elements(source_record.misc->'ontology18')
				WITH ORDINALITY AS items(entry, entry_order)
		)
	)
WHERE source_record.section_tipo = 'dd0'
	AND source_record.section_id = 560
	AND jsonb_typeof(source_record.misc->'ontology18') = 'array'
	AND source_record.misc @> '{"ontology18": [{"value": {"view": "tree"}}]}'::jsonb;

-- 2. the derived runtime row.
UPDATE public.dd_ontology
SET properties = properties - 'view'
WHERE tipo = 'dd560'
	AND properties->>'view' = 'tree';

-- 3. the operator restore slice, only if it has ever been built here.
DO $$
BEGIN
	IF to_regclass('public.dd_ontology_recovery') IS NOT NULL THEN
		UPDATE public.dd_ontology_recovery
		SET properties = properties - 'view'
		WHERE tipo = 'dd560'
			AND properties->>'view' = 'tree';
	END IF;
END
$$;
