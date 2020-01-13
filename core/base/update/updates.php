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
	$updates->$v->update_from_medium = 1;
	$updates->$v->update_from_minor  = 4;

# DATABASE UPDATES
	/*
	// alter the null option of the parent colum in jer_dd (NULL is now allowed)
		$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
			ALTER TABLE \"jer_dd\"
			ALTER \"parent\" TYPE character varying(32),
			ALTER \"parent\" DROP DEFAULT,
			ALTER \"parent\" DROP NOT NULL;
			COMMENT ON COLUMN \"jer_dd\".\"parent\" IS '';
			COMMENT ON TABLE \"jer_dd\" IS '';
		");

	// create the matrix_tools
		$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
		CREATE TABLE IF NOT EXISTS public.matrix_tools
		(
		   LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
		)
		WITH (OIDS = FALSE);
		CREATE SEQUENCE IF NOT EXISTS matrix_tools_id_seq;
		ALTER TABLE public.matrix_tools ALTER COLUMN id SET DEFAULT nextval('matrix_tools_id_seq'::regclass);

		DROP INDEX IF EXISTS \"matrix_tools_expr_idx3\", \"matrix_tools_expr_idx2\", \"matrix_tools_expr_idx1\", \"matrix_tools_expr_idx\", \"matrix_tools_id_idx1\";
		");
	*/
	// drop the old matrix_stat
		$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
			DROP TABLE IF EXISTS \"matrix_stat\" CASCADE;
		");

	# UPDATE COMPONENTS
		//$updates->$v->components_update = ['component_security_access'];	// Force convert from string to array

# DATABASE UPDATES
	require_once( dirname(dirname(__FILE__)) .'/upgrade/class.security_v5_to_v6.php');

	# Update datos to section_data
	$script_obj = new stdClass();
		$script_obj->info   		= "Convert dato of some components (component_security_areas, component_security_access), to new dato format";
		$script_obj->script_class   = "security_v5_to_v6";
		$script_obj->script_method  = "convert_table_data_profiles";
		$script_obj->script_vars    = json_encode(['component_security_areas','component_security_access']); // Note that only ONE argument encoded is sended
	$updates->$v->run_scripts[] = $script_obj;


	# Update datos to section_data
	$script_obj = new stdClass();
		$script_obj->info   		= "Convert dato of some components (component_profile, component_security_administration, component_filter_records), to new standard locator format";
		$script_obj->script_class   = "security_v5_to_v6";
		$script_obj->script_method  = "convert_table_data_users";
		$script_obj->script_vars    = json_encode(['component_profile','component_security_administration','component_filter_records']); // Note that only ONE argument encoded is sended
	$updates->$v->run_scripts[] = $script_obj;

	require_once( dirname(dirname(__FILE__)) .'/upgrade/class.activity_v5_to_v6.php');

	# Update datos to section_data
	$script_obj = new stdClass();
		$script_obj->info   		= "Convert the old dato format of some components dd546, dd545 (component_autocomplete_ts), to new standard component_autocomplete format";
		$script_obj->script_class   = "activity_v5_to_v6";
		$script_obj->script_method  = "convert_table_data_activity";
		$script_obj->script_vars    = json_encode(['component_autocomplete_ts']); // Note that only ONE argument encoded is sended
	$updates->$v->run_scripts[] = $script_obj;




$v=514; #####################################################################################
$updates->$v = new stdClass();


	# UPDATE TO
	$updates->$v->version_major 	 = 5;
	$updates->$v->version_medium 	 = 1;
	$updates->$v->version_minor 	 = 4;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 5;
	$updates->$v->update_from_medium = 1;
	$updates->$v->update_from_minor  = 2;


	# Update datos to section_data
	$script_obj = new stdClass();
		$script_obj->info   		= "Delete the old data from component_filter (project) into dd265";
		$script_obj->script_class   = "tool_administration";
		$script_obj->script_method  = "delete_component_tipo_in_matrix_table";
		$script_obj->script_vars    = [
			'dd153', 'dd265', false, true, null
		]; // Note that only ONE argument as array is sended
	$updates->$v->run_scripts[] = $script_obj;


$v=512; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 5;
	$updates->$v->version_medium 	 = 1;
	$updates->$v->version_minor 	 = 2;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 5;
	$updates->$v->update_from_medium = 1;
	$updates->$v->update_from_minor  = 1;


	# UPDATE COMPONENTS
	$updates->$v->components_update = ['component_email'];	// Force convert from string to array


$v=511; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 5;
	$updates->$v->version_medium 	 = 1;
	$updates->$v->version_minor 	 = 1;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 9;
	$updates->$v->update_from_minor  = 2;


	/* en proceso !!

	# DATABASE UPDATES

	CREATE EXTENSION btree_gin;

	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
		-- DELETE DUPLICATES
		DELETE FROM relations a USING (
			SELECT MIN(id) as id, section_tipo, section_id, target_section_tipo, target_section_id, from_component_tipo
		        FROM relations
		        GROUP BY (section_tipo, section_id, target_section_tipo, target_section_id, from_component_tipo) HAVING COUNT(*) > 1
			) b
			WHERE
		    a.section_tipo = b.section_tipo
		AND a.section_id = b.section_id
		AND a.target_section_tipo = b.target_section_tipo
		AND a.target_section_id = b.target_section_id
		AND a.from_component_tipo = b.from_component_tipo
		AND a.id <> b.id ;

		-- CONSTRAIN RELATIONS ALL FIELDS
		ALTER TABLE public.relations ADD CONSTRAINT "relations_all_constraint" UNIQUE("section_tipo", "section_id", "target_section_tipo", "target_section_id", "from_component_tipo");
		");

	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query('
		CREATE INDEX matrix_time_machine_combined
	    ON public.matrix_time_machine USING btree
	    (tipo COLLATE pg_catalog."default", section_id, section_tipo COLLATE pg_catalog."default", lang COLLATE pg_catalog."default")
	    TABLESPACE pg_default;
	    ');

	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query('
		CREATE INDEX matrix_hierarchy_section_tipo_section_id_DESC
		ON public.matrix_hierarchy USING btree
		(section_tipo COLLATE pg_catalog."default", section_id DESC)
		TABLESPACE pg_default;
		');
	*/

	# Update datos to section_data
	$script_obj = new stdClass();
		$script_obj->info   		= "Propagate section info about section creation and modification to searchable components data";
		$script_obj->script_class   = "tool_administration";
		$script_obj->script_method  = "propagate_section_info_to_dato";
		$script_obj->script_vars    = []; // Note that only ONE argument as array is sended
	$updates->$v->run_scripts[] = $script_obj;



$v=492; #####################################################################################
$updates->$v = new stdClass();

	// only for compatibility

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 9;
	$updates->$v->version_minor 	 = 2;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 9;
	$updates->$v->update_from_minor  = 1;



$v=491; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 9;
	$updates->$v->version_minor 	 = 1;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 9;
	$updates->$v->update_from_minor  = 0;

	#UPDATE COMPONENTS
	$updates->$v->components_update = ['component_date'];	// Force recalculate inaccurate time



$v=490; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 9;
	$updates->$v->version_minor 	 = 0;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 8;
	$updates->$v->update_from_minor  = 3;


	#UPDATE COMPONENTS
	# Note that current update saves data directly in 'relations' container and generate table relations relations all in one pass
	# (!) Si se hizo esta actualización utilizando Dédalo versión < 4.9.9cg (31-08-2018) NO pasó por la tabla activity y por tanto los datos de proyecto no estarán actualizados.
	$updates->$v->components_update = ['component_filter_master','component_filter'];


	# DATABASE UPDATES
	require_once( dirname(dirname(__FILE__)) .'/upgrade/class.reference_dato_v47_to_relation_dato_v48.php');

	# Update datos to section_data
	$script_obj = new stdClass();
		$script_obj->info   		= "Convert dato of some reference components (component_filter), to new relation dato format (like component_relation..)";
		$script_obj->script_class   = "reference_dato_v47_to_relation_dato_v48";
		$script_obj->script_method  = "convert_table_data";
		$script_obj->script_vars    = [json_encode(['component_filter_master','component_filter']), $move_to_relations_container=false]; // Note that only ONE argument as array is sended
	$updates->$v->run_scripts[] = $script_obj;



$v=483; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 8;
	$updates->$v->version_minor 	 = 3;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 8;
	$updates->$v->update_from_minor  = 2;


	# DATABASE UPDATES
	/*$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
			CREATE TABLE \"relations\" (
			  \"id\" serial NOT NULL,
			  \"section_tipo\" character varying(254) NOT NULL,
			  \"section_id\" integer NOT NULL,
			  \"target_section_tipo\" character varying(254) NOT NULL,
			  \"target_section_id\" integer NOT NULL,
			  \"from_component_tipo\" character varying(254) NOT NULL,
			  CONSTRAINT relations_id PRIMARY KEY (id)
			);

			CREATE INDEX relations_section_id ON public.relations USING btree (section_id);
			CREATE INDEX relations_section_tipo ON public.relations USING btree (section_tipo);
			CREATE INDEX relations_target_section_id ON public.relations USING btree (target_section_id);
			CREATE INDEX relations_target_section_tipo ON public.relations USING btree (target_section_tipo);
			CREATE INDEX relations_from_component_tipo ON public.relations USING btree (from_component_tipo);

			CREATE INDEX relations_section_tipo_section_id ON public.relations USING btree (section_tipo,section_id);
			CREATE INDEX relations_target_section_tipo_target_section_id ON public.relations USING btree (target_section_tipo,target_section_id);
			CREATE INDEX relations_target_section_tipo_section_tipo ON public.relations USING btree (target_section_tipo,section_tipo);
			CREATE INDEX relations_target_section_id_section_id ON public.relations USING btree (target_section_id,section_id);
			");*/

	# DATABASE UPDATES
	require_once( dirname(dirname(__FILE__)) .'/upgrade/class.reference_dato_v47_to_relation_dato_v48.php');

	# Update datos to section_data
	$script_obj = new stdClass();
		$script_obj->info   		= "Convert dato of some reference components (component_publication, component_select_lang), to new relation dato format (like component_relation..)";
		$script_obj->script_class   = "reference_dato_v47_to_relation_dato_v48";
		$script_obj->script_method  = "convert_table_data";
		$script_obj->script_vars    = json_encode(['component_publication','component_select_lang']); // Note that only ONE argument encoded is sended
	$updates->$v->run_scripts[] = $script_obj;


	$script_obj = new stdClass();
		$script_obj->info   		= "Propagate relations to table 'relations'";
		$script_obj->script_class   = "tool_administration";
		$script_obj->script_method  = "generate_relations_table_data";
		$script_obj->script_vars    = '*';
	$updates->$v->run_scripts[] = $script_obj;



$v=482; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 8;
	$updates->$v->version_minor 	 = 2;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 8;
	$updates->$v->update_from_minor  = 1;


	# DATABASE UPDATES
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
			DROP INDEX IF EXISTS matrix_relations_idx ;
			DROP INDEX IF EXISTS matrix_users_relations_idx ;
			DROP INDEX IF EXISTS matrix_projects_relations_idx ;
			DROP INDEX IF EXISTS matrix_activities_relations_idx ;
			DROP INDEX IF EXISTS matrix_layout_main_relations_idx ;
			DROP INDEX IF EXISTS matrix_list_relations_idx ;
			DROP INDEX IF EXISTS matrix_notes_relations_idx ;
			DROP INDEX IF EXISTS matrix_profiles_relations_idx ;
			DROP INDEX IF EXISTS matrix_indexations_relations_idx ;
			DROP INDEX IF EXISTS matrix_structurations_relations_idx ;
			DROP INDEX IF EXISTS matrix_dataframe_relations_idx ;
			DROP INDEX IF EXISTS matrix_dd_relations_idx ;
			DROP INDEX IF EXISTS matrix_layout_dd_relations_idx ;
			DROP INDEX IF EXISTS matrix_activity_relations_idx ;
			DROP INDEX IF EXISTS matrix_activity_order_section_id_desc ;

			CREATE INDEX matrix_relations_idx ON matrix USING GIN ((matrix.datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_users_relations_idx ON matrix_users USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_projects_relations_idx ON matrix_projects USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_activities_relations_idx ON matrix_activities USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_layout_main_relations_idx ON matrix_layout USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_list_relations_idx ON matrix_list USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_notes_relations_idx ON matrix_notes USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_profiles_relations_idx ON matrix_profiles USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_indexations_relations_idx ON matrix_indexations USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_structurations_relations_idx ON matrix_structurations USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_dataframe_relations_idx ON matrix_dataframe USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_dd_relations_idx ON matrix_dd USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_layout_dd_relations_idx ON matrix_layout_dd USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_activity_relations_idx ON matrix_activity USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_activity_order_section_id_desc ON public.matrix_activity USING btree (section_id DESC);

			DROP INDEX IF EXISTS matrix_langs_relations_idx ;
			DROP INDEX IF EXISTS matrix_langs_hierarchy41_gin ;
			CREATE INDEX matrix_langs_relations_idx ON matrix_langs USING gin ((datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_langs_hierarchy41_gin ON matrix_langs USING GIN ((datos#>'{components, hierarchy41, dato, lg-nolan}'));

			DROP INDEX IF EXISTS matrix_hierarchy_relations_idx;
			DROP INDEX IF EXISTS matrix_hierarchy_main_relations_idx;
			CREATE INDEX matrix_hierarchy_relations_idx ON matrix_hierarchy USING GIN ((matrix_hierarchy.datos#>'{relations}') jsonb_path_ops);
			CREATE INDEX matrix_hierarchy_main_relations_idx ON matrix_hierarchy_main USING GIN ((matrix_hierarchy_main.datos#>'{relations}') jsonb_path_ops);

			DROP INDEX IF EXISTS matrix_hierarchy_section_tipo_section_id ;
			DROP INDEX IF EXISTS matrix_langs_section_tipo_section_id ;
			CREATE INDEX matrix_hierarchy_section_tipo_section_id ON public.matrix_hierarchy USING btree (section_id, section_tipo) TABLESPACE pg_default;
			CREATE INDEX matrix_langs_section_tipo_section_id ON public.matrix_langs USING btree (section_id, section_tipo) TABLESPACE pg_default;
			");
			# CREATE INDEX matrix_test_relations_idx ON matrix_test USING gin ((datos#>'{relations}') jsonb_path_ops);
			# ALTER TABLE matrix ADD UNIQUE (section_id, section_tipo);



$v=481; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 8;
	$updates->$v->version_minor 	 = 1;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 8;
	$updates->$v->update_from_minor  = 0;


	#UPDATE COMPONENTS
	$updates->$v->components_update = ['component_date'];	// Force recalculate inaccurate time



$v=480; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 8;
	$updates->$v->version_minor 	 = 0;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 7;
	$updates->$v->update_from_minor  = 1;

	# UPDATE COMPONENTS
	#$updates->$v->components_update = ['component_relation_autocomplete'];

	$alert 				 = new stdClass();
	$alert->notification = 'Warning. This update is very critical. All database data will be migrated to a new incompatible format! ';
	$alert->command 	 = 'Follow this steps:
							<br> 1 - Dédalo version. Verify that you are running version code >= 4.8
							<br> 2 - Backup. Make a complete DB backup and make sure is finished and reliable (you can use "Make backup" link above)
							<br> 3 - Run update. Remember: rewrite all data takes a long time and is a good idea here tail error log for check the progress and avoid timeout confusions.
							<br> 4 - Server. On finish, restart your http and db server to avoid undesired cache problems
							';
	$updates->$v->alert_update[] 	= $alert;


	# DATABASE UPDATES
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
			CREATE SEQUENCE IF NOT EXISTS public.relations_id_seq;

			CREATE TABLE IF NOT EXISTS \"relations\" (
			  \"id\" integer NOT NULL DEFAULT nextval('relations_id_seq'::regclass),
			  \"section_tipo\" character varying(254) NOT NULL,
			  \"section_id\" integer NOT NULL,
			  \"target_section_tipo\" character varying(254) NOT NULL,
			  \"target_section_id\" integer NOT NULL,
			  \"from_component_tipo\" character varying(254) NOT NULL,
			  CONSTRAINT relations_id PRIMARY KEY (id)
			);

			CREATE INDEX IF NOT EXISTS relations_section_id ON public.relations USING btree (section_id);
			CREATE INDEX IF NOT EXISTS relations_section_tipo ON public.relations USING btree (section_tipo);
			CREATE INDEX IF NOT EXISTS relations_target_section_id ON public.relations USING btree (target_section_id);
			CREATE INDEX IF NOT EXISTS relations_target_section_tipo ON public.relations USING btree (target_section_tipo);
			CREATE INDEX IF NOT EXISTS relations_from_component_tipo ON public.relations USING btree (from_component_tipo);

			CREATE INDEX IF NOT EXISTS relations_section_tipo_section_id ON public.relations USING btree (section_tipo,section_id);
			CREATE INDEX IF NOT EXISTS relations_target_section_tipo_target_section_id ON public.relations USING btree (target_section_tipo,target_section_id);
			CREATE INDEX IF NOT EXISTS relations_target_section_tipo_section_tipo ON public.relations USING btree (target_section_tipo,section_tipo);
			CREATE INDEX IF NOT EXISTS relations_target_section_id_section_id ON public.relations USING btree (target_section_id,section_id);
			");


	# DATABASE UPDATES
	require_once( dirname(dirname(__FILE__)) .'/upgrade/class.reference_dato_v47_to_relation_dato_v48.php');

	# Update datos to section_data
	$script_obj = new stdClass();
		$script_obj->info   		= "Convert dato of reference components like portals, autocomplete, select, etc, to new vertical dato format (like component_relation..)";
		$script_obj->script_class   = "reference_dato_v47_to_relation_dato_v48";
		$script_obj->script_method  = "convert_table_data";
		$script_obj->script_vars    = json_encode(['component_autocomplete','component_autocomplete_hi','component_check_box','component_portal','component_radio_button','component_select']); // Note that only ONE argument encoded is sended


	$updates->$v->run_scripts[] = $script_obj;



$v=471; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 7;
	$updates->$v->version_minor 	 = 1;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 7;
	$updates->$v->update_from_minor  = 0;

	# DATABASE UPDATES
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									CREATE OR REPLACE FUNCTION check_array_component(condition bool, component_path jsonb)
									  RETURNS SETOF jsonb AS $$
									BEGIN
									  IF condition THEN
									    RETURN QUERY SELECT jsonb_array_elements(component_path);
									  ELSE
									    RETURN QUERY SELECT component_path;
									  END IF;
									END$$ LANGUAGE plpgsql;
									");
	// IMMUTABLE

	#UPDATE COMPONENTS
	#



$v=470; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 7;
	$updates->$v->version_minor 	 = 0;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 5;
	$updates->$v->update_from_minor  = 1;

	# DATABASE UPDATES
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									CREATE TABLE IF NOT EXISTS public.matrix_dataframe
									(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
									WITH (OIDS = FALSE);
									CREATE SEQUENCE matrix_dataframe_id_seq;
									ALTER TABLE public.matrix_dataframe ALTER COLUMN id SET DEFAULT nextval('matrix_dataframe_id_seq'::regclass);
									");

	#UPDATE COMPONENTS
	$updates->$v->components_update = ['component_date'];



$v=451; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 5;
	$updates->$v->version_minor 	 = 1;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 5;
	$updates->$v->update_from_minor  = 0;


	# DATABASE UPDATES
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									CREATE TABLE IF NOT EXISTS public.matrix_indexations
									(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
									WITH (OIDS = FALSE);
									CREATE SEQUENCE matrix_indexations_id_seq;
									ALTER TABLE public.matrix_indexations ALTER COLUMN id SET DEFAULT nextval('matrix_indexations_id_seq'::regclass);
									");

	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									CREATE TABLE IF NOT EXISTS public.matrix_structurations
									(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
									WITH (OIDS = FALSE);
									CREATE SEQUENCE matrix_structurations_id_seq;
									ALTER TABLE public.matrix_structurations ALTER COLUMN id SET DEFAULT nextval('matrix_structurations_id_seq'::regclass);
									");



$v=450; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 5;
	$updates->$v->version_minor 	 = 0;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 23;

	# DATABASE UPDATES
	/*

	*/

	# RUN_SCRIPTS
	# Order is important !

	/*
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ts','no'); // prefijo, esmodelo
	$updates->$v->run_scripts[] = $script_obj;
	*/
	/*
	# LANGS (RUN ALWAYS BEFORE HIERARCHY_MAIN !!)
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','si');
	$updates->$v->run_scripts[] = $script_obj;
	*/

	/*
	# TS
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ts','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ts','si');
	$updates->$v->run_scripts[] = $script_obj;
	*/
	# HIERARCHY : ALL TOPONYMS
	/*
	/*
	# Andorra
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ad','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ad','si');
	$updates->$v->run_scripts[] = $script_obj;
	*/
	/*
	# Cuba
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('cu','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('cu','si');
	$updates->$v->run_scripts[] = $script_obj;
	*/
	/*
	# Portugal
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('pt','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('pt','si');
	$updates->$v->run_scripts[] = $script_obj;

	/*
	# USA
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('us','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('us','si');
	$updates->$v->run_scripts[] = $script_obj;
	*/
	/*
	# France
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('fr','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('fr','si',false);
	$updates->$v->run_scripts[] = $script_obj;
	*/
	/*
	# Spain
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('es','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('es','si');
	$updates->$v->run_scripts[] = $script_obj;
	*/
	/*
	# Algeria
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('dz','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('dz','si');
	$updates->$v->run_scripts[] = $script_obj;
	*/
	/*
	# Morocco
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ma','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ma','si');
	$updates->$v->run_scripts[] = $script_obj;

	#$updates->$v->run_scripts = $scripts;*/



$v=4023; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 23;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 22;


	# DATABASE UPDATES
	# Create trigram text extension for gin index
	$alert 					= new stdClass();

	$alert->notification 	= 'Before run this update, please copy and run the SQL command bellow into the PostgresSQL with superuser rights (Dédalo can\'t do this action because it can\'t scale privileges)
	After this, run update normally';
	$alert->command 		= PHP_EOL.sanitize_query("
									CREATE EXTENSION pg_trgm;
									");

	$updates->$v->alert_update[] 	= $alert;



	# Create INMUTABLE function f_unaccent that replace MUTABLE / STABLE unaccent function
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query('
									CREATE OR REPLACE FUNCTION f_unaccent(text)
									RETURNS text AS
									$func$
									SELECT public.unaccent(\'public.unaccent\', $1)   -- schema-qualify function and dictionary
									$func$  LANGUAGE sql IMMUTABLE;
									');
	# Create index for component_autocomplete_hi search
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									CREATE INDEX matrix_hierarchy_term ON matrix_hierarchy USING gin(f_unaccent(datos#>>'{components, hierarchy25, dato}') gin_trgm_ops);
									");



$v=4022; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 22;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 21;


	#UPDATE COMPONENTS
	# Order is important !
	$updates->$v->components_update = ['component_password'];



$v=4021; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 21;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 20;


	#UPDATE COMPONENTS
	# Order is important !
	$updates->$v->components_update = ['component_input_text'];

	# DATABASE UPDATES
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									UPDATE \"matrix_users\" SET
										\"datos\" = jsonb_set (datos, '{components,dd132,dato,lg-nolan}', jsonb '[\"root\"]')
										WHERE \"id\" = '-1';
									");



$v=4020; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 20;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 19;

	# DATABASE UPDATES
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									CREATE INDEX matrix_relations_idx ON matrix USING gin ((datos#>'{relations}'));
									CREATE INDEX matrix_langs_relations_idx ON matrix_langs USING gin ((datos#>'{relations}'));
									CREATE INDEX matrix_langs_hierarchy41_gin  ON matrix_langs USING GIN ((datos#>'{components, hierarchy41, dato, lg-nolan}'));
									CREATE INDEX matrix_hierarchy_relations_idx ON matrix_hierarchy USING gin ((datos#>'{relations}'));
									CREATE INDEX matrix_hierarchy_main_relations_idx ON matrix_hierarchy_main USING gin ((datos#>'{relations}'));
									CREATE INDEX matrix_hierarchy63_gin ON matrix_hierarchy USING GIN ((datos#>'{components, hierarchy63, dato, lg-nolan}'));
									");

	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									CREATE TABLE public.matrix_notes
									(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
									WITH (OIDS = FALSE);
									CREATE SEQUENCE matrix_notes_id_seq;
									ALTER TABLE public.matrix_notes ALTER COLUMN id SET DEFAULT nextval('matrix_notes_id_seq'::regclass);
									");



$v=4019; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 19;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 18;

	# DATABASE UPDATES
	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
									CREATE INDEX matrix_langs_relations_idx ON matrix_langs USING gin ((datos #> '{relations}'));
									CREATE INDEX matrix_hierarchy_relations_idx ON matrix_hierarchy USING gin ((datos #> '{relations}'));
									CREATE INDEX matrix_hierarchy_main_relations_idx ON matrix_hierarchy_main USING gin ((datos #> '{relations}'));
									");



$v=4018; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 18;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 17;


	$scripts = array();

	# LANGS
	/*
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','no');
	$updates->$v->run_scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','si');
	$updates->$v->run_scripts[] = $script_obj;
	*/

	# HIERARCHY_MAIN (LANGS MUST HAVE BEEN INSTALLED BEFORE!!! )
	$script_obj = new stdClass();
		$script_obj->info   		= "Add records of hierarchy from jerarquias v3 to hierarchy v4. Note: Langs must have been installed before!";
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jerarquia_from_4_0_to_4_1";
	$updates->$v->run_scripts[] = $script_obj;

	$script_obj = new stdClass();
		$script_obj->info   		= "Configure hierarchy section 'langs' ";
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "set_lang_hierarchy";
		$script_obj->script_vars    = array();
	$updates->$v->run_scripts[] = $script_obj;



$v=4017; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 17;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 16;

	$updates->$v->SQL_update[] = PHP_EOL.sanitize_query(' CREATE TABLE IF NOT EXISTS "matrix_langs"
									(
									LIKE matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE
									)
									WITH (OIDS = FALSE);
									CREATE SEQUENCE matrix_langs_id_seq;
									ALTER TABLE matrix_langs ALTER COLUMN id SET DEFAULT nextval(\'matrix_langs_id_seq\'::regclass);
									CREATE INDEX matrix_lang_code ON matrix_langs USING btree ((datos#>>\'{components, hierarchy41, dato, lg-nolan}\')); ');


	# LANGS (RUN ALWAYS BEFORE HIERARCHY_MAIN !!)
	$script_obj = new stdClass();
		$script_obj->info   		= "Add records of langs from thesaurus v3 to v4";
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','no');
	$updates->$v->run_scripts[] = $script_obj;

	$script_obj = new stdClass();
		$script_obj->info   		= "Add records of langs models from thesaurus v3 to v4";
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','si');
	$updates->$v->run_scripts[] = $script_obj;



$v=4016; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 16;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 15;


	#$updates->$v->SQL_update[]  = ' ALTER TABLE public.main_dd ADD CONSTRAINT tld UNIQUE(tld); ';

	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query('
									DROP INDEX public.matrix_activity_id_btree;
									CREATE INDEX matrix_activity_order_id_asc
										 ON public.matrix_activity
										 USING btree
										 (id NULLS FIRST);
									CREATE INDEX matrix_activity_order_id_desc
										 ON public.matrix_activity
										 USING btree
										 (id DESC NULLS LAST); ');

	#$updates->$v->SQL_update[] = ' DROP INDEX matrix_hierarchy_relations_idx; ';
	#$updates->$v->SQL_update[] = ' CREATE INDEX matrix_hierarchy_relations_idx ON matrix_hierarchy USING gin ((datos #> \'{relations}\')); ';



$v=4015; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 15;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 14;


	# MATRIX TIME MACHINE Create indexes
	$updates->$v->SQL_update[] = '
		CREATE INDEX matrix_time_machine_section_id ON matrix_time_machine USING btree (section_id DESC NULLS LAST);
		CREATE INDEX matrix_time_machine_section_tipo ON matrix_time_machine USING btree (section_tipo);
		CREATE INDEX matrix_time_machine_tipo ON matrix_time_machine USING btree (tipo);
		CREATE INDEX matrix_time_machine_lang ON matrix_time_machine USING btree (lang);
		CREATE INDEX matrix_time_machine_timestamp ON matrix_time_machine USING btree (timestamp DESC NULLS LAST);
		CREATE INDEX "matrix_time_machine_userID" ON matrix_time_machine USING btree ("userID");
		CREATE INDEX matrix_time_machine_state ON matrix_time_machine USING btree (state);
		CREATE INDEX matrix_time_machine_datos_gin  ON matrix_time_machine USING gin (dato jsonb_path_ops);
		';



$v=4014; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 14;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 12;

	# DATABASE UPDATES
	# Create trigram text extension for gin index
	$alert = new stdClass();
		$alert->notification 	= 'Before run this update, please copy and run the SQL command bellow into the PostgresSQL with superuser rights (Dédalo can\'t do this action because it can\'t scale privileges)
								  After this, run update normally';
		$alert->command 		= PHP_EOL.sanitize_query("CREATE EXTENSION unaccent;");
	$updates->$v->alert_update[]= $alert;


	$updates->$v->SQL_update[] = PHP_EOL.sanitize_query(' CREATE TABLE IF NOT EXISTS "matrix_hierarchy"
			( LIKE matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS )
			WITH (OIDS = FALSE);
			CREATE SEQUENCE matrix_hierarchy_id_seq;
			ALTER TABLE matrix_hierarchy ALTER COLUMN id SET DEFAULT nextval(\'matrix_hierarchy_id_seq\'::regclass); ');

	$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query('	CREATE TABLE IF NOT EXISTS  "matrix_hierarchy_main"
			( LIKE matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS )
			WITH (OIDS = FALSE);
			CREATE SEQUENCE matrix_hierarchy_main_id_seq;
			ALTER TABLE matrix_hierarchy_main ALTER COLUMN id SET DEFAULT nextval(\'matrix_hierarchy_main_id_seq\'::regclass); ');

	#$updates->$v->SQL_update[] 	= 'CREATE EXTENSION unaccent';

	#$updates->$v->SQL_update[] 	= ' INSERT INTO "main_dd" ("tld", "counter", "name") VALUES (\'hierarchy\', 0, \'hierarchy\');';

	#UPDATE COMPONENTS
	# Order is important !
	$updates->$v->components_update = ['component_date'];



$v=4012; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 12;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 11;


	$updates->$v->SQL_update[] = PHP_EOL.sanitize_query(' CREATE TABLE IF NOT EXISTS "matrix_langs"
									(
									LIKE matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE
									)
									WITH (OIDS = FALSE);
									CREATE SEQUENCE matrix_langs_id_seq;
									ALTER TABLE matrix_langs ALTER COLUMN id SET DEFAULT nextval(\'matrix_langs_id_seq\'::regclass);
									CREATE INDEX matrix_lang_code ON matrix_langs USING btree ((datos#>>\'{components, hierarchy41, dato, lg-nolan}\')); ');

	#UPDATE COMPONENTS
	# Order is important !
	$updates->$v->components_update = ['component_select_lang','component_project_langs'];



$v=4011; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 11;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 10;


	#UPDATE COMPONENTS
	# Order is important !
	$updates->$v->components_update = ['component_security_access','component_security_areas'];



	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS public.jer_ds (
										LIKE public.jer_ts INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
								  	) WITH (OIDS = FALSE) ';
	$updates->$v->SQL_update[] 	= ' CREATE SEQUENCE jer_ds_id_seq ';
	$updates->$v->SQL_update[] 	= ' ALTER TABLE public.jer_ds ALTER COLUMN id SET DEFAULT nextval(\'jer_ds_id_seq\'::regclass) ';
	$updates->$v->SQL_update[] 	= ' UPDATE jerarquia_tipos SET id = 8 WHERE id = 7 ';
	$updates->$v->SQL_update[] 	= ' UPDATE jerarquia SET tipo = 8 WHERE tipo = 7 ';
	$updates->$v->SQL_update[] 	= ' INSERT INTO "jerarquia_tipos" ("id", "nombre", "orden") VALUES (\'7\', \'Semantic\', \'7\') ';
	$updates->$v->SQL_update[] 	= ' INSERT INTO "jerarquia" ("alpha3", "alpha2", "nombre", "tipo", "activa", "mainLang") VALUES (\'DSE\', \'DS\', \'Semantic\', \'7\', \'si\', \'lg-spa\') ';

	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS "matrix_test"
									(
									LIKE matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
									)
									WITH (OIDS = FALSE);
									CREATE SEQUENCE matrix_test_id_seq;
									ALTER TABLE matrix_test ALTER COLUMN id SET DEFAULT nextval(\'matrix_test_id_seq\'::regclass); ';

	/*
	$updates->$v->SQL_update[] = ' CREATE TABLE IF NOT EXISTS "matrix_langs"
									(
									LIKE matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE
									)
									WITH (OIDS = FALSE);
									CREATE SEQUENCE matrix_langs_id_seq;
									ALTER TABLE matrix_langs ALTER COLUMN id SET DEFAULT nextval(\'matrix_langs_id_seq\'::regclass);
									CREATE INDEX matrix_lang_code ON matrix_langs USING btree ((datos#>>\'{components, hierarchy41, dato, lg-nolan}\')); ';
	*/


$v=4010; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 10;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 9;


	#UPDATE COMPONENTS
	$updates->$v->components_update = ['component_date'];


	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS "matrix_notifications" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_notifications_id PRIMARY KEY(id)
									) ';

	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS "matrix_updates" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_updates_id PRIMARY KEY(id)
									) ';



$v=409; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major 	 = 4;
	$updates->$v->version_medium 	 = 0;
	$updates->$v->version_minor 	 = 9;

	# MINIM UPDATE FROM
	$updates->$v->update_from_major  = 4;
	$updates->$v->update_from_medium = 0;
	$updates->$v->update_from_minor  = 8;


	#UPDATE COMPONENTS
	$updates->$v->components_update = [];

	#UPDATE COMPONENTS
	$updates->$v->SQL_update[] 	= ' CREATE TABLE IF NOT EXISTS "matrix_notifications" (
										"id" serial NOT NULL,
										"datos" jsonb NULL,
										CONSTRAINT matrix_notifications_id PRIMARY KEY(id)
									) ';
	$updates->$v->SQL_update[] 	= ' INSERT INTO "matrix_notifications" ("datos") VALUES (\'[]\') ';



