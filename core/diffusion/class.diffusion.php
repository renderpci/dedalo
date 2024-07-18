<?php
if (defined('DIFFUSION_CUSTOM') && DIFFUSION_CUSTOM!==false) {
	include_once(DIFFUSION_CUSTOM);
}
/**
* CLASS DIFUSSION
*/
abstract class diffusion  {



	// class vars
		protected $domain;
		public $ar_diffusion_map;

		public static $update_record_actions = [];

		public static $publication_first_tipo		= 'dd271';
		public static $publication_last_tipo		= 'dd1223';
		public static $publication_first_user_tipo	= 'dd1224';
		public static $publication_last_user_tipo	= 'dd1225';

		public $ar_records;



	/**
	* CONSTRUCT
	* @param object $options = null
	*/
	function __construct( ?object $options=null ) {

		$this->domain = DEDALO_DIFFUSION_DOMAIN;
	}//end __construct



	/**
	* UPDATE_RECORD
	* All extended classes must to implement this method (mandatory)
	* @param object $options
	*/
	public function update_record( object $options ) {
		// Override in every heritage class
		throw new Exception("Error Processing Request. Please, call from correct class", 1);
	}//end update_record



	/**
	* GET_DIFFUSION_DOMAINS
	* Get array of ALL diffusion domains in structure
	* @return array $diffusion_domains
	*/
	public static function get_diffusion_domains() : array {

		$diffusion_domains = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
			DEDALO_DIFFUSION_TIPO,
			'diffusion_domain', // string model_name=
			'children' // string relation_type=
		);

		return $diffusion_domains;
	}//end get_diffusion_domains



	/**
	* GET_MY_DIFFUSION_DOMAIN
	* Get only one diffusion domain by tipo
	* Note: Define 'class_name' in properties of current desired diffusion element like {"class_name":"diffusion_index_ts"}
	* @param string $diffusion_domain_name
	* 	like 'dedalo'
	* @param string $caller_class_name
	* 	like 'diffusion_sql'
	* @return string|null $current_children
	* 	like 'dd15'
	*/
	public static function get_my_diffusion_domain(string $diffusion_domain_name, string $caller_class_name) : ?string {

		// Array of all diffusion domains
		$diffusion_domains = (array)diffusion::get_diffusion_domains();
		foreach ($diffusion_domains as $current_tipo) {

			$current_name = RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG, true, true);

			if($current_name===$diffusion_domain_name) {

				// NUEVO MODO (más rápido) : Por propiedad 'class_name' . Evita la necesidad de utilizar el modelo cuando no es un modelo estándar de Dédalo
				$ar_childrens = RecordObj_dd::get_ar_childrens($current_tipo);
				foreach ($ar_childrens as $current_children) {

					$RecordObj_dd	= new RecordObj_dd($current_children);
					$properties		= $RecordObj_dd->get_propiedades(true);
					if (!empty($properties) && property_exists($properties->diffusion, 'class_name') && $properties->diffusion->class_name===$caller_class_name) {
						return (string)$current_children;
					}
				}
			}
		}

		return null;
	}//end get_my_diffusion_domain



	/**
	* GET_AR_DIFFUSION_MAP
	* Get and set diffusion_map of current domain ($this->domain)
	* @param string $diffusion_domain_name . Like 'aup'
	* @param bool $connection_status = false
	* 	On true, check connection status (usually MySQL database)
	* @return object $entity_diffusion_tables
	* 	Sample:
	* 	{
	*	    "murapa2": [
	*	        {
	*	            "element_tipo": "murapa3",
	*	            "name": "Publicar en web",
	*	            "class_name": "diffusion_mysql",
	*	            "database_name": "web_murapa",
	*	            "database_tipo": "murapa4"
	*	        }
	*	    ]
	*	}
	*/
	public static function get_diffusion_map( string $diffusion_domain_name=DEDALO_DIFFUSION_DOMAIN, $connection_status=false ) : object {

		// cache
			static $diffusion_map;
			if (isset($diffusion_map)) {
				return $diffusion_map;
			}

		$diffusion_map = new stdClass();

		#
		# DIFFUSION DOMAIN
		# Find all diffusion domains and select the domain name equal to $diffusion_domain_name
		$ar_all_diffusion_domains = diffusion::get_diffusion_domains();
		foreach ($ar_all_diffusion_domains as $current_diffusion_domain_tipo) {
			$name = RecordObj_dd::get_termino_by_tipo($current_diffusion_domain_tipo, DEDALO_STRUCTURE_LANG, true, false);
			if ($name===$diffusion_domain_name) {
				$diffusion_domain_tipo = $current_diffusion_domain_tipo;
				break;
					#dump($diffusion_domain_tipo, ' $diffusion_domain_tipo ++ '.to_string($diffusion_domain_name));
			}
		}
		if (!isset($diffusion_domain_tipo)) {
			debug_log(__METHOD__." Not found diffusion_domain_tipo for diffusion_domain: ".to_string($diffusion_domain_name), logger::WARNING);
			return $diffusion_map; // Not found entity name as diffusion domain
		}

		#
		# DIFFUSION_GROUP
		# Search inside current diffusion_domain and iterate all diffusion_group
		$ar_diffusion_group = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_domain_tipo, $model_name='diffusion_group', $relation_type='children', $search_exact=true);
			#dump($ar_diffusion_element_tipo, ' ar_diffusion_element_tipo ++ '.to_string());
		foreach ($ar_diffusion_group as $diffusion_group_tipo) {

			$diffusion_map->{$diffusion_group_tipo} = array();

			#
			# DIFFUSION_ELEMENT
			# Search inside current diffusion_group and iterate all diffusion_element
			$ar_diffusion_elements = [];

			// 1 get the diffusion element alias
			$ar_diffusion_element_alias_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_group_tipo, $model_name='diffusion_element_alias', $relation_type='children', $search_exact=true);

			if(!empty($ar_diffusion_element_alias_tipo)){
				foreach ($ar_diffusion_element_alias_tipo as $element_alias) {
					$ar_real_diffusion_element = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($element_alias, 'diffusion_element', 'termino_relacionado', false);
					$ar_diffusion_elements[] = reset($ar_real_diffusion_element);
				}
			}
			// 2 get direct diffusion element
			$direct_diffusion_elements = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_group_tipo, $model_name='diffusion_element', $relation_type='children', $search_exact=true);

			// 3 mix to final array of diffusion_elements
			$ar_diffusion_element_tipo = !empty($ar_diffusion_elements)
				? array_merge($ar_diffusion_elements, $direct_diffusion_elements)
				: $direct_diffusion_elements;

			foreach ($ar_diffusion_element_tipo as $element_tipo) {

				$RecordObj_dd			= new RecordObj_dd($element_tipo);
				$properties				= $RecordObj_dd->get_propiedades(true);
				$diffusion_class_name	= isset($properties->diffusion->class_name) ? $properties->diffusion->class_name : null;
				$name					= RecordObj_dd::get_termino_by_tipo($element_tipo, DEDALO_STRUCTURE_LANG, true, false);

				# Database of current diffusion element
				$ar_children = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $model_name='database', $relation_type='children', $search_exact=true);

				$diffusion_database_tipo = !empty($ar_children)
					? reset($ar_children)
					: null;

				// database_alias case try
					if (empty($diffusion_database_tipo)) {
						$ar_children			= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($element_tipo, $model_name='database_alias', $relation_type='children', $search_exact=true);
						$database_alias_tipo	= reset($ar_children);
						$ar_real_database_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($database_alias_tipo, 'database', 'termino_relacionado', false);

						$diffusion_database_tipo = reset($ar_real_database_tipo);
						$diffusion_database_name = RecordObj_dd::get_termino_by_tipo($database_alias_tipo, DEDALO_STRUCTURE_LANG, true, false);
						// dump($ar_real_database_tipo, ' ar_real_database_tipo ++ diffusion_database_name: '.to_string($diffusion_database_name));

						// overwrite element_tipo (!)
						// $element_tipo = $diffusion_database_tipo;

					}else{
						$diffusion_database_name = RecordObj_dd::get_termino_by_tipo($diffusion_database_tipo, DEDALO_STRUCTURE_LANG, true, false);
					}

				$item = new stdClass();
					$item->element_tipo		= $element_tipo;
					$item->name				= $name;
					$item->class_name		= $diffusion_class_name;
					$item->database_name	= $diffusion_database_name;
					$item->database_tipo	= $diffusion_database_tipo;

				// add connection DDBB status. Check connection is reachable
					if ($connection_status===true) {
						switch ($item->class_name) {
							case 'diffusion_mysql':
								// check connection
								try {

									$conn = $conn ?? DBi::_getConnection_mysql(
										MYSQL_DEDALO_HOSTNAME_CONN,
										MYSQL_DEDALO_USERNAME_CONN,
										MYSQL_DEDALO_PASSWORD_CONN,
										$item->database_name,
										MYSQL_DEDALO_DB_PORT_CONN,
										MYSQL_DEDALO_SOCKET_CONN
									);

								} catch (Exception $e) {
									$conn = false;
									debug_log(__METHOD__
										."  Caught exception on connect to MySQL (database_name: $item->database_name): ". PHP_EOL
										. $e->getMessage()
										, logger::WARNING
									);
								}
								if ($conn===false) {
									$item->connection_status = (object)[
										'result'	=> false,
										'msg'		=> 'Unable to connect to database'
									];
								}else{
									// check database
									$db_available = diffusion_mysql::database_exits($item->database_name);
									if ($db_available===true) {
										$item->connection_status = (object)[
											'result'	=> true,
											'msg'		=> 'Database is ready'
										];
									}else{
										$item->connection_status = (object)[
											'result'	=> false,
											'msg'		=> 'Database is NOT ready'
										];
									}
								}
								// error log when fails
									if ($item->connection_status->result===false) {
										debug_log(__METHOD__
											." ".$item->connection_status->msg . ' ['.$item->database_name.']'
											, logger::ERROR
										);
									}
								break;

							default:
								// ignore
								break;
						}
					}//end if ($connection_status===true)

				// add diffusion_map item
					$diffusion_map->{$diffusion_group_tipo}[] = $item;
			}//end foreach ($ar_diffusion_element_tipo as $element_tipo)

		}//end foreach ($ar_diffusion_group as $diffusion_group_tipo)
		#dump($diffusion_map, ' diffusion_map by diffusion_group_tipo ++ '.to_string());

		return (object)$diffusion_map;
	}//end get_ar_diffusion_map



	/**
	* GET_AR_DIFFUSION_MAP_ELEMENTS
	* @param string $diffusion_domain_name = DEDALO_DIFFUSION_DOMAIN
	* @return array $ar_diffusion_map_elements
	* 	Sample (assoc array):
	* 	{
	*	    "murapa3": {
	*	        "element_tipo": "murapa3",
	*	        "name": "Publish to web",
	*	        "class_name": "diffusion_mysql",
	*	        "database_name": "web_murapa",
	*	        "database_tipo": "murapa4"
	*	    }
	*	}
	*/
	public static function get_ar_diffusion_map_elements( string $diffusion_domain_name=DEDALO_DIFFUSION_DOMAIN ) : array {

		$diffusion_map = self::get_diffusion_map($diffusion_domain_name);

		# Get only diffusion_elements, ignore groups
		$diffusion_map_elements = array();
		foreach ($diffusion_map as $ar_value) foreach ($ar_value as $group_tipo => $obj_value) {
			$diffusion_map_elements[$obj_value->element_tipo] = $obj_value;
		}

		return $diffusion_map_elements;
	}//end get_ar_diffusion_map_elements



	/**
	* DIFFUSION_COMPLETE_DUMP
	* catch calls only
	*/
	public function diffusion_complete_dump($diffusion_element, bool $resolve_references=true) {
		// Override in every heritage class
		throw new Exception("Error Processing Request", 1);
	}//end diffusion_complete_dump



	/**
	* HAVE_SECTION_DIFFUSION
	* Return correspondence of current section in diffusion domain
	* Note: For better control, sections are related terms of diffusion_elements.
	* This correspondence always must exists in diffusion map
	* @param string $section_tipo
	* @param array $ar_diffusion_map_elements = null
	* @return bool $have_section_diffusion
	*/
	public static function have_section_diffusion(string $section_tipo, array $ar_diffusion_map_elements=null) : bool {

		// cache
			$use_cache = true;
			if ($use_cache===true) {
				// session
				if (isset($_SESSION['dedalo']['config']['have_section_diffusion'][$section_tipo])) {
					return $_SESSION['dedalo']['config']['have_section_diffusion'][$section_tipo];
				}
			}

		$have_section_diffusion = false;

		if (is_null($ar_diffusion_map_elements)) {
			# calculate all
			$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
		}
		// dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($section_tipo).' - DEDALO_DIFFUSION_DOMAIN:'.DEDALO_DIFFUSION_DOMAIN);
		foreach ($ar_diffusion_map_elements as $diffusion_group_tipo => $obj_value) {

			$diffusion_element_tipo = $obj_value->element_tipo;

			$ar_related = diffusion::get_diffusion_sections_from_diffusion_element($diffusion_element_tipo, $obj_value->class_name);
			if(in_array($section_tipo, $ar_related)) {
				$have_section_diffusion = true;
				break;
			}
		}

		// cache
			if ($use_cache===true) {
				// session
				$_SESSION['dedalo']['config']['have_section_diffusion'][$section_tipo] = $have_section_diffusion;
			}


		return $have_section_diffusion;
	}//end have_section_diffusion



	/**
	* GET_DIFFUSION_SECTIONS_FROM_DIFFUSION_ELEMENT
	* @param string $diffusion_element_tipo
	* @param string $class_name
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element(string $diffusion_element_tipo, string $class_name) : array {

		// cache
			// static $diffusion_sections_from_diffusion_element;
			// if (isset($diffusion_sections_from_diffusion_element[$diffusion_element_tipo])) {
			// 	return $diffusion_sections_from_diffusion_element[$diffusion_element_tipo];
			// }

		include_once DEDALO_CORE_PATH.'/diffusion/class.'.$class_name.'.php';

		$ar_diffusion_sections = $class_name::get_diffusion_sections_from_diffusion_element($diffusion_element_tipo);

		// cache
			// $diffusion_sections_from_diffusion_element[$diffusion_element_tipo] = $ar_diffusion_sections;


		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element



	/**
	* GET_RESOLVE_LEVELS
	* Get resolve levels value form config file or from session if defined
	* @return int $resolve_levels
	*/
	public static function get_resolve_levels() : int {

		$resolve_levels = isset($_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'])
			? $_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS']
			: (defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : 2);

		return $resolve_levels;
	}//end get_resolve_levels



	// BUILD JSON DATA IN //////////////////////////////////////////////////////////////////////



	/**
	* BUILD_ID
	* @param string $section_tipo
	* @param string|int $section_id
	* @return string $id like 'oh_1'
	* @return string $id
	*/
	public static function build_id(string $section_tipo, string|int $section_id, string $lang) {

		$id = $section_tipo .'_'. $section_id .'_'. $lang ;

		return $id;
	}//end build_id



	/**
	* BUILD_JSON_ROW
	* @param object $options
	* @return object $json_row
	*	JSON object with all field : field_value in given lang
	*/
	public static function build_json_row(object $options) : stdClass {

		// options
			$section_tipo			= $options->section_tipo ?? null;
			$section_id				= $options->section_id ?? null;
			$diffusion_element_tipo	= $options->diffusion_element_tipo ?? null;
			$lang					= $options->lang ?? null;

		// fields
			$ar_fields = self::get_table_fields( $diffusion_element_tipo, $section_tipo );

		// value
			$row = new stdClass();

				$item = new stdClass();
					$item->value = diffusion::build_id($section_tipo, $section_id, $lang);
					$item->model = 'field_text';
				$row->id = $item;

				$item = new stdClass();
					$item->value = $section_tipo;
					$item->model = 'field_text';
				$row->section_tipo = $item;

				$item = new stdClass();
					$item->value = $section_id;
					$item->model = 'field_int';
				$row->section_id = $item;

				$item = new stdClass();
					$item->value = $lang;
					$item->model = 'field_text';
				$row->lang = $item;

				$item = new stdClass();
					$item->value = date('Y-m-d H:i:s');
					$item->model = 'field_date';
				$row->publish_date = $item;

				# resolve each field
				foreach ($ar_fields as $field) {
					#if ($field->label==='publication') continue;

					$value = self::get_field_value($field->tipo, $section_tipo, $section_id, $lang, $options);

					#if (is_array($value) || is_object($value)) {
					#	$value = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
					#}
					$diffusion_model = RecordObj_dd::get_modelo_name_by_tipo($field->tipo,true);

					$item = new stdClass();
						$item->value = $value;
						$item->model = $diffusion_model;

					// Add value
					$row->{$field->label} = $item;
				}


		return $row;
	}//end build_json_row



	/**
	* GET_FIELD_VALUE
	* @param string $tipo
	*	Tipo of diffusion 'field' like 'oh111'
	* @param string $section_tipo
	*	Current working section tipo like 'oh1'
	* @param int $section_id
	*	Current section_id like 1
	* @param string $lang
	*	Current lang like 'lg-eng'
	* @param object $request_options
	*	Is pass-through update record request_options param
	*
	* @return mixed $field_value
	*	Is the diffusion value of component called by field. Can be null, array, string, int
	*/
	public static function get_field_value(string $tipo, string $section_tipo, $section_id, string $lang, object $request_options) {

		$field_value = null;

		// Diffusion element (current column/field)
			$diffusion_term		= new RecordObj_dd($tipo);
			$properties			= $diffusion_term->get_propiedades(true);	# Format: {"data_to_be_used": "dato"}
			// $diffusion_model	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		// Component
			$ar_related			= common::get_ar_related_by_model('component_', $tipo, false);
			$component_tipo		= reset($ar_related); //RecordObj_dd::get_ar_terminos_relacionados($tipo, false, true)[0];
			$model_name			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			#$real_section_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($component_tipo, 'section', 'parent')[0];
			$current_component	= component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'list', // Note that 'list' mode have dato fallback (in section)
				$lang,
				$section_tipo,
				false
			);

			// dato
			$dato = (property_exists($properties, 'get_field_value') && isset($properties->get_field_value->get_dato_method))
				? $current_component->{$properties->get_field_value->get_dato_method}()
				: $current_component->get_dato();


		# switch cases
			switch (true) {

				case ($model_name==='component_publication'):
					$field_value = (isset($dato[0]->section_id) && (int)$dato[0]->section_id===NUMERICAL_MATRIX_VALUE_YES) ? true : false;
					break;

				case (is_object($properties) && property_exists($properties, 'data_to_be_used')):
					switch ($properties->data_to_be_used) {
						case 'dato':
							# Unresolved data
							/*
								if (is_array($dato)) {
									$ar_id = array();
									foreach ($dato as $current_locator) {
										$ar_id[] = $current_locator->section_id;
									}
									$field_value = $ar_id;
								}
								*/
							$field_value = $dato;
							break;
						// NEED TO BE FIXED NEW DATAFRAME
						case 'ds':
							$ar_term_ds = [];
							foreach ((array)$dato as $current_locator) {
								if (isset($current_locator->ds)) foreach ($current_locator->ds as $ar_locator_ds) {
									foreach ($ar_locator_ds  as $locator_ds) {
										$ar_term_ds[] = ts_object::get_term_by_locator($locator_ds, $lang, true);
									}
								}
							}
							if (!empty($ar_term_ds)) {
								$field_value = implode('|', $ar_term_ds);
							}
							break;
						// NEED TO BE FIXED NEW DATAFRAME
						case 'dataframe':
							$ar_term_dataframe = [];
							foreach ((array)$dato as $current_locator) {
								if (isset($current_locator->dataframe)) foreach ($current_locator->dataframe as $locator_dataframe) {
									$ar_term_dataframe[] = ts_object::get_term_by_locator($locator_dataframe, $lang, true);
								}
							}
							if (!empty($ar_term_dataframe)) {
								$field_value = implode('|', $ar_term_dataframe);
							}
							break;
						default:
							debug_log(__METHOD__." INVALID DATA_TO_BE_USED MODE (ignored tipo: $component_tipo) 'data_to_be_used': ".to_string($properties->data_to_be_used), logger::DEBUG);
							break;
					}
					break;

				case (is_object($properties) && property_exists($properties, 'process_dato')):
					# Process dato with function
					$options = $request_options;
						$options->properties		= $properties;
						$options->tipo				= $tipo;
						$options->component_tipo	= $component_tipo;
						$options->section_id		= $section_id;

					$function_name 	= $properties->process_dato;
					$field_value 	= call_user_func($function_name, $options, $dato);
					break;

				default:
					# Set unified diffusion value
					$field_value = $current_component->get_diffusion_value($lang);
					break;
			}//switch (true)


		return $field_value;
	}//end get_field_value



	/**
	* RESOLVE_COMPONENT_VALUE
	* Intermediate method to call component methods from diffusion
	* @param object $options
	* @param mixed $dato
	* @return mixed $value
	*/
	public static function resolve_component_value( object $options, $dato ) {

		# Ref. $options
		# [typology] =>
		# [value] =>
		# [tipo] => mdcat2447
		# [component_tipo] => mdcat1536
		# [section_id] => 1
		# [lang] => lg-fra
		# [section_tipo] => mdcat597
		# [caler_id] => 3
		# [properties] => stdClass Object
		#     (
		#         [varchar] => 1024
		#         [process_dato] => diffusion_sql::resolve_value
		#         [process_dato_arguments] => stdClass Object
		#             (
		#                 [target_component_tipo] => rsc92
		#                 [component_method] => map_locator_to_term_id
		#             )
		#     )
		# [diffusion_element_tipo] => mdcat353

		$process_dato_arguments	= (object)$options->properties->process_dato_arguments;
		$method					= $process_dato_arguments->component_method;
		$custom_arguments		= isset($process_dato_arguments->custom_arguments) ? $process_dato_arguments->custom_arguments : [];


		$component_tipo = isset($options->component_tipo) ? $options->component_tipo : common::get_ar_related_by_model('component_', $options->tipo, $strict=false)[0];
		$model_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);

		$section_id = !empty($options->section_id)
			? $options->section_id
			: $options->parent;


		if ($method==='get_diffusion_value') {
			// inject mandatory lang
			array_unshift($custom_arguments, $options->lang);
		}

		$component = component_common::get_instance(
			$model_name,
			$component_tipo,
			$section_id,
			'list',
			$options->lang,
			$options->section_tipo,
			false
		);

		// check function exits
			if (!method_exists($component, $method)) {
				debug_log(__METHOD__
					. " An error occurred calling function - Method do not exists !  " . PHP_EOL
					. ' method: ' . to_string($method) . PHP_EOL
					. ' model_name: '  . $model_name
					, logger::ERROR
				);
			}

		$value = call_user_func_array(array($component, $method), $custom_arguments);

		# Do not change output format (!)
		#if (is_array($value) || is_object($value)) {
		#	$value = json_encode($value);
		#}


		return $value;
	}//end resolve_component_value



	/**
	* GET_TABLE_FIELDS
	* Resolve all fields of a 'table' element inside a given 'diffusion_element'
	* Uses diffusion MYSQL tables model
	* @param string $diffusion_element_tipo
	* @param string $section_tipo
	* @return array $ar_table_children
	*/
	public static function get_table_fields(string $diffusion_element_tipo, string $section_tipo) : array {

		$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $diffusion_element_tipo );
			// dump($diffusion_element_tables_map, ' diffusion_element_tables_map ++ '.to_string($diffusion_element_tipo));

		if (!isset($diffusion_element_tables_map->{$section_tipo})) {
			return [];
		}

		$RecordObj_dd 	   = new RecordObj_dd($diffusion_element_tables_map->{$section_tipo}->table);
		$ar_table_children = $RecordObj_dd->get_ar_childrens_of_this();

		# Add children from table alias too
			if (!empty($diffusion_element_tables_map->from_alias)) {
				$RecordObj_dd_alias 	 = new RecordObj_dd($diffusion_element_tables_map->{$section_tipo}->from_alias);
				$ar_table_alias_children = (array)$RecordObj_dd_alias->get_ar_childrens_of_this();

				# Merge all
				$ar_table_children = array_merge($ar_table_children, $ar_table_alias_children);
			}

		$ar_table_fields = [];
		foreach ($ar_table_children as $tipo) {

			$item = new stdClass();
				$item->tipo 	= $tipo;
				$item->label 	= RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_STRUCTURE_LANG, true);

			$ar_table_fields[] = $item;
		}


		return $ar_table_fields;
	}//end get_table_fields



	// BUILD JSON DATA OUT //////////////////////////////////////////////////////////////////////



	/**
	* MAP_SECTION_ID_TO_SUBTITLES_URL
	* @param object $options
	* @param mixed $dato
	* @return string $subtitles_url
	*/
	public static function map_section_id_to_subtitles_url(object $options, mixed $dato) : string {

		require_once(DEDALO_SHARED_PATH . '/class.subtitles.php');

		$section_id		= (int)$dato;
		$lang			= $options->lang ?? DEDALO_DATA_LANG;
		$subtitles_url	= subtitles::get_subtitles_url($section_id, $tc_in=null, $tc_out=null, $lang);

		return $subtitles_url;
	}//end map_section_id_to_subtitles_url



	/**
	* MAP_IMAGE_INFO
	* @param object $options
	* sample:
	* {
	* 	"typology": null,
	*    "value": null,
	*    "tipo": "mht136",
	*    "parent": "612",
	*    "lang": "lg-spa",
	*    "section_tipo": "rsc170",
	*    "caler_id": 3,
	*    "properties": {
	*        "varchar": 1000,
	*        "process_dato": "diffusion::map_image_info"
	*    },
	*    "diffusion_element_tipo": "mht50",
	*    "component": { ... }
	* }
	* @param $dato
	* sample:
	* [{
	*	    "lib_data": null,
	*	    "files_info": [
	*	        {
	*	            "quality": "original",
	*	            "file_url": "/dedalo/media/image/original/0/rsc29_rsc170_704.jpg",
	*	            "file_name": "rsc29_rsc170_704.jpg",
	*	            ...
	*	        }, ...
	*	 	]
	* }]
	* @return object $image_size
	*/
	public static function map_image_info(object $options, $dato) : ?object {

		// dato check
			if (empty($dato)) {
				return null;
			}

		// component image
			$component = $options->component;

		// Dimensions from default quality
			$default_quality	= $component->get_default_quality();
			$path				= $component->get_media_filepath($default_quality);
			$image_dimensions	= $component->get_image_dimensions($path);
			if (empty($image_dimensions)) {
				return null;
			}
			// Response sample (from PHP exif_read_data)
			// {
			// 	width => 720,
			// 	height => 404
			// }

		// image_info object
			$image_info = new stdClass();
				$image_info->width	= $image_dimensions->width ?? null;
				$image_info->height	= $image_dimensions->height ?? null;


		return $image_info;
	}//end map_image_info



	/**
	* GET_IS_PUBLICABLE
	* Locate component_publication in requested locator section and get its boolean value
	* used by portals to determine what locators will be include as 'dato' to publish
	* @param object $locator
	* @return bool $is_publicable
	*/
	public static function get_is_publicable(object $locator) : bool {

		$section_tipo	= $locator->section_tipo;
		$section_id		= $locator->section_id;
		$uid			= $section_tipo.'_'.$section_id;

		static $resolved_is_publicable;
		if (isset($resolved_is_publicable[$uid])) {
			return $resolved_is_publicable[$uid];
		}

		// Locate component_publication in current section
		$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo, // string section_tipo
			['component_publication'], // array ar_modelo_name_required
			true, // bool from_cache
			true, // bool resolve_virtual
			true, // bool recursive
			true, // bool search_exact
			false // array|bool ar_tipo_exclude_elements
		);
		// Check list of values cases (returns is_publicable true by default)
		if (empty($ar_children)) {
			return true;
		}

		$component_publication_tipo = reset($ar_children);

		$is_publicable = (bool)self::get_component_publication_bool_value($component_publication_tipo, $section_id, $section_tipo);

		// cache
		$resolved_is_publicable[$uid] = $is_publicable;

		return $is_publicable;
	}//end get_is_publicable



	/**
	* GET_COMPONENT_PUBLICATION_TIPO
	* @param array $ar_fields_tipo
	* @return string|bool $component_publication_tipo
	*/
	public static function get_component_publication_tipo($ar_fields_tipo) {

		$component_publication_tipo = false;

		// section::get_ar_children_tipo_by_model_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false)

		foreach ($ar_fields_tipo as $curent_children_tipo) {

			$ar_related = common::get_ar_related_by_model('component_publication', $curent_children_tipo);
				#dump($component_publication, ' component_publication ++ '.to_string($curent_children_tipo));

			if (!empty($ar_related)) {
				$component_publication_tipo = reset($ar_related);
				break;
			}
		}

		return $component_publication_tipo;
	}//end get_component_publication_tipo



	/**
	* GET_COMPONENT_PUBLICATION_BOOL_VALUE
	* @param string $component_publication_tipo
	* @param string|int $section_id
	* @param string $section_tipo
	* @return bool
	*/
	public static function get_component_publication_bool_value(string $component_publication_tipo, string|int $section_id, string $section_tipo) : bool {

		$component_publication = component_common::get_instance(
			'component_publication',
			$component_publication_tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo,
			false
		);
		$dato = $component_publication->get_dato();

		if (isset($dato[0]) &&
			isset($dato[0]->section_tipo) && $dato[0]->section_tipo === DEDALO_SECTION_SI_NO_TIPO &&
			isset($dato[0]->section_id)   && (int)$dato[0]->section_id === NUMERICAL_MATRIX_VALUE_YES) {

			return true;
		}

		return false;
	}//end get_component_publication_bool_value



	/**
	* ADD_TO_UPDATE_RECORD_ACTIONS
	* @param object $request_options
	* @return bool
	*/
	public static function add_to_update_record_actions(object $request_options) : bool {

		$added = false;

		// options parse from request_options
			$options = new stdClass();
				$options->component_tipo			= null;
				$options->section_tipo				= null;
				$options->section_id				= null;
				$options->lang						= DEDALO_DATA_LANG;
				$options->model						= null;
				$options->diffusion_element_tipo	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		switch ($options->model) {
			case 'component_text_area':
				// Check component index tags
				$component 	= component_common::get_instance(
					$options->model,
					$options->component_tipo,
					$options->section_id,
					'list',
					$options->lang,
					$options->section_tipo
				);
				$ar_indexations = $component->get_component_tags_data('index'); # DEDALO_RELATION_TYPE_INDEX_TIPO dd96
					// dump($ar_indexations, ' ar_indexations +++++++++++++++++++++++++++++++ '." section_id: $options->section_id - lang: $options->lang - dato:";

				if (!empty($ar_indexations)) {
					foreach ($ar_indexations as $current_locator) {

						# locator like...
							# {
							# 	[type] => dd96
							# 	[tag_id] => 1
							# 	[section_id] => 13
							# 	[section_tipo] => rsc167
							# 	[component_tipo] => rsc36
							# 	[section_top_id] => 44
							# 	[section_top_tipo] => oh1
							# 	[from_component_tipo] => hierarchy40
							# 	[from_section_tipo] => ts1
							# 	[from_section_id] => 29
							# }
						// v6 locator
							// {
							//	"type": "dd96",
							//	"tag_id": "1",
							//	"section_id": "16",
							//	"section_tipo": "dc1",
							//	"section_top_id": "3",
							//	"section_top_tipo": "oh1",
							//	"tag_component_tipo": "rsc36",
							//	"from_component_tipo": "rsc860"
							// }

						$options_update_record = new stdClass();
							// $options_update_record->section_tipo			= $current_locator->from_section_tipo;
							// $options_update_record->section_id			= $current_locator->from_section_id;
							$options_update_record->section_tipo			= $current_locator->section_tipo;
							$options_update_record->section_id				= $current_locator->section_id;
							$options_update_record->recursion_level			= 0;
							$options_update_record->diffusion_element_tipo	= $options->diffusion_element_tipo;

						$ar_found = array_filter(diffusion::$update_record_actions, function($item) use($options_update_record){
							return ($item->section_tipo===$options_update_record->section_tipo && $item->section_id===$options_update_record->section_id);
						});
						if (count($ar_found)===0) {
							// add unique
								diffusion::$update_record_actions[] = $options_update_record;
						}
					}
				}
				$added = true;
				break;

			default:
				debug_log(__METHOD__
					." Error on add. Ignored not defined model" . PHP_EOL
					." model: " . to_string($options->model)
					, logger::ERROR
				);
				break;
		}


		return $added;
	}//end add_to_update_record_actions



	/**
	* DELETE_RECORD
	* @param string $section_tipo
	* @param string|int $section_id
	* @return object $response
	*/
	public static function delete_record(string $section_tipo, string|int $section_id) : object {

		$response = new stdClass();
			$response->result		= false;
			$response->msg			= __METHOD__ . ' Warning. Nothing is deleted for '.$section_tipo.'-'.$section_id;
			$response->ar_deleted	= [];

		$ar_diffusion_element = self::get_ar_diffusion_map_elements();
		foreach ($ar_diffusion_element as $diffusion_element) {

			$diffusion_element_tipo	= $diffusion_element->element_tipo;
			$class_name				= $diffusion_element->class_name;

			switch ($class_name) {
				case 'diffusion_mysql':

					$database_name = $diffusion_element->database_name;

					$table_name = false;

					// table real
						$ar_tables_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
							$diffusion_element_tipo,
							'table',
							'children_recursive',
							true
						);
						foreach ($ar_tables_tipo as $table_tipo) {
							$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
								$table_tipo,
								'section',
								'termino_relacionado',
								true
							);
							if (!isset($ar_section_tipo[0])) {
								debug_log(__METHOD__." Error. Diffusion section without section relation (1). Please fix this ASAP. Table tipo: ".to_string($table_tipo)." - name: ".RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true), logger::ERROR);
								continue;
							}

							$current_section_tipo = $ar_section_tipo[0];
							if ($current_section_tipo===$section_tipo) {
								// matched . delete record in current table
								$table_name = RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true);
								break; // stop loop
							}
						}

					// table alias
						if ($table_name===false) {

							$ar_tables_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
								$diffusion_element_tipo,
								'table_alias',
								'children_recursive',
								true
							);
							foreach ($ar_tables_tipo as $table_tipo) {

								// direct relation case (used mainly in thesaurus tables)
									$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
										$table_tipo,
										'section',
										'termino_relacionado',
										true
									);
									if (empty($ar_section_tipo)) {
										// try to search section in target table
											$real_table_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
												$table_tipo,
												'table',
												'termino_relacionado',
												true
											);
											if (!empty($real_table_tipo)) {
												$real_table_tipo = reset($real_table_tipo);
												$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
													$real_table_tipo,
													'section',
													'termino_relacionado',
													true
												);
											}
									}
									if (!isset($ar_section_tipo[0])) {
										debug_log(__METHOD__." Error. Diffusion section without section relation (2). Please fix this ASAP. Table tipo: ".to_string($table_tipo)." - name: ".RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true), logger::ERROR);
										continue;
									}

									$current_section_tipo = $ar_section_tipo[0];
									if ($current_section_tipo===$section_tipo) {
										// matched . delete record in current table
										$table_name = RecordObj_dd::get_termino_by_tipo($table_tipo, DEDALO_STRUCTURE_LANG, true);
										break; // stop loop
									}
							}
						}

					// delete
						if ($table_name!==false) {
							include_once(DEDALO_CORE_PATH . '/diffusion/class.'.$class_name.'.php');
							$result = (bool)diffusion_sql::delete_sql_record($section_id, $database_name, $table_name, $section_tipo);
							if ($result===true) {
								$response->result		= true;
								$response->msg			= "Deleted record successfully ($table_name - $section_id) in db $database_name (all langs)";
								$response->ar_deleted[]	= (object)[
									"section_id"				=> $section_id,
									"section_tipo"				=> $section_tipo,
									"database_name"				=> $database_name,
									"table_name"				=> $table_name,
									"diffusion_element_tipo"	=> $diffusion_element_tipo,
									"class_name"				=> $class_name
								];
								debug_log(__METHOD__
									. " Record successfully deleted (all langs) " . PHP_EOL
									. ' table_name: ' . $table_name . PHP_EOL
									. ' database_name: ' . $database_name . PHP_EOL
									. ' section_tipo: ' . $section_tipo . PHP_EOL
									. ' section_id: ' . $section_id . PHP_EOL
									. ' class_name: ' . $class_name . PHP_EOL
									, logger::WARNING
								);
							}else{
								$response->msg = "Unable to delete record ($table_name - $section_id). Maybe the record do not exists in MySQL db: '$database_name' table: '$table_name' ";
								debug_log(__METHOD__
									. " $response->msg " . PHP_EOL
									. ' table_name: ' . $table_name . PHP_EOL
									. ' database_name: ' . $database_name . PHP_EOL
									. ' section_tipo: ' . $section_tipo . PHP_EOL
									. ' section_id: ' . $section_id . PHP_EOL
									. ' class_name: ' . $class_name . PHP_EOL
									, logger::WARNING
								);
							}
						}
					break;

				case 'diffusion_rdf':
					$response->result	= true;
					$response->msg		= __METHOD__ . ' Ignored delete_record call for diffusion_rdf. Class diffusion_rdf do not provide delete feature';
					break;

				default:
					debug_log(__METHOD__
						." WARNING. Ignored delete_record for class (name not defined for delete) " . PHP_EOL
						. ' class_name: ' . $class_name
						, logger::WARNING
					);
					break;

			}//end switch ($class_name)
		}//end foreach ($ar_diffusion_element as $diffusion_element)

		// debug
			debug_log(__METHOD__
				." Delete response: " . PHP_EOL
				. json_encode($response, JSON_PRETTY_PRINT)
				, logger::DEBUG
			);


		return $response;
	}//end delete_record



	/**
	* UPDATE_PUBLICATION_DATA
	*
	* @param string $section_tipo
	* @param string|int $section_id
	* @return bool
	*/
	public static function update_publication_data(string $section_tipo, string|int $section_id) : bool {

		// tipos
			$publication_first_tipo			= diffusion::$publication_first_tipo;
			$publication_last_tipo			= diffusion::$publication_last_tipo;
			$publication_first_user_tipo	= diffusion::$publication_first_user_tipo;
			$publication_last_user_tipo		= diffusion::$publication_last_user_tipo;

		// current date in dd_date format (usable as dato)
			$current_date_dato = new stdClass();
				$current_date_dato->start = component_date::get_date_now();

		// current user dato
			$user_id = logged_user_id();

		// first . component publication first. save if not exist
			// date
				$model_name	= RecordObj_dd::get_modelo_name_by_tipo($publication_first_tipo,true);
				$component	= component_common::get_instance(
					$model_name,
					$publication_first_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$dato = $component->get_dato();
				if (empty($dato)) {
					$component->set_dato($current_date_dato);
					// section avoid save_modified by user in diffusion
						$section = $component->get_my_section();
						$section->save_modified = false;
					$component->Save();
					$save_first = true;
				}
			// user
				if (isset($save_first)) {

					$model_name	= RecordObj_dd::get_modelo_name_by_tipo($publication_first_user_tipo,true);
					$component	= component_common::get_instance(
						$model_name,
						$publication_first_user_tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$locator = new locator();
						$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
						$locator->set_section_id($user_id);
						$locator->set_type(DEDALO_RELATION_TYPE_LINK);
						$locator->set_from_component_tipo($publication_first_user_tipo);

					$component->set_dato([$locator]);
					// section avoid save_modified by user in diffusion
						$section = $component->get_my_section();
						$section->save_modified = false;
					$component->Save();
				}

		// last . publication last. save updated date always
			// date
				$model_name	= RecordObj_dd::get_modelo_name_by_tipo($publication_last_tipo,true);
				$component	= component_common::get_instance(
					$model_name,
					$publication_last_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$component->set_dato($current_date_dato);
				// section avoid save_modified by user in diffusion
					$section = $component->get_my_section();
					$section->save_modified = false;
				$component->Save();

			// user
				$model_name	= RecordObj_dd::get_modelo_name_by_tipo($publication_last_user_tipo,true);
				$component	= component_common::get_instance(
					$model_name,
					$publication_last_user_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
					$locator->set_section_id($user_id);
					$locator->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator->set_from_component_tipo($publication_last_user_tipo);

				$component->set_dato([$locator]);
				// section avoid save_modified by user in diffusion
					$section = $component->get_my_section();
					$section->save_modified = false;
				$component->Save();

		// debug
			debug_log(__METHOD__
				." Updated publication date in section: $section_tipo, $section_id "
				, logger::DEBUG
			);


		return true;
	}//end update_publication_data



	/**
	* GET_PUBLICATION_UNIX_TIMESTAMP
	* @return int $publication_ux_tm
	* 	Like 1660338149
	*/
	public static function get_publication_unix_timestamp() {
		static $publication_ux_tm;

		if (isset($publication_ux_tm)) {
			return $publication_ux_tm;
		}

		$publication_ux_tm = time();

		return $publication_ux_tm;
	}//end get_publication_unix_timestamp



	/**
	* PARSE_DATABASE_ALIAS_TABLES
	*
	* @param array $ar_table_tipo
	* 	Current list of tables tipo resolved from target database element
	* @param string $database_alias_tipo
	* 	tipo of current database alias
	* @return array $ar_table_tipo_edit
	* 	Modified version of the original table list
	*/
	public static function parse_database_alias_tables(array $ar_table_tipo, string $database_alias_tipo) : array {

		// original_ar_table_tipo. Source possible additional tables
			$original_ar_table_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
				$database_alias_tipo, // Original database_alias element
				'table', // modelo_name
				'children_recursive', // relation_type
				false // search_exact (allow 'table' and 'table_alias')
			);
			// dump($original_ar_table_tipo, ' original_ar_table_tipo ++ '.to_string());
			if (empty($original_ar_table_tipo)) {
				// nothing to parse or add. Stop here
				return $ar_table_tipo;
			}

		$ar_table_tipo_edit	= $ar_table_tipo; // start coping source table
		$replaced_list		= []; // for debug only
		foreach ($original_ar_table_tipo as $key => $current_table_tipo) {
			$current_model = RecordObj_dd::get_modelo_name_by_tipo($current_table_tipo,true);
			if ($current_model==='table') {
				// add
				$ar_table_tipo[] = $current_table_tipo;
			}
			else if($current_model==='table_alias') {
				// find related terms
				$current_ar_table_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
					$current_table_tipo, // Original database
					'table', // modelo_name
					'termino_relacionado', // relation_type
					true // search_exact (allow only 'table')
				);
				if (isset($current_ar_table_tipo[0])) {

					// replace it if was found
					$value			= $current_ar_table_tipo[0];
					$replacement	= $current_table_tipo;

					$found_key = array_search($value, $ar_table_tipo_edit);
					if (false!==$found_key) {
						// debug only
						$replaced_list[] = (object)[
							'from'			=> $value,
							'from_model'	=> RecordObj_dd::get_modelo_name_by_tipo($value,true),
							'from_label'	=> RecordObj_dd::get_termino_by_tipo($value),
							'to'			=> $replacement,
							'to_model'		=> RecordObj_dd::get_modelo_name_by_tipo($replacement,true),
							'to_label'		=> RecordObj_dd::get_termino_by_tipo($replacement),
						];
						$ar_table_tipo_edit[$found_key] = $replacement;
					}
				}
			}
		}//end foreach ($original_ar_table_tipo as $key => $current_table_tipo)
		// dump($ar_table_tipo, ' ar_table_tipo ++ '.to_string($database_alias_tipo));
		// dump($ar_table_tipo_edit, ' FINAL ar_table_tipo_edit ++++++++++++++++++++++++++++ '.to_string());
		debug_log(__METHOD__." Replaced some tables in database list: ".PHP_EOL.json_encode($replaced_list, JSON_PRETTY_PRINT), logger::WARNING);


		return $ar_table_tipo_edit;
	}//end parse_database_alias_tables



	/**
	* UPDATE_PUBLICATION_SCHEMA
	* @param string $diffusion_element_tipo
	* @return object $response
	*/
	public static function update_publication_schema(string $diffusion_element_tipo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= __METHOD__. ' Error. Request failed';


		$RecordObj_dd	= new RecordObj_dd($diffusion_element_tipo);
		$propiedades	= $RecordObj_dd->get_propiedades(true);
		$schema_obj		= (is_object($propiedades) && isset($propiedades->publication_schema))
			? $propiedades->publication_schema
			: false;

		// no propiedades configured case
			if (empty($schema_obj)) {
				return $response;
			}

		$class_name = isset($propiedades->diffusion->class_name) ? $propiedades->diffusion->class_name : false;

		switch ($class_name) {
			case 'diffusion_mysql':
				// databases
				$databases = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
					$diffusion_element_tipo, // string tipo
					'database', // string modelo_name
					'children', // string relation_type
					false // bool search_exact switch between 'database' or contains 'database' like 'database_alias'
				);
				if (isset($databases[0])) {
					// Loads parent class diffusion
					// include_once(DEDALO_LIB_BASE_PATH . '/diffusion/class.'.$class_name.'.php');
					// get_termino_by_tipo($terminoID, $lang=NULL, $from_cache=false, $fallback=true)
					$database_name	= RecordObj_dd::get_termino_by_tipo($databases[0]);

					// save_table_schema. Use save_table_schema response as this method response
					$response = (object)diffusion_sql::save_table_schema( $database_name, $schema_obj );
				}else{
					$response->msg .= " Database not found in structure for diffusion element: '$diffusion_element_tipo' ";
				}
				break;

			default:
				// Nothing to do
				$response->result	= true;
				$response->msg		= "Ignored publication_schema for class_name: '$class_name' ";
				break;
		}

		return $response;
	}//end update_publication_schema



}//end class
