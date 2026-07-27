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
	 * @var array $recursively_resolved Static cache for sections visited during
	 * recursive chain resolution. Prevents re-visiting the same section in nested
	 * resolve_chain calls. Separate from $resolved_sections_cache so that
	 * process_datum still creates top-level datum entries.
	 * Key format: ["{section_tipo}_{section_id}"] = true
	 */
	private static array $recursively_resolved = [];

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

		// Path-aware cycle detection: $visited is the ancestor chain of section locators
		// for the CURRENT recursion branch (not a global set). Add the current section so a
		// descendant that links back to it is blocked, while sibling references to the same
		// section via different branches still resolve (e.g. a coin referencing two types
		// that both resolve the same mint/material → both must appear in the grouped output).
		$visited = $options->visited ?? [];
		$current_key = $section_tipo . '_' . $section_id;
		if (!in_array($current_key, $visited, true)) {
			$visited[] = $current_key;
		}

		// Find children of this parent node that belong to the current section_tipo
		$children = array_filter($ddo_map, fn($item) =>
			$item->parent === $parent && (empty($item->section_tipo) || $item->section_tipo === $section_tipo)
		);

		$ar_results = [];
		foreach ($children as $ddo) {
			$ddo_results = $this->resolve_ddo_value($ddo, $ddo_map, $section_tipo, $section_id, $level, $is_publishable, $visited);
			$ar_results = array_merge($ar_results, $ddo_results);
		}

		return $ar_results;
	}



	/**
	 * RESOLVE_DDO_VALUE
	 * Resolves a single DDO node, either getting terminal data or recursing.
	 * Supports the `fn` property for custom component-method dispatch, e.g.
	 * "fn": "get_section_id". (DIFFU-05: the unused "Class::method" string-dispatch
	 * helper was removed; component fn resolution lives in
	 * component_common::get_diffusion_data.)
	 *
	 * @param object $ddo
	 * @param array $ddo_map
	 * @param string $section_tipo
	 * @param string|int $section_id
	 * @param int $level
	 * @param bool $is_publishable
	 * @return array
	 */
	private function resolve_ddo_value(object $ddo, array $ddo_map, string $section_tipo, string|int $section_id, int $level, bool $is_publishable, array $visited = []): array {

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
		$is_relation_component = in_array($model_name, component_relation_common::get_components_with_relations()) || $model_name === 'relation_list';
		if ($is_relation_component) {
			return $this->process_relation_component($ddo, $element, $ddo_map, $children, $level, $is_publishable, $visited);
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
	private function process_relation_component(object $ddo, object $element, array $ddo_map, array $children, int $level, bool $is_publishable, array $visited = []): array {
		
		$current_tipo 	= $ddo->tipo;

		// Extract raw data (locators referring to linked sections)
		$diffusion_data = $element->get_diffusion_data($ddo, self::$diffusion_element_tipo);
		$element_model 	= $element->get_model();

		// fn_terminal: the ddo's fn already produced the FINAL value (a lang-wrapped scalar
		// payload, NOT locators to iterate/recurse). Return it verbatim. Used by deep custom
		// resolutions that reproduce a v6 algorithm whole (e.g. designs iconography via
		// component_portal::get_diffusion_iconography). Gated by the flag so normal relation
		// fns (which DO return locators) are unaffected.
		if (($ddo->fn_terminal ?? false) === true) {
			return $diffusion_data;
		}

		$ar_locators 	= $diffusion_data[0]->get_value() ?? [];

		// add_parents metadata (parent chains with term labels), keyed by
		// "section_tipo_section_id". Computed by component_relation_common::get_diffusion_data
		// when ddo->fn==='add_parents'. Captured here so it can be re-attached to the raw
		// fallback locators below — otherwise the relation branch discards it and the
		// parser_locator::parents term resolution has nothing to walk (place / indexation).
		$parents_meta = $diffusion_data[0]->meta ?? null;

		// Normalize locators to array for uniform processing iteration
		if (!is_array($ar_locators)) {
			$ar_locators = [$ar_locators];
		}

		// Fetch linked diffusion node settings to check for explicit publish override
		// DIFFU-06: fall back to $current_tipo when diffusion_tipo is absent (matches
		// the fallback used elsewhere) and null-guard the node before get_properties().
		$diffusion_tipo = $ddo->diffusion_tipo ?? $current_tipo;
		$diffusion_node = ontology_node::get_instance($diffusion_tipo);
		$properties = $diffusion_node ? $diffusion_node->get_properties() : null;
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

		$is_first_ddo = $ddo_map[0]->tipo === $current_tipo;

		foreach ($ar_locators as $locator) {

			// Guard: component diffusion values may contain scalars (non-locator
			// data); only locator objects can be resolved through the chain.
			// A TypeError here would abort the whole publish run.
			if (!is_object($locator) || !isset($locator->section_tipo)) {
				debug_log(__METHOD__
					. " Ignored non-locator value in relation chain resolution" . PHP_EOL
					. ' ddo tipo: ' . to_string($current_tipo) . PHP_EOL
					. ' value: ' . to_string($locator)
					, logger::WARNING
				);
				continue;
			}

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
				if ($current_is_publishable === true) {
					dd_diffusion_api::$publishable_overrides["{$locator->section_tipo}_{$locator->section_id}"] = true;
				}
				dd_diffusion_api::$datum_unresolved["$target_level:$target_diffusion_tipo"][] = $locator;
			}

			// Skip unpublishable locators from value collection.
			// A related section that is not published must not appear in the output values.
			// EXCEPTION: component_relation_parent emits a STRUCTURAL hierarchy root (e.g. a
			// thesaurus's hierarchy1 node) as the parent of a top-level term. That node is not
			// itself "publishable", yet v6 always includes it (the parent field does not apply
			// a publishable filter). Keep it so parent/parents/parents_term resolve.
			// component_select links (e.g. a coin's catalogue reference → its catalogue node) are
			// VALUE SOURCES: the chain reads a scalar (abbreviation, etc.) THROUGH the linked node,
			// which v6 does regardless of that node's publishability. The node's OWN row still
			// respects publishability via the queueing block above (lines ~261-270), so keeping the
			// value here does not leak an unpublishable row — it only lets the chain continue to the
			// deeper ddo (e.g. numisdata303 abbreviation).
			// VALUE-SOURCE bypass: a relation read THROUGH to a deeper scalar (the locator is an
			// intermediate, not the final output) — v6 reads that scalar regardless of the linked
			// record's publishability (e.g. catalogue_type_mint numisdata309→numisdata303 abbrev;
			// a publication's author rsc139→rsc197 person→rsc86/rsc85 name). Gate on having
			// CHILDREN so a LEAF relation whose locator IS the output (e.g. relations_coins
			// numisdata77→coin section_id) still respects publishability. The node's own row is
			// handled by the queue block above regardless.
			// An add_parents column (place / indexation) reads each locator's OWN term (and
			// parent chain) as the output value via parser_locator::parents — the locator IS a
			// value source even with no children ddos, so v6 includes unpublishable locators
			// too (e.g. a hoard's indexation location tchi1 "Peninsular", publishable=false).
			$is_add_parents = (($ddo->fn ?? null) === 'add_parents');
			$is_value_source_select = (!empty($children) || $is_add_parents)
				&& in_array($element_model, ['component_select','component_portal','component_autocomplete','component_autocomplete_hi'], true);
			if(($is_publishable === false || $current_is_publishable === false)
				&& $element_model !== 'component_relation_parent'
				&& $element_model !== 'component_relation_children'
				&& $element_model !== 'component_relation_index'
				&& !$is_value_source_select){
				continue;
			}

			// Validate locator
			$validated = empty($valid_sections_tipo)
				? true
				: in_array($locator->section_tipo, $valid_sections_tipo);

			// B. RECURSION: Resolve child fields if explicitly defined in DDO map for this specific section_tipo
			// We only recurse if the locator's target section_tipo is explicitly mapped in the whitelist ($valid_sections_tipo).
			// NOTE: the EXPLICIT ddo_map chain is NOT gated by $level — its depth is already bounded by
			// the ddo_map's parent-chain structure (each recursion only follows ddos whose parent ===
			// $current_tipo) and the $visited ancestor guard prevents cycles. v6 has no such limit, so a
			// deep explicit chain (e.g. bibliography_author numisdata162→rsc368→rsc139→rsc85, or the 4-ddo
			// ref_coins_image chain) must resolve fully. $level still decrements and only gates the
			// INVERSE/target queueing (resolve_ddo_value, "$level > 0"), so the cascade stays bounded.
			$child_results = [];
			if ($validated === true) {
				// Path-aware cycle guard: only skip if this locator is already an ANCESTOR
				// in the current recursion branch ($visited). This replaces the old global
				// per-field dedup, which wrongly blocked legitimate sibling references that
				// resolve the same section twice (e.g. a coin's two type refs both yielding
				// the same mint/material → v6 emits both in the grouped output).
				$locator_key = $locator->section_tipo . '_' . $locator->section_id;
				if (!in_array($locator_key, $visited, true)) {
					$child_results = $this->resolve_chain((object)[
						'ddo_map'      		=> $ddo_map,
						'parent'       		=> $current_tipo,
						'section_tipo' 		=> $locator->section_tipo,
						'section_id'   		=> $locator->section_id,
						'level'        		=> $level - 1,
						'is_publishable' 	=> $current_is_publishable,
						'visited'      		=> $visited
					]);
				}
			}

			if (!empty($child_results)) {
				// Merge values from child DDOs
				foreach ($child_results as $res) {
					$val = $res->get_value();
					if($is_first_ddo){
						$val = array_map(function($item) use($locator) {
							// Only stamp the parent's identity onto TERMINAL scalar items
							// (e.g. a resolved name string) which carry no locator of their
							// own and need the parent's identity for grouping. Leaf LOCATORS
							// (e.g. coins reached through a filtered relation) already carry
							// their own section_tipo/section_id — overwriting them would yield
							// the parent's ids instead of the target's.
							if (empty($item->section_tipo ?? null)) {
								$item->section_id   = $locator->section_id;
								$item->section_tipo = $locator->section_tipo;
							}
							return $item;
						}, $val);
					}
						if (is_array($val)) {
							// v6 empty_value: this parent locator's child resolved to nothing — emit a
							// placeholder (section_id = empty_value scalar) so per-item alignment is kept
							// (e.g. a coin with no hoard -> "0" in the merged ref_coins_hoard_data list).
							$ev_first = $ddo->empty_value ?? null;
							if (empty($val) && !empty($ev_first)) {
								$placeholder = clone $locator;
								$placeholder->section_id         = (string)$ev_first[0];
								$placeholder->from_component_tipo = $current_tipo;
								$relation_values[] = $placeholder;
							} else {
								$relation_values = array_merge($relation_values, $val);
							}
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
					// v6 empty_value: when this parent locator's child resolved empty (so the
					// locator would be skipped), emit a placeholder so per-item alignment is kept
					// — e.g. ref_coins_hoard_data: a coin with no hoard emits "0", keeping every
					// coin in the merged list. get_section_id reads section_id, so set it to the
					// empty_value scalar.
					$ev_ph = $ddo->empty_value ?? null;
					if (!empty($ev_ph)) {
						$placeholder = clone $locator;
						$placeholder->section_id   = (string)$ev_ph[0];
						$placeholder->from_component_tipo = $current_tipo;
						$relation_values[] = $placeholder;
					}
					continue;
				}else{
					// Fallback: If no children resolved (either bypassed due to not being in the
					// whitelist, or child resolution returned empty), use the raw locator
					// object itself as the value without extracting deeper data.
					// DIFFU-09: APPEND to the accumulator. The previous
					// `$relation_values = $new_diffusion_data` reassigned it, discarding
					// every value collected from earlier locators in this loop (and mixing
					// the wrapper shape into the flat value-item list that line 319 expects).
					// Re-attach the captured add_parents chain so parser_locator::parents
					// can resolve the term path (place / indexation). Clone to avoid
					// mutating the shared locator object.
					if ($parents_meta !== null) {
						$locator = clone $locator;
						$locator->meta = $parents_meta;
					}
					$relation_values[] = $locator;
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
	 * GET_DEBUG_CHAIN
	 * @return object
	 */
	public function get_debug_chain(): object {
		return (object)[
			'chain_string' => implode(' → ', array_unique($this->debug_chain))
		];
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
		self::$recursively_resolved = [];
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
		$virtual_tree = diffusion_utils::get_virtual_diffusion_tree();

		// Find virtual nodes inside this element's scope
		$scope_vnodes = [];
		foreach ($virtual_tree as $vnode) {
			$in_scope = false;
			if ($vnode->tipo === $diffusion_element_tipo) {
				$in_scope = true;
			} else {
				foreach ($vnode->parents as $p) {
					if ($p->tipo === $diffusion_element_tipo) {
						$in_scope = true;
						break;
					}
				}
			}
			if ($in_scope) {
				$scope_vnodes[] = $vnode;
			}
		}
		
		foreach ($scope_vnodes as $vnode) {
			// Resolve which section_tipo this diffusion container node targets and maps
			$diffusion_tipo = $vnode->tipo;
			$ar_sections = ontology_node::get_ar_tipo_by_model_and_relation(
				$diffusion_tipo,
				'section',
				'related',
				true
			);

			// Fallback to real node representation if alias has no explicit target
			if (empty($ar_sections) && !empty($vnode->real_tipo)) {
				$ar_sections = ontology_node::get_ar_tipo_by_model_and_relation(
					$vnode->real_tipo,
					'section',
					'related',
					true
				);
			}
			
			foreach ($ar_sections as $section_tipo) {
				// Keep first match fallback default; let alias variants override generic models
				if (!isset($map[$section_tipo]) || str_contains($vnode->model, '_alias')) {
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
		// 1. Check internal map scope, which now leverages complete virtual tree resolution
		if (isset(self::$section_diffusion_map[$section_tipo])) {
			return self::$section_diffusion_map[$section_tipo];
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

