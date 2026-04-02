<?php declare(strict_types=1);


require_once(DEDALO_DIFFUSION_PATH . '/class.diffusion_activity_logger.php');

/**
 * DIFFUSION_API
 * Main entry point for the new diffusion system.
 * Handles SQO-based requests and returns standardized JSON data.
 */
class dd_diffusion_api {


	public static $datum = [];

	public static $datum_unresolved = [];


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

			self::process_datum($source_tipo, $db_result, $levels, $options);

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
	 * API wrapper for diffusion_utils::get_diffusion_info
	 *
	 * @param object $rqo Request Query Object
	 * @return object Standardized JSON response
	 */
	public static function get_diffusion_info(object $rqo): object {

		$response = new stdClass();

		$options = $rqo->options ?? new stdClass();

		// Validate required options
		if (empty($options->section_tipo)) {
			$response->result = false;
			$response->msg    = 'Error. Missing section_tipo';
			$response->errors = ['Missing section_tipo'];
			return $response;
		}

		try {
			// Call utils
			$info_response = diffusion_utils::get_diffusion_info($options);

			// Map utils response to API response structure
			$response = $info_response;

		} catch (Exception $e) {
			$response->result = false;
			$response->msg    = 'Error: ' . $e->getMessage();
			$response->errors = [$e->getMessage()];
			if (class_exists('logger')) {
				debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
			}
		}

		return $response;
	}


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

		$diffusion_tipo = $rqo->options->diffusion_tipo ?? null;
		if (!$diffusion_tipo) {
			$response->result = false;
			$response->errors[] = 'Missing diffusion_tipo';
			return $response;
		}

		$ontology_node = ontology_node::get_instance($diffusion_tipo);
		$properties = $ontology_node->get_properties();

		$response->result = true;
		$response->data = $properties->process ?? new stdClass();

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

		$main = [];
		$current_tipo = $diffusion_tipo;
		$hierarchy = [];

		// Traverse up the hierarchy
		while ($current_tipo) {
			$node = ontology_node::get_instance($current_tipo);
			if (!$node) break;

			$model_tipo = $node->get_model_tipo();
			$model_name = ontology_node::get_term_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG);
			$term       = $node->get_term(DEDALO_STRUCTURE_LANG);
			$parent     = $node->get_parent();
			$properties = $node->get_properties();

			$item = (object)[
				'diffusion_tipo' => $current_tipo,
				'term'           => $term,
				'model'          => $model_name
			];

			if ($parent) {
				$item->parent = $parent;
			}

			// Add properties for diffusion_element
			if ($model_name === 'diffusion_element' && $properties) {
				$item->properties = $properties;
			}

			$hierarchy[] = $item;

			// Stop at diffusion_domain
			if ($model_name === 'diffusion_domain') {
				break;
			}

			$current_tipo = $parent;
		}

		// Reverse to get top-down order (domain -> group -> element -> database)
		$main = array_reverse($hierarchy);

		return $main;
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


		$data = [];
		// Process each record and group by section
		foreach ($iterable_data as $locator) {

			// Check if the locator has already been used
			if (diffusion_chain_processor::is_used($locator->section_tipo, intval($locator->section_id))) {
				continue;
			}

			// set the locator as used
			diffusion_chain_processor::mark_used($locator->section_tipo, intval($locator->section_id));

			$is_publishable = $publishable ?? diffusion_utils::is_publishable($locator);

			// Build entries keyed by diffusion_tipo
			$entries = new stdClass();

			foreach ($combined_ddo_map as $node_tipo => $ddo_map) {
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
					$entries->{$node_tipo} = $all_values;
				}
			}

			// Structure record output
			$record_output = (object)[
				'section_id' => $locator->section_id,
				'entries'    => (!$is_publishable) ? 'delete' : $entries
			];

			$data[] = $record_output;
		}

		$datum_object->set_data($data);

		// ad. to static container
		self::$datum[] = $datum_object;

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
		// For simplicity, we get the target component model from the ddo_map (if it exists)
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
}
