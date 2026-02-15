<?php declare(strict_types=1);


require_once(DEDALO_DIFFUSION_PATH . '/class.diffusion_activity_logger.php');

/**
 * DIFFUSION_CHAIN_PROCESSOR
 * Core engine for resolving diffusion data chains recursively.
 * Refactored from diffusion_data logic to support new API patterns.
 */
class diffusion_chain_processor {

	/**
	 * Maximum recursion depth for cross-section resolution
	 */
	private const MAX_DEPTH = 5;

	/**
	 * @var array $debug_chain Internal storage for chain trace
	 */
	private array $debug_chain = [];

	/**
	 * @var array $resolved_sections_cache Static cache for resolved sections
	 * Key format: "{section_tipo}_{section_id}"
	 */
	private static array $resolved_sections_cache = [];

	/**
	 * @var array $section_diffusion_map Map of section_tipo => diffusion_tipo within scope
	 */
	private static array $section_diffusion_map = [];

	/**
	 * @var string|null $diffusion_element_tipo Current diffusion element scope
	 */
	private static ?string $diffusion_element_tipo = null;

	/**
	 * @var int $current_depth Current recursion depth for cross-section resolution
	 */
	private int $current_depth = 0;

	private ?object $properties;

	/**
	 * RESOLVE_CHAIN
	 * Standard recursive resolution of DDO map chains.
	 * 
	 * @param object $options {
	 *   array $ddo_map,
	 *   string $parent,
	 *   string $section_tipo,
	 *   string|int $section_id,
	 *   object $properties
	 * }
	 * @return array<diffusion_data_object>
	 */
	public function resolve_chain(object $options): array {
		
		if (!isset($options->ddo_map, $options->parent, $options->section_tipo, $options->section_id)) {
			throw new InvalidArgumentException('Missing required properties in options object (ddo_map, parent, section_tipo, section_id)');
		}

		// Log activity (deduplicated by logger)
		diffusion_activity_logger::log($options->section_tipo, (int)$options->section_id, self::$diffusion_element_tipo);

		$ddo_map      		= $options->ddo_map;
		$parent       		= $options->parent;
		$section_tipo 		= $options->section_tipo;
		$section_id   		= $options->section_id;
		$level        		= $options->level ?? 0;

		// Find children of this parent node that belong to the current section_tipo
		$children = array_filter($ddo_map, function($item) use($parent, $section_tipo) {
			return $item->parent === $parent && $item->section_tipo === $section_tipo;
		});

		$ar_results = [];
		foreach ($children as $ddo) {
			$ddo_results = $this->resolve_ddo_value($ddo, $ddo_map, $section_tipo, $section_id, $level);
			$ar_results = array_merge($ar_results, $ddo_results);
		}

		return $ar_results;
	}

	/**
	 * RESOLVE_DDO_VALUE
	 * Resolves a single DDO node, either getting terminal data or recursing.
	 * Supports fn property for custom method dispatch:
	 * - Component methods: "fn": "get_section_id"
	 * - Class methods: "fn": "diffusion_sql::map_to_terminoID"
	 * 
	 * @param object $ddo
	 * @param array $ddo_map
	 * @param string $section_tipo
	 * @param string|int $section_id
	 * @param int $level
	 * @return array
	 */
	private function resolve_ddo_value(object $ddo, array $ddo_map, string $section_tipo, string|int $section_id, int $level): array {
		
		$current_tipo = $ddo->tipo;
		$model_name   = ontology_node::get_model_by_tipo($current_tipo);

		// Add to debug chain
		$this->debug_chain[] = "{$section_tipo}_{$section_id} -> {$current_tipo}" . (isset($ddo->fn) ? "[fn:{$ddo->fn}]" : "");

		// Get component instance
		$element = $model_name === 'relation_list'
			? new relation_list($current_tipo, $section_id, $section_tipo, 'list')
			: component_common::get_instance(
				$model_name,
				$current_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);

		if (!$element) {
			debug_log(__METHOD__ . " Component instance not found for tipo {$current_tipo}", logger::WARNING);
			return [];
		}
		// Check for children in map
		$children = array_filter($ddo_map, function($item) use($current_tipo) {
			return $item->parent === $current_tipo;
		});

		// 1. RELATION COMPONENT BRANCH: Handles both queuing and recursion
		$is_relation_component = in_array($model_name, component_relation_common::get_components_with_relations());
		if ($is_relation_component) {
			return $this->process_relation_component($ddo, $element, $ddo_map, $children, $level);
		}

		// 2. TERMINAL CASE: Standard components are always terminal
		return $this->process_terminal_component($ddo, $element);
	}

	/**
	 * PROCESS_RELATION_COMPONENT
	 * Handles components that establish relationships with other sections (Portals, Relations, etc.).
	 * This method performs two primary functions:
	 * 1. Queues the target sections in dd_diffusion_api::$datum_unresolved for top-level asynchronous resolution.
	 * 2. Optionally recurses into specific target fields if children are defined for that section_tipo in the ddo_map.
	 * 
	 * @param object $ddo Original DDO configuration for this component
	 * @param object $element Component instance providing the relational data
	 * @param array $ddo_map The full DDO mapping array for the current chain
	 * @param array $children Pre-filtered list of child mappings from the ddo_map belonging to this parent
	 * @return array Array containing a single diffusion_data_object wrapping all resolved relational values
	 */
	private function process_relation_component(object $ddo, object $element, array $ddo_map, array $children, int $level): array {
		
		$current_tipo 	= $ddo->tipo;
		$diffusion_data = $element->get_diffusion_data($ddo);
		$ar_locators 	= $diffusion_data[0]->get_value() ?? [];

		if (!is_array($ar_locators)) {
			$ar_locators = [$ar_locators];
		}

		$diffusion_tipo = $ddo->diffusion_tipo;
		$diffusion_node = ontology_node::get_instance($diffusion_tipo);
		$properties = $diffusion_node->get_properties();
		$publishable = $properties->publishable ?? null;

		$relation_values     = [];
		$valid_sections_tipo = array_map(fn($child) => $child->section_tipo, $children);

		foreach ($ar_locators as $locator) {

			$is_publishable = $publishable ?? diffusion_utils::is_publishable($locator);

			if($is_publishable !== true){
				continue;
			}

			// A. QUEUE: Store in datum_unresolved for later resolution
			$target_diffusion_tipo = self::get_section_diffusion_node($locator->section_tipo);
			if ($level > 0 && !empty($target_diffusion_tipo)) {
				dd_diffusion_api::$datum_unresolved[$target_diffusion_tipo][] = $locator;
			}

			// B. RECURSION: Resolve child fields if explicitly defined in DDO map for this specific section_tipo
			$child_results = [];
			if (in_array($locator->section_tipo, $valid_sections_tipo)) {
				$child_results = $this->resolve_chain((object)[
					'ddo_map'      => $ddo_map,
					'parent'       => $current_tipo,
					'section_tipo' => $locator->section_tipo,
					'section_id'   => $locator->section_id,
					'level'        => $level - 1
				]);
			}

			if (!empty($child_results)) {
				// Merge values from child DDOs
				foreach ($child_results as $res) {
					$val = $res->get_value();
					if (is_array($val)) {
						$relation_values = array_merge($relation_values, $val);
					} else {
						$relation_values[] = $val;
					}
				}
			} else {
				// Fallback: Always return at least the raw locator if no children resolved
				$relation_values[] = $locator;
			}
		}

		// Relations always return a single wrapped object
		return [$this->wrap_into_diffusion_data_object($ddo, $current_tipo, $relation_values)];
	}

	/**
	 * PROCESS_TERMINAL_COMPONENT
	 * Handles standard components that do not define children in the ddo_map.
	 * Fetches data directly using the component's get_diffusion_data implementation.
	 * 
	 * @param object $ddo DDO configuration for this component
	 * @param object $element Component instance
	 * @return array Array containing the wrapped diffusion_data_object
	 */
	private function process_terminal_component(object $ddo, object $element): array {
		
		$current_tipo     = $ddo->tipo;
		$terminal_results = $element->get_diffusion_data($ddo);
		
		return [$this->wrap_into_diffusion_data_object($ddo, $current_tipo, $terminal_results)];
	}

	/**
	 * WRAP_INTO_DIFFUSION_DATA_OBJECT
	 * Standardizes the structure of a resolved value into a diffusion_data_object.
	 * Attaches essential metadata (node_tipo, label, term, model) based on the ontology context.
	 * 
	 * @param object $ddo Configuration source for id and meta_tipo
	 * @param string $current_tipo The technical tipo of the component
	 * @param mixed $value The resolved data value(s)
	 * @return diffusion_data_object The structured result object
	 */
	private function wrap_into_diffusion_data_object(object $ddo, string $current_tipo, mixed $value): diffusion_data_object {
		
		$meta_tipo      = $ddo->diffusion_tipo ?? $current_tipo;
		
		$component_node = ontology_node::get_instance($current_tipo);
		$label          = $component_node->get_term(DEDALO_DATA_LANG);

		$diffusion_node = ontology_node::get_instance($meta_tipo);
		$term           = $diffusion_node->get_term(DEDALO_STRUCTURE_LANG);
		
		$model_tipo     = $diffusion_node->get_model_tipo();
		$model_name     = ontology_node::get_term_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG);

		$res = new diffusion_data_object();
		$res->set_diffusion_tipo($meta_tipo);
		$res->set_id($ddo->id ?? $meta_tipo);
		$res->set_label($label);
		$res->set_term($term);
		$res->set_model($model_name);
		$res->set_value($value);

		return $res;
	}

	/**
	 * BUILD_ENTRIES
	 * Groups resolved diffusion_data_objects by their DDO id.
	 * 
	 * @param array $resolved_data Array of diffusion_data_object
	 * @return object Object with keys as DDO ids
	 */
	public function build_entries(array $resolved_data): object {
		
		$entries = new stdClass();

		foreach ($resolved_data as $ddo_res) {
			// Use id as key if present (preferred for multiple child chains), fallback to node_tipo
			$key = $ddo_res->id ?? $ddo_res->node_tipo ?? null;
			if (!$key) continue;

			if (!isset($entries->{$key})) {
				// First value: keep exactly as obtained
				$entries->{$key} = $ddo_res;
			} else {
				// Merge subsequent values: ensure we have an array
				$current_value  = $entries->{$key}->value;
				$incoming_value = $ddo_res->value;

				if (!is_array($current_value)) {
					$current_value = [$current_value];
				}
				
				if (is_array($incoming_value)) {
					$current_value = array_merge($current_value, $incoming_value);
				} else {
					$current_value[] = $incoming_value;
				}

				$entries->{$key}->value = $current_value;
			}
		}

		return $entries;
	}

	/**
	 * GET_DEBUG_CHAIN
	 * @return object
	 */
	public function get_debug_chain(): object {
		return (object)[
			'chain_string' => implode(' → ', array_unique($this->debug_chain))
		];
	}

	/**
	 * DISPATCH_CLASS_METHOD
	 * Calls a static class method in the format "ClassName::methodName".
	 * 
	 * @param string $fn e.g. "diffusion_sql::map_to_terminoID"
	 * @param object $element Component instance
	 * @param object $ddo DDO configuration
	 * @return array<diffusion_data_object>
	 */
	private function dispatch_class_method(string $fn, object $element, object $ddo): array {
		
		$parts = explode('::', $fn);
		if (count($parts) !== 2) {
			debug_log(__METHOD__ . " Invalid class method format: $fn", logger::ERROR);
			return [];
		}

		$class_name  = $parts[0];
		$method_name = $parts[1];

		if (!class_exists($class_name) || !method_exists($class_name, $method_name)) {
			debug_log(__METHOD__ . " Class or method not found: $fn", logger::ERROR);
			return [];
		}

		try {
			// Call static method with component and ddo
			$result = $class_name::$method_name($element, $ddo);

			// Normalize result to array of diffusion_data_object
			if (!is_array($result)) {
				$result = [$result];
			}

			$ar_results = [];
			foreach ($result as $item) {
				if ($item instanceof diffusion_data_object) {
					$ar_results[] = $item;
				} else {
					// Wrap raw values
					$ar_results[] = new diffusion_data_object((object)[
						'tipo'  => $ddo->tipo,
						'lang'  => null,
						'value' => $item
					]);
				}
			}

			return $ar_results;

		} catch (Exception $e) {
			debug_log(__METHOD__ . " Error calling $fn: " . $e->getMessage(), logger::ERROR);
			return [];
		}
	}

	/**
	 * RESET_CACHE
	 * Clears all static caches. Call at start of each API request.
	 * 
	 * @return void
	 */
	public static function reset_cache(): void {
		self::$resolved_sections_cache = [];
		self::$section_diffusion_map = [];
		self::$diffusion_element_tipo = null;
	}

	/**
	 * SET_DIFFUSION_ELEMENT_SCOPE
	 * Sets the current diffusion element scope and builds section->diffusion_node map.
	 * 
	 * @param string $diffusion_element_tipo The diffusion element tipo
	 * @return void
	 */
	public static function set_diffusion_element_scope(string $diffusion_element_tipo): void {
		
		self::$diffusion_element_tipo = $diffusion_element_tipo;
		
		// Build section -> diffusion_node map from all diffusion nodes under this element
		self::$section_diffusion_map = self::build_section_diffusion_map($diffusion_element_tipo);
	}

	/**
	 * BUILD_SECTION_DIFFUSION_MAP
	 * Finds all diffusion nodes under a diffusion_element and maps their target sections.
	 * 
	 * @param string $diffusion_element_tipo
	 * @return array Map of section_tipo => diffusion_tipo
	 */
	private static function build_section_diffusion_map(string $diffusion_element_tipo): array {
		
		$map = [];
		
		// Get all children of the diffusion_element with model 'diffusion_node'
		$ar_diffusion_nodes = ontology_node::get_ar_recursive_children(
			$diffusion_element_tipo			
		);
		
		foreach ($ar_diffusion_nodes as $diffusion_tipo) {
			// Get the section_tipo this diffusion_node targets
			$ar_sections = ontology_node::get_ar_tipo_by_model_and_relation(
				$diffusion_tipo,
				'section',
				'related',
				true
			);
			
			foreach ($ar_sections as $section_tipo) {
				// Store the mapping (first diffusion_node wins if multiple)
				if (!isset($map[$section_tipo])) {
					$map[$section_tipo] = $diffusion_tipo;
				}
			}
		}
		
		return $map;
	}


	/**
	 * GET_SECTION_DIFFUSION_NODE
	 * Returns the diffusion_tipo for a section within current scope.
	 * 
	 * @param string $section_tipo
	 * @return string|null diffusion_tipo or null if not in scope
	 */
	public static function get_section_diffusion_node(string $section_tipo): ?string {
		// 1. Check internal map scope
		if (isset(self::$section_diffusion_map[$section_tipo])) {
			return self::$section_diffusion_map[$section_tipo];
		}

		$ar_diffusion_nodes = ontology_node::get_ar_recursive_children(
			self::$diffusion_element_tipo		
		);

		foreach ($ar_diffusion_nodes as $current_tipo) {
			$ar_sections = ontology_node::get_ar_tipo_by_model_and_relation(
				$current_tipo,
				'section',
				'related',
				true
			);

			if(empty($ar_sections)) {
				continue;
			}
			
			foreach ($ar_sections as $current_section_tipo) {
				// Store the mapping (first diffusion_node wins if multiple)
				if($section_tipo === $current_section_tipo) {
					return $current_tipo;
				}
			}
		}

		return null;
	}


	/**
	 * GET_CACHED_SECTION
	 * Returns cached resolution for a section if available.
	 * 
	 * @param string $section_tipo
	 * @param int|string $section_id
	 * @return array|null Cached result or null
	 */
	public static function get_cached_section(string $section_tipo, int|string $section_id): ?array {
		$cache_key = "{$section_tipo}_{$section_id}";
		return self::$resolved_sections_cache[$cache_key] ?? null;
	}

	/**
	 * SET_CACHED_SECTION
	 * Stores resolved section data in cache.
	 * 
	 * @param string $section_tipo
	 * @param int|string $section_id
	 * @param array $resolved_data
	 * @return void
	 */
	public static function set_cached_section(string $section_tipo, int|string $section_id, array $resolved_data): void {
		$cache_key = "{$section_tipo}_{$section_id}";
		self::$resolved_sections_cache[$cache_key] = $resolved_data;
	}

	/**
	 * RESOLVE_CROSS_SECTION
	 * Resolves a portal target section using its own diffusion node definition.
	 * Only resolves if the target section has a diffusion node in the current scope.
	 * 
	 * @param object $locator The locator pointing to the target section
	 * @param int $depth Current recursion depth
	 * @return array|null Resolved data or null if not resolvable
	 */
	public function resolve_cross_section(object $locator, int $depth = 0): ?array {
		
		// Depth protection
		if ($depth >= self::MAX_DEPTH) {
			debug_log(__METHOD__ . " Max depth reached for section: {$locator->section_tipo}_{$locator->section_id}", logger::WARNING);
			return null;
		}

		$section_tipo = $locator->section_tipo;
		$section_id   = $locator->section_id;

		// Check if target section has a diffusion node in scope
		$diffusion_tipo = self::get_section_diffusion_node($section_tipo);
		if (!$diffusion_tipo) {
			// Section not in scope, return null (caller should use raw locator data)
			return null;
		}

		// Check cache first
		$cached = self::get_cached_section($section_tipo, $section_id);
		if ($cached !== null) {
			return $cached;
		}

		// Get the ddo_map for this diffusion node
		$ddo_map = diffusion_data::get_ddo_map($diffusion_tipo, $section_tipo);
		if (empty($ddo_map)) {
			return null;
		}

		// Create new processor instance for nested resolution
		$nested_processor = new self();
		$nested_processor->current_depth = $depth + 1;

		// Resolve the chain for this section
		$resolved = $nested_processor->resolve_chain((object)[
			'ddo_map'      => $ddo_map,
			'parent'       => $section_tipo,
			'section_tipo' => $section_tipo,
			'section_id'   => $section_id
		]);

		// Cache the result
		self::set_cached_section($section_tipo, $section_id, $resolved);

		return $resolved;
	}

	/**
	 * GET_CURRENT_DEPTH
	 * Returns current recursion depth.
	 * 
	 * @return int
	 */
	public function get_current_depth(): int {
		return $this->current_depth;
	}

	/**
	 * SET_CURRENT_DEPTH
	 * Sets current recursion depth (used when creating nested processors).
	 * 
	 * @param int $depth
	 * @return void
	 */
	public function set_current_depth(int $depth): void {
		$this->current_depth = $depth;
	}

}

