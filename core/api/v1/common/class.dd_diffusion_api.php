<?php declare(strict_types=1);
require_once(DEDALO_DIFFUSION_PATH . '/class.diffusion_activity_logger.php');
/**
 * DIFFUSION_API
 * Main entry point for the new diffusion system.
 * Handles SQO-based requests and returns standardized JSON data.
 */
class dd_diffusion_api {



	/**
	* CLASS VARS
	*/
		/**
		 * SEC-024: explicit allowlist of methods callable as remote API actions.
		 * Security measure defining which methods can be invoked via remote API calls.
		 */
		public const API_ACTIONS = [
			'diffuse',
			'get_diffusion_info',
			'validate',
			'get_ontology_map'
		];

		/**
		 * Accumulated resolved diffusion datum objects for the current request.
		 * Stores processed/resolved data during multi-level diffusion operations.
		 * @var array $datum
		 */
		public static array $datum = [];

		/**
		 * Queue of unresolved locators and their diffusion types.
		 * Used for multi-level recursive diffusion resolution.
		 * @var array $datum_unresolved
		 */
		public static array $datum_unresolved = [];

		/**
		 * @var array Stores publishable override states for locators.
		 */
		public static array $publishable_overrides = [];

		/**
		 * @var array|null SQO filter_by_locators to restrict which records
		 * get top-level datum entries. Non-matching related sections are
		 * resolved for field values but don't create separate datums.
		 */
		public static ?array $sqo_filter_by_locators = null;



	/**
	 * DIFFUSE
	 * Main action to resolve diffusion data for records selected by SQO.
	 *
	 * @param object $rqo Request Query Object {
	 *   action: "diffuse",
	 *   source: { ... },
	 *   sqo: { ... },
	 *   options: { diffusion_tipo: "rsc...", levels: int, ... }
	 * }
	 * @return object Standardized JSON response
	 */
	public static function diffuse(object $rqo): object {

		// Release the session lock immediately so the frontend UI isn't blocked
		// while this long-running diffusion chunk processes.
		session_write_close();

		$response = new stdClass();
			$response->result = false;
			$response->msg    = 'Error. Request failed';
			$response->errors = [];

		// Validate basic input
		if (empty($rqo->options->diffusion_tipo)) {
			$response->errors[] = 'Missing options->diffusion_tipo';
			return $response;
		}
		if (empty($rqo->sqo)) {
			$response->errors[] = 'Missing sqo (Search Query Object)';
			return $response;
		}

		$diffusion_tipo = $rqo->options->diffusion_tipo;
		$sqo_data      	= $rqo->sqo;
		$options      	= $rqo->options ?? new stdClass();
		// deep resolution of linked secitons
		$levels       	= $options->levels ?? DEDALO_DIFFUSION_RESOLVE_LEVELS; // 2

		try {
			// 0. Reset caches for this request
			diffusion_chain_processor::reset_cache();
			diffusion_activity_logger::reset_cache();
			self::$datum = [];
			self::$datum_unresolved = [];
			self::$publishable_overrides = [];

			// 1. Get diffusion_element (parent of source_tipo or source_tipo itself if it's a diffusion_element)
			$diffusion_element_tipo = $options->diffusion_element_tipo
				?? diffusion_utils::get_diffusion_element($diffusion_tipo);

			if ($diffusion_element_tipo === false) {
				throw new Exception("No diffusion element related to $diffusion_tipo");
			}

			// Set the diffusion element scope for cross-section resolution
			if ($diffusion_element_tipo) {
				diffusion_chain_processor::set_diffusion_element_scope($diffusion_element_tipo);
			}

			// Resolve section related to this node
			$main_section_tipo = diffusion_utils::get_related_section_tipo($diffusion_tipo);
			if (!$main_section_tipo) {
				throw new Exception("No section related to $diffusion_tipo");
			}

			// SEC-13: check read permissions for the section being diffused
			$permissions = common::get_permissions($main_section_tipo, $main_section_tipo);
			if ($permissions < 1) {
				$response->errors[] = 'insufficient permissions';
				$response->msg = "Error. Insufficient permissions to diffuse section ($main_section_tipo)";
				return $response;
			}

			// =====================================================
			// BUILD LANGS
			// =====================================================
			$langs = self::build_langs();

			// =====================================================
			// BUILD MAIN (hierarchy UP to diffusion_domain)
			// =====================================================
			$main = self::build_main_hierarchy($diffusion_tipo);

			// =====================================================
			// BUILD DATUM (one object per section)
			// =====================================================

			// 3. Execute search using SQO
			$search    = search::get_instance(new search_query_object($sqo_data));
			$db_result = $search->search();

			// Detect diffusion type from diffusion_element ontology for specialized dispatch
			$diffusion_elem_props = ontology_node::get_instance($diffusion_element_tipo)->get_properties(true);
			$diffusion_type = $diffusion_elem_props->diffusion->type ?? null;

			if ($diffusion_type === 'rdf') {
				// Build langs and main hierarchy before early RDF dispatch
				$langs = self::build_langs();
				$main  = self::build_main_hierarchy($diffusion_element_tipo);
				$response = self::diffuse_rdf($diffusion_element_tipo, $main_section_tipo, $db_result, $langs, $main, $options);
				dump($response, 'response +//////------>');
				return $response;
			}

			// Store SQO filter to scope datum entries to only matching records
			self::$sqo_filter_by_locators = $sqo_data->filter_by_locators ?? null;

			self::process_datum($diffusion_tipo, $db_result, $levels, $options);

			while (!empty(self::$datum_unresolved)) {

				// Get the first available key from the queue (format: "level:diffusion_tipo")
				$keys = array_keys(self::$datum_unresolved);
				$key  = reset($keys);

				$locators = self::$datum_unresolved[$key];
				unset(self::$datum_unresolved[$key]);

				// Parse level and tipo
				$parts = explode(':', $key);
				if (count($parts) === 2) {
					$current_level   = (int)$parts[0];
					$diffusion_tipo = $parts[1];
				} else {
					// Fallback for unexpected formats
					$current_level   = $levels;
					$diffusion_tipo = $key;
				}

				// Deduplicate locators for this batch
				$unique_locators = [];
				foreach ($locators as $locator) {
					if(!locator::in_array_locator($locator, $unique_locators, ['section_tipo', 'section_id'])) {
						$unique_locators[] = $locator;
					}
				}

				if(SHOW_DEBUG) {
					dump($diffusion_tipo, "Processing unresolved datum batch [Level: $current_level] -> " . count($unique_locators) . ' locators');
				}

				self::process_datum($diffusion_tipo, $unique_locators, $current_level, $options);
			}

			// 6. Final response
			$response->result 		= true;
			$response->msg    		= 'OK. Request done';
			$response->langs  		= $langs;
			$response->main_lang  	= DEDALO_DATA_LANG_DEFAULT;
			$response->main   		= $main;
			$response->datum  		= self::$datum;


		} catch (Exception $e) {
			$response->msg = 'Error: ' . $e->getMessage();
			$response->errors[] = $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}

		dump($response, 'response +//////');

		return $response;
	}


	/**
	 * GET_DIFFUSION_INFO
	 * Retrieves diffusion configuration information for a given section.
	 *
	 * This method serves as the entry point for obtaining diffusion metadata,
	 * including the hierarchy of diffusion elements, nodes, and their mappings
	 * to the specified section.
	 *
	 * Logic flow:
	 * 1. Validates that `section_tipo` is provided in options
	 * 2. Retrieves resolve levels from configuration (via `diffusion_utils`)
	 * 3. Calls `get_section_diffusion_nodes()` to build the diffusion tree
	 * 4. Returns a standardized response object with result status
	 *
	 * @param object $options {
	 *    Required parameters:
	 *    - string $section_tipo : The section tipo to query diffusion info for
	 * }
	 *
	 * @return object {
	 *    - bool   $result : false when error in the operation or an object with diffusion info:
	 *    	- array  $section_diffusion_nodes : Hierarchical tree of diffusion nodes
	 *    	- array  $resolve_levels : Configuration resolve levels
	 *    - string $msg    : Human-readable status message
	 *    - array  $errors : Array of error messages (empty on success)
	 * }
	 *
	 * @see self::get_section_diffusion_nodes() For the actual tree construction
	 * @see diffusion_utils::get_resolve_levels() For configuration resolve levels
	 */
	public static function get_diffusion_info( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
		$section_tipo = $rqo->options->section_tipo ?? null;

		// validate vars
		if (empty($section_tipo)) {
			$response->errors[] = 'Missing section_tipo.';
			debug_log(__METHOD__
				. " Missing required parameters" . PHP_EOL
				. " section_tipo: " . to_string($section_tipo)
				, logger::ERROR
			);
			return $response;
		}

		// SEC: read permission required to inspect diffusion configuration of a section
		security::assert_section_permission($section_tipo, 1, __METHOD__);

		// levels default from config
		$resolve_levels = diffusion_utils::get_resolve_levels();

		// get_diffusion_elements
		$section_diffusion_nodes = diffusion_utils::get_section_diffusion_nodes($section_tipo);

		// add section_diffusion_nodes to response
		$result = (object)[
			'section_diffusion_nodes' => $section_diffusion_nodes,
			'resolve_levels' => $resolve_levels
		];

		// response
		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'Diffusion info retrieved successfully'
			: 'Diffusion info retrieved with errors';


		return $response;
	}//end get_diffusion_info


	/**
	 * VALIDATE
	 * Validates the diffusion configuration for a given node.
	 */
	public static function validate(object $rqo): object {
		$response = new stdClass();
		$response->result = true;
		$response->msg = 'Validate mapping... (TBD)';
		// TODO: Implement thorough validation logic
		return $response;
	}


	/**
	 * GET_ONTOLOGY_MAP
	 * Returns the raw ddo_map and parser definitions from ontology.
	 */
	public static function get_ontology_map(object $rqo): object {
		$response = new stdClass();
		$response->result	= false;
		$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
		$response->errors	= [];

		// SEC-14: Restrict ontology map to global admins
		if (security::is_global_admin(logged_user_id()) !== true) {
			$response->errors[] = 'insufficient permissions';
			$response->msg = 'Error. Insufficient permissions to access ontology map.';
			return $response;
		}

		$diffusion_tipo = $rqo->options->diffusion_tipo ?? null;
		if (!$diffusion_tipo) {
			$response->errors[] = 'Missing diffusion_tipo';
			$response->msg = 'Error. Missing diffusion_tipo';
			return $response;
		}

		$ontology_node = ontology_node::get_instance($diffusion_tipo);
		$properties = $ontology_node->get_properties();

		$response->result	= true;
		$response->msg		= 'OK. Ontology map retrieved';
		$response->data		= $properties->process ?? new stdClass();

		return $response;
	}


	/**
	 * BUILD_LANGS
	 * Returns available diffusion languages.
	 * @return array
	 */
	private static function build_langs(): array {

		$langs = [];

		// Get available diffusion langs
		$ar_langs = defined('DEDALO_DIFFUSION_LANGS')
			? DEDALO_DIFFUSION_LANGS
			: [DEDALO_DATA_LANG];

		foreach ($ar_langs as $lang_code) {
			$lang_name = lang::get_name_from_code($lang_code);
			$langs[$lang_code] = $lang_name;
		}


		return $langs;
	}


	/**
	 * BUILD_MAIN_HIERARCHY
	 * Traverses UP from source_tipo to diffusion_domain.
	 * Returns array of hierarchy nodes.
	 * @param string $diffusion_tipo
	 * @return array
	 */
	private static function build_main_hierarchy(string $diffusion_tipo): array {

		$virtual_tree = diffusion_utils::get_virtual_diffusion_tree();

		$target_vnode = null;
		foreach ($virtual_tree as $vnode) {
			// Find the target node in the fully resolved virtual tree
			if ($vnode->tipo === $diffusion_tipo) {
				$target_vnode = $vnode;
				break;
			}
		}

		if (!$target_vnode) {
			debug_log(__METHOD__ . " Could not find diffusion_tipo {$diffusion_tipo} in virtual tree.", logger::WARNING);
			return [];
		}

		$hierarchy = [];

		// The vnode->parents array contains parents from immediate parent at index 0 up to domain at last index.
		// Assemble full path tipos top-down: domain -> ... -> parent -> target
		$path_tipos = [];
		if (!empty($target_vnode->parents)) {
			foreach (array_reverse($target_vnode->parents) as $p) {
				$path_tipos[] = $p->tipo;
			}
		}
		$path_tipos[] = $diffusion_tipo;

		// Now traverse downwards to build the exact main array objects expected by frontend
		$parent_tipo = null;
		foreach ($path_tipos as $tipo) {

			$resolved = diffusion_utils::resolve_node_with_alias($tipo);

			if ($resolved->is_alias) {
				$model_name = $resolved->model;
				$term       = $resolved->label;
				$properties = $resolved->properties;
			} else {
				$node = ontology_node::get_instance($tipo);
				$model_tipo = $node->get_model_tipo();
				$model_name = ontology_node::get_term_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG);
				$term       = $node->get_term(DEDALO_STRUCTURE_LANG);
				$properties = $node->get_properties();
			}

			$item = (object)[
				'diffusion_tipo' => $tipo,
				'term'           => $term,
				'model'          => $model_name
			];

			if ($parent_tipo) {
				$item->parent = $parent_tipo;
			}

			// Add properties for diffusion_element and diffusion_element_alias
			if (($model_name === 'diffusion_element' || $model_name === 'diffusion_element_alias') && !empty($properties)) {
				$item->properties = $properties;
			}

			$hierarchy[] = $item;
			$parent_tipo = $tipo; // Next node's parent is this node
		}

		return $hierarchy;
	}


	/**
	 * PROCESS_DATUM
	 * Resolves data for each record in db_result according to source_tipo config.
	 *
	 * @param string $diffusion_tipo
	 * @param iterable $iterable_data
	 * @param int $levels
	 * @return diffusion_datum
	 */
	private static function process_datum(string $diffusion_tipo, $iterable_data, int $levels, object $options): diffusion_datum {

		$source_node = ontology_node::get_instance($diffusion_tipo);
		if (!$source_node) {
			throw new Exception("Ontology node not found for tipo: $diffusion_tipo");
		}

		$parent = $source_node->get_parent();
		$main_section_tipo = diffusion_utils::get_related_section_tipo($diffusion_tipo);

		$properties = $source_node->get_properties();

		$diffusion_node_model = $source_node->get_model();
		$diffusion_name = $source_node->get_term(DEDALO_STRUCTURE_LANG);

		// Identify all section-level diffusion nodes (children of source_tipo)
		$ar_children = ontology_node::get_ar_children($diffusion_tipo);

		if( str_contains( $diffusion_node_model, '_alias') ){

			$search_model = str_replace('_alias','',$diffusion_node_model);
			$related_tipo = ontology_node::get_ar_tipo_by_model_and_relation($diffusion_tipo, $search_model, 'related', true)[0] ?? null;

			if(!empty($related_tipo)){
				$target_node = ontology_node::get_instance($related_tipo);
				$diffusion_node_model = $target_node->get_model();
				if(empty($properties)){
					$properties = $target_node->get_properties();
				}
				if(empty($main_section_tipo)){
					$main_section_tipo = diffusion_utils::get_related_section_tipo($related_tipo);
				}
				$ar_target_children = ontology_node::get_ar_children($related_tipo);
				$ar_children = [...$ar_target_children, ...$ar_children];
			}
		}

		// Build combined ddo_map from all nodes for this section
		$combined_ddo_map = [];
		$context = [];
		foreach ($ar_children as $node_tipo) {
			$ddo_map = diffusion_data::get_ddo_map($node_tipo, $main_section_tipo);
			$combined_ddo_map[$node_tipo] = $ddo_map;

			// Build context for each node (field definitions)
			$node_context = self::build_datum_context($node_tipo, $ddo_map);
			$context = [...$context, ...$node_context];
		}

		$datum_object = new diffusion_datum();
			$datum_object->set_diffusion_tipo($diffusion_tipo);
			$datum_object->set_section_tipo($main_section_tipo);
			$datum_object->set_term($diffusion_name);
			$datum_object->set_model($diffusion_node_model);
			$datum_object->set_parent($parent);
			$datum_object->set_context($context);

		$publishable = $properties->is_publishable ?? null;

		// Pre-detect field nodes delegating to RDF generation (diffusion.type = "rdf")
		$rdf_field_nodes = [];
		foreach ($combined_ddo_map as $node_tipo => $unused_ddo_map) {
			$node_rdf_props = ontology_node::get_instance($node_tipo)->get_properties();
			if (($node_rdf_props->diffusion->type ?? null) === 'rdf') {
				$rdf_field_nodes[$node_tipo] = $node_rdf_props->diffusion->diffusion_element_tipo ?? null;
			}
		}
		if (!empty($rdf_field_nodes)) {
			include_once DEDALO_DIFFUSION_PATH . '/class.diffusion_rdf.php';
		}

		$data = [];

		// Pre-build the section_tipos restricted by the SQO filter.
		// Only records matching one of these section_tipos must also match section_id.
		// Records with other section_tipos (cross-section relations at configured levels) pass freely.
		$filter_section_tipos = null;
		if (self::$sqo_filter_by_locators !== null) {
			$filter_section_tipos = [];
			foreach (self::$sqo_filter_by_locators as $fl) {
				$filter_section_tipos[$fl->section_tipo][] = (int)$fl->section_id;
			}
		}

		// Process each record and group by section
		foreach ($iterable_data as $locator) {

			// Check if the locator has already been used
			if (diffusion_chain_processor::is_used($locator->section_tipo, intval($locator->section_id))) {
				continue;
			}

			// set the locator as used
			diffusion_chain_processor::mark_used($locator->section_tipo, intval($locator->section_id));

			// SQO filter: restrict datum entries for the main section_tipo to only
			// records in the filter. Cross-section relations (different section_tipo
			// from the filter) pass through freely at the configured levels.
			if ($filter_section_tipos !== null && isset($filter_section_tipos[$locator->section_tipo])) {
				if (!in_array(intval($locator->section_id), $filter_section_tipos[$locator->section_tipo], true)) {
					continue;
				}
			}

			$override = self::$publishable_overrides["{$locator->section_tipo}_{$locator->section_id}"] ?? null;
			$is_publishable = $publishable ?? $override ?? diffusion_utils::is_publishable($locator);

			// Build fields keyed by diffusion_tipo
			$fields = new stdClass();

			foreach ($combined_ddo_map as $node_tipo => $ddo_map) {

				// RDF field delegation: generate RDF/XML and store as plain text value
				if (isset($rdf_field_nodes[$node_tipo])) {
					$rdf_element_tipo = $rdf_field_nodes[$node_tipo];
					if ($rdf_element_tipo) {
						$rdf_xml = diffusion_rdf::build_rdf_xml($locator->section_tipo, (int)$locator->section_id, $rdf_element_tipo);
						if ($rdf_xml !== null) {
							$first_ddo = reset($ddo_map);
							$component_tipo = $first_ddo ? ($first_ddo->tipo ?? null) : null;
							// Group RDF as a single field_group
							$field_group = (object)[
								'tipo'    => $component_tipo,
								'lang'    => null,
								'entries' => [(object)['value' => $rdf_xml]],
								'id'      => null
							];
							$fields->{$node_tipo} = [$field_group];
						}
					}
					continue;
				}

				$processor = new diffusion_chain_processor();

				// Resolve the chain for this ddo_map
				$resolved_results = $processor->resolve_chain((object)[
					'ddo_map'      		=> $ddo_map,
					'parent'       		=> $locator->section_tipo,
					'section_tipo' 		=> $locator->section_tipo,
					'section_id'   		=> $locator->section_id,
					'level'        		=> $levels,
					'is_publishable' 	=> $is_publishable
				]);

				// Get the value directly from get_diffusion_data() result
				$all_values = [];
				foreach ($resolved_results as $ddo_res) {
					$value = $ddo_res->value ?? [];
					if (!empty($value)) {
						// Merge all child values into one array
						$all_values = [...$all_values, ...$value];
					}
				}
				if (!empty($all_values) || ($options->include_empty ?? false) === true) {
					// Group values by shared metadata (tipo, lang, id, section_id, section_tipo)
					$grouped = [];
					foreach ($all_values as $item) {
						$group_key = ($item->tipo ?? '') . '|' . ($item->lang ?? '') . '|' . ($item->id ?? '') . '|' . ($item->section_id ?? '') . '|' . ($item->section_tipo ?? '');
						if (!isset($grouped[$group_key])) {
							$field_group = (object)[
								'tipo'          => $item->tipo ?? null,
								'lang'          => $item->lang ?? null,
								'entries'       => [],
								'id'            => $item->id ?? null
							];
							if (isset($item->section_id)) {
								$field_group->section_id = $item->section_id;
							}
							if (isset($item->section_tipo)) {
								$field_group->section_tipo = $item->section_tipo;
							}
							$grouped[$group_key] = $field_group;
						}
						// Build entry: value + any extra properties beyond the grouping keys
						$entry = (object)['value' => $item->value ?? null];
						$skip_keys = ['tipo','lang','id','value','section_id','section_tipo'];
						foreach (get_object_vars($item) as $k => $v) {
							if (!in_array($k, $skip_keys)) {
								$entry->{$k} = $v;
							}
						}
						$grouped[$group_key]->entries[] = $entry;
					}
					$fields->{$node_tipo} = array_values($grouped);
				}
			}

			// Structure record output
			$record_output = (object)[
				'section_id' => $locator->section_id,
				'fields'     => (!$is_publishable) ? 'delete' : $fields
			];

			$data[] = $record_output;
		}

		$datum_object->set_data($data);

		// Only add to static container if data is non-empty
		// (filter check in foreach may have skipped all locators)
		if (!empty($data)) {
			self::$datum[] = $datum_object;
		}

		return $datum_object;
	}


	/**
	 * BUILD_DATUM_CONTEXT
	 * Builds context array (column definitions) for a datum group.
	 * @param string $diffusion_tipo
	 * @param array $ddo_map
	 * @return array
	 */
	private static function build_datum_context(string $diffusion_tipo, array $ddo_map): array {

		$context = [];

		// Get the diffusion node info
		$diffusion_node_instance = ontology_node::get_instance($diffusion_tipo);
		if (!$diffusion_node_instance) {
			return $context;
		}

		$properties = $diffusion_node_instance->get_properties();

		// tipo and term come from the diffusion node, not from the component
		$term = $diffusion_node_instance->get_term(DEDALO_STRUCTURE_LANG);

		// Model comes from diffusion ontology node
		$field_model = ontology_node::get_model_by_tipo($diffusion_tipo);

		// Build parent hash-set (O(1) lookup) then filter+clone+clean in one pass
		$parent_set = array_flip(array_filter(array_column((array)$ddo_map, 'parent')));
		$cleaned_lasts_ddo_chain = [];
		foreach ($ddo_map as $ddo) {
			if (isset($parent_set[$ddo->tipo])) continue;
			$clean = clone $ddo;
			unset($clean->typo, $clean->type, $clean->parent, $clean->section_tipo, $clean->diffusion_tipo);
			$cleaned_lasts_ddo_chain[] = $clean;
		}

		$context[] = (object)[
			'term'   		=> $term,
			'tipo'   		=> $diffusion_tipo,
			'model'  		=> $field_model,
			'parent' 		=> $diffusion_node_instance->get_parent(),
			'parser' 		=> $properties->process->parser ?? new stdClass(),
			'columns' 		=> array_values($cleaned_lasts_ddo_chain)
		];

		// Resolve output_format
		// 1. Check if defined explicitly in the ontology node properties
		$output_format = $properties->process->output_format ?? null;

		// 2. Fallback to the component's default format based on the diffusion type (currently 'sql' is assumed)
		// To properly do this, we find the component model of the main target of this diffusion node.
		// For simplicity, we get the component model from the ddo_map (if it exists)
		if (!$output_format) {
			$diffusion_type = 'sql'; // Future: get from diffusion_element or rqo

			// Find the main component model from the first ddo map item
			$target_model = null;
			if (!empty($ddo_map)) {
				$first_ddo = $ddo_map[0];
				$target_model = $first_ddo->model ?? ontology_node::get_model_by_tipo($first_ddo->tipo);
			}

			if ($target_model && class_exists($target_model) && property_exists($target_model, 'diffusion_output_format')) {
				$output_formats = $target_model::$diffusion_output_format;
				if (isset($output_formats[$diffusion_type])) {
					$output_format = $output_formats[$diffusion_type];
				}
			}
		}

		// Inject the calculated output format into the context
		if ($output_format) {
			$context[0]->output_format = $output_format;
		}


		if(isset($properties->varchar)){
			$context[0]->varchar = $properties->varchar;
		}

		if(isset($properties->length)){
			$context[0]->length = $properties->length;
		}

		if(isset($properties->index)){
			$context[0]->index = $properties->index;
		}

		return $context;
	}


	/**
	 * DIFFUSE_RDF
	 * Handles direct RDF diffusion requests (diffusion_element.diffusion.type = "rdf").
	 * Processes each search result through diffusion_rdf::update_record, saves RDF files,
	 * and returns both saved file URLs and raw RDF/XML string in the response.
	 *
	 * @param string $diffusion_element_tipo
	 * @param string $section_tipo
	 * @param iterable $db_result
	 * @param array $langs
	 * @param array $main
	 * @param object $options
	 * @return object
	 */
	private static function diffuse_rdf(string $diffusion_element_tipo, string $section_tipo, $db_result, array $langs, array $main, object $options): object {

		$response = new stdClass();
			$response->result = false;
			$response->msg    = 'Error. RDF diffusion failed';
			$response->errors = [];

		try {
			include_once DEDALO_DIFFUSION_PATH . '/class.diffusion_rdf.php';

			$diffusion_data = [];
			$raw_xml_parts  = [];
			$datum_data     = [];
			$parent         = ontology_node::get_instance($diffusion_element_tipo)->get_parent();
			$rdf_term       = ontology_node::get_term_by_tipo($diffusion_element_tipo, DEDALO_STRUCTURE_LANG);
			$properties     = ontology_node::get_instance($diffusion_element_tipo)->get_properties();
			$service_name   = $properties->diffusion->service_name ?? '';
			$sub_path       = '/rdf/' . $service_name . '/';

			foreach ($db_result as $locator) {

				if (diffusion_chain_processor::is_used($locator->section_tipo, intval($locator->section_id))) {
					continue;
				}
				diffusion_chain_processor::mark_used($locator->section_tipo, intval($locator->section_id));

				$rdf_instance = new diffusion_rdf(null);
				$rdf_response = $rdf_instance->update_record((object)[
					'section_tipo'			 => $locator->section_tipo,
					'section_id'			 => $locator->section_id,
					'diffusion_element_tipo' => $diffusion_element_tipo,
					'save_file'				 => true,
					'skip_publication_check'	 => $options->skip_publication_state_check ?? false
				]);

				if (!empty($rdf_response->diffusion_data)) {
					$diffusion_data = array_merge($diffusion_data, $rdf_response->diffusion_data);
				}
				if (!empty($rdf_response->data)) {
					$raw_xml_parts[] = $rdf_response->data;
				}

				$entries = new stdClass();
				$rdf_value = new stdClass();
					$rdf_value->tipo = $diffusion_element_tipo;
					$rdf_value->lang = null;
					$rdf_value->value = $rdf_response->data ?? null;
				if (!empty($rdf_response->diffusion_data[0]->file_url)) {
					$rdf_value->file_url = $rdf_response->diffusion_data[0]->file_url;
				}
				$entries->{$diffusion_element_tipo} = [$rdf_value];

				$datum_data[] = (object)[
					'section_id' => $locator->section_id,
					'entries' => $entries
				];
			}

			// Build RDF datum using canonical diffusion datum semantics
			$datum = new diffusion_datum();
				$datum->set_diffusion_tipo($diffusion_element_tipo);
				$datum->set_section_tipo($section_tipo);
				$datum->set_term($rdf_term);
				$datum->set_model('diffusion_element');
				$datum->set_parent($parent);
				$datum->set_context([
					(object)[
						'term' => $rdf_term,
						'tipo' => $diffusion_element_tipo,
						'model' => 'diffusion_element',
						'parent' => $parent,
						'parser' => new stdClass(),
						'output_format' => 'rdf',
						'columns' => []
					]
				]);
				$datum->set_data($datum_data);

			$response->result        		= true;
			$response->msg           		= 'OK. RDF diffusion done';
			$response->langs         		= $langs;
			$response->main_lang     		= DEDALO_DATA_LANG_DEFAULT;
			$response->main          		= $main;
			$response->DEDALO_MEDIA_PATH 	= DEDALO_MEDIA_PATH;
			$response->DEDALO_MEDIA_URL  	= DEDALO_MEDIA_URL;
			$response->sub_path        		= $sub_path;
			$response->datum         		= [$datum];

		} catch (Exception $e) {
			$response->msg	= 'Error: ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}

		return $response;
	}
}
