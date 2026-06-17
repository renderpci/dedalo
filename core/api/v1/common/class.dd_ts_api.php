<?php declare(strict_types=1);
/**
* CLASS DD_TS_API
* Remote API controller for thesaurus tree read and write operations.
*
* This is the server-side handler that the JSON API dispatcher invokes when
* `dd_api === 'dd_ts_api'`. It exposes five remote actions covering every
* interaction that the area_thesaurus client (and the thesaurus widget used
* inside other areas) needs:
*
* - get_node_data    — fetch the rendered data of a single thesaurus node
* - get_children_data — fetch paginated children of a node
* - add_child        — create a new child term under a parent, transactionally
* - update_parent_data — move a node to a different parent, transactionally
* - save_order       — persist a user-reordered sibling list, transactionally
*
* Responsibilities:
* - SEC-024 allowlist gate: only methods listed in API_ACTIONS can be called
*   over the network.
* - Early permission checks (common::get_permissions) before any DB mutation,
*   to avoid timing oracles or schema leaks.
* - Transactional correctness for all write operations via DBi::transaction()
*   combined with matrix_db_manager::acquire_node_lock() to serialize
*   concurrent modifications of the same parent.
* - Post-rollback cache hygiene: clears component and section_record in-memory
*   instance caches so persistent workers do not serve stale state.
* - ts_object cache invalidation after successful writes.
*
* Data shapes:
* - All public methods accept a single `object $rqo` (Request Query Object)
*   and return a `stdClass $response` with at minimum:
*     $response->result  mixed  — false on hard failure, payload on success
*     $response->msg     string — human-readable status
*     $response->errors  array  — empty on clean success
*
* Relationships:
* - Delegates tree-render logic to ts_object and ts_object::parse_child_data().
* - Delegates parent-link management to component_relation_parent.
* - Delegates child ordering to component_relation_children::sort_children().
* - Uses matrix_db_manager::acquire_node_lock() for advisory row-level locking.
* - Uses DBi::transaction() for atomicity.
*
* @package Dédalo
* @subpackage Core
*/
final class dd_ts_api {



	/**
	* SEC-024: explicit allowlist of methods callable as remote API actions.
	* Adding a new public-static method does NOT make it remotely callable; it
	* must also be listed here. Internal helpers (e.g. clear_instance_caches)
	* are intentionally absent because they are invoked from PHP code only.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'get_node_data',
		'get_children_data',
		'add_child',
		'update_parent_data',
		'save_order'
	];



	/**
	* GET_NODE_DATA
	* Returns the rendered data object for a single thesaurus node.
	*
	* Resolves the locator described by $rqo->source, delegates to
	* ts_object::parse_child_data() to build the node's display data (term
	* label, icons, children count, etc.), and returns the first (and only)
	* element of that array as the result.
	*
	* Returns $response->result === null when the locator resolves but the
	* node has no parseable data (e.g. a deleted record still referenced by a
	* locator). Returns false only on hard failures (missing source, permission
	* denied).
	*
	* @param object $rqo - Request Query Object. Expected shape:
	*   {
	*     source: {
	*       section_tipo: string,    // thesaurus hierarchy tipo (e.g. 'ds1')
	*       section_id:   string|int,// record id of the node
	*       children_tipo: string,   // optional: component tipo driving the child link
	*       area_model:   string     // optional: 'area_thesaurus' (default)
	*     },
	*     options: {
	*       thesaurus_view_mode: string // 'default'|'model'; 'model' exposes ontology structure
	*     }
	*   }
	* @return object $response
	*/
	public static function get_node_data(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// Input validation
			if (!isset($rqo->source)) {
				$response->errors[] = 'Missing source property in the request object.';
				$response->msg = 'Invalid request. Source data is missing.';
				return $response;
			}

		// short vars
			$source					= $rqo->source;
			$section_tipo			= $source->section_tipo ?? null;
			$section_id				= $source->section_id ?? null;
			$children_tipo			= $source->children_tipo ?? null;
			$area_model				= $source->area_model ?? 'area_thesaurus';
			$options				= $rqo->options ?? new stdClass();
			$thesaurus_view_mode	= $options->thesaurus_view_mode ?? 'default'; // string thesaurus_view_mode. Values: model|default

		// SEC: read permission required to view thesaurus node data
			if (!empty($section_tipo)) {
				security::assert_section_permission($section_tipo, 1, __METHOD__);
			}

		// ts_object_options. thesaurus_view_mode
			$ts_object_options = new stdClass();
				$ts_object_options->model = $thesaurus_view_mode==='model'
					? true
					: false; // get from URL as thesaurus_view_mode=model

		// data
			// children. Calculated from given locator
				$locator = new locator();

				$locator->set_section_tipo($section_tipo);

				$locator->set_section_id($section_id);

				if (!empty($children_tipo)) {
					$locator->set_from_component_tipo($children_tipo);
				}

			// parse_child_data
				$ar_children_data = ts_object::parse_child_data(
					[$locator],
					$area_model,
					$ts_object_options
				);

			// build data result object
				$data = $ar_children_data[0] ?? null;

		$result = $data;

		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. get_node_data request done successfully'
				: 'Warning! get_node_data request done with errors';


		return $response;
	}//end get_node_data



	/**
	* GET_CHILDREN_DATA
	* Returns a paginated list of rendered child nodes for the given parent.
	*
	* Two operational modes:
	*
	* 1. STANDARD (no $source->children supplied): instantiates a ts_object for
	*    the parent and delegates entirely to ts_object::get_children_data(),
	*    which applies pagination and returns a response object directly.
	*
	* 2. DIRECT LIST ($source->children supplied as an array of locators): calls
	*    ts_object::parse_child_data() on the pre-built list, then wraps the
	*    result with any pagination context passed by the caller. This path is
	*    used when the client already has a flat array of child locators
	*    (e.g. from a previous relationship fetch) and wants them rendered.
	*
	* The default hard limit before the "show more" button is displayed is 300
	* children. This limit is passed into ts_object::get_children_data() via
	* the options object; the caller can override it through $rqo->options->pagination.
	*
	* @param object $rqo - Request Query Object. Expected shape:
	*   {
	*     dd_api:        'dd_ts_api',
	*     prevent_lock:  true,
	*     action:        'get_children_data',
	*     source: {
	*       section_tipo:   string,         // parent node hierarchy tipo
	*       section_id:     string|int,     // parent node record id
	*       children_tipo:  string,         // component tipo that stores child links
	*       model:          string|null,    // area model; defaults to 'area_thesaurus'
	*       children:       array|null      // pre-built locator list [{
	*                                       //   type, section_id, section_tipo,
	*                                       //   from_component_tipo
	*                                       // }]; omit to trigger standard mode
	*     },
	*     options: {
	*       pagination: {
	*         limit:  number,               // page size (default 300)
	*         offset: number,               // zero-based start position
	*         total:  number                // total known children count
	*       },
	*       thesaurus_view_mode: string     // 'default'|'model'
	*     }
	*   }
	* @return object $response - result is stdClass{ar_children_data: array, pagination: object|null}
	*/
	public static function get_children_data(object $rqo) : object {
		// $start_time=start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// Input validation
			if (!isset($rqo->source)) {
				$response->errors[] = 'Missing source property in the request object.';
				$response->msg = 'Invalid request. Source data is missing.';
				return $response;
			}

		// short vars
			$source					= $rqo->source;
			$section_tipo			= $source->section_tipo ?? null;
			$section_id				= $source->section_id ?? null;
			$children_tipo			= $source->children_tipo ?? null;
			$area_model				= $source->model ?? 'area_thesaurus';
			$children				= $source->children ?? null;
			$options				= $rqo->options ?? new stdClass();
			$pagination				= $options->pagination ?? null;
			$thesaurus_view_mode	= $options->thesaurus_view_mode ?? 'default'; // string thesaurus_view_mode. Values: model|default

		// SEC: read permission required to view thesaurus children data
			if (!empty($section_tipo)) {
				security::assert_section_permission($section_tipo, 1, __METHOD__);
			}

		// ts_object_options. thesaurus_view_mode
			$ts_object_options = new stdClass();
				$ts_object_options->model = $thesaurus_view_mode==='model'
					? true
					: false; // get from URL as thesaurus_view_mode=model

		// limit. Default limit before pagination 'show_more' button is displayed
			$default_limit = 300;
			$current_pagination = $pagination;

		// children. Calculated from given locator.
		// Delegates to ts_object::get_children_data: single implementation of
		// the children + pagination logic (previously a literal copy here).
			if (empty($children) && $section_id && $children_tipo) {

				$ts_object = new ts_object(
					$section_id,
					$section_tipo,
					$ts_object_options
				);
				return $ts_object->get_children_data((object)[
					'children_tipo'		=> $children_tipo,
					'default_limit'		=> $default_limit,
					'area_model'		=> $area_model,
					'ts_object_options'	=> $ts_object_options,
					'pagination'		=> $current_pagination
				]);
			}//end if (empty($children))

		// parse_child_data. Direct children list received case.
		// Pass the parent (request section) so the order read is parent-aware
		// (dataframe entry paired to this parent) instead of array index 0.
			$parent_locator = (!empty($section_tipo) && !empty($section_id))
				? (object)['section_tipo'=>$section_tipo, 'section_id'=>$section_id]
				: null;
			$ar_children_data = ts_object::parse_child_data(
				$children,
				$area_model,
				$ts_object_options,
				$parent_locator
			);

		// build children_data result object
			$children_data = (object)[
				'ar_children_data'	=> $ar_children_data,
				'pagination'		=> $current_pagination ?? $pagination
			];

		// response
			$response->result	= $children_data;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			// if(SHOW_DEBUG===true) {
			// 	$debug = new stdClass();
			// 		$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
			// 	$response->debug = $debug;

			// 	// end line info
			// 		$text			= 'TRIGGER TS_OBJECT REQUEST '.$section_tipo.'_'.$section_id.' END';
			// 		$text_length	= strlen($text) +1;
			// 		$nchars			= 200;
			// 		$line			= $text .' '. str_repeat("<", $nchars - $text_length);
			// 		debug_log(__METHOD__ . ' '.$debug->exec_time.PHP_EOL . $line, logger::DEBUG);
			// }


		return $response;
	}//end get_children_data



	/**
	* ADD_CHILD
	* Creates a new empty thesaurus term as a child of the given parent node.
	*
	* The method runs all validation before touching the database, then
	* executes the full creation sequence inside a single DBi::transaction():
	*   1. Acquires an advisory lock on the parent node (serializes concurrent
	*      add_child / update_parent_data calls for the same parent).
	*   2. Creates the new section record (section::create_record).
	*   3. Saves the default value for the 'is_descriptor' component (mode 'edit'
	*      triggers auto-save of the ontology default).
	*   4. Saves the default value for the 'is_indexable' component.
	*   5. For ontology sections (get_section_id_from_tipo($section_tipo) === '0'),
	*      copies the TLD value from the parent to the new node via component 'ontology7'.
	*   6. Creates the component_relation_parent link pointing back to the parent.
	*
	* On any failure inside the transaction, DBi::transaction() rolls back and
	* this method:
	*   - Clears in-memory component/section_record caches (worker-mode safety).
	*   - Returns a $response->result === false with the error details.
	*
	* On success, invalidates the parent's ts_object node cache and returns
	* the new record's section_id as an integer in $response->result.
	*
	* @param object $rqo - Request Query Object. Expected shape:
	*   {
	*     action:       "add_child",
	*     dd_api:       "dd_ts_api",
	*     prevent_lock: true,
	*     source: {
	*       section_tipo: string,     // hierarchy tipo of the thesaurus section (e.g. 'ds1')
	*       section_id:   string|int  // parent node record id
	*     }
	*   }
	* @return object $response - result is (int) new section_id on success, false on failure
	*/
	public static function add_child(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// short vars
			$source			= $rqo->source;
			$section_tipo	= $source->section_tipo;
			$section_id		= $source->section_id;

		// SEC-10: check write permissions
			$permissions = common::get_permissions($section_tipo, $section_tipo);
			if ($permissions < 2) {
				$response->errors[] = 'insufficient permissions';
				$response->msg = "Error. Insufficient permissions to create in section ($section_tipo)";
				return $response;
			}

		// Validations. All checks that can abort the process run BEFORE creating
		// any record, so a failed precondition can never leave an orphan section.

			// section map
				$section_map = section::get_section_map( $section_tipo );

			// is_descriptor: check section_map property
				if (!isset($section_map->thesaurus->is_descriptor)) {
					debug_log(__METHOD__.
						" Invalid section_map 'is_descriptor' property from section:" . PHP_EOL
						.' section_tipo: ' . $section_tipo . PHP_EOL
						.' section_map: ' . to_string($section_map)
						, logger::DEBUG
					);
					$response->errors[] = 'Invalid section_map \'is_descriptor\' property from section';
				}

			// is_indexable: check section_map property
				if (!isset($section_map->thesaurus->is_indexable)) {
					debug_log(__METHOD__
						." Invalid section_map 'is_indexable' property from section." . PHP_EOL
						.' section_tipo: ' . $section_tipo . PHP_EOL
						.' section_map: ' . to_string($section_map)
						, logger::DEBUG
					);
					$response->errors[] = 'Invalid section_map \'is_indexable\' property from section';
				}

			// component_relation_parent tipo. Resolved before record creation: without
			// it the new record could never be linked into the tree.
				$ar_parent_tipo = section::get_ar_children_tipo_by_model_name_in_section($section_tipo, ['component_relation_parent'], true, true, true, true);
				$component_relation_parent_tipo = $ar_parent_tipo[0] ?? null;
				if (empty($component_relation_parent_tipo)) {
					$response->msg = 'Error on get component_relation_parent from section. Model does not exists';
					debug_log(__METHOD__.
						" $response->msg " . PHP_EOL
						.' section_tipo: ' . $section_tipo . PHP_EOL
						.' model: component_relation_parent' . PHP_EOL
						.' ar_parent_tipo: ' . to_string($ar_parent_tipo)
						, logger::ERROR
					);
					$response->errors[] = 'Invalid component_relation_parent from section: '.$section_tipo;
					return $response;
				}

		// Mutation. Record creation, default values and parent link run as one
		// transaction: any failure rolls back everything (no orphan sections).
		try {

			$new_section_id = DBi::transaction(function() use ($section_tipo, $section_id, $section_map, $component_relation_parent_tipo) {

				// Lock the parent node: serializes set_child_order counting against
				// concurrent add_child/update_parent_data on the same parent.
					if (matrix_db_manager::acquire_node_lock($section_tipo, $section_id)===false) {
						throw new RuntimeException('Unable to acquire parent node lock');
					}

				// new section. Create a new empty section
					$new_section = section::get_instance($section_tipo);
					$new_section_id = $new_section->create_record();
					if (empty($new_section_id)) {
						throw new RuntimeException('Failed create new section from parent');
					}

				// is_descriptor: set new section component 'is_descriptor' value
					if (isset($section_map->thesaurus->is_descriptor) && $section_map->thesaurus->is_descriptor!==false) {
						$component_tipo	= $section_map->thesaurus->is_descriptor;
						$model			= ontology_node::get_model_by_tipo($component_tipo,true);
						$component		= component_common::get_instance(
							$model,
							$component_tipo,
							$new_section_id,
							'edit', // note that mode edit autosave default value
							DEDALO_DATA_NOLAN,
							$section_tipo
						);
						$component->get_data();
						debug_log(__METHOD__
							." Saved default data to 'is_descriptor' " . PHP_EOL
							.' component_tipo: ' . $component_tipo . PHP_EOL
							.' model: ' . $model . PHP_EOL
							.' section_id: ' . to_string($new_section_id)
							, logger::DEBUG
						);
					}

				// is_indexable: set is_indexable default value
					if (isset($section_map->thesaurus->is_indexable) && $section_map->thesaurus->is_indexable!==false) {
						$component_tipo	= $section_map->thesaurus->is_indexable;
						$model			= ontology_node::get_model_by_tipo($component_tipo,true);
						$component		= component_common::get_instance(
							$model,
							$component_tipo,
							$new_section_id,
							'edit', // note that mode edit forces auto-save default value
							DEDALO_DATA_NOLAN,
							$section_tipo
						);
						$component->get_data();
						debug_log(__METHOD__
							." Saved default data to 'is_indexable' " . PHP_EOL
							.' component_tipo: ' . $component_tipo . PHP_EOL
							.' model: ' . $model . PHP_EOL
							.' section_id: ' . to_string($new_section_id)
							, logger::DEBUG
						);
					}

				// ontology TLD. It must inherit the TLD
					$is_ontology = get_section_id_from_tipo( $section_tipo ) === '0';
					if( $is_ontology ){
						$component_tipo	= 'ontology7'; // component_input_text TLD
						$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);

						$tld_source_component = component_common::get_instance(
							$model_name,
							$component_tipo,
							$section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tipo,
							false
						);
						$source_data = $tld_source_component->get_data();

						$tld_target_component = component_common::get_instance(
							$model_name,
							$component_tipo,
							$new_section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tipo,
							false
						);
						$tld_target_component->set_data( $source_data );
						if ($tld_target_component->save()===false) {
							throw new RuntimeException('Failed save TLD value to new section');
						}
					}

				// component_relation_parent
				// Is created in the new created record and the current section_id is added as parent
					$model_name = ontology_node::get_model_by_tipo($component_relation_parent_tipo, true);
					$component_relation_parent = component_common::get_instance(
						$model_name,
						$component_relation_parent_tipo,
						$new_section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo,
						false
					);

					// add
					$locator = new locator();
						$locator->set_section_tipo($section_tipo);
						$locator->set_section_id($section_id);
						$locator->set_from_component_tipo($component_relation_parent_tipo);
						$locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);

					$added = (bool)$component_relation_parent->add_parent( $locator );
					if ($added!==true) {
						throw new RuntimeException('Failed add parent locator to new section');
					}

					// Save relation parent data
					if ($component_relation_parent->save()===false) {
						throw new RuntimeException('Failed save relation parent data');
					}

				return $new_section_id;
			});

		} catch (Throwable $e) {

			// In-memory instance caches may hold state written before the rollback;
			// drop them so worker mode does not serve stale data.
			self::clear_instance_caches();

			$response->msg = 'Error on add_child. Process rolled back: ' . $e->getMessage();
			debug_log(__METHOD__
				." $response->msg " . PHP_EOL
				.' section_tipo: ' . $section_tipo . PHP_EOL
				.' section_id: ' . to_string($section_id)
				, logger::ERROR
			);
			$response->errors[] = 'add_child failed: ' . $e->getMessage();
			return $response;
		}

		// cache invalidation. New node changes the parent's children set
			ts_object::invalidate_node($section_tipo, $section_id);

		// All is OK. Result is new created section section_id
			$response->result	= (int)$new_section_id;
			$response->msg		= empty($response->errors)
				? 'OK. Added child successfully'
				: 'Warning! Added child with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end add_child



	/**
	* UPDATE_PARENT_DATA
	* Moves a thesaurus node from its current parent to a new parent.
	*
	* Used by the drag-and-drop reordering in area_thesaurus when the user
	* drops a term onto a different branch. The method:
	*   1. Verifies write permission (level 2) on the moved node's section.
	*   2. Resolves the component_relation_parent tipo for that section.
	*   3. Guards against self-reference and descendant cycles: a node cannot
	*      be moved under itself or under any of its own descendants. The check
	*      calls component_relation_parent::is_ancestor() BEFORE any mutation.
	*   4. Runs the actual mutation inside a DBi::transaction():
	*      a. Acquires advisory locks on BOTH old and new parent nodes in a
	*         deterministic (sorted) order to prevent deadlocks.
	*      b. Removes the old parent locator from the component_relation_parent.
	*      c. Adds the new parent locator.
	*      d. Saves the updated component_relation_parent data.
	*      e. Recalculates sibling order values for the old parent (the new
	*         parent order is set by add_parent's set_child_order).
	*   5. Invalidates ts_object node caches for the moved node and both parents.
	*
	* On any failure inside the transaction the whole operation is rolled back.
	* In-memory instance caches are cleared before returning the error response
	* to prevent stale data from being served in worker mode.
	*
	* @param object $rqo - Request Query Object. Expected shape:
	*   {
	*     dd_api:           'dd_ts_api',
	*     prevent_lock:     true,
	*     action:           'update_parent_data',
	*     source: {
	*       section_id:               string|int,  // record id of the node being moved
	*       section_tipo:             string,      // hierarchy tipo of the node
	*       old_parent_section_id:    string|int,  // current parent record id
	*       old_parent_section_tipo:  string,      // current parent hierarchy tipo
	*       new_parent_section_id:    string|int,  // target parent record id
	*       new_parent_section_tipo:  string,      // target parent hierarchy tipo
	*       tipo:                     string       // children component tipo (informational)
	*     }
	*   }
	* @return object $response - result is true on success, false on failure
	*/
	public static function update_parent_data(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// short vars
			$source						= $rqo->source;
			$section_tipo				= $source->section_tipo;
			$section_id					= $source->section_id;
			$old_parent_section_id		= $source->old_parent_section_id;
			$old_parent_section_tipo	= $source->old_parent_section_tipo;
			$new_parent_section_id		= $source->new_parent_section_id;
			$new_parent_section_tipo	= $source->new_parent_section_tipo;

		// SEC-11: check write permissions
			$permissions = common::get_permissions($section_tipo, $section_tipo);
			if ($permissions < 2) {
				$response->errors[] = 'insufficient permissions';
				$response->msg = "Error. Insufficient permissions to update in section ($section_tipo)";
				return $response;
			}

		// Validations. All checks that can abort the process run BEFORE mutating.

			// component_relation_parent tipo
				$ar_parent_tipo	= section::get_ar_children_tipo_by_model_name_in_section($section_tipo, ['component_relation_parent'], true, true, true, true);
				$parent_tipo	= $ar_parent_tipo[0] ?? null;
				if (empty($parent_tipo)) {
					$response->errors[] = 'invalid component_relation_parent';
					$response->msg = "Error. Unable to resolve component_relation_parent from section ($section_tipo)";
					return $response;
				}

			// descendant cycle guard. The node cannot be moved under itself or
			// under its own descendant. Checked here (besides add_parent) to give
			// the client a clean, distinct error before any mutation.
				$is_self_target = ($new_parent_section_tipo===$section_tipo && (int)$new_parent_section_id===(int)$section_id);
				if ($is_self_target || true===component_relation_parent::is_ancestor($section_tipo, $section_id, $new_parent_section_tipo, (int)$new_parent_section_id)) {
					$response->errors[] = 'cycle';
					$response->msg = 'Error. The node cannot be moved under itself or under its own descendant';
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' section_tipo: ' . $section_tipo . PHP_EOL
						. ' section_id: ' . to_string($section_id) . PHP_EOL
						. ' new_parent_section_tipo: ' . $new_parent_section_tipo . PHP_EOL
						. ' new_parent_section_id: ' . to_string($new_parent_section_id)
						, logger::ERROR
					);
					return $response;
				}

			// component_relation_parent instance
				$model_name	= ontology_node::get_model_by_tipo($parent_tipo,true);
				$lang		= DEDALO_DATA_NOLAN;
				$component_relation_parent = component_common::get_instance(
					$model_name,
					$parent_tipo,
					$section_id,
					'list',
					$lang,
					$section_tipo
				);

		// Mutation. Remove old parent, add new parent, save and recalculate orders
		// as one transaction: a failure mid-way can no longer orphan the node.
		try {

			DBi::transaction(function() use ($component_relation_parent, $parent_tipo, $old_parent_section_tipo, $old_parent_section_id, $new_parent_section_tipo, $new_parent_section_id) {

				// Lock both parent nodes (deterministic order to avoid deadlocks):
				// serializes child order counting against concurrent mutations.
					$lock_keys = [
						[$old_parent_section_tipo, (int)$old_parent_section_id],
						[$new_parent_section_tipo, (int)$new_parent_section_id]
					];
					usort($lock_keys, function($a, $b) {
						return strcmp($a[0].'_'.$a[1], $b[0].'_'.$b[1]);
					});
					foreach ($lock_keys as $lock_key) {
						if (matrix_db_manager::acquire_node_lock($lock_key[0], $lock_key[1])===false) {
							throw new RuntimeException('Unable to acquire parent node lock: ' . $lock_key[0] .'_'. $lock_key[1]);
						}
					}

				// remove old parent
					$locator = new locator();
						$locator->set_section_tipo($old_parent_section_tipo);
						$locator->set_section_id($old_parent_section_id);
						$locator->set_from_component_tipo($parent_tipo);
						$locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);
					$result = $component_relation_parent->remove_parent($locator);
					if (!$result) {
						throw new RuntimeException('Remove old parent locator failed: ' . to_string($locator));
					}
					debug_log(__METHOD__
						. " Removed old locator from data " . PHP_EOL
						. ' locator: ' . to_string($locator)
						, logger::DEBUG
					);

				// add new parent
					$locator = new locator();
						$locator->set_section_tipo($new_parent_section_tipo);
						$locator->set_section_id($new_parent_section_id);
						$locator->set_from_component_tipo($parent_tipo);
						$locator->set_type(DEDALO_RELATION_TYPE_PARENT_TIPO);
					$result = $component_relation_parent->add_parent($locator);
					if (!$result) {
						throw new RuntimeException('Add new parent locator failed: ' . to_string($locator));
					}
					debug_log(__METHOD__
						. " Added new locator to data " . PHP_EOL
						. ' locator: ' . to_string($locator)
						, logger::DEBUG
					);

				// save
					$save_result = $component_relation_parent->save();
					if ($save_result===false) {
						throw new RuntimeException('Save parent relation data failed');
					}

				// Recalculate the order of the siblings
					$component_relation_parent->recalculate_sibling_orders($old_parent_section_tipo, (int)$old_parent_section_id);
			});

		} catch (Throwable $e) {

			// In-memory instance caches may hold state written before the rollback;
			// drop them so worker mode does not serve stale data.
			self::clear_instance_caches();

			$response->msg = 'Error. Update parent data failed and was rolled back: ' . $e->getMessage();
			debug_log(__METHOD__
				. " $response->msg " . PHP_EOL
				. ' section_tipo: ' . $section_tipo . PHP_EOL
				. ' section_id: ' . to_string($section_id)
				, logger::ERROR
			);
			$response->errors[] = 'update_parent_data failed: ' . $e->getMessage();
			return $response;
		}

		// cache invalidation. Moved node and both parents changed
			ts_object::invalidate_node($section_tipo, $section_id);
			ts_object::invalidate_node($old_parent_section_tipo, $old_parent_section_id);
			ts_object::invalidate_node($new_parent_section_tipo, $new_parent_section_id);

		// response
			$response->result	= true;
			$response->msg		= empty($response->errors)
				? 'OK. Parent data updated successfully'
				: 'Warning! Parent data updated with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit($start_time,'ms').' ms';
					// $debug->remove_parent_references	= $relation_response;
					// $debug->added						= $added;

				$response->debug = $debug;
			}


		return $response;
	}//end update_parent_data



	/**
	* SAVE_ORDER
	* Persists a user-defined sibling ordering for the children of a parent node.
	*
	* Called when the user reorders terms inside a parent in the area_thesaurus
	* UI. The client sends the full ordered array of child locators; this method
	* delegates to component_relation_children::sort_children() which assigns
	* sequential order values to each child's record.
	*
	* The entire save runs inside a DBi::transaction() that first acquires an
	* advisory lock on the parent node, ensuring a concurrent add_child or
	* update_parent_data cannot interleave order updates mid-transaction.
	*
	* $response->result on success is the array returned by sort_children()
	* (the set of changed order values). When sort_children() returns false it
	* means the section map does not define an order component; $response->msg
	* carries the actionable hint in that case.
	*
	* After the transaction commits, ontology::sync_order_to_dd_ontology() mirrors
	* the new per-parent order into the dd_ontology table so the navigation menu
	* (which orders siblings by dd_ontology.order_number) stays consistent with the
	* tree. This is a separate surface from the area_thesaurus tree itself, whose
	* order is read live from the matrix order component (see ts_object::parse_child_data).
	*
	* Requires parent_section_tipo and parent_section_id in $rqo->source;
	* the method returns an error early if they are absent.
	*
	* @param object $rqo - Request Query Object. Expected shape:
	*   {
	*     dd_api:           'dd_ts_api',
	*     prevent_lock:     true,
	*     action:           'save_order',
	*     source: {
	*       section_tipo:        string,    // hierarchy tipo whose children are being sorted
	*       ar_locators:         array,     // ordered array of child locators
	*       parent_section_tipo: string,    // parent node hierarchy tipo (lock target)
	*       parent_section_id:   string|int // parent node record id (lock target)
	*     }
	*   }
	* @return object $response - result is array (changed order values) or false on failure
	*/
	public static function save_order(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// short vars
			$source				= $rqo->source;
			$section_tipo		= $source->section_tipo;
			$ar_locators		= $source->ar_locators;
			$parent_section_tipo= $source->parent_section_tipo ?? null;
			$parent_section_id	= $source->parent_section_id ?? null;

		// SEC-12: check write permissions
			$permissions = common::get_permissions($section_tipo, $section_tipo);
			if ($permissions < 2) {
				$response->errors[] = 'insufficient permissions';
				$response->msg = "Error. Insufficient permissions to update order in section ($section_tipo)";
				return $response;
			}

		// validate parent context
			if (empty($parent_section_tipo) || empty($parent_section_id)) {
				$response->msg = 'Error. parent_section_tipo and parent_section_id are required';
				$response->errors[] = 'missing parent context';
				return $response;
			}

		// sort. All per-child order saves run as one transaction holding the
		// parent node lock, so a concurrent move/reorder cannot interleave.
			try {

				$result = DBi::transaction(function() use ($section_tipo, $ar_locators, $parent_section_tipo, $parent_section_id) {

					if (matrix_db_manager::acquire_node_lock($parent_section_tipo, (int)$parent_section_id)===false) {
						throw new RuntimeException('Unable to acquire parent node lock');
					}

					return component_relation_children::sort_children(
						$section_tipo,
						$ar_locators,
						$parent_section_tipo,
						(int)$parent_section_id
					);
				});

			} catch (Throwable $e) {

				// In-memory instance caches may hold state written before the rollback;
				// drop them so worker mode does not serve stale data.
				self::clear_instance_caches();

				$response->msg = 'Error. Save order failed and was rolled back: ' . $e->getMessage();
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' section_tipo: ' . $section_tipo . PHP_EOL
					. ' parent: ' . $parent_section_tipo . '_' . to_string($parent_section_id)
					, logger::ERROR
				);
				$response->errors[] = 'save_order failed: ' . $e->getMessage();
				return $response;
			}

		// cache invalidation. Sibling order under this parent changed
			if ($result!==false) {
				ts_object::invalidate_node($parent_section_tipo, $parent_section_id);
				// sync dd_ontology.order_number so the ontology menu reflects the new order on reload
				ontology::sync_order_to_dd_ontology($result, $parent_section_tipo, (int)$parent_section_id);
			}

		// response
			$response->msg = $result===false
				? 'Error. The order cannot be established. Invalid section map. Please, define a valid section list map such as {"order":"hierarchy49"}'
				: 'OK. Order saved successfully. Changed values: ' . count($result);
			$response->result = $result;

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end save_order



	/**
	* CLEAR_INSTANCE_CACHES
	* Drops the in-memory component and section_record instance caches.
	* Called after a transaction rollback: cached instances may hold data
	* written before the rollback and, in worker mode, would otherwise be
	* served as current state on subsequent requests.
	* @return void
	*/
	private static function clear_instance_caches() : void {

		component_instances_cache::clear();
		section_record_instances_cache::clear();
	}//end clear_instance_caches



}//end dd_ts_api
