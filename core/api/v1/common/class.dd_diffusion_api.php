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
	 *   source: { diffusion_tipo: "rsc..." },
	 *   sqo: { ... },
	 *   options: { levels: int, ... }
	 * }
	 * @return object Standardized JSON response
	 */
	public static function diffuse(object $rqo): object {
		
		$response = new stdClass();
			$response->result = false;
			$response->msg    = 'Error. Request failed';
			$response->errors = [];

		// Validate basic input
		if (empty($rqo->source->diffusion_tipo)) {
			$response->errors[] = 'Missing source->diffusion_tipo';
			return $response;
		}
		if (empty($rqo->sqo)) {
			$response->errors[] = 'Missing sqo (Search Query Object)';
			return $response;
		}

		$source_tipo   = $rqo->source->diffusion_tipo;
		$sqo_data      = $rqo->sqo;
		$options       = $rqo->options ?? new stdClass();
		// deep resolution of linked secitons
		$levels        = $options->levels ?? DEDALO_DIFFUSION_RESOLVE_LEVELS; // 2

		try {
			// 0. Reset caches for this request
			diffusion_chain_processor::reset_cache();
			diffusion_activity_logger::reset_cache();
			self::$datum = [];
			self::$datum_unresolved = [];

			// 1. Get diffusion_element (parent of source_tipo or source_tipo itself if it's a diffusion_element)
			$diffusion_element_tipo = diffusion_utils::get_diffusion_element($source_tipo);
			if ($diffusion_element_tipo !== false) {
				$diffusion_element_tipo = $source_tipo;
			} 
			
			// Set the diffusion element scope for cross-section resolution
			if ($diffusion_element_tipo) {
				diffusion_chain_processor::set_diffusion_element_scope($diffusion_element_tipo);
			}
			
			// Resolve section related to this node
			$main_section_tipo = diffusion_utils::get_related_section_tipo($source_tipo);
			if (!$main_section_tipo) {
				throw new Exception("No section related to $source_tipo");
			}

			// =====================================================
			// BUILD LANGS
			// =====================================================
			$langs = self::build_langs();

			// =====================================================
			// BUILD MAIN (hierarchy UP to diffusion_domain)
			// =====================================================
			$main = self::build_main_hierarchy($source_tipo);

			// =====================================================
			// BUILD DATUM (one object per section)
			// =====================================================
			
			// 3. Execute search using SQO
			$search    = search::get_instance(new search_query_object($sqo_data));
			$db_result = $search->search();

			self::process_datum($source_tipo, $db_result, $levels, $options);

			while (!empty(self::$datum_unresolved)) {
				foreach ( self::$datum_unresolved as $diffusion_tipo => $locators ) {

					$unique_locators=[];
					foreach ($locators as $locator) {
						if(!locator::in_array_locator($locator, $unique_locators,['section_tipo','section_id'])) {
							$unique_locators[] = $locator;
						}
					}

					self::process_datum($diffusion_tipo, $unique_locators, $levels, $options);

					unset(self::$datum_unresolved[$diffusion_tipo]);
				}
			}

			// 6. Final response
			$response->result 		= true;
			$response->msg    		= 'OK. Request done';
			$response->langs  		= $langs;
			$response->main_lang  	= DEDALO_DATA_LANG;
			$response->main   		= $main;
			$response->datum  		= self::$datum;


		} catch (Exception $e) {
			$response->msg = 'Error: ' . $e->getMessage();
			$response->errors[] = $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}

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
		
		$source_tipo = $rqo->source->diffusion_tipo ?? null;
		if (!$source_tipo) {
			$response->result = false;
			$response->errors[] = 'Missing diffusion_tipo';
			return $response;
		}

		$ontology_node = ontology_node::get_instance($source_tipo);
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
	 * @param string $source_tipo
	 * @return array
	 */
	private static function build_main_hierarchy(string $source_tipo): array {
		
		$main = [];
		$current_tipo = $source_tipo;
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
	 * @param string $source_tipo
	 * @param iterable $iterable_data
	 * @param int $levels
	 * @return diffusion_datum
	 */
	private static function process_datum(string $source_tipo, $iterable_data, int $levels, object $options): diffusion_datum {
		
		$source_node = ontology_node::get_instance($source_tipo);
		if (!$source_node) {
			throw new Exception("Ontology node not found for tipo: $source_tipo");
		}
		$parent = $source_node->get_parent();
		$main_section_tipo = diffusion_utils::get_related_section_tipo($source_tipo);

		// Identify all section-level diffusion nodes (children of source_tipo)
		$ar_children = ontology_node::get_ar_children($source_tipo);			

		// Build combined ddo_map from all nodes for this section
		$combined_ddo_map = [];
		$context = [];
		
		foreach ($ar_children as $node_tipo) {
			$ddo_map = diffusion_data::get_ddo_map($node_tipo, $main_section_tipo);
			$combined_ddo_map[$node_tipo] = $ddo_map;
			
			// Build context for each node (field definitions)
			$node_context = self::build_datum_context($node_tipo, $ddo_map);
			$context = array_merge($context, $node_context);
		}			

		$datum_object = new diffusion_datum();
			$datum_object->set_diffusion_tipo($source_tipo);
			$datum_object->set_section_tipo($main_section_tipo);
			$datum_object->set_term($source_node->get_term(DEDALO_STRUCTURE_LANG));
			$datum_object->set_model($source_node->get_model());
			$datum_object->set_parent($parent);
			$datum_object->set_context($context);

		$data = [];
		// Process each record and group by section
		foreach ($iterable_data as $locator) {			
			
			// Build entries keyed by diffusion_tipo
			$entries = new stdClass();
			
			foreach ($combined_ddo_map as $node_tipo => $ddo_map) {
				$processor = new diffusion_chain_processor();
				
				// Resolve the chain for this ddo_map
				$resolved_results = $processor->resolve_chain((object)[
					'ddo_map'      => $ddo_map,
					'parent'       => $locator->section_tipo,
					'section_tipo' => $locator->section_tipo,
					'section_id'   => $locator->section_id,
					'level'        => $levels
				]);
				
				// Get the value directly from get_diffusion_data() result
				$all_values = [];
				foreach ($resolved_results as $ddo_res) {
					$value = $ddo_res->value ?? [];
					if (!empty($value)) {
						// Merge all child values into one array
						$all_values = array_merge($all_values, $value);
					}
				}
				if (!empty($all_values) || ($options->include_empty ?? false) === true) {
					$entries->{$node_tipo} = $all_values;
				}
			}

			// Structure record output
			$record_output = (object)[
				'section_id' => $locator->section_id,
				'entries'    => $entries
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
		
		$context[] = (object)[
			'term'   		=> $term,
			'tipo'   		=> $diffusion_tipo,
			'model'  		=> $field_model,
			'parent' 		=> $diffusion_node_instance->get_parent(),
			'parser' 		=> $properties->process->parser ?? new stdClass(),
			'pre_parser'	 => $properties->process->pre_parser ?? new stdClass()
		];
		
		return $context;
	}
}
