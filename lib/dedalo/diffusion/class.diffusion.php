<?php
require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_mysql.php');

/*
* CLASS DIFUSSION
*/


abstract class diffusion  {

	protected $domain;
	public $ar_diffusion_map;
		
	public static $ar_database;
	public static $ar_table;
	public static $ar_table_data;


	/**
	* CONSTRUCT
	* @param object $options . Default null
	*/
	function __construct($options=null) {
		#$this->ar_diffusion_map 	= $this->get_ar_diffusion_map();
		#self::$ar_database 		= $this->get_ar_database();
		#self::$ar_table_data = array();
	}
	
	
	/**
	* GET HTML CODE . RETURN INCLUDE FILE __CLASS__.PHP
	* @return string $html
	*	Get standar path file "DEDALO_LIB_BASE_PATH .'/'. $class_name .'/'. $class_name .'.php'" (ob_start)
	*	and return rendered html code
	*/
	public function get_html() {
		
		if(SHOW_DEBUG) $start_time = start_time();
		
		# Class name is called class (ex. component_input_text), not this class (common)
		$class_name	= get_called_class();	#dump($class_name,'$class_name');

		$file = DEDALO_LIB_BASE_PATH .'/diffusion/'. $class_name .'/'. $class_name .'.php' ; 	#dump("$class_name");		
	
		ob_start();
		include ( $file );
		$html =  ob_get_clean();

		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [element '.$class_name.']', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.microtime(1)]=microtime(1);
		}
		
		return $html;
	}

	
	/**
	* GET_AR_DATABASE
	* @return array $ar_dabatase_name
	*/
	public function get_ar_database() {

		$ar_dabatase_name = array();
		foreach ($this->ar_diffusion_map as $value) {
			$ar_dabatase_name[$value] = RecordObj_dd::get_termino_by_tipo($value);
		}
		# Fix value
		# self::$ar_database = $ar_dabatase_name;
			#dump(self::$ar_database);
		return (array)$ar_dabatase_name;
	}


	/**
	* GET_DB_SCHEMA
	* Simply Exec self::build_table_recursive for every table in structure
	* @param string $database_tipo like 'dd521'
	*/
	public function get_db_schema($database_tipo) {	
		if(SHOW_DEBUG) {
			#dump($database_tipo," database_tipo");
		}

		# Tablas en el primer nivel
		$ar_diffusion_table = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table', $relation_type='children');
			#dump($ar_diffusion_table,'$ar_diffusion_table');die();

		# Recorremos hijos de la primera/as tabla/s
		foreach ($ar_diffusion_table as $key => $current_table_tipo) {
			
			$ar_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, $modelo_name='section', $relation_type='termino_relacionado');
				#dump($ar_section,'ar_section : '.$database_tipo);

			if(empty($ar_section)) continue;

			self::build_table_recursive($current_table_tipo, $database_tipo);			
		}

	}#end get_db_schema
	


	/**
	* CREATE_FIELD
	* Build field array data from request parameters
	* @param string $tipo
	* @param bool $is_section_id default false
	* @param bool $is_relation default false
	* @return array $ar_field_data
	* Array field format:
	* 	$ar_data['field_name'];
	* 	$ar_data['field_type'];
	* 	$ar_data['field_coment'];
	* 	$ar_data['field_options'];
	*/
	public static function create_field($tipo, $is_section_id=false, $is_relation=false) {

		$ar_field_data=array();

		switch (true) {

			case ($is_section_id===true):
				$ar_field_data['field_name'] 	= 'section_id';
				$ar_field_data['field_type'] 	= 'field_int';
				$ar_field_data['field_coment'] 	= 'Campo creado automáticamente para guardar section_id (sin correspondencia en estructura)';
				$ar_field_data['field_options']	= 12;				
				break;

			case ($tipo==='lang'):
				$ar_field_data['field_name'] 	= 'lang';
				$ar_field_data['field_type'] 	= 'field_varchar';
				$ar_field_data['field_coment'] 	= "Campo creado automáticamente para guardar el idioma (sin correspondencia en estructura)";
				$ar_field_data['field_options'] = 8;
				break;

			case ($is_relation===true):
				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($tipo);
				$ar_field_data['field_type'] 	= 'field_text';
				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true)[0];
				$ar_field_data['field_coment'] 	= RecordObj_dd::get_termino_by_tipo($termino_relacionado)." - $termino_relacionado";
				$ar_field_data['field_options'] = null;
				break;

			default:
				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($tipo); 	
				$ar_field_data['field_type'] 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);				

				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true)[0];
				$ar_field_data['field_coment'] 	= RecordObj_dd::get_termino_by_tipo($termino_relacionado)." - $termino_relacionado";
				
				$RecordObj_dd 		 			= new RecordObj_dd($tipo);
				$propiedades 				 	= $RecordObj_dd->get_propiedades(true);

				$diffusion_modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				switch ($diffusion_modelo_name) {
					case 'field_enum':
						if(SHOW_DEBUG) {
							if (!isset($propiedades->enum)) {
								throw new Exception("Error Processing Request. Field enum $tipo is misconfigurated. Please, set property 'enum' to current field", 1);									
							}
						}
						$ar_enum_options=array();
						foreach ($propiedades->enum as $current_enum_key => $current_enum_value) {
							$ar_enum_options[] = (string)'"'.$current_enum_value.'"';
						}
						$ar_field_data['field_options'] = (string)implode(',', $ar_enum_options);		# Format: "enum":{"1":"si", "2":"no"}							
						break;
					case 'field_int':
						$ar_field_data['field_options']	= 8;
						break;
					default:
						$ar_field_data['field_options'] = (string)'';						
				}			
				break;
		}

		if (empty($ar_field_data['field_type'])) {
			dump(RecordObj_dd::get_modelo_name_by_tipo($tipo,true), 'RecordObj_dd::get_modelo_name_by_tipo($tipo,true)');
			dump($ar_field_data['field_type'], 'WARNING: EMPTY ar_field_data: $ar_field_data[field_type] '.$tipo);
		}

		return $ar_field_data;

	}#end create_field


	/**
	* GET_DB_DATA
	* Exec self::build_table_data_recursive for every table in structure
	* @param string $database_tipo Like 'dd1260'
	*/
	public function get_db_data($database_tipo) {
		if(SHOW_DEBUG) {
			#dump($database_tipo," database_tipo");
		}	

		# Tablas en el primer nivel
		$ar_diffusion_table = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table', $relation_type='children');
			#dump($ar_diffusion_table,'$ar_diffusion_table');#die();

		# Recorremos hijos de la primera/as tabla/s
		foreach ($ar_diffusion_table as $current_table_tipo) {

			if ($current_table_tipo=='mupreva865') {
				continue;
			}
			
			$ar_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, $modelo_name='section', $relation_type='termino_relacionado');
				#dump($ar_section,'ar_section : '.$database_tipo);

			if( empty($ar_section) ) {
				if(SHOW_DEBUG) {
					throw new Exception("Error Processing Request. empty ar_section of current_table_tipo:$current_table_tipo", 1);
				}
				continue;
			}

			$ar_data = self::build_table_data_recursive($current_table_tipo, null, $database_tipo);
				#dump($ar_data, ' ar_data for '.$current_table_tipo);
				#dump($current_table_tipo, ' current_table_tipo');
				#dump(self::$ar_table_data, ' ar_table_data');
			#break; //ONLY ONE NOW FOR TEST
		}#end foreach

	}#end get_db_data


	/**
	* BUILD_TABLE_RECURSIVE
	* Construye los campos para introducir en la tabla a generar
	* Asigna el resultado recursivamente a la variable estática self::$ar_table
	* @param string $table_tipo 
	* @param string $database_tipo
	*/
	public static function build_table_recursive($table_tipo, $database_tipo) {
		if(SHOW_DEBUG) {
			#dump($table_tipo,"build_table_recursive table_tipo");
			#dump($database_tipo,"build_table_recursive database_tipo");
			#die();
		}
		$ar_table_data=array();

		$ar_table_data['database_name']	= reset(self::$ar_database);
		$ar_table_data['table_name']	= RecordObj_dd::get_termino_by_tipo($table_tipo);

		# El término relacionado es la sección  de destino
		$ar_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, $modelo_name='section', $relation_type='termino_relacionado');
			#dump($ar_section,'$ar_section');die();
			
		if(empty($ar_section)) {

			#
			# ID PORTAL . Mandatory column
			$portal_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, $modelo_name='component_portal', $relation_type='termino_relacionado')[0];
				#dump($portal_tipo,'portal_tipo');
			$section_tipo = component_common::get_section_tipo_from_component_tipo($portal_tipo);
			#$component_portal = new component_portal($portal_tipo,NULL,'dummy');
			$component_portal = component_common::get_instance('component_portal',$portal_tipo,null,'edit',DEDALO_DATA_NOLAN,$section_tipo);
				#dump($component_portal, ' component_portal');

			$target_section_tipo = $component_portal->get_target_section_tipo();
				#dump($target_section_tipo,'$target_section_tipo - '.$portal_tipo.' '.RecordObj_dd::get_termino_by_tipo($portal_tipo));
			$ar_table_data['ar_fields'][] = self::create_field($target_section_tipo, true);							
	
		}else{

			#
			# ID FIELD	. Mandatory column	
			$ar_table_data['ar_fields'][] = self::create_field($ar_section[0], true);
				#dump($ar_table_data, ' ar_table_data'); die();
		}

			#
			# LANG . Mandatory column
			$ar_table_data['ar_fields'][] = self::create_field('lang');
				#dump($ar_table_data, ' ar_table_data'); die();

			#
			# NORMAL TABLE FIELDS / COLUMNS
			$RecordObj_dd 	= new RecordObj_dd($table_tipo);
			$ar_children 	= $RecordObj_dd->get_ar_childrens_of_this();
			foreach ($ar_children as $curent_children_tipo) {

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($curent_children_tipo,true);

				switch ($modelo_name) {
					case 'table':
						#
						# TABLE
						$ar_table_data['ar_fields'][] = self::create_field($curent_children_tipo, false, true);

						# Recursion (portal)
						self::build_table_recursive($curent_children_tipo, $database_tipo);	
						break;
					
					default:
						#
						# FIELD
						$RecordObj_dd 	= new RecordObj_dd($curent_children_tipo);
						$propiedades 	= json_decode($RecordObj_dd->get_propiedades());
							#dump($propiedades, ' propiedades');
										
						# CASE TS_MAP IS DEFINED
						if ($propiedades && property_exists($propiedades, 'ts_map')) {

								$options = new stdClass();
									$options->ts_map 				= $propiedades->ts_map;
									$options->curent_children_tipo  = $curent_children_tipo;
									$options->request  				= 'columns';

								$ar_dedalo_countries = (array)diffusion::get_ar_dedalo_countries($options);
									#dump($ar_dedalo_countries, ' ar_dedalo_countries');
								
								foreach ($ar_dedalo_countries as $current_dedalo_country) {
									$ar_column_data=array();
									$ar_column_data['field_name']  		= (string)$current_dedalo_country;
									$ar_column_data['field_type']  		= (string)'field_text';
									$ar_column_data['field_coment'] 	= (string)'Autocreated column for country compatibility';
									$ar_column_data['field_options'] 	= (string)' ';
									$ar_table_data['ar_fields'][] = $ar_column_data;	# Add column
									#error_log("Add column field_name:$current_dedalo_country - field_type:field_text, - field_coment:Autocreated column for country compatibility - field_options:'' ");
								}
								
						}else{
						# DEFAULT CASE
							$ar_table_data['ar_fields'][] = self::create_field($curent_children_tipo, false);
						}
						break;
				}#end switch modelo_name
				
			}#end foreach ($ar_children as $curent_children_tipo)

			#dump($ar_table_data, ' ar_table_data'); die();

		self::$ar_table[$database_tipo][$table_tipo] = $ar_table_data;

	}#end build_table_recursive


	/** 
	* BUILD_TABLE_DATA_RECURSIVE
	* Construye los datos para introducir en los campos de la tabla generada y los fija en la variable estática self::$ar_table_data
	* @param string $table_tipo like 'oh1'
	* @param array $ar_section_id_portal Optional. Default empty array
	* @param string $database_tipo like 'oh256'
	* @see $his->get_db_data
	*/
	public static function build_table_data_recursive($table_tipo, $ar_section_id_portal=array(), $database_tipo, $ar_result=false) {
		#$table_data_recursive=array();

		if(SHOW_DEBUG) {
			#dump($ar_section_id_portal,"ar_section_id_portal - table_tipo: $table_tipo (".RecordObj_dd::get_termino_by_tipo($table_tipo).") - database_tipo: $database_tipo (".RecordObj_dd::get_termino_by_tipo($database_tipo).") ");die();
			#dump($ar_data,"$ar_data");die();
		}

		# SECTION try . Target section is a related term of current difusion pointer. Normally is section but can be a portal
		$pointer_type='section';
		$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, $modelo_name='section', $relation_type='termino_relacionado');
		if (empty($ar_section_tipo[0])) {
			# PORTAL try
			$pointer_type='portal';
			$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, $modelo_name='component_portal', $relation_type='termino_relacionado');
		}
		#dump($ar_section_tipo," ar_section_tipo");die();

		if(isset($ar_section_tipo[0])) {
			$section_tipo = $ar_section_tipo[0];
		}else{
			throw new Exception("Error Processing Request, section_tipo is empty. Please define valid related term (section or portal) for pointer table_tipo:$table_tipo", 1);			
		}		
		#dump($section_tipo,'$section_tipo');die();
			
			#
			# AR_RESULT . Get all matrix records in current table / portal. When portal is request, records of portal are in var '$ar_section_id_portal'
			if (!$ar_result) {
				if(!empty($ar_section_id_portal)) {
					# Los registros son los que alberga el portal
					$ar_result	= $ar_section_id_portal;
				}else{
					# Buscamos TODOS los registros de esta sección
					$ar_result  = section::get_ar_all_section_records_unfiltered($section_tipo); 		
				}
			}			
			#dump($ar_result," ar_result section_tipo:$section_tipo - table_tipo:$table_tipo - ar_data:".to_string($ar_data));
			
			
			#
			# LANGS
			switch ($pointer_type) {
				case 'portal':
					$portal 					= component_common::get_instance('component_portal',$section_tipo,null,'list',DEDALO_DATA_NOLAN,$section_tipo);
					$lang_target_section_tipo 	= $portal->get_target_section_tipo();
					break;				
				default:
					$lang_target_section_tipo 	= $section_tipo;
					break;
			}
			# Por rehacer. hacer un método estático en section que devuelva TODOS los idiomas de todos los proyectos de la sección (todos los registros)
			/*
			$section 				= section::get_instance(NULL,$lang_target_section_tipo,'list');
			$ar_all_project_langs 	= $section->get_ar_all_project_langs();	
			*/
			# Temporal, cogidos desde config :
			$ar_all_project_langs 	= unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
				#dump($ar_all_project_langs," ar_all_project_langs");die();			
			
			if(SHOW_DEBUG) {
				#$ar_all_project_langs = array('lg-spa'); # Test only
				#error_log("ar_all_project_langs en modo test (sólo uno se usa lg-spa)");
			}	


			$ar_field_data['database_name']	= (string)reset(self::$ar_database);
			$ar_field_data['table_name'] 	= (string)RecordObj_dd::get_termino_by_tipo($table_tipo);

			#
			# RECORDS
			$ar_data=array();
			$i=0;
			$ar_portal_records=array();
			foreach ($ar_result as $current_section_id) {	# iteramos por registros

				# test
				#$current_section_id=1;
				#$ar_all_project_langs = array('lg-lvca'); //ONLY ONE NOW FOR TEST
				
				foreach ($ar_all_project_langs as $current_lang) {	# iteramos por idioma						

						#
						# SECTION_ID . Mandatory column . Add field section_id to table data
						# COLUMN ADD ###################################################
						$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::create_data_field($section_tipo, $current_section_id, true);
							#dump($ar_data,'$ar_data');#die();					

						#
						# LANG . Mandatory column. Add field lang to table data
						# COLUMN ADD ###################################################
						$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::create_data_field('lang',$current_lang);
							#dump($ar_field_data, ' ar_field_data '." [$current_section_id][$current_lang] ");
							#dump($ar_data,'$ar_data');die();

						#
						# COLUMNS . Normal table columns / fields					
						$RecordObj_dd 	= new RecordObj_dd($table_tipo);
						$ar_children 	= (array)$RecordObj_dd->get_ar_childrens_of_this();
							#dump($ar_children, ' ar_children');
						foreach ($ar_children as $curent_children_tipo) {
							
							# Obtenemos el modelo de los hijos de la tabla para identificar los campos y las tablas relacionadas
							$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($curent_children_tipo,true);
								#dump($modelo_name, ' modelo_name');

							# Si el modelo es "field" es un campo directo
							# Si el modelo es "tabla" es un puntero a un portal, se convertirá este hijo en un campo que relacionará las dos tablas
							switch (true) {
								case ($modelo_name=='table') : # Pointer to portal case
									
									# PORTAL
									# Tabla = portal, obtenemos del elemento 'tabla', su portal (es el término relacionado)
									# El término 'tabla' se convierte en un campo que apunta a la tabla relacionada que se creará
									$portal_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($curent_children_tipo, $modelo_name='component_portal', $relation_type='termino_relacionado')[0];
									if (SHOW_DEBUG) {
										if (empty($portal_tipo)) {
											throw new Exception("Error Processing Request. 
												component_portal not found as 'termino_relacionado' by get_ar_terminoID_by_modelo_name_and_relation children_tipo:$curent_children_tipo ,component_portal, termino_relacionado
												Please verify structure for this element, is possible that related term is not portal (maybe section?)", 1);										
										}
									}
									
									# AR_PORTAL_DATA . CAMPO TABLA : Generamos el campo con los datos (registros) del portal que vienen de Matrix
									$ar_portal_data = self::create_data_field($curent_children_tipo, false, false, $current_section_id, $current_lang, true, $section_tipo); //$tipo, $value, $is_section_id=false, $parent=null, $lang=null, $is_portal=false, $section_tipo=null
										#dump($ar_portal_data,'$ar_portal_data - curent_children_tipo: '.$curent_children_tipo); die();

									# Añade el resultado de la generación del campo al array de campos generados (Vínculo con el portal)
									# COLUMN ADD ###################################################
									$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $ar_portal_data;
										#dump($ar_portal_data,'$ar_portal_data');
									
									# Obetenos el "locator" del portal para identificar los enlaces directos en la posición del "tipo ("0") y los enlaces a etiquetas ("dd341")
									$current_ar_portal_section_id=array();
									foreach ($ar_portal_data['field_value'] as $section_id) {										
										$current_ar_portal_section_id[] = $section_id; # Nota: 'current_locator' es section_id										
									}

									if (!isset($ar_portal_records[$curent_children_tipo])) {
										$ar_portal_records[$curent_children_tipo]=array();
									}
									$ar_portal_records[$curent_children_tipo] = array_merge($ar_portal_records[$curent_children_tipo], $current_ar_portal_section_id);	# Mix with general portal array	for this tipo			
									$ar_portal_records[$curent_children_tipo] = array_unique($ar_portal_records[$curent_children_tipo]); # Clean array removing duplicates									
									break;
								
								default: # Normal field case
									
									$RecordObj_dd 	= new RecordObj_dd($curent_children_tipo);
									$propiedades 	= json_decode($RecordObj_dd->get_propiedades());
										#dump($propiedades, ' propiedades '.$modelo_name );
									
									switch (true) { # DISCRIMINE BY PROPIEDADES
										case ($propiedades && property_exists($propiedades, 'ts_map') ):	
											#
											# TS MAP
											$options = new stdClass();
												$options->ts_map 				= $propiedades->ts_map;
												$options->curent_children_tipo  = $curent_children_tipo;
												$options->request  				= 'fields';
												$options->parent  				= $current_section_id;
												$options->lang  				= $current_lang;

											$ar_dedalo_countries = (array)diffusion::get_ar_dedalo_countries($options);
												#dump($ar_dedalo_countries, ' ar_dedalo_countries');
											
											foreach ($ar_dedalo_countries as $current_dedalo_country => $current_value) {
												$current_ts_map_ar_field_data=array();
												$current_ts_map_ar_field_data['field_name']  = (string)$current_dedalo_country;
												$current_ts_map_ar_field_data['field_value'] = (string)$current_value;

												# COLUMN ADD ###################################################
												$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $current_ts_map_ar_field_data;	# Add field
												#error_log("Added field field_name:$current_dedalo_country - field_value:$current_value");
											}
											break;
										
										case ($propiedades && property_exists($propiedades, 'table') ): # AUTOCOMPLETE COLUMN TABLE
											# TABLE NAME COLUMN
											# Usada para alojar el nombre de la tabla a que apunta el id del del dato del autocomplete actual (se guardan 3 columnas: name_id,name_table,name_label)
											$current_ar_field_data=array();
											$current_ar_field_data['field_name']  = RecordObj_dd::get_termino_by_tipo($curent_children_tipo, 'lg-spa', true, false);
											$current_ar_field_data['field_value'] = $propiedades->table;		#dump($current_ar_field_data, ' current_ar_field_data '.$curent_children_tipo);
											# COLUMN ADD ###################################################											
											$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $current_ar_field_data;

										case ($propiedades && property_exists($propiedades, 'data_to_be_used 999') ): # AUTOCOMPLETE COLUMN id

											break;
										default:
											# DEFAULT CASE . DIRECT FIELD
											# COLUMN ADD ###################################################
											$column = self::create_data_field($curent_children_tipo, false, false, $current_section_id, $current_lang, false, $section_tipo); //$tipo, $value, $is_section_id=false, $parent=null, $lang=null, $is_portal=false, $section_tipo=null
												#dump($column, ' column '.$curent_children_tipo);
											$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $column;
											break;
									}//end switch (true) { # DISCRIMINE BYH PROPIEDADES							
										
							}#end modelo_name switch							
							
						}#end foreach ($ar_children as $curent_children_tipo)
				#break; //ONLY ONE NOW FOR TEST

				$i++; # fin primera iteración registro/idioma
				
				if(SHOW_DEBUG) {
					#dump($ar_field_data, ' ar_field_data');
					#if ($i>10) break;//die();	
				}
				
				}#end foreach ($ar_all_project_langs as $current_lang)
				#dump($ar_data, ' ar_data '.$table_tipo);
				
				if (!empty($ar_field_data['ar_fields'])) {
				#self::$ar_table_data[$database_tipo][$table_tipo] = $ar_field_data;
				}
				#$table_name=$ar_field_data['table_name'];
				#self::$ar_table_data[$database_tipo][] = array_merge((array)self::$ar_table_data[$database_tipo], $ar_data);
			#break;
			}#end foreach ($ar_result as $current_section_id)
			#self::build_table_data_recursive($section_tipo, $ar_portal_section_id_unique, $database_tipo);
			#$ar_field_data['ar_fields'][] = self::create_data_field($ar_section[0], $matrix_id_section, 'true');

		
		# ASIGN VAR (If not empty ar_fields)
		# After iterate all records and create the current section array fields, set to static class var (self::$ar_table_data)
		if (!empty($ar_field_data['ar_fields']))
		self::$ar_table_data[$database_tipo][$table_tipo] = $ar_field_data;
		

		
		# PORTAL RECORDS TOTALS
		# After iterate all records, we have now the portal records totals (organized by portal_tipo )
		# Iterate all portals and build every table_data of this portals
		# dump($ar_portal_records, ' $ar_portal_records');
		foreach ((array)$ar_portal_records as $portal_tipo => $portal_records) {
			self::build_table_data_recursive($portal_tipo, array_unique($portal_records), $database_tipo);
		}
		

	}#end build_table_data_recursive



	/**
	* GET_AR_DEDALO_COUNTRIES
	* Return array of dedalo_countries for request tipo ts
	* In mode 'columns' ($options->request='columns') return a simple array of standar 'dedalo_countries' like (country,autonomous_community,province,..)
	* In mode 'fields' ($options->request='fields') return a asociative array resolved for request lang like ([country] => España, [autonomous_community] => País Vasco, ..)
	* Note: current source element column will be replaced by its correspondence in dedalo_countries
	* @param object $options
	* @return array $ar_dedalo_countries 
	*/
	protected static function get_ar_dedalo_countries($request_options) {

		$ar_dedalo_countries=array();

		$options = new stdClass();				
			$options->ts_map 				= false; # name of ts_map from propiedades
			$options->curent_children_tipo  = false; # tipo of diffusion element
			$options->request 				= false; # type of request (fields / columns)
			$options->parent 				= false; # parent id matrix
			$options->lang 					= false; # current iterate lang
			$options->section_tipo 			= null;

		# request_options overwrite options defaults
		foreach ((object)$request_options as $key => $value) {
			# Si la propiedad recibida en el objeto options existe en options, la sobreescribimos			
			if (property_exists($options, $key)) {
				$options->$key = $value;				
			}
		}
		#dump($options, ' options'); return;

		# TS_MAP . Calculate ts_map
		$ts_map = Tesauro::get_ar_ts_map( $options->ts_map );
			#dump($ts_map, ' ts_map');


		switch ($options->request) {
			case 'columns':
				# Add all elements of first ts_map element as columns like array('country','autonomous_community','province'..)
				foreach ((array)reset($ts_map) as $dedalo_country => $ar_value) {
					$ar_dedalo_countries[] = $dedalo_country;
				}
				break;
			
			case 'fields':		

				# POINTER TARGET COMPONENT (Normally component_autocomplete_ts)
				$target_component_tipo  = RecordObj_dd::get_ar_terminos_relacionados($options->curent_children_tipo, true, true)[0];
				$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo,true);
				$target_component 	 	= component_common::get_instance(
																$modelo_name, $target_component_tipo,
																$options->parent,
																'list',
																$options->lang,
																$options->section_tipo
																);
				$dato   				= (string)$target_component->get_dato(); # Dato is a ts term like 'es623'
				$prefix = RecordObj_dd::get_prefix_from_tipo($dato);
				if(empty($prefix) || !isset($ts_map[$prefix])) throw new Exception("Error Processing Request. Prefix $prefix is not defined in ts_map ($options->ts_map)", 1);

				$RecordObj_ts 			= new RecordObj_ts($dato);
				$ts_parents  			= (array)$RecordObj_ts->get_ar_parents_of_this();
				# Add self dato to ts parents
				$ts_parents[] = $dato;
					#dump($ts_parents, ' ts_parents');			

				foreach ((array)$ts_map[$prefix] as $dedalo_country => $ar_value) {

					$ar_dedalo_countries[$dedalo_country] = (string)''; # Defined and Empty default

					foreach ($ts_parents as $current_parent) {
						$RecordObj_ts 	= new RecordObj_ts($current_parent);
						$modelo 	  	= $RecordObj_ts->get_modelo();	# Model of parent like 'es8869'
						if (in_array($modelo, $ar_value)) {
							$ar_dedalo_countries[$dedalo_country] = strip_tags( RecordObj_ts::get_termino_by_tipo($current_parent,$options->lang) );
						}
					}

				}#end foreach
				#dump($ar_dedalo_countries, ' ar_dedalo_countries for parent:'.$options->parent);
				break;
		}#end switch $options->request
		#dump($ar_dedalo_countries, ' ar_dedalo_countries');		
		
		return (array)$ar_dedalo_countries;

	}#end get_ar_dedalo_countries


	public function build_data_field__NO_ACABADA( stdClass $request_options ) {

		$ar_field_data=array();
		$ar_field_data['field_name']  = '';
		$ar_field_data['field_value'] = '';

		$options = new stdClass();
			$options->typology;
			$options->tipo;
			$options->parent;			
			$options->value;

			foreach ($request_options as $key => $value) {
				if (property_exists($options, $key)) {
					$options->$key = $value;
				}
			}

		# FIXED FIELDS
		switch ($options->typology) {
			
			case 'section': # Fix column section_id
				$ar_field_data['field_name'] 	= 'section_id';
				$ar_field_data['field_value'] 	= $options->value;	
				break;

			case 'lang': # Especial case, constructs a column with current lang value
				$ar_field_data['field_name'] 	= 'lang';
				$ar_field_data['field_value'] 	= $options->value;	
				break;

			case 'autocomplete': # Especial case, constructs 3 columns with name_id, name_table, name_label
				$termino_relacionado = RecordObj_dd::get_ar_terminos_relacionados($options->tipo, $cache=true, $simple=true)[0];	#dump($termino_relacionado, ' termino_relacionado tipo:'.$tipo);					
				$tr_modelo_name		 = RecordObj_dd::get_modelo_name_by_tipo($termino_relacionado,true);
					#dump($modelo_name, ' modelo_name');
				if(SHOW_DEBUG) {
					if ($tr_modelo_name!='component_autocomplete') throw new Exception("Error Processing Request. Wrong modelo name. Expected component_autocomplete ($tr_modelo_name)", 1);					
				}
				$current_component	= component_common::get_instance($modelo_name, $termino_relacionado, $options->parent, 'edit', DEDALO_DATA_NOLAN, $options->section_tipo); #dump($current_component,'$current_component');				
				$valor				= (array)$current_component->get_dato();
				foreach ($valor as $current_locator) {
					if (property_exists($current_locator, 'section_tipo')) {
						# code...
					}
				}


				break;

			default:
				# code...
				break;
		}


	}


	/**
	* CREATE_DATA_FIELD
	* Build normalized data field (field_name,field_type,field_coment,field_options) in format:
	*
	* $ar_data['field_name'];
	* $ar_data['field_type'];
	* $ar_data['field_coment'];
	* $ar_data['field_options'];
	*
	* @param string $tipo like dd15
	* @param int $section_id Optional
	* @param int $parent Optional
	* @param string $lang Optional
	* @param bool $is_portal Optional Default false
	* @return array $ar_field_data	
	*/
	public static function create_data_field($tipo, $value, $is_section_id=false, $parent=null, $lang=null, $is_portal=false, $section_tipo=null) {

		#dump($tipo, "create_data_field tipo:$tipo, value:$value, is_section_id:$is_section_id, parent:$parent, lang:$lang, is_portal:$is_portal");
		# $tipo, $value, $is_section_id=false, $parent=null, $lang=null, $is_portal=false, $is_autocomplete=false;
		
		$ar_field_data=array();

		$ar_field_data['field_name']  = '';
		$ar_field_data['field_value'] = '';

		switch (true) {

			case ($is_section_id===true):
				$ar_field_data['field_name'] 	= 'section_id';
				$ar_field_data['field_value'] 	= $value;						
				break;

			case ($tipo==='lang'):
				$ar_field_data['field_name'] 	= 'lang';
				$ar_field_data['field_value'] 	= $value;
				break;

			case ($is_portal===true):
				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($tipo);
				$ar_field_data['field_value'] 	= array();

				
				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=true, $simple=true)[0];
					#dump($termino_relacionado, ' termino_relacionado tipo:'.$tipo);
				$modelo_name 					= RecordObj_dd::get_modelo_name_by_tipo($termino_relacionado,true);
					#dump($modelo_name, ' modelo_name');
				if(SHOW_DEBUG) {
					if ($modelo_name!='component_portal') {
						throw new Exception("Error Processing Request. Wrong modelo name. Expected portal ($modelo_name)", 1);						
					}
					$termino = RecordObj_dd::get_termino_by_tipo($termino_relacionado );
				}
				#dump($parent, ' parent de '.$termino_relacionado);

				#$current_component = component_common::get_instance($modelo_name, $termino_relacionado, $parent, 'dummy', $lang);
				$current_component 	= component_common::get_instance($modelo_name, $termino_relacionado, $parent, 'edit', DEDALO_DATA_NOLAN, $section_tipo);					#dump($current_component,'$current_component');				
				$dato 				= (array)$current_component->get_dato();
					#dump($dato,'portal dato PARA '.$termino_relacionado. " - parent:$parent - lang:$lang - termino:$termino");

				$ar_id =array();
				foreach ($dato as $current_locator) {
					$ar_id[] = $current_locator->section_id;
				}
				$dato = $ar_id;
				$ar_field_data['field_value'] = $dato;
				
				if (!is_array($ar_field_data['field_value'])) {
					dump($ar_field_data, ' ar_field_data');	#dump($is_portal, ' is_portal');
					throw new Exception("Error Processing Request. field_value is not array type! tipo:$tipo, value:$value, is_section_id:".to_string($is_section_id).", $parent, $lang, is_portal:".to_string($is_portal)."", 1);					
				}
				#dump($ar_field_data['field_value'],'$ar_field_data[field_value] '. print_r($valor,true)." - $tipo ");
				break;

			default:
				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($tipo);
				$ar_field_data['field_value'] 	= (string)'';			
					#dump($ar_field_data, ' $ar_field_data DEFAULT');
				#
				# Component target
				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($tipo, $cache=false, $simple=true)[0];
				$modelo_name 					= RecordObj_dd::get_modelo_name_by_tipo($termino_relacionado,true);

				$current_component 				= component_common::get_instance($modelo_name, $termino_relacionado, $parent, 'list', $lang, $section_tipo); //$component_name=null, $tipo, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_LANG
					#dump($current_component,'$current_component');
				$dato 							= $current_component->get_dato();

				$diffusion_modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

				#
				# Diffusion element
				$diffusion_element 				= new RecordObj_dd($tipo);				
				$propiedades 					= $diffusion_element->get_propiedades(true);	# Format: {"data_to_be_used": "dato"}				
				if (is_object($propiedades) && property_exists($propiedades, 'data_to_be_used') && $propiedades->data_to_be_used=='dato') {
					
					# VALOR (Unresolved data)					
					switch ($diffusion_modelo_name) {

						case 'field_enum':
							if (is_array($dato)) {
								foreach ($dato as $current_locator) {
									$dato = $current_locator->section_id;
								}
							}
							if (empty($dato) || ($dato!=='1' && $dato!=='2') ) {
								if(!empty($dato)) {

									trigger_error("WARNING: Set enum dato to default 'No' [2] for $modelo_name : $tipo !. Received dato:".to_string($dato) );
								} 
								$dato = 2;	# Value 'No' default
							}
							if(SHOW_DEBUG) {
								#dump($dato," dato"); #dump($propiedades->enum," dato");
								if (!property_exists($propiedades, 'enum')) {
									throw new Exception("Error Processing Request. Field enum $tipo is misconfigurated. Please, set property 'enum' to current field", 1);									
								}
							}
							$ar_field_data['field_value'] = (string)$propiedades->enum->$dato;		# Format: "enum":{"1":"si", "2":"no"}							
							break;						

						default:
							if (is_array($dato)) {
								$ar_id =array();
								foreach ($dato as $current_locator) {
									$ar_id[] = $current_locator->section_id;
								}
								$dato = $ar_id;
							}
							$ar_field_data['field_value'] = $dato; 	#dump($dato, " dato: $termino_relacionado - $modelo_name");
					}

				}else{
					
					switch ($diffusion_modelo_name) {
						case 'field_date':
							$ar_field_data['field_value'] = $current_component->get_dato();
								#dump($ar_field_data['field_value'], ' dato field_date ');
							break;
						
						default:
							switch ($modelo_name) {
								case 'component_text_area':
									# DATO
									$ar_field_data['field_value'] = $current_component->get_dato(); # Important: use raw text
									break;								
								case 'component_portal':
									$dato = $current_component->get_dato();
									if (is_array($dato)) {
										$ar_id =array();
										foreach ($dato as $current_locator) {
											$ar_id[] = $current_locator->section_id;
										}
										$dato = $ar_id;
									}
									$ar_field_data['field_value'] = $dato;
									break;
								case 'component_image':
									# DATO
									$ar_field_data['field_value'] = $current_component->get_image_url(DEDALO_IMAGE_QUALITY_DEFAULT); # Important: use raw text
									break;
								case 'component_av':
									# DATO
									$ar_field_data['field_value'] = $current_component->get_video_url(DEDALO_AV_QUALITY_DEFAULT); # Important: use raw text
									break;
								case 'component_pdf':
									# DATO
									$ar_field_data['field_value'] = $current_component->get_pdf_url(DEDALO_PDF_QUALITY_DEFAULT); # Important: use raw text
									break;
								case 'component_autocomplete':
									# DATO	-- POR RESOLVER (NO VA) --
									$valor = $current_component->get_valor( $lang );
									$component_autocomplete_dato = $current_component->get_dato();
										#dump($component_autocomplete_dato, ' component_autocomplete '.$lang);

									if (!empty($component_autocomplete_dato) && empty($valor)) {
										$valor = 'sorry resolve value in progress..';
									}				
									$ar_field_data['field_value'] = $valor;
										#$current_component->set_modo('edit');
										#dump($ar_field_data['field_value'], ' var autocomplete - lang:'.$lang);
										#dump($current_component, ' current_component - '.$lang);										
									break;
								default:
									# VALOR (Remember: Send lang a parameter)
									$ar_field_data['field_value'] = $current_component->get_valor( $lang ); # Importante!: Pasar lang como parámetro para indicar en la resolución del get_ar_list_of_values el lenguaje deseado		
									#dump($lang," lang for $modelo_name, $termino_relacionado - ".$current_component->get_dato() );									
									break;
							}							
							break;
					}
				}

				/*
				# 
				# Temporal fix
				# Soluciona el problema del si/no traducible ya que este campo es de tipo 'enum' y sólo acepta los valores 'si','no' (no acepta yes, oui, etc..)
				# dd62 es el tipo de la lista de valores privada de donde se extrae el dato de 'Publicable' en el radio button de las fichas de difusión
				$termino_relacionado2 			= RecordObj_dd::get_ar_terminos_relacionados($termino_relacionado, $cache=true, $simple=true);
				if(isset($termino_relacionado2[0]) && $termino_relacionado2[0]==DEDALO_CAMPO_SI_NO_TIPO) {
					$dato = $current_component->get_dato();
					switch ($dato) {
						case NUMERICAL_MATRIX_VALUE_YES:
							$valor = 'si'; # 1
							break;
						case NUMERICAL_MATRIX_VALUE_NO:
							$valor = 'no'; # 2
							break;
						default:
							$valor = 'no';
					}
					$ar_field_data['field_value'] = $valor;
					#error_log('->ar_field_data: '.$valor);
				}
				*/

				if (empty($ar_field_data['field_value'])) {
					$ar_field_data['field_value'] = (string)'';
				}
				break;

		}#end switch (true)

		

		if (!isset($ar_field_data['field_value'])) {
			dump($ar_field_data, ' ar_field_data');
			#dump($is_portal, ' is_portal');
			throw new Exception("Error Processing Request. field_value is not set! tipo:$tipo, value:$value, is_section_id:".to_string($is_section_id).", $parent, $lang, is_portal:".to_string($is_portal)."", 1);					
		}

		#dump($ar_field_data,'$ar_field_data');
		return $ar_field_data;
	}#end create_data_field














	# GET_DIFFUSION_DOMAINS : Get array of ALL diffusion domains in struture
	public static function get_diffusion_domains() {

		$diffusion_domains = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(DEDALO_DIFFUSION_TIPO, $modelo_name='diffusion_domain', $relation_type='children');
			#dump($tipo_filter_master,'$tipo_filter_master');

		return $diffusion_domains;
	}
	

	/**
	* GET_MY_DIFFUSION_DOMAIN
	* Get only one diffusion domain by tipo
	* Note: Define 'class_name' in propiedades of current desired diffusion element like {"class_name":"diffusion_index_ts"}
	* @param string $diffusion_domain_tipo like 'dedalo'
	* @param string $current_children like 'diffusion_index_ts'
	* @return string $current_children like 'dd15'
	*/
	public static function get_my_diffusion_domain($diffusion_domain_tipo, $caller_class_name) {
		#return (array)$caller_class_name;
	
		# Array of all diffusion domains
		$diffusion_domains = (array)diffusion::get_diffusion_domains();
			#dump($diffusion_domains,'$diffusion_domains');

		foreach ($diffusion_domains as $current_tipo) {
			
			$current_name = RecordObj_dd::get_termino_by_tipo($current_tipo,null,true);

			if($current_name==$diffusion_domain_tipo) {				

				/**/
				#
				# NUEVO MODO (más rápido) : Por propiedad 'class_name' . Evita la necesidad de utilizar el modelo cuando no es un modelo estándar de Dédalo
				$ar_childrens = RecordObj_dd::get_ar_childrens($current_tipo);
				foreach ($ar_childrens as $current_children) {
				 	
				 	$RecordObj_dd = new RecordObj_dd($current_children);
					$propiedades  = json_decode( $RecordObj_dd->get_propiedades() );
						#dump($propiedades, ' propiedades '.$current_children);

					if ($propiedades && property_exists($propiedades, 'class_name') && $propiedades->class_name==$caller_class_name) {
						return (string)$current_children;
					}
				}

				/* OLD WORLD
				$my_diffusion_domain = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, $modelo_name=$caller_class_name, $relation_type='children');
					dump($my_diffusion_domain, "current_name:$current_name - diffusion_domain_tipo:$diffusion_domain_tipo - caller_class_name:$caller_class_name");

				return (array)$my_diffusion_domain;
				*/
			}
		}
	}


	/**
	* GET_AR_DIFFUSION_MAP : 
	*/
	public function get_ar_diffusion_map( $ar_section_top_tipo=array() ) {
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');
		
		if (isset($this->ar_diffusion_map)) {
			return $this->ar_diffusion_map;
		}

		#if(SHOW_DEBUG) $start_time = start_time();

		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_index_ts
			$diffusion_domain = diffusion::get_my_diffusion_domain($this->domain, get_called_class());
				#dump($diffusion_domain,'$diffusion_domain');

			# DIFFUSION_SECTIONS : Get sections defined in structure to view
			$ar_diffusion_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, 'diffusion_section', 'children');
				#dump($ar_diffusion_section,'$ar_diffusion_section');

			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_section as $diffusion_section_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$ar_current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, 'section', 'termino_relacionado');
					#dump($ar_current_section_tipo,'$ar_current_section_tipo');
				
				# ar_current_section_tipo : Verify
				if ( empty($ar_current_section_tipo[0]) ) {
					if(SHOW_DEBUG) {
						$ar_related = (array)RecordObj_dd::get_ar_terminos_relacionados($diffusion_section_tipo);
						#dump($ar_related, 'ar_related termns');
						foreach ($ar_related as $key => $value)
						foreach ($value as $current_modelo => $terminoID) {
							#echo " $current_modelo - $terminoID ";
							$RecordObj_dd = new RecordObj_dd($terminoID);
							$modelo 	  = $RecordObj_dd->get_modelo();	
							if ($current_modelo!=$modelo) {
								throw new Exception("Error Processing Request. Inconsistency detected: relation model ($current_modelo) and target real model ($modelo) are differents!", 1);								
							}
						}						
					}
					$msg  = "Error Processing Request get_ar_diffusion_map: diffusion section related is empty. Please configure structure with one true diffusion section related ($diffusion_section_tipo) ";
					$msg .= "Please check the consistency and model of related term. diffusion_section_tipo:$diffusion_section_tipo must be a section (verify target element too) ";
					throw new Exception($msg, 1);
				}else{
					$current_section_tipo = $ar_current_section_tipo[0];
						#dump($current_section_tipo, ' current_section_tipo');
				}
				#dump($ar_section_top_tipo, '$ar_section_top_tipo');
				
				# IN ARRAY ?					
				if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) ) {
					
					# HEAD 
					$diffusion_head_tipo 		= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='diffusion_head', $relation_type='children')[0];
						#dump($diffusion_section_tipo,'$diffusion_section_tipo');
					#$ar_diffusion_head_related 	= RecordObj_dd::get_ar_terminos_relacionados($diffusion_head_tipo, $cache=false, $simple=true);
					$ar_diffusion_head_childrens 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_head_tipo, $modelo_name='diffusion_component', $relation_type='children');
						#dump($ar_diffusion_head_childrens,'$ar_diffusion_head_childrens');

					$ar_diffusion_map['head'][$current_section_tipo] =  $ar_diffusion_head_childrens ;
						#dump($ar_diffusion_map,'$ar_diffusion_map');

					
					# ROW
					$ar_diffusion_row_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='diffusion_row', $relation_type='children');
					if (!empty($ar_diffusion_row_tipo[0])) {

						$diffusion_row_tipo = $ar_diffusion_row_tipo[0];

						$ar_diffusion_row_related 	= RecordObj_dd::get_ar_terminos_relacionados($diffusion_row_tipo, $cache=false, $simple=true);
							#dump($ar_diffusion_row_related,'$ar_diffusion_row_related');

						$ar_diffusion_map['row'][$current_section_tipo] =  $ar_diffusion_row_related ;
							#dump($ar_diffusion_map,'$ar_diffusion_map');
					}					

				}#end if ( array_key_exists($current_section_tipo, $ar_section_top_tipo) )
				
			}#end foreach ($ar_diffusion_section as $diffusion_section_tipo

		if(SHOW_DEBUG) {
			#dump( $ar_diffusion_map, 'ar_diffusion_map' );
			#echo "<span style=\"position:absolute;right:30px\">".exec_time($start_time)."</span>";
		}

		# Fix
		$this->ar_diffusion_map = $ar_diffusion_map;
			#dump($this->ar_diffusion_map,"this->ar_diffusion_map ");#die();

		return $this->ar_diffusion_map;
	}





	/**
	* UPDATE_RECORD
	* Update one or any number of records ( array ) and references
	* @param object $options
	* @param bool $resolve_references
	* @param array $ar_resolved
	* @return bool true/false
	*/
	public function update_record( $request_options, $resolve_references=false, $ar_resolved=array() ) {

		$options = new stdClass();
			$options->section_tipo = null;
			$options->section_id   = null;
		foreach ($request_options as $key => $value) {
			if (property_exists($options, $key)) {
				$options->$key = $value;
			}
		}
		#dump($request_options, '$request_options');
		if(empty($options->section_tipo) || empty($options->section_id)) {
			return false;
		}

		#
		# DIRECT RECORD SAVE
		#	

			#
			# DIFFUSION_SECTION . Resolve diffusion section from section tipo
			$diffusion_section = $this->get_diffusion_section_by_section( $options->section_tipo );
				#dump($diffusion_section, " diffusion_section $options->section_tipo".to_string());
				if(!$diffusion_section) {
					if(SHOW_DEBUG) {
						$section_name = RecordObj_dd::get_termino_by_tipo($options->section_tipo);
						#throw new Exception("Error Processing Request. diffusion_section not found in correspondece with section_tipo: $options->section_tipo . Nothing is updated", 1);
						echo "<br>diffusion update_record: Omitted update section <b>'$section_name'</b>. Diffusion_section not found in correspondece with section_tipo: $options->section_tipo ";
					}
					#error_log(__METHOD__." WARNING: diffusion_section not found in correspondece with section_tipo: $options->section_tipo . Nothing is updated !!");
					return false;
				}
				
				#
				# DATABASE_TIPO . Resolve database_tipo in current diffusion map 
				$ar_diffusion_map = $this->get_ar_diffusion_map();
				$database_tipo    = reset($ar_diffusion_map);

				#
				# TABLE FIELDS reference only	(not needed because tables are already created)
				#self::build_table_recursive($diffusion_section, $database_tipo);
					#dump(self::$ar_table, " data ".to_string( $database_tipo));

				#
				# TABLE_DATA . Calculate table_data for current array of section_id (all langs)
				self::build_table_data_recursive($diffusion_section, $ar_section_id_portal=array(), $database_tipo, $ar_result=(array)$options->section_id); // Trigger resolve		
				$table_data = self::$ar_table_data[$database_tipo][$diffusion_section]; // Result is set and usable
					#dump($table_data, " data ".to_string()); die();
				
				#
				# SAVE RECORD . Insert MYSQL record (arrray) deleting before old data
				$save_options = new stdClass();
					$save_options->record_data = self::$ar_table_data[$database_tipo][$diffusion_section];
					$save = diffusion_mysql::save_record($save_options);
						#dump($save, ' save');					
			
				# AR_RESOLVED . update				
				if ( isset($ar_resolved[$options->section_tipo]) ) {
					array_merge($ar_resolved[$options->section_tipo],(array)$options->section_id);
				}else{
					$ar_resolved[$options->section_tipo] = $options->section_id; // Set ar resolved
				}				
				#dump($ar_resolved, ' ar_resolved');

		#
		# REFERENCES
		#
			if ($resolve_references===true) {
			
				#
				# AR_SECTION_COMPONENTS . Get section components and look for references
				$ar_section_components = section::get_ar_children_tipo_by_modelo_name_in_section($options->section_tipo, 'component_', $from_cache=true, $resolve_virtual=true);
					#dump($ar_section_components, " ar_section_components ");

				#$ar_diffusion_childrens = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section, $modelo_name='field_', $relation_type='children');
					#dump($ar_diffusion_childrens, " ar_diffusion_childrens ".to_string());die();

				#
				# GET REFERENCES FROM COMPONENTS DATO
				$group_by_section_tipo=array();
				$ar_components_with_references = array('component_portal','component_autocomplete'); #component_common::get_ar_components_with_references(); # Using modelo name
				foreach ($ar_section_components as $current_component_tipo) {
					$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);
					if (!in_array($modelo_name, $ar_components_with_references)) continue;	// Skip component
					
					$lang = RecordObj_dd::get_lang_by_tipo($current_component_tipo, true);
					
					foreach ((array)$options->section_id as $section_id) {
						$current_component  = component_common::get_instance($modelo_name, $current_component_tipo, $section_id, 'edit', $lang, $options->section_tipo);
						$dato 				= $current_component->get_dato();
							#dump($dato, " dato $current_component_tipo - $modelo_name".to_string(''));
						foreach ((array)$dato as $current_locator) {
							$current_section_tipo = $current_locator->section_tipo;
							$current_section_id   = $current_locator->section_id;
							if (!isset($group_by_section_tipo[$current_section_tipo]) || !in_array($current_locator->section_id, $group_by_section_tipo[$current_section_tipo])) {
								$group_by_section_tipo[$current_section_tipo][] = $current_section_id;
							}						
						}
					}					
					#$data_field = self::create_data_field($current_component_tipo, $dato, $is_section_id=false, $options->section_id, $lang, $is_portal=false);
					#dump($data_field, " data_field ".to_string());			
				}			
				#dump($group_by_section_tipo, ' group_by_section_tipo 1 '); #die();

				#
				# ALREADY RESOLVED REMOVE . Iterate items and unset resolved
				foreach ($group_by_section_tipo as $current_section_tipo => $ar_section_id) {
					if ( !isset($ar_resolved[$current_section_tipo]) ) {
						#die("stop on $current_section_tipo ".to_string($ar_section_id) );
						continue;
					}
					foreach ($ar_section_id as $current_section_id) {
						#dump(array_search($current_section_id, $ar_resolved[$current_section_tipo]), 'array_search('.$current_section_id.', '.$ar_resolved.'['.$current_section_tipo.'])');			
						if( ($key = array_search($current_section_id, $ar_resolved[$current_section_tipo])) !== false ) {
						    unset($group_by_section_tipo[$current_section_tipo][$key]);
						    #dump($current_section_id,"UNSET RESOLVED VAR $current_section_id - $current_section_tipo");
						}
					}
				}
				#dump($group_by_section_tipo, ' group_by_section_tipo 2');
				
				#
				# RESOLVE REFERENCES RECURSION
				foreach ($group_by_section_tipo as $current_section_tipo => $ar_section_id) {
					if (empty($ar_section_id)) {
						continue;
					}
					#dump($current_section_tipo, ' current_section_tipo '.to_string($ar_section_id));
					
					# Recursion with all references
					$new_options = new stdClass();
						$new_options->section_tipo = $current_section_tipo;
						$new_options->section_id   = (array)$ar_section_id;	

					$this->update_record( $new_options, $ar_resolved, false );
				}

			}//end if ($resolve_references===true) {


	}//end update_record





	/**
	* GET_DIFFUSION_SECTION_BY_SECTION
	* @param string $section_tipo
	* @return string $diffusion_section (tipo like dd1525) or bool false
	*/
	public function get_diffusion_section_by_section( $section_tipo ) {
		
		# AR_DIFFUSION_MAP
		$ar_diffusion_map = $this->get_ar_diffusion_map();
			#dump($ar_diffusion_map,'$ar_diffusion_map'); #die();		

		$database_tipo = reset($ar_diffusion_map);
			#dump($database_tipo, " database_tipo ".to_string());

		# Tablas en el primer nivel
		$ar_diffusion_table = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table', $relation_type='children');
			#dump($ar_diffusion_table, " ar_diffusion_table ".to_string());
		foreach ($ar_diffusion_table as $current_table_tipo) {
			$related_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
			if ($related_section==$section_tipo) {
				$diffusion_section = $current_table_tipo;
				return $diffusion_section;
			}
		}

		return false;

	}#end get_diffusion_section_by_section







	
}
?>