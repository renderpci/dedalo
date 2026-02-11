<?php declare(strict_types=1);
/**
* DIFFUSION_DATA
* Handles the diffusion data resolution from ddom_map
*/
class diffusion_data {



	/**
	* GET_DDO_MAP
	* @param string $diffusion_node_tipo
	* @param string $section_tipo
	* @return array $ddo_map
	*/
	public static function get_ddo_map( string $diffusion_node_tipo, string $section_tipo ) : array {

		// ddo_map create or get from properties
		$ddo_map = [];

		$ontology_node	= ontology_node::get_instance($diffusion_node_tipo);
		$properties		= $ontology_node->get_properties();

		// check if the ontology has his own ddo_map defined, if not, it will create a ddo_map with related components.
		if(isset($properties->process, $properties->process->ddo_map)){

			foreach ($properties->process->ddo_map as $ddo) {

				// resolve the 'self' value for section_tipo or parent, if this properties are defined use it.
				// If not defined or empty, assume it's the main section_tipo
				$ddo->section_tipo	= (empty($ddo->section_tipo) || $ddo->section_tipo === 'self') ? $section_tipo : $ddo->section_tipo;
				$ddo->parent		= (empty($ddo->parent) || $ddo->parent === 'self') ? $section_tipo : $ddo->parent;

				// set diffusion_node_tipo to be used as final entry key
				$ddo->diffusion_node_tipo = $diffusion_node_tipo;

				// add a new safe ddo
				$ddo_map[] = new dd_object($ddo);
			}

		}else{

			$ar_related_dd_tipo	= ontology_node::get_relation_nodes(
				$diffusion_node_tipo,
				true,
				true
			);
			// create new ddo_map when the ontology doesn't has one ddo_map
			foreach ($ar_related_dd_tipo as $current_tipo) {

				$ddo = new dd_object((object)[
					'tipo'					=> $current_tipo,
					'section_tipo'			=> $section_tipo,
					'parent'				=> $section_tipo,
					'diffusion_node_tipo'	=> $diffusion_node_tipo
				]);

				$ddo_map[] = $ddo;
			}
		}


		return $ddo_map;
	}//end get_ddo_map



	/**
	* GET_DDO_MAP_VALUE
	* Resolve the ddo_map value from components using diffusion_chain_processor
	* @param object $options
	* @return array $ar_values
	*/
	public static function get_ddo_map_value( object $options ) : array {

		$processor = new diffusion_chain_processor();
		
		return $processor->resolve_chain($options);
	}//end get_ddo_map_value



	/**
	* BUILD_ENTRIES_FROM_RESOLVED_DATA
	* Build entries object keyed by DDO id from resolved data
	* @param array $resolved_data
	* @param array $ddo_map
	* @return object $entries
	*/
	public static function build_entries_from_resolved_data( array $resolved_data, array $ddo_map ) : object {

		$processor = new diffusion_chain_processor();
		
		return $processor->build_entries($resolved_data);
	}//end build_entries_from_resolved_data



	/**
	* GET_SECTIONS_WITH_DIFFUSION
	* Returns a map of section_tipo => diffusion_node_tipo for all sections
	* that have diffusion nodes defined under the given diffusion_element.
	* 
	* @param string $diffusion_element_tipo
	* @return array Map of section_tipo => diffusion_node_tipo
	*/
	public static function get_sections_with_diffusion( string $diffusion_element_tipo ) : array {

		$map = [];
		
		// Get all diffusion_nodes under this diffusion_element
		$ar_diffusion_nodes = ontology_node::get_ar_tipo_by_model_and_relation(
			$diffusion_element_tipo,
			'diffusion_node',
			'children_recursive',
			true
		);
		
		foreach ($ar_diffusion_nodes as $diffusion_node_tipo) {
			// Get the related sections for this diffusion_node
			$ar_sections = ontology_node::get_ar_tipo_by_model_and_relation(
				$diffusion_node_tipo,
				'section',
				'related',
				true
			);
			
			foreach ($ar_sections as $section_tipo) {
				if (!isset($map[$section_tipo])) {
					$map[$section_tipo] = $diffusion_node_tipo;
				}
			}
		}
		
		return $map;
	}//end get_sections_with_diffusion



}//end diffusion_data

