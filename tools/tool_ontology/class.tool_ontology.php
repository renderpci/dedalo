<?php declare(strict_types=1);
/**
* CLASS TOOL_ONTOLOGY
*  Parse and insert section records into dd_ontology table
*
*/
class tool_ontology extends tool_common {



	/**
	* SET_RECORDS_IN_DD_ONTOLOGY
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $options
	* @return object $response
	*/
	public static function set_records_in_dd_ontology(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$section_id			= $options->section_id ?? null;
			$section_tipo		= $options->section_tipo;

			// sqo
				if(!empty($section_id)) {

					// edit case. One record

					$locator = new locator();
						$locator->set_section_tipo($section_tipo);
						$locator->set_section_id($section_id);

					$sqo = (object)[
						'section_tipo'			=> [$section_tipo],
						'limit'					=> 1,
						'offset'				=> 0,
						'filter_by_locators'	=> [$locator]
					];
				}else{

					// list case

					$sqo_id			= section::build_sqo_id($section_tipo);
					$sqo_session	= $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;
					if ( empty($sqo_session) ) {

						// error case
						$response->msg[]	= 'Not sqo_session found from id: '.$sqo_id;
						$response->errors[]	= 'no sqo session found';
						debug_log(__METHOD__
							."  " . to_string($response->msg)
							, logger::ERROR
						);
						return $response;
					}
					$sqo = clone($sqo_session);
					$sqo->order		= false;
					$sqo->limit		= 0;
					$sqo->offset	= 0;
				}

		// Process ontology node/s and change dd_ontology rows
			$ontology_response = ontology::set_records_in_dd_ontology( $sqo );

		// reset active elements session. It is used in dd_ts_api::get_children_data()
			if (isset($_SESSION['dedalo']['config']['active_elements'])) {
				unset($_SESSION['dedalo']['config']['active_elements']);
			}

		// response
			$response->result	= $ontology_response->result;
			$response->msg		= $ontology_response->msg;
			$response->errors	= $ontology_response->errors;


		return $response;
	}//end set_records_in_dd_ontology



}//end class tool_ontology
