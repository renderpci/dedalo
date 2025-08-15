<?php
// db index

// extensions
	$ar_sql_query[] = '
		CREATE EXTENSION IF NOT EXISTS pg_trgm
		SCHEMA public
		VERSION "1.6";

		CREATE EXTENSION IF NOT EXISTS unaccent
		SCHEMA public
		VERSION "1.1";
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
				jsonb_each(data->'relations') as component_data,
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
				jsonb_each(data->'relations') as component_data,
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
				jsonb_each(data->'relations') as component_data,
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
				jsonb_each(data->'relations') as component_data,
				jsonb_array_elements(component_data.value) as rel
		) t
		$$;

		-- Create function to get valid searchable strings
		-- get all string values inside literals with match with the literal[]->type->dd750
		-- uses unaccent 		- remove any accent in the string
		-- uses lower 			- all letters in lowercase, to be used as case-insensitive
		-- uses regexp_replace 	- remove all HTML tags as <p>
		CREATE OR REPLACE FUNCTION get_searchable_string(data jsonb)
		RETURNS text LANGUAGE sql IMMUTABLE AS
		$$
		SELECT
			string_agg(
				public.unaccent(
					lower(
						regexp_replace( literal->>'value', '<[^>]*>', '', 'g')
					)
				),
				' '
			)
		FROM jsonb_path_query(data, '$.literals.*[*]') AS literal
		WHERE literal->'type' @> '\"dd750\"'::jsonb;
		$$;



		CREATE OR REPLACE FUNCTION data_relations(data jsonb)
		RETURNS jsonb
		LANGUAGE sql IMMUTABLE
		AS $$
		SELECT
		FROM jsonb_path_query(data, '$.relations.*[*]');
		$$;



	";

// jer_dd
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS jer_dd_esdescriptor
		ON jer_dd USING btree (esdescriptor ASC NULLS LAST);
		-- Index: jer_dd_esmodelo

		-- DROP INDEX IF EXISTS jer_dd_esmodelo;

		CREATE INDEX IF NOT EXISTS jer_dd_esmodelo
		ON jer_dd USING btree (esmodelo ASC NULLS LAST);
		-- Index: jer_dd_modelo

		-- DROP INDEX IF EXISTS jer_dd_modelo;

		CREATE INDEX IF NOT EXISTS jer_dd_modelo
		ON jer_dd USING btree (modelo COLLATE pg_catalog."default" ASC NULLS LAST);

		-- DROP INDEX IF EXISTS jer_dd_model;

		CREATE INDEX IF NOT EXISTS jer_dd_model
		ON jer_dd USING btree (modelo COLLATE pg_catalog."default" ASC NULLS LAST);

		-- DROP INDEX IF EXISTS jer_dd_norden;

		CREATE INDEX IF NOT EXISTS jer_dd_norden
		ON jer_dd USING btree (norden ASC NULLS LAST);

		-- DROP INDEX IF EXISTS jer_dd_parent;

		CREATE INDEX IF NOT EXISTS jer_dd_parent
		ON jer_dd USING btree (parent COLLATE pg_catalog."default" ASC NULLS LAST);

		-- DROP INDEX IF EXISTS jer_dd_parent_esdescriptor_norden;

		CREATE INDEX IF NOT EXISTS jer_dd_parent_esdescriptor_norden
		ON jer_dd USING btree (parent COLLATE pg_catalog."default" ASC NULLS LAST, esdescriptor ASC NULLS LAST, norden ASC NULLS LAST);

		-- DROP INDEX IF EXISTS jer_dd_relaciones;

		CREATE INDEX IF NOT EXISTS jer_dd_relaciones
		ON jer_dd USING btree (relaciones COLLATE pg_catalog."default" ASC NULLS LAST);

		-- DROP INDEX IF EXISTS jer_dd_traducible;

		CREATE INDEX IF NOT EXISTS jer_dd_traducible
		ON jer_dd USING btree (traducible ASC NULLS LAST);

		-- DROP INDEX IF EXISTS jer_dd_usableindex;

		CREATE INDEX IF NOT EXISTS jer_dd_usableindex
		ON jer_dd USING btree (tld COLLATE pg_catalog."default" ASC NULLS LAST);

		-- DROP INDEX IF EXISTS jer_dd_visible;

		CREATE INDEX IF NOT EXISTS jer_dd_visible
		ON jer_dd USING btree (visible ASC NULLS LAST);
	';

// main_dd
	$ar_sql_query[] = '
		DO $$
		BEGIN	IF EXISTS(SELECT *
				FROM information_schema.columns
				WHERE table_name=\'main_dd\')
			THEN
				CREATE INDEX IF NOT EXISTS main_dd_tld
				ON main_dd USING btree 		(tld COLLATE pg_catalog."default" ASC NULLS LAST)
				TABLESPACE pg_default;
			END IF;
		END $$;
	';


// Indexes
	$ar_index = [];


// id
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
			CREATE INDEX IF NOT EXISTS {$table}_id_index
			ON {$table}
			USING btree (id ASC NULLS FIRST);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_id_index
		",
		'sample' => "
			SELECT * FROM matrix
			WHERE jsonb_path_query_array(data, '$.relations.*[*]') @> '[{\"section_tipo\":\"es1\"}]'
			ORDER BY id ASC;
		",
		'info' => 'Used to order the main id ascendant'
	];



// Literals
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
			CREATE INDEX IF NOT EXISTS {$table}_data_literals_gin
			ON {$table}
			USING gin (
				jsonb_path_query_array(data, '$.literals')
				jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_data_literals_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(data, '$.literals')  @> '{\"rsc85\":[{\"value\":\"Pere\"}]}';
		",
		'info' => 'Used to search literals as components data'
	];

	// Type
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
			CREATE INDEX IF NOT EXISTS {$table}_data_literals_types
			ON {$table}
			USING gin (
				jsonb_path_query_array(data->'literals', '$.*[*].type')
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_data_literals_types
		",
		'sample' => "
			SELECT * FROM matrix
			WHERE jsonb_path_query_array(data, '$.literals.*[*].type') @> '\"dd1481\"'::jsonb
			LIMIT 10;
		",
		'info' => 'Used to search literal type as text, date, geo, etc. the type store the ontology tipo, as `dd750` for strings'
	];

	// value
	// this index is a global index to search literals
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
			CREATE INDEX IF NOT EXISTS {$table}_data_literals_value
			ON {$table}
			USING gin (
				get_searchable_string(data)	gin_trgm_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_data_literals_value
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE
				get_searchable_string(data) LIKE unaccent(lower('%ripoll%'))
			ORDER BY section_id ASC
			LIMIT 10;
		",
		'info' => 'Used to search literal values as strings across all sections, it could be used '
	];

	// value with section_tipo
	// this index is a specific section index to search literals
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
			CREATE INDEX IF NOT EXISTS {$table}_data_literals_value_section
			ON {$table}
			USING gin (
				section_tipo gin_trgm_ops,
				get_searchable_string(data) gin_trgm_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_data_literals_value_section
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE
				section_tipo = 'rsc197' AND
				get_searchable_string(data) LIKE unaccent(lower('%ripoll%'))
			ORDER BY section_id ASC
			LIMIT 10;
		",
		'info' => 'Used to search literal values as strings in specific sections, it could be used '
	];

// Relations
	// global relations by component
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
			CREATE INDEX IF NOT EXISTS {$table}_data_relations_gin
			ON {$table}
			USING gin (
				jsonb_path_query_array(data, '$.relations')
				jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_data_relations_gin
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(data, '$.relations') @> '{\"rsc91\":[{\"section_tipo\":\"es1\"}]}'
			LIMIT 10;
		",
		'info' => 'Used to search relations as components data'
	];

	// global relations without component
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
			CREATE INDEX IF NOT EXISTS {$table}_data_relations_locators
			ON {$table}
			USING gin (
				jsonb_path_query_array(data, '$.relations.*[*]')
				jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_data_relations_locators
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(data, '$.relations.*[*]') @> '[{\"section_tipo\":\"es1\"}]'
			LIMIT 10;
		",
		'info' => 'Used to search relations across all components data'
	];

		// global relations without component
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
			CREATE INDEX IF NOT EXISTS {$table}_data_relations_locators_section
			ON {$table}
			USING gin (
				section_tipo gin_trgm_ops,
				jsonb_path_query_array(data, '$.relations.*[*]') jsonb_path_ops
			);
		",
		'drop' => "
			DROP INDEX IF EXISTS {$table}_data_relations_locators_section
		",
		'sample' => "
			SELECT *
			FROM matrix
			WHERE jsonb_path_query_array(data, '$.relations.*[*]') @> '[{\"section_tipo\":\"es1\"}]'
			LIMIT 10;
		",
		'info' => 'Used to search relations across all components data'
	];














	$ar_sql_query[] = "

		DROP INDEX matrix_data_literals_gin;

		-- CREATE INDEX IF NOT EXISTS matrix_id_index
		-- 	ON matrix
		-- 	USING btree (id ASC NULLS FIRST);

		CREATE INDEX IF NOT EXISTS matrix_data_relations_flat_st_si
			ON matrix
			USING gin (data_relations_flat_st_si(data) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_data_relations_flat_fct_st_si
			ON matrix
			USING gin (data_relations_flat_fct_st_si(data) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_data_relations_flat_ty_st_si
			ON matrix
			USING gin (data_relations_flat_ty_st_si(data) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_data_relations_flat_ty_st
			ON matrix
			USING gin (data_relations_flat_ty_st(data) jsonb_path_ops);

		-- CREATE INDEX IF NOT EXISTS matrix_data_relations_gin
		-- 	ON matrix
		-- 	USING gin (
		-- 		(data->'relations')
		-- 		jsonb_path_ops
		-- 	);

		-- CREATE INDEX matrix_data_relations_keys_gin
		-- 	ON matrix
		-- 	USING GIN (
		-- 		(jsonb_object_keys(data -> 'relations'))
		-- 	);

		-- CREATE INDEX IF NOT EXISTS  matrix_data_literals_gin
		-- 	ON matrix
		-- 	USING gin (
		-- 		(data -> 'literals')
		-- 		jsonb_path_ops
		-- 	);

		CREATE INDEX IF NOT EXISTS matrix_data_relations_search_gin
			ON matrix
			USING gin (
				(data->'relations_search')
				jsonb_path_ops
			);


		-- SELECT * FROM matrix
		-- WHERE jsonb_path_query_array(data, '$.relations.*[*]') @> '[{\"section_tipo\":\"es1\"}]';

		-- CREATE INDEX IF NOT EXISTS matrix_data_relations_locators
		-- 	ON matrix
		-- 	USING gin (
		-- 		(jsonb_path_query_array(data, '$.relations.*[*]'))
		-- 		jsonb_path_ops
		-- 	);

		-- CREATE INDEX IF NOT EXISTS matrix_data_literals_types
		-- 	ON matrix
		-- 	USING gin (
		-- 		jsonb_path_query_array(data->'literals', '$.*[*].type')
		-- 	);

		-- CREATE INDEX IF NOT EXISTS matrix_data_literals_values
		-- 	ON matrix
		-- 	USING gin (
		-- 		jsonb_path_query_array(data->'literals', '$.*[*].value')
		-- 	);

		-- DROP INDEX IF EXISTS matrix_section_id;

		CREATE INDEX IF NOT EXISTS matrix_section_id
			ON matrix
			USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_section_tipo

		-- DROP INDEX IF EXISTS matrix_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_section_tipo
			ON matrix
			USING btree (section_tipo ASC NULLS LAST);
		-- Index: matrix_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_section_tipo_section_id
			ON matrix
			USING btree (section_id ASC NULLS LAST, section_tipo ASC NULLS LAST);
		-- Index: matrix_section_tipo_section_id_desc

		-- DROP INDEX IF EXISTS matrix_section_tipo_section_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_section_tipo_section_id_desc
			ON matrix
			USING btree (section_tipo ASC NULLS LAST, section_id DESC NULLS FIRST);
	";

// matrix_activities
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_activities_datos_ginON matrix_activities USING gin (datos jsonb_path_ops);
		-- Index: matrix_activities_id_idx

		-- DROP INDEX IF EXISTS matrix_activities_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_activities_id_idx
		ON matrix_activities USING btree (id ASC NULLS FIRST);
		-- Index: matrix_activities_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS matrix_activities_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_fct_st_si
		ON matrix_activities USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);
		-- Index: matrix_activities_relations_flat_st_si

		-- DROP INDEX IF EXISTS matrix_activities_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_st_si
		ON matrix_activities USING gin (relations_flat_st_si(datos) jsonb_path_ops);
		-- Index: matrix_activities_relations_flat_ty_st

		-- DROP INDEX IF EXISTS matrix_activities_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_ty_st
		ON matrix_activities USING gin (relations_flat_ty_st(datos) jsonb_path_ops);
		-- Index: matrix_activities_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS matrix_activities_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_flat_ty_st_si
		ON matrix_activities USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
		-- Index: matrix_activities_relations_idx

		-- DROP INDEX IF EXISTS matrix_activities_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_activities_relations_idx
		ON matrix_activities USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_activities_section_id

		-- DROP INDEX IF EXISTS matrix_activities_section_id;

		CREATE INDEX IF NOT EXISTS matrix_activities_section_id
		ON matrix_activities USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_activities_section_tipo

		-- DROP INDEX IF EXISTS matrix_activities_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_activities_section_tipo
		ON matrix_activities USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_activities_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_activities_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_activities_section_tipo_section_id
		ON matrix_activities USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_activity
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_activity_date_btree ON matrix_activity USING btree (date ASC NULLS LAST);
		-- Index: matrix_activity_datos_gin

		-- DROP INDEX IF EXISTS matrix_activity_datos_gin;

		CREATE INDEX IF NOT EXISTS matrix_activity_datos_ginON matrix_activity USING gin (datos jsonb_path_ops);
		-- Index: matrix_activity_order_id_asc

		-- DROP INDEX IF EXISTS matrix_activity_order_id_asc;

		CREATE INDEX IF NOT EXISTS matrix_activity_order_id_asc
		ON matrix_activity USING btree (id ASC NULLS FIRST);
		-- Index: matrix_activity_order_id_desc

		-- DROP INDEX IF EXISTS matrix_activity_order_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_activity_order_id_desc
		ON matrix_activity USING btree (id DESC NULLS LAST);
		-- Index: matrix_activity_order_section_id_desc

		-- DROP INDEX IF EXISTS matrix_activity_order_section_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_activity_order_section_id_desc
		ON matrix_activity USING btree (section_id DESC NULLS FIRST);
		-- Index: matrix_activity_relations_idx

		-- DROP INDEX IF EXISTS matrix_activity_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_activity_relations_idx
		ON matrix_activity USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_activity_section_id

		-- DROP INDEX IF EXISTS matrix_activity_section_id;

		CREATE INDEX IF NOT EXISTS matrix_activity_section_id
		ON matrix_activity USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_activity_section_tipo

		-- DROP INDEX IF EXISTS matrix_activity_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_activity_section_tipo
		ON matrix_activity USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_activity_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_activity_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_activity_section_tipo_section_id
		ON matrix_activity USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_counter
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_counter_parent
		ON matrix_counter USING btree (parent ASC NULLS LAST);
		-- Index: matrix_counter_tipo

		-- DROP INDEX IF EXISTS matrix_counter_tipo;

		CREATE INDEX IF NOT EXISTS matrix_counter_tipo
		ON matrix_counter USING btree (tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_counter_dd
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_counter_dd_parent
		ON matrix_counter_dd USING btree (parent ASC NULLS LAST);
		-- Index: matrix_counter_dd_tipo

		-- DROP INDEX IF EXISTS matrix_counter_dd_tipo;

		CREATE INDEX IF NOT EXISTS matrix_counter_dd_tipo
		ON matrix_counter_dd USING btree (tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_dataframe
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_dataframe_datos_idx
		ON matrix_dataframe USING gin (datos jsonb_path_ops);
		-- Index: matrix_dataframe_expr_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_expr_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_expr_idx
		ON matrix_dataframe USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_dataframe_id_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_id_idx
		ON matrix_dataframe USING btree (id ASC NULLS FIRST);
		-- Index: matrix_dataframe_id_idx1

		-- DROP INDEX IF EXISTS matrix_dataframe_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_id_idx1
		ON matrix_dataframe USING btree (id DESC NULLS LAST);
		-- Index: matrix_dataframe_relations_flat_fct_st_si_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_relations_flat_fct_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_fct_st_si_idx
		ON matrix_dataframe USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);
		-- Index: matrix_dataframe_relations_flat_st_si_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_relations_flat_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_st_si_idx
		ON matrix_dataframe USING gin (relations_flat_st_si(datos) jsonb_path_ops);
		-- Index: matrix_dataframe_relations_flat_ty_st_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_relations_flat_ty_st_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_ty_st_idx
		ON matrix_dataframe USING gin (relations_flat_ty_st(datos) jsonb_path_ops);
		-- Index: matrix_dataframe_relations_flat_ty_st_si_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_relations_flat_ty_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_relations_flat_ty_st_si_idx
		ON matrix_dataframe USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
		-- Index: matrix_dataframe_section_id_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_section_id_idx
		ON matrix_dataframe USING btree	(section_id ASC NULLS LAST);
		-- Index: matrix_dataframe_section_id_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_section_id_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_section_id_section_tipo_idx
		ON matrix_dataframe USING btree	(section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_dataframe_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_section_tipo_idx
		ON matrix_dataframe USING btree	(section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_dataframe_section_tipo_section_id_idx

		-- DROP INDEX IF EXISTS matrix_dataframe_section_tipo_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_dataframe_section_tipo_section_id_idx
		ON matrix_dataframe USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST);
	';

// matrix_dd
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_dd_dd1475_ginON matrix_dd USING gin ((datos #> \'{components,dd1475,dato,lg-nolan}\'::text[]) jsonb_path_ops);
		-- Index: matrix_dd_gin

		-- DROP INDEX IF EXISTS matrix_dd_gin;

		CREATE INDEX IF NOT EXISTS matrix_dd_ginON matrix_dd USING gin (datos jsonb_path_ops);
		-- Index: matrix_dd_relations_idx

		-- DROP INDEX IF EXISTS matrix_dd_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_dd_relations_idx
		ON matrix_dd USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_dd_section_id

		-- DROP INDEX IF EXISTS matrix_dd_section_id;

		CREATE INDEX IF NOT EXISTS matrix_dd_section_id
		ON matrix_dd USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_dd_section_tipo

		-- DROP INDEX IF EXISTS matrix_dd_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_dd_section_tipo
		ON matrix_dd USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_dd_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_dd_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_dd_section_tipo_section_id
		ON matrix_dd USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_hierarchy
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_hierarchy_datos_idx
		ON matrix_hierarchy USING gin (datos jsonb_path_ops);
		-- Index: matrix_hierarchy_id_idx

		-- DROP INDEX IF EXISTS matrix_hierarchy_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_id_idx
		ON matrix_hierarchy USING btree (id ASC NULLS FIRST);
		-- Index: matrix_hierarchy_id_idx1

		-- DROP INDEX IF EXISTS matrix_hierarchy_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_id_idx1
		ON matrix_hierarchy USING btree (id DESC NULLS LAST);
		-- Index: matrix_hierarchy_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS matrix_hierarchy_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_fct_st_si
		ON matrix_hierarchy USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);
		-- Index: matrix_hierarchy_relations_flat_st_si

		-- DROP INDEX IF EXISTS matrix_hierarchy_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_st_si
		ON matrix_hierarchy USING gin (relations_flat_st_si(datos) jsonb_path_ops);
		-- Index: matrix_hierarchy_relations_flat_ty_st

		-- DROP INDEX IF EXISTS matrix_hierarchy_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_ty_st
		ON matrix_hierarchy USING gin (relations_flat_ty_st(datos) jsonb_path_ops);
		-- Index: matrix_hierarchy_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS matrix_hierarchy_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_flat_ty_st_si
		ON matrix_hierarchy USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
		-- Index: matrix_hierarchy_relations_idx

		-- DROP INDEX IF EXISTS matrix_hierarchy_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_relations_idx
		ON matrix_hierarchy USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_hierarchy_section_id_idx

		-- DROP INDEX IF EXISTS matrix_hierarchy_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_id_idx
		ON matrix_hierarchy USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_hierarchy_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_hierarchy_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_idx
		ON matrix_hierarchy USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_hierarchy_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_hierarchy_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_section_id
		ON matrix_hierarchy USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_hierarchy_section_tipo_section_id_desc

		-- DROP INDEX IF EXISTS matrix_hierarchy_section_tipo_section_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_section_tipo_section_id_desc
		ON matrix_hierarchy USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST);
		-- Index: matrix_hierarchy_term

		-- DROP INDEX IF EXISTS matrix_hierarchy_term;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_term
		ON matrix_hierarchy USING gin (f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops);
	';

// matrix_hierarchy_main
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_datos_idx
		ON matrix_hierarchy_main USING gin (datos jsonb_path_ops);
		-- Index: matrix_hierarchy_main_id_idx

		-- DROP INDEX IF EXISTS matrix_hierarchy_main_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_id_idx
		ON matrix_hierarchy_main USING btree (id ASC NULLS FIRST);
		-- Index: matrix_hierarchy_main_id_idx1

		-- DROP INDEX IF EXISTS matrix_hierarchy_main_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_id_idx1
		ON matrix_hierarchy_main USING btree (id DESC NULLS LAST);
		-- Index: matrix_hierarchy_main_relations_idx

		-- DROP INDEX IF EXISTS matrix_hierarchy_main_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_relations_idx
		ON matrix_hierarchy_main USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_hierarchy_main_section_id_idx

		-- DROP INDEX IF EXISTS matrix_hierarchy_main_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_section_id_idx
		ON matrix_hierarchy_main USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_hierarchy_main_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_hierarchy_main_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_hierarchy_main_section_tipo_idx
		ON matrix_hierarchy_main USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_indexations
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_indexations_datos_idx
		ON matrix_indexations USING gin (datos jsonb_path_ops);
		-- Index: matrix_indexations_id_idx

		-- DROP INDEX IF EXISTS matrix_indexations_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_indexations_id_idx
		ON matrix_indexations USING btree (id ASC NULLS FIRST);
		-- Index: matrix_indexations_id_idx1

		-- DROP INDEX IF EXISTS matrix_indexations_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_indexations_id_idx1
		ON matrix_indexations USING btree (id DESC NULLS LAST);
		-- Index: matrix_indexations_relations_idx

		-- DROP INDEX IF EXISTS matrix_indexations_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_indexations_relations_idx
		ON matrix_indexations USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_indexations_section_id_idx

		-- DROP INDEX IF EXISTS matrix_indexations_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_indexations_section_id_idx
		ON matrix_indexations USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_indexations_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_indexations_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_indexations_section_tipo_idx
		ON matrix_indexations USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_langs
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_langs_datos_idx
		ON matrix_langs USING gin (datos jsonb_path_ops);
		-- Index: matrix_langs_hierarchy41_gin

		-- DROP INDEX IF EXISTS matrix_langs_hierarchy41_gin;

		CREATE INDEX IF NOT EXISTS matrix_langs_hierarchy41_ginON matrix_langs USING gin ((datos #> \'{components,hierarchy41,dato,lg-nolan}\'::text[]));
		-- Index: matrix_langs_id_idx

		-- DROP INDEX IF EXISTS matrix_langs_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_langs_id_idx
		ON matrix_langs USING btree (id ASC NULLS FIRST);
		-- Index: matrix_langs_id_idx1

		-- DROP INDEX IF EXISTS matrix_langs_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_langs_id_idx1
		ON matrix_langs USING btree (id DESC NULLS LAST);
		-- Index: matrix_langs_relations_idx

		-- DROP INDEX IF EXISTS matrix_langs_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_langs_relations_idx
		ON matrix_langs USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_langs_section_id_idx

		-- DROP INDEX IF EXISTS matrix_langs_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_langs_section_id_idx
		ON matrix_langs USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_langs_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_langs_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_langs_section_tipo_idx
		ON matrix_langs USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_langs_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_langs_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_langs_section_tipo_section_id
		ON matrix_langs USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);

		-- relations_flat
		CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_fct_st_si
		ON matrix_langs USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_st_si
		ON matrix_langs USING gin (relations_flat_st_si(datos) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_ty_st
		ON matrix_langs USING gin (relations_flat_ty_st(datos) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_ty_st_si
		ON matrix_langs USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);

		-- term
		CREATE INDEX IF NOT EXISTS matrix_langs_term
		ON matrix_langs USING gin (f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops);
	';

// matrix_list
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_list_datos_ginON matrix_list USING gin (datos jsonb_path_ops);
		-- Index: matrix_list_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS matrix_list_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_fct_st_si
		ON matrix_list USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);
		-- Index: matrix_list_relations_flat_st_si

		-- DROP INDEX IF EXISTS matrix_list_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_st_si
		ON matrix_list USING gin (relations_flat_st_si(datos) jsonb_path_ops);
		-- Index: matrix_list_relations_flat_ty_st

		-- DROP INDEX IF EXISTS matrix_list_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_ty_st
		ON matrix_list USING gin (relations_flat_ty_st(datos) jsonb_path_ops);
		-- Index: matrix_list_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS matrix_list_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_flat_ty_st_si
		ON matrix_list USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
		-- Index: matrix_list_relations_idx

		-- DROP INDEX IF EXISTS matrix_list_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_list_relations_idx
		ON matrix_list USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_list_section_id

		-- DROP INDEX IF EXISTS matrix_list_section_id;

		CREATE INDEX IF NOT EXISTS matrix_list_section_id
		ON matrix_list USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_list_section_tipo

		-- DROP INDEX IF EXISTS matrix_list_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_list_section_tipo
		ON matrix_list USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_list_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_list_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_list_section_tipo_section_id
		ON matrix_list USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_nexus
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_nexus_datos_idx
		ON matrix_nexus USING gin (datos jsonb_path_ops);
		-- Index: matrix_nexus_expr_idx

		-- DROP INDEX IF EXISTS matrix_nexus_expr_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_expr_idx
		ON matrix_nexus USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_nexus_id_idx

		-- DROP INDEX IF EXISTS matrix_nexus_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_id_idx
		ON matrix_nexus USING btree (id ASC NULLS FIRST);
		-- Index: matrix_nexus_id_idx1

		-- DROP INDEX IF EXISTS matrix_nexus_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_nexus_id_idx1
		ON matrix_nexus USING btree (id DESC NULLS LAST);
		-- Index: matrix_nexus_relations_flat_fct_st_si_idx

		-- DROP INDEX IF EXISTS matrix_nexus_relations_flat_fct_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_fct_st_si_idx
		ON matrix_nexus USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);
		-- Index: matrix_nexus_relations_flat_st_si_idx

		-- DROP INDEX IF EXISTS matrix_nexus_relations_flat_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_st_si_idx
		ON matrix_nexus USING gin (relations_flat_st_si(datos) jsonb_path_ops);
		-- Index: matrix_nexus_relations_flat_ty_st_idx

		-- DROP INDEX IF EXISTS matrix_nexus_relations_flat_ty_st_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_ty_st_idx
		ON matrix_nexus USING gin (relations_flat_ty_st(datos) jsonb_path_ops);
		-- Index: matrix_nexus_relations_flat_ty_st_si_idx

		-- DROP INDEX IF EXISTS matrix_nexus_relations_flat_ty_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_relations_flat_ty_st_si_idx
		ON matrix_nexus USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
		-- Index: matrix_nexus_section_id_idx

		-- DROP INDEX IF EXISTS matrix_nexus_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_section_id_idx
		ON matrix_nexus USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_nexus_section_id_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_nexus_section_id_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_section_id_section_tipo_idx
		ON matrix_nexus USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_nexus_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_nexus_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_section_tipo_idx
		ON matrix_nexus USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_nexus_section_tipo_section_id_idx

		-- DROP INDEX IF EXISTS matrix_nexus_section_tipo_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_section_tipo_section_id_idx
		ON matrix_nexus USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST);
	';

// matrix_nexus_main
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_nexus_main_datos_idx
		ON matrix_nexus_main USING gin (datos jsonb_path_ops);
		-- Index: matrix_nexus_main_expr_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_expr_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_expr_idx
		ON matrix_nexus_main USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_nexus_main_id_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_id_idx
		ON matrix_nexus_main USING btree (id ASC NULLS FIRST);
		-- Index: matrix_nexus_main_id_idx1

		-- DROP INDEX IF EXISTS matrix_nexus_main_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_id_idx1
		ON matrix_nexus_main USING btree (id DESC NULLS LAST);
		-- Index: matrix_nexus_main_relations_flat_fct_st_si_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_relations_flat_fct_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_fct_st_si_idx
		ON matrix_nexus_main USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);
		-- Index: matrix_nexus_main_relations_flat_st_si_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_relations_flat_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_st_si_idx
		ON matrix_nexus_main USING gin (relations_flat_st_si(datos) jsonb_path_ops);
		-- Index: matrix_nexus_main_relations_flat_ty_st_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_relations_flat_ty_st_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_ty_st_idx
		ON matrix_nexus_main USING gin (relations_flat_ty_st(datos) jsonb_path_ops);
		-- Index: matrix_nexus_main_relations_flat_ty_st_si_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_relations_flat_ty_st_si_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_relations_flat_ty_st_si_idx
		ON matrix_nexus_main USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
		-- Index: matrix_nexus_main_section_id_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_id_idx
		ON matrix_nexus_main USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_nexus_main_section_id_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_section_id_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_id_section_tipo_idx
		ON matrix_nexus_main USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_nexus_main_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_tipo_idx
		ON matrix_nexus_main USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_nexus_main_section_tipo_section_id_idx

		-- DROP INDEX IF EXISTS matrix_nexus_main_section_tipo_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_nexus_main_section_tipo_section_id_idx
		ON matrix_nexus_main USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST);
	';

// matrix_notes
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_notes_datos_idx
		ON matrix_notes USING gin (datos jsonb_path_ops);
		-- Index: matrix_notes_id_idx

		-- DROP INDEX IF EXISTS matrix_notes_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_notes_id_idx
		ON matrix_notes USING btree (id ASC NULLS FIRST);
		-- Index: matrix_notes_id_idx1

		-- DROP INDEX IF EXISTS matrix_notes_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_notes_id_idx1
		ON matrix_notes USING btree (id DESC NULLS LAST);
		-- Index: matrix_notes_relations_idx

		-- DROP INDEX IF EXISTS matrix_notes_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_notes_relations_idx
		ON matrix_notes USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_notes_section_id_idx

		-- DROP INDEX IF EXISTS matrix_notes_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_notes_section_id_idx
		ON matrix_notes USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_notes_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_notes_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_notes_section_tipo_idx
		ON matrix_notes USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_profiles
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_profiles_datos_ginON matrix_profiles USING gin (datos jsonb_path_ops);
		-- Index: matrix_profiles_relations_idx

		-- DROP INDEX IF EXISTS matrix_profiles_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_profiles_relations_idx
		ON matrix_profiles USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_profiles_section_id

		-- DROP INDEX IF EXISTS matrix_profiles_section_id;

		CREATE INDEX IF NOT EXISTS matrix_profiles_section_id
		ON matrix_profiles USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_profiles_section_tipo

		-- DROP INDEX IF EXISTS matrix_profiles_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_profiles_section_tipo
		ON matrix_profiles USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_profiles_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_profiles_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_profiles_section_tipo_section_id
		ON matrix_profiles USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_projects
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_projects_datos_ginON matrix_projects USING gin (datos jsonb_path_ops);
		-- Index: matrix_projects_relations_idx

		-- DROP INDEX IF EXISTS matrix_projects_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_projects_relations_idx
		ON matrix_projects USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_projects_section_id

		-- DROP INDEX IF EXISTS matrix_projects_section_id;

		CREATE INDEX IF NOT EXISTS matrix_projects_section_id
		ON matrix_projects USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_projects_section_tipo

		-- DROP INDEX IF EXISTS matrix_projects_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_projects_section_tipo
		ON matrix_projects USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_projects_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_projects_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_projects_section_tipo_section_id
		ON matrix_projects USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_stats
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_stats_datos_idx
		ON matrix_stats USING gin (datos jsonb_path_ops);
		-- Index: matrix_stats_expr_idx

		-- DROP INDEX IF EXISTS matrix_stats_expr_idx;

		CREATE INDEX IF NOT EXISTS matrix_stats_expr_idx
		ON matrix_stats USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_stats_section_id_idx

		-- DROP INDEX IF EXISTS matrix_stats_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_stats_section_id_idx
		ON matrix_stats USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_stats_section_id_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_stats_section_id_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_stats_section_id_section_tipo_idx
		ON matrix_stats USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_stats_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_stats_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_stats_section_tipo_idx
		ON matrix_stats USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_test
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_test_datos_idx
		ON matrix_test USING gin (datos jsonb_path_ops);
		-- Index: matrix_test_id_idx

		-- DROP INDEX IF EXISTS matrix_test_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_test_id_idx
		ON matrix_test USING btree (id ASC NULLS FIRST);
		-- Index: matrix_test_id_idx1

		-- DROP INDEX IF EXISTS matrix_test_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_test_id_idx1
		ON matrix_test USING btree (id DESC NULLS LAST);
		-- Index: matrix_test_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS matrix_test_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_fct_st_si
		ON matrix_test USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);
		-- Index: matrix_test_relations_flat_st_si

		-- DROP INDEX IF EXISTS matrix_test_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_st_si
		ON matrix_test USING gin (relations_flat_st_si(datos) jsonb_path_ops);
		-- Index: matrix_test_relations_flat_ty_st

		-- DROP INDEX IF EXISTS matrix_test_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_ty_st
		ON matrix_test USING gin (relations_flat_ty_st(datos) jsonb_path_ops);
		-- Index: matrix_test_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS matrix_test_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_ty_st_si
		ON matrix_test USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
		-- Index: matrix_test_section_id_idx

		-- DROP INDEX IF EXISTS matrix_test_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_test_section_id_idx
		ON matrix_test USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_test_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_test_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_test_section_tipo_idx
		ON matrix_test USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_test_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_test_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_test_section_tipo_section_id
		ON matrix_test USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// matrix_time_machine
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_time_machine_datos_ginON matrix_time_machine USING gin (dato jsonb_path_ops);
		-- Index: matrix_time_machine_bulk_process_id

		DROP INDEX IF EXISTS matrix_time_machine_id_matrix;

		-- DROP INDEX IF EXISTS matrix_time_machine_bulk_process_id;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_bulk_process_id
		ON matrix_time_machine USING btree (bulk_process_id ASC NULLS LAST);
		-- Index: matrix_time_machine_lang

		-- DROP INDEX IF EXISTS matrix_time_machine_lang;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_lang
		ON matrix_time_machine USING btree (lang COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_time_machine_section_id

		-- DROP INDEX IF EXISTS matrix_time_machine_section_id;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_section_id
		ON matrix_time_machine USING btree (section_id DESC NULLS LAST);
		-- Index: matrix_time_machine_section_id_key

		-- DROP INDEX IF EXISTS matrix_time_machine_section_id_key;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_section_id_key
		ON matrix_time_machine USING btree (section_id ASC NULLS LAST, section_id_key ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, tipo COLLATE pg_catalog."default" ASC NULLS LAST, lang COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_time_machine_section_tipo

		-- DROP INDEX IF EXISTS matrix_time_machine_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_section_tipo
		ON matrix_time_machine USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_time_machine_state

		-- DROP INDEX IF EXISTS matrix_time_machine_state;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_state
		ON matrix_time_machine USING btree (state COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_time_machine_timestamp

		-- DROP INDEX IF EXISTS matrix_time_machine_timestamp;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_timestamp
		ON matrix_time_machine USING btree ("timestamp" DESC NULLS LAST);
		-- Index: matrix_time_machine_tipo

		-- DROP INDEX IF EXISTS matrix_time_machine_tipo;

		CREATE INDEX IF NOT EXISTS matrix_time_machine_tipo
		ON matrix_time_machine USING btree (tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_time_machine_userID

		-- DROP INDEX IF EXISTS "matrix_time_machine_userID";

		CREATE INDEX IF NOT EXISTS "matrix_time_machine_userID"
		ON matrix_time_machine USING btree ("userID" ASC NULLS LAST);
	';

// matrix_tools
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_tools_datos_idx
		ON matrix_tools USING gin (datos jsonb_path_ops);
		-- Index: matrix_tools_id_idx

		-- DROP INDEX IF EXISTS matrix_tools_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_tools_id_idx
		ON matrix_tools USING btree (id ASC NULLS FIRST);
		-- Index: matrix_tools_section_id_idx

		-- DROP INDEX IF EXISTS matrix_tools_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_tools_section_id_idx
		ON matrix_tools USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_tools_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_tools_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_tools_section_tipo_idx
		ON matrix_tools USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_tools_section_tipo_section_id_idx

		-- DROP INDEX IF EXISTS matrix_tools_section_tipo_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_tools_section_tipo_section_id_idx
		ON matrix_tools USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST);
	';

// matrix_users
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_users_datos_ginON matrix_users USING gin (datos jsonb_path_ops);
		-- Index: matrix_users_relations_idx

		-- DROP INDEX IF EXISTS matrix_users_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_users_relations_idx
		ON matrix_users USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_users_section_id

		-- DROP INDEX IF EXISTS matrix_users_section_id;

		CREATE INDEX IF NOT EXISTS matrix_users_section_id
		ON matrix_users USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_users_section_tipo

		-- DROP INDEX IF EXISTS matrix_users_section_tipo;

		CREATE INDEX IF NOT EXISTS matrix_users_section_tipo
		ON matrix_users USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_users_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_users_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_users_section_tipo_section_id
		ON matrix_users USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
	';

// relations
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS relations_from_component_tipo
		ON relations USING btree (from_component_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: relations_section_id

		-- DROP INDEX IF EXISTS relations_section_id;

		CREATE INDEX IF NOT EXISTS relations_section_id
		ON relations USING btree (section_id ASC NULLS LAST);
		-- Index: relations_section_tipo

		-- DROP INDEX IF EXISTS relations_section_tipo;

		CREATE INDEX IF NOT EXISTS relations_section_tipo
		ON relations USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: relations_section_tipo_section_id

		-- DROP INDEX IF EXISTS relations_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS relations_section_tipo_section_id
		ON relations USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id ASC NULLS LAST);
		-- Index: relations_target_section_id

		-- DROP INDEX IF EXISTS relations_target_section_id;

		CREATE INDEX IF NOT EXISTS relations_target_section_id
		ON relations USING btree (target_section_id ASC NULLS LAST);
		-- Index: relations_target_section_id_section_id

		-- DROP INDEX IF EXISTS relations_target_section_id_section_id;

		CREATE INDEX IF NOT EXISTS relations_target_section_id_section_id
		ON relations USING btree (target_section_id ASC NULLS LAST, section_id ASC NULLS LAST);
		-- Index: relations_target_section_tipo

		-- DROP INDEX IF EXISTS relations_target_section_tipo;

		CREATE INDEX IF NOT EXISTS relations_target_section_tipo
		ON relations USING btree (target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: relations_target_section_tipo_section_tipo

		-- DROP INDEX IF EXISTS relations_target_section_tipo_section_tipo;

		CREATE INDEX IF NOT EXISTS relations_target_section_tipo_section_tipo
		ON relations USING btree (target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: relations_target_section_tipo_target_section_id

		-- DROP INDEX IF EXISTS relations_target_section_tipo_target_section_id;

		CREATE INDEX IF NOT EXISTS relations_target_section_tipo_target_section_id
		ON relations USING btree (target_section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, target_section_id ASC NULLS LAST);
	';

// matrix_ontology
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_ontology_datos_idx
		ON matrix_ontology USING gin (datos jsonb_path_ops);
		-- Index: matrix_ontology_id_idx

		-- DROP INDEX IF EXISTS matrix_ontology_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_id_idx
		ON matrix_ontology USING btree (id ASC NULLS FIRST);
		-- Index: matrix_ontology_id_idx1

		-- DROP INDEX IF EXISTS matrix_ontology_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_ontology_id_idx1
		ON matrix_ontology USING btree (id DESC NULLS LAST);
		-- Index: matrix_ontology_relations_flat_fct_st_si

		-- DROP INDEX IF EXISTS matrix_ontology_relations_flat_fct_st_si;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_fct_st_si
		ON matrix_ontology USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);
		-- Index: matrix_ontology_relations_flat_st_si

		-- DROP INDEX IF EXISTS matrix_ontology_relations_flat_st_si;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_st_si
		ON matrix_ontology USING gin (relations_flat_st_si(datos) jsonb_path_ops);
		-- Index: matrix_ontology_relations_flat_ty_st

		-- DROP INDEX IF EXISTS matrix_ontology_relations_flat_ty_st;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_ty_st
		ON matrix_ontology USING gin (relations_flat_ty_st(datos) jsonb_path_ops);
		-- Index: matrix_ontology_relations_flat_ty_st_si

		-- DROP INDEX IF EXISTS matrix_ontology_relations_flat_ty_st_si;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_ty_st_si
		ON matrix_ontology USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
		-- Index: matrix_ontology_relations_idx

		-- DROP INDEX IF EXISTS matrix_ontology_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_relations_idx
		ON matrix_ontology USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_ontology_section_id_idx

		-- DROP INDEX IF EXISTS matrix_ontology_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_section_id_idx
		ON matrix_ontology USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_ontology_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_ontology_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_section_tipo_idx
		ON matrix_ontology USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_ontology_section_tipo_section_id

		-- DROP INDEX IF EXISTS matrix_ontology_section_tipo_section_id;

		CREATE INDEX IF NOT EXISTS matrix_ontology_section_tipo_section_id
		ON matrix_ontology USING btree (section_id ASC NULLS LAST, section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);
		-- Index: matrix_ontology_section_tipo_section_id_desc

		-- DROP INDEX IF EXISTS matrix_ontology_section_tipo_section_id_desc;

		CREATE INDEX IF NOT EXISTS matrix_ontology_section_tipo_section_id_desc
		ON matrix_ontology USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST, section_id DESC NULLS FIRST);
		-- Index: matrix_ontology_term

		-- DROP INDEX IF EXISTS matrix_ontology_term;

		CREATE INDEX IF NOT EXISTS matrix_ontology_term
		ON matrix_ontology USING gin (f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops);
	';

// matrix_ontology_main
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_ontology_main_datos_idx
		ON matrix_ontology_main USING gin (datos jsonb_path_ops);
		-- Index: matrix_ontology_main_id_idx

		-- DROP INDEX IF EXISTS matrix_ontology_main_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_id_idx
		ON matrix_ontology_main USING btree (id ASC NULLS FIRST);
		-- Index: matrix_ontology_main_id_idx1

		-- DROP INDEX IF EXISTS matrix_ontology_main_id_idx1;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_id_idx1
		ON matrix_ontology_main USING btree (id DESC NULLS LAST);
		-- Index: matrix_ontology_main_relations_idx

		-- DROP INDEX IF EXISTS matrix_ontology_main_relations_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_idx
		ON matrix_ontology_main USING gin ((datos #> \'{relations}\'::text[]) jsonb_path_ops);
		-- Index: matrix_ontology_main_section_id_idx

		-- DROP INDEX IF EXISTS matrix_ontology_main_section_id_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_section_id_idx
		ON matrix_ontology_main USING btree (section_id ASC NULLS LAST);
		-- Index: matrix_ontology_main_section_tipo_idx

		-- DROP INDEX IF EXISTS matrix_ontology_main_section_tipo_idx;

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_section_tipo_idx
		ON matrix_ontology_main USING btree (section_tipo COLLATE pg_catalog."default" ASC NULLS LAST);

		-- relations_flat
		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_flat_fct_st_si
		ON matrix_ontology_main USING gin (relations_flat_fct_st_si(datos) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_flat_st_si
		ON matrix_ontology_main USING gin (relations_flat_st_si(datos) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_flat_ty_st
		ON matrix_ontology_main USING gin (relations_flat_ty_st(datos) jsonb_path_ops);

		CREATE INDEX IF NOT EXISTS matrix_ontology_main_relations_flat_ty_st_si
		ON matrix_ontology_main USING gin (relations_flat_ty_st_si(datos) jsonb_path_ops);
	';

// People special indexes (name [rsc85], surname [rsc86])
	$ar_sql_query[] = '
		CREATE INDEX IF NOT EXISTS matrix_rsc85_gin ON matrix USING gin (f_unaccent(datos#>>\'{components, rsc85, dato}\') gin_trgm_ops);
		CREATE INDEX IF NOT EXISTS matrix_rsc86_gin ON matrix USING gin (f_unaccent(datos#>>\'{components, rsc86, dato}\') gin_trgm_ops);
	';

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
