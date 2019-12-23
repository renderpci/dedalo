<?php
/*
* CLASS TAB
*
*
*/
class tab extends common {
	
	
	protected $tipo;
	protected $section_tipo;
	protected $modo;
	protected $lang;
	
	# STRUCTURE DATA
	protected $RecordObj_dd;
	protected $modelo;	
	protected $label;
	

	
	function __construct($tipo, $section_tipo, $modo) {

		$this->tipo 		= $tipo;
		$this->section_tipo = $section_tipo;

		$this->modo = $modo;
		$this->lang = DEDALO_DATA_LANG;		
		
		$this->load_structure_data();	
	}


	
}
?>