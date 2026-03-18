<?php declare(strict_types=1);


require_once(DEDALO_DIFFUSION_PATH . '/class.diffusion_activity_logger.php');

/**
 * DIFFUSION_CHAIN_PROCESSOR
 * Core engine for resolving diffusion data chains recursively.
 * Refactored from diffusion_data logic to support new API patterns.
 */
class diffusion_chain_processor {

	/**
	 * @var array $debug_chain Internal storage for chain trace
	 */
	private array $debug_chain = [];

	/**
	 * @var array $resolved_sections_cache Static cache for resolved sections
	 * Key format: [$section_tipo][$byte] = $bit
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
		$is_publishable 	= $options->is_publishable;

		// Find children of this parent node that belong to the current section_tipo
		$children = array_filter($ddo_map, fn($item) => 
			$item->parent === $parent && (empty($item->section_tipo) || $item->section_tipo === $section_tipo)
		);

		$ar_results = [];
		foreach ($children as $ddo) {
			$ddo_results = $this->resolve_ddo_value($ddo, $ddo_map, $section_tipo, $section_id, $level, $is_publishable);
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
	 * @param bool $is_publishable
	 * @return array
	 */
	private function resolve_ddo_value(object $ddo, array $ddo_map, string $section_tipo, string|int $section_id, int $level, bool $is_publishable): array {

		$current_tipo = $ddo->tipo;
		
		// if the ddo has not a tipo defined, the ddo indicate a filter locator with section_tipo only.
		// stop here and return an empty array
		if(empty($current_tipo)){
			return [];
		}

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
				'diffusion',
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
			return $this->process_relation_component($ddo, $element, $ddo_map, $children, $level, $is_publishable);
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
	 * @param int $level
	 * @param bool $is_publishable
	 * @return array Array containing a single diffusion_data_object wrapping all resolved relational values
	 */
	private function process_relation_component(object $ddo, object $element, array $ddo_map, array $children, int $level, bool $is_publishable): array {
		
		$current_tipo 	= $ddo->tipo;

		// Extract raw data (locators referring to linked sections)
		$diffusion_data = $element->get_diffusion_data($ddo, self::$diffusion_element_tipo);
		$element_model 	= $element->get_model(); 
		$ar_locators 	= $diffusion_data[0]->get_value() ?? [];

		// Normalize locators to array for uniform processing iteration
		if (!is_array($ar_locators)) {
			$ar_locators = [$ar_locators];
		}

		// Fetch linked diffusion node settings to check for explicit publish override
		$diffusion_tipo = $ddo->diffusion_tipo;
		$diffusion_node = ontology_node::get_instance($diffusion_tipo);
		$properties = $diffusion_node->get_properties();
		$publishable = $properties->is_publishable ?? null;

		// Reset value on temporary container to accumulate validated/resolved items later
		$new_diffusion_data = $diffusion_data;
		$new_diffusion_data[0]->set_value([]);

		$relation_values     = [];
		
		// Create a "whitelist" of section_tipo values authorized for recursive data extraction
		// based on the child nodes defined in the DDO map for this relation component.
		$valid_sections_tipo = [];
		foreach ($children as $child) {
			if(!empty($child->section_tipo)) {
				$valid_sections_tipo[] = $child->section_tipo;
			}
		}

		foreach ($ar_locators as $locator) {

			// Check publishability of the LINKED section (not the parent section).
			// $publishable (from diffusion node properties) overrides the live check.
			$current_is_publishable = $publishable ?? diffusion_utils::is_publishable($locator);

			// If the parent is not publishable, skip the true locators
			// This is because the parent is not publishable, so the true locators should not changed
			// Only non publicable locators can be tested in resolution chain to remove them from the database.
			if($is_publishable === false && $current_is_publishable === true){
				continue;
			}

			// A. QUEUE: Always queue publishable locators for later diffusion of linked sections.
			// Unpublishable locators are queued too so they can be marked for deletion.
			$target_diffusion_tipo = self::get_section_diffusion_node($locator->section_tipo);
			if ($level > 0 && !empty($target_diffusion_tipo) && $element_model !== 'relation_list') {				
				$target_level = $level - 1;
				dd_diffusion_api::$datum_unresolved["$target_level:$target_diffusion_tipo"][] = $locator;
			}

			// Skip unpublishable locators from value collection.
			// A related section that is not published must not appear in the output values.
			if($is_publishable === false || $current_is_publishable === false){
				continue;
			}

			// Validate locator
			$validated = empty($valid_sections_tipo)
				? true
				: in_array($locator->section_tipo, $valid_sections_tipo);

			// B. RECURSION: Resolve child fields if explicitly defined in DDO map for this specific section_tipo
			// We only recurse if the locator's target section_tipo is explicitly mapped in the whitelist ($valid_sections_tipo).
			$child_results = [];
			if ($validated === true) {
				$child_results = $this->resolve_chain((object)[
					'ddo_map'      		=> $ddo_map,
					'parent'       		=> $current_tipo,
					'section_tipo' 		=> $locator->section_tipo,
					'section_id'   		=> $locator->section_id,
					'level'        		=> $level,
					'is_publishable' 	=> $current_is_publishable
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

				// If no children resolved, check if the locator's target section_tipo is explicitly mapped in the whitelist ($valid_sections_tipo)
				// If not mapped, skip the locator.
				// check if valid_sections_tipo is defined because the ddo_map has it,
				// but the children is empty and the locator needs to be filtered by section_tipo
				// relation_list case or component_auto_complete_hi with a end ddo only with the section_tipo defined.
				// in those cases only the locator filtered by the section_tipo defined is the value.
				if(!empty($valid_sections_tipo) && !in_array($locator->section_tipo, $valid_sections_tipo)){
					continue;
				}else{
					// Fallback: If no children resolved (either bypassed due to not being in the 
					// whitelist, or child resolution returned empty), simply return the raw 
					// locator object itself without extracting deeper data of that linked section.
					$new_diffusion_data[0]->value[] = $locator;
					$relation_values = $new_diffusion_data;
				}
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
		$terminal_results = $element->get_diffusion_data($ddo, self::$diffusion_element_tipo);
		
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
		
		// Fallback to current component tipo if explicit diffusion override is not supplied
		$meta_tipo      = $ddo->diffusion_tipo ?? $current_tipo;
		
		// Obtain readable title label translation belonging to the original source component
		$component_node = ontology_node::get_instance($current_tipo);
		$label          = $component_node->get_term(DEDALO_DATA_LANG);

		// Obtain readable export term identifier title from targeted API dataset schema
		$diffusion_node = ontology_node::get_instance($meta_tipo);
		$term           = $diffusion_node->get_term(DEDALO_STRUCTURE_LANG);
		
		// Map readable component model descriptor reference for diagnostics inside output payload
		$model_tipo     = $diffusion_node->get_model_tipo();
		$model_name     = ontology_node::get_term_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG);

		// Pack everything inside structured output object wrapper standard payload container
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
	 * Calls a custom static class method handler configured in the DDO map.
	 * format "ClassName::methodName"
	 * 
	 * Enables executing specialized external resolution hooks (e.g., custom SQL mappings, 
	 * thesaurus lookups, or value transformations) where standard component getters 
	 * do not suffice for the export format structure.
	 * 
	 * @param string $fn Static method identifier string (e.g., "diffusion_sql::map_to_terminoID")
	 * @param object $element The Component instance executing within the scope
	 * @param object $ddo DDO configuration map context
	 * @return array<diffusion_data_object> Uniform array of resolved output payload items
	 */
	private function dispatch_class_method(string $fn, object $element, object $ddo): array {
		
		// Parse string for static method call convention segments
		$parts = explode('::', $fn);
		if (count($parts) !== 2) {
			debug_log(__METHOD__ . " Invalid class method format: $fn", logger::ERROR);
			return [];
		}

		$class_name  = $parts[0];
		$method_name = $parts[1];

		// Verify execution target safely prior to attempting dynamic call triggers
		if (!class_exists($class_name) || !method_exists($class_name, $method_name)) {
			debug_log(__METHOD__ . " Class or method not found: $fn", logger::ERROR);
			return [];
		}

		try {
			// Call static method supplying the active component and configuration DDO
			$result = $class_name::$method_name($element, $ddo);

			// Normalize single result items into iterable containers standard arrays
			if (!is_array($result)) {
				$result = [$result];
			}

			$ar_results = [];
			foreach ($result as $item) {
				if ($item instanceof diffusion_data_object) {
					$ar_results[] = $item;
				} else {
					
					// Wrap raw values into structured datasets standard output container payload structs
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
		self::$section_diffusion_map = [];
		self::$resolved_sections_cache = [];
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
	 * Maps section_tipo identifiers to their corresponding top-level diffusion nodes.
	 * 
	 * Scans the full diffusion template tree definitions to build direct lookups, 
	 * prioritizing `*_alias` model variations. If multiple containers target synonym 
	 * sections, alias views take precedence over generic structures for disambiguation.
	 * 
	 * @param string $diffusion_element_tipo The parent diffusion element configuration anchor
	 * @return array Map of [section_tipo => diffusion_tipo]
	 */
	private static function build_section_diffusion_map(string $diffusion_element_tipo): array {
		
		$map = [];
		
		// Get all recursive children nodes under the element scope node tree
		$ar_diffusion_nodes = ontology_node::get_ar_recursive_children(
			$diffusion_element_tipo			
		);
		
		foreach ($ar_diffusion_nodes as $diffusion_tipo) {
			
			// Resolve which section_tipo this diffusion container node targets and maps
			$ar_sections = ontology_node::get_ar_tipo_by_model_and_relation(
				$diffusion_tipo,
				'section',
				'related',
				true
			);

			$model_name = ontology_node::get_model_by_tipo($diffusion_tipo);
			
			foreach ($ar_sections as $section_tipo) {
				
				// Keep first match fallback default; let alias variants override generic models
				if (!isset($map[$section_tipo]) || str_contains($model_name, '_alias')) {
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
	 * When multiple candidates target the same section, priority is given to
	 * alias models (e.g., `table_alias` over generic `table`). This ensures that 
	 * explicit contextual mappings or alternate views defined in the ontology 
	 * take precedence over standard generic mappings during resolution.
	 * 
	 * @param string $section_tipo
	 * @return string|null diffusion_tipo or null if not in scope
	 */
	public static function get_section_diffusion_node(string $section_tipo): ?string {
		// 1. Check internal map scope
		if (isset(self::$section_diffusion_map[$section_tipo])) {
			return self::$section_diffusion_map[$section_tipo];
		}

		// Fetch all children nodes defined recursively under the current diffusion element scope
		$ar_diffusion_nodes = ontology_node::get_ar_recursive_children(
			self::$diffusion_element_tipo		
		);

		$candidates = [];
		foreach ($ar_diffusion_nodes as $current_tipo) {
			
			// Resolve the target section_tipo that this node is configured to represent
			$current_target_section_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
				$current_tipo,
				'section',
				'related',
				true
			)[0] ?? null;

			// Store matches indexed by model_name for priority scoring and overrides below
			if($current_target_section_tipo && $current_target_section_tipo === $section_tipo) {

				$model_name = ontology_node::get_model_by_tipo($current_tipo);
				$candidates[$model_name] = $current_tipo;
			}
		}

		// Note: Giving priority to the table alias when more than one item (e.g. table) 
		// is targeting to the dessired section tipo (E.g. 'table' => 'ts' and 'table_alias' => 'ts_themes').
		if( !empty($candidates) ) {
			$aliasKey = array_find($candidates, fn($k) => str_contains($k, '_alias'));
			if($aliasKey) {
				return $candidates[$aliasKey];
			}
			return array_key_first($candidates);
		}

		return null;
	}
	


	/**
	 * MARK_USED
	 * Marks a numeric value as utilized within a specific ID context.
	 * Uses a bitmask approach stored in $used_cache to minimize memory footprint.
	 *
	 * @param string $section_tipo Context identifier (e.g., section_tipo or sequence ID)
	 * @param int $section_id The numeric value to mark
	 * @return void
	 */
	public static function mark_used(string $section_tipo, int $section_id): void
	{
		$byte = $section_id >> 3; // which byte/char index
		$bit  = $section_id & 7;  // which bit inside that byte

		if (!isset(self::$resolved_sections_cache[$section_tipo][$byte])) {
			self::$resolved_sections_cache[$section_tipo][$byte] = "\x00"; // init byte as 00000000
		}

		// OR the bit in — flips that specific bit to 1
		self::$resolved_sections_cache[$section_tipo][$byte] = chr(ord(self::$resolved_sections_cache[$section_tipo][$byte]) | (1 << $bit));
	}



	/**
	 * IS_USED
	 * Verifies if a numeric value has been previously marked as used within an ID context.
	 *
	 * @param string $section_tipo Context identifier
	 * @param int $section_id The numeric value to check
	 * @return bool True if the bit is set in the bitmask, false otherwise
	 */
	public static function is_used(string $section_tipo, int $section_id): bool
	{
		$byte = $section_id >> 3;
		$bit  = $section_id & 7;

		if (!isset(self::$resolved_sections_cache[$section_tipo][$byte])) {
			return false; // byte never set = unused
		}

		// AND to isolate the bit — non-zero means it was set
		return (ord(self::$resolved_sections_cache[$section_tipo][$byte]) & (1 << $bit)) !== 0;
	}

}

