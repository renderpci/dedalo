<?php declare(strict_types=1);
/**
* CLASS COMPONENT_DATAFRAME
* Auxiliary relation component that attaches per-item frame records to individual
* data items of a main component, implementing Dédalo's statement-qualification
* model (analogous to Wikidata qualifiers and references).
*
* Purpose and design
* ------------------
* A single "slot" instance of this class (identified by its ontology tipo, e.g. 'dd560')
* lives in the same section as its main component and stores ALL pairing locators for
* that section record in the shared `relations` JSONB matrix column.  Each pairing
* locator (type = DEDALO_RELATION_TYPE_DATAFRAME = 'dd490') ties ONE frame target record
* (another section, e.g. a certainty record or a source footnote) to exactly ONE main
* data item via a stable, server-minted item `id` counter called `id_key`.
*
* Key contracts
* -------------
* - Pairing predicate (defined in trait.dataframe_common::dataframe_entry_matches):
*     type === 'dd490'  AND  from_component_tipo === slot tipo
*     AND  main_component_tipo === main component tipo  AND  id_key === item id
* - The pairing key is `id_key`: order-independent, immutable, survives reordering
*   of both main data items and frame locators.
* - All reads/writes are caller-aware: get_data() and set_data() filter/merge
*   against the caller_dataframe DTO (a dataframe_caller instance injected at
*   construction time) so that operations on one frame never affect sibling frames
*   of other items sharing the same slot.
* - Writes are delegated to parent::set_data() which persists to the section's
*   `relations` JSONB column through the standard component_portal → component_relation_common
*   persistence path.
*
* Legacy data
* -----------
* Data written before the v7 unification used `section_id_key` / `section_tipo_key`
* instead of `type` + `id_key`.  Dual-read has been removed: readers recognise only
* `type` + `id_key`, so the dataframe_v7_migration update must rewrite matrix data.
* Legacy shapes survive only in the old-CSV import and the v6→v7 update.
*
* Relationships
* -------------
* - Extends component_portal (→ component_relation_common → component_common).
* - Uses trait dataframe_common (mixed into component_common) for static helpers
*   is_dataframe_entry() and dataframe_entry_matches().
* - The typed caller DTO is dataframe_caller (core/common/class.dataframe_caller.php).
* - Frame target records live in ontology-defined sections referenced by the slot's
*   portal request_config sqo.section_tipo.
* - Diffusion entry point: get_diffusion_data() (defined here) + the main component
*   fn get_diffusion_data_with_dataframe() (defined in trait.dataframe_common).
*
* See also
* --------
* - docs/core/components/component_dataframe.md — full data model, pairing contract,
*   lifecycle, ontology wiring, import/export, diffusion, and maintenance.
* - core/common/class.dataframe_caller.php — typed caller DTO.
* - core/component_common/trait.dataframe_common.php — shared static predicates and
*   helpers used by both main components and this class.
*
* @package Dédalo
* @subpackage Core
*/
class component_dataframe extends component_portal {



	/**
	* Set of locator properties compared by validate_data_element() to detect duplicates
	* when adding a new frame pairing locator to the slot's data.
	*
	* The unified contract (post-migration) identifies a frame entry by:
	*   - type              : must be DEDALO_RELATION_TYPE_DATAFRAME ('dd490')
	*   - section_id        : target record id within the frame section
	*   - section_tipo      : frame target section tipo
	*   - from_component_tipo : the dataframe slot tipo
	*   - id_key            : the main component item id being extended (unified)
	*   - main_component_tipo : the main component tipo
	*
	* Legacy section_id_key / section_tipo_key are no longer read here (dual-read
	* removed); they survive only in the old-CSV import and the v6→v7 update.
	* This property set lets the dedup gate match the unified locator shape.
	* @var array $test_equal_properties
	*/
	public array $test_equal_properties = ['type','section_id','section_tipo','from_component_tipo','id_key','main_component_tipo'];



	/**
	* GET_DATA
	* Returns the frame pairing locators for the current caller context (the one
	* item of the main component this instance was constructed for), filtering
	* the full slot data down to just the entries that match the caller_dataframe
	* pairing predicate.
	*
	* Without a caller_dataframe (e.g. in search mode) the full, unfiltered slot
	* data is returned and a WARNING is logged — the component must normally be
	* constructed with a caller context in all non-search modes.
	*
	* The match predicate (trait.dataframe_common::dataframe_entry_matches) checks
	* four fields: type, from_component_tipo, main_component_tipo, and id_key.
	*
	* @return ?array - array of frame pairing locators matching this caller, or
	*                  the raw slot data when no caller_dataframe is set, or null
	*/
	public function get_data() : ?array {

		$data				= parent::get_data();
		$caller_dataframe	= $this->get_caller_dataframe();

		if(!isset($caller_dataframe)){
			debug_log(__METHOD__
				." empty caller dataframe getting all component data "
				, logger::WARNING
			);
			return $data;
		}

		// filtered data
		// iterate relations filtering match values with the central predicate
		// (unified contract: id_key)
		$filtered_data = [];
		if (!empty($data)) {
			foreach ($data as $locator) {
				if( self::dataframe_entry_matches($locator, $caller_dataframe, $this->tipo) ) {
					$filtered_data[] = $locator;
				}
			}
		}

		return $filtered_data;
	}//end get_data



	/**
	* GET_DATA_UNFILTERED
	* Returns the raw, unfiltered slot data — every frame pairing locator in the
	* section record's `relations` container that belongs to this component tipo,
	* regardless of which main item's id_key they target.
	*
	* Used internally by set_data() and remove_locator_from_data() to read the
	* "siblings" (entries belonging to other items sharing this slot) before
	* computing the merge/remove result, and by get_diffusion_data() which must
	* enumerate all frames in the slot to scope them against a ddo parent.
	*
	* Also useful for maintenance routines that operate on the full slot without
	* a specific caller context (e.g. empty_full_data_associated_to_main_component,
	* the dataframe_control widget).
	* @return ?array - every locator stored for this slot, unfiltered, or null
	*/
	public function get_data_unfiltered() {
		return parent::get_data();
	}



	/**
	* SET_DATA
	* Caller-aware write that replaces only the paired subset of the slot's data
	* for this instance's caller context, while preserving sibling frames belonging
	* to other main items sharing the same slot.
	*
	* Why the merge is necessary
	* --------------------------
	* A single slot tipo stores frame pairing locators for ALL items of the main
	* component in the same section record.  A naive parent::set_data($data) call
	* would overwrite every locator in the slot — including frames owned by
	* different items.  This is especially dangerous when set_data(null) is
	* called by the remove cascade on one item: without the merge, every other
	* item's frames would be silently erased.
	*
	* Merge algorithm
	* ---------------
	* 1. Read the full (unfiltered) slot data.
	* 2. Separate "siblings" — entries NOT matching this caller context — which
	*    must be unconditionally preserved.
	* 3. Remove from $data any entry already present as a sibling (signature-based
	*    dedup via json_encode) to avoid double-writing when callers pass the full
	*    slot array rather than only the caller's subset.
	* 4. Merge siblings + caller-specific additions into the final payload.
	* 5. Normalise an empty result to null before delegating to parent::set_data.
	*
	* When no caller_dataframe is set (search mode, maintenance), $data is passed
	* through to parent::set_data unchanged — no merge is performed.
	*
	* @param array|null $data - the new frame pairing locators for this caller context
	* @return bool - true on successful persistence
	*/
	public function set_data( ?array $data ) : bool {

		$caller_dataframe = $this->get_caller_dataframe();

		if (isset($caller_dataframe)) {

			// siblings: every entry NOT paired with this caller context
			$full_data = $this->get_data_unfiltered() ?? [];
			$others = array_values(array_filter($full_data, function($el) use ($caller_dataframe) {
				return !self::dataframe_entry_matches($el, $caller_dataframe, $this->tipo);
			}));

			// additions: incoming entries not already present as siblings
			$others_signatures = array_map(fn($el) => json_encode($el), $others);
			$additions = array_values(array_filter($data ?? [], function($el) use ($others_signatures) {
				return !in_array(json_encode($el), $others_signatures, true);
			}));

			// Stamp the caller's id_key onto incoming frames so every persisted frame
			// carries the unified item-id pairing key. The additions all belong to this
			// caller's item; siblings ($others) are left untouched.
			$caller_id_key = $caller_dataframe->id_key ?? null;
			if ($caller_id_key!==null) {
				foreach ($additions as $el) {
					if (is_object($el) && self::is_dataframe_entry($el)) {
						$el->id_key = (int)$caller_id_key;
						unset($el->section_id_key, $el->section_tipo_key);
					}
				}
			}

			$data = array_merge($others, $additions);
			if (empty($data)) {
				$data = null;
			}
		}

		return parent::set_data($data);
	}//end set_data



	/**
	* REMOVE_LOCATOR_FROM_DATA
	* Removes all frame pairing locators from this slot's data that match both the
	* current caller context AND point at the same frame target record as
	* $locator_to_remove (identified by section_tipo + section_id).
	*
	* The two-part match requirement
	* --------------------------------
	* 1. Caller predicate (dataframe_entry_matches): the locator belongs to this
	*    caller's item (correct from_component_tipo, main_component_tipo, id_key).
	*    This prevents removing a locator owned by a sibling item that happens to
	*    point at the same target record.
	* 2. Target predicate: section_tipo and section_id (cast to string for
	*    type-safe comparison) match the locator_to_remove supplied by the caller.
	*
	* The method operates on the FULL unfiltered slot data (all items) so that
	* sibling frames survive the removal; set_data() is then called with the
	* cleaned array which performs the caller-aware merge internally.
	*
	* A caller_dataframe is REQUIRED: the method fails fast with logger::ERROR when
	* none is set, because without it the caller-predicate cannot be evaluated and
	* the removal would be dangerously broad.
	*
	* (!) This method does NOT persist the result — call set_data (via the cascade
	* in trait.dataframe_common::remove_dataframe_data_by_id) or save() explicitly.
	*
	* @param object $locator_to_remove - the locator whose section_tipo+section_id identifies the target to unlink
	* @param array $ar_properties = [] - reserved; not used by this override
	* @return bool - true when at least one matching locator was removed; false otherwise
	*/
	public function remove_locator_from_data( object $locator_to_remove, array $ar_properties=[] ) : bool {

		// caller_dataframe. fixed on construct
			$caller_dataframe = $this->get_caller_dataframe();

			if (empty($caller_dataframe)) {
				debug_log(__METHOD__
					. " Error : caller_dataframe is empty. Always call this component using caller_dataframe " . PHP_EOL
					. ' locator_to_remove: '.to_string($locator_to_remove) . PHP_EOL
					. ' tipo: '. $this->tipo . PHP_EOL
					. ' section_tipo: '. $this->section_tipo . PHP_EOL
					. ' section_id: '. $this->section_id . PHP_EOL
					, logger::ERROR
				);
				return false;
			}

		// iterate the full (unfiltered) component data removing matches
			$removed	= false;
			$new_data	= [];
			$data		= $this->get_data_unfiltered() ?? [];
			foreach ($data as $current_locator) {

				$is_match = is_object($current_locator)
					// pairs with the caller context (this main item, this dataframe slot)
					&& self::dataframe_entry_matches($current_locator, $caller_dataframe, $this->tipo)
					// points at the same frame target record
					&& isset($current_locator->section_tipo) && isset($locator_to_remove->section_tipo)
					&& $current_locator->section_tipo === $locator_to_remove->section_tipo
					&& isset($current_locator->section_id) && isset($locator_to_remove->section_id)
					&& (string)$current_locator->section_id === (string)$locator_to_remove->section_id;

				if ($is_match) {
					$removed = true;
				}else{
					$new_data[] = $current_locator;
				}
			}

		// Updates current data with clean array of locators
			if ($removed===true) {
				$this->set_data( $new_data );
			}


		return $removed;
	}//end remove_locator_from_data



	/**
	* GET_LOCATOR_PROPERTIES_TO_CHECK
	* Returns the set of locator properties used to compare two locators for
	* equality when deleting a locator from the slot's data.
	*
	* Overrides the parent portal implementation to return the dataframe-specific
	* $test_equal_properties, which matches the unified locator shape by id_key
	* (legacy section_id_key / section_tipo_key are no longer part of the predicate).
	*
	* Called by the generic remove-locator plumbing in component_relation_common.
	* @return array - the $test_equal_properties array for this class
	*/
	public function get_locator_properties_to_check() : array {

		return $this->test_equal_properties;
	}//end get_locator_properties_to_check



	/**
	* EMPTY_FULL_DATA_ASSOCIATED_TO_MAIN_COMPONENT
	* Removes and saves ALL frame pairing locators in this slot for the current
	* section record, regardless of which main item they belong to.
	*
	* This is a destructive bulk-clear used by the time-machine restore path
	* (set_time_machine_data) before re-applying the entire saved frame set.
	* It bypasses the caller-aware set_data merge and operates at the section
	* level via section::remove_relations_from_component_tipo, which erases
	* every locator whose from_component_tipo equals this slot's tipo.
	*
	* (!) This method persists immediately (save is handled inside
	* remove_relations_from_component_tipo) and cannot be rolled back. It should
	* only be called when the caller is about to re-write the full slot data.
	* @return true - always true (errors logged internally by section)
	*/
	public function empty_full_data_associated_to_main_component() : true {

		$section = $this->get_my_section();
		$options = (object)[
			'component_tipo' => $this->tipo
		];
		$section->remove_relations_from_component_tipo($options);

		return true;
	}//end empty_full_data_associated_to_main_component



	/**
	* SET_TIME_MACHINE_DATA
	* Restores the dataframe slot's full frame set from a time-machine snapshot.
	*
	* Restore sequence
	* ----------------
	* 1. Erase the current slot data completely via
	*    empty_full_data_associated_to_main_component() so that stale locators
	*    left over from the current state do not mix with the restored set.
	* 2. Temporarily disable the Time Machine capture (tm_record::$save_tm = false)
	*    so that writing the restored data does not create another TM row — the
	*    restored state should be replayed, not re-snapshotted.
	* 3. Call set_data($data) + save() to persist the restored locators.
	* 4. Always restore tm_record::$save_tm in a finally block (REL-01 guard) so
	*    that a thrown exception during the write does not permanently disable
	*    Time Machine capture for later saves in the same persistent worker.
	*
	* Note: the $section local variable assigned on line 2 is not subsequently
	* used; it is a remnant of an earlier implementation. Left as-is per the
	* doc-only rule.
	*
	* @param ?array $data - the full array of frame locators from the TM snapshot,
	*                       or null to restore an empty slot
	* @return bool - always true; errors propagate as exceptions from set_data/save
	*/
	public function set_time_machine_data( ?array $data ) : bool {

		// remove all previous data
		$this->empty_full_data_associated_to_main_component();

		// Remove the time machine to save the dataframe
		// this set will be saved by main component.
		$section = $this->get_my_section();
		// REL-01: restore $save_tm in finally so a throw does not leave Time
		// Machine capture globally disabled for later saves in the worker.
		$prev_save_tm = tm_record::$save_tm;
		tm_record::$save_tm = false;
		try {
			$this->set_data( $data );
			$this->save();
		} finally {
			// re activate the time machine
			tm_record::$save_tm = $prev_save_tm;
		}

		return true;
	}//end set_time_machine_data



	/**
	* GET_MAIN_COMPONENT_TIPO
	* Resolves the tipo of the main component this dataframe slot extends.
	*
	* Resolution order
	* ----------------
	* 1. If a caller_dataframe is set and carries main_component_tipo, that value
	*    is used directly — it is the authoritative runtime context supplied by the
	*    caller that constructed this instance.
	* 2. Otherwise (no caller context, or legacy caller without main_component_tipo),
	*    the ontology parent of this dataframe slot node is used as the default.
	*    This matches the standard ontology wiring where the dataframe slot is a
	*    direct child of its main component node.
	*
	* Validation
	* ----------
	* When a caller-supplied main_component_tipo is present, an additional sanity
	* check is performed, but ONLY for relation-class main components
	* (component_portal, component_select, etc.): the ontology parent of this slot
	* must match the supplied value.  The check is intentionally skipped for literal
	* main components (component_input_text, component_iri, component_date, etc.)
	* because shared dataframe slot tipos (e.g. dd560) serve as siblings of several
	* different main component tipos and are not necessarily their ontology parent.
	* A mismatch is logged as logger::ERROR but does NOT abort the resolution; the
	* caller-supplied value is used.
	* @return string - the tipo of the main component this slot extends
	*/
	public function get_main_component_tipo() : string {

		$main_component_tipo = $this->caller_dataframe->main_component_tipo ?? null;

		if( empty($main_component_tipo) ){

			// default
			$ontology_node			= ontology_node::get_instance( $this->get_tipo() );
			$main_component_tipo	= $ontology_node->get_parent();

		}else{

			// Check valid main_component_tipo
			// Skip ontology parent validation for non-relation components
			// (component_iri, component_input_text, component_text_area, component_date, etc.)
			// since these may use shared dataframe tipos that are not direct ontology children.
			$model = ontology_node::get_model_by_tipo( $main_component_tipo );
			$relation_components = component_relation_common::get_components_with_relations();
			if (in_array($model, $relation_components)) {
				$ontology_node				= ontology_node::get_instance( $this->get_tipo() );
				$test_main_component_tipo	= $ontology_node->get_parent();
				if ($test_main_component_tipo!==$main_component_tipo) {
					debug_log(__METHOD__
						. " Wrong main_component_tipo. " . PHP_EOL
						. ' received main_component_tipo: ' . to_string($main_component_tipo) . PHP_EOL
						. ' calculated test_main_component_tipo: ' . to_string($test_main_component_tipo)
						, logger::ERROR
					);
				}
			}
		}

		return $main_component_tipo;
	}//end get_main_component_tipo



	/**
	* GET_MAIN_COMPONENT_DATA
	* Instantiates the main component (sibling of this dataframe slot in the same
	* section record) and returns its raw data array.
	*
	* Used exclusively by get_time_machine_data_to_save() to merge the main
	* component's items with this slot's frame pairing locators so that the TM
	* snapshot stores both halves in a single row — the restore path (set_time_machine_data)
	* then unpacks them without needing a second query.
	*
	* Language resolution
	* -------------------
	* Literal main components (e.g. component_input_text) are translatable and store
	* per-language data; their instance must be constructed with DEDALO_DATA_LANG.
	* Relation main components (e.g. component_portal) are non-translatable; their
	* instance is constructed with DEDALO_DATA_NOLAN.  get_translatable() on the
	* ontology node drives the selection.
	*
	* Dataframe-root guard (dd555)
	* ----------------------------
	* 'dd555' is the ontology root of the dataframe hierarchy, not a real component
	* node.  When get_main_component_tipo() resolves to a tipo whose model is NOT a
	* 'component_*' class (i.e. it is a section or a bare ontology node), the method
	* short-circuits with null and a logger::WARNING.  This prevents instantiating an
	* invalid class name that would crash the worker.
	*
	* @return ?array - the main component's data array (locators for relations, dato
	*                  items for literals), or null when the main component cannot be
	*                  resolved or is the dataframe-root node
	*/
	public function get_main_component_data() : ?array {

		$main_component_tipo = $this->get_main_component_tipo();

		$model	= ontology_node::get_model_by_tipo( $main_component_tipo );
		$lang	= ontology_node::get_translatable($main_component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		// dataframe_root case (dd555)
		if ( strpos($model, 'component_')===false ) {
			debug_log(__METHOD__
				. " Ignored invalid component " . PHP_EOL
				. ' $main_component_tipo: ' . to_string($main_component_tipo) . PHP_EOL
				. ' $model: ' . to_string($model)
				, logger::WARNING
			);
			return null;
		}

		$main_component = component_common::get_instance(
			$model, // string model
			$main_component_tipo, // string tipo
			$this->get_section_id(), // string section_id
			'list', // string mode
			$lang, // string lang
			$this->get_section_tipo() // string section_tipo
		);

		$main_component_data = $main_component->get_data();

		return $main_component_data;
	}//end get_main_component_data



	/**
	* GET_TIME_MACHINE_DATA_TO_SAVE
	* Assembles the merged payload that the Time Machine captures when this
	* dataframe slot is saved.
	*
	* Why the merge is necessary
	* --------------------------
	* The Time Machine stores one row per section record save event.  Dataframe
	* frame locators live in the same section record as the main component's data
	* but in a different JSONB column key.  To allow a complete restore from a
	* single TM row — without requiring a separate dataframe snapshot — this method
	* combines both:
	*
	*   result = [main_component_data items...] + [frame pairing locators...]
	*
	* The restore counterpart (set_time_machine_data) receives this merged array,
	* splits it back by whether entries are frame pairing locators
	* (is_dataframe_entry) or main component data items, and writes each set to its
	* respective component.
	*
	* Important: get_data_unfiltered() (not the caller-filtered get_data()) is used
	* so the snapshot contains EVERY item's frames in this slot, including the change
	* being saved (which lives on $this). Using the caller-filtered view would capture
	* only one item's frames and silently wipe sibling items' frames on restore (the
	* restore path clears the slot and rewrites it from the captured subset). The main
	* component data is merged in its entirety since its full state is always saved.
	*
	* When get_main_component_data() returns null (dataframe-root guard, unresolvable
	* tipo) the frame data alone is returned, which is a safe partial snapshot.
	* @return ?array - merged array of [main component items] + [frame locators],
	*                  or just frame locators when the main component is unavailable,
	*                  or null when both are empty
	*/
	public function get_time_machine_data_to_save() : ?array {

		// all items' frames in this slot (not the caller-filtered subset)
		$dataframe_data = $this->get_data_unfiltered() ?? [];

		$main_component_data = $this->get_main_component_data();

		$time_machine_data_to_save = is_array($main_component_data)
			? array_merge($main_component_data, $dataframe_data)
			: (empty($dataframe_data) ? null : $dataframe_data);


		return $time_machine_data_to_save;
	}//end get_time_machine_data_to_save


	/**
	* GET_DIFFUSION_DATA
	* Publishes the frame pairing locators of this slot as a diffusion payload,
	* optionally scoped to the locators that belong to one specific main component.
	*
	* Role in the diffusion chain
	* ---------------------------
	* When a diffusion ddo_map includes a component_dataframe ddo alongside the
	* main component ddo, the chain processor calls this method to collect the
	* frame locators.  The chain processor then follows each locator into the frame
	* target section (section_tipo / section_id) and recursively resolves the ddos
	* defined for that section, publishing frame field values alongside the main
	* component's items.  The id_key in each published locator acts as the join key
	* on the diffusion consumer side.
	*
	* Parent scoping ($ddo->parent)
	* ------------------------------
	* When the ddo carries a `parent` field set to the tipo of the main component
	* being extended (rather than 'self' or absent), only the frame locators whose
	* main_component_tipo matches that tipo are included.  This scoping is essential
	* when one slot serves multiple main components (e.g. a shared label dataframe
	* such as dd560 used by both component_iri and component_portal): without it the
	* chain would publish frames from sibling main components and produce incorrect
	* join results.
	*
	* A null $parent_tipo (no parent declared or parent==='self') publishes all
	* frame locators in the slot without filtering by main_component_tipo, which is
	* correct when the slot is exclusive to one main component.
	*
	* Non-frame entries (portal locators, etc.) in the unfiltered slot data are
	* skipped via is_dataframe_entry().
	*
	* @param object $ddo - the diffusion ddo descriptor; may carry `parent` (tipo of the main component) and `id`
	* @param string|null $diffusion_element_tipo = null - reserved; unused in this override
	* @return array - single-element array containing the diffusion_data_object for this slot;
	*                 value is null when no matching frames exist
	*/
	public function get_diffusion_data( object $ddo, ?string $diffusion_element_tipo=null ) : array {

		// Default diffusion data object
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> null,
			'id'	=> $ddo->id ?? null
		]);

		$data = $this->get_data_unfiltered() ?? [];

		// parent scoping: only the frames of the chain's main component
		$parent_tipo = (isset($ddo->parent) && $ddo->parent!=='self')
			? $ddo->parent
			: null;

		$frames = array_values(array_filter($data, function($el) use ($parent_tipo) {
			if (!is_object($el) || !self::is_dataframe_entry($el)) {
				return false;
			}
			return $parent_tipo===null
				|| ($el->main_component_tipo ?? null)===$parent_tipo;
		}));

		$diffusion_data_object->value = empty($frames) ? null : $frames;


		return [$diffusion_data_object];
	}//end get_diffusion_data



	/**
	* UPDATE_DATA_VERSION
	* Data-migration hook called by area_maintenance update_data when the platform
	* upgrades across a version boundary that requires transforming stored component
	* data.  The caller supplies the target version via $options->update_version
	* (an array of version segments, e.g. [7, 0, 1]).
	*
	* Currently this component has no version-specific data transformations (the
	* low-level locator key migration for the dataframe pairing contract is handled
	* by the standalone class.dataframe_v7_migration.php, not here).  The default
	* branch of the switch returns result=0 to signal "no update defined for this
	* version" so the batch runner can log and skip without failing.
	*
	* Result codes (shared convention across all components):
	*   0 — no update block defined for this version (this component's default)
	*   1 — update performed successfully
	*   2 — update attempted but data needed no change (already up-to-date)
	*
	* @see update::components_update
	* @param object $options
	* {
	*   update_version: array          version segments (e.g. [7,0,1])
	*   data_unchanged: mixed          original stored value, for diff-checking
	*   reference_id: string|int       record identifier (for logging)
	*   tipo: string                   component tipo being migrated
	*   section_id: string|int         section record id
	*   section_tipo: string           section tipo
	*   context: string                caller context (default: 'update_component_data')
	* }
	* @return object $response
	*   $response->result int  0 | 1 | 2  (see result codes above)
	*   $response->msg    string  human-readable outcome description
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

		$update_version = implode('.', $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_data_version



}//end class component_dataframe
