<?php
declare(strict_types=1);
/**
* CLASS LOCATOR
*
*	Format:
*
*		$locator->section_top_tipo		= (string)$section_top_tipo;
*		$locator->section_top_id		= (string)$section_top_id;
*		$locator->section_id			= (string)$section_id; Mandatory
*		$locator->section_tipo			= (string)$section_tipo; Mandatory
*		$locator->component_tipo		= (string)$component_tipo; // destination component tipo
*		$locator->from_component_tipo	= (string)$component_tipo; // source component tipo
*		$locator->tag_id				= (string)$tag_id;
*		$locator->tag_component_tipo	= (string)$tag_component_tipo; // component that has the tag, in the same section (used by component_relation_index)
* 		$locator->tag_type				= (string)$tag_type; // reference to the type of the tag that the locator is referenced
* 		$locator->type					= (string)$type;
* 		$locator->type_rel				= (string)$type_rel; // type of rel (like unidirectional, bidirectional, multi directional, etc..) (used by component_relation_related)
*		$locator->section_id_key		= (int)$section_id_key; // dataframe index array number of the data that reference
*		$locator->tipo_key				= (string)$tipo_key; // dataframe tipo of the main component (component that has dataframe)
*
*	Note that properties could exists or not (they are created on the fly). Final result object only contain set properties and locator object could be empty or partially set.
*	For example, component portal only use section_tipo an section_id in many cases.
*
*/
class locator extends stdClass {


	const DELIMITER = '_';


	/**
	* __CONSTRUCT
	* @param object|null $data = null
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
	* SET_PAGINATED_KEY
	* @param int $value
	* @return bool
	*/
	public function set_paginated_key(int $value) : bool  {

		$this->paginated_key = $value;

		return true;
	}//end set_paginated_key



	/**
	* SET_LABEL
	* @param int $value
	* @return bool
	*/
	public function set_label(mixed $value) : bool  {

		// nothing to do. label is used only in pseudo-locators but not in normalized locator

		return true;
	}//end set_label



	/**
	* SET_TYPE
	* Only allow types defined in common::get_allowed_relation_types
	* @param string $value
	* @return bool
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
	* @param string $value
	* @return bool
	*/
	public function set_section_top_tipo(string $value) : bool {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
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
	* @param string|int $value
	* @return bool
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
	* SET_FROM_COMPONENT_TIPO
	* @param string $value
	* @return bool
	*/
	public function set_from_component_top_tipo(string $value) : bool {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
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
	* @param string|int $value
	* @return bool
	*/
	public function set_section_id(string|int $value) : bool {

		if(	abs(intval($value))<0
			&& $value!='unknown'
			&& strpos((string)$value, DEDALO_SECTION_ID_TEMP)===false
		) {
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
	* @param string $value
	* @return bool
	*/
	public function set_section_tipo(string $value) : bool {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
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
	* @param string $value
	* @return bool
	*/
	public function set_component_tipo(string $value) : bool {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
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
	* @param string $value
	* @return bool
	*/
	public function set_from_component_tipo(string $value) : bool {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
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
	* @param string|int $value
	* @return bool
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
	* @param string $value
	* @return bool
	*/
	public function set_tag_type(string $value) : bool {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
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
	* @param string $value
	* @return bool
	*/
	public function set_tag_component_tipo(string $value) : bool {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
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
	* @param string $value
	* @return bool
	*/
	public function set_type_rel(string $value) : bool {
		// No verification is made now
		$this->type_rel = $value;

		return true;
	}//end set_type_rel


	/**
	* SET_SECTION_ID_KEY
	* @param int|string $value
	* @return bool
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
	* SET_TIPO_KEY
	* @return
	*/
	public function set_tipo_key(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid tipo_key: $value", 1);
		}
		$this->tipo_key = $value;
	}//end set_tipo_key


	/**
	* SET_TIPO
	* @param string $value
	* 	like 'rsc36'
	* @return bool
	*/
	public function set_tipo(string $value) : bool {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
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
	* @param string $value
	* 	like 'lg-eng'
	* @return bool
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
	* @return object $response
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

		// section_id mandatory
			if (!isset($this->section_id)) {

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

		// OK message
			$response->result	= true;
			$response->msg		= 'OK. Locator is valid';
			$response->errors	= [];


		return $response;
	}//end check_locator



	/**
	* GET_TERM_ID_FROM_LOCATOR
	* Contract locator object as string like 'es1_185' (section_tipo and section_id)
	* @param object $locator
	* @return string $term_id
	* 	like 'test3_1'
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
	* @return string|null $section_id
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
	* @param object $locator
	* @return stdClass $locator
	*/
	public static function get_std_class(object $locator) : stdClass {

		$locator = json_encode($locator);
		$locator = json_decode($locator);

		return $locator;
	}//end get_std_class



	/**
	* LANG_TO_LANG_LOCATOR
	* Gets a lang like 'lg-spa' and it converts to lang locator like {"section_tipo":"lg-spa","section_id":17344}
	* @param string $lang
	* @return object $locator
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
	* @param object $locator1
	* @param object $locator2
	* @param array $ar_properties = []
	* @param array $ar_exclude_properties = []
	* @return bool $equal
	*/
	public static function compare_locators(object $locator1, object $locator2, array $ar_properties=[], array $ar_exclude_properties=[]) : bool {

		// ar_properties. If not defined, add all locators properties to compare
			if (empty($ar_properties)){
				foreach ($locator1 as $property => $value) {
					if (!in_array($property, $ar_exclude_properties)) {
						$ar_properties[] = $property;
					}
				}

				foreach ($locator2 as $property => $value) {
					if (!in_array($property, $ar_exclude_properties)) {
						$ar_properties[] = $property;
					}
				}

				$ar_properties = array_unique($ar_properties);
			}

		// equal . Default true
		$equal = true;

		// iterate properties
		foreach ((array)$ar_properties as $current_property) { // 'section_tipo','section_id','type','from_component_tipo','component_tipo','tag_id'

			#if (!is_object($locator1) || !is_object($locator2)) {
			#	$equal = false;
			#	break;
			#}

			$property_exists_in_l1 = property_exists($locator1, $current_property);
			$property_exists_in_l2 = property_exists($locator2, $current_property);


			# Test property exists in all locators
			#if (!property_exists($locator1, $current_property) && !property_exists($locator2, $current_property)) {
			if ($property_exists_in_l1===false && $property_exists_in_l2===false) {
				# Skip not existing properties
				#debug_log(__METHOD__." Skipped comparison property $current_property. Property not exits in any locator ", logger::DEBUG);
				continue;
			}

			# Test property exists only in one locator
			#if (property_exists($locator1, $current_property) && !property_exists($locator2, $current_property)) {
			if ($property_exists_in_l1===true && $property_exists_in_l2===false) {
				#debug_log(__METHOD__." Property $current_property exists in locator1 but not exits in locator2 (false is returned): ".to_string($locator1).to_string($locator2), logger::DEBUG);
				$equal = false;
				break;
			}
			#if (property_exists($locator2, $current_property) && !property_exists($locator1, $current_property)) {
			if ($property_exists_in_l2===true && $property_exists_in_l1===false) {
				#debug_log(__METHOD__." Property $current_property exists in locator2 but not exits in locator1 (false is returned): ".to_string($locator1).to_string($locator2), logger::DEBUG);
				$equal = false;
				break;
			}

			# Compare verified existing properties
			if ($current_property==='section_id') {
				if( $locator1->$current_property != $locator2->$current_property ) {
					$equal = false;
					break;
				}
			}else{
				if( $locator1->$current_property !== $locator2->$current_property ) {
					$equal = false;
					break;
				}
			}
		}

		return (bool)$equal;
	}//end compare_locators



	/**
	* IN_ARRAY_LOCATOR
	* Search given locator into array of locators matching the properties given
	* @param object $locator
	* @param array $ar_locator
	* @param array $ar_properties = []
	* @return bool $found
	*/
	public static function in_array_locator(object $locator, array $ar_locator, array $ar_properties=[]) : bool {

		$found = false;

		foreach ($ar_locator as $current_locator) {
			$found = self::compare_locators( $locator, $current_locator, $ar_properties );
			if($found===true) break;
		}

		return $found;
	}//end in_array_locator



	/**
	* GET_KEY_IN_ARRAY_LOCATOR
	* @param object $locator
	* @param array $ar_locator
	* @param array $ar_properties = ['section_id','section_tipo']
	* @return int|bool $key_founded
	* 	integer when found, boolean false otherwise
	*/
	public static function get_key_in_array_locator(object $locator, array $ar_locator, array $ar_properties=['section_id','section_tipo']) : int|bool {

		$key_founded = false;

		foreach ((array)$ar_locator as $key => $current_locator) {

			$result = self::compare_locators( $locator, $current_locator, $ar_properties );

			if($result===true) {
				$key_founded = $key;
				break;
			}
		}

		return $key_founded;
	}//end get_key_in_array_locator



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
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
	private function GetAccessor(string $variable) {
		if(property_exists($this, $variable)) {
			return (string)$this->$variable;
		}else{
			return false;
		}
	}



	/**
	* DESTRUCT
	* On destruct object, test if minimum data is set or not
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
