<?php
/*
* CLASS SEARCH
*
*
*/
class search extends common {

	// object
	protected $options;

	public static $MATRIX_RELATIONS_TABLE = 'relations';
	
	
	/**
	* GET_RECORDS_DATA
	* Build list records data from DDBB with received options 
	* @param object $options
	* @return object $records_data {result,strquery,options,..}
	*/
	public static function get_records_data($options) {

		#dump($options,"options");
		$start_time=microtime(1);
		if(SHOW_DEBUG===true) {
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
			if(SHOW_DEBUG===true) {
				dump($options,"options");
				throw new Exception("Error Processing Request", 1);				
			}			
			return null;
		}
		if(empty($options->section_tipo) && !isset($options->filter_by_locator) ){
			trigger_error("options section_tipo is mandatory");
			return null;
		}

		# WARNING
		$caller = debug_backtrace()[0];
		error_log("!!!!!!!!!!! Llamada get_rows_data con section_tipo:$options->section_tipo (CHANGE TO NEW SEARCH IF IS POSSIBLE) ".json_encode($caller, JSON_PRETTY_PRINT) );

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
			$sql_options->tipo_de_dato 			= (string)'valor_list'; # Columns container type. Can be dato, valor, valor_list, etc...
			$sql_options->tipo_de_dato_search 	= (string)'dato';
			$sql_options->tipo_de_dato_order  	= (string)'valor';
			$sql_options->limit				  	= (int)DEDALO_MAX_ROWS_PER_PAGE;
			$sql_options->offset				= (int)0;  # Default 0
			$sql_options->group_by				= (bool)false;
			$sql_options->order_by				= (bool)false;//(bool)false; default 'section_id ASC'
			$sql_options->order_by_locator 		= (bool)false;
			$sql_options->search_options_session_key = (bool)false;	# key con el que se guarda la cache de session de las opciones. Por defecto es section tipo, pero en el caso de portales es distinto a la sección.			
			$sql_options->query_wrap 			= (bool)false; # wrap final query in another

			# Specific options for store			
			$sql_options->offset_list			= (int)0;  # Default 0			
			$sql_options->limit_list			= (int)DEDALO_MAX_ROWS_PER_PAGE;
			$sql_options->layout_map_list		= (bool)false;

			if($sql_options->section_tipo === DEDALO_ACTIVITY_SECTION_TIPO){
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

			# Removed 13-2-2018
			#$columns_to_resolve = new stdClass();

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
		if ($sql_options->modo === 'edit') {
			# Nothing to do
		}else 
		if ( $sql_options->layout_map===false ) { //|| empty($sql_options->layout_map || ($sql_options->modo != 'edit' && empty($sql_options->layout_map)
			 	//
			$section 				 = section::get_instance(null,$sql_options->section_tipo,'list');
			$sql_options->layout_map = (array)component_layout::get_layout_map_from_section( $section );
				#dump($layout_map, 'layout_map for section '.$sql_options->section_tipo, array());
		}
		if ($sql_options->modo!=='edit' && empty($sql_options->layout_map)) {
			if(SHOW_DEBUG===true) {
				dump($sql_options, 'sql_options', array());
			}
			#throw new Exception("Error: layout_map is not defined! [$section_tipo] ", 1);
			trigger_error("Error: layout_map is not defined! [$section_tipo] ");
		}
		# Verify permissions of every field and remove not authorized element
		foreach ((array)$sql_options->layout_map as $current_section_list_tipo => $map_values)
		foreach ((array)$map_values as $current_component_tipo) {
			if (empty($current_component_tipo)) {
				if(SHOW_DEBUG===true) {
					dump($sql_options->layout_map, " sql_options->layout_map ".to_string());
					dump($map_values, " map_values ".to_string());;
				}
				debug_log(__METHOD__." Error Processing Request: current_component_tipo is empty in latout map_values: ".to_string($map_values), logger::ERROR);			
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
				$id_column_name 		  = ($sql_options->matrix_table==='matrix_time_machine') ? 'id'   : 'id'; //section_id AS id
				$section_tipo_column_name = ($sql_options->matrix_table==='matrix_time_machine') ? 'tipo' : 'section_tipo';
				$sql_columns .= "a.$id_column_name, a.section_id, a.$section_tipo_column_name,";	# Fixed columns
				#$sql_columns .= "\n ($sql_options->json_field#>>'{section_id}')::int AS section_id,";	# Fixed columns

				#if($sql_options->section_tipo === DEDALO_ACTIVITY_SECTION_TIPO){
				#	$sql_columns = 'id,';	# Only use id (not exists column section_tipo and section_id)
				#}
						
				
				if ($sql_options->sql_columns) {
					$sql_columns = $sql_options->sql_columns;
				}else{
					$traducible=array();
					if(SHOW_DEBUG===true) {
						if ($sql_options->modo!=='edit' && empty(reset($sql_options->layout_map))) {
							debug_log(__METHOD__." Warning. Section list of current layout map is empty or invalid. ".to_string($sql_options->layout_map), logger::DEBUG);
							#echo "<div class=\"warning\">[Search] Warning. Section list of current layout map is misconfigured or your user (".navigator::get_user_id().") modo:".$sql_options->modo." don't have privileges to acces: ".to_string($sql_options->layout_map)."</div>";
							#dump($sql_options->layout_map, 'Sorry. Section list of current layout map is misconfigured: $sql_options->layout_map');
							#throw new Exception("Error Processing Request. Section list of current layout map is misconfigured. Please review section/portal structure $sql_options->section_tipo", 1);							
						}
					}

					if(count($sql_options->layout_map)>0) foreach ((array)reset($sql_options->layout_map) as $current_column_tipo) {

						$RecordObj_dd = new RecordObj_dd($current_column_tipo);
						$traducible[$current_column_tipo] = $RecordObj_dd->get_traducible();
						if ($traducible[$current_column_tipo]!=='si') {
							$current_lang 	= DEDALO_DATA_NOLAN;
							
							#
							# Para los componentes de lang DEDALO_DATA_NOLAN, buscaremos sus relaciones.
							# Si el primer elemento relacionado es traducible, lo añadimos las lista de elementos a resolver
							# Removed 13-2-2018
							/*$relacionados = $RecordObj_dd->get_relaciones();							
							if(!empty($relacionados )){

								$termonioID_related = array_values($relacionados[0])[0];
								$RecordObjt_dd_rel	= new RecordObj_dd($termonioID_related);								

								if($RecordObjt_dd_rel->get_traducible() === 'si'){									
									$columns_to_resolve->$current_column_tipo = new stdClass();
									$columns_to_resolve->$current_column_tipo->rel = $termonioID_related;
								}
							}*/
							
						}else{
							$current_lang = DEDALO_DATA_LANG;
						}
						# When filter_by_id is received, especial selection is made for columns
						# dump($sql_options->filter_by_id,"sql_options->filter_by_id");		
						if(!empty($sql_options->filter_by_id) && is_array($sql_options->filter_by_id)) foreach($sql_options->filter_by_id as $rel_locator) {
							
							$locator_obj = (object)$rel_locator;							
								#dump($locator_obj,"locator obj from $rel_locator");
							if (isset($locator_obj->component_tipo) && $locator_obj->component_tipo === $current_column_tipo) {
								$sql_columns .= "\n a.$sql_options->json_field#>>'{components, $current_column_tipo, ".$sql_options->tipo_de_dato.", $current_lang, $locator_obj->tag_id}' AS locator_{$current_column_tipo}_{$locator_obj->tag_id},";
							}
						}

						$column_modelo = RecordObj_dd::get_modelo_name_by_tipo($current_column_tipo,true);
						if (in_array($column_modelo, component_relation_common::get_components_with_relations())) {
							#$sql_columns .= "\n a.$sql_options->json_field#>>'{relations}' AS $current_column_tipo,";
							$sql_columns .= "\n '' AS $current_column_tipo,";
							#$sql_columns .= "\n to_json(ARRAY(SELECT arr1 FROM jsonb_array_elements(a.$sql_options->json_field#>'{relations}') as arr1 WHERE arr1 @> '{\"from_component_tipo\":\"$current_column_tipo\"}')) AS $current_column_tipo,";
						
						}else{
							$sql_columns .= "\n a.$sql_options->json_field#>>'{components, $current_column_tipo, ".$sql_options->tipo_de_dato.", $current_lang}' AS $current_column_tipo,";
						}
						
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
				if($sql_options->section_tipo === DEDALO_ACTIVITY_SECTION_TIPO){
					$sql_filtro = ' a.id IS NOT NULL ';
				}


				#
				# FILTER_BY_SECTION_TIPO : Add current section tipo to filter (in matrix time machine column section_tipo is 'tipo')									
					if( $sql_options->section_tipo !== DEDALO_ACTIVITY_SECTION_TIPO && !$sql_options->filter_by_locator ) {
						
						$sql_filtro .= "\n-- filter_by_section_tipo -- \n";	
						
						$RecordObj_dd = new RecordObj_dd($sql_options->section_tipo);
						$propiedades  = $RecordObj_dd->get_propiedades();		
						$propiedades  = (object)json_decode($propiedades);		
						if ( property_exists($propiedades, 'section_tipo') && $propiedades->section_tipo==='real' ) {
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
							if (isset($current_locator->section_tipo) && isset($current_locator->section_id)) {
								$filter_by_locator .= "(a.section_tipo='".$current_locator->section_tipo."' AND a.section_id=".$current_locator->section_id.") OR\n";
							}else{
								$filter_by_locator .= "(a.section_tipo='IMPOSSIBLE_VALUE') OR\n";
								debug_log(__METHOD__." Ignored invalid locator as filter ".to_string($current_locator), logger::ERROR);
							}							
						}
						if (!empty($filter_by_locator)) {
							$sql_filtro .= "\n-- filter_by_locator -- \n AND (\n" . substr($filter_by_locator, 0,-3)."\n)";
						}
					}
				
				#
				# FILTER_BY_ID : Used by portals and formated as locator objects array
					if ($sql_options->section_tipo===DEDALO_SECTION_USERS_TIPO) {
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
								if(SHOW_DEBUG===true) {
									dump($sql_options,"sql_options ");
								}
								throw new Exception("ERROR: Deprecated section_id_matrix for current_locator: :" .json_encode($current_locator). " ");							
							}

							if (!is_object($sql_options->filter_by_id[$current_key]) || !isset($current_locator->section_id) || empty($current_locator->section_id)) { 
								# Invalid locator
								if(SHOW_DEBUG===true) {
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
						if(SHOW_DEBUG===true) {
							#log_messages("Used: $section_creator_portal_tipo_filtro",'');
						}
						$sql_filtro .= $section_creator_portal_tipo_filtro;
					}

				
				#
				# FILTER_BY_INVERSE_LOCATORS : Section filtered by inverse locators
					/* DEPRECATED !!!
					# datos #> '{inverse_locators}' @> '[{"section_tipo":"oh1"}]'
					if ($sql_options->filter_by_inverse_locators) {						
						$filter_by_inverse_locators  = "\n-- filter_by_inverse_locators -- \n";
						foreach ($sql_options->filter_by_inverse_locators as $key => $value) {
							#$filter_by_inverse_locators .= "AND $sql_options->json_field #> '{inverse_locators}' @> '[{\"$key\":\"".$value."\"}]'::jsonb ";
							$filter_by_inverse_locators .= "AND a.$sql_options->json_field -> 'inverse_locators' @> '[{\"$key\":\"".$value."\"}]'::jsonb ";	// Por compatibilidad con 9.4
						}												
						if(SHOW_DEBUG===true) {
							#log_messages("Used: $filter_by_inverse_locators",'');
						}
						$sql_filtro .= $filter_by_inverse_locators;
					}*/


				#
				# FILTER PROPIEDADES : Section filter_by_id
				# Returned format is like '[rsc24] => 114'. component tipo => value
				# NOTA: Opcionalmente, se podría prescindir de este filtro ya que 'filter_by_section_creator_portal_tipo' en más restrictivo. ¿Esto es así???
					if( !empty($sql_options->filter_by_id) || !empty($sql_options->filter_by_locator) ) {
						# Notinhg to do (filter by id is more restrictive)
					
					}else if ($sql_options->section_real_tipo !== $sql_options->section_tipo) {
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
								if ($traducible!=='si') {
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
											if(SHOW_DEBUG===true) {
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
								if(SHOW_DEBUG===true) {
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
					if ($sql_options->matrix_table==='matrix_list' || $sql_options->matrix_table==='matrix_dd' || $sql_options->matrix_table==='matrix_hierarchy' || $sql_options->matrix_table==='matrix_hierarchy_main' || $sql_options->matrix_table==='matrix_langs') {
						# No filter is applicable when current section is a list of values (public or private)
					}else{
						$sql_filtro .= filter::get_sql_filter( (object)$filter_options );
					}
					

				#
				# FILTER_USER_RECORDS_BY_ID (Temporal from config)
				# Filter user access to section records by section_id 			
				$sql_filtro .= self::get_filter_user_records_by_id_filter($sql_options->section_tipo);				

					
								
				#
				# FILTER_BY_SEARCH
				 #dump($sql_options->filter_by_search, '$sql_options->filter_by_search ++ '.to_string());	
					if (!empty($sql_options->filter_by_search) && count((array)$sql_options->filter_by_search)>0) {
						# Clean empty values of array
						$sql_options->filter_by_search = self::clean_filter_by_search($sql_options->filter_by_search);
						$sql_filter_by_search = "\n-- filter_by_search --";
						$last_key = key( array_slice( (array)$sql_options->filter_by_search, -1, 1, TRUE ) );
							#dump($sql_options->filter_by_search, ' sql_options->filter_by_search'.to_string());

						foreach ($sql_options->filter_by_search as $search_combi => $search_value) {
							if (empty($search_value)) continue;							
	
							$search_parts = explode('_', $search_combi);
							if (isset($search_parts[2])) {
								# case components inside portals have 3 parts: portal_tipo, section_tipo and component_tipo
								$portal_tipo 			= $search_parts[0];
								$component_section_tipo = $search_parts[1];
								$search_tipo 			= $search_parts[2];
							}else{
								# only 2 parts: section_tipo and component_tipo
								$component_section_tipo = $search_parts[0];
								$search_tipo 			= $search_parts[1];
							}							

							$RecordObj_dd = new RecordObj_dd($search_tipo);
							$traducible[$search_tipo] = $RecordObj_dd->get_traducible();
							$current_lang = $traducible[$search_tipo]!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
								
							# SEARCH OPERATORS RESOLVE
							$comparison_operator = "ILIKE";
							if(isset($sql_options->operators->comparison_operator)){
								foreach ($sql_options->operators->comparison_operator as $key_tipo => $operator) {
									if($key_tipo === $search_tipo){												
										$comparison_operator = $operator;
										break;
									}
								}
							}							
							$logical_operator = "AND";
							if(isset($sql_options->operators->logical_operator)){
								foreach ($sql_options->operators->logical_operator as $key_tipo => $operator) {
									if($key_tipo === $search_tipo){
										$logical_operator = $operator;
										break;
									}
								}
							}

							$search_tipo_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($search_tipo, true);
								#dump($search_tipo_modelo_name, ' search_tipo_modelo_name ++ '.to_string($search_tipo));							
							
							#dump($search_tipo," search_tipo - search_value: $search_value");
							# Search component section to separate portal components
							#$component_section_tipo = component_common::get_section_tipo_from_component_tipo($search_tipo);
							# $section_real_tipo 		= $sql_options->section_real_tipo;
								#dump($component_section_tipo," section_real_tipo - sql_options->section_tipo: $sql_options->section_tipo");die();
							
							if ($component_section_tipo !== $sql_options->section_tipo) {
	
								#
								# SUBSEARCH . Subquery when current component is not current section (like informant name in oh1)
								#$subsearch_query = "a.{$sql_options->json_field}#>>'{section_tipo}' = '$component_section_tipo' ";
								$subsearch_query = "(a.section_tipo = '$component_section_tipo') ";
								
								// Is portal element. We make a pre search to obtain locators
								$table_search 	  = common::get_matrix_table_from_tipo($component_section_tipo);									
								$subsearch_query .= ' AND '.$search_tipo_modelo_name::get_search_query( $sql_options->json_field, $search_tipo, $sql_options->tipo_de_dato_search, $current_lang, $search_value, $comparison_operator);
									#dump($subsearch_query, " subsearch_query ".to_string());
								
								$search_by_value = self::search_by_value($subsearch_query, $table_search);
								$ar_locator 	 = $search_by_value->ar_locator;								
								# Notar que portal_tipo ahora se recibe a través del nombre del input (search_input_name) recibido por el formulario de búsqueda (like oh20_oh1_rsc152)						
								# $portal_tipo 	 = section::get_portal_tipo_from_component_in_search_list($sql_options->section_tipo, $search_tipo);
								if (empty($portal_tipo)) {
									#throw new Exception("Error Processing Request. portal_tipo is empty ($sql_options->section_tipo - $search_tipo) Not found in any portal search_list of $sql_options->section_tipo", 1);	
									trigger_error("Error Processing Request. portal_tipo is empty ($sql_options->section_tipo - $search_tipo) Not found in any portal search_list of $sql_options->section_tipo");							
								}

								$portal_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($portal_tipo, true);

								if (count($ar_locator)>0) {										
									
									$sql_filter_by_search .= "\n".$search_by_value->strQuery."\n";
									$sql_filter_by_search .= '(';
									foreach ($ar_locator as $current_locator) {
										$current_locator_string = json_encode($current_locator);
										#$sql_filter_by_search .= "\n a.$sql_options->json_field#>'{components,$portal_tipo,dato,lg-nolan}' @> '[$current_locator_string]' ";
										$sql_filter_by_search .= $portal_modelo_name::get_search_query( $sql_options->json_field, $portal_tipo, 'dato', DEDALO_DATA_NOLAN, '['.$current_locator_string.']', '=');
										if ($current_locator != end($ar_locator)) $sql_filter_by_search .= 'OR ';
									}
									$sql_filter_by_search .= ') ';

								}else{

									// Only to avoid show results when no ar_locator are found																			
									$sql_filter_by_search .= "\n".$search_by_value->strQuery;
									#$sql_filter_by_search .= "\n a.$sql_options->json_field#>'{components,$portal_tipo,dato,lg-nolan}' @> '{\"RESULT\":\"NOTHING_FOUND\"}' ";
									$sql_filter_by_search .= $portal_modelo_name::get_search_query( $sql_options->json_field, $portal_tipo, 'dato', DEDALO_DATA_NOLAN, '[{"RESULT":"NOTHING_FOUND"}]', '=');
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
								#dump($sql_filter_by_search, ' sql_filter_by_search ++ '.to_string($search_value));
							}//end if ($component_section_tipo != $section_real_tipo)							

							
							# Add logical_operator each iteration
							if($search_combi != $last_key) {
								$sql_filter_by_search .= $logical_operator; // Default is 'AND'
								$sql_filter_by_search .= ' ';
							}
							
						}//end foreach ($sql_options->filter_by_search as $search_tipo => $search_value) {
						
						# dump(strlen($sql_filter_by_search), 'strlen($sql_filter_by_search) ++ '.to_string());
						#dump($sql_filter_by_search, ' sql_filter_by_search ++ '.to_string());
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

					case $sql_options->order_by==='count':
						// Nothing to do
						break;

					case (isset($order_by_resolved)) :
						$order = "\n ORDER BY $order_by_resolved";
						break;

					#case($sql_options->order_by) :
					#	$order = "\n ORDER BY $sql_options->order_by";
					#	break;
					case $sql_options->order_by_locator === true:

							$ar_parts 			= explode(' ', $sql_options->order_by);
							$component_tipo 	= $ar_parts[0];
							$component_order 	= $ar_parts[1];

							$related_terms = RecordObj_dd::get_ar_terminos_relacionados($component_tipo, $cache=true, $simple=true);

							$component_tipo_related = false;

							foreach ($related_terms as $current_tipo) {
								$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
								if ($modelo_name === 'section'){
									$section_tipo_related = $current_tipo;
								}else if (!$component_tipo_related && $modelo_name === 'component_input_text'){
									$component_tipo_related = $current_tipo;
								}
							}

							# NOTE: This is only valid for autocompletes and components with input_text related, not for portals
							if ($component_tipo_related!==false) {

								$RecordObj_dd = new RecordObj_dd($component_tipo_related);
								$traducible   = $RecordObj_dd->get_traducible();

								$current_lang = $traducible === 'no' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;								

								$target_matrix = common::get_matrix_table_from_tipo($section_tipo_related);

								$left_join_sql .= 'LEFT JOIN '.$target_matrix.' b ON ';
								$left_join_sql .= "\n b.section_id::text = a.datos#>'{components, $component_tipo, dato, lg-nolan}'->0->>'section_id' AND ";
								$left_join_sql .= "\n b.section_tipo = a.datos#>'{components, $component_tipo, dato, lg-nolan}'->0->>'section_tipo' ";

								//$order .= "\n WHERE a.section_tipo = '$sql_options->section_tipo' ";
								$order .= "\n ORDER BY unaccent(b.datos#>>'{components, $component_tipo_related, valor, $current_lang}') $component_order, a.id $component_order";
							}
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
									$current_lang 	= ($traducible[$current_column_tipo]!='si') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;	
								}else{
									$RecordObj_dd 	= new RecordObj_dd($current_column_tipo);
									$traducible  	= $RecordObj_dd->get_traducible();
									$current_lang 	= ($traducible!='si') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;									
								}								
								#$order_by_resolved = "a.$sql_options->json_field#>>'{components, $current_column_tipo, $sql_options->tipo_de_dato_order, $current_lang}' ".$order_direction;
									#dump($sql_options->tipo_de_dato_order, ' $sql_options->tipo_de_dato_order ++ '.to_string());
								if($sql_options->section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
									$order_by_resolved 	 = 'a.section_id DESC';
								}else{
									$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_column_tipo,true);
									$order_by_resolved 	 = $current_modelo_name::get_search_order($sql_options->json_field, $current_column_tipo, $sql_options->tipo_de_dato_order, $current_lang, $order_direction);
								}
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
				if ($sql_options->filter_custom || $sql_options->order_by_locator === true) {
					$strQuery ="\n SELECT $sql_columns \n FROM \"$sql_options->matrix_table\" a \n $left_join_sql WHERE $sql_filtro $group_by $order $limit \n";
				}else{
					$strQuery ="\n SELECT $sql_columns \n FROM \"$sql_options->matrix_table\" a \n $left_join_sql WHERE a.id IN (SELECT a.id FROM \"$sql_options->matrix_table\" a WHERE $sql_filtro $order $limit) $group_by $order \n";
				}

				# QUERY_WRAP
				# Used to wrap current query. For example, for made a SUM like:
				# SELECT SUM( CAST( a.datos#>>'{components, muvaet14, dato, lg-nolan}' AS INTEGER )) AS total FROM "matrix" a WHERE a.id IN ( $strQuery )
				if($sql_options->query_wrap) {
					$strQuery = sprintf($sql_options->query_wrap, $strQuery);
				}
				#dump($strQuery,"strQuery");	#die();

				if(SHOW_DEBUG===true) {
					$bt = isset(debug_backtrace()[1]['function']) ? debug_backtrace()[1]['function'] : '';
					$strQuery = '-- '.__METHOD__.' : '. to_string($bt) ." ".$strQuery;
				}
				#$sql_options->strQuery = $strQuery;
				if(SHOW_DEBUG===true) {
					#dump($strQuery," ");
					#dump($sql_filtro, ' sql_filtro');
					#dump($order, ' order');
				}
				#dump($strQuery, ' strQuery ++ '.to_string()); die();
				if(SHOW_DEBUG===true) {
					//error_log("////////////// \n ".$strQuery);
				}
				
				
	
			#global$TIMER;$TIMER[__METHOD__.'TEST::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::']=microtime(1);
				
			
			#
			#
			# EXEC RESULT
			#
			#
				$result	= JSON_RecordObj_matrix::search_free($strQuery);									
				if (!is_resource($result)) {					
					trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $strQuery");
					return null;
				}
				#echo "<hr> Time To Generate list html from section_list: section_tipo:$section_tipo): ".round(microtime(1)-$start_time,3);
	
			
			#
			# FULL COUNT IS A INDEPENDENT SEARCH FOR SPEED
			#
				if (!$sql_options->full_count && $sql_options->limit>0 && $sql_options->search_options_session_key!=='current_edit') {
						
					$sql_filtro = trim($sql_filtro);
					if ($sql_filtro==='a.id IS NOT NULL' || $sql_filtro==="a.section_id IS NOT NULL \n-- filter_by_section_tipo -- \n AND") {
						$where_filter = '';
					}else{
						$sql_filtro = str_replace("a.section_id IS NOT NULL \n-- filter_by_section_tipo -- \n AND ", '', $sql_filtro);
						$where_filter = ' a WHERE '.$sql_filtro;
					}
					$start_time_full_count = microtime(1);
					$sql_columns 	= "count(*) AS full_count"; // count(*) OVER() AS full_count
					$strQuery_count	= "SELECT $sql_columns FROM \"$sql_options->matrix_table\"".$where_filter.";";
					if(SHOW_DEBUG===true) {
						$strQuery_count = '-- '.__METHOD__.' : '.debug_backtrace()[1]['function']."\n".$strQuery_count;
					}
					$result_count 	= JSON_RecordObj_matrix::search_free($strQuery_count);
					$row_count 	 	= pg_fetch_assoc($result_count);
					$sql_options->full_count = $row_count['full_count'];
					if(SHOW_DEBUG===true) {
						$total=round(microtime(1)-$start_time_full_count,3);
						if ($total > SLOW_QUERY_MS) {
							debug_log(__METHOD__." SLOW_QUERY_MS full_count:".$row_count['full_count']." $total secs for \n".to_string($strQuery_count), logger::DEBUG);
						}
					}
				}


			#
			#
			# 1 Build a temporal table with array of records found in query
			$table_temp=array();
			$r=0;while ($rows = pg_fetch_assoc($result)) {
			
				$c=0;while ($c < pg_num_fields($result)) {
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
							if(SHOW_DEBUG===true) {
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
						if ((int)$table_temp[$current_id]['section_id'] === (int)$id_from_locator) {
								
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
						}#end if ($current_id === $id_from_locator) 
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
				#$records_data->columns_to_resolve	= (object)$columns_to_resolve; # Removed 13-2-2018
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
			if ($sql_options->search_options_session_key!=='current_edit') {
				$_SESSION['dedalo4']['config']['search_options'][$sql_options->search_options_session_key] = $sql_options;
			}			
			

			if(SHOW_DEBUG===true) {
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

		$strQuery  = "";
		$strQuery .= "-- ".__METHOD__;
		$strQuery .= "\nSELECT a.section_id, a.section_tipo FROM \"$table\" a WHERE ";
		$strQuery .= $subsearch_query;
	
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
		
		return (object)$object;
	}//end search_by_value



	# ORDER_PORTAL_LIST
	# Re-order db result table by filter options (by reference)
	/*public static function order_portal_list_DES(&$table_final, $options) {
		
		#
		# MATRIX TIME MACHINE NOT SORT FOR NOW
		if ($options->matrix_table==='matrix_time_machine') {
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

		if(SHOW_DEBUG===true) {
			if (empty($table_final) && !empty($table_final_pre_sort)) {
				dump($table_final_pre_sort,"PRE table_final_pre_sort");
				dump($table_final,"POST table_final");
				#throw new Exception("Error Processing Request. Sort table result is wrong. Please, review 'order_portal_list' ", 1);
				trigger_error("Error Processing Request. Sort table result is wrong. Please, review 'order_portal_list' ");							
			}
		}
	}//end order_portal_list */
	


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
				if (is_string($search_value)) {
					#dump($search_value, '$search_value ++ '.to_string());
					$json_value = json_decode($search_value);
					if (!is_null($json_value) && empty($json_value)) {
						unset($filter_by_search_obj->$key);
					}
				}													
			}								
		}

		return $filter_by_search_obj;		
	}#end clean_filter_by_search



	/**
	* GET_FILTER_USER_RECORDS_BY_ID_FILTER
	* Filter user access to section records by section_id 
	* In process.... (need specific component for manage)
	* @return string $sql_filtro
	*/
	public static function get_filter_user_records_by_id_filter( $section_tipo ) {
		
		$sql_filtro = '';

		if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {

			$filter_user_records_by_id = filter::get_filter_user_records_by_id( navigator::get_user_id() );
			if ( isset($filter_user_records_by_id[$section_tipo]) ) {
				$ar_filter = array();
				foreach ((array)$filter_user_records_by_id[$section_tipo] as $current_id) {
					$ar_filter[] = "a.section_id = " . (int)$current_id;
				}
				if (!empty($ar_filter)) {
					$sql_filtro .= "\n-- filter_user_records_by_id --\nAND (".implode(' OR ',$ar_filter).") ";
				}
			}
		}		
	
		return $sql_filtro;
	}//end get_filter_user_records_by_id_filter



/* SUBQUERY! MODEL 
SELECT *
FROM(
	SELECT id,
			matrix.section_id,
			matrix.section_tipo,
			matrix.datos#>>'{components, oh14, valor, lg-nolan}' AS oh14,

			-- if the component (portal, autocomplete, etc) don't have a locartors array, and have other "data" ex: null, NULL or ""
			-- test the dato
			-- if is array do a jsonb_array_elements
			-- else don't split in diferent rows (keep the format of hte data)

			case when (jsonb_typeof(matrix.datos#>'{components, oh24, dato, lg-nolan}') = 'array' AND {$json_field}#>'{components, $options->search_tipo, dato, $lg_nolang}' != '[]') 
				then jsonb_array_elements(matrix.datos#>'{components, oh24, dato, lg-nolan}')
				else matrix.datos#>'{components, oh24, dato, lg-nolan}'
				end as locator_b
	FROM matrix
	WHERE
	matrix.section_tipo = 'oh1'
)AS base_locartos
WHERE
	-- the comparator need to be "IN" because the right is a array. The sentence say: section_id have the number IN array of section_id's of the subquery
	locator_b->>'section_id' 
	IN (
		SELECT section_id::text
		FROM matrix matrix_rsc85 
		WHERE
		unaccent(matrix_rsc85.datos#>>'{components, rsc85, valor, lg-nolan}') ILIKE '%Rosalia%' AND
		matrix_rsc85.section_tipo = 'rsc197'
	)
*/


/*  VIEW MODEL

CREATE MATERIALIZED VIEW view_toponymy AS
SELECT 
termino.section_id,
termino.section_tipo,
(jsonb_each(termino.datos#>'{components, hierarchy25, dato}')).key as lang,
(jsonb_each(termino.datos#>'{components, hierarchy25, dato}')).value ->>0 as name,
(	SELECT jsonb_agg(json_build_object('section_id' , parent.section_id, 'section_tipo', parent.section_tipo ))
	FROM "matrix_hierarchy" parent
	WHERE
	parent.datos#>'{relations}' @> concat('[{"section_id":"',termino.section_id,'"}]')::jsonb and
	parent.datos#>'{relations}' @> concat('[{"section_tipo":"',termino.section_tipo,'"}]')::jsonb and
	parent.datos#>'{relations}' @> '[{"type":"dd48"}]'::jsonb
)as parents,
(termino.datos#>'{relations}') as relations,
hierarchy_main.datos#>('{components, hierarchy9, dato, lg-nolan}')->0->>'section_id' as typology


FROM "matrix_hierarchy" termino
LEFT JOIN "matrix_hierarchy_main" hierarchy_main
on termino.section_tipo = hierarchy_main.datos#>('{components, hierarchy53, dato, lg-nolan}')->>0

WHERE 
--termino.section_id = '10' 
--and hierarchy_main.typology = '"2"'
--and 
hierarchy_main.datos#>('{components, hierarchy9, dato, lg-nolan}')->0->>'section_id' = '2'

--LIMIT 10

;


--CREATE EXTENSION pg_trgm;
--CREATE OR REPLACE FUNCTION f_unaccent(text)
--  RETURNS text AS
--$func$
--SELECT public.unaccent('public.unaccent', $1)  -- schema-qualify function and dictionary
--$func$  LANGUAGE sql IMMUTABLE;

DROP INDEX view_toponymy_name;
CREATE INDEX view_toponymy_name ON view_toponymy USING gin(f_unaccent("name") gin_trgm_ops);
--CREATE INDEX view_toponymy_name_text ON view_toponymy(f_unaccent("name") text_pattern_ops);


SELECT *
FROM "view_toponymy"
WHERE f_unaccent("name") ILIKE f_unaccent('valencia%')
LIMIT 50



*/

	/**
	* GET_SUBQUERY
	* Build component specific sql portion query to inject in a global query
	* Default subquery. Overwrite when use components with references like component_autocomplete, etc.
	* @param object $options
	*
	* @return string $subquery
	*/
	public static function get_subquery($request_options) {

		$options = new stdClass();
			$options->search_in 	 		= null; # Where compare section_id. Like "section_id::text" for direct compare or "oh30->>'section_id'" for referenced fields
			$options->search_tipo 	 		= null; # component tipo where to search
			$options->search_section_tipo 	= null; # section tipo where to search
			$options->matrix_table 	 		= null; # table where to search
			$options->search_query 	 		= null; # composed search query
			$options->subquery_type 		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
		
		$subquery  = '';
		if(SHOW_DEBUG===true) {
			$subquery .= "\n -- ".get_called_class().' > '.__METHOD__." $options->search_tipo in section $options->search_section_tipo . Subquery $options->subquery_type ";
		}			
		
		#$subquery .= "\nsection_id::text IN( \n";
		$subquery .= "\n {$options->search_in} IN( \n";
		
		switch ($options->subquery_type) {
			case 'with_references':
				$modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($options->search_tipo,true);

				$select_options = new stdClass();
					$select_options->json_field  = 'datos';
					$select_options->search_tipo = $options->search_tipo;
					$select_options->lang 		  = 'all';	//$RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
					$select_options->modelo_name = $modelo_name;
					#$select_options->all_langs   = true;	// Important true								
				$select 	  = $modelo_name::get_select_query($select_options);

				$subquery .= " SELECT section_id::text \n";
				$subquery .= " FROM (SELECT section_id::text, ";
				$subquery .= $select;
				$subquery .= "\n FROM \n $options->matrix_table a";
				$subquery .= "\n WHERE (a.section_tipo='$options->search_section_tipo') \n";
				$subquery .= ") as base_". $options->search_tipo;
				$subquery .= "\n WHERE \n";
				break;
			
			default:
				$subquery .= " SELECT section_id::text FROM ";
				$subquery .=  "\"$options->matrix_table\" a WHERE \n";
				$subquery .= " (a.section_tipo='$options->search_section_tipo') AND \n";
				break;
		}
		
		#$subquery .= " (f_unaccent(a.datos#>>'{components, $search_tipo, dato}') ILIKE f_unaccent('%[\"{$search_value}%')) \n";
		$subquery .= " ($options->search_query) \n)";


		return $subquery;
	}//end get_subquery







	/*
		EN PRUEBAS 
	---------------------------------------------------------------------------------------------------------------------------------- */



	/**
	* GET_RECORDS_2
	* components = oh1_oh25
	* @return 
	*/
	public function get_records_2( $request_options ) {
		
		$options = new stdClass();
			$options->section_tipo		= (string)'';  # array Mandatory
			$options->main_matrix_table	= false; // string like 'matrix' optional (used to get columns section_id, section_tipo)
			$options->json_field		= (string)'datos';
			$options->data_type	 	 	= (string)'valor';  # Can be dato, valor, valor_list, etc...
			$options->select_format	 	= (string)'>>'; // JSON selector type: >> (text) or > (object)
			$options->components 	 	= array();	// [oh1_oh14]
			$options->matrix_tables  	= false; // array [oh1 => matrix] Optional

			$options->filter_by_search	= (bool)false;	# Search filter used by search form	
			$options->operators	 	 	= (bool)false;	# SQL operators used by search from

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// Fix as global
		$this->options = $options;

		// MAIN_MATRIX_TABLE
			if ($options->main_matrix_table===false) {
				$this->options->main_matrix_table = $this->get_matrix_table_from_section_tipo($options->section_tipo);
			}

		// ADD TABLES MAP AR_SEARCH_COMPONENTS
			$this->options->ar_search_components = $this->build_search_components( $options->components );

		// SELECT
			$sql_select = $this->build_sql_select();
				dump($sql_select, ' sql_select ++ '.to_string());

		// FROM
			$sql_from = $this->build_sql_from();
				dump($sql_from, ' sql_from ++ '.to_string());

		// LEFT_JOIN
			$sql_left_join = $this->build_sql_left_join();
				dump($sql_left_join, ' sql_left_join ++ '.to_string());	

		// WHERE
			$sql_where = $this->build_sql_where();
				dump($sql_where, ' sql_where ++ '.to_string());


		$query = $sql_select .' '. $sql_from .' '. $sql_left_join .' '. $sql_where;
			dump($query, ' query ++ '.to_string());
			return ;			
	}//end get_records_2



	/**
	* GET_RECORDS_3
	* @return 
	*/
	public function get_records_3($request_options) {
		
		$options = new stdClass();
			$options->section_tipo 	 	 = null;
			$options->search_submit_data = null;
			$options->columns 		 	 = null;
			$options->main_matrix_table  = null;
			$options->lang 		 		 = 'all'; # Can be all for all langs
			$options->limit 			 = 10;

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// Fix as global
		$this->options = $options;

		// MAIN_MATRIX_TABLE
			if ($options->main_matrix_table===null) {
				$this->options->main_matrix_table = $this->get_matrix_table_from_section_tipo($options->section_tipo);
			}

		// LIMIT
			$sql_limit = $this->build_sql_limit();

		// ORDER
			$sql_order = $this->build_sql_order();

		// GROUP
			$sql_group = $this->build_sql_group();

		// WHERE (subquery)
			$sql_where_subquery = $this->build_sql_where();
				dump($sql_where_subquery, ' sql_where_subquery ++ '.to_string());

		// SELECT
			$sql_select_second = $this->build_sql_select();
				dump($sql_select_second, ' sql_select_second ++ '.to_string());
		/*
				// WHERE (default)
					$sql_where_default = $this->build_sql_where('default');
						dump($sql_where, ' sql_where ++ '.to_string());
		*/
		
		$query  = "\nSELECT id, section_id, section_tipo, ".implode(', ',$options->columns);
		$query .= "\n FROM ( $sql_select_second ) AS base ";
		$query .= " $sql_where_subquery ";
		$query .= " $sql_group $sql_order $sql_limit \n";
			dump($query, ' query ++ '.to_string());
	}//end get_records_3



	/**
	* BUILD_SQL_SELECT
	* @return 
	*/
	public function build_sql_select() {

		$options = $this->options;
		
		$ar_select = [];

		// Fixed columns
		$ar_select[] = ' '. 'a.id';
		$ar_select[] = ' '. 'a.section_id';	//$options->main_matrix_table 
		$ar_select[] = ' '. 'a.section_tipo';
		
		foreach ($options->columns as $key => $component_tipo) {
			
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

			$select_options = new stdClass();
				$select_options->json_field  = 'datos';
				$select_options->search_tipo = $component_tipo;
				$select_options->lang 		 = $options->lang;
				#$select_options->subquery 	 = $options->subquery;

			foreach ($options->search_submit_data as $ckey => $value) {
				# code...
			}

			$ar_select[] = $modelo_name::get_select_query($select_options);
		}

		$sql_select  = "SELECT \n" . implode(", ",$ar_select);
		$sql_select .= "\n FROM \"".$this->options->main_matrix_table."\" a WHERE (a.section_tipo='".$this->options->section_tipo."') ";
		
		return $sql_select;
	}//end build_sql_select



	/**
	* BUILD_SQL_SELECT
	* @return string $sql_select
	*/
	public function build_sql_select_OLD() {

		$options = $this->options;
		
		$ar_select = [];

		// Fixed columns
		$ar_select[] = ' '.$options->main_matrix_table . '.section_id';
		$ar_select[] = ' '.$options->main_matrix_table . '.section_tipo';

		foreach ((array)$options->ar_search_components as $key => $value) {

			$section_tipo 		= $value->section_tipo;
			$component_tipo 	= $value->component_tipo;
			$matrix_table 		= $value->matrix_table;
			$matrix_table_alias	= $value->matrix_table_alias;
			
			$current_lang = $this->get_component_lang($component_tipo);

			$sql  = ' ';
			if ($section_tipo===$this->options->section_tipo) {
				$sql .= $matrix_table;
			}else{
				$sql .= $matrix_table_alias;
			}			
			$sql .= '.';
			$sql .= $options->json_field;
			$sql .= '#';
			$sql .= $options->select_format;
			$sql .= "'{components, ".$component_tipo.", ".$options->data_type.", $current_lang}'";
			$sql .= " AS $component_tipo";

			$ar_select[] = $sql;

			#$sql .= "\n $matrix_table.$options->json_field#$options->select_format'{components, $current_column_tipo, ".$sql_options->tipo_de_dato.", $current_lang}' AS $current_column_tipo,";
		}

		$sql_select = "SELECT \n" . implode(",\n",$ar_select);
		
		return $sql_select;
	}//end build_sql_select



	/**
	* BUILD_SQL_FROM
	* @return 
	*/
	public function build_sql_from() {
		
		$ar_matrix_tables_unique=array();
		foreach ($this->options->matrix_tables as $section_tipo => $matrix_table) {
			if (!in_array($matrix_table, $ar_matrix_tables_unique)) {
				$ar_matrix_tables_unique[] = $matrix_table;
			}
		}
		$sql_from = "\nFROM " .$this->options->main_matrix_table;	//implode(', ', $ar_matrix_tables_unique);

		return $sql_from;
	}//end build_sql_from



	/**
	* BUILD_SQL_WHERE
	* @return 
	*/
	public function build_sql_where() {

		$options = $this->options;

		$ar_sql = array();
		/*
		if ($mode==='subquery') {
			// FILTER BY SEARCH
				$ar_sql[] = $this->filter_by_search();
		}else{
			// FILTER_BY_SECTION_TIPO. Fixed filter
				$section_tipo = $this->options->section_tipo;
				$matrix_table = 'a';	//$this->options->matrix_tables[$section_tipo];
				$ar_sql[] = "($matrix_table.section_tipo = '$section_tipo')";
		}
		*/
		$ar_sql[] = $this->filter_by_search();

		$sql_where = "\nWHERE \n". implode(" AND \n",$ar_sql);
			#dump($sql_where, ' sql_where ++ '.to_string($mode));

		return $sql_where;
	}//end build_sql_where



	/**
	* FILTER_BY_SEARCH
	* @return 
	*/
	public function filter_by_search() {
		$options = $this->options;

		$ar_subquery = array();
		foreach ($options->search_submit_data as $keyd => $dimension) {			
			foreach ($dimension as $ar_blocks) {
				if (!is_array($ar_blocks)) continue; # case last link_logical_operator is nor an array. Is object
					#dump($ar_blocks, ' ar_blocks ++ '.to_string()); continue;
				foreach ($ar_blocks as $search_element) {
					#dump($search_element, ' search_element ++ '.to_string());
					
					if ($search_element->type==='component_search') {

						if (isset($search_element->search)) {
							# subquery_type = 'with_reference';
							#$search_element->search->dato = $search_element->dato;
							$ar_search 		= (array)$search_element->search;
							foreach ($ar_search as $c_search) $c_search->dato = $search_element->dato;							
							$search_in 		= "{$search_element->component_tipo}_array_elements->>'section_id'";
						}else{
							# subquery_type = 'default';
							$ar_search 		= array($search_element);
							$search_in 		= 'section_id::text';
						}
						
						foreach ($ar_search as $search_field) {
						
							# Select elements
							$current_section_tipo   = $search_field->section_tipo;
							$current_component_tipo = $search_field->component_tipo;
							$string_to_search 		= $search_field->dato;

							#$RecordObj_dd = new RecordObj_dd($current_component_tipo);
							#$current_lang = $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
							$search_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);		
							$search_query 		= $search_modelo_name::get_search_query('datos', $current_component_tipo, 'dato', 'all', $string_to_search.'*', 'ILIKE');
							
							#$bracket 	  = ($search_modelo_name==='component_input_text') ? '[' : '';
							#$search_query = "f_unaccent(a.datos#>>'{components, $current_component_tipo, dato}') ILIKE f_unaccent('%{$bracket}\"{$string_to_search}%')"; # Force custom search instead standar ?
							#error_log($search_query); continue;

							$options = new stdClass();
								$options->search_in 	 		= $search_in;
								$options->search_tipo 	 		= $current_component_tipo;
								$options->search_section_tipo 	= $current_section_tipo;
								$options->matrix_table 	 		= common::get_matrix_table_from_tipo( $current_section_tipo );
								$options->search_query 	 		= $search_query;
								$options->subquery_type 		= '';
							$subquery = search::get_subquery($options);
							$ar_subquery[] = $subquery;
						}

					}else if ($search_element->type==='link_logical_operator'){
						# link_logical_operator

					}

				}#end foreach ($ar_blocks as $search_element)
			}#end foreach ($dimension as $ar_blocks)
		}#end foreach ($options->search_submit_data as $keyd => $dimension)

		$filter_by_search = "-- filter_by_search --\n(".implode(" OR ", $ar_subquery)." )";
			#dump($filter_by_search, ' filter_by_search ++ '.to_string());

		return $filter_by_search;
	}//end filter_by_search



	/**
	* FILTER_BY_SEARCH
	* @return 
	*/
	public function filter_by_search__OLD() {

		if (empty($this->options->filter_by_search)) return null;

			dump($this->options, ' this->options ++ '.to_string());

		# Clean empty values of array
		#$this->options->filter_by_search = self::clean_filter_by_search($this->options->filter_by_search);
		
		$last_key = key( array_slice( (array)$this->options->filter_by_search, -1, 1, TRUE ) );	
		
		foreach ($this->options->filter_by_search as $search_combi => $search_value) {
			if (empty($search_value)) continue; // Skip empty values

			$search_parts 				= explode('_', $search_combi);
			$component_section_tipo 	= $search_parts[0];
			$search_tipo 				= $search_parts[1];
			$search_tipo_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($search_tipo, true);
			$current_lang 				= $this->get_component_lang($search_tipo);
			$sql_filter_by_search 		= '';
				
			# SEARCH OPERATORS RESOLVE
			$comparison_operator = "ILIKE"; // Default
			if(isset($this->options->operators->comparison_operator)){
				foreach ($this->options->operators->comparison_operator as $key_tipo => $operator) {
					if($key_tipo === $search_tipo){												
						$comparison_operator = $operator;
						break;
					}
				}
			}							
			$logical_operator = "AND"; // Default
			if(isset($this->options->operators->logical_operator)){
				foreach ($this->options->operators->logical_operator as $key_tipo => $operator) {
					if($key_tipo === $search_tipo){
						$logical_operator = $operator;
						break;
					}
				}
			}			

			#
			# Normal case. Direct search (component belong current section)
			$sql_filter_by_search .= "\n".$search_tipo_modelo_name::get_search_query($this->options->json_field,
																					 $search_tipo,
																				 	 $this->options->data_type,
																					 $current_lang,
																					 $search_value,
																					 $comparison_operator);

			$table = common::get_matrix_table_from_tipo($component_section_tipo);
			$sql_filter_by_search = str_replace('a.datos', $table.'.datos', $sql_filter_by_search);
			
			# Add logical_operator each iteration
			if($search_combi !== $last_key) {
				$sql_filter_by_search .= $logical_operator . ' ';
			}

			$ar_filter[] = $sql_filter_by_search;			
		}//end foreach ($this->options->filter_by_search as $search_tipo => $search_value) {
		

		$filter_by_search = "-- filter_by_search --\n(".implode("\n", $ar_filter)."\n)";


		return $filter_by_search;
	}//end filter_by_search



	/**
	* BUILD_SQL_LEFT_JOIN
	* @return 
	*/
	public function build_sql_left_join() {

		$main_matrix_table = $this->options->main_matrix_table;

		$ar_sql = array();
		foreach ($this->options->ar_search_components as $key => $value_ob) {
			
			$section_tipo 	= $value_ob->section_tipo;
			$matrix_table 	= $value_ob->matrix_table;
			$component_tipo = $value_ob->component_tipo;

			if ($section_tipo!==$this->options->section_tipo) {

				$table_alias = $matrix_table.'_'.$component_tipo;
				
				$sql  = '';
				$sql .= 'LEFT JOIN '.$matrix_table.' AS '.$table_alias.' ON ';
				$sql .= "\n ";
				$sql .= $table_alias;
				$sql .= '.section_id::text = ';
				$sql .= $main_matrix_table;
				$sql .= ".datos#>'{components, $component_tipo, dato, lg-nolan}'->0->>'section_id' AND ";
				$sql .= "\n ";
				$sql .= $table_alias;
				$sql .= '.section_tipo = ';
				$sql .= $main_matrix_table;
				$sql .= ".datos#>'{components, $component_tipo, dato, lg-nolan}'->0->>'section_tipo' ";

				$ar_sql[] = $sql;
			}
		}
	
		$sql_left_join = "\n".implode("\n", $ar_sql);


		return $sql_left_join;
	}//end build_sql_left_join


	/**
	* BUILD_SQL_GROUP
	* @return string $sql_group
	*/
	public function build_sql_group() {
		
		$sql_group = '';

		$ar_group=array();		
		foreach ($this->options->columns as $component_key) {
			$ar_group[] = $component_key;
		}		
		
		# Fixed elements at end 
		$ar_group[] = 'id';
		$ar_group[] = 'section_tipo';
		$ar_group[] = 'section_id';

		$sql_group = "\n GROUP BY ". implode(', ', $ar_group);

		
		return $sql_group;
	}//end build_sql_order



	/**
	* BUILD_SQL_ORDER
	* @return string $sql_order
	*/
	public function build_sql_order() {
		
		$sql_order = '';
		
		if (isset($this->options->order)) {
			$sql_order = "\n ORDER BY $this->options->order";
		}
		
		return $sql_order;
	}//end build_sql_order



	/**
	* BUILD_SQL_LIMIT
	* @return string $sql_limit
	*/
	public function build_sql_limit() {

		$sql_limit = '';
	
		if (isset($this->options->limit)) {
			$sql_limit = "\n LIMIT ".$this->options->limit;
		}
		
		return $sql_limit;
	}//end build_sql_limit



	/**
	* BUILD_SQL_OFFSET
	* @return 
	*/
	public function build_sql_offset() {
		
	}//end build_sql_offset



	/**
	* get_matrix_table_from_section_tipo
	* @return array $matrix_tables_map
	*/
	public function get_matrix_table_from_section_tipo( $section_tipo ) {

		if(isset($this->options->matrix_tables[$section_tipo])){
			return $this->options->matrix_tables[$section_tipo];
		}

		$matrix_table = common::get_matrix_table_from_tipo($section_tipo);

		$this->options->matrix_tables[$section_tipo] = $matrix_table;
		
		return $matrix_table;
	}//end get_matrix_table_from_section_tipo




	/**
	* BUILD_SEARCH_COMPONENTS
	* @return array $matrix_tables_map
	*/
	public function build_search_components( $components ) {

		$matrix_tables_map = array();
		
		foreach ($components as $key => $obj_value) {

			$section_tipo 	= $obj_value->section_tipo;
			$component_tipo = $obj_value->component_tipo;

			$element_map = new stdClass();
				$element_map->component_tipo 	= $component_tipo;
				$element_map->section_tipo 	 	= $section_tipo;
				$element_map->matrix_table 		= $this->get_matrix_table_from_section_tipo($section_tipo);
				$element_map->matrix_table_alias= $element_map->matrix_table.'_'.$component_tipo;

			$matrix_tables_map[] = $element_map;
		}

		return $matrix_tables_map;
	}//end build_search_components



	/**
	* GET_COMPONENT_LANG
	* @return string $lang
	*/
	public function get_component_lang($component_tipo) {

		$RecordObj_dd = new RecordObj_dd($component_tipo);
		if ($RecordObj_dd->get_traducible()==='si') {
			$component_lang = DEDALO_DATA_LANG;
		}else{
			$component_lang = DEDALO_DATA_NOLAN;
		}

		return $component_lang;
	}//end get_component_lang







	################################################# 

	static $main_section_tipo_alias	= null;
	static $ar_section_tipo_alias	= [];
	# select
	static $sql_select 		= null; # DISTINCT ON (oh1.section_id) oh1.section_id
	# from
	static $main_from 		= null;
	static $ar_sql_joins 	= [];
	# where
	static $ar_sql_where 	= [];


	/**
	* PARSER_QUERY_OBJECT
	* @return 
	*/
	public static function parser_query_object( $query_json_object ) {
		#dump($query_json_object->filter, ' query_json_object ++ '.to_string());

		# filter
		foreach ($query_json_object->filter as $key => $ar_value) {
			foreach ($ar_value as $op => $value) {				
				#dump($value, ' value ++ '.to_string($op));
				if(strpos($op, '$')===false) continue;

				$string_query = self::filter_parser($op, $value);
					dump($string_query, ' string_query ++ '.to_string());
			}
		}

		#dump(self::$main_from, ' main_from ++ '.to_string());
		#dump(self::$ar_sql_joins, ' ar_sql_joins ++ '.to_string());
		#dump(self::$ar_sql_where, ' ar_sql_where ++ '.to_string());

		$sql_query  = '';
		# SELECT
		$sql_query .= "SELECT ".self::build_sql_query_select($query_json_object);
		# FROM
		$sql_query .= "\nFROM ".self::$main_from;
		$sql_query .= implode(" ", self::$ar_sql_joins);
		# WHERE
		$sql_query .= "\nWHERE ".implode(' AND ', self::$ar_sql_where);
		# LIMIT
		$sql_query .= "\nLIMIT ";
		$sql_query .= isset($query_json_object->limit) ? $query_json_object->limit : 10;

			dump($sql_query, ' sql_query ++ '.to_string());

		#return $sql_query;
	}//end parser_query_object



	/**
	* BUILD_SQL_QUERY_SELECT
	* @return 
	*/
	public static function build_sql_query_select($query_json_object) {
		
		$ar_sql_select = [];
		$ar_key_path   = [];

		$ar_sql_select[] = 'DISTINCT ON ('.self::$main_section_tipo_alias.'.section_id) '.self::$main_section_tipo_alias.'.section_id';
		/*
		foreach ($query_json_object->select as $key => $value_obj) {
			#dump($value_obj, ' value_obj ++ '.to_string($key));
			# oh1_oh24_rsc197_rsc86.datos#>'{relations, section_id}' as x
			foreach ($value_obj->path as $pkey => $step_object) {
				$ar_key_path[] 	= $step_object->section_tipo .'_'. $step_object->component_tipo;
			}
			$key_path = implode('_', $ar_key_path);
			#dump($key_path, ' key_path ++ '.to_string());
			#$select = $key_path.'.datos';
		}
		*/

		$sql_query_select = implode(', ', $ar_sql_select);

		return $sql_query_select;
	}//end build_sql_query_select



	/**
	* FILTER_PARSER
	* @return 
	*/
	public static function filter_parser($op, $ar_value) {

		$string_query  = "";
		$string_query .= " (";

		$last = end($ar_value);

		foreach ($ar_value as $search_object) {
			if (self::is_search_operator($search_object)===true) {

				$op = key($search_object);
				$ar_value = $search_object->$op;
				$string_query .= self::filter_parser($op, $ar_value);

			}else{

				$string_query .= self::component_object_parse($search_object);
				
				if ($search_object !== $last){
					$operator = strtoupper( substr($op, 1) );
					$string_query .= ") ".$operator." (";
				}
			}			
		}
		$string_query .= " )";

		return $string_query;		
	}//end filter_parser

	/*
		SELECT a.id, a.section_id, a.section_tipo
		FROM "matrix" AS a
		LEFT JOIN "relations" AS r_rsc_197 ON (a.section_id = r_rsc_197.section_id AND a.section_tipo = r_rsc_197.section_tipo )
		LEFT JOIN "matrix" AS rsc_197 ON (r_rsc_197.target_section_id = rsc_197.section_id AND r_rsc_197.target_section_tipo = rsc_197.section_tipo )
		WHERE (a.section_tipo = 'oh1')
		 AND (rsc_197.datos#>'{relations}' @> '[{"section_id":"2","section_tipo":"dd861","from_component_tipo":"rsc93"}]'::jsonb )

		LIMIT 10;
	*/

	/**
	* COMPONENT_OBJECT_PARSE
	* @return 
	*//*
	public static function component_object_parse($search_object) {

		static $join_group  = [];

		$path				= $search_object->path;
		$search_component 	= end($path);
		$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($search_component->component_tipo,true);
		$ar_query_object 	= $modelo_name::get_search_query2($search_object);
	
		$sql_where 	= "";

		if(!isset(self::$main_from)) {
			self::$main_section_tipo_alias 	= reset($path)->section_tipo;
			self::$main_from    			= self::get_sql_from($path);
			self::$ar_sql_where[] 			= self::get_sql_main_where($path);
		}


		$n_levels = count($path);
		if ($n_levels>1) {
			$join_group[] = self::build_sql_join($path);
		}

		self::build_ar_sql_where($search_object);

		#$where = implode(' AND ', self::$ar_sql_where);
		#return $where;
	}//end component_object_parse
	*/


	/**
	* GET_SQL_FROM
	* @return 
	*/
	public static function get_sql_from($path) {

		$main_path		= reset($path);
		$matrix_table 	= common::get_matrix_table_from_tipo($main_path->section_tipo);
		$sql_from		= $matrix_table .' AS '. $main_path->section_tipo;

		return $sql_from;
	}//end get_sql_from



	/**
	* GET_SQL_MAIN_WHERE
	* @return 
	*/
	public static function get_sql_main_where($path) {

		$main_path		= reset($path);
		$sql_where		= '('.self::$main_section_tipo_alias.'.section_tipo = \''. $main_path->section_tipo.'\') ';

		return $sql_where;		
	}//end get_sql_main_where



	/**
	* BUILD_SQL_JOIN
	* @return bool true
	*/
	public static function build_sql_join($path) {

		$rel_table   		= self::$MATRIX_RELATIONS_TABLE;
		$ar_key_join 		= [];
		$base_key 			= '';

		foreach ($path as $key => $step_object) {
			
			if ($key===0) {
				$base_key 		= $step_object->section_tipo;
				$ar_key_join[] 	= $step_object->section_tipo .'_'. $step_object->component_tipo;
				continue;
			}

			if ($key===1) {
				$current_key = $base_key;
			}else{
				$current_key = $ar_key_join[$key-1];
			}

			$ar_key_join[]	= $step_object->section_tipo .'_'. $step_object->component_tipo;
			$matrix_table	= common::get_matrix_table_from_tipo($step_object->section_tipo);
			$t_name 		= implode('_', $ar_key_join);
			$t_relation		= 'r_'.$t_name ;

			if (!isset(self::$ar_sql_joins[$t_name])) {			

				$sql_join  = "\n";
				$sql_join .= 'LEFT JOIN '.$rel_table.' AS '.$t_relation.' ON ('. $current_key.'.section_id = ' . $t_relation.'.section_id AND '. $current_key. '.section_tipo = '. $t_relation.'.section_tipo) '."\n";
				$sql_join .= 'LEFT JOIN '.$matrix_table.' AS '.$t_name.' ON ('. $t_relation.'.target_section_id = '.$t_name.'.section_id AND '.$t_relation.'.target_section_tipo = '.$t_name.'.section_tipo)';

				# LEFT JOIN "relations" AS r_rsc_197 ON (a.section_id = r_rsc_197.section_id AND a.section_tipo = r_rsc_197.section_tipo )
				# LEFT JOIN "matrix" AS rsc_197 ON (r_rsc_197.target_section_id = rsc_197.section_id AND r_rsc_197.target_section_tipo = rsc_197.section_tipo )
				
				self::$ar_sql_joins[$t_name] = $sql_join;
			}
		}
		#$key_group = implode('_', $ar_key_join);
		
		return true;
	}//end build_sql_join


	/**
	* BUILD_AR_SQL_WHERE
	* @return 
	*/
	public static function build_ar_sql_where($search_object) {
		
		//oh1_oh24_rsc197_rsc86.datos#>'{relations}' @> '[{"section_id":"2","section_tipo":"dd861","from_component_tipo":"rsc93"}]'::jsonb
		//unaccent(oh1_oh24_rsc197_rsc86.datos#>>'{components, rsc85, dato}') ~* unaccent('.*\[".*ana.*') 


		/* 
			{
			  "q": "<=56383947",
			  "lang": "lg-nolan",
			  "path": [
			    {
			      "section_tipo": "oh1",
			      "component_tipo": "oh24"
			    },
			    {
			      "section_tipo": "rsc197",
			      "component_tipo": "rsc453"
			    }
			  ],
			  "type": "array",
			  "component_path": [
			    "dato",
			    "end",
			    "time"
			  ]
			}
          */
		
		$path 			 = $search_object->path;
		$component_path  = $search_object->component_path;
		$total 			 = count($path);
		
		$ar_key =[];
		foreach ($path as $step_object) {

			if ($total===1) {
				$ar_key[] = $step_object->section_tipo;
			}else{
				$ar_key[] = $step_object->section_tipo .'_'. $step_object->component_tipo;
			}			

		}//foreach ($path as  $step_object)
		
		$table_alias 			= implode('_', $ar_key);
		$current_component_path = implode(',', $component_path);
		

		#$sql_where = $current_key . component_path

		self::$ar_sql_where[] ='';

	}//end build_ar_sql_where



	/**
	* GET_SQL_SELECT
	* @return 
	*/
	public static function get_sql_select() {
		
	}//end get_sql_select



	/**
	* IS_SEARCH_OPERATOR
	* @return bool
	*/
	public static function is_search_operator($search_object) {
		
		foreach ($search_object as $key => $value) {
			if (strpos($key, '$')!==false) {
				return true;
			}
		}

		return false;
	}//end is_search_operator


	/**
	* GET_OPERATOR_FROM_SEARCH_VALUE
	* @return 
	*/
	public function get_operator_from_search_value($search_value, $default) {
		
		$comparation_operators =[];

		$comparation_operators = '=';

		switch (true) {
			case ($search_value === '='):
				 $operator = 'IS NULL';
				break;

			case ($search_value === '*'):
				 $operator = 'IS NOT NULL';
				break;

			case (strpos($search_value, '...') !== false):
				$ar_values = explode('...', $search_value);
				$operator = $ar_values[0].' BETWEEN '.$ar_values[1];
				break;

			case (strpos($search_value, ',') !== false):
				$ar_values = explode(',', $search_value);
				foreach ($ar_values as  $current_value) {
					$operator .= $current_value.' OR ';
				}

				
				break;
			
			default:
				# code...
				break;
		}


	}//end get_operator_from_search_value



}
?>