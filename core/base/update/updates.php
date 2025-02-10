<?php declare(strict_types=1);
/**
* UPDATES CONTROL
* Definition of the update process
*
* Every update is a object with his own defintion
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



$v=641; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 4;
	$updates->$v->version_minor			= 1;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 4;
	$updates->$v->update_from_minor		= 0;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[]	= PHP_EOL.sanitize_query('
			REINDEX TABLE public.matrix_dd;
			REINDEX TABLE public.jer_dd;
		');
		$updates->$v->SQL_update[]	= PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.matrix_dd;
			VACUUM FULL VERBOSE ANALYZE public.jer_dd;
			VACUUM FULL VERBOSE ANALYZE public.matrix_activity;
		');



$v=640; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 4;
	$updates->$v->version_minor			= 0;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 3;
	$updates->$v->update_from_minor		= 1;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;

		$alert->command			= '';

		// Ontology version. Check if is valid version
		$min_date				= '2024-12-31';
		$min_date_time			= new DateTime($min_date);
		$ontology_is_updated	= ontology::jer_dd_version_is_valid( $min_date );
		if ( !$ontology_is_updated ) {
			$alert->command .= "
				The Ontology is outdated. Minimum date: ".$min_date_time->format('d-m-Y')."
				<h1>
					<br>🧐 Before apply this data update, update Ontology to latest version! <br><br><br>
				</h1>
			";
		}

		$alert->command .= "
			<h1>🧐 IMPORTANT! Please read carefully before applying this update:</h1>
			<p>
			<strong>A new ontology model.</strong>
			</p>
			<p>
				This update change your ontology definitions to create new schema for manage the ontology nodes.
				<strong>Backup your database before run it.</strong>
			</p>
			<p>
				Review the config definition. Some constants have been added and others removed.
			</p>
			<br>
			<p>
				1. Constants added:
			</p>
			<pre style=\"color:#000000;background-color: unset;border: 1px dotted #777777;padding: 1.3rem;\">
				// install
					define('DEDALO_INSTALL_PATH',	DEDALO_ROOT_PATH . '/install');
					define('DEDALO_INSTALL_URL',	DEDALO_ROOT_WEB . '/install');

				// Work API
					define('DEDALO_API_URL',	DEDALO_CORE_URL . '/api/v1/json/');

				// Ontology server. Defines if current server can provide his ontology files to other Dédalo servers.
					define('IS_AN_ONTOLOGY_SERVER', false);
				// Ontologies providers
					define('ONTOLOGY_SERVERS',	[
						[
							'name'	=> 'Official Dédalo Ontology server',
							'url'	=> 'https://master.dedalo.dev/dedalo/core/api/v1/json/',
							'code'	=> 'x3a0B4Y020Eg9w'
						]
					]);
				// Directory to manage input/output, export/import ontology data to sync between installations
					define('ONTOLOGY_DATA_IO_DIR',	DEDALO_INSTALL_PATH . '/import/ontology');
					define('ONTOLOGY_DATA_IO_URL',	DEDALO_INSTALL_URL . '/import/ontology');

				// Dédalo code
					define('IS_A_CODE_SERVER', false);
					// code providers
					define('CODE_SERVERS',	[
						[
							'name'	=> 'Official Dédalo code server',
							'url'	=> 'https://master.dedalo.dev/dedalo/core/api/v1/json/',
							'code'	=> 'x3a0B4Y020Eg9w'
						]
					]);
			</pre>
			<br>
			<p>
				2. Constants removed:
			</p>
			<pre style=\"color:#000000;background-color: unset;border: 1px dotted #777777;padding: 1.3rem;\">
				define('STRUCTURE_SERVER_CODE',	'x3a0B4Y020Eg9w');
				define('STRUCTURE_SERVER_URL',	'https://master.dedalo.dev/dedalo/core/extras/str_manager/');
				define('ONTOLOGY_DOWNLOAD_DIR',	DEDALO_BACKUP_PATH_ONTOLOGY . '/download');
				define('STRUCTURE_DOWNLOAD_JSON_FILE',	DEDALO_BACKUP_PATH_ONTOLOGY);
				define('DEDALO_SOURCE_VERSION_URL',	'https://master.dedalo.dev/dedalo/code/dedalo6_code.zip');
			</pre>
			<br>
			<p>
				3. <strong>Optional</strong> Only if your installation will provide a local ontologies (private ontologies that are not shared outside your installations)
			</p>
			<br>
			<p>
				In the case that you want to convert your own server as ontology provided you need to add this constant in your config.
				And defined your server code.
			</p>
			<pre style=\"color:#000000;background-color: unset;border: 1px dotted #777777;padding: 1.3rem;\">
				// Ontology server. Defines if the installation server can provide his ontology files to other Dédalo installations.
				define('IS_AN_ONTOLOGY_SERVER',	true);
				define('ONTOLOGY_SERVER_CODE',	'Here:my_valid_code_for_Ontologies');
			</pre>
		";
		$updates->$v->alert_update[] = $alert;

	// DATABASE UPDATES
		// re check if exist matrix_ontology tables:
		// Add the matrix_ontology_main table
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_ontology_main
				(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE IF NOT EXISTS matrix_ontology_main_id_seq;
				ALTER TABLE public.matrix_ontology_main ALTER COLUMN id SET DEFAULT nextval('matrix_ontology_main_id_seq'::regclass);
			");
		// Add the matrix_ontology table
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_ontology
				(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE IF NOT EXISTS matrix_ontology_id_seq;
				ALTER TABLE public.matrix_ontology ALTER COLUMN id SET DEFAULT nextval('matrix_ontology_id_seq'::regclass);
			");
		// Clean matrix_ontology tables to allow re-update more than once preserving the counters
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
				TRUNCATE "matrix_ontology";
				ALTER SEQUENCE IF EXISTS matrix_ontology_id_seq RESTART WITH 1 ;
			');
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
				TRUNCATE "matrix_ontology_main";
				ALTER SEQUENCE IF EXISTS matrix_ontology_main_id_seq RESTART WITH 1 ;
			');
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
				DELETE FROM "matrix_counter" WHERE "tipo" LIKE \'ontology%\'
			');
		// Delete the matrix_descriptors_dd table, no longer used
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				DROP TABLE IF EXISTS \"matrix_descriptors_dd\" CASCADE;
			");
		// Set parent terms with dd0 to NULL in jer_dd. Now dd0 is a virtual section of ontology1
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				UPDATE \"jer_dd\" SET \"parent\" = NULL
				WHERE \"parent\" = 'dd0';
			");

		// Add the model column to jer_dd table
			$updates->$v->SQL_update[]	= PHP_EOL.sanitize_query('
				DO $$
				BEGIN
					IF NOT EXISTS(SELECT *
						FROM information_schema.columns
						WHERE table_name=\'jer_dd\' and column_name=\'model\')
					THEN
						ALTER TABLE "jer_dd"
						ADD "model" text NULL;
						COMMENT ON TABLE "jer_dd" IS \'Model, a typology of the tipo\';
					END IF;
				END $$;
			');

	// RUN_SCRIPTS
		// DATA INSIDE DATABASE UPDATES
		// fill the model in the new model column in jer_dd
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Resolve model and fill the new model column in jer_dd";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "fill_model_column_in_jer_dd";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// clean_section_and_component_dato. Update 'datos' to section_data
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Generate main ontology sections, it get all our jer_dd distinct tld and all active hierarchies defined in hierarchy section";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "generate_all_main_ontology_sections";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;
