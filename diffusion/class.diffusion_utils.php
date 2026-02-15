<?php declare(strict_types=1);

/**
 * DIFFUSION_UTILS
 * Utility class for common diffusion mapping and resolution logic.
 * Extracted from diffusion_sql to support the new format-agnostic API.
 */
class diffusion_utils {


    /**
     * IS_PUBLISHABLE
     * Locate component_publication in requested locator section and get its boolean value.
     */
    public static function is_publishable(object $locator): bool {
        
        $section_tipo = $locator->section_tipo;
        $section_id   = $locator->section_id;
        $uid          = $section_tipo . '_' . $section_id;

        static $resolved_is_publishable;
        if (isset($resolved_is_publishable[$uid])) {
            return $resolved_is_publishable[$uid];
        }

        // Locate component_publication in current section
        $ar_children = section::get_ar_children_tipo_by_model_name_in_section(
            $section_tipo,
            ['component_publication'],
            true, 
            true, 
            true, 
            true
        );
        
        if (empty($ar_children)) {
            return true;
        }

        $component_publication_tipo = reset($ar_children);
        $is_publishable = (bool)self::get_component_publication_bool_value($component_publication_tipo, $section_id, $section_tipo);

        $resolved_is_publishable[$uid] = $is_publishable;

        return $is_publishable;
    }

    /**
     * GET_COMPONENT_PUBLICATION_BOOL_VALUE
     */
    public static function get_component_publication_bool_value(string $component_publication_tipo, string|int $section_id, string $section_tipo): bool {
        
        $component_publication = component_common::get_instance(
            'component_publication',
            $component_publication_tipo,
            $section_id,
            'list',
            DEDALO_DATA_NOLAN,
            $section_tipo,
            false
        );
        $data = $component_publication->get_data();

        if (isset($data[0]) &&
            isset($data[0]->section_tipo) && $data[0]->section_tipo === DEDALO_SECTION_SI_NO_TIPO &&
            isset($data[0]->section_id)   && (int)$data[0]->section_id === NUMERICAL_MATRIX_VALUE_YES) {

            return true;
        }

        return false;
    }

    /**
     * GET_RELATED_SECTION_TIPO
     * Finds the section node tipo related to any ontology node.
     * Searches unidirectional relations.
     * @param string $tipo
     * @return string|null
     */
    public static function get_related_section_tipo(string $tipo): ?string {
        $node = ontology_node::get_instance($tipo);
        if (!$node) return null;

        $ar_section_tipos = ontology_node::get_ar_tipo_by_model_and_relation($tipo, 'section', 'related', true);
        if (!empty($ar_section_tipos)) {
            return reset($ar_section_tipos);
        }

        // Check parent recursively if no direct relation (standard Dédalo pattern)
        $parent = $node->get_parent();
        if ($parent) {
            return self::get_related_section_tipo($parent);
        }

        return null;
    }

    

    /**
     * GET_DIFFUSION_ELEMENT
     * Recursively searches for the diffusion element in the ontology tree.
     * @param string $ontology_node_tipo
     * @return string|null
     */
	public static function get_diffusion_element(string $ontology_node_tipo): ?string {

		$node = ontology_node::get_instance($ontology_node_tipo);
		if (!$node) return null;
		
		$parent = $node->get_parent();
		if (empty($parent)) return null;

		$model = ontology_node::get_model_by_tipo($parent);
		if ($model === 'diffusion_element') {
			return $parent;
		}else if ($model === 'diffusion_domain') {
			return null;
		} else{
			return self::get_diffusion_element($parent);
		}
		

	}// end get_diffusion_element






















































	/**
	* HAVE_SECTION_DIFFUSION
	* Return correspondence of current section in diffusion domain
	* Note: For better control, sections are related terms of diffusion_elements.
	* This correspondence always must exists in diffusion map
	* @param string $section_tipo
	* @param array|null $ar_diffusion_map_elements = null
	* @return bool $have_section_diffusion
	*/
	public static function have_section_diffusion( string $section_tipo, ?array $ar_diffusion_map_elements=null ) : bool {

		// cache
			$use_cache = true;
			if ($use_cache===true) {
				// session
				if (isset($_SESSION['dedalo']['config']['have_section_diffusion'][$section_tipo])) {                  
					return $_SESSION['dedalo']['config']['have_section_diffusion'][$section_tipo];
				}
			}

		// default is false
		$have_section_diffusion = false;

		// diffusion_map_elements
		$ar_diffusion_map_elements = $ar_diffusion_map_elements ?? self::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);

		// iterate ar_diffusion_map_elements to check sections with diffusion allowed
		foreach ($ar_diffusion_map_elements as $obj_value) {

			$current_diffusion_element_tipo = $obj_value->element_tipo ?? null;
			if (empty($current_diffusion_element_tipo)) {
				debug_log(__METHOD__
					. " Ignored bad diffusion obj_value: element_tipo is mandatory!" . PHP_EOL
					. ' obj_value : ' . to_string($obj_value)
					, logger::ERROR
				);
				continue;
			}

			$current_class_name = $obj_value->class_name ?? null;
			if (empty($current_class_name)) {
				debug_log(__METHOD__
					. " Ignored bad diffusion obj_value: class_name is mandatory!" . PHP_EOL
					. ' obj_value : ' . to_string($obj_value)
					, logger::ERROR
				);
				continue;
			}

			$ar_related = self::get_diffusion_sections_from_diffusion_element(
				$current_diffusion_element_tipo,
				$current_class_name
			);

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
	 * GET_DIFFUSION_INFO
	 * Collects basic tool info needed to create user options
	 * Called on tool build by client to retrieve available diffusion targets
	 *
	 * This method:
	 * - Retrieves diffusion map from ontology
	 * - Filters excluded diffusion elements
	 * - Validates diffusion groups and elements
	 * - Collects table/field information for each target
	 * - Returns configuration for UI rendering
	 *
	 * @param object $options Configuration object with:
	 *   - section_tipo: string Section type identifier - REQUIRED
	 *
	 * @return object Response object with:
	 *   - result: object|false Diffusion info object or false on error:
	 *     - resolve_levels: int Number of reference resolution levels
	 *     - skip_publication_state_check: int Whether to skip publication state check
	 *     - diffusion_map: array Filtered diffusion map
	 *     - ar_data: array Table and field information for each diffusion target
	 *   - msg: string Status message
	 *   - errors: array Error messages if any
	 *
	 * @throws Exception If diffusion map retrieval fails
	 */
	public static function get_diffusion_info(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$section_tipo = $options->section_tipo ?? null;

		// levels default from config
			$resolve_levels = self::get_resolve_levels();

		// diffusion_map
			$diffusion_map = self::get_diffusion_map(
				DEDALO_DIFFUSION_DOMAIN,
				true // bool connection_status
			);

		// tool_config. Look for 'EXCLUDE_DIFFUSION_ELEMENTS' definition in the tool config (section dd996 filtered by tool name)
			$tool_config = tool_common::get_config('tool_diffusion');
			// EXCLUDE_DIFFUSION_ELEMENTS sample:
			// {
			// 	"EXCLUDE_DIFFUSION_ELEMENTS" : ["navarra97","navarra67"]
			// }
			$EXCLUDE_DIFFUSION_ELEMENTS = isset($tool_config->config->EXCLUDE_DIFFUSION_ELEMENTS) && is_array($tool_config->config->EXCLUDE_DIFFUSION_ELEMENTS)
				? $tool_config->config->EXCLUDE_DIFFUSION_ELEMENTS
				: null;
			// fallback to config EXCLUDE_DIFFUSION_ELEMENTS
			if (!$EXCLUDE_DIFFUSION_ELEMENTS) {
				// try with Dédalo config file definition
				$EXCLUDE_DIFFUSION_ELEMENTS = defined('EXCLUDE_DIFFUSION_ELEMENTS') && is_array(EXCLUDE_DIFFUSION_ELEMENTS)
					? EXCLUDE_DIFFUSION_ELEMENTS
					: null;
			}

		// safe diffusion_map
			if (!empty($EXCLUDE_DIFFUSION_ELEMENTS)) {

				$safe_diffusion_map = [];
				$changed = false;
				foreach ($diffusion_map as $diffusion_group => $diffusion_items) {

					$safe_diffusion_items = [];
					foreach ($diffusion_items as $current_item) {
						if (empty($current_item->element_tipo) || in_array($current_item->element_tipo, $EXCLUDE_DIFFUSION_ELEMENTS)) {
							debug_log(__METHOD__
								. " Excluded diffusion element '$current_item->element_tipo'. Included in config EXCLUDE_DIFFUSION_ELEMENTS values" . PHP_EOL
								. ' EXCLUDE_DIFFUSION_ELEMENTS: ' . to_string($EXCLUDE_DIFFUSION_ELEMENTS)
								, logger::WARNING
							);
							$changed = true;
							continue;
						}
						$safe_diffusion_items[] = $current_item;
					}

					// add if not empty
					if (!empty($safe_diffusion_items)) {
						$safe_diffusion_map[$diffusion_group] = $safe_diffusion_items;
					}
				}
				if ($changed) {
					// replace
					$diffusion_map = $safe_diffusion_map;
				}
			}

		// ar_data. Get data about table and fields of current section diffusion target
			$ar_data = [];
			$final_diffusion_map = [];
			foreach ($diffusion_map as $diffusion_group => $diffusion_items) {

				// check diffusion_group model
				$current_model = ontology_node::get_model_by_tipo($diffusion_group, true);
				if ($current_model!=='diffusion_group') {
					debug_log(__METHOD__
						. ' Ignored non diffusion group element' . PHP_EOL
						. ' model: ' . to_string($current_model) . PHP_EOL
						. ' diffusion_group: ' . to_string($diffusion_group)
						, logger::WARNING
					);
					continue;
				}

				// diffusion_group without children case
				if (empty($diffusion_items) || empty($diffusion_items[0])) {
					debug_log(__METHOD__
						. ' Ignored empty diffusion group' . PHP_EOL
						. ' diffusion_group: ' . to_string($diffusion_group) . PHP_EOL
						. ' diffusion_items: ' . to_string($diffusion_items)
						, logger::WARNING
					);
					continue;
				}

				// diffusion_element_tipo
				$diffusion_element_tipo = $diffusion_items[0]->element_tipo ?? null; // like oh63 - Historia oral web
				if (!$diffusion_element_tipo) {
					debug_log(__METHOD__
						. " Invalid empty element_tipo " . PHP_EOL
						. ' diffusion_items: ' . to_string($diffusion_items)
						, logger::ERROR
					);
					$response->errors[] = 'Invalid empty element_tipo';
					continue;
				}

				// config: based on class_name and config.php definitions
					$class_name = $diffusion_items[0]->class_name ?? null;
					$config = null;
					switch ($class_name) {
						case 'diffusion_socrata':
							// add config values
							if (defined('SOCRATA_CONFIG') && is_array(SOCRATA_CONFIG)) {
								$config = (object)[
									'server'	=> SOCRATA_CONFIG['server'] ?? null,
									'mode'		=> SOCRATA_CONFIG['mode'] ?? null
								];
							}
							break;
						default:
							$config = null;
							break;
					}

				// Check if current diffusion element have the current section in some item
				// If not, skip non applicable diffusion map element (excluded from $final_diffusion_map array)
					$ar_related = self::get_diffusion_sections_from_diffusion_element(
						$diffusion_element_tipo,
						$class_name
					);
					if(!in_array($section_tipo, $ar_related)) {
						continue;
					}

				// section_tables_map
					$diffusion_element_tables_map	= diffusion_sql::get_diffusion_element_tables_map( $diffusion_element_tipo );
					$section_tables_map				= $diffusion_element_tables_map->{$section_tipo} ?? (object)[
						'database_name'	=> null,
						'name'			=> null
					];

				// table_fields
					if (empty($diffusion_element_tables_map)) {
						$table_fields_info	= null;
						$table_fields		= [];
					}else{
						$table_fields_info	= self::get_table_fields($diffusion_element_tipo, $section_tipo);
						$table_fields		= array_map(function($el){
							return $el->label;
						}, (array)$table_fields_info);
						// add related terms
						foreach ($table_fields_info as $info_item) {
							// $ar_related = common::get_ar_related_by_model('component', $info_item->tipo, false);
							$ar_related = ontology_node::get_relation_nodes($info_item->tipo, true, true);
							if (isset($ar_related[0])) {
								$current_name				= ontology_node::get_term_by_tipo($ar_related[0], null, true, true);
								$info_item->related_tipo	= $ar_related[0];
								$info_item->related_label	= $current_name;
								$info_item->related_model	= ontology_node::get_legacy_model_by_tipo($ar_related[0]);
							}
							// add model
							$info_item->model = ontology_node::get_model_by_tipo($info_item->tipo, true);
						}
					}

				$table_tipo = isset($section_tables_map->from_alias) && $section_tables_map->from_alias
					? $section_tables_map->from_alias
					: ($section_tables_map->table ?? null);

				$data_item = (object)[
					'database'				=> $section_tables_map->database_name ?? null,
					'database_tipo'			=> $section_tables_map->database_tipo ?? null,
					'table'					=> $section_tables_map->name,
					'table_tipo'			=> $table_tipo,
					'fields'				=> $table_fields,
					'section_tables_map'	=> $section_tables_map,
					'table_fields_info'		=> $table_fields_info,
					'config'				=> $config
				];
				$ar_data[] = $data_item;

				// safe_diffusion_map add
				$final_diffusion_map[$diffusion_group] = $diffusion_items;
			}//end foreach ($diffusion_map as $diffusion_group => $diffusion_items)

		// skip_publication_state_check
			$skip_publication_state_check = isset($_SESSION['dedalo']['config']['skip_publication_state_check'])
				? (int)$_SESSION['dedalo']['config']['skip_publication_state_check']
				: 1;

		// result info
			$result = (object)[
				'resolve_levels'				=> $resolve_levels,
				'skip_publication_state_check'	=> $skip_publication_state_check,
				'diffusion_map'					=> $final_diffusion_map,
				'ar_data'						=> $ar_data
			];

		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning. request done with errors';



		return $response;
	}//end get_diffusion_info



	/**
	* GET_DIFFUSION_DOMAINS
	* Get array of ALL diffusion domains in structure
	* @return array $diffusion_domains
	*/
	public static function get_diffusion_domains() : array {

		$diffusion_domains = ontology_node::get_ar_tipo_by_model_and_relation(
			DEDALO_DIFFUSION_TIPO,
			'diffusion_domain', // string model_name=
			'children' // string relation_type=
		);

		return $diffusion_domains;
	}//end get_diffusion_domains




	/**
	* GET_DIFFUSION_MAP
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
		static $diffusion_map_cache;
		$cache_key = $diffusion_domain_name .'_' . to_string($connection_status);
		if (isset($diffusion_map_cache[$cache_key])) {
			return $diffusion_map_cache[$cache_key];
		}

		$diffusion_map = new stdClass();

		#
		# DIFFUSION DOMAIN
		# Find all diffusion domains and select the domain name equal to $diffusion_domain_name
		$ar_all_diffusion_domains = self::get_diffusion_domains();
		foreach ($ar_all_diffusion_domains as $current_diffusion_domain_tipo) {
			$name = ontology_node::get_term_by_tipo($current_diffusion_domain_tipo, DEDALO_STRUCTURE_LANG, true, false);
			if ($name===$diffusion_domain_name) {
				$diffusion_domain_tipo = $current_diffusion_domain_tipo;
				break;
			}
		}
		if (!isset($diffusion_domain_tipo)) {
			debug_log(__METHOD__." Not found diffusion_domain_tipo for diffusion_domain: ".to_string($diffusion_domain_name), logger::WARNING);
			return $diffusion_map; // Not found entity name as diffusion domain
		}

		#
		# DIFFUSION_GROUP
		# Search inside current diffusion_domain and iterate all diffusion_group
		$ar_diffusion_group = ontology_node::get_ar_tipo_by_model_and_relation(
			$diffusion_domain_tipo,
			'diffusion_group', // model_name
			'children', // relation_type
			true // search_exact
		);
		foreach ($ar_diffusion_group as $diffusion_group_tipo) {

			$diffusion_map->{$diffusion_group_tipo} = array();

			// DIFFUSION_ELEMENT
			// Search inside current diffusion_group and iterate all diffusion_element
			$ar_diffusion_elements = [];

			// 1 get the diffusion element alias
			$ar_diffusion_element_alias_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
				$diffusion_group_tipo,
				'diffusion_element_alias', // model_name
				'children', // relation_type
				true // search_exact
			);
			// Add the resolved real diffusion_element tipos
			if(!empty($ar_diffusion_element_alias_tipo)){
				foreach ($ar_diffusion_element_alias_tipo as $diffusion_element_alias_tipo) {
					$ar_real_diffusion_element = ontology_node::get_ar_tipo_by_model_and_relation(
						$diffusion_element_alias_tipo,
						'diffusion_element', // model_name
						'related', // relation_type
						false // search_exact
					);
					$real_diffusion_element_tipo = $ar_real_diffusion_element[0] ?? null;
					if ($real_diffusion_element_tipo) {
						$ar_diffusion_elements[] = $real_diffusion_element_tipo;
					}
				}
			}

			// 2 get direct diffusion element
			$direct_diffusion_elements = ontology_node::get_ar_tipo_by_model_and_relation(
				$diffusion_group_tipo,
				'diffusion_element', // model_name
				'children', // relation_type
				true // search_exact
			);

			// 3 mix to final array of diffusion_elements
			$ar_diffusion_element_tipo = array_merge($ar_diffusion_elements, $direct_diffusion_elements);

			foreach ($ar_diffusion_element_tipo as $diffusion_element_tipo) {

				$ontology_node	= ontology_node::get_instance($diffusion_element_tipo);
				$properties		= $ontology_node->get_propiedades(true);

				// class name. Class handler to current diffusion element (e.g. diffusion_mysql, diffusion_rdf, diffusion_xml, ..)
				$diffusion_class_name = isset($properties->diffusion->class_name) ? $properties->diffusion->class_name : null;

				// name (e.g. 'Web numisdata'). Try to resolve it with DEDALO_STRUCTURE_LANG
				$name = ontology_node::get_term_by_tipo($diffusion_element_tipo, DEDALO_STRUCTURE_LANG, true, false)
					?? '<em>'.ontology_node::get_term_by_tipo($diffusion_element_tipo, DEDALO_STRUCTURE_LANG, true, true).'</em>'; // empty case

				// database name
				$with_database_classes = ['diffusion_mysql','diffusion_socrata'];
				if (in_array($diffusion_class_name, $with_database_classes)) {

					// tipo of the real database from current diffusion element (e.g. 'web_numisdata')
					$diffusion_database_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
						$diffusion_element_tipo,
						'database', // model_name
						'children', // relation_type
						true // search_exact
					)[0] ?? null;

					// database_alias case try
					if (empty($diffusion_database_tipo)) {
						// Get database alias
						$database_alias_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
							$diffusion_element_tipo,
							'database_alias',
							'children',
							true // search_exact
						)[0] ?? null;
						if (empty($database_alias_tipo)) {
							debug_log(__METHOD__
								. " Ignored diffusion element without real database or database_alias. Define a database element to continue." . PHP_EOL
								. ' diffusion_element_tipo: ' . to_string($diffusion_element_tipo)
								, logger::ERROR
							);
							continue;
						}
						// Try to resolve real database to ensure if properly configured
						$diffusion_database_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
							$database_alias_tipo,
							'database',
							'related',
							false
						)[0] ?? null;
						if (empty($diffusion_database_tipo)) {
							debug_log(__METHOD__
								. " Unable to resolve the real database from database_alias. Configure your database_alias to continue" . PHP_EOL
								. ' database_alias tipo: ' . to_string($diffusion_database_tipo)
								, logger::ERROR
							);
							continue;
						}

						// Get db name from the alias
						$diffusion_database_name = ontology_node::get_term_by_tipo($database_alias_tipo, DEDALO_STRUCTURE_LANG, true, false);

					}else{

						// Get db name from real database item
						$diffusion_database_name = ontology_node::get_term_by_tipo($diffusion_database_tipo, DEDALO_STRUCTURE_LANG, true, false);
					}
				}//end if (in_array($diffusion_class_name, $with_database_classes))

				// Create the diffusion map element
				$item = new stdClass();
					$item->element_tipo		= $diffusion_element_tipo;
					$item->model			= ontology_node::get_model_by_tipo($diffusion_element_tipo,true);
					$item->name				= $name;
					$item->class_name		= $diffusion_class_name;
					$item->database_name	= $diffusion_database_name ?? null;
					$item->database_tipo	= $diffusion_database_tipo ?? null;

					// add connection DDBB status. Check connection is reachable
					if ($connection_status===true) {
						$item->connection_status = self::get_connection_status( $item );
					}

				// add diffusion_map item
					$diffusion_map->{$diffusion_group_tipo}[] = $item;
			}//end foreach ($ar_diffusion_element_tipo as $diffusion_element_tipo)

		}//end foreach ($ar_diffusion_group as $diffusion_group_tipo)

		// cache
		$diffusion_map_cache[$cache_key] = $diffusion_map;


		return $diffusion_map;
	}//end get_diffusion_map




	/**
	* GET_CONNECTION_STATUS
	* Check the status of the connection for the given $item->class_name
	* E.g. 'diffusion_mysql' => {result: true, msg: 'Database is ready'}
	* @param object $item
	* @return object|null $connection_status
	*/
	public static function get_connection_status( object $item ) : ?object {

		$connection_status = null;

		switch ($item->class_name) {

			case 'diffusion_mysql':
				// check connection
				try {

					if (!isset($conn) || $conn==false) {
						// try again. Note that if there are multiple connections, they must be checked for each database.
						$conn = DBi::_getConnection_mysql(
							MYSQL_DEDALO_HOSTNAME_CONN,
							MYSQL_DEDALO_USERNAME_CONN,
							MYSQL_DEDALO_PASSWORD_CONN,
							$item->database_name,
							MYSQL_DEDALO_DB_PORT_CONN,
							MYSQL_DEDALO_SOCKET_CONN
						);
					}

				} catch (Exception $e) {
					$conn = false;
					debug_log(__METHOD__
						."  Caught exception on connect to MySQL (database_name: $item->database_name): ". PHP_EOL
						. $e->getMessage()
						, logger::WARNING
					);
				}
				if ($conn===false) {
					$connection_status = (object)[
						'result'	=> false,
						'msg'		=> 'Unable to connect to database '. $item->database_name
					];
				}else{
					// check database
					$db_available = diffusion_mysql::database_exits($item->database_name);
					if ($db_available===true) {
						$connection_status = (object)[
							'result'	=> true,
							'msg'		=> 'Database is ready.'
						];
					}else{
						$connection_status = (object)[
							'result'	=> false,
							'msg'		=> 'Database is NOT ready.'
						];
					}
				}
				// error log when fails
					if ($connection_status->result===false) {
						debug_log(__METHOD__
							." ".$connection_status->msg . ' ['.$item->database_name.']'
							, logger::WARNING
						);
					}
				break;

			default:
				// ignore
				break;
		}


		return $connection_status;
	}//end get_connection_status



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

		try {

			$file_path = DEDALO_DIFFUSION_PATH . '/class.'.$class_name.'.php';
			include_once $file_path;

			if ( method_exists($class_name, 'get_diffusion_sections_from_diffusion_element')) {
				$ar_diffusion_sections = $class_name::get_diffusion_sections_from_diffusion_element($diffusion_element_tipo);
			}else{
				debug_log(__METHOD__
					. " Ignored diffusion class without mandatory method: 'get_diffusion_sections_from_diffusion_element'." . PHP_EOL
					. ' class_name: ' . to_string($class_name) . PHP_EOL
					. ' method: ' . 'get_diffusion_sections_from_diffusion_element' . PHP_EOL
					. ' file_path: ' . $file_path
					, logger::WARNING
				);
			}

		} catch (Exception $e) {
			error_log( 'Caught exception: ' . $e->getMessage() );
			debug_log(__METHOD__
				. " Caught exception: " . $e->getMessage() . PHP_EOL
				. ' diffusion_element_tipo: ' . to_string($diffusion_element_tipo) . PHP_EOL
				. ' class_name: ' . to_string($class_name)
				, logger::ERROR
			);
		}

		// cache
			// $diffusion_sections_from_diffusion_element[$diffusion_element_tipo] = $ar_diffusion_sections;


		return $ar_diffusion_sections ?? [];
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



	/**
	* GET_TABLE_FIELDS
	* Resolve all fields of a 'table' element inside a given 'diffusion_element'
	* Uses diffusion MYSQL tables model
	* @param string $diffusion_element_tipo
	* @param string $section_tipo
	* @return array $ar_table_fields
	* 	Array of objects as [{tipo: 'numisdata145', label: 'Mints'}]
	*/
	public static function get_table_fields(string $diffusion_element_tipo, string $section_tipo) : array {

		$diffusion_element_tables_map = diffusion_sql::get_diffusion_element_tables_map( $diffusion_element_tipo );

		// table
		$table = $diffusion_element_tables_map->{$section_tipo}->table ?? null;
		if (!$table) {
			debug_log(__METHOD__
				. " No table available for this section " . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo)
				, logger::WARNING
			);
			return [];
		}

		$ontology_node 	   = ontology_node::get_instance($table);
		$ar_table_children = $ontology_node->get_ar_children_of_this();

		// Add children from table alias
		$table_alias_tipo = $diffusion_element_tables_map->{$section_tipo}->from_alias ?? null;
		if (!empty($table_alias_tipo)) {

			$ontology_node_alias 	 = ontology_node::get_instance($table_alias_tipo);
			$ar_table_alias_children = $ontology_node_alias->get_ar_children_of_this();

			// Merge all
			$ar_table_children = array_merge($ar_table_children, $ar_table_alias_children);
		}

		$ar_table_fields = [];
		foreach ($ar_table_children as $tipo) {

			$item = new stdClass();
				$item->tipo 	= $tipo;
				$item->label 	= ontology_node::get_term_by_tipo($tipo, DEDALO_STRUCTURE_LANG, true);

			$ar_table_fields[] = $item;
		}


		return $ar_table_fields;
	}//end get_table_fields
}
