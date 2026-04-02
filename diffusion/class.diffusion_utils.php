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

		$model = $node->get_model();
		if (str_contains($model, '_alias')) {

			$search_model = str_replace('_alias','',$model);
			$related_tipo = ontology_node::get_ar_tipo_by_model_and_relation($tipo, $search_model, 'related', true)[0] ?? null;
			if (empty($related_tipo)) {
				return null;
			}
			return self::get_related_section_tipo($related_tipo);
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
	 * GET_SECTION_DIFFUSION_NODES
	 * Builds a hierarchical tree of diffusion nodes mapped to a specific section.
	 *
	 * This method traverses the ontology tree starting from `DEDALO_DIFFUSION_DOMAIN`
	 * to find all diffusion configurations that target the given section. For each
	 * matching diffusion node, it constructs:
	 *
	 * - **Parents chain**: Ascending hierarchy from the section up to `diffusion_domain`,
	 *   including diffusion elements with their type property (e.g., 'sql', 'xml')
	 *
	 * - **Children nodes**: Descending tree of all components/elements under the section,
	 *   with their related ontology references
	 *
	 * Logic flow:
	 * 1. Get all recursive children under `DEDALO_DIFFUSION_DOMAIN`
	 * 2. For each diffusion node, resolve related sections via ontology relations
	 * 3. Filter to only nodes that map to the requested `section_tipo`
	 * 4. Build parent chain:
	 *    - Traverse upward via `get_parent()` until reaching `diffusion_domain`
	 *    - For `diffusion_element` nodes, extract `diffusion->type` from properties
	 *    - Log error and mark if diffusion type is missing
	 * 5. Build children list:
	 *    - Get all recursive children of the section
	 *    - Include relation information for each child
	 * 6. Return array of source element objects with full hierarchy
	 *
	 * @param string $section_tipo The section tipo to get diffusion nodes for
	 *
	 * @return array Array of source element objects, each containing:
	 *         {
	 *             string $tipo    : The diffusion node tipo
	 *             string $model   : The ontology model name
	 *             string $label   : Human-readable label
	 *             array  $parents : Ascending hierarchy to diffusion_domain
	 *             array  $children: Descending nodes with relations
	 *         }
	 *
	 * @see ontology_node::get_ar_recursive_children() For tree traversal
	 * @see ontology_node::get_ar_tipo_by_model_and_relation() For relation resolution
	 */
	public static function get_section_diffusion_nodes( string $section_tipo) : array {

		// get diffucion domain tipo
		$diffusion_domain_tipo = self::get_diffusion_domain_tipo();
		if ($diffusion_domain_tipo === null) {
			return [];
		}

		// Get all recursive children nodes under the diffusion domain tree
		// This retrieves the entire diffusion ontology structure from root
		$ar_diffusion_nodes = ontology_node::get_ar_recursive_children(
			$diffusion_domain_tipo		
		);
		
		// Initialize result array to collect matching source elements
		$source_elements = [];
		
		// Iterate through each diffusion node to find those targeting our section
		foreach ($ar_diffusion_nodes as $diffusion_tipo) {
			
			// Resolve which section_tipo this diffusion node is related to
			// Uses ontology relation system to find 'related' sections
			$ar_sections = ontology_node::get_ar_tipo_by_model_and_relation(
				$diffusion_tipo,		// The diffusion node to check relations from
				'section',			// The target model type to find
				'related',			// The relation type to match
				true				// Recursive search
			);
			
			// Check each related section for a match with requested section_tipo
			foreach ($ar_sections as $current_section_tipo) {

				// Skip if this diffusion node targets a different section
				if($current_section_tipo !== $section_tipo) {
					continue;
				}

				// PARENTS RESOLUTION
				// Build ascending chain from section up to diffusion_domain
				// This shows the hierarchy of diffusion containers
				$parents = [];
				$current_tipo = $diffusion_tipo;
				
				// Traverse upward through parent nodes
				while(true) {
					// Get the parent node instance and its tipo
					$parent_node = ontology_node::get_instance($current_tipo);
					$parent_tipo = $parent_node->get_parent();
					
					// Stop if no parent exists (reached ontology root)
					if($parent_tipo === null) {
						break;
					}
					
					// Get the model name for this parent
					$parent_model = ontology_node::get_model_by_tipo($parent_tipo);
					
					// Stop if model cannot be determined
					if(empty($parent_model)) {
						break;
					}
				
					// Build the parent item with basic ontology info
						$parent_item = (object)[
						'tipo' => $parent_tipo,
						'model' => $parent_model,
						'label' => ontology_node::get_term_by_tipo($parent_tipo)
					];

					// Special handling for diffusion_element nodes
					// Extract the diffusion type (e.g., 'sql', 'xml') from properties
					if($parent_model === 'diffusion_element') {
						$diffusion_element_instance = ontology_node::get_instance($parent_tipo);
						$diffusion_element_properties = $diffusion_element_instance->get_properties();
						
						// Extract diffusion type from properties JSON
						$type = $diffusion_element_properties->diffusion->type ?? null;
						
						// Log error and mark if diffusion type is missing
						if(!$type) {
							debug_log(__METHOD__
								. " Missing diffusion type in properties for diffusion element: " . $parent_tipo 
								, logger::ERROR
							);
							$type = 'unknown';
							$parent_item->error = true;
						}
						$parent_item->type = $type;
					}

					// Add this parent to the chain
					$parents[] = $parent_item;

					// Stop when we reach diffusion_domain (top of diffusion hierarchy)
					if($parent_model === 'diffusion_domain') {
						break;
					}

					// Move up to the parent for next iteration
					$current_tipo = $parent_tipo;
				}

				// CHILDREN RESOLUTION
				// Build descending tree of all nodes under this section
				// This shows components and their ontology relations
				$children = [];
				
				// Get all recursive children of the section
				$children_nodes = ontology_node::get_ar_recursive_children($diffusion_tipo);
				
				// Process each child node
				foreach ($children_nodes as $child_tipo) {
					// Get child node instance and basic properties
					$child_node 	= ontology_node::get_instance($child_tipo);
					$child_model 	= $child_node->get_model();
					$child_label 	= $child_node->get_term($child_tipo);
					
					// Get the first relation tipo (if any exists)
					$relation_tipo 	= $child_node->get_relation_tipos()[0] ?? null;						
					
					// Initialize relation info as null
					$relation_model = null;
					$relation_label = null;
					
					// Resolve relation model and label if relation exists
					if ($relation_tipo !== null) {
						$relation_model = ontology_node::get_model_by_tipo($relation_tipo);
						$relation_label = ontology_node::get_term_by_tipo($relation_tipo);
					}						

					// Build child object with ontology info and relation data
					$children[] = (object)[
						'tipo' 			=> $child_tipo,
						'model' 		=> $child_model,
						'label' 		=> $child_label,
						'related_tipo' 	=> $relation_tipo,
						'related_model' => $relation_model,
						'related_label' => $relation_label
					];
				}

				// Build final source element object combining all resolved data
				$source_elements[] = (object)[
					'tipo' 		=> $diffusion_tipo,
					'model' 	=> ontology_node::get_model_by_tipo($diffusion_tipo),
					'label' 	=> ontology_node::get_term_by_tipo($diffusion_tipo),
					'parents' 	=> $parents,
					'children' 	=> $children
				];
			}//foreach ($ar_sections as $current_section_tipo)
		}//foreach ($ar_diffusion_nodes as $diffusion_tipo)
	
		return $source_elements;
	}//end get_section_diffusion_nodes



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
	 * Get diffusion domain tipo
	 * @return string|null The diffusion domain tipo or null if not found
	 */	
	public static function get_diffusion_domain_tipo() : ?string {

		$diffusion_domain_tipos = ontology_node::get_ar_tipo_by_model_and_relation(
			DEDALO_DIFFUSION_TIPO,
			'diffusion_domain', // string model_name=
			'children' // string relation_type=
		);

		foreach ($diffusion_domain_tipos as $diffusion_domain_tipo) {
			$term = ontology_node::get_term_by_tipo($diffusion_domain_tipo);
			if ($term===DEDALO_DIFFUSION_DOMAIN) {
				return $diffusion_domain_tipo;
			}
		}

		return null;
	}//end get_diffusion_domain_tipo











































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

			$current_type = $obj_value->type ?? null;
			if (empty($current_type)) {
				debug_log(__METHOD__
					. " Ignored bad diffusion obj_value: type is mandatory!" . PHP_EOL
					. ' obj_value : ' . to_string($obj_value)
					, logger::ERROR
				);
				continue;
			}

			$ar_related = self::get_diffusion_sections_from_diffusion_element(
				$current_diffusion_element_tipo,
				$current_type
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
	*	            "type": "diffusion_mysql",
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
				$properties		= $ontology_node->get_properties();

				// class name. Class handler to current diffusion element (e.g. diffusion_mysql, diffusion_rdf, diffusion_xml, ..)
				$diffusion_type = isset($properties->diffusion->type) ? $properties->diffusion->type : null;

				// name (e.g. 'Web numisdata'). Try to resolve it with DEDALO_STRUCTURE_LANG
				$name = ontology_node::get_term_by_tipo($diffusion_element_tipo, DEDALO_STRUCTURE_LANG, true, false)
					?? '<em>'.ontology_node::get_term_by_tipo($diffusion_element_tipo, DEDALO_STRUCTURE_LANG, true, true).'</em>'; // empty case

				// database name
				$types_with_database = ['sql','socrata'];
				if (in_array($diffusion_type, $types_with_database)) {

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
				}//end if (in_array($diffusion_type, $types_with_database))

				// Create the diffusion map element
				$item = new stdClass();
					$item->element_tipo		= $diffusion_element_tipo;
					$item->model			= ontology_node::get_model_by_tipo($diffusion_element_tipo,true);
					$item->name				= $name;
					$item->type		= $diffusion_type;
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
	* Check the status of the connection for the given $item->type
	* E.g. 'diffusion_mysql' => {result: true, msg: 'Database is ready'}
	* @param object $item
	* @return object|null $connection_status
	*/
	public static function get_connection_status( object $item ) : ?object {

		$connection_status = null;

		switch ($item->type) {

			case 'sql':
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
	*	        "type": "diffusion_mysql",
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
	* @param string $type
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element(string $diffusion_element_tipo, string $type) : array {

		// cache
			// static $diffusion_sections_from_diffusion_element;
			// if (isset($diffusion_sections_from_diffusion_element[$diffusion_element_tipo])) {
			// 	return $diffusion_sections_from_diffusion_element[$diffusion_element_tipo];
			// }

		try {
			$class_name = 'diffusion_'.$type;
			$file_path = DEDALO_DIFFUSION_PATH . '/class.'.$class_name.'.php';

			include_once $file_path;

			if ( method_exists($class_name, 'get_diffusion_sections_from_diffusion_element')) {
				$ar_diffusion_sections = $class_name::get_diffusion_sections_from_diffusion_element($diffusion_element_tipo);
			}else{
				debug_log(__METHOD__
					. " Ignored diffusion class without mandatory method: 'get_diffusion_sections_from_diffusion_element'." . PHP_EOL
					. ' type: ' . to_string($type) . PHP_EOL
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
				. ' type: ' . to_string($type)
				, logger::ERROR
			);
		}

		// cache
			// $diffusion_sections_from_diffusion_element[$diffusion_element_tipo] = $ar_diffusion_sections;


		return $ar_diffusion_sections ?? [];
	}//end get_diffusion_sections_from_diffusion_element







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
