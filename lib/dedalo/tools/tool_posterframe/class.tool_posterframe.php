<?php
/*
* CLASS TOOL POSTERFRAME
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_posterframe extends tool_common {
	
	# av component
	protected $component_obj ;


	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current av component
		$this->component_obj = $component_obj;
	}


	
	
	

	
	













	
	
}

?>