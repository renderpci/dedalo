<?php


/**
* CLASS DD_OBJECT
*/
class dd_object extends stdClass {

	// Format
		# tipo 				: 'oh14',
		# section_tipo 		: 'oh1',		
		# parent 			: 'oh1',
		# lang 				: 'lg-eng',		
		# mode 				: "list",
		# model				: 'component_input_text',
		# typo				: "ddo"  (ddo | sqo)
		# type				: "component"  (section | component | groupper | button)


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

		// set typo always
			$this->typo = 'ddo';

		return true;
	}//end __construct



	/**
	* SET  METHODDS
	* Verify values and set property to current object
	*/
	
	/**
	* SET_TIPO
	*/
	public function set_tipo($value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid tipo: $value", 1);
		}
		$this->tipo = (string)$value;
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
	* SET_PARENT
	*/
	public function set_parent($value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid parent: $value", 1);
		}
		$this->parent = (string)$value;
	}
	/**
	* SET_LANG
	*/
	public function set_lang($value) {
		if(strpos($value, 'lg-')!==0) {
			throw new Exception("Error Processing Request. Invalid lang: $value", 1);
		}
		$this->lang = (string)$value;
	}
	/**
	* SET_MODE
	*/
	public function set_mode($value) {

		$this->mode = (string)$value;
	}
	/**
	* SET_MODEL
	*/
	public function set_model($value) {
		
		$this->model = (string)$value;
	}
	/**
	* SET_TYPO
	*/
	public function set_typo($value) {
		if($value!=='ddo') {
			debug_log(__METHOD__." Error. Fixed invalid typo ".to_string($value), logger::DEBUG);
			$value = 'ddo';
		}
		$this->typo = (string)$value;
	}	
	/**
	* SET_TYPE
	* Only allow 'section','component','groupper','button'
	*/
	public function set_type($value) {
		$ar_allowed = ['section','component','groupper','button'];
		if( !in_array($value, $ar_allowed) ) {
			throw new Exception("Error Processing Request. Invalid locator type: $value. Only are allowed: ".to_string($ar_allowed), 1);
		}
		$this->type = (string)$value;
	}
	


}
?>