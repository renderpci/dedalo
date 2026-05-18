<?php declare(strict_types=1);
/**
 * DB_PG_DEFINITIONS
 *
 * PostgreSQL database definitions for Dédalo system including extensions, functions,
 * constraints, indexes and maintenance operations.
 *
 * Each definition uses a common object structure:
 *   - tables (array, optional): Target tables for the operation
 *   - add (string, mandatory): SQL to create or add the functionality
 *   - drop (string, mandatory): SQL to remove the functionality
 *   - sample (string, optional): Example SQL to test the functionality
 *   - name (string, mandatory): Unique identifier for the definition
 *   - info (string, mandatory): Description of purpose and usage
 *   - add_disabled (string, optional): SQL for disabled/optional indexes
 *
 * @package Dedalo
 * @subpackage Core
 * @version 7.0
 *
 * @return array Returns associative array with keys:
 *               - ar_extensions: SQL statements for PostgreSQL extensions
 *               - ar_function: Function definitions with create/drop SQL
 *               - ar_constraint: Constraint definitions for table columns
 *               - ar_index: Index definitions for performance optimization
 *               - ar_maintenance: SQL statements for database maintenance
 */

// ── Table Groups ────────────────────────────────────────────────────────────────

$TABLES_MATRIX_ALL = [
	'matrix', 'matrix_activities', 'matrix_activity',
	'matrix_activity_diffusion', 'matrix_dataframe', 'matrix_dd',
	'matrix_hierarchy', 'matrix_hierarchy_main', 'matrix_indexations',
	'matrix_langs', 'matrix_layout', 'matrix_layout_dd',
	'matrix_list', 'matrix_nexus', 'matrix_nexus_main',
	'matrix_notes', 'matrix_ontology', 'matrix_ontology_main',
	'matrix_profiles', 'matrix_projects', 'matrix_stats',
	'matrix_test', 'matrix_tools', 'matrix_users'
];

$TABLES_MATRIX_NO_ACTIVITY = array_values(
	array_filter($TABLES_MATRIX_ALL, fn($t) => $t !== 'matrix_activity')
);

$TABLES_MATRIX_PLUS_TM = [...$TABLES_MATRIX_ALL, 'matrix_time_machine'];

// ── Helper Functions ───────────────────────────────────────────────────────────

$make_gin_index = function(string $column, array $tables, string $sample, string $info) : object {
	return (object)[
		'tables' => $tables,
		'add'    => "CREATE INDEX IF NOT EXISTS {\$table}_{$column}_gin_idx ON {\$table} USING gin ({$column} jsonb_path_ops);",
		'drop'   => "DROP INDEX IF EXISTS {\$table}_{$column}_gin_idx",
		'sample' => $sample,
		'name'   => "all_matrix_{$column}_gin_idx",
		'info'   => $info
	];
};

$make_flat_rel_index = function(string $func, string $suffix, array $tables, string $sample_val, string $info) : object {
	return (object)[
		'tables' => $tables,
		'add'    => "CREATE INDEX IF NOT EXISTS {\$table}_relation_flat_{$suffix}_gin_idx ON {\$table} USING gin ({$func}(relation) jsonb_path_ops);",
		'drop'   => "DROP INDEX IF EXISTS {\$table}_relation_flat_{$suffix}_gin_idx",
		'sample' => "SELECT * FROM matrix WHERE {$func}(relation) @> '[\"{$sample_val}\"]'::jsonb LIMIT 10",
		'name'   => "all_matrix_relation_flat_{$suffix}_gin_idx",
		'info'   => $info
	];
};

// ── Extensions ─────────────────────────────────────────────────────────────────

$ar_extensions = [];
$ar_extensions[] = 'CREATE EXTENSION IF NOT EXISTS pg_trgm;';
$ar_extensions[] = 'CREATE EXTENSION IF NOT EXISTS unaccent;';

// ── Functions ───────────────────────────────────────────────────────────────────

$ar_function = [];

$ar_function[] = (object)[
	'add' => '
		CREATE OR REPLACE FUNCTION f_unaccent(text)
		RETURNS text LANGUAGE \'sql\' COST 100 IMMUTABLE PARALLEL UNSAFE
		AS $BODY$ SELECT unaccent(\'unaccent\', $1) $BODY$;
	',
	'drop' => 'DROP FUNCTION IF EXISTS f_unaccent',
	'sample' => "SELECT * FROM matrix WHERE f_unaccent(jsonb_path_query_array(string, '\$.*[*]')->>value) = f_unaccent('Ripolles') ORDER BY section_id ASC LIMIT 10",
	'name' => 'f_unaccent',
	'info' => 'Used to remove accents from a text string. Useful for case-insensitive and accent-insensitive searches.'
];

$ar_function[] = (object)[
	'add' => '
		CREATE OR REPLACE FUNCTION data_relations_flat_st_si(data jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
		SELECT jsonb_agg(section_tipo || \'_\' || section_id)
		FROM (SELECT rel->>\'section_tipo\' as section_tipo, rel->>\'section_id\' as section_id
			FROM jsonb_each(data) as component_data, jsonb_array_elements(component_data.value) as rel) t $$;
	',
	'drop' => 'DROP FUNCTION IF EXISTS data_relations_flat_st_si CASCADE',
	'sample' => "SELECT * FROM matrix WHERE data_relations_flat_st_si(relation) @> '[\"oh1_3\"]' ORDER BY section_id ASC LIMIT 10",
	'name' => 'data_relations_flat_st_si',
	'info' => 'Aggregates relation section_tipo and section_id into a flat string format (e.g., oh1_3) for easier indexing and searching.'
];

$ar_function[] = (object)[
	'add' => '
		CREATE OR REPLACE FUNCTION data_relations_flat_fct_st_si(data jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
		SELECT jsonb_agg(from_component_tipo || \'_\' || section_tipo || \'_\' || section_id)
		FROM (SELECT component_data.key as from_component_tipo, rel->>\'section_tipo\' as section_tipo, rel->>\'section_id\' as section_id
			FROM jsonb_each(data) as component_data, jsonb_array_elements(component_data.value) as rel) t $$;
	',
	'drop' => 'DROP FUNCTION IF EXISTS data_relations_flat_fct_st_si CASCADE',
	'sample' => "SELECT * FROM matrix WHERE data_relations_flat_fct_st_si(relation) @> '[\"oh25_oh1_3\"]' ORDER BY section_id ASC LIMIT 10",
	'name' => 'data_relations_flat_fct_st_si',
	'info' => 'Aggregates relation from_component_tipo, section_tipo and section_id into a flat string format (e.g., oh25_oh1_3) for easier indexing and searching.'
];

$ar_function[] = (object)[
	'add' => '
		CREATE OR REPLACE FUNCTION data_relations_flat_ty_st_si(data jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
		SELECT jsonb_agg(type || \'_\' || section_tipo || \'_\' || section_id)
		FROM (SELECT rel->>\'type\' as type, rel->>\'section_tipo\' as section_tipo, rel->>\'section_id\' as section_id
			FROM jsonb_each(data) as component_data, jsonb_array_elements(component_data.value) as rel) t $$;
	',
	'drop' => 'DROP FUNCTION IF EXISTS data_relations_flat_ty_st_si CASCADE',
	'sample' => "SELECT * FROM matrix WHERE data_relations_flat_ty_st_si(relation) @> '[\"dd151_oh1_3\"]' ORDER BY section_id ASC LIMIT 10",
	'name' => 'data_relations_flat_ty_st_si',
	'info' => 'Aggregates relation type, section_tipo and section_id into a flat string format (e.g., dd151_oh1_3) for easier indexing and searching.'
];

$ar_function[] = (object)[
	'add' => '
		CREATE OR REPLACE FUNCTION data_relations_flat_ty_st(data jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
		SELECT jsonb_agg(type || \'_\' || section_tipo)
		FROM (SELECT rel->>\'type\' as type, rel->>\'section_tipo\' as section_tipo
			FROM jsonb_each(data) as component_data, jsonb_array_elements(component_data.value) as rel) t $$;
	',
	'drop' => 'DROP FUNCTION IF EXISTS data_relations_flat_ty_st CASCADE',
	'sample' => "SELECT * FROM matrix WHERE data_relations_flat_ty_st(relation) @> '[\"dd151_oh1\"]' ORDER BY section_id ASC LIMIT 10",
	'name' => 'data_relations_flat_ty_st',
	'info' => 'Aggregates relation type and section_tipo into a flat string format (e.g., dd151_oh1) for easier indexing and searching.'
];

// check_array_component — legacy v6, kept for drop compatibility
$ar_function[] = (object)[
	'add'    => '',
	'drop'   => 'DROP FUNCTION IF EXISTS check_array_component',
	'sample' => '-- Not used anymore (v6)',
	'name'   => 'check_array_component',
	'info'   => 'Not used anymore (v6)'
];

$ar_function[] = (object)[
	'add' => "
		CREATE OR REPLACE FUNCTION jsonb_values_as_text(j jsonb)
		RETURNS text LANGUAGE sql IMMUTABLE STRICT AS \$\$
			SELECT string_agg(value, ' ')
			FROM jsonb_each_text(j)
		\$\$;
	",
	'drop' => 'DROP FUNCTION IF EXISTS jsonb_values_as_text CASCADE',
	'sample' => "SELECT tipo, term, jsonb_values_as_text(term) AS values_text FROM dd_ontology WHERE term IS NOT NULL LIMIT 5",
	'name' => 'jsonb_values_as_text',
	'info' => 'Aggregates all JSONB leaf values of the term column into a single searchable text string. Used by the ontology fuzzy search (similarity + trigram) to match human-readable text across all language keys.'
];

// ── Constraints ────────────────────────────────────────────────────────────────

$ar_constraint = [];

$ar_constraint[] = (object)[
	'tables' => $TABLES_MATRIX_ALL,
	'add' => 'ALTER TABLE IF EXISTS {$table} ADD CONSTRAINT {$table}_section_id_section_tipo_key UNIQUE (section_id, section_tipo);',
	'drop' => 'ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$table}_section_id_section_tipo_key',
	'sample' => "INSERT INTO \"matrix_projects\" (section_id, section_tipo) VALUES (1, 'dd153')",
	'name' => 'all_matrix_constraint_section_id_section_tipo_key',
	'info' => 'Used to avoid duplicated records, it is not possible to store the same section_id with the same section_tipo'
];

$ar_constraint[] = (object)[
	'tables' => ['dd_ontology', 'matrix_counter', 'matrix_counter_dd'],
	'add' => 'ALTER TABLE IF EXISTS {$table} ADD CONSTRAINT {$table}_tipo_key UNIQUE (tipo);',
	'drop' => '
		ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$table}_tipo_key;
		ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$table}_tipo_pkey;
		DROP INDEX IF EXISTS {$table}_tipo_key;
		DROP INDEX IF EXISTS {$table}_tipo_idx;
	',
	'sample' => "INSERT INTO \"dd_ontology\" (tipo) VALUES ('dd1')",
	'name' => 'dd_ontology_constraint_tipo_key',
	'info' => 'Used to avoid duplicated records, it is not possible to store the same tipo'
];

// ── Indexes ────────────────────────────────────────────────────────────────────

$ar_index = [];

// ── Ontology (dd_ontology) ─────────────────────────────────────────────────────

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_is_model_idx ON {$table} USING btree (is_model ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_is_model_idx',
	'sample' => 'SELECT * FROM dd_ontology WHERE is_model = 1 LIMIT 1',
	'name'   => 'dd_ontology_is_model_idx',
	'info'   => 'Used to search if the term is a descriptor or not, possible values: 1|2. 1 = yes, 2 = no'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_model_idx ON {$table} USING btree (model COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_model_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE model = 'section' LIMIT 1",
	'name'   => 'dd_ontology_model_idx',
	'info'   => 'Used to search if the descriptor model'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_model_tipo_idx ON {$table} USING btree (model_tipo COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_model_tipo_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE model_tipo = 'dd6' LIMIT 1",
	'name'   => 'dd_ontology_model_tipo_idx',
	'info'   => 'Used to search for the descriptor model_tipo'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_order_number_idx ON {$table} USING btree (order_number ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_order_number_idx',
	'sample' => 'SELECT * FROM dd_ontology WHERE order_number = 2 LIMIT 1',
	'name'   => 'dd_ontology_order_number_idx',
	'info'   => 'Used to search for the descriptor order_number'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_parent_idx ON {$table} USING btree (parent ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_parent_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE parent = 'tch1' LIMIT 1",
	'name'   => 'dd_ontology_parent_idx',
	'info'   => 'Used to search for the descriptor parent'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology', 'main_dd'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_tld_idx ON {$table} USING btree (tld COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_tld_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE tld = 'tch' LIMIT 1",
	'name'   => 'dd_ontology_tld_idx',
	'info'   => 'Used to search for the descriptor tld'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_relations_idx ON {$table} USING gin (relations);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_relations_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE relations @> ARRAY['tch'] LIMIT 1",
	'name'   => 'dd_ontology_relations_idx',
	'info'   => 'Used to search for descriptor relations'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_is_translatable_idx ON {$table} USING btree (is_translatable ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_is_translatable_idx',
	'sample' => 'SELECT * FROM dd_ontology WHERE is_translatable = true LIMIT 1',
	'name'   => 'dd_ontology_is_translatable_idx',
	'info'   => 'Used to search if the term is translatable or not, boolean values: true | false'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_is_main_idx ON {$table} USING btree (is_main ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_is_main_idx',
	'sample' => 'SELECT * FROM dd_ontology WHERE is_main = true LIMIT 1',
	'name'   => 'dd_ontology_is_main_idx',
	'info'   => 'Used to search if the node is a main/root node (tipo = tld + 0), boolean values: true | false'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_parent_order_number_idx ON {$table} USING btree (parent COLLATE pg_catalog.default ASC NULLS LAST, order_number ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_parent_order_number_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE parent = 'tch1' ORDER BY order_number LIMIT 1",
	'name'   => 'dd_ontology_parent_order_number_idx',
	'info'   => 'Used to search descriptors by parent and order_number'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_term_jsonpath_idx ON {$table} USING gin (term jsonb_path_ops);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_term_jsonpath_idx',
	'sample' => "SELECT tipo FROM dd_ontology WHERE term @? '$.* ? (@ like_regex \"oral\" flag \"i\")' LIMIT 5",
	'name'   => 'dd_ontology_term_jsonpath_idx',
	'info'   => 'GIN index on dd_ontology.term using jsonb_path_ops. Powers the JSONPath @? pre-filter phase of fuzzy ontology search, enabling fast regex-like matching across all language keys.'
];

$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_term_trgm_values_idx ON {$table} USING gin (jsonb_values_as_text(term) gin_trgm_ops);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_term_trgm_values_idx',
	'sample' => "SELECT tipo, similarity(jsonb_values_as_text(term), 'oral') AS score FROM dd_ontology WHERE jsonb_values_as_text(term) % 'oral' ORDER BY score DESC LIMIT 5",
	'name'   => 'dd_ontology_term_trgm_values_idx',
	'info'   => 'Trigram GIN index on jsonb_values_as_text(term). Powers the similarity/fuzzy search in dd_ontology_db_manager::search_fuzzy_term(), using the % operator for fast pre-filtering and similarity() for ranking.'
];

// ── General (btree on matrix tables) ────────────────────────────────────────────

$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_NO_ACTIVITY,
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_section_id_idx ON {$table} USING btree (section_id ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_section_id_idx',
	'sample' => 'SELECT * FROM matrix WHERE section_id = 5 LIMIT 10',
	'name'   => 'all_matrix_section_id_idx',
	'info'   => 'Used to search by section_id ordered ascendant.'
];

// Is not necessary. x_section_id_idx works backwards
// $ar_index[] = (object)[
// 	'tables' => ['matrix_activity', 'matrix_time_machine'],
// 	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_section_id_desc_idx ON {$table} USING btree (section_id DESC NULLS LAST);',
// 	'drop'   => 'DROP INDEX IF EXISTS {$table}_section_id_desc_idx',
// 	'sample' => 'SELECT * FROM matrix WHERE section_id = 5 LIMIT 10',
// 	'name'   => 'all_matrix_section_id_desc_idx',
// 	'info'   => 'Used to search by section_id ordered descendant.'
// ];

$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_NO_ACTIVITY,
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_section_tipo_idx ON {$table} USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_section_tipo_idx',
	'sample' => "SELECT * FROM matrix WHERE section_tipo = 'oh1' LIMIT 10",
	'name'   => 'all_matrix_section_tipo_idx',
	'info'   => 'Used to search by section_tipo ordered ascendant.'
];

$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_PLUS_TM,
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_section_tipo_section_id_desc_idx ON {$table} USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST, section_id DESC NULLS FIRST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_section_tipo_section_id_desc_idx',
	'sample' => "SELECT * FROM matrix WHERE section_id = 5 AND section_tipo = 'rsc197' LIMIT 10",
	'name'   => 'all_matrix_section_tipo_section_id_desc_idx',
	'info'   => 'Used to search by section_tipo ordered descendant by section_id.'
];

// ── JSONB columns (GIN) ───────────────────────────────────────────────────────

$ar_index[] = $make_gin_index('string',  $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE string @> '{\"rsc85\":[{\"value\":\"Pere\"}]}' LIMIT 10", 'Used to search string literals as full components data');
$ar_index[] = $make_gin_index('date',    $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE date @> '[{\"time\":57958546}]' LIMIT 10", 'Used to search dates by any property.');
$ar_index[] = $make_gin_index('iri',     $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE iri @> '[{\"iri\":\"https://dedalo.dev\"}]' LIMIT 10", 'Used to search IRI data by any of its properties, iri or title.');
$ar_index[] = $make_gin_index('geo',     $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE jsonb_path_query_array(geo, '\$.*[*]') @> '[{\"lat\":\"39.462571\"}]' LIMIT 10", 'Used to search geolocation data by any of its properties: lat, lng or alt.');
$ar_index[] = $make_gin_index('number',  $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE jsonb_path_query_array(number, '\$.*[*].value') @> '[5]' LIMIT 10", 'Used to search number data values.');
$ar_index[] = $make_gin_index('media',   $TABLES_MATRIX_NO_ACTIVITY, "SELECT * FROM matrix WHERE jsonb_path_query_array(media, '\$.*[*]') @> '[{\"original_file_name\":\"my_image.png\"}]' LIMIT 10", 'Used to search media data by any of its properties, original_file_name, or others.');
$ar_index[] = $make_gin_index('misc',    $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE jsonb_path_query_array(misc, '\$.*[*].value') @> '[{\"section_tipo\":\"lg-spa\"}]' LIMIT 10", 'Used to search miscellaneous data by any of its properties.');
$ar_index[] = $make_gin_index('relation_search', $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE relation_search @> '[{\"section_tipo\":\"es1\"}]' LIMIT 10", 'Used to search relation all children data with specific parent. Give me all data indexed with a child using any of its parents.');

// relation — by component (full JSONB structure)
$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_ALL,
	'add'    => "CREATE INDEX IF NOT EXISTS {\$table}_relation_gin_idx ON {\$table} USING gin (relation jsonb_path_ops);",
	'drop'   => 'DROP INDEX IF EXISTS {$table}_relation_gin_idx',
	'sample' => "SELECT * FROM matrix WHERE relation @> '{\"rsc91\":[{\"section_tipo\":\"es1\"}]}' LIMIT 10",
	'name'   => 'all_matrix_relation_gin_idx',
	'info'   => 'Used to search relations as components data'
];

// relation — locators without component (extracted locators)
$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_ALL,
	'add'    => "CREATE INDEX IF NOT EXISTS {\$table}_relation_locators_gin_idx ON {\$table} USING gin (jsonb_path_query_array(relation, '\$.*[*]') jsonb_path_ops);",
	'drop'   => 'DROP INDEX IF EXISTS {$table}_relation_locators_gin_idx',
	'sample' => "SELECT * FROM matrix WHERE jsonb_path_query_array(relation, '\$.*[*]') @> '[{\"section_tipo\":\"es1\"}]' LIMIT 10",
	'name'   => 'all_matrix_relation_locators_gin_idx',
	'info'   => 'Used to search relations across all components data'
];

// ── Flat-relation indexes (GIN on function) ─────────────────────────────────────

$ar_index[] = $make_flat_rel_index('data_relations_flat_st_si',     'st_si',     $TABLES_MATRIX_ALL, 'dd64_1',      'Used to search relations across all components data with a flat text of the relation such as es1_65');
$ar_index[] = $make_flat_rel_index('data_relations_flat_fct_st_si', 'fct_st_si', $TABLES_MATRIX_ALL, 'oh33_dd64_1', 'Used to search relations across all components data with a flat text of the relation such as oh33_dd64_1');
$ar_index[] = $make_flat_rel_index('data_relations_flat_ty_st',     'ty_st',     $TABLES_MATRIX_ALL, 'dd151_dd64',  'Used to search relations across all components data with a flat text of the relation such as dd151_dd64');
$ar_index[] = $make_flat_rel_index('data_relations_flat_ty_st_si',  'ty_st_si',  $TABLES_MATRIX_ALL, 'dd151_dd64_1','Used to search relations across all components data with a flat text of the relation such as dd151_dd64_1');

// ── Table-specific indexes ─────────────────────────────────────────────────────

// matrix_activity_diffusion — id DESC (disabled). This index is disabled by default to save space and improve write performance
$ar_index[] = (object)[
	'tables'       => ['matrix_activity_diffusion'],
	'add'          => '',
	'add_disabled' => 'CREATE INDEX IF NOT EXISTS {$table}_id_desc_idx ON {$table} USING btree (id DESC NULLS LAST);',
	'drop'         => 'DROP INDEX IF EXISTS {$table}_id_desc_idx',
	'sample'       => 'SELECT * FROM matrix_activity WHERE id = 5 LIMIT 10',
	'name'         => 'matrix_activity_id_desc_idx',
	'info'         => 'Used to search by id ordered descendant.'
];

// matrix_activity — id ASC (disabled). This index is disabled by default to save space and improve write performance
$ar_index[] = (object)[
	'tables'       => ['matrix_activity'],
	'add'          => '',
	'add_disabled' => 'CREATE INDEX IF NOT EXISTS {$table}_id_asc_idx ON {$table} USING btree (id ASC); ANALYZE {$table};',
	'drop'         => 'DROP INDEX IF EXISTS "{$table}_id_asc_idx"',
	'sample'       => 'SELECT * FROM matrix_activity ORDER BY id ASC LIMIT 10',
	'name'         => 'matrix_activity_id_asc_idx',
	'info'         => 'Used to search by id ordered ascendant. Used by diffusion_section_stats:update_user_activity_stats'
];

// matrix_activity — timestamp + id
$ar_index[] = (object)[
	'tables'       => ['matrix_activity'],
	'add'          => 'CREATE INDEX IF NOT EXISTS {$table}_timestamp_composite_idx ON {$table} ("timestamp", id) INCLUDE (section_tipo, section_id);',
	'drop'         => 'DROP INDEX IF EXISTS "{$table}_timestamp_composite_idx"',
	'sample'       => 'SELECT * FROM matrix_activity WHERE ("timestamp" >= \'2024-12-04\' AND "timestamp" < \'2024-12-05\') AND relation @> \'{"dd543":[{"section_tipo":"dd128","section_id":"1"}]}\'',
	'name'         => 'matrix_activity_timestamp_composite_idx',
	'info'         => 'Used to search by timestamp, ordered id ascendant. Used by diffusion_section_stats:get_interval_raw_activity_data'
];

// matrix_time_machine + matrix_activity — timestamp (BRIN)
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine', 'matrix_activity'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_timestamp_date_idx ON {$table} USING brin (DATE("timestamp"));',
	'drop'   => '
		DROP INDEX IF EXISTS {$table}_timestamp_idx; -- Intentional remove legacy index
		DROP INDEX IF EXISTS {$table}_timestamp_date_idx;
	',
	'sample' => "SELECT * FROM matrix_time_machine WHERE DATE(\"timestamp\") = '2025-08-18' LIMIT 1",
	'name'   => 'matrix_time_machine_timestamp_date_idx',
	'info'   => 'Used to search by date in time machine timestamp column.'
];

// matrix_time_machine — tipo + id DESC
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_tipo_idx ON {$table} USING btree (tipo, id DESC);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_tipo_idx',
	'sample' => "SELECT * FROM matrix_time_machine WHERE tipo = 'oh1' ORDER BY id DESC LIMIT 1",
	'name'   => 'matrix_time_machine_tipo_idx',
	'info'   => 'Used to search by tipo.'
];

// matrix_time_machine — section_tipo + id DESC
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_section_tipo_idx ON {$table} USING btree (section_tipo, id DESC);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_section_tipo_idx',
	'sample' => "SELECT * FROM matrix_time_machine AS dd15 WHERE dd15.section_tipo = 'oh1' ORDER BY id DESC LIMIT 30 OFFSET 60",
	'name'   => 'matrix_time_machine_section_tipo_idx',
	'info'   => 'Used to search by section_tipo in time machine.'
];

// matrix_time_machine — lang
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_lang_idx ON {$table} USING btree (lang COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_lang_idx',
	'sample' => "SELECT * FROM matrix_time_machine WHERE lang = 'lg-spa' LIMIT 1",
	'name'   => 'matrix_time_machine_lang_idx',
	'info'   => 'Used to search by lang.'
];

// matrix_time_machine — bulk_process_id
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_bulk_process_id_idx ON {$table} USING btree (bulk_process_id ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_bulk_process_id_idx',
	'sample' => 'SELECT * FROM matrix_time_machine WHERE bulk_process_id = 751 LIMIT 1',
	'name'   => 'matrix_time_machine_bulk_process_id_idx',
	'info'   => 'Used to search by bulk_process_id.'
];

// matrix_time_machine — user_id
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_user_id_idx ON {$table} USING btree ("user_id" ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_user_id_idx',
	'sample' => 'SELECT * FROM matrix_time_machine WHERE user_id = 2 LIMIT 1',
	'name'   => 'matrix_time_machine_user_id_idx',
	'info'   => 'Used to search by user_id.'
];

// matrix_time_machine — composite: section_id, bulk_process_id, section_tipo, tipo, lang
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_si_bulk_st_tipo_lang_idx ON {$table} USING btree (section_id ASC NULLS LAST, bulk_process_id ASC NULLS LAST, section_tipo COLLATE pg_catalog.default ASC NULLS LAST, tipo COLLATE pg_catalog.default ASC NULLS LAST, lang COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_si_bulk_st_tipo_lang_idx',
	'sample' => 'SELECT * FROM matrix_time_machine WHERE bulk_process_id = 751 LIMIT 1',
	'name'   => 'matrix_time_machine_si_bulk_st_tipo_lang_idx',
	'info'   => 'Used to search by bulk_process_id with all parameters, section_id, bulk_process_id, section_tipo, tipo and lang.'
];

// matrix_time_machine — search default: section_id, section_tipo, tipo, lang, timestamp DESC
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_search_default_idx ON "{$table}" (section_id, section_tipo, tipo, lang, "timestamp" DESC); ANALYZE {$table};',
	'drop'   => 'DROP INDEX IF EXISTS "{$table}_search_default_idx"',
	'sample' => "SELECT * FROM matrix_time_machine WHERE section_id = 1 AND section_tipo = 'oh1' ORDER BY timestamp DESC LIMIT 10",
	'name'   => 'matrix_time_machine_search_default_idx',
	'info'   => 'Used to search by default parameters: section_id, section_tipo, tipo, lang, timestamp DESC'
];

// matrix_langs — hierarchy41 value (lang code)
$ar_index[] = (object)[
	'tables' => ['matrix_langs'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_hierarchy41_value_idx ON "{$table}" ((string->\'hierarchy41\'->0->>\'value\')); ANALYZE {$table};',
	'drop'   => 'DROP INDEX IF EXISTS "{$table}_hierarchy41_value_idx"',
	'sample' => "SELECT * FROM matrix_langs WHERE (string->'hierarchy41'->0->>'value') = 'eng' LIMIT 10",
	'name'   => 'matrix_langs_hierarchy41_value_idx',
	'info'   => 'Used to search by hierarchy41 value (lang code) in matrix_langs'
];

// ── Maintenance ────────────────────────────────────────────────────────────────

$ar_maintenance = [];

$ar_maintenance[] = 'REINDEX TABLE matrix_dd;';
$ar_maintenance[] = 'VACUUM FULL VERBOSE ANALYZE matrix_dd;';
$ar_maintenance[] = 'VACUUM ANALYZE "matrix_hierarchy";';
$ar_maintenance[] = 'VACUUM ANALYZE "matrix";';
$ar_maintenance[] = 'VACUUM ANALYZE "matrix_activity";';


return [
	'ar_extensions'		=> $ar_extensions,
	'ar_function'		=> $ar_function,
	'ar_constraint'		=> $ar_constraint,
	'ar_index'			=> $ar_index,
	'ar_maintenance'	=> $ar_maintenance,
];
