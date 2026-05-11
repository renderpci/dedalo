<?php declare(strict_types=1);
/**
* CLASS COMPONENT_FILTER_MASTER
* Specialized variant of component_filter for managing user project assignments.
*
* Used exclusively in the User section (dd128) to define which projects a user
* has access to. Unlike component_filter which filters records by project,
* this component controls the user's project permissions themselves.
*
* Key differences from component_filter:
* - Only used in User section for project assignment
* - Clears filter cache on every save to ensure permission changes take effect
* - Disables filter propagation (no cascading permission changes)
*
* Extends component_filter and overrides save() to reset user cache
* and propagate_filter() to prevent unnecessary processing.
*
* @package Dédalo
* @subpackage Core
*/
class component_filter_master extends component_filter {



	/**
	* SAVE
	* Overwrite component_filter method.
	* @return bool
	*/
	public function save() : bool {

		// Reset cache on every save action. IMPORTANT !
		filter::clean_cache(
			logged_user_id(),  // user id. Current logged user id
			$this->tipo // DEDALO_FILTER_MASTER_TIPO dd170
		);

		return parent::save();
	}//end save



	/**
	* PROPAGATE_FILTER
	* Overwrite only to catch calls to parent method.
	* @return bool
	*/
	public function propagate_filter() : bool {

		return true;
	}//end propagate_filter



}//end class component_filter_master
