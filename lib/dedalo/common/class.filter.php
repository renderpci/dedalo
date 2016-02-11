<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
/*

	1 - Despeja el usuario logeado actual
	2 - Obtener el id matrix de los proyectos del usuario actual
	3 - Devuelve el array de id_matrix correspondientes al tipo dado con los proyectos del usuario

*/

abstract class filter {
	
	static $ar_records_unassigned ;

	# MATRIX_TABLE : Filter work always in table 'matrix'
	protected static $filter_matrix_table = 'matrix';


	/**
	* GET_SQL_FILTER
	* Build sql code filter from section tipo for current user
	* $section_tipo must be 'real section tipo'
	*/
	public static function get_sql_filter( $filter_options ) {
		$sql_filtro='';

		#
		# DEDALO_BYPASS_FILTER
		# In some cases yo can bypass filter setting a constant in config called DEDALO_BYPASS_FILTER to bool true
		if ( defined('DEDALO_BYPASS_FILTER') && DEDALO_BYPASS_FILTER===true ) {
			$sql_filtro .= "\n-- filter is BYPASSED -- \n";
			return $sql_filtro; 
		}

		# Verify minimun valid options acepted
		if(!is_object($filter_options)) {
			trigger_error("ilegal filter_options type");
			if(SHOW_DEBUG) {
				dump($filter_options,"filter_options");
				throw new Exception("Error Processing Request", 1);				
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

		# filter_options overwrite options defaults
		foreach ( (object)$filter_options as $key => $value) {			
			if (property_exists($options, $key)) {
				$options->$key = $value;
			}
		}
		#dump($options,"filter_options");

		# PROJECTS (USER) : Proyectos del usuario actual, se calculan en base al usuario logeado
		if (!$options->projects) {
			$options->projects = (array)filter::get_user_projects(navigator::get_user_id());		#dump($options, ' $options->projects');
		}
		#dump($options,"filter_options");
		


		$ar_id_matrix_project 	= (array)array_keys( (array)$options->projects );
		$is_global_admin 		= (bool)component_security_administrator::is_global_admin(navigator::get_user_id());
		if ($is_global_admin===true) {
			$sql_filtro .= '';
		}else{
			if (empty($options->projects)) {				
				debug_log(__METHOD__. "<div class=\"warning\">Warning: User without projects!!</div>", logger::WARNING);
			}			
			switch (true) {
				##### PROFILES ########################################################
				case ($options->section_tipo===DEDALO_SECTION_PROFILES_TIPO) :	
					$sql_filtro .= "\n-- filter_profiles (no filter is used) -- \n";
					break;

				##### PROJECTS ########################################################
				case ($options->section_tipo===DEDALO_SECTION_PROJECTS_TIPO) :							
					$sql_filtro .= "\n-- filter_user_created -- \n";
					$sql_filtro .= 'AND (';
					$sql_filtro .= "\n $options->json_field @>'{\"created_by_userID\":".navigator::get_user_id()."}'::jsonb \n";

					# Current user authorized areas
					$component_filter_master = component_common::get_instance('component_filter_master', DEDALO_FILTER_MASTER_TIPO, navigator::get_user_id(), 'list', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
					$filter_master_dato 	 = (array)$component_filter_master->get_dato();

					if (!empty($filter_master_dato)) {
						$ar_values 			= array_keys($filter_master_dato);
						$ar_values_string 	= implode(',', $ar_values);
						$sql_filtro .= " OR section_id IN ($ar_values_string)";
					}
					$sql_filtro .= "\n)";			
					break;
				
				##### USERS ########################################################
				case ($options->section_tipo===DEDALO_SECTION_USERS_TIPO) :							
					# AREAS FILTER
					$user_id = navigator::get_user_id();
					$sql_filtro .= "\n-- filter_users_by_profile_areas -- \n";
					$sql_filtro .= 'AND section_id>0 AND ';
					$sql_filtro .= "\n $options->json_field @>'{\"created_by_userID\":".$user_id."}'::jsonb OR \n";				
					$sql_filtro .= '((';
					# Editing users. Use user areas as filter

					#
					# USER PROFILE
					# Calculate current user profile id
					$component_profile = component_common::get_instance('component_profile',
																	  	DEDALO_USER_PROFILE_TIPO,
																	  	$user_id,
																	  	'edit',
																	  	DEDALO_DATA_NOLAN,
																	  	DEDALO_SECTION_USERS_TIPO);
					$profile_id = (int)$component_profile->get_dato();
					#if (empty($profile_id)) {
					#	return $dato;
					#}

					# Current user profile authorized areas
					$component_security_areas = component_common::get_instance('component_security_areas',
																				DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																				$profile_id,
																				'edit',
																				DEDALO_DATA_NOLAN,
																				DEDALO_SECTION_PROFILES_TIPO);
					$security_areas_dato 	  = (array)$component_security_areas->get_dato();
						#çdump($security_areas_dato,"security_areas_dato");
					# Iterate and clean array of authorized areas of this user like '[dd942-admin] => 2'
					$ar_area_tipo = array();
					foreach ($security_areas_dato as $area_tipo => $value) {
						if( strpos($area_tipo,'-admin') !== false && $value==2)  $ar_area_tipo[] = substr($area_tipo, 0,strpos($area_tipo,'-admin'));
					}
					if (empty($ar_area_tipo)) {
						$url =  DEDALO_ROOT_WEB ."/main/";
						header("Location: $url");
						exit();
						#die( label::get_label('contenido_no_autorizado') );
					}

					#
					# SEARCH PROFILES WITH CURRENT USER AREAS
						$profile_sql = "SELECT section_id FROM \"matrix_profiles\" WHERE ";
						foreach ($ar_area_tipo as $current_area_tipo) {
							$profile_sql.= "\n datos#>'{components, ".DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO.", dato, ". DEDALO_DATA_NOLAN ."}' @>'{\"$current_area_tipo\":\"2\"}' ";
							if ($current_area_tipo != end($ar_area_tipo)) $profile_sql .= "OR";
						}
						#dump( stripcslashes($profile_sql), ' $profile_sql ++ '.to_string($profile_sql));
						$result = JSON_RecordObj_matrix::search_free($profile_sql);
						$ar_profile_id=array();
						while ($rows = pg_fetch_assoc($result)) {
							$section_id 	 = $rows['section_id'];	
							$ar_profile_id[] = $section_id;
						}
						#dump($ar_profile_id, ' $ar_profile_id ++ '.to_string($profile_sql)); die();

					foreach ($ar_profile_id as $current_profile_id) {
						$sql_filtro.= "\n $options->json_field#>'{components, ".DEDALO_USER_PROFILE_TIPO.", dato, ". DEDALO_DATA_NOLAN ."}' = '$current_profile_id' ";
						if ($current_profile_id != end($ar_profile_id)) $sql_filtro .= "OR";
					}					
					$sql_filtro .= "\n)";
					#dump($sql_filtro, ' $sql_filtro ++ '.to_string($sql_filtro));die();


					# PROJECTS FILTER
					$component_filter_master = component_common::get_instance('component_filter_master', DEDALO_FILTER_MASTER_TIPO, navigator::get_user_id(), 'list', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
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
						if ($id_matrix_project != end($ar_id_matrix_project)) $ar_values_string .= ',';
					}
					$sql_filtro .= "\n-- filter_by_projects -- \n";
					$sql_filtro .= "AND $options->json_field#>'{components,".DEDALO_FILTER_MASTER_TIPO.",dato,". DEDALO_DATA_NOLAN ."}' ?| array[$ar_values_string] ";
					$sql_filtro .= ')';
					break;
				
				##### DEFAULT ########################################################
				default:
					$sql_filtro .= "\n-- filter_by_projects -- \n";
					$sql_filtro .= 'AND ';
					# SECTION FILTER TIPO : Actual component_filter de esta sección
					$ar_component_filter 	= section::get_ar_children_tipo_by_modelo_name_in_section($options->section_tipo, 'component_filter', true, false);	//$section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false
					if (empty($ar_component_filter[0])) {
						if(SHOW_DEBUG) {
							$section_name = RecordObj_dd::get_termino_by_tipo($options->section_tipo);
							throw new Exception("Error Processing Request. Filter not found is this section ($options->section_tipo) $section_name", 1);	;
						}
						throw new Exception("Error Processing Request. Dédalo is not properly configured [$options->section_tipo]. Please contact with your admin ASAP", 1);																										
					}else{
						$component_filter_tipo = $ar_component_filter[0];
					}					
					if (empty($ar_id_matrix_project)) {
						$sql_filtro .= "\n $options->json_field#>'{components, $component_filter_tipo, dato, ". DEDALO_DATA_NOLAN ."}'->>'' = 'VALOR_IMPOSIBLE (User without projects)' ";
					}else{
						$sql_filtro .= '(';						
						$ar_values_string='';		
						foreach ($ar_id_matrix_project as $id_matrix_project){
							$ar_values_string .= "'{$id_matrix_project}'";
							if ($id_matrix_project != end($ar_id_matrix_project)) $ar_values_string .= ',';
						}
						$sql_filtro .= "\n $options->json_field#>'{components,$component_filter_tipo,dato,". DEDALO_DATA_NOLAN ."}' ?| array[$ar_values_string] OR ";
						$sql_filtro .= "\n $options->json_field @>'{\"created_by_userID\":".navigator::get_user_id()."}'::jsonb ";
						$sql_filtro .= "\n)";
					}
					break;
			}#end switch						
		}

		return $sql_filtro;

	}#end get_sql_filter



	/**
	* IS_AUTHORIZED_RECORD
	* 
	*/
	public static function is_authorized_record($section_id, $section_tipo) {

		if(SHOW_DEBUG) {
			#$start_time=microtime(true);
		}
		$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
			#dump($matrix_table," ");
		/*
		if ($matrix_table!=filter::$filter_matrix_table) {
			trigger_error("Filter dont verify tables disctint to '".filter::$filter_matrix_table. "'. Table '$matrix_table' is received");
			return true;
		}
		*/
		$sql_filtro='';
		$is_global_admin = component_security_administrator::is_global_admin( navigator::get_user_id() );
		if ($is_global_admin===true) {
			
			return true;
		
		}else{

			#
			# DEDALO SUPERUSER EDIT CASE
			# Avoid show DEDALO_SUPERUSER to edit
				if($section_id==DEDALO_SUPERUSER && $matrix_table=='matrix_users') {		
					$msg="Error Processing Request.";
					if(SHOW_DEBUG) $msg .= "<hr>Current user is not editable : $matrix_table";
					throw new Exception($msg, 1);
				}

			/**/
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
			if(SHOW_DEBUG) {
				#dump($rows_data, 'rows_data'. print_r($options,true));
			}
				

			if (count($rows_data->result)==1) {
				return true;
			}

			return false;



			/*
			# Temporal
			return true;

			# DIRECT MODE
			$user_projects			= filter::get_user_projects(navigator::get_user_id());
			$ar_id_matrix_project 	= array_keys($user_projects);
				#dump($ar_id_matrix_project,"ar_id_matrix_project");
			$sql_filtro .= 'AND ';
			if (empty($ar_id_matrix_project)) {
				log_messages("Sorry. No projects found. Please add authorized projects to current user ".navigator::get_user_id());
				return false;
			}else{
				
				$component_filter_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_real_tipo, 'component_filter')[0];					
				$sql_filtro .= '(';
				$sql_filtro .= "\n datos#>'{created_by_userID}' @>'".navigator::get_user_id()."' OR ";
				$ar_values_string='';		
				foreach ($ar_id_matrix_project as $id_matrix_project){
					$ar_values_string .= "'{$id_matrix_project}'";
					if ($id_matrix_project != end($ar_id_matrix_project)) $ar_values_string .= ',';
				}
				$sql_filtro .= "\n datos#>'{components, $component_filter_tipo, dato, ". DEDALO_DATA_NOLAN ."}' ?| array[$ar_values_string] ";
				$sql_filtro .= "\n)";				
			}

			
			$strQuery = "SELECT id FROM \"$matrix_table\" WHERE (id=".$section_id.") $sql_filtro";
			#dump($strQuery,"strQuery");
			$result	= JSON_RecordObj_matrix::search_free($strQuery);
				#dump(pg_num_rows($result),"result");
			
			if (!$result) {
				if(SHOW_DEBUG) {
					dump($strQuery,"strQuery");
					throw new Exception("Error Processing Request : Cannot execute query: $strQuery <br>\n". pg_last_error(), 1);
				}							
				trigger_error("Error Processing Request : Sorry cannot execute query");
			}

			if(SHOW_DEBUG) {
				#$total=round(microtime(1)-$start_time,3); dump($total,"time");
			}
			if (pg_num_rows($result)==1) {
				return true;						
			}
			*/
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
			$component_filter_master 	= component_common::get_instance('component_filter_master', DEDALO_FILTER_MASTER_TIPO, $user_id, 'list', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
			$dato 					 	= (array)$component_filter_master->get_dato();

			return $dato;
		}
		return null;		
	}

	
















}
?>