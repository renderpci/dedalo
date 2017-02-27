<?php




/**
* FILTER CLASS
*/
abstract class filter {
	

	
	/**
	* GET_SQL_FILTER
	* Build sql code filter from section tipo for current user
	* $section_tipo must be 'real section tipo'
	* @param object $filter_options
	* @return string $sql_filter
	*/
	public static function get_sql_filter( $filter_options ) {
		$sql_filter='';

		#
		# DEDALO_BYPASS_FILTER
		# In some cases yo can bypass filter setting a constant in config called DEDALO_BYPASS_FILTER to bool true
		if ( defined('DEDALO_BYPASS_FILTER') && DEDALO_BYPASS_FILTER===true ) {
			$sql_filter .= "\n-- filter is BYPASSED -- \n";
			return $sql_filter; 
		}

		# Verify minimun valid options acepted
		if(!is_object($filter_options)) {
			trigger_error("ilegal filter_options type");
			if(SHOW_DEBUG===true) {
				dump($filter_options,"filter_options");			
			}			
			return null;
		}
		if(empty($filter_options->section_tipo)){
			trigger_error("filter_options section_tipo is mandatory");
			return null;
		}

		$options = new stdClass();
			$options->section_tipo 	= false;
			$options->projects 		= false;
			$options->json_field	= 'datos';			
			foreach ($filter_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		# PROJECTS (USER) : Proyectos del usuario actual, se calculan en base al usuario logeado
		# Por defecto NO se recibe 'options->projects' pero dejamos la puerta abierta
		if (!$options->projects) {
			$options->projects = (array)filter::get_user_projects(navigator::get_user_id());
		}
		#dump($options,"filter_options");

		
		$is_global_admin = (bool)component_security_administrator::is_global_admin(navigator::get_user_id());
		if ($is_global_admin===true) {
			$sql_filter .= '';		
		}else{
			if (empty($options->projects)) {				
				debug_log(__METHOD__. "<div class=\"warning\">Warning: User without projects!!</div>", logger::WARNING);
			}

			switch (true) {
				##### PROFILES ########################################################
				case ($options->section_tipo===DEDALO_SECTION_PROFILES_TIPO) :
					$sql_filter .= "\n-- filter_profiles (no filter is used) -- \n";
					break;

				##### PROJECTS ########################################################
				case ($options->section_tipo===DEDALO_SECTION_PROJECTS_TIPO) :
					$sql_filter .= "\n-- filter_user_created -- \n";
					$sql_filter .= 'AND (';
					$sql_filter .= "\n a.$options->json_field @>'{\"created_by_userID\":".navigator::get_user_id()."}'::jsonb \n";

					# Current user authorized areas
					$component_filter_master = component_common::get_instance('component_filter_master', DEDALO_FILTER_MASTER_TIPO, navigator::get_user_id(), 'list', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
					$filter_master_dato 	 = (array)$component_filter_master->get_dato();

					if (!empty($filter_master_dato)) {
						$ar_values 			= array_keys($filter_master_dato);
						$ar_values_string 	= implode(',', $ar_values);
						$sql_filter .= " OR a.section_id IN ($ar_values_string)";
					}
					$sql_filter .= "\n)";			
					break;
				
				##### USERS ########################################################
				case ($options->section_tipo===DEDALO_SECTION_USERS_TIPO) :

					# AREAS FILTER
					$user_id = navigator::get_user_id();
					$sql_filter .= "\n-- filter_users_by_profile_areas -- \n";
					$sql_filter .= 'AND a.section_id>0 AND ';
					$sql_filter .= "\n a.$options->json_field @>'{\"created_by_userID\":".$user_id."}'::jsonb OR \n";
					$sql_filter .= '((';
					# Editing users. Use user areas as filter
	
					#
					# USER PROFILE
					# Calculate current user profile id
					/*
					$component_profile = component_common::get_instance('component_profile',
																	  	DEDALO_USER_PROFILE_TIPO,
																	  	$user_id,
																	  	'edit',
																	  	DEDALO_DATA_NOLAN,
																	  	DEDALO_SECTION_USERS_TIPO);
					$profile_id = (int)$component_profile->get_dato();
					*/
					$profile_id = component_profile::get_profile_from_user_id( $user_id );


					# Current user profile authorized areas
					$component_security_areas = component_common::get_instance('component_security_areas',
																				DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																				$profile_id,
																				'edit',
																				DEDALO_DATA_NOLAN,
																				DEDALO_SECTION_PROFILES_TIPO);
					$security_areas_dato 	  = (object)$component_security_areas->get_dato();
						#dump($security_areas_dato,"security_areas_dato");

					# Iterate and clean array of authorized areas of this user like '[dd942-admin] => 2'
					$ar_area_tipo = array();
					foreach ($security_areas_dato as $area_tipo => $value) {
						#if( strpos($area_tipo,'-admin') !== false && $value==2)  $ar_area_tipo[] = substr($area_tipo, 0,strpos($area_tipo,'-admin'));
						if ( (int)$value===3 ) {
							$ar_area_tipo[] = $area_tipo;
						}
					}
					if (empty($ar_area_tipo)) {
						debug_log(__METHOD__." Profile ($profile_id) without data!! ".to_string(), logger::ERROR);
						$url =  DEDALO_ROOT_WEB ."/main/";
						header("Location: $url");
						exit(); #die( label::get_label('contenido_no_autorizado') );
					}
					#dump($ar_area_tipo, ' $ar_area_tipo ++ '.to_string());

					#
					# SEARCH PROFILES WITH CURRENT USER AREAS
					$ar_profile_id = self::get_profiles_for_areas( $ar_area_tipo );						
						#dump($ar_profile_id, ' $ar_profile_id ++ '.to_string($profile_sql)); die();

					foreach ($ar_profile_id as $current_profile_id) {
						$sql_filter.= "\n a.$options->json_field#>'{components, ".DEDALO_USER_PROFILE_TIPO.", dato, ". DEDALO_DATA_NOLAN ."}' = '$current_profile_id' ";
						if ($current_profile_id != end($ar_profile_id)) $sql_filter .= "OR";
					}					
					$sql_filter .= "\n)";
						#dump($sql_filter, ' $sql_filter ++ '.to_string($ar_profile_id)); die();


					# PROJECTS FILTER
					$component_filter_master = component_common::get_instance('component_filter_master',
																			   DEDALO_FILTER_MASTER_TIPO,
																			   navigator::get_user_id(),
																			   'list',
																			   DEDALO_DATA_NOLAN,
																			   DEDALO_SECTION_USERS_TIPO);
					$filter_master_dato 	 = (array)$component_filter_master->get_dato();
						#dump($filter_master_dato," ");
					if (empty($filter_master_dato)) {
						$url =  DEDALO_ROOT_WEB ."/main/";
						header("Location: $url");
						exit();
						#die( label::get_label('contenido_no_autorizado') );
					}
					$ar_values_string='';
					foreach ($filter_master_dato as $id_matrix_project => $state) {
						$ar_values_string .= "'{$id_matrix_project}'";
						$ar_values_string .= ',';
					}
					$ar_values_string = substr($ar_values_string,0,-1);
					$sql_filter .= "\n-- filter_by_projects -- \n";
					$sql_filter .= "AND a.$options->json_field#>'{components,".DEDALO_FILTER_MASTER_TIPO.",dato,". DEDALO_DATA_NOLAN ."}' ?| array[$ar_values_string] ";
					$sql_filter .= ')';
						#dump($sql_filter, ' $sql_filter ++ '.to_string());
					break;
				
				##### DEFAULT ########################################################
				default:
					$sql_filter .= "\n-- filter_by_projects --\n";
					$sql_filter .= 'AND ';
					# SECTION FILTER TIPO : Actual component_filter de esta sección
					// params: $section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false
					$ar_component_filter 	= section::get_ar_children_tipo_by_modelo_name_in_section($options->section_tipo, array('component_filter'), true, false, true, false);
					if (empty($ar_component_filter[0])) {
						if(SHOW_DEBUG===true) {
							$section_name = RecordObj_dd::get_termino_by_tipo($options->section_tipo);
							throw new Exception("Error Processing Request. Filter not found is this section ($options->section_tipo) $section_name", 1);
						}
						throw new Exception("Error Processing Request. Dédalo is not properly configured [$options->section_tipo]. Please contact with your admin ASAP", 1);
					}else{
						$component_filter_tipo = $ar_component_filter[0];
					}

					$ar_id_project = (array)array_keys( (array)$options->projects );
					if (empty($ar_id_project)) {
						$sql_filter .= "\n a.$options->json_field#>'{components, $component_filter_tipo, dato, ". DEDALO_DATA_NOLAN ."}'->>'' = 'VALOR_IMPOSIBLE (User without projects)' ";
					}else{
						$sql_filter .= '(';
						$ar_values_string='';
						foreach ($ar_id_project as $id_matrix_project){
							$ar_values_string .= "'{$id_matrix_project}'";
							if ($id_matrix_project != end($ar_id_project)) $ar_values_string .= ',';
						}
						$sql_filter .= "\n a.$options->json_field#>'{components,$component_filter_tipo,dato,". DEDALO_DATA_NOLAN ."}' ?| array[$ar_values_string] OR ";
						$sql_filter .= "\n a.$options->json_field @>'{\"created_by_userID\":".navigator::get_user_id()."}'::jsonb ";
						$sql_filter .= "\n)";
					}
					break;
			}#end switch
		}

		return $sql_filter;
	}#end get_sql_filter



	/**
	* GET_PROFILES_FOR_AREAS
	* @param array $ar_area_tipo
	* @return array $ar_profile_id
	*/
	public static function get_profiles_for_areas($ar_area_tipo) {
		
		#
		# SEARCH PROFILES WITH CURRENT USER AREAS
		$profile_sql = "SELECT section_id FROM \"matrix_profiles\" WHERE ";
		foreach ($ar_area_tipo as $current_area_tipo) {
			$profile_sql.= "\n datos#>'{components, ".DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO.", dato, ". DEDALO_DATA_NOLAN ."}' @>'{\"$current_area_tipo\":3}' ";
			$profile_sql.= "OR datos#>'{components, ".DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO.", dato, ". DEDALO_DATA_NOLAN ."}' @>'{\"$current_area_tipo\":2}' ";
			if ($current_area_tipo != end($ar_area_tipo)) $profile_sql .= "OR";
		}
		#dump( stripcslashes($profile_sql), ' $profile_sql ++ '.to_string($profile_sql));
		$result = JSON_RecordObj_matrix::search_free($profile_sql);
		$ar_profile_id=array();
		while ($rows = pg_fetch_assoc($result)) {
			$section_id 	 = $rows['section_id'];	
			$ar_profile_id[] = $section_id;
		}

		return (array)$ar_profile_id;

	}#end get_profiles_for_areas



	/**
	* IS_AUTHORIZED_RECORD
	* @param int $section_id
	* @param string $section_tipo
	* @return bool
	*/
	public static function is_authorized_record($section_id, $section_tipo) {	
		
		$is_global_admin = component_security_administrator::is_global_admin( navigator::get_user_id() );
		if ($is_global_admin===true) {			
			return true;		
		}
			
		$matrix_table = common::get_matrix_table_from_tipo($section_tipo);		

		#
		# DEDALO SUPERUSER EDIT CASE
		# Avoid show DEDALO_SUPERUSER to edit
			if($section_id==DEDALO_SUPERUSER && $matrix_table==='matrix_users') {		
				$msg="Error Processing Request.";
				if(SHOW_DEBUG===true) $msg .= "<hr>Current user is not editable : $matrix_table";
				throw new Exception($msg, 1);
			}
		
		# Mode : using 'search::get_records_data' query and filtering by id
		# DESESTIMADA (es mas sencilla pero crea un problema con el layout map que no vale la pena resolver)
		/*
		$locator = new stdClass();
			$locator->section_id = $section_id;
		*/
		$locator = new locator();
			$locator->set_section_id($section_id);
			$locator->set_section_tipo($section_tipo);			

		$options = new stdClass();
			$options->section_tipo 	= (string)$section_tipo;
			$options->matrix_table 	= (string)$matrix_table;
			$options->layout_map 	= array($section_tipo);
			$options->sql_columns 	= "id,section_id,section_tipo";
			$options->filter_by_id 	= array($locator);
			$options->search_options_session_key = 'filter_is_authorized_record_'.$section_tipo.'_'.$section_id;

		$rows_data = search::get_records_data($options);
		if (count($rows_data->result)===1) {
			return true;
		}

		return false;

	}#end is_authorized_record	
	


	/**
	* GET_USER_PROJECTS
	* Revisada 19-08-2014
	* Como tarda poco, unos 0.008 secs, no hacemos cache del dato
	*/
	public static function get_user_projects($user_id) {

		if ( !empty($user_id) || abs($user_id)>0 ) {
			$component_filter_master 	= component_common::get_instance('component_filter_master',
																		 DEDALO_FILTER_MASTER_TIPO,
																		 $user_id,
																		 'list',
																		 DEDALO_DATA_NOLAN,
																		 DEDALO_SECTION_USERS_TIPO);
			$dato = (array)$component_filter_master->get_dato();

			return $dato;
		}
		return null;		
	}



	/**
	* GET_FILTER_USER_RECORDS_BY_ID
	* Filter user access to section records by section_id 
	* In process.... (need specific component for manage)
	* @return string $sql_filtro
	*/
	public static function get_filter_user_records_by_id( $user_id ) {
		
		$filter_user_records_by_id = array();

		if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {
			
			$modelo_name 	= 'component_filter_records';
			$tipo 			= DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO;
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $user_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 DEDALO_SECTION_USERS_TIPO);
			$filter_user_records_by_id = $component->get_dato();
		}

		return (array)$filter_user_records_by_id;
	}//end get_filter_user_records_by_id



}
?>