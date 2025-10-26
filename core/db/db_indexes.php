<?php
// db index

// extensions
	$ar_sql_query[] = '
		CREATE EXTENSION IF NOT EXISTS pg_trgm;
		CREATE EXTENSION IF NOT EXISTS unaccent;
	';


// functions
	$ar_function = [];

	$ar_function[] = (object)[
		'add' => '
			CREATE OR REPLACE FUNCTION f_unaccent(text)
			RETURNS text
			LANGUAGE \'sql\'
			COST 100
			IMMUTABLE PARALLEL UNSAFE
			AS $BODY$
			SELECT unaccent(\'unaccent\', $1)
			$BODY$;
		',
		'drop' => '
			DROP FUNCTION IF EXISTS f_unaccent;
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				f_unaccent(jsonb_path_query_array(string, \'$.*[*]\')->>value) = f_unaccent(\'Ripolles\')
			ORDER BY section_id ASC
			LIMIT 10;
		',
		'name' => 'f_unaccent',
		'info' => 'Used to process the relation column and get the string value of section_tipo ans section_id as oh1_3'
	];

	//  Create function with base flat locators st=section_tipo si=section_id (dd64_1)
	// example: SELECT * FROM matrix WHERE data_relations_flat_st_si(data) @> \'["dd64_1"]\'::jsonb;
	$ar_function[] = (object)[
		'add' => '
			CREATE OR REPLACE FUNCTION data_relations_flat_st_si(data jsonb)
			RETURNS jsonb
			LANGUAGE sql IMMUTABLE
			AS $$
			SELECT jsonb_agg(section_tipo || \'_\' || section_id)
			FROM (
				SELECT
					rel->>\'section_tipo\' as section_tipo,
					rel->>\'section_id\' as section_id
				FROM
					jsonb_each(data) as component_data,
					jsonb_array_elements(component_data.value) as rel
			) t
			$$;
		',
		'drop' => '
			DROP FUNCTION IF EXISTS data_relations_flat_st_si;
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				data_relations_flat_st_si(relation) @> \'["oh1_3"]\'
			ORDER BY section_id ASC
			LIMIT 10;
		',
		'name' => 'data_relations_flat_st_si',
		'info' => 'Used to process the relation column and get the string value of section_tipo ans section_id as oh1_3'
	];

	// Create function with base flat locators fct=from_section_tipo st=section_tipo si=section_id (tchi7_dd64_1)
	// example: SELECT * FROM matrix WHERE data_relations_flat_fct_st_si(data) @> \'["tchi7_dd64_1"]\'::jsonb;
	$ar_function[] = (object)[
		'add' => '
			CREATE OR REPLACE FUNCTION data_relations_flat_fct_st_si(data jsonb)
			RETURNS jsonb
			LANGUAGE sql IMMUTABLE
			AS $$
			SELECT jsonb_agg(from_component_tipo || \'_\' || section_tipo || \'_\' || section_id)
			FROM (
				SELECT
					component_data.key as from_component_tipo,
					rel->>\'section_tipo\' as section_tipo,
					rel->>\'section_id\' as section_id
				FROM
					jsonb_each(data) as component_data,
					jsonb_array_elements(component_data.value) as rel
			) t
			$$;
		',
		'drop' => '
			DROP FUNCTION IF EXISTS data_relations_flat_fct_st_si;
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				data_relations_flat_fct_st_si(relation) @> \'["oh25_oh1_3"]\'
			ORDER BY section_id ASC
			LIMIT 10;
		',
		'name' => 'data_relations_flat_fct_st_si',
		'info' => 'Used to process the relation column and get the string value of fct=from_section_tipo st=section_tipo si=section_id e.g. oh25_oh1_3'
	];

	// Create function with base flat locators ty=type st=section_tipo si=section_id (dd151_dd64_1)
	// example: SELECT * FROM matrix WHERE data_relations_flat_ty_st_si(data) @> \'["dd151_dd64_1"]\'::jsonb;
	$ar_function[] = (object)[
		'add' => '
			CREATE OR REPLACE FUNCTION data_relations_flat_ty_st_si(data jsonb)
			RETURNS jsonb
			LANGUAGE sql IMMUTABLE
			AS $$
			SELECT jsonb_agg(type || \'_\' || section_tipo || \'_\' || section_id)
			FROM (
				SELECT
					rel->>\'type\' as type,
					rel->>\'section_tipo\' as section_tipo,
					rel->>\'section_id\' as section_id
				FROM
					jsonb_each(data) as component_data,
					jsonb_array_elements(component_data.value) as rel
			) t
			$$;
		',
		'drop' => '
			DROP FUNCTION IF EXISTS data_relations_flat_ty_st_si;
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				data_relations_flat_ty_st_si(relation) @> \'["dd151_oh1_3"]\'
			ORDER BY section_id ASC
			LIMIT 10;
		',
		'name' => 'data_relations_flat_ty_st_si',
		'info' => 'Used to process the relation column and get the string value of ty=type st=section_tipo si=section_id e.g. dd151_dd64_1'
	];

	// Create function with base flat locators ty=type st=section_tipo (dd96_rsc197)
	// example: SELECT * FROM matrix WHERE data_relations_flat_ty_st(data) @> \'["dd96_rsc197"]\'::jsonb;
	$ar_function[] = (object)[
		'add' => '
			CREATE OR REPLACE FUNCTION data_relations_flat_ty_st(data jsonb)
			RETURNS jsonb
			LANGUAGE sql IMMUTABLE
			AS $$
			SELECT jsonb_agg(type || \'_\' || section_tipo)
			FROM (
				SELECT
					rel->>\'type\' as type,
					rel->>\'section_tipo\' as section_tipo
				FROM
					jsonb_each(data) as component_data,
					jsonb_array_elements(component_data.value) as rel
			) t
			$$;
		',
		'drop' => '
			DROP FUNCTION IF EXISTS data_relations_flat_ty_st;
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				data_relations_flat_ty_st(relation) @> \'["dd151_oh1"]\'
			ORDER BY section_id ASC
			LIMIT 10;
		',
		'name' => 'data_relations_flat_ty_st',
		'info' => 'Used to process the relation column and get the string value of ty=type st=section_tipo e.g. dd151_dd64_1'
	];

	// Create function to get valid searchable strings
	// get all string values inside literals with match with the literal[]->type->dd750
	// uses COALESCE 		- return empty
	// uses unaccent 		- remove any accent in the string
	// uses lower 			- all letters in lowercase, to be used as case-insensitive
	// uses regexp_replace 	- remove all HTML tags as <p>

	$ar_function[] = (object)[
		'add' => '
			CREATE OR REPLACE FUNCTION get_searchable_string(data jsonb)
			RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
			$$
			SELECT
				 COALESCE(
					string_agg(
						f_unaccent( lower( regexp_replace( string->>\'value\', \'<[^>]*>\', \'\', \'g\') ) )
					, \' \')
				, \'\')
			FROM jsonb_array_elements(
					jsonb_path_query_array(data, \'$.*[*]\')
				) AS string;
			$$;
		',
		'drop' => '
			DROP FUNCTION IF EXISTS get_searchable_string;
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				get_searchable_string(sting) LIKE f_unaccent(lower(\'%ripoll%\'))
			ORDER BY section_id ASC
			LIMIT 10;
		',
		'name' => 'get_searchable_string',
		'info' => 'Used to process the string column and get the string value without accents in lowercase and without HTML. Is used to create a `string_seach` column'
	];

	// check_array_component
	// Used by component date to search inside its data
		$ar_function[] = (object)[
		'add' => '
			CREATE OR REPLACE FUNCTION check_array_component(condition bool, component_path jsonb)
			RETURNS SETOF jsonb
			LANGUAGE plpgsql
			AS $$
			BEGIN
				IF condition THEN
					RETURN QUERY SELECT jsonb_array_elements(component_path);
				ELSE
					RETURN QUERY SELECT component_path;
				END IF;
			END
			$$;
		',
		'drop' => '
			DROP FUNCTION IF EXISTS check_array_component;
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE id IN (
				SELECT id
				FROM check_array_component(
						( jsonb_typeof(	datos#>\'{components, numisdata35, dato, lg-nolan}\') = \'array\' AND
										datos#>\'{components, numisdata35, dato, lg-nolan}\' != \'[]\' ),
						( datos#>\'{components, numisdata35, dato, lg-nolan}\' )
					) as numisdata35_array_elements
				WHERE
					-- TIME
					numisdata35_array_elements#>\'{time}\' = \'32269363200\'
					-- RANGE
					OR (
					numisdata35_array_elements#>\'{start, time}\' <= \'32269363200\' AND
					numisdata35_array_elements#>\'{end, time}\' >= \'32269363200\')
					OR (
					numisdata35_array_elements#>\'{start, time}\' = \'32269363200\')
					-- PERIOD
					OR (
					numisdata35_array_elements#>\'{period, time}\' = \'32269363200\')
			);
		',
		'name' => 'check_array_component',
		'info' => 'Used to process the date column.'
	];


// Constraints
	$ar_constraint = [];

	// section_id & section_tipo
			$ar_constraint[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_dataframe',
					'matrix_dd',
					'matrix_hierarchy',
					'matrix_hierarchy_main',
					'matrix_indexations',
					'matrix_langs',
					'matrix_layout',
					'matrix_layout_dd',
					'matrix_list',
					'matrix_nexus',
					'matrix_nexus_main',
					'matrix_notes',
					'matrix_ontology',
					'matrix_ontology_main',
					'matrix_profiles',
					'matrix_projects',
					'matrix_stats',
					'matrix_test',
					'matrix_tools',
					'matrix_users'
				],
				'add' => '
					ALTER TABLE IF EXISTS {$table}
					ADD CONSTRAINT {$table}_section_id_section_tipo_key
					UNIQUE ( section_id, section_tipo );
				',
				'drop' => '
					ALTER TABLE {$table} DROP CONSTRAINT {$table}_section_id_section_tipo_key
				',
				'sample' => '
					INSERT INTO "matrix_projects"
						(section_id, section_tipo)
					VALUES
						(1, \'dd153\');
				',
				'name' => 'constraint_section_id_section_tipo_key',
				'info' => 'Used to avoid duplicated records, is not possible to storage the same section_id with the same section_tipo'
			];

	// tipo_key
			$ar_constraint[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					ALTER TABLE IF EXISTS {$table}
					ADD CONSTRAINT {$table}_tipo_key
					UNIQUE ( section_id, section_tipo );
				',
				'drop' => '
					ALTER TABLE {$table} DROP CONSTRAINT {$table}_tipo_key
				',
				'sample' => '
					INSERT INTO "dd_ontology"
						(tipo)
					VALUES
						(\'dd1\');
				',
				'info' => 'Used to avoid duplicated records, is not possible to storage the same tipo'
			];


// Indexes
	$ar_index = [];


	// dd_ontology and ontology

		// is_model
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_is_model_idx
					ON {$table}
					USING btree ( is_model ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_is_model_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE is_model = 1
					LIMIT 1;
				',
				'info' => 'Used to search if the term is a descriptor or not, possible values: 1|2. 1 = yes, 2 = no'
			];

		// model
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_model_idx
					ON {$table}
					USING btree ( model COLLATE pg_catalog.\"default\" ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_model_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE model = \'section\'
					LIMIT 1;
				',
				'info' => 'Used to search if the descriptor model'
			];

		// model_tipo
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_model_tipo_idx
					ON {$table}
					USING btree ( model_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_model_tipo_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE model_tipo = \'dd6\'
					LIMIT 1;
				',
				'info' => 'Used to search if the descriptor model_tipo'
			];

		// order
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_order_number_idx
					ON {$table}
					USING btree ( order_number ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_order_number_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE order = 2
					LIMIT 1;
				',
				'info' => 'Used to search if the descriptor model_tipo'
			];

		// parent
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_parent_idx
					ON {$table}
					USING btree ( parent ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_parent_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE parent = \'tch1\'
					LIMIT 1;
				',
				'info' => 'Used to search if the descriptor model_tipo'
			];

		// tld
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology',
					'main_dd'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_tld_idx
					ON {$table}
					USING btree ( tld COLLATE pg_catalog.\"default\" ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_tld_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE tld = \'tch\'
					LIMIT 1;
				',
				'info' => 'Used to search if the descriptor model_tipo'
			];

		// relations
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_relations_idx
					ON {$table}
					USING btree ( relations COLLATE pg_catalog.\"default\" ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_relations_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE relations = \'tch\'
					LIMIT 1;
				',
				'info' => 'Used to search if the descriptor model_tipo'
			];

		// translatable
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_is_translatable_idx
					ON {$table}
					USING btree ( is_translatable ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_is_translatable_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE is_translatable = true
					LIMIT 1;
				',
				'info' => 'Used to search if the term is translatable or not, boolean values: true | false'
			];

		// parent is_descriptor and order
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_parent_order_number_idx
					ON {$table}
					USING btree (
						parent COLLATE pg_catalog.\"default\" ASC NULLS LAST,
						order_number ASC NULLS LAST
					);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_parent_order_number_idx;
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE parent = \'tch1\'
					LIMIT 1;
				',
				'info' => 'Used to search descriptors by parent, is_descriptor and order'
			];


	// General

		// section_id
			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_dataframe',
					'matrix_dd',
					'matrix_hierarchy',
					'matrix_hierarchy_main',
					'matrix_indexations',
					'matrix_langs',
					'matrix_layout',
					'matrix_layout_dd',
					'matrix_list',
					'matrix_nexus',
					'matrix_nexus_main',
					'matrix_notes',
					'matrix_ontology',
					'matrix_ontology_main',
					'matrix_profiles',
					'matrix_projects',
					'matrix_stats',
					'matrix_test',
					'matrix_tools',
					'matrix_users',
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_section_id_idx
					ON {$table}
					USING btree (section_id ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_section_id_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_id = 5
					LIMIT 10;
				',
				'info' => 'Used to search by id ordered ascendant.'
			];


			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_dataframe',
					'matrix_dd',
					'matrix_hierarchy',
					'matrix_hierarchy_main',
					'matrix_indexations',
					'matrix_langs',
					'matrix_layout',
					'matrix_layout_dd',
					'matrix_list',
					'matrix_nexus',
					'matrix_nexus_main',
					'matrix_notes',
					'matrix_ontology',
					'matrix_ontology_main',
					'matrix_profiles',
					'matrix_projects',
					'matrix_stats',
					'matrix_test',
					'matrix_tools',
					'matrix_users',
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_section_id_desc_idx
					ON {$table}
					USING btree (section_id DESC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_section_id_desc_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_id = 5
					LIMIT 10;
				',
				'info' => 'Used to search by id ordered ascendant.'
			];

		// section_tipo
			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_dataframe',
					'matrix_dd',
					'matrix_hierarchy',
					'matrix_hierarchy_main',
					'matrix_indexations',
					'matrix_langs',
					'matrix_layout',
					'matrix_layout_dd',
					'matrix_list',
					'matrix_nexus',
					'matrix_nexus_main',
					'matrix_notes',
					'matrix_ontology',
					'matrix_ontology_main',
					'matrix_profiles',
					'matrix_projects',
					'matrix_stats',
					'matrix_test',
					'matrix_tools',
					'matrix_users'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_section_tipo_idx
					ON {$table}
					USING btree (section_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_section_tipo_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_tipo = \'oh1\'
					LIMIT 10;
				',
				'info' => 'Used to search by section_tipo ordered ascendant.'
			];

		// section_id and section_tipo
			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_dataframe',
					'matrix_dd',
					'matrix_hierarchy',
					'matrix_hierarchy_main',
					'matrix_indexations',
					'matrix_langs',
					'matrix_layout',
					'matrix_layout_dd',
					'matrix_list',
					'matrix_nexus',
					'matrix_nexus_main',
					'matrix_notes',
					'matrix_ontology',
					'matrix_ontology_main',
					'matrix_profiles',
					'matrix_projects',
					'matrix_stats',
					'matrix_test',
					'matrix_tools',
					'matrix_users',
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_section_tipo_section_id_idx
					ON {$table}
					USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_section_tipo_section_id_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_id = 5 AND section_tipo = \'rsc197\'
					LIMIT 10;
				',
				'info' => 'Used to search by section_tipo ordered ascendant.'
			];

			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_dataframe',
					'matrix_dd',
					'matrix_hierarchy',
					'matrix_hierarchy_main',
					'matrix_indexations',
					'matrix_langs',
					'matrix_layout',
					'matrix_layout_dd',
					'matrix_list',
					'matrix_nexus',
					'matrix_nexus_main',
					'matrix_notes',
					'matrix_ontology',
					'matrix_ontology_main',
					'matrix_profiles',
					'matrix_projects',
					'matrix_stats',
					'matrix_test',
					'matrix_tools',
					'matrix_users',
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_section_tipo_section_id_desc_idx
						ON {$table}
						USING btree (section_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST, section_id DESC NULLS FIRST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_section_tipo_section_id_desc_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_id = 5 AND section_tipo = \'rsc197\'
					LIMIT 10;
				',
				'info' => 'Used to search by section_tipo ordered descendant by id.'
			];


	// String
		// global literals
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_string_gin_idx
				ON {$table}
				USING gin (
					string
					jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_string_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE strings @> \'{"rsc85":[{"value":"Pere"}]}\';
			',
			'info' => 'Used to search string literals as full components data'
		];

		// value
		// This index is a global index to search literals
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				ALTER TABLE {$table} ADD COLUMN search_string text NOT NULL GENERATED ALWAYS AS (
					 COALESCE( get_searchable_string(string), \'\' )
				) STORED;

				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_strings_value_gin_idx
				ON {$table}
				USING gin (
					search_string gin_trgm_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_strings_value_gin_idx;
				ALTER TABLE {$table} DROP COLUMN search_string;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE
					search_string LIKE unaccent(lower(\'%ripoll%\'))
				ORDER BY section_id ASC
				LIMIT 10;
			',
			'info' => 'Used to search literal string values as strings across all sections, it could be used as global search, but is not possible use with specific language'
		];


	// Relation
		// global relation by component
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX IF NOT EXISTS {$table}_relation_gin_idx
				ON {$table}
				USING gin (
					relation
					jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE relation @> \'{"rsc91":[{"section_tipo":"es1"}]}\'
				LIMIT 10;
			',
			'info' => 'Used to search relations as components data'
		];

		// global relation without component
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_relation_locators_gin_idx
				ON {$table}
				USING gin (
					jsonb_path_query_array(relation, \'$.*[*]\')
					jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_locators_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(relation, \'$.*[*]\') @> \'[{"section_tipo":"es1"}]\'
				LIMIT 10;
			',
			'info' => 'Used to search relations across all components data'
		];

		// Flat relation section_tipo and section_id
		// st = section_tipo
		// si = section_id
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX IF NOT EXISTS {$table}_relation_flat_st_si_gin_idx
				ON matrix
				USING gin (data_relations_flat_st_si(relation) jsonb_path_ops);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_flat_st_si_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE data_relations_flat_st_si(data) @> \'["dd64_1"]\'::jsonb;
				LIMIT 10;
			',
			'info' => 'Used to search relations across all components data with a flat text of the relation such as es1_65'
		];

		// Flat relation from_component_tipo, section_tipo and section_id
		// fct = from_component_tipo
		// st = section_tipo
		// si = section_id
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX IF NOT EXISTS {$table}_relation_flat_fct_st_si_gin_idx
				ON matrix
				USING gin (data_relations_flat_fct_st_si(relation) jsonb_path_ops);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_flat_fct_st_si_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE data_relations_flat_fct_st_si(data) @> \'["oh33_dd64_1"]\'::jsonb;
				LIMIT 10;
			',
			'info' => 'Used to search relations across all components data with a flat text of the relation such as oh33_dd64_1'
		];


		// Flat relation type, section_tipo
		// ty = type
		// st = section_tipo
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX IF NOT EXISTS {$table}_relation_flat_ty_st_gin_idx
				ON matrix
				USING gin (data_relations_flat_ty_st(relation) jsonb_path_ops);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_flat_ty_st_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE data_relations_flat_ty_st(data) @> \'["dd151_dd64"]\'::jsonb;
				LIMIT 10;
			',
			'info' => 'Used to search relations across all components data with a flat text of the relation such as dd151_dd64'
		];


		// Flat relation type, section_tipo and section_id
		// ty = type
		// st = section_tipo
		// si = section_id
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX IF NOT EXISTS {$table}_relation_flat_ty_st_gin_idx
				ON matrix
				USING gin (data_relations_flat_ty_st_si(relation) jsonb_path_ops);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_flat_ty_st_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE data_relations_flat_ty_st_si(data) @> \'["dd151_dd64"]\'::jsonb;
				LIMIT 10;
			',
			'info' => 'Used to search relations across all components data with a flat text of the relation such as dd151_dd64'
		];


	// Dates
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_date_gin_idx
				ON {$table}
				USING gin (
					date jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_date_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE date @> \'[{"time":57958546}]\'
				LIMIT 10;
			',
			'info' => 'Used to search dates by any property.'
		];


	// iri
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_iri_gin_idx
				ON {$table}
				USING gin (
					iri jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_iri_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE iri @> \'[{"iri":"https://dedalo.dev"}]\'
				LIMIT 10;
			',
			'info' => 'Used to search IRI data by any of its properties, iri or title.'
		];


	// geo
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_geo_gin_idx
				ON {$table}
				USING gin (
					geo jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_geo_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(geo, \'$.*[*]\') @> \'[{"lat":"39.462571"}]\'
				LIMIT 10;
			',
			'info' => 'Used to search IRI data by any of its properties, lat, log or alt.'
		];


	// number
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_number_gin_idx
				ON {$table}
				USING gin (
					number jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_number_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(number, \'$.*[*].value\') @> \'[5]\'
				LIMIT 10;
			',
			'info' => 'Used to search number data values.'
		];


	// media
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_media_gin_idx
				ON {$table}
				USING gin (
					media jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_media_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(media, \'$.*[*]\') @> \'[{"original_file_name":"my_image.png"}]\'
				LIMIT 10;
			',
			'info' => 'Used to search media data by any of its properties, original_file_name, or others.'
		];


	// misc
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_misc_gin_idx
				ON {$table}
				USING gin (
					misc jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_misc_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(misc, \'$.*[*].value\') @> \'[{"section_tipo":"lg-spa"}]\'
				LIMIT 10;
			',
			'info' => 'Used to search miscellaneous data by any of its properties.'
		];


	// relation search
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_langs',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_ontology',
				'matrix_ontology_main',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_test',
				'matrix_tools',
				'matrix_users'
			],
			'add' => '
				CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_relation_search_gin_idx
				ON {$table}
				USING gin (
					relations_search jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_search_gin_idx;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE relations_search @> \'[{"section_tipo":"es1"}]\'
				LIMIT 10;
			',
			'info' => 'Used to search relation all children data with specific parent. Give me all data indexed with a child using any of its parents.'
		];


	// By table, specific index for tables

		// id matrix_activity

			$ar_index[] = (object)[
				'tables' => [
					'matrix_activity'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_id_desc_idx
					ON {$table}
					USING btree (id DESC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_id_desc_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE id = 5
					LIMIT 10;
				',
				'info' => 'Used to search by id ordered descendant.'
			];

		// tipo
			$ar_index[] = (object)[
				'tables' => [
					'matrix_counter',
					'matrix_counter_dd',
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_tipo_idx
					ON {$table}
					USING btree (tipo ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_tipo_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix_counter
					WHERE tipo = \'oh1\'
					LIMIT 1;
				',
				'info' => 'Used to search by tipo.'
			];

		// lang
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_lang_idx
					ON {$table}
					USING btree (lang COLLATE pg_catalog.\"default\" ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_lang_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE lang = \'lg-spa\'
					LIMIT 1;
				',
				'info' => 'Used to search by tipo.'
			];

		// bulk_process_id
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_bulk_process_id_idx
					ON {$table}
					USING btree ( bulk_process_id ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_bulk_process_id_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE bulk_process_id = 751
					LIMIT 1;
				',
				'info' => 'Used to search by bulk_process_id.'
			];

		// state
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_state_idx
					ON {$table}
					USING btree ( state COLLATE pg_catalog.\"default\" ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_state_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE state = \'deleted\'
					LIMIT 1;
				',
				'info' => 'Used to search by state, possible values: deleted | created.'
			];

		// timestamp
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_timestamp_idx
					ON {$table}
					USING btree ( "timestamp" DESC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_timestamp_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE timestamp = \'2025-08-18 19:09:05\'
					LIMIT 1;
				',
				'info' => 'Used to search by timestamp, in time machine always descendant.'
			];

		// userID
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_user_id_idx
					ON {$table}
					USING btree ( "userID" ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_user_id_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE user_id = 2
					LIMIT 1;
				',
				'info' => 'Used to search by user id.'
			];

		// section_id_key
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_bulk_process_id_idx
					ON {$table}
					USING btree (
						section_id ASC NULLS LAST,
						bulk_process_id ASC NULLS LAST,
						section_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST,
						tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST,
						lang COLLATE pg_catalog.\"default\" ASC NULLS LAST
					);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_bulk_process_id_idx;
				',
				'sample' => "
					SELECT *
					FROM matrix_time_machine
					WHERE bulk_process_id = 751
					LIMIT 1;
				",
				'info' => 'Used to search by bulk_process_id.'
			];



	foreach ($ar_index as $index_object) {

		$tables = $index_object->tables;

		foreach ($tables as $table) {
			$current_sql_query	= process_sql_sentence($index_object->sql, $table);
			$ar_sql_query[]		= trim(str_replace(["\n","\t"], [' ',''], $current_sql_query));

		}

	}


// Maintenance

	// matrix_dd REINDEX
		$ar_sql_query[] = '
			REINDEX TABLE matrix_dd;
		';

	// matrix_dd vacuum
		$ar_sql_query[] = '
			VACUUM FULL VERBOSE ANALYZE matrix_dd;
		';

	// vacuum. Vacuum analyze main tables
		$ar_sql_query[] = '
			VACUUM ANALYZE "matrix_hierarchy";
		';
		$ar_sql_query[] = '
			VACUUM ANALYZE "matrix";
		';
		$ar_sql_query[] = '
			VACUUM ANALYZE "matrix_activity";
		';
