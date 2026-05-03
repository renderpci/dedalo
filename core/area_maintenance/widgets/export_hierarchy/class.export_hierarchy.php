<?php declare(strict_types=1);
/**
* EXPORT_HIERARCHY
* Widget to manage Dédalo hierarchy tasks
*/
class export_hierarchy {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*/
	public const API_ACTIONS = [
		'export_hierarchy',
		'sync_hierarchy_active_status'
	];



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		$result = (object)[
			'export_hierarchy_path' => (defined('EXPORT_HIERARCHY_PATH')
				? EXPORT_HIERARCHY_PATH
				: null)
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



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
	* sync_hierarchy_active_status
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
