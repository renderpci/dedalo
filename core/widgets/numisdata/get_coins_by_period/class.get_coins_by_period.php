<?php declare(strict_types=1);
/**
 * CLASS GET_COINS_BY_PERIOD
 * Widget that counts linked numismatic records (coins) grouped by chronological
 * period, using a thesaurus hierarchy resolved at runtime.
 *
 * Each coin record carries a period portal whose locators point into a thesaurus
 * section (e.g. "dc1"). When the optional `use_parent` flag is set in the IPO
 * configuration, individual fine-grained period terms (e.g. "s.I to s.II") are
 * rolled up into their nearest ancestor that carries the target model (e.g. "Era"
 * model, section_id = 1), producing coarser buckets such as "Roman" or "Greek".
 *
 * Responsibilities:
 * - Reads coin locators from a source portal identified by the "source" IPO input.
 * - Resolves the full thesaurus hierarchy into a flat, ordered list via
 *   get_hierarchy_children_recursive(), preserving parent references for roll-up.
 * - Performs a single bulk SQL search (section_id IN (...)) to fetch all linked coin
 *   records in one query rather than N individual lookups.
 * - For each coin record, reads the duplicated-flag portal; coins whose first
 *   locator has section_id === '2' are skipped (the '2' convention means TRUE in
 *   the numismatic schema — see get_archive_weights for the same pattern).
 * - Increments a per-hierarchy-term counter for each qualifying period locator found
 *   on a coin; if use_parent is true, the counter is applied to the ancestor term
 *   that matches target_model_section_id instead of the direct term.
 * - Collects unmatched, empty, or unresolvable period values into a "?" catch-all
 *   bucket appended at the end of the output list.
 * - Emits one output item per IPO output entry; the output variable is resolved by
 *   name via PHP variable variables ($$current_id), matching the local variable
 *   $period built during processing.
 * - The returned data is consumed by render_get_coins_by_period.js on the client,
 *   which renders an unordered list of period labels and coin counts.
 *
 * Extends widget_common, which provides get_instance(), the shared properties
 * (section_tipo, section_id, mode, lang, ipo), and the get_data_parsed() hook.
 *
 * Full IPO sample stored in the ontology properties:
 *
 *   {
 *       "ipo": [{
 *           "input": [
 *               {
 *                   "type": "source",
 *                   "section_tipo": "numisdata5",
 *                   "component_tipo": "numisdata322"
 *               },
 *               {
 *                   "type": "period",
 *                   "use_parent": true,
 *                   "section_tipo": "numisdata4",
 *                   "component_tipo": "numisdata1373",
 *                   "target_sections":["dc1"],
 *                   "target_model_section_id": 1
 *               },
 *               {
 *                   "type": "target_component_section_id",
 *                   "section_tipo": "numisdata4",
 *                   "component_tipo": "numisdata130"
 *               },
 *               {
 *                   "type": "duplicated",
 *                   "section_tipo": "numisdata4",
 *                   "component_tipo": "numisdata157"
 *               }
 *           ],
 *           "output": [
 *               {
 *                   "id": "period",
 *                   "value": "string"
 *               }
 *           ]
 *       }],
 *       "path": "/numisdata/get_coins_by_period",
 *       "data_source": [
 *           {
 *               "type": "source",
 *               "section_tipo": "numisdata5",
 *               "component_tipo": "numisdata322"
 *           },
 *           {
 *               "type": "period",
 *               "section_tipo": "numisdata4",
 *               "component_tipo": "numisdata1373"
 *           },
 *           {
 *               "type": "duplicated",
 *               "section_tipo": "numisdata4",
 *               "component_tipo": "numisdata157"
 *           }
 *       ],
 *       "widget_info": "Create a summatory of elements by period.",
 *       "widget_name": "get_coins_by_period",
 *       "widget_path": "/numisdata/widgets"
 *   }
 *
 * Key features:
 * - Reads coin locators from a source portal (IPO input)
 * - Resolves the chronological thesaurus hierarchy recursively
 * - Filters out duplicated coins (skips when duplicated flag section_id === '2')
 * - Groups coins by period term, optionally aggregating into parent "Era" model terms
 * - Outputs an array of period objects with label and count, consumed by render_get_coins_by_period.js
 * - Unmatched or empty periods are collected into an "?" catch-all bucket
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class get_coins_by_period extends widget_common {



	/**
	* GET_DATA
	* Resolve the widget IPO configuration into a grouped coin count per chronological period.
	*
	* Processing stages for each IPO block:
	*   1. Extract the four typed descriptors from the "input" array:
	*      - "source"                  : portal on the archive record holding coin locators
	*      - "period"                  : portal on each coin record holding thesaurus period locators
	*      - "target_component_section_id" : used as the search filter column for the bulk coin query
	*      - "duplicated"              : boolean-style portal; section_id === '2' means the coin is a duplicate
	*   2. Resolve the full thesaurus hierarchy (target_sections) into a flat ordered list
	*      ($ar_hierarchies), each node enriched with label, parent reference, and model_section_id.
	*   3. Load the source portal to collect all coin locators linked to the current archive record,
	*      then execute a single bulk SQL search (section_id IN (...)) to fetch all coin records.
	*   4. For each coin row:
	*      a. Skip if the duplicated-portal first locator has section_id === '2' (is a duplicate).
	*      b. For each period locator on the coin, find the matching $ar_hierarchies entry.
	*      c. If use_parent is true, walk up the hierarchy to the ancestor whose model_section_id
	*         matches target_model_section_id and increment that ancestor's counter instead.
	*      d. Accumulate unmatched/empty period references in $empty_period_count.
	*   5. Filter $ar_hierarchies to terms with count !== null (at least one coin matched).
	*   6. If any unmatched/empty counts exist, append a catch-all "?" entry.
	*   7. Emit one output stdClass per IPO output descriptor, resolved via PHP variable
	*      variables ($$current_id maps "period" → local $period array).
	*
	* Early return: returns [] (not null) when the source portal has no linked coins,
	* signalling "no data" to the client without triggering an error state.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": [
	*     { "type": "source",                    "section_tipo": "numisdata5", "component_tipo": "numisdata322" },
	*     {
	*       "type": "period",
	*       "use_parent": true,
	*       "section_tipo": "numisdata4",
	*       "component_tipo": "numisdata1373",
	*       "target_sections": ["dc1"],
	*       "target_model_section_id": 1
	*     },
	*     { "type": "target_component_section_id","section_tipo": "numisdata4", "component_tipo": "numisdata130" },
	*     { "type": "duplicated",               "section_tipo": "numisdata4", "component_tipo": "numisdata157" }
	*   ],
	*   "output": [
	*     { "id": "period", "value": "string" }
	*   ]
	* }
	*
	* Sample returned data item (one object per IPO output entry):
	* {
	*   "widget": "get_coins_by_period",
	*   "key": 0,
	*   "widget_id": "period",
	*   "value": [
	*     { "section_id": "42", "section_tipo": "dc1", "parent": { ... }, "label": "Roman", "count": 15 },
	*     { "section_id": "77", "section_tipo": "dc1", "parent": { ... }, "label": "Greek",  "count": 8 },
	*     { "section_id": null, "section_tipo": null, "parent": null, "label": "?", "count": 3 }
	*   ]
	* }
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'get_coins_by_period',
	*       'path'          => 'numisdata/get_coins_by_period',
	*       'section_tipo'  => 'numisdata5',
	*       'section_id'    => '123',
	*       'mode'          => 'edit',
	*       'ipo'           => $ipo_from_ontology
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return array|null Flat array of stdClass items; each has widget, key, widget_id, value.
	*                    Returns [] when the source portal holds no linked coin records.
	*/
	public function get_data() : ?array {

		// check the time of the current processes
		// $time = 0;
		// $widget_time = start_time();

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$ipo			= $this->ipo;

		$data = [];
		foreach ($ipo as $key => $current_ipo) {

			$input	= $current_ipo->input;
			$output	= $current_ipo->output;

			// get the components from the input object
			// Each IPO input entry carries a "type" discriminator. array_reduce is used
			// here so that a missing entry simply leaves the variable null rather than
			// requiring an explicit isset check everywhere below.

				// source - the source component with data to be used
				// Identifies the portal on the archive record that holds locators for
				// all coins linked to this record (e.g. numisdata322 on numisdata5).
				$component_source = array_reduce($input, function ($carry, $item){
					if ($item->type==='source') {
						return $item;
					}
					return $carry;
				});

				// period - the thesaurus of the periods to be used and match with data
				// Identifies the portal on each coin record that stores thesaurus period
				// locators (e.g. numisdata1373 on numisdata4). Also carries the auxiliary
				// configuration: target_sections (thesaurus section tipos), use_parent flag,
				// and target_model_section_id for roll-up mode.
				$component_period = array_reduce($input, function ($carry, $item){

					if ($item->type==='period') {
						return $item;
					}
					return $carry;
				});

				$component_tipo_period		= $component_period->component_tipo;
				$section_tipo_period		= $component_period->section_tipo;
				$target_sections			= $component_period->target_sections;
				$target_model_section_id	= $component_period->target_model_section_id;
				$use_parent					= $component_period->use_parent ?? null;
				$period_model_name			= ontology_node::get_model_by_tipo($component_tipo_period,true); // Expected portal


				// duplicated - to be removed if duplicated coins is set
				// Missing "duplicated" descriptor is a fatal IPO misconfiguration: without
				// it the widget cannot distinguish original from duplicate coins, so the
				// entire IPO block is skipped and an ERROR is logged rather than returning
				// a silent wrong count.
				$component_duplicated = array_reduce($input, function ($carry, $item){
					if ($item->type==='duplicated') {
						return $item;
					}
					return $carry;
				});
				if (empty($component_duplicated)) {
					debug_log(__METHOD__
						. " !!!!!!!!!!!!!!! Skipped component_duplicated (type == duplicated) not found in input " . PHP_EOL
						. ' input: ' . to_string($input)
						, logger::ERROR
					);
					continue;
				}
				$component_tipo_duplicated	= $component_duplicated->component_tipo;
				$duplicated_model_name		= ontology_node::get_model_by_tipo($component_tipo_duplicated,true); // Expected portal


			// Resolve thesaurus
			// Stage 1: fetch every row in target_sections (the full thesaurus matrix) so
			// that get_hierarchy_children_recursive() can look up any term by locator using
			// the already-loaded $ts_ar_records, avoiding per-term SQL queries.
				$ts_sqo = new search_query_object();
					$ts_sqo->set_section_tipo($target_sections);
					$ts_sqo->offset	= 0;
					$ts_sqo->limit	= 0;

				$ts_search = search::get_instance($ts_sqo);
					$db_result = $ts_search->search();
					$ts_ar_records = $db_result->fetch_all();

				// main term of ts, search in hierarchies section to get the main terms of the thesaurus
				// create a OR statement of sqo for each thesaurus section_tipo
				// Stage 2: find the hierarchy records (DEDALO_HIERARCHY_SECTION_TIPO = 'hierarchy1')
				// whose DEDALO_HIERARCHY_TARGET_SECTION_TIPO ('hierarchy53') field references one of
				// target_sections. Each matching hierarchy record is the root of a sub-tree; its
				// DEDALO_HIERARCHY_CHILDREN_TIPO ('hierarchy45') locators are the top-level terms.
				$filter_or = [];
				foreach ($target_sections as $current_section_tipo) {
					$filter = new stdClass();
						$filter->q = $current_section_tipo;
						$filter->path = json_decode('[{
							"section_tipo": "'.DEDALO_HIERARCHY_SECTION_TIPO.'",
							"component_tipo":"'.DEDALO_HIERARCHY_TARGET_SECTION_TIPO.'"
						}]');
						$filter_or[] = $filter;
				}

				$search_query_object = json_decode('{
					"section_tipo": ["'.DEDALO_HIERARCHY_SECTION_TIPO.'"],
					"filter": {
						"$or": '.json_encode($filter_or).'
					}
				}');

				$hierarchies_search = search::get_instance($search_query_object);
				$db_result = $hierarchies_search->search();

				// Stage 3: recursively expand each top-level hierarchy locator into a flat
				// ordered list. Passing null as $parent starts a fresh ancestry chain.
				// The recursive helper annotates each node with its $parent locator so that
				// get_parent_with_specific_model() can traverse upward later.
				$ordered_hierarchy = [];
				foreach ($db_result as $row) {

					$root_hierarchy_children = $row->relation->{DEDALO_HIERARCHY_CHILDREN_TIPO} ?? [];
					foreach ($root_hierarchy_children as $current_locator) {

						$result = $this->get_hierarchy_children_recursive($ts_ar_records, $current_locator, null);
						if (!empty($result)) {
							$ordered_hierarchy = array_merge($ordered_hierarchy, $result);
						}
					}
				}

				// Stage 4: project the raw thesaurus rows into lightweight hierarchy objects.
				// Each entry carries:
				//   section_id / section_tipo — locator for fast coin→period matching
				//   parent                    — parent locator (object) for roll-up traversal, or null at root
				//   label                     — resolved term label for the current display language
				//   count                     — null initially; incremented per qualifying coin
				//   model_section_id          — the section_id of the ontology model applied to this term
				//                              (DEDALO_THESAURUS_RELATION_MODEL_TIPO = 'hierarchy27');
				//                              if no model is set, defaults to target_model_section_id+1
				//                              so the term never accidentally matches the roll-up target.
				$ar_hierarchies = [];
				foreach ($ordered_hierarchy as $section) {
					$hierarchy_object = new stdClass();
						$hierarchy_object->section_id	= $section->section_id;
						$hierarchy_object->section_tipo	= $section->section_tipo;
						$hierarchy_object->parent		= $section->parent;
						$period_label					= ts_object::get_term_by_locator( $hierarchy_object, DEDALO_DATA_LANG, true );
						$hierarchy_object->label		= $period_label;
						$hierarchy_object->count		= null;

						$model = $section->relation->{DEDALO_THESAURUS_RELATION_MODEL_TIPO} ?? [];

						$hierarchy_object->model_section_id = (is_object($model))
							? $model->section_id
							: $target_model_section_id+1; // something different to the target_model

					$ar_hierarchies[] = $hierarchy_object;
				}


			// data
			// Stage 5: fetch coin record data in a single bulk SQL query instead of N
			// individual lookups. The strategy is:
			//   a. Load the source portal to obtain all coin locators (section_id list).
			//   b. Build an IN filter over the coin section_id column and query those rows.
			// This avoids O(N) per-coin round-trips to the database.

				// get the source data — coin locators linked to this archive record
				$source_component_tipo 	= $component_source->component_tipo;
				$source_section_tipo 	= $component_source->section_tipo;

				// get the source data
				$model_name 	  = ontology_node::get_model_by_tipo($source_component_tipo,true); // Expected a portal
				$component_portal = component_common::get_instance(
					$model_name,
					$source_component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$source_section_tipo
				);
				// all related objects (coins) to this.
				$component_data = $component_portal->get_data();

				if (empty($component_data)) {
					return [];
				}

				// reduce all locators into a flat array with section_id,
				// it will be used to search all sections with this section_id
				$ar_target_section_id = array_map( function ($item){
					return $item->section_id;
				}, $component_data);


				// target_component_section_id descriptor
				// Points to the section_id column component on the coin section. The SQO
				// filter below uses it to restrict the bulk query to exactly the coins
				// returned by the source portal.
				$target_component_section_id = array_reduce($input, function ($carry, $item){
					if ($item->type==='target_component_section_id') {
						return $item;
					}
					return $carry;
				});
				// use the section_id of the locators to get the filter by section_id into the search
				// q = "1,4,77,17,34,..."
				// The comma-separated section_id string is fed into an IN operator so the
				// database returns only the coin rows we already know exist via the portal.
				$q = implode(',', $ar_target_section_id);
				$filter_data = (object)[
					'$and' => [
						(object)[
							'q' => $q,
							'q_operator' => null,
							'path' => [$target_component_section_id],
							'type' => 'number',
							'component_path' => [
								'section_id'
							],
							'lang' => 'all',
							'unaccent' => false,
							'format' => 'in_column',
							'column_name' => 'section_id',
							'operator' => 'IN'
						]
					]
				];

				$sqo_data = (object)[
					'section_tipo' => [$target_component_section_id->section_tipo],
					'filter' => $filter_data,
					'offset' => 0,
					'limit' => 0
				];
				$sqo = new search_query_object($sqo_data);

				$search		= search::get_instance($sqo);
				$db_result	= $search->search();

			// get the value of the component using portal data
			// Stage 6: iterate each coin row from the bulk query result, apply the
			// duplicate-exclusion rule, then route each period locator to the correct
			// hierarchy bucket.
				$empty_period_count = null;
				foreach ($db_result as $row) {

					// duplicated flag check
					// The duplicated portal column is read directly from the matrix row's
					// relation field. section_id === '2' is the numismatic schema convention
					// for "boolean TRUE" (the coin IS a duplicate); skip it.
					$duplicated_value = $row->relation->$component_tipo_duplicated ?? [];
					$duplicated_data = $duplicated_value[0] ?? null;
					// sample of duplicated data: object|null
						// {
						//     "type": "dd151",
						//     "section_id": "2",
						//     "section_tipo": "numisdata341",
						//     "from_component_tipo": "numisdata157"
						// }
					if ( is_object($duplicated_data) && $duplicated_data->section_id=='2' ) {
						continue;
					}

					// period locator routing
					// A coin with no period locators contributes to the "?" catch-all.
					// A coin with period locators is matched against $ar_hierarchies and
					// its hierarchy entry's count is incremented (or rolled up to the
					// ancestor matching target_model_section_id when use_parent is true).
					$period_data = $row->relation->$component_tipo_period ?? null;
					if(empty($period_data)){
						$empty_period_count++;
					}else{
						foreach ($period_data as $current_period) {

							// locate the matching hierarchy entry by (section_tipo, section_id)
							// Equality on both fields is required because multiple thesaurus
							// sections can share the same section_id value.
							$ts_term = array_find($ar_hierarchies, function($el) use($current_period){
								return $el->section_tipo === $current_period->section_tipo
										&& $el->section_id === $current_period->section_id;
							});

							// check ts_term found
							// A period locator that doesn't appear in $ar_hierarchies means
							// the coin points to a term outside the configured target_sections
							// (e.g. a deleted or mis-configured thesaurus entry). Log at ERROR
							// and route to the catch-all bucket rather than silently dropping it.
							if (!is_object($ts_term)) {
								debug_log(__METHOD__
									. " Ignored not found ts_term for period. " . PHP_EOL
									. ' current_period: ' . to_string($current_period) . PHP_EOL
									. ' ar_hierarchies: ' . to_string($ar_hierarchies)
									, logger::ERROR
								);
								$empty_period_count++;
								continue;
							}

							// Check if the source specify that need any parent with specific model (as "Era" model terms)
							// use_parent mode: walk up the hierarchy until the ancestor whose
							// model_section_id matches target_model_section_id is found, then
							// increment that ancestor's count. This collapses fine-grained period
							// terms (e.g. "s.I to s.II") into their "Era" bucket (e.g. "Roman").
							if($use_parent === true){
								// find the parent term with the target model section_id
								$area_term = $this->get_parent_with_specific_model($ar_hierarchies, $ts_term, $target_model_section_id);

								// if the term do not has any parent with the model to find add it to the unknown term (?)
								// If no matching ancestor exists (e.g. the term is already a root
								// term and does not carry the target model), route to catch-all.
								if(!isset($area_term)){
									$empty_period_count++;
								}else{
									// count the coin into the term
									$area_term->count = $area_term->count + 1;
								}

							}else{
								// count the coin into the term
								// Direct (non-roll-up) mode: increment the exact period term matched.
								// The is_object guard is redundant here (already checked above) but
								// is left in place to be safe.
								if(is_object($ts_term)){
									$ts_term->count = $ts_term->count + 1;
								}
							}
						}//end foreach ($period_data as $current_period)
					}
				}//end foreach ($db_result as $row)

				// build $period: only hierarchy entries with at least one coin (count !== null)
				// are included; entries with count === null received zero coins and are omitted.
				$period = array_filter($ar_hierarchies, function($el){
					return $el->count !== null;
				});
				// add empty period hierarchy at end of the
				// The "?" sentinel is appended last so the client renders it after all
				// real period buckets. $empty_period_count remains null if every coin
				// matched a known period, so the sentinel is only added when needed.
				if(isset($empty_period_count)){
					$empty_hierarchy = new stdClass();
						$empty_hierarchy->section_id	= null;
						$empty_hierarchy->section_tipo	= null;
						$empty_hierarchy->parent		= null;
						$empty_hierarchy->label			= '?';
						$empty_hierarchy->count			= $empty_period_count;

					$period[] = $empty_hierarchy;
				}

			// output serialisation
			// PHP variable variables: $current_id is the string "period", so $$current_id
			// resolves to the local $period array built above. This pattern allows the IPO
			// output list to drive which computed variables are emitted without a switch.
			// If a declared output id has no corresponding local variable, ?? null prevents
			// an undefined-variable notice and emits value: null to the client.
			foreach ($output as $data_map) {
				$current_id = $data_map->id;
				$current_data = new stdClass();
					$current_data->widget 		= get_class($this);
					$current_data->key  		= $key;
					$current_data->widget_id 	= $current_id;
					$current_data->value 		= $$current_id ?? null;
				$data[] = $current_data;
			}
		}//foreach ipo

		 // $time = $time + (start_time()-$widget_time);
		 // dump($time/1000000, ' widget_time ++ '.to_string());

		return $data;
	}//end get_data




	/**
	* GET_HIERARCHY_CHILDREN_RECURSIVE
	* Expand a single thesaurus locator into a flat, depth-first ordered list of
	* itself and all its descendants, annotating each node with its direct parent.
	*
	* The method operates entirely in-memory over the pre-fetched $ts_ar_records
	* array so that no additional SQL queries are issued during traversal.
	*
	* For each locator:
	*   1. Find the matching raw row in $ts_ar_records (matched on section_tipo + section_id).
	*   2. Append the row to $ar_children and stamp its ->parent property with the
	*      caller-supplied $parent locator (null for root nodes).
	*   3. Read the DEDALO_THESAURUS_RELATION_CHILDREN_TIPO ('hierarchy49') relation
	*      field from the row; if non-empty, recurse for each child locator, passing
	*      the current $locator as the new $parent.
	*   4. Merge each recursive result into $ar_children (flat, not nested).
	*
	* The parent stamp is written directly onto the raw $ts_ar_records object, which
	* is passed by reference in PHP. This means $ar_hierarchies in get_data() contains
	* parent-linked objects that share identity with the source $ts_ar_records entries.
	*
	* @param array       $ts_ar_records Flat array of all raw thesaurus section rows
	*                                   pre-fetched from target_sections.
	* @param object      $locator       Locator ({section_tipo, section_id}) to expand.
	* @param object|null $parent        Locator of $locator's direct parent, or null
	*                                   when $locator is a top-level (root) term.
	* @return array Flat ordered list of stdClass thesaurus rows for $locator and all
	*               its descendants, each annotated with a ->parent property.
	*/
	private	function get_hierarchy_children_recursive(array $ts_ar_records, object $locator, ?object $parent) : array {

		// find the section with the current component inside the whole thesaurus.
		// If the locator references a term that does not exist in $ts_ar_records
		// (e.g. a stale locator pointing to a deleted term), the array_find returns
		// null and the method returns an empty array, silently skipping that branch.
		$ar_children = [];
		$ts_term_section = array_find($ts_ar_records, function($el) use($locator){
			return $el->section_tipo === $locator->section_tipo
					&& $el->section_id === $locator->section_id;
		});
		// if find it, save into the children and get all children of them.
		if(is_object($ts_term_section)){

			$ar_children[] = $ts_term_section;
			// set the parent as himself to be used as reference.
			// Stamping ->parent on the raw row propagates the ancestry chain so that
			// get_parent_with_specific_model() can walk it upward via $ts_term->parent.
			$ts_term_section->parent = $parent;

			// filter all children of the current thesaurus section.
			$root_hierarchy_children = $ts_term_section->relation->{DEDALO_THESAURUS_RELATION_CHILDREN_TIPO} ?? [];
			// if this section has children do recursion
			if(!empty($root_hierarchy_children)){

				foreach ($root_hierarchy_children as $current_locator) {
					$result = $this->get_hierarchy_children_recursive($ts_ar_records, $current_locator, $locator);
					// save the result in a flat array
					if (!empty($result)) {
						$ar_children = array_merge($ar_children, $result);
					}
				}
			}
		}
		return $ar_children;
	}// end get_hierarchy_children_recursive



	/**
	* GET_PARENT_WITH_SPECIFIC_MODEL
	* Walk the thesaurus ancestry chain upward from $ts_term until an ancestor whose
	* model_section_id matches $target_model_section_id is found, then return it.
	*
	* This is the roll-up mechanism used by get_data() when use_parent is true. Fine-
	* grained period terms (e.g. "s.I to s.II", model = "Period") are rolled up to
	* their nearest ancestor that carries the target model (e.g. model section_id = 1,
	* named "Era"), such as "Roman" or "Greek".
	*
	* Traversal contract:
	*   - If $ts_term itself matches the target model, return it immediately.
	*   - Otherwise read $ts_term->parent (a locator object or null).
	*   - If parent is null the term is already a root with no matching ancestor;
	*     return null so the caller routes the coin to the "?" catch-all bucket.
	*   - Locate the parent entry in $ar_hierarchies and recurse.
	*   - If the parent locator does not resolve in $ar_hierarchies (stale data),
	*     return null rather than looping or throwing.
	*
	* Both model_section_id and target_model_section_id are cast to int before
	* comparison because section_id values may arrive as string or int depending
	* on where the data originated (JSON decode, DB result, ontology config).
	*
	* @param array      $ar_hierarchies        Processed flat hierarchy array built in get_data().
	*                                           Each entry is a stdClass with section_id, section_tipo,
	*                                           parent (locator|null), label, count, model_section_id.
	* @param object     $ts_term               Current hierarchy entry to test and walk upward from.
	* @param string|int $target_model_section_id The model section_id that identifies the desired
	*                                           ancestor level (e.g. 1 for "Era").
	* @return object|null The first ancestor (or $ts_term itself) whose model_section_id matches,
	*                     or null if no such ancestor exists in the hierarchy.
	*/
	private function get_parent_with_specific_model(array $ar_hierarchies, object $ts_term, string|int $target_model_section_id) : ?object {

		// check if the current term has the correct model section_id (take account that section_id could be int or string, so cast to int to compare)
		if((int)$ts_term->model_section_id !== (int)$target_model_section_id){

			// if the term doesn't match, get his parent and do the recursion
			$parent = $ts_term->parent;

			// if the term has not parent (top term) is not possible continue, so return null (don''t found)
			if(!isset($parent)){
				return null;
			}
			// find his parent into the whole hierarchies
			// Re-resolve the parent locator within the processed $ar_hierarchies rather
			// than using the raw $ts_ar_records, ensuring the same enriched objects
			// (with label, count, model_section_id) are compared and mutated.
			$parent_term = array_find($ar_hierarchies, function($el) use($parent){
				return $el->section_tipo === $parent->section_tipo
						&& $el->section_id === $parent->section_id;
			});
			if(!is_object($parent_term)){
				return null;
			}

			return $this->get_parent_with_specific_model($ar_hierarchies, $parent_term, $target_model_section_id);
		}else{
			// if match with the section_id model return it.
			return $ts_term;
		}
	}//end get_parent_with_specific_model



}//end get_coins_by_period
