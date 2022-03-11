<?php
/*
* CLASS SECTION_TAB
*/


class section_tab extends common {


	/**
	* VARS
	*/
		protected $tipo;
		protected $section_tipo;
		protected $modo;
		protected $lang;
		# structure data
		protected $RecordObj_dd;
		protected $modelo;
		protected $norden;
		protected $label;



	/**
	* __CONSTRUCT
	* @return array $tools
	*/
	function __construct($tipo, $section_tipo, $modo) {

		$this->tipo			= $tipo;
		$this->section_tipo	= $section_tipo;
		$this->modo			= $modo;
		$this->lang			= DEDALO_DATA_LANG;

		$this->load_structure_data();

		return true;
	}//end __construct



	/**
	* GET_TOOLS
	* 	Catch get_tools call to prevent load tools sections
	* @return array $tools
	*/
	public function get_tools() {

		return [];
	}//end get_tools



}//end class