<?php declare(strict_types=1);
/**
 * TRAIT DATAFRAME_COMMON
 * Single PHP authority for the dataframe pairing contract.
 * Allows linking a main component to a component_dataframe in the same
 * section that extends individual data items with frame records
 * (uncertainty, qualifiers, contextual information).
 *
 * Used by component_common (via `use dataframe_common`) to provide every main
 * component with the full set of frame reading, writing, export, import, and
 * diffusion helpers without duplicating the pairing logic.
 *
 * Pairing contract (see docs/core/components/component_dataframe.md):
 * - The pairing key is the main data item's stable counter `id` (id_key),
 *   for relation and literal components alike. Never an array index.
 * - Dataframe locators carry the positive marker type=DEDALO_RELATION_TYPE_DATAFRAME
 *   (constant value 'dd490', defined in core/base/dd_tipos.php).
 * - Match predicate: (type, from_component_tipo, main_component_tipo, id_key)
 * - Legacy (pre-migration) locators carried section_id_key/section_tipo_key and
 *   no type. Dual-read has been REMOVED: only the type+id_key shape is recognised,
 *   so the dataframe_v7_migration update must run to convert legacy data.
 *
 * Methods grouped by responsibility:
 * - Detection / matching: is_dataframe_entry(), dataframe_entry_matches()
 * - Instance construction: build_dataframe_caller(), get_dataframe_instance()
 * - Data access: get_item_dataframe_data(), get_dataframe_component()
 * - Ontology helpers: get_dataframe_tipo(), get_dataframe_model(), has_dataframe()
 * - Cascade delete: get_dataframe_delete_policy(), remove_dataframe_data_by_id()
 * - JSON controller helper: build_dataframe_subdatum()
 * - Export/import: get_export_dataframe_data(), import_dataframe_data()
 * - Diffusion: get_diffusion_data_with_dataframe()
 * - Inline id_key-paired values (e.g. relation sibling-order component_number):
 *   get_data_by_id_key(), add_value_by_id_key(), remove_by_id_key(),
 *   get_value_by_id_key(), update_value_by_id_key()
 *
 * @package Dédalo
 * @subpackage Core
 */
trait dataframe_common {



	/**
	 * IS_DATAFRAME_ENTRY
	 * Positive detection of dataframe pairing locators, type-first with a
	 * legacy shape fallback (pre-migration data has no `type`).
	 *
	 * Replaces ad-hoc shape-sniffing (e.g. `property_exists($el,'iri')` or
	 * model-name allow-lists in Time Machine filtering) with a single gate.
	 * Call this before any match predicate so that non-frame objects in the
	 * mixed `relations` bag (portal locators, IRI locators, …) are skipped
	 * cheaply without examining their full structure.
	 * @param mixed $el - candidate element from a component's data/relations array
	 * @return bool - true when $el is a frame pairing locator (unified or legacy)
	 */
	public static function is_dataframe_entry( mixed $el ) : bool {

		if (!is_object($el)) {
			return false;
		}
		// unified contract: the positive type marker (dd490) is the single source of
		// truth. All frames carry it after dataframe_v7_migration; no legacy fallback.
		return isset($el->type) && $el->type===DEDALO_RELATION_TYPE_DATAFRAME;
	}//end is_dataframe_entry



	/**
	 * DATAFRAME_ENTRY_MATCHES
	 * Central match predicate between a dataframe locator and a caller context.
	 *
	 * Enforces the unified match contract (id_key only):
	 *   1. is_dataframe_entry() passes (type === dd490 marker).
	 *   2. from_component_tipo matches the slot, when the caller supplies one.
	 *   3. main_component_tipo identifies the same main component as the caller.
	 *   4. id_key is the same main-item id (int comparison).
	 * @param mixed $el - candidate dataframe locator from a component's relations bag
	 * @param object $caller_dataframe - dataframe_caller DTO or legacy stdClass
	 * @param string|null $from_component_tipo = null - the component_dataframe slot tipo; skips slot check when null
	 * @return bool - true when $el belongs to the caller's item and slot
	 */
	public static function dataframe_entry_matches( mixed $el, object $caller_dataframe, ?string $from_component_tipo=null ) : bool {

		if (!self::is_dataframe_entry($el)) {
			return false;
		}

		// from_component_tipo. Which dataframe slot
		if ($from_component_tipo!==null) {
			if (!isset($el->from_component_tipo) || $el->from_component_tipo!==$from_component_tipo) {
				return false;
			}
		}

		// main_component_tipo. Which main component the frame extends
		$caller_main = $caller_dataframe->main_component_tipo ?? null;
		if (empty($caller_main) || !isset($el->main_component_tipo) || $el->main_component_tipo!==$caller_main) {
			return false;
		}

		// pairing key. id_key (the main item id) is the single source of truth
		$caller_key	= $caller_dataframe->id_key ?? null;
		$el_key		= $el->id_key ?? null;
		if ($caller_key===null || $el_key===null || (int)$el_key !== (int)$caller_key) {
			return false;
		}

		return true;
	}//end dataframe_entry_matches



	/**
	 * BUILD_DATAFRAME_CALLER
	 * Builds the typed dataframe_caller DTO that pairs a component_dataframe
	 * instance with exactly one data item of this (main) component.
	 *
	 * Convenience factory: forwards this component's own section_tipo, section_id,
	 * and tipo into the dataframe_caller constructor so callers don't have to
	 * assemble the DTO manually. Use this whenever building a paired
	 * component_dataframe instance from inside a main component method.
	 * @param int $item_id - the stable `id` of the main data item (>= 1, server-minted)
	 * @return dataframe_caller - validated DTO ready to pass as caller_dataframe
	 */
	public function build_dataframe_caller( int $item_id ) : dataframe_caller {

		return new dataframe_caller(
			$this->section_tipo,
			$this->section_id,
			$this->tipo,
			$item_id
		);
	}//end build_dataframe_caller



	/**
	 * GET_DATAFRAME_INSTANCE
	 * Builds a component_dataframe instance paired with one data item of
	 * this (main) component. Single construction path replacing hand-rolled
	 * component_common::get_instance calls with ad-hoc stdClass callers.
	 *
	 * Resolution order for the slot tipo:
	 *   1. $dataframe_tipo argument (explicit, when provided).
	 *   2. get_dataframe_tipo() — ontology properties->dataframe->component_tipo.
	 *   3. get_dataframe_ddo() — first ddo in the RQO whose model is component_dataframe.
	 * Returns null when no slot tipo can be resolved or the model cannot be found.
	 *
	 * The returned instance is caller-aware: its get_data() returns only the
	 * locators paired with $item_id (filtered via the match predicate). Use
	 * get_dataframe_component() instead when caller-less full-slot access is needed.
	 * @param int $item_id - the stable `id` of the main data item (>= 1)
	 * @param string|null $dataframe_tipo = null - explicit slot tipo; resolved automatically when null
	 * @param string $mode = 'list' - component mode passed to get_instance
	 * @param string $lang = DEDALO_DATA_NOLAN - language code; dataframe slots are non-translatable, so lg-nolan is the default
	 * @return component_common|null - null when the slot cannot be resolved or the model is invalid
	 */
	public function get_dataframe_instance( int $item_id, ?string $dataframe_tipo=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN ) : ?component_common {

		// dataframe_tipo. Resolve from ontology properties or RQO ddo when not given
		if (empty($dataframe_tipo)) {
			$dataframe_tipo = $this->get_dataframe_tipo();
		}
		if (empty($dataframe_tipo)) {
			$ar_dataframe_ddo = $this->get_dataframe_ddo();
			$dataframe_tipo = !empty($ar_dataframe_ddo)
				? ($ar_dataframe_ddo[0]->tipo ?? null)
				: null;
		}
		if (empty($dataframe_tipo)) {
			return null;
		}

		$model = ontology_node::get_model_by_tipo( $dataframe_tipo );
		if (empty($model)) {
			debug_log(__METHOD__
				. ' Unable to resolve model for dataframe_tipo: ' . to_string($dataframe_tipo)
				, logger::ERROR
			);
			return null;
		}

		$caller_dataframe = $this->build_dataframe_caller( $item_id );

		return component_common::get_instance(
			$model, // string model
			$dataframe_tipo, // string tipo
			$this->section_id, // string section_id
			$mode, // string mode
			$lang, // string lang
			$this->section_tipo, // string section_tipo
			true, // bool cache
			$caller_dataframe // dataframe_caller
		);
	}//end get_dataframe_instance



	/**
	 * GET_ITEM_DATAFRAME_DATA
	 * Returns the dataframe locators paired with one data item of this
	 * (main) component, or null when none exist.
	 *
	 * Thin wrapper: builds the caller-aware component_dataframe instance and
	 * calls its get_data(). The result is the filtered subset of the slot's
	 * relations bag that belongs to $item_id — not the full slot data.
	 * Returns null both when the slot cannot be resolved and when the item
	 * genuinely has no frames yet.
	 * @param int $item_id - the stable `id` of the main data item (>= 1)
	 * @param string|null $dataframe_tipo = null - explicit slot tipo; resolved automatically when null
	 * @return array|null - frame locator objects, or null when there are none
	 */
	public function get_item_dataframe_data( int $item_id, ?string $dataframe_tipo=null ) : ?array {

		$dataframe_component = $this->get_dataframe_instance( $item_id, $dataframe_tipo );
		if (empty($dataframe_component)) {
			return null;
		}

		$data = $dataframe_component->get_data();

		return empty($data) ? null : $data;
	}//end get_item_dataframe_data



	/**
	 * GET_DATAFRAME_DELETE_POLICY
	 * Reads the frame target record policy from this (main) component's
	 * ontology properties: properties->dataframe->delete_policy
	 *
	 * - 'unlink' (default): the cascade only removes the pairing locators;
	 *   the frame target records survive (time machine renders past states)
	 *   and are reclaimed by the dataframe GC maintenance task.
	 * - 'delete_target': for frame-private sections where an unlinked record
	 *   is meaningless, the cascade also soft-deletes the unlinked target
	 *   records via sections::delete() in 'delete_data' mode (recoverable
	 *   from time machine).
	 *
	 * Any value other than the literal string 'delete_target' is treated as
	 * 'unlink' (fail-safe default: never silently destroys data).
	 * @return string - 'unlink' | 'delete_target'
	 */
	public function get_dataframe_delete_policy() : string {

		$ontology_node	= ontology_node::get_instance($this->tipo);
		$properties		= $ontology_node->get_properties();

		$policy = ($properties instanceof stdClass)
			? ($properties->dataframe->delete_policy ?? null)
			: null;

		return $policy==='delete_target' ? 'delete_target' : 'unlink';
	}//end get_dataframe_delete_policy



	/**
	 * REMOVE_DATAFRAME_DATA_BY_ID
	 * Removes all dataframe locators paired with one data item of this
	 * (main) component, across every dataframe slot declared in the RQO.
	 * This is the server-authoritative cascade fired when the main item is
	 * removed (single-writer rule): the main component's update_data_value()
	 * calls this before saving.
	 *
	 * Frame TARGET records follow the delete_policy (see
	 * get_dataframe_delete_policy): kept by default ('unlink'), soft-deleted
	 * when the ontology opts in with 'delete_target'. Target records are
	 * collected before the slot is cleared so their identifiers are still
	 * available when the delete_target branch executes.
	 *
	 * Time machine is suppressed (REL-01 pattern): the main component
	 * captures the full state — values + frame locators — in its own TM row,
	 * so a separate dataframe TM row would be redundant and would break TM
	 * restore ordering. The static $save_tm flag is restored in a `finally`
	 * block to ensure it is never left disabled if set_data() or save() throws.
	 * @param int $item_id - the stable `id` of the removed main data item (>= 1)
	 * @return bool - always true; per-target soft-delete failures are logged but not propagated
	 */
	public function remove_dataframe_data_by_id( int $item_id ) : bool {

		// dataframe slots declared in the RQO
		$dataframe_ddo = $this->get_dataframe_ddo();
		if( empty($dataframe_ddo) ){
			return true;
		}

		$caller_dataframe	= $this->build_dataframe_caller( $item_id );
		$delete_policy		= $this->get_dataframe_delete_policy();
		$unlinked_targets	= [];

		foreach ($dataframe_ddo as $ddo) {

			$model = ontology_node::get_model_by_tipo( $ddo->tipo );
			$dataframe_component = component_common::get_instance(
				$model, // string model
				$ddo->tipo, // string tipo
				$this->section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$this->section_tipo, // string section_tipo
				true, // bool cache
				$caller_dataframe // dataframe_caller
			);

			// collect the targets being unlinked (delete_target policy)
			if ($delete_policy==='delete_target') {
				$paired = $dataframe_component->get_data() ?? [];
				foreach ($paired as $frame) {
					if (is_object($frame) && isset($frame->section_tipo) && isset($frame->section_id)) {
						$unlinked_targets[] = (object)[
							'section_tipo'	=> $frame->section_tipo,
							'section_id'	=> $frame->section_id
						];
					}
				}
			}

			// The dataframe must not create its own time machine row:
			// the main component saves the full state in its TM row.
			// REL-01: restore $save_tm in finally so a throw in set_data/save does
			// not leave Time Machine capture globally disabled in the worker.
			$prev_save_tm = tm_record::$save_tm;
			tm_record::$save_tm = false;
			try {
				// remove the paired locators (caller-aware write preserves the
				// sibling frames of other items, see component_dataframe::set_data)
				$dataframe_component->set_data( null );
				$dataframe_component->save();
			} finally {
				// restore TM flag. Undo the suppression set above, whether or not
				// set_data/save threw, so subsequent saves in this request remain captured.
				tm_record::$save_tm = $prev_save_tm;
			}
		}

		// delete_target policy: soft-delete the unlinked frame target records
		// (delete_data mode: recoverable from time machine)
		if ($delete_policy==='delete_target' && !empty($unlinked_targets)) {
			foreach ($unlinked_targets as $target) {
				try {
					$sections = sections::get_instance( null, null );
					$delete_response = $sections->delete((object)[
						'delete_mode'				=> 'delete_data',
						'section_tipo'				=> $target->section_tipo,
						'section_id'				=> $target->section_id,
						'delete_diffusion_records'	=> false
					]);
					if (empty($delete_response->result)) {
						debug_log(__METHOD__
							. ' delete_target policy: unable to soft-delete frame target record' . PHP_EOL
							. ' target: ' . to_string($target) . PHP_EOL
							. ' response: ' . to_string($delete_response->msg ?? null)
							, logger::WARNING
						);
					}
				} catch (Throwable $e) {
					debug_log(__METHOD__
						. ' delete_target policy: exception soft-deleting frame target record' . PHP_EOL
						. ' target: ' . to_string($target) . PHP_EOL
						. ' exception: ' . $e->getMessage()
						, logger::ERROR
					);
				}
			}
		}

		return true;
	}//end remove_dataframe_data_by_id



	/**
	 * BUILD_DATAFRAME_SUBDATUM
	 * Shared JSON-controller helper for literal components hosting frames.
	 * Builds the dataframe subdatum (context + data) paired with this
	 * component's data items, and exposes the component counter so edit
	 * views can build the provisional render context (counter+1) for new
	 * blank rows.
	 *
	 * Pseudo-locators carry the item id as section_id: the unified pairing
	 * key for literal components (see common::get_subdatum dataframe branch).
	 * When the component has no saved data yet, a single dummy locator with
	 * section_id = counter+1 is used so the client receives context for a
	 * new first row.
	 *
	 * Returns null in two cases:
	 *   - The component's ontology properties->has_dataframe is not true.
	 *   - Mode is 'search': frame subdatum is never built for search renders.
	 * @param array|null $value - the controller's resolved data items (objects with `id`)
	 * @param string $mode - controller mode ('edit'|'list'|'tm'|'search'|…)
	 * @return object|null - stdClass {context: array, data: array, counter: int},
	 *   or null when has_dataframe is not true or mode is 'search'
	 */
	public function build_dataframe_subdatum( ?array $value, string $mode ) : ?object {

		// has_dataframe. Controller-level ontology flag
		$properties		= $this->get_properties();
		$has_dataframe	= ($properties->has_dataframe ?? false)===true;
		if (!$has_dataframe || $mode==='search') {
			return null;
		}

		// counter. Exposed to the client (data item) to build the provisional
		// dataframe render context (counter+1) for new blank rows
		$counter = $this->get_counter();

		// locators (using item id as section_id)
		$ar_locator	= [];
		$safe_value	= !empty($value) ? $value : [];
		foreach ($safe_value as $current_value) {

			if (!is_object($current_value) || !isset($current_value->id)) {
				continue;
			}

			$locator = new locator();
				$locator->set_section_tipo($this->section_tipo);
				$locator->set_section_id($current_value->id);
			$ar_locator[] = $locator;
		}

		// Empty data: create a locator with next counter to get dataframe context
		if( empty($ar_locator) ){
			$locator = new locator();
				$locator->set_section_tipo($this->section_tipo);
				$locator->set_section_id($counter+1);
			$ar_locator[] = $locator;
		}

		// subdatum
		$subdatum = $this->get_subdatum($this->tipo, $ar_locator);

		$response = new stdClass();
			$response->context	= $subdatum->context ?? [];
			$response->data		= $subdatum->data ?? [];
			$response->counter	= $counter;

		return $response;
	}//end build_dataframe_subdatum



	/**
	 * GET_EXPORT_DATAFRAME_DATA
	 * Collects every dataframe locator paired with this (main) component's
	 * data items, across all its dataframe slots. Used by the raw export
	 * (dedalo_raw) to ship the frames alongside the dato in the dedalo_data
	 * wrapper:
	 *   {"dedalo_data": {"dato": [...], "dataframe": [...]}}
	 *
	 * Why caller-less: the export collects ALL frames for this main component
	 * (all item ids) from the raw slot storage rather than filtering by a
	 * single caller. get_data_unfiltered() is called on an uncached (no caller)
	 * instance, then each entry is checked against main_component_tipo to
	 * skip frames belonging to other main components sharing the slot.
	 *
	 * Returns null for component_dataframe itself (it exports its own locators
	 * as regular dato) and when no frames are found.
	 * @return array|null - frame locator objects (stdClass), or null when none
	 */
	public function get_export_dataframe_data() : ?array {

		// the dataframe component itself exports its own locators as dato
		if ($this->get_model()==='component_dataframe') {
			return null;
		}

		// slot tipos: ontology declaration + RQO ddos
		$slot_tipos = [];
		$declared = $this->get_dataframe_tipo();
		if (!empty($declared)) {
			$slot_tipos[] = $declared;
		}
		$ar_dataframe_ddo = $this->get_dataframe_ddo() ?? [];
		foreach ($ar_dataframe_ddo as $ddo) {
			if (!empty($ddo->tipo)) {
				$slot_tipos[] = $ddo->tipo;
			}
		}
		$slot_tipos = array_unique($slot_tipos);
		if (empty($slot_tipos)) {
			return null;
		}

		$frames = [];
		foreach ($slot_tipos as $slot_tipo) {

			$model = ontology_node::get_model_by_tipo( $slot_tipo );
			if ($model!=='component_dataframe') {
				continue;
			}

			$dataframe_component = component_common::get_instance(
				$model,
				$slot_tipo,
				$this->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$this->section_tipo,
				false // no cache: plain (un-paired) instance
			);

			$slot_data = $dataframe_component->get_data_unfiltered() ?? [];
			foreach ($slot_data as $el) {
				if (is_object($el)
					&& self::is_dataframe_entry($el)
					&& ($el->main_component_tipo ?? null)===$this->tipo) {
					$frames[] = $el;
				}
			}
		}

		return empty($frames) ? null : $frames;
	}//end get_export_dataframe_data



	/**
	 * IMPORT_DATAFRAME_DATA
	 * Writes imported frame locators pairing this (main) component's items,
	 * replacing this component's previous frames in each slot and preserving
	 * the frames of other main components sharing the slot.
	 *
	 * Called by the CSV import tool after saving the main component's dato,
	 * using the frame locators extracted from the dedalo_data wrapper
	 * {"dedalo_data": {"dataframe": [...]}}.
	 *
	 * Steps:
	 *   1. Group incoming locators by slot (from_component_tipo).
	 *   2. Normalize each entry to the unified contract (type + id_key). This is the
	 *      old-CSV import boundary, so a legacy section_id_key (from a pre-v7 export)
	 *      is accepted as the id_key source; the legacy aliases are then stripped.
	 *   3. For each slot: load the full (uncached) slot data, keep entries
	 *      belonging to other main components, merge in the imported frames,
	 *      and save. Entries without a resolvable pairing key or slot are
	 *      skipped with a logger::WARNING.
	 *
	 * Time machine is suppressed (REL-01 pattern): the main component's import
	 * save already captures the full state in its TM row.
	 * @param array $frame_locators - array of stdClass frame locator objects from the import envelope
	 * @return bool - false when at least one slot save fails; true on full success or no frames
	 */
	public function import_dataframe_data( array $frame_locators ) : bool {

		if (empty($frame_locators)) {
			return true;
		}

		// group by slot (from_component_tipo), normalizing each entry
		$groups = [];
		foreach ($frame_locators as $frame) {

			if (!is_object($frame)) {
				continue;
			}

			$slot_tipo	= $frame->from_component_tipo ?? null;
			// id_key is the main data item id. Old-CSV import boundary: a pre-v7 export
			// carries the pairing key as section_id_key, so accept it as the id_key source.
			$id_key		= $frame->id_key ?? $frame->section_id_key ?? null;

			if (empty($slot_tipo) || $id_key===null) {
				debug_log(__METHOD__
					. ' Skipped dataframe frame without slot or pairing key' . PHP_EOL
					. ' frame: ' . to_string($frame)
					, logger::WARNING
				);
				continue;
			}

			// normalize to the unified contract (id_key-only, like the interactive
			// write path). Strip any legacy aliases that arrived in the import payload.
			$frame->type				= DEDALO_RELATION_TYPE_DATAFRAME;
			$frame->id_key				= (int)$id_key;
			$frame->main_component_tipo	= $frame->main_component_tipo ?? $this->tipo;
			unset($frame->section_id_key, $frame->section_tipo_key);

			$groups[$slot_tipo][] = $frame;
		}

		$result = true;
		foreach ($groups as $slot_tipo => $group_frames) {

			$model = ontology_node::get_model_by_tipo( $slot_tipo );
			if ($model!=='component_dataframe') {
				debug_log(__METHOD__
					. ' Skipped dataframe group: slot is not a component_dataframe' . PHP_EOL
					. ' slot_tipo: ' . to_string($slot_tipo) . ' model: ' . to_string($model)
					, logger::WARNING
				);
				continue;
			}

			$dataframe_component = component_common::get_instance(
				$model,
				$slot_tipo,
				$this->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$this->section_tipo,
				false // no cache: plain (un-paired) instance
			);

			// keep the frames of other main components sharing the slot
			$full_data = $dataframe_component->get_data_unfiltered() ?? [];
			$keep = array_values(array_filter($full_data, function($el) {
				return !is_object($el) || ($el->main_component_tipo ?? null)!==$this->tipo;
			}));

			// the main component save captures the state: no dataframe TM row
			// REL-01: restore $save_tm in finally even if set_data/save throws.
			$prev_save_tm = tm_record::$save_tm;
			tm_record::$save_tm = false;
			try {
				$dataframe_component->set_data( array_merge($keep, $group_frames) );
				$save_result = $dataframe_component->save();
			} finally {
				tm_record::$save_tm = $prev_save_tm;
			}

			if ($save_result===false) {
				$result = false;
			}
		}

		return $result;
	}//end import_dataframe_data



	/**
	 * GET_DIFFUSION_DATA_WITH_DATAFRAME
	 * Opt-in diffusion resolver: a diffusion ddo declaring
	 *   "fn": "get_diffusion_data_with_dataframe"
	 * publishes this component's data items with their paired frame locators
	 * attached as a `dataframe` property, joined by the item id.
	 *
	 * Items without frames are published unchanged. Stored data is never
	 * mutated: each item object is cloned before the `dataframe` property is
	 * attached.
	 *
	 * The optional $ddo->data_slice object ({offset: int, length: int}) lets
	 * a diffusion pipeline paginate large dato arrays without building the
	 * full set; it is applied before the per-item frame resolution.
	 * @param object $ddo - diffusion ddo; may carry a data_slice property
	 * @param string|null $diffusion_element_tipo = null - unused; kept for the standard diffusion fn signature
	 * @return array - data item clones (possibly with added `dataframe` property),
	 *   consumed by the chain processor via diffusion_data_object->set_value()
	 */
	public function get_diffusion_data_with_dataframe( object $ddo, ?string $diffusion_element_tipo=null ) : array {

		$data = $this->get_data() ?? [];

		// if the ddo provides a data_slice property, use it to slice the data
		if (isset($ddo->data_slice) && !empty($data)) {
			$data = array_slice($data, $ddo->data_slice->offset, $ddo->data_slice->length);
		}

		$processed = [];
		foreach ($data as $item) {

			if (!is_object($item)) {
				$processed[] = $item;
				continue;
			}

			$clone = clone $item;
			if (isset($item->id)) {
				$frames = $this->get_item_dataframe_data((int)$item->id);
				if ($frames!==null) {
					$clone->dataframe = $frames;
				}
			}
			$processed[] = $clone;
		}

		return $processed;
	}//end get_diffusion_data_with_dataframe



	/**
	 * GET_DATAFRAME_COMPONENT
	 * Returns the linked component_dataframe slot instance WITHOUT a caller
	 * pairing, so its get_data() returns the full unfiltered slot content.
	 *
	 * Use this when you need slot-level access (e.g. maintenance, migration,
	 * bulk frame reads). For item-scoped access — where get_data() should
	 * return only the frames for a specific data item — use
	 * get_dataframe_instance($item_id) instead.
	 *
	 * Uses this component's current mode and lang (inherits the caller context).
	 * @return component_common|null - null when no dataframe tipo is declared in ontology
	 */
	public function get_dataframe_component() : ?component_common {
		$dataframe_tipo = $this->get_dataframe_tipo();
		if (empty($dataframe_tipo)) {
			return null;
		}

		return component_common::get_instance(
			$this->get_dataframe_model(),
			$dataframe_tipo,
			$this->section_id,
			$this->mode,
			$this->lang,
			$this->section_tipo
		);
	}//end get_dataframe_component



	/**
	 * GET_DATAFRAME_TIPO
	 * Returns the component_dataframe slot tipo declared on this main
	 * component's ontology node: properties->dataframe->component_tipo.
	 *
	 * Returns null when: the ontology node has no properties, the properties
	 * object has no `dataframe` key, `component_tipo` is absent, or its value
	 * is falsy (false, null, empty string). Any falsy value is treated as
	 * "no dataframe declared" to guard against partial or malformed ontology data.
	 * @return string|null - the slot tipo (e.g. 'oh115'), or null when not configured
	 */
	public function get_dataframe_tipo() : ?string {
		$ontology_node = ontology_node::get_instance($this->tipo);
		$properties = $ontology_node->get_properties();

		// Handle cases where properties, dataframe, or component_tipo return false
		if (!$properties instanceof stdClass) {
			return null;
		}
		if (!isset($properties->dataframe) || !$properties->dataframe instanceof stdClass) {
			return null;
		}
		if (!isset($properties->dataframe->component_tipo)) {
			return null;
		}

		$value = $properties->dataframe->component_tipo;

		// Ensure we return null for any falsy value (false, null, empty string)
		if ($value === false || $value === null || $value === '') {
			return null;
		}

		return (string)$value;
	}//end get_dataframe_tipo


	/**
	 * GET_DATAFRAME_MODEL
	 * Returns the ontology model name of the dataframe slot component,
	 * resolved through get_dataframe_tipo() -> ontology_node::get_model_by_tipo().
	 *
	 * Expected to return 'component_dataframe' when the ontology is correctly
	 * wired; callers in get_export_dataframe_data() and import_dataframe_data()
	 * guard against non-dataframe models. Returns null when no slot tipo is
	 * declared or the model cannot be resolved.
	 * @return string|null - the model name (e.g. 'component_dataframe'), or null
	 */
	public function get_dataframe_model() : ?string {
		$dataframe_tipo = $this->get_dataframe_tipo();
		if (empty($dataframe_tipo)) {
			return null;
		}

		$model = ontology_node::get_model_by_tipo($dataframe_tipo);

		return $model ?? null;
	}//end get_dataframe_model


	/**
	 * HAS_DATAFRAME
	 * Returns true when this component's ontology declares a dataframe slot.
	 *
	 * Convenience predicate over get_dataframe_tipo(): checks that a non-empty
	 * slot tipo is present in the node's properties->dataframe->component_tipo.
	 * Use before any frame operation when you want to skip work cheaply for
	 * components that never host frames.
	 * @return bool - true when a dataframe slot is configured in the ontology
	 */
	public function has_dataframe() : bool {
		return !empty($this->get_dataframe_tipo());
	}//end has_dataframe


	/**
	 * IS_INLINE_VALUE_COMPONENT
	 * Returns true when this component stores inline value items (paired by `id`),
	 * false when it stores locators (e.g. component_dataframe, whose locators carry
	 * `id_key` pointing at a main item's `id`).
	 *
	 * The 5 inline-value methods (get_data_by_id_key, add_value_by_id_key,
	 * remove_by_id_key, get_value_by_id_key, update_value_by_id_key) operate on
	 * inline value items and MUST NOT be called on locator-storage components:
	 * doing so corrupts the locator bag (matching the wrong field, or appending
	 * non-locator objects). This guard makes the misuse loud rather than silent.
	 * @return bool - true when safe to use the inline-value methods
	 */
	private function is_inline_value_component() : bool {
		if ($this->model === 'component_dataframe') {
			debug_log(__METHOD__
				. ' Inline-value methods must not be called on component_dataframe'
				. ' (it stores locators, not inline value items).'
				. ' tipo: ' . to_string($this->tipo ?? null)
				, logger::ERROR
			);
			return false;
		}
		return true;
	}//end is_inline_value_component


	/**
	 * GET_DATA_BY_ID_KEY
	 * Filters this component's inline data items by the unified dataframe pairing
	 * key (id_key = the main component item id) and returns the matching subset.
	 *
	 * This applies the dataframe contract to inline value items (e.g. the relation
	 * sibling-order component_number): every value is paired with ONE item of its
	 * main component by id_key — exactly like every other dataframe. There are no
	 * parent-record context keys (the retired section_tipo_key/section_id_key).
	 *
	 * (!) The pairing key on the LOCATOR side is the field `id_key`; on the MAIN
	 * COMPONENT ITEM side it is the auto-allocated field `id`. These methods
	 * operate on main component items, so they match on `id`. Frame locators
	 * (matched by dataframe_entry_matches) read `id_key` — do not confuse them.
	 * @param int $id_key - the main component item id this value is paired with
	 * @return array|null - filtered data items, or null when the component has no data or no match
	 */
	public function get_data_by_id_key(int $id_key) : ?array {
		if (!$this->is_inline_value_component()) {
			return null;
		}
		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		$filtered = array_values(array_filter($data, function($item) use ($id_key) {
			return isset($item->id)
				&& (int)$item->id === (int)$id_key;
		}));

		return empty($filtered) ? null : $filtered;
	}//end get_data_by_id_key


	/**
	 * ADD_VALUE_BY_ID_KEY
	 * Appends a new inline data item carrying the unified pairing key id_key
	 * (the main component item id) to this component's data array.
	 *
	 * The new item's `id` is set to $id_key directly (NOT auto-allocated): the
	 * pairing contract requires the order item's id to equal the parent-link
	 * locator's id, so auto-allocation would break the pairing. parent::set_data
	 * preserves an explicitly-set id (it only auto-allocates when id is absent).
	 * @param mixed $value - the value payload to store
	 * @param int $id_key - the main component item id this value is paired with
	 * @return bool - result of set_data()
	 */
	public function add_value_by_id_key($value, int $id_key) : bool {
		if (!$this->is_inline_value_component()) {
			return false;
		}
		$data = $this->get_data() ?? [];

		$new_item = new stdClass();
			$new_item->value	= $value;
			$new_item->id		= $id_key;

		$data[] = $new_item;

		return $this->set_data($data);
	}//end add_value_by_id_key


	/**
	 * REMOVE_BY_ID_KEY
	 * Removes all inline data items paired with the given main item id (id_key)
	 * and saves the remaining data.
	 * @param int $id_key - the main component item id to match
	 * @return bool - result of set_data() on the filtered array
	 */
	public function remove_by_id_key(int $id_key) : bool {
		if (!$this->is_inline_value_component()) {
			return false;
		}
		$data = $this->get_data() ?? [];

		$filtered = array_values(array_filter($data, function($item) use ($id_key) {
			return !(
				isset($item->id)
				&& (int)$item->id === (int)$id_key
			);
		}));

		return $this->set_data($filtered);
	}//end remove_by_id_key


	/**
	 * GET_VALUE_BY_ID_KEY
	 * Returns the `value` property of the first inline data item paired with the
	 * given main item id (id_key), or null when no matching item is found.
	 * @param int $id_key - the main component item id to match
	 * @return mixed|null - the stored value, or null when not found
	 */
	public function get_value_by_id_key(int $id_key) {
		if (!$this->is_inline_value_component()) {
			return null;
		}
		$context_data = $this->get_data_by_id_key($id_key);
		if (empty($context_data)) {
			return null;
		}

		return $context_data[0]->value ?? null;
	}//end get_value_by_id_key


	/**
	 * UPDATE_VALUE_BY_ID_KEY
	 * Updates the `value` of the first inline data item paired with the given
	 * main item id (id_key) in place; appends a new item if none matches (upsert
	 * via add_value_by_id_key()).
	 * @param mixed $value - the new value to store
	 * @param int $id_key - the main component item id to match
	 * @return bool - result of set_data() or add_value_by_id_key()
	 */
	public function update_value_by_id_key($value, int $id_key) : bool {
		if (!$this->is_inline_value_component()) {
			return false;
		}
		$data = $this->get_data() ?? [];
		$found = false;

		foreach ($data as $item) {
			if (isset($item->id)
				&& (int)$item->id === (int)$id_key) {
					$item->value = $value;
					$found = true;
				break;
			}
		}

		if (!$found) {
			return $this->add_value_by_id_key($value, $id_key);
		}

		return $this->set_data($data);
	}//end update_value_by_id_key
}
