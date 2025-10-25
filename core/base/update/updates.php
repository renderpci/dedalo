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



$v=680; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 8;
	$updates->$v->version_minor			= 0;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 7;
	$updates->$v->update_from_minor		= 4;

	// Information
		$alert = new stdClass();
		$alert->notification = 'V '.$v;

		$alert->command = '';

		// Ontology version. Check if is valid version
		$min_date				= '2025-10-23';
		$min_date_time			= new DateTime($min_date);
		$ontology_is_updated	= ontology::jer_dd_version_is_valid( $min_date );
		if ( !$ontology_is_updated ) {
			$alert->command .= "
				The Ontology is outdated. Minimum date: ".$min_date_time->format('d-m-Y')."
				<h1>
					<br>🧐 Before apply this data update, update Ontology to latest version! <br><br><br>

				</h1>
				<p>
				<strong>Ensure that you have updated the Ontology before proceeding and then, reload this page to run the scripts.</strong>
				</p>
			";
			$updates->$v->alert_update[] = $alert;
			$updates->$v->lock = true;
		}else{
			$alert->command .= "
				<h1>🧐 IMPORTANT! Please read carefully before applying this update:</h1>
				<br>
				<br>
				<p>
				<strong>1. Ensure that you have updated the Ontology before proceeding.</strong>
				</p>
				<br>
				<p>
				This update change the Numismatic model and set new Data frame for the component_iri (all URL fields).
				</p>
				<br>
				<br>
				<p>
				<strong>2. Moving data from old Denomination section <a href=\"https://dedalo.dev/ontology/numisdata33\"> numisdata33</a> to Object thesaurus object1.</strong>
				</p>
				<br>
				<p>
				If you installation is using «numisdata» ontology, this update will move your Denomination data to the Object thesaurus behind the «Coin» node and will be set as `Denomination` typology.
				</p>
				<p>
				To run this update your installation will needs:
				<br>
				1.- The Object thesaurus active
				<br>
				If you don't have the Object thesaurus, the data will be moved but you will not see the thesarus tree and the <a href=\"https://dedalo.dev/ontology/numisdata34\">Denomination</a> field in Types and the publication will fail.
				You can see the thesaurus dependences <a href=\"https://dedalo.dev/docs/config/thesaurus_dependeces/#dependencies\">here.</a>
				<br>
				2.- A `Coin` term node into the <strong>object1</strong> thesaurus tree with the <a href=\"https://dedalo.dev/ontology/hierarchy89\">URL component</a> pointing to «nomisma» defintion.
				<strong>http://nomisma.org/id/coin</strong>
				</p>
				<p>
				3.- A typology term node in <strong>object2</strong> (model thesarus) for «Denomination» with the <a href=\"https://dedalo.dev/ontology/hierarchy89\">URL component</a> pointing to «nomisma» defintion.
				<strong>https://nomisma.org/id/denomination</strong>
				</p>
				<br>
				<p>
				For more information see the <a href=\"https://agora.dedalo.dev/d/237-denominations-numisdata33\"> Àgora topic</a>
				</p>
				<p>
				Note:
				</p>
				<p>
				If your installation is not ready to run this change, you can uncheck the tree scrips behind the «run_scripts» and run they manually in the maintenance panel after you will ready to do it.
				</p>
				<p>
				The order of the scripts is important, the correct order is:
				</p>
				<p>
				<strong>denomination_numisdata33_to_matrix_hierachy.json</strong> ---> located into the «MOVE TO TABLE» maintenance panel
				</p>
				<p>
				<strong>denomination_numisdata33_to_object1.json</strong> ---> located into the «MOVE TO LOCATOR» maintenance panel
				</p>
				<p>
				<strong>denomination_components_numisdata33_to_object1.json</strong> ---> located into the «MOVE TO TLD» maintenance panel
				</p>
				<br>
				<br>
				<p>
				<strong>3. This update will get the title values of your URI fields, from all `component_iri`, and will create a new unique list with this values.</strong>
				</p>
				<br>
				<p>
				Now, all URI fields have a new data frame to be used as labels of the URI. This new behavior will process all data in your URI titles and will create a unique values into a controlled list.
				</p>
				<p>
				As this process is an automatic group of values, you will need to check the list and set possible duplicates, because the script doesn't try to unify close names, so, wikidata and wikidata.org titles will create 2 different values.
				</p>
				<p>
				The current title is not changed, is preserved to check the new label value list, but, in next versions it will be deleted. Use only the label list for the URI fields.
				</p>
				<br>
				<br>
				<p>
				<strong>4. Review your config.php file.</strong>
				</p>
				<br>
				<p>
				A new constat was added to limit the maximum request that client can open to the server for uploading chunked files.
				</p>
				<pre style=\"color:#000000;background-color: unset;border: 1px dotted #777777;padding: 1.3rem;\">
				define('DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT', 50);
				</pre>
				</p>
				<br>
				<br>
				<p>
				<strong>5. The ontology needs to be updated after proceeding.</strong>
				</p>
			";
			$updates->$v->alert_update[] = $alert;

	// execution order
		$updates->$v->execution_order = ['run_scripts', 'SQL_update', 'components_update'];

	// Change the numisdata33 to object1
	// the order of the scripts is important!
		$ar_tables = [
			// 'new_matrix'
			'matrix',
			'matrix_activities',
			'matrix_activity',
			'matrix_counter',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_list',
			'matrix_time_machine'
		];

		require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';

		// 1- change language of the URL components
			$json_files =[
				'change_component_iri_to_nolan.json'
			];

			$script_obj = new stdClass();
				$script_obj->info			= "URL translatable in thesaurus => URL non translatable and transliterable";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "change_data_lang";
				$script_obj->script_vars	= [
					$json_files
				]; // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// 2- move data between matrix. numisdata33 (section 'Denomination')
			$json_files = [
				'denomination_numisdata33_to_matrix_hierachy.json'
			];

			$script_obj = new stdClass();
				$script_obj->info			= "Move numisdata33 data between matrix tables";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "move_data_between_matrix_tables";
				$script_obj->script_vars	= [
					$json_files
				]; // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// 3- move from the numisdata33 to object1 (create new objects1 section and map the new locator with old one)
			$json_files =[
				'denomination_numisdata33_to_object1.json'
			];

			$script_obj = new stdClass();
				$script_obj->info			= "Move data from section: Denomination => Object | numisdata33 => object1";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "changes_in_locators";
				$script_obj->script_vars	= [
					$ar_tables,
					$json_files
				]; // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// 4- move from the components from numisdata33 to hierarchy
			$json_files = [
				'denomination_components_numisdata33_to_object1.json'
			];

			$script_obj = new stdClass();
				$script_obj->info			= "Change tld's from numisdata33 thesaurus to object1 (hierarchy components)";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "changes_in_tipos";
				$script_obj->script_vars	= [
					$ar_tables,
					$json_files
				]; // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

	// Add index for relations used in project filter.
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS relations_section_tipo_section_id_from_component_tipo ON public.relations USING btree (section_tipo, section_id, from_component_tipo);
		');

	// UPDATE COMPONENTS
		$updates->$v->components_update = [
			'component_iri',
			'component_dataframe'
		];
	}



$v=674; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 7;
	$updates->$v->version_minor			= 4;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 7;
	$updates->$v->update_from_minor		= 3;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.matrix_ontology;
		');



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
