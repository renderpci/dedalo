<?php
require_once(dirname(dirname(__FILE__)).'/component_filter/class.component_filter.php');
/*
* CLASS COMPONENT FILTER MASTER
*
*
*/
class component_filter_master extends component_filter {


	private $user_id;
	// protected $caller_id;


	/**
	* __CONSTRUCT
	*/
	function __construct($tipo=false, $parent=null, $modo='edit', $lang=NULL, $section_tipo=null) {

		// Note that parent is NOT component_common here (is component_filter)
		parent::__construct($tipo, $parent, $modo, DEDALO_DATA_NOLAN, $section_tipo);

		// $this->user_id  = $this->get_parent();

		// # caller_id from parent var (default)
		// if(!empty($parent)) {
		// 	$this->caller_id = $parent;
		// }

		return true;
	}//end __construct



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method
	*/
	public function Save() {
		# Reset cache session IMPORTANT !
		unset($_SESSION['dedalo']['config']['get_user_projects']);

		return parent::Save();
	}//end Save



	/**
	* PROPAGATE_FILTER
	* Catch calls to parent method
	*/
	public function propagate_filter() {
		# Nothing to do
		debug_log(__METHOD__." Invalid call !! ".to_string(), logger::ERROR);

		return null;
	}//end propagate_filter



}//end class
