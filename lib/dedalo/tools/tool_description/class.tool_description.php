<?php
/*
* CLASS TOOL_DESCRIPTION
*
*
*/
class tool_description extends tool_common {
	

	public $section_tipo;
	public $section_id;
	public $modo;
	public $tool_tipo;



	public function __construct($section=null, $modo='button') {
		
		if (empty($section)) {
			throw new Exception("Error Processing Request. Var section is empty", 1);
		}
		$this->section_tipo 		= $section->get_tipo();
		$this->section_id			= $section->get_section_id();
		$this->modo 				= $modo;

		switch ($modo) {
			case 'button':
				# Injected in section obj (rows_list.phtml)
				$tool_tipo = $section->tool_section_tipo;
				break;
			
			default:
				# Form url get vars
				if(isset($_REQUEST['tool_tipo'])) {
					$tool_tipo = $_REQUEST['tool_tipo'];
				}else{
					$tool_tipo = false;
					if ($modo!=='button') {
						trigger_error("Invalid param get tool_tipo");
					}
				}
				break;
		}		

		# Fix tool_tipo
		$this->tool_tipo = $tool_tipo;


		return true;
	}//end __construct



	/**
	* GET_AR_ELEMENTS
	* Resolve all component alias, childrens of current tool in structure
	* @return array $ar_components
	*	Array of component objects
	*/
	public function get_ar_elements() {

		$ar_components = array();

		// Tool childrens of type 'component_alias'
		#$ar_component_tipos = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tool_tipo, $modelo_name='component_alias', $relation_type='children');
		$ar_component_tipos = RecordObj_dd::get_ar_childrens($this->tool_tipo);	
			
		foreach ($ar_component_tipos as $current_tipo) {

			$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			
			# Only components and section goups are allowed
			if(strpos($current_modelo_name, 'component_')===false && strpos($current_modelo_name, 'section_group')===false) continue;
			
			$section_group = null; # Default is null in each loop
			if ($current_modelo_name==='section_group') {

				$section_group = $current_tipo;
				
				$element = new stdClass();
					$element->model 	= $current_modelo_name;
					$element->tipo 		= $current_tipo;

				$ar_components[] = $element;

				$ar_tipos = RecordObj_dd::get_ar_childrens($current_tipo);			
			}else{
				$ar_tipos = [$current_tipo];
			}
			
			foreach ($ar_tipos as $current_alias_component_tipo) {
							
				$current_alias_component 	= new RecordObj_dd($current_alias_component_tipo);
				$current_alias_properties 	= $current_alias_component->get_propiedades(true);
				$current_component_tipo 	= $current_alias_properties->alias_of;

				if(isset($current_component_tipo)){
					
					$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);				
					$modo 		 		= 'edit';				

					$current_component 	= component_common::get_instance($modelo_name,
																		 $current_component_tipo,
																		 $this->section_id,
																		 $modo,
																		 DEDALO_DATA_LANG,
																		 $this->section_tipo);

					$current_component->set_propiedades($current_alias_properties);
						#dump($current_component->get_propiedades(), ' current_component ++ '.to_string($modelo_name));

					#$ar_components[] = $current_component;
					$element = new stdClass();
						$element->model 		= $modelo_name;
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


	
}//end class tool_description
?>