<?php
#
# UPDATES CONTROL
#
global $updates;
$updates = new stdClass();


/// UPDATE 6 PROVISIONAL WITH THE PARTIAL UPDATES THAN WILL BE NECESARY

$v=600; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 6;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 0;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 5;
	$updates->$v->update_from_medium = 8;
	$updates->$v->update_from_minor  = 2;


	# component_relation_index. Update datos with relation_index
		require_once( dirname(dirname(__FILE__)) .'/upgrade/class.relation_index_v5_to_v6.php');
		$script_obj = new stdClass();
			$script_obj->info   		= "Change the component_relation_related_index data inside thesaurus to resources section data";
			$script_obj->script_class   = "relation_index_v5_to_v6";
			$script_obj->script_method  = "change_component_dato";
			$script_obj->script_vars    = json_encode([]); // Note that only ONE argument encoded is sent
		$updates->$v->run_scripts[] = $script_obj;


	# UPDATE COMPONENTS
		$updates->$v->components_update = ['component_json','component_image','component_text_area'];	// Force convert from string to array


	# DATABASE UPDATES
		// alter the null option of the parent column in jer_dd (NULL is now allowed)
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				ALTER TABLE \"jer_dd\"
				ALTER \"parent\" TYPE character varying(32),
				ALTER \"parent\" DROP DEFAULT,
				ALTER \"parent\" DROP NOT NULL;
				COMMENT ON COLUMN \"jer_dd\".\"parent\" IS '';
				COMMENT ON TABLE \"jer_dd\" IS '';
			");

		// create the matrix_tools table
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_tools
				(
				   LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
				)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE IF NOT EXISTS matrix_tools_id_seq;
				ALTER TABLE public.matrix_tools ALTER COLUMN id SET DEFAULT nextval('matrix_tools_id_seq'::regclass);

				DROP INDEX IF EXISTS \"matrix_tools_expr_idx3\", \"matrix_tools_expr_idx2\", \"matrix_tools_expr_idx1\", \"matrix_tools_expr_idx\", \"matrix_tools_id_idx1\";
			");

		// create the matrix_test table
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_test
				(
				   LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
				)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE IF NOT EXISTS matrix_test_id_seq;
				ALTER TABLE public.matrix_test ALTER COLUMN id SET DEFAULT nextval('matrix_test_id_seq'::regclass);
			");

		// drop the old matrix_stat
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				DROP TABLE IF EXISTS \"matrix_stat\" CASCADE;
			");


	# DATA INSIDE DATABASE UPDATES
		# clean_section_and_component_dato. Update datos to section_data
			require_once( dirname(dirname(__FILE__)) .'/upgrade/class.data_v5_to_v6.php');
			$script_obj = new stdClass();
				$script_obj->info   		= "Remove unused section data and update/clean some properties";
				$script_obj->script_class   = "data_v5_to_v6";
				$script_obj->script_method  = "clean_section_and_component_dato";
				$script_obj->script_vars    = json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;


		# convert_table_data_profiles. Update datos to section_data
			require_once( dirname(dirname(__FILE__)) .'/upgrade/class.security_v5_to_v6.php');
			$script_obj = new stdClass();
				$script_obj->info   		= "Convert dato of some components (component_security_areas, component_security_access), to new dato format";
				$script_obj->script_class   = "security_v5_to_v6";
				$script_obj->script_method  = "convert_table_data_profiles";
				$script_obj->script_vars    = json_encode(['component_security_areas','component_security_access']); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;


		# convert_table_data_users. Update datos to section_data
			#require_once( dirname(dirname(__FILE__)) .'/upgrade/class.security_v5_to_v6.php');
			$script_obj = new stdClass();
				$script_obj->info   		= "Convert dato of some components (component_profile, component_security_administration, component_filter_records), to new standard locator format";
				$script_obj->script_class   = "security_v5_to_v6";
				$script_obj->script_method  = "convert_table_data_users";
				$script_obj->script_vars    = json_encode(['component_profile','component_security_administration','component_filter_records']); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;


		# convert_table_data_activity. Update datos to section_data
			require_once( dirname(dirname(__FILE__)) .'/upgrade/class.activity_v5_to_v6.php');
			$script_obj = new stdClass();
				$script_obj->info			= "Convert the old dato format of some components dd546, dd545 (component_autocomplete_ts), to new standard component_autocomplete format";
				$script_obj->script_class	= "activity_v5_to_v6";
				$script_obj->script_method	= "convert_table_data_activity";
				$script_obj->script_vars	= json_encode(['component_autocomplete_ts']); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;


