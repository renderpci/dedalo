<?php declare(strict_types=1);
/**
* CLASS SECTION GROUP
*
*
*/
class section_group extends common {



	/**
	* VARS
	*/



	/**
	* __CONSTRUCT
	*/
	function __construct(string $tipo, string $section_tipo, string $mode) {

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



}//end section_group class
