<?php
// Loads parent class diffusion
include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.diffusion.php');
/*
* CLASS DIFFUSION_SQL
*/
class diffusion_sql extends diffusion  {

	public static $database_name;
	public static $database_tipo;
	public static $ar_table;
	public static $ar_table_data;


	/**
	* CONSTRUCT
	* @param object $options . Default null
	*/
	function __construct($options=null) {

		parent::__construct($options=null);
	}//end __construct



	/**
	* GET_DB_SCHEMA
	* Simply Exec self::build_table_columns for every table in structure
	* @param string $database_tipo like 'dd521'
	*//*
	public function get_db_schema($database_tipo) {

		# DEFAULT CASE
		# table in first level
		$ar_diffusion_table = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_tipo, $modelo_name=array('table'), $relation_type='children', $search_exact=true);

			# Recorremos hijos de la primera/as tabla/s
			foreach ($ar_diffusion_table as $key => $current_table_tipo) {

				if(SHOW_DEBUG===true) {

					# Table verify
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_table_tipo,true);
					if ($modelo_name==='section') {

						$ar_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_table_tipo, 'section', 'termino_relacionado', true);
						#dump($ar_section,'ar_section : '.$database_tipo);

						if(empty($ar_section)) {
							debug_log(__METHOD__." Current diffusion table ($current_table_tipo) is excluded from diffusion data because don't have related 'section'. Please fix this ASAP ".to_string(), logger::WARNING);
							continue;
						}
					}
				}
				# Exec build_table_columns for each table
				$result = self::build_table_columns($current_table_tipo, $database_tipo);
				#dump($result, ' result ++ '.to_string());
			}

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
	}//end get_db_schema*/



	/**
	* BUILD_TABLE_COLUMNS (RECURSIVE)
	* Construye los campos para introducir en la tabla a generar
	* Asigna el resultado recursivamente a la variable estática self::$ar_table
	* @param string $table_tipo
	* @param string $database_tipo
	*/
	public static function build_table_columns( $request_options ) {

		$options = new stdClass();
			$options->table_tipo 		= null;
			$options->table_name 		= null;
			$options->database_name 	= null;
			$options->ar_childrens_tipo = null;
			$options->table_from_alias 	= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		foreach ($options as $var_name => $value) {
			$$var_name = $value;
		}


		$ar_table_data=array();


		$ar_table_data['database_name']	= $database_name;	//self::$database_name;
		$ar_table_data['table_name']	= $table_name;		//RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
		$ar_table_data['ar_fields'] 	= array();


		# Table propiedades SCHEMA optional
		# $RecordObj_dd 	  = new RecordObj_dd($table_tipo);
		# $str_propiedades  = $RecordObj_dd->get_propiedades();
		# if($propiedades = json_decode($str_propiedades)) {
		# 	if (isset($propiedades->schema)) {
		# 		self::save_table_schema(  $database_name, $table_name, $propiedades->schema );
		# 	}
		# }

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
		#$RecordObj_dd 	= new RecordObj_dd($table_tipo);
		#$ar_children 	= $RecordObj_dd->get_ar_childrens_of_this();
		$ar_table_children = $ar_childrens_tipo;
		if (empty($ar_table_children)) {
			$RecordObj_dd 	   = new RecordObj_dd($table_tipo);
			$ar_table_children = $RecordObj_dd->get_ar_childrens_of_this();

			# Add from table alias too
			if (!empty($table_from_alias)) {
				$RecordObj_dd_alias 	 = new RecordObj_dd($table_from_alias);
				$ar_table_alias_children = (array)$RecordObj_dd_alias->get_ar_childrens_of_this();
				# Merge all
				$ar_table_children = array_merge($ar_table_children, $ar_table_alias_children);
			}
		}
		#dump($ar_table_children, ' ar_table_children ++ '.to_string($table_tipo));


		foreach ($ar_table_children as $curent_children_tipo) {

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($curent_children_tipo,true);

			if ($modelo_name==='box elements') {
				continue;
			}

			switch ($modelo_name) {
				/*
				case 'table': // ESTO SE USA ????????
					#
					# TABLE
					$options = new stdClass();
						$options->typology 	= 'relation';
						$options->tipo 		= $curent_children_tipo;
					$ar_table_data['ar_fields'][] = self::create_field( $options );

					# Recursion (portal)
					$table_columns_options = new stdClass();
						$table_columns_options->table_tipo 	  	 = $curent_children_tipo;
						$table_columns_options->database_name 	 = $database_name;
						$table_columns_options->table_from_alias = $table_from_alias;
					self::build_table_columns($table_columns_options);
					break;*/

				default:
					#
					# FIELD
					$RecordObj_dd 	= new RecordObj_dd($curent_children_tipo);
					$propiedades 	= json_decode($RecordObj_dd->get_propiedades());
						#dump($propiedades, ' propiedades');

					switch (true) {
						case ( is_object($propiedades) && property_exists($propiedades, 'exclude_column') && $propiedades->exclude_column===true ):
							# Exclude this column of table
							break;
						case ( is_object($propiedades) && property_exists($propiedades, 'ts_map') ):
							# CASE TS_MAP IS DEFINED
							$options = new stdClass();
								$options->ts_map 				= $propiedades->ts_map;
								if(property_exists($propiedades, 'ts_map_prefix')){
										$options->ts_map_prefix 				= $propiedades->ts_map_prefix;
									}else{
										$options->ts_map_prefix 				= false;
									}
								$options->curent_children_tipo  = $curent_children_tipo;
								$options->request  				= 'columns';

							// (!) Removed way.
								/*
								$ar_dedalo_countries = (array)self::get_ar_dedalo_countries($options);
								foreach ($ar_dedalo_countries as $current_dedalo_country) {
									$ar_column_data=array();
									$ar_column_data['field_name']  		= (string)$current_dedalo_country;
									$ar_column_data['field_type']  		= (string)'field_text';
									$ar_column_data['field_coment'] 	= (string)'Autocreated column for country compatibility';
									$ar_column_data['field_options'] 	= (string)' ';
									$ar_table_data['ar_fields'][] 		= $ar_column_data;	# Add column
									#error_log("Add column field_name:$current_dedalo_country - field_type:field_text, - field_coment:Autocreated column for country compatibility - field_options:'' ");
								}*/
							break;
						default:
							# DEFAULT CASE
							$options = new stdClass();
								$options->typology 	= 'default';
								$options->tipo 		= $curent_children_tipo;
							$ar_table_data['ar_fields'][] = self::create_field( $options );
							break;
					}//end switch (true)
					break;
			}//end switch modelo_name

		}//end foreach ($ar_table_children as $curent_children_tipo)
		#dump($ar_table_data, ' ar_table_data'); die();


		return $ar_table_data;
	}//end build_table_columns



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
						if(SHOW_DEBUG===true) {
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
					case 'field_varchar':
						if(isset($propiedades->varchar)) {
							$field_options = $propiedades->varchar; # Default 255
						}else{
							$field_options = '255';
						}
						$ar_field_data['field_options'] = $field_options; # Format: "varchar":8
						break;
					case 'field_int':
						if(isset($propiedades->length)) {
							$field_options = $propiedades->length;
						}else{
							$field_options = 8; # Default
						}
						$ar_field_data['field_options']	= $field_options;
						break;
					case 'decimal':
						if(isset($propiedades->precision) && isset($propiedades->scale)) {
							$field_options = $propiedades->precision .','. $propiedades->scale;
						}else{
							$field_options = '10,0'; # Default
						}
						$ar_field_data['field_options']	= $field_options;
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
	}//end create_field



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
	public static function build_table_columns_data( stdClass $request_options ) {

		// options
			$options = new stdClass();
				$options->table_tipo 			 	 = null;
				$options->ar_section_id_portal 	 	 = array();
				$options->database_name 		 	 = null;
				$options->table_name 		 	 	 = null;
				$options->table_propiedades 	 	 = null;
				$options->table_from_alias 	 	 	 = null;
				$options->ar_result 			 	 = false;
				$options->diffusion_element_tipo 	 = null;
				$options->ar_childrens_tipo 	 	 = null;
				$options->component_publication_tipo = null;
				$options->build_mode 				 = 'default';
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

				foreach ($options as $var_name => $value) {
					$$var_name = $value; // move options var to self var
				}

		if(SHOW_DEBUG===true) {
			#dump($options, ' options ++ '.to_string());
			#dump($table_tipo, ' table_tipo ++ ');
			#dump($ar_section_id_portal, ' ar_section_id_portal ++ ');
			#dump($database_name, ' database_name ++ ');
			#dump($ar_result, ' ar_result ++ ');
			#dump($diffusion_element_tipo, " diffusion_element_tipo ++ (".RecordObj_dd::get_termino_by_tipo($table_tipo).")");
			  #dump($ar_section_id_portal,"ar_section_id_portal - table_tipo: $table_tipo (".RecordObj_dd::get_termino_by_tipo($table_tipo).") - database_name: $database_name (".RecordObj_dd::get_termino_by_tipo($database_name).") "); #die();
			#exit();
		}

		set_time_limit ( 259200 );  // 3 dias


		# AR_RESULT . Get all matrix records in current table / portal. When portal is request, records of portal are in var '$ar_section_id_portal'
		# NOTE : Because we need section_id and section_tipo of every item (multi-target portals), format $ar_result contains this data always
			if ($ar_result===false) {

				// SECTION try . Target section is a related term of current diffusion pointer. Normally is section, but can be a portal
					$pointer_type='section';
					$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, 'section', 'termino_relacionado');
					if (!isset($ar_section_tipo[0])) {
						# PORTAL try
						$pointer_type='portal';
						$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($table_tipo, 'component_portal', 'termino_relacionado');
					}
					if(!isset($ar_section_tipo[0])) {
						debug_log(__METHOD__." Error Processing Request, related section_tipo not found for $table_tipo. Please define valid related term (section or portal) for pointer table_tipo:$table_tipo (Ignored element $table_tipo!)", logger::ERROR);
						return false;
					}

				// SECTION_TIPO . Set section tipo
					$section_tipo = $ar_section_tipo[0];

				$ar_result = array();
				if(!empty($ar_section_id_portal)) {
					# Records here are the portal dato locators
					# $ar_result	= $ar_section_id_portal;
					foreach ($ar_section_id_portal as $key => $object) {
						// Override section_tipo for each element
						$ar_result[] = array($object->section_tipo => $object->section_id);
					}
				}else{
					# Buscamos TODOS los registros de esta sección
					$result = section::get_resource_all_section_records_unfiltered($section_tipo);
					while ($rows = pg_fetch_assoc($result)) {
						$current_id = $rows['section_id'];
						// Use general section_tipo for each element
						$ar_result[] = array($section_tipo => $current_id);
					}
				}
			}
			#dump($ar_section_id_portal, ' ar_section_id_portal ++ '.to_string());
			#dump($ar_result," ar_result section_tipo:$section_tipo - table_tipo:$table_tipo - ar_section_id_portal:".to_string($ar_section_id_portal)); die();

		# LANGS . From config
			if (defined('DEDALO_DIFFUSION_LANGS')) {
				$ar_all_project_langs = unserialize(DEDALO_DIFFUSION_LANGS);
			}else{
				$ar_all_project_langs = unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
			}


		# AR_FIELD_DATA
		$ar_field_data = array();
		$ar_field_data['database_name']	= (string)$database_name;
		$ar_field_data['table_name'] 	= (string)$table_name;
		#$ar_field_data['ar_fields'] 	= array();
			#dump($ar_field_data['table_name'], ' table_name ++ '.to_string());
			#dump(debug_backtrace() , 'debug_backtrace()  ++ '.to_string());

		#
		# TABLE CHILDREN (FIELDS)
			$ar_table_children = $ar_childrens_tipo;
			if (empty($ar_table_children)) {
				$RecordObj_dd 	   = new RecordObj_dd($table_tipo);
				$ar_table_children = $RecordObj_dd->get_ar_childrens_of_this();

				# Add from table alias too
				if (!empty($table_from_alias)) {
					$RecordObj_dd_alias 	 = new RecordObj_dd($table_from_alias);
					$ar_table_alias_children = (array)$RecordObj_dd_alias->get_ar_childrens_of_this();
					# Merge all
					$ar_table_children = array_merge($ar_table_children, $ar_table_alias_children);
				}
			}
			#dump($ar_table_children, ' ar_table_children ++ '.to_string($table_tipo));

		#
		# COMPONENT PUBLICATION - CHECK (once)
			if(empty($component_publication_tipo)) {
				$component_publication_tipo = diffusion::get_component_publication_tipo($ar_table_children);
				#dump($component_publication_tipo, ' component_publication_tipo ++ ar_table_children: '.to_string($ar_table_children));
				if (empty($component_publication_tipo)) {
					if(SHOW_DEBUG===true) {
						#dump($component_publication_tipo, ' component_publication_tipo ++ '.to_string($ar_table_children));
					}
					#trigger_error("Error on find component_publication_tipo. Not found component_publication for section_tipo: $section_tipo. Ignored");
					debug_log(__METHOD__." Error on find component_publication_tipo. Not found component_publication for table_tipo: $table_tipo. Ignored! table_name:".$ar_field_data['table_name'], logger::ERROR);
					return false;
				}
			}


		#
		# RESOLVED RECORDS
		# Store resolved records to avoid infinite loops
			static $resolved_records;


		#
		# RECORDS
		$ar_data=array();
		$i=0;
		$ar_portal_records=array();
		$skip_publication_state_check = isset($_SESSION['dedalo4']['config']['skip_publication_state_check']) ? isset($_SESSION['dedalo4']['config']['skip_publication_state_check']) : 0;
		# Records iteration
		if(!empty($ar_result)) foreach ((array)$ar_result as $records) foreach ($records as $section_tipo => $current_section_id) {	# iteramos por registros
			#dump($current_section_id, ' current_section_id ++ '.to_string());

			# test
			#$current_section_id=1;
			#$ar_all_project_langs = array('lg-lvca'); //ONLY ONE NOW FOR TEST

			# RESOLVED_RECORDS_KEY
			$resolved_records_key = $section_tipo.'-'.$current_section_id.'-'.$build_mode;
			if (in_array($resolved_records_key, (array)$resolved_records)) {
				debug_log(__METHOD__." SKIPPED RECORD [$resolved_records_key]. ALREADY RESOLVED. ".to_string(), logger::WARNING);
				continue;
			}

			#
			# SECTION DIFFUSION INFO - CHECK
			# On finish record update, update current section diffusion_info
			$section 		= section::get_instance($current_section_id, $section_tipo, $modo='list', false);
			$diffusion_info = $section->get_diffusion_info();
			if ( isset($diffusion_info->$diffusion_element_tipo) ) {

				if($skip_publication_state_check==1) {
					# Nothing to do. (Configurated from tool_administrator)
				}else{
					# RESOLVED_RECORDS (set a resolved)
					$resolved_records[] = $resolved_records_key;

					debug_log(__METHOD__." Skipped current record [{$section_tipo}-{$current_section_id}]. Already published ($diffusion_element_tipo). ".to_string(), logger::DEBUG);
					continue;
				}
			}


			#
			# COMPONENT PUBLICATION - CHECK (once)
			/*
			$component_publication_bool_value = (bool)diffusion::get_component_publication_bool_value($component_publication_tipo, $current_section_id, $section_tipo);
				#dump($component_publication_bool_value, ' component_publication_bool_value ++ '.to_string());
				if ($component_publication_bool_value===false) {
					# Skip this record
					diffusion_sql::delete_sql_record($current_section_id, $ar_field_data['database_name'], $ar_field_data['table_name']);
					debug_log(__METHOD__." Skipped (and mysql deleted) record $current_section_id ".$ar_field_data['table_name']." (publication=no)", logger::DEBUG);

					$section->diffusion_info_add($diffusion_element_tipo);
					$section->Save();
					debug_log(__METHOD__." Added current diffusion_element_tipo $diffusion_element_tipo to data. Section diffusion_info updated and saved [{$section_tipo}-{$current_section_id}]. ".to_string(), logger::DEBUG);

					# Cascade delete
					# dump( json_decode($table_propiedades), ' table_propiedades ++ '.to_string());
					if (isset($table_propiedades->cascade_delete)) {
						foreach ((array)$table_propiedades->cascade_delete as $tkey => $tvalue) {
							$cd_table_name = $tvalue->table;
							diffusion_sql::delete_sql_record($current_section_id, $ar_field_data['database_name'], $cd_table_name);
							debug_log(__METHOD__." Deleted (cascade_delete) record $current_section_id ".$cd_table_name." ", logger::DEBUG);
						}
					}

					# RESOLVED_RECORDS (set a resolved)
					$resolved_records[] = $resolved_records_key;

					continue;
				}
				*/
				# new mode
				$p_options = new stdClass();
					$p_options->component_publication_tipo  = $component_publication_tipo;
					$p_options->section_id 				 	= $current_section_id;
					$p_options->section_tipo 				= $section_tipo;
					$p_options->database_name 			 	= $database_name;
					$p_options->table_name 			 	 	= $table_name;
					$p_options->diffusion_element_tipo  	= $diffusion_element_tipo;
					$p_options->table_propiedades  	 	 	= $table_propiedades;

				if (is_object($table_propiedades) && property_exists($table_propiedades,'check_publication_value') && $table_propiedades->check_publication_value===false) {
					# Skip check_publication_value. Always is publicated (5-2-2018)
					$to_publish = true;
				}else{
					$to_publish = diffusion_sql::check_publication_value($p_options);
				}
				if ($to_publish===false) {
					# RESOLVED_RECORDS (set a resolved)
					$resolved_records[] = $resolved_records_key;
					continue;
				}


			#
			# LANGS ITERATION
			foreach ($ar_all_project_langs as $current_lang) {	# iterate by lang

				#
				# SECTION_ID . Mandatory column . Add field section_id to table data
				# COLUMN ADD ###################################################
				$section_id_options = new stdClass();
					$section_id_options->typology 				= 'section';
					$section_id_options->value 					= $current_section_id;
					$section_id_options->diffusion_element_tipo = $diffusion_element_tipo;
				$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::build_data_field( $section_id_options );
				#$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::create_data_field($pointer_section_tipo, $current_section_id, true);

				#
				# LANG . Mandatory column. Add field lang to table data
				# COLUMN ADD ###################################################
				$lg_options = new stdClass();
					$lg_options->typology 				= 'lang';
					$lg_options->value 					= $current_lang;
					$lg_options->diffusion_element_tipo = $diffusion_element_tipo;
				$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::build_data_field( $lg_options );
				#$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = self::create_data_field('lang',$current_lang);

				#
				# COLUMNS . Normal table columns / fields
				# NORMAL COLUMNS ITERATE ###################################################
				foreach ((array)$ar_table_children as $curent_children_tipo) {

					# Obtenemos el modelo de los hijos de la tabla para identificar los campos y las tablas relacionadas
					$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($curent_children_tipo,true);
					if ($modelo_name==='box elements') {
						continue;
					}

					# Si el modelo es "field" es un campo directo
					# Si el modelo es "tabla" es un puntero a un portal, se convertirá este hijo en un campo que relacionará las dos tablas
					#switch (true) {
						/*
						case ($modelo_name==='table9999') : # Pointer to portal case

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
						*/
						#default: # Normal field case

							$RecordObj_dd 	= new RecordObj_dd($curent_children_tipo);
							$propiedades 	= json_decode($RecordObj_dd->get_propiedades());
								#dump($propiedades, ' propiedades '.$modelo_name );

							switch (true) { # DISCRIMINE BY PROPIEDADES
								case ( is_object($propiedades) && property_exists($propiedades, 'exclude_column') && $propiedades->exclude_column===true ):
									# Exclude this column of table
									break;

								case ( is_object($propiedades) && property_exists($propiedades, 'ts_map') ):
									#
									# TS MAP
									$ts_map_options = new stdClass();
										$ts_map_options->ts_map 				= $propiedades->ts_map;
										if(property_exists($propiedades, 'ts_map_prefix')){
											$ts_map_options->ts_map_prefix 		= $propiedades->ts_map_prefix;
										}else{
											$ts_map_options->ts_map_prefix 		= false;
										}
										$ts_map_options->curent_children_tipo  	= $curent_children_tipo;
										$ts_map_options->request  				= 'fields';
										$ts_map_options->parent  				= $current_section_id;
										$ts_map_options->lang  					= $current_lang;

									// (!) Removed way.
										/*
										$ar_dedalo_countries = (array)self::get_ar_dedalo_countries($ts_map_options);
											#dump($ar_dedalo_countries, ' ar_dedalo_countries');

										foreach ($ar_dedalo_countries as $current_dedalo_country => $current_value) {
											$current_ts_map_ar_field_data=array();
											$current_ts_map_ar_field_data['field_name']  = (string)$current_dedalo_country;
											$current_ts_map_ar_field_data['field_value'] = (string)$current_value;

											# COLUMN ADD ###################################################
											$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $current_ts_map_ar_field_data;	# Add field
											#error_log("Added field field_name:$current_dedalo_country - field_value:$current_value");
										}*/
									break;

								case ( is_object($propiedades) && property_exists($propiedades, 'table') ): # AUTOCOMPLETE COLUMN TABLE
									# TABLE NAME COLUMN
									# Usada para alojar el nombre de la tabla a que apunta el id del del dato del autocomplete actual (se guardan 3 columnas: name_id,name_table,name_label)
									$current_ar_field_data=array();
									$current_ar_field_data['field_name']  = RecordObj_dd::get_termino_by_tipo($curent_children_tipo, DEDALO_STRUCTURE_LANG, true, false);
									$current_ar_field_data['field_value'] = $propiedades->table;

									# COLUMN ADD ###################################################
									$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $current_ar_field_data;
									break;

								default:
									# DEFAULT CASE . DIRECT FIELD
									# COLUMN ADD ###################################################
									$default_options = new stdClass();
										$default_options->tipo 					 = $curent_children_tipo;
										$default_options->parent 				 = $current_section_id;
										$default_options->lang 					 = $current_lang;
										$default_options->section_tipo 			 = $section_tipo;	//$lang_target_section_tipo;
										$default_options->caler_id 				 = 3;
										$default_options->propiedades 			 = $propiedades;
										$default_options->diffusion_element_tipo = $diffusion_element_tipo;
									$column = self::build_data_field( $default_options );
									#$column = self::create_data_field($curent_children_tipo, false, false, $current_section_id, $current_lang, false, $pointer_section_tipo); //$tipo, $value, $is_section_id=false, $parent=null, $lang=null, $is_portal=false, $section_tipo=null
										#dump($column, ' column - curent_children_tipo: '.$curent_children_tipo);

									// related text area case (set for indexations publish)
										if ($column['related_model']==='component_text_area') {

											$options_item = new stdClass();
												$options_item->component_tipo 		  = $column['related_term'];
												$options_item->section_tipo 		  = $section_tipo;
												$options_item->section_id 			  = $current_section_id;
												$options_item->lang 				  = $current_lang;
												$options_item->model 				  = $column['related_model'];
												$options_item->diffusion_element_tipo = $diffusion_element_tipo;
												#$options_item->diffusion_element_tipo2 = $options->diffusion_element_tipo;
												#dump($options_item, ' options_item ++ '.to_string());
											diffusion::add_to_update_record_actions($options_item);
												#dump(diffusion::$update_record_actions, 'diffusion::$update_record_actions ++ '.to_string());
										}


									$ar_field_data['ar_fields'][$current_section_id][$current_lang][] = $column;
									break;
							}//end switch (true) { # DISCRIMINE BY PROPIEDADES
					#}//end modelo_name switch

				}//end foreach ($ar_table_children as $curent_children_tipo)
			#break; //ONLY ONE NOW FOR TEST

			$i++; # fin primera iteración registro/idioma
			}//end foreach ($ar_all_project_langs as $current_lang)
			#dump($ar_data, ' ar_data '.$table_tipo);


			#
			# SECTION DIFFUSION INFO - ADD
			# On finish record update, uppdate current section diffusion_info
			#$section = section::get_instance($current_section_id, $section_tipo, $modo='list');
			#$diffusion_info = $section->get_diffusion_info(); dump($diffusion_info, ' diffusion_info ++ '.to_string());
			if ($build_mode==='default') {
				$section->diffusion_info_add($diffusion_element_tipo);
				$section->save_modified = false;
				$section->Save();
				debug_log(__METHOD__." Added current diffusion_element_tipo $diffusion_element_tipo to data. Section diffusion_info updated and saved [{$section_tipo}-{$current_section_id}]. ".to_string(), logger::DEBUG);
			}

			# RESOLVED_RECORDS
			$resolved_records[] = $resolved_records_key;

			// let GC do the memory job
			// time_nanosleep(0, 10000000); // 50 ms
			# Forces collection of any existing garbage cycles
			gc_collect_cycles();

		}//end foreach ($ar_result as $current_section_id) end itearation of records
		#self::build_table_columns_data($section_tipo, $ar_portal_section_id_unique, $database_name, false, $diffusion_element_tipo);
		#dump($ar_field_data, ' ar_field_data ++ '.to_string());

		// exec cue update_record_actions
			if (!empty(diffusion::$update_record_actions)) {
				#dump(diffusion::$update_record_actions, 'diffusion::$update_record_actions ++ '.to_string());
				debug_log(__METHOD__." Executing update_record_actions ".to_string(diffusion::$update_record_actions), logger::DEBUG);
				foreach (diffusion::$update_record_actions as $ckey => $current_update_record_options) {

					// clone options
						$current_update_record_options_clone = clone $current_update_record_options;

					// Remove from array to avoid infinity loop
						unset(diffusion::$update_record_actions[$ckey]);

					// exec call to update_record
						$diffusion_sql = new diffusion_sql();
						$diffusion_sql->update_record($current_update_record_options_clone);
				}
			}


		# ASIGN VAR (If not empty ar_fields)
		# After iterate all records and create the current section array fields, set to static class var (self::$ar_table_data)
		if (!empty($ar_field_data['ar_fields'])) {
			#self::$ar_table_data[$database_name][$table_tipo] = $ar_field_data; // Fix in class static var if not empty
			#
			return $ar_field_data;
		}else{
			return null;
		}
		# PORTAL RECORDS TOTALS
		# After iterate all records, we have now the portal records totals (organized by portal_tipo )
		# Iterate all portals and build every table_data of this portals
		# dump($ar_portal_records, ' $ar_portal_records');
		#foreach ((array)$ar_portal_records as $portal_tipo => $portal_records) {
		#	$portal_records = self::clean_duplicates( $portal_records );
		#	self::build_table_columns_data($portal_tipo, $portal_records, $database_name, false, $diffusion_element_tipo);
		#}
	}//end build_table_columns_data



	/**
	* CHECK_PUBLICATION_VALUE
	* @return bool
	*/
	public static function check_publication_value( $request_options ) {

		$to_publish = true;

		$options = new stdClass();
			$options->component_publication_tipo = null;
			$options->section_id 				 = null;
			$options->section_tipo 				 = null;
			$options->database_name 			 = null;
			$options->table_name 			 	 = null;
			$options->diffusion_element_tipo  	 = null;
			$options->table_propiedades  	 	 = null;
			$options->delete_previous  	 	 	 = true;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# Resolve table alias name
		$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $options->diffusion_element_tipo );
		$section_tipo = $options->section_tipo;
		if (isset($diffusion_element_tables_map->{$section_tipo}->from_alias)) {
			$options->table_name  = $diffusion_element_tables_map->{$section_tipo}->name;
		}

		#
		# COMPONENT PUBLICATION - CHECK (once)
		$component_publication_bool_value = (bool)diffusion::get_component_publication_bool_value($options->component_publication_tipo, $options->section_id, $options->section_tipo);

		if ($component_publication_bool_value===false) {
			# Delete this record
			if ($options->delete_previous===true) {
				diffusion_sql::delete_sql_record($options->section_id, $options->database_name, $options->table_name, $options->section_tipo);
				debug_log(__METHOD__." Skipped (and mysql deleted) record $options->section_id ".$options->table_name." (publication=no)", logger::DEBUG);

				// Global search case
					if (isset($options->table_propiedades->global_search_map)) {
						# exists search global table (mdcat fix)
						diffusion_sql::delete_sql_record($options->section_id, $options->database_name, 'global_search', $options->section_tipo);
						debug_log(__METHOD__." Deleted global_search record {$options->section_tipo}_{$options->section_id} (publication=no)", logger::DEBUG);
					}
			}

			$section = section::get_instance($options->section_id, $options->section_tipo, $modo='list', false);
			$section->diffusion_info_add($options->diffusion_element_tipo);
			$section->save_modified = false;
			$section->Save();
			debug_log(__METHOD__." Added current diffusion_element_tipo $options->diffusion_element_tipo to data. Section diffusion_info updated and saved [{$options->section_tipo}-{$options->section_id}]. ".to_string(), logger::DEBUG);

			# Cascade delete
			# dump( json_decode($options->table_propiedades), ' options->table_propiedades ++ '.to_string());
			if ($options->delete_previous===true && isset($options->table_propiedades->cascade_delete)) {
				foreach ((array)$options->table_propiedades->cascade_delete as $tkey => $tvalue) {
					$cd_table_name = $tvalue->table;
					diffusion_sql::delete_sql_record($options->section_id, $options->database_name, $cd_table_name, $options->section_tipo);
					debug_log(__METHOD__." Deleted (cascade_delete) record $options->section_id ".$cd_table_name." ", logger::DEBUG);
				}
			}

			# RESOLVED_RECORDS (set a resolved)
			#$resolved_records[] = $resolved_records_key;

			#continue;
			$to_publish = false;
		}


		return (bool)$to_publish;
	}//end check_publication_value



	/**
	* BUILD_DATA_FIELD
	* Build normalized field data array with field_name and field_value. This is the table column data for this element
	* Portal elements are trated as special pseudo-sections with pointers to other tables
	* @param object stdClass $request_options
	* @return array $ar_field_data
	*/
	public static function build_data_field( stdClass $request_options ) {

		# Defaults
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
			$options->diffusion_element_tipo = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		# FIXED FIELDS
		switch ($options->typology) {

			case 'section': # Fix column section_id
				$ar_field_data['field_name'] 	= 'section_id';
				$ar_field_data['field_value'] 	= $options->value;
				$ar_field_data['tipo'] 			= null;
				$ar_field_data['related_model'] = null;
				break;

			case 'lang': # Especial case, constructs a column with current lang value
				$ar_field_data['field_name'] 	= 'lang';
				$ar_field_data['field_value'] 	= $options->value;
				$ar_field_data['tipo'] 			= null;
				$ar_field_data['related_model'] = null;
				break;

			default:

				$ar_field_data['field_name'] 	= RecordObj_dd::get_termino_by_tipo($options->tipo, DEDALO_STRUCTURE_LANG, true, false);
				$ar_field_data['field_value'] 	= (string)'';
				$ar_field_data['tipo'] 			= $options->tipo;

				#
				# Diffusion element
				$diffusion_term = new RecordObj_dd($options->tipo);
				$propiedades 	= $diffusion_term->get_propiedades(true);	# Format: {"data_to_be_used": "dato"}

				#
				# Component target
				$ar_terminos_relacionados 		= RecordObj_dd::get_ar_terminos_relacionados($options->tipo, false, true);
				if (empty($ar_terminos_relacionados)) {
					throw new Exception("Error Processing Request. Empty mandatory structure related term for tipo: ".$options->tipo.' ('.$ar_field_data['field_name'].')', 1);
				}
				$termino_relacionado 			= reset($ar_terminos_relacionados);
				$modelo_name 					= RecordObj_dd::get_modelo_name_by_tipo($termino_relacionado,true);

				// related term info
					$ar_field_data['related_term']  = $termino_relacionado;
					$ar_field_data['related_model'] = $modelo_name;

				// component
					$current_component	= component_common::get_instance($modelo_name,
																		 $termino_relacionado,
																		 $options->parent,
																		 'list', // Note that list have dato fallback (in section)
																		 $options->lang,
																		 $options->section_tipo,
																		 false);

				if(is_object($propiedades) && property_exists($propiedades, 'get_field_value') && isset($propiedades->get_field_value->get_dato_method)){

					$get_dato_method = $propiedades->get_field_value->get_dato_method;
						#dump($get_dato_method, ' get_dato_method ++ '.to_string());
					$dato = $current_component->{$get_dato_method}();
						#dump($dato, ' dato ++ '.to_string($modelo_name).' - '.$get_dato_method);
				}else{
					$dato = $current_component->get_dato();
				}

				$diffusion_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true);


				# Fix diffusion element propiedades on target component to enable configure response value
				$current_component->set_diffusion_properties($propiedades);

				# switch cases
				switch (true) {
					case (is_object($propiedades) && property_exists($propiedades, 'data_to_be_used') && $propiedades->data_to_be_used==='dato'):
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
								if(SHOW_DEBUG===true) {
									#dump($dato," dato"); #dump($propiedades->enum," dato");
									if (!property_exists($propiedades, 'enum')) {
										throw new Exception("Error Processing Request. Field enum $tipo is misconfigurated. Please, set property 'enum' to current field", 1);
									}
								}
								$ar_field_data['field_value'] = (string)$propiedades->enum->$dato;		# Format: "enum":{"1":"si", "2":"no"}
								break;
							default:
								if (is_array($dato)) {
									$ar_id = array();
									foreach ($dato as $current_locator) {

										// Check target is publicable
											$current_is_publicable = diffusion::get_is_publicable($current_locator);
											if ($current_is_publicable!==true) {
												debug_log(__METHOD__." + Skipped locator not publicable: ".json_encode($current_locator), logger::WARNING);
												continue;
											}

										$ar_id[] = $current_locator->section_id;
									}
									$dato = $ar_id;
								}
								$ar_field_data['field_value'] = $dato;
								break;
						}//end switch ($diffusion_modelo_name)
						break;

					case (is_object($propiedades) && property_exists($propiedades, 'process_dato')):
						# Process dato with function
						$function_name = $propiedades->process_dato;
						$ar_field_data['field_value'] = call_user_func($function_name, $options, $dato);
						break;

					case (is_object($propiedades) && property_exists($propiedades, 'data_to_be_used') && $propiedades->data_to_be_used==='ds'):
						foreach ((array)$dato as $current_locator) {
							if (isset($current_locator->ds)) {
								foreach ($current_locator->ds as $key => $ar_locator_ds) {
									foreach ($ar_locator_ds  as $locator_ds) {
										$ar_term_ds[] = ts_object::get_term_by_locator( $locator_ds, $options->lang, $from_cache=true );
									}
								}
							}
						}
						if (!empty($ar_term_ds)) {
							$ar_field_data['field_value'] = implode('|', $ar_term_ds);
						}
						break;

					case (is_object($propiedades) && property_exists($propiedades, 'data_to_be_used') && $propiedades->data_to_be_used==='dataframe'):
						foreach ((array)$dato as $current_locator) {
							if (isset($current_locator->dataframe)) {
								foreach ($current_locator->dataframe as $key => $locator_dataframe) {
										$ar_term_dataframe[] = ts_object::get_term_by_locator( $locator_dataframe, $options->lang, $from_cache=true );
								}
							}
						}
						if (!empty($ar_term_dataframe)) {
							$ar_field_data['field_value'] = implode('|', $ar_term_dataframe);
						}
						break;

					default:
						# Set unified diffusion value
						$ar_field_data['field_value'] =	$current_component->get_diffusion_value( $options->lang );
							#dump($ar_field_data['field_value'], '1 $ar_field_data[field_value] ++ '.$current_component->get_tipo().' '.$current_component->get_lang());
						# Fallback to main lang
						if (empty($ar_field_data['field_value'])) {
							$main_lang = common::get_main_lang($current_component->get_section_tipo(), $current_component->get_parent());
								#dump($main_lang, ' main_lang ++ $options->lang: '.to_string($options->lang) ." - section_tipo: ".$current_component->get_section_tipo());
							$current_component->set_lang($main_lang);
							$ar_field_data['field_value'] =	$current_component->get_diffusion_value( $main_lang );
								#dump($ar_field_data['field_value'], '2 $ar_field_data[field_value] ++ '.$current_component->get_tipo().' '.$current_component->get_lang());

							# Fallback to ALL langs ... last try
							if (empty($ar_field_data['field_value'])) {
								foreach (common::get_ar_all_langs() as $current_t_lang) {
								 	$current_component->set_lang($current_t_lang);
									$ar_field_data['field_value'] =	$current_component->get_diffusion_value( $current_t_lang );
									if (!empty($ar_field_data['field_value'])) break;
								 }
							}
						}
						#debug_log(__METHOD__." ar_field_datafield_value ".$current_component->get_tipo().' '.to_string( $ar_field_data['field_value'] ), 'DEBUG');
						break;
				}//switch (true) {
				break;

		}//end switch ($options->typology) {

		return (array)$ar_field_data;
	}//end build_data_field



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
		#if(SHOW_DEBUG===true) $start_time = start_time();


		$ar_diffusion_map = array();

		# DIFFUSION STRUCTURE

			# DIFFUSION_DOMAIN : Get structure tipo of current diffuision domain name
			$diffusion_domain = diffusion::get_my_diffusion_domain($this->domain, get_called_class());
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

			}//end foreach ($ar_diffusion_database as $diffusion_section_tipo

		#if(SHOW_DEBUG===true) dump( exec_time($start_time, __METHOD__) );

		# Fix
		$this->ar_diffusion_map = $ar_diffusion_map;
			#dump($this->ar_diffusion_map,"this->ar_diffusion_map ");#die();

		return (array)$this->ar_diffusion_map;
	}//end get_ar_diffusion_map_sql



	/**
	* UPDATE_RECORD
	* Update one or any number of records ( array ) and references
	* @param object $request_options
	* @param bool $resolve_references
	* @return obj $response
	*/
	public function update_record( $request_options, $resolve_references=false ) {

		$start_time = start_time();

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$options = new stdClass();
			$options->section_tipo 			 	 = null;
			$options->section_id   			 	 = null;
			$options->diffusion_element_tipo 	 = null;
			$options->recursion_level 		 	 = 0;
			$options->component_publication_tipo = null; // optional
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
				#dump($options, ' options ++ '.to_string()); #die();
		#
		# Mandatory vars
			if(empty($options->section_tipo) || empty($options->section_id) || empty($options->diffusion_element_tipo)) {
				debug_log(__METHOD__." ERROR ON UPDATE RECORD $options->section_id - $options->section_tipo - $options->diffusion_element_tipo. Undefined mandatory options var".to_string(), logger::ERROR);
				return false;
			}
			# Old code heritage control
			if (is_array($options->section_id)) {
				if(SHOW_DEBUG===true) {
					dump($options->section_id, ' $options->section_id ++ '.to_string());
				}
				throw new Exception("Error Processing Request. Sorry, array is not accepted to update_record anymore. Please use int as options->section_id ", 1);
			}

		#
		# DIFFUSION_ELEMENT_TIPO (structre diffusion_element like oh63 for 'Historia oral web')
			$diffusion_element_tipo = $options->diffusion_element_tipo;

		#
		# TABLE INFO
			$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $diffusion_element_tipo );
			$section_tipo = $options->section_tipo;
			if (!property_exists($diffusion_element_tables_map, $section_tipo)) {
				if(SHOW_DEBUG===true) {
					#dump($options, ' options ++ $resolve_references: '.to_string($resolve_references));
					#dump($diffusion_element_tables_map, ' diffusion_element_tables_map ++ section_tipo: '.to_string($section_tipo));
				}
				debug_log(__METHOD__." ERROR ON UPDATE RECORD[2] section_id: $options->section_id - section_tipo: $options->section_tipo - diffusion_element_tipo: $diffusion_element_tipo. Undefined section_tipo $section_tipo var in diffusion_element_tables_map. PROBABLY THE TARGET TABLE FOR (".RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG).") NOT EXISTS IN SQL. If you want resolve this reference, create a duffusion table for this data ($options->section_tipo) or check mysql tables for problems with table creation. ".to_string(), logger::WARNING);
				return false;
			}
			$table_map			= $diffusion_element_tables_map->{$section_tipo};
			$table_name   		= $table_map->name;
			$table_tipo 		= $table_map->table;
			$table_propiedades 	= $table_map->propiedades;
			$database_name  	= $table_map->database_name;
			$database_tipo  	= $table_map->database_tipo;
			$table_from_alias 	= $table_map->from_alias;

		#
		# DATABASE_NAME . Resolve database_tipo in current diffusion map. Like 'web_aup'
			/*
			if (isset(self::$database_name)) {
				$database_name = self::$database_name;
				$database_tipo = self::$database_tipo;
			}else{
				# DIFFUSION ELEMENT
				$diffusion_element 	= self::get_diffusion_element_from_element_tipo($diffusion_element_tipo);
				$database_name 		= $diffusion_element->database_name;
				if (empty($database_name)) {
					throw new Exception("Error Processing Request. database_name not defined", 1);
				}
				self::$database_name = $database_name; // Set static class var

				$database_tipo = $diffusion_element->database_tipo;
				self::$database_tipo = $database_tipo; // Set static class var
			}*/


		#
		# CUSTOM DIFFUSION PROCESSOR (Defined in propiedades)
			if (isset($table_propiedades->custom_diffusion)) {
				$function_name = $table_propiedades->custom_diffusion;
				$custom_options = clone $options;
					$custom_options->database_name 		= $database_name;
					$custom_options->table_name 		= $table_name;
					$custom_options->table_propiedades 	= $table_propiedades;
				call_user_func($function_name, $custom_options);

				$response->result 	= true;
				$response->msg 		= 'Processing with '.$function_name;

				return $response;
			}


		static $ar_resolved_static;
		static $ar_record_updated;
		static $ar_unconfigured_diffusion_section;
		if(SHOW_DEBUG===true) {
		static $ar_resolved_static_debug;
		}


		#
		# Record already resolved check
			#
			#if (   isset($ar_resolved_static[$options->section_tipo])
			#	#&& in_array($options->section_id, $ar_resolved_static[$options->section_tipo])
			#	) {
			#		#dump($ar_record_updated, ' ar_record_updated ++ '.to_string());
			#	 	#dump($options->section_id, ' options->section_id already resolved. Return false ++ '.to_string($options->section_tipo));
			#	$response->result 	= true;
			#	$response->msg 		= 'Record already resolved '.$options->section_tipo.'_'.$options->section_id;
			#	return $response;
			#}


		#
		# DIRECT RECORD SAVE
		#
			#
			# DIFFUSION_SECTION . Resolve diffusion section from section tipo
				if (in_array($options->section_tipo, (array)$ar_unconfigured_diffusion_section)) {
					$response->msg .= 'unconfigured_diffusion_section';
					return $response;
				}
				#$diffusion_section = self::get_diffusion_table_by_section( $options->section_tipo );
				$diffusion_section = $table_tipo;
				#dump($diffusion_section, " diffusion_section $options->section_tipo ".to_string()); #die();
				if(!$diffusion_section) {
					if(SHOW_DEBUG===true) {
						$section_name = RecordObj_dd::get_termino_by_tipo($options->section_tipo, DEDALO_STRUCTURE_LANG, true, false);
						#throw new Exception("Error Processing Request. diffusion_section not found in correspondence with section_tipo: $options->section_tipo . Nothing is updated", 1);
						#echo "<hr> DEBUG update_record: Omitted update section <b>'$section_name'</b>. Optional diffusion_section not found in correspondence with section_tipo: $options->section_tipo [$options->section_id]<br>";
						$msg = " Omitted update section <b>'$section_name'</b>. Optional diffusion_section not found in correspondence with section_tipo: $options->section_tipo [$options->section_id] ";
						$response->msg .= $msg;
						debug_log(__METHOD__." $msg", logger::DEBUG);
					}
					#error_log(__METHOD__." WARNING: diffusion_section not found in correspondence with section_tipo: $options->section_tipo . Nothing is updated !!");
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
				foreach ((array)$options->section_id as $current_section_id) {
					$ar_result[] = array($options->section_tipo => $current_section_id);
				}

			# COLUMNS_DATA. Calculate, process and store in a class var all columns data for current diffusion_section
				$cd_options = new stdClass();
					$cd_options->table_tipo 			 	= $table_tipo; // same as diffusion_section
					$cd_options->ar_section_id_portal 	 	= array();
					$cd_options->database_name 		 	 	= $database_name;
					$cd_options->table_name 		 	 	= $table_name;
					$cd_options->table_propiedades 		 	= $table_propiedades;
					$cd_options->table_from_alias 		 	= $table_from_alias;
					$cd_options->ar_result 			 	 	= $ar_result;
					$cd_options->diffusion_element_tipo  	= $diffusion_element_tipo;
					$cd_options->component_publication_tipo = $options->component_publication_tipo;
				$ar_field_data = self::build_table_columns_data( $cd_options ); // Trigger resolve
				#$table_data = self::$ar_table_data[$database_name][$diffusion_section]; // Result is set and usable
					#dump($ar_field_data, ' ar_field_data ++ '.to_string($diffusion_section)); #die();

			#
			# SAVE RECORD . Insert MYSQL record (array) deleting before old data
				#if(isset(self::$ar_table_data[$database_name][$diffusion_section]) && !empty(self::$ar_table_data[$database_name][$diffusion_section])) {
				if(!empty($ar_field_data)) {

					$save_options = new stdClass();
						#$save_options->record_data 					= self::$ar_table_data[$database_name][$diffusion_section];		#dump($save_options, ' save_options ++ '.to_string());die();
						$save_options->record_data 					    = $ar_field_data;
						$save_options->record_data['diffusion_section'] = $diffusion_section;
						$save_options->diffusion_element_tipo 			= $diffusion_element_tipo;
						$save_options->section_tipo 					= $section_tipo;
						#$save_options->record_data['database_name'] 	= self::$database_name;
						#$save_options->record_data['table_name'] 		= $table_name; // overwrite default table name

					# engine switch
						$RecordObj_dd = new RecordObj_dd($database_tipo);
						$database_propiedades = $RecordObj_dd->get_propiedades();
						$database_propiedades = json_decode($database_propiedades);
						if (isset($database_propiedades->engine)) {
							$save_options->record_data['engine'] = $database_propiedades->engine; // If defined in database propiedades
						}
						#dump($save_options, ' save_options ++ '.to_string($diffusion_section)); #die();

					$save = diffusion_mysql::save_record($save_options);
						$ar_record_updated[] = $options;
						#dump($options, ' options ++ SAVED !! '.to_string());
						#dump($save, ' save ++ '.to_string());

					# GLOBAL_SEARCH
						#dump($table_propiedades, ' table_propiedades ++ $table_tipo: '.to_string($table_tipo));
						if (isset($table_propiedades->global_search_map)) {
							#dump($table_propiedades->global_search_map, ' table_propiedades ++ '.to_string($table_tipo));

							$gs_options = new stdClass();
								$gs_options->global_search_map		= $table_propiedades->global_search_map;
								$gs_options->diffusion_section 		= $diffusion_section;
								$gs_options->section_tipo 			= $section_tipo;
								$gs_options->diffusion_element_tipo = $diffusion_element_tipo;
								$gs_options->ar_field_data 			= $ar_field_data;
							self::save_global_search_data($gs_options);

						}//end if (isset($table_propiedades->global_search_map))

				}//end if(!empty($ar_field_data))

			# AR_RESOLVED . update
				$ar_resolved_static[$options->section_tipo][] = $options->section_id;
				if(SHOW_DEBUG===true) {
					$time_complete = round(microtime(1)-$start_time,3);
					$ar_resolved_static_debug[] = array($options->section_tipo, $options->section_id, $time_complete);
				}
				#dump($ar_resolved_static, ' ar_resolved_static'); #die();

		#
		# REFERENCES
		#
			$max_recursions = defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : 2;
			if ($options->recursion_level>=$max_recursions) {
				# Avoid infinite loops like Manolo's item to all references
				$resolve_references = false;
				debug_log(__METHOD__." Stopped recursive resolve_references on level $options->recursion_level ++++++++++++++++++++++++++++++++++++++++++++++++ ".to_string(), logger::DEBUG);
			}
			if ($resolve_references===true) {

				#
				# AR_SECTION_COMPONENTS . Get section components and look for references
					$ar_components_with_references = array( 'component_portal',
															'component_autocomplete',
															'component_autocomplete_hi'); #component_relation_common::get_components_with_relations(); # Using modelo name
					$ar_section_components = section::get_ar_children_tipo_by_modelo_name_in_section($options->section_tipo, $ar_components_with_references, $from_cache=true, $resolve_virtual=true);
						#dump($ar_section_components, " ar_section_components ");

				#$ar_diffusion_childrens = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_section, $modelo_name='field_', $relation_type='children');
					#dump($ar_diffusion_childrens, " ar_diffusion_childrens ".to_string());die();

				# Sort terms
					sort($ar_section_components, SORT_NATURAL);
						#dump($ar_section_components, ' ar_section_components ++ '.to_string());

				#
				# GET REFERENCES FROM COMPONENTS DATO
					$group_by_section_tipo=array();
					foreach ($ar_section_components as $current_component_tipo) {

						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true);
						if (!in_array($modelo_name, $ar_components_with_references)) continue;	// Skip component IMPORTANT to skip component_autocomplete_ts

						// autocomplete_hi case. Avoid more recursion after resolve component_autocomplete_hi data 2018-11-16
							if ($modelo_name==='component_autocomplete_hi') {
							 	$options->recursion_level = $max_recursions -1;
							}

						// skip resolve components with dato external (portals)
							$RecordObj_dd = new RecordObj_dd($current_component_tipo);
							$current_component_propiedades = $RecordObj_dd->get_propiedades(true);
							if (isset($current_component_propiedades->source->mode) && $current_component_propiedades->source->mode==='external') {
								debug_log(__METHOD__." Skipped component with external source mode: ".to_string($current_component_tipo), logger::DEBUG);
								continue;
							}


						$lang = RecordObj_dd::get_lang_by_tipo($current_component_tipo, true);

						foreach ((array)$options->section_id as $section_id) {

							$current_component  = component_common::get_instance($modelo_name,
																				 $current_component_tipo,
																				 $section_id,
																				 'list',
																				 $lang,
																				 $options->section_tipo,
																				 false);
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
					#dump($group_by_section_tipo, ' group_by_section_tipo '.$options->section_tipo.'_'.$options->section_id); #die();

				// Prevent infinite loops
					#$ar_section_tipo_resolved  = array();

				#
				# RESOLVE REFERENCES RECURSION
				# Look inside portals of portals, etc..
					foreach ($group_by_section_tipo as $current_section_tipo => $ar_section_id) {
						#if (in_array($current_section_tipo, $ar_section_tipo_resolved)) {
						#	$response->msg 		.= 'Skipped section already resolved '.$current_section_tipo;
						#	continue;
						#}

						if (empty($ar_section_id)) {
							continue;
						}
						#dump($current_section_tipo, ' current_section_tipo '.to_string($ar_section_id));

						foreach ($ar_section_id as $current_section_id) {

							## Recursion with all references
							$new_options = new stdClass();
								$new_options->section_tipo 			 	= $current_section_tipo;
								$new_options->section_id   			 	= $current_section_id;
								$new_options->diffusion_element_tipo 	= $diffusion_element_tipo;
								$new_options->recursion_level 			= (int)$options->recursion_level +1;

							# Recursion
							$this->update_record( $new_options, true );
						}

						#if (!in_array($current_section_tipo, $ar_section_tipo_resolved)) {
						#	$ar_section_tipo_resolved[] = $current_section_tipo;
						#}
					}//end foreach ($group_by_section_tipo as $current_section_tipo => $ar_section_id)
					#dump($ar_section_tipo_resolved, ' ar_section_tipo_resolved ++ '.to_string());

					#$ar_uniques = array_unique(array_keys($group_by_section_tipo));
					#$ar_section_tipo_resolved = array_merge($ar_section_tipo_resolved, $ar_uniques);
					#debug_log(__METHOD__." ar_section_tipo_resolved ".to_string($ar_section_tipo_resolved), logger::ERROR);
			}//end if ($resolve_references===true)


			#dump($ar_record_updated, ' ar_record_updated ++ '.to_string());
			#dump($ar_resolved_static, ' ar_resolved_static ++ '.to_string());
			if(SHOW_DEBUG===true) {
				#dump($ar_resolved_static_debug, ' ar_resolved_static_debug ++ '.to_string());;
			}

		$this->ar_published_records = $ar_resolved_static;

		// saves publication data
			diffusion::update_publication_data($options->section_tipo, $options->section_id);

		//response
			$response->result = true;
			$response->msg .= "Ok. Record updated $options->section_id and n references: ".count($ar_resolved_static);


		return $response;
	}//end update_record



	/**
	* SAVE_GLOBAL_SEARCH_DATA
	* v. 1.3 [20-11-2018]
	* @return object $save
	*/
	public function save_global_search_data( $request_options ) {

		$options = new stdClass();
			$options->global_search_map 	 = null;
			$options->diffusion_section 	 = null;
			$options->section_tipo 			 = null;
			$options->diffusion_element_tipo = null;
			$options->ar_field_data 		 = null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# FULL_DATA
			$full_data_tipos 		= (array)$options->global_search_map->full_data;
			$name_surname_tipos 	= isset($options->global_search_map->name_surname) ? (array)$options->global_search_map->name_surname : [];
			$sort_tipos 			= isset($options->global_search_map->sort) ? (array)$options->global_search_map->sort : [];
			$thesaurus_tipos 		= (array)$options->global_search_map->thesaurus;
			$prison_tipos 			= isset($options->global_search_map->prison) ? (array)$options->global_search_map->prison : []; // 25-01-2018
			$list_data_title_tipos 	= isset($options->global_search_map->list_data->title) ? (array)$options->global_search_map->list_data->title : []; // 25-01-2018
			$title_generic_tipos 	= isset($options->global_search_map->title) ? (array)$options->global_search_map->title : [];	// 15-11-2018
			$pub_author_tipos 		= isset($options->global_search_map->pub_author) ? (array)$options->global_search_map->pub_author : []; // 15-11-2018
			$summary_tipos 	 		= isset($options->global_search_map->list_data->summary) ? (array)$options->global_search_map->list_data->summary : []; // 25-01-2018
			$fields_tipos 	 		= (array)$options->global_search_map->list_data->fields;
			$image_tipo 	 		= isset($options->global_search_map->list_data->image) ? $options->global_search_map->list_data->image : null;
			$filter_date_tipo		= isset($options->global_search_map->filter_date) ? $options->global_search_map->filter_date : 'not_used';
			$ar_fields 		 		= (array)$options->ar_field_data['ar_fields'];
			$table_name 	 		= $options->ar_field_data['table_name'];
			$database_name 	 		= $options->ar_field_data['database_name'];

			$ar_fields_global = array();

			if(SHOW_DEBUG===true) {
				#dump($options->ar_field_data, ' options ++ '.to_string()); die();
				#dump($options->global_search_map, '$options->global_search_map ++ '.to_string());
				#dump($options->ar_field_data, ' $options->ar_field_data ++ '.to_string()); #die();
			}

			#
			# MDCAT
				$mdcat_tipos = [
					'birth_place',
					'dead_at_prison',
					'end_date',
					'exile_place',
					'municipality',
					//'name_surname',
					'neighborhood',
					'prison_municipality',
					'prison',
					'project',
					//'pub_author',
					'pub_editor',
					'pub_year',
					'region',
					'residence_place',
					'start_date',
					'theme',
					//'thesaurus',
					//'title',
					'typology',
					'data_mod' // added 18-09-2019
				];

			$fields_array = [];

			foreach ($ar_fields as $section_id => $ar_langs) {

				$pseudo_section_id = $options->section_tipo.'_'.$section_id;

				foreach ($ar_langs as $lang => $ar_columns) {
					#dump($ar_columns, ' ar_columns ++ '.to_string());

					$list_data[$lang] = new stdClass();
						$list_data[$lang]->title 	= [];
						$list_data[$lang]->summary  = [];

					$full_data[$lang] 		 	= [];
					$name_surname_data[$lang]	= [];
					$thesaurus_data[$lang]		= [];
					$prison_data[$lang]			= [];
					$sort_data[$lang]			= [];
					$pub_author_data[$lang]		= [];
					$title_generic_data[$lang]	= [];
					$filter_date_data[$lang] 	= [];
					$filter_mdcat[$lang] 	 	= [];

					foreach ($ar_columns as $column) {
						switch ($column['field_name']) {
							case 'lang':
								# Skip
								break;
							case 'section_id':
								# Skip
								break;
							default:
								# full_data (warning: can use fields used too for title etc. Not use "else" here)
									if (in_array($column['tipo'], $full_data_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$full_value = trim( strip_tags($column['field_value']) );
										if (!empty($full_value)) {
											$full_data[$lang][] = $full_value;
										}
									}

								# name_surname_tipos . Added 18-03-2018 !!
									if (in_array($column['tipo'], $name_surname_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$name_surname_value = trim( strip_tags($column['field_value']) );
										if (!empty($name_surname_value)) {
											$name_surname_data[$lang][] = $name_surname_value;
										}
									}

								# sort_tipos . Added 18-03-2018 !!
									if (in_array($column['tipo'], $sort_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$sort_value = trim( strip_tags($column['field_value']) );
										if (!empty($sort_value)) {
											$sort_data[$lang][] = $sort_value;
										}
									}

								# thesaurus_tipos. Added 13-11-2018 !!
									if (in_array($column['tipo'], $thesaurus_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$thesaurus_value = trim( strip_tags($column['field_value']) );
										if (!empty($thesaurus_value)) {
											$thesaurus_data[$lang][] = $thesaurus_value;
										}
									}

								# pub_author_tipos
									if (in_array($column['tipo'], $pub_author_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$pub_author_value = trim( strip_tags($column['field_value']) );
										if (!empty($pub_author_value)) {
											$pub_author_data[$lang][] = $pub_author_value;
										}
									}

								# title_generic_tipos
									if (in_array($column['tipo'], $title_generic_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$title_generic_value = trim( strip_tags($column['field_value']) );
										if (!empty($title_generic_value)) {
											$title_generic_data[$lang][] = $title_generic_value;
										}
									}

								# Fields (special container json)
									if(in_array($column['tipo'], $fields_tipos)) {
										$fields_array[$column['tipo']] = $column['field_value'];
									}

								# list_data_title (list_data)
									if (in_array($column['tipo'], $list_data_title_tipos)) {
										$list_data[$lang]->title[] = $column['field_value'];
									}
								# summary
									elseif (in_array($column['tipo'], $summary_tipos)) {
										if (is_array($column['field_value'])) {
											$column['field_value'] = json_encode($column['field_value']);
										}
										$summary_value = trim($column['field_value']);
										if (!empty($summary_value)) {
											$list_data[$lang]->summary[] = $summary_value;
										}
									}
								# image
									elseif ($column['tipo']===$image_tipo) {
										$list_data[$lang]->image = $column['field_value'];
									}
								# filter_date
									elseif ($column['tipo']===$filter_date_tipo) {
										$filter_date_data[$lang][] = $column['field_value'];
									}

								if (in_array($column['tipo'], $prison_tipos)) {
									if (is_array($column['field_value'])) {
										$column['field_value'] = json_encode($column['field_value']);
									}
									$prison_value = trim( strip_tags($column['field_value']) );
									if (!empty($prison_value)) {
										$prison_data[$lang][] = $prison_value;
									}
								}

								$current_field_value = $column['field_value'];

								# mdcat_tipos
								foreach ($mdcat_tipos as $current_column_name) {
									if (!isset($options->global_search_map->{$current_column_name})) continue;

									if (in_array($column['tipo'], $prison_tipos)) {
										#if (is_array($column['field_value'])) {
										#	$column['field_value'] = json_encode($column['field_value']);
										#}
										#$prison_value = trim( strip_tags($column['field_value']) );
										#if (!empty($prison_value)) {
										#	$prison_data[$lang][] = $prison_value;
										#}

									}else{

										if ($column['tipo']===$options->global_search_map->{$current_column_name} && !empty($column['field_value'])) {
											#$list_data[$lang]->{$current_column_name} = $column['field_value'];
											#dump( $$column['tipo'] , '$column[field_value] ++ '.to_string($current_column_name));
											$current_field_value = $column['field_value'];
											switch ($current_column_name) {
												case 'end_date':
													$ar_current_field_value = (array)explode(',', $current_field_value);
													$current_field_value 	= end($ar_current_field_value);
													$current_field_value 	= strtotime($current_field_value);
													break;
												case 'start_date':
													$ar_current_field_value = (array)explode(',', $current_field_value);
													$current_field_value 	= reset($ar_current_field_value);
													$current_field_value 	= strtotime($current_field_value);
													break;
												case 'pub_year':
													$ar_current_field_value = (array)explode(',', $current_field_value);
													$current_field_value 	= reset($ar_current_field_value);
													$ar_part = explode('-', $current_field_value);
													$year 	 = isset($ar_part[0]) ? $ar_part[0] : null;
													$current_field_value 	= $year;
													break;

												default:
													break;
											}
											$ar_fields_global[$pseudo_section_id][$lang][] = [
												#'field_name'  => '`'.$current_column_name.'`',
												'field_name'  => ''.$current_column_name.'',
												'field_value' => $current_field_value
											];
										}//end if ($column['tipo']===$options->global_search_map->{$current_column_name} && !empty($column['field_value']))
									}
								}
								break;
						}
					}//end foreach ($ar_columns as $column)


					# SECTION_ID
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'section_id',
							'field_value' => $pseudo_section_id
						];

					# LANG
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'lang',
							'field_value' => $lang
						];

					# LIST_DATA
						# Make one string all title/summary elements (if various)
						$list_data[$lang]->title 	= implode(', ',$list_data[$lang]->title);
						$list_data[$lang]->summary 	= implode(', ',$list_data[$lang]->summary);
						if (!empty($list_data[$lang]->image)) {
							$image_parts 				= explode(',', $list_data[$lang]->image);
							$list_data[$lang]->image 	= $image_parts[0]; // Only first image is used
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'list_data',
							'field_value' => json_encode($list_data[$lang], JSON_UNESCAPED_UNICODE)
						];

					# FULL_DATA
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'full_data',
							'field_value' => implode(' ',$full_data[$lang])
						];

					# name_surname. NAME_SURNAME_DATA . Added 18-03-2018 !!
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'name_surname',
							'field_value' => implode(' ',$name_surname_data[$lang])
						];

					# sort. sort_data . Added 18-03-2018 !!
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'sort',
							'field_value' => implode(' ',$sort_data[$lang])
						];

					# sort_id
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'sort_id',
							'field_value' => $section_id
						];

					# thesaurus. THESAURUS_DATA . Merge all values in one only array. Added 13-11-2018 !!
						#$ar_thesaurus_elements = [];
						#foreach ((array)$thesaurus_data[$lang] as $current_array_string) {
						#	if ($current_array = json_decode($current_array_string)) {
						#		$ar_thesaurus_elements = array_merge($ar_thesaurus_elements, (array)$current_array);
						#	}
						#}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'thesaurus',
							#'field_value' => (!empty($ar_thesaurus_elements)) ? json_encode($ar_thesaurus_elements) : null
							'field_value' => (!empty($thesaurus_data[$lang])) ? implode(' | ', $thesaurus_data[$lang]) : null
						];

					# prison. Merge all values in one only array. Added 20-11-2018 !!
						$ar_prison_elements = [];
						foreach ((array)$prison_data[$lang] as $current_item_string) {
							if (!empty($current_item_string)) {
								$ar_prison_elements[] = $current_item_string;
							}
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'prison',
							'field_value' => !empty($ar_prison_elements) ? implode(' | ', $ar_prison_elements) : null
						];

					# pub_author. Merge all values in one only array. Added 15-11-2018 !!
						$ar_pub_author_elements = [];
						foreach ((array)$pub_author_data[$lang] as $current_item_string) {
							if (!empty($current_item_string)) {
								$ar_pub_author_elements[] = $current_item_string;
							}
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'pub_author',
							'field_value' => !empty($ar_pub_author_elements) ? implode(' | ', $ar_pub_author_elements) : null
						];

					# title_generic. title_generic_data. Merge all values in one only array. Added 15-11-2018 !!
						$ar_title_generic_elements = [];
						foreach ((array)$title_generic_data[$lang] as $current_item_string) {
							if (!empty($current_item_string)) {
								$ar_title_generic_elements[] = $current_item_string;
							}
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'title',
							'field_value' => !empty($ar_title_generic_elements) ? implode(' | ', $ar_title_generic_elements) : null
						];

					# FIELDS
						$ar_objects = [];
						foreach ($fields_array as $current_tipo => $current_value) {
							$current_column_name = RecordObj_dd::get_termino_by_tipo($current_tipo, 'lg-spa', true);
							$fields_obj = new stdClass();
								$fields_obj->name  = $current_column_name;
								$fields_obj->value = trim( strip_tags($current_value) );
							$ar_objects[] = $fields_obj;
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'fields',
							'field_value' => json_encode($ar_objects, JSON_UNESCAPED_UNICODE)
						];

					# FILTER_DATE
						$filter_date = isset($filter_date_data[$lang][0]) ? $filter_date_data[$lang][0] : null;
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'filter_date',
							'field_value' => $filter_date
						];

					# LINK
						$link_obj = [
							'table' 	 => $table_name,
							'section_id' => $section_id
						];
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'link',
							'field_value' => json_encode($link_obj)
						];

					# TABLE
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'table',
							'field_value' => $table_name
						];

					# fons (archive code)
						switch ($table_name) {
							case 'interview': 			$fons = 1; break;
							case 'biblioteca': 			$fons = 12; break;
							case 'sra': 				$fons = 2; break;
							case 'privacio_llibertat': 	$fons = 3; break;
							case 'deportats': 			$fons = 6; break;
							case 'espais_memoria': 		$fons = 4; break;
							case 'cens_simbologia': 	$fons = 5; break;
							default: $fons = null;
						}
						$ar_fields_global[$pseudo_section_id][$lang][] = [
							'field_name'  => 'fons',
							'field_value' => '["'.$fons.'"]'
						];
				}
			}//end foreach ($ar_fields as $section_id => $ar_langs) {
			#dump($ar_fields_global, ' ar_fields_global ++ '.to_string());
			#dump($ar_fields_global, ' ar_fields_global ++ '.to_string());
			#dump($list_data, ' list_data ++ '.to_string());

		$ar_field_data = [
			"database_name" 	=> $database_name,
			"table_name" 		=> 'global_search',
			"diffusion_section" => $options->diffusion_section,
			"ar_fields" 		=> $ar_fields_global
		];

		$save_options = new stdClass();
			$save_options->diffusion_element_tipo 	= $options->diffusion_element_tipo;
			$save_options->section_tipo 			= $options->section_tipo;
			$save_options->record_data 				= $ar_field_data;
			$save_options->delete_previous 			= true;
		#dump($save_options, ' save_options ++ '.to_string()); die();
		$save = diffusion_mysql::save_record($save_options);
			#dump($save, ' save ++ '.to_string());

		debug_log(__METHOD__." Saved new record in global_search - ".$save->new_id .to_string(), logger::DEBUG);

		return (object)$save;
	}//end save_global_search_data



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
			case $count===1:
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
	}//end get_diffusion_database_name_from_table



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
	}//end get_diffusion_element_from_element_tipo



	/**
	* GET_DIFFUSION_ELEMENT_TABLES_MAP
	* Build map of section->table of all tables of current diffusion domain
	* @param string $diffusion_domain_name . Like 'aup'
	* @return object $diffusion_element_tables
	*/
	public static function get_diffusion_element_tables_map( $diffusion_element_tipo ) {

		static $ar_diffusion_element_tables_map;

		#if (isset($diffusion_element_tables_map)) {
		#	return $diffusion_element_tables_map;
		#}

		# Return cached map if exists
		if (isset($ar_diffusion_element_tables_map[$diffusion_element_tipo])) {
			return $ar_diffusion_element_tables_map[$diffusion_element_tipo];
		}


		$diffusion_element_tables_map = new stdClass();

		#
		# DIFFUSION_ELEMENT_TIPO_TABLES . Point of start to calculate diffusion tables
		$diffusion_element_tipo_tables = $diffusion_element_tipo; // Default

		# Override in 'propiedades' the base point for calculate diffusion tables
		# This is useful for development purposes, and allow publish in different database without duplicate all tables structure for each difusion_element
		$diffusion_element_tipo_obj = new RecordObj_dd($diffusion_element_tipo);
		$propiedades = $diffusion_element_tipo_obj->get_propiedades(true);
		if (isset($propiedades->force_source_tables_tipo)) {
			# Override
			$diffusion_element_tipo_tables = $propiedades->force_source_tables_tipo;
			debug_log(__METHOD__." Overrided diffusion_element_tipo $diffusion_element_tipo to $diffusion_element_tipo_tables for calculate diffusion tables ".to_string(), logger::DEBUG);
		}

		#
		# TABLES
		# Search inside current entity_domain and iterate all tables resolving alias and store target sections of every table
		$ar_terminoID = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo_tables, // Note that can be different to diffusion_element_tipo
																				   $modelo_name='table',
																				   $relation_type='children_recursive', // children_recursive
																				   $search_exact=false);
			#dump($ar_terminoID, ' ar_terminoID ++ '.to_string($diffusion_element_tipo_tables));

		$diffusion_element = self::get_diffusion_element_from_element_tipo($diffusion_element_tipo);
			#dump($diffusion_element, ' diffusion_element ++ '.to_string());


		#
		# DATABASE_NAME . Diffusion domain web_default case
		# Database name is overwrited by config db name. This allow for example, use db 'web_myentity' when diffusion domain is 'default' (instead of db 'web_default')
		$database_name = $diffusion_element->database_name;
		if ($database_name!==MYSQL_DEDALO_DATABASE_CONN && MYSQL_DEDALO_DATABASE_CONN==='web_default') {
			$database_name = MYSQL_DEDALO_DATABASE_CONN;
			debug_log(__METHOD__." Using config db (".MYSQL_DEDALO_DATABASE_CONN.") as database overwriting diffusion defined (diffusion_element->database_name) ".to_string(), logger::WARNING);
		}
		#debug_log(__METHOD__." Using database_name: $database_name ".to_string(), logger::DEBUG);

		# DATABASE_TIPO
		$database_tipo = $diffusion_element->database_tipo;

		foreach ($ar_terminoID as $current_table_tipo) {

			# Calculate database once
			#if (!isset($database)) {
			#	$database = self::get_diffusion_database_name_from_table( $current_table_tipo );
			#}

			# Propiedades
			$table_obj 			= new RecordObj_dd($current_table_tipo);
			$table_propiedades 	= json_decode($table_obj->get_propiedades());

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
							$data->table 	 	= $real_table;
							$data->name  	 	= $name;
							$data->database_name= $database_name;
							$data->database_tipo= $database_tipo;
							$data->propiedades  = $table_propiedades;
							$data->from_alias 	= false;

						$diffusion_element_tables_map->$section_tipo = $data;
					}
					break;

				case 'table_alias':
					# Indirect relation
					$ar_related_tables   = common::get_ar_related_by_model('table', $current_table_tipo);
					$real_table 		 = reset($ar_related_tables);

					if (empty($real_table)) {
						// bad structure configuration for current diffusion element
							throw new Exception("Error Processing Request. Bad structure configuration for 'real_table' of 'table_alias'. Expected 'table' related and nothing found for tipo: ".to_string($current_table_tipo), 1);
					}

					# RELATED_SECTION . Direct related section case
					$ar_direct_related_sections = common::get_ar_related_by_model('section', $current_table_tipo);
					if (!empty($ar_direct_related_sections)) {
						# Overwrite mode. Section is located in alias table diffusion element
						$ar_related_sections = $ar_direct_related_sections;
						# Overwrite default real_table calculation
						#
					}else{
						# Default mode. Section is located in real table diffusion element
						$ar_related_sections = common::get_ar_related_by_model('section', $real_table);
					}

					if (!empty($ar_related_sections)) {
						$section_tipo 		 = reset($ar_related_sections);
						# Table name is taked from real_table tipo (only one mysql table for all table alias)
						#$name 				 = RecordObj_dd::get_termino_by_tipo($real_table, DEDALO_STRUCTURE_LANG, true, false);
						# Table name is taked from current_table_tipo tipo (one mysql table for each table alias)
						$name 				 = RecordObj_dd::get_termino_by_tipo($current_table_tipo, DEDALO_STRUCTURE_LANG, true, false);

						if (empty($table_propiedades)) {
							# Try with real table when alias is empty
							$table_obj 			= new RecordObj_dd($real_table);
							$table_propiedades 	= json_decode($table_obj->get_propiedades());
						}
						$data = new stdClass();
							$data->table 		= $real_table;
							$data->name  		= $name;
							$data->database_name= $database_name;
							$data->database_tipo= $database_tipo;
							$data->propiedades  = $table_propiedades;
							$data->from_alias 	= $current_table_tipo;

						$diffusion_element_tables_map->$section_tipo = $data;
					}else{
						// bad structure configuration for current diffusion element
							debug_log(__METHOD__." ERROR: Bad structure configuration for current diffusion element. Expected section related for tipo: ".to_string($real_table), logger::ERROR);
					}
					break;
				/*
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
					break;*/

				default:
					# Skip no accepted models
					debug_log(__METHOD__." Skiped invalid model: $modelo_name", logger::DEBUG);
					#continue;
					break;
			}
		}//end foreach ($ar_terminoID as $current_table_tipo)
		#dump($diffusion_element_tables_map, ' diffusion_element_tables_map ++ '.to_string());
		#error_log( $diffusion_element_tipo );

		# Cache resolved map
		$ar_diffusion_element_tables_map[$diffusion_element_tipo] = $diffusion_element_tables_map;

		return (object)$diffusion_element_tables_map;
	}//end get_diffusion_element_tables_map



	/**
	* GET_DIFFUSION_TABLE_BY_SECTION
	* @param string $section_tipo
	* @return string $diffusion_section (tipo like dd1525) or bool false
	*/
	public static function get_diffusion_table_by_section( $section_tipo ) {

		$ar_diffusion_map_elements = self::get_ar_diffusion_map_elements();
			#dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($section_tipo));

		foreach ($ar_diffusion_map_elements as $diffusion_element_tipo => $obj_value) {
			$diffusion_element_tables_map = (object)self::get_diffusion_element_tables_map($diffusion_element_tipo);
				#dump($diffusion_element_tables_map, ' diffusion_element_tables_map ++ '.to_string($diffusion_element_tipo));

			if ( isset($diffusion_element_tables_map->$section_tipo) && isset($diffusion_element_tables_map->$section_tipo->table)) {
				return $diffusion_element_tables_map->$section_tipo->table;
				break;
			}
		}

		return false;
	}//end get_diffusion_table_by_section



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
	}//end get_thesaurus_data



	/**
	* DIFFUSION_COMPLETE_DUMP
	* @return object $response
	*/
	public function diffusion_complete_dump( $diffusion_element_tipo, $resolve_references=true ) {

		$response = new stdClass();
			$response->result = false;
			$response->msg    = '';

		$ar_tables = self::get_diffusion_element_tables_map( $diffusion_element_tipo );
			#dump($ar_tables, ' ar_tables ++ '.to_string($diffusion_element_tipo)); die();
		foreach ((array)$ar_tables as $section_tipo => $value_obj) {

			# All section records
			$result_resource = section::get_resource_all_section_records_unfiltered($section_tipo);
			while ($rows = pg_fetch_assoc($result_resource)) {

				$current_record_section_id = $rows['section_id'];
				debug_log(__METHOD__." Difussion record: - $section_tipo - $current_record_section_id ".to_string(), logger::DEBUG);

				$options = new stdClass();
					$options->section_tipo 			 = $section_tipo;
					$options->section_id    		 = $current_record_section_id;
					$options->diffusion_element_tipo = $diffusion_element_tipo;

				$result = $this->update_record( $options, $resolve_references=false );

				$response->msg .= isset($result->msg) ? "<br>".$result->msg : '';
			}//end foreach ((array)$ar_all_records as $current_record_section_id) {

			// let GC do the memory job
			// time_nanosleep(0, 10000000); // 10 ms
			# Forces collection of any existing garbage cycles
			gc_collect_cycles();
		}

		return (object)$response;
	}//end diffusion_complete_dump



	/**
	* DELETE_SQL_RECORD
	* @return bool
	*/
	public static function delete_sql_record($section_id, $database_name, $table_name, $section_tipo) {
		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." Called with: section_id:$section_id, database_name:$database_name, table_name:$table_name, section_tipo:$section_tipo, called_class:".get_called_class(), logger::DEBUG);
			#$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $options->diffusion_element_tipo );
		}

		switch ( get_called_class() ) {
			case 'diffusion_mysql':
			case 'diffusion_sql': // ??
				if( diffusion_mysql::table_exits($database_name, $table_name) ) {
					$response = diffusion_mysql::delete_sql_record($section_id, $database_name, $table_name, $section_tipo); // $section_id, $database_name, $table_name, $section_tipo=null, $custom=false
					if ($response->result===true) {
						debug_log(__METHOD__." MySQL record is deleted (publication=no) $response->msg ", logger::DEBUG);
					}
					return $response->result;
				}
				break;

			default:
				debug_log(__METHOD__." Sorry, this delete method: ".get_called_class()." is not defined yet. Nothing is deleted in current called_class ".to_string(get_called_class()), logger::DEBUG);
				break;
		}

		return false;
	}//end delete_sql_record



	/**
	* SAVE_TABLE_SCHEMA
	* schema_obj is table propiedades json data
	* @param string $database_name
	* @param object $schema_obj
	* @return object $response
	*/
	public static function save_table_schema( $database_name, $schema_obj ) {

		$response = diffusion_mysql::add_publication_schema( $database_name, json_encode($schema_obj) );

		return $response;
	}//end save_table_schema



	/**
	* GET_ELEMENTS_OF_TYPE
	* @return array
	*/
	public function get_elements_of_type() {

		// No used yet
	}//end get_elements_of_type



	/**
	* MAP_TARGET_SECTION_TIPO
	* Searchs in diffusion structure the table that point to the same section of current dato
	* @param string $element_tipo
	* @param array $dato;
	* 	Contains one value like 'ts1' (is target section tipo data from component in hierarchy record)
	* @return string $table_name
	*	Return table name usable for mysql like 'themes'
	*/
	public static function map_target_section_tipo($options, $dato) {
		$table_name = null;

		$element_tipo = $options->tipo;

		$target_section_tipo = reset($dato);
		if (!empty($target_section_tipo)) {

			$database_element_tipo  = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='database', $relation_type='parent', $search_exact=true);
				#dump($database_element_tipo, ' database_element_tipo ++ '.to_string());
			$database_element_tables = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_element_tipo[0], $modelo_name='table', $relation_type='children', $search_exact=true);
				#dump($database_element_tables, ' database_element_tables ++ '.to_string());
			foreach ($database_element_tables as $table_tipo) {
				$ar_section_tipo = common::get_ar_related_by_model('section', $table_tipo);

				if (isset($ar_section_tipo[0]) && $ar_section_tipo[0]===$target_section_tipo ) {

					$table_name = RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
					break;
				}
			}
		}

		return $table_name;
	}//end map_target_section_tipo



	/**
	* MAP_LOCATOR_SECTION_TIPO
	* @return
	*/
	public static function map_locator_section_tipo($options, $dato) {
		$table_name = '';

		$element_tipo = $options->tipo;
		$locator 	  = reset($dato);
		if (isset($locator->section_tipo)) {
			$database_element_tipo  = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='database', $relation_type='parent', $search_exact=true);
				#dump($database_element_tipo, ' database_element_tipo ++ '.to_string());
			$database_element_tables = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_element_tipo[0], $modelo_name='table', $relation_type='children', $search_exact=true);

			foreach ($database_element_tables as $table_tipo) {
				$ar_section_tipo = common::get_ar_related_by_model('section', $table_tipo);

				if (isset($ar_section_tipo[0]) && $ar_section_tipo[0]===$locator->section_tipo ) {

					$table_name = RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true, false);
					break;
				}
			}
		}

		return $table_name;
	}//end map_locator_section_tipo



	/**
	* MAP_TO_SECTION_TIPO
	* Returns current section tipo like 'es1'
	* @return string $section_tipo
	*/
	public static function map_to_section_tipo($options, $dato) {
		$section_tipo = null;
		/*
		$element_tipo 		= $options->tipo;
		$table_element_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='table', $relation_type='parent', $search_exact=true);
		$ar_section_tipo 	= common::get_ar_related_by_model('section', reset($table_element_tipo));
		$section_tipo 	 	= reset($ar_section_tipo);
		*/
		$section_tipo 	 	= $options->section_tipo;

		return $section_tipo;
	}//end map_to_section_tipo



	/**
	* MAP_TO_TERMINOID
	* Returns current section tipo like 'es1'
	* @return string $section_tipo
	*/
	public static function map_to_terminoID($options, $dato) {

		$terminoID = null;
		/*
		$element_tipo 		= $options->tipo;
		$table_element_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $modelo_name='table', $relation_type='parent', $search_exact=true);
		$ar_section_tipo 	= common::get_ar_related_by_model('section', reset($table_element_tipo));
		$section_tipo 	 	= reset($ar_section_tipo);
		*/
		$section_tipo 	 	= $options->section_tipo;
		$section_id 		= $dato;

		$terminoID = $section_tipo .'_'. $section_id;

		return $terminoID;
	}//end map_to_terminoID



	/**
	* MAP_LOCATOR_TO_TERMINOID_PARENT
	* @see Alias of map_to_terminoID
	* Used to trigger parent publication when children is published (useful in thesaurus web publications like mupreva)
	*/
	public static function map_locator_to_terminoID_parent($options, $dato) {

		# Reference:
		# dato:
		#   [0] => stdClass Object
        #   (
        #       [section_tipo] => mupreva2564
        #       [section_id] => 1
        #       [component_tipo] => mupreva2571
        #   )
        # options:
        #   [typology] =>
	    #   [value] =>
	    #   [tipo] => mupreva2586
	    #   [parent] => 2
	    #   [lang] => lg-vlca
	    #   [section_tipo] => mupreva2564
	    #   [caler_id] => 3
	    #   [propiedades] => stdClass Object
	    #       (
	    #           [varchar] => 128
	    #           [process_dato] => diffusion_sql::map_locator_to_terminoID_parent
	    #       )
	    #   [diffusion_element_tipo] => mupreva800

		$terminoID = null;

		// locator
			$locator = false;
			if (is_array($dato)) {
				$locator = reset($dato);
			}

		// Trigger update parent here
			if ($locator) {

				$section_tipo 			= $locator->section_tipo;
				$section_id 			= $locator->section_id;
				$diffusion_element_tipo = $options->diffusion_element_tipo;

				// Force section tipo from locator
					$options->section_tipo = $section_tipo;

				$terminoID = diffusion_sql::map_to_terminoID($options, $section_id);

				$current_skip_publication_state_check = $_SESSION['dedalo4']['config']['skip_publication_state_check'] ?? 0;

				# Set temporally to skip and force parent publication
				$_SESSION['dedalo4']['config']['skip_publication_state_check'] = 1;

				tool_diffusion::export_record($section_tipo, $section_id, $diffusion_element_tipo, $resolve_references=true);
				debug_log(__METHOD__." *** Triggered tool_diffusion::export_record for parent ($section_tipo  - $section_id) ".to_string(), logger::DEBUG);

				# Restore previous skip_publication_state_check state
				$_SESSION['dedalo4']['config']['skip_publication_state_check'] = $current_skip_publication_state_check;

			}else{
				#debug_log(__METHOD__." ============ NOT Triggered tool_diffusion::export_record dato: ".to_string($dato), logger::ERROR);
			}


		return $terminoID;
	}//end map_locator_to_terminoID_parent



	/**
	* MAP_LOCATOR_TO_TERMINOID
	* Returns map first locator to plain "terminoID" like "es_2"
	* @return string $terminoID
	*/
	public static function map_locator_to_terminoID($options, $dato) {

		//debug_log(__METHOD__." options ".to_string($options), logger::DEBUG);
		$ar_filter = false;
		if (isset($options->propiedades->process_dato_arguments->filtered_dato_by)) {
			$ar_filter = $options->propiedades->process_dato_arguments->filtered_dato_by;
		}
		#debug_log(__METHOD__." ar_filter ".to_string($ar_filter), logger::DEBUG);

		if (isset($options->propiedades->process_dato_arguments->use_parent)) {
			$use_parent = $options->propiedades->process_dato_arguments->use_parent;
		}else{
			$use_parent = false;
		}

		$terminoID = null;

		if (!empty($dato)) {
			$terminoID = array();

			foreach ((array)$dato as $current_locator) {

				if ($ar_filter!==false) foreach ($ar_filter as $filter_obj) {
					foreach ($filter_obj as $f_property => $f_value) {
						if (!property_exists($current_locator, $f_property) || $current_locator->{$f_property} != $f_value) {
							continue 3; // Ignore
						}
					}
				}
				if($use_parent===true){
					$ar_parents = component_relation_parent::get_parents($current_locator->section_id, $current_locator->section_tipo);
					$current_locator = $ar_parents[0];
				}

				$section_tipo 	= $current_locator->section_tipo;
				$section_id 	= $current_locator->section_id;

				$terminoID[] = $section_tipo .'_'. $section_id;


				// add parents option
				// if defined in propeerties, get current locator parents recursively and add it to current value (like municipality, region, country hierarchy)
					if (isset($options->propiedades->process_dato_arguments->custom_arguments->add_parents) && $options->propiedades->process_dato_arguments->custom_arguments->add_parents===true) {
						# calculate parents and add to dato
						// get_parents_recursive($section_id, $section_tipo, $skip_root=true, $is_recursion=false)
						$ar_parents = component_relation_parent::get_parents_recursive($current_locator->section_id, $current_locator->section_tipo, true);
						foreach ($ar_parents as $parent_locator) {
							$terminoID[] = $parent_locator->section_tipo .'_'. $parent_locator->section_id;
						}
					}
			}


			$terminoID = json_encode($terminoID);
		}


		return $terminoID;
	}//end map_locator_to_terminoID



	/**
	* MAP_LOCATOR_TO_TERM_ID
	* Alias of map_locator_to_terminoID
	* @return string $section_tipo
	*/
	public static function map_locator_to_term_id($options, $dato) {

		return self::map_locator_to_terminoID($options, $dato);
	}//end map_locator_to_term_id



	/**
	* MAP_TO_POLITICAL_TOPONYMY
	* @return string $term
	*/
	public static function map_to_political_toponymy($options, $dato) {

		#dump($options, ' options ++ '.to_string());
		#dump($dato, ' dato ++ '.to_string());

		// empty dato case
			if (empty($dato) || empty($dato[0]->from_component_tipo)) {
				return null;
			}

		// component to manage (usually component_autocomplete_hi)
			$tipo 		= $dato[0]->from_component_tipo;
			$model_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		// properties
			$properties = $options->propiedades;
			if (!isset($properties->political_toponymy_type)) {
				debug_log(__METHOD__." Error. Structure political_toponymy_type is not defined for tipo: ".to_string($tipo), logger::ERROR);
				return null;
			}

		// options
			$toponymy_options = new stdClass();
				$toponymy_options->locator 	= $dato[0];
				$toponymy_options->lang 	= $options->lang;
				$toponymy_options->type 	= $properties->political_toponymy_type;

		// call get_political_toponymy
			$term = $model_name::get_political_toponymy($toponymy_options);


		return $term;
	}//end map_to_political_toponymy



	/**
	* MAP_PARENT_TO_NORDER
	* Returns number of order of current element based on parent array position of this element
	* @param array $dato
	*	Is array of parent locators
	* @return int $norder
	*/
	public static function map_parent_to_norder($options, $dato) {
		$norder = 0;

		if (!empty($dato)) {

			$current_locator = new locator();
				$current_locator->set_section_tipo($options->section_tipo);
				$current_locator->set_section_id($options->parent);

			$parent_locator = reset($dato);

			if (isset($parent_locator->from_component_tipo)) {
				$current_component_tipo = $parent_locator->from_component_tipo;
			}elseif (isset($parent_locator->component_tipo)) {
				$current_component_tipo = $parent_locator->component_tipo;
				debug_log(__METHOD__." ERROR: Expected locator->from_component_tipo but found ocator->component_tipo. Please fix this data ASAP ".to_string(), logger::ERROR);
			}else{
				throw new Exception("Error Processing Request. Not found component tipo in locator: ".to_string($parent_locator), 1);
			}

			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo, true); // component_relation_children
			$component 		= component_common::get_instance($modelo_name,
															 $current_component_tipo,
															 $parent_locator->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $parent_locator->section_tipo);
			$parent_dato = $component->get_dato();
			foreach ((array)$parent_dato as $key => $children_locator) {
				if( true===locator::compare_locators( $current_locator, $children_locator, $ar_properties=array('section_tipo','section_id') ) ) {
					$norder = $key;
					break;
				}
			}
		}

		return (int)$norder;
	}//end map_parent_to_norder



	/**
	* MAP_PROJECT_TO_SECTION_ID
	* @return array $ar_section_id
	*/
	public static function map_project_to_section_id($options, $dato) {

		$ar_section_id = array();

		$current_version = (array)tool_administration::get_current_version_in_db();

		//prior to 4.8 dato : 49:2
		if($current_version[0] <= 4 && $current_version[1] <= 8) {

			foreach ((array)$dato as $key => $value) {
				$ar_section_id[] = (string)$key;
			}
		}else{
			//post to 4.9 dato: locator
			foreach ((array)$dato as $current_locator) {
				$ar_section_id[] = $current_locator->section_id;
			}
		}

		return (array)$ar_section_id;
	}//end map_project_to_section_id



	/**
	* CALCULATE_DURATION
	* propiedades generic postprocess data
	* Calculate the duration of all videos in current interview from portal and returns the total duration
	* @return $total_tc;
	*/
	public static function calculate_duration( $options, $dato, $format='secs') {
		#dump($dato, ' dato ++ '.to_string($options));
		// rsc54

		$ar_duration = array();
		foreach ((array)$dato as $key => $locator) {

			$data_source 	= $options->propiedades->data_source;
			$portal_tipo 	= key($data_source);
			$component_tipo = reset($data_source);




			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $component_tipo,
															 $locator->section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $locator->section_tipo);
			$component_dato = $component->get_dato();
			$component_dato = reset($component_dato);
				#dump($component_dato, ' component_dato ++ '.to_string());

			$seconds = OptimizeTC::TC2seg($component_dato);

			$ar_duration[] = $seconds;
		}
		#dump($ar_duration, ' ar_duration ++ '.to_string());

		$total_seconds = 0;
		foreach ($ar_duration as $seconds) {
			$total_seconds = $total_seconds + $seconds;
		}
		#dump($total_seconds, ' $total_seconds ++ '.to_string());

		switch ($format) {
			case 'total_tc':
				$duration =  OptimizeTC::seg2tc($total_seconds);
				break;

			case 'secs':
			default:
				$duration = (int)ceil($total_seconds);
				break;
		}
		#dump($duration, ' total_tc ++ total_seconds: '.to_string($total_seconds));

		return $duration;
	}//end calculate_duration



	/**
	* CALCULATE_MEASUREMENTS
	* @return
	*/
	public static function calculate_measurements($options, $dato) {
		#dump($options, ' options ++ '.to_string($dato));

		# [typology] =>
	    # [value] =>
	    # [tipo] => mupreva1991
	    # [parent] => 22252
	    # [lang] => lg-fra
	    # [section_tipo] => mupreva1
	    # [caler_id] => 3
	    # [propiedades] => stdClass Object
	    #     (
	    #         [process_dato] => diffusion_sql::calculate_measurements
	    #     )

	    $measurements = null;

		$diffusion_tipo = $options->tipo;
		$section_id 	= $options->parent;
		$lang 			= $options->lang;
		$section_tipo 	= $options->section_tipo;
		$ar_tipo 		= common::get_ar_related_by_model('component_portal',$diffusion_tipo);
		$component_tipo = reset($ar_tipo);
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		if($modelo_name!=='component_portal') return null;

		$component 		= component_common::get_instance($modelo_name,
														 $component_tipo,
														 $section_id,
														 $modo='list',
														 $lang,
														 $section_tipo);


		#$measurements = $component->get_valor($lang);
		#$measurements = $component->get_valor_export( $valor=null, $lang, $quotes=null, $add_id=null );
		#$measurements = $component->get_valor( $lang, $data_to_be_used='valor_list', $separator_rows='<br>', $separator_fields=', ' );
		#$measurements = strip_tags( $measurements );

		$dato = $component->get_dato();

		#
		# TERMINOS_RELACIONADOS . Obtenemos los terminos relacionados del componente actual
		$RecordObj_dd = new RecordObj_dd($component_tipo);
		$ar_terminos_relacionados = (array)$RecordObj_dd->get_relaciones();
			#dump($ar_terminos_relacionados, ' ar_terminos_relacionados');

		#
		# FIELDS
		$fields=array();
		foreach ($ar_terminos_relacionados as $key => $ar_value) {
			foreach ($ar_value as $current_tipo) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				if (strpos($modelo_name, 'component_')!==false) {
					$fields[] = $current_tipo;
				}
			}
		}
		#dump($fields, ' fields ');

		$ar_resolved=array();
		foreach( (array)$dato as $key => $value) {
			#dump($value, ' value ++ '.to_string());
			$section_tipo 	= $value->section_tipo;
			$section_id 	= $value->section_id;

			$ar_resolved[$section_id][] = $section_id;

			foreach ($fields as $current_tipo) {

				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					#dump($modelo_name, ' $modelo_name ++ '.to_string());
				#if ($modelo_name==='component_section_id') {
				#	continue;
				#}
				$component 		= component_common::get_instance($modelo_name,
																 $current_tipo,
																 $section_id,
																 'edit',
																 $lang,
																 $section_tipo,
																 true);
				#$current_value_export = $component->get_valor_export( null, $lang, $quotes, $add_id );
				$current_value_export = $component->get_valor( $lang );

				// Clean double spaces and remove \n
				#$current_value_export = str_replace(array("\n","  "),array(' ',' '),$current_value_export);

				$ar_resolved[$section_id][] = $current_value_export;
			}
		}
		#dump($ar_resolved, ' $ar_resolved ++ '.to_string());

		$ar_valor_export=array();
		foreach ($ar_resolved as $key => $ar_value) {
			#$valor_export .= implode("\t", $ar_value).PHP_EOL;
			if (!empty($ar_value)) {
				#dump($ar_value, ' ar_value ++ '.to_string());
				$valor_line='';
				#$valor_line  = implode("\t", $ar_value);
				foreach ($ar_value as $ckey => $lvalue) {
					if ($ckey===0) {
						continue;
					}
					#dump($lvalue, ' lvalue ++ '.to_string());
					$lvalue=trim($lvalue);
					if (!empty($lvalue)) {
						$valor_line .= " " . $lvalue;
					}
				}
				$ar_valor_export[] = trim($valor_line);
			}
		}
		#$valor_export = $quotes.trim($valor_export).$quotes;

		$measurements = implode(PHP_EOL, $ar_valor_export);

		return $measurements;
	}//end calculate_measurements



	/**
	* MAP_QUALITY_TO_INT
	* @return
	*/
	public static function map_quality_to_int($options, $dato) {
		$quality = 0;

		if ( isset($dato[0]) && isset($dato[0]->section_id) ) {
			$quality = $dato[0]->section_id;
		}

		return (int)$quality;
	}//end map_quality_to_int



	/**
	* BUILD_GEOLOCATION_DATA
	* @return string
	*/
	public static function build_geolocation_data($options, $dato) {
		#dump($options, ' options ++ '.to_string());
		#dump($dato, ' dato ++ '.to_string());

		$request_options = new stdClass();
			$request_options->raw_text = $dato;

		# Test data
		#$request_options->raw_text = '[geo-n-1--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.10389792919159,41.393728914379295]}}]}:data]&nbsp;Texto dos';
		#$request_options->raw_text = '[geo-n-1--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.10389792919159,41.393728914379295]}}]}:data]&nbsp;Texto dos';
		#$request_options->raw_text = 'Hola que tal [geo-n-1--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.10389792919159,41.393728914379295]}}]}:data] Texto dos';

		$options = new stdClass();
			$options->raw_text			= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		$ar_elements = component_text_area::build_geolocation_data($options->raw_text);
		$response 	 = json_encode($ar_elements, JSON_UNESCAPED_UNICODE);

		return (string)$response; // json_encoded object
	}//end build_geolocation_data



	/**
	* RETURN_EMPTY_STRING
	* Fake method to return true always
	* @return string
	*/
	public static function return_empty_string( $options, $dato ) {

		return '';
	}//end return_empty_string



	/**
	* object_to_string
	* @return
	*/
	public static function object_to_string( $options, $dato ) {

		return json_encode($dato);
	}//end object_to_string



	/**
	* RESOLVE_VALUE
	* @return
	*/
	public static function resolve_value( $options, $dato, $default_separator=" | " ) {
		#dump($options, ' options ++ '.to_string());
		#dump($dato, ' dato ++ '.to_string());

		if (isset($dato[0])) {
			$ar_locator = $dato;
		}else{
			return null;
		}

		$process_dato_arguments = (object)$options->propiedades->process_dato_arguments;
		$output 				= isset($process_dato_arguments->output) ? $process_dato_arguments->output : null;

		#$ar_target_component_tipo = array_filter($process_dato_arguments, function($item) {
		#	return key($item) === 'target_component_tipo';
		#});
		#dump($ar_target_component_tipo, ' ar_target_component_tipo ++ '.to_string());
		#$object_component_tipo = reset($ar_target_component_tipo);
		$target_component_tipo = $process_dato_arguments->target_component_tipo;
			#dump($target_component_tipo, ' $target_component_tipo ++ '.to_string()); die();

		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($target_component_tipo,true);

		$ar_value = [];
		foreach ($ar_locator as $key => $locator) {
			if (empty($locator->section_tipo) || empty($locator->section_id) || empty($modelo_name)) {
				continue;
			}

			$component 	= component_common::get_instance($modelo_name,
														 $target_component_tipo,
														 $locator->section_id,
														 'list',
														 $options->lang,
														 $locator->section_tipo,
														 false);

			$method 	= isset($process_dato_arguments->component_method) ? $process_dato_arguments->component_method : 'get_diffusion_value';

			// Inject custom properties to target component to manage 'get_diffusion_value' or another called method
				if (isset($options->propiedades->process_dato_arguments->target_component_properties)) {
					# Overwrite component properties
					$component->diffusion_properties = $options->propiedades->process_dato_arguments->target_component_properties;
				}

			#
			# !! FALTA FILTRAR SI ES PUBLICABLE O NO EL DESTINO !!
			# AHORA SE AÑADE TODO LO QUE ESTÉ EN EL DATO INDEPENDIENTEMENTE DE SI ES PUBLICABLE
			#

			# Fix common error in structure propiedades config..
			if ($method==='get_diffusion_valor') $method = 'get_diffusion_value';

			# arguments
			$custom_arguments = array();
			if (isset($process_dato_arguments->custom_arguments)) {
				$custom_arguments = (array)$process_dato_arguments->custom_arguments;
			}
			if ($method==='get_diffusion_value') {
				#$value = $component->{$method}($options->lang);
				#$custom_arguments[] = $options->lang;
				array_unshift($custom_arguments, $options->lang); // always as first argument (!)
			}
			$value = call_user_func_array(array($component, $method), $custom_arguments);

			switch ($output) {
				case 'merged':
					if ($value_array = json_decode($value)) {
						$ar_value = array_merge($ar_value, (array)$value_array);
					}
					break;

				default:
					// empty_value. if defined, force custom empty value from properties arguments to insert into result array
						if (empty($value) && isset($process_dato_arguments->empty_value)) {
							$value = $process_dato_arguments->empty_value; // any type is accepted: array, object, string ..
						}

					// convert to string always
						if (is_array($value) || is_object($value)) {
							$value = json_encode($value);
						}else{
							$value = trim($value);
						}

					// store value in array
						if (isset($process_dato_arguments->empty_value)) {
							// always store
							$ar_value[] = $value;
						}else{
							// only store if not empty
							if (!empty($value) && $value!=='[]' && $value!=='{}') {
								$ar_value[] = $value;
							}
						}
					break;
			}
		}


		switch ($output) {
			case 'merged':
				# Merge all arrays values in one only array
				#$ar_value = array_unique($ar_value);
				$ar_value = array_values($ar_value); // Restore array keys
				$value 	  = json_encode($ar_value);
				break;

			default:
				$separator 	= isset($process_dato_arguments->separator) ? $process_dato_arguments->separator : $default_separator;
				$value 		= implode($separator,$ar_value);
				break;
		}

		# Remove duplicates
		#$uar_value 	= explode(',',$value);
		#$uar_value 	= array_unique($uar_value);
		#$value 		= implode(',',$ar_value);

		if (empty($value) && $value!='0') {
			$value = null; // default empty value is 'null'
		}


		return $value;
	}//end resolve_value



	/**
	* SPLIT_DATE_RANGE
	* @return string|null
	*/
	public static function split_date_range( $options, $dato ) {

		$process_dato_arguments = (object)$options->propiedades->process_dato_arguments;
		$selected_key 			= isset($process_dato_arguments->selected_key)  ? (int)$process_dato_arguments->selected_key : 0;
		$selected_date 			= isset($process_dato_arguments->selected_date) ? $process_dato_arguments->selected_date : false; // 'start';
		$date_format 			= isset($process_dato_arguments->date_format) ? $process_dato_arguments->date_format : 'full';

			#dump($options, ' options ++ '.to_string());
			#dump($dato, ' dato ++ '.to_string());
			#dump($process_dato_arguments, ' process_dato_arguments ++ '.to_string());
			#dump($selected_date, ' selected_date ++ '.to_string());

		// Check array key exists
			if (!isset($dato[$selected_key])) {
				return null;
			}

		if ($selected_date!==false) {

			if (!isset($dato[$selected_key]->$selected_date)) {
				return null;
			}
			$date_obj = $dato[$selected_key]->$selected_date;

		}else{

			$date_obj = $dato[$selected_key];
		}


		// date_format
		switch ($date_format) {
			case 'year':
				$dd_date = new dd_date($date_obj);
				$value 	 = $dd_date->year;
				break;
			case 'full':
			default:
				// Default
				$dd_date = new dd_date($date_obj);
				$value 	 = $dd_date->get_dd_timestamp($date_format="Y-m-d H:i:s", $padding=true);
				break;
		}


		return $value;
	}//end split_date_range



	/**
	* GET_DIFFUSION_SECTIONS_FROM_DIFFUSION_ELEMENT
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element($diffusion_element_tipo) {

		$ar_diffusion_sections = array();

		# tables. RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo, $modelo_name='table', $relation_type='children_recursive', $search_exact=false);
		$tables = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo, 'table', 'children_recursive', false);
		foreach ($tables as $current_table_tipo) {

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_table_tipo,true);
			switch ($modelo_name) {
				case 'table_alias':
					# First try section (thesaurus needed)
					$ar_related = common::get_ar_related_by_model('section', $current_table_tipo);
					if (!isset($ar_related[0])) {
						# If not, We search 'table' now
						$ar_table = common::get_ar_related_by_model('table', $current_table_tipo);
						if (isset($ar_table[0])) {
							$ar_related = common::get_ar_related_by_model('section', $ar_table[0]);
						}
					}
					break;

				case 'table':
				default:
					# Pointer to section
					$ar_related = common::get_ar_related_by_model('section', $current_table_tipo);
					break;
			}

			if (isset($ar_related[0])) {
				$ar_diffusion_sections[] = $ar_related[0];
			}
		}

		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element



}
