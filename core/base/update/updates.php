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


$v=661; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 6;
	$updates->$v->version_minor			= 1;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 6;
	$updates->$v->update_from_minor		= 0;


	$script_obj = new stdClass();
		$script_obj->info			= "Remove the tool transcription configuration";
		$script_obj->script_class	= "tools_register";
		$script_obj->script_method	= "remove_tool_configuration";
		$script_obj->script_vars	= [
			'tool_transcription'
		]; // Note that only ONE argument encoded is sent
	$updates->$v->run_scripts[] = $script_obj;

	// converts matrix_notifications logged table to unlogged for faster write performance
	// used for notifications only (lock component, user process id)
	$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
		ALTER TABLE "matrix_notifications" SET UNLOGGED;
	');



$v=660; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 6;
	$updates->$v->version_minor			= 0;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 5;
	$updates->$v->update_from_minor		= 2;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.jer_dd;
		');



$v=652; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 5;
	$updates->$v->version_minor			= 2;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 5;
	$updates->$v->update_from_minor		= 1;

	$alert					= new stdClass();
		$alert->notification	= 'V '.$v;

		$alert->command			= '';

		$alert->command .= "
			<h1>🧐 IMPORTANT! Please read carefully before applying this update:</h1>
			<p>
			<strong>This update will move your data from old thesaurus peri1 to dc1.</strong>
			</p>
			<p>
			If you are using the chronological hierarchy peri1, it was totally deprecated and obsolete.
			This update will change your data to set it as general dc1 thesaurus.
			Please review your hierarchy definitions according to this change, you can find more information <a href=\"https://agora.dedalo.dev/d/213\"> here</a>.
			</p>
		";
		$updates->$v->alert_update[] = $alert;

	// 1 move tld's from peri1 to dc1

		$ar_tables = [
			// 'new_matrix'
			'matrix',
			'matrix_activities',
			'matrix_activity',
			'matrix_counter',
			'matrix_dataframe',
			'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_indexations',
			'matrix_layout',
			'matrix_layout_dd',
			'matrix_list',
			'matrix_nexus',
			'matrix_nexus_main',
			'matrix_notes',
			'matrix_profiles',
			'matrix_projects',
			'matrix_stats',
			'matrix_time_machine'
		];

		$json_files =[
			'chronological_hierarchy_peri1_to_dc1.json'
		];

		$script_obj = new stdClass();
			$script_obj->info			= "Change tld's from peri thesaurus to dc";
			$script_obj->script_class	= "transform_data";
			$script_obj->script_method	= "changes_in_tipos";
			$script_obj->script_vars	= [
				$ar_tables,
				$json_files
			]; // Note that only ONE argument encoded is sent
		$updates->$v->run_scripts[] = $script_obj;



$v=651; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 5;
	$updates->$v->version_minor			= 1;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 5;
	$updates->$v->update_from_minor		= 0;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.jer_dd;
		');



$v=650; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 5;
	$updates->$v->version_minor			= 0;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 4;
	$updates->$v->update_from_minor		= 5;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;

		$alert->command			= '';

		$alert->command .= "
			<h1>🧐 IMPORTANT! Please read carefully before applying this update:</h1>
			<p>
			<strong>A new ontology and thesaurus data model.</strong>
			</p>
			<p>
			This version changes the parent/children data model of the Ontology and Thesaurus sections.
			These sections now use the parent model instead of children model.
			This update will move all child relationships to parent relationships.
			</p>
			<br>
			<p>
			<strong>Bad definitions could stop the process.</strong>
			</p>
			<p>
			The update changes your data, and it could has errors or bad definitions in local Ontologies.
			We recommend to show the PHP log to detect terms with bad data or definition.
			<br>
			If you find some term that stop the process you can use the variable <strong>\$to_skip</strong> in:
			<pre>
			./dedalo/core/base/upgrade/transform_data_v6_5_0->check_all_order_components_in_ontology()
			</pre>
			And fix it manually after the update.
			</p>
			<br>
			<p>
			<strong>Root nodes.</strong>
			</p>
			<p>
			The root nodes (top nodes) dependent of the hierarchy will be removed.
			Now the hierarchy doesn't use the relation_children to point the root nodes instead it uses a component_autocomplete_hi.
			The script number <strong>3 add_root_node</strong>(the last one) will create a new node in the thesaurus and link the children to it when the top nodes are more than 1.
			The situation is explained <a href=\"https://agora.dedalo.dev/d/181-thesaurus-data-model\"> here.</a>
			</p>
			<p>
			If you don't want this behavior, uncheck this process and your thesaurus structure will be preserved as is, but without the hierarchy node.
			</p>
			<p>
			<strong>Update the ontology AFTER running the scripts.</strong>
			</p>
			After running the updates of all data, log out and log in and update the ontology. Version 6.5.0 has enhancements only available when the code, data and ontology have the same version.
			If you do not update the ontology after the data update, you may get some errors in the indexing tool.
			<p>
			</p>

		";
		$updates->$v->alert_update[] = $alert;

	// Create matrix_ontology indexes. Mandatory to resolve children data
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_fct_st_si
			ON public.matrix_ontology USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_st_si
			ON public.matrix_ontology USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_ty_st
			ON public.matrix_ontology USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_ontology_relations_flat_ty_st_si
			ON public.matrix_ontology USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_ontology_term
			ON public.matrix_ontology USING gin
			(f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops)
			TABLESPACE pg_default;
		');

	// Create matrix_langs indexes. Mandatory to resolve children data
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_fct_st_si
			ON public.matrix_langs USING gin
			(relations_flat_fct_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_st_si
			ON public.matrix_langs USING gin
			(relations_flat_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_ty_st
			ON public.matrix_langs USING gin
			(relations_flat_ty_st(datos) jsonb_path_ops)
			TABLESPACE pg_default;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_langs_relations_flat_ty_st_si
			ON public.matrix_langs USING gin
			(relations_flat_ty_st_si(datos) jsonb_path_ops)
			TABLESPACE pg_default;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			CREATE INDEX IF NOT EXISTS matrix_langs_term
			ON public.matrix_langs USING gin
			(f_unaccent(datos #>> \'{components,hierarchy25,dato}\'::text[]) COLLATE pg_catalog."default" gin_trgm_ops)
			TABLESPACE pg_default;
		');


	// RUN_SCRIPTS
		// DATA INSIDE DATABASE UPDATES
		// swaps data between component_relation_children and  component_relation_parent (v6.5 model)
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data_v6_5_0.php';

		// check if the component_childen and component_parent section has an order component
			$script_obj = new stdClass();
				$script_obj->info			= "Check if the update can run safely with the current ontology definition, the sections with parent/children component has to have an order component";
				$script_obj->script_class	= "transform_data_v6_5_0";
				$script_obj->script_method	= "check_all_order_components_in_ontology";
				$script_obj->stop_on_error	= true;
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;


		// swaps data between component_relation_children and  component_relation_parent (v6.5 model)
			$script_obj = new stdClass();
				$script_obj->info			= "Set component parent data with the component children data. Set all thesaurus data as parent relation model, able to be independent hierarchies to implement local ontologies";
				$script_obj->script_class	= "transform_data_v6_5_0";
				$script_obj->script_method	= "update_parent_with_children_data";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// add new root node with hierarchy name
			$script_obj = new stdClass();
				$script_obj->info			= "Add new node in the hierarchies that has multiple root nodes, unify the criteria of the thesaurus";
				$script_obj->script_class	= "transform_data_v6_5_0";
				$script_obj->script_method	= "add_root_node";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;



$v=645; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 4;
	$updates->$v->version_minor			= 5;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 4;
	$updates->$v->update_from_minor		= 4;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.jer_dd;
		');



$v=644; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 4;
	$updates->$v->version_minor			= 4;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 4;
	$updates->$v->update_from_minor		= 3;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.jer_dd;
		');



$v=643; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 4;
	$updates->$v->version_minor			= 3;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 4;
	$updates->$v->update_from_minor		= 2;

	// UPDATE COMPONENTS
		$updates->$v->components_update = [
			'component_dataframe'
		];	// Force convert from string to array

	// RUN_SCRIPTS
		// DATA INSIDE DATABASE UPDATES
		// update time machine data. Update 'data' of time_machine for comopnent_dataframe
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Update data of time_machine of component_dataframe, add section_tipo_key to its data";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "update_dataframe_tm_to_v6_4_3";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;



$v=642; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 4;
	$updates->$v->version_minor			= 2;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 4;
	$updates->$v->update_from_minor		= 1;

	// Re-index and vacuum tables
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.jer_dd;
		');



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
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			REINDEX TABLE public.matrix_dd;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			REINDEX TABLE public.jer_dd;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.matrix_dd;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
			VACUUM FULL VERBOSE ANALYZE public.jer_dd;
		');
		$updates->$v->SQL_update[] = PHP_EOL.sanitize_query('
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
