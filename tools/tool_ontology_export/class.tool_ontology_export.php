<?php declare(strict_types=1);
/**
* CLASS TOOL_ONTOLOGY_EXPORT
*  Parse and insert section records into jer_dd table
*
*/
class tool_ontology_export extends tool_common {



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


			// parent
				$target_node	= new RecordObj_dd( $target_section_tipo );
				$parent_tipo	= $target_node->get_parent();
				$parent_node	= new RecordObj_dd( $parent_tipo );
				$parent_order	= $parent_node->get_order();
				$parent_name	= RecordObj_dd::get_termino_by_tipo( $parent_tipo );

			// store ontology resolution
				$current_ontolgy = new stdClass();
					$current_ontolgy->target_section_tipo	= $target_section_tipo;
					$current_ontolgy->tld					= $tld;
					$current_ontolgy->name					= $name;
					$current_ontolgy->parent_tipo			= $parent_tipo;
					$current_ontolgy->parent_order			= $parent_order;
					$current_ontolgy->parent_name			= $parent_name;

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

		$done = 0;
		$ar_msg = [];
		foreach ($selected_ontologies as $target_section_tipo) {

			// Process ontology node/s and change jer_dd rows
			$ontology_response = ontology_data_io::export_to_file( $target_section_tipo );

			// save all export messages
			$ar_msg[] = $ontology_response->msg;

			// errors
			if( $ontology_response->result === false ){
				$response->errors = array_merge( $response->errors, $ontology_response->errors );
				continue;
			}

			$done++;
		}

		// set the current time and version of the exported process
		// it is saved in properties component id dd1 (ontology40_1)
		ontology_data_io::update_ontology_info();

		// export the ontology information into a ontology.json file
		ontology_data_io::export_ontology_info();

		// response
			$response->result	= empty($response->errors);
			$response->msg		= $response->result
				? 'OK. Request done: '.$done
				: 'Errors found. Request failed';
			$response->ar_msg = $ar_msg;


		return $response;
	}//end export_ontologies



}//end class tool_ontology_export
