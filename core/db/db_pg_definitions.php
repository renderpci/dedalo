<?php
// DB_PG_DEFINITIONS
//
// PostgreSQL db definitions for extensions, functions, constraints, indexes and maintenance.
// This file defines in a common way the SQL sentences to perform into a maintenance process.
// It create a multiple arrays for every kind of process (index, function, etc.)
// The specific SQL sentence is defined with a common object:
//	{
//		"tables" : array, optional, the tables to perform the SQL sentences
//		"add" : string, mandatory, the SQL sentence to create or add the functionality (index, function, etc.)
//		"drop" : string, mandatory, the SQL sentence to drop the functionality (index, function, etc.)
//		"sample" : string, optional, the SQL sentence to test the functionality (index, function, etc.)
//		"name" : string, mandatory, the name of the functionality to identify it.
//		"info" : string, mandatory, additional information about the functionality describing its use.
//	}

// Extensions
	$ar_extensions = [];

	// pg_trgm extension
		$ar_extensions[] = '
			CREATE EXTENSION IF NOT EXISTS pg_trgm;
		';

	// unaccent extension
		$ar_extensions[] = '
			CREATE EXTENSION IF NOT EXISTS unaccent;
		';


// Functions
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
			DROP FUNCTION IF EXISTS f_unaccent
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				f_unaccent(jsonb_path_query_array(string, \'$.*[*]\')->>value) = f_unaccent(\'Ripolles\')
			ORDER BY section_id ASC
			LIMIT 10
		',
		'name' => 'f_unaccent',
		'info' => 'Used to remove accents from a text string. Useful for case-insensitive and accent-insensitive searches.'
	];

	// Create function with base flat locators st=section_tipo si=section_id (dd64_1)
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
			DROP FUNCTION IF EXISTS data_relations_flat_st_si
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				data_relations_flat_st_si(relation) @> \'["oh1_3"]\'
			ORDER BY section_id ASC
			LIMIT 10
		',
		'name' => 'data_relations_flat_st_si',
		'info' => 'Aggregates relation section_tipo and section_id into a flat string format (e.g., oh1_3) for easier indexing and searching.'
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
			DROP FUNCTION IF EXISTS data_relations_flat_fct_st_si
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				data_relations_flat_fct_st_si(relation) @> \'["oh25_oh1_3"]\'
			ORDER BY section_id ASC
			LIMIT 10
		',
		'name' => 'data_relations_flat_fct_st_si',
		'info' => 'Aggregates relation from_component_tipo, section_tipo and section_id into a flat string format (e.g., oh25_oh1_3) for easier indexing and searching.'
	];

	// Create function with base flat locators ty=type st=section_tipo si=section_id (dd151_dd64_1)
	// example: SELECT * FROM matrix WHERE data_relations_flat_ty_st_si(relation) @> \'["dd151_dd64_1"]\'::jsonb;
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
			DROP FUNCTION IF EXISTS data_relations_flat_ty_st_si
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				data_relations_flat_ty_st_si(relation) @> \'["dd151_oh1_3"]\'
			ORDER BY section_id ASC
			LIMIT 10
		',
		'name' => 'data_relations_flat_ty_st_si',
		'info' => 'Aggregates relation type, section_tipo and section_id into a flat string format (e.g., dd151_oh1_3) for easier indexing and searching.'
	];

	// Create function with base flat locators ty=type st=section_tipo (dd96_rsc197)
	// example: SELECT * FROM matrix WHERE data_relations_flat_ty_st(relation) @> \'["dd96_rsc197"]\'::jsonb;
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
			DROP FUNCTION IF EXISTS data_relations_flat_ty_st
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				data_relations_flat_ty_st(relation) @> \'["dd151_oh1"]\'
			ORDER BY section_id ASC
			LIMIT 10
		',
		'name' => 'data_relations_flat_ty_st',
		'info' => 'Aggregates relation type and section_tipo into a flat string format (e.g., dd151_oh1) for easier indexing and searching.'
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
			DROP FUNCTION IF EXISTS get_searchable_string
		',
		'sample' => '
			SELECT *
			FROM matrix
			WHERE
				get_searchable_string(string) LIKE f_unaccent(lower(\'%ripoll%\'))
			ORDER BY section_id ASC
			LIMIT 10
		',
		'name' => 'get_searchable_string',
		'info' => 'Used to process the string column and get the string value without accents in lowercase and without HTML. Is used to create a `search_string` column.'
	];

	// check_array_component
	// Used by component date to search inside its data
	// @todo Review if this function is actually used today! If not, remove it.
	$ar_function[] = (object)[
		'add' => '
			-- Not used anymore (v6)
		',
		'drop' => '
			DROP FUNCTION IF EXISTS check_array_component
		',
		'sample' => '
			-- Not used anymore (v6)
		',
		'name' => 'check_array_component',
		'info' => 'Not used anymore (v6)'
	];


// Constraints
	$ar_constraint = [];

	// section_id & section_tipo
		$ar_constraint[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$table}_section_id_section_tipo_key
			',
			'sample' => '
				INSERT INTO "matrix_projects"
					(section_id, section_tipo)
				VALUES
					(1, \'dd153\')
			',
			'name' => 'all_matrix_constraint_section_id_section_tipo_key',
			'info' => 'Used to avoid duplicated records, it is not possible to store the same section_id with the same section_tipo'
		];

		// tipo_key
		$ar_constraint[] = (object)[
			'tables' => [
				'dd_ontology'
			],
			'add' => '
				ALTER TABLE IF EXISTS {$table}
				ADD CONSTRAINT {$table}_tipo_key
				UNIQUE ( tipo );
			',
			'drop' => '
				ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$table}_tipo_key
				DROP INDEX IF EXISTS {$table}_tipo_key
			',
			'sample' => '
				INSERT INTO "dd_ontology"
					(tipo)
				VALUES
					(\'dd1\')
			',
			'name' => 'dd_ontology_constraint_tipo_key',
			'info' => 'Used to avoid duplicated records, it is not possible to store the same tipo'
		];

		// tipo_key : matrix_counter / matrix_counter_dd
		$ar_constraint[] = (object)[
			'tables' => [
				'matrix_counter',
				'matrix_counter_dd'
			],
			'add' => '
				ALTER TABLE IF EXISTS {$table}
				ADD CONSTRAINT {$table}_tipo_key
				UNIQUE ( tipo );
			',
			'drop' => '
				ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$table}_tipo_key
			',
			'sample' => '
				INSERT INTO "{$table}"
					(tipo)
				VALUES
					(\'test_tipo\')
			',
			'name' => 'matrix_counter_constraint_tipo_key',
			'info' => 'Used to avoid duplicated records, it is not possible to store the same tipo'
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
					DROP INDEX IF EXISTS {$table}_is_model_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE is_model = 1
					LIMIT 1
				',
				'name' => 'dd_ontology_is_model_idx',
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
					USING btree ( model COLLATE pg_catalog.default ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_model_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE model = \'section\'
					LIMIT 1
				',
				'name' => 'dd_ontology_model_idx',
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
					USING btree ( model_tipo COLLATE pg_catalog.default ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_model_tipo_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE model_tipo = \'dd6\'
					LIMIT 1
				',
				'name' => 'dd_ontology_model_tipo_idx',
				'info' => 'Used to search for the descriptor model_tipo'
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
					DROP INDEX IF EXISTS {$table}_order_number_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE order_number = 2
					LIMIT 1
				',
				'name' => 'dd_ontology_order_number_idx',
				'info' => 'Used to search for the descriptor order_number'
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
					DROP INDEX IF EXISTS {$table}_parent_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE parent = \'tch1\'
					LIMIT 1
				',
				'name' => 'dd_ontology_parent_idx',
				'info' => 'Used to search for the descriptor parent'
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
					USING btree ( tld COLLATE pg_catalog.default ASC NULLS LAST );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_tld_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE tld = \'tch\'
					LIMIT 1
				',
				'name' => 'dd_ontology_tld_idx',
				'info' => 'Used to search for the descriptor tld'
			];

		// relations
			$ar_index[] = (object)[
				'tables' => [
					'dd_ontology'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_relations_idx
					ON {$table}
					USING gin ( relations );
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_relations_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE relations @> ARRAY[\'tch\']
					LIMIT 1
				',
				'name' => 'dd_ontology_relations_idx',
				'info' => 'Used to search for descriptor relations'
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
					DROP INDEX IF EXISTS {$table}_is_translatable_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE is_translatable = true
					LIMIT 1
				',
				'name' => 'dd_ontology_is_translatable_idx',
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
						parent COLLATE pg_catalog.default ASC NULLS LAST,
						order_number ASC NULLS LAST
					);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_parent_order_number_idx
				',
				'sample' => '
					SELECT *
					FROM dd_ontology
					WHERE parent = \'tch1\'
					LIMIT 1
				',
				'name' => 'dd_ontology_parent_order_number_idx',
				'info' => 'Used to search descriptors by parent and order_number'
			];


	// General

		// section_id ASC
			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_activity_diffusion',
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
					DROP INDEX IF EXISTS {$table}_section_id_idx
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_id = 5
					LIMIT 10
				',
				'name' => 'all_matrix_section_id_idx',
				'info' => 'Used to search by section_id ordered ascendant.'
			];
		// section_id DESC
			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_activity_diffusion',
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
					DROP INDEX IF EXISTS {$table}_section_id_desc_idx
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_id = 5
					LIMIT 10
				',
				'name' => 'all_matrix_section_id_desc_idx',
				'info' => 'Used to search by section_id ordered descendant.'
			];

		// section_tipo
			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_activity_diffusion',
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
					USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_section_tipo_idx
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_tipo = \'oh1\'
					LIMIT 10
				',
				'name' => 'all_matrix_section_tipo_idx',
				'info' => 'Used to search by section_tipo ordered ascendant.'
			];

		// section_id and section_tipo ASC
			// $ar_index[] = (object)[
			// 	'tables' => [
			// 		'matrix',
			// 		'matrix_activities',
			// 		'matrix_activity',
			// 		'matrix_dataframe',
			// 		'matrix_dd',
			// 		'matrix_hierarchy',
			// 		'matrix_hierarchy_main',
			// 		'matrix_indexations',
			// 		'matrix_langs',
			// 		'matrix_layout',
			// 		'matrix_layout_dd',
			// 		'matrix_list',
			// 		'matrix_nexus',
			// 		'matrix_nexus_main',
			// 		'matrix_notes',
			// 		'matrix_ontology',
			// 		'matrix_ontology_main',
			// 		'matrix_profiles',
			// 		'matrix_projects',
			// 		'matrix_stats',
			// 		'matrix_test',
			// 		'matrix_tools',
			// 		'matrix_users',
			// 		'matrix_time_machine'
			// 	],
			// 	'add' => '
			// 		CREATE INDEX IF NOT EXISTS {$table}_section_tipo_section_id_idx
			// 		ON {$table}
			// 		USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog.default ASC NULLS LAST);
			// 	',
			// 	'drop' => '
			// 		DROP INDEX IF EXISTS {$table}_section_tipo_section_id_idx
			// 	',
			// 	'sample' => '
			// 		SELECT *
			// 		FROM matrix
			// 		WHERE section_id = 5 AND section_tipo = \'rsc197\'
			// 		LIMIT 10
			// 	',
			// 	'name' => 'all_matrix_section_tipo_section_id_idx',
			// 	'info' => 'Used to search by section_tipo ordered ascendant.'
			// ];

		// section_tipo_section_id DESC
			$ar_index[] = (object)[
				'tables' => [
					'matrix',
					'matrix_activities',
					'matrix_activity',
					'matrix_activity_diffusion',
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
					USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST, section_id DESC NULLS FIRST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_section_tipo_section_id_desc_idx
				',
				'sample' => '
					SELECT *
					FROM matrix
					WHERE section_id = 5 AND section_tipo = \'rsc197\'
					LIMIT 10
				',
				'name' => 'all_matrix_section_tipo_section_id_desc_idx',
				'info' => 'Used to search by section_tipo ordered descendant by section_id.'
			];

	// String
		// global literals
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_string_gin_idx
				ON {$table}
				USING gin (
					string
					jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_string_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE string @> \'{"rsc85":[{"value":"Pere"}]}\';
			',
			'name' => 'all_matrix_string_gin_idx',
			'info' => 'Used to search string literals as full components data'
		];

		// value
		// This index is a global index to search literals
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
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
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_search_string_gin_idx;
				ALTER TABLE {$table} DROP COLUMN IF EXISTS search_string;
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE
					search_string LIKE unaccent(lower(\'%ripoll%\'))
				ORDER BY section_id ASC
				LIMIT 10
			',
			'name' => 'all_matrix_search_string_column',
			'info' => 'Used to search literal string values as strings across all sections, it could be used as global search, but is not possible use with specific language'
		];

		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
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
				CREATE INDEX IF NOT EXISTS {$table}_strings_value_gin_idx
				ON {$table}
				USING gin (
					search_string gin_trgm_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_strings_value_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE
					search_string LIKE unaccent(lower(\'%ripoll%\'))
				ORDER BY section_id ASC
				LIMIT 10
			',
			'name' => 'all_matrix_strings_value_gin_idx',
			'info' => 'Used to search literal string values as strings across all sections, it could be used as global search, but is not possible use with specific language'
		];


	// Relation
		// global relation by component
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				DROP INDEX IF EXISTS {$table}_relation_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE relation @> \'{"rsc91":[{"section_tipo":"es1"}]}\'
				LIMIT 10
			',
			'name' => 'all_matrix_relation_gin_idx',
			'info' => 'Used to search relations as components data'
		];

		// global relation without component
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_relation_locators_gin_idx
				ON {$table}
				USING gin (
					jsonb_path_query_array(relation, \'$.*[*]\')
					jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_locators_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(relation, \'$.*[*]\') @> \'[{"section_tipo":"es1"}]\'
				LIMIT 10
			',
			'name' => 'all_matrix_relation_locators_gin_idx',
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
				'matrix_activity_diffusion',
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
				ON {$table}
				USING gin (data_relations_flat_st_si(relation) jsonb_path_ops);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_flat_st_si_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE data_relations_flat_st_si(relation) @> \'["dd64_1"]\'::jsonb
				LIMIT 10
			',
			'name' => 'all_matrix_relation_flat_st_si_gin_idx',
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
				'matrix_activity_diffusion',
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
				ON {$table}
				USING gin (data_relations_flat_fct_st_si(relation) jsonb_path_ops);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_flat_fct_st_si_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE data_relations_flat_fct_st_si(relation) @> \'["oh33_dd64_1"]\'::jsonb
				LIMIT 10
			',
			'name' => 'all_matrix_relation_flat_fct_st_si_gin_idx',
			'info' => 'Used to search relations across all components data with a flat text of the relation such as oh33_dd64_1'
		];


		// Flat relation type, section_tipo
		// ty = type
		// st = section_tipo
		// si = section_id
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				ON {$table}
				USING gin (data_relations_flat_ty_st(relation) jsonb_path_ops);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_flat_ty_st_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE data_relations_flat_ty_st(relation) @> \'["dd151_dd64"]\'::jsonb
				LIMIT 10
			',
			'name' => 'all_matrix_relation_flat_ty_st_gin_idx',
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
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_relation_flat_ty_st_si_gin_idx
				ON {$table}
				USING gin (data_relations_flat_ty_st_si(relation) jsonb_path_ops);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_flat_ty_st_si_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE data_relations_flat_ty_st_si(relation) @> \'["dd151_dd64_1"]\'::jsonb
				LIMIT 10
			',
			'name' => 'all_matrix_relation_flat_ty_st_si_gin_idx',
			'info' => 'Used to search relations across all components data with a flat text of the relation such as dd151_dd64_1'
		];


	// Dates
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_date_gin_idx
				ON {$table}
				USING gin (
					date jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_date_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE date @> \'[{"time":57958546}]\'
				LIMIT 10
			',
			'name' => 'all_matrix_date_gin_idx',
			'info' => 'Used to search dates by any property.'
		];


	// iri
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_iri_gin_idx
				ON {$table}
				USING gin (
					iri jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_iri_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE iri @> \'[{"iri":"https://dedalo.dev"}]\'
				LIMIT 10
			',
			'name' => 'all_matrix_iri_gin_idx',
			'info' => 'Used to search IRI data by any of its properties, iri or title.'
		];


	// geo
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_geo_gin_idx
				ON {$table}
				USING gin (
					geo jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_geo_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(geo, \'$.*[*]\') @> \'[{"lat":"39.462571"}]\'
				LIMIT 10;
			',
			'name' => 'all_matrix_geo_gin_idx',
			'info' => 'Used to search geolocation data by any of its properties: lat, lng or alt.'
		];


	// number
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_number_gin_idx
				ON {$table}
				USING gin (
					number jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_number_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(number, \'$.*[*].value\') @> \'[5]\'
				LIMIT 10
			',
			'name' => 'all_matrix_number_gin_idx',
			'info' => 'Used to search number data values.'
		];


	// media
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_media_gin_idx
				ON {$table}
				USING gin (
					media jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_media_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(media, \'$.*[*]\') @> \'[{"original_file_name":"my_image.png"}]\'
				LIMIT 10;
			',
			'name' => 'all_matrix_media_gin_idx',
			'info' => 'Used to search media data by any of its properties, original_file_name, or others.'
		];


	// misc
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_misc_gin_idx
				ON {$table}
				USING gin (
					misc jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_misc_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE jsonb_path_query_array(misc, \'$.*[*].value\') @> \'[{"section_tipo":"lg-spa"}]\'
				LIMIT 10;
			',
			'name' => 'all_matrix_misc_gin_idx',
			'info' => 'Used to search miscellaneous data by any of its properties.'
		];


	// relation search
		$ar_index[] = (object)[
			'tables' => [
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_activity_diffusion',
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
				CREATE INDEX IF NOT EXISTS {$table}_relation_search_gin_idx
				ON {$table}
				USING gin (
					relation_search jsonb_path_ops
				);
			',
			'drop' => '
				DROP INDEX IF EXISTS {$table}_relation_search_gin_idx
			',
			'sample' => '
				SELECT *
				FROM matrix
				WHERE relation_search @> \'[{"section_tipo":"es1"}]\'
				LIMIT 10
			',
			'name' => 'all_matrix_relation_search_gin_idx',
			'info' => 'Used to search relation all children data with specific parent. Give me all data indexed with a child using any of its parents.'
		];


	// By table, specific index for tables

		// id : matrix_activity / matrix_activity_diffusion
			$ar_index[] = (object)[
				'tables' => [
					'matrix_activity',
					'matrix_activity_diffusion'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_id_desc_idx
					ON {$table}
					USING btree (id DESC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_id_desc_idx
				',
				'sample' => '
					SELECT *
					FROM matrix_activity
					WHERE id = 5
					LIMIT 10
				',
				'name' => 'matrix_activity_id_desc_idx',
				'info' => 'Used to search by id ordered descendant.'
			];

		// tipo : time_machine (includes tipo and id for performance)
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_tipo_idx
					ON {$table}
					USING btree (tipo, id DESC);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_tipo_idx
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE tipo = \'oh1\'
					ORDER BY id DESC
					LIMIT 1
				',
				'name' => 'matrix_time_machine_tipo_idx',
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
					USING btree (lang COLLATE pg_catalog.default ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_lang_idx
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE lang = \'lg-spa\'
					LIMIT 1
				',
				'name' => 'matrix_time_machine_lang_idx',
				'info' => 'Used to search by lang.'
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
					DROP INDEX IF EXISTS {$table}_bulk_process_id_idx
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE bulk_process_id = 751
					LIMIT 1
				',
				'name' => 'matrix_time_machine_bulk_process_id_idx',
				'info' => 'Used to search by bulk_process_id.'
			];

		// timestamp
		// Note that use function DATE(timestamp) is usefull to deal with time_machine searches in 'dd15'
			// $ar_index[] = (object)[
			// 	'tables' => [
			// 		'matrix_time_machine'
			// 	],
			// 	'add' => '
			// 		CREATE INDEX IF NOT EXISTS {$table}_timestamp_idx
			// 		ON {$table}
			// 		USING btree ("timestamp" DESC NULLS LAST );
			// 	',
			// 	'drop' => '
			// 		DROP INDEX IF EXISTS {$table}_timestamp_idx;
			// 	',
			// 	'sample' => '
			// 		SELECT *
			// 		FROM matrix_time_machine
			// 		WHERE timestamp = \'2025-08-18 19:09:05\'
			// 		LIMIT 1
			// 	',
			// 	'name' => 'matrix_time_machine_timestamp_idx',
			// 	'info' => 'Used to search by timestamp, in time machine always descendant.'
			// ];
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_timestamp_date_idx
					ON {$table}
					(DATE("timestamp"));
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_timestamp_idx; -- Intentional remove legacy index
					DROP INDEX IF EXISTS {$table}_timestamp_date_idx;
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE DATE("timestamp") = \'2025-08-18\'
					LIMIT 1
				',
				'name' => 'matrix_time_machine_timestamp_date_idx',
				'info' => 'Used to search by date in time machine timestamp column.'
			];

		// user_id
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_user_id_idx
					ON {$table}
					USING btree ("user_id" ASC NULLS LAST);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_user_id_idx
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE user_id = 2
					LIMIT 1
				',
				'name' => 'matrix_time_machine_user_id_idx',
				'info' => 'Used to search by user_id.'
			];

		// section_id_key
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_si_bulk_st_tipo_lang_idx
					ON {$table}
					USING btree (
						section_id ASC NULLS LAST,
						bulk_process_id ASC NULLS LAST,
						section_tipo COLLATE pg_catalog.default ASC NULLS LAST,
						tipo COLLATE pg_catalog.default ASC NULLS LAST,
						lang COLLATE pg_catalog.default ASC NULLS LAST
					);
				',
				'drop' => '
					DROP INDEX IF EXISTS {$table}_si_bulk_st_tipo_lang_idx
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE bulk_process_id = 751
					LIMIT 1
				',
				'name' => 'matrix_time_machine_si_bulk_st_tipo_lang_idx',
				'info' => 'Used to search by bulk_process_id with all parameters, section_id, bulk_process_id, section_tipo, tipo and lang.'
			];

		// hierarchy41 value : matrix_langs
			$ar_index[] = (object)[
				'tables' => [
					'matrix_langs'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_hierarchy41_value_idx ON "{$table}" (
						(string->\'hierarchy41\'->0->>\'value\')
					);
					ANALYZE {$table};
				',
				'drop' => '
					DROP INDEX IF EXISTS "{$table}_hierarchy41_value_idx"
				',
				'sample' => '
					SELECT *
					FROM matrix_langs
					WHERE (string->\'hierarchy41\'->0->>\'value\') = \'eng\'
					LIMIT 10
				',
				'name' => 'matrix_langs_hierarchy41_value_idx',
				'info' => 'Used to search by hierarchy41 value (lang code) in matrix_langs'
			];

		// search default : matrix_time_machine
			$ar_index[] = (object)[
				'tables' => [
					'matrix_time_machine'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_search_default_idx ON "{$table}" (
						section_id, section_tipo, tipo, lang, "timestamp" DESC
					);
					ANALYZE {$table};
				',
				'drop' => '
					DROP INDEX IF EXISTS "{$table}_search_default_idx"
				',
				'sample' => '
					SELECT *
					FROM matrix_time_machine
					WHERE section_id = 1 AND section_tipo = \'oh1\'
					ORDER BY timestamp DESC
					LIMIT 10
				',
				'name' => 'matrix_time_machine_search_default_idx',
				'info' => 'Used to search by default parameters: section_id, section_tipo, tipo, lang, timestamp DESC'
			];

		// id asc : matrix_activity
			$ar_index[] = (object)[
				'tables' => [
					'matrix_activity'
				],
				'add' => '
					CREATE INDEX IF NOT EXISTS {$table}_id_asc_idx
					ON {$table}
					USING btree (id ASC);
					ANALYZE {$table};
				',
				'drop' => '
					DROP INDEX IF EXISTS "{$table}_id_asc_idx"
				',
				'sample' => '
					SELECT *
					FROM matrix_activity
					ORDER BY id ASC
					LIMIT 10
				',
				'name' => 'matrix_activity_id_asc_idx',
				'info' => 'Used to search by id ordered ascendant. Used by diffusion_section_stats:update_user_activity_stats'
			];


// Maintenance
	$ar_maintenance = [];

	// matrix_dd REINDEX
		$ar_maintenance[] = '
			REINDEX TABLE matrix_dd;
		';

	// matrix_dd vacuum
		$ar_maintenance[] = '
			VACUUM FULL VERBOSE ANALYZE matrix_dd;
		';

	// vacuum. Vacuum analyze main tables
		$ar_maintenance[] = '
			VACUUM ANALYZE "matrix_hierarchy";
		';
		$ar_maintenance[] = '
			VACUUM ANALYZE "matrix";
		';
		$ar_maintenance[] = '
			VACUUM ANALYZE "matrix_activity";
		';



return [
	'ar_extensions'		=> $ar_extensions,
	'ar_function'		=> $ar_function,
	'ar_constraint'		=> $ar_constraint,
	'ar_index'			=> $ar_index,
	'ar_maintenance'	=> $ar_maintenance,
];
