<?php
/*
* CLASS TOOL AV VERSIONS
*/
require_once( DEDALO_CONFIG_PATH .'/config.php');


class tool_av_versions extends tool_common {
	
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