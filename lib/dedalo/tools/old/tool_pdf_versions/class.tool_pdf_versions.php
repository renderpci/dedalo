<?php
/*
* CLASS TOOL PDF VERSION
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_pdf_versions extends tool_common {
	
	# media component
	protected $component_obj ;


	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;
	}


	
	
	

	
	













	
	
}

?>