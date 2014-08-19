<?php
/*
* CLASS TOOL LANG
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_upload extends tool_common {
	
	
	protected $target_filename ;
	protected $target_dir ;
	protected $component_obj ;
	
	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		
		$this->component_obj = $component_obj;
	}


	
	
	

	
	













	
	
}

?>