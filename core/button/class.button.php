<?php declare(strict_types=1);
/*
* CLASS BUTTON
* Manage custom buttons logic
*
*/
class button extends common {



	/**
	* @vars
	*/
	protected $section_tipo;
	protected $section_id;



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, string $section_tipo, mixed $section_id=null, string $mode='edit' ) {

		$this->tipo			= $tipo;
		$this->section_tipo	= $section_tipo;
		$this->section_id	= $section_id;
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



	/**
	* GET DATO
	* @return null
	*/
	public function get_dato() {

		return null;
	}//end get_dato



}//end class button
