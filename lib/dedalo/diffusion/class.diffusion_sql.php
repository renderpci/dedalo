<?php
require_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion.php');

/*
* CLASS DIFUSSION SQL
*/
class diffusion_sql extends diffusion  {
		
	public static $database_name;
	public static $ar_table;
	public static $ar_table_data;


	/**
	* CONSTRUCT
	* @param object $options . Default null
	*/
	function __construct($options=null) {
		
		parent::__construct($options=null);
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
						$options->ar_tables  	= $propiedades->ar_tables;
						$options->table_name 	= RecordObj_dd::get_termino_by_tipo($current_table_tipo, DEDALO_STRUCTURE_LANG, true, false);
						$options->database_name = RecordObj_dd::get_termino_by_tipo($database_tipo, DEDALO_STRUCTURE_LANG, true, false);

					$thesaurus_columns  = self::build_thesaurus_columns( $options );
					self::$ar_table[$options->database_name][$current_table_tipo] = $thesaurus_columns;
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
	public static function build_table_columns($table_tipo, $database_name) {
		
		$ar_table_data=array();

		$ar_table_data['database_name']	= $database_name;	//self::$database_name;
		$ar_table_data['table_name']	= RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
		$ar_table_data['ar_fields'] 	= array();


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
					self::build_table_columns($curent_children_tipo, $database_name);	
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

							$ar_dedalo_countries = (array)self::get_ar_dedalo_countries($options);
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

		return self::$ar_table[$database_name][$table_tipo] = $ar_table_data;
	}#end build_table_columns



	/**
	* GET_DB_DATA
	* Simply Exec self::build_table_columns_data for every table in structure
	* @param string $database_tipo Like 'dd1260'
	*//*
	public function get_db_data__DEPRECATED($database_tipo) {
		
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
						$options->ar_tables  		= $propiedades->ar_tables;
						$options->table_name 		= RecordObj_dd::get_termino_by_tipo($current_table_tipo, DEDALO_STRUCTURE_LANG, true, false);
						$options->diffusion_section = $current_table_tipo;
					$thesaurus_columns_data  = self::build_thesaurus_columns_data( $options );
					self::$ar_table_data[$database_tipo][$current_table_tipo] = $thesaurus_columns_data;
				}
			}	
	}#end get_db_data
	*/



	/** 
	* BUILD_TABLE_COLUMNS_DATA (RECURSIVE)
	* Construye los datos para introducir en los campos de la tabla generada y los fija en la variable estática self::$ar_table_data
	* @param string $table_tipo like 'oh1'
	* @param array $ar_section_id_portal Optional. Default empty array
	* @param string $database_name like 'web_xxx'
	* @param array|bool $ar_result
	*	Default false
	* @param string $diffusion_element_tipo
	*
	* @see $his->get_db_data
	*/
	public static function build_table_columns_data($table_tipo, $ar_section_id_portal=array(), $database_name, $ar_result=false, $diffusion_element_tipo) {

		if(SHOW_DEBUG) {
			#dump($ar_section_id_portal,"ar_section_id_portal - table_tipo: $table_tipo (".RecordObj_dd::get_termino_by_tipo($table_tipo).") - database_name: $database_name (".RecordObj_dd::get_termino_by_tipo($database_name).") "); #die();
			#dump($table_tipo,"table_tipo");#die();
			#dump($ar_section_id_portal, ' ar_section_id_portal ++ '.to_string());
			#dump($table_tipo, ' table_tipo ++ '); dump($ar_section_id_portal, ' ar_section_id_portal ++ '); dump($database_name, ' database_name ++ '); dump($ar_result, ' ar_result ++ '); dump($diffusion_element_tipo, ' diffusion_element_tipo ++ ');
			#exit();
		}

		# SECTION try . Target section is a related term of current difusion pointer. Normally is section, but can be a portal
		$pointer_type='section';
		$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, 'section', 'termino_relacionado');
		if (empty($ar_section_tipo[0])) {
			# PORTAL try
			$pointer_type='portal';
			$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, 'component_portal', 'termino_relacionado');
		}
		if(!isset($ar_section_tipo[0])) throw new Exception("Error Processing Request, section_tipo is empty. Please define valid related term (section or portal) for pointer table_tipo:$table_tipo", 1);			
		# dump($ar_section_tipo," ar_section_tipo - table_tipo:$table_tipo");#die();

		
		# SECTION_TIPO . Set section tipo
		$section_tipo = $ar_section_tipo[0];
			
			#
			# AR_RESULT . Get all matrix records in current table / portal. When portal is request, records of portal are in var '$ar_section_id_portal'
			# NOTE : Because we need section_id and section_tipo of every item (multi-target portals), format $ar_result contains this data always
			if (!$ar_result) {
				if(!empty($ar_section_id_portal)) {
					# Records here are the portal dato locators
					# $ar_result	= $ar_section_id_portal;
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

			
			# From config :
			$ar_all_project_langs 	= unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);			
			if(SHOW_DEBUG) {
				#dump($ar_all_project_langs," ar_all_project_langs");die();	
				#$ar_all_project_langs = array('lg-spa'); # Test only
			}

			$ar_field_data['database_name']	= (string)$database_name;
			$ar_field_data['table_name'] 	= (string)RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);

			# TABLE CHILDREN (FIELDS)
				$RecordObj_dd 	   = new RecordObj_dd($table_tipo);
				$ar_table_children = $RecordObj_dd->get_ar_childrens_of_this();

			# COMPONENT_PUBLICATION_TIPO
				$component_publication_tipo = false;

				#
				# RESOLVED RECORDS
				# Store resolved records to avoid infinite loops
				static $resolved_records;			
				
	
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

					# RESOLVED_RECORDS_KEY
					$resolved_records_key = $section_tipo.'-'.$current_section_id;
					if (in_array($resolved_records_key, (array)$resolved_records)) {
						debug_log(__METHOD__." SKIPPED RECORD [$resolved_records_key]. ALREADY RESOLVED. ".to_string(), logger::WARNING);
						error_log(" SKIPPED RECORD [$resolved_records_key]. ALREADY RESOLVED. ");
						continue;
					}
					#debug_log(__METHOD__." !!!! resolved_records ".to_string($resolved_records), logger::DEBUG);

					#
					# SECTION DIFFUSION INFO - CHECK
					# On finish record update, update current section diffusion_info
					$section = section::get_instance($current_section_id, $section_tipo, $modo='list');
					$diffusion_info = $section->get_diffusion_info();
					if ( isset($diffusion_info->$diffusion_element_tipo) ) {

						if(isset($_SESSION['dedalo4']['config']['skip_publication_state_check']) && $_SESSION['dedalo4']['config']['skip_publication_state_check']==1) {
							# Nothing to do. (Configurated from tool_administrator)
						}else{

							# RESOLVED_RECORDS (set a resoolved)
							$resolved_records[] = $resolved_records_key;

							debug_log(__METHOD__." Skipped current record [{$section_tipo}-{$current_section_id}]. Already published ($diffusion_element_tipo). ".to_string(), logger::DEBUG);
							continue;
						}
					}


					#
					# COMPONENT PUBLICATION - CHECK
					if(!$component_publication_tipo) {
						$component_publication_tipo = self::get_component_publication_tipo($ar_table_children);
					}
					#dump($component_publication_tipo, ' component_publication_tipo ++ '.to_string($section_tipo));					
					
					$component_publication_bool_value = (bool)self::get_component_publication_bool_value($component_publication_tipo, $current_section_id, $section_tipo);
						#dump($component_publication_bool_value, ' component_publication_bool_value ++ '.to_string());
					
					if (!$component_publication_bool_value) {
						# Skip this record
						self::delete_sql_record($current_section_id, $ar_field_data['database_name'], $ar_field_data['table_name']);
						debug_log(__METHOD__." Skipped record $current_section_id ".to_string($ar_field_data['table_name'])." (publication=no)", logger::DEBUG);

						$section->diffusion_info_add($diffusion_element_tipo);
						$section->Save();
						debug_log(__METHOD__." Added current diffusion_element_tipo $diffusion_element_tipo to data. Section diffusion_info updated and saved [{$section_tipo}-{$current_section_id}]. ".to_string(), logger::DEBUG);
						
						# RESOLVED_RECORDS (set a resoolved)
						$resolved_records[] = $resolved_records_key;

						continue;
					}
								
					

					#
					# LANGS ITERATION
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
							foreach ((array)$ar_table_children as $curent_children_tipo) {								
								
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

												$ar_dedalo_countries = (array)self::get_ar_dedalo_countries($options);
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
												$current_ar_field_data['field_name']  = RecordObj_dd::get_termino_by_tipo($curent_children_tipo, DEDALO_STRUCTURE_LANG, true, false);
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
										}//end switch (true) { # DISCRIMINE BY PROPIEDADES							
											
								}#end modelo_name switch							
								
							}#end foreach ($ar_table_children as $curent_children_tipo)
					#break; //ONLY ONE NOW FOR TEST

					$i++; # fin primera iteración registro/idioma					
					}#end foreach ($ar_all_project_langs as $current_lang)
					#dump($ar_data, ' ar_data '.$table_tipo);
					
					
					#
					# SECTION DIFFUSION INFO - ADD
					# On finish record update uppdate current section diffusion_info
					#$section = section::get_instance($current_section_id, $section_tipo, $modo='list');
					#$diffusion_info = $section->get_diffusion_info(); dump($diffusion_info, ' diffusion_info ++ '.to_string());
					$section->diffusion_info_add($diffusion_element_tipo);
					$section->Save();
					debug_log(__METHOD__." Added current diffusion_element_tipo $diffusion_element_tipo to data. Section diffusion_info updated and saved [{$section_tipo}-{$current_section_id}]. ".to_string(), logger::DEBUG);

					# RESOLVED_RECORDS
					$resolved_records[] = $resolved_records_key;

					// let GC do the memory job
					time_nanosleep(0, 10000000); // 50 ms

				}#end foreach ($ar_result as $current_section_id) end itearation of records
				#self::build_table_columns_data($section_tipo, $ar_portal_section_id_unique, $database_name, false, $diffusion_element_tipo);
				#$ar_field_data['ar_fields'][] = self::create_data_field($ar_section[0], $matrix_id_section, 'true');

			

		# ASIGN VAR (If not empty ar_fields)
		# After iterate all records and create the current section array fields, set to static class var (self::$ar_table_data)
		if (!empty($ar_field_data['ar_fields'])) {
			self::$ar_table_data[$database_name][$table_tipo] = $ar_field_data;
		}		

		
		# PORTAL RECORDS TOTALS
		# After iterate all records, we have now the portal records totals (organized by portal_tipo )
		# Iterate all portals and build every table_data of this portals
		# dump($ar_portal_records, ' $ar_portal_records');		
		foreach ((array)$ar_portal_records as $portal_tipo => $portal_records) {
			$portal_records = self::clean_duplicates( $portal_records );
			self::build_table_columns_data($portal_tipo, $portal_records, $database_name, false, $diffusion_element_tipo);
		}

	}#end build_table_columns_data



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
				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo, DEDALO_STRUCTURE_LANG, true, false);
				$ar_field_data['field_type'] 	= 'field_text';
				$termino_relacionado 			= RecordObj_dd::get_ar_terminos_relacionados($options->tipo, $cache=true, $simple=true)[0];
				$ar_field_data['field_coment'] 	= RecordObj_dd::get_termino_by_tipo($termino_relacionado)." - $termino_relacionado";
				$ar_field_data['field_options'] = null;
				break;

			default:
				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo, DEDALO_STRUCTURE_LANG, true, false); 	
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

				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo, DEDALO_STRUCTURE_LANG, true, false);
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

				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo, DEDALO_STRUCTURE_LANG, true, false);
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
							$timestamp = $current_component->get_dato_as_timestamp();
							$ar_field_data['field_value'] = $timestamp;
							#$ar_field_data['field_value'] = $current_component->get_valor();
							debug_log(__METHOD__." $ar_field_data[field_value] ".to_string($ar_field_data['field_value']), logger::WARNING);
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
	
	


	/**
	* GET_AR_DIFFUSION_MAP
	* Get and set ar_diffusion_map of current domain ($this->domain)
	* @param array $options
	* @return array $this->ar_diffusion_map
	*/
	public function get_ar_diffusion_map_sql( $options=array() ) {

		// EN PROCESO

		if (isset($this->ar_diffusion_map)) {
			return $this->ar_diffusion_map;
		}
		#if(SHOW_DEBUG) $start_time = start_time();


		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE
	
			# DIFFUSION_DOMAIN : Get structure tipo of current diffuision domain name
			$diffusion_domain = self::get_my_diffusion_domain($this->domain, get_called_class());
				#dump($diffusion_domain,'$diffusion_domain '.$this->domain." ".get_called_class());

			# DATABASE :
			$ar_diffusion_database = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain, $modelo_name='database', $relation_type='children');
				#dump($ar_diffusion_database,'$ar_diffusion_database');
			
			# DIFFUSION_SECTIONS : Recorremos las secciones de difusión para localizar las coincidencias con los tipos de sección de las indexaciones
			foreach ($ar_diffusion_database as $diffusion_database_tipo) {

				# diffusion_section_tipo ar_relateds_terms
				$current_database_tipo = $diffusion_database_tipo;
					#dump($current_database_tipo,'$current_database_tipo');
				
				# current_database_tipo : Verify
				if (empty($current_database_tipo)) {
					throw new Exception("Error Processing Request get_ar_diffusion_map: diffusion_database_tipo is empty. Please configure structure with one diffusion_database_tipo related", 1);
				}

				$ar_diffusion_map[] = $current_database_tipo;		
				
			}#end foreach ($ar_diffusion_database as $diffusion_section_tipo

		#if(SHOW_DEBUG) dump( exec_time($start_time, __METHOD__) );

		# Fix
		$this->ar_diffusion_map = $ar_diffusion_map;
			#dump($this->ar_diffusion_map,"this->ar_diffusion_map ");#die();

		return (array)$this->ar_diffusion_map;
	}#end get_ar_diffusion_map_sql



	/**
	* UPDATE_RECORD
	* Update one or any number of records ( array ) and references
	* @param object $request_options
	* @param bool $resolve_references
	* @return obj $response
	*/
	public function update_record( $request_options, $resolve_references=false ) {
				
		$start_time = start_time();

		$options = new stdClass();
			$options->section_tipo 			= null;
			$options->section_id   			= null;
			$options->diffusion_element_tipo= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
				

		# Mandatory vars
		if(empty($options->section_tipo) || empty($options->section_id) || empty($options->diffusion_element_tipo)) {
			debug_log(__METHOD__." ERROR ON UPDATE RECORD $options->section_id - $options->section_tipo - $options->diffusion_element_tipo. Undefined mandatory options var".to_string(), logger::ERROR);
			return false;
		}
			# Old code heritage control
			if (is_array($options->section_id)) {
				if(SHOW_DEBUG) {
					dump($options->section_id, ' $options->section_id ++ '.to_string());
				}			
				throw new Exception("Error Processing Request. Sorry, array is not accepted to update_record anymore. Please use int as options->section_id ", 1);			
			}

		#
		# DIFFUSION_ELEMENT_TIPO
		$diffusion_element_tipo = $options->diffusion_element_tipo;

		#
		# DATABASE_NAME . Resolve database_tipo in current diffusion map. Like 'web_aup'
		if (isset(self::$database_name)) {
			$database_name = self::$database_name;
		}else{
			# DIFFUSION ELEMENT
			$diffusion_element 	= self::get_diffusion_element_from_element_tipo($diffusion_element_tipo);
			$database_name 		= $diffusion_element->database_name;
			if (empty($database_name)) {
				throw new Exception("Error Processing Request. database_name not defined", 1);
			}
			self::$database_name = $database_name; // Set static class var
		}		
		
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		static $ar_resolved_static;
		static $ar_record_updated;
		static $ar_unconfigured_diffusion_section;
			#dump($ar_resolved_static, ' ar_resolved_static ++ '.to_string());

		if(SHOW_DEBUG) {
			static $ar_resolved_static_debug;
		}

		if ( isset($ar_resolved_static[$options->section_tipo]) &&  
			 in_array($options->section_id, $ar_resolved_static[$options->section_tipo]) ) {
				#dump($ar_record_updated, ' ar_record_updated ++ '.to_string());
			 	#dump($options->section_id, ' options->section_id already resolved. Return false ++ '.to_string($options->section_tipo));
			#$response->msg .= 'Record already resolved';
			#return $response;		# Record already resolved
		}

		
		#
		# DIRECT RECORD SAVE
		#
			#
			# DIFFUSION_SECTION . Resolve diffusion section from section tipo
			if (in_array($options->section_tipo, (array)$ar_unconfigured_diffusion_section)) {
				$response->msg .= 'unconfigured_diffusion_section';	
				return $response;
			}
			$diffusion_section = $this->get_diffusion_table_by_section( $options->section_tipo );
				#dump($diffusion_section, " diffusion_section $options->section_tipo".to_string()); #die();
				if(!$diffusion_section) {
					if(SHOW_DEBUG) {
						$section_name = RecordObj_dd::get_termino_by_tipo($options->section_tipo, DEDALO_STRUCTURE_LANG, true, false);
						#throw new Exception("Error Processing Request. diffusion_section not found in correspondece with section_tipo: $options->section_tipo . Nothing is updated", 1);
						#echo "<hr> DEBUG update_record: Omitted update section <b>'$section_name'</b>. Optional diffusion_section not found in correspondece with section_tipo: $options->section_tipo [$options->section_id]<br>";
						$msg = " Omitted update section <b>'$section_name'</b>. Optional diffusion_section not found in correspondece with section_tipo: $options->section_tipo [$options->section_id] ";
						$response->msg .= $msg;
						debug_log(__METHOD__." $msg", logger::DEBUG);
					}
					#error_log(__METHOD__." WARNING: diffusion_section not found in correspondece with section_tipo: $options->section_tipo . Nothing is updated !!");
					$ar_unconfigured_diffusion_section[] = $options->section_tipo;

					$response->msg .= " unconfigured_diffusion_section: $options->section_tipo";
					return $response;
				}			
				

				#
				# TABLE FIELDS reference only	(not needed because tables are already created)
				#self::build_table_columns($diffusion_section, $database_name);
					#dump(self::$ar_table, " data ".to_string( $database_name));

				#
				# TABLE_DATA . Calculate table_data for current array of section_id (all langs)
				$ar_result=array();
				foreach ((array)$options->section_id as $section_id) {
					$ar_result[] = array($options->section_tipo => $section_id);
				}
				self::build_table_columns_data($diffusion_section, $ar_section_id_portal=array(), $database_name, $ar_result, $diffusion_element_tipo); // Trigger resolve		
				#$table_data = self::$ar_table_data[$database_name][$diffusion_section]; // Result is set and usable
					#dump($table_data, ' table_data ++ '.to_string($diffusion_section)); die();

				
				#
				# SAVE RECORD . Insert MYSQL record (array) deleting before old data
				if(isset(self::$ar_table_data[$database_name][$diffusion_section]) && !empty(self::$ar_table_data[$database_name][$diffusion_section])) {
					
					$save_options = new stdClass();
						$save_options->record_data 					    = self::$ar_table_data[$database_name][$diffusion_section];		#dump($save_options, ' save_options ++ '.to_string());die();
						$save_options->record_data['diffusion_section'] = $diffusion_section;
						$save_options->record_data['database_name'] 	= self::$database_name;
							#dump($save_options, ' save_options ++ '.to_string()); die();

					$save = diffusion_mysql::save_record($save_options);
						$ar_record_updated[] = $options;
						#dump($options, ' options ++ SAVED !! '.to_string());
				}				
			
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
								$new_options->section_tipo 			 = $current_section_tipo;
								$new_options->section_id   			 = $current_section_id;								
								$new_options->diffusion_element_tipo = $options->diffusion_element_tipo;

							# Recursion
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

		$response->result = true;
		$response->msg .= "Ok. Record updated $options->section_id";

			#dump($response, ' response ++++++ '.to_string($options->section_id));
			
		return $response;
	}//end update_record



	/**
	* UPDATE_THESAURUS
	* Update one thesaurus like 'ts'
	* @param array|string $table e.g. 'ts'
	* @return 
	*/
	public function update_thesaurus( $request_options ) {

		$options = new stdClass();
			$options->section_tipo 			 = null;	// Expected thesaurus prefix Like 'ts'			
			$options->diffusion_element_tipo = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		#
		# DIFFUSION_SECTION . e.g. 'ts'
		# In thesaurus case, diffusion_section is directly de name of the table (prefix) received from trigger (like 'ts')
		$diffusion_section = $options->section_tipo;				
			
		#
		# database_name . Resolve database_name in current diffusion map e.g. 'web_DEDALO_DIFFUSION_DOMAIN'		
		$thesaurus_data 	= self::get_thesaurus_data();
		$current_table_tipo	= $thesaurus_data->table;
		$database_name 		= $thesaurus_data->database_name;

		# Build_thesaurus_columns_data
		$options_cd = new stdClass();
			$options_cd->ar_tables  	= (array)$diffusion_section; 	// The format is always array, although there is only one element like 'ts'
			$options_cd->table_name 	= (string)$current_table_tipo;	// Target MySQL table name like 'thesaurus'
			$options_cd->database_name 	= (string)$database_name;
		$thesaurus_columns_data  = self::build_thesaurus_columns_data( $options_cd );
			#dump($thesaurus_columns_data, ' thesaurus_columns_data ++ '.to_string()); die();
		
		return $thesaurus_columns_data;
	}#end update_thesaurus



	/**
	* BUILD_THESAURUS_COLUMNS
	* @return 
	*/
	public static function build_thesaurus_columns( $request_options ) {
		
		$options = new stdClass();
			$options->table_name 	= null;
			$options->database_name = null;		
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}		
	
		$ar_table_data 					= array();
		$ar_table_data['database_name']	= $options->database_name;
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
			$options->ar_tables  		= array();
			$options->table_name 		= null;
			$options->database_name 	= null;
			$options->diffusion_section = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
				#dump($options, ' options ++ '.to_string()); die();


		$ar_table_data  					= array();		
		$ar_table_data['database_name']		= $options->database_name;
		$ar_table_data['table_name']		= $options->table_name;
		$ar_table_data['ar_fields'] 		= array();
		$ar_table_data['diffusion_section']	= $options->diffusion_section;

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
					$save_options->record_data		= $ar_table_data;	//self::$ar_table_data[$database_name][$diffusion_section];		#dump($save_options, ' save_options ++ '.to_string());die();		
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
	* GET_DIFFUSION_DATABASE_NAME_FROM_TABLE
	* @param string $$diffusion_table_tipo
	* @return string $diffusion_database_name | null
	*/
	public static function get_diffusion_database_name_from_table( $diffusion_table_tipo ) {
		
		$diffusion_database_name = null;

		$modelo_name 	= 'database';
		$relation_type 	= 'parent';
		$ar_terminoID 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_table_tipo, $modelo_name, $relation_type, true);
			#dump($ar_terminoID, ' ar_terminoID ++ '.to_string($diffusion_table_tipo));

		$count = count($ar_terminoID);

		switch (true) {
			case $count==1:
				$diffusion_database_tipo = reset($ar_terminoID);				
				$diffusion_database_name = RecordObj_dd::get_termino_by_tipo($diffusion_database_tipo, DEDALO_STRUCTURE_LANG, true, false); // $terminoID, $lang=NULL, $from_cache=false, $fallback=true
				break;
			case $count>1:
				debug_log(__METHOD__." Detected more than one related elements: $modelo_name", logger::ERROR);
				break;
			default:
				break;
		}

		return $diffusion_database_name;
	}#end get_diffusion_database_name_from_table



	/**
	* GET_DIFFUSION_ELEMENT_FROM_ELEMENT_TIPO
	* Select from ar_diffusion_map_elements the current request element by tipo
	* @return object $diffusion_element | bool false
	*/
	public static function get_diffusion_element_from_element_tipo( $diffusion_element_tipo ) {		

		$ar_diffusion_map_elements = self::get_ar_diffusion_map_elements();
		if (!isset($ar_diffusion_map_elements[$diffusion_element_tipo])) {
			return false;
		}

		return $ar_diffusion_map_elements[$diffusion_element_tipo];	

	}#end get_diffusion_element_from_element_tipo



	/**
	* get_diffusion_element_tables_map
	* Build map of section->table of all tables of current diffusion domain
	* @param string $diffusion_domain_name . Like 'aup'
	* @return object $diffusion_element_tables
	*/
	public static function get_diffusion_element_tables_map( $diffusion_element_tipo ) {

		static $diffusion_element_tables_map;

		#if (isset($diffusion_element_tables_map)) {			
		#	return $diffusion_element_tables_map;
		#}
		
		$diffusion_element_tables_map = new stdClass();
		

		#
		# TABLES
		# Search inside current entity_domain and iterate all tables resolving alias and store target sections of every table
		$ar_terminoID = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo, $modelo_name='table', $relation_type='children_recursive', $search_exact=false);
			#dump($ar_terminoID, ' ar_terminoID ++ '.to_string($diffusion_element_tipo));
		foreach ($ar_terminoID as $current_table_tipo) {

			# Calculate database once
			if (!isset($database)) {
				$database = self::get_diffusion_database_name_from_table( $current_table_tipo );
			}
			
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_table_tipo,true);
			switch ($modelo_name) {
				case 'table':
					# Direct relation
					$real_table 		 = $current_table_tipo;
					$ar_related_sections = common::get_ar_related_by_model('section', $real_table);
					if (!empty($ar_related_sections)) {
						$section_tipo 		 = reset($ar_related_sections);
						$name 				 = RecordObj_dd::get_termino_by_tipo($real_table, DEDALO_STRUCTURE_LANG, true, false);

						$data = new stdClass();
							$data->table 	 = $real_table;
							$data->name  	 = $name;
							$data->database  = $database;

						$diffusion_element_tables_map->$section_tipo = $data;
					}					
					break;
				
				case 'table_alias':
					# Indirect relation
					$ar_related_tables   = common::get_ar_related_by_model('table', $current_table_tipo);	
					$real_table 		 = reset($ar_related_tables);
					$ar_related_sections = common::get_ar_related_by_model('section', $real_table);
					if (!empty($ar_related_sections)) {
						$section_tipo 		 = reset($ar_related_sections);
						$name 				 = RecordObj_dd::get_termino_by_tipo($real_table, DEDALO_STRUCTURE_LANG, true, false);

						$data = new stdClass();
							$data->table 		= $real_table;
							$data->name  		= $name;
							$data->database  	= $database;
							$data->from_alias 	= $current_table_tipo;

						$diffusion_element_tables_map->$section_tipo = $data;
					}					
					break;
				
				case 'table_thesaurus':
					$real_table 		 = $current_table_tipo;
					$name 				 = RecordObj_dd::get_termino_by_tipo($real_table, DEDALO_STRUCTURE_LANG, true, false);

					$RecordObj_dd = new RecordObj_dd($current_table_tipo);
					$propiedades  = json_decode($RecordObj_dd->get_propiedades());					
					$thesaurus_ar_prefix = isset($propiedades->diffusion->thesaurus_ar_prefix) ? $propiedades->diffusion->thesaurus_ar_prefix : array();										
					
					$section_tipo = 'thesaurus';

					$data = new stdClass();
						$data->table 				= $section_tipo;
						$data->name  				= $name;
						$data->database  			= $database;
						$data->thesaurus_ar_prefix 	= $thesaurus_ar_prefix;

					$diffusion_element_tables_map->$section_tipo = $data;
					break;
				
				default:
					# Skip no accepted models
					debug_log(__METHOD__." Skiped invalid model: $modelo_name", logger::DEBUG);
					continue;
					break;
			}			
		}//end foreach ($ar_terminoID as $current_table_tipo)

		return (object)$diffusion_element_tables_map;
	}#end get_diffusion_element_tables_map



	/**
	* GET_DIFFUSION_TABLE_BY_SECTION
	* @param string $section_tipo
	* @return string $diffusion_section (tipo like dd1525) or bool false
	*/
	public static function get_diffusion_table_by_section( $section_tipo ) {
		
		$ar_diffusion_map_elements = self::get_ar_diffusion_map_elements();		

		foreach ($ar_diffusion_map_elements as $diffusion_element_tipo => $obj_value) {
			$diffusion_element_tables_map = (object)self::get_diffusion_element_tables_map($diffusion_element_tipo);
			if ( isset($diffusion_element_tables_map->$section_tipo) && isset($diffusion_element_tables_map->$section_tipo->table)) {
				return $diffusion_element_tables_map->$section_tipo->table;
				break;
			}			
		}

		return false;
	}#end get_diffusion_table_by_section
	


	/**
	* GET_THESAURUS_DATA
	* @return object $thesaurus_data
	*/
	public function get_thesaurus_data() {

		$thesaurus_data = new stdClass();
		
		$ar_diffusion_map = self::get_ar_diffusion_map(DEDALO_DIFFUSION_DOMAIN);
			#dump($ar_diffusion_map, ' ar_diffusion_map ++ '.to_string($options->section_tipo));
		
		$ar_diffusion_map_elements = self::get_ar_diffusion_map_elements();
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string()); die();
		
		$section_tipo = 'thesaurus';
		foreach ($ar_diffusion_map_elements as $diffusion_element_tipo => $obj_value) {
			#dump($obj_value, ' $obj_value ++ '.to_string($diffusion_element_tipo));

			$tables_obj = self::get_diffusion_element_tables_map( $diffusion_element_tipo );
				#dump($tables_obj, ' tables_obj ++ '.to_string( $diffusion_element_tipo ));

			if (isset($tables_obj->$section_tipo)) {
				$thesaurus_data->database_name  = $tables_obj->$section_tipo->database;
				$thesaurus_data->table 	  		= $tables_obj->$section_tipo->table;
				break;
			}
		}
		#dump($thesaurus_data, ' $thesaurus_data ++ '.to_string());

		# Fallback
		if (!isset($thesaurus_data->database_name)) {			
			$thesaurus_data->database_name = 'web_'.DEDALO_DIFFUSION_DOMAIN;
			$thesaurus_data->table 	  = 'thesaurus';
			debug_log(__METHOD__." Thesaurus is not properly defined for diffusion. Using defaults [$thesaurus_data->table,$thesaurus_data->database_name]. Please fix this ASAP  ", logger::WARNING);
		}

		return $thesaurus_data;
	}#end get_thesaurus_data



	/**
	* DIFFUSION_COMPLETE_DUMP
	* @return 
	*/
	public function diffusion_complete_dump( $diffusion_element_tipo, $resolve_references=true ) {

		$response = new stdClass();
			$response->result = false;
			$response->msg    = '';

		$ar_tables = self::get_diffusion_element_tables_map( $diffusion_element_tipo );
			#dump($ar_tables, ' ar_tables ++ '.to_string($diffusion_element_tipo)); die();
		foreach ((array)$ar_tables as $section_tipo => $value_obj) {			

			if ($section_tipo=='thesaurus') {
				
				# Thesaurus tables
				$ar_prefix = (array)$value_obj->thesaurus_ar_prefix;				
				foreach ((array)$ar_prefix as $prefix) {							
					$options 	= new stdClass();
						$options->section_tipo  		 = $prefix;
						$options->diffusion_element_tipo = $diffusion_element_tipo;
							#dump($options, ' options ++ '.to_string()); die();
	
					$result = $this->update_thesaurus( $options );
				}//end foreach ($ar_prefix as $prefix) {
				
			}else{				
				
				# All section records
				$ar_all_records = section::get_ar_all_section_records_unfiltered($section_tipo);
					#dump($ar_all_records, ' $ar_all_records ++ '.to_string($section_tipo)); #die();

				foreach ((array)$ar_all_records as $current_record_section_id) {
					$options = new stdClass();
						$options->section_tipo 			 = $section_tipo;
						$options->section_id    		 = $current_record_section_id;
						$options->diffusion_element_tipo = $diffusion_element_tipo;							
					
					$result = $this->update_record( $options, $resolve_references=true );

					$response->msg .= isset($result->msg) ? "<br>".$result->msg : '';
				}//end foreach ((array)$ar_all_records as $current_record_section_id) {							
			}

			// let GC do the memory job
			time_nanosleep(0, 10000000); // 10 ms
		}

		return (object)$response;
	}#end diffusion_complete_dump



	/**
	* DELETE_SQL_RECORD
	* @return bool
	*/
	public static function delete_sql_record($section_id, $database_name, $table_name) {

		switch ( get_called_class() ) {
			case 'diffusion_mysql':
				if( diffusion_mysql::table_exits($database_name, $table_name) ) {
					$response = diffusion_mysql::delete_sql_record($section_id, $database_name, $table_name);
					if ($response->result===true) {
						debug_log(__METHOD__." MySQL record is deleted (publication=no) $response->msg ", logger::DEBUG);
					}					
					return $response->result;
				}				
				break;
			
			default:
				debug_log(__METHOD__." Sorry, this delete method is not defined yet. Nothing is deleted in current called_class ".to_string(get_called_class()), logger::DEBUG);
				break;
		}

		return false;		
	}#end delete_sql_record



	/**
	* GET_COMPONENT_PUBLICATION_TIPO
	* @return 
	*/
	public static function get_component_publication_tipo($ar_fields_tipo) {
		
		$component_publication_tipo = false;

		foreach ($ar_fields_tipo as $curent_children_tipo) {

			$ar_related = common::get_ar_related_by_model('component_publication', $curent_children_tipo);
				#dump($component_publication, ' component_publication ++ '.to_string($curent_children_tipo));

			if (!empty($ar_related)) {
				$component_publication_tipo = reset($ar_related);
				break;
			}
		}

		return $component_publication_tipo;
	}#end get_component_publication_tipo



	/**
	* GET_COMPONENT_PUBLICATION_bool_VALUE
	* @return 
	*/
	public static function get_component_publication_bool_value( $component_publication_tipo, $section_id, $section_tipo ) {													
			
		$component_publication = component_common::get_instance( 'component_publication',
																  $component_publication_tipo,
																  $section_id,
																  'list',
																  DEDALO_DATA_NOLAN,
																  $section_tipo);
		$dato = $component_publication->get_dato();
			#dump($dato, ' dato ++ '.to_string());

		if (isset($dato[0]->section_tipo) && $dato[0]->section_tipo == DEDALO_SECTION_SI_NO_TIPO && 
			isset($dato[0]->section_id) && $dato[0]->section_id == NUMERICAL_MATRIX_VALUE_YES) {
			return true;
		}		

		return false;		
	}#end get_component_publication_bool_value



	


	


}
?>