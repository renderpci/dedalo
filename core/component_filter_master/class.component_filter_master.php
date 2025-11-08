<?php declare(strict_types=1);
/**
* CLASS COMPONENT_FILTER_MASTER
* Overwrite some methods of component_filter
*
*/
class component_filter_master extends component_filter {



	/**
	* SAVE OVERRIDE
	* Overwrite component_filter method
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
	* Only to catch calls to parent method
	* @return bool
	*/
	public function propagate_filter() : bool {

		return true;
	}//end propagate_filter



}//end class component_filter_master
