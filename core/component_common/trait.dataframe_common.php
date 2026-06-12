<?php declare(strict_types=1);
/**
 * TRAIT DATAFRAME_COMMON
 * Single PHP authority for the dataframe pairing contract.
 * Allows linking a main component to a component_dataframe in the same
 * section that extends individual data items with frame records
 * (uncertainty, qualifiers, contextual information).
 *
 * Pairing contract (see docs/core/components/component_dataframe.md):
 * - The pairing key is the main data item's stable counter `id` (id_key),
 *   for relation and literal components alike. Never an array index.
 * - Dataframe locators carry the positive marker type=DEDALO_RELATION_TYPE_DATAFRAME.
 * - Match predicate: (type, from_component_tipo, main_component_tipo, id_key)
 * - Legacy (pre-migration) locators carry section_id_key/section_tipo_key and
 *   no type: they are dual-read until the data migration has run.
 *
 * Usage:
 * - Component declares 'dataframe' property in ontology with component_tipo
 * - Frame data access goes through build_dataframe_caller / get_dataframe_instance
 */
trait dataframe_common {



	/**
	 * IS_DATAFRAME_ENTRY
	 * Positive detection of dataframe pairing locators, type-first with a
	 * legacy shape fallback (pre-migration data has no `type`).
	 * Replaces shape-sniffing such as `property_exists($el,'iri')` or
	 * model-name lists in Time Machine filtering.
	 * @param mixed $el
	 * @return bool
	 */
	public static function is_dataframe_entry( mixed $el ) : bool {

		if (!is_object($el)) {
			return false;
		}
		// unified contract: positive marker
		if (isset($el->type) && $el->type===DEDALO_RELATION_TYPE_DATAFRAME) {
			return true;
		}
		// legacy shape fallback (pre-migration data): pairing keys present
		return (isset($el->id_key) || isset($el->section_id_key))
			&& isset($el->main_component_tipo);
	}//end is_dataframe_entry



	/**
	 * DATAFRAME_ENTRY_MATCHES
	 * Central match predicate between a dataframe locator and a caller
	 * context, dual-reading new (id_key) and legacy (section_id_key) shapes.
	 * @param mixed $el - candidate dataframe locator
	 * @param object $caller_dataframe - dataframe_caller or legacy stdClass
	 * @param string|null $from_component_tipo - the component_dataframe tipo (slot), when known
	 * @return bool
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

		// pairing key. id_key (unified contract) or section_id_key (legacy)
		$caller_key	= $caller_dataframe->id_key ?? $caller_dataframe->section_id_key ?? null;
		$el_key		= $el->id_key ?? $el->section_id_key ?? null;
		if ($caller_key===null || $el_key===null || (int)$el_key !== (int)$caller_key) {
			return false;
		}

		// section_tipo_key. Legacy consistency check, only when both sides carry it
		if (isset($el->section_tipo_key) && isset($caller_dataframe->section_tipo_key)
			&& $el->section_tipo_key !== $caller_dataframe->section_tipo_key) {
			return false;
		}

		return true;
	}//end dataframe_entry_matches



	/**
	 * BUILD_DATAFRAME_CALLER
	 * Builds the typed caller context pairing a component_dataframe with
	 * one data item of this (main) component.
	 * @param int $item_id - the stable `id` of the main data item
	 * @return dataframe_caller
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
	 * @param int $item_id - the stable `id` of the main data item
	 * @param string|null $dataframe_tipo - explicit dataframe slot tipo; resolved from ontology/RQO when null
	 * @param string $mode = 'list'
	 * @param string $lang = DEDALO_DATA_NOLAN
	 * @return component_common|null
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
	 * @param int $item_id - the stable `id` of the main data item
	 * @param string|null $dataframe_tipo - explicit dataframe slot tipo
	 * @return array|null
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
	 * - 'unlink' (default): the cascade only removes the pairing locators;
	 *   the frame target records survive (time machine renders past states)
	 *   and are reclaimed by the dataframe GC maintenance task.
	 * - 'delete_target': for frame-private sections where an unlinked record
	 *   is meaningless, the cascade also soft-deletes the unlinked target
	 *   records (sections delete_data mode, recoverable from time machine).
	 * @return string 'unlink' | 'delete_target'
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
	 * removed (single-writer rule).
	 * Frame TARGET records follow the delete_policy (see
	 * get_dataframe_delete_policy): kept by default, soft-deleted when the
	 * ontology opts in with 'delete_target'.
	 * Time machine is suppressed for the dataframe save: the main component
	 * captures the full state in its own TM row.
	 * @param int $item_id - the stable `id` of the removed main data item
	 * @return bool
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
			tm_record::$save_tm = false;

			// remove the paired locators (caller-aware write preserves the
			// sibling frames of other items, see component_dataframe::set_data)
			$dataframe_component->set_data( null );
			$dataframe_component->save();

			// back to set time machine to true for the next savings.
			tm_record::$save_tm = true;
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
	 * Pseudo-locators carry the item id as section_id: the unified pairing
	 * key for literal components (see common::get_subdatum dataframe branch).
	 * @param array|null $value - the controller's resolved data items
	 * @param string $mode - controller mode ('edit'|'list'|'tm'|'search'|...)
	 * @return object|null - {context: [], data: [], counter: int},
	 * 	or null when properties->has_dataframe is not true or mode is 'search'
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
	 * (dedalo_raw) to ship the frames alongside the dato:
	 * {"dedalo_data": {"dato": [...], "dataframe": [...]}}
	 * @return array|null - frame locators, or null when none
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
	 * Entries are normalized to the unified contract (type + id_key, legacy
	 * aliases kept until the data migration runs). Frames without resolvable
	 * pairing key or slot are skipped with a log.
	 * Time machine is suppressed: the main component save captures the state.
	 * @param array $frame_locators
	 * @return bool
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
			$id_key		= $frame->id_key ?? $frame->section_id_key ?? null;

			if (empty($slot_tipo) || $id_key===null) {
				debug_log(__METHOD__
					. ' Skipped dataframe frame without slot or pairing key' . PHP_EOL
					. ' frame: ' . to_string($frame)
					, logger::WARNING
				);
				continue;
			}

			// normalize to the unified contract (+ legacy aliases)
			$frame->type				= DEDALO_RELATION_TYPE_DATAFRAME;
			$frame->id_key				= (int)$id_key;
			$frame->section_id_key		= (int)$id_key;
			$frame->main_component_tipo	= $frame->main_component_tipo ?? $this->tipo;
			if (!isset($frame->section_tipo_key)) {
				$frame->section_tipo_key = $this->section_tipo;
			}

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
			tm_record::$save_tm = false;
			$dataframe_component->set_data( array_merge($keep, $group_frames) );
			$save_result = $dataframe_component->save();
			tm_record::$save_tm = true;

			if ($save_result===false) {
				$result = false;
			}
		}

		return $result;
	}//end import_dataframe_data



	/**
	 * GET_DIFFUSION_DATA_WITH_DATAFRAME
	 * Opt-in diffusion resolver: a diffusion ddo declaring
	 * 	"fn": "get_diffusion_data_with_dataframe"
	 * publishes this component's data items with their paired frame locators
	 * attached as a `dataframe` property, joined by the item id. Items
	 * without frames are published unchanged; stored data is never mutated
	 * (items are cloned).
	 * @param object $ddo
	 * @param string|null $diffusion_element_tipo = null
	 * @return array - data items (consumed via diffusion_data_object->set_value)
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
	 * Get the linked dataframe component instance (no caller pairing).
	 * For item-paired access use get_dataframe_instance().
	 * @return component_common|null
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
	 * Get the dataframe component tipo from ontology properties
	 * @return string|null
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
	 * Get the model of the dataframe component
	 * @return string|null
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
	 * Check if this component has a linked dataframe
	 * @return bool
	 */
	public function has_dataframe() : bool {
		return !empty($this->get_dataframe_tipo());
	}//end has_dataframe


	/**
	 * GET_DATA_BY_CONTEXT
	 * Filter data by parent context (section_id_key, section_tipo_key)
	 * @deprecated Embedded-value mechanism (values stored inside component
	 * data with context keys). The portal-locator mechanism through
	 * get_dataframe_instance() is the only documented one.
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return array|null
	 */
	public function get_data_by_context(string $section_tipo_key, int $section_id_key) : ?array {
		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		$filtered = array_values(array_filter($data, function($item) use ($section_tipo_key, $section_id_key) {
			return isset($item->section_tipo_key)
				&& $item->section_tipo_key === $section_tipo_key
				&& isset($item->section_id_key)
				&& (int)$item->section_id_key === (int)$section_id_key;
		}));

		return empty($filtered) ? null : $filtered;
	}//end get_data_by_context


	/**
	 * ADD_VALUE_WITH_CONTEXT
	 * Add a value with context properties
	 * @deprecated See get_data_by_context note.
	 * @param mixed $value
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return bool
	 */
	public function add_value_with_context($value, string $section_tipo_key, int $section_id_key) : bool {
		$data = $this->get_data() ?? [];

		$new_item = new stdClass();
			$new_item->value = $value;
			$new_item->section_tipo_key = $section_tipo_key;
			$new_item->section_id_key = $section_id_key;

		$data[] = $new_item;

		return $this->set_data($data);
	}//end add_value_with_context


	/**
	 * REMOVE_BY_CONTEXT
	 * Remove values by context
	 * @deprecated See get_data_by_context note.
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return bool
	 */
	public function remove_by_context(string $section_tipo_key, int $section_id_key) : bool {
		$data = $this->get_data() ?? [];

		$filtered = array_values(array_filter($data, function($item) use ($section_tipo_key, $section_id_key) {
			return !(
				isset($item->section_tipo_key)
				&& $item->section_tipo_key === $section_tipo_key
				&& isset($item->section_id_key)
				&& (int)$item->section_id_key === (int)$section_id_key
			);
		}));

		return $this->set_data($filtered);
	}//end remove_by_context


	/**
	 * GET_VALUE_BY_CONTEXT
	 * Get a single value by context
	 * @deprecated See get_data_by_context note.
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return mixed|null
	 */
	public function get_value_by_context(string $section_tipo_key, int $section_id_key) {
		$context_data = $this->get_data_by_context($section_tipo_key, $section_id_key);
		if (empty($context_data)) {
			return null;
		}

		return $context_data[0]->value ?? null;
	}//end get_value_by_context


	/**
	 * UPDATE_VALUE_BY_CONTEXT
	 * Update value for a specific context
	 * @deprecated See get_data_by_context note.
	 * @param mixed $value
	 * @param string $section_tipo_key
	 * @param int $section_id_key
	 * @return bool
	 */
	public function update_value_by_context($value, string $section_tipo_key, int $section_id_key) : bool {
		$data = $this->get_data() ?? [];
		$found = false;

		foreach ($data as $item) {
			if (isset($item->section_tipo_key)
				&& $item->section_tipo_key === $section_tipo_key
				&& isset($item->section_id_key)
				&& (int)$item->section_id_key === (int)$section_id_key) {
					$item->value = $value;
					$found = true;
				break;
			}
		}

		if (!$found) {
			return $this->add_value_with_context($value, $section_tipo_key, $section_id_key);
		}

		return $this->set_data($data);
	}//end update_value_by_context
}
