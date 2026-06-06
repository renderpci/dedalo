<?php declare(strict_types=1);
/**
* REGISTER_TOOLS
* Widget to manage Dédalo tool registration
*/
class register_tools {

	/**
	 * SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	 * `get_value` is invoked through `get_widget_value` (hard-coded method) and
	 * therefore not listed here.
	 */
	public const API_ACTIONS = [
		'register_tools'
	];



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$tools_files_list = tools_register::get_tools_files_list();

		$result = (object)[
			'datalist'	=> $tools_files_list,
			'errors'	=> null
		];

		// matrix_tools field 'Developer' check
		if (empty(ontology_node::get_model_by_tipo('dd1644',true))) {
			$result->errors = ['Your Ontology is outdated. Term \'dd1644\' (Developer) do not exists'];
		}

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



	/**
	 * REGISTER_TOOLS
	 * Alias of tools_register::import_tools
	 * @return object $response
	 * {
	 *	result: array|false (on success, list of imported tools objects)
	 * 	msg: string
	 * 	errors: array
	 * }
	 */
	public static function register_tools(): object
	{

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';

		// import_tools
		$response->result = tools_register::import_tools();

		// check results errors
		$errors = [];
		if (!empty($response->result)) {
			foreach ($response->result as $item) {
				if (!empty($item->errors)) {
					$errors = array_merge($errors, (array) $item->errors);
				}
			}
		}
		$response->errors = $errors;

		// msg
		$response->msg = empty($errors)
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';


		return $response;
	}//end register_tools



}//end register_tools
