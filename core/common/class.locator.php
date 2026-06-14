<?php declare(strict_types=1);
/**
* CLASS LOCATOR
* Value object (DTO) that identifies a single addressable entity in Dédalo's data model.
*
* A locator is the universal pointer used throughout the platform to reference sections,
* components, tags, and language records. It is stored as JSON inside component data arrays
* (e.g. the value array of component_relation_* components) and exchanged between the
* PHP API, the JS client, and the diffusion layer.
*
* Properties are sparse: only the fields that are meaningful for a given use-case are set.
* The object serializes cleanly to JSON — absent properties simply do not appear.
*
* Core property schema:
*
*   $locator->section_tipo          (string) — ontology tipo of the target section (MANDATORY)
*   $locator->section_id            (string) — record id of the target section (MANDATORY)
*   $locator->component_tipo        (string) — destination component tipo within the target section
*   $locator->from_component_tipo   (string) — source component tipo where the relation was created
*   $locator->tag_id                (string) — id of the inline tag inside a component_text_area
*   $locator->tag_component_tipo    (string) — tipo of the component that holds the tag
*   $locator->tag_type              (string) — semantic tag kind: 'index', 'reference', 'draw', …
*   $locator->type                  (string) — relation type (e.g. 'dd_relation')
*   $locator->type_rel              (string) — directionality: 'unidirectional', 'bidirectional', …
*   $locator->id_key                (int)    — stable id pairing key for dataframe locators
*   $locator->section_id_key        (int)    — @deprecated legacy dataframe pairing key
*   $locator->section_tipo_key      (string) — @deprecated legacy section_tipo pairing key
*   $locator->section_top_tipo      (string) — hierarchical parent section tipo (v6 concept, being retired)
*   $locator->section_top_id        (string) — hierarchical parent section id (v6 concept, being retired)
*
* All setter methods validate their input with get_tld_from_tipo() or range checks
* and throw Exception on invalid values, ensuring corrupt locators are caught early.
*
* Extends stdClass so that extra properties added dynamically (e.g. pseudo-locators
* with an `id` field used by component_common::get_subdatum) are accepted transparently.
*
* @package Dédalo
* @subpackage Core
*/
class locator extends stdClass {


	/**
	* DELIMITER
	* Separator used to build compound string keys from locator fields (e.g. 'es1_185').
	* Shared constant so callers (e.g. component_date, build_locator_lookup_key) use the
	* same character and remain consistent even if it ever changes.
	* @var string
	*/
	const DELIMITER = '_';


	/**
	* __CONSTRUCT
	* Hydrates a new locator from a plain object, calling the typed setter for each
	* property found on $data. Unknown properties (those without a matching set_* method)
	* are still assigned via PHP's __call accessor so that ad-hoc pseudo-locator fields
	* (e.g. 'id', 'paginated_key') survive the round-trip.
	*
	* Passing null returns an empty locator — useful when the caller will set properties
	* individually via their set_* methods (the most common pattern in the codebase).
	*
	* @param object|null $data = null - Source plain-object to hydrate from. Null produces an empty locator.
	* @return void
	*/
	public function __construct( ?object $data=null ) {

		// null case
			if (is_null($data)) {
				return;
			}

		// Nothing to do on construct (for now)
			if (!is_object($data)) {

				$msg = " wrong data format. object expected. Given type: ".gettype($data);
				debug_log(__METHOD__
					. $msg
					.' data: ' . to_string($data)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump(debug_backtrace()[0], $msg);
				}

				// $this->errors[] = $msg;
				return;
			}

		// set all properties
			foreach ($data as $key => $value) {

				$method	= 'set_'.$key;

				$this->{$method}($value); // using accessors when not defined

				if (method_exists($this, $method)) {

					// $set_value = $this->{$method}($value);
					// if($set_value===false && empty($this->errors)) {
						// $this->errors[] = 'Invalid value for: '.$key.' . value: '.to_string($value);
					// }

				}else{

					if(SHOW_DEBUG===true) {
						debug_log(__METHOD__
							.' Remember: received property: "'.$key.'" is not defined as set method. Using setter accessors'. PHP_EOL
							.' locator data: ' . to_string($data)
							, logger::WARNING
						);
					}
					// $this->errors[] = 'Ignored received property: '.$key.' not defined as set method. Data: '. json_encode($data, JSON_PRETTY_PRINT);
				}
			}
	}//end __construct



	/**
	* __SET_STATE
	* Magic method to create a new object from an array.
	* It is used to regenerate the object from a serialized string (var_export)
	* like from var_export action in cache.
	*
	* PHP calls this when restoring a var_export()'d locator from opcode cache or
	* file cache. The $an_array argument is the associative array that var_export
	* produced; we cast it to object and delegate to the normal constructor so
	* all validation runs.
	* @param array $an_array - Property map produced by var_export.
	* @return object - Fully hydrated locator instance.
	*/
	public static function __set_state($an_array) : object {
        $obj = new locator(
			(object)$an_array
		);

        return $obj;
    }//end __set_state



	/**
	* SET_ID
	* Stores a generic integer id on the locator.
	* Used by pseudo-locators in component_common::get_subdatum() where the literal
	* component item id is attached to a transient locator so subdatum resolution
	* can match it without a real section_id.
	* @param int $value - Positive integer id.
	* @return bool - Always true.
	*/
	public function set_id(int $value) : bool  {

		$this->id = $value;

		return true;
	}//end set_id




	/**
	* SET_PAGINATED_KEY
	* Stores the zero-based pagination index that identifies which page of results
	* this locator addresses. Used internally when a component's data is split into
	* pages and each page is fetched as a separate sub-datum.
	* @param int $value - Zero-based page index.
	* @return bool - Always true.
	*/
	public function set_paginated_key(int $value) : bool  {

		$this->paginated_key = $value;

		return true;
	}//end set_paginated_key



	/**
	* SET_LABEL
	* No-op setter for the 'label' pseudo-property.
	* Labels appear on transient display locators (e.g. select-widget options) but are
	* never part of a normalized stored locator. The setter is defined so the constructor
	* does not log a warning when hydrating such pseudo-locators — the value is simply
	* discarded.
	* @param mixed $value - Ignored.
	* @return bool - Always true.
	*/
	public function set_label(mixed $value) : bool  {

		// nothing to do. label is used only in pseudo-locators but not in normalized locator

		return true;
	}//end set_label



	/**
	* SET_TYPE
	* Only allow types defined in common::get_allowed_relation_types
	*
	* Sets the relation type string (e.g. 'dd_relation', 'dd_text_tag').
	* A stricter allow-list validation against common::get_allowed_relation_types() is
	* commented out for now to avoid breaking callers that pass custom types; it can be
	* re-enabled once all relation types are registered in the ontology.
	* @param string $value - Relation type identifier.
	* @return bool - Always true.
	*/
	public function set_type(string $value) : bool  {
		/*
		$ar_allowed = common::get_allowed_relation_types();
		if( !in_array($value, $ar_allowed) ) {

			// $msg = 'Value is not allowed (invalid type) : '.to_string($value);

			debug_log(__METHOD__
				." Invalid type: " .PHP_EOL
				.' value: ' . to_string($value) .PHP_EOL
				.' Only are allowed: ' .PHP_EOL
				. json_encode($ar_allowed, JSON_PRETTY_PRINT)
				, logger::ERROR
			);
			// $this->errors[] = 'Ignored set type. '. $msg;

			return false;
		}
		*/
		$this->type = $value;

		return true;
	}//end set_type



	/**
	* SET  METHODS
	* Verify values and set property to current object
	*/



	/**
	* SET_SECTION_TOP_TIPO
	* (!) This property it is being abandoned in v6
	*
	* Sets the hierarchical parent section tipo used in deeply-nested grid components
	* (indexation_grid) to anchor a locator to its top-level section when the direct
	* section_tipo is a child. Must be a valid ontology tipo (passes get_tld_from_tipo).
	* @param string $value - Ontology tipo of the top-level section (e.g. 'oh1').
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_section_top_tipo(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			debug_log(__METHOD__
				. ' Invalid section_top_tipo' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid section_top_tipo: $value", 1);
		}
		$this->section_top_tipo = (string)$value;

		return true;
	}//end set_section_top_tipo



	/**
	* SET_SECTION_TOP_ID
	* (!) This property it is being abandoned in v6
	*
	* Sets the record id of the top-level (parent) section when working inside nested
	* grid components. Accepts int or numeric string; cast to string for storage.
	* @param string|int $value - Positive integer section id (or its string representation).
	* @return bool - True on success.
	* @throws Exception If the absolute integer value is less than 1.
	*/
	public function set_section_top_id(string|int $value) : bool {
		if(abs(intval($value))<1) {
			debug_log(__METHOD__
				. ' Invalid section_top_id' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid section_top_id: $value", 1);
		}
		$this->section_top_id = (string)$value;

		return true;
	}//end set_section_top_id



	/**
	* SET_FROM_COMPONENT_TOP_TIPO
	* Sets the top-level tipo of the component that is the hierarchical origin of the
	* relation (used in nested grid traversal). Must be a valid ontology tipo.
	* @param string $value - Ontology tipo of the originating top-level component.
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_from_component_top_tipo(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			debug_log(__METHOD__
				. ' Invalid from_component_tipo' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid from_component_tipo: $value", 1);
		}
		$this->from_component_top_tipo = (string)$value;

		return true;
	}//end set_from_component_top_tipo



	/**
	* SET_SECTION_ID
	* Sets the record id of the target section. The string 'unknown' is accepted as a
	* sentinel value for locators that have been created before the real id is known
	* (e.g. during a new-record workflow). Any other value must be a non-negative integer.
	* Note: the guard condition (abs(intval($value))<0) is currently unreachable because
	* abs() never returns a negative value; the exception is never raised in practice.
	* @param string|int $value - Record id or the literal string 'unknown'.
	* @return bool - Always true.
	*/
	public function set_section_id(string|int $value) : bool {

		if(	abs(intval($value))<0 && $value != 'unknown' ) {
			debug_log(__METHOD__
				. ' Invalid section_id' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid section_id: $value", 1);
		}

		$this->section_id = (string)$value;

		return true;
	}//end set_section_id



	/**
	* SET_SECTION_TIPO
	* Sets the ontology tipo that identifies the target section type (e.g. 'es1', 'rsc1').
	* This is one of the two mandatory locator properties; check_locator() enforces it.
	* Validated with get_tld_from_tipo() to reject malformed strings.
	* @param string $value - Valid ontology tipo for a section.
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_section_tipo(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			debug_log(__METHOD__
				. ' Invalid section_tipo' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid section_tipo: $value", 1);
		}
		$this->section_tipo = $value;

		return true;
	}//end set_section_tipo



	/**
	* SET_COMPONENT_TIPO
	* Sets the ontology tipo of the destination component within the target section.
	* When present, the locator points to a specific field rather than the whole record.
	* @param string $value - Valid ontology tipo for a component (e.g. 'rsc36').
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_component_tipo(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			debug_log(__METHOD__
				. ' Invalid component_tipo' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid component_tipo: $value", 1);
		}
		$this->component_tipo = $value;

		return true;
	}//end set_component_tipo



	/**
	* SET_FROM_COMPONENT_TIPO
	* Sets the ontology tipo of the component that created or owns the relation (source side).
	* Needed when the relation must be navigable in both directions and the origin
	* component differs from the component_tipo (destination side).
	* @param string $value - Valid ontology tipo for the source component.
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_from_component_tipo(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			debug_log(__METHOD__
				. ' Invalid from_component_tipo' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid from_component_tipo: $value", 1);
		}
		$this->from_component_tipo = $value;

		return true;
	}//end set_from_component_tipo



	/**
	* SET_TAG_ID
	* Set tag_id value as string
	* tags are used in the component_text_area to analyze transcriptions, descriptions etc.
	* Locator can define the specific tag to point a fragment of the text defined by the tag.
	* or specific reference to be linked.
	*
	* Tags are inline annotations inside a component_text_area. A locator with tag_id
	* pinpoints the exact annotation (e.g. an index entry, a person reference, or a drawn
	* region) rather than the whole text component. Must be a positive integer.
	* @param string|int $value - Positive integer id of the inline tag.
	* @return bool - True on success.
	* @throws Exception If the absolute integer value is less than 1.
	*/
	public function set_tag_id(string|int $value) : bool {
		if(abs(intval($value))<1) {
			debug_log(__METHOD__
				. ' Invalid tag_id' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid tag_id: $value", 1);
		}
		$this->tag_id = (string)$value;

		return true;
	}//end set_tag_id



	/**
	* SET_TAG_TYPE
	* Set tag_type value as string
	* tag_type defines the target tag in the tag_component_tipo as 'index', 'reference', 'draw', ...
	*
	* Stored as a tipo string (must pass get_tld_from_tipo) rather than a free-form
	* label, so tag types are always anchored to the ontology. Valid examples include
	* the tipos for 'index', 'reference', and 'draw' tag varieties.
	* @param string $value - Ontology tipo identifying the tag kind.
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_tag_type(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			debug_log(__METHOD__
				. ' Invalid from_component_tipo' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid from_component_tipo: $value", 1);
		}
		$this->tag_type = (string)$value;

		return true;
	}//end set_tag_type




	/**
	* SET_TAG_COMPONENT_TIPO
	* defines the target component that has the tag, usually a text_area as rsc36
	*
	* Identifies which component within the target section holds the inline tag referenced
	* by tag_id. Combined with section_tipo/section_id/tag_id, this uniquely addresses a
	* single annotation inside a rich-text field. Typically a component_text_area tipo.
	* @param string $value - Valid ontology tipo of the component that hosts the tag.
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_tag_component_tipo(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			debug_log(__METHOD__
				. ' Invalid component_tipo' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid component_tipo: $value", 1);
		}
		$this->tag_component_tipo = $value;

		return true;
	}//end set_tag_component_tipo



	/**
	* SET_TYPE_REL
	* Only define relation direction
	* Sets the directionality of the relation this locator belongs to.
	* Expected values include 'unidirectional', 'bidirectional', and 'multidirectional',
	* as consumed by component_relation_related. No further validation is performed because
	* the allowed set may expand with new component types.
	* @param string $value - Relation directionality descriptor.
	* @return bool - Always true.
	*/
	public function set_type_rel(string $value) : bool {
		// No verification is made now
		$this->type_rel = $value;

		return true;
	}//end set_type_rel


	/**
	* SET_ID_KEY
	* Dataframe pairing key: the stable `id` of the main component data item
	* that this dataframe locator extends (relation and literal components alike).
	* Replaces the legacy `section_id_key` / `section_tipo_key` pair.
	*
	* A dataframe component (component_dataframe) attaches supplementary data to a
	* specific item inside a parent component. id_key is the `id` integer from that
	* parent item, making the pairing stable across edits. Must be a positive integer.
	* See memory entry "IRI id dataframe pairing" for the full contract.
	* @param int|string $value - Positive integer id_key (string form also accepted for JSON hydration).
	* @return bool - True on success.
	* @throws Exception If the cast integer value is less than 1.
	*/
	public function set_id_key(int|string $value) : bool {

		if((int)$value < 1) {
			debug_log(__METHOD__
				. ' Invalid id_key (only positive integers are allowed)' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid id_key: $value", 1);
		}
		$this->id_key = (int)$value;

		return true;
	}//end set_id_key



	/**
	* SET_SECTION_ID_KEY
	* @deprecated Legacy dataframe pairing key, replaced by `id_key`.
	* Kept to read pre-migration data.
	*
	* In earlier versions dataframe items were paired using the section_id of the
	* parent record rather than the stable item id. This setter is retained so
	* legacy stored locators hydrate without errors. New code must use id_key.
	* @param int|string $value - Non-negative integer (string form accepted for JSON hydration).
	* @return bool - True on success.
	* @throws Exception If the cast integer value is negative.
	*/
	public function set_section_id_key(int|string $value) : bool {

		if((int)$value < 0) {
			debug_log(__METHOD__
				. ' Invalid section_id_key (only integer are allowed)' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid section_id_key: $value", 1);
		}
		$this->section_id_key = (int)$value;

		return true;
	}//end set_section_id_key


	/**
	* SET_SECTION_TIPO_KEY
	* @deprecated Legacy dataframe pairing key dropped by the id_key unification.
	* Kept solely to hydrate pre-migration stored locators without throwing errors.
	* New code must not set or read this property; use id_key instead.
	* @param string $value - Ontology tipo (validated with get_tld_from_tipo).
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_section_tipo_key(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid section_tipo_key: $value", 1);
		}
		$this->section_tipo_key = $value;

		return true;
	}//end set_section_tipo_key



	/**
	* SET_MAIN_COMPONENT_TIPO
	* Used by dataframe to identify its own main component
	*
	* When a component_dataframe is resolved, it needs to know which parent component
	* its rows belong to. main_component_tipo carries the tipo of that parent so the
	* dataframe can scope its data correctly without relying on the calling context.
	* @param string $value - Ontology tipo of the owning parent component.
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_main_component_tipo(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid main_component_tipo: $value", 1);
		}
		$this->main_component_tipo = $value;

		return true;
	}//end set_main_component_tipo


	/**
	* SET_TIPO
	* Sets a generic 'tipo' property on the locator.
	* Used in contexts where the locator itself must carry an ontology tipo that is
	* neither a section nor a component tipo — for example when a locator represents
	* a term node rather than a record.
	* @param string $value - Valid ontology tipo string (e.g. 'rsc36').
	* @return bool - True on success.
	* @throws Exception If $value is not a valid ontology tipo.
	*/
	public function set_tipo(string $value) : bool {
		if(!get_tld_from_tipo($value)) {
			debug_log(__METHOD__
				. ' Invalid tipo' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid tipo: $value", 1);
		}
		$this->tipo = $value;

		return true;
	}//end set_tipo



	/**
	* SET_LANG
	* Sets a language code on the locator.
	* Language codes in Dédalo always start with the 'lg-' prefix (e.g. 'lg-eng', 'lg-spa').
	* This setter enforces that prefix so malformed codes are caught at assignment time
	* rather than propagating silently through API responses.
	* @param string $value - Language code starting with 'lg-' (e.g. 'lg-eng').
	* @return bool - True on success.
	* @throws Exception If $value does not start with 'lg-'.
	*/
	public function set_lang(string $value) : bool {
		if(strpos($value, 'lg-')!==0) {
			debug_log(__METHOD__
				. ' Invalid lang' . PHP_EOL
				. ' value: ' . to_string($value)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid lang: $value", 1);
		}
		$this->lang = $value;

		return true;
	}//end set_lang



	/**
	* CHECK_LOCATOR
	* Check locator integrity and mandatory properties
	*
	* Validates that the two mandatory properties — section_tipo and section_id — are
	* present, non-empty, pass the safe_tipo/safe_section_id security filters, and that
	* section_tipo is a known ontology tipo (via ontology_utils::check_tipo_is_valid).
	*
	* Returns a stdClass response object with:
	*   ->result  bool   — true if valid, false otherwise
	*   ->msg     string — human-readable summary
	*   ->errors  array  — list of specific error strings (empty on success)
	*
	* (!) Does NOT throw; callers must inspect ->result themselves.
	* @return object $response - Result object with bool result, msg, and errors array.
	*/
	public function check_locator() : object {

		$response = new stdClass();

		// section_tipo mandatory
			if (!isset($this->section_tipo) || empty($this->section_tipo)) {

				$response->result	= false;
				$response->errors[] = 'Empty section_tipo';
				$response->msg		= 'Invalid locator: locator section_tipo is mandatory';

				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace()[1];
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' backtrace 1: ' . to_string($bt)
						, logger::ERROR
					);
				}

				return $response;
			}


		// safe section_tipo
			if (!safe_tipo($this->section_tipo)) {

				$response->result	= false;
				$response->errors[] = 'Invalid section_tipo';
				$response->msg		= 'Invalid locator: locator section_tipo is invalid';

				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace()[1];
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' backtrace 1: ' . to_string($bt)
						, logger::ERROR
					);
				}

				return $response;
			}

		// check valid section_tipo
			$tipo_is_valid = ontology_utils::check_tipo_is_valid($this->section_tipo);
			if ($tipo_is_valid===false) {
				$response->result	= false;
				$response->errors[] = 'Invalid locator target section_tipo.';
				$response->msg		= 'Invalid locator: locator section_tipo is invalid';

				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace()[1];
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' backtrace 1: ' . to_string($bt)
						, logger::ERROR
					);
				}
			}

		// section_id mandatory
			if (!isset($this->section_id) || empty($this->section_id)) {

				$response->result	= false;
				$response->errors[] = 'Empty section_id';
				$response->msg		= 'Invalid locator: locator section_id is mandatory';

				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace()[1];
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' backtrace 1: ' . to_string($bt)
						, logger::ERROR
					);
				}

				return $response;
			}

		// safe section_id
			if (!safe_section_id($this->section_id)) {

				$response->result	= false;
				$response->errors[] = 'Invalid section_id';
				$response->msg		= 'Invalid locator: locator section_id is invalid';

				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace()[1];
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. ' backtrace 1: ' . to_string($bt)
						, logger::ERROR
					);
				}

				return $response;
			}

		// OK message
			$response->result	= true;
			$response->msg		= 'OK. Locator is valid';
			$response->errors	= [];


		return $response;
	}//end check_locator



	/**
	* GET_TERM_ID_FROM_LOCATOR
	* Contract locator object as string like 'es1_185' (section_tipo and section_id)
	*
	* Produces the canonical string form of a locator used as a term identifier in
	* thesaurus and search contexts. The format is always '<section_tipo>_<section_id>'
	* joined by DELIMITER, e.g. 'es1_185'.
	* @param object $locator - Locator with at least section_tipo and section_id set.
	* @return string $term_id - Compound term id like 'test3_1'.
	*/
	public static function get_term_id_from_locator(object $locator) : string {

		// if (is_string($locator)) {
		// 	// Decode json
		// 	$locator = json_decode($locator);
		// }

		// if (is_array($locator)) {
		// 	$ar_locators = [];
		// 	foreach ($locator as $key => $current_locator) {
		// 		$ar_locators[] = $current_locator->section_tipo . '_' . $current_locator->section_id;
		// 	}
		// 	return $ar_locators;
		// }else{
		// 	$term_id = $locator->section_tipo . '_' . $locator->section_id;
		// }

		$term_id = $locator->section_tipo . '_' . $locator->section_id;


		return $term_id;
	}//end get_term_id_from_locator



	/**
	* GET_SECTION_ID_FROM_LOCATOR
	* Get section_id value of current locator
	*
	* Safe accessor that returns null when section_id is absent rather than
	* triggering a PHP notice on undefined property access.
	* @param object $locator - Any locator object (section_id may be absent).
	* @return string|null $section_id - The section_id string, or null if not set.
	*/
	public static function get_section_id_from_locator(object $locator) : ?string {

		// if (is_string($locator)) {
		// 	// Decode json
		// 	$locator = json_decode($locator);
		// }

		// if (is_array($locator)) {
		// 	$ar_locators = [];
		// 	foreach ($locator as $key => $current_locator) {
		// 		$ar_locators[] = (int)$current_locator->section_id;
		// 	}
		// 	return $ar_locators;
		// }else{
		// 	$section_id = (int)$locator->section_id;
		// }

		$section_id = $locator->section_id ?? null;


		return $section_id;
	}//end get_section_id_from_locator



	/**
	* GET_STD_CLASS
	* converts locator object to PHP stdClass
	*
	* Strips the locator class identity by round-tripping through JSON encode/decode.
	* The result is a plain stdClass with only the properties that were set on the
	* locator, suitable for passing to contexts that expect a generic object (e.g.
	* JSON API responses, cache serialization).
	* @param object $locator - Source locator instance.
	* @return stdClass $locator - Plain stdClass copy of the locator's properties.
	*/
	public static function get_std_class(object $locator) : stdClass {

		$locator = json_encode($locator);
		$locator = json_decode($locator);

		return $locator;
	}//end get_std_class



	/**
	* LANG_TO_LOCATOR
	* Gets a lang like 'lg-spa' and it converts to lang locator like {"section_tipo":"lg-spa","section_id":17344}
	*
	* Translates a Dédalo language code to the locator that points to the corresponding
	* record in the languages section (DEDALO_LANGS_SECTION_TIPO). Common codes are
	* resolved through a fast switch-case look-up using hard-coded section_ids. For
	* codes not in the table, a database query is performed via lang::get_section_id_from_code.
	*
	* (!) The hard-coded section_ids (17344, 5101, etc.) are Dédalo platform constants
	* that identify language records across all installations. Do not change them unless
	* the underlying language-section records are migrated.
	* @param string $lang - Dédalo language code starting with 'lg-' (e.g. 'lg-spa').
	* @return object $locator - Locator pointing to the language record in the languages section.
	*/
	public static function lang_to_locator(string $lang) : object {

		$section_tipo = DEDALO_LANGS_SECTION_TIPO;	//$lang;

		switch ($lang) {
			case 'lg-spa':	$section_id = 17344;	break;
			case 'lg-eng':	$section_id = 5101;		break;
			case 'lg-cat':	$section_id = 3032;		break;
			case 'lg-vlca':	$section_id = 20155;	break;
			case 'lg-fra':	$section_id = 5450;		break;
			case 'lg-eus':	$section_id = 5223;		break;
			case 'lg-por':	$section_id = 14895;	break;
			case 'lg-ara':	$section_id = 841;		break;
			default:
				// Search in database
				$section_id = lang::get_section_id_from_code($lang);
				break;
		}

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);

		return $locator;
	}//end lang_to_lang_locator



	/**
	* COMPARE_LOCATORS
	* Compare property by property two locators
	* check if locator1 is equal to locator2
	*
	* Compares two locators property by property. When $ar_properties is empty, all
	* properties present on either locator are compared (excluding anything listed in
	* $ar_exclude_properties). Uses array_flip for O(1) exclusion lookups.
	*
	* Special case: section_id uses loose comparison (!=) because it may be stored as
	* int in one locator and as string in another depending on the hydration path.
	* All other properties use strict (===) comparison.
	*
	* Returns false as soon as a mismatch is found; returns true only when every
	* compared property is equal and present in both locators.
	* @param object $locator1 - First locator to compare.
	* @param object $locator2 - Second locator to compare.
	* @param array $ar_properties = [] - Explicit list of property names to compare. If empty, all properties from both locators are used.
	* @param array $ar_exclude_properties = [] - Property names to skip when auto-building the comparison list.
	* @return bool $equal - True if the locators are equal for all compared properties.
	*/
	public static function compare_locators(object $locator1, object $locator2, array $ar_properties=[], array $ar_exclude_properties=[]) : bool {

		// ar_properties. If not defined, add all locators properties to compare
		if (empty($ar_properties)) {
			// Use array_flip for O(1) lookup instead of in_array O(n)
			$exclude_map = array_flip($ar_exclude_properties);
			$ar_properties = [];

			foreach ($locator1 as $property => $value) {
				if (!isset($exclude_map[$property])) {
					$ar_properties[$property] = true;
				}
			}

			foreach ($locator2 as $property => $value) {
				if (!isset($exclude_map[$property])) {
					$ar_properties[$property] = true;
				}
			}

			// Get keys as the final property list
			$ar_properties = array_keys($ar_properties);
		}

		// Iterate properties and compare
		foreach ($ar_properties as $current_property) {

			$exists_in_l1 = property_exists($locator1, $current_property);
			$exists_in_l2 = property_exists($locator2, $current_property);

			// Both don't have the property - skip
			if (!$exists_in_l1 && !$exists_in_l2) {
				continue;
			}

			// Only one has the property - not equal
			if ($exists_in_l1 !== $exists_in_l2) {
				return false;
			}

			// Both have the property - compare values
			// Special case for section_id: use loose comparison (!=) instead of strict (!==)
			// because section_id could be an int or string
			if ($current_property === 'section_id') {
				if ($locator1->$current_property != $locator2->$current_property) {
					return false;
				}
			} else {
				if ($locator1->$current_property !== $locator2->$current_property) {
					return false;
				}
			}
		}

		return true;
	}//end compare_locators



	/**
	* IN_ARRAY_LOCATOR
	* Search given locator into array of locators matching the properties given
	*
	* Determines whether $locator is already present in $ar_locator by building a
	* hash key from the specified properties and comparing against keys built for
	* each candidate. This avoids N×M property comparisons for large arrays.
	*
	* The default property list covers the fields most commonly used to define locator
	* uniqueness in relation components. Pass a custom $ar_properties list to narrow
	* or broaden the match criteria.
	* @param object $locator - Locator to search for.
	* @param array $ar_locator - Array of locator objects to search within.
	* @param array $ar_properties = ['section_tipo','section_id','type','component_tipo','tag_id'] - Properties used to build the comparison key.
	* @return bool $found - True if a matching locator was found.
	*/
	public static function in_array_locator(object $locator, array $ar_locator, array $ar_properties=['section_tipo','section_id','type','component_tipo','tag_id']) : bool {

		// Build lookup key once for the locator we're searching for
		$lookup_key_to_check = locator::build_locator_lookup_key($locator, $ar_properties);

		// Iterate through array and compare keys directly
		foreach ($ar_locator as $current_locator) {
			// Build lookup key for current locator
			$lookup_key = locator::build_locator_lookup_key($current_locator, $ar_properties);
			// Compare keys directly - if they match, we found it
			if ($lookup_key === $lookup_key_to_check) {
				return true;
			}
		}

		return false;
	}//end in_array_locator



	/**
	* GET_KEY_IN_ARRAY_LOCATOR
	* Returns the array key (index) of the first locator in $ar_locator that matches
	* $locator for the given properties, or false if not found.
	*
	* Useful when a caller needs to replace or remove a specific locator from an array
	* by index rather than merely testing for membership. Comparison uses the same
	* hash-key strategy as in_array_locator for performance.
	* @param object $locator - Locator to search for.
	* @param array $ar_locator - Array of locator objects to search within.
	* @param array $ar_properties = ['section_id','section_tipo'] - Properties used to build the comparison key.
	* @return int|bool $key_founded - Integer array key when found, boolean false otherwise.
	*/
	public static function get_key_in_array_locator(object $locator, array $ar_locator, array $ar_properties=['section_id','section_tipo']) : int|bool {

		// Build lookup key once for the locator we're searching for
		$lookup_key_to_check = locator::build_locator_lookup_key($locator, $ar_properties);

		// Iterate through array and compare keys directly
		foreach ((array)$ar_locator as $key => $current_locator) {
			// Build lookup key for current locator
			$lookup_key = locator::build_locator_lookup_key($current_locator, $ar_properties);
			// Compare keys directly - if they match, return the key
			if ($lookup_key === $lookup_key_to_check) {
				return $key;
			}
		}

		return false;
	}//end get_key_in_array_locator



	/**
	* BUILD_LOCATOR_LOOKUP_KEY
	* Builds a unique hash key from locator properties for fast duplicate detection
	*
	* Concatenates the values of the requested properties (missing properties become
	* empty strings) with DELIMITER ('_') as separator. The resulting string is used
	* by in_array_locator and get_key_in_array_locator to avoid O(n×m) comparisons.
	*
	* (!) Key collisions are theoretically possible if two locators share all requested
	* property values but differ on properties not included in $properties. Always pass
	* a property list that uniquely identifies the locators in the context of use.
	* @param object $locator - Locator from which to read properties.
	* @param array $properties = ['section_tipo','section_id','type','component_tipo','tag_id'] - Ordered list of property names to include in the key.
	* @return string $lookup_key - Underscore-delimited composite key string.
	*/
	public static function build_locator_lookup_key(object $locator, array $properties=['section_tipo','section_id','type','component_tipo','tag_id']) : string {

		$key_parts = [];
		foreach ($properties as $property) {
			$key_parts[] = $locator->$property ?? '';
		}

		return implode('_', $key_parts);
	}//end build_locator_lookup_key



	/**
	* __CALL
	* By accessors. When property exits, return property value, else return null
	*
	* Magic caller that intercepts get_* method calls and proxies them to GetAccessor.
	* This allows callers to use $locator->get_section_tipo() style instead of reading
	* the property directly. Only 'get_' prefix is handled; all other dynamic calls
	* return false.
	* @param string $strFunction - The called method name (e.g. 'get_section_tipo').
	* @param mixed $arArguments - Arguments passed to the call (unused for getters).
	* @return string|false - Property value cast to string, or false if not handled / not set.
	*/
	final public function __call(string $strFunction, $arArguments) {

		$strMethodType		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
				break;
		}
		return(false);
	}
	/**
	* GETACCESSOR
	* Returns the named property value cast to string, or false if the property
	* does not exist on this locator instance.
	* @param string $variable - Property name to read (without the 'get_' prefix).
	* @return string|false - String value of the property, or false when absent.
	*/
	private function GetAccessor(string $variable) : string|false {
		if(property_exists($this, $variable)) {
			return (string)$this->$variable;
		}else{
			return false;
		}
	}



	/**
	* DESTRUCT
	* On destruct object, test if minimum data is set or not
	*
	* In debug mode logs the full locator and a one-level backtrace for each missing
	* mandatory property (section_tipo, section_id) to help trace where incomplete
	* locators are created. In production mode only a concise error is logged.
	*
	* (!) This is a developer aid only; it does NOT throw or prevent destruction.
	* @return void
	*/
	function __destruct() {

		// ONLY FOR DEBUG !!
		if(SHOW_DEBUG===true) {
			if (!isset($this->section_tipo)) {
				$bt = debug_backtrace()[1];
				debug_log(__METHOD__
					. " Invalid locator: locator section_tipo is mandatory " . PHP_EOL
					. ' locator: '		. to_string($this) . PHP_EOL
					. ' backtrace [1]: '. to_string($bt)
					, logger::ERROR
				);
			}
			if (!isset($this->section_id)) {
				$bt = debug_backtrace()[1];
				debug_log(__METHOD__
					. " Invalid locator: locator section_id is mandatory " . PHP_EOL
					. ' locator: '		. to_string($this) . PHP_EOL
					. ' backtrace [1]: '. to_string($bt)
					, logger::ERROR
				);
			}
		}else{
			if (!isset($this->section_tipo) || !isset($this->section_id)) {
				debug_log(__METHOD__
					." ERROR: wrong locator format detected. Please fix this ASAP : "
					.' locator this: ' . to_string($this)
					, logger::ERROR
				);
			}
		}

	}//end __destruct



}//end class locator
