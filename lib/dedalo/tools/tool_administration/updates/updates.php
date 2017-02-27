<?php
#
# UPDATES CONTROL
#
global $updates;
$updates = new stdClass();



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
	$scripts = array();
	/*
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ts','no'); // prefijo, esmodelo
	$scripts[] = $script_obj;
	*/
	/*
	# LANGS (RUN ALWAYS BEFORE HIERARCHY_MAIN !!)
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','si');
	$scripts[] = $script_obj;
	*/
	
	/*
	# TS
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ts','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ts','si');
	$scripts[] = $script_obj;
	*/
	# HIERARCHY : ALL TOPONYMS
	/*
	/*
	# Andorra
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ad','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ad','si');
	$scripts[] = $script_obj;
	*/
	/*
	# Cuba
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('cu','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('cu','si');
	$scripts[] = $script_obj;
	*/
	/*
	# Portugal
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('pt','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('pt','si');
	$scripts[] = $script_obj;
	
	/*
	# USA
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('us','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('us','si');
	$scripts[] = $script_obj;
	*/
	/*
	# France
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('fr','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('fr','si',false);
	$scripts[] = $script_obj;
	*/
	/*
	# Spain
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('es','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('es','si');
	$scripts[] = $script_obj;	
	*/
	/*
	# Algeria
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('dz','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('dz','si');
	$scripts[] = $script_obj;
	*/
	/*
	# Morocco
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ma','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ma','si');
	$scripts[] = $script_obj;
	*/
	$updates->$v->run_scripts = $scripts;


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
									CREATE INDEX matrix_relations_idx ON matrix USING gin ((datos #> '{relations}'));
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

	# RUN_SCRIPTS
	# Order is important !
	$scripts = array();

	/*
	# LANGS (RUN ALWAYS BEFORE HIERARCHY_MAIN !!)
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','si');
	$scripts[] = $script_obj;
	*/
	
	/*
	# TS
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ts','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ts','si');
	$scripts[] = $script_obj;
	
	# HIERARCHY : ALL TOPONYMS
	/*
	/*
	# Andorra
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ad','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ad','si');
	$scripts[] = $script_obj;
	*/
	/*
	# Cuba
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('cu','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('cu','si');
	$scripts[] = $script_obj;
	*/
	/*
	# Portugal
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('pt','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('pt','si');
	$scripts[] = $script_obj;
	
	/*
	# USA
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('us','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('us','si');
	$scripts[] = $script_obj;
	*/
	/*
	# France
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('fr','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('fr','si',false);
	$scripts[] = $script_obj;
	*/
	/*
	# Spain
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('es','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('es','si');
	$scripts[] = $script_obj;	
	*/
	/*
	# Algeria
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('dz','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('dz','si');
	$scripts[] = $script_obj;
	*/
	/*
	# Morocco
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ma','no');
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('ma','si');
	$scripts[] = $script_obj;
	*/
	$updates->$v->run_scripts = $scripts;



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
	$scripts[] = $script_obj;
	$script_obj = new stdClass();
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jer_from_4_0_to_4_1";
		$script_obj->script_vars    = array('lg','si');
	$scripts[] = $script_obj;
	*/

	# HIERARCHY_MAIN (LANGS MUST HAVE BEEN INSTALLED BEFORE!!! )
	$script_obj = new stdClass();
		$script_obj->info   		= "Add records of hierarchy from jerarquias v3 to hierarchy v4. Note: Langs must have been installed before!";
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "update_jerarquia_from_4_0_to_4_1";
	$scripts[] = $script_obj;

	$script_obj = new stdClass();
		$script_obj->info   		= "Configure hierarchy section 'langs' ";
		$script_obj->script_class   = "hierarchy";
		$script_obj->script_method  = "set_lang_hierarchy";
		$script_obj->script_vars    = array();
	$scripts[] = $script_obj;

	$updates->$v->run_scripts = $scripts;



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
							
			

?>