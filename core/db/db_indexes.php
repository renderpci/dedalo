<?php
// db index

// extensions
	$ar_sql_query[] = '
		CREATE EXTENSION IF NOT EXISTS pg_trgm;

		CREATE EXTENSION IF NOT EXISTS unaccent;
	';

// functions
	$ar_sql_query[] = "

		CREATE OR REPLACE FUNCTION f_unaccent(text)
		RETURNS text
		LANGUAGE 'sql'
		COST 100
		IMMUTABLE PARALLEL UNSAFE
		AS $BODY$
		SELECT unaccent('unaccent', $1)
		$BODY$;

		-- Create function with base flat locators st=section_tipo si=section_id (dd64_1)
		-- example: SELECT * FROM matrix WHERE data_relations_flat_st_si(data) @> '[\"dd64_1\"]'::jsonb;
		CREATE OR REPLACE FUNCTION data_relations_flat_st_si(data jsonb)
		RETURNS jsonb
		LANGUAGE sql IMMUTABLE
		AS $$
		SELECT jsonb_agg(section_tipo || '_' || section_id)
		FROM (
			SELECT
				rel->>'section_tipo' as section_tipo,
				rel->>'section_id' as section_id
			FROM
				jsonb_each(data) as component_data,
				jsonb_array_elements(component_data.value) as rel
		) t
		$$;

		-- Create function with base flat locators fct=from_section_tipo st=section_tipo si=section_id (tchi7_dd64_1)
		-- example: SELECT * FROM matrix WHERE data_relations_flat_fct_st_si(data) @> '[\"tchi7_dd64_1\"]'::jsonb;
		CREATE OR REPLACE FUNCTION data_relations_flat_fct_st_si(data jsonb)
		RETURNS jsonb
		LANGUAGE sql IMMUTABLE
		AS $$
		SELECT jsonb_agg(from_component_tipo || '_' || section_tipo || '_' || section_id)
		FROM (
			SELECT
				component_data.key as from_component_tipo,
				rel->>'section_tipo' as section_tipo,
				rel->>'section_id' as section_id
			FROM
				jsonb_each(data) as component_data,
				jsonb_array_elements(component_data.value) as rel
		) t
		$$;

		-- Create function with base flat locators ty=type st=section_tipo si=section_id (dd151_dd64_1)
		-- example: SELECT * FROM matrix WHERE data_relations_flat_ty_st_si(data) @> '[\"dd151_dd64_1\"]'::jsonb;
		CREATE OR REPLACE FUNCTION data_relations_flat_ty_st_si(data jsonb)
		RETURNS jsonb
		LANGUAGE sql IMMUTABLE
		AS $$
		SELECT jsonb_agg(type || '_' || section_tipo || '_' || section_id)
		FROM (
			SELECT
				rel->>'type' as type,
				rel->>'section_tipo' as section_tipo,
				rel->>'section_id' as section_id
			FROM
				jsonb_each(data) as component_data,
				jsonb_array_elements(component_data.value) as rel
		) t
		$$;

		-- Create function with base flat locators ty=type st=section_tipo (dd96_rsc197)
		-- example: SELECT * FROM matrix WHERE data_relations_flat_ty_st(data) @> '[\"dd96_rsc197\"]'::jsonb;
		CREATE OR REPLACE FUNCTION data_relations_flat_ty_st(data jsonb)
		RETURNS jsonb
		LANGUAGE sql IMMUTABLE
		AS $$
		SELECT jsonb_agg(type || '_' || section_tipo)
		FROM (
			SELECT
				rel->>'type' as type,
				rel->>'section_tipo' as section_tipo
			FROM
				jsonb_each(data) as component_data,
				jsonb_array_elements(component_data.value) as rel
		) t
		$$;

		-- Create function to get valid searchable strings
		-- get all string values inside literals with match with the literal[]->type->dd750
		-- uses COALESCE 		- return empty
		-- uses unaccent 		- remove any accent in the string
		-- uses lower 			- all letters in lowercase, to be used as case-insensitive
		-- uses regexp_replace 	- remove all HTML tags as <p>
		CREATE OR REPLACE FUNCTION get_searchable_string(data jsonb)
		RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
		$$
		SELECT
			 COALESCE(
				string_agg(
					f_unaccent( lower( regexp_replace( string->>'value', '<[^>]*>', '', 'g') ) )
				, ' ')
			, '')
		FROM jsonb_array_elements(
				jsonb_path_query_array(data, '$.*[*]')
			) AS string;
		$$;
	";


// Indexes
	$ar_index = [];


// jer_dd and ontology
	// is_descriptor
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_is_descriptor
				ON {$table}
				USING btree ( esdescriptor ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_is_descriptor
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE is_descriptor = 1
				LIMIT 1;
			",
			'info' => 'Used to search if the term is a descriptor or not, possible values: 1|2. 1 = yes, 2 = no'
		];

	// is_model
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_is_model
				ON {$table}
				USING btree ( esmodelo ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_is_model
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE is_model = 1
				LIMIT 1;
			",
			'info' => 'Used to search if the term is a descriptor or not, possible values: 1|2. 1 = yes, 2 = no'
		];

	// model
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_model
				ON {$table}
				USING btree ( model COLLATE pg_catalog.\"default\" ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_model
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE model = 'section'
				LIMIT 1;
			",
			'info' => 'Used to search if the descriptor model'
		];

	// model_tipo
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_model
				ON {$table}
				USING btree ( model_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_model
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE model_tipo = 'dd6'
				LIMIT 1;
			",
			'info' => 'Used to search if the descriptor model_tipo'
		];

	// order
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_order
				ON {$table}
				USING btree ( norden ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_order
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE order = 2
				LIMIT 1;
			",
			'info' => 'Used to search if the descriptor model_tipo'
		];

	// parent
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_parent
				ON {$table}
				USING btree ( parent ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_parent
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE parent = 'tch1'
				LIMIT 1;
			",
			'info' => 'Used to search if the descriptor model_tipo'
		];

	// tld
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd',
				'main_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_tld
				ON {$table}
				USING btree ( tld COLLATE pg_catalog.\"default\" ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_tld
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE tld = 'tch'
				LIMIT 1;
			",
			'info' => 'Used to search if the descriptor model_tipo'
		];

	// relations
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_relations
				ON {$table}
				USING btree ( relations COLLATE pg_catalog.\"default\" ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_relations
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE relations = 'tch'
				LIMIT 1;
			",
			'info' => 'Used to search if the descriptor model_tipo'
		];

	// translatable
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_translatable
				ON {$table}
				USING btree ( translatable ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_translatable
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE translatable = 1
				LIMIT 1;
			",
			'info' => 'Used to search if the term is translatable or not, possible values: 1|2. 1 = yes, 2 = no'
		];

	// parent is_descriptor and order
		$ar_index[] = (object)[
			'tables' => [
				'jer_dd'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_parent_descriptor_order
				ON {$table}
				USING btree (
					parent COLLATE pg_catalog.\"default\" ASC NULLS LAST,
					is_descriptor ASC NULLS LAST,
					order ASC NULLS LAST
				);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_parent_descriptor_order
			",
			'sample' => "
				SELECT *
				FROM jer_dd
				WHERE parent = 'tch1'
				AND is_descriptor = 1
				LIMIT 1;
			",
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
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_section_id
				ON {$table}
				USING btree (section_id ASC NULLS LAST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_section_id
			",
			'sample' => "
				SELECT *
				FROM matrix
				WHERE section_id = 5
				LIMIT 10;
			",
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
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_section_id_desc
				ON {$table}
				USING btree (section_id DESC NULLS LAST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_section_id_desc
			",
			'sample' => "
				SELECT *
				FROM matrix
				WHERE section_id = 5
				LIMIT 10;
			",
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
			'sql' => "

				CREATE INDEX IF NOT EXISTS {$table}_section_tipo
				ON {$table}
				USING btree (section_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_section_tipo
			",
			'sample' => "
				SELECT *
				FROM matrix
				WHERE section_tipo = 'oh1'
				LIMIT 10;
			",
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
			'sql' => "

				CREATE INDEX IF NOT EXISTS {$table}_section_tipo_section_id
				ON {$table}
				USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_section_tipo_section_id
			",
			'sample' => "
				SELECT *
				FROM matrix
				WHERE section_id = 5 AND section_tipo = 'rsc197'
				LIMIT 10;
			",
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
			'sql' => "

			CREATE INDEX IF NOT EXISTS {$table}_section_tipo_section_id_desc
				ON {$table}
				USING btree (section_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST, section_id DESC NULLS FIRST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_section_tipo_section_id_desc
			",
			'sample' => "
				SELECT *
				FROM matrix
				WHERE section_id = 5 AND section_tipo = 'rsc197'
				LIMIT 10;
			",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_string_gin
			ON {$table}
			USING gin (
				string
				jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_string_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE strings @> '{\"rsc85\":[{\"value\":\"Pere\"}]}';
		",
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
		'sql' => "
			ALTER TABLE {$table} ADD COLUMN search_string text NOT NULL GENERATED ALWAYS AS (
				 COALESCE( get_searchable_string(string), '' )
			) STORED;

			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_strings_value_gin
			ON {$table}
			USING gin (
				search_string gin_trgm_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_strings_value_gin;
			ALTER TABLE {$table} DROP COLUMN search_string;
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE
				search_string LIKE unaccent(lower('%ripoll%'))
			ORDER BY section_id ASC
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX IF NOT EXISTS {$table}_relation_gin
			ON {$table}
			USING gin (
				relation
				jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_relation_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE relation @> '{\"rsc91\":[{\"section_tipo\":\"es1\"}]}'
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_relation_locators
			ON {$table}
			USING gin (
				jsonb_path_query_array(relation, '$.*[*]')
				jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_relation_locators
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(relation, '$.*[*]') @> '[{\"section_tipo\":\"es1\"}]'
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX IF NOT EXISTS {$table}_relation_flat_st_si
			ON matrix
			USING gin (data_relations_flat_st_si(relation) jsonb_path_ops);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_relation_flat_st_si
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE data_relations_flat_st_si(data) @> '[\"dd64_1\"]'::jsonb;
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX IF NOT EXISTS {$table}_relation_flat_fct_st_si
			ON matrix
			USING gin (data_relations_flat_fct_st_si(relation) jsonb_path_ops);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_relation_flat_fct_st_si
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE data_relations_flat_fct_st_si(data) @> '[\"oh33_dd64_1\"]'::jsonb;
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX IF NOT EXISTS {$table}_relation_flat_ty_st
			ON matrix
			USING gin (data_relations_flat_ty_st(relation) jsonb_path_ops);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_relation_flat_ty_st
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE data_relations_flat_ty_st(data) @> '[\"dd151_dd64\"]'::jsonb;
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX IF NOT EXISTS {$table}_relation_flat_ty_st
			ON matrix
			USING gin (data_relations_flat_ty_st_si(relation) jsonb_path_ops);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_relation_flat_ty_st
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE data_relations_flat_ty_st_si(data) @> '[\"dd151_dd64\"]'::jsonb;
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_date_gin
			ON {$table}
			USING gin (
				date jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_date_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE date @> '[{\"time\":57958546}]'
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_iri_gin
			ON {$table}
			USING gin (
				iri jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_iri_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE iri @> '[{\"iri\":\"https://dedalo.dev\"}]'
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_geo_gin
			ON {$table}
			USING gin (
				geo jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_geo_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(geo, '$.*[*]') @> '[{\"lat\":\"39.462571\"}]'
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_number_gin
			ON {$table}
			USING gin (
				number jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_number_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(number, '$.*[*].value') @> '[5]'
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_media_gin
			ON {$table}
			USING gin (
				media jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_media_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(media, '$.*[*]') @> '[{\"original_file_name\":\"my_image.png\"}]'
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_misc_gin
			ON {$table}
			USING gin (
				misc jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_misc_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(misc, '$.*[*].value') @> '[{\"section_tipo\":\"lg-spa\"}]'
			LIMIT 10;
		",
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
		'sql' => "
			CREATE INDEX CONCURRENTLY IF NOT EXISTS {$table}_relation_search_gin
			ON {$table}
			USING gin (
				relations_search jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_relation_search_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE relations_search @> '[{\"section_tipo\":\"es1\"}]'
			LIMIT 10;
		",
		'info' => 'Used to search relation all children data with specific parent. Give me all data indexed with a child using any of its parents.'
	];


// By table, specific index for tables

	// id matrix_activity

		$ar_index[] = (object)[
			'tables' => [
				'matrix_activity'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_id_desc
				ON {$table}
				USING btree (id DESC NULLS LAST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_id_desc
			",
			'sample' => "
				SELECT *
				FROM matrix
				WHERE id = 5
				LIMIT 10;
			",
			'info' => 'Used to search by id ordered descendant.'
		];

	// tipo
		$ar_index[] = (object)[
			'tables' => [
				'matrix_counter',
				'matrix_counter_dd',
				'matrix_time_machine'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_tipo
				ON {$table}
				USING btree (tipo ASC NULLS LAST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_tipo
			",
			'sample' => "
				SELECT *
				FROM matrix_counter
				WHERE tipo = 'oh1'
				LIMIT 1;
			",
			'info' => 'Used to search by tipo.'
		];

	// lang
		$ar_index[] = (object)[
			'tables' => [
				'matrix_time_machine'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_lang
				ON {$table}
				USING btree (lang COLLATE pg_catalog.\"default\" ASC NULLS LAST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_lang
			",
			'sample' => "
				SELECT *
				FROM matrix_time_machine
				WHERE lang = 'lg-spa'
				LIMIT 1;
			",
			'info' => 'Used to search by tipo.'
		];

	// bulk_process_id
		$ar_index[] = (object)[
			'tables' => [
				'matrix_time_machine'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_bulk_process_id
				ON {$table}
				USING btree ( bulk_process_id ASC NULLS LAST);
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_bulk_process_id
			",
			'sample' => "
				SELECT *
				FROM matrix_time_machine
				WHERE bulk_process_id = 751
				LIMIT 1;
			",
			'info' => 'Used to search by bulk_process_id.'
		];

	// state
		$ar_index[] = (object)[
			'tables' => [
				'matrix_time_machine'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_state
				ON {$table}
				USING btree ( state COLLATE pg_catalog.\"default\" ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_state
			",
			'sample' => "
				SELECT *
				FROM matrix_time_machine
				WHERE state = 'deleted'
				LIMIT 1;
			",
			'info' => 'Used to search by state, possible values: deleted | created.'
		];

	// timestamp
		$ar_index[] = (object)[
			'tables' => [
				'matrix_time_machine'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_timestamp
				ON {$table}
				USING btree ( \"timestamp\" DESC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_timestamp
			",
			'sample' => "
				SELECT *
				FROM matrix_time_machine
				WHERE timestamp = '2025-08-18 19:09:05'
				LIMIT 1;
			",
			'info' => 'Used to search by timestamp, in time machine always descendant.'
		];

	// userID
		$ar_index[] = (object)[
			'tables' => [
				'matrix_time_machine'
			],
			'sql' => "
				CREATE INDEX IF NOT EXISTS {$table}_user_id
				ON {$table}
				USING btree ( \"userID\" ASC NULLS LAST );
			",
			'drop' => "
				DROP INDEX IF EXISTS {$table}_user_id
			",
			'sample' => "
				SELECT *
				FROM matrix_time_machine
				WHERE user_id = 2
				LIMIT 1;
			",
			'info' => 'Used to search by user id.'
		];

	// section_id_key
		// $ar_index[] = (object)[
		// 	'tables' => [
		// 		'matrix_time_machine'
		// 	],
		// 	'sql' => "

		// 		CREATE INDEX IF NOT EXISTS {$table}_bulk_process_id
		// 		ON {$table}
		// 		USING btree (
		// 			section_id ASC NULLS LAST,
		// 			section_id_key ASC NULLS LAST,
		// 			section_tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST,
		// 			tipo COLLATE pg_catalog.\"default\" ASC NULLS LAST,
		// 			lang COLLATE pg_catalog.\"default\" ASC NULLS LAST
		// 		);

		// 	",
		// 	'drop' => "
		// 		DROP INDEX IF EXISTS {$table}_bulk_process_id
		// 	",
		// 	'sample' => "
		// 		SELECT *
		// 		FROM matrix_time_machine
		// 		WHERE bulk_process_id = 751
		// 		LIMIT 1;
		// 	",
		// 	'info' => 'Used to search by tipo.'
		// ];



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
