<?php declare(strict_types=1);
/**
 * DB_PG_DEFINITIONS
 * Declarative catalogue of every PostgreSQL extension, stored function, unique constraint,
 * index, and maintenance query required by the Dédalo v7 database schema.
 *
 * This file is NOT included with require_once. It is loaded with plain include() each time a
 * db_tasks method runs (rebuild_indexes, rebuild_constraints, rebuild_functions, etc.), so that
 * the returned array reflects the definitions that are current at call time — no cached state.
 *
 * RETURN VALUE
 * Returns an associative array with five keys:
 *   - ar_extensions  (string[])  Plain SQL strings executed once with CREATE EXTENSION IF NOT EXISTS.
 *   - ar_function    (object[])  Stored-function definitions; each object has add/drop/sample/name/info.
 *   - ar_constraint  (object[])  Unique-constraint definitions; same shape as ar_function plus tables[].
 *   - ar_index       (object[])  Index definitions; same shape plus optional add_disabled.
 *   - ar_maintenance (string[])  Maintenance SQL (VACUUM, REINDEX) run in order.
 *
 * DEFINITION OBJECT SHAPE (ar_function / ar_constraint / ar_index)
 * Every entry is a stdClass with the following properties:
 *   - tables       (string[], optional)  Table names the definition applies to. When present,
 *                                        the caller iterates the array and substitutes {$table}
 *                                        in the SQL strings (see SQL TEMPLATE SYNTAX below).
 *   - add          (string, required)    SQL to create or register the object. Empty string ('')
 *                                        means "no active creation SQL" — see add_disabled.
 *   - drop         (string, required)    SQL to remove or replace the object (run before add).
 *   - sample       (string, optional)    Representative query for manual testing / documentation.
 *   - name         (string, required)    Unique machine-readable identifier for the definition.
 *   - info         (string, required)    Human-readable description of purpose and usage.
 *   - add_disabled (string, optional)    Alternative creation SQL that is NOT executed by the
 *                                        default rebuild flow; reserved for indexes that are
 *                                        disabled by default to save space or improve write
 *                                        performance. Must be activated explicitly.
 *
 * SQL TEMPLATE SYNTAX
 * SQL strings that target multiple tables use the literal placeholder {$table}.
 * db_tasks::parse_sql_sentence() performs a simple string substitution of {$table} with each
 * concrete table name at execution time. The curly-brace form prevents accidental PHP variable
 * interpolation in double-quoted strings — use single-quoted or heredoc SQL strings unless
 * intentional PHP interpolation is needed (e.g. embedding $column in $make_gin_index).
 *
 * RELATION COLUMN JSONB SCHEMA
 * The matrix family stores inter-record links in the `relation` JSONB column with this shape:
 *   {"<component_tipo>": [{"type": "<dd_tipo>", "section_tipo": "<st>", "section_id": "<id>"}, …]}
 * "Does this row link to X?" is answered by matrix_relation_index (typed per-locator
 * side table, created by create_relation_index_store at the end of the v6→v7 update).
 * The v6-era flat-relation functions that served this are removed (drop-only entries below).
 *
 * Consumed by: core/db/class.db_tasks.php (rebuild_indexes, rebuild_constraints,
 *              rebuild_functions, rebuild_extensions, run_maintenance),
 *              core/db/class.dd_ontology_db_manager.php (search_fuzzy_term prerequisites),
 *              core/api/v1/common/class.dd_ontology_api.php.
 *
 * @package Dédalo
 * @subpackage Core
 */

// ── Table Groups ────────────────────────────────────────────────────────────────
// These arrays are referenced as the `tables` property of index/constraint entries.
// They are defined once here so that adding a new matrix table automatically
// propagates to every definition that targets the full set.

/**
 * All standard matrix tables that store section/component data.
 * matrix_time_machine is intentionally excluded from ALL because time-machine rows
 * have different write patterns and composite indexes tailored separately below.
 * @var string[] $TABLES_MATRIX_ALL
 */
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

/**
 * Same as $TABLES_MATRIX_ALL but without matrix_activity.
 * Used for indexes where the high-volume append-only activity log would cause
 * excessive index maintenance overhead (e.g. section_id and section_tipo btree
 * indexes are omitted from matrix_activity because activity rows are looked up
 * primarily by timestamp, not by section coordinates).
 * @var string[] $TABLES_MATRIX_NO_ACTIVITY
 */
$TABLES_MATRIX_NO_ACTIVITY = array_values(
	array_filter($TABLES_MATRIX_ALL, fn($t) => $t !== 'matrix_activity')
);

/**
 * $TABLES_MATRIX_ALL plus matrix_time_machine.
 * Used for composite btree indexes on (section_tipo, section_id DESC) that are
 * needed on both the live matrix tables and the time-machine history table, e.g.
 * for efficient "latest version of section" queries.
 * @var string[] $TABLES_MATRIX_PLUS_TM
 */
$TABLES_MATRIX_PLUS_TM = [...$TABLES_MATRIX_ALL, 'matrix_time_machine'];

// ── Helper Functions ───────────────────────────────────────────────────────────
// Factory closures that stamp out definition objects for the most common index
// patterns. Using closures instead of inline literal repetition ensures that all
// GIN indexes of the same kind are created with identical naming conventions and
// SQL templates, reducing copy-paste drift.

/**
 * MAKE_GIN_INDEX
 * Produces a GIN index definition object for a single JSONB column applied to
 * one or more tables. The generated CREATE INDEX uses jsonb_path_ops, which is
 * more compact and faster than the default ops for @> containment queries.
 *
 * The `name` is prefixed "all_matrix_" to signal that the index applies to
 * multiple tables; the actual per-table index name substitutes {$table} at
 * execution time in db_tasks::rebuild_indexes().
 *
 * @param string  $column      PostgreSQL column name (e.g. 'string', 'relation')
 * @param array   $tables      Table names that receive the index
 * @param string  $sample      Representative query string for documentation and testing
 * @param string  $info        Human-readable description of the index's purpose
 * @return object              stdClass with tables/add/drop/sample/name/info keys
 */
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

// MAKE_FLAT_REL_INDEX factory REMOVED (v7 flat-relation retirement, 2026-07-20):
// the flat-function GIN indexes are never created — matrix_relation_index is
// the only relation engine. Cleanup happens via the drop-only function entries
// above (DROP FUNCTION … CASCADE removes any dependent functional indexes).

// ── Extensions ─────────────────────────────────────────────────────────────────
// PostgreSQL extensions that must exist before any function, index, or operator
// that depends on them can be created. db_tasks::rebuild_extensions() executes
// these strings directly against the target database.
// - pg_trgm   : trigram operator support (%, similarity()) used by fuzzy ontology search.
// - unaccent  : text normalization dictionary used by f_unaccent() below.
// (!) Both extensions require superuser privileges during initial installation.
//     On managed PostgreSQL (e.g. RDS, Azure) the extensions may already be
//     pre-installed; CREATE EXTENSION IF NOT EXISTS is safe to re-run.

$ar_extensions = [];
$ar_extensions[] = 'CREATE EXTENSION IF NOT EXISTS pg_trgm;';
$ar_extensions[] = 'CREATE EXTENSION IF NOT EXISTS unaccent;';

// ── Functions ───────────────────────────────────────────────────────────────────
// Stored functions that Dédalo relies on for search and indexing.
// db_tasks::rebuild_functions() DROPs each function first, then CREATEs it;
// always drop-then-create to handle signature changes across releases.
// (!) Functions declared IMMUTABLE are eligible for use in functional indexes.
//     If the function body changes in a way that affects its output for the same
//     input, any dependent functional indexes must also be dropped and rebuilt.

$ar_function = [];

// f_unaccent — accent-insensitive text normalizer
// Wraps the built-in unaccent() with a stable SQL function so it can be used
// in WHERE clauses and expressions without worrying about schema search path.
// PARALLEL UNSAFE is intentional: the unaccent dictionary is a global resource
// that PostgreSQL cannot safely parallelize across workers.
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

// data_relations_flat_* — REMOVED (v7 flat-relation retirement, 2026-07-20).
// The four v6-era flattening functions (st_si, fct_st_si, ty_st_si, ty_st)
// projected the nested relation column into flat "a_b_c" strings for GIN
// containment. v7 replaced them outright with matrix_relation_index (typed,
// trigger-maintained, created and backfilled by create_relation_index_store
// at the end of this update) — the v7 engine ships NO flat-function path.
// These entries are drop-only cleanup: rebuild_functions() executes the drop
// (CASCADE also removes any dependent functional GIN indexes, including the
// ones a previous run of this update may have created) and re-creates
// nothing. Each drop also removes the v6-NAMED twin (relations_flat_*, no
// data_ prefix) that a closed v6 installation may still carry.
$ar_function[] = (object)[
	'add' => '',
	'drop' => 'DROP FUNCTION IF EXISTS data_relations_flat_st_si CASCADE; DROP FUNCTION IF EXISTS relations_flat_st_si CASCADE',
	'sample' => '-- Removed 2026-07-20: matrix_relation_index is the only relation engine',
	'name' => 'data_relations_flat_st_si',
	'info' => 'REMOVED 2026-07-20. Query shape lives on as (target_section_tipo, target_section_id) over matrix_relation_index. Drop-only cleanup.'
];
$ar_function[] = (object)[
	'add' => '',
	'drop' => 'DROP FUNCTION IF EXISTS data_relations_flat_fct_st_si CASCADE; DROP FUNCTION IF EXISTS relations_flat_fct_st_si CASCADE',
	'sample' => '-- Removed 2026-07-20: matrix_relation_index is the only relation engine',
	'name' => 'data_relations_flat_fct_st_si',
	'info' => 'REMOVED 2026-07-20. Query shape lives on as (from_component_tipo, target_section_tipo, target_section_id) over matrix_relation_index. Drop-only cleanup.'
];
$ar_function[] = (object)[
	'add' => '',
	'drop' => 'DROP FUNCTION IF EXISTS data_relations_flat_ty_st_si CASCADE; DROP FUNCTION IF EXISTS relations_flat_ty_st_si CASCADE',
	'sample' => '-- Removed 2026-07-20: matrix_relation_index is the only relation engine',
	'name' => 'data_relations_flat_ty_st_si',
	'info' => 'REMOVED 2026-07-20. Query shape lives on as (type, target_section_tipo, target_section_id) over matrix_relation_index. Drop-only cleanup.'
];
$ar_function[] = (object)[
	'add' => '',
	'drop' => 'DROP FUNCTION IF EXISTS data_relations_flat_ty_st CASCADE; DROP FUNCTION IF EXISTS relations_flat_ty_st CASCADE',
	'sample' => '-- Removed 2026-07-20: matrix_relation_index is the only relation engine',
	'name' => 'data_relations_flat_ty_st',
	'info' => 'REMOVED 2026-07-20. Query shape lives on as (type, target_section_tipo) over matrix_relation_index. Drop-only cleanup.'
];

// check_array_component — legacy v6, kept for drop compatibility
// This function no longer exists in v7 but may still be present on databases that
// were migrated from v6. The entry has an empty `add` string so rebuild_functions()
// only executes the DROP, safely cleaning up the stale function.
$ar_function[] = (object)[
	'add'    => '',
	'drop'   => 'DROP FUNCTION IF EXISTS check_array_component',
	'sample' => '-- Not used anymore (v6)',
	'name'   => 'check_array_component',
	'info'   => 'Not used anymore (v6)'
];

// jsonb_values_as_text — flattens JSONB object values into a single space-separated string
// The dd_ontology.term column is a JSONB object keyed by language code:
//   {"lg-spa": "Historia oral", "lg-eng": "Oral history", …}
// This function extracts all leaf values and concatenates them so that trigram
// and similarity operators (%, similarity()) can match any language at once.
// Used by the dd_ontology_term_trgm_values_idx functional GIN index and by
// dd_ontology_db_manager::search_fuzzy_term() to rank results.
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
// UNIQUE constraints enforced at the PostgreSQL level. db_tasks::rebuild_constraints()
// drops the existing constraint first, then adds it, so re-running is idempotent.
// (!) Adding a UNIQUE constraint on a non-empty table triggers a full sequential scan
//     and may hold an ACCESS EXCLUSIVE lock for minutes on large datasets.

$ar_constraint = [];

// (section_id, section_tipo) composite unique constraint — all matrix tables
// Every record in the matrix family is uniquely identified by the pair
// (section_id, section_tipo). This constraint is the database-level enforcement
// of that invariant; the application layer relies on it to detect and reject
// duplicate section creation attempts.
$ar_constraint[] = (object)[
	'tables' => $TABLES_MATRIX_ALL,
	'add' => 'ALTER TABLE IF EXISTS {$table} ADD CONSTRAINT {$table}_section_id_section_tipo_key UNIQUE (section_id, section_tipo);',
	'drop' => 'ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$table}_section_id_section_tipo_key',
	'sample' => "INSERT INTO \"matrix_projects\" (section_id, section_tipo) VALUES (1, 'dd153')",
	'name' => 'all_matrix_constraint_section_id_section_tipo_key',
	'info' => 'Used to avoid duplicated records, it is not possible to store the same section_id with the same section_tipo'
];

// tipo unique constraint — dd_ontology and counter tables
// In dd_ontology each row represents a single ontology node identified by its `tipo`
// string (e.g. 'dd1', 'tch42'). In matrix_counter / matrix_counter_dd each row tracks
// the section_id counter for one section type, again keyed by tipo.
// The DROP block is intentionally multi-statement: historically this constraint was
// implemented as either a PRIMARY KEY (_tipo_pkey), a named UNIQUE constraint
// (_tipo_key), or a plain index (_tipo_idx). All legacy forms must be cleaned up
// before the canonical constraint can be re-added without conflict.
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
// All index entries follow the definition object shape documented in the file header.
// db_tasks::rebuild_indexes() processes each entry by:
//   1. Substituting {$table} with each table name in the `tables` array.
//   2. Running the `drop` SQL to remove any existing index.
//   3. Running the `add` SQL (if non-empty) to create the new index.
// Entries with an empty `add` string but a non-empty `add_disabled` string are
// intentionally inactive by default — they must be enabled manually or by a
// separate administrative operation.

$ar_index = [];

// ── Ontology (dd_ontology) ─────────────────────────────────────────────────────
// dd_ontology is the flat-table representation of the Dédalo ontology tree.
// It is read very frequently (every section/component render resolves its tipo)
// and written infrequently (only when ontology is edited), so a wide btree
// index footprint is acceptable. The indexes below cover the main scalar columns
// and the two JSONB/array columns used in search and tree navigation.

// is_model btree — filters between descriptors (is_model=1) and non-descriptors (is_model=2)
// Used by the ontology browser and component_select to restrict the tree view to
// true "descriptor" nodes versus structural/administrative ones.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_is_model_idx ON {$table} USING btree (is_model ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_is_model_idx',
	'sample' => 'SELECT * FROM dd_ontology WHERE is_model = 1 LIMIT 1',
	'name'   => 'dd_ontology_is_model_idx',
	'info'   => 'Used to search if the term is a descriptor or not, possible values: 1|2. 1 = yes, 2 = no'
];

// model btree — ontology node's class category (e.g. 'section', 'component', 'hierarchy')
// Filters the ontology tree to a specific model category when rendering the ontology browser
// or populating component_select option lists scoped to one model type.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_model_idx ON {$table} USING btree (model COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_model_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE model = 'section' LIMIT 1",
	'name'   => 'dd_ontology_model_idx',
	'info'   => 'Used to search if the descriptor model'
];

// model_tipo btree — the tipo of the PHP class that implements this node (e.g. 'dd6')
// Allows lookup of all ontology nodes implemented by a given PHP class tipo, which
// is used when loading components to determine which class to instantiate.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_model_tipo_idx ON {$table} USING btree (model_tipo COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_model_tipo_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE model_tipo = 'dd6' LIMIT 1",
	'name'   => 'dd_ontology_model_tipo_idx',
	'info'   => 'Used to search for the descriptor model_tipo'
];

// order_number btree — sibling ordering within a parent node
// The ontology tree displays children sorted by order_number; this index supports
// ORDER BY order_number queries when iterating children of a given parent.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_order_number_idx ON {$table} USING btree (order_number ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_order_number_idx',
	'sample' => 'SELECT * FROM dd_ontology WHERE order_number = 2 LIMIT 1',
	'name'   => 'dd_ontology_order_number_idx',
	'info'   => 'Used to search for the descriptor order_number'
];

// parent btree — direct parent tipo of an ontology node
// Core navigation index: fetching all children of a given parent uses WHERE parent = ?
// as the primary filter. Used by ontology tree expansion and hierarchy resolution.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_parent_idx ON {$table} USING btree (parent ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_parent_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE parent = 'tch1' LIMIT 1",
	'name'   => 'dd_ontology_parent_idx',
	'info'   => 'Used to search for the descriptor parent'
];

// tld btree — top-level domain prefix (e.g. 'tch', 'oh', 'dd')
// Every tipo belongs to a namespace identified by its tld. Filtering by tld is
// the fastest way to restrict a query to one logical project's ontology branch.
// Applied to both dd_ontology and main_dd (the per-project cache table).
$ar_index[] = (object)[
	'tables' => ['dd_ontology', 'main_dd'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_tld_idx ON {$table} USING btree (tld COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_tld_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE tld = 'tch' LIMIT 1",
	'name'   => 'dd_ontology_tld_idx',
	'info'   => 'Used to search for the descriptor tld'
];

// relations GIN — array of related tipo strings stored in dd_ontology.relations
// The `relations` column holds a PostgreSQL text[] array of tipos that this node
// is related to (e.g. for allowed-children or semantic links). GIN is required for
// efficient array containment (@>) queries against this column.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_relations_idx ON {$table} USING gin (relations);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_relations_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE relations @> ARRAY['tch'] LIMIT 1",
	'name'   => 'dd_ontology_relations_idx',
	'info'   => 'Used to search for descriptor relations'
];

// is_translatable btree — whether the node's label should be translated
// Used in bulk operations and the ontology browser to filter nodes that have
// multi-language labels versus those with a language-agnostic fixed label.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_is_translatable_idx ON {$table} USING btree (is_translatable ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_is_translatable_idx',
	'sample' => 'SELECT * FROM dd_ontology WHERE is_translatable = true LIMIT 1',
	'name'   => 'dd_ontology_is_translatable_idx',
	'info'   => 'Used to search if the term is translatable or not, boolean values: true | false'
];

// is_main btree — identifies the root node of each TLD (tipo = tld + '0', e.g. 'tch0')
// The root node anchors each project's ontology subtree. is_main=true allows
// fast enumeration of all subtree roots without string pattern matching on tipo.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_is_main_idx ON {$table} USING btree (is_main ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_is_main_idx',
	'sample' => 'SELECT * FROM dd_ontology WHERE is_main = true LIMIT 1',
	'name'   => 'dd_ontology_is_main_idx',
	'info'   => 'Used to search if the node is a main/root node (tipo = tld + 0), boolean values: true | false'
];

// (parent, order_number) composite btree — ordered child listing
// The most common ontology navigation pattern is: "give me the children of parent X
// in display order". This composite index satisfies both the equality filter on parent
// and the sort on order_number in a single index scan, avoiding a separate sort step.
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_parent_order_number_idx ON {$table} USING btree (parent COLLATE pg_catalog.default ASC NULLS LAST, order_number ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_parent_order_number_idx',
	'sample' => "SELECT * FROM dd_ontology WHERE parent = 'tch1' ORDER BY order_number LIMIT 1",
	'name'   => 'dd_ontology_parent_order_number_idx',
	'info'   => 'Used to search descriptors by parent and order_number'
];

// term GIN jsonb_path_ops — pre-filter phase of fuzzy ontology search
// dd_ontology.term stores multi-language labels as {"lg-spa": "…", "lg-eng": "…"}.
// jsonb_path_ops GIN enables the JSONPath @? operator to quickly narrow the candidate
// set before similarity() scoring is applied. This is the first of two indexes that
// together power dd_ontology_db_manager::search_fuzzy_term():
//   step 1: @? '$.* ? (@ like_regex "query" flag "i")' — eliminates non-matching rows
//   step 2: similarity(jsonb_values_as_text(term), 'query') % threshold — ranks results
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_term_jsonpath_idx ON {$table} USING gin (term jsonb_path_ops);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_term_jsonpath_idx',
	'sample' => "SELECT tipo FROM dd_ontology WHERE term @? '$.* ? (@ like_regex \"oral\" flag \"i\")' LIMIT 5",
	'name'   => 'dd_ontology_term_jsonpath_idx',
	'info'   => 'GIN index on dd_ontology.term using jsonb_path_ops. Powers the JSONPath @? pre-filter phase of fuzzy ontology search, enabling fast regex-like matching across all language keys.'
];

// term trigram GIN — similarity ranking phase of fuzzy ontology search
// Functional GIN on jsonb_values_as_text(term) with gin_trgm_ops. The % (similarity
// threshold) operator uses this index to pre-filter before the slower similarity()
// scoring function runs. Requires both pg_trgm and the jsonb_values_as_text function
// defined above; rebuild_functions() must be run before rebuild_indexes().
$ar_index[] = (object)[
	'tables' => ['dd_ontology'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_term_trgm_values_idx ON {$table} USING gin (jsonb_values_as_text(term) gin_trgm_ops);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_term_trgm_values_idx',
	'sample' => "SELECT tipo, similarity(jsonb_values_as_text(term), 'oral') AS score FROM dd_ontology WHERE jsonb_values_as_text(term) % 'oral' ORDER BY score DESC LIMIT 5",
	'name'   => 'dd_ontology_term_trgm_values_idx',
	'info'   => 'Trigram GIN index on jsonb_values_as_text(term). Powers the similarity/fuzzy search in dd_ontology_db_manager::search_fuzzy_term(), using the % operator for fast pre-filtering and similarity() for ranking.'
];

// ── General (btree on matrix tables) ────────────────────────────────────────────
// Scalar btree indexes for the two primary lookup columns on every matrix table.
// section_id and section_tipo are the coordinate pair that identifies any record;
// nearly every SQO-generated query filters on one or both of them.

// section_id ASC btree — lookup by section_id
// Applied to all matrix tables except matrix_activity (excluded via $TABLES_MATRIX_NO_ACTIVITY)
// because the activity table is queried primarily by timestamp, not by section_id.
// PostgreSQL's btree can satisfy both ASC and DESC scans from a single index, so a
// separate DESC variant is not needed (see the commented-out entry below).
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

// section_tipo ASC btree — lookup by section_tipo (the section's ontology tipo, e.g. 'oh1')
// Excluded from matrix_activity for the same reason as the section_id index above.
$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_NO_ACTIVITY,
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_section_tipo_idx ON {$table} USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_section_tipo_idx',
	'sample' => "SELECT * FROM matrix WHERE section_tipo = 'oh1' LIMIT 10",
	'name'   => 'all_matrix_section_tipo_idx',
	'info'   => 'Used to search by section_tipo ordered ascendant.'
];

// (section_tipo ASC, section_id DESC) composite btree — section list with newest-first ordering
// Applied to ALL matrix tables plus matrix_time_machine ($TABLES_MATRIX_PLUS_TM).
// The DESC on section_id is deliberate: Dédalo section lists default to newest-first
// (highest section_id first) within each section_tipo. The composite index satisfies
// both the equality filter on section_tipo and the DESC sort in a single scan.
// matrix_time_machine is included here because "latest version of a given section" is
// the primary time-machine query: WHERE section_tipo = ? ORDER BY id DESC.
$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_PLUS_TM,
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_section_tipo_section_id_desc_idx ON {$table} USING btree (section_tipo COLLATE pg_catalog.default ASC NULLS LAST, section_id DESC NULLS FIRST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_section_tipo_section_id_desc_idx',
	'sample' => "SELECT * FROM matrix WHERE section_id = 5 AND section_tipo = 'rsc197' LIMIT 10",
	'name'   => 'all_matrix_section_tipo_section_id_desc_idx',
	'info'   => 'Used to search by section_tipo ordered descendant by section_id.'
];

// ── JSONB columns (GIN) ───────────────────────────────────────────────────────
// Every matrix table stores component data in typed JSONB columns. Each column
// holds a map of component_tipo → array-of-dato-objects. GIN indexes with
// jsonb_path_ops enable fast @> containment queries across the entire column.
//
// Column summary:
//   string          — text/string component data (component_input_text, etc.)
//   date            — date component data with `time` (Unix seconds) and other properties
//   iri             — IRI/URI component data with `iri` and `title` properties
//   geo             — geolocation data with `lat`, `lng`, `alt` properties
//   number          — numeric component data with `value` property
//   media           — media file metadata (original_file_name, etc.); excluded from
//                     matrix_activity because the activity log never stores media data
//   misc            — miscellaneous component data (select, radio-button, etc.)
//   relation_search — pre-computed denormalized index of ancestor locators; used to
//                     answer "which rows are indexed under a given thesaurus parent?"
//                     without traversing the full hierarchy at query time
//   relation        — raw relational links keyed by component_tipo
//
// Note: `geo` and `number` use jsonb_path_query_array($.*[*]) in the sample because
// their column structure is keyed by component_tipo (an extra nesting level), requiring
// the path expression to flatten across all components before @> containment applies.

$ar_index[] = $make_gin_index('string',  $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE string @> '{\"rsc85\":[{\"value\":\"Pere\"}]}' LIMIT 10", 'Used to search string literals as full components data');
$ar_index[] = $make_gin_index('date',    $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE date @> '[{\"time\":57958546}]' LIMIT 10", 'Used to search dates by any property.');
$ar_index[] = $make_gin_index('iri',     $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE iri @> '[{\"iri\":\"https://dedalo.dev\"}]' LIMIT 10", 'Used to search IRI data by any of its properties, iri or title.');
$ar_index[] = $make_gin_index('geo',     $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE jsonb_path_query_array(geo, '\$.*[*]') @> '[{\"lat\":\"39.462571\"}]' LIMIT 10", 'Used to search geolocation data by any of its properties: lat, lng or alt.');
$ar_index[] = $make_gin_index('number',  $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE jsonb_path_query_array(number, '\$.*[*].value') @> '[5]' LIMIT 10", 'Used to search number data values.');
$ar_index[] = $make_gin_index('media',   $TABLES_MATRIX_NO_ACTIVITY, "SELECT * FROM matrix WHERE jsonb_path_query_array(media, '\$.*[*]') @> '[{\"original_file_name\":\"my_image.png\"}]' LIMIT 10", 'Used to search media data by any of its properties, original_file_name, or others.');
$ar_index[] = $make_gin_index('misc',    $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE jsonb_path_query_array(misc, '\$.*[*].value') @> '[{\"section_tipo\":\"lg-spa\"}]' LIMIT 10", 'Used to search miscellaneous data by any of its properties.');
$ar_index[] = $make_gin_index('relation_search', $TABLES_MATRIX_ALL, "SELECT * FROM matrix WHERE relation_search @> '[{\"section_tipo\":\"es1\"}]' LIMIT 10", 'Used to search relation all children data with specific parent. Give me all data indexed with a child using any of its parents.');

// relation — by component (full JSONB structure)
// Indexes the raw `relation` column with the full {"component_tipo":[{locator}]} structure.
// Use this index when the query includes a specific component tipo as the key, e.g.
//   relation @> '{"rsc91":[{"section_tipo":"es1"}]}'
// The jsonb_path_ops operator class is chosen for smaller index size and faster @> queries;
// it does not support the @? or @@ operators.
$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_ALL,
	'add'    => "CREATE INDEX IF NOT EXISTS {\$table}_relation_gin_idx ON {\$table} USING gin (relation jsonb_path_ops);",
	'drop'   => 'DROP INDEX IF EXISTS {$table}_relation_gin_idx',
	'sample' => "SELECT * FROM matrix WHERE relation @> '{\"rsc91\":[{\"section_tipo\":\"es1\"}]}' LIMIT 10",
	'name'   => 'all_matrix_relation_gin_idx',
	'info'   => 'Used to search relations as components data'
];

// relation — locators without component (extracted locators)
// Uses jsonb_path_query_array to flatten all locators from all components into a single
// array, then indexes that array with GIN. This allows queries across all components:
//   jsonb_path_query_array(relation, '$.*[*]') @> '[{"section_tipo":"es1"}]'
// Complements the per-component index above: use this when the component_tipo is unknown
// or irrelevant and any component linking to the target is sufficient.
$ar_index[] = (object)[
	'tables' => $TABLES_MATRIX_ALL,
	'add'    => "CREATE INDEX IF NOT EXISTS {\$table}_relation_locators_gin_idx ON {\$table} USING gin (jsonb_path_query_array(relation, '\$.*[*]') jsonb_path_ops);",
	'drop'   => 'DROP INDEX IF EXISTS {$table}_relation_locators_gin_idx',
	'sample' => "SELECT * FROM matrix WHERE jsonb_path_query_array(relation, '\$.*[*]') @> '[{\"section_tipo\":\"es1\"}]' LIMIT 10",
	'name'   => 'all_matrix_relation_locators_gin_idx',
	'info'   => 'Used to search relations across all components data'
];

// ── Flat-relation indexes (GIN on function) ─────────────────────────────────────
// Functional GIN indexes on the four data_relations_flat_* stored functions.
// Each index materializes a different "projection" of the nested relation JSONB
// as a compact jsonb_agg of strings, enabling O(log n) GIN lookups for relation
// searches that would otherwise require full-document scans or joins.
//
// (!) These indexes depend on the stored functions defined in $ar_function above.
//     rebuild_indexes() must be called AFTER rebuild_functions() when the functions
//     have been modified; otherwise CREATE INDEX fails because the IMMUTABLE function
//     the index references does not yet exist or has an incompatible signature.
// (flat-relation GIN index declarations removed 2026-07-20 — see the
// retirement note on the drop-only data_relations_flat_* function entries)

// ── Table-specific indexes ─────────────────────────────────────────────────────
// Indexes targeting individual tables that have bespoke access patterns not
// covered by the generic matrix-wide indexes above.

// matrix_activity_diffusion — id DESC (disabled)
// Disabled by default because matrix_activity_diffusion is an append-only log table
// and a sequential id DESC index would increase write overhead on every insert.
// Enable via `add_disabled` only when performing point lookups by id in diffusion
// analytics queries that cannot be served by the timestamp composite index.
$ar_index[] = (object)[
	'tables'       => ['matrix_activity_diffusion'],
	'add'          => '',
	'add_disabled' => 'CREATE INDEX IF NOT EXISTS {$table}_id_desc_idx ON {$table} USING btree (id DESC NULLS LAST);',
	'drop'         => 'DROP INDEX IF EXISTS {$table}_id_desc_idx',
	'sample'       => 'SELECT * FROM matrix_activity WHERE id = 5 LIMIT 10',
	'name'         => 'matrix_activity_id_desc_idx',
	'info'         => 'Used to search by id ordered descendant.'
];

// matrix_activity — id ASC (disabled)
// Disabled by default for the same reason as the diffusion table above.
// diffusion_section_stats::update_user_activity_stats() iterates activity rows by id
// ASC to process unprocessed work incrementally; enable this index if that method
// shows sequential scan costs on large activity tables.
$ar_index[] = (object)[
	'tables'       => ['matrix_activity'],
	'add'          => '',
	'add_disabled' => 'CREATE INDEX IF NOT EXISTS {$table}_id_asc_idx ON {$table} USING btree (id ASC); ANALYZE {$table};',
	'drop'         => 'DROP INDEX IF EXISTS "{$table}_id_asc_idx"',
	'sample'       => 'SELECT * FROM matrix_activity ORDER BY id ASC LIMIT 10',
	'name'         => 'matrix_activity_id_asc_idx',
	'info'         => 'Used to search by id ordered ascendant. Used by diffusion_section_stats:update_user_activity_stats'
];

// matrix_activity — (timestamp, id) composite with INCLUDE columns
// Primary access pattern for diffusion_section_stats::get_interval_raw_activity_data():
// "all activity rows in a date range, filtered further by relation content".
// INCLUDE (section_tipo, section_id) makes the index a covering index for the common
// case where the query only needs those four columns — avoiding a heap fetch.
// The `timestamp` column is double-quoted because it is a reserved word in SQL.
$ar_index[] = (object)[
	'tables'       => ['matrix_activity'],
	'add'          => 'CREATE INDEX IF NOT EXISTS {$table}_timestamp_composite_idx ON {$table} ("timestamp", id) INCLUDE (section_tipo, section_id);',
	'drop'         => 'DROP INDEX IF EXISTS "{$table}_timestamp_composite_idx"',
	'sample'       => 'SELECT * FROM matrix_activity WHERE ("timestamp" >= \'2024-12-04\' AND "timestamp" < \'2024-12-05\') AND relation @> \'{"dd543":[{"section_tipo":"dd128","section_id":"1"}]}\'',
	'name'         => 'matrix_activity_timestamp_composite_idx',
	'info'         => 'Used to search by timestamp, ordered id ascendant. Used by diffusion_section_stats:get_interval_raw_activity_data'
];

// matrix_time_machine + matrix_activity — timestamp DATE (BRIN)
// BRIN (Block Range Index) is chosen because both tables are append-only with
// timestamps that increase monotonically — exactly the data distribution where BRIN
// is most effective and cheapest to maintain.
// The DROP block intentionally removes a legacy btree index on the raw `timestamp`
// column ({$table}_timestamp_idx) before creating the new BRIN on DATE(timestamp).
// Filtering by DATE instead of the raw timestamptz avoids timezone edge cases and
// allows the planner to use the index for equality comparisons like DATE(ts) = '…'.
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

// matrix_time_machine — (tipo, id DESC)
// `tipo` in the time-machine table is the component_tipo (not section_tipo), e.g. 'oh25'.
// The DESC on id surfaces the most recent version of a component's stored value;
// "give me the latest time-machine snapshot for component tipo X" is the primary use case.
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_tipo_idx ON {$table} USING btree (tipo, id DESC);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_tipo_idx',
	'sample' => "SELECT * FROM matrix_time_machine WHERE tipo = 'oh1' ORDER BY id DESC LIMIT 1",
	'name'   => 'matrix_time_machine_tipo_idx',
	'info'   => 'Used to search by tipo.'
];

// matrix_time_machine — (section_tipo, id DESC)
// Supports browsing the full edit history for all records of a given section type,
// ordered newest-first. Used by the time-machine UI when displaying paginated history
// for a section (e.g. WHERE section_tipo = 'oh1' ORDER BY id DESC LIMIT 30 OFFSET 60).
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_section_tipo_idx ON {$table} USING btree (section_tipo, id DESC);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_section_tipo_idx',
	'sample' => "SELECT * FROM matrix_time_machine AS dd15 WHERE dd15.section_tipo = 'oh1' ORDER BY id DESC LIMIT 30 OFFSET 60",
	'name'   => 'matrix_time_machine_section_tipo_idx',
	'info'   => 'Used to search by section_tipo in time machine.'
];

// matrix_time_machine — lang btree
// Supports filtering time-machine snapshots by the language in which the edit was made.
// Used when restoring or reviewing edits to a specific language variant of a translatable
// component (e.g. recover the Spanish text as it was at a given snapshot).
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_lang_idx ON {$table} USING btree (lang COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_lang_idx',
	'sample' => "SELECT * FROM matrix_time_machine WHERE lang = 'lg-spa' LIMIT 1",
	'name'   => 'matrix_time_machine_lang_idx',
	'info'   => 'Used to search by lang.'
];

// matrix_time_machine — bulk_process_id btree
// Bulk operations (e.g. mass import, automated migration scripts) tag all their time-machine
// entries with a shared bulk_process_id so the entire batch can be located, audited,
// or rolled back as a unit. This index is the entry point for those batch-management queries.
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_bulk_process_id_idx ON {$table} USING btree (bulk_process_id ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_bulk_process_id_idx',
	'sample' => 'SELECT * FROM matrix_time_machine WHERE bulk_process_id = 751 LIMIT 1',
	'name'   => 'matrix_time_machine_bulk_process_id_idx',
	'info'   => 'Used to search by bulk_process_id.'
];

// matrix_time_machine — user_id btree
// Supports audit queries: "show me all changes made by user X", used in the activity
// dashboard and user-history views.
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_user_id_idx ON {$table} USING btree ("user_id" ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_user_id_idx',
	'sample' => 'SELECT * FROM matrix_time_machine WHERE user_id = 2 LIMIT 1',
	'name'   => 'matrix_time_machine_user_id_idx',
	'info'   => 'Used to search by user_id.'
];

// matrix_time_machine — (section_id, bulk_process_id, section_tipo, tipo, lang) composite
// Wide composite index that covers the full parameter set used by bulk rollback and
// bulk audit queries: "find all time-machine entries for section_id X in bulk_process_id Y
// for component_tipo Z in lang L". The btree covers each column independently via prefix
// scans, but the primary use-case is the full five-column equality lookup.
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_si_bulk_st_tipo_lang_idx ON {$table} USING btree (section_id ASC NULLS LAST, bulk_process_id ASC NULLS LAST, section_tipo COLLATE pg_catalog.default ASC NULLS LAST, tipo COLLATE pg_catalog.default ASC NULLS LAST, lang COLLATE pg_catalog.default ASC NULLS LAST);',
	'drop'   => 'DROP INDEX IF EXISTS {$table}_si_bulk_st_tipo_lang_idx',
	'sample' => 'SELECT * FROM matrix_time_machine WHERE bulk_process_id = 751 LIMIT 1',
	'name'   => 'matrix_time_machine_si_bulk_st_tipo_lang_idx',
	'info'   => 'Used to search by bulk_process_id with all parameters, section_id, bulk_process_id, section_tipo, tipo and lang.'
];

// matrix_time_machine — (section_id, section_tipo, tipo, lang, timestamp DESC) search default
// The default time-machine query when a user inspects the history of a specific component
// within a specific record: WHERE section_id = ? AND section_tipo = ? AND tipo = ? AND lang = ?
// ORDER BY timestamp DESC. The trailing ANALYZE keeps planner statistics fresh after the
// index build on potentially large tables.
$ar_index[] = (object)[
	'tables' => ['matrix_time_machine'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_search_default_idx ON "{$table}" (section_id, section_tipo, tipo, lang, "timestamp" DESC); ANALYZE {$table};',
	'drop'   => 'DROP INDEX IF EXISTS "{$table}_search_default_idx"',
	'sample' => "SELECT * FROM matrix_time_machine WHERE section_id = 1 AND section_tipo = 'oh1' ORDER BY timestamp DESC LIMIT 10",
	'name'   => 'matrix_time_machine_search_default_idx',
	'info'   => 'Used to search by default parameters: section_id, section_tipo, tipo, lang, timestamp DESC'
];

// matrix_langs — hierarchy41 extracted value (language code string, e.g. 'eng')
// matrix_langs stores language metadata where the ISO 639-3 code is nested inside the
// `string` JSONB column as string->'hierarchy41'->0->>'value'. This functional btree
// index materializes that expression so lookups by language code are fast without
// full-table JSONB scans. hierarchy41 is the ontology tipo for the lang-code component.
$ar_index[] = (object)[
	'tables' => ['matrix_langs'],
	'add'    => 'CREATE INDEX IF NOT EXISTS {$table}_hierarchy41_value_idx ON "{$table}" ((string->\'hierarchy41\'->0->>\'value\')); ANALYZE {$table};',
	'drop'   => 'DROP INDEX IF EXISTS "{$table}_hierarchy41_value_idx"',
	'sample' => "SELECT * FROM matrix_langs WHERE (string->'hierarchy41'->0->>'value') = 'eng' LIMIT 10",
	'name'   => 'matrix_langs_hierarchy41_value_idx',
	'info'   => 'Used to search by hierarchy41 value (lang code) in matrix_langs'
];

// ── Maintenance ────────────────────────────────────────────────────────────────
// SQL statements executed in order by db_tasks::run_maintenance().
// These are plain SQL strings (not definition objects) because they do not
// require drop/add lifecycle management — they are always safe to re-run.
//
// REINDEX rebuilds the index from scratch, which can fix index bloat and
// corrupted index pages (e.g. after an unclean shutdown).
//
// VACUUM FULL reclaims physical disk space by rewriting the table; it holds an
// ACCESS EXCLUSIVE lock for the duration and should only be run during maintenance
// windows on production databases.
//
// VACUUM ANALYZE (without FULL) is non-blocking in most situations; it updates
// the planner statistics and reclaims dead tuple space for reuse without rewriting
// the table. Safe to run during normal operation.
//
// (!) The current set targets the tables most prone to bloat: matrix_dd (ontology
//     cache, frequently rewritten on ontology edits), matrix_hierarchy, the main
//     matrix table, and matrix_activity (high-volume append-only log). Expand this
//     list as operational experience identifies other bloat-prone tables.

$ar_maintenance = [];

$ar_maintenance[] = 'REINDEX TABLE matrix_dd;';
$ar_maintenance[] = 'VACUUM FULL VERBOSE ANALYZE matrix_dd;';
$ar_maintenance[] = 'VACUUM ANALYZE "matrix_hierarchy";';
$ar_maintenance[] = 'VACUUM ANALYZE "matrix";';
$ar_maintenance[] = 'VACUUM ANALYZE "matrix_activity";';


// Return the full definition catalogue to the caller (include() captures this value).
// The caller (db_tasks methods) destructures only the key(s) it needs rather than
// loading all definitions, keeping memory usage proportional to the operation.
return [
	'ar_extensions'		=> $ar_extensions,
	'ar_function'		=> $ar_function,
	'ar_constraint'		=> $ar_constraint,
	'ar_index'			=> $ar_index,
	'ar_maintenance'	=> $ar_maintenance,
];
