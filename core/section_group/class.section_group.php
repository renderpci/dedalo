<?php
/*
* CLASS SECTION GROUP
*/


class section_group extends common {


	/**
	* VARS
	*/
		protected $tipo;
		protected $section_tipo;
		protected $modo;
		protected $lang;
		# structure data
		// protected $RecordObj_dd;
		protected $modelo;
		protected $norden;
		protected $label;



	/**
	* __CONSTRUCT
	*/
	function __construct(string $tipo, string $section_tipo, string $modo) {

		$this->tipo			= $tipo;
		$this->section_tipo	= $section_tipo;
		$this->modo			= $modo;
		$this->lang			= DEDALO_DATA_LANG;

		$this->load_structure_data();
	}//end __construct



	/**
	* GET_TOOLS
	* 	Catch get_tools call to prevent load tools sections
	* @return array $tools
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



}//end class