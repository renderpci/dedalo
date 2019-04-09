<?php
/*
* CLASS TOOL_USER_ADMIN
*
*
*/
class tool_user_admin extends tool_common {



	public $modo;



	/**
	* __CONSTRUCT
	* @param object $section_obj
	*	Not used. Only for compatibility
	* @param string $modo
	*	Default: 'page'
	*/
	public function __construct($section_obj=null, $modo='page') {
		
		$this->modo	= $modo;

		return true;
	}//end __construct



	



	
}//end class tool_catalogue
?>