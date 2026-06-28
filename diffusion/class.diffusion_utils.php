<?php declare(strict_types=1);

/**
* DIFFUSION_UTILS
* v7 core of the diffusion system: ontology resolution (flat virtual
* diffusion tree), publication checks and shared diffusion helpers.
*
* Conventions:
* - Resolution is always based on the flat virtual diffusion tree
*   (get_virtual_diffusion_tree / get_section_diffusion_nodes): flat array
*   of objects like {"tipo":"oh88","model":"database","label":"web_default"}.
* - Only v7 ontology `properties` are read (never v6 `propiedades`).
* - Public API methods return {result: bool, msg: string, errors: array}
*   response objects; simple resolution helpers return values/null and
*   boolean checks return bool.
*/
class diffusion_utils {


	// publication metadata component tipos (legacy v6 per-record components;
	// publication tracking in v7 is the dd1758 activity log — see
	// diffusion_activity_logger. Kept because component_common references
	// them to detect modified publication-related components)
	public static $publication_first_tipo		= 'dd271';
	public static $publication_last_tipo		= 'dd1223';
	public static $publication_first_user_tipo	= 'dd1224';
	public static $publication_last_user_tipo	= 'dd1225';

	// request-scoped caches (cleared by reset_cache at request boundaries:
	// dd_diffusion_api::diffuse step 0, long-running CLI loops)
	private static ?array	$virtual_tree_cache			= null;
	private static array	$is_publishable_cache		= [];
	private static array	$diffusion_map_cache		= [];
	// request-scoped mirror of the persistent "sections with diffusion" map
	// (see get_section_diffusion_map). null = not yet loaded this request.
	private static ?array	$section_diffusion_map_cache	= null;



	/**
	* RESET_CACHE
	* Clears the request-scoped static caches. Call at request boundaries
	* (dd_diffusion_api::diffuse step 0) and between iterations of
	* long-running CLI processes that may change the ontology or records.
	* @return void
	*/
	public static function reset_cache() : void {

		self::$virtual_tree_cache	= null;
		self::$is_publishable_cache	= [];
		self::$diffusion_map_cache	= [];
		// Reset the request-scoped mirror only. The PERSISTENT map file is NOT
		// deleted here: reset_cache runs on every publish (dd_diffusion_api::diffuse
		// step 0) but the map depends only on the ontology, which publishing does
		// not change. Ontology mutations invalidate the file through
		// delete_section_map_cache_file (called from the ontology write chokepoints
		// and tools_register::invalidate_all_tool_caches).
		self::$section_diffusion_map_cache	= null;
	}//end reset_cache


	/**
	 * IS_PUBLISHABLE
	 * Locate component_publication in requested locator section and get its boolean value.
	 */
	public static function is_publishable(object $locator): bool {

		$section_tipo = $locator->section_tipo;
		$section_id   = $locator->section_id;
		$uid          = $section_tipo . '_' . $section_id;

		if (isset(self::$is_publishable_cache[$uid])) {
			return self::$is_publishable_cache[$uid];
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
			// DIFFU-07: cache the early-true result too (a section with no
			// component_publication is always publishable), so repeated calls for the
			// same record skip the get_ar_children lookup.
			self::$is_publishable_cache[$uid] = true;
			return true;
		}

		$component_publication_tipo = reset($ar_children);
		$is_publishable = (bool)self::get_component_publication_bool_value($component_publication_tipo, $section_id, $section_tipo);

		self::$is_publishable_cache[$uid] = $is_publishable;

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
		if ($model === 'diffusion_element' || $model === 'diffusion_element_alias') {
			return $parent;
		}else if ($model === 'diffusion_domain') {
			return null;
		} else{
			return self::get_diffusion_element($parent);
		}
	}// end get_diffusion_element




	/**
	 * GET_VIRTUAL_DIFFUSION_TREE
	 * Walks down the virtual diffusion tree (resolving aliases) to find nodes
	 * that match the specified section_tipo. Preserves the exact alias hierarchy.
	 *
	 * @return array Array of matching source elements mapped with their alias tree parents
	 */
	public static function get_virtual_diffusion_tree() : array {

		if (self::$virtual_tree_cache !== null) {
			return self::$virtual_tree_cache;
		}

		$diffusion_domain_tipo = self::get_diffusion_domain_tipo();
		if ($diffusion_domain_tipo === null) {
			debug_log(__METHOD__
				. " get_diffusion_domain_tipo returned null. Check DEDALO_DIFFUSION_TIPO and DEDALO_DIFFUSION_DOMAIN constants."
				, logger::WARNING
			);
			return [];
		}

		// 1. Find all real tipos that are aliased within the domain to suppress their naked presence
		$main_diffusion_nodes = ontology_node::get_ar_recursive_children($diffusion_domain_tipo);
		$consumed_by_alias = [];
		foreach ($main_diffusion_nodes as $node_tipo) {
			$model = ontology_node::get_model_by_tipo($node_tipo);
			if (str_contains($model, '_alias')) {
				$real_tipo = self::resolve_alias_recursive($node_tipo);
				if ($real_tipo) {
					$consumed_by_alias[] = $real_tipo;
				}
			}
		}

		// 2. Walk the virtual diffusion structure top-down
		$all_virtual_nodes = [];
		$path = [];
		self::walk_virtual_diffusion_tree(
			$diffusion_domain_tipo,
			$path,
			$all_virtual_nodes,
			$consumed_by_alias
		);

		self::$virtual_tree_cache = $all_virtual_nodes;
		return self::$virtual_tree_cache;
	}


	/**
	 * GET_SECTION_DIFFUSION_NODES
	 * Walks down the virtual diffusion tree (resolving aliases) to find nodes
	 * that match the specified section_tipo. Preserves the exact alias hierarchy.
	 *
	 * @param string $section_tipo The section to find diffusion nodes for
	 * @return array Array of matching source elements mapped with their alias tree parents
	 */
	public static function get_section_diffusion_nodes( string $section_tipo ) : array {

		$all_virtual_nodes = self::get_virtual_diffusion_tree();

		// 3. Filter for matching section and format output correctly
		$source_elements = [];
		foreach ($all_virtual_nodes as $vnode) {

			// A node matches if it or its real target has a section relation
			$ar_related_sections = ontology_node::get_ar_tipo_by_model_and_relation($vnode->tipo, 'section', 'related', true);
			if (empty($ar_related_sections) && $vnode->real_tipo) {
				$ar_related_sections = ontology_node::get_ar_tipo_by_model_and_relation($vnode->real_tipo, 'section', 'related', true);
			}

			if (!empty($ar_related_sections) && in_array($section_tipo, $ar_related_sections)) {

				$item = new stdClass();
				$item->tipo    = $vnode->tipo;
				$item->model   = $vnode->model;
				$item->label   = $vnode->label;
				$item->parents = $vnode->parents;

				// Map children fields (Alias own + real non-overridden)
				$ar_children = [];
				foreach ($vnode->children_tipos as $child_tipo) {
					$child_node = ontology_node::get_instance($child_tipo);
					$relation_tipo = $child_node->get_relation_tipos()[0] ?? null;

					$ar_children[] = (object)[
						'tipo'          => $child_tipo,
						'model'         => $child_node->get_model(),
						'label'         => $child_node->get_term($child_tipo),
						'related_tipo'  => $relation_tipo,
						'related_model' => $relation_tipo ? ontology_node::get_model_by_tipo($relation_tipo) : null,
						'related_label' => $relation_tipo ? ontology_node::get_term_by_tipo($relation_tipo)  : null
					];
				}
				$item->children = $ar_children;

				$source_elements[] = $item;
			}
		}

		return $source_elements;
	}//end get_section_diffusion_nodes


	/**
	 * WALK_VIRTUAL_DIFFUSION_TREE
	 * Recursively walks the diffusion structure starting from root, resolving aliases.
	 * Builds a list of virtual nodes with their exact alias parent paths.
	 *
	 * @param string $current_tipo The current node to visit
	 * @param array $path Accumulated list of ancestors (stdClass objects)
	 * @param array &$all_virtual_nodes Accumulator receiving all valid virtual nodes
	 * @param array &$consumed_by_alias Tracking array to prevent real node duplication
	 */
	private static function walk_virtual_diffusion_tree(string $current_tipo, array $path, array &$all_virtual_nodes, array &$consumed_by_alias) {

		$resolved = self::resolve_node_with_alias($current_tipo);

		if (!$resolved->is_alias && in_array($current_tipo, $consumed_by_alias)) {
			// Real node consumed by an alias somewhere else: skip this raw branch
			return;
		}

		$vnode = new stdClass();
		$vnode->tipo       = $resolved->tipo;
		$vnode->model      = $resolved->model;
		$vnode->label      = $resolved->label;
		$vnode->properties = $resolved->properties;
		$vnode->real_tipo  = $resolved->real_tipo;
		$vnode->parents    = $path;

		// Merge recursive children properties (alias own + real non-overridden)
		// Note we use full recursive children to populate the fields list for the UI
		$own_children  = ontology_node::get_ar_recursive_children($current_tipo) ?: [];
		$real_children = [];
		if ($resolved->is_alias && $resolved->real_tipo !== null) {
			$real_children = ontology_node::get_ar_recursive_children($resolved->real_tipo) ?: [];
		}

		$merged_children_tipos = [];
		$labels_seen = [];
		foreach ($own_children as $child_tipo) {
			$label = ontology_node::get_term_by_tipo($child_tipo);
			$labels_seen[$label] = true;
			$merged_children_tipos[] = $child_tipo;
		}
		foreach ($real_children as $child_tipo) {
			$label = ontology_node::get_term_by_tipo($child_tipo);
			if (!isset($labels_seen[$label])) {
				$merged_children_tipos[] = $child_tipo;
			}
		}

		$vnode->children_tipos = $merged_children_tipos;
		$all_virtual_nodes[] = $vnode;

		// Update path mapping for descending structure
		$path_item = new stdClass();
		$path_item->tipo  = $resolved->tipo;
		$path_item->model = $resolved->model;
		$path_item->label = $resolved->label;
		if ($resolved->model === 'diffusion_element' || $resolved->model === 'diffusion_element_alias') {
			$path_item->type = $resolved->properties->diffusion->type ?? 'unknown';
		}

		$new_path = array_merge([$path_item], $path); // Puts immediate parent first

		// Recursively explore ALL children to ensure deeply nested elements
		// (like RDF components, XML fields, etc.) that may hold the section relation
		// are mapped under this virtual hierarchy.
		$ar_children_tipos = ontology_node::get_ar_children($current_tipo) ?: [];

		if ($resolved->is_alias && $resolved->real_tipo) {
			$real_children = ontology_node::get_ar_children($resolved->real_tipo) ?: [];
			$ar_children_tipos = array_merge($ar_children_tipos, $real_children);
		}

		$ar_children_tipos = array_unique($ar_children_tipos);
		foreach ($ar_children_tipos as $child_tipo) {
			self::walk_virtual_diffusion_tree($child_tipo, $new_path, $all_virtual_nodes, $consumed_by_alias);
		}
	}//end walk_virtual_diffusion_tree



	/**
	 * RESOLVE_ONTOLOGY_NODE_ALIAS
	 * Keeps alias nodes in the flat list and brings in real-node subtrees
	 * when the real node lives outside the original tree (i.e. was not
	 * already traversed as a direct descendant of the diffusion domain).
	 *
	 * Deduplicates to prevent the same real subtree from appearing twice
	 * when multiple aliases resolve to the same real node.
	 *
	 * @param array $nodes Array of ontology node tipos
	 * @return array Expanded array with alias nodes kept + real subtrees added
	 */
	public static function resolve_ontology_node_alias(array $nodes) : array {

		$resolved = [];
		// Track already-expanded real tipos to avoid duplicates
		$expanded_real_tipos = [];

		foreach ($nodes as $node_tipo) {
			$model = ontology_node::get_model_by_tipo($node_tipo);
			if (str_contains($model, '_alias')) {
				// Always keep alias node
				$resolved[] = $node_tipo;

				$resolved_tipo = self::resolve_alias_recursive($node_tipo);
				if ($resolved_tipo !== null
					&& !in_array($resolved_tipo, $nodes)
					&& !in_array($resolved_tipo, $expanded_real_tipos)
				) {
					// Real node is outside the tree and not yet expanded
					$expanded_real_tipos[] = $resolved_tipo;
					$resolved[] = $resolved_tipo;
					$resolved_children = ontology_node::get_ar_recursive_children($resolved_tipo);
					if (!empty($resolved_children)) {
						$resolved = array_merge($resolved, $resolved_children);
					}
				}
			} else {
				$resolved[] = $node_tipo;
			}
		}

		return $resolved;
	}//end resolve_ontology_node_alias



	/**
	 * RESOLVE_ALIAS_RECURSIVE
	 * Recursively resolves an alias node to its final target.
	 * Handles chains of aliases (alias pointing to alias).
	 *
	 * @param string $tipo The alias node tipo to resolve
	 * @param int $max_depth Maximum recursion depth to prevent infinite loops
	 * @return string|null The final resolved tipo, or null if not resolvable
	 */
	private static function resolve_alias_recursive(string $tipo, int $max_depth = 10) : ?string {

		if ($max_depth <= 0) {
			debug_log(__METHOD__
				. " Max recursion depth reached for tipo: " . $tipo
				, logger::WARNING
			);
			return null;
		}

		$resolved_tipo = self::resolve_alias_target($tipo);
		if ($resolved_tipo === null) {
			return null;
		}

		// Check if resolved node is also an alias
		$resolved_model = ontology_node::get_model_by_tipo($resolved_tipo);
		if (str_contains($resolved_model, '_alias')) {
			return self::resolve_alias_recursive($resolved_tipo, $max_depth - 1);
		}

		return $resolved_tipo;
	}//end resolve_alias_recursive



	/**
	 * RESOLVE_ALIAS_TARGET
	 * Resolves a single alias node to its immediate target.
	 * Extracts the target model from the alias model name (e.g., 'diffusion_element_alias' -> 'diffusion_element').
	 *
	 * @param string $alias_tipo The alias node tipo
	 * @return string|null The resolved target tipo, or null if not found
	 */
	private static function resolve_alias_target(string $alias_tipo) : ?string {

		$model = ontology_node::get_model_by_tipo($alias_tipo);
		if (!str_contains($model, '_alias')) {
			return null;
		}

		$target_model = str_replace('_alias', '', $model);
		$resolved_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
			$alias_tipo,
			$target_model,
			'related',
			false
		)[0] ?? null;

		if ($resolved_tipo === null) {
			debug_log(__METHOD__
				. " Unable to resolve alias tipo: " . $alias_tipo
				. " target_model: " . $target_model
				, logger::WARNING
			);
		}

		return $resolved_tipo;
	}//end resolve_alias_target



	/**
	 * RESOLVE_NODE_WITH_ALIAS
	 * Given any ontology node tipo, applies the alias contract:
	 * - If the node is an alias, resolves the real node
	 * - Returns merged info where alias wins for tipo/term
	 * - Properties and section relations inherited from real node when alias has none
	 *
	 * @param string $tipo The node tipo (can be alias or real)
	 * @return object {
	 *   string  tipo       : the alias tipo (or node tipo if not alias)
	 *   string  label      : the alias term (or node term)
	 *   string  model      : the actual model (e.g. 'diffusion_element_alias')
	 *   ?string real_tipo  : the resolved real tipo (null if not alias)
	 *   ?object properties : effective properties (alias own or inherited from real)
	 *   bool    is_alias   : whether the node is an alias
	 * }
	 */
	public static function resolve_node_with_alias(string $tipo) : object {

		$model    = ontology_node::get_model_by_tipo($tipo);
		$is_alias = str_contains($model, '_alias');
		$label    = ontology_node::get_term_by_tipo($tipo, DEDALO_STRUCTURE_LANG, true, false);

		$result = (object)[
			'tipo'       => $tipo,
			'label'      => $label,
			'model'      => $model,
			'real_tipo'  => null,
			'properties' => null,
			'is_alias'   => $is_alias
		];

		if ($is_alias) {
			$real_tipo = self::resolve_alias_recursive($tipo);
			$result->real_tipo = $real_tipo;

			if ($real_tipo !== null) {
				// Get alias own properties first
				$alias_node   = ontology_node::get_instance($tipo);
				$alias_props  = $alias_node->get_properties();

				// Inherit from real if alias has none
				if (empty($alias_props) || (is_object($alias_props) && empty((array)$alias_props))) {
					$real_node  = ontology_node::get_instance($real_tipo);
					$result->properties = $real_node->get_properties();
				} else {
					$result->properties = $alias_props;
				}
			}
		} else {
			$node = ontology_node::get_instance($tipo);
			$result->properties = $node->get_properties();
		}

		// Fallback label
		if (empty($result->label)) {
			$result->label = '<em>' . ontology_node::get_term_by_tipo($tipo, DEDALO_STRUCTURE_LANG, true, true) . '</em>';
		}

		return $result;
	}//end resolve_node_with_alias



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
	* Checks if the given section is targeted by at least one diffusion element,
	* resolved from the v7 flat virtual diffusion tree (type-agnostic: works for
	* sql, rdf, xml, socrata and any future diffusion type).
	*
	* This runs on EVERY section API request (via tool_diffusion::is_available in
	* common::get_tools). Rebuilding the virtual tree per request cost ~70-175ms,
	* so the answer for every section is precomputed once into a persistent map
	* (get_section_diffusion_map) and this method is now an O(1) lookup. The map is
	* semantically equivalent to calling the previous walk for each section_tipo.
	*
	* @param string $section_tipo
	* @return bool $have_section_diffusion
	*/
	public static function have_section_diffusion( string $section_tipo ) : bool {

		return isset(self::get_section_diffusion_map()[$section_tipo]);
	}//end have_section_diffusion



	/**
	* GET_SECTION_DIFFUSION_MAP_CACHE_NAME
	* Entity-level (shared, empty-prefix) cache file name for the persistent
	* "sections with diffusion" map. Same naming pattern as the tool caches.
	* @return string
	*/
	public static function get_section_diffusion_map_cache_name() : string {
		return DEDALO_ENTITY . '_cache_diffusion_section_map.php';
	}//end get_section_diffusion_map_cache_name



	/**
	* GET_SECTION_DIFFUSION_MAP
	* Builds (and persists) the map of every section targeted by at least one
	* diffusion element: [ section_tipo => true ]. `isset($map[$s])` is identical
	* to the legacy `have_section_diffusion($s)` for every $s.
	*
	* The map depends ONLY on the diffusion ontology, so it is cached at the
	* entity level and invalidated by delete_section_map_cache_file() from the
	* ontology write chokepoints (ontology::set_records_in_dd_ontology /
	* regenerate_records_in_dd_ontology / delete_ontology), from
	* tools_register::invalidate_all_tool_caches (import_tools rewrites the tool
	* tld) and from installer_ontology_manager::clean_ontology.
	*
	* The on-disk payload is a WRAPPER ['domain'=>..., 'map'=>...], never a bare
	* array: it lets the domain config self-invalidate the file and avoids the
	* "cached empty array == miss" ambiguity (the wrapper is never empty).
	*
	* @return array $map [ section_tipo => true ]
	*/
	public static function get_section_diffusion_map() : array {

		// request-scoped static
		if (self::$section_diffusion_map_cache !== null) {
			return self::$section_diffusion_map_cache;
		}

		// recovery mode: ontology reads are redirected to dd_ontology_recovery, so
		// never read/write the live-ontology cache file. Compute fresh, static only.
		$recovery_mode = ($_ENV['DEDALO_RECOVERY_MODE'] ?? false) === true;

		// persistent file read (accept only a well-formed wrapper for the current domain)
		if ($recovery_mode === false) {
			$cached = dd_cache::cache_from_file((object)[
				'file_name'	=> self::get_section_diffusion_map_cache_name(),
				'prefix'	=> ''
			]);
			if (is_array($cached)
				&& ($cached['domain'] ?? null) === DEDALO_DIFFUSION_DOMAIN
				&& isset($cached['map']) && is_array($cached['map'])
			) {
				self::$section_diffusion_map_cache = $cached['map'];
				return $cached['map'];
			}
		}

		// compute: ONE virtual-tree walk, exact semantic clone of the per-section path
		// (get_section_diffusion_nodes + the parents element-model test in the old
		// have_section_diffusion).
		$map = [];

		// misconfig / fresh install: no domain -> empty map, NOT persisted (mirrors
		// the early return in get_virtual_diffusion_tree)
		if (self::get_diffusion_domain_tipo() === null) {
			self::$section_diffusion_map_cache = $map;
			return $map;
		}

		$all_virtual_nodes = self::get_virtual_diffusion_tree();
		foreach ($all_virtual_nodes as $vnode) {

			// cheap filter first: the node must sit under a diffusion element
			$under_element = false;
			foreach ($vnode->parents ?? [] as $path_item) {
				if ($path_item->model==='diffusion_element' || $path_item->model==='diffusion_element_alias') {
					$under_element = true;
					break;
				}
			}
			if ($under_element === false) {
				continue;
			}

			// related sections of the node, with the real_tipo fallback ONLY when
			// empty (replicates get_section_diffusion_nodes exactly)
			$ar_related_sections = ontology_node::get_ar_tipo_by_model_and_relation($vnode->tipo, 'section', 'related', true);
			if (empty($ar_related_sections) && $vnode->real_tipo) {
				$ar_related_sections = ontology_node::get_ar_tipo_by_model_and_relation($vnode->real_tipo, 'section', 'related', true);
			}

			foreach ($ar_related_sections as $current_section_tipo) {
				$map[$current_section_tipo] = true;
			}
		}

		// persist (wrapper). Skip the file write in recovery mode.
		if ($recovery_mode === false) {
			dd_cache::cache_to_file((object)[
				'file_name'	=> self::get_section_diffusion_map_cache_name(),
				'prefix'	=> '',
				'data'		=> [
					'domain'	=> DEDALO_DIFFUSION_DOMAIN,
					'map'		=> $map
				]
			]);
		}

		self::$section_diffusion_map_cache = $map;
		return $map;
	}//end get_section_diffusion_map



	/**
	* DELETE_SECTION_MAP_CACHE_FILE
	* Invalidates the persistent "sections with diffusion" map: resets the
	* request-scoped static and deletes the entity-level cache file. Call from
	* every ontology write chokepoint (see get_section_diffusion_map docblock).
	* @return bool
	*/
	public static function delete_section_map_cache_file() : bool {

		self::$section_diffusion_map_cache = null;

		return dd_cache::delete_cache_files(
			[ self::get_section_diffusion_map_cache_name() ],
			'' // shared, empty prefix
		);
	}//end delete_section_map_cache_file





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
	*	            "type": "sql",
	*	            "database_name": "web_murapa",
	*	            "database_tipo": "murapa4"
	*	        }
	*	    ]
	*	}
	*/
	public static function get_diffusion_map( string $diffusion_domain_name=DEDALO_DIFFUSION_DOMAIN, $connection_status=false ) : object {

		// cache
		$cache_key = $diffusion_domain_name .'_' . to_string($connection_status);
		if (isset(self::$diffusion_map_cache[$cache_key])) {
			return self::$diffusion_map_cache[$cache_key];
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
		self::$diffusion_map_cache[$cache_key] = $diffusion_map;


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
				// MariaDB checks are a Bun engine responsibility: a single
				// 'check_database' call covers server reachability + existence
				$db_available = self::database_exits($item->database_name);
				$connection_status = $db_available===true
					? (object)[
						'result'	=> true,
						'msg'		=> 'Database is ready.'
					]
					: (object)[
						'result'	=> false,
						'msg'		=> 'Database is NOT ready (missing or engine unreachable).'
					];
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
	* DATABASE_EXITS
	* Check if target MariaDB database exists.
	* MariaDB management is a Bun engine responsibility: PHP never connects
	* to MariaDB directly — this method asks the Bun API ('check_database').
	* @param string $database_name
	* @return bool
	*/
	public static function database_exits( string $database_name ) : bool {

		$response = diffusion_api_client::call((object)[
			'action'		=> 'check_database',
			'database_name'	=> $database_name
		]);

		if (empty($response->result)) {
			debug_log(__METHOD__
				. " Unable to check database through diffusion engine" . PHP_EOL
				. ' database_name: ' . $database_name . PHP_EOL
				. ' msg: ' . to_string($response->msg ?? null)
				, logger::WARNING
			);
			return false;
		}


		return (bool)($response->exists ?? false);
	}//end database_exits



	/**
	* GET_AR_DIFFUSION_MAP_ELEMENTS
	* @param string $diffusion_domain_name = DEDALO_DIFFUSION_DOMAIN
	* @return array $ar_diffusion_map_elements
	* 	Sample (assoc array):
	* 	{
	*	    "murapa3": {
	*	        "element_tipo": "murapa3",
	*	        "name": "Publish to web",
	*	        "type": "sql",
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
	* Resolves all section tipos targeted by the given diffusion element,
	* from the v7 flat virtual diffusion tree (type-agnostic: works for sql,
	* rdf, xml, socrata and any future diffusion type).
	* @param string $diffusion_element_tipo Alias or real element tipo
	* @return array $ar_diffusion_sections Array of section tipos
	*/
	public static function get_diffusion_sections_from_diffusion_element(string $diffusion_element_tipo) : array {

		$ar_diffusion_sections = [];

		$virtual_tree = self::get_virtual_diffusion_tree();
		foreach ($virtual_tree as $vnode) {

			// only nodes under the given diffusion element
			$in_element = false;
			foreach ($vnode->parents ?? [] as $path_item) {
				if (self::element_path_matches($path_item, $diffusion_element_tipo)) {
					$in_element = true;
					break;
				}
			}
			if (!$in_element) {
				continue;
			}

			// section related to the node (alias contract applied)
			$related_section_tipo = self::get_related_section_tipo($vnode->tipo);
			if (empty($related_section_tipo) && !empty($vnode->real_tipo)) {
				$related_section_tipo = self::get_related_section_tipo($vnode->real_tipo);
			}

			if (!empty($related_section_tipo) && !in_array($related_section_tipo, $ar_diffusion_sections)) {
				$ar_diffusion_sections[] = $related_section_tipo;
			}
		}


		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element







	/**
	* ELEMENT_PATH_MATCHES
	* Checks if a virtual-tree path item is the given diffusion element.
	* Path items hold the virtual (alias-aware) tipo; callers may pass either
	* the alias tipo or the resolved real element tipo, so both are matched.
	* @param object $path_item Virtual tree path item {tipo, model, label, type?}
	* @param string $diffusion_element_tipo
	* @return bool
	*/
	private static function element_path_matches( object $path_item, string $diffusion_element_tipo ) : bool {

		if ($path_item->model!=='diffusion_element' && $path_item->model!=='diffusion_element_alias') {
			return false;
		}

		if ($path_item->tipo===$diffusion_element_tipo) {
			return true;
		}

		// alias path item: match against the resolved real element tipo
		if ($path_item->model==='diffusion_element_alias') {
			$resolved = self::resolve_node_with_alias($path_item->tipo);
			if (($resolved->real_tipo ?? null)===$diffusion_element_tipo) {
				return true;
			}
		}

		return false;
	}//end element_path_matches



	/**
	* GET_SECTION_NODE_FOR_ELEMENT
	* Resolves the published artifact node of a given diffusion element and
	* section from the v7 flat virtual diffusion tree: the table/table_alias
	* node for SQL elements, the owl:Class node for RDF, etc.
	* The returned node is the flat virtual object produced by
	* get_section_diffusion_nodes: {tipo, model, label, parents, children}.
	* @param string $diffusion_element_tipo Alias or real element tipo
	* @param string $section_tipo
	* @return object|null
	*/
	public static function get_section_node_for_element( string $diffusion_element_tipo, string $section_tipo ) : ?object {

		$nodes = self::get_section_diffusion_nodes($section_tipo);
		$alias_match = null;
		foreach ($nodes as $node) {
			foreach ($node->parents ?? [] as $path_item) {
				if ($path_item->model!=='diffusion_element' && $path_item->model!=='diffusion_element_alias') {
					continue;
				}
				// first element found in the path decides this node's element
				if (self::element_path_matches($path_item, $diffusion_element_tipo)) {
					// a section can resolve to BOTH a real 'table' node and a 'table_alias'
					// node (e.g. rsc197 → numisdata50 "people" + numisdata58 "other_people").
					// v6 writes to the REAL table, so prefer it; remember the alias only as a
					// fallback when no real table node matches.
					if (($node->model ?? null) === 'table_alias') {
						if ($alias_match === null) {
							$alias_match = $node;
						}
					} else {
						return $node;
					}
				}
				break;
			}
		}

		return $alias_match;
	}//end get_section_node_for_element



	/**
	* GET_DATABASE_NAME_FOR_ELEMENT
	* Resolves the target database name of a diffusion element from the v7
	* flat virtual diffusion tree: the node with model 'database' (or
	* 'database_alias' — alias label wins) whose parents path contains the
	* element. E.g. {"tipo":"oh88","model":"database","label":"web_default"}
	* resolves to 'web_default'.
	* @param string $diffusion_element_tipo Alias or real element tipo
	* @return string|null $database_name
	*/
	public static function get_database_name_for_element( string $diffusion_element_tipo ) : ?string {

		$virtual_tree = self::get_virtual_diffusion_tree();
		foreach ($virtual_tree as $vnode) {
			if ($vnode->model!=='database' && $vnode->model!=='database_alias') {
				continue;
			}
			foreach ($vnode->parents ?? [] as $path_item) {
				if (self::element_path_matches($path_item, $diffusion_element_tipo)) {
					return $vnode->label;
				}
			}
		}

		return null;
	}//end get_database_name_for_element



	/**
	* GET_TABLE_TIPO
	* Resolve the table tipo (alias preferred) of given diffusion element and
	* section, using the v7 flat virtual diffusion tree (the virtual node tipo
	* is already the alias tipo when the table is aliased).
	* @param string $diffusion_element_tipo
	* @param string $section_tipo
	* @return string|null $table_tipo
	*/
	public static function get_table_tipo( string $diffusion_element_tipo, string $section_tipo ) : ?string {

		$node = self::get_section_node_for_element($diffusion_element_tipo, $section_tipo);

		return $node->tipo ?? null;
	}//end get_table_tipo



	/**
	* GET_DDO_MAP
	* Builds the ddo_map (diffusion data objects map) of a diffusion field node:
	* from properties->process->ddo_map when defined in the ontology, else
	* auto-created from the node related components.
	* (Moved from class diffusion_data, dissolved in v7)
	* @param string $diffusion_tipo
	* @param string $section_tipo
	* @return array $ddo_map Array of dd_object
	*/
	public static function get_ddo_map( string $diffusion_tipo, string $section_tipo ) : array {

		// ddo_map create or get from properties
		$ddo_map = [];

		$ontology_node	= ontology_node::get_instance($diffusion_tipo);
		$properties		= $ontology_node->get_properties();

		// check if the ontology has his own ddo_map defined, if not, it will create a ddo_map with related components.
		if(isset($properties->process, $properties->process->ddo_map)){

			foreach ($properties->process->ddo_map as $ddo) {

				// resolve the 'self' value for section_tipo or parent, if this properties are defined use it.
				// If not defined or empty, assume it's the main section_tipo
				if(isset($ddo->section_tipo) && $ddo->section_tipo === 'self'){
					$ddo->section_tipo = $section_tipo;
				}
				$ddo->parent = (empty($ddo->parent) || $ddo->parent === 'self') ? $section_tipo : $ddo->parent;

				// set diffusion_tipo to be used as final entry key
				$ddo->diffusion_tipo = $diffusion_tipo;

				// add a new safe ddo
				$ddo_map[] = new dd_object($ddo);
			}

		}else{

			// check if the node has defined any general function
			$fn = $properties->process->fn ?? null;
			$ar_related_dd_tipo	= ontology_node::get_relation_nodes(
				$diffusion_tipo,
				true,
				true
			);
			// create new ddo_map when the ontology doesn't has one ddo_map
			foreach ($ar_related_dd_tipo as $current_tipo) {

				$ddo = new dd_object((object)[
					'tipo'				=> $current_tipo,
					'section_tipo'		=> $section_tipo,
					'parent'			=> $section_tipo,
					'diffusion_tipo'	=> $diffusion_tipo
				]);

				if ($fn) {
					$ddo->fn = $fn;
				}

				$ddo_map[] = $ddo;
			}
		}


		return $ddo_map;
	}//end get_ddo_map



	/**
	* GET_TABLE_FIELDS
	* Resolve all fields of a 'table' element inside a given 'diffusion_element',
	* using the v7 flat virtual diffusion tree. The section node children are
	* already merged alias + real (alias overrides win).
	* @param string $diffusion_element_tipo
	* @param string $section_tipo
	* @return array $ar_table_fields
	* 	Array of objects as [{tipo: 'numisdata145', label: 'Mints'}]
	*/
	public static function get_table_fields(string $diffusion_element_tipo, string $section_tipo) : array {

		$node = self::get_section_node_for_element($diffusion_element_tipo, $section_tipo);
		if ($node===null) {
			debug_log(__METHOD__
				. " No table available for this section " . PHP_EOL
				. ' diffusion_element_tipo: ' . to_string($diffusion_element_tipo) . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo)
				, logger::WARNING
			);
			return [];
		}

		$ar_table_fields = [];
		foreach ($node->children ?? [] as $child) {

			$item = new stdClass();
				$item->tipo 	= $child->tipo;
				$item->label 	= $child->label;

			$ar_table_fields[] = $item;
		}


		return $ar_table_fields;
	}//end get_table_fields
}
