<?php
/**
* HIERARCHY
*
*
*/
class hierarchy {


	// Table where hierarchy data is stored
	static $table = 'matrix_hierarchy_main';



	/**
	* GET_DEFAULT_SECTION_TIPO_TERM
	* @return 
	*/
	public static function get_default_section_tipo_term($tld) {

		return strtolower($tld) . '1';
	}//end get_default_section_tipo_term



	/**
	* GET_DEFAULT_SECTION_TIPO_MODEL
	* @return 
	*/
	public static function get_default_section_tipo_model($tld) {
		return strtolower($tld) . '2';
	}//end get_default_section_tipo_model


	
	/**
	* GENERATE_VIRTUAL_SECTION
	* Note that virtual sections not contains components, only a exclude elements term
	* @return 
	*/
	public static function generate_virtual_section( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';
		
		$options = new stdClass();
			$options->section_id   = null;
			$options->section_tipo = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$current_hierarchy_section_tipo = $options->section_tipo;
		$current_hierarchy_section_id   = $options->section_id;

		#
		# ACTIVE		
		$active_tipo 	= DEDALO_HIERARCHY_ACTIVE_TIPO;	// 'hierarchy4';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($active_tipo, true);
		$component 		= component_common::get_instance( $modelo_name,
														  $active_tipo,
														  $options->section_id,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $options->section_tipo);
		$dato 	 = (array)$component->get_dato();
		$locator = reset($dato);
				if( !isset($locator->section_tipo) || $locator->section_tipo!=DEDALO_SECTION_SI_NO_TIPO
				 || !isset($locator->section_id) || $locator->section_id!=NUMERICAL_MATRIX_VALUE_YES) {
				 	$response->result 	= false;
					$response->msg 		= label::get_label('error_generate_hierarchy'); //'Current hierarchy is not active.';
					return $response;
				}
		
		

		#
		# TLD
		$tld2_tipo 		= DEDALO_HIERARCHY_TLD2_TIPO;	//'hierarchy6';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tld2_tipo, true);
		$component 		= component_common::get_instance( $modelo_name,
														  $tld2_tipo,
														  $options->section_id,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $options->section_tipo);			
		$tld2 = strtolower($component->get_valor());
		if (empty($tld2)) {
			$response->result 	= false;
			$response->msg 		= 'Error on get tld2. Empty value (tld is mandatory)';
			return $response;
		}


		#
		# TIPOLOGY OF HIERARCHY 
		$hierarchy_type	= DEDALO_HIERARCHY_TIPOLOGY_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($hierarchy_type, true);
		$component 		= component_common::get_instance( $modelo_name,
														  $hierarchy_type,
														  $options->section_id,
														  'edit',
														  DEDALO_DATA_NOLAN,
														  $options->section_tipo);
		$hierarchy_type_dato = $component->get_dato();
		if (isset($hierarchy_type_dato[0]) && isset($hierarchy_type_dato[0]->section_id) && $hierarchy_type_dato[0]->section_id=="2") {
			$is_toponymy = true;
		}else{
			$is_toponymy = false;
		}

		#
		# NAME
		$name_tipo 		= DEDALO_HIERARCHY_TERM_TIPO;	//'hierarchy5';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($name_tipo, true);
		$component 		= component_common::get_instance( $modelo_name,
														  $name_tipo,
														  $options->section_id,
														  'edit',
														  DEDALO_DATA_LANG,
														  $options->section_tipo);
		$name = $component->get_valor();

		#
		# COMMANDS SEQUENCE
		
		#
		# VIRTUAL SECTION . Tesaurus term
		if($is_toponymy===true) {
			$current_parent = 'dd101';
		}else{
			$current_parent = DEDALO_THESAURUS_VIRTUALS_AREA_TIPO;
		}
		$default_section_tipo_term  = self::get_default_section_tipo_term($tld2);
		$options = new stdClass();
			$options->terminoID 	= $default_section_tipo_term; // $tld2.'1';
			$options->parent 		= $current_parent;	// 'dd101'; // 'hierarchy56'
			$options->modelo 		= 'dd6';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			if ($tld2==='lg') {
				# add table 'matrix_langs'
				$options->relaciones 	= json_decode('[{"dd626":"dd443"},{"dd6":"hierarchy20"}]');
			}else{
				$options->relaciones 	= json_decode('[{"dd6":"hierarchy20"}]');
			}
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= $name;

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}
		
		#
		# VIRTUAL SECTION MODELO . Model term
		$default_section_tipo_model = self::get_default_section_tipo_model($tld2);				
		$options = new stdClass();
			$options->terminoID 	= $default_section_tipo_model;	//$tld2.'2';
			$options->parent 		= DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO;	//'dd101';
			$options->modelo 		= 'dd6';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			if ($tld2==='lg') {
				# add table 'matrix_langs'
				$options->relaciones 	= json_decode('[{"dd626":"dd443"},{"dd6":"hierarchy20"}]');
			}else{
				$options->relaciones 	= json_decode('[{"dd6":"hierarchy20"}]');
			}			
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= $name . ' [m]';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-LIST . terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'3';
			$options->parent 		= $tld2.'1';
			$options->modelo 		= 'dd91';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			if ($tld2==='lg') {
				$options->relaciones = json_decode('[{"dd9":"hierarchy25"},{"dd9":"hierarchy41"},{"dd9":"hierarchy27"},{"dd10":"hierarchy28"},{"dd57":"hierarchy24"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"}]');
			}else{
				$options->relaciones = json_decode('[{"dd9":"hierarchy25"},{"dd9":"hierarchy27"},{"dd10":"hierarchy28"},{"dd57":"hierarchy24"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"}]');
			}
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Listado';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-LIST . MODELO . Model terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'4';
			$options->parent 		= $tld2.'2';
			$options->modelo 		= 'dd91';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			if ($tld2==='lg') {
				$options->relaciones = json_decode('[{"dd9":"hierarchy25"},{"dd9":"hierarchy41"},{"dd9":"hierarchy27"},{"dd10":"hierarchy28"},{"dd57":"hierarchy24"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"}]');
			}else{
				$options->relaciones = json_decode('[{"dd9":"hierarchy25"},{"dd9":"hierarchy27"},{"dd10":"hierarchy28"},{"dd57":"hierarchy24"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"}]');
			}
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Listado';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-EXLUDE-ELEMENTS . terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'5';
			$options->parent 		= $tld2.'1';
			$options->modelo 		= 'dd1129';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Excluidos';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-EXLUDE-ELEMENTS . MODELO . Model terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'6';
			$options->parent 		= $tld2.'2';
			$options->modelo 		= 'dd1129';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Excluidos';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SEARCH-LIST . terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'7';
			$options->parent 		= $tld2.'1';
			$options->modelo 		= 'dd524';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd195":"dd196"},{"dd1747":"hierarchy22"},{"dd9":"hierarchy25"},{"dd428":"hierarchy27"},{"dd57":"hierarchy23"},{"dd10":"hierarchy28"},{"dd429":"hierarchy36"},{"dd57":"hierarchy24"},{"dd57":"hierarchy26"},{"dd43":"hierarchy41"},{"dd635":"hierarchy30"},{"dd10":"hierarchy32"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"},{"dd592":"hierarchy40"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Búsqueda';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SEARCH-LIST . MODELO . Model terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'8';
			$options->parent 		= $tld2.'2';
			$options->modelo 		= 'dd524';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd195":"dd196"},{"dd1747":"hierarchy22"},{"dd9":"hierarchy25"},{"dd428":"hierarchy27"},{"dd57":"hierarchy23"},{"dd10":"hierarchy28"},{"dd429":"hierarchy36"},{"dd57":"hierarchy24"},{"dd57":"hierarchy26"},{"dd43":"hierarchy41"},{"dd635":"hierarchy30"},{"dd10":"hierarchy32"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"},{"dd592":"hierarchy40"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Búsqueda';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}

		#
		# VIRTUAL SECTION-LIST-THESAURUS . Listado thesaurus
		// USE SECTION-LIST-THESAURUS FROM REAL SECTION. ONLY OVERWRITE WHEN REALLY NEED
		$options = new stdClass();
			$options->terminoID 	= $tld2.'9';
			$options->parent 		= $tld2.'1';
			$options->modelo 		= 'dd144';	// 'dd91';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';

			// Listado Tesauro . Referecia para el nuevo elemento
			$RecordObj_dd = new RecordObj_dd('hierarchy44');	
			
			$options->relaciones 	= $RecordObj_dd->get_relaciones();	//json_decode('[{"dd57":"hierarchy24"},{"dd9":"hierarchy25"},{"dd10":"hierarchy28"},{"dd10":"hierarchy32"},{"dd10":"hierarchy33"},{"dd431":"hierarchy35"},{"dd432":"hierarchy40"},{"dd43":"hierarchy41"},{"dd57":"hierarchy23"},{"dd428":"hierarchy27"},{"dd57":"hierarchy26"}]');	
			$options->propiedades 	= $RecordObj_dd->get_propiedades();
			$options->tld2 			= $tld2;
			$options->name 			= 'Listado tesauro';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}		

		#
		# VIRTUAL SECTION-LIST-THESAURUS . MODELO . Model terms
		$options = new stdClass();
			$options->terminoID 	= $tld2.'4';
			$options->parent 		= $tld2.'2';
			$options->modelo 		= 'dd91';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->traducible 	= 'no';
			$options->relaciones 	= json_decode('[{"dd9":"hierarchy25"},{"dd9":"hierarchy27"},{"dd10":"hierarchy28"},{"dd57":"hierarchy24"},{"dd10":"hierarchy33"},{"dd530":"hierarchy35"}]');
			$options->propiedades 	= '';
			$options->tld2 			= $tld2;
			$options->name 			= 'Listado';

			$create_term = self::create_term( $options );
				if ($create_term) {
					$response->result 	 = $create_term->result;
					$response->msg 		.= $create_term->msg;
				}
		

		#
		# ROOT TERMS
		# Create first sample record in every new area (term and model)
		/*
		$create_records_options = new stdClass();
			$create_records_options->section_tipo 	= $current_hierarchy_section_tipo;
			$create_records_options->section_id 	= $current_hierarchy_section_id;
			$create_records_options->ar_sections 	= array($default_section_tipo_term, $default_section_tipo_model);
		hierarchy::create_root_terms( $create_records_options );
		*/

		


		#
		# SET PERMISSIONS
		# Allow current user access to created default sections
		$permissions_options = new stdClass();
			$permissions_options->section_tipo 	= $current_hierarchy_section_tipo;
			$permissions_options->section_id 	= $current_hierarchy_section_id;
			$permissions_options->ar_sections 	= array($default_section_tipo_term, $default_section_tipo_model);
			
		hierarchy::set_hierarchy_permissions( $permissions_options );
		
		return (object)$response;
	}//end generate_virtual_section



	/**
	* CREATE_ROOT_TERMS
	* @return bool
	*/
	protected static function create_root_terms( $request_options ) {

		$options = new stdClass();
			$options->section_tipo 	= null;
			$options->section_id 	= null;
			$options->ar_sections 	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$tipo 			= DEDALO_THESAURUS_TERM_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$section_id 	= 1;

		# Iterate sections (normally like ts1,ts2)
		foreach ((array)$options->ar_sections as $key => $current_section_tipo) {

			$section = section::get_instance($section_id,$current_section_tipo);
			$section->forced_create_record();
			
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $section_id,
															 'edit',
															 DEDALO_DATA_LANG,
															 $current_section_tipo);
			$name = ($key===0) ? "Sample term" : "Sample model";
			$component->set_dato("$name [{$current_section_tipo}-{$section_id}]");
			$component->Save();

			debug_log(__METHOD__." Created first record of thesaurus section $current_section_tipo - $section_id ".to_string(), logger::DEBUG);

			# Attach as children of current hierarchy
			$component_relation_children_tipo = ($key===0) ? DEDALO_HIERARCHY_CHIDRENS_TIPO : DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO;		
			$component_relation_children = component_common::get_instance('component_relation_children',
															 			  $component_relation_children_tipo,
															 			  $options->section_id,
															 			  'edit',
															 			  DEDALO_DATA_NOLAN,
															 			  $options->section_tipo);
			$component_relation_children->make_me_your_children( $current_section_tipo, $section_id );
			$component_relation_children->Save();

			debug_log(__METHOD__." Added first record of thesaurus section $current_section_tipo - $section_id as children of hierarchy $component_relation_children_tipo ".to_string(), logger::DEBUG);
		}

		return true;
	}//end create_root_terms



	/**
	* SET_HIERARCHY_PERMISSIONS
	* Allow current user access to created default sections
	* @return bool
	*/
	private static function set_hierarchy_permissions( $request_options ) {

		$options = new stdClass();
			$options->section_tipo 	= null;
			$options->section_id 	= null;
			$options->ar_sections 	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# user_id
		$user_id 	  = navigator::get_user_id();
		if (SHOW_DEBUG===true || $user_id<1) {
			return true;
		}

		# Profile
		$profile_id   = component_profile::get_profile_from_user_id( $user_id );
		$section_id   = $profile_id;		
		$permissions  = 2;		


		#
		# Security areas
		$component_security_areas	= component_common::get_instance('component_security_areas',
																	 DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																	 $section_id,
																	 'edit',
																	 DEDALO_DATA_NOLAN,
																	 DEDALO_SECTION_PROFILES_TIPO);
			$dato_security_areas 	= (object)$component_security_areas->get_dato();

		#
		# Security access
		$component_security_access	= component_common::get_instance('component_security_access',
																	 DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
																	 $section_id,
																	 'edit',
																	 DEDALO_DATA_NOLAN,
																	 DEDALO_SECTION_PROFILES_TIPO);
			$dato_security_access 	= (object)$component_security_access->get_dato();
		

		# Iterate sections (normally like ts1,ts2)
		foreach ((array)$options->ar_sections as $current_section_tipo) {
			
			# Security areas
			$dato_security_areas->$current_section_tipo = $permissions;
			
			
			# Security access			
			# Components inside section
			$real_section = section::get_section_real_tipo_static( $current_section_tipo );
			$ar_children  = section::get_ar_children_tipo_by_modelo_name_in_section($real_section,
																					$ar_modelo_name_required=array('component','button','section_group'),
																					$from_cache=true,
																					$resolve_virtual=false,
																					$recursive=true,
																					$search_exact=false);
			$dato_security_access->$current_section_tipo = new stdClass();
			foreach ($ar_children as $children_tipo) {
				$dato_security_access->$current_section_tipo->$children_tipo = $permissions;
			}			

		}//end foreach ($ar_sections as $current_section_tipo)

		# Save calculated data once
		$component_security_areas->set_dato($dato_security_areas);
		$component_security_areas->Save();

		$component_security_access->set_dato($dato_security_access);
		$component_security_access->Save();

		# Regenerate permissions table
		security::reset_permissions_table();
		
		return true;
	}//end set_hierarchy_permissions



	/**
	* CREATE_TERM
	* Creates new structure term with request params. If term already exists, return false
	* @return object $response
	*/
	public static function create_term( $request_options ) {

		$options = new stdClass();
			$options->terminoID 	= '';
			$options->parent 		= '';
			$options->modelo 		= '';
			$options->esmodelo 		= 'no';
			$options->esdescriptor 	= 'si';
			$options->visible 		= 'si';
			$options->norden 		= null;
			$options->tld2 			= '';
			$options->traducible 	= 'no';
			$options->relaciones 	= '';
			$options->propiedades 	= '';			
			$options->name 			= '';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= '';
		

		# STRUCTURE ELEMENT TEST . Test record exits
		$RecordObj_dd 	= new RecordObj_dd($options->terminoID, $options->tld2);
		$parent_test = $RecordObj_dd->get_parent();
			if (!empty($parent_test)) {
				$response->result 	= false;
				$response->msg 		= "Current hierarchy ($options->terminoID - $options->name) already exists. Nothing is created. \n";
				return $response;
			}

		$ar_childrens = RecordObj_dd::get_ar_childrens($options->parent);
		$norden 	  = (int)count($ar_childrens)+1;
			
		# Defaults
		$RecordObj_dd->set_terminoID($options->terminoID);
		$RecordObj_dd->set_parent($options->parent);
		$RecordObj_dd->set_modelo($options->modelo);
		$RecordObj_dd->set_esmodelo($options->esmodelo);
		$RecordObj_dd->set_esdescriptor($options->esdescriptor);
		$RecordObj_dd->set_visible($options->visible);
		$RecordObj_dd->set_norden($norden);
		$RecordObj_dd->set_tld($options->tld2);
		$RecordObj_dd->set_traducible($options->traducible);
		$RecordObj_dd->set_relaciones($options->relaciones);
		$RecordObj_dd->set_propiedades($options->propiedades);

		$RecordObj_dd->set_force_insert_on_save(true); # important !
			
		# SAVE : After save, we can recover new created terminoID (prefix+autoIncrement)
		$created_id_ts = $RecordObj_dd->save_term_and_descriptor( $options->name );
			if ($created_id_ts) {
				$response->result 	= true;
				$response->msg 		= "Created record: $created_id_ts - $options->name \n";
			}

		return $response;
	}//end create_term



	/**
	* UPDATE_FROM_4_0_TO_4_1
	* @return 
	*/
	public static function update_jerarquia_from_4_0_to_4_1() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		# Dedalo version parts
		$ar_v = explode('.', DEDALO_VERSION);

		$hierarchy_section_tipo = defined('DEDALO_HIERARCHY_SECTION_TIPO') ? DEDALO_HIERARCHY_SECTION_TIPO : 'hierarchy1';

		#
		# REMOVE POSIBLE OLD DATA AND COUNTER
		# For re-import hierarchy mainly
		$strQuery = "DELETE FROM \"matrix_hierarchy_main\"; ";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$strQuery = "DELETE FROM \"matrix_counter\" WHERE ((\"tipo\" = 'hierarchy1')); ";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);

		#
		# SOURCE TABLE DATA FROM THESAURUS V3
		$strQuery = "SELECT * FROM \"jerarquia\" ORDER BY tipo ASC, alpha2 ASC";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		$i= 1;
		while ($rows = pg_fetch_assoc($result)) {

			# Data from v40 tables (pre-matrix)
			$alpha3 		= (string)$rows['alpha3'];
			$alpha2			= (string)$rows['alpha2'];
			$nombre			= (string)$rows['nombre'];
			$tipo_orig		= (int)$rows['tipo'];
			$activa_orig	= (string)$rows['activa'];
			$mainLang_orig	= (string)$rows['mainLang'];

			if ( strtolower($alpha2)==='lg' ) {
				$mainLang_orig	= 'lg-eng'; // Force
			}

			if(empty($mainLang_orig)){
				$mainLang_orig = 'lg-spa';
			}

			$tipo_orig = ($tipo_orig === 4) ? 1 : $tipo_orig;
			$tipo_orig = ($tipo_orig === 7) ? 4 : $tipo_orig;

			$tipo = new locator();
				$tipo->set_section_tipo("hierarchy13");
				$tipo->set_section_id($tipo_orig);
			
			$activa = new locator();
				$activa->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				if ($activa_orig === 'si') {
					$activa->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
				}else{
					$activa->set_section_id(NUMERICAL_MATRIX_VALUE_NO);
				}
			
			# component_select_lang dato
			if ((int)$ar_v[0]===4 && (int)$ar_v[1]>=5) {
				# New way >= 4.5.0
				$mainLang = lang::get_lang_locator_from_code( $mainLang_orig ); ///////////////////////// VERIFICAR ESTO QUE NOOO VA BIEN
			}else{
				# OLD WAY
				$mainLang = new locator();
					$mainLang->set_section_tipo($mainLang_orig);

					$lang_ts = new RecordObj_ts($mainLang_orig);
					$lang_id = $lang_ts->get_ID();
					$mainLang->set_section_id($lang_id);
			}				

		
			$section_tipo = $hierarchy_section_tipo;
			$section_id   = $i;
			$section 	  = section::get_instance($section_id, $section_tipo);

			#$section->Save();
			$section->forced_create_record();

			$component_alpha3	= self::row_to_json_obj('hierarchy7', $section_id, $alpha3, $lang='lg-spa',$section_tipo);
			$component_alpha2	= self::row_to_json_obj('hierarchy6', $section_id, $alpha2, $lang='lg-spa',$section_tipo);
			$component_nombre	= self::row_to_json_obj('hierarchy5', $section_id, $nombre, $lang='lg-spa',$section_tipo);
			$component_tipo		= self::row_to_json_obj('hierarchy9', $section_id, $tipo, $lang=DEDALO_DATA_NOLAN,$section_tipo);
			$component_activa	= self::row_to_json_obj('hierarchy4', $section_id, $activa, $lang=DEDALO_DATA_NOLAN,$section_tipo);
			$component_mainLang	= self::row_to_json_obj('hierarchy8', $section_id, $mainLang, $lang=DEDALO_DATA_NOLAN,$section_tipo);

			#
			# Create structure virtual section
			#if ( strtolower($alpha2) === 'lg') {		
				$options = new stdClass();
					$options->section_tipo = $section_tipo;
					$options->section_id   = $section_id;
				self::generate_virtual_section( $options );
			#}

			$i++;
		}//end while ($rows = pg_fetch_assoc($result))

		
		$response->result 	= true;
		$response->msg 		= "Updated hierarchy from 4.0 to >=4.1. Added $i records to section: $hierarchy_section_tipo ";

		return $response;
	}//end update_jerarquia_from_4_0_to_4_1



	/**
	* ROW_TO_JSON_OBJ
	* @return 
	*/
	private static function row_to_json_obj($tipo, $parent, $dato=null, $lang='lg-spa',$section_tipo) {

		if(empty($dato)){
			return false;
		}

		# Test section tipo and modelo_name exists (TEMPORAL FOR INSTALATIONS BEFORE 4.5)		
		$section_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($section_tipo, true);
		if ($section_modelo_name!=='section') {
			throw new Exception("Error Processing Request. Section tipo '$section_tipo' not exists in structure.<br>
					Please review your structure data before continue working to avoid critical errors.<br>", 1);				
		}

		$modo ='edit';
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance( $modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);

		$component->set_dato($dato);
		$component->Save();
		unset($modelo_name);
		unset($component);

		return null;		
	}//end row_to_json_obj



	/**
	* UPDATE_JER_ES_FROM_4_0_TO_4_1
	* @return 
	*/
	public static function update_jer_from_4_0_to_4_1($tld, $modelo) {

		# Disable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = false;	

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= "Error on update '$tld'";

		#
		# GENERATE_VIRTUAL_SECTION
		# Generamos la sección virtual en estructura antes de nada
		# pero sólo en la llamada de los NO modelos como 'es1'
		/*
		if($modelo==='no') {
			$prefix 			= strtoupper($tld);
			$data_nolan 		= DEDALO_DATA_NOLAN;
			$component_tld_tipo = DEDALO_HIERARCHY_TLD2_TIPO;
			$strQuery = "SELECT section_id, section_tipo FROM \"matrix_hierarchy_main\" WHERE datos#>>'{components,$component_tld_tipo,dato,$data_nolan}' = '$prefix' LIMIT 1; ";
			$result	  = JSON_RecordObj_matrix::search_free($strQuery);
			while ($rows = pg_fetch_assoc($result)) {
				$options = new stdClass();
					$options->section_tipo 	= $rows['section_tipo'];
					$options->section_id 	= $rows['section_id'];
				$res = self::generate_virtual_section( $options );
				$response->msg[] = to_string($res);
				break;
			}
		}		
		*/

		if ($tld==='lg' && $modelo==='no') {
			# REMOVE POSIBLE OLD DATA AND COUNTER
			# For re-import langs mainly
			$strQuery = "DELETE FROM \"matrix_langs\"; ";
			$result	  = JSON_RecordObj_matrix::search_free($strQuery);
			$strQuery = "DELETE FROM \"matrix_counter\" WHERE (\"tipo\" = 'lg1' OR \"tipo\" = 'lg2'); ";
			$result	  = JSON_RecordObj_matrix::search_free($strQuery);

			debug_log(__METHOD__." Deleted langs data from matrix_langs and matrix_counter".to_string(), logger::WARNING);
		}
		

		#
		# SOURCE TABLE DATA
		$strQuery = "SELECT * FROM \"jer_{$tld}\" WHERE esmodelo = '$modelo' ORDER BY id ASC";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		#$i= 1;
		while ($rows = pg_fetch_assoc($result)) {

			# Data from v40 tables (pre-matrix)
			#id	terminoID	parent	modelo	esmodelo	esdescriptor	visible	norden	usableIndex	traducible	relaciones	propiedades
			$id 				= (int)$rows['id'];
			$terminoID 			= (string)$rows['terminoID'];
			$parent				= (string)$rows['parent'];
			if ($modelo === 'no') {
				$dato_modelo	 = (string)$rows['modelo'];
				$section_tipo_id = 1;
			}else{
				$dato_modelo 	 = false;
				$section_tipo_id = 2;
			}
			$esdescriptor_orig	= (string)$rows['esdescriptor'];
			$visible_orig		= (string)$rows['visible'];
			$norden				= (int)$rows['norden'];
			$usableIndex_orig	= (string)$rows['usableIndex'];
			#$traducible		= (string)$rows['traducible'];
			$relaciones			= (string)$rows['relaciones'];
			$propiedades		= (string)$rows['propiedades'];

			self::rows_jer_to_matrix_json(	$id,
											$terminoID, 
											$parent,
											$dato_modelo,
											$section_tipo_id,
											$esdescriptor_orig,
											$visible_orig,
											$norden,
											$usableIndex_orig,
											$relaciones,
											$propiedades,
											$tld,
											$modelo);

			debug_log(__METHOD__." Updated / created element terminoID:$terminoID, parent:$parent, tld:$tld, dato_modelo:".to_string($dato_modelo), logger::DEBUG);			
			
			unset($id);
			unset($terminoID); 
			unset($parent);
			unset($dato_modelo);
			unset($section_tipo_id);
			unset($esdescriptor_orig);
			unset($visible_orig);
			unset($norden);
			unset($usableIndex_orig);
			unset($relaciones);
			unset($propiedades);
			#$i++;
			
			// let GC do the memory job
			time_nanosleep(0, 10000000); // 10 ms
		}//end while ($rows = pg_fetch_assoc($result)) {

		$response->result 	= true;
		$response->msg 		= "'$tld' updated successfully";

		return $response;		
	}//end update_jer_from_4_0_to_4_1



	/**
	* ROWS_JER_TO_MATRIX_JSON
	* @return null 
	*/
	private static function rows_jer_to_matrix_json($id, $terminoID, $parent, $dato_modelo, $section_tipo_id, $esdescriptor_orig, $visible_orig, $norden, $usableIndex_orig, $relaciones, $propiedades, $tld, $modelo) {

		$esdescriptor = new locator();
			$esdescriptor->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			if ($esdescriptor_orig === 'si') {
				$esdescriptor->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			}else{
				$esdescriptor->set_section_id(NUMERICAL_MATRIX_VALUE_NO);
			}
		
		$visible = new locator();
			$visible->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			if ($visible_orig === 'si') {
				$visible->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			}else{
				$visible->set_section_id(NUMERICAL_MATRIX_VALUE_NO);
			}

		$usableIndex = new locator();
			$usableIndex->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			if ($usableIndex_orig === 'si') {
				$usableIndex->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			}else{
				$usableIndex->set_section_id(NUMERICAL_MATRIX_VALUE_NO);
			}

		if(strpos($terminoID, 'lg-')===0) {
			
			$dato_childrens = array();
				$ar_childrens = RecordObj_ts::get_ar_childrens($terminoID);
				$from_component_tipo = DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO;
				foreach ($ar_childrens as $curent_tipo) {

					$children_id = self::get_lg_id_from_terminoID($curent_tipo);

					$children = new locator();
						$children->set_section_tipo($tld.$section_tipo_id);
						$children->set_section_id($children_id);
						$children->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
						$children->set_from_component_tipo($from_component_tipo);

					$dato_childrens[] =  $children;
				}
		}else{
			
			$dato_childrens = array();
				$ar_childrens = RecordObj_ts::get_ar_childrens($terminoID);
				foreach ($ar_childrens as $curent_tipo) {
					
					$children_id = substr($curent_tipo, 2);
					
					$children = new locator();
						$children->set_section_tipo($tld.$section_tipo_id);
						$children->set_section_id($children_id);
						$children->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
						$children->set_from_component_tipo(DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO);

					$dato_childrens[] = $children;
				}

		}//end if(strpos($terminoID, 'lg-')===0)		

		if(empty($dato_modelo)) {
			$loc_modelo = null;
		}else{
			$loc_modelo = new locator();
				$loc_modelo->set_section_tipo($tld.'2');
				$modelo_id = substr($dato_modelo, 2);
				$loc_modelo->set_section_id($modelo_id);
				$loc_modelo->set_type(DEDALO_RELATION_TYPE_MODEL_TIPO);
				$loc_modelo->set_from_component_tipo(DEDALO_THESAURUS_RELATION_MODEL_TIPO);
		}

		#["ts2","pt234","fr37028"]
		$relaciones	= json_decode($relaciones);
		$relacion = array();
		if(!empty($relaciones) && is_array($relaciones)){
			
			foreach ($relaciones as $value) {

				$locator = new locator();

				$prefix = RecordObj_dd::get_prefix_from_tipo($value);
				$locator->set_section_tipo($prefix.'1');

				$relation_id = substr($value, strlen($prefix));
				$locator->set_section_id($relation_id);

				$locator->set_type(DEDALO_RELATION_TYPE_RELATED_TIPO);

				$relacion[]	= $locator;
				unset($locator );
			}
		}

		$section_tipo = $tld.$section_tipo_id;
		$section 	  = section::get_instance($id, $section_tipo);
		$section->forced_create_record();

		$component_esdescriptor	= self::row_to_json_obj('hierarchy23', $id, $esdescriptor, DEDALO_DATA_NOLAN, $section_tipo);
		$component_visible		= self::row_to_json_obj('hierarchy26', $id, $visible, DEDALO_DATA_NOLAN, $section_tipo);
		//$component_norden		= self::row_to_json_obj('hierarchy42', $id, $norden, DEDALO_DATA_NOLAN, $section_tipo); // Removed 11-03-2017
		$component_usableIndex	= self::row_to_json_obj('hierarchy24', $id, $usableIndex, DEDALO_DATA_NOLAN, $section_tipo);
		//$component_parent		= self::row_to_json_obj('hierarchy36', $id, $dato_parent, DEDALO_DATA_NOLAN, $section_tipo);
		$component_children		= self::row_to_json_obj('hierarchy49', $id, $dato_childrens, DEDALO_DATA_NOLAN, $section_tipo);
		$component_relacion		= self::row_to_json_obj('hierarchy35', $id, $relacion, DEDALO_DATA_NOLAN, $section_tipo);
		$component_modelo		= self::row_to_json_obj('hierarchy27', $id, $loc_modelo, DEDALO_DATA_NOLAN, $section_tipo);

		# Lang case
		if (strpos($terminoID, 'lg-')===0) {
			$code = substr($terminoID, 3);
			$component_codigo = self::row_to_json_obj('hierarchy41', $id, $code, DEDALO_DATA_NOLAN, $section_tipo);
		}

		unset($esdescriptor );
		unset($visible );
		unset($norden );
		unset($usableIndex);
		unset($dato_parent );
		unset($relacion );
		unset($loc_modelo );

		unset($component_esdescriptor );
		unset($component_visible );
		unset($component_norden );
		unset($component_usableIndex );
		//unset($component_parent );
		unset($component_children );
		unset($component_relacion );
		unset($component_modelo );
		
		$strQuery_descriptors = "SELECT * FROM \"matrix_descriptors\" WHERE parent = '$terminoID'";
		$result_descriptors	  = JSON_RecordObj_matrix::search_free($strQuery_descriptors);
			while ($rows_descriptors = pg_fetch_assoc($result_descriptors)) {

				$dato 			= (string)$rows_descriptors['dato'];
				$tipo 			= (string)$rows_descriptors['tipo'];
				$lang 			= (string)$rows_descriptors['lang'];

				if($tipo === 'termino'){
					$component_termino	= self::row_to_json_obj('hierarchy25', $id, $dato, $lang ,$section_tipo);
					unset($component_termino);
				}
				elseif($tipo === 'def'){
					$component_def	= self::row_to_json_obj('hierarchy28', $id, $dato, $lang ,$section_tipo);
					unset($component_def);
				}
				elseif($tipo === 'notes'){
					$component_notes	= self::row_to_json_obj('hierarchy33', $id, $dato, $lang ,$section_tipo);
					unset($component_notes);
				}
				elseif($tipo === 'index'){
					$dato = json_decode($dato);

					foreach((array)$dato as $locator) {
						#$locator->set_type(DEDALO_RELATION_TYPE_INDEX_TIPO);
						$locator->type = DEDALO_RELATION_TYPE_INDEX_TIPO; // note is a stdClass now
					}
					
					$component_index	= self::row_to_json_obj('hierarchy40', $id, $dato, DEDALO_DATA_NOLAN, $section_tipo);
					unset($component_index);
				}
				elseif($tipo === 'obs'){
					$component_obs	= self::row_to_json_obj('hierarchy32', $id, $dato, $lang ,$section_tipo);
					unset($component_obs);
				}
				#{"lat":"39.462571","lon":"-0.376295","zoom":17}
				elseif($tipo === 'altitude'){

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo('hierarchy31',true);
					$component = component_common::get_instance($modelo_name,
																	  'hierarchy31',
																	  $id,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);

					$component_dato = $component->get_dato();

					if(!is_object($component_dato)){
						$component_dato = new stdClass();
					}
					$component_dato->alt =(int)$dato;
					$component_alt	= self::row_to_json_obj('hierarchy31', $id, $component_dato, DEDALO_DATA_NOLAN ,$section_tipo);

					unset($modelo_name);
					unset($component);
					unset($component_dato);
					unset($component_alt);
				}
				elseif($tipo === 'geolocalizacion'){

					$datos = explode(",", $dato); 

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo('hierarchy31',true);
					$component = component_common::get_instance($modelo_name,
																	  'hierarchy31',
																	  $id,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);

					$component_dato = $component->get_dato();

					if(!is_object($component_dato)){
						$component_dato = new stdClass();
					}
					$component_dato->lat = $datos[0];
					$component_dato->lon = $datos[1];
					
					$component_notes	= self::row_to_json_obj('hierarchy31', $id, $component_dato, DEDALO_DATA_NOLAN ,$section_tipo);

					unset($modelo_name);
					unset($component);
					unset($component_dato);
					unset($component_notes);
				}
				elseif($tipo === 'nomenclator_code'){
					$component_notes	= self::row_to_json_obj('hierarchy41', $id, (int)$dato, DEDALO_DATA_NOLAN ,$section_tipo);
				}
				#31/12/1973-01/07/1976
				elseif($tipo === 'tiempo'){

					if (strpos($dato, '-')!==false) {
						$fechas = explode("-", $dato);
						$fecha_ini = explode("/", $fechas[0]);
						$fecha_fin = explode("/", $fechas[1]);

						$dato_time = new stdClass();

						$dd_date = new dd_date();
						$dd_date->set_day($fecha_ini[0]);
						$dd_date->set_month($fecha_ini[1]);
						$dd_date->set_year($fecha_ini[2]);

						$dato_time->start = $dd_date;

						$dd_date = new dd_date();
						$dd_date->set_day($fecha_fin[0]);
						$dd_date->set_month($fecha_fin[1]);
						$dd_date->set_year($fecha_fin[2]);

						$dato_time->end = $dd_date;

					}else{
						
						$fecha = explode("/", $dato);

						$dato_time = new dd_date();
						$dato_time->set_day($fecha[0]);
						$dato_time->set_month($fecha[1]);
						$dato_time->set_year($fecha[2]);
					}
					// component_date Marco temporal hierarchy30
					$component_tiempo	= self::row_to_json_obj('hierarchy30', $id, $dato_time, DEDALO_DATA_NOLAN ,$section_tipo);

					unset($fechas);
					unset($fecha_ini);
					unset($fecha_fin);
					unset($dato_time);
					unset($dd_date);
					unset($component_tiempo);
				}

				unset($dato);
				unset($tipo);
				unset($lang);

				// let GC do the memory job
				time_nanosleep(0, 10000000); // 10 ms

			}//end while

		return null;		
	}//end rows_to_matrix_json	



	/**
	* GET_LG_ID_FROM_TERMINOID
	* @return 
	*/
	private static function get_lg_id_from_terminoID( $termino_id ) {

		# SOURCE TABLE DATA
		$strQuery = "SELECT id FROM \"jer_lg\" WHERE \"terminoID\" = '$termino_id' ";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		while ($rows = pg_fetch_assoc($result)) {
			$id = $rows['id'];
			return $id;
		}
		return 1;
	}//end get_lg_id_from_terminoID



	/**
	* GET_MAIN_LANG
	* Search in section HIERARCHY (DEDALO_HIERARCHY_SECTION_TIPO) the lang for requested 'thesaurus' section by section_tipo
	* Do a direct db search request for speed and store results in a static var for avoid resolve the same main_lang twice
	* Speed here is very important because this method is basic for thesaurus sections defined in hierarchies
	* @return string $main_lang
	*/
	public static function get_main_lang($section_tipo) {
		
		static $ar_main_lang;

		if(isset($ar_main_lang[$section_tipo])) return $ar_main_lang[$section_tipo];

		# Always fixed langs as english
		if ($section_tipo==='lg1') {
			return 'lg-eng';
		}

		# Dedalo version parts
		$ar_v = explode('.', DEDALO_VERSION);
			
		$matrix_table			= 'matrix_hierarchy_main';
		$hierarchy_lang_tipo 	= DEDALO_HIERARCHY_LANG_TIPO;
		$hierarchy_section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;
		$hierarchy_tld_tipo 	= DEDALO_HIERARCHY_TLD2_TIPO;
		$lang 					= DEDALO_DATA_NOLAN;

		$prefix = RecordObj_dd::get_prefix_from_tipo($section_tipo);
		$prefix = strtoupper($prefix); // data is stored always in uppercase
		
		$strQuery  ='-- '.__METHOD__;
		$strQuery .= "\nSELECT section_id, datos#>'{relations}' AS relations \nFROM $matrix_table WHERE";
		$strQuery .= "\n section_tipo = '$hierarchy_section_tipo' AND";
		#$strQuery .= "\n (datos#>>'{components,$hierarchy_tld_tipo,dato,$lang}' = '$prefix' OR ";
		#$strQuery .= " datos#>>'{components,$hierarchy_tld_tipo,dato,$lang}' = '".strtolower($prefix)."' ) ";
		#$strQuery .= "\n datos#>>'{components,$hierarchy_tld_tipo,dato,$lang}' = '$prefix' ";
		$strQuery .= "\n datos#>'{components,$hierarchy_tld_tipo,dato,$lang}' ? '$prefix' "; // Now hierarchy tld is an array
		$strQuery .= "LIMIT 1";
			#dump(null, ' strQuery ++ '.to_string($strQuery));
		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		$main_lang = null;		
		while ($rows = pg_fetch_assoc($result)) {

			$section_id	= $rows['section_id'];
			$relations	= json_decode($rows['relations']);

			$ar_main_lang_locator = array_filter($relations, function($current_locator) use($hierarchy_lang_tipo) {
				if(SHOW_DEBUG===true) {
					#if (!isset($current_locator->from_component_tipo)) {
					#	throw new Exception("Error Processing Request", 1);					
					#}
				}
				return (isset($current_locator->from_component_tipo) && $current_locator->from_component_tipo === $hierarchy_lang_tipo);
			});	

			// dato in db is json string representation of locators array 
			if (empty($ar_main_lang_locator)) {
				if(SHOW_DEBUG) {
					dump($ar_main_lang_locator, ' ar_main_lang_locator ++ '.$hierarchy_lang_tipo.' '.to_string($relations));
					throw new Exception("Error Processing Request. ar_main_lang_locator dato is not json valid!", 1);					
				}
			}
			$main_lang_locator	= reset($ar_main_lang_locator);
			

			if ((int)$ar_v[0]>=4 && (int)$ar_v[1]>=5) {
				# New way >= 4.5.0
				$main_lang = lang::get_code_from_locator($main_lang_locator, $add_prefix=true);
					#dump($main_lang, ' main_lang ++ $section_tipo: '.$section_tipo.' - '.to_string($main_lang_locator));
			}else{
				# OLD WAY < v4.5
				$main_lang = $main_lang_locator->section_tipo;
			}

			if (empty($main_lang)) {
				switch (true) {
					case ($section_tipo==='es1'):
						$main_lang = 'lg-spa';
						break;					
					default:
						$main_lang = 'lg-eng';
						break;
				}
				debug_log(__METHOD__." Error on get main lang for section $section_tipo. Fallback for safe to lang: $main_lang ".to_string(), logger::ERROR);
			}

			# store cache
			$ar_main_lang[$section_tipo] = $main_lang;
			break;
		}//end while
		#dump($main_lang, ' main_lang ++ for section_tipo: '.to_string($section_tipo));
		
		return (string)$main_lang;
	}//end get_main_lang



	/**
	* GET_ACTIVE_HIERARCHIES
	* Return array of current active hierarchies
	* @return array $active_hierarchies
	*/
	public static function get_active_hierarchies( $ar_type=null ) {

		# Filter by active (Radio button active) hierarchy4
		#$active_value 	= "(a.datos#>'{components,hierarchy4,dato,lg-nolan}' @> '[{\"section_id\":\"1\",\"section_tipo\":\"dd64\"}]'::jsonb)";
		$active_value 	= "(a.datos#>'{relations}' @> '[{\"section_id\":\"1\",\"section_tipo\":\"dd64\"}]'::jsonb)";

		# Filter by type (Select Typology) hierarchy9
		$filter_by_type = '';
		if (!is_null($ar_type)) {
		  $last_type = end($ar_type);
			foreach ((array)$ar_type as $current_type) {
			  #$filter_by_type .= "a.datos#>'{components, hierarchy9, dato, lg-nolan}' @> '[{\"section_id\":\"$current_type\",\"section_tipo\":\"hierarchy13\"}]'::jsonb";
			  $filter_by_type .= "a.datos#>'{relations}' @> '[{\"section_id\":\"$current_type\",\"section_tipo\":\"hierarchy13\"}]'::jsonb";
			  if($current_type!==$last_type) $filter_by_type .= " AND ";
		  }
		}
		
		# Query
		$strQuery = "
			SELECT a.id, a.section_id, a.section_tipo,
			a.datos#>>'{components, hierarchy48, dato, lg-nolan}' AS hierarchy48,			
			a.datos#>>'{components, hierarchy5, dato, lg-nolan}' AS name,
			a.datos#>>'{components, hierarchy53, dato, lg-nolan}' AS target_section,
			a.datos#>>'{components, hierarchy58, dato, lg-nolan}' AS target_section_model,			
			a.datos#>>'{components, hierarchy6, dato, lg-nolan}' AS hierarchy6,
			a.datos#>>'{components, hierarchy7, dato, lg-nolan}' AS hierarchy7,		
			a.datos#>>'{components, hierarchy8, dato, lg-nolan}' AS main_lang,
			a.datos#>>'{relations}' AS hierarchy59
			FROM \"".hierarchy::$table."\" a
			WHERE
			a.section_tipo = 'hierarchy1'
			-- filter by is active 'yes'
			AND $active_value
			-- filter_by_search hierarchy9 component_select 
 			$filter_by_type
			ORDER BY a.section_id ASC  
			";
			#dump(null, ' strQuery ++ '.to_string($strQuery));
		$result = JSON_RecordObj_matrix::search_free($strQuery);

		$active_hierarchies=array();
		while ($rows = pg_fetch_assoc($result)) {			
			$section_id 			= $rows['section_id'];
			$name 					= $rows['name']; // Note name is NOT translatable
			$target_section			= $rows['target_section'];
			$target_section_model	= $rows['target_section_model'];
			$main_lang				= $rows['main_lang'];
			
			
			if (is_array($ar_name=json_decode($name))) {
				$name = reset($ar_name);
			}
			if (is_array($ar_target_section=json_decode($target_section))) {
				$target_section = reset($ar_target_section);
			}
			if (is_array($ar_target_section_model=json_decode($target_section_model))) {
				$target_section_model = reset($ar_target_section_model);
			}
			#dump($target_section, ' target_section ++ '.to_string($strQuery));
			
			$active_hierarchies[$section_id] = array("name"=>$name,
													"target_section"=>$target_section,
													"target_section_model"=>$target_section_model,
													"main_lang"=>$main_lang													
													);
		}
		#dump($active_hierarchies, ' $active_hierarchies ++ '.to_string($strQuery));

		return (array)$active_hierarchies;
	}//end get_active_hierarchies



	/**
	* GET_ALL_TABLES
	* Return array of tables of requested hierarchy sections
	* @param array $ar_section_tipo
	* 	Format like [0] => lg1
	*			    [2] => ts1
	* @return array $all_tables
	*/
	public static function get_all_tables( $ar_section_tipo ) {
		
		$all_tables = array();
		foreach ((array)$ar_section_tipo as $section_tipo) {
			$table = common::get_matrix_table_from_tipo($section_tipo);
			if (!in_array($table, $all_tables)) {
				$all_tables[] = $table;
			}
		}
		
		return (array)$all_tables;
	}//end get_all_tables



	/**
	* GET_ALL_TERM_TIPO_BY_MAP
	* Returns array of thesaurus term by map
	* @return array $all_term_tipo_by_map
	*/
	public static function get_all_term_tipo_by_map( $ar_section_tipo ) {
		
		$all_term_tipo_by_map=array();
		foreach ((array)$ar_section_tipo as $section_tipo) {

			# Matrix table
			$table = common::get_matrix_table_from_tipo($section_tipo);

			# Array of terms
			#$term_tipo = hierarchy::get_element_tipo_from_section_list_thesaurus( $section_tipo, 'term' );
			$term_tipo = hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );

			if(!is_null($term_tipo))
				$all_term_tipo_by_map[$table][] = $term_tipo;
		}

		return (array)$all_term_tipo_by_map;
	}//end get_all_term_tipo_by_map



	/**
	* GET_ELEMENT_TIPO_FROM_SECTION_MAP
	* Search in section_map the current request element,
	* For example, search for term tipo, childrens element tipo, etc..
	* @return string|null $element_tipo 
	*/
	public static function get_element_tipo_from_section_map( $section_tipo, $type ) {

		$element_tipo = null;
		
		# Search map
		$ar_elements = hierarchy::get_section_map_elemets($section_tipo);
			#dump($ar_elements, ' $ar_elements ++ '.to_string($section_tipo));

		foreach ($ar_elements as $object_value) {
			if (property_exists($object_value, $type)) {
				$element_tipo = $object_value->$type;
				break;
			}
		}
		#dump($element_tipo, ' element_tipo ++ '.to_string());		

		return $element_tipo;
	}//end get_element_tipo_from_section_map



	/**
	* GET_SECTION_MAP_ELEMETS
	* Get elements from section_list_thesaurus -> propiedades
	* @return array ar_elements
	*/
	public static function get_section_map_elemets( $section_tipo ) {

		$ar_elements = array();
		
		static $section_map_elemets ;
		if (isset($section_map_elemets[$section_tipo])) {
			return $section_map_elemets[$section_tipo];
		}
		
		// Elements are stored in current section > section_map
		// Search element in current section
		$ar_modelo_name_required = array('section_map');

		// Search in current section
		$ar_children  = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo,
																				$ar_modelo_name_required,
																				$from_cache=true,
																				$resolve_virtual=false,
																				$recursive=false,
																				$search_exact=true);
		# Fallback to real section when in virtual
		if (!isset($ar_children[0])) {
			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
			if ($section_tipo!==$section_real_tipo) {
				$ar_children  = section::get_ar_children_tipo_by_modelo_name_in_section($section_real_tipo,
																				$ar_modelo_name_required,
																				$from_cache=true,
																				$resolve_virtual=false,
																				$recursive=false,
																				$search_exact=true);
			}
		}//end if (!isset($ar_children[0])) 


		# If element exists (section_map) we get element 'propiedades' json value as array
		# dump($ar_children, ' ar_children ++ '.to_string($section_tipo));
		if (isset($ar_children[0])) {
			
			$section_map_tipo = $ar_children[0];

			# relation map
			$RecordObj_dd    = new RecordObj_dd($section_map_tipo);
			$ar_propiedades  = json_decode($RecordObj_dd->get_propiedades());
				#dump($ar_elements, ' ar_elements ++ '.to_string());

			$ar_elements = (array)$ar_propiedades;		
			#debug_log(__METHOD__." ar_propiedades ".to_string($ar_propiedades), logger::DEBUG);
		}

		# Set static var for reuse
		$section_map_elemets[$section_tipo] = $ar_elements;
		#debug_log(__METHOD__." ar_elements $section_tipo - ".to_string($ar_elements), logger::DEBUG);

		return (array)$ar_elements;
	}//end get_section_map_elemets



	/**
	* GET_ELEMENT_TIPO_FROM_SECTION_LIST_THESAURUS
	* Search in section_list_thesaurus the current request element,
	* For example, search for term tipo, childrens element tipo, etc..
	* @return string|null $element_tipo 
	*//*
	public static function get_element_tipo_from_section_list_thesaurus( $section_tipo, $type ) {

		$element_tipo = null;
		
		# Search map
		$ar_elements = ts_object::get_ar_elements($section_tipo);

		foreach ($ar_elements as $object_value) {
			if (property_exists($object_value, 'type') && $object_value->type===$type) {
				$element_tipo = $object_value->tipo;
				break;
			}
		}

		return $element_tipo;
	}//end get_element_tipo_from_section_list_thesaurus
	*/


	/**
	* UPDATE_TARGET_SECTION
	* @param object $request_options
	* @return object $response
	*/
	public static function update_target_section( $request_options ) {
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';


		$options = new stdClass();
			$options->section_id   = null;
			$options->section_tipo = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$section_tipo 	= $options->section_tipo;
		$section_id		= (int)$options->section_id;

		# Current tld (alpha2)
		$tipo 			= DEDALO_HIERARCHY_TLD2_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$tld = $component->get_dato();
		if (is_array($tld)) {
			$tld = reset($tld);
		}
		if (empty($tld) || strlen($tld)<2) {
			$response->msg = 'Error.  Current tld (alpha2) is empty or invalid: '.to_string($tld);
			return $response;
		}
		debug_log(__METHOD__." tipo: $tipo - tld ".to_string($tld), logger::DEBUG);


		# DEDALO_HIERARCHY_TARGET_SECTION_TIPO	
		$tipo 			= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$default_section_tipo_term = self::get_default_section_tipo_term($tld);
		$component->set_dato($default_section_tipo_term);
		$component->Save();
		debug_log(__METHOD__." tipo: $tipo - default_section_tipo_term ".to_string($default_section_tipo_term), logger::DEBUG);

		# DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO	
		$tipo 			= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$default_section_tipo_model = self::get_default_section_tipo_model($tld);
		$component->set_dato($default_section_tipo_model);
		$component->Save();
		debug_log(__METHOD__." tipo: $tipo - default_section_tipo_model ".to_string($default_section_tipo_model), logger::DEBUG);

		$response->result 	= true;
		$response->msg 		= " Update target section term [$default_section_tipo_term] and model [$default_section_tipo_model] done successfully";

		return (object)$response;
	}//end update_target_section



	/**
	* SET_LANG_HIERARCHY
	* @return 
	*/
	public static function set_lang_hierarchy() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error on set_lang_hierarchy ';

		$filter_value 	= "datos#>'{components,".DEDALO_HIERARCHY_TLD2_TIPO.",dato,lg-nolan}' = '[\"LG\"]' ";
		$strQuery = " SELECT section_id FROM \"".hierarchy::$table."\" WHERE $filter_value ";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		while ($rows = pg_fetch_assoc($result)) {
			$section_id = $rows['section_id'];
			break;
		}
		
		if (!isset($section_id)) {
			$response->msg .= "Record with TLD2: 'LG' not found in table ".hierarchy::$table;
			return $response;
		}

		// DEDALO_HIERARCHY_TARGET_SECTION_TIPO hierarchy53 
		$tipo 			= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 DEDALO_HIERARCHY_SECTION_TIPO);
		$component->set_dato( array("lg1") );
		$component->Save();

		// DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO hierarchy58
		$tipo 			= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 DEDALO_HIERARCHY_SECTION_TIPO);
		$component->set_dato( array("lg2") );
		$component->Save();

		// DEDALO_HIERARCHY_CHIDRENS_TIPO 	
		$tipo 			= DEDALO_HIERARCHY_CHIDRENS_TIPO;
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 DEDALO_HIERARCHY_SECTION_TIPO);
		$locator = new locator();
			$locator->set_section_tipo(DEDALO_LANGS_SECTION_TIPO); // lg1
			$locator->set_section_id(1); // 1
			$locator->set_type(DEDALO_RELATION_TYPE_CHILDREN_TIPO);
			$locator->set_from_component_tipo(DEDALO_HIERARCHY_TARGET_SECTION_TIPO); // hierarchy53
		
		$component->set_dato( $locator );
		$component->Save();
		
		$response->result = true;
		$response->msg 	  = "Section hierarchy ".DEDALO_HIERARCHY_SECTION_TIPO." - $section_id is configurated successfully";


		return $response;
	}//end set_lang_hierarchy



	/**
	* GET_HIERARCHY_TYPE_FROM_SECTION_TIPO
	* @return int $hierarchy_type
	*/
	public static function get_hierarchy_type_from_section_tipo($section_tipo) {

		$hierarchy_type = null;
		
		$search_query_object = json_decode('{
		  "id": "hierarchy1_list",		  
		  "section_tipo": "'.DEDALO_HIERARCHY_SECTION_TIPO.'",
		  "order": false,
		  "limit": 1,
		  "filter": {
		    "$and": [
		      {
		        "q": "='.$section_tipo.'",
		        "q_operator": null,
		        "path": [
		          {
		            "section_tipo": "'.DEDALO_HIERARCHY_SECTION_TIPO.'",
		            "component_tipo": "'.DEDALO_HIERARCHY_TARGET_SECTION_TIPO.'",
		            "modelo": "component_input_text",
		            "name": "Target thesaurus"
		          }
		        ]
		      }
		    ]
		  },
		  "select": [
		    {
		      "path": [
		        {
		          "section_tipo": "'.DEDALO_HIERARCHY_SECTION_TIPO.'",
		          "component_tipo": "'.DEDALO_HIERARCHY_TIPOLOGY_TIPO.'",
		          "modelo": "component_select",
		          "name": "Typology"
		        }
		      ]
		    }
		  ]
		}');

		$search_development2 = new search_development2($search_query_object);
		$search_result 		 = $search_development2->search();
		$ar_records 		 = $search_result->ar_records;

		foreach ($ar_records as $key => $row) {

			if( $ar_locators = json_decode($row->{DEDALO_HIERARCHY_TIPOLOGY_TIPO}) ) {
				if (isset($ar_locators[0]->section_id)) {
					$hierarchy_type = (int)$ar_locators[0]->section_id;
				}
			}			
		}		

		return $hierarchy_type;
	}//end get_hierarchy_type_from_section_tipo



}//end class hierarchy
?>