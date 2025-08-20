<?php declare(strict_types=1);
/**
* REGISTER_TOOLS
* Widget to manage Dédalo tool registration
*/
class register_tools {



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
		if (empty(ontology_node::get_model_name_by_tipo('dd1644',true))) {
			$result->errors = ['Your Ontology is outdated. Term \'dd1644\' (Developer) do not exists'];
		}

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



}//end register_tools
