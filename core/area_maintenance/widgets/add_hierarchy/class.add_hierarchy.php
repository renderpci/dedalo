<?php declare(strict_types=1);
/**
* ADD_HIERARCHY
* Widget to manage Dédalo hierarchy tasks
*/
class add_hierarchy {



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$install_config = install::get_config();

		$result = (object)[
			'hierarchies'				=> install::get_available_hierarchy_files()->result,
			'active_hierarchies'		=> hierarchy::get_active_elements(),
			'hierarchy_files_dir_path'	=> $install_config->hierarchy_files_dir_path,
			'hierarchy_typologies'		=> $install_config->hierarchy_typologies
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



}//end add_hierarchy
