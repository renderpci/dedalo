<?php
/**
* CLASS LOCATOR
*
*	Format:
*
*		$locator->section_top_tipo		= (string)$section_top_tipo;
*		$locator->section_top_id		= (string)$section_top_id;
*		$locator->section_id			= (string)$section_id;
*		$locator->section_tipo			= (string)$section_tipo;
*		$locator->component_tipo		= (string)$component_tipo; // destination component tipo
*		$locator->from_component_tipo	= (string)$component_tipo; // source component tipo
*		$locator->tag_id				= (string)$tag_id;
*		$locator->tag_component_tipo	= (string)$tag_component_tipo; // component that has the tag, in the same section (used for component_relation_index)
* 		$locator->type					= (string)$type;
*		$locator->section_id_key		= (int)$section_id_key; // dataframe index array number of the data that reference
*
*	Note that properties could exists or not (they are created on the fly). Final result object only contain set properties and locator object could be empty or partially set.
*	For example, component portal only use section_tipo an section_id in many cases.
*
*/
class locator extends stdClass {



	/* Created on the fly
		private $section_top_tipo;
		private $section_top_id;
		private $from_component_tipo;
		private $section_id;
		private $section_tipo;
		private $component_tipo;
		private $tag_id;
		private $tag_component_tipo;
		private $section_id_key;
	*/

	# Mandatory and protected (use set/get to access)
	#protected $section_id;
	#protected $section_tipo;

	/*
		#$rel_locator->set_section_top_tipo( $section_top_tipo );
		$rel_locator->set_section_top_id( $section_top_id );
		$rel_locator->set_section_tipo( $section_tipo );
		$rel_locator->set_section_id( $parent );
		$rel_locator->set_component_tipo( $tipo );
		$rel_locator->set_tag_id( $tag_value );
	*/



	const DELIMITER = '_';



	/**
	* __CONSTRUCT
	* @param object $data = null
	*/
	public function __construct( object $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			return;
		}
		foreach ($data as $key => $value) {
			$method = 'set_'.$key;
			$this->$method($value);
		}
	}//end __construct



	/**
	* SET  METHODS
	* Verify values and set property to current object
	*/
	/**
	* SET_SECTION_TOP_TIPO
	*/
	public function set_section_top_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid section_top_tipo: $value", 1);
		}
		$this->section_top_tipo = (string)$value;
	}
	/**
	* SET_SECTION_TOP_ID
	*/
	public function set_section_top_id($value) {
		if(abs(intval($value))<1) {
			throw new Exception("Error Processing Request. Invalid section_top_id: $value", 1);
		}
		$this->section_top_id = (string)$value;
	}
	/**
	* SET_FROM_COMPONENT_TIPO
	*/
	public function set_from_component_top_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid from_component_tipo: $value", 1);
		}
		$this->from_component_top_tipo = (string)$value;
	}
	/**
	* SET_SECTION_ID
	*/
	public function set_section_id($value) {
		#if(abs($value)<1 && $value!='unknown' && strpos($value, DEDALO_SECTION_ID_TEMP)===false) {
		if(abs(intval($value))<0 && $value!='unknown' && strpos($value, DEDALO_SECTION_ID_TEMP)===false) {
			throw new Exception("Error Processing Request. Invalid section_id: $value", 1);
		}

		$this->section_id = (string)$value;
	}
	/**
	* SET_SECTION_TIPO
	*/
	public function set_section_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid section_tipo: $value", 1);
		}
		$this->section_tipo = $value;
	}
	/**
	* SET_COMPONENT_TIPO
	*/
	public function set_component_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid component_tipo: $value", 1);
		}
		$this->component_tipo = $value;
	}
	/**
	* SET_FROM_COMPONENT_TIPO
	*/
	public function set_from_component_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid from_component_tipo: $value", 1);
		}
		$this->from_component_tipo = $value;
	}
	/**
	* SET_TAG_ID
	*/
	public function set_tag_id($value) {
		if(abs(intval($value))<1) {
			throw new Exception("Error Processing Request. Invalid tag_id: $value", 1);
		}
		$this->tag_id = (string)$value;
	}
	/**
	* SET_TAG_COMPONENT_TIPO
	*/
	public function set_tag_component_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid component_tipo: $value", 1);
		}
		$this->tag_component_tipo = $value;
	}

	/**
	* SET_TYPE
	* Only defined relation types (structure) ar allowed
	*/
	public function set_type(string $value) {
		$ar_allowed = common::get_allowed_relation_types();
		if( !in_array($value, $ar_allowed) ) {
			debug_log(__METHOD__
				. " Error Processing Request. Invalid locator type: ". json_encode($value) .PHP_EOL
				. ' allowed type: '. to_string($ar_allowed)
				, logger::ERROR
			);
			throw new Exception("Error Processing Request. Invalid locator type: $value. Only are allowed: ".to_string($ar_allowed), 1);
		}
		$this->type = $value;
	}
	/**
	* SET_TYPE_REL
	* Only defined relation direction
	*/
	public function set_type_rel(string $value) {
		# No verification is made now
		$this->type_rel = $value;
	}
	/**
	* SET_section_id_key
	* @return
	*/
	public function set_section_id_key(int $value) {
		if(int($value)<0) {
			throw new Exception("Error Processing Request. Invalid section_id_key: $value", 1);
		}
		$this->type = $value;
	}//end set_section_id_key
	/**
	* SET_TIPO
	*/
	public function set_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid section_top_tipo: $value", 1);
		}
		$this->tipo = $value;
	}// end set_tipo
	/**
	* SET_LANG
	*/
	public function set_lang(string $value) {
		if(strpos($value, 'lg-')!==0) {
			throw new Exception("Error Processing Request. Invalid lang: $value", 1);
		}
		$this->lang = $value;
	}//end set_lang



	/**
	* GET_FLAT
	* Compound a chained plain flat locator string for use as media componet name, etc..
	* @return string $name Like 'dd42_dd207_1'
	*/
	public function get_flat() : string {

		if ( empty($this->get_component_tipo() ) ) {
			throw new Exception("Error Processing Request. empty component_tipo", 1);
		}
		if ( empty($this->get_section_tipo() ) ) {
			throw new Exception("Error Processing Request. empty section_tipo", 1);
		}
		if ( empty($this->get_section_id() ) ) {
			throw new Exception("Error Processing Request. empty section_id", 1);
		}

		$name = $this->component_tipo . locator::DELIMITER . $this->section_tipo . locator::DELIMITER . $this->section_id;

		/*
		if ( !empty($this->component_tipo) {
			$name .= locator::DELIMITER . $this->component_tipo;
		}

		if ( !empty($this->from_component_tipo) {
			$name .= locator::DELIMITER . $this->from_component_tipo;
		}

		if ( !empty($this->tag_id) {
			$name .= locator::DELIMITER . $this->tag_id;
		}
		*/

		return $name;
	}//end get_flat



	/**
	* GET_TERM_ID_FROM_LOCATOR
	* Contract locator object as string like 'es1_185' (section_tipo and section_id)
	* @return string $term_id
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
	* @return string|array $section_id
	*/
	public static function get_section_id_from_locator(object $locator) : int {

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

		$section_id = (int)$locator->section_id;


		return $section_id;
	}//end get_section_id_from_locator



	/**
	* GET_STD_CLASS
	* @return stdClass
	*/
	public static function get_std_class(object $locator) : stdClass {

		$locator = json_encode($locator);
		$locator = json_decode($locator);

		return $locator;

		// $std_object = new stdClass();
		// foreach ($locator as $key => $value) {
		// 	$std_object->$key = $value;
		// }

		// return $std_object;
	}//end get_std_class



	/**
	* LANG_TO_LANG_LOCATOR
	* Gets a lang like 'lg-spa' and it converts to lang locator like {"section_tipo":"lg-spa","section_id":17344}
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
				# Serach in database
				$section_id = (int)lang::get_section_id_from_code($lang);
				break;
		}

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);

		return $locator;
	}//end lang_to_lang_locator



	/**
	* COMPARE_LOCATORS
	* @return bool $equal
	*/
	public static function compare_locators(object $locator1, object $locator2, array $ar_properties=[], array $ar_exclude_properties=[]) : bool {

		if (!is_object($locator1) || !is_object($locator2)) {
			return false;
		}

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


		$equal = true;

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

		foreach ((array)$ar_locator as $current_locator) {
			$found = self::compare_locators( $locator, $current_locator, $ar_properties );
			if($found===true) break;
		}

		#$ar = array_filter(
		#		$ar_locator,
		#		function($current_locator) use($locator, $ar_properties){
		#			return self::compare_locators( $locator, $current_locator, $ar_properties );
		#		}
		#); return $ar;


		return $found;
	}//end in_array_locator



	/**
	* GET_KEY_IN_ARRAY_LOCATOR
	* @return mixed bool | int $key_founded
	*/
	public static function get_key_in_array_locator(object $locator, array $ar_locator, array $ar_properties=['section_id','section_tipo']) {
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
			#case 'set_' :
			#	if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
			#	return($this->SetAccessor($strMethodMember, $arArguments[0]));
			#	break;
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
	*/
	function __destruct() {

		#
		# ONLY FOR DEBUG !!
		if(SHOW_DEBUG===true) {
			if (!isset($this->section_tipo)) {
				dump($this, ' this');
				#dump(debug_backtrace(), 'debug_backtrace()');
				throw new Exception("Error Processing Request. locator section_tipo is mandatory", 1);
			}
			if (!isset($this->section_id)) {
				dump($this, ' this');
				throw new Exception("Error Processing Request. locator section_id is mandatory", 1);
			}
		}else{
			if (!isset($this->section_tipo) || !isset($this->section_id)) {
				debug_log(__METHOD__." ERROR: wrong locator format detected. Please fix this ASAP : ".to_string($this), logger::DEBUG);
			}
		}
	}//end __destruct



}//end class locator