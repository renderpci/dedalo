<?php declare(strict_types=1);
/**
* AREA_GRAPH
* Area controller for the network/graph thesaurus viewer.
*
* area_graph drives the graph-mode rendering of thesaurus hierarchies that are
* registered in the "nexus" network ontology (section_tipo = 'nexus57'). It is
* the server-side counterpart of the JS area_graph / render_area_graph modules.
*
* Responsibilities:
* - Enumerate active network hierarchy configurations (nexus40 records whose
*   'active' radio-button field, nexus44, points to dd64/section_id=1).
* - Resolve each hierarchy's target section tipo, typology, display name, and
*   sort order so the JSON controller (area_graph_json.php) can build the
*   context and data payloads consumed by the browser graph widget.
* - Provide thesaurus search helpers: given a search_query_object it returns a
*   recursive tree of ts_object data objects (path-expanded parents + children).
* - Build the SQO needed to locate a set of specific hierarchy terms by
*   section_id across multiple section tipos.
*
* Data shape emitted by get_hierarchy_sections():
*   stdClass {
*     section_id           int    — the hierarchy record's section_id (nexus40)
*     section_tipo         string — 'nexus40'
*     target_section_tipo  string — tipo of the content section this hierarchy indexes
*     target_section_name  string — human-readable name of the hierarchy
*     typology_section_id  int    — section_id inside nexus57 (the typology record)
*     order                int    — sort position among hierarchies
*     type                 string — always 'hierarchy'
*     children_tipo        string — component_tipo used to navigate child terms
*   }
*
* Extends area_common which extends common; does not introduce its own
* constructor — all lifecycle is inherited.
*
* @package Dédalo
* @subpackage Core
*/
class area_graph extends area_common {



	/**
	* CLASS VARS
	*/

		/**
		 * Section tipo for the network typologies section in the ontology.
		 * Points to 'nexus57', the section that stores network-typology definition
		 * records (each record represents one typology group visible in the graph UI).
		 * Compare with area_thesaurus which uses DEDALO_HIERARCHY_TYPES_SECTION_TIPO
		 * ('hierarchy13') for its own typology section.
		 * @var string $typologies_section_tipo
		 */
		public static string $typologies_section_tipo = 'nexus57';

		/**
		 * Component tipo for the typology name field within nexus57.
		 * 'nexus61' is the component_input_text (or equivalent) that holds the
		 * human-readable label of each network typology record.
		 * Not currently referenced in this class body — kept for external callers
		 * and potential future use in name resolution.
		 * @var string $typologies_name_tipo
		 */
		public static string $typologies_name_tipo = 'nexus61';

		/**
		 * Whether this area instance is rendering the model-view variant.
		 * When true, hierarchy navigation uses the model-specific children/target
		 * tipos (DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO / DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO)
		 * instead of the standard descriptor tipos.
		 * Set by the JSON controller from build_options->terms_are_model.
		 * @var bool $model_view
		 */
		protected bool $model_view = false;

		/**
		 * Active thesaurus mode identifier for this area instance.
		 * Null until explicitly set; used by callers that toggle between term and
		 * model display modes.
		 * @var ?string $thesaurus_mode
		 */
		public ?string $thesaurus_mode = null;

		/**
		 * Request-scoped static cache for resolved hierarchy names.
		 * Maps hierarchy section_id (int|string key) to the resolved display name
		 * (string). Populated and read by get_hierarchy_name() to avoid repeated
		 * component instantiation for the same section_id within a single request.
		 * @var array $hierarchy_name_cache
		 */
		protected static array $hierarchy_name_cache = [];



	/**
	* GET_NETWORKS_TYPOLOGIES
	* Return all section_ids of records in the network-typologies section (nexus57).
	*
	* Delegates to section::get_ar_all_section_records_unfiltered(), which buffers the
	* full result set into a plain PHP array — suitable only for small ontology sections.
	* The returned array is a flat list of raw section_ids (strings/ints as returned
	* by the DB layer); no filtering by active state is applied here.
	* @return array $networks_typologies - Flat array of section_id values from nexus57.
	*/
	public function get_networks_typologies() : array {

		$networks_typologies = section::get_ar_all_section_records_unfiltered(
			area_graph::$typologies_section_tipo
		);

		return $networks_typologies;
	}//end get_networks_typologies



	/**
	* GET_HIERARCHY_SECTIONS
	* Build the ordered list of hierarchy descriptor objects for the graph UI.
	*
	* Iterates every active nexus40 network record and for each one:
	*   1. Resolves its typology (nexus57 section_id) via get_typology_data().
	*      Records with no typology are skipped with a WARNING log entry.
	*   2. Applies the optional $hierarchy_types_filter (typology section_ids whitelist).
	*   3. Reads the target section tipo from DEDALO_HIERARCHY_TARGET_SECTION_TIPO or
	*      DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO depending on $terms_are_model.
	*      Records whose target tipo is empty are skipped.
	*   4. Applies the optional $hierarchy_sections_filter (target_section_tipo whitelist).
	*   5. Resolves the hierarchy display name from DEDALO_HIERARCHY_TERM_TIPO; falls
	*      back to get_hierarchy_name() if no translated value exists for the current lang.
	*   6. Reads the sort order from DEDALO_HIERARCHY_ORDER_TIPO (component_number).
	*   7. Assembles a stdClass item (see class doc-block for full shape) and appends it.
	*
	* The children_tipo field in each item tells the browser which portal component
	* tipo to follow when expanding child terms in graph mode.
	*
	* @param array|null $hierarchy_types_filter   [= null] - Whitelist of typology
	*        section_ids (nexus57). Null = include all typologies.
	* @param array|null $hierarchy_sections_filter [= null] - Whitelist of
	*        target_section_tipos. Null = include all target sections.
	* @param bool $terms_are_model                [= false] - When true, resolve
	*        hierarchy configuration components for the model-tree variant instead
	*        of the standard descriptor-tree variant.
	* @return array $ar_items - Ordered array of stdClass hierarchy descriptor objects.
	*/
	public function get_hierarchy_sections( ?array $hierarchy_types_filter=null, ?array $hierarchy_sections_filter=null, bool $terms_are_model=false ) : array {

		// Branch on terms_are_model to select the correct pair of hierarchy configuration tipos:
		// - Standard descriptor tree: target=hierarchy53, children=hierarchy45
		// - Model/typology tree:       target=hierarchy58, children=hierarchy59
		$hierarchy_target_section_tipo 	= $terms_are_model ? DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO : DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
		$hierarchy_children_tipo 		= $terms_are_model ? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO 		: DEDALO_HIERARCHY_CHILDREN_TIPO;

		// get all hierarchy sections
			$ar_records = area_graph::get_active_networks_sections();

		$ar_items = [];
		foreach ($ar_records as $row) {

			// typology data
				$typology_data = $this->get_typology_data($row->section_id);
				if (empty($typology_data)) {
					debug_log(__METHOD__." Skipped hierarchy without defined typology. section_id: $row->section_id ", logger::WARNING);
					continue; // Skip
				}

			// Skip filtered types when defined
				if (!empty($hierarchy_types_filter) && !in_array($typology_data->section_id, $hierarchy_types_filter)) {
					continue; // Skip
				}

			// hierarchy target section tipo
			// Read the tipo of the content section this hierarchy indexes.
			// The value is stored as a plain string inside a component_input_text
			// (hierarchy53 for descriptor mode, hierarchy58 for model mode).
				$model			= ontology_node::get_model_by_tipo($hierarchy_target_section_tipo,true);
				$target_section	= component_common::get_instance(
					$model,
					$hierarchy_target_section_tipo,
					$row->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$row->section_tipo
				);
				$target_section_tipo_data	= $target_section->get_data();
				$target_section_tipo		= $target_section_tipo_data[0]->value ?? null;
				if (empty($target_section_tipo)) {
					debug_log(__METHOD__
						." Skipped row $row->section_id with empty target_section_tipo ".$row->section_id
						, logger::WARNING
					);
					continue; // Skip
				}

			// Skip filtered sections when defined
				if (!empty($hierarchy_sections_filter) && !in_array($target_section_tipo, $hierarchy_sections_filter)) {
					continue; // Skip
				}

			// hierarchy target section name
			// Read the translated display name from hierarchy5 (DEDALO_HIERARCHY_TERM_TIPO).
			// Falls back to get_hierarchy_name() if no value exists in the current lang.
				$model					= ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_TERM_TIPO,true);
				$hierarchy_section_name	= component_common::get_instance(
					$model,
					DEDALO_HIERARCHY_TERM_TIPO,
					$row->section_id,
					'list',
					DEDALO_DATA_LANG,
					$row->section_tipo
				);
				$target_section_name = $hierarchy_section_name->get_data_lang( DEDALO_DATA_LANG )[0]->value ?? null;
				if (empty($target_section_name)) {
					$target_section_name = $this->get_hierarchy_name( $row->section_id );
				}

			// hierarchy order
				$model						= ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_ORDER_TIPO,true);
				$hierarchy_section_order	= component_common::get_instance(
					$model,
					DEDALO_HIERARCHY_ORDER_TIPO,
					$row->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$row->section_tipo
				);
				$hierarchy_target_order_data	= $hierarchy_section_order->get_data();
				$hierarchy_target_order_value	= $hierarchy_target_order_data[0]->value ?? 0;

			// item
				$item = new stdClass();
					$item->section_id 				= $row->section_id;
					$item->section_tipo 			= $row->section_tipo;
					$item->target_section_tipo		= $target_section_tipo;
					$item->target_section_name		= $target_section_name;
					$item->typology_section_id		= $typology_data->section_id;
					$item->order 					= $hierarchy_target_order_value;
					$item->type						= 'hierarchy';
					$item->children_tipo			= $hierarchy_children_tipo;

			$ar_items[] = $item;
		}//end foreach ($ar_records as $key => $row)


		return $ar_items;
	}//end get_hierarchy_sections



	/**
	* GET_ACTIVE_NETWORKS_SECTIONS
	* Execute a search that returns every active network hierarchy configuration record.
	*
	* Builds a hard-coded SQO against section_tipo 'nexus40' (network hierarchy1
	* records) with an $and filter that requires the 'active' radio-button component
	* (nexus44) to reference dd64/section_id=1 (the "Active" term). Results are
	* ordered ascending by section_id (nexus42 = component_section_id).
	*
	* The SQO is constructed via json_decode() with inline string interpolation of
	* the local $section_tipo, $active_tipo, and $order_tipo variables so that a
	* future ontology rename only requires changing the three local constants here.
	*
	* The method is static so it can be called from get_hierarchy_sections() without
	* requiring a fully initialised area_graph instance.
	*
	* @return db_result|false $db_result - Iterable db_result on success, false on
	*         search failure. Each row exposes ->section_id and ->section_tipo.
	*/
	public static function get_active_networks_sections() : db_result|false {

		// nexus40 = the network-hierarchy section (mirrors hierarchy1 in thesaurus area)
		// nexus44 = radio-button 'active' flag on each network hierarchy record
		// nexus42 = component_section_id used as the sort key
		$section_tipo	= 'nexus40'; // hierarchy1
		$active_tipo	= 'nexus44'; // hierarchy4
		$order_tipo		= 'nexus42'; // section_id

		$search_query_object = json_decode('{
			"id": "networks",
			"section_tipo": ["'.$section_tipo.'"],
			"limit": 0,
			"full_count": false,
			"filter": {
				"$and": [
					{
						"q": "{\"section_id\":\"1\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"'.$active_tipo.'\"}",
						"path": [{
							"name": "Active",
							"model": "component_radio_button",
							"section_tipo": "'.$section_tipo.'",
							"component_tipo": "'.$active_tipo.'"
						}]
					}
				]
			},
			"order": [
				{
					"direction": "ASC",
					"path": [
					  {
						"name": "Order",
						"model": "component_section_id",
						"section_tipo": "'.$section_tipo.'",
						"component_tipo": "'.$order_tipo.'"
					  }
					]
				}
			]
		}');

		$search = search::get_instance($search_query_object);
		$db_result = $search->search();


		return $db_result;
	}//end get_active_networks_sections



	/**
	* GET_TYPOLOGY_DATA
	* Resolve the typology locator for a given hierarchy configuration record.
	*
	* Instantiates the component at DEDALO_HIERARCHY_TYPOLOGY_TIPO ('hierarchy9',
	* a component_select) for the supplied $section_id inside the hierarchy1 section.
	* The first datum in the component's data array is a locator object pointing at
	* the typology record in nexus57 (for area_graph) or hierarchy13 (for area_thesaurus).
	*
	* Returns null when the component has no data (i.e. the hierarchy record has no
	* typology assigned), which causes get_hierarchy_sections() to skip that record.
	*
	* @param int|string $section_id - section_id of the hierarchy configuration record
	*        (from a nexus40 row returned by get_active_networks_sections()).
	* @return object|null $locator - First datum locator from the typology component,
	*         or null if the component carries no data.
	*/
	public function get_typology_data(int|string $section_id) : ?object {

		$tipo			= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // 'hierarchy9' component_select
		$section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO; // hierarchy1
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
	* Resolve and cache the display name for a network typology record.
	*
	* Reads DEDALO_HIERARCHY_TYPES_NAME_TIPO ('hierarchy16') from the typologies section
	* (nexus57 for area_graph). Tries get_valor() first for the current language; if
	* empty, falls back to get_value_with_fallback_from_data() which walks all stored
	* language values to find any non-empty string. If no value is found at all a
	* placeholder string is returned so the UI always has something to display.
	*
	* Results are cached in a local static array keyed by $typology_section_id so
	* repeated calls within the same request are free.
	*
	* @param int|string $typology_section_id - section_id of the nexus57 typology record.
	* @return string $typology_name - Translated (or fallback) display label; never empty.
	*/
	public function get_typology_name(int|string $typology_section_id) : string {

		// cache Store for speed
		// Static local cache — one entry per unique typology_section_id per request.
			static $typology_names;
			if (isset($typology_names[$typology_section_id])) {
				return $typology_names[$typology_section_id];
			}

		// component
			$tipo			= DEDALO_HIERARCHY_TYPES_NAME_TIPO;
			$model_name		= ontology_node::get_model_by_tipo($tipo,true);
			$parent			= $typology_section_id;
			$mode			= 'list';
			$lang			= DEDALO_DATA_LANG;
			$section_tipo	= area_graph::$typologies_section_tipo;

			$component		= component_common::get_instance(
				$model_name,
				$tipo,
				$parent,
				$mode,
				$lang,
				$section_tipo
			);
			$value = $component->get_valor($lang);

			// Lang fallback: if get_valor() returned nothing for the current lang,
			// scan all stored language values to find any non-empty text.
			if(empty($value)) {
				$value = $model_name::get_value_with_fallback_from_data(
					$component->get_data(),
					false,
					$lang
				);
			}

			$typology_name = $value;

			// (!) Sentinel placeholder: ensures the browser always receives a
			// non-empty label even when no translation exists in any language.
			if (empty($typology_name)) {
				$typology_name = 'Typology untranslated ' . $tipo .' '. $parent;
			}

		// cache. Store for speed
		$typology_names[$typology_section_id] = $typology_name;


		return (string)$typology_name;
	}//end get_typology_name



	/**
	* GET_TYPOLOGY_ORDER
	* Resolve and cache the numeric sort position for a network typology record.
	*
	* Reads DEDALO_HIERARCHY_TYPES_ORDER ('hierarchy106', a component_number) from the
	* typologies section (nexus57). Returns the integer value of the first datum, or
	* 0 when no order has been set (placing the typology at the start of the list).
	*
	* Results are cached in a local static array keyed by $typology_section_id.
	*
	* @param int|string $typology_section_id - section_id of the nexus57 typology record.
	* @return int $order_value - Numeric sort position; 0 when unset.
	*/
	public function get_typology_order(int|string $typology_section_id) : int {

		// cache. Store for speed
			static $typology_order_values;
			if (isset($typology_order_values[$typology_section_id])) {
				return $typology_order_values[$typology_section_id];
			}

		$tipo			= DEDALO_HIERARCHY_TYPES_ORDER; // component_number
		$model_name		= ontology_node::get_model_by_tipo($tipo,true);
		$section_id		= $typology_section_id;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;
		$section_tipo	= area_graph::$typologies_section_tipo;
		$component		= component_common::get_instance(
			$model_name,
			$tipo,
			$section_id,
			$mode,
			$lang,
			$section_tipo
		);
		$data			= $component->get_data();
		$order_value	= $data[0]->value ?? 0;

		// cache
			$typology_order_values[$typology_section_id] = $order_value;


		return (int)$order_value;
	}//end get_typology_order



	/**
	* GET_HIERARCHY_NAME
	* Resolve and cache the display name of a hierarchy configuration record.
	*
	* Used as a fallback by get_hierarchy_sections() when the primary name lookup
	* (DEDALO_HIERARCHY_TERM_TIPO via get_data_lang()) returns nothing for the
	* current language.
	*
	* Reads DEDALO_HIERARCHY_TERM_TIPO ('hierarchy5') from DEDALO_HIERARCHY_SECTION_TIPO
	* ('hierarchy1') via get_value(), then falls back to get_value_with_fallback_from_data()
	* across all stored languages. If still empty, returns a sentinel placeholder string.
	*
	* Results are stored in the class-static $hierarchy_name_cache array (unlike
	* get_typology_name() which uses a function-static variable) so the cache is
	* shared across all area_graph instances in a request but can be inspected
	* or cleared externally.
	*
	* @param int|string $hierarchy_section_id - section_id of the nexus40 hierarchy record.
	* @return string $hierarchy_name - Translated (or fallback) display label; never empty.
	*/
	public function get_hierarchy_name(int|string $hierarchy_section_id) : string {

		// cache
			if (isset(self::$hierarchy_name_cache[$hierarchy_section_id])) {
				return self::$hierarchy_name_cache[$hierarchy_section_id];
			}

		// short vars
			$tipo			= DEDALO_HIERARCHY_TERM_TIPO;
			$model_name		= ontology_node::get_model_by_tipo($tipo,true);
			$section_id		= $hierarchy_section_id;
			$mode			= 'list';
			$lang			= DEDALO_DATA_LANG;
			$section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO;

		// value
			$component = component_common::get_instance(
				$model_name,
				$tipo,
				$section_id,
				$mode,
				$lang,
				$section_tipo
			);
			$value = $component->get_value();

			// hierarchy name
			// Two-stage fallback mirrors get_typology_name(): current lang first,
			// then any available lang, then a sentinel placeholder.
			if(empty($value)) {
				$value = $model_name::get_value_with_fallback_from_data(
					$component->get_data(),
					false,
					$lang
				);
			}

			$hierarchy_name = $value;

			// (!) Sentinel placeholder so the UI is never left with a blank label.
			if (empty($hierarchy_name)) {
				$hierarchy_name = 'Hierarchy untranslated ' . $tipo .' '. $section_id;
			}

		// cache
			self::$hierarchy_name_cache[$hierarchy_section_id] = $hierarchy_name;


		return (string)$hierarchy_name;
	}//end get_hierarchy_name




	/////////////// @ others ///////////////////////////////



	/**
	* SEARCH_THESAURUS
	* Execute a thesaurus search and return results as a recursive tree of ts_object data.
	*
	* Workflow:
	*   1. Runs $search_query_object through search::get_instance()->search() to obtain
	*      matching section records.
	*   2. For each hit, walks upward via component_relation_parent::get_parents_recursive()
	*      to collect the full ancestor chain as an array of locator objects.
	*   3. Passes the combined paths to combine_ar_data() to merge overlapping ancestors
	*      into a single deduplicated hierarchical array keyed by 'section_tipo_section_id'.
	*   4. Passes the merged structure to walk_hierarchy_data() which resolves each node
	*      into a ts_object->get_data() result and attaches children under ->heritage.
	*
	* The response includes $response->total (raw hit count from the DB) and
	* $response->result (the recursive tree). When SHOW_DEBUG is on, exec time is
	* appended to $response->debug.
	*
	* @param object $search_query_object - A valid SQO (search_query_object instance or
	*        stdClass with at least 'section_tipo' set) describing the thesaurus search.
	* @return object $response - stdClass with:
	*         ->result  mixed   — recursive tree on success, false on failure
	*         ->msg     string  — human-readable status message
	*         ->total   int     — total DB hit count
	*         ->debug   array   — execution time (only when SHOW_DEBUG===true)
	*/
	public function search_thesaurus(object $search_query_object) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= '';

		# Search records
			$search			= search::get_instance($search_query_object);
			$db_result		= $search->search();
			$total_records	= $db_result->row_count();

		# ar_path_mix . Calculate full path of each result
		// Build one path array per search hit: ancestors in root-first order followed
		// by a locator for the hit itself. These overlapping paths are later merged
		// by combine_ar_data() to produce a deduplicated tree.
			$ar_path_mix = array();
			foreach ($db_result as $row) {

				$section_tipo	= $row->section_tipo;
				$section_id		= $row->section_id;

				// get_parents_recursive returns ancestors deepest-first; reverse to root-first.
				$ar_parents = component_relation_parent::get_parents_recursive(
					$section_id,
					$section_tipo
				);

				$locator = new locator();
					$locator->set_section_tipo($section_tipo);
					$locator->set_section_id($section_id);

				$ar_path   = array_reverse($ar_parents);
				$ar_path[] = $locator; // add self at end

				$ar_path_mix[] = $ar_path;
			}

		// ar_data_combined
			$ar_data_combined = $this->combine_ar_data($ar_path_mix);

		$result = self::walk_hierarchy_data($ar_data_combined);

		// response
			$response->msg 	  	= 'Records found: '.$total_records;
			$response->result 	= $result;
			$response->total  	= $total_records;

		// debug
			if(SHOW_DEBUG===true) {
				$response->debug = [exec_time_unit($start_time)];
			}


		return (object)$response;
	}//end search_thesaurus



	/**
	* COMBINE_AR_DATA
	* Merge a set of root-to-leaf locator paths into a single deduplicated hierarchy.
	*
	* Takes the flat path arrays produced by search_thesaurus() and performs a
	* three-stage transformation:
	*
	*   Stage 1 — ar_simple:
	*     Each locator object is converted to the composite key string
	*     "section_tipo_section_id" (e.g. "ts1_73"). Result: array of arrays of keys.
	*
	*   Stage 2 — ar_hierarchy:
	*     Each simple path is folded (bottom-up, in reverse) into a nested associative
	*     array where each key wraps the subtree that follows it. The leaf node becomes
	*     an empty array. This is done per-path so overlapping ancestors still appear
	*     in multiple entries at this stage.
	*
	*   Stage 3 — ar_combine:
	*     array_merge_recursive() collapses all per-path nested arrays into a single tree.
	*     Because each level is an associative array, siblings at the same depth are
	*     merged under the same parent key rather than duplicated.
	*
	* NOTE: The commented-out sibling-expansion block inside stage 2 was an earlier
	* attempt to pre-populate sibling nodes alongside matched nodes; it was disabled
	* but intentionally left in place for reference.
	*
	* @param array $ar_path_mix - Array of locator-path arrays (each inner array is
	*        a root-first sequence of locator objects with ->section_tipo and ->section_id).
	* @return array $ar_combine - Merged nested associative array keyed by
	*         "section_tipo_section_id" strings; leaf nodes have empty-array values.
	*/
	public static function combine_ar_data(array $ar_path_mix) : array {

		/*
			REFERENCE ar_simple
			Simplify array keys

			[0] => ts1_65
			[1] => ts1_73
			[2] => ts1_74
		*/
		// Convert each locator in each path to a composite key string.
		$ar_simple=array();	foreach ($ar_path_mix as $key => $ar_value) {
			foreach ($ar_value as $i => $locator) {
				$ckey = $locator->section_tipo.'_'.$locator->section_id;
				$ar_simple[$key][$i] = $ckey;
			}
		}
		#return $ar_simple;

		// REFERENCE ar_hierarchy
			// Hierarchize the simple plain array in revere order
			// [0] => Array
			//       (
			//           [ts1_65] => Array
			//               (
			//                   [ts1_73] => Array
			//                       (
			//                           [ts1_74] => Array
			//                               (
			//                               )
			//                       )
			//               )
			//       )
			//    [1] => Array
			//        (
			//            [ts1_65] => Array
			//                (
			//                    [ts1_66] => Array
			//                        (
			//                            [ts1_67] => Array
			//                                (
			//                                )
			//                        )
			//                )
			//        )
			//    )

		// Fold each simple path into a nested array by iterating in reverse (leaf → root).
		$ar_hierarchy=array(); foreach ($ar_simple as $key => $ar_value) {
			# iterate array values in reverse order
			foreach (array_reverse($ar_value) as $ckey => $cvalue) {


				if(empty($ar_hierarchy[$key])) {
					// Last element (it will be empty because it is the one we are looking for)
					$ar_hierarchy[$key][$cvalue] = array();

				}else{
					// Intermediate downward elements
					$ar_hierarchy[$key] = array($cvalue => $ar_hierarchy[$key]);


					// Add siblings
					/*
					if (strpos($cvalue, 'hierarchy')===false) {
						$ar_children = area_graph::get_siblings($cvalue, $ar_value);
						if(!empty($ar_children)) foreach ($ar_children as $s_key => $s_value) {
							$ar_hierarchy[$key][$cvalue][$s_key]	= array();
						}
					}
					*/
				}
			}
		}

		// REFERENCE ar_combine
			// Combines hierarchized arrays to obtain one global array with combined values

			// [ts1_65] => Array
			//       (
			//           [ts1_73] => Array
			//               (
			//                   [ts1_74] => Array
			//                       (
			//                       )
			//               )
			//           [ts1_66] => Array
			//               (
			//                   [ts1_67] => Array
			//                       (
			//                       )
			//               )
			//       )

		// Merge all per-path nested arrays into one global tree.
		// array_merge_recursive is safe here because every level uses string keys;
		// duplicate keys (shared ancestors) are merged rather than appended.
		$ar_combine=array(); foreach ($ar_hierarchy as $key => $ar_value) {
			$ar_combine = array_merge_recursive($ar_combine, $ar_value);
		}


		return (array)$ar_combine;
	}//end combine_ar_data



	/**
	* GET_SIBLINGS
	* Return all sibling terms for the node identified by the composite key $ckey.
	*
	* Parses $ckey ("section_tipo_section_id") to identify the section, then reads
	* DEDALO_THESAURUS_RELATION_CHILDREN_TIPO ('hierarchy49', component_relation_children)
	* to obtain the parent's child list. The node itself is excluded from the result
	* so that only true siblings are returned.
	*
	* NOTE: This method is NOT called from any active code path in this file. The only
	* call site inside combine_ar_data() is commented out. The method exists for
	* future use or external callers.
	*
	* @param string $ckey - Composite node key in the form "section_tipo_section_id"
	*        (e.g. "ts1_73"). Only the first underscore-delimited token is used as
	*        section_tipo; everything after the first '_' is treated as section_id.
	* @return array $ar_siblings - Associative array keyed by sibling composite keys
	*         ("section_tipo_section_id") with empty-array values; excludes $ckey itself.
	*/
	public static function get_siblings(string $ckey) : array {

		// (!) explode('_', ...) on composite keys like "hierarchy45_123" yields
		// more than two parts; only [0] and [1] are consumed here. If a section_tipo
		// contains an underscore this will silently truncate section_id — current
		// Dédalo tipos (e.g. "ts1", "hierarchy45") do not contain underscores.
		$ar_parts 		= explode('_', $ckey);
		$section_tipo 	= $ar_parts[0];
		$section_id 	= $ar_parts[1];

		$tipo 			= DEDALO_THESAURUS_RELATION_CHILDREN_TIPO;
		$model_name 	= ontology_node::get_model_by_tipo($tipo,true); // 'component_relation_children';
		$mode 			= 'list';
		$component_relation_children = component_common::get_instance(
			$model_name,
			$tipo,
			$section_id,
			$mode,
			DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$data = $component_relation_children->get_data();

		// Build the sibling map: include every child locator except the node itself.
		// Uses loose comparison (==) for section_id to handle string/int equivalence
		// from the DB layer, and strict comparison (===) for section_tipo.
		$ar_siblings = array();
		foreach ((array)$data as $s_locator) {
			if ($s_locator->section_id==$section_id && $s_locator->section_tipo===$section_tipo) {
				# exclude
			}else{
				$ar_siblings[$s_locator->section_tipo.'_'.$s_locator->section_id] = array();
			}
		}


		return (array)$ar_siblings;
	}//end get_siblings



	/**
	* WALK_HIERARCHY_DATA
	* Recursively resolve the combined hierarchy tree into ts_object data objects.
	*
	* Each entry in $ar_data_combined is a "section_tipo_section_id" key whose value
	* is either an empty array (leaf) or a nested array of the same shape (sub-tree).
	* For every key the method:
	*   1. Parses section_tipo and section_id from the composite key.
	*   2. Instantiates a ts_object and calls get_data() to obtain the full node data
	*      object (term label, locator, etc.).
	*   3. Adds the node data to $ar_mix under the same key.
	*   4. If the value sub-array is non-empty, recurses and attaches the result as
	*      $child_data->heritage (so the browser can render collapsed/expanded subtrees).
	*
	* @param array $ar_data_combined - Nested associative array as produced by
	*        combine_ar_data(). Keys are "section_tipo_section_id" strings; values are
	*        nested arrays of the same shape (empty at leaf level).
	* @return array $ar_mix - Associative array with the same keys; values are the
	*         stdClass objects returned by ts_object::get_data(), with an optional
	*         ->heritage property containing the recursively resolved subtree.
	*/
	public static function walk_hierarchy_data(array $ar_data_combined) : array {

		$ar_mix = array();
		foreach ($ar_data_combined as $key => $ar_values) {

			// Parent
			$ar_parts				= explode('_', $key);
			$current_section_tipo	= $ar_parts[0];
			$current_section_id		= $ar_parts[1];
			$ts_object				= new ts_object($current_section_id, $current_section_tipo);
			$child_data				= $ts_object->get_data();

			# Add to array
			$ar_mix[$key] = $child_data;

			# Add children in container heritage
			if (!empty($ar_values)) {
				$ar_mix[$key]->heritage = self::walk_hierarchy_data( $ar_values );
			}
		}


		return $ar_mix;
	}//end walk_hierarchy_data



	/**
	* GET_HIERARCHY_TERMS_SQO
	* Build the SQO needed to search for a specific set of hierarchy terms by section_id.
	*
	* Iterates $hierarchy_terms (the 'hierarchy_terms' property from the area's stored
	* properties, as set by the graph UI) and builds a Mango-style $or/$and filter:
	*   - Each value item contributes an $and group requiring both a matching section_id
	*     (via component 'hierarchy22', component_section_id, path name 'Id') and a
	*     matching section_tipo (via the special 'section' path model).
	*   - All groups are wrapped in a top-level $or so any matching term is returned.
	*
	* The section_tipo array ($ar_section_tipos) is collected from the value items so
	* the SQO only searches the sections that actually contain the terms.
	*
	* 'hierarchy22' is the section_id component inside the hierarchy section that
	* stores a term's own section_id for positional search.
	*
	* @param array $hierarchy_terms - Array of objects each with a ->value array of
	*        locator-like objects having ->section_tipo and ->section_id properties.
	* @return object $sqo - A search_query_object instance with section_tipo, limit,
	*         filter ($or of $and groups), and an empty select array.
	*/
	public function get_hierarchy_terms_sqo(array $hierarchy_terms) : object {

		#
		# FILTER_CUSTOM. hierarchy_terms
		$filter_custom = null;


		// Reset $ar_section_tipos to use only filter sections
		// $filter_custom is set here even though it was initialised to null above;
		// the initial null assignment is kept as a declaration sentinel.
			$ar_section_tipos = [];

			$filter_custom = new stdClass();

			$filter_custom->{OP_OR} = [];

			// path: match by section_id field ('hierarchy22' = component_section_id)
			$path = new stdClass();
				$path->component_tipo 	= 'hierarchy22';
				$path->model 			= 'component_section_id';
				$path->name 			= 'Id';

			// path_section: match by the section_tipo column in the matrix table itself
			$path_section = new stdClass();
				$path_section->model 	= 'section';
				$path_section->name 	= 'Section tipo column';

		// hierarchy_terms
			foreach ($hierarchy_terms as $current_term) {
				foreach ($current_term->value as $item) {

					$current_section_tipo	= $item->section_tipo;
					$current_section_id		= $item->section_id;

					# Update path section tipo
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

			# SEARCH_QUERY_OBJECT . Add search_query_object to options
			// limit=100: a graph widget is not expected to display more than 100 terms
			// simultaneously; callers must paginate if they need more.
			$search_query_object = new search_query_object();
				$search_query_object->id			= 'thesaurus';
				$search_query_object->section_tipo	= $ar_section_tipos;
				$search_query_object->limit			= 100;
				$search_query_object->filter		= isset($filter_custom) ? $filter_custom : null;
				$search_query_object->select		= [];


		return $search_query_object;
	}//end get_hierarchy_terms_sqo



}//end area_graph
