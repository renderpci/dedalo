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
				$ddo->section_tipo	= $ddo->section_tipo === 'self' ? $section_tipo : $ddo->section_tipo;
				$ddo->parent		= $ddo->parent === 'self' ? $section_tipo : $ddo->parent;

				// add a new safe ddo
				$ddo_map[] = new dd_object($ddo);
			}

		}else{

			$ar_related_dd_tipo	= ontology_node::get_ar_tipo_by_model_and_relation(
				$diffusion_node_tipo,
				'component_',
				'related',
				false
			);
			// create new ddo_map when the ontology doesn't has one ddo_map
			foreach ($ar_related_dd_tipo as $current_tipo) {

				$ddo = new dd_object((object)[
					'tipo'			=> $current_tipo,
					'section_tipo'	=> $section_tipo,
					'parent'		=> $section_tipo
				]);

				$ddo_map[] = $ddo;
			}
		}


		return $ddo_map;
	}//end get_ddo_map



	/**
	* GET_DDO_MAP_VALUE
	* Resolve the ddo_map value from components
	* @param object $options
	* @return array $ar_values
	*/
	public static function get_ddo_map_value( object $options ) : array {

		if (!isset($options->ddo_map, $options->parent, $options->section_tipo, $options->section_id)) {
			throw new InvalidArgumentException('Missing required properties in options object');
		}

		$ddo_map		= $options->ddo_map;
		$parent			= $options->parent;
		$section_tipo	= $options->section_tipo;
		$section_id		= $options->section_id;

		$children = array_filter($ddo_map, function($item) use($parent) {
			return $item->parent===$parent;
		});

		$values_collection = [];
		foreach ($children as $ddo) {
			$ddo_value = diffusion_data::get_ddo_value($ddo, $ddo_map, $section_tipo, $section_id);
			$values_collection[] = $ddo_value;
		}
		// merge all arrays in one flat array
		$ar_values = array_merge(...$values_collection);


		return $ar_values;
	}//end get_ddo_map_value



	/**
	* GET_DDO_VALUE
	* Resolve the ddo values
	* @param object $ddo
	* @param array $ddo_map
	* @param string $section_tipo
	* @param string|int $section_id
	* @return array $ar_values
	*/
	public static function get_ddo_value( object $ddo, array $ddo_map, string $section_tipo, string|int $section_id ) : array {

		$current_tipo	= $ddo->tipo;
		$model_name		= ontology_node::get_model_by_tipo($current_tipo);

		$element = $model_name === 'relation_list'
			? new relation_list($current_tipo, $section_id, $section_tipo, 'list')
			: component_common::get_instance(
				$model_name,
				$current_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);

		$parent		= $current_tipo;
		$children	= array_values(
			array_filter($ddo_map, function($item) use($parent) {
				return $item->parent===$parent;
			})
		);

		if(empty($children)) {
			// end of the chain case: get diffusion data
			return $element->get_diffusion_data($ddo);
		}

		// no empty ($children) case: recursion
		$ar_locators = $element->get_dato() ?? [];

		$valid_sections_tipo = array_map( function($ddo){
			return $ddo->section_tipo;
		}, $children);

		$ar_values_collection = [];
		foreach ($ar_locators as $current_locator) {

			if( !in_array($current_locator->section_tipo, $valid_sections_tipo)){
				continue;
			}

			$resolve_options = new stdClass();
				$resolve_options->ddo_map		= $ddo_map;
				$resolve_options->parent		= $parent;
				$resolve_options->section_tipo	= $current_locator->section_tipo;
				$resolve_options->section_id	= $current_locator->section_id;

			$ddo_map_value = diffusion_data::get_ddo_map_value( $resolve_options );

			if( !empty($ddo_map_value) ){
				foreach ($ddo_map_value as $current_value) {
					$current_value->key	= $current_locator->section_tipo.'_'.$current_locator->section_id;
				}
			}
			$ar_values_collection[] = $ddo_map_value;
			// $ar_values_collection[] = diffusion_data::get_ddo_map_value( $resolve_options );
		}

		// flat array merging all values
		$ar_values = array_merge(...$ar_values_collection);


		return $ar_values;
	}//end get_ddo_value



}//end diffusion_data
