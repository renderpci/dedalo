<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PORTAL
* User-facing portal component that links host-section records to target-section records
* via an editable, sortable list of locators.
*
* Responsibilities
* ----------------
* - Persists many-to-many relationships as locator arrays in the 'relation' JSONB matrix
*   column, using DEDALO_RELATION_TYPE_LINK ('dd151') as the canonical relation type.
* - Renders linked records in list/edit/indexation views, driven by a ddo_map that
*   controls which fields from the target section are displayed and in what order.
* - Supports autocomplete (via component_relation_common infrastructure) for finding and
*   linking records across arbitrary target sections configured in the ontology properties.
* - Delegates external/computed data (inverse portals) to set_data_external(); in that
*   mode the locators are calculated from back-references rather than stored directly.
* - Overrides get_sortable() to always return true, enabling drag-to-reorder in edit mode.
* - Overrides get_order_path() to build the full column-sort path descriptor for list views,
*   including an optional parent-portal step and the first ddo_map component as the sort
*   leaf, with a special short-circuit for the time-machine user_id column (dd578).
*
* Data shape
* ----------
* Stored as a JSON array of locator objects in the 'relation' column:
*   [{ section_tipo, section_id, type, from_component_tipo }, …]
* The 'type' field is always DEDALO_RELATION_TYPE_LINK ('dd151').
* Duplicate detection compares section_tipo + section_id + type + from_component_tipo.
*
* External mode (properties->source->mode === 'external')
* --------------------------------------------------------
* When configured as external, the portal's locators are computed by set_data_external()
* from inverse back-references.  regenerate_component() handles forced refresh for this
* mode; for normal portals the method is a no-op (data must be managed via the relations
* table tool, not by resaving the component independently).
*
* Inheritance and composition
* ---------------------------
* Extends component_relation_common, which provides the locator lifecycle (add, remove,
* validate, normalise, dedup), the grid/export value resolvers, diffusion support, and
* the inverse-reference search (set_data_external).
* Extended by no class currently known in the codebase.
* The component_portal_json.php controller handles the JSON API response for this component.
*
* @package Dédalo
* @subpackage Core
*/
class component_portal extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Canonical relation type assigned to every locator created by this portal.
		 * Overrides the parent's null default with DEDALO_RELATION_TYPE_LINK ('dd151'),
		 * meaning portal links are always stored with type 'dd151' unless the ontology
		 * properties explicitly configure a different config_relation->relation_type.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Property set used by validate_data_element duplicate detection for this class.
		 * Overrides the parent's broader set: a locator is considered a duplicate when
		 * all four of these keys match an existing entry in the component dato.
		 * - section_tipo         : target section type
		 * - section_id           : target record id within that section
		 * - type                 : relation type (normally DEDALO_RELATION_TYPE_LINK)
		 * - from_component_tipo  : the portal component tipo that created the link
		 * This means two locators pointing at the same record from the same portal are
		 * rejected as duplicates even when stored in different lang slots.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

		/**
		 * List of section tipos this portal is allowed to link to.
		 * Populated lazily from get_ar_target_section_tipo() which reads the ontology
		 * request_config source definitions.  An empty array means no restriction
		 * (all sections are valid targets).  Supports both real and virtual sections.
		 * Overrides the parent property to ensure the portal's own target list is
		 * maintained independently of the parent class.
		 * @var array $ar_target_section_tipo
		 */
		protected array $ar_target_section_tipo = [];



	/**
	* REGENERATE_COMPONENT
	* Handles the regenerate lifecycle hook for this portal.
	*
	* Normal (non-external) portals: data is owned by the user and managed through the
	* relations table; resaving the component independently is meaningless and would
	* overwrite the live locator array with a potentially stale snapshot.  Therefore the
	* method loads current data (to prevent accidental erasure) and then exits without
	* saving.  The comment-disabled $this->Save() on line ~99 is intentionally left in
	* place as a reminder that saving here would be wrong.
	*
	* External portals (properties->source->mode === 'external'): the locator array is
	* computed from inverse back-references each time, so a full recalculation via
	* set_data_external() is correct.  The method calls set_data_external() with
	* save=true and references_limit=0 (to collect all references for correct sorting),
	* then returns immediately.
	*
	* (!) Do NOT use this method to regenerate normal portal data.  Use
	*     tool_update_cache or generate_relations_table_data instead.
	*
	* @see class.tool_update_cache.php
	* @return bool  Always true.
	*/
	public function regenerate_component() : bool {

		// External case (inverse portals with data dependency), calculate his data again.
		$properties = $this->get_properties() ?? new stdClass();
		if(isset($properties->source->mode) && $properties->source->mode==='external'){
			$options = new stdClass();
				$options->save				= true; // $mode==='edit' ? true : false;
				$options->changed			= false; // $mode==='edit' ? true : false;
				$options->current_data		= false; // $this->get_data();
				$options->references_limit	= 0; // (!) Set to zero to get all references to enable sort

			$this->set_data_external($options);	// Forces update data with calculated external data

			return true;
		}

		// Force loads data always !IMPORTANT
		$data = $this->get_data();

		debug_log(__METHOD__
			." Ignored regenerate action in this component. USE generate_relations_table_data TO REGENERATE RELATIONS ". PHP_EOL
			.' tipo: '.$this->tipo
			, logger::WARNING
		);

		if(empty($data)) {
			return true;
		}

		// Save component data
			 // $this->Save();


		return true;
	}//end regenerate_component



	/**
	* REMOVE_ELEMENT
	* Removes a linked record from this portal's locator list, with an optional
	* hard-delete of the target section record itself.
	*
	* Two removal modes (supplied in $options->remove_mode):
	*
	* 'delete_link' (default)
	*   Removes only the locator from this portal's dato.  The target section
	*   record is left intact.  Useful for unlinking without destroying data.
	*
	* 'delete_all'
	*   Removes the locator AND permanently deletes the target section record by
	*   calling section::Delete('delete_record') on it.  Only proceeds if the caller
	*   has write/delete permission (level ≥ 2) on the target section tipo; otherwise
	*   the operation is aborted and an error message is returned.
	*   (!) This is a destructive, irreversible action.
	*
	* Sequence:
	*   1. remove_locator()              — remove the locator from the component dato.
	*   2. section->Delete() (optional)  — hard-delete the target record.
	*   3. remove_state_from_locator()   — propagate state removal to this section
	*      and its parents.
	*   4. $this->Save()                 — persist the updated locator list.
	*
	* (!) remove_locator() and remove_state_from_locator() called on $this are not
	*     found in the component_portal or component_relation_common class hierarchy
	*     at the time of this documentation.  This may indicate dead/unreachable code,
	*     a missing mixin, or a runtime-injected method.  See flags.
	*
	* @param object $options  {
	*   locator    : object   — the locator to remove (requires section_id, section_tipo).
	*   remove_mode: string   — 'delete_link' (default) | 'delete_all'.
	* }
	* @return object $response  {
	*   result      : bool,
	*   msg         : string,
	*   remove_mode : string  (present on success)
	* }
	*/
	public function remove_element( object $options ) : object {

		// options
			$locator		= $options->locator ?? null;
			$remove_mode	= $options->remove_mode ?? 'delete_link'; // delete_link | delete_all (deletes link and resource)

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// Remove locator from data
			$result = $this->remove_locator( $locator );
			if ($result!==true) {
				$response->msg .= " Error on remove locator. Skipped action ";
				return $response;
			}

		// Remove target record
			if ($remove_mode==='delete_all') {

				// REL-06: delete_all hard-deletes the TARGET section record, which is a
				// different section from the host portal. Require delete-level permission
				// on the target itself — permission on the host record is not sufficient.
				$target_perms = common::get_permissions($locator->section_tipo, $locator->section_tipo);
				if ($target_perms < 2) { // 1=read, 2=write/delete, 3=admin
					$response->msg .= " Insufficient permissions to delete target section ($locator->section_tipo)";
					return $response;
				}

				$section = section::get_instance(
					$locator->section_id, // string section_id
					$locator->section_tipo // string section_tipo
				);
				$delete  = $section->Delete(
					'delete_record' // string delete_mode
				);
				if ($delete!==true) {
					$response->msg .= " Error on remove target section ($locator->section_tipo - $locator->section_id). Skipped action ";
					return $response;
				}
			}

		// Update state
		// DELETE AND UPDATE the component state of this section and his parents
			$this->remove_state_from_locator( $locator );

		// Save current component updated data
			$this->Save();

		// response
			$response->result		= true;
			$response->remove_mode	= $remove_mode;
			$response->msg			= 'OK. Request done '.__METHOD__;


		return $response;
	}//end remove_element



	/**
	* UPDATE_DATA_VERSION
	* Lifecycle hook invoked by area_maintenance / tool_update_cache when the
	* platform data version changes and component data may need to be migrated.
	*
	* The method receives the target version as an array that is imploded to a
	* dotted string and dispatched through a switch.  Each case implements the
	* migration logic for that specific version bump.
	*
	* This portal class currently has no version-specific migrations: the default
	* switch arm returns result=0 ('no update implemented for this version'),
	* which signals the maintenance tool to skip this component.
	*
	* Result codes:
	*   0 — Component does not implement an update for this version (skipped).
	*   1 — Update was applied successfully.
	*   2 — Update was attempted but data did not require a change.
	*
	* @see update::components_update
	* @param object $options  {
	*   update_version : array    — version tuple, e.g. [7, 1, 0].
	*   data_unchanged : mixed    — original unmodified data snapshot.
	*   reference_id   : string|int — record id being updated.
	*   tipo           : string   — component tipo.
	*   section_id     : string|int — host section record id.
	*   section_tipo   : string   — host section tipo.
	*   context        : string   — caller context (default 'update_component_data').
	* }
	* @return object $response  { result: int, msg: string }
	*/
	public static function update_data_version( object $options ) : object {

		// options
			$update_version	= $options->update_version ?? null;
			$data_unchanged	= $options->data_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_data';

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_data_version



	/**
	* GET_SORTABLE
	* Declares that this portal's locator list is user-sortable (drag-to-reorder).
	* Overrides the parent component_common implementation, which applies additional
	* guards for time-machine columns and other edge cases.
	* Portal locators are always sortable because user-defined order is a first-class
	* feature of the portal component (stored as positional array order in the dato).
	* @return bool  Always true.
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Builds the full column-sort path descriptor for this portal in list-view contexts.
	* The path is consumed by the search layer to construct an ORDER BY clause that
	* traverses from the host section, through the portal relation, into the target
	* section component that holds the sort value.
	*
	* Path construction steps:
	*   1. Early return (empty array) when request_config is not set: context-simple
	*      mode does not need sort paths; an empty path is a safe no-op for the caller.
	*   2. Optional parent step: when from_section_tipo differs from section_tipo this
	*      component is a sub-column of another portal.  The parent portal's component
	*      object is prepended so the sort traverses outer-portal → inner-portal → field.
	*   3. Self step: the portal's own tipo/section_tipo is appended.
	*   4. Time-machine short-circuit: if this portal's tipo is the special
	*      DEDALO_TIME_MACHINE_COLUMN_USER_ID constant ('dd578'), a literal 'column'
	*      property is injected on path[0] and the path is returned immediately, bypassing
	*      ddo_map resolution (the TM user column maps directly to a DB column, not a
	*      JSONB path).
	*   5. ddo_map leaf: the first item of the ddo_map for the 'dedalo' api_engine entry
	*      in request_config is appended as the sort leaf (the field whose value the user
	*      sorts by).  If the entry has no ddo_map[0], a WARNING is logged (missing
	*      permissions or misconfigured ontology) but the path is still returned without
	*      the leaf rather than throwing.
	*
	* section_tipo normalisation: some autocomplete/portal ddos carry an array of
	* section tipos; only the first is used in the path object (actual search filtering
	* is not scoped to section_tipo at the ORDER BY level).
	*
	* Overrides component_common::get_order_path() which uses search::get_query_path()
	* and a static cache.  This portal override recomputes dynamically from request_config
	* and does not use the common cache, because the portal's sort leaf depends on the
	* per-instance request_config that may vary by caller.
	*
	* @param string $component_tipo  Tipo of the component being sorted (usually $this->tipo).
	* @param string $section_tipo    Host section tipo for the sort traversal.
	* @return array  Ordered array of path-step objects, each with keys:
	*   component_tipo (string), model (string), name (string), section_tipo (string).
	*   May include a 'column' key on the first element for TM user_id short-circuit.
	*/
	public function get_order_path( string $component_tipo, string $section_tipo ) : array {

		$path = [];

		// no request_config case. @see common::get_section_elements_context
		// sometimes, request_config is not calculated for speed (context simple case)
		// in those cases, order_path is not important and could be ignored
			if (!isset($this->request_config)) {
				return $path;
			}


		// from_section_tipo. If exists and is distinct to section_tipo, build and prepend the caller item
			if (isset($this->from_section_tipo) && $this->from_section_tipo!==$section_tipo) {
				$path[] = (object)[
					'component_tipo'	=> $this->from_component_tipo,
					'model'				=> ontology_node::get_model_by_tipo($this->from_component_tipo,true),
					'name'				=> ontology_node::get_term_by_tipo($this->from_component_tipo),
					'section_tipo'		=> $this->from_section_tipo
				];
			}

		// self component path
			$path[] = (object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> ontology_node::get_model_by_tipo($component_tipo,true),
				'name'				=> ontology_node::get_term_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			];

		// time machine cases. Do not resolve ddo_map. Tipo 'dd578' is column `user_id`
			if($this->tipo===DEDALO_TIME_MACHINE_COLUMN_USER_ID) {
				// When `column` property is set, it will be used literally instead of parsing the path.
				$path[0]->column = 'user_id';
				return $path;
			}

		// ddo_map. request_config show ddo_map first item is used to sort
		// must be calculated previously by the get_structure_context method
			$request_config			= $this->request_config ?? [];
			$request_config_item	= array_find($request_config, function($el){
				return $el->api_engine==='dedalo';
			});
			// non defined case
			if (empty($request_config_item) && !empty($request_config)) {
				// select first
				$request_config_first_item = reset($request_config);
				if (isset($request_config_first_item->api_engine) && $request_config_first_item->api_engine!=='dedalo') {
					// nothing to do
				}else{
					// set first item as default if no definition exists of api_engine
					$request_config_item = $request_config_first_item;
				}
			}
			$show = $request_config_item->show ?? null;
			if (empty($show)) {

				debug_log(__METHOD__.
					" Ignored empty request_config_item->show (mode:$this->mode) [$this->section_tipo - $this->tipo - "
					. ontology_node::get_term_by_tipo($this->tipo) ."]". PHP_EOL
					. 'request_config: ' . PHP_EOL
					. json_handler::encode($request_config)
					, logger::ERROR
				);

			}else{

				$first_item	= $show->ddo_map[0] ?? null;

				if (empty($first_item)) {
					debug_log(__METHOD__.
						" Ignored show empty first_item (mode:$this->mode) [$this->section_tipo - $this->tipo - ".
						ontology_node::get_term_by_tipo($this->tipo).
						"]. It may be due to a lack of permissions.",
						logger::WARNING
					);
					// dump($show, ' show empty first_item ++++++++ '.to_string($this->tipo));
				}else{
					// target component
					$tmp_section_tipo = $first_item->section_tipo;
					$path[] = (object)[
						'component_tipo'	=> $first_item->tipo,
						'model'				=> ontology_node::get_model_by_tipo($first_item->tipo,true),
						'name'				=> ontology_node::get_term_by_tipo($first_item->tipo),
						// note that section_tipo is used only to give a name to the join item.
						// results are not really filtered by this section_tipo
						'section_tipo'		=> is_array($tmp_section_tipo)
							? reset($tmp_section_tipo)
							: $tmp_section_tipo
					];
				}
			}


		return $path;
	}//end get_order_path



}//end class component_portal
