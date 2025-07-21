<?php declare(strict_types=1);
/**
* EXPORT_HIERARCHY
* Widget to manage Dédalo hierarchy tasks
*/
class export_hierarchy {



	/**
	* EXPORT_HIERARCHY
	* Alias of hierarchy::export_hierarchy
	* @param object $options
	* @return object $response
	*/
	public static function export_hierarchy(object $options) : object {

		// options
			$section_tipo = $options->section_tipo ?? null;

			if (empty($section_tipo)) {
				return (object)[
					'result'	=> false,
					'msg'		=> 'Empty section tipo',
					'errors'	=> ['Empty section tipo']
				];
			}

		// export_hierarchy
			$response = hierarchy::export_hierarchy($section_tipo);


		return $response;
	}//end export_hierarchy




	/**
	* SYNC_HIERARCHY_ACTIVE_STATUS
	* Execs hierarchy::sync_hierarchy_active_status
	* @return object $response
	*/
	public static function sync_hierarchy_active_status() : object {

		$result = hierarchy::sync_hierarchy_active_status();

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end sync_hierarchy_active_status



}//end export_hierarchy
