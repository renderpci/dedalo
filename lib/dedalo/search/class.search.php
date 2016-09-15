<?php
/*
* CLASS SEARCH
*/
#require_once(DEDALO_LIB_BASE_PATH . '/common/class.operator.php');


class search extends common {
	
	
	/**
	* GET_RECORDS_DATA
	* Build list records data from DDBB with received options 
	* @param object $options
	* @return object $records_data {result,strquery,options,..}
	*/
	public static function get_records_data($options) {

		#dump($options,"options");
		$start_time=microtime(1);
		if(SHOW_DEBUG) {
			if (isset($options->search_options_session_key)) {
				$current_sosk = $options->search_options_session_key;
			}else{
				$current_sosk = $options->section_tipo;
			}
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$current_sosk]=microtime(1);
		}

		# Verify minimun valid options acepted
		if(!is_object($options)) {
			trigger_error("ilegal options type");
			if(SHOW_DEBUG) {
				dump($options,"options");
				throw new Exception("Error Processing Request", 1);				
			}			
			return null;
		}
		if(empty($options->section_tipo) && !isset($options->filter_by_locator) ){
			trigger_error("options section_tipo is mandatory");
			return null;
		}

		#dump($options,'options');
		#error_log("Llamada get_rows_data con section_tipo:$options->section_tipo ");

		# SECTION TIPO : mandatory		
		$section_tipo = $options->section_tipo;

		#
		# OPTIONS : Las opciones pasadas en la llamada modifican los valores default de la búsqueda
		# Overwrite default sql_options when you call this method
		$sql_options = new stdClass();
				
			$sql_options->section_tipo			= (string)$section_tipo;  # Mandatory
			$sql_options->section_real_tipo		= (bool)false;
			$sql_options->json_field			= (string)'datos';
			$sql_options->modo					= (bool)false;
			$sql_options->context				= (bool)false;	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal	
			$sql_options->matrix_table			= (bool)false;
			$sql_options->layout_map			= (bool)false;	# Can be calculated from section_list o sended as custom by portals, etc..
			$sql_options->sql_columns 			= (bool)false;	
			$sql_options->projects				= (bool)false;	# user projects (normaly calculated later)
			
			$sql_options->filter_by_id			= (bool)false;	# Used by portals, etc. If exists, must be a array of locator objects with '$locator->section_id = $record_id' defined inside
			$sql_options->filter_by_locator		= (bool)false;	
			$sql_options->filter_by_search		= (bool)false;	# Search filter used by search form			
			$sql_options->filter_by_propiedades	= (bool)false;
			$sql_options->filter_by_section_creator_portal_tipo	= (bool)false;
			$sql_options->filter_by_inverse_locators 			= (bool)false;		
			$sql_options->filter_custom			= (bool)false;
			
			$sql_options->operators				= (bool)false;	# SQL operators used by search from
			$sql_options->full_count			= (bool)false;
			$sql_options->tipo_de_dato			= (string)'valor_list';  # Can be dato, valor, valor_list, etc...
			$sql_options->tipo_de_dato_search 	= (string)'dato';
			$sql_options->tipo_de_dato_order  	= (string)'valor';
			$sql_options->limit				  	= (int)DEDALO_MAX_ROWS_PER_PAGE;
			$sql_options->offset				= (int)0;  # Default 0
			$sql_options->group_by				= (bool)false;
			$sql_options->order_by				= (bool)false;//(bool)false; default 'section_id ASC'
			$sql_options->order_by_locator 		= (bool)false;
			$sql_options->search_options_session_key = (bool)false;	# key con el que se guarda la cache de session de las opciones. Por defecto es section tipo, pero en el caso de portales es distinto a la sección.			

			# Specific options for store			
			$sql_options->offset_list			= (int)0;  # Default 0			
			$sql_options->limit_list			= (int)DEDALO_MAX_ROWS_PER_PAGE;
			$sql_options->layout_map_list		= (bool)false;

			if($sql_options->section_tipo == DEDALO_ACTIVITY_SECTION_TIPO){
				$limit_activity = DEDALO_MAX_ROWS_PER_PAGE*3;
				$sql_options->limit 	 = $sql_options->limit > $limit_activity 	  ? $sql_options->limit 	 : $limit_activity;
				$sql_options->limit_list = $sql_options->limit_list > $limit_activity ? $sql_options->limit_list : $limit_activity;
				$sql_options->order_by   = $sql_options->order_by ? $sql_options->order_by : "a.id DESC";
				
			}


			# Options overwrite sql_options defaults
			foreach ((object)$options as $key => $value) {
				# Si la propiedad recibida en el array options existe en sql_options, la sobreescribimos
				#if (isset($sql_options->$key)) {
				if (property_exists($sql_options, $key)) {
					$sql_options->$key = $value;
					#dump($value, "key: $key changed from ", array());					
				}
			}
			#dump($options,"options"); 
			#dump($sql_options,"sql_options"); #die();

			$columns_to_resolve = new stdClass();

		#
		# SECTION REAL TIPO
		# Si no se recibe en options se calculará aquí 
		if (!$sql_options->section_real_tipo) {
			$sql_options->section_real_tipo  = section::get_section_real_tipo_static($section_tipo);	# Important real_tipo (avoid search in virtual sections)
		}
		#dump($sql_options->section_real_tipo,"real tipo");

		#
		# MATRIX_TABLE
		# Si no se recibe en options se calculará aquí 
		if (!$sql_options->matrix_table) {			
			$sql_options->matrix_table = common::get_matrix_table_from_tipo($section_tipo);			
		}
	
		#
		# LAYOUT MAP: Calculamos el section list de esta sección a través del layout map en modo list,
		# salvo que se sobreescriba el valor en options
		if ($sql_options->modo == 'edit') {
			# Nothing to do
		}else 
		if ( $sql_options->layout_map===false ) { //|| empty($sql_options->layout_map || ($sql_options->modo != 'edit' && empty($sql_options->layout_map)
			 	//
			$section 				 = section::get_instance(null,$sql_options->section_tipo,'list');
			$sql_options->layout_map = (array)component_layout::get_layout_map_from_section( $section );
				#dump($layout_map, 'layout_map for section '.$sql_options->section_tipo, array());
		}
		if ($sql_options->modo!='edit' && empty($sql_options->layout_map)) {
			if(SHOW_DEBUG) {
				dump($sql_options, 'sql_options', array());
			}
			throw new Exception("Error: layout_map is not defined! [$section_tipo] ", 1);	
		}
		# Verify permissions of every field and remove not authorized element
		foreach ((array)$sql_options->layout_map as $current_section_list_tipo => $map_values)
		foreach ((array)$map_values as $current_component_tipo) {
			if (empty($current_component_tipo)) {
				if(SHOW_DEBUG) {
					dump($sql_options->layout_map, " sql_options->layout_map ".to_string());
					dump($map_values, " map_values ".to_string());;
				}				
				throw new Exception("Error Processing Request: current_component_tipo is empty in latout map_values:".print_r($map_values,true), 1);						
			}
			$current_permissions = common::get_permissions($section_tipo, $current_component_tipo); #dump($current_permissions, 'permissions for $current_component_tipo:'.$current_component_tipo, array());
			if ($current_permissions<1) {
				# Unset element from layout map to hide column in list
				$ar_layout = reset($sql_options->layout_map);
					#dump($clayout, ' var ++ '.to_string());	 die();

				if (isset($ar_layout[$current_section_list_tipo]) && is_array($ar_layout[$current_section_list_tipo])) {
					$ckey = array_search($current_component_tipo, $ar_layout[$current_section_list_tipo]);
					if (isset($ckey) && $ckey) {
						unset( reset($ar_layout)[$current_section_list_tipo][$ckey] );
					}
				}
			}
		}
		#dump($sql_options, '$sql_options->layout_map', array()); die();
			
		#
		# PROJECTS (USER) : Proyectos del usuario actual, se calculan en base al usuario logeado
		#if (!$sql_options->projects) {
		#	$sql_options->projects = filter::get_user_projects(navigator::get_user_id());
		#}

		#
		# SECTION FILTER TIPO : Actual component_filter de esta sección
		#$component_filter_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($sql_options->section_tipo, 'component_filter')[0];
			#dump($component_filter_tipo,"component_filter_tipo");die();


		#############
		# STRQUERY

			#
			#
			# SQL_COLUMNS
			#
			#	
				$sql_columns='';
				$id_column_name 		  = ($sql_options->matrix_table=='matrix_time_machine') ? 'id'   : 'id'; //section_id AS id
				$section_tipo_column_name = ($sql_options->matrix_table=='matrix_time_machine') ? 'tipo' : 'section_tipo';
				$sql_columns .= "a.$id_column_name, a.section_id, a.$section_tipo_column_name,";	# Fixed columns
				#$sql_columns .= "\n ($sql_options->json_field#>>'{section_id}')::int AS section_id,";	# Fixed columns

				#if($sql_options->section_tipo == DEDALO_ACTIVITY_SECTION_TIPO){
				#	$sql_columns = 'id,';	# Only use id (not exists column section_tipo and section_id)
				#}
						
				
				if ($sql_options->sql_columns) {
					$sql_columns = $sql_options->sql_columns;
				}else{
					$traducible=array();
					if(SHOW_DEBUG) {
						if ($sql_options->modo!='edit' && empty(reset($sql_options->layout_map))) {
							echo "<div class=\"warning\">Warning. Section list of current layout map is misconfigured or your user (".navigator::get_user_id().") don't have privileges to acces: ".to_string($sql_options->layout_map)."</div>";
							#dump($sql_options->layout_map, 'Sorry. Section list of current layout map is misconfigured: $sql_options->layout_map');
							#throw new Exception("Error Processing Request. Section list of current layout map is misconfigured. Please review section/portal structure $sql_options->section_tipo", 1);							
						}
					}

					if(count($sql_options->layout_map)>0) foreach ((array)reset($sql_options->layout_map) as $current_column_tipo) {

						$RecordObj_dd = new RecordObj_dd($current_column_tipo);
						$traducible[$current_column_tipo] = $RecordObj_dd->get_traducible();
						if ($traducible[$current_column_tipo]!='si') {
							$current_lang 	= DEDALO_DATA_NOLAN;
							
							#
							# Para los componentes de lag DEDALO_DATA_NOLAN, buscaremos sus relaciones.
							# Si el primer elemento relacionado es traducible, lo añadimos las lista de elementos a resolver
							$relacionados = $RecordObj_dd->get_relaciones();							
							if(!empty($relacionados )){

								$termonioID_related = array_values($relacionados[0])[0];
								$RecordObjt_dd_rel	= new RecordObj_dd($termonioID_related);								

								if($RecordObjt_dd_rel->get_traducible() =='si'){									
									$columns_to_resolve->$current_column_tipo = new stdClass();
									$columns_to_resolve->$current_column_tipo->rel = $termonioID_related;
								}
							}
							
						}else{
							$current_lang = DEDALO_DATA_LANG;
						}
						# When filter_by_id is received, especial selection is made for columns
						# dump($sql_options->filter_by_id,"sql_options->filter_by_id");		
						if(!empty($sql_options->filter_by_id) && is_array($sql_options->filter_by_id)) foreach($sql_options->filter_by_id as $rel_locator) {
							
							$locator_obj = (object)$rel_locator;							
								#dump($locator_obj,"locator obj from $rel_locator");
							if (isset($locator_obj->component_tipo) && $locator_obj->component_tipo == $current_column_tipo) {
								$sql_columns .= "\n a.$sql_options->json_field#>>'{components, $current_column_tipo, ".$sql_options->tipo_de_dato.", $current_lang, $locator_obj->tag_id}' AS locator_{$current_column_tipo}_{$locator_obj->tag_id},";
							}
						}
						$sql_columns .= "\n a.$sql_options->json_field#>>'{components, $current_column_tipo, ".$sql_options->tipo_de_dato.", $current_lang}' AS $current_column_tipo,";
						#dump($sql_columns,"sql_columns");#die();	
					}						
					$sql_columns = substr($sql_columns, 0,-1);
					#dump($sql_columns,"sql_columns");#die();
				}

			#
			#
			# FILTER
			#
			#					
				# FILTER BASE
				$sql_filtro =' a.section_id IS NOT NULL ';				
				if($sql_options->section_tipo == DEDALO_ACTIVITY_SECTION_TIPO){
					$sql_filtro = ' a.id IS NOT NULL ';
				}


				#
				# FILTER_BY_SECTION_TIPO : Add current section tipo to filter (in matrix time machine column section_tipo is 'tipo')									
					if( $sql_options->section_tipo !== DEDALO_ACTIVITY_SECTION_TIPO && !$sql_options->filter_by_locator ) {
						
						$sql_filtro .= "\n-- filter_by_section_tipo -- \n";	
						
						$RecordObj_dd = new RecordObj_dd($sql_options->section_tipo);
						$propiedades  = $RecordObj_dd->get_propiedades();		
						$propiedades  = (object)json_decode($propiedades);		
						if ( property_exists($propiedades, 'section_tipo') && $propiedades->section_tipo=='real' ) {
							$current_section_tipo = section::get_section_tipo_static($sql_options->section_tipo); #dump($propiedades, " propiedades ".to_string());
						}else{
							$current_section_tipo = $sql_options->section_tipo;
						}
						$sql_filtro .= " AND (a.$section_tipo_column_name = '$current_section_tipo') "; # Column mode
					}

				#
				# FILTER_BY_LOCATOR : Section filtered by locators (section_id & section_tipo)					
					if ($sql_options->filter_by_locator) {
						$filter_by_locator  = '';
						foreach ((array)$sql_options->filter_by_locator as $current_locator) {
							$filter_by_locator .= "(a.section_tipo='$current_locator->section_tipo' AND a.section_id=$current_locator->section_id) OR\n";
						}
						if (!empty($filter_by_locator)) {
							$sql_filtro .= "\n-- filter_by_locator -- \n AND (\n" . substr($filter_by_locator, 0,-3)."\n)";
						}
					}
				
				#
				# FILTER_BY_ID : Used by portals and formated as locator objects array
					if ($sql_options->section_tipo==DEDALO_SECTION_USERS_TIPO) {
						$sql_filtro .= 'AND (a.section_id>0) '; # Avoid show global admin user in list
					}																
					if(!empty($sql_options->filter_by_id) && is_array($sql_options->filter_by_id)) {
						
						$sql_filtro .= "\n-- filter_by_id -- \n";

						$sql_filtro .= ' AND (';
						$filter_by_id_keys = array_keys($sql_options->filter_by_id);
						$order_by_resolved='';
						$i=1;			
						foreach($sql_options->filter_by_id as $current_key => $current_locator) {
							
							#
							# VERIFY OLD DATA (Pre-b4)
							if (isset($current_locator->section_id_matrix)) {
								if(SHOW_DEBUG) {
									dump($sql_options,"sql_options ");
								}
								throw new Exception("ERROR: Deprecated section_id_matrix for current_locator: :" .json_encode($current_locator). " ");							
							}

							if (!is_object($sql_options->filter_by_id[$current_key]) || !isset($current_locator->section_id) || empty($current_locator->section_id)) { 
								# Invalid locator
								if(SHOW_DEBUG) {
									dump($sql_options->filter_by_id, 'sql_options->filter_by_id', array());
									dump($current_locator, 'WARNING: not valid current_key for '.$current_key, array());
									#throw new Exception("Error Processing Request", 1);									
								}
							}else{

								$sql_filtro .= " a.section_id=".(int)$current_locator->section_id." ";
								if ($current_key != end($filter_by_id_keys)) {
									$sql_filtro .= 'OR';
									#error_log($current_key." - ".end($filter_by_id_keys));
								}

								# ORDER BY : Create too order clause here
								# Format ref.
								# CASE
								# WHEN id=225086 THEN 1
								# WHEN id=225041 THEN 2
								# END
								$order_by_resolved .= "\nWHEN a.section_id={$current_locator->section_id} THEN $i ";
								$i++;
							}							
						}
						$sql_filtro .= ')';						

						# ORDER BY : Final clause
						$order_by_resolved = "\nCASE ".$order_by_resolved." \nEND ";
												
					}//END if(!empty($sql_options->filter_by_id) && is_array($sql_options->filter_by_id))				


				#
				# FILTER_BY_SECTION_CREATOR_PORTAL_TIPO : Section filtered by section_creator_portal_tipo
					# If is received 'view_all' as request, this filter is ignored
					if (empty($_REQUEST['view_all']) && !empty($sql_options->filter_by_section_creator_portal_tipo)) {
						$section_creator_portal_tipo_filtro  = "\n-- filter_by_section_creator_portal_tipo -- \n";
						$section_creator_portal_tipo_filtro .= "AND a.$sql_options->json_field @> '{\"section_creator_portal_tipo\":\"".$sql_options->filter_by_section_creator_portal_tipo."\"}'::jsonb ";
						if(SHOW_DEBUG) {
							#log_messages("Used: $section_creator_portal_tipo_filtro",'');
						}
						$sql_filtro .= $section_creator_portal_tipo_filtro;
					}

				
				#
				# FILTER_BY_INVERSE_LOCATORS : Section filtered by inverse locators
					# datos #> '{inverse_locators}' @> '[{"section_tipo":"oh1"}]'
					if ($sql_options->filter_by_inverse_locators) {						
						$filter_by_inverse_locators  = "\n-- filter_by_inverse_locators -- \n";
						foreach ($sql_options->filter_by_inverse_locators as $key => $value) {
							#$filter_by_inverse_locators .= "AND $sql_options->json_field #> '{inverse_locators}' @> '[{\"$key\":\"".$value."\"}]'::jsonb ";
							$filter_by_inverse_locators .= "AND a.$sql_options->json_field -> 'inverse_locators' @> '[{\"$key\":\"".$value."\"}]'::jsonb ";	// Por compatibilidad con 9.4
						}												
						if(SHOW_DEBUG) {
							#log_messages("Used: $filter_by_inverse_locators",'');
						}
						$sql_filtro .= $filter_by_inverse_locators;
					}


				



				#
				# PROPIEDADES : Section filter_by_id
				# Returned format is like '[rsc24] => 114'. component tipo => value
				# NOTA: Opcionalmente, se podría prescindir de este filtro ya que 'filter_by_section_creator_portal_tipo' en más restrictivo. ¿Esto es así???
					if( !empty($sql_options->filter_by_id) || !empty($sql_options->filter_by_locator) ) {
						# Notinhg to do (filter by id is more restrictive)
					
					}else if ($sql_options->section_real_tipo != $sql_options->section_tipo) {
						# This section is virtual, notinhg to do (filter by section_tipo have the same effect)
					
					}else{

						$RecordObj_dd = new RecordObj_dd($sql_options->section_tipo);
						$propiedades  = json_decode($RecordObj_dd->get_propiedades());				
						if (!is_null($propiedades) && isset($propiedades->filtered_by) && !empty($propiedades->filtered_by) ) {
							#dump($propiedades->filtered_by, ' propiedades');
							$propiedades_filtro='';
							$propiedades_filtro_include=true;
							$propiedades_filtro .= "\n-- filter_by_propiedades -- \n";						
							$propiedades_filtro .= ' OR (';
							foreach ($propiedades->filtered_by as $current_component_tipo => $current_value) {
								
								$RecordObj_dd 	= new RecordObj_dd($current_component_tipo);
								$traducible  	= $RecordObj_dd->get_traducible();
								if ($traducible!='si') {
									$current_lang = DEDALO_DATA_NOLAN;
								}else{
									$current_lang = DEDALO_DATA_LANG;
								}
								#$locator_fb		= '[{"section_tipo":"'.$sql_options->section_tipo.'","section_id":'.$current_value.'}]';
								#dump($current_value, ' current_value');
								
								$current_value_flat = json_encode($current_value);
									#dump($current_value[0]->section_id," current_value");die();

								# Modo locator stándar
								$propiedades_filtro .= "a.datos#>'{components,$current_component_tipo,dato,$current_lang}' @> '$current_value_flat'::jsonb \n AND ";

								/*
									switch (true) {
										# String : ex. '11'
										case is_string($current_value):
											#$propiedades_filtro .= "\n $sql_options->json_field#>>'{components, $current_component_tipo, dato, ". $current_lang ."}' = '$current_value' AND ";
											#$propiedades_filtro .= "\n $sql_options->json_field @>'{\"components\":{\"$current_component_tipo\":{\"dato\":{\"$current_lang\":\"$current_value\"}}}}' AND ";										
											#$propiedades_filtro .= "\n ".JSON_RecordObj_matrix::build_pg_filter(	//$modo,$datos='datos',$tipo,$lang,$value
												#'btree',

										$propiedades_filtro .=  "($sql_options->json_field #>'{components,$current_component_tipo,dato,$current_lang}'@>'$locator_fb') AND ";
											break;
										# Object : Case checkboxes, for example. like. '[31] => 2'
										case is_object($current_value):
											#dump($current_value, ' current_value');
											$key=key($current_value);
											$val=reset($current_value); if(!is_int($val)) $val='"'.$val.'"';										
											$current_value_clean = "{\"$key\":$val}";
											#$propiedades_filtro .= "\n $sql_options->json_field#>'{components, $current_component_tipo, dato, ". $current_lang ."}' @> '$current_value_clean' AND ";
											#$propiedades_filtro .= "\n $sql_options->json_field @>'{\"components\":{\"$current_component_tipo\":{\"dato\":{\"$current_lang\":$current_value_clean}}}}' AND ";
											# BUG !!!!!!!!!!!!!!								
											$propiedades_filtro .= "\n ".JSON_RecordObj_matrix::build_pg_filter(	//$modo,$datos='datos',$tipo,$lang,$value
												'btree',
												$sql_options->json_field,
												$current_component_tipo,
												$current_lang,
												$current_value
												). " AND ";

											break;
										# Object : Case checkboxes, for example. like. '[31] => 2'
										case is_array($current_value):
											foreach ($current_value as $key => $current_value2) {
												$key=key($current_value2);
												$val=reset($current_value2); if(!is_int($val)) $val='"'.$val.'"';
												#dump(reset($current_value2), ' current_value2 '.$key);
												$current_value2 = "{\"$key\":$val}";
												#$propiedades_filtro .= "\n $sql_options->json_field#>'{components, $current_component_tipo, dato, ". $current_lang ."}' @> '$current_value2' AND ";
												#$propiedades_filtro .= "\n $sql_options->json_field @>'{\"components\":{\"$current_component_tipo\":{\"dato\":{\"$current_lang\":$current_value2}}}}' AND ";
												# BUG !!!
												#$propiedades_filtro .= "\n ".JSON_RecordObj_matrix::build_pg_filter(	//$modo,$datos='datos',$tipo,$lang,$value
												#	'btree',
												#	$sql_options->json_field,
												#	$current_component_tipo,
												#	$current_lang,
												#	$current_value2
												#	). " AND ";											
											}
											$propiedades_filtro .= "\n ".JSON_RecordObj_matrix::build_pg_filter(	//$modo,$datos='datos',$tipo,$lang,$value
													'btree',
													$sql_options->json_field,
													$current_component_tipo,
													$current_lang,
													$current_value
													). " AND ";
											break;
										default:
											$propiedades_filtro_include=false;
											if(SHOW_DEBUG) {
												dump($current_value, ' propiedades');
											}
											trigger_error("Error: Current value from propiedades-filtered_by is not string or object. I can't manage this value for now");
											break;
									}#end switch
									*/							
							}
							$propiedades_filtro = substr($propiedades_filtro, 0, -4);
							$propiedades_filtro .= ')';

							if ($propiedades_filtro_include) {
								$sql_filtro .= $propiedades_filtro;
								if(SHOW_DEBUG) {
									#log_messages("Used: $propiedades_filtro",'');
								}
							}
						}#end if (!is_null($propiedades) && isset($propiedades->filtered_by) && !empty($propiedades->filtered_by) )
					}#end else


				

				
				#
				# PROJECTS : Add authorized projects to current logged user
				# Return sql code to add to current sql filter
					$filter_options = new stdClass();
						$filter_options->section_tipo 	= $sql_options->section_real_tipo; // ! Important real tipo
						$filter_options->json_field 	= $sql_options->json_field;
					if ($sql_options->matrix_table=='matrix_list' || $sql_options->matrix_table=='matrix_dd') {
						# No filter is applicable when current section is a list of values (public or private)
					}else{
						$sql_filtro .= filter::get_sql_filter( (object)$filter_options );
					}
					


					
								
				#
				# FILTER_BY_SEARCH
				# dump($sql_options->filter_by_search, '$sql_options->filter_by_search ++ '.to_string());	
					if (!empty($sql_options->filter_by_search) && count((array)$sql_options->filter_by_search)>0) {
						# Clean empty values of array
						$sql_options->filter_by_search = self::clean_filter_by_search($sql_options->filter_by_search);
						$sql_filter_by_search = "\n-- filter_by_search --";
						$last_key = key( array_slice( (array)$sql_options->filter_by_search, -1, 1, TRUE ) );
							#dump($sql_options->filter_by_search, ' sql_options->filter_by_search'.to_string());
						foreach ($sql_options->filter_by_search as $search_combi => $search_value) {
							if (empty($search_value)) continue;

							$search_parts = explode('_', $search_combi);
							$component_section_tipo = $search_parts[0];
							$search_tipo = $search_parts[1];

							$RecordObj_dd = new RecordObj_dd($search_tipo);
							$traducible[$search_tipo] = $RecordObj_dd->get_traducible();
							if ($traducible[$search_tipo]!='si') {
								$current_lang = DEDALO_DATA_NOLAN;
							}else{
								$current_lang = DEDALO_DATA_LANG;
							}
	
							# SEARCH OPERATORS RESOLVE
							$comparison_operator = "ILIKE";
							if(isset($sql_options->operators->comparison_operator)){
								foreach ($sql_options->operators->comparison_operator as $key_tipo => $operator) {
									if($key_tipo == $search_tipo){												
										$comparison_operator = $operator;
										break;
									}
								}
							}							
							$logical_operator = "AND";
							if(isset($sql_options->operators->logical_operator)){
								foreach ($sql_options->operators->logical_operator as $key_tipo => $operator) {
									if($key_tipo == $search_tipo){
										$logical_operator = $operator;
										break;
									}
								}
							}

							$search_tipo_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($search_tipo, true);

							
							
							#dump($search_tipo," search_tipo - search_value: $search_value");
							# Search component section to separate portal components
							#$component_section_tipo = component_common::get_section_tipo_from_component_tipo($search_tipo);
							$section_real_tipo 		= $sql_options->section_real_tipo;
								#dump($component_section_tipo," section_real_tipo - sql_options->section_tipo: $sql_options->section_tipo");die();
							
							if ($component_section_tipo != $section_real_tipo) {

								#
								# SUBSEARCH . Subquery when current component is not current section (like informant name in oh1)
								$subsearch_query = "a.{$sql_options->json_field}#>>'{section_tipo}' = '$component_section_tipo' ";
								
								// Is portal element. We make a pre search to obtain locators
								$table_search 	  = common::get_matrix_table_from_tipo($search_tipo);									
								$subsearch_query .= ' AND '.$search_tipo_modelo_name::get_search_query( $sql_options->json_field, $search_tipo, $sql_options->tipo_de_dato_search, $current_lang, $search_value, $comparison_operator);
									#dump($subsearch_query, " subsearch_query ".to_string());
								
								$search_by_value= self::search_by_value($subsearch_query, $table_search);
								$ar_locator 	= $search_by_value->ar_locator;										
								$portal_tipo 	= section::get_portal_tipo_from_component($section_real_tipo, $search_tipo);
										#dump($search_by_value, ' $search_by_value'.to_string());

								if (count($ar_locator)>0) {										
									
									$sql_filter_by_search .= "\n".$search_by_value->strQuery."\n";
									$sql_filter_by_search .= '(';
									foreach ($ar_locator as $current_locator) {
										$current_locator_string = json_encode($current_locator);
										$sql_filter_by_search .= "\n a.$sql_options->json_field#>'{components,$portal_tipo,dato,lg-nolan}' @> '[$current_locator_string]' ";
										if ($current_locator != end($ar_locator)) $sql_filter_by_search .= 'OR ';
									}
									$sql_filter_by_search .= ') ';

								}else{

									// Only to avoid show results when no ar_locator are found																			
									$sql_filter_by_search .= "\n".$search_by_value->strQuery;
									$sql_filter_by_search .= "\n a.$sql_options->json_field#>'{components,$portal_tipo,dato,lg-nolan}' @> '{\"RESULT\":\"NOTHING_FOUND\"}' "; 
								}
							
							}else{

								#
								# Normal case. Direct search (component belong current section)
								$sql_filter_by_search .= "\n".$search_tipo_modelo_name::get_search_query($sql_options->json_field,
																										 $search_tipo,
																									 	 $sql_options->tipo_de_dato_search,
																										 $current_lang,
																										 $search_value,
																										 $comparison_operator);//, $logical_operator
								/*
								dump($sql_options->json_field, ' sql_options->json_field ++ '.to_string());
								dump($search_tipo, ' search_tipo ++ '.to_string());
								dump($sql_options->tipo_de_dato_search, ' sql_options->tipo_de_dato_search ++ '.to_string());
								dump($current_lang, ' current_lang ++ '.to_string());
								dump($search_value, ' search_value ++ '.to_string());
								dump($comparison_operator, ' comparison_operator ++ '.to_string());
								*/
							}//end if ($component_section_tipo != $section_real_tipo)							

							
							# Add logical_operator each iteration
							if($search_combi != $last_key) {
								$sql_filter_by_search .= $logical_operator; // Default is 'AND'
								$sql_filter_by_search .= ' ';
							}
							
						}//end foreach ($sql_options->filter_by_search as $search_tipo => $search_value) {
						
						# dump(strlen($sql_filter_by_search), 'strlen($sql_filter_by_search) ++ '.to_string());
						if ( strlen($sql_filter_by_search)>30 ) {
							$sql_filtro .= ' AND ('.$sql_filter_by_search."\n)";							
						}

					}//end if (!empty($sql_options->filter_by_search) && count((array)$sql_options->filter_by_search)>0) {
					#dump($sql_filtro,"sql_filtro");				
				
				

				#
				# FILTER_CUSTOM
				# Override all filters. Can be empty or minimal for get all records
					if ($sql_options->filter_custom) {
						$sql_filtro = $sql_options->filter_custom;
					}



			#
			#
			# ORDER_BY
			#
			#

			/* LEFT JOIN FOR USE WITH LOCATOR DATA.
			*	Order with the valor of the locator in one portal, autocomplete, etc
			*	ex: list in oh order by informant 
			*	SQL example:
			*		 SELECT a.id, a.section_id, a.section_tipo,
			*			a.datos#>'{components, mdcat602, dato, lg-nolan}'->0->>'section_id'
			*		 	a.datos#>>'{components, mdcat602, valor, lg-nolan}' AS mdcat602
			*		 FROM matrix a
			*			LEFT JOIN matrix b ON 
			*				b.section_id::text = a.datos#>'{components, mdcat602, dato, lg-nolan}'->0->>'section_id' AND
			*				b.section_tipo = a.datos#>'{components, mdcat602, dato, lg-nolan}'->0->>'section_tipo'
			*		where a.section_tipo = 'mdcat597'
			*		ORDER BY b.datos#>>'{components, rsc85, valor, lg-nolan}' DESC, a.id DESC
			*		;
			*/

				$order='';
				$left_join_sql ='';
				switch (true) {

					case $sql_options->order_by=='count':
						// Nothing to do
						break;

					case (isset($order_by_resolved)) :
						$order = "\n ORDER BY $order_by_resolved";
						break;

					#case($sql_options->order_by) :
					#	$order = "\n ORDER BY $sql_options->order_by";
					#	break;
					case $sql_options->order_by_locator == true:


							$ar_parts 			= explode(' ', $sql_options->order_by);
							$component_tipo 	= $ar_parts[0];
							$component_order 	= $ar_parts[1];


							$related_terms = RecordObj_dd::get_ar_terminos_relacionados($component_tipo, $cache=true, $simple=true);

							$component_tipo_related = false;

							foreach ($related_terms as $current_tipo) {
								$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
								if ($modelo_name == 'section'){
									$section_tipo_related = $current_tipo;
								}else if (!$component_tipo_related && $modelo_name == 'component_input_text'){
									$component_tipo_related = $current_tipo;
								}
							}
							$RecordObj_dd = new RecordObj_dd($component_tipo_related);
							$traducible = $RecordObj_dd->get_traducible();


							$current_lang = $traducible =='no' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
							

							$target_matrix = common::get_matrix_table_from_tipo($section_tipo_related);

							$left_join_sql .= 'LEFT JOIN '.$target_matrix.' b ON ';
							$left_join_sql .= "\n b.section_id::text = a.datos#>'{components, $component_tipo, dato, lg-nolan}'->0->>'section_id' AND ";
							$left_join_sql .= "\n b.section_tipo = a.datos#>'{components, $component_tipo, dato, lg-nolan}'->0->>'section_tipo' ";

							//$order .= "\n WHERE a.section_tipo = '$sql_options->section_tipo' ";
							$order .= "\n ORDER BY unaccent(b.datos#>>'{components, $component_tipo_related, valor, $current_lang}') $component_order, a.id $component_order";

								//dump($order, ' order'.to_string());
						break;

					default:
						# Para ordenar, usaremos el dato en 'valor' siempre (salvo cuando ordenamos con id o section_id que es directo)
						# por ello, formateamos la llamada de tipo 'dd23 DESC' como 'datos#>>'{components, dd23, valor, lg-nolan}' DESC'						
						if (!$sql_options->order_by || empty($sql_options->order_by)) {							
							$order = "\n ORDER BY a.section_id ASC ";
						}else{
							if ( strpos($sql_options->order_by, 'section_id ')===0 || 
								 strpos($sql_options->order_by, 'id ')===0 ) {
								# ORDER BY COLUMN
								$order_by_resolved = $sql_options->order_by;
							}else{
								# ORDER BY JSON COLUMN
								$ar_parts 	 		 = explode(' ', $sql_options->order_by);
								$current_column_tipo = $ar_parts[0];
								$order_direction 	 = $ar_parts[1];
								
								if (isset($traducible[$current_column_tipo])) {
									$current_lang = ($traducible[$current_column_tipo] =='no' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG);
								}else{
									$RecordObj_dd 	= new RecordObj_dd($current_column_tipo);
									$traducible  	= $RecordObj_dd->get_traducible();
									if ($traducible!='si') {
										$current_lang = DEDALO_DATA_NOLAN;
									}else{
										$current_lang = DEDALO_DATA_LANG;
									}
								}								
								$order_by_resolved = "a.$sql_options->json_field#>>'{components, $current_column_tipo, $sql_options->tipo_de_dato_order, $current_lang}' ".$order_direction;
							}							
							$order = "\n ORDER BY $order_by_resolved";

							#
							# ALWAYS ADD ORDER BY SECTION_ID (DESAMBIGUATE SAME DATA ORDER)
							$last_order = !empty($order_direction) ? $order_direction : 'ASC'; 
							if($sql_options->section_tipo!==DEDALO_ACTIVITY_SECTION_TIPO) {
								$order .= ', a.section_id '.$last_order;								
							}				
							#dump($order,"order last_order: $last_order  ");
						}						
						break;
				}				
				#dump($order,"order");


			#
			#
			# GROUP BY
			#
			#			
				$group_by = '';
				if ($sql_options->group_by) {
					$group_by = $sql_options->group_by;
				}
				#dump($group_by,'$group_by');
			
			#
			#
			# LIMIT / OFFSET
			#
			#
				$limit ='';
				if ($sql_options->limit) {
					$limit .= "\n LIMIT ".$sql_options->limit;
				}

				if ($sql_options->offset && (int)$sql_options->offset>0) {
					$limit .= " OFFSET ".$sql_options->offset;
				}
				
				
			
			#
			#
			# STRQUERY
			#
			#
				if ($sql_options->filter_custom || $sql_options->order_by_locator == true) {
					$strQuery ="\n SELECT $sql_columns \n FROM \"$sql_options->matrix_table\" a \n $left_join_sql \n WHERE $sql_filtro $group_by $order $limit \n";
				}else{
					$strQuery ="\n SELECT $sql_columns \n FROM \"$sql_options->matrix_table\" a \n $left_join_sql \n WHERE a.id IN (SELECT a.id FROM \"$sql_options->matrix_table\" a WHERE $sql_filtro $order $limit) $group_by $order \n";
				}
				#dump($strQuery,"strQuery");	#die();

				if(SHOW_DEBUG) {
					$bt = isset(debug_backtrace()[1]['function']) ? debug_backtrace()[1]['function'] : '';
					$strQuery = '-- '.__METHOD__.' : '. to_string($bt) ." ".$strQuery;
				}
				#$sql_options->strQuery = $strQuery;
				if(SHOW_DEBUG) {
					#dump($strQuery," ");
					#dump($sql_filtro, ' sql_filtro');
					#dump($order, ' order');
				}
				#dump($strQuery, ' strQuery ++ '.to_string());
				#error_log($strQuery);
				
	
			#global$TIMER;$TIMER[__METHOD__.'TEST::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::']=microtime(1);
				
			
			
			#
			#
			# EXEC RESULT
			#
			#
				$result	= JSON_RecordObj_matrix::search_free($strQuery);									
				if (!$result) {					
					trigger_error("Error Processing Request : Sorry cannot execute list query: $strQuery");
				}
				#echo "<hr> Time To Generate list html from section_list: section_tipo:$section_tipo): ".round(microtime(1)-$start_time,3);
	
			
			#
			# FULL COUNT IS A INDEPENDENT SEARCH FOR SPEED
			#
				if (!$sql_options->full_count && $sql_options->limit>0 && $sql_options->search_options_session_key!='current_edit') {
					$start_time_full_count= microtime(1);
					$sql_columns 	= "count(*) AS full_count"; // count(*) OVER() AS full_count
					$strQuery_count	= "SELECT $sql_columns FROM \"$sql_options->matrix_table\" a WHERE ".trim($sql_filtro)." \n;";	// LIMIT 1
					if(SHOW_DEBUG) {
						$strQuery_count = '-- '.__METHOD__.' : '.debug_backtrace()[1]['function']."\n".$strQuery_count;
					}
					$result_count 	= JSON_RecordObj_matrix::search_free($strQuery_count);
					$row_count 	 	= pg_fetch_assoc($result_count);
					$sql_options->full_count = $row_count['full_count'];
					if(SHOW_DEBUG) {
						$total=round(microtime(1)-$start_time_full_count,3);
						if ($total > SLOW_QUERY_MS) {
							dump($row_count['full_count'],"full_count ".$total."secs for \n".print_r($strQuery_count,true));
						}
					}
				}


			#
			#
			# 1 Build a temporal table with array of records found in query
			$table_temp=array();
			$r=0;while ($rows = pg_fetch_assoc($result)) {				
				
				$c=0;while ($c < pg_num_fields($result))	{
					$fieldName = pg_field_name($result, $c);					
					if(isset($rows['id'])){
						$table_temp[$rows['id']][$fieldName] = $rows[$fieldName]; // default search case
					}else{
						$table_temp[$r][$fieldName] = $rows[$fieldName]; // custom filter query case
					}											
				$c++;}
				$r++;
			}
			#dump($table_temp,"table_temp");
			#dump(array_keys($table_temp)," ");
			#dump($sql_options,"sql_options"); dump($table_temp,"table_temp");die();
			

			if(!empty($sql_options->filter_by_id)) {
				#dump($sql_options->filter_by_id,"filter_by_id is not empty !");	dump($sql_options,"sql_options");
				
				#
				# 2 Construimos la tabla final mapeando las columnas provisionales de los fragmentos
				# RECORDS (requested as locators)
				# Crearemos la tabla final insertando los registros de la tabla temporal en cada uno de los locators solicitados (excepto que no exitan o no se autoricen)
				# recombinado las columnas provisionales solicitadas a la BBDD en la colunma correspondiente. Al final descartaremos las columnas provisonales.
				# Obtenderemos algo de tipo
				# [133] => Array (
			    #        [id] => 133
			    #        [section_id] => 1     
			    #        [locator_dd22_1] => Esto es
			    #        [locator_dd22_2] => un texto
			    #		 [dd22] => Esto es un texto completo
			    #
				# Que convertiremos en
			    # [0][133] => Array (
			    #        [id] => 133
			    #        [section_id] => 1
			    #		 [dd22] => Esto es
			    # [1][133] => Array (
			    #        [id] => 133
			    #        [section_id] => 1
			    #		 [dd22] => un texto
				# 
				$table_final=array();
				$i=0;

				/*
				# Extract clean id's and data from locators
				sort($sql_options->filter_by_id);
				#dump($sql_options->filter_by_id,"sql_options->filter_by_id");
				$ar_locators=array();
				foreach ($sql_options->filter_by_id as $current_locator) {

					# Locators 
					$ar_parts=explode('.', (string)$current_locator);	#dump($ar_parts,"ar_parts para $current_locator");
					$id_from_locator 	= $ar_parts[0];
					$tipo_from_locator 	= 0;	if(!empty($ar_parts[1])) $tipo_from_locator = $ar_parts[1];
					$tag_from_locator 	= 0;	if(!empty($ar_parts[2])) $tag_from_locator  = $ar_parts[2];

					$ar_locators[$current_locator] = array(
														'id_from_locator' 	=> $id_from_locator,
														'tipo_from_locator' => $tipo_from_locator,
														'tag_from_locator'	=> $tag_from_locator
														);					
				}#end foreach ($sql_options->filter_by_id as $current_locator)
				#dump($ar_locators,"ar_locators ");#die();
				#dump($table_temp,"table_temp ");die();
				*/
				# Iterate table_temp and get data from ar_locators
				#dump($table_temp,"table_temp");
				$i=0;				
				foreach ($table_temp as $current_id => $ar_value) {
					#$current_id = (int)$table_temp[$current_id]['section_id']; 	
					#dump($current_id," current_id");

					#foreach ($ar_locators as $current_locator => $ar_parts) {
					foreach ($sql_options->filter_by_id as $key => $current_locator) {
						#dump($current_locator,"current_locator");
						if (!isset($current_locator->section_id)) {
							if(SHOW_DEBUG) {
								dump($current_locator, 'current_locator', array());
							}
							trigger_error("ERROR: undefined section_id for current_locator: $current_locator");
						}


						# LOCATOR ID
							$id_from_locator 	= $current_locator->section_id;
						# LOCATOR TIPO
							$tipo_from_locator 	= null;
							if (isset($current_locator->component_tipo)) {
								$tipo_from_locator 	= $current_locator->component_tipo;
							}
						# LOCATOR TAG_ID
							$tag_from_locator 	= null;
							if (isset($current_locator->tag_id)) {
								$tag_from_locator 	= $current_locator->tag_id;
							}						

						# Add locator object for use in rows
						$ar_value['lc_object'] = $current_locator;
							#dump($current_locator, ' current_locator');
							#dump($sql_columns, ' sql_columns');
							#dump($current_id,"current_id - id_from_locator: $id_from_locator");
							#dump($table_temp[$current_id]['section_id']," current_id]['section_id");
						#if ($current_id == $id_from_locator) {
						if ((int)$table_temp[$current_id]['section_id'] == (int)$id_from_locator) {
								
							if (empty($tipo_from_locator) && empty($tag_from_locator)) {
								# Locator del registro completo
								# Rebuild columns
								$table_final[$i]["$current_id"] = $ar_value;
									#dump($ar_value,"ar_value");
								$i++;
							}else{
								#dump($ar_value, "$current_id.$tipo_from_locator.$tag_from_locator");
								# Locator de una parte.
								$table_final[$i]["$current_id.$tipo_from_locator.$tag_from_locator"] = $ar_value;
								# Substiuimos el valor de la columna general por la columna del fragmento
								if (isset($table_temp[$current_id]['locator_'.$tipo_from_locator.'_'.$tag_from_locator])) {
									$table_final[$i]["$current_id.$tipo_from_locator.$tag_from_locator"][$tipo_from_locator] = $table_temp[$current_id]['locator_'.$tipo_from_locator.'_'.$tag_from_locator];
								}								
								$i++;
									#dump($table_temp[$current_id]['locator_'.$tipo_from_locator.'_'.$tag_from_locator],"id_from_locator ".'locator_'.$tipo_from_locator.'_'.$tag_from_locator);	
							}
						}#end if ($current_id == $id_from_locator) 
					}
					#dump($table_final,"table final");				
					#$i++;
				}//end foreach ($table_temp as $current_id => $ar_value) {
				#dump($sql_options,"sql_options"); dump($table_final,"table_final");die();
				
				# Eliminamos las colunmas provisionales (contienen locator_xxx en el nombre)
				foreach ($table_final as $i => $ar_value) {
					foreach ($ar_value as $id_from_locator => $ar_record) {
						#echo " <br> $id_from_locator";
						$current_keys = array_keys($ar_record);
							#dump($current_keys,"current keys for $id_from_locator");
						foreach ($current_keys as $current_key) {
							if (strpos($current_key, 'locator')!==false) {
								unset($table_final[$i][$id_from_locator][$current_key]);
							}
						}						
					}
				}
				#dump($table_final,"table_final");die();
				

				# ORDER FINAL ARRAY				
				#section_list::order_portal_list($table_final, $sql_options); # modify directly var $table_final
					#dump($table_final,"order_portal_list table_final");#die();				
				
				$result = $table_final;
				
			}else {

				#
				# 2 Construimos la tabla final . Le añadimos los índices automáticos para unificar con los registros de portales
				$result=array();
				foreach ($table_temp as $key => $value) {
					$result[] = array($key => $value);
				}				
			}//if(!empty($sql_options->filter_by_id)) {
			
			# Info
			#echo "<hr> Time To Generate list html (over $full_count records from section_list: ".key($layout_map)." - section_tipo:$section_tipo): ".round(microtime(1)-$start_time,3);
			#echo "<br>Line 888<pre>$strQuery</pre>";
			#dump($result,"result");#die();			

			#
			# RECORDS_DATA BUILD TO OUTPUT
			$records_data = new stdClass();
				$records_data->options				= $sql_options;
				$records_data->columns_to_resolve	= (object)$columns_to_resolve;
				$records_data->strQuery 	 		= $strQuery;
				if (isset($strQuery_count)) {				
					$records_data->strQuery = $strQuery_count ."\n\n". $records_data->strQuery;
				}
				$records_data->result 		 		= (array)$result;
				$records_data->generated_time['get_records_data'] = round(microtime(1)-$start_time,3);
					#dump($records_data, '$records_data', array());


			#
			# SESSION SEARCH_OPTIONS STORE FOR REUSE . // auto generate session key when not set
			# Auto generate session key when not received one
			if ( !$sql_options->search_options_session_key ) {
				$sql_options->search_options_session_key = $sql_options->section_tipo.'_'.$sql_options->modo.'_'.TOP_TIPO;
			}
			# Save options in session. If 'current_edit' is set as search_options_session_key, no session is saved (case new record for example)
			if ($sql_options->search_options_session_key!='current_edit') {
				$_SESSION['dedalo4']['config']['search_options'][$sql_options->search_options_session_key] = $sql_options;
			}			
			

			if(SHOW_DEBUG) {
				#dump($sql_options->search_options_session_key , '$sql_options->search_options_session_key ', array());
				#dump($sql_options, 'sql_options generate: '.$strQuery);
				#unset($_SESSION['dedalo4']['config']['search_options']);
				#dump($sql_options->search_options_session_key,"search_options_session_key");
				#dump($sql_options,"sql_options $sql_options->search_options_session_key");
				#dump($records_data->result," records_data-result");

				$records_data->strQuery = "-- SEARCH_OPTIONS_SESSION_KEY: ".$sql_options->search_options_session_key ."\n". $records_data->strQuery;
			
				global$TIMER;$TIMER[__METHOD__.'_OUT_'.$current_sosk .'_'. $sql_options->search_options_session_key]=microtime(1);
			}
			#dump($records_data,'$records_data');

			return (object)$records_data;	

	}#end get_records_data




	/**
	* SEARCH_BY_VALUE
	* @param string $value
	* @return object - array ar_locator and string query
	*/
	protected static function search_by_value($subsearch_query, $table) {
		$ar_locator=array();

		$strQuery = "
		-- ".__METHOD__."
		SELECT a.section_id, a.section_tipo FROM \"$table\" a WHERE 
		$subsearch_query
		";
		$result = JSON_RecordObj_matrix::search_free($strQuery);
		while ($rows = pg_fetch_assoc($result)) {
			
			$section_id 	= $rows['section_id'];
			$section_tipo 	= $rows['section_tipo'];
			
			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);
			
			$ar_locator[] = $locator;
		}
		# strQuery debug info remove new lines 
		$strQuery = str_replace("\n", '', $strQuery);
		$strQuery = preg_replace('/\s\s+/', ' ', $strQuery);

		$object = new stdClass();
			$object->strQuery 	= $strQuery;
			$object->ar_locator = $ar_locator;
		return $object;
	}




	# ORDER_PORTAL_LIST
	# Re-order db result table by filter options (by reference)
	public static function order_portal_list_DES(&$table_final, $options) {
		
		#
		# MATRIX TIME MACHINE NOT SORT FOR NOW
		if ($options->matrix_table=='matrix_time_machine') {
			return $table_final;
		}

		$table_final_pre_sort = $table_final;

		#dump($table_final,"table_final 1 ");
		#dump(count($table_final)," ");
		if (count($table_final)<2) {
			return $table_final;
		}

		# Remove first level of array
		$new_table=array();
		foreach ($table_final as $key => $value) {
			$current_key = key($value);
			$new_table[$current_key] = $value;
		}
		#dump($new_table,"new_table");
		#dump($options->filter_by_id," options->filter_by_id");

		# Clean and re-create the final table ordered by options->filter_by_id
		$table_final=array();
		foreach ( (array)$options->filter_by_id as $current_locator_obj ) {
		#dump($current_locator_obj," current_locator_obj");
			$key='';
			if (isset($current_locator_obj->section_id)) {
				$key .= $current_locator_obj->section_id;
			}
			if (isset($current_locator_obj->component_tipo)) {
				$key .= '.'.$current_locator_obj->component_tipo;
			}
			if (isset($current_locator_obj->tag_id)) {
				$key .= '.'.$current_locator_obj->tag_id;
			}
			#dump($key,"key");
			
			if ( array_key_exists($key, $new_table) ) {				
				$table_final[] = $new_table[$key];	
				#error_log("MSG: sort portal list key '$key' ok exits in table : ".__METHOD__);
			}else{
				error_log("WARNING: Something was wrong when sort portal list key '$key' not exits in table : ".__METHOD__);
			}
		}
		#dump($table_final,"table_final 2 (ORDERED)");

		if(SHOW_DEBUG) {
			if (empty($table_final) && !empty($table_final_pre_sort)) {
				dump($table_final_pre_sort,"PRE table_final_pre_sort");
				dump($table_final,"POST table_final");
				throw new Exception("Error Processing Request. Sort table result is wrong. Please, review 'order_portal_list' ", 1);							
			}
		}
	}//end order_portal_list

	


	/**
	* CLEAN_FILTER_BY_SEARCH
	* @param object $filter_by_search_obj
	* @return object $filter_by_search_obj
	*/
	public static function clean_filter_by_search( $filter_by_search_obj ) {
	
		foreach ($filter_by_search_obj as $key => $search_value) {
			
			$string_value = $search_value;
			if (empty($string_value)) {
				unset($filter_by_search_obj->$key);
			}else{
				$json_value = json_decode($search_value);
				if (!is_null($json_value) && empty($json_value)) {
					unset($filter_by_search_obj->$key);
				}									
			}								
		}

		return $filter_by_search_obj;			
		
	}#end clean_filter_by_search
	
}
?>