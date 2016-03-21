<?php
require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion_mysql.php');

/*
* CLASS DIFUSSION
*/

// abstract 
class diffusion  {

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
	* Simply Exec self::build_table_columns for every table in structure
	* @param string $database_tipo like 'dd521'
	*/
	public function get_db_schema($database_tipo) {
		
		#
		# DEFAULT CASE
		# table in first level
		$ar_diffusion_table = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table', $relation_type='children', $search_exact=true);		

			# Recorremos hijos de la primera/as tabla/s
			foreach ($ar_diffusion_table as $key => $current_table_tipo) {
				
				if(SHOW_DEBUG) {

					# Table verify
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_table_tipo,true);
					if ($modelo_name=='section') {				
					
						$ar_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, 'section', 'termino_relacionado', true);
						#dump($ar_section,'ar_section : '.$database_tipo);

						if(empty($ar_section)) {
							debug_log(__METHOD__." Current diffusion table ($current_table_tipo) is excluded from diffusion data because don't have related 'section'. Please fix this ASAP ".to_string(), logger::WARNING);
							continue;
						}
					}
				}			
				# Exec build_table_columns for each table
				self::build_table_columns($current_table_tipo, $database_tipo);		
			}
			
		#
		# THESAURUS CASE
		# table_thesaurus in first level
		$ar_diffusion_table_thesaurus = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table_thesaurus', $relation_type='children', true);

			# Recorremos hijos de la primera/as tabla/s
			foreach ($ar_diffusion_table_thesaurus as $current_table_tipo) {

				$RecordObj_dd = new RecordObj_dd($current_table_tipo);
				$propiedades  = json_decode( $RecordObj_dd->get_propiedades() );
					#dump($propiedades, ' propiedades ++ '.to_string());
				if (isset($propiedades->ar_tables)) {
					$options = new stdClass();
						$options->ar_tables  = $propiedades->ar_tables;
						$options->table_name = RecordObj_dd::get_termino_by_tipo($current_table_tipo);
					$thesaurus_columns  = self::build_thesaurus_columns( $options );
					self::$ar_table[$database_tipo][$current_table_tipo] = $thesaurus_columns;
				}
			}


		#dump(self::$ar_table, 'self::$ar_table ++ '.to_string()); die();

	}#end get_db_schema	


	/**
	* BUILD_TABLE_COLUMNS (RECURSIVE)
	* Construye los campos para introducir en la tabla a generar
	* Asigna el resultado recursivamente a la variable estática self::$ar_table
	* @param string $table_tipo 
	* @param string $database_tipo
	*/
	public static function build_table_columns($table_tipo, $database_tipo) {
		
		$ar_table_data=array();

		$ar_table_data['database_name']	= reset(self::$ar_database);
		$ar_table_data['table_name']	= RecordObj_dd::get_termino_by_tipo($table_tipo);
		$ar_table_data['ar_fields'] 	= array();


		/* DESACTIVO (NO USADO YA)
			# El término relacionado es la sección  de destino
			$ar_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, 'section', 'termino_relacionado');
				#dump($ar_section,'$ar_section termino_relacionado '.$table_tipo); #die();
				
			if(empty($ar_section)) {

				#
				# ID PORTAL . Mandatory column
				$portal_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, 'component_portal', 'termino_relacionado')[0];
					#dump($portal_tipo,'portal_tipo');
				#$section_tipo = component_common::get_section_tipo_from_component_tipo($portal_tipo);
				$section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($portal_tipo, 'section', 'parent')[0];
					#dump($section_tipo, ' section_tipo ++ '.to_string($portal_tipo));

				#$component_portal = new component_portal($portal_tipo,NULL,'dummy');
				$component_portal = component_common::get_instance('component_portal',
																	$portal_tipo,
																	null,
																	'edit',
																	DEDALO_DATA_NOLAN,
																	$section_tipo);
					#dump($component_portal, ' component_portal');

				$target_section_tipo = $component_portal->get_ar_target_section_tipo()[0];
					#dump($target_section_tipo,'$target_section_tipo - '.$portal_tipo.' '.RecordObj_dd::get_termino_by_tipo($portal_tipo));
				$options = new stdClass();
					$options->typology 	= 'section_id';
					$options->tipo 		= $target_section_tipo;
				$ar_table_data['ar_fields'][] = self::create_field( $options );							
		
			}else{

				#
				# ID FIELD	. Mandatory column
				$options = new stdClass();
					$options->typology 	= 'section_id';
					$options->tipo 		= $ar_section[0];
				$ar_table_data['ar_fields'][] = self::create_field( $options );
					#dump($ar_table_data, ' ar_table_data'); die();
			}
			*/

		#
		# ID FIELD	. Mandatory column
		$options = new stdClass();
			$options->typology 	= 'section_id';
			$options->tipo 		= null;
		$ar_table_data['ar_fields'][] = self::create_field( $options );


		#
		# LANG FIELD . Mandatory column
		$options = new stdClass();
			$options->typology 	= 'lang';
			$options->tipo 		= null;
		$ar_table_data['ar_fields'][] = self::create_field( $options );
			#dump($ar_table_data, ' ar_table_data'); die();
			

		#
		# OTHER FIELDS . Normal columns
		$RecordObj_dd 	= new RecordObj_dd($table_tipo);
		$ar_children 	= $RecordObj_dd->get_ar_childrens_of_this();
		foreach ($ar_children as $curent_children_tipo) {

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($curent_children_tipo,true);

			switch ($modelo_name) {
				case 'table':
					#
					# TABLE
					$options = new stdClass();
						$options->typology 	= 'relation';
						$options->tipo 		= $curent_children_tipo;
					$ar_table_data['ar_fields'][] = self::create_field( $options );

					# Recursion (portal)
					self::build_table_columns($curent_children_tipo, $database_tipo);	
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
								$ar_table_data['ar_fields'][] 		= $ar_column_data;	# Add column
								#error_log("Add column field_name:$current_dedalo_country - field_type:field_text, - field_coment:Autocreated column for country compatibility - field_options:'' ");
							}
							
					}else{
					# DEFAULT CASE
						$options = new stdClass();
							$options->typology 	= 'default';
							$options->tipo 		= $curent_children_tipo;
						$ar_table_data['ar_fields'][] = self::create_field( $options );
					}
					break;
			}#end switch modelo_name
			
		}#end foreach ($ar_children as $curent_children_tipo)
		#dump($ar_table_data, ' ar_table_data'); die();	

		return self::$ar_table[$database_tipo][$table_tipo] = $ar_table_data;

	}#end build_table_columns




	/**
	* GET_DB_DATA
	* Simply Exec self::build_table_columns_data for every table in structure
	* @param string $database_tipo Like 'dd1260'
	*/
	public function get_db_data($database_tipo) {
		
		#
		# DEFAULT CASE
		# Tablas en el primer nivel
		$ar_diffusion_table = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table', $relation_type='children', $search_exact=true);	

			# Recorremos hijos de la primera/as tabla/s
			foreach ($ar_diffusion_table as $current_table_tipo) {

				if(SHOW_DEBUG) {
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_table_tipo,true);
					if ($modelo_name=='section') {	
						# Table verify				
						$ar_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, 'section', 'termino_relacionado', true);				

						if(empty($ar_section)) {
							debug_log(__METHOD__." Current diffusion table ($current_table_tipo) is excluded from diffusion data because don't have related 'section'. Please fix this ASAP ".to_string(), logger::WARNING);
							continue;
						}
					}
				}			
				# Exec build_table_columns_data for each table
				self::build_table_columns_data($current_table_tipo, null, $database_tipo);
				
			}#end foreach
	

		#
		# THESAURUS CASE
		# table_thesaurus in first level
		$ar_diffusion_table_thesaurus = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table_thesaurus', $relation_type='children', true);

			# Recorremos hijos de la primera/as tabla/s
			foreach ($ar_diffusion_table_thesaurus as $current_table_tipo) {

				$RecordObj_dd = new RecordObj_dd($current_table_tipo);
				$propiedades  = json_decode( $RecordObj_dd->get_propiedades() );
					#dump($propiedades, ' propiedades ++ '.to_string());
				if (isset($propiedades->ar_tables)) {
					$options = new stdClass();
						$options->ar_tables  = $propiedades->ar_tables;
						$options->table_name = RecordObj_dd::get_termino_by_tipo($current_table_tipo);
					$thesaurus_columns_data  = self::build_thesaurus_columns_data( $options );
					self::$ar_table_data[$database_tipo][$current_table_tipo] = $thesaurus_columns_data;
				}
			}
	
	}#end get_db_data	


	/** 
	* BUILD_TABLE_COLUMNS_DATA (RECURSIVE)
	* Construye los datos para introducir en los campos de la tabla generada y los fija en la variable estática self::$ar_table_data
	* @param string $table_tipo like 'oh1'
	* @param array $ar_section_id_portal Optional. Default empty array
	* @param string $database_tipo like 'oh256'
	* @see $his->get_db_data
	*/
	public static function build_table_columns_data($table_tipo, $ar_section_id_portal=array(), $database_tipo, $ar_result=false) {
		#$table_data_recursive=array();

		if(SHOW_DEBUG) {
			#dump($ar_section_id_portal,"ar_section_id_portal - table_tipo: $table_tipo (".RecordObj_dd::get_termino_by_tipo($table_tipo).") - database_tipo: $database_tipo (".RecordObj_dd::get_termino_by_tipo($database_tipo).") "); #die();
			#dump($table_tipo,"table_tipo");#die();
			#dump($ar_section_id_portal, ' ar_section_id_portal ++ '.to_string());
		}

		# SECTION try . Target section is a related term of current difusion pointer. Normally is section but can be a portal
		$pointer_type='section';
		$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, 'section', 'termino_relacionado');
		if (empty($ar_section_tipo[0])) {
			# PORTAL try
			$pointer_type='portal';
			$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, 'component_portal', 'termino_relacionado');
		}
		#dump($ar_section_tipo," ar_section_tipo - table_tipo:$table_tipo");#die();

		if(!isset($ar_section_tipo[0])) throw new Exception("Error Processing Request, section_tipo is empty. Please define valid related term (section or portal) for pointer table_tipo:$table_tipo", 1);			
		
		# SECTION_TIPO . Set section tipo
		$section_tipo = $ar_section_tipo[0];
			
			#
			# AR_RESULT . Get all matrix records in current table / portal. When portal is request, records of portal are in var '$ar_section_id_portal'
			# NOTE : Because we need section_id and section_tipo of every item (multi-target portals), format $ar_result to contain this data always
			if (!$ar_result) {
				if(!empty($ar_section_id_portal)) {
					# Los registros son los que alberga el portal
					#$ar_result	= $ar_section_id_portal;
					foreach ($ar_section_id_portal as $key => $object) {
						// Override section_tipo for each element
						$ar_result[] = array($object->section_tipo => $object->section_id);
					}
				}else{
					# Buscamos TODOS los registros de esta sección
					$ar_result_id  = section::get_ar_all_section_records_unfiltered($section_tipo);
					foreach($ar_result_id as $current_id) {
						// Use general section_tipo for each element
						$ar_result[] = array($section_tipo => $current_id);
					}		
				}
			}
			#dump($ar_section_id_portal, ' ar_section_id_portal ++ '.to_string());			
			#dump($ar_result," ar_result section_tipo:$section_tipo - table_tipo:$table_tipo - ar_section_id_portal:".to_string($ar_section_id_portal)); #die();			
			
			#
			# LANGS
			/*
				switch ($pointer_type) {

					case 'portal':
						$portal_tipo 		 = $section_tipo;
						$portal_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($section_tipo, 'section', 'parent')[0];
						$component_portal	 = component_common::get_instance('component_portal',
																			  $portal_tipo,
																			  null,
																			  'list',
																			  DEDALO_DATA_NOLAN,
																			  $portal_section_tipo);
						$lang_target_section_tipo = $component_portal->get_ar_target_section_tipo()[0];	 // First of array of target secitions (multy target portal arrived)
							dump($lang_target_section_tipo, ' lang_target_section_tipo ++ '.to_string($portal_tipo));												
						break;

					default:					
						$lang_target_section_tipo = $section_tipo;				
						break;
				}
				# Verify lang_target_section_tipo
				if(empty($lang_target_section_tipo)) throw new Exception("Error Processing Request. lang_target_section_tipo is empty", 1);		
				*/

			# Por rehacer. hacer un método estático en section que devuelva TODOS los idiomas de todos los proyectos de la sección (todos los registros)
			/*
			$section 				= section::get_instance(NULL,$lang_target_section_tipo,'list');
			$ar_all_project_langs 	= $section->get_ar_all_project_langs();	
			*/
			# Temporal, cogidos desde config :
			$ar_all_project_langs 	= unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);			
			if(SHOW_DEBUG) {
				#dump($ar_all_project_langs," ar_all_project_langs");die();	
				#$ar_all_project_langs = array('lg-spa'); # Test only
			}

			$ar_field_data['database_name']	= (string)reset(self::$ar_database);
			$ar_field_data['table_name'] 	= (string)RecordObj_dd::get_termino_by_tipo($table_tipo);
	
				#
				# RECORDS
				$ar_data=array();
				$i=0;
				$ar_portal_records=array();
				if($ar_result) foreach ((array)$ar_result as $records) foreach ($records as $section_tipo => $current_section_id) {	# iteramos por registros
					#dump($current_section_id, ' current_section_id ++ '.to_string());

					# test
					#$current_section_id=1;
					#$ar_all_project_langs = array('lg-lvca'); //ONLY ONE NOW FOR TEST
					
					foreach ($ar_all_project_langs as $current_lang) {	# iteramos por idioma						

							#
							# SECTION_ID . Mandatory column . Add field section_id to table data
							# COLUMN ADD ###################################################
							$options = new stdClass();
								$options->typology 	= 'section';
								$options->value 	= $current_section_id;
							$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::build_data_field( $options );
							#$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::create_data_field($pointer_section_tipo, $current_section_id, true);											

							#
							# LANG . Mandatory column. Add field lang to table data
							# COLUMN ADD ###################################################
							$options = new stdClass();
								$options->typology 	= 'lang';
								$options->value 	= $current_lang;
							$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::build_data_field( $options );
							#$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::create_data_field('lang',$current_lang);						

							#
							# COLUMNS . Normal table columns / fields	
							# NORMAL COLUMNS ITERATE ###################################################				
							$RecordObj_dd 	= new RecordObj_dd($table_tipo);
							$ar_children 	= $RecordObj_dd->get_ar_childrens_of_this();
							foreach ((array)$ar_children as $curent_children_tipo) {								
								
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
										$portal_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($curent_children_tipo, 'component_portal', 'termino_relacionado')[0];
										if (SHOW_DEBUG) {
											if (empty($portal_tipo)) {
												throw new Exception("Error Processing Request. 
													component_portal not found as 'termino_relacionado' by get_ar_terminoID_by_modelo_name_and_relation children_tipo:$curent_children_tipo ,component_portal, termino_relacionado
													Please verify structure for this element, is possible that related term is not portal (maybe section?)", 1);										
											}
										}
										
										# AR_PORTAL_DATA . CAMPO TABLA : Generamos el campo con los datos (registros) del portal que vienen de Matrix
										$options = new stdClass();
											$options->typology 		= 'portal';
											$options->tipo 			= $curent_children_tipo;
											$options->parent 		= $current_section_id;
											#$options->section_tipo 	= ($pointer_type=='portal') ? $portal_section_tipo : $section_tipo; 
											$options->section_tipo 	= $section_tipo; // Verificar esto !!
											$options->caler_id 		= "2 - ".$section_tipo;	//$lang_target_section_tipo;									
										$ar_portal_data = self::build_data_field( $options );																
											#dump($ar_portal_data,"build_data_field: ar_portal_data - portal_tipo: $portal_tipo - section_tipo: $section_tipo - curent_children_tipo: ".$curent_children_tipo); //die();

										# Añade el resultado de la generación del campo al array de campos generados (Vínculo con el portal)
										# COLUMN ADD ###################################################
										$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $ar_portal_data;
											#dump($ar_portal_data,'$ar_portal_data');
										
										# Obetenos el "locator" del portal para identificar los enlaces directos en la posición del "tipo ("0") y los enlaces a etiquetas ("dd341")
										$current_ar_portal_section_id=array();
										#foreach ($ar_portal_data['field_value'] as $section_id) {
										#	$current_ar_portal_section_id[] = $section_id; # Nota: 'current_locator' es section_id
										#}
										foreach ($ar_portal_data['dato'] as $key => $current_locator) {
											$current_ar_portal_section_id[] = $current_locator;
										}

										# Create ar_portal_records if not exits. curent_children_tipo es el tipo de la tabla de difusión, como oh94 para informant
										if (!isset($ar_portal_records[$curent_children_tipo])) {
											$ar_portal_records[$curent_children_tipo]=array();
										}										
										#dump($current_ar_portal_section_id, ' curent_children_tipo: '.$curent_children_tipo.' ++ '.to_string($section_tipo));

										$ar_portal_records[$curent_children_tipo] = array_merge($ar_portal_records[$curent_children_tipo], (array)$current_ar_portal_section_id);	# Mix with general portal array	for this tipo
										$ar_portal_records[$curent_children_tipo] = self::clean_duplicates( $ar_portal_records[$curent_children_tipo] );	# Clean array removing duplicates
											#dump($ar_portal_records[$curent_children_tipo], '$ar_portal_records[$curent_children_tipo] ++ '.to_string());														
										break;
									
									default: # Normal field case
										
										$RecordObj_dd 	= new RecordObj_dd($curent_children_tipo);
										$propiedades 	= json_decode($RecordObj_dd->get_propiedades());
											#dump($propiedades, ' propiedades '.$modelo_name );
										
										switch (true) { # DISCRIMINE BY PROPIEDADES
											case ( $propiedades && property_exists($propiedades, 'ts_map') ):	
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
											
											case ( $propiedades && property_exists($propiedades, 'table') ): # AUTOCOMPLETE COLUMN TABLE
												# TABLE NAME COLUMN
												# Usada para alojar el nombre de la tabla a que apunta el id del del dato del autocomplete actual (se guardan 3 columnas: name_id,name_table,name_label)
												$current_ar_field_data=array();
												$current_ar_field_data['field_name']  = RecordObj_dd::get_termino_by_tipo($curent_children_tipo, 'lg-spa', true, false);
												$current_ar_field_data['field_value'] = $propiedades->table;		#dump($current_ar_field_data, ' current_ar_field_data '.$curent_children_tipo);
												# COLUMN ADD ###################################################											
												$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $current_ar_field_data;

											case ( $propiedades && property_exists($propiedades, 'data_to_be_used 999') ): # AUTOCOMPLETE COLUMN id

												break;
											default:
												# DEFAULT CASE . DIRECT FIELD
												# COLUMN ADD ###################################################
												$options = new stdClass();
													$options->tipo 			= $curent_children_tipo;
													$options->parent 		= $current_section_id;
													$options->lang 			= $current_lang;
													$options->section_tipo 	= $section_tipo;	//$lang_target_section_tipo;
													$options->caler_id 		= 3;
													$options->propiedades 	= $propiedades;												
												$column = self::build_data_field( $options );											
												#$column = self::create_data_field($curent_children_tipo, false, false, $current_section_id, $current_lang, false, $pointer_section_tipo); //$tipo, $value, $is_section_id=false, $parent=null, $lang=null, $is_portal=false, $section_tipo=null
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

					// let GC do the memory job
					time_nanosleep(0, 50000000); // 50 ms

				}#end foreach ($ar_result as $current_section_id)
				#self::build_table_columns_data($section_tipo, $ar_portal_section_id_unique, $database_tipo);
				#$ar_field_data['ar_fields'][] = self::create_data_field($ar_section[0], $matrix_id_section, 'true');

		

		# ASIGN VAR (If not empty ar_fields)
		# After iterate all records and create the current section array fields, set to static class var (self::$ar_table_data)
		if (!empty($ar_field_data['ar_fields'])) {
			self::$ar_table_data[$database_tipo][$table_tipo] = $ar_field_data;
		}		

		
		# PORTAL RECORDS TOTALS
		# After iterate all records, we have now the portal records totals (organized by portal_tipo )
		# Iterate all portals and build every table_data of this portals
		# dump($ar_portal_records, ' $ar_portal_records');
		foreach ((array)$ar_portal_records as $portal_tipo => $portal_records) {
			$portal_records = self::clean_duplicates( $portal_records );
			self::build_table_columns_data($portal_tipo, $portal_records, $database_tipo);
		}		

	}#end build_table_columns_data


	/**
	* CLEAN_DUPLICATES
	* @return array
	*/
	public static function clean_duplicates( $ar_locators ) {

		$ar_temp = array();
		foreach ($ar_locators as $key => $locator) {

			if (is_object($locator)) {				
			
				$section_tipo 	= $locator->section_tipo;
				$section_id 	= $locator->section_id;

				if(in_array($section_tipo.'_'.$section_id, $ar_temp)) {
					unset($ar_locators[$key]);
					#debug_log(__METHOD__." UNSETED locator: {$section_tipo}_{$section_id} - key:".to_string($key), logger::DEBUG);
				}
				$ar_temp[] = $section_tipo.'_'.$section_id;

			}else{

				if(in_array($locator, $ar_temp)) {
					unset($ar_locators[$key]);
					#debug_log(__METHOD__." UNSETED locator: {$locator} - key:".to_string($key), logger::DEBUG);
				}
			}
		}

		return array_values($ar_locators);

	}#end clean_duplicates

	/**
	* GET_AR_DEDALO_COUNTRIES
	* Return array of dedalo_countries for request tipo ts
	* In mode 'columns' ($options->request='columns') return a simple array of standar 'dedalo_countries' like (country,autonomous_community,province,..)
	* In mode 'fields' ($options->request='fields') return a asociative array resolved for request lang like ([country] => España, [autonomous_community] => País Vasco, ..)
	* Note: current source element column will be replaced by its correspondence in dedalo_countries
	* @param object $options
	* @return array $ar_dedalo_countries 
	*/
	protected static function get_ar_dedalo_countries( $request_options ) {

		$ar_dedalo_countries=array();

		$options = new stdClass();				
			$options->ts_map 				= false; # name of ts_map from propiedades
			$options->curent_children_tipo  = false; # tipo of diffusion element
			$options->request 				= false; # type of request (fields / columns)
			$options->parent 				= false; # parent id matrix
			$options->lang 					= false; # current iterate lang
			$options->section_tipo 			= null;
			
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
		
		# TS_MAP . Calculate ts_map
		$ts_map = Tesauro::get_ar_ts_map( $options->ts_map );
			#dump($ts_map, ' ts_map +');die();


		switch ($options->request) {

			case 'columns':
				# Add all elements of first ts_map element as columns like array('country','autonomous_community','province'..)
				foreach ((array)reset($ts_map) as $dedalo_country => $ar_value) {
					$ar_dedalo_countries[] = $dedalo_country;
				}
				#dump($ar_dedalo_countries, '$ar_dedalo_countries ++ '.to_string());die();
				break;
			
			case 'fields':

				# POINTER TARGET COMPONENT (Normally component_autocomplete_ts)
				$target_component_tipo  = RecordObj_dd::get_ar_terminos_relacionados($options->curent_children_tipo, true, true)[0];
				$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo,true); 
				$section_tipo 			= $options->section_tipo;
				if (empty($section_tipo)) {
					$section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($target_component_tipo, 'section', 'parent')[0];
						#dump($section_tipo, ' var ++ calculated from '.$modelo_name.' - '.to_string($target_component_tipo));
				}
				$target_component 	 	= component_common::get_instance($modelo_name,	// component_autocomplete_ts
																		 $target_component_tipo,
																		 $options->parent,
																		 'edit',
																		 $options->lang,
																		 $section_tipo );
				$dato   				= $target_component->get_dato(); # Dato is a ts term like 'es623'
				if (is_array($dato)) {

					# CASE VERSION >= 4.0.0	

					$dato_untouch = $dato;				
					$ar_locator   = $dato_untouch;
					#$dato 	 		= $locator->section_tipo; // New format of component_autocomplete_ts is a locator for compatibility with future thesaurus

					foreach ((array)$ar_locator as $key => $locator) {						
					
						if (!empty($locator) && !isset($locator->section_tipo)) debug_log(__METHOD__." section_tipo is not set ".to_string(), logger::WARNING);					
						if (!empty($locator) && !isset($locator->section_id))   debug_log(__METHOD__." section_id is not set ".to_string(), logger::WARNING);

						if (isset($locator->section_tipo) && isset($locator->section_id)) {
							$prefix 	= RecordObj_dd::get_prefix_from_tipo($locator->section_tipo);
							$terminoID 	= $prefix . $locator->section_id;
						}else{
							# Empty record case
							$prefix 	= null;
							$terminoID 	= null;
						}
						break; // Only one by now
					}					
					#debug_log(__METHOD__." Dato is not as expected type string (current: ". gettype($dato_untouch) ."). Changed to: $dato from: ".to_string($dato_untouch), logger::DEBUG);					
				
				}elseif (is_string($dato)) {

					# CASE VERSION < 4.0.0	

					$prefix = RecordObj_dd::get_prefix_from_tipo($dato);
					if(empty($prefix) || !isset($ts_map[$prefix])) throw new Exception("Error Processing Request. Prefix $prefix is not defined in ts_map ($options->ts_map)", 1);
					$terminoID = $dato ; // Pre 4.0 versions
				}
				#dump($dato, ' dato ++ '.to_string($dato_untouch));				

				
				if(empty($prefix)) {
					
					// Filled with empty values
					foreach ((array)reset($ts_map) as $dedalo_country => $ar_value) {
						$ar_dedalo_countries[$dedalo_country] = '';
					}

				}else if(!isset($ts_map[$prefix])) {

					// Filled with the same value
					$first_ts_map = reset($ts_map);					
					foreach ((array)$first_ts_map as $dedalo_country => $ar_value) {
						$ar_dedalo_countries[$dedalo_country] = strip_tags( RecordObj_ts::get_termino_by_tipo($terminoID,$options->lang) );												
					}					

				}else{

					$RecordObj_ts 	= new RecordObj_ts($terminoID);
					$ts_parents  	= (array)$RecordObj_ts->get_ar_parents_of_this();
					# Add self dato to ts parents
					$ts_parents[] 	= $terminoID;
						#dump($ts_parents, ' ts_parents');

					foreach ((array)$ts_map[$prefix] as $dedalo_country => $ar_value) {

						$ar_dedalo_countries[$dedalo_country] = (string)''; # Defined and Empty default

						foreach ($ts_parents as $current_parent) {
							$RecordObj_ts 	= new RecordObj_ts($current_parent);
							$modelo 	  	= $RecordObj_ts->get_modelo();	# Model of parent like 'es8869'
							if (in_array($modelo, $ar_value)) {
								$ar_dedalo_countries[$dedalo_country] = strip_tags( RecordObj_ts::get_termino_by_tipo($current_parent,$options->lang) );
							}else{
								#$ar_dedalo_countries[$dedalo_country] = '';
							}
						}

					}#end foreach
				}
				#dump($ar_dedalo_countries, ' ar_dedalo_countries for parent:'.$options->parent);
				break;
		}#end switch $options->request
		#dump($ar_dedalo_countries, ' ar_dedalo_countries ++ '.to_string($options));	
		
		return (array)$ar_dedalo_countries;

	}#end get_ar_dedalo_countries


	

	/**
	* CREATE_FIELD
	* Build field array data from request parameters
	* @param object stdClass $request_options	
	* @return array $ar_field_data
	* Array field format:
	* 	$ar_data['field_name'];
	* 	$ar_data['field_type'];
	* 	$ar_data['field_coment'];
	* 	$ar_data['field_options'];
	*/
	public static function create_field( stdClass $request_options ) {	// old: $tipo, $is_section_id=false, $is_relation=false

		$options = new stdClass();
			$options->typology 		= null;
			$options->tipo  		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$ar_field_data=array();

		switch ($options->typology) {

			case 'section_id':
				$ar_field_data['field_name'] 	= 'section_id';
				$ar_field_data['field_type'] 	= 'field_int';
				$ar_field_data['field_coment'] 	= 'Campo creado automáticamente para guardar section_id (sin correspondencia en estructura)';
				$ar_field_data['field_options']	= 12;				
				break;

			case 'lang':
				$ar_field_data['field_name'] 	= 'lang';
				$ar_field_data['field_type'] 	= 'field_varchar';
				$ar_field_data['field_coment'] 	= "Campo creado automáticamente para guardar el idioma (sin correspondencia en estructura)";
				$ar_field_data['field_options'] = 8;
				break;

			case 'relation':
				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo);
				$ar_field_data['field_type'] 	= 'field_text';
				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($options->tipo, $cache=true, $simple=true)[0];
				$ar_field_data['field_coment'] 	= RecordObj_dd::get_termino_by_tipo($termino_relacionado)." - $termino_relacionado";
				$ar_field_data['field_options'] = null;
				break;

			default:
				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo); 	
				$ar_field_data['field_type'] 	= RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true);				

				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($options->tipo, $cache=true, $simple=true)[0];
				$ar_field_data['field_coment'] 	= RecordObj_dd::get_termino_by_tipo($termino_relacionado)." - $termino_relacionado";
				
				$RecordObj_dd 		 			= new RecordObj_dd($options->tipo);
				$propiedades 				 	= $RecordObj_dd->get_propiedades(true);

				$diffusion_modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true);
				switch ($diffusion_modelo_name) {
					case 'field_enum':
						if(SHOW_DEBUG) {
							if (!isset($propiedades->enum)) {
								throw new Exception("Error Processing Request. Field enum $options->tipo is misconfigurated. Please, set property 'enum' to current field", 1);									
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
			dump(RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true), 'RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true)');
			dump($ar_field_data['field_type'], 'WARNING: EMPTY ar_field_data: $ar_field_data[field_type] '.$options->tipo);
		}

		return $ar_field_data;

	}#end create_field

	/**
	* BUILD_DATA_FIELD
	* Build normalized field data array with field_name and field_value. This is the table column data for this element
	* Portal elements are trated as special pseudo-sections with pointers to other tables
	* @param object stdClass $request_options
	* @return array $ar_field_data
	*/
	public static function build_data_field( stdClass $request_options ) {

		$ar_field_data=array();
		$ar_field_data['field_name']  = '';
		$ar_field_data['field_value'] = '';

		$options = new stdClass();
			$options->typology 		= null;
			$options->value 		= null;
			$options->tipo 			= null;
			$options->parent 		= null;
			$options->lang 			= null;
			$options->section_tipo 	= null;
			$options->caler_id 		= null;
			$options->propiedades 	= null;

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


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

			case 'portal':
				#dump($options, ' options ++ '.to_string());

				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo);
				$ar_field_data['field_value'] 	= array();
					
				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($options->tipo, true, true)[0];
					#dump($termino_relacionado, ' termino_relacionado tipo:'.$tipo);
				$modelo_name 					= RecordObj_dd::get_modelo_name_by_tipo($termino_relacionado,true);				
				if(SHOW_DEBUG) {
					if ($modelo_name!='component_portal') throw new Exception("Error Processing Request. Wrong modelo name. Expected portal ($modelo_name)", 1);
				}
				/*  PRE 12-01-2016			
				#$portal_section_tipo = $options->section_tipo;	//RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($termino_relacionado, 'section', 'parent')[0];
				$portal_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($termino_relacionado, 'section', 'parent')[0];
					dump($portal_section_tipo, ' portal_section_tipo ++ '.to_string());
				if(SHOW_DEBUG) {
					$real_section = section::get_section_real_tipo_static($options->section_tipo);
					if ($real_section!=$options->section_tipo) {
						# estamos en una virtual. el cálculo anterior de $portal_section_tipo puede ser erróneo !
						debug_log(__METHOD__." Current section is virtual. $portal_section_tipo is calculated to real. This can result to error/wrong section_tipo. real_section: ".to_string($real_section), logger::WARNING);
					}
				}
				*/
				/* FIX 12-01-2016 */
				if (isset($options->section_tipo)) {
					$portal_section_tipo = $options->section_tipo;
				}else{
					$portal_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($termino_relacionado, 'section', 'parent')[0];					
					if(SHOW_DEBUG) {
						$real_section = section::get_section_real_tipo_static($options->section_tipo);
						if ($real_section!=$options->section_tipo) {
							# estamos en una virtual. el cálculo anterior de $portal_section_tipo puede ser erróneo !
							debug_log(__METHOD__." Current section is virtual. $portal_section_tipo is calculated to real. This can result to error/wrong section_tipo. real_section: ".to_string($real_section), logger::WARNING);
						}
					}
				}
				#dump($portal_section_tipo, ' portal_section_tipo ++ '.to_string());
				$component_portal 	 = component_common::get_instance('component_portal',
																	  $termino_relacionado,
																	  $options->parent,
																	  'edit',
																	  DEDALO_DATA_NOLAN,
																	  $portal_section_tipo);

				$dato = $component_portal->get_dato();
					#dump($dato,'portal dato PARA '.$termino_relacionado. " - parent:$parent - lang:$lang - termino:$termino");

				$ar_id = array();				
				foreach ((array)$dato as $current_locator) {
					$ar_id[] = $current_locator->section_id;
				}
				if (empty($ar_id)) {
					#debug_log(__METHOD__." Empty ar_id data in portal $termino_relacionado ".to_string(), logger::DEBUG);
				}
				$ar_field_data['field_value'] = $ar_id;
				$ar_field_data['dato'] 		  = $dato;	// Información temporal necesaria para despejar section tipo en portales multi target
				break;		

			default:

				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo);
				$ar_field_data['field_value'] 	= (string)'';

				#
				# Component target
				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($options->tipo, false, true)[0];
				$modelo_name 					= RecordObj_dd::get_modelo_name_by_tipo($termino_relacionado,true);				
				$real_section_tipo 				= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($termino_relacionado, 'section', 'parent')[0];
				$current_component 				= component_common::get_instance($modelo_name,
																				 $termino_relacionado,
																				 $options->parent,
																				 'edit',
																				 $options->lang,
																				 $options->section_tipo);
																				 #dump($modelo_name, ' termino_relacionado:'.$termino_relacionado.' - section_tipo:'.to_string($options->section_tipo));			

				$dato 					= $current_component->get_dato();
				$diffusion_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true);

				#
				# Diffusion element
				$diffusion_element 		= new RecordObj_dd($options->tipo);				
				$propiedades 			= $diffusion_element->get_propiedades(true);	# Format: {"data_to_be_used": "dato"}				
				if (is_object($propiedades) && property_exists($propiedades, 'data_to_be_used') && $propiedades->data_to_be_used=='dato') {
					
					# VALOR (Unresolved data)					
					switch ($diffusion_modelo_name) {

						case 'field_enum':								
							foreach ((array)$dato as $current_locator) {
								$dato = $current_locator->section_id;
							}								
							if (empty($dato) || ($dato!=='1' && $dato!=='2') ) {
								if(!empty($dato)) {
									#dump($dato, ' dato ++ '.to_string());
									trigger_error("WARNING: Set enum dato to default 'No' [2] for $modelo_name : $options->tipo !. <br>Received dato:".to_string($dato) );
									debug_log(__METHOD__." WARNING: Set enum dato to default 'No' [2] for $modelo_name : $options->tipo !. <br>Received dato:".to_string($dato), logger::WARNING);
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
							break;

					}//end switch ($diffusion_modelo_name) {

				}else{ //if (is_object($propiedades) && property_exists($propiedades, 'data_to_be_used') && $propiedades->data_to_be_used=='dato') {
					
					switch ($diffusion_modelo_name) {
						case 'field_date':
							$ar_field_data['field_value'] = $current_component->get_valor();
							break;
						
						default:
							switch ($modelo_name) {
								case 'component_text_area':
									# DATO
									$ar_field_data['field_value'] = $current_component->get_dato(); # Important: use raw text
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
								case 'component_array':
									$ar_field_data['field_value'] = implode(',', $current_component->get_dato() );
									break;
								case 'component_select_lang':
									$valor = $current_component->get_valor( $options->lang ); # Importante!: Pasar lang como parámetro para indicar en la resolución del get_ar_list_of_values el lenguaje deseado
									$valor = preg_replace("/<\/?mark>/", "", $valor); # Remove untranslated string tags
									$ar_field_data['field_value'] = $valor; 
									break;
								case 'component_portal':
									# If not isset propiedades->data_to_be_used, we understand that is 'dato' for speed
									if (!isset($propiedades->data_to_be_used)) {
										$data_to_be_used = 'dato';
										$dato = $current_component->get_dato();
										if (is_array($dato)) {
											$ar_id =array();
											foreach ($dato as $current_locator) {
												$ar_id[] = $current_locator->section_id;
											}
											$dato = $ar_id;
										}
										$ar_field_data['field_value'] = $dato;
									}else{
										# 'Default' behaviour is now get_valor (...)
										$data_to_be_used = $propiedades->data_to_be_used;
										$ar_field_data['field_value'] = $current_component->get_valor( $options->lang );
									}									
									break;								
								case 'component_autocomplete':
									
									$component_autocomplete_dato = $current_component->get_dato();		
									$valor 						 = $current_component->get_valor( $options->lang );
										if(SHOW_DEBUG) {
											#dump($component_autocomplete_dato, ' component_autocomplete_dato ++ '.to_string($valor));
											#dump($options->tipo, ' options->tipo ++ '.to_string());
											#if ($options->tipo=='mupreva1998') {
											#	dump($component_autocomplete_dato, ' component_autocomplete_dato ++ '.to_string());
											#	dump($valor, ' component_autocomplete_dato mupreva1532 valor ++ '.to_string($options->lang));
											#}
										}																				

									if (empty($valor) && !empty($component_autocomplete_dato) ) {

										#debug_log(__METHOD__.' sorry resolve value diffusion component_autocomplete in progress.. ('.$current_component->get_tipo().', '.$current_component->get_parent().', '.$current_component->get_section_tipo().') '.to_string(), logger::WARNING);
										$valor = ""; // 'sorry resolve value in progress..';
									}				
									$ar_field_data['field_value'] = $valor;
										#$current_component->set_modo('edit');
										#dump($ar_field_data['field_value'], ' var autocomplete - lang:'.$options->lang);
										#dump($current_component, ' current_component - '.$options->lang);										
									break;
								default:
									# VALOR (Remember: Send lang a parameter)									
									$ar_field_data['field_value'] = $current_component->get_valor( $options->lang ); # Importante!: Pasar lang como parámetro para indicar en la resolución del get_ar_list_of_values el lenguaje deseado		
									#dump($options->lang," lang for $modelo_name, $termino_relacionado - ".$current_component->get_dato() );									
									break;
							}
							break;
					}//end switch ($diffusion_modelo_name) {
				}//end if (is_object($propiedades) && property_exists($propiedades, 'data_to_be_used') && $propiedades->data_to_be_used=='dato') {
				break;

		}//end switch ($options->typology) {

		return (array)$ar_field_data;

	}//end build_data_field__NO_ACABADA


	






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
	* GET_SINGLE_DIFFUSION_MAP
	* Get diffusion mapa of current only one section
	* @return 
	*//**/
	public function get_single_diffusion_map( $section_tipo ) {
		$diffusion_map = array();

		# DIFFUSION_DOMAIN : Get structure tipo of current ('dedalo') diffusion_index_ts
		$diffusion_domain = diffusion::get_my_diffusion_domain($this->domain, get_called_class());

		# DIFFUSION_SECTIONS : Get sections defined in structure to view
		$ar_diffusion_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, 'diffusion_section', 'children');	
			#dump($ar_diffusion_section, ' ar_diffusion_section ++ '.to_string());

		# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
		foreach ($ar_diffusion_section as $diffusion_section_tipo) {
							
			# diffusion_section_tipo ar_relateds_terms
			$ar_current_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, 'section', 'termino_relacionado');
			$current_section_tipo 	 = $ar_current_section_tipo[0];
			
			if ($current_section_tipo == $section_tipo) {

				# HEAD 
				$diffusion_head_tipo 		 = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section_tipo, $modelo_name='diffusion_head', $relation_type='children')[0];
					#dump($diffusion_section_tipo,'$diffusion_section_tipo');				
				$ar_diffusion_head_childrens = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_head_tipo, $modelo_name='diffusion_component', $relation_type='children');
					#dump($ar_diffusion_head_childrens,'$ar_diffusion_head_childrens');
				$diffusion_map['head'][$current_section_tipo] =  $ar_diffusion_head_childrens ;
					#dump($diffusion_map,'$diffusion_map');

				return $diffusion_map;
				break;
			}
		}

		return false;

	}#end get_single_diffusion_map
	


	/**
	* GET_AR_DIFFUSION_MAP : 
	*/
	public function get_ar_diffusion_map( $ar_section_top_tipo=array() ) {
				
		if (isset($this->ar_diffusion_map)) {
			return $this->ar_diffusion_map;
		}

		if(SHOW_DEBUG) $start_time = start_time();

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
			#echo "<span style=\"position:absolute;right:30px;margin-top:-25px\">".exec_time($start_time)."</span>";
		}

		return $this->ar_diffusion_map = $ar_diffusion_map;
	}





	/**
	* UPDATE_RECORD
	* Update one or any number of records ( array ) and references
	* @param object $options
	* @param bool $resolve_references
	* @param array $ar_resolved
	* @return bool true/false
	*/
	public function update_record( $request_options, $resolve_references=false ) {

		static $ar_resolved_static;
		static $ar_record_updated;
		static $ar_unconfigured_diffusion_section;
			#dump($ar_resolved_static, ' ar_resolved_static ++ '.to_string());

		if(SHOW_DEBUG) {
			static $ar_resolved_static_debug;
		}
		$start_time = start_time();


		$options = new stdClass();
			$options->section_tipo = null;
			$options->section_id   = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}			

		# Mandatory vars
		if(empty($options->section_tipo) || empty($options->section_id)) return false;
			# Old code heritage control
			if (is_array($options->section_id)) {
				if(SHOW_DEBUG) {
					dump($options->section_id, ' $options->section_id ++ '.to_string());
				}			
				throw new Exception("Error Processing Request. Sorry, array is not accepted to update_record anymore. Please use int as options->section_id ", 1);			
			}


		if ( isset($ar_resolved_static[$options->section_tipo]) &&  
			 in_array($options->section_id, $ar_resolved_static[$options->section_tipo]) ) {
				#dump($ar_record_updated, ' ar_record_updated ++ '.to_string());
			 	#dump($options->section_id, ' options->section_id already resolved. Return false ++ '.to_string($options->section_tipo));			
			return false;		# Record already resolved
		}

		
		#
		# DIRECT RECORD SAVE
		#	

			#
			# DIFFUSION_SECTION . Resolve diffusion section from section tipo
			if (in_array($options->section_tipo, (array)$ar_unconfigured_diffusion_section)) {
				return false;
			}
			$diffusion_section = $this->get_diffusion_section_by_section( $options->section_tipo );
				#dump($diffusion_section, " diffusion_section $options->section_tipo".to_string()); #die();
				if(!$diffusion_section) {
					if(SHOW_DEBUG) {
						$section_name = RecordObj_dd::get_termino_by_tipo($options->section_tipo);
						#throw new Exception("Error Processing Request. diffusion_section not found in correspondece with section_tipo: $options->section_tipo . Nothing is updated", 1);
						echo "<hr> DEBUG update_record: Omitted update section <b>'$section_name'</b>. Optional diffusion_section not found in correspondece with section_tipo: $options->section_tipo [$options->section_id]<br>";
					}
					#error_log(__METHOD__." WARNING: diffusion_section not found in correspondece with section_tipo: $options->section_tipo . Nothing is updated !!");
					$ar_unconfigured_diffusion_section[] = $options->section_tipo;
					return false;
				}
				
				#
				# DATABASE_TIPO . Resolve database_tipo in current diffusion map 
				if (defined('DEDALO_DIFFUSION_MAP')) {
					$ar_dedalo_diffusion_map = unserialize(DEDALO_DIFFUSION_MAP);
					if (isset($ar_dedalo_diffusion_map[$options->section_tipo]->database)) {
						$database_tipo = $ar_dedalo_diffusion_map[$options->section_tipo]->database;
						// Fix resolved database_tipo to class static var 'ar_database'
						self::$ar_database = array($database_tipo);					
					}
				}				
				# Get from structure custom diffusion
				if( empty($database_tipo) ) {
					$ar_diffusion_map = $this->get_ar_diffusion_map();
					$database_tipo    = reset($ar_diffusion_map);
				}
				#dump($database_tipo, ' database_tipo ++ '.to_string()); die();	
				#dump($ar_diffusion_map, ' ar_diffusion_map ++ '.to_string());		

				#
				# TABLE FIELDS reference only	(not needed because tables are already created)
				#self::build_table_columns($diffusion_section, $database_tipo);
					#dump(self::$ar_table, " data ".to_string( $database_tipo));

				#
				# TABLE_DATA . Calculate table_data for current array of section_id (all langs)
				$ar_result=array();
				foreach ((array)$options->section_id as $section_id) {
					$ar_result[] = array($options->section_tipo => $section_id);
				}				
				self::build_table_columns_data($diffusion_section, $ar_section_id_portal=array(), $database_tipo, $ar_result); // Trigger resolve		
				$table_data = self::$ar_table_data[$database_tipo][$diffusion_section]; // Result is set and usable
					#dump($table_data, ' table_data ++ '.to_string($diffusion_section));

				
				#
				# SAVE RECORD . Insert MYSQL record (arrray) deleting before old data
				$save_options = new stdClass();
					$save_options->record_data 					    = self::$ar_table_data[$database_tipo][$diffusion_section];		#dump($save_options, ' save_options ++ '.to_string());die();
					$save_options->record_data['diffusion_section'] = $diffusion_section;
					$save_options->record_data['database_tipo'] 	= $database_tipo;
						#dump($save_options, ' save_options ++ '.to_string()); die();

				$save = diffusion_mysql::save_record($save_options);
					$ar_record_updated[] = $options;
					#dump($options, ' options ++ SAVED !! '.to_string());				
			
				# AR_RESOLVED . update				
				$ar_resolved_static[$options->section_tipo][] = $options->section_id;
				if(SHOW_DEBUG) {
					$time_complete = round(microtime(1)-$start_time,3);
					$ar_resolved_static_debug[] = array($options->section_tipo, $options->section_id, $time_complete);
				}			
				#dump($ar_resolved_static, ' ar_resolved_static'); #die();

		#
		# REFERENCES
		#
			if ($resolve_references===true) {
			
				#
				# AR_SECTION_COMPONENTS . Get section components and look for references
				$ar_components_with_references = array( 'component_portal',
														'component_autocomplete'); #component_common::get_ar_components_with_references(); # Using modelo name
				$ar_section_components = section::get_ar_children_tipo_by_modelo_name_in_section($options->section_tipo, $ar_components_with_references, $from_cache=true, $resolve_virtual=true);
					#dump($ar_section_components, " ar_section_components ");

				#$ar_diffusion_childrens = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section, $modelo_name='field_', $relation_type='children');
					#dump($ar_diffusion_childrens, " ar_diffusion_childrens ".to_string());die();

				#
				# GET REFERENCES FROM COMPONENTS DATO
				$group_by_section_tipo=array();
				foreach ($ar_section_components as $current_component_tipo) {

					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);
					if (!in_array($modelo_name, $ar_components_with_references)) continue;	// Skip component IMPORTANT to skip component_autocomplete_ts
					
					$lang = RecordObj_dd::get_lang_by_tipo($current_component_tipo, true);				

					foreach ((array)$options->section_id as $section_id) {

						$current_component  = component_common::get_instance($modelo_name,
																			 $current_component_tipo,
																			 $section_id,
																			 'edit',
																			 $lang,
																			 $options->section_tipo);
						$dato = $current_component->get_dato();
							#dump($dato, " dato $current_component_tipo - $modelo_name".to_string(''));
						foreach ((array)$dato as $current_locator) {
							$current_section_tipo = $current_locator->section_tipo;
							$current_section_id   = $current_locator->section_id;
							if ( !isset($group_by_section_tipo[$current_section_tipo]) || 
								 !in_array($current_locator->section_id, $group_by_section_tipo[$current_section_tipo]) ) { // If not exists in group_by_section_tipo, add

								if( !isset($ar_resolved_static[$current_section_tipo]) ||
									!in_array($current_section_id, $ar_resolved_static[$current_section_tipo]) ) { // If not exists in ar_resolved_static, add
									
										$group_by_section_tipo[$current_section_tipo][] = $current_section_id; 
								}
							}
						}
					}//end foreach ((array)$options->section_id as $section_id) {

					#$data_field = self::create_data_field($current_component_tipo, $dato, $is_section_id=false, $options->section_id, $lang, $is_portal=false);
					#dump($data_field, " data_field ".to_string());			
				}			
				#dump($group_by_section_tipo, ' group_by_section_tipo 1 '); #die();				
				

				#
				# RESOLVE REFERENCES RECURSION
				# Look inside portals of portals, etc..					
					foreach ($group_by_section_tipo as $current_section_tipo => $ar_section_id) {
						if (empty($ar_section_id)) {
							continue;
						}
						#dump($current_section_tipo, ' current_section_tipo '.to_string($ar_section_id));
						
						foreach ($ar_section_id as $current_section_id) {
							
							## Recursion with all references
							$new_options = new stdClass();
								$new_options->section_tipo = $current_section_tipo;
								$new_options->section_id   = $current_section_id;

							$this->update_record( $new_options, true );
						}
						
					}//end foreach ($group_by_section_tipo as $current_section_tipo => $ar_section_id) {
									

			}//end if ($resolve_references===true) {

			#dump($ar_record_updated, ' ar_record_updated ++ '.to_string());
			#dump($ar_resolved_static, ' ar_resolved_static ++ '.to_string());
			if(SHOW_DEBUG) {
				#dump($ar_resolved_static_debug, ' ar_resolved_static_debug ++ '.to_string());;
			}

			$this->ar_published_records = $ar_resolved_static;
			return true;

	}//end update_record





	/**
	* GET_DIFFUSION_SECTION_BY_SECTION
	* @param string $section_tipo
	* @return string $diffusion_section (tipo like dd1525) or bool false
	*/
	public function get_diffusion_section_by_section( $section_tipo ) {

		if (defined('DEDALO_DIFFUSION_MAP')) {
			$ar_dedalo_diffusion_map = unserialize(DEDALO_DIFFUSION_MAP);
			if (isset($ar_dedalo_diffusion_map[$section_tipo]->table)) {
				$diffusion_element_tipo = $ar_dedalo_diffusion_map[$section_tipo]->table;
				return $diffusion_element_tipo;
			}
		}

		static $ar_diffusion_section_resoved;

		$diffusion_section = false;		// default (bool)false
			
		# AR_DIFFUSION_MAP
		$ar_diffusion_map = $this->get_ar_diffusion_map();
			#dump($ar_diffusion_map,'$ar_diffusion_map '.to_string($section_tipo)); #die();		

		$database_tipo = reset($ar_diffusion_map);
			#dump($database_tipo, " database_tipo ".to_string());

		# Tablas en el primer nivel
		$ar_diffusion_table = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name='table', $relation_type='children');
			#dump($ar_diffusion_table, " ar_diffusion_table ".to_string());
		foreach ($ar_diffusion_table as $current_table_tipo) {
			$related_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
			if ($related_section==$section_tipo) {
				
				$diffusion_section = $current_table_tipo;

				# Save for speed
				$ar_diffusion_section_resoved[] = $diffusion_section;

				break;
			}
		}
		
		return $diffusion_section;	

	}#end get_diffusion_section_by_section




	/**
	* UPDATE_THESAURUS
	* Update one thesaurus like 'ts'
	* @param array|string $table e.g. 'ts'
	* @return 
	*/
	public function update_thesaurus( $request_options ) {

		$options = new stdClass();
			$options->section_tipo = null;	// Expected thesaurus prefix Like 'ts'
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		#
		# DIFFUSION_SECTION . e.g. 'ts'
		# In thesaurus case, diffusion_section is directly de name of the table (prefix) received from trigger (like 'ts')
		$diffusion_section = $options->section_tipo;				
			
		#
		# DATABASE_TIPO . Resolve database_tipo in current diffusion map e.g. 'web_DEDALO_ENTITY'		
		// Fix resolved database_tipo to class static var 'ar_database'
		if (defined('DEDALO_DIFFUSION_MAP')) {
			$DEDALO_DIFFUSION_MAP 	= unserialize(DEDALO_DIFFUSION_MAP);
			$database_tipo 			= $DEDALO_DIFFUSION_MAP['thesaurus']->database;
			$current_table_tipo		= $DEDALO_DIFFUSION_MAP['thesaurus']->table;
		}else{
			$database_tipo 			= 'web_'.DEDALO_ENTITY;
			$current_table_tipo		= 'thesaurus';
		}
		// Fix static var self::$ar_database for re-use
		self::$ar_database = array($database_tipo);


		// build_thesaurus_columns_data
		$options_cd = new stdClass();
			$options_cd->ar_tables  = (array)$diffusion_section; 	// The format is always array, although there is only one element like 'ts'
			$options_cd->table_name = (string)$current_table_tipo;	// Target MySQL table name like 'thesaurus'
		$thesaurus_columns_data  = self::build_thesaurus_columns_data( $options_cd );
			#dump($thesaurus_columns_data, ' thesaurus_columns_data ++ '.to_string()); die();
		return $thesaurus_columns_data;
		
		/* DISABLED . Save every row in build_thesaurus_columns_data to avoid memory problems with bit arrays <--
			// Fix static var self::$ar_table_data for re-use
			self::$ar_table_data[$database_tipo][$current_table_tipo] = $thesaurus_columns_data;

			#
			# SAVE RECORD . Insert MYSQL record (arrray) deleting before old data
			$save_options = new stdClass();
				$save_options->record_data 					    = $thesaurus_columns_data;	//self::$ar_table_data[$database_tipo][$diffusion_section];		#dump($save_options, ' save_options ++ '.to_string());die();
				$save_options->record_data['diffusion_section'] = $diffusion_section;
				$save_options->record_data['database_tipo'] 	= $database_tipo;
				$save_options->typology 						= 'thesaurus';
					#dump($save_options, ' save_options ++ '.to_string()); die();

			$save = diffusion_mysql::save_record($save_options);
				#dump($save, ' save **');	
			return $save;
			*/

	}#end update_thesaurus

	/**
	* BUILD_THESAURUS_COLUMNS
	* @return 
	*/
	public static function build_thesaurus_columns( $request_options ) {
		
		$options = new stdClass();
			$options->table_name = null;		
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}		
	
		$ar_table_data 					= array();
		$ar_table_data['database_name']	= reset(self::$ar_database);
		$ar_table_data['table_name']	= $options->table_name;
		$ar_table_data['ar_fields'] 	= array();

		#
		# ID FIELD	. Mandatory column
		$options = new stdClass();
			$options->typology 	= 'section_id';
			$options->tipo 		= null;
		$ar_table_data['ar_fields'][] = self::create_field( $options );

		#
		# LANG . Mandatory column
		$options = new stdClass();
			$options->typology 	= 'lang';
			$options->tipo 		= null;
		$ar_table_data['ar_fields'][] = self::create_field( $options );		

		#
		# OTHER COLUMNS
		$ts_columns = self::get_ts_columns();
		foreach ($ts_columns as $current_field_name => $current_field_type) {

			$options = new stdClass();
				$options->field_name 	 = $current_field_name;
				$options->field_type 	 = $current_field_type;

			$ar_table_data['ar_fields'][] = self::create_ts_field( $options );
			
		}//end foreach ($ts_columns as $field_name => $field_type) {		

		return $ar_table_data;

	}#end build_thesaurus_columns

	# GET_TS_COLUMNS
	public static function get_ts_columns() {
		return array('publication'	=> "enum",	// Source field name is 'visible'. Changed to 'publication' for normalize output
					'tld' 			=> "varchar",
					'terminoID' 	=> "varchar",
					'parent'		=> "varchar",
					'modelo'		=> "varchar",
					'esmodelo'		=> "enum",
					'esdescriptor'	=> "enum",
					'norden'		=> "int",
					'usableIndex'	=> "enum",
					'traducible'	=> "enum",
					'relaciones' 	=> "text",
					'propiedades'	=> "text",
					'index' 		=> "text",
					'termino'		=> "text", // translatable (from Descriptors)
					'obs'			=> "text", // translatable (from Descriptors)
					);
	}#end get_ts_columns

	/**
	* CREATE_TS_FIELD
	* @return array $ar_field_data
	*/
	public static function create_ts_field( stdClass $request_options ) {
		
		$ar_field_data=array();

		$options = new stdClass();
			$options->field_name = null;
			$options->field_type = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		switch ($options->field_name) {
			
			# VARCHAR 2
			case 'tld':
				$ar_field_data['field_name'] 	= $options->field_name;
				$ar_field_data['field_type'] 	= 'field_'.$options->field_type;
				$ar_field_data['field_coment'] 	= "";
				$ar_field_data['field_options'] = 2;
				break;

			# INT 3
			case 'norden':
				$ar_field_data['field_name'] 	= $options->field_name;
				$ar_field_data['field_type'] 	= 'field_'.$options->field_type;
				$ar_field_data['field_coment'] 	= "";
				$ar_field_data['field_options'] = 3;
				break;	
			
			# VARCHAR 8
			case 'terminoID':
			case 'parent':
			case 'modelo':
				$ar_field_data['field_name'] 	= $options->field_name;
				$ar_field_data['field_type'] 	= 'field_'.$options->field_type;
				$ar_field_data['field_coment'] 	= "";
				$ar_field_data['field_options'] = 8;
				break;

			# ENUM SI,NO
			case 'esmodelo':
			case 'esdescriptor':			
			case 'usableIndex':
			case 'traducible':
				$ar_field_data['field_name'] 	= $options->field_name;
				$ar_field_data['field_type'] 	= 'field_'.$options->field_type;
				$ar_field_data['field_coment'] 	= "";
				$ar_field_data['field_options'] = '"si","no"';
				break;

			case 'publication': // source 'visible'
				$ar_field_data['field_name'] 	= $options->field_name;
				$ar_field_data['field_type'] 	= 'field_'.$options->field_type;
				$ar_field_data['field_coment'] 	= "";
				$ar_field_data['field_options'] = '"yes","no"';
				break;

			# TEXT 
			case 'termino':
			case 'obs':
			default:
				$ar_field_data['field_name'] 	= $options->field_name;
				$ar_field_data['field_type'] 	= 'field_'.$options->field_type;
				$ar_field_data['field_coment'] 	= "";
				$ar_field_data['field_options'] = "";
				break;

		}//switch ($options->field_name) {	

		return (array)$ar_field_data;

	}#end create_ts_field



	/**
	* BUILD_THESAURUS_COLUMNS_DATA
	* Get all thesaurus rows data to add in mysql table
	* @return array rows data
	*/
	public static function build_thesaurus_columns_data( $request_options ) {
		
		$options = new stdClass();
			$options->ar_tables  = array();
			$options->table_name = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		#$ar_database  		= $this->get_ar_database();

		$ar_table_data  				= array();		
		$ar_table_data['database_name']	= reset(self::$ar_database);
		$ar_table_data['table_name']	= $options->table_name;
		$ar_table_data['ar_fields'] 	= array();

		$ar_all_project_langs 	= unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
		$ar_columns 			= self::get_ts_columns();		
		foreach ((array)$options->ar_tables as $key => $current_table) {

			#
			# RECORDS
			$ts_records = self::get_all_ts_records( $current_table );
			foreach ($ts_records as $current_terminoID) {
			foreach ($ar_all_project_langs as $current_lang) {

				# SECTION_ID COLUMN DATA
				$options = new stdClass();
					$options->column_name 	= 'section_id';
					$options->lang 			= $current_lang;
					$options->terminoID 	= $current_terminoID;
				$column_value = self::build_ts_data_field( $options );
				$ar_table_data['ar_fields'][$current_terminoID][$current_lang][] = $column_value;

				# LANG COLUMN DATA
				$options = new stdClass();
					$options->column_name 	= 'lang';
					$options->lang 			= $current_lang;
					$options->terminoID 	= $current_terminoID;
				$column_value = self::build_ts_data_field( $options );
				$ar_table_data['ar_fields'][$current_terminoID][$current_lang][] = $column_value;

				# OTHER COLUMNS DATA
				foreach ($ar_columns as $column_name => $column_type) {
					
					$options = new stdClass();
						$options->column_name 	= $column_name;
						$options->lang 			= $current_lang;
						$options->terminoID 	= $current_terminoID;
					$column_value = self::build_ts_data_field( $options );

					$ar_table_data['ar_fields'][$current_terminoID][$current_lang][] = $column_value;
				}				

			}//end foreach ($ar_all_project_langs as $current_lang) {


				#
				# SAVE RECORD . Insert MYSQL record (arrray) deleting before old data
				$save_options = new stdClass();
					$save_options->record_data		= $ar_table_data;	//self::$ar_table_data[$database_tipo][$diffusion_section];		#dump($save_options, ' save_options ++ '.to_string());die();		
					$save_options->typology 		= 'thesaurus';					
						#dump($save_options, ' save_options ++ '.to_string()); die();

					$save = diffusion_mysql::save_record($save_options);

				#
				# MEMORY WORKS
				unset($ar_table_data['ar_fields'][$current_terminoID]);	// Unset to avoid memory overload on big arrays like 'France'				

				// let GC do the memory job				
		        #time_nanosleep(0, 10000000);
		        #time_nanosleep(0, 1000000); // One ms
		        #debug_log(__METHOD__." memory_get_usage: [$current_terminoID] ".memory_get_usage(), logger::DEBUG);

			}//end foreach ($ts_records as $current_terminoID) {

			// let GC do the memory job
			time_nanosleep(0, 50000000); // 50 ms

		}//end foreach ((array)$options->ar_tables as $key => $current_table) {
		#dump($thesaurus_db_data, ' thesaurus_db_data ++ '.to_string());
		#dump($ar_table_data, ' ar_table_data ++ '.to_string());

		return $ar_table_data;

	}#end build_thesaurus_columns_data



	/**
	* BUILD_TS_DATA_FIELD
	* @return array ar_field_data
	*/
	public static function build_ts_data_field( stdClass $request_options ) {
		
		$options = new stdClass();
			$options->column_name 	= null;
			$options->lang 			= null;
			$options->terminoID 	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
		
		$ar_field_data=array();
		$ar_field_data['field_name']  = '';
		$ar_field_data['field_value'] = '';

		switch ($options->column_name) {

			case 'section_id':
				# Data from descriptors table
				$ar_field_data['field_name']  = $options->column_name;
				$prefix = Tesauro::terminoID2prefix($options->terminoID);
				$field_value = str_replace($prefix, '', $options->terminoID);
				$ar_field_data['field_value'] = $field_value;
				break;

			case 'lang':
				# Data from descriptors table
				$ar_field_data['field_name']  = $options->column_name;
				$ar_field_data['field_value'] = $options->lang;
				break;

			case 'termino':
				# Data from descriptors table
				$ar_field_data['field_name']  = $options->column_name;
				$termino = RecordObj_ts::get_termino_by_tipo($options->terminoID, $options->lang, true, true);	// $terminoID, $lang=NULL, $from_cache=false, $fallback=true
				$ar_field_data['field_value'] = strip_tags($termino);
				break;

			case 'obs':
				# Data from descriptors table
				$ar_field_data['field_name']  = $options->column_name;
				$obs = RecordObj_ts::get_obs_by_tipo($options->terminoID, $options->lang);
				$ar_field_data['field_value'] = strip_tags($obs);
				break;

			case 'index':
				# Data from descriptors table
				$ar_field_data['field_name']  = $options->column_name;
				$index = RecordObj_ts::get_descriptor_dato_by_tipo($options->terminoID, DEDALO_DATA_NOLAN, 'index', false); // get_descriptor_dato_by_tipo($terminoID, $lang, $tipo, $fallback=false) 
					#dump($index, ' index ++ '.to_string());
				$ar_field_data['field_value'] = trim($index);
				break;
			
			case 'publication':
				# Direct data from thesaurus table but changin name column
				$ar_field_data['field_name']  = 'publication';
				$RecordObj_ts = new RecordObj_ts($options->terminoID);				
				$visible 	  = $RecordObj_ts->get_visible();
				if ($visible=='si') {
					$visible = 'yes';
				}				
				$ar_field_data['field_value'] = empty($visible) ? 'yes' : $visible;  // Default is 'yes'
				break;	
			
			case 'tld':
				# Prefix of table
				$ar_field_data['field_name']  = $options->column_name;
				$prefix = Tesauro::terminoID2prefix($options->terminoID);
				$ar_field_data['field_value'] = $prefix; // Like 'ts'
				break;

			default:
				# Direct data from thesaurus table
				$ar_field_data['field_name']  = $options->column_name;
				$RecordObj_ts = new RecordObj_ts($options->terminoID);
				$field_get 	  = 'get_'.$options->column_name;
				$ar_field_data['field_value'] = $RecordObj_ts->$field_get();
				break;
		}

		return $ar_field_data;

	}#end build_ts_data_field


	

	/**
	* GET_ALL_TS_RECORDS
	* @return array
	*/
	public static function get_all_ts_records( $table, $root=0 ) {

		$start_time = start_time();

		$root_tipo = $table.$root;
		$RecordObj_ts = new RecordObj_ts( $root_tipo );
		$options = new stdClass();
			#$options->visible 		= 'si';
			$options->esmodelo 		= 'no';
			#$options->esdescriptor 	= 'si';	// deactivated to allow non descriptors
		$ar_childrens = $RecordObj_ts->get_ar_recursive_childrens_with_options($root_tipo, 0, $options); // $terminoID, $is_recursion=0, $options=null
			#dump($ar_childrens, ' ar_childrens ++ '.$root_tipo.' - '.to_string($options));

		if(empty($ar_childrens)) {
			debug_log(__METHOD__." 0 terms was found in thesaurus. Please review column 'visible' is set to 'si' to publish ".to_string($options), logger::WARNING);
		}	
		debug_log(__METHOD__." exec_time secs: [".count($ar_childrens)." items] ".exec_time_unit($start_time,'secs')." - memory_get_usage: ".memory_get_usage(), logger::DEBUG);
		

		return $ar_childrens;

	}#end get_all_ts_records





}
?>