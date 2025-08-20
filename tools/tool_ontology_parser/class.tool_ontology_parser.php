<?php declare(strict_types=1);
/**
* CLASS TOOL_ONTOLOGY_PARSER
*  Parse and insert section records into dd_ontology table
*
*/
class tool_ontology_parser extends tool_common {



	/**
	* GET_ONTOLOGIES
	* Get all rows from matrix_main_ontology and select target_section_tipo, tld, name and typology.
	* @return object $response
	*/
	public static function get_ontologies() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// main_ontology_records
		$ontotology_records = ontology::get_all_main_ontology_records();

		$ontologies = [];
		foreach ($ontotology_records as $row) {

			// target_section_tipo
				$target_section_tipo = $row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN}[0] ?? null;
				if (empty($target_section_tipo)) {
					debug_log(__METHOD__
						." Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id "
						, logger::ERROR
					);
					$response->errors[] = "Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id";
					continue;
				}

			// tld
				$tld = $row->datos->components->{DEDALO_HIERARCHY_TLD2_TIPO}->dato->{DEDALO_DATA_NOLAN}[0] ?? null;
				if (empty($tld)) {
					debug_log(__METHOD__
						." Skipped hierarchy without tld: $row->section_tipo, $row->section_id "
						, logger::ERROR
					);
					$response->errors[] = "Skipped hierarchy without tld: $row->section_tipo, $row->section_id ";
					continue;
				}

			// name
				$full_data = $row->datos->components->{DEDALO_HIERARCHY_TERM_TIPO}->dato ?? null;
				$name = component_common::get_value_with_fallback_from_dato_full( $full_data );


			// typology
				$model = ontology_node::get_model_name_by_tipo( DEDALO_HIERARCHY_TYPOLOGY_TIPO );

				$typology_component = component_common::get_instance(
					$model, // string model
					DEDALO_HIERARCHY_TYPOLOGY_TIPO, // string tipo
					$row->section_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					$row->section_tipo // string section_tipo
				);

				$typology_data = $typology_component->get_dato()[0] ?? null;
				if (empty($typology_data)) {
					debug_log(__METHOD__
						." Hierarchy without typology: $row->section_tipo, $row->section_id "
						, logger::WARNING
					);
				}
				$typology_id = ( !empty($typology_data) )
					? (int)$typology_data->section_id
					: null;

			// typology name
				$typology_name = $typology_component->get_value();


			// store ontology resolution
				$current_ontolgy = new stdClass();
					$current_ontolgy->target_section_tipo	= $target_section_tipo;
					$current_ontolgy->tld					= $tld;
					$current_ontolgy->name					= $name;
					$current_ontolgy->typology_id			= $typology_id;
					$current_ontolgy->typology_name			= $typology_name;

				$ontologies[] = $current_ontolgy;
		}//end foreach ($result->ar_records as $row)

		// response
			$response->result	= $ontologies;
			$response->msg		= 'OK. Request done';


		return $response;
	}//end get_ontologies



	/**
	* EXPORT_ONTOLOGIES
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $options
	* @return object $response
	*/
	public static function export_ontologies(object $options) : object {

		// options
			$selected_ontologies = $options->selected_ontologies ?? [];

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// set the current time and version of the exported process
		// it is saved in properties component id dd1 (ontology40_1)
		$result = ontology_data_io::update_ontology_info();
		if (!$result) {
			$response->errors[] = 'unable to update_ontology_info';
			$response->msg . 'Unable to update ontology information in dd1 (ontology40_1)';
			return $response;
		}

		// export the ontology information into a ontology.json file
		$ontology_info_response = ontology_data_io::export_ontology_info();
		if (!$ontology_info_response->result) {
			$response->errors[] = 'unable to export ontology info JSON file';
			$response->msg . 'Unable to export the ontology information JSON file';
			return $response;
		}

		$done = 0;
		$ar_msg = [];
		foreach ($selected_ontologies as $tld) {

			// Process ontology node/s and change dd_ontology rows
			$ontology_response = ontology_data_io::export_to_file( $tld );

			// save all export messages
			$ar_msg[] = $ontology_response->msg;

			// errors
			if( $ontology_response->result === false ){
				$response->errors = array_merge( $response->errors, $ontology_response->errors );
				continue;
			}

			$done++;
		}

		// Process private list of matrix_dd node/s and change dd_ontology rows
			$private_list_response = ontology_data_io::export_private_lists_to_file();

			// save all export messages
			$ar_msg[] = $private_list_response->msg;

			// errors
			if( $private_list_response->result === false ){
				$response->errors = array_merge( $response->errors, $private_list_response->errors );
			}

		// response
			$response->result	= empty($response->errors);
			$response->msg		= $response->result
				? 'OK. Request done: '.$done
				: 'Errors found. Request failed';
			$response->ar_msg = $ar_msg;


		return $response;
	}//end export_ontologies



	/**
	* REGENERATE_ONTOLOGIES
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $options
	* @return object $response
	*/
	public static function regenerate_ontologies(object $options) : object {

		// options
			$selected_ontologies = $options->selected_ontologies ?? [];

		// response
			$response = ontology::regenerate_records_in_dd_ontology( $selected_ontologies );


		return $response;
	}//end regenerate_ontologies



}//end class tool_ontology_parser
