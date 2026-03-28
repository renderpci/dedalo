<?php declare(strict_types=1);
/**
* UPDATES CONTROL
* Definition of the update process
*
* Every update is a object with his own definition
* the update key is unique combination of the version numbers
*
* {
* 	# UPDATE TO
*	 	version_major		: int
*	 	version_medium		: int
*	 	version_minor		: int
*
*	# MINIMUM UPDATE FROM
*	 	update_from_major	: int
*	 	update_from_medium	: int
*	 	update_from_minor	: int
*
* 	# UPDATE HAS A DATA PROCESSES
* 	 	update_data 		: bool
*
*	# DATA ALERT
* 	 	alert_update 		: array
*
* 	# DATA PROCESSES
* 	 	SQL_update			: array
* 	 	run_scripts			: array
* 	 	components_update	: array
* }
*
*/
global $updates;
$updates = new stdClass();



$v=700; #####################################################################################
$updates->$v = new stdClass();

	// UPDATE TO
	$updates->$v->version_major			= 7;
	$updates->$v->version_medium		= 0;
	$updates->$v->version_minor			= 0;

	// MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 8;
	$updates->$v->update_from_minor		= 8;

	// require a clean installation
	// it only could be 'clean' | null. Incremental option has not sense to be forced.
		$updates->$v->force_update_mode = 'clean';

	// Load class with update methods
		require_once dirname(dirname(__FILE__)) .'/upgrade/class.v6_to_v7.php';

	// Pre update, changing jer_dd data in PostgreSQL with new format and set `dd_ontology` table.
		$updates->$v->run_pre_scripts[] = (object)[
			'info'			=> 'Set a new table `dd_ontology` with old `jer_dd` in PostgreSQL with new v7 schema',
			'script_class'	=> 'v6_to_v7',
			'script_method'	=> 'pre_update',
			'stop_on_error'	=> true,
			'script_vars'	=> [
			] // Note that only ONE argument encoded is sent
		];

	// SQL UPDATE ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////

		// Rename matrix_activity column date to timestamp.
		// The date column will be used to store the component_date data.
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_name = \'matrix_activity\'
					AND column_name = \'date\'
					AND data_type != \'jsonb\'
				) THEN
					EXECUTE \'ALTER TABLE matrix_activity RENAME COLUMN date TO "timestamp"\';
					EXECUTE \'COMMENT ON COLUMN matrix_activity."timestamp" IS \'\'Activity timestamp (previously date)\'\'\';
				END IF;
			END $$;
		');

		// Rename matrix_notifications column datos to data
		$updates->$v->SQL_update[] = PHP_EOL . sanitize_query('
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_name = \'matrix_notifications\'
					AND column_name = \'datos\'
				) THEN
					EXECUTE \'ALTER TABLE matrix_notifications RENAME COLUMN datos TO data\';
				END IF;
			END $$;
		');

		// DATA INSIDE DATABASE UPDATES
		// clean_section_and_component_dato. Update 'datos' to section_data
		$ar_tables = [
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
		];

		// Create the new table structure, with new columns for data type.
		$columns_sentences = [];
		$comments_sentences = [];
		foreach ($ar_tables as $current_table) {
			$columns_sentences [] = '
				ALTER TABLE "'.$current_table.'"
					ADD COLUMN IF NOT EXISTS "data" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "relation" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "string" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "date" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "iri" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "geo" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "number" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "media" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "misc" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "relation_search" jsonb NULL,
					ADD COLUMN IF NOT EXISTS "meta" jsonb NULL;
			';
			$comments_sentences[] = "
				COMMENT ON COLUMN " . $current_table . ".id IS 'Unique table identifier';
				COMMENT ON COLUMN " . $current_table . ".section_id IS 'Section unique identifier';
				COMMENT ON COLUMN " . $current_table . ".section_tipo IS 'Ontology section identifier (ontology TLD | ontology instance ID, e.g., oh1 = Oral History)';
				COMMENT ON COLUMN " . $current_table . ".data IS 'Section data';
				COMMENT ON COLUMN " . $current_table . ".relation IS 'Component data with relation values: " . DEDALO_RELATION_TYPE_LINK . " | " . DEDALO_RELATION_TYPE_CHILDREN_TIPO . " | " . DEDALO_RELATION_TYPE_PARENT_TIPO . " | " . DEDALO_RELATION_TYPE_INDEX_TIPO . " | " . DEDALO_RELATION_TYPE_MODEL_TIPO . " | " . DEDALO_RELATION_TYPE_FILTER . "';
				COMMENT ON COLUMN " . $current_table . ".string IS 'Component data with string values: " . DEDALO_VALUE_TYPE_STRING . "';
				COMMENT ON COLUMN " . $current_table . ".date IS 'Component data with date values: " . DEDALO_VALUE_TYPE_DATE . "';
				COMMENT ON COLUMN " . $current_table . ".iri IS 'Component data with IRI values: " . DEDALO_VALUE_TYPE_IRI . "';
				COMMENT ON COLUMN " . $current_table . ".geo IS 'Component data with geolocation values: " . DEDALO_VALUE_TYPE_GEO . "';
				COMMENT ON COLUMN " . $current_table . ".number IS 'Component data with number values: " . DEDALO_VALUE_TYPE_NUMBER . "';
				COMMENT ON COLUMN " . $current_table . ".media IS 'Component data with media values: " . DEDALO_VALUE_TYPE_MEDIA . "';
				COMMENT ON COLUMN " . $current_table . ".misc IS 'Other component data with miscellaneous values: " . DEDALO_VALUE_TYPE_MISC . "';
				COMMENT ON COLUMN " . $current_table . ".relation_search IS 'Complementary relationships as parents, used to search for all children of the parent being searched for.';
				COMMENT ON COLUMN " . $current_table . ".meta IS 'Component metadata, used as counters for components and other value identifiers.';
			";
		}
		$updates->$v->SQL_update[] = PHP_EOL . sanitize_query(implode(PHP_EOL, $columns_sentences));
		$updates->$v->SQL_update[] = PHP_EOL . sanitize_query(implode(PHP_EOL, $comments_sentences));
		$updates->$v->SQL_update[] = PHP_EOL . sanitize_query('ANALYZE ' . implode(', ', array_map(fn($t) => '"' . $t . '"', $ar_tables)) . ';');

		// Rename the "datos" column "data" in the other tables.
		$columns_sentences = [];
		$comments_sentences = [];
		// other kind of tables
		$other_tables = [
			'matrix_updates'
		];
		foreach ($other_tables as $current_table) {
			$columns_sentences [] = "
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_name = '$current_table'
					AND column_name = 'datos'
				) THEN
					ALTER TABLE \"$current_table\" RENAME COLUMN datos TO data;
				END IF;
			END $$;
			";
			$comments_sentences[] = "
				COMMENT ON COLUMN " . $current_table . ".data IS 'Table data as a general JSON data';
			";
		}
		$updates->$v->SQL_update[] = PHP_EOL . sanitize_query(implode(PHP_EOL, $columns_sentences));
		$updates->$v->SQL_update[] = PHP_EOL . sanitize_query(implode(PHP_EOL, $comments_sentences));
		$updates->$v->SQL_update[] = PHP_EOL . sanitize_query('ANALYZE ' . implode(', ', array_map(fn($t) => '"' . $t . '"', $other_tables)) . ';');

		// Create new temprary table with key -> value
		// Use to storage temporay sections (sections without section_id or section_id=0)
		// key string as section_tipo_user_id or any other string combination as section_tipo_section_id_user_id
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE UNLOGGED TABLE IF NOT EXISTS temp (
				key text PRIMARY KEY,
				value jsonb NULL
			);
		');

		// Set the matrix_notifications as "UNLOGGED" to optimize write operations
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			ALTER TABLE matrix_notifications SET UNLOGGED;
		');

		// create index for matrix_langs hierarchy41 value (lang code as 'eng')
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			DROP INDEX IF EXISTS "idx_matrix_langs_hierarchy41_value";
			CREATE INDEX IF NOT EXISTS idx_matrix_langs_hierarchy41_value ON "matrix_langs" (
				(string->\'hierarchy41\'->0->>\'value\')
			);
			ANALYZE matrix_langs;
		');

		// create index for matrix_time_machine. The default search is performed using the following: section_id, section_tipo, tipo, lang, timestamp DESC.
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			DROP INDEX IF EXISTS "idx_matrix_time_machine_search_default";
			CREATE INDEX IF NOT EXISTS idx_matrix_time_machine_search_default ON "matrix_time_machine" (
				section_id, section_tipo, tipo, lang, timestamp DESC
			);
			ANALYZE matrix_time_machine;
		');

		// create index for matrix_activity. The diffusion_section_stats:update_user_activity_stats uses this index (ORDER BY id ASC).
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			DROP INDEX IF EXISTS "matrix_activity_id_asc_idx";
			CREATE INDEX IF NOT EXISTS matrix_activity_id_asc_idx ON "matrix_activity" USING btree (id ASC);
			ANALYZE matrix_activity;
		');

		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			DROP INDEX IF EXISTS "matrix_counter_tipo_idx";

			BEGIN;

			-- Drop the constraint if it exists (safe operation in recent PostgreSQL versions)
			ALTER TABLE matrix_counter
			DROP CONSTRAINT IF EXISTS matrix_counter_tipo_key;

			-- Add the constraint
			ALTER TABLE matrix_counter
			ADD CONSTRAINT matrix_counter_tipo_key UNIQUE (tipo);

			COMMIT;
		');

		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			DROP INDEX IF EXISTS "matrix_counter_dd_tipo_idx";

			BEGIN;

			-- Drop the constraint if it exists (safe operation in recent PostgreSQL versions)
			ALTER TABLE matrix_counter_dd
			DROP CONSTRAINT IF EXISTS matrix_counter_dd_tipo_key;

			-- Add the constraint
			ALTER TABLE matrix_counter_dd
			ADD CONSTRAINT matrix_counter_dd_tipo_key UNIQUE (tipo);

			COMMIT;
		');

		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_name = \'matrix_counter\'
					AND column_name = \'dato\'
				) THEN
					-- Rename the Original Table
					ALTER TABLE matrix_counter RENAME TO temp_matrix_counter;
					-- Create a New Table
					CREATE TABLE matrix_counter (
						"tipo" character varying(128) NOT NULL,
						"value" integer,
						"ref" text,
						CONSTRAINT matrix_counter_tipo_pkey PRIMARY KEY ("tipo")
					);
					-- Copy Data from the temporary table to the new table
					INSERT INTO matrix_counter (tipo, value, ref)
					SELECT tipo, dato, ref
					FROM temp_matrix_counter;
					-- Drop the Temporary Table
					DROP TABLE temp_matrix_counter;
					ANALYZE matrix_counter;
				END IF;
			END $$;
		');

		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1
					FROM information_schema.columns
					WHERE table_name = \'matrix_counter_dd\'
					AND column_name = \'dato\'
				) THEN
					-- Rename the Original Table
					ALTER TABLE matrix_counter_dd RENAME TO temp_matrix_counter_dd;
					-- Create a New Table
					CREATE TABLE matrix_counter_dd (
						"tipo" character varying(128) NOT NULL,
						"value" integer,
						"ref" text,
						CONSTRAINT matrix_counter_dd_tipo_pkey PRIMARY KEY ("tipo")
					);
					-- Copy Data from the temporary table to the new table
					INSERT INTO matrix_counter_dd (tipo, value, ref)
					SELECT tipo, dato, ref
					FROM temp_matrix_counter_dd;
					-- Drop the Temporary Table
					DROP TABLE temp_matrix_counter_dd;
					ANALYZE matrix_counter_dd;
				END IF;
			END $$;
		');

	// SCRIPTS ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

		// Only checks data without save
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'CHECK all data in PostgreSQL to use v7 new format (ONLY CHECKS DATA WITHOUT SAVE. STOPS THE UPDATE IF FOUND ERRORS)',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'reformat_matrix_data',
				'stop_on_error'	=> true,
				'script_vars'	=> [
					$ar_tables,
					false, // save option. On false, only data review is made. Not save
					'matrix_processor' // process type
				] // Note that only ONE argument encoded is sent
			];

		// Updates all data in PostgreSQL with the new v7 format
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'UPDATE all data in PostgreSQL with new v7 format (SAVE DATA IGNORING FOUND ERRORS)',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'reformat_matrix_data',
				'stop_on_error'	=> false,
				'script_vars'	=> [
					$ar_tables,
					true // save option. On false, only data review is made. Not save
				] // Note that only ONE argument encoded is sent
			];

		// Delete all indexes in PostgreSQL
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Delete all INDEXES and functions in PostgreSQL. Cleaning unused indexes',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'delete_v6_db_indexes',
				'stop_on_error'	=> false,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// Rename the constraints in PostgreSQL
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Rename all CONSTRAINTS in PostgreSQL. Unification of the constraints',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'rename_constraint',
				'stop_on_error'	=> false,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// TM : Recreate the tm table in PostgreSQL. Extends the `matrix_time_machine` table with new columns required by the v7 schema.
		// (!) Run before Recreate all assets in PostgreSQL to prevent index creation of non existent columns
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Recreate the tm table (matrix_time_machine) in PostgreSQL. Add "user_id", "bulk_process" and "data" columns.',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'recreate_tm_table',
				'stop_on_error'	=> true,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// Recreate the database assets in PostgreSQL (functions, indexes, constraints, etc.)
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Recreate all assets in PostgreSQL (EXTENSIONS, CONSTRAINTS, FUNCTIONS, INDEXES)',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'recreate_db_assets',
				'stop_on_error'	=> false,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// TM : Remove the unused sections in tm table in PostgreSQL. Only deleted sections are stored and contains recoverable data.
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Remove the unused sections in tm table (matrix_time_machine) in PostgreSQL. Only deleted sections are stored and contains recoverable data',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'remove_tm_created_sections',
				'stop_on_error'	=> true,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// TM : Fill the new  columns `user_id`, `bulk_process` and `data` with its previous column data.
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Fill the new tm table (matrix_time_machine) columns "user_id", "bulk_process" and "data" with its previous column data. ',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'fill_new_columns_in_tm',
				'stop_on_error'	=> true,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// TM : Delete old 'section_id_key', 'state', 'userID', 'dato' tm columns in PostgreSQL.
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Delete tm table (matrix_time_machine) old columns "section_id_key" and "state" in PostgreSQL.',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'delete_tm_columns',
				'stop_on_error'	=> false,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// TM : Rename column "bulk_process_temp" to "bulk_process_id" in PostgreSQL.
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Rename column "bulk_process_temp" to "bulk_process_id" in tm table (matrix_time_machine) in PostgreSQL.',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'rename_tm_column_bulk_process',
				'stop_on_error'	=> false,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// TM : Update all data in PostgreSQL with new v7 format
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'UPDATE all data in PostgreSQL with new v7 format (SAVE DATA IGNORING FOUND ERRORS)',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'reformat_matrix_time_machine_data',
				'stop_on_error'	=> false,
				'script_vars'	=> [
					['matrix_time_machine'],
					true // save option. On false, only data review is made. Not save
				] // Note that only ONE argument encoded is sent
			];

		// DIFFUSION_ACTIVITY : Create matrix_activity_diffusion table
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Create MATRIX_ACTIVITY_DIFFUSION table.',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'create_matrix_activity_diffusion_table',
				'stop_on_error'	=> true,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];

		// Cleanup: Remove legacy 'datos' column from matrix tables
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'DROP legacy "datos" column in matrix tables (Final cleanup)',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'drop_legacy_datos_column',
				'stop_on_error'	=> false,
				'script_vars'	=> [
					$ar_tables
				] // Note that only ONE argument encoded is sent
			];
