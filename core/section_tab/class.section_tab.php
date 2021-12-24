<?php
/*
* CLASS SECTION TAB
*
*
*/
class section_tab extends common {
	
	
	protected $tipo;
	protected $section_tipo;
	protected $modo;
	protected $lang;
	protected $id;		# id matrix of current section
	
	# STRUCTURE DATA
	protected $RecordObj_dd;
	protected $modelo;
	protected $norden;
	protected $label;
	
	protected $ar_tab_html;



	/**
	* __CONSTRUCT
	*/
	function __construct($tipo, $section_tipo, $modo, $ar_tab_html=null, $id_section=NULL) {

		$this->tipo			= $tipo;
		$this->section_tipo	= $section_tipo;
		$this->modo			= $modo;
		$this->lang			= DEDALO_DATA_LANG;
		$this->ar_tab_html	= $ar_tab_html;
		$this->id			= $id_section;

		$this->load_structure_data();
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