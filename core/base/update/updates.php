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


$v=673; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 7;
	$updates->$v->version_minor			= 3;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 7;
	$updates->$v->update_from_minor		= 2;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.matrix_ontology;
		');



$v=700; #####################################################################################
$updates->$v = new stdClass();

	// UPDATE TO
	$updates->$v->version_major			= 7;
	$updates->$v->version_medium		= 0;
	$updates->$v->version_minor			= 0;

	// MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 7;
	$updates->$v->update_from_minor		= 2;

	// require a clean installation
	 // it only could be 'clean' | null. Incremental option has not sense to be forced.
		$updates->$v->force_update_mode = 'clean';

	// RUN_SCRIPTS
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

		// change the date column in matrix_activity as timestamp.
		// date column will use to storage component_date data.
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
					EXECUTE \'ALTER TABLE matrix_activity RENAME COLUMN date TO timestamp\';
				END IF;
			END;
			$$;
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

			// create the new table structure, with a new columns for data type.
			$columns = [];
			$comments = [];
			foreach ($ar_tables as $current_table) {
				$columns [] = '
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
						ADD COLUMN IF NOT EXISTS "counters" jsonb NULL;
				';
				$comments[] = "
					COMMENT ON COLUMN ".$current_table.".id IS 'Unique table identifier';
					COMMENT ON COLUMN ".$current_table.".section_id IS 'Section unique identifier';
					COMMENT ON COLUMN ".$current_table.".section_tipo IS 'Ontology section identifier (ontology TLD | ontology instance ID, e.g., oh1 = Oral History)';
					COMMENT ON COLUMN ".$current_table.".data IS 'Section data';
					COMMENT ON COLUMN ".$current_table.".relation IS 'Component data with relation values: ".DEDALO_RELATION_TYPE_LINK." | ".DEDALO_RELATION_TYPE_CHILDREN_TIPO." | ".DEDALO_RELATION_TYPE_PARENT_TIPO." | ".DEDALO_RELATION_TYPE_INDEX_TIPO." | ".DEDALO_RELATION_TYPE_MODEL_TIPO." | ".DEDALO_RELATION_TYPE_FILTER."';
					COMMENT ON COLUMN ".$current_table.".string IS 'Component data with string values: ". DEDALO_VALUE_TYPE_STRING. "';
					COMMENT ON COLUMN ".$current_table.".date IS 'Component data with date values: ". DEDALO_VALUE_TYPE_DATE. "';
					COMMENT ON COLUMN ".$current_table.".iri IS 'Component data with IRI values: ". DEDALO_VALUE_TYPE_IRI. "';
					COMMENT ON COLUMN ".$current_table.".geo IS 'Component data with geolocation values: ". DEDALO_VALUE_TYPE_GEO. "';
					COMMENT ON COLUMN ".$current_table.".number IS 'Component data with number values: ". DEDALO_VALUE_TYPE_NUMBER. "';
					COMMENT ON COLUMN ".$current_table.".media IS 'Component data with media values: ". DEDALO_VALUE_TYPE_MEDIA. "';
					COMMENT ON COLUMN ".$current_table.".misc IS 'Other component data with miscellaneous values: ". DEDALO_VALUE_TYPE_MISC. "';
					COMMENT ON COLUMN ".$current_table.".relation_search IS 'Complementary relationships as parents, used to search for all children of the parent being searched for.';
					COMMENT ON COLUMN ".$current_table.".counters IS 'Component literal counters, used as value identifiers.';
				";
			};
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query(implode(PHP_EOL, $columns));
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query(implode(PHP_EOL, $comments));

		// Only checks data without save
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Check all data in PostgreSQL to use v7 new format (ONLY CHECKS DATA WITHOUT SAVE. STOPS THE UPDATE IF FOUND ERRORS)',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'reformat_matrix_data',
				'stop_on_error'	=> true,
				'script_vars'	=> [
					$ar_tables,
					false // save option. On false, only data review is made. Not save
				] // Note that only ONE argument encoded is sent
			];

		// Update all data in PostgreSQL with new format
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Update all data in PostgreSQL with new v7 format (SAVE DATA IGNORING FOUND ERRORS)',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'reformat_matrix_data',
				'stop_on_error'	=> false,
				'script_vars'	=> [
					$ar_tables,
					true // save option. On false, only data review is made. Not save
				] // Note that only ONE argument encoded is sent
			];

		// Update all data in PostgreSQL with new format
			$updates->$v->run_scripts[] = (object)[
				'info'			=> 'Update all data in PostgreSQL with new v7 format (SAVE DATA IGNORING FOUND ERRORS)',
				'script_class'	=> 'v6_to_v7',
				'script_method'	=> 'delete_v6_db_indexes',
				'stop_on_error'	=> false,
				'script_vars'	=> [
				] // Note that only ONE argument encoded is sent
			];




$v=672; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 7;
	$updates->$v->version_minor			= 2;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 7;
	$updates->$v->update_from_minor		= 1;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.matrix_list;
		');
