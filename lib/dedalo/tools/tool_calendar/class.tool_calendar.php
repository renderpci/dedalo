<?php
/*
* CLASS TOOL_CALENDAR
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


class tool_calendar extends tool_common {
	
	
	protected $section_obj;	# received section
	protected $button_import_propiedades;
	


	public function __construct( $section_obj, $modo ) {

		# Verify type section object
		if ( get_class($section_obj) !== 'section' ) {
			throw new Exception("Error Processing Request. Only sections are accepted in this tool", 1);
		}
		
		# Fix current component/section
		$this->section_obj = $section_obj;

		# Fix modo
		$this->modo = $modo;
		
	}




	

	
}#end class
?>