<?php
# COMPONENT TOOLS (ABSTRACT CLASS)
# MÉTODOS COMPARTIDOS POR TODOS LOS COMPONENTES

abstract class tool_common extends common {

	public $modo;

	# state component (common because is used by various tools like tool_transcription, tool_lang, ..)
	public $component_state ;



	/**
	* __CONSTRUCT 
	* @param object $element_obj (can be 'component' or 'section')
	* @param string $modo (default is 'page' when is called from main page)
	*/
	abstract function __construct($element_obj, $modo);



	/**
	* HTML
	* @return string $html (final html code)
	*/
	public function get_html() {

		if(SHOW_DEBUG) {
			#global$TIMER;$TIMER[get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		$html = ob_get_clean();		
		

		if(SHOW_DEBUG) {
			#global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}





	/**
	* GET_COMPONENT_STATE_OBJ
	* (common because is used by various tools like tool_transcription, tool_lang, ..)
	* @param string $parent 
	* @return object $this->component_state (get and store component_state)
	*/
	protected function get_component_state_obj($parent) {

		if(isset($this->component_state)) return $this->component_state;
		
		# NEW MODE : Sin usar get_ar_children_objects_by_modelo_name_in_section
		$component_tipo = $this->component_obj->get_tipo();
		$section_tipo	= component_common::get_section_tipo_from_component_tipo($component_tipo);
		$ar_result 		= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_state',true);
			#dump($ar_result,'get_ar_children_tipo_by_modelo_name_in_section '.$section_tipo);

		if (empty($ar_result[0])) {
			return null;
		}else{
			#$component_tipo = $ar_result[0];
			#$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
			#$this->component_state  = new component_state($ar_result[0],$parent,'edit_tool',DEDALO_DATA_NOLAN);
			$this->component_state  = component_common::get_instance('component_state', $ar_result[0], $parent, 'edit_tool', DEDALO_DATA_NOLAN);
			# Configuramos el componente en el modo adecuado para el tool
			$this->component_state->set_caller_component_tipo($this->component_obj->get_tipo());
			$this->component_state->set_caller_element(get_called_class());
			$this->component_state->set_modo('edit_tool');
		}
		

		return (object)$this->component_state;

	}#end get_component_state_obj




}#end class
?>