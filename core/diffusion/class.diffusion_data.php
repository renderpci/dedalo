<?php declare(strict_types=1);
/**
* DIFFUSION_DATA
*
*/
class diffusion_data {


	/**
	* GET_DDO_MAP
	* @param string $diffusion_node_tipo
	* @param string $section_tipo
	* @return array $ddo_map
	*/
	public static function get_ddo_map( string $diffusion_node_tipo, string $section_tipo) : array {

		// ddo_map create or get from properties
		$ddo_map = [];
		$ar_related_dd_tipo	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_node_tipo, 'component_', 'termino_relacionado', false);
		// check if the ontology has his owm ddo_map defined, if not, it will create a ddo_map with related components.
		if(isset($properties->process) && isset($properties->process->ddo_map)){

			$ddo_map = $properties->process->ddo_map;
			
			// resolve the 'self' value for section_tipo or parent, if this properties are defined use it.
			foreach ($ddo_map as $ddo) {
				$ddo->section_tipo	= $ddo->section_tipo === 'self' ? $section_tipo : $ddo->section_tipo;
				$ddo->parent		= $ddo->parent === 'self' ? $section_tipo : $ddo->parent;
			}
		
		}else{
			// create new ddo_map when the ontology doesn't has one ddo_map
			foreach ($ar_related_dd_tipo as $current_tipo) {
				$ddo = new stdClass();
					$ddo->tipo			= $current_tipo;
					$ddo->section_tipo	= $section_tipo;
					$ddo->parent		= $section_tipo;
					$ddo->value_fn		= "get_diffusion_value";

				$ddo_map[] = $ddo;
			}
		}


		return $ddo_map;
	}//end get_ddo_map



	/**
	* GET_DDO_MAP_VALUE
	* resolve the ddo_map components
	* @param object $options
	* @return array $ar_values
	*/
	public static function get_ddo_map_value( object $options ) : array {

		$ddo_map		=  $options->ddo_map;
		$parent			=  $options->section_tipo;
		$section_tipo	=  $options->section_tipo;
		$section_id		=  $options->section_id;

		$ar_values = [];

		$children = array_filter($ddo_map, function($item) use($parent) {
			return $item->parent===$parent;
		});

		foreach ($children as $ddo) {
			$result		= diffusion_data::get_ddo_value($ddo, $ddo_map, $section_tipo, $section_id);
			$ar_values	= array_merge($ar_values, $result);
		}

		return $ar_values;
	}//end get_ddo_map_value



	/**
	* GET_DDO_VALUE
	* resolve the ddo values
	* @param object $ddo
	* @param array $ddo_map
	* @param string $section_tipo
	* @param string|int $section_id
	* @return array $ar_values
	*/
	public static function get_ddo_value(object $ddo, array $ddo_map, string $section_tipo, string|int $section_id) : array {

		$ar_values		= [];
		$current_tipo	= $ddo->tipo;
		$model_name		= RecordObj_dd::get_modelo_name_by_tipo($current_tipo);

		if($model_name==='relation_list') {

			$element = new relation_list(
				$current_tipo,
				$section_id,
				$section_tipo,
				'list'
			);

		}else{

			$element = component_common::get_instance(
				$model_name,
				$current_tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
		}

		$parent		= $ddo->tipo;
		$children	= array_values(
			array_filter($ddo_map, function($item) use($parent) {
				return $item->parent===$parent;
			})
		);

		if(empty($children)) {

			$diffusion_data	= $element->get_diffusion_data( $ddo );
			$ar_values		= array_merge($ar_values, $diffusion_data);

		}else{

			// no empty($children) case
			$ar_locators = $element->get_dato();
			foreach ($ar_locators as $current_locator) {

				$resolve_options = new stdClass();
					$resolve_options->ddo_map		= $ddo_map;
					$resolve_options->parent		= $parent;
					$resolve_options->section_tipo	= $current_locator->section_tipo;
					$resolve_options->section_id	= $current_locator->section_id;

				$diffusion_data	= diffusion_data::get_ddo_map_value( $resolve_options );
				$ar_values = array_merge($ar_values, $diffusion_data);
			}
		}//end if(empty($children))


		return $ar_values;
	}//end get_ddo_value


}//end diffusion_data
