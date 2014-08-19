<?php
# COMPONENT TOOLS (ABSTRACT CLASS)
# MÉTODOS COMPARTIDOS POR TODOS LOS COMPONENTES

abstract class tool_common extends common {

	public $modo;

	# state component (common because is used by various tools like tool_transcription, tool_lang, ..)
	public $component_state ;


	abstract  function __construct($component_obj, $modo);



	/**
	* HTML
	*/
	public function get_html() {

		if(SHOW_DEBUG) {
			$start_time = start_time();
			#global$TIMER;$TIMER[get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/component_tools/'.get_called_class().'/'.get_called_class().'.php' );
		$html =  ob_get_clean();		
		

		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' [element '.get_called_class().']', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}





	/**
	* GET_COMPONENT_STATE_OBJ
	* (common because is used by various tools like tool_transcription, tool_lang, ..)
	*/
	protected function get_component_state_obj($parent) {

		if(isset($this->component_state)) return $this->component_state;

		/* 
		# OLD MODE : Usando section -> get_ar_children_objects_by_modelo_name_in_section
		$tipo 		= common::get_tipo_by_id($parent, $table='matrix');
		$section 	= new section($parent, $tipo);

		$ar_result 	= $section->get_ar_children_objects_by_modelo_name_in_section($modelo_name_required='component_state');
			#dump($ar_result,'get_ar_children_objects_by_modelo_name_in_section '.$tipo);		

		if(count($ar_result)!=1) {
			#trigger_error("Warning: component_state not found or is not properly defined in structure. component_state founded: ".count($ar_result));
			return null;
		}

		$this->component_state = $ar_result[0];
			#dump($this->component_state,'this->$component_state');

		# Configuramos el componente en el modo adecuado para el tool
		$this->component_state->set_caller_component_tipo($this->component_obj->get_tipo());
		$this->component_state->set_caller_element(get_called_class());
		$this->component_state->set_modo('edit_tool');
			#dump($this);
		*/
		
		/**/
		# NEW MODE : Sin usar get_ar_children_objects_by_modelo_name_in_section
		$table 			= common::get_matrix_table_from_tipo($this->component_obj->get_tipo());
		$section_tipo 	= common::get_tipo_by_id($parent, $table);
		$ar_result 		= section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'component_state');
			#dump($ar_result,'get_ar_children_tipo_by_modelo_name_in_section '.$section_tipo);

		if (empty($ar_result[0])) {
			return null;
		}else{
			#$component_tipo = $ar_result[0];
			#$modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
			$this->component_state  = new component_state(NULL,$ar_result[0],'edit_tool',$parent,DEDALO_DATA_NOLAN);	#$id=NULL, $tipo=NULL, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG

			# Configuramos el componente en el modo adecuado para el tool
			$this->component_state->set_caller_component_tipo($this->component_obj->get_tipo());
			$this->component_state->set_caller_element(get_called_class());
			$this->component_state->set_modo('edit_tool');
		}
		

		return $this->component_state;

	}#end get_component_state_obj



}#end class
?>
