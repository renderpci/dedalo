<?php declare(strict_types=1);
/**
* CLASS DATAFRAME_CALLER
*
* Typed DTO that defines the caller context used to pair a component_dataframe
* instance with one data item of its main component.
*
* Unified pairing contract (see docs/core/components/component_dataframe.md):
*
*	$dataframe_caller->section_tipo			= (string) section_tipo of the host section record (where main + dataframe data live)
*	$dataframe_caller->section_id			= (string|int) section_id of the host section record
*	$dataframe_caller->main_component_tipo	= (string) tipo of the main component the dataframe extends
*	$dataframe_caller->id_key				= (int) stable `id` of the main component data item being extended
*
* The match predicate against dataframe locators is:
*	(type, from_component_tipo, main_component_tipo, id_key)
*
* Legacy support: pre-migration callers used `section_id_key` (+ `section_tipo_key`).
* from_legacy() normalizes a legacy stdClass shape into this DTO; legacy properties
* are kept in sync on the instance so pre-migration data remains readable until
* the data migration has run.
*/
class dataframe_caller extends stdClass {



	public string		$section_tipo;
	public string|int	$section_id;
	public string		$main_component_tipo;
	public int			$id_key;

	// Legacy aliases (pre id_key unification). Kept in sync by the setters
	// so pre-migration readers (filter by section_id_key/section_tipo_key)
	// keep working until the data migration has run.
	// @deprecated use id_key
	public int			$section_id_key;
	// @deprecated dropped by the id_key unification
	public string		$section_tipo_key;



	/**
	* __CONSTRUCT
	* @param string $section_tipo
	* @param string|int $section_id
	* @param string $main_component_tipo
	* @param int $id_key
	*/
	public function __construct( string $section_tipo, string|int $section_id, string $main_component_tipo, int $id_key ) {

		$this->section_tipo			= $section_tipo;
		$this->section_id			= $section_id;
		$this->main_component_tipo	= $main_component_tipo;
		$this->id_key				= $id_key;

		// legacy aliases kept in sync (dual-read transition)
		$this->section_id_key		= $id_key;
		$this->section_tipo_key		= $section_tipo;

		$this->validate();
	}//end __construct



	/**
	* FROM_LEGACY
	* Normalizes a legacy stdClass caller_dataframe shape
	* ({section_tipo, section_id?, section_id_key, section_tipo_key, main_component_tipo})
	* into a typed dataframe_caller instance.
	* @param object $caller_dataframe
	* @return dataframe_caller|null
	*/
	public static function from_legacy( object $caller_dataframe ) : ?dataframe_caller {

		// already typed
		if ($caller_dataframe instanceof dataframe_caller) {
			return $caller_dataframe;
		}

		$id_key = $caller_dataframe->id_key
			?? $caller_dataframe->section_id_key
			?? null;
		$section_tipo = $caller_dataframe->section_tipo
			?? $caller_dataframe->section_tipo_key
			?? null;
		$main_component_tipo = $caller_dataframe->main_component_tipo ?? null;

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

		// preserve a divergent legacy section_tipo_key if it was set explicitly
		if (isset($caller_dataframe->section_tipo_key)) {
			$dataframe_caller->section_tipo_key = (string)$caller_dataframe->section_tipo_key;
		}

		return $dataframe_caller;
	}//end from_legacy



	/**
	* VALIDATE
	* Checks mandatory properties, logging ERROR on invalid values.
	* @return bool
	*/
	public function validate() : bool {

		$valid = true;

		if (!get_tld_from_tipo($this->section_tipo)) {
			debug_log(__METHOD__
				. ' Invalid dataframe_caller section_tipo: ' . to_string($this->section_tipo)
				, logger::ERROR
			);
			$valid = false;
		}
		if (!get_tld_from_tipo($this->main_component_tipo)) {
			debug_log(__METHOD__
				. ' Invalid dataframe_caller main_component_tipo: ' . to_string($this->main_component_tipo)
				, logger::ERROR
			);
			$valid = false;
		}
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
