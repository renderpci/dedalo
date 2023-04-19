<?php
/*
* CLASS COMPONENT_FILTER_MASTER
*
*
*/
class component_filter_master extends component_filter {



	/**
	* SAVE OVERRIDE
	* Overwrite component_filter method
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
	* @return bool
	*/
	public function propagate_filter() : bool {

		return true;
	}//end propagate_filter



}//end class component_filter_master
