<?php
/**
* CLASS DDO_MAP_OBJECT
* Defines object with normalized properties and checks
*
* Sample:
* {
* 	"tipo"					: "numisdata309",
* 	"section_tipo"			: "self",
* 	"parent"				:  "numisdata3",
* 	"model"					: "component_input_text",
* 	"mode"					: "list",
* 	"label"					: "catalog",*
* 	"value_with_parents"	: true
* 	"separator_fields"		: " | "
* }
*/
class ddo_map_object {



	/**
	* VARS
	*/
		// $tipo; // string like 'hierarchy25'
		// $section_tipo; // string like 'oh1'
		// $parent; // string like 'oh25'
		// $model; // string like 'component_input_text'
		// $mode; // string like 'edit'
		// $label; // string like 'Surname'
		// $value_with_parents; // bool like 'true'
		// $separator_fields; // string like ' | '



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

		// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}

		return true;
	}//end __construct



	/**
	* SET_TIPO
	*/
	public function set_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid tipo: $value", 1);
		}
		$this->tipo = $value;
	}



	/**
	* SET_SECTION_TIPO
	*/
	public function set_section_tipo(string $value) {
		if (!isset($this->model)) {
			$this->model = RecordObj_dd::get_modelo_name_by_tipo($this->tipo,true);
		}
		if(strpos($this->model, 'area')!==0 && !RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid section_tipo: $value", 1);
		}
		$this->section_tipo = $value;
	}


	/**
	* SET_PARENT
	*/
	public function set_parent(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid tipo: $value", 1);
		}
		$this->parent = $value;
	}



	/**
	* SET_MODEL
	*/
	public function set_model(string $value) {

		$this->model = $value;
	}



	/**
	* SET_MODE
	*/
	public function set_mode(string $value) {

		$this->mode = $value;
	}



	/**
	* SET_LABEL
	*/
	public function set_label(string $value) {

		$this->label = $value;
	}


	/**
	* SET_VALUE_WITH_PARENTS
	*/
	public function set_value_with_parents(bool $value) {

		$this->value_with_parents = $value;
	}



	/**
	* SET_SEPARATOR_FIELDS
	*/
	public function set_separator_fields(string $value) {

		$this->separator_fields = $value;
	}



}//end ddo_map_object
