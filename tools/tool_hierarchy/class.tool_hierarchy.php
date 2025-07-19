<?php
/**
* CLASS TOOL_HIERARCHY
* Help to generate new custom Ontologies
*
*/
class tool_hierarchy extends tool_common {



	/**
	* GENERATE_VIRTUAL_SECTION
	* Exec a custom action called from client
	* @param object $options
	* @return object $response
	*/
	public static function generate_virtual_section(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$section_id			= $options->section_id;
			$section_tipo		= $options->section_tipo;
			$force_to_create	= $options->force_to_create;

		// check if is necessary to delete the previous ontology terms before added new ones
			if($force_to_create===true){
				$delete_response = hierarchy::delete_main((object)[
					'section_id'	=> $section_id,
					'section_tipo'	=> $section_tipo
				]);
				if (!empty($delete_response->errors)) {
					$response->errors = array_merge($response->errors, $delete_response->errors);
				}
			}

		// create a new virtual section from real
			$hierarchy_response = hierarchy::generate_virtual_section((object)[
				'section_id'	=> $section_id,
				'section_tipo'	=> $section_tipo
			]);
			if (!empty($hierarchy_response->errors)) {
				$response->errors = array_merge($response->errors, $hierarchy_response->errors);
			}

		// response
			$response->result	= $hierarchy_response->result;
			$response->msg		= $hierarchy_response->msg ;


		return $response;
	}//end generate_virtual_section



}//end class tool_hierarchy
