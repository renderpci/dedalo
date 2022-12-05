<?php
include_once(dirname(dirname(__FILE__)).'/component_filter/class.component_filter.php');
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
	function __construct(string $tipo=null, $parent=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, string $section_tipo=null) {

		$lang = DEDALO_DATA_NOLAN;

		// Note that parent is NOT component_common here (is component_filter)
		parent::__construct($tipo, $parent, $mode, $lang, $section_tipo);

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
	* @return int|null $section_id
	*/
	public function Save() : ?int {

		// Reset cache session IMPORTANT !
		unset($_SESSION['dedalo']['config']['get_user_projects']);

		return parent::Save();
	}//end Save



	/**
	* PROPAGATE_FILTER
	* Only to catch calls to parent method
	*/
	public function propagate_filter() : bool {
		# Nothing to do
		// debug_log(__METHOD__." Invalid call !! ".to_string(), logger::ERROR);

		return true;
	}//end propagate_filter



}//end class component_filter_master
