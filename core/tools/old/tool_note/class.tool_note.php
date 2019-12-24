<?php
#include_once( DEDALO_CONFIG_PATH .'/config.php');

/*
* CLASS TOOL_NOTE
*/
class tool_note extends tool_common {
	
	protected $section_obj ;
	
	
	/**
	* __CONSTRUCT
	*/
	public function __construct($section_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->section_obj = $section_obj;
	}



	




}//end tool_note
?>