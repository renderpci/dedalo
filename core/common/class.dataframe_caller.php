<?php declare(strict_types=1);
/**
* CLASS DATAFRAME_CALLER
* Typed DTO carrying the caller context that pairs a component_dataframe instance
* with exactly one data item of its main component.
*
* A component_dataframe slot holds frame locators for every item of the main
* component. To read or write only the frames for a particular item, callers
* must supply this DTO so that the match predicate can filter down to the right
* subset. Every construction path that creates a component_dataframe instance
* (JSON controller, subdatum builder, time-machine save) must supply one.
*
* Unified pairing contract (see docs/core/components/component_dataframe.md):
*
*   $dataframe_caller->section_tipo         = (string) section tipo of the host record (where main + frame locators live)
*   $dataframe_caller->section_id           = (string|int) section id of the host record
*   $dataframe_caller->main_component_tipo  = (string) tipo of the main component the dataframe extends
*   $dataframe_caller->id_key               = (int) stable item `id` of the main component datum being extended
*
* The match predicate applied by trait.dataframe_common::dataframe_entry_matches() is:
*   (type=DEDALO_RELATION_TYPE_DATAFRAME, from_component_tipo, main_component_tipo, id_key)
*
* Legacy support: data written before the v7 unification uses `section_id_key`
* (+ `section_tipo_key`) instead of `id_key`. from_legacy() normalizes any
* legacy stdClass shape into this DTO; the deprecated aliases are kept in sync
* on every instance so dual-read code still works until the migration has run.
*
* Loaded unconditionally at boot from core/base/class.loader.php. Extends
* stdClass so that legacy code treating the DTO as a plain object continues to
* work without modification.
*
* @package Dédalo
* @subpackage Core
*/
class dataframe_caller extends stdClass {



	/**
	* Ontology tipo of the host section record — e.g. 'oh1'. The host section
	* is the record whose `relations` container holds the frame pairing locators.
	* Validated on construction: must parse as a known tld prefix.
	* @var string $section_tipo
	*/
	public string		$section_tipo;

	/**
	* Database id of the host section record. String when it comes from the
	* JSON layer (section ids travel as strings); int when set programmatically.
	* Defaults to 0 when a legacy caller carried no section_id (uncommon).
	* @var string|int $section_id
	*/
	public string|int	$section_id;

	/**
	* Ontology tipo of the main component this dataframe extends — e.g. 'oh22'.
	* The main component is the one whose individual data items carry `id` counters
	* that id_key points at. Validated on construction.
	* @var string $main_component_tipo
	*/
	public string		$main_component_tipo;

	/**
	* Stable item-level id of the main component datum being extended.
	* Server-minted, immutable, and order-independent: the pairing survives
	* reordering or re-pointing the main locator because it follows this id,
	* not the array index or the target record. Must be >= 1.
	* @var int $id_key
	*/
	public int			$id_key;

	/**
	* Legacy alias for id_key, kept in sync by __construct and from_legacy
	* so that pre-migration code filtering by section_id_key still works.
	* After the dataframe_v7_migration update runs, all data uses id_key and
	* this property becomes unused.
	* @deprecated Use id_key instead.
	* @var int $section_id_key
	*/
	public int			$section_id_key;

	/**
	* Legacy alias that formerly distinguished which section tipo held the frame
	* pairing. Dropped by the id_key unification (the frame record's target
	* section_tipo lives in the locator itself, not in the caller). Kept in sync
	* with section_tipo unless a divergent value was explicitly set in legacy data
	* (see from_legacy()).
	* @deprecated Dropped by the id_key unification.
	* @var string $section_tipo_key
	*/
	public string		$section_tipo_key;



	/**
	* __CONSTRUCT
	* Builds a fully typed dataframe_caller DTO and validates the supplied values.
	* The canonical construction path — prefer this over stdClass literals.
	* Use trait.dataframe_common::build_dataframe_caller() when building from
	* inside a main component (it forwards its own tipo/section as arguments).
	* @param string $section_tipo - ontology tipo of the host section record
	* @param string|int $section_id - id of the host section record (0 when unknown)
	* @param string $main_component_tipo - tipo of the main component the dataframe extends
	* @param int $id_key - stable item id of the main datum being paired (>= 1)
	*/
	public function __construct( string $section_tipo, string|int $section_id, string $main_component_tipo, int $id_key ) {

		$this->section_tipo			= $section_tipo;
		$this->section_id			= $section_id;
		$this->main_component_tipo	= $main_component_tipo;
		$this->id_key				= $id_key;

		// legacy aliases kept in sync (dual-read transition)
		// (!) Keep these assignments mirroring id_key and section_tipo so that
		// pre-migration readers that filter by section_id_key / section_tipo_key
		// still receive the correct values from a typed DTO instance.
		$this->section_id_key		= $id_key;
		$this->section_tipo_key		= $section_tipo;

		$this->validate();
	}//end __construct



	/**
	* FROM_LEGACY
	* Normalizes any stdClass caller_dataframe shape — legacy or unified — into
	* a typed dataframe_caller instance. Called at the set_caller_dataframe boundary
	* in component_common and at every code path that may receive an untyped object
	* from the JSON API or time-machine storage.
	*
	* Legacy shape: {section_tipo|section_tipo_key, section_id?, section_id_key, main_component_tipo}
	* Unified shape: {section_tipo, section_id?, id_key, main_component_tipo}
	*
	* Resolution order for ambiguous keys:
	*   id_key:       id_key (unified) → section_id_key (legacy)
	*   section_tipo: section_tipo (unified) → section_tipo_key (legacy)
	*
	* Returns null — and logs logger::ERROR — when any of the three mandatory
	* fields (id_key, section_tipo, main_component_tipo) is missing. Callers must
	* check for null before using the result.
	* @param object $caller_dataframe - stdClass or dataframe_caller received from any source
	* @return dataframe_caller|null - null when mandatory fields are absent
	*/
	public static function from_legacy( object $caller_dataframe ) : ?dataframe_caller {

		// already typed
		// Short-circuit: the DTO is idempotent through this gate.
		if ($caller_dataframe instanceof dataframe_caller) {
			return $caller_dataframe;
		}

		// id_key resolution
		// Prefer the unified id_key; fall back to legacy section_id_key.
		$id_key = $caller_dataframe->id_key
			?? $caller_dataframe->section_id_key
			?? null;

		// section_tipo resolution
		// Prefer the unified section_tipo; fall back to legacy section_tipo_key.
		$section_tipo = $caller_dataframe->section_tipo
			?? $caller_dataframe->section_tipo_key
			?? null;
		$main_component_tipo = $caller_dataframe->main_component_tipo ?? null;

		// mandatory field guard
		// All three fields are required to build a valid match predicate.
		// section_id is optional (defaults to 0); the host section may not be
		// known at the point a frame was written in some legacy paths.
		if ($id_key===null || $section_tipo===null || $main_component_tipo===null) {
			debug_log(__METHOD__
				. ' Unable to normalize legacy caller_dataframe: missing mandatory properties' . PHP_EOL
				. ' caller_dataframe: ' . to_string($caller_dataframe)
				, logger::ERROR
			);
			return null;
		}

		$dataframe_caller = new dataframe_caller(
			(string)$section_tipo,
			$caller_dataframe->section_id ?? 0,
			(string)$main_component_tipo,
			(int)$id_key
		);

		// divergent legacy section_tipo_key override
		// In most legacy data section_tipo_key === section_tipo, so __construct's
		// sync is correct. A small set of pre-migration records carried a
		// section_tipo_key that differed from section_tipo (the frame target
		// section was recorded there, not the host section). Preserve that
		// original value so the legacy consistency check in dataframe_entry_matches
		// still passes for those entries.
		if (isset($caller_dataframe->section_tipo_key)) {
			$dataframe_caller->section_tipo_key = (string)$caller_dataframe->section_tipo_key;
		}

		return $dataframe_caller;
	}//end from_legacy



	/**
	* VALIDATE
	* Checks that all mandatory properties hold semantically valid values and
	* logs logger::ERROR for each violation found. Does not throw — the caller
	* decides whether an invalid DTO is fatal. Called automatically by __construct.
	*
	* Checks performed:
	* - section_tipo must parse as a valid ontology tld (get_tld_from_tipo).
	* - main_component_tipo must parse as a valid ontology tld.
	* - id_key must be >= 1 (server-minted ids start at 1; 0 is unset / invalid).
	* @return bool - true when all checks pass; false when at least one fails
	*/
	public function validate() : bool {

		$valid = true;

		// section_tipo check
		// get_tld_from_tipo returns false for strings with no leading letter prefix
		// (e.g. numeric strings, empty string). A falsy result means the tipo is
		// not a valid ontology node reference.
		if (!get_tld_from_tipo($this->section_tipo)) {
			debug_log(__METHOD__
				. ' Invalid dataframe_caller section_tipo: ' . to_string($this->section_tipo)
				, logger::ERROR
			);
			$valid = false;
		}

		// main_component_tipo check
		// Same rule: must carry an alphabetic tld prefix such as 'oh', 'rsc', 'dd'.
		if (!get_tld_from_tipo($this->main_component_tipo)) {
			debug_log(__METHOD__
				. ' Invalid dataframe_caller main_component_tipo: ' . to_string($this->main_component_tipo)
				, logger::ERROR
			);
			$valid = false;
		}

		// id_key check
		// id_key is a per-component item counter starting at 1. A value of 0 means
		// the item id was not set yet (e.g. an unsaved dato), which is a programming
		// error at the call site — the save-then-attach sequence must mint the id
		// before creating a caller.
		if ($this->id_key < 1) {
			debug_log(__METHOD__
				. ' Invalid dataframe_caller id_key (positive integer expected): ' . to_string($this->id_key)
				, logger::ERROR
			);
			$valid = false;
		}

		return $valid;
	}//end validate



}//end class dataframe_caller
