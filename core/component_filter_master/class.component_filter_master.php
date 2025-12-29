<?php declare(strict_types=1);
/**
* CLASS COMPONENT_FILTER_MASTER
* Overwrite some methods of component_filter.
* This component is defined only in User section (dd128) to set the user projects.
* As opposed to the component_filter, this component is not used to filter data, 
* but to set the user projects access.
* The operation is basically the same as the component filter, but it is specialised for use only in this section (dd128).
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
