<?php declare(strict_types=1);
/**
 * AREA_THESAURUS
 * Top-level area controller that drives the thesaurus browser UI and its JSON API.
 *
 * An "area" in Dédalo is a navigational root node in the ontology tree. This class
 * manages the full set of active hierarchy sections (thesauri) configured in the
 * platform, assembling the tree-root payload, resolving typology metadata, and
 * executing keyword searches across hierarchy terms with full ancestor-path
 * reconstruction for the client tree widget.
 *
 * Responsibilities:
 * - Enumerate active hierarchies (via hierarchy::get_active_elements()) and apply
 *   optional filters for typology IDs and target section tipos.
 * - Resolve the name, order, and children_tipo for each hierarchy section so that
 *   the JS tree widget can render its root nodes without additional round-trips.
 * - Resolve typology names and display order from the DEDALO_HIERARCHY_TYPES_*
 *   components, caching results per request to avoid repeated component instantiation.
 * - Execute keyword searches (search_thesaurus) that expand each result node upward
 *   through its full ancestor chain, building a flat ts_object map that the client
 *   merges into the live tree.
 * - Build a custom SQO (get_hierarchy_terms_sqo) for filtering records to specific
 *   hierarchy nodes, used when properties->hierarchy_terms is set on the area button.
 *
 * The corresponding JSON controller (area_thesaurus_json.php) is shared with
 * area_ontology and invoked automatically by area_common::get_json(). It calls
 * get_hierarchy_sections(), get_typology_name(), get_typology_order(), and
 * search_thesaurus() on $this.
 *
 * Extends: area_common (core/area_common/class.area_common.php)
 * Extended by: area_ontology (core/area_ontology/class.area_ontology.php)
 * Related classes: hierarchy, ontology, ts_object, ts_node_repository,
 *                  component_relation_parent, search_query_object
 *
 * @package Dédalo
 * @subpackage Core
 */
class area_thesaurus extends area_common {



	/**
	 * Section tipo that holds typology configuration records.
	 * Maps to DEDALO_HIERARCHY_TYPES_SECTION_TIPO = 'hierarchy13'.
	 * @var string $typologies_section_tipo
	 */
	public static string $typologies_section_tipo = DEDALO_HIERARCHY_TYPES_SECTION_TIPO; // 'hierarchy13'

	/**
	 * Component tipo of the human-readable typology name within each typology record.
	 * Maps to DEDALO_HIERARCHY_TYPES_NAME_TIPO = 'hierarchy16'.
	 * @var string $typologies_name_tipo
	 */
	public static string $typologies_name_tipo = DEDALO_HIERARCHY_TYPES_NAME_TIPO;	// 'hierarchy16'

	/**
	 * Whether the area is rendering in "model" view mode (shows model/typology terms
	 * instead of descriptor terms). Toggled at runtime via GET['model']=true in the
	 * client request; defaults to false (descriptor/term view).
	 * @var bool $model_view
	 */
	// Default vars for use in thesaurus mode (set GET['model']=true to change this vars in runtime)
	protected bool $model_view = false;

	/**
	 * Active display mode for the thesaurus area ('default', 'model', etc.).
	 * Populated from properties->thesaurus_mode stored on the area button (dd25).
	 * Passed into the JSON context so the client JS knows which view to activate.
	 * @var ?string $thesaurus_mode
	 */
	// thesaurus_mode
	public ?string $thesaurus_mode = null;

	/**
	 * Per-request cache of resolved typology name strings, keyed by typology section_id.
	 * Populated lazily by get_typology_name(); shared across all instances in one request.
	 * @var array $typology_names_cache
	 */
	// cache
	public static array $typology_names_cache = [];

	/**
	 * Per-request cache of resolved typology order integers, keyed by typology section_id.
	 * Populated lazily by get_typology_order(); shared across all instances in one request.
	 * @var array $typology_order_values_cache
	 */
	public static array $typology_order_values_cache = [];

	/**
	 * Per-request cache of resolved hierarchy term name strings, keyed by hierarchy section_id.
	 * Populated lazily by get_hierarchy_name(); shared across all instances in one request.
	 * @var array $hierarchy_names_cache
	 */
	public static array $hierarchy_names_cache = [];



	/**
	 * GET_HIERARCHY_SECTION_TIPO
	 * Returns the section tipo that identifies the hierarchy configuration section.
	 *
	 * This is the section under which all hierarchy/thesaurus configuration records
	 * live (one record per named thesaurus). Equals DEDALO_HIERARCHY_SECTION_TIPO
	 * ('hierarchy1'). Subclasses such as area_ontology override this to return the
	 * corresponding ontology section tipo.
	 *
	 * @return string - The canonical hierarchy section tipo (e.g. 'hierarchy1').
	 */
	public function get_hierarchy_section_tipo() : string {

		$hierarchy_section_tipo = DEDALO_HIERARCHY_SECTION_TIPO; // 'hierarchy1'

		return $hierarchy_section_tipo;
	}//end get_hierarchy_section_tipo



	/**
	 * GET_MAIN_TABLE
	 * Returns the PostgreSQL table name that stores hierarchy term records.
	 *
	 * Delegates to hierarchy::$main_table ('matrix_hierarchy_main'). Used by callers
	 * that need to build raw SQL or construct table-qualified column references
	 * for hierarchy operations.
	 *
	 * @return string - The main table name (e.g. 'matrix_hierarchy_main').
	 */
	public function get_main_table() : string {

		return hierarchy::$main_table; // matrix_hierarchy_main
	}//end get_main_table



	/**
	 * GET_HIERARCHY_TYPOLOGIES
	 * Returns all typology configuration records from the typology section.
	 *
	 * Each typology record (section_tipo = DEDALO_HIERARCHY_TYPES_SECTION_TIPO,
	 * 'hierarchy13') represents a named typology category that groups one or more
	 * thesauri (e.g. "Descriptors", "Place names"). Delegates to the unfiltered
	 * section-record accessor so that callers receive raw section rows regardless
	 * of user permissions — permission filtering is the caller's responsibility.
	 *
	 * @return array - Array of raw section record objects for the typology section.
	 */
	public function get_hierarchy_typologies() : array {

		$hierarchy_typologies = section::get_ar_all_section_records_unfiltered(
			self::$typologies_section_tipo
		);

		return $hierarchy_typologies;
	}//end get_hierarchy_typologies



	/**
	 * GET_HIERARCHY_SECTIONS
	 * Resolves the list of hierarchy sections active in the thesaurus, with optional filters.
	 *
	 * Builds the master list of hierarchy/ontology nodes that the JSON controller exposes
	 * as root items in the thesaurus tree. Each returned object is a normalised stdClass
	 * ready for direct serialisation to the client. The method is polymorphic: when called
	 * on area_ontology (the concrete subclass) it delegates to the ontology class; on
	 * area_thesaurus it delegates to hierarchy.
	 *
	 * Filtering pipeline (applied in order):
	 *   1. active_in_thesaurus === false → skip (hierarchy only; ontology skips this gate).
	 *   2. Empty typology_id → skip with WARNING log.
	 *   3. $hierarchy_types_filter set and element typology_id not in list → skip.
	 *   4. $hierarchy_sections_filter set and element target_section_tipo not in list → skip.
	 *   5. No root terms → skip (hierarchy only; ontology always included).
	 *
	 * Return shape — each element is a stdClass with:
	 *   - section_id           (string|int)  The hierarchy/ontology config record id.
	 *   - section_tipo         (string)      Config record section tipo ('hierarchy1').
	 *   - target_section_tipo  (string)      The term/descriptor section tipo (e.g. 'es1').
	 *   - target_section_name  (string)      Human-readable hierarchy name.
	 *   - children_tipo        (?string)     Component tipo for child relation; used by the
	 *                                        client to fetch children without a round-trip.
	 *   - typology_section_id  (string)      Section_id of the matching typology record.
	 *   - order                (int)         Sort order of the hierarchy.
	 *   - type                 (string)      Always 'hierarchy'.
	 *   - active_in_thesaurus  (bool)        Mirrors the source element flag.
	 *   - root_terms           (array)       Locator-like objects for the top-level terms.
	 *
	 * @param array|null $hierarchy_types_filter [= null] - Whitelist of typology section_ids;
	 *        if null or empty all typologies are included.
	 * @param array|null $hierarchy_sections_filter [= null] - Whitelist of target_section_tipo
	 *        values; if null or empty all target sections are included.
	 * @param bool $terms_are_model [= false] - When true, root terms are fetched from the
	 *        model/typology virtual section instead of the descriptor section. Controlled
	 *        by source->build_options->terms_are_model on the client request.
	 * @return array - Array of normalised stdClass hierarchy-section objects.
	 */
	public function get_hierarchy_sections( ?array $hierarchy_types_filter=null, ?array $hierarchy_sections_filter=null, bool $terms_are_model=false ) : array {

		// get all hierarchy sections
		// Polymorphic dispatch: when the concrete subclass is area_ontology, use the
		// ontology active-elements list (ontology::get_active_elements); otherwise use
		// hierarchy (hierarchy::get_active_elements).
		$class_name = get_called_class()=== 'area_thesaurus' ? 'hierarchy' : 'ontology';
		$active_elements = $class_name::get_active_elements();

		$ar_items = [];
		foreach ($active_elements as $element) {

			// active_in_thesaurus check
			// (!) Ontology bypasses this gate: all ontology elements are always shown
			// in area_ontology regardless of the active_in_thesaurus flag.
				if ($element->active_in_thesaurus===false && $class_name!=='ontology' ) {
					// skip non active in thesaurus sections
					continue;
				}

			// target_section_tipo check
			// Every hierarchy must point to a target thesaurus section. An empty
			// target_section_tipo propagates down to ontology_node::load_data and
			// common::get_permissions, both of which log ERROR noise and cannot
			// produce a usable tree node. Missing value is a data-integrity issue;
			// log and skip.
				if (empty($element->target_section_tipo)) {
					debug_log(__METHOD__." Skipped hierarchy without target_section_tipo. section_id: $element->section_id ", logger::WARNING);
					continue; // Skip
				}

			// typology data
			// Every hierarchy must be assigned a typology so the tree can group it.
			// Missing typology_id is a data-integrity issue; log and skip.
				if (empty($element->typology_id)) {
					debug_log(__METHOD__." Skipped hierarchy without defined typology. section_id: $element->section_id ", logger::WARNING);
					continue; // Skip
				}

			// Skip filtered types when defined
				if (!empty($hierarchy_types_filter) && !in_array($element->typology_id, $hierarchy_types_filter)) {
					continue; // Skip
				}

			// Skip filtered sections when defined
				if ( !empty($hierarchy_sections_filter) && !in_array($element->target_section_tipo, $hierarchy_sections_filter) ) {
					continue; // Skip
				}

			// root terms. The target section elements added to 'General term' portal
			// Root terms are the top-level nodes shown directly under each hierarchy in
			// the tree. Hierarchies without root terms are invisible to the user, so
			// skipping them avoids rendering empty tree branches.
				$root_terms = $class_name::get_root_terms( $element->section_tipo, $element->section_id, $terms_are_model );
				if ( empty($root_terms) && $class_name!=='ontology' ) {
					// skip hierarchies without root terms
					continue;
				}

			// children tipo. It is used for fast resolution across API class form client.
			// For ontology the children component tipo is fixed (ontology14). For hierarchy
			// it is discovered dynamically by inspecting the model of the target section;
			// the first component_relation_children tipo found is used. Null here means
			// the JSON controller will log an error and drop the hierarchy entry.
				$children_tipo = $class_name==='ontology'
					? ontology::$children_tipo // 'ontology14'
					: section::get_ar_children_tipo_by_model_name_in_section($element->target_section_tipo, ['component_relation_children'], true, true, true, true)[0] ?? null;

			// item
			// Build the normalised object that the JSON controller serialises to the client.
			// typology_section_id is fixed to '14' for ontology (there is only one ontology
			// typology, hardcoded at install time).
				$item = new stdClass();
					$item->section_id			= $element->section_id;
					$item->section_tipo			= $element->section_tipo;
					$item->target_section_tipo	= $element->target_section_tipo;
					$item->target_section_name	= $element->name;
					$item->children_tipo		= $children_tipo;
					$item->typology_section_id	= $class_name==='ontology' ? '14' : $element->typology_id;
					$item->order				= $element->order;
					$item->type					= 'hierarchy';
					$item->active_in_thesaurus	= $element->active_in_thesaurus;
					$item->root_terms			= $root_terms;

			$ar_items[] = $item;
		}//end foreach ($active_elements as $key => $row)


		return $ar_items;
	}//end get_hierarchy_sections



	/**
	 * GET_TYPOLOGY_DATA
	 * Reads the typology locator stored on a hierarchy record's component_select field.
	 *
	 * Instantiates the component at DEDALO_HIERARCHY_TYPOLOGY_TIPO ('hierarchy9'),
	 * a component_select that links each hierarchy configuration record to its
	 * typology category record in the hierarchy13 section. Returns the first locator
	 * from the component's raw data array, or null when no typology has been assigned.
	 *
	 * @param int|string $section_id - The section_id of the hierarchy configuration record
	 *        (section_tipo = 'hierarchy1') whose typology assignment should be retrieved.
	 * @return object|null - The first locator object from the component data (containing
	 *         section_tipo and section_id of the typology record), or null when absent.
	 */
	public function get_typology_data( int|string $section_id ) : ?object {

		$tipo			= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // 'hierarchy9' component_select
		$section_tipo	= $this->get_hierarchy_section_tipo(); // hierarchy1
		$model_name		= ontology_node::get_model_by_tipo($tipo,true);
		$component		= component_common::get_instance(
			$model_name,
			$tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		$data		= $component->get_data();
		$locator	= $data[0] ?? null;

		return $locator;
	}//end get_typology_data



	/**
	 * GET_TYPOLOGY_NAME
	 * Resolves the human-readable display name of a typology category record.
	 *
	 * Reads the name component (DEDALO_HIERARCHY_TYPES_NAME_TIPO, 'hierarchy16') from
	 * the typology section (DEDALO_HIERARCHY_TYPES_SECTION_TIPO, 'hierarchy13') for
	 * the given section_id. Applies a language fallback via
	 * get_value_with_fallback_from_data() if the value for the current DEDALO_DATA_LANG
	 * is empty. Returns a sentinel string ('Typology untranslated …') when no name is
	 * found so the UI can still display something.
	 *
	 * Results are cached in self::$typology_names_cache keyed by $typology_section_id,
	 * so repeated calls within a single request instantiate the component only once.
	 *
	 * @param int|string $typology_section_id - Section_id of the typology record in
	 *        the hierarchy13 section.
	 * @return string - The resolved typology name in DEDALO_DATA_LANG, the closest
	 *         available language fallback, or a sentinel string if completely untranslated.
	 */
	public function get_typology_name( int|string $typology_section_id ) : string {

		// cache Store for speed
			if (isset(self::$typology_names_cache[$typology_section_id])) {
				return self::$typology_names_cache[$typology_section_id];
			}

		// component
		// Instantiate the name component for this typology section_id and read its
		// string value. The component uses mode 'list' as typology records are never
		// edited from this call-site.
			$tipo			= DEDALO_HIERARCHY_TYPES_NAME_TIPO;
			$model_name		= ontology_node::get_model_by_tipo($tipo,true);
			$parent			= (string)$typology_section_id;
			$mode			= 'list';
			$lang			= DEDALO_DATA_LANG;
			$section_tipo	= self::$typologies_section_tipo;

			$component		= component_common::get_instance(
				$model_name,
				$tipo,
				$parent,
				$mode,
				$lang,
				$section_tipo
			);
			$value = $component->get_value();

			// Language fallback: get_value() returns null/empty when the record
			// has not been translated into DEDALO_DATA_LANG; try the next available
			// language instead of returning nothing.
			if(empty($value)) {
				$value = $model_name::get_value_with_fallback_from_data(
					$component->get_data(),
					false,
					$lang
				);
			}

			$typology_name = (string)$value;

		// Sentinel: produce a visible placeholder so broken/untranslated records
		// are identifiable in the UI rather than silently showing nothing.
		if (empty($typology_name)) {
			$typology_name = 'Typology untranslated ' . $tipo .' '. $parent;
		}

		// cache. Store for speed
		self::$typology_names_cache[$typology_section_id] = $typology_name;


		return $typology_name;
	}//end get_typology_name



	/**
	 * GET_TYPOLOGY_ORDER
	 * Retrieves the sort-order integer stored on a typology category record.
	 *
	 * Reads the order component (DEDALO_HIERARCHY_TYPES_ORDER) from the typology
	 * section (DEDALO_HIERARCHY_TYPES_SECTION_TIPO, 'hierarchy13'). The returned
	 * integer is used by the JSON controller to sort typology groupings in the
	 * thesaurus tree. Defaults to 0 when no order value is stored. Results are
	 * cached in self::$typology_order_values_cache per request.
	 *
	 * @param int|string $typology_section_id - Section_id of the typology record in
	 *        the hierarchy13 section.
	 * @return int - The order value, or 0 when the field is empty/unset.
	 */
	public function get_typology_order( int|string $typology_section_id ) : int {

		// cache. Store for speed
			if (isset(self::$typology_order_values_cache[$typology_section_id])) {
				return self::$typology_order_values_cache[$typology_section_id];
			}

		$tipo			= DEDALO_HIERARCHY_TYPES_ORDER;
		$model_name		= ontology_node::get_model_by_tipo($tipo,true);
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;
		$section_tipo	= self::$typologies_section_tipo;

		$component = component_common::get_instance(
			$model_name,
			$tipo,
			$typology_section_id,
			$mode,
			$lang,
			$section_tipo
		);

		$data		 = $component->get_data();
		$order_value = $data[0]->value ?? 0;

		// cache
		self::$typology_order_values_cache[$typology_section_id] = $order_value;


		return (int)$order_value;
	}//end get_typology_order



	/**
	 * GET_HIERARCHY_NAME
	 * Resolves the display name of a hierarchy term (the root-level thesaurus label).
	 *
	 * Reads the term component (DEDALO_HIERARCHY_TERM_TIPO, 'hierarchy5') from the
	 * hierarchy section (DEDALO_HIERARCHY_SECTION_TIPO, 'hierarchy1'). Applies the
	 * same language-fallback strategy as get_typology_name() and returns a sentinel
	 * string on total translation failure. Results are cached in
	 * self::$hierarchy_names_cache keyed by $hierarchy_section_id.
	 *
	 * @param int|string $hierarchy_section_id - Section_id of the hierarchy record
	 *        in the hierarchy1 section.
	 * @return string - The resolved hierarchy display name, a language fallback, or
	 *         a sentinel string if completely untranslated.
	 */
	public function get_hierarchy_name( int|string $hierarchy_section_id ) : string {

		// cache: return early on hit to avoid repeated component instantiation
		if (isset(self::$hierarchy_names_cache[$hierarchy_section_id])) {
			return self::$hierarchy_names_cache[$hierarchy_section_id];
		}

		$tipo			= DEDALO_HIERARCHY_TERM_TIPO;
		$model_name		= ontology_node::get_model_by_tipo($tipo,true);
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;
		$section_tipo	= $this->get_hierarchy_section_tipo();

		$component = component_common::get_instance(
			$model_name,
			$tipo,
			$hierarchy_section_id,
			$mode,
			$lang,
			$section_tipo
		);
		$value = $component->get_value();

		if(empty($value)) {
			$value = $model_name::get_value_with_fallback_from_data(
				$component->get_data(),
				false,
				$lang
			);
		}

		$hierarchy_name = $value;
		if (empty($hierarchy_name)) {
			$hierarchy_name = 'Hierarchy untranslated ' . $tipo .' '. $hierarchy_section_id;
		}

		// Store for speed
		self::$hierarchy_names_cache[$hierarchy_section_id] = $hierarchy_name;


		return $hierarchy_name;
	}//end get_hierarchy_name



	/**
	 * SEARCH_THESAURUS
	 * Executes a keyword search and reconstructs the full ancestor path for each result.
	 *
	 * Takes the pre-built SQO (e.g. from get_hierarchy_terms_sqo() or from a client
	 * keyword query), runs it through the standard search layer, then for every matched
	 * term walks its complete parent chain upward to the tree root. The result is a flat
	 * map of ts_object data objects (keyed by 'section_tipo:section_id') that the client
	 * JS merges into the live tree widget, revealing matched nodes along with their full
	 * context path.
	 *
	 * Algorithm per result row:
	 *   1. Record the raw (section_tipo, section_id) pair in $found for the client.
	 *   2. Fetch the recursive parent chain (memoized in $ancestors_cache) via
	 *      component_relation_parent::get_parents_recursive().
	 *   3. If no parents: the result is itself a root term → add a single 'root'-parented
	 *      ts_object and continue.
	 *   4. Reverse the parent array so index-0 is the top-most ancestor.
	 *   5. For each ancestor node in the chain:
	 *      a. Resolve its sibling children list (via component_relation_children) and
	 *         batch-prefetch is_indexable flags (ts_node_repository::fetch_node_info).
	 *      b. Build a ts_object for every sibling child not already in the map,
	 *         assigning positional order (1-based) and is_indexable.
	 *      c. Build a ts_object for the ancestor itself, linking it to 'root' if it is
	 *         the top-most node, or to its own parent otherwise.  For root nodes the
	 *         display order comes from hierarchy::get_main_order() via the TLD prefix
	 *         of the section_tipo.
	 *
	 * The $ar_ts_objects_map deduplication key ('section_tipo:section_id') ensures that
	 * overlapping paths across multiple results are processed only once.
	 *
	 * Return shape (stdClass):
	 *   - result  (array)  Flat array of ts_object data objects (values of the map).
	 *   - msg     (string) Human-readable summary of the result count.
	 *   - errors  (array)  Always empty (errors bubble up via debug_log).
	 *   - total   (int)    Total matched record count (before map dedup).
	 *   - found   (array)  Raw list of {section_tipo, section_id} for matched terms.
	 *   - debug   (array)  Execution time string; only present when SHOW_DEBUG===true.
	 *
	 * @param object $search_query_object - A fully-formed search_query_object (SQO).
	 * @return object - Response stdClass described above.
	 */
	public function search_thesaurus( object $search_query_object ) : object {
		$start_time = start_time();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';
				$response->errors	= [];

		// Search records
			$search			= search::get_instance($search_query_object);
			$db_result		= $search->search();

		// total_records count
			$total_records = $db_result->row_count();

		// ar_path_mix . Calculate full path of each result
		// The map key ('section_tipo:section_id') provides O(1) dedup so that nodes
		// shared by multiple result paths are only built once.
			$ar_ts_objects_map	= [];
			$found				= [];
			$ancestors_cache	= []; // results sharing a branch re-use the walked chain

			foreach ($db_result as $row) {

				$section_tipo	= $row->section_tipo;
				$section_id		= $row->section_id;

				$found[] = [
					'section_tipo'	=> $section_tipo,
					'section_id'	=> $section_id
				];

				// get all parents of the node (memoized per call)
				// $ancestors_cache avoids re-walking the same path for sibling results.
				$ancestors_key = $section_tipo . '_' . $section_id;
				if (!isset($ancestors_cache[$ancestors_key])) {
					$ancestors_cache[$ancestors_key] = component_relation_parent::get_parents_recursive(
						$section_id,
						$section_tipo
					);
				}
				$ar_parents = $ancestors_cache[$ancestors_key];

				if (empty($ar_parents)) {
					// create the ts_object of the root and get its data
					// A result with no parents is itself a root term. Build it with
					// ts_parent='root' so the client places it at tree level 0.
					$key = $section_tipo . ':' . $section_id;
					if (!isset($ar_ts_objects_map[$key])) {
						$ts_object = new ts_object(
							$section_id,
							$section_tipo,
							null,
							'edit',
							'root' // root node
						);
						$ar_ts_objects_map[$key] = $ts_object->get_data();
					}
					continue;
				}

				// reverse the order to get the root term, top term, at first position
				// get_parents_recursive returns [immediate_parent, ..., root]; we need
				// [root, ..., immediate_parent] to walk top-down.
				$ar_path = array_reverse($ar_parents);

				// get the ts_objects to built the tree
				foreach ($ar_path as $parent_key => $current_parent) {

					// Children
					// For each ancestor in the path, fetch the full sibling list so the
					// client can render all children of that branch, not just the matched one.
						// get all children of every parent, first term is the root term
						$parent_tipo = $current_parent->from_component_tipo;

						$children_tipo			= component_relation_parent::get_component_relation_children_tipo( $parent_tipo );
						$children_section_id	= $current_parent->section_id;
						$children_section_tipo	= $current_parent->section_tipo;

						// build the component and get its data
						$children_model		= ontology_node::get_model_by_tipo( $children_tipo );
						$component_children	= component_common::get_instance(
							$children_model, // string model
							$children_tipo, // string tipo
							$children_section_id, // string section_id
							'list', // string mode
							DEDALO_DATA_NOLAN, // string lang
							$children_section_tipo // string section_tipo
						);

						$children_data = $component_children->get_data() ?? [];

						// prefetch. Batched is_indexable resolution for the whole
						// children set (one query) instead of one component per child
						$prefetched_info = ts_node_repository::fetch_node_info($children_data);

						// built the ts_object with every child data
						foreach ($children_data as $children_key => $child_locator) {
							$key = $child_locator->section_tipo . ':' . $child_locator->section_id;

							// if the child doesn't exist create the ts_object, build it and get its data
							if (!isset($ar_ts_objects_map[$key])) {
								// ts_parent. Used to link the child node to its parent in the tree
								$ts_parent = $children_section_tipo.'_'.$children_section_id;
								// set the order number(int) in the ts_options
								// note: order here is the positional index, NOT the order component value
								$ts_options = new stdClass();
									$ts_options->order = $children_key+1;
								$node_info = $prefetched_info[$child_locator->section_tipo . '_' . (int)$child_locator->section_id] ?? null;
								if ($node_info!==null) {
									$ts_options->is_indexable = $node_info->is_indexable;
								}

								// create the ts_object of the child and get its data
								$ts_object = new ts_object(
									$child_locator->section_id,
									$child_locator->section_tipo,
									$ts_options,
									'list',
									$ts_parent
								);

								$ar_ts_objects_map[$key] = $ts_object->get_data();
							}
						}

					// Parent
					// After processing the children list, add the ancestor node itself.
					// parent_key=0 means this is the topmost ancestor → parented to 'root'.
						$key = $current_parent->section_tipo . ':' . $current_parent->section_id;
						if (!isset($ar_ts_objects_map[$key])) {
							// set its parent to link it in the tree
							$ts_parent = ($parent_key === 0)
								? 'root'
								: $ar_path[$parent_key-1]->section_tipo.'_'.$ar_path[$parent_key-1]->section_id;

							// if the parent is the root node, top node, get the order in the main section using the tld
							// Root-level nodes require a display order so the client can sort
							// multiple hierarchies.  get_main_order() reads the hierarchy's
							// own order component via the TLD prefix of its section_tipo.
							$root_options = null;
							if($ts_parent==='root'){
								$root_tld	= get_tld_from_tipo($current_parent->section_tipo);

								$root_order	= hierarchy::get_main_order($root_tld);
								if(!empty($root_order)){
									$root_options = new stdClass();
										$root_options->order = $root_order;
								}
							}
							// create the ts_object of the child and get its data
							$ts_object = new ts_object(
								$current_parent->section_id,
								$current_parent->section_tipo,
								$root_options,
								'edit',
								$ts_parent
							);

							$ar_ts_objects_map[$key] = $ts_object->get_data();
						}
				}
			}

		// response
			$response->msg		= 'Records found: ' . $total_records;
			$response->result	= array_values($ar_ts_objects_map);
			$response->total	= $total_records;
			$response->found	= $found;

		// debug
			if(SHOW_DEBUG===true) {
				$response->debug[] = exec_time_unit($start_time);
			}


		return $response;
	}//end search_thesaurus



	/**
	 * GET_HIERARCHY_TERMS_SQO
	 * Builds a Search Query Object that matches records belonging to specific hierarchy nodes.
	 *
	 * Used when the area button's properties->hierarchy_terms is set: the client has
	 * selected one or more specific thesaurus nodes and wants to restrict the visible
	 * tree to those subtrees. This method translates that selection into a SQO whose
	 * filter is an OR of AND groups, one group per node:
	 *
	 *   $or: [
	 *     { $and: [{ q: section_id, path: [hierarchy22/component_section_id] },
	 *              { q: section_tipo, path: [section/section_tipo_column] }] },
	 *     ...
	 *   ]
	 *
	 * The path 'hierarchy22' is the component_section_id component inside the term
	 * section; it stores the numeric identifier. The section-tipo filter is added as
	 * a second AND clause because section_ids are only unique within a section_tipo
	 * namespace. The resulting SQO is passed directly to search_thesaurus().
	 *
	 * The SQO's section_tipo list is built dynamically from the unique set of
	 * target_section_tipos appearing in $hierarchy_terms, limiting the DB query to
	 * only the relevant term tables.
	 *
	 * @param array $hierarchy_terms - Array of objects where each object has a 'value'
	 *        property that is itself an array of objects with 'section_tipo' (string)
	 *        and 'section_id' (string|int). This is the shape stored in the area button
	 *        properties->hierarchy_terms field.
	 * @return object - A fully-configured search_query_object ready to pass to
	 *         search_thesaurus() or search::get_instance().
	 */
	public function get_hierarchy_terms_sqo( array $hierarchy_terms ) : object {

		// filter_custom. hierarchy_terms
		$filter_custom = null;

		// Reset $ar_section_tipos to use only filter sections
		// Only the section tipos referenced by the selected nodes are queried;
		// this avoids scanning unrelated term tables.
			$ar_section_tipos = [];

			$filter_custom = new stdClass();

			$filter_custom->{OP_OR} = [];

			// path for matching by numeric section_id via the component_section_id ('hierarchy22')
			$path = new stdClass();
				$path->component_tipo	= 'hierarchy22';
				$path->model			= 'component_section_id';
				$path->name				= 'Id';

			// path for matching by section_tipo using the virtual 'section' model column
			$path_section = new stdClass();
				$path_section->model	= 'section';
				$path_section->name		= 'Section tipo column';

		// hierarchy_terms
		// Each element of $hierarchy_terms may carry multiple locators in its 'value'
		// array (e.g. when the client picked several nodes from different hierarchies).
		// Each (section_tipo, section_id) pair becomes one AND group in the OR filter.
			foreach ($hierarchy_terms as $current_term) {
				$value = $current_term->value ?? [];
				foreach ($value as $item) {

					$current_section_tipo	= $item->section_tipo;
					$current_section_id		= $item->section_id;

					# Update path section tipo
					// (!) The $path object is reused across iterations; section_tipo must
					// be updated on each pass so each filter clause targets the correct table.
					$path->section_tipo		= $current_section_tipo;

					# Add to ar_section_tipos
					$ar_section_tipos[] = $current_section_tipo;

					$filter_item = new stdClass();
						$filter_item->q		= $current_section_id;
						$filter_item->path	= [$path];

					$filter_item_section = new stdClass();
						$filter_item_section->q		= $current_section_tipo;
						$filter_item_section->path	= [$path_section];

					$group = new stdClass();
						$group->{OP_AND} = [$filter_item, $filter_item_section];

					$filter_custom->{OP_OR}[] = $group;
				}
			}

		// search_query_object. Add search_query_object to options.
		// limit=100 is a safety cap; these SQOs are for targeted subtree pinning,
		// not full-text search, so the result set should always be small.
			$search_query_object = new search_query_object();
				$search_query_object->id			= 'thesaurus';
				$search_query_object->section_tipo	= $ar_section_tipos;
				$search_query_object->limit			= 100;
				$search_query_object->filter		= $filter_custom ?? null;
				$search_query_object->select		= [];


		return $search_query_object;
	}//end get_hierarchy_terms_sqo



}//end area_thesaurus
