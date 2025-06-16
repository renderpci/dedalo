<?php declare(strict_types=1);
/**
* DIFFUSION_DATA
*
*/
class diffusion_data {


	/**
	* GET_DDO_MAP
	* @return
	*/
	public static function get_ddo_map( string $diffusion_node_tipo, string $section_tipo) {

		// ddo_map create or get from properties
		$ddo_map			= [];
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
	* @param array $ddo_map
	* @param string $parent
	* @param string $section_tipo
	* @param string|int $section_id
	* @return array $ar_values
	*/
	public static function get_ddo_map_value(array $ddo_map, string $parent, $section_tipo, $section_id) : array {

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

			$id			= $ddo->id ?? null;
			$value_fn	= $ddo->value_fn ?? 'get_diffusion_value';

			if($model_name==='relation_list') {

				// diffusion_properties
				$diffusion_properties = $ddo->diffusion_properties;
				$element->set_diffusion_properties($diffusion_properties);

				// value (dato)
				$value = $element->get_diffusion_dato();

				// $config_properties = $ddo->config ?? null;
				// if($config_properties){
				// 	$config = $this->resolve_configuration($config_properties);
				// 	$result = $this->{$config_properties->process_fn}((object)[
				// 		'config_properties'	=> $config_properties,
				// 		'config'			=> $config,
				// 		'value'				=> $value
				// 	]);
					$ar_values = $result;
				}else{
					foreach ($value as $value) {
						$ddo_value = new stdClass();
							$ddo_value->tipo	= $ddo->tipo;
							$ddo_value->lang	= null;
							$ddo_value->value	= $value->section_id;
							$ddo_value->id		= $id;

						$ar_values[] = $ddo_value;
					}
				}
			}elseif($model_name==='component_section_id') {

				$ddo_value = new stdClass();
					$ddo_value->tipo	= $ddo->tipo;
					$ddo_value->lang	= null;
					$ddo_value->value	= $section_id;
					$ddo_value->id		= $id;

				$ar_values[] = $ddo_value;
			}elseif($model_name === 'component_image') {

				$quality		= $ddo->fn_params->quality ?? '1.5MB';
				$test_file		= $ddo->fn_params->test_file ?? false;
				$absolute		= $ddo->fn_params->absolute ?? false;
				$default_add	= $ddo->fn_params->default_add ?? false;

				// value
				$value = $element->get_image_url($quality, $test_file, $absolute, $default_add);

				$ddo_value = new stdClass();
					$ddo_value->tipo	= $ddo->tipo;
					$ddo_value->lang	= null;
					$ddo_value->value	= $value;
					$ddo_value->id		= $id;

				$ar_values[] = $ddo_value;

			}elseif(in_array($model_name, component_relation_common::get_components_with_relations())) {

				// value
				$value = $element->{$value_fn}();

				$ddo_value = new stdClass();
					$ddo_value->tipo	= $ddo->tipo;
					$ddo_value->lang	= null;
					$ddo_value->value	= $value;
					$ddo_value->id		= $id;

				$ar_values[] = $ddo_value;
			}else{

				$dato_full = $element->get_dato_full();
				if(!empty($dato_full)) {
					foreach ($dato_full as $current_lang => $value) {
						if(!empty($value)) {

							$element->set_lang($current_lang);
							$lang_alpha2 = $current_lang===DEDALO_DATA_NOLAN
								? lang::get_alpha2_from_code(DEDALO_DATA_LANG_DEFAULT)
								: lang::get_alpha2_from_code($current_lang);

							$value	= $element->{$value_fn}($current_lang);

							$ddo_value = new stdClass();
								$ddo_value->tipo	= $ddo->tipo;
								$ddo_value->lang	= $lang_alpha2;
								$ddo_value->value	= $value;
								$ddo_value->id		= $id;

							$ar_values[] = $ddo_value;
						}
					}
				}
			}
		}else{

			// no empty($children) case

			$ar_locators = $element->get_dato();
			foreach ($ar_locators as $current_locator) {
				$result	= $this->get_ddo_map_value(
					$ddo_map,
					$parent,
					$current_locator->section_tipo,
					$current_locator->section_id
				);
				$ar_values = array_merge($ar_values, $result);
			}
		}//end if(empty($children))


		return $ar_values;
	}//end get_ddo_value


}//end diffusion_data