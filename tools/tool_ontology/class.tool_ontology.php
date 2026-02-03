<?php declare(strict_types=1);
/**
 * CLASS TOOL_ONTOLOGY
 * Tool for parsing and managing ontology records in the dd_ontology table
 *
 * Provides functionality to:
 * - Parse ontology section records
 * - Insert and update ontology node definitions
 * - Sync ontology metadata with dd_ontology table
 * - Manage ontology changes from both single-record edit and batch list modes
 *
 * Key features:
 * - Runtime ontology model integration
 * - Session-based search query object (sqo) management
 * - Active elements cache invalidation
 * - Support for both single and batch record processing
 *
 * @package Dedalo
 * @subpackage Ontology
 */
class tool_ontology extends tool_common {

	/**
	 * SET_RECORDS_IN_DD_ONTOLOGY
	 * Parse ontology section records and update dd_ontology table definitions
	 *
	 * Processes ontology nodes in two modes:
	 * - Edit mode: Single record identified by section_id and section_tipo
	 * - List mode: Multiple records retrieved from session sqo configuration
	 *
	 * After successful processing, invalidates active elements cache used by
	 * dd_ts_api::get_children_data()
	 *
	 * @param object $options Options containing: section_id (optional), section_tipo (required)
	 * @return object $response Response object with result (bool), msg (string), errors (array)
	 * @throws Exception If section_tipo is missing or sqo session configuration is invalid
	 *
	 * @package Dedalo
	 * @subpackage Ontology
	 */
	public static function set_records_in_dd_ontology(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;

		// validate input
			if (empty($section_tipo)) {
				$response->msg		= 'Error. Missing required parameter: section_tipo';
				$response->errors[]	= 'section_tipo is required';
				return $response;
			}

		try {
			// sqo - search query object
				if (!empty($section_id)) {

					// Edit case: Single record processing
					$locator = new locator();
						$locator->set_section_tipo($section_tipo);
						$locator->set_section_id($section_id);

					$sqo = (object)[
						'section_tipo'			=> [$section_tipo],
						'limit'					=> 1,
						'offset'				=> 0,
						'filter_by_locators'	=> [$locator]
					];
				} else {

					// List case: Multiple records from session
					$sqo_id			= section::build_sqo_id($section_tipo);
					$sqo_session	= $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;
					
					if (empty($sqo_session)) {
						// error case: no session configuration found
						$error_msg = 'Not sqo_session found from id: ' . $sqo_id;
						$response->msg		= 'Error. ' . $error_msg;
						$response->errors[]	= $error_msg;
						
						debug_log(__METHOD__
							. " Error: " . $error_msg
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
				$ontology_response = ontology::set_records_in_dd_ontology($sqo);

			// reset active elements session. It is used in dd_ts_api::get_children_data()
				if (isset($_SESSION['dedalo']['config']['active_elements'])) {
					unset($_SESSION['dedalo']['config']['active_elements']);
				}

			// Build consistent response
				$response->result	= $ontology_response->result ?? false;
				$response->msg		= $ontology_response->msg ?? 'OK. Request done';
				$response->errors	= $ontology_response->errors ?? [];

		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Error. ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
			
			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

		return $response;
	}//end set_records_in_dd_ontology

}//end class tool_ontology
