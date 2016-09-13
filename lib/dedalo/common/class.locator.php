<?php
/*
* CLASS LOCATOR
*/

/*
	Format:

	$locator->section_top_tipo	= (string)$section_top_tipo;
	$locator->section_top_id	= (string)$section_top_id;
	$locator->section_id		= (string)$section_id;
	$locator->section_tipo		= (string)$section_tipo; 
	$locator->component_tipo	= (string)$component_tipo;
	$locator->tag_id			= (string)$tag_id;
	$locator->state				= (object)$state;
	$locator->semantic			= (object)$semantic;

	Note that properties can exists or not (are created on the fly). Final result object only contain set properties and locator object can be empty or partially set.
	For example, component portal only use section_tipo an section_id in many cases

*/


class locator extends stdClass {

	/* Created on the fly
		private $section_top_tipo;
		private $section_top_id;
		private $section_id;
		private $section_tipo;
		private $component_tipo;
		private $tag_id;
		private $state;
		private $semantic;
	*/

	# Mandatory and protected (use set/get to access)
	#protected $section_id;
	#protected $section_tipo;



	/**
	* __CONSTRUCT
	* @param object $data 
	*	optional . Default is null
	*/
	public function __construct( $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			return false;
		}
		foreach ($data as $key => $value) {
			$method = 'set_'.$key;
			$this->$method($value);
		}
	}

/*
			#$rel_locator->set_section_top_tipo( $section_top_tipo );
			$rel_locator->set_section_top_id( $section_top_id );
			$rel_locator->set_section_tipo( $section_tipo );
			$rel_locator->set_section_id( $parent );
			$rel_locator->set_component_tipo( $tipo );
			$rel_locator->set_tag_id( $tag_value );
*/



	/**
	* SET  METHODDS
	* Verify values and set property to current object
	*/
	/**
	* SET_SECTION_TOP_TIPO
	*/
	public function set_section_top_tipo($value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid section_top_tipo: $value", 1);
		}
		$this->section_top_tipo = (string)$value;
	}
	/**
	* SET_SECTION_TOP_ID
	*/
	public function set_section_top_id($value) {
		if(abs($value)<1) {
			throw new Exception("Error Processing Request. Invalid section_top_id: $value", 1);
		}
		$this->section_top_id = (string)$value;
	}
	/**
	* SET_SECTION_ID
	*/
	public function set_section_id($value) {
		#if(abs($value)<1 && $value!='unknow' && strpos($value, DEDALO_SECTION_ID_TEMP)===false) {
		if(abs($value)<0 && $value!='unknow' && strpos($value, DEDALO_SECTION_ID_TEMP)===false) {
			throw new Exception("Error Processing Request. Invalid section_id: $value", 1);
		}
		$this->section_id = (string)$value;
	}	
	/**
	* SET_SECTION_TIPO
	*/
	public function set_section_tipo($value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid section_tipo: $value", 1);
		}
		$this->section_tipo = (string)$value;
	}
	/**
	* SET_COMPONENT_TIPO
	*/
	public function set_component_tipo($value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid component_tipo: $value", 1);
		}
		$this->component_tipo = (string)$value;
	}
	/**
	* SET_TAG_ID
	*/
	public function set_tag_id($value) {
		if(abs($value)<1) {
			throw new Exception("Error Processing Request. Invalid tag_id: $value", 1);
		}
		$this->tag_id = (string)$value;
	}
	/**
	* SET_STATE
	*/
	public function set_state($value) {
		if(!is_object($value)) {
			throw new Exception("Error Processing Request. Invalid state: $value", 1);
		}
		$this->state = (object)$value;
	}
	/**
	* SET_TYPE
	* Only defined relation types (structure) ar allowed
	*/
	public function set_type($value) {
		$ar_allowed = common::get_allowed_relation_types();
		if( !in_array($value, $ar_allowed) ) {
			throw new Exception("Error Processing Request. Invalid locator type: $value. Only are allowed: ".to_string($ar_allowed), 1);
		}
		$this->type = (string)$value;
	}


	/**
	* SET_SEMANTIC
	*//*
	public function set_ds($value) {
		if(!is_array($value)) {
			throw new Exception("Error Processing Request. Invalid dedalo semantic:". to_string($value), 1);
		}
		$this->semantic = (array)$value;
	}
	*/



	/**
	* GET_FLA
	* Compound a chained flat locator string for use as media componet name, etc..	
	* @return string $name Like 'dd42_dd207_1'
	*/
	public function get_flat( ) {
		
		if ( empty($this->get_component_tipo() ) ) {
			throw new Exception("Error Processing Request. empty component_tipo", 1);
		}
		if ( empty($this->get_section_tipo() ) ) {
			throw new Exception("Error Processing Request. empty section_tipo", 1);
		}
		if ( empty($this->get_section_id() ) ) {
			throw new Exception("Error Processing Request. empty section_id", 1);
		}
		$delimiter = '_';
		$name = $this->component_tipo . $delimiter . $this->section_tipo . $delimiter . $this->section_id;

		return $name;
	}//end get_flat



	/**
	* GET_STD_CLASS
	* @return stdClass 
	*/
	public static function get_std_class( $locator ) {

		$locator = json_encode($locator);
		$locator = json_decode($locator);
		return $locator;

		$std_object = new stdClass();
		foreach ($locator as $key => $value) {
			$std_object->$key = $value;
		}
		return $std_object;
	}//end get_std_class



	/**
	* LANG_TO_LANG_LOCATOR
	* Gets a lang like 'lg-spa' and it converts to lang locator like {"section_tipo":"lg-spa","section_id":17344}
	* @return object $locator
	*/
	public static function lang_to_locator( $lang ) {
		
		$section_tipo = $lang;
		
		switch ($lang) {
			case 'lg-spa':	$section_id = 17344;	break;
			case 'lg-eng':	$section_id = 5101;		break;
			case 'lg-cat':	$section_id = 3032;		break;
			case 'lg-vlca':	$section_id = 20155;	break;
			case 'lg-fra':	$section_id = 5450;		break;
			case 'lg-eus':	$section_id = 5223;		break;
			case 'lg-por':	$section_id = 14895;	break;
			default:
				# Serach in database
				$RecordObj_ts = new RecordObj_ts($lang);
				$id = $RecordObj_ts->terminoID2id($lang);
				$section_id = (int)$id;
				break;
		}

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);

		return $locator;
	}#end lang_to_lang_locator



	/**
	* COMPARE_LOCATORS
	* @return bool $equal
	*/
	public static function compare_locators( $locator1, $locator2, $ar_properties=array('section_tipo','section_id') ) {

		$equal = true;
		
		foreach ($ar_properties as $current_property) {
			if($locator1->$current_property !== $locator2->$current_property) {
				$equal = false;
				break; 
			}
		}
		return (bool)$equal;
	}//end compare_locators



	/**
	* IN_ARRAY_LOCATOR
	* @return bool $founded
	*/
	public static function in_array_locator( $locator, $ar_locator, $ar_properties=array('section_tipo','section_id') ) {
		$founded = false;

		foreach ((array)$ar_locator as $current_locator) {
			$founded = self::compare_locators( $locator, $current_locator, $ar_properties );
			if($founded===true) break;
		}

		return $founded;
	}//end in_array_locator



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
	*/	
	public function __call($strFunction, $arArguments) {
		
		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
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
	private function GetAccessor($variable) {
		if(property_exists($this, $variable)) {
			return (string)$this->$variable;			
		}else{
			return false;
		}
	}


	/**
	* DESTRUCT
	* On destruct object, test if minimun data is set or not
	*/
	function __destruct() {

		#
		# ONLY FOR DEBUG !!
		if(SHOW_DEBUG) {		
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
				error_log("ERROR: wrong locator format detected. Please fix this ASAP : ".to_string($this));
			}
		}		
	}//end __destruct


}
?>