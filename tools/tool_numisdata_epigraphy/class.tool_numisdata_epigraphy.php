<?php
/**
* CLASS TOOL_NUMISDATA_EPIGRAPHY
*
*
*/
class tool_numisdata_epigraphy extends tool_common {

	public $section_tipo;
	public $section_id;
	public $mode;
	public $tool_tipo;


	/**
	* GET_AR_ELEMENTS
	* Resolve all component alias, children of current tool in structure
	* @return array $ar_components
	*	Array of component objects
	*/
	public function get_ar_elements() {

		$ar_components = array();

		// Tool childrens of type 'component_alias'
		#$ar_component_tipos = RecordObj_dd::get_ar_terminoID_by_model_name_and_relation($this->tool_tipo, $model_name='component_alias', $relation_type='children');
		$ar_component_tipos = RecordObj_dd::get_ar_childrens($this->tool_tipo);

		foreach ($ar_component_tipos as $current_tipo) {

			$current_model_name = RecordObj_dd::get_model_name_by_tipo($current_tipo,true);

			# Only components and section goups are allowed
			if(strpos($current_model_name, 'component_')===false && strpos($current_model_name, 'section_group')===false) continue;

			$section_group = null; # Default is null in each loop
			if ($current_model_name==='section_group') {

				$section_group = $current_tipo;

				$element = new stdClass();
					$element->model 	= $current_model_name;
					$element->tipo 		= $current_tipo;

				$ar_components[] = $element;

				$ar_tipos = RecordObj_dd::get_ar_childrens($current_tipo);
			}else{
				$ar_tipos = [$current_tipo];
			}

			foreach ($ar_tipos as $current_alias_component_tipo) {

				$current_alias_component 	= new RecordObj_dd($current_alias_component_tipo);
				$current_alias_properties 	= $current_alias_component->get_properties(true);
				# Inject in propiedades current component tipo
				$current_alias_properties->alias_component_tipo = $current_alias_component_tipo;

				$current_component_tipo 	= $current_alias_properties->alias_of;

				if(isset($current_component_tipo)){

					$model_name 		= RecordObj_dd::get_model_name_by_tipo($current_component_tipo,true);
					$mode 		 		= 'edit';

					$current_component 	= component_common::get_instance($model_name,
																		 $current_component_tipo,
																		 $this->section_id,
																		 $mode,
																		 DEDALO_DATA_LANG,
																		 $this->section_tipo);

					$current_component->set_properties($current_alias_properties);
						#dump($current_component->get_properties(), ' current_component ++ '.to_string($model_name));

					#$ar_components[] = $current_component;
					$element = new stdClass();
						$element->model 		= $model_name;
						$element->tipo 			= $current_alias_component_tipo;
						$element->section_group = isset($section_group) ? $section_group : null;
						$element->component 	= $current_component;

					$ar_components[] = $element;
				}
			}
		}
		#dump($ar_components, ' ar_components ++ '.to_string());

		return $ar_components;
	}//end get_ar_elements

}//end class tool_numisdata_epigraphy