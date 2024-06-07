<?php
/**
* CLASS SECTION_TAB
*
*
*/
class section_tab extends common {


	/**
	* VARS
	*/



	/**
	* __CONSTRUCT
	*/
	function __construct($tipo, $section_tipo, $mode) {

		$this->tipo			= $tipo;
		$this->section_tipo	= $section_tipo;
		$this->mode			= $mode;
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



}//end section_tab class
