<?php
/*
* CLASS INSPECTOR
*
*
*/
class inspector {



	protected $modo;
	protected $tipo;
	protected $section;



	public function __construct($modo, $tipo, $section) {

		$this->modo		= $modo;
		$this->tipo		= $tipo;
		$this->section	= $section;
	}//end __construct



	/**
	* GET_HTML
	* @return string $html
	*/
	public function get_html() {

		if(SHOW_DEBUG) $start_time = start_time();

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. __CLASS__ .'/'. __CLASS__ .'.php' );
		$html =  ob_get_clean();
		
		if(SHOW_DEBUG) {
			#$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}//end get_html


	/**
	* GET_TOOL_RELATION_BUTTON_HTML
	*/
	protected function get_tool_relation_button_html() {

		if(SHOW_DEBUG) $start_time = start_time();

		$current_section_id = navigator::get_selected('id');
			#dump($current_section_id,'current_section_id');

		$current_section_tipo = navigator::get_selected('section');
		#dump($current_section_tipo,'current_section_tipo');
		/*
		$section 			 = section::get_instance($current_section_id, $current_section_tipo);
		$ar_children_objects = $section->get_ar_children_objects_by_modelo_name_in_section('component_relation');
			#dump($ar_children_objects,'ar_children_objects');
		*/
		$ar_component_relation_tipo	= section::get_ar_children_tipo_by_modelo_name_in_section($current_section_tipo, 'component_relation',true);

		if (empty($ar_component_relation_tipo[0])) return null;


		$component_relation_tipo = $ar_component_relation_tipo[0];
		$component_relation 	 = component_common::get_instance('component_relation',
																  $component_relation_tipo,
																  $current_section_id,
																  'edit',
																  DEDALO_DATA_LANG,
																  $current_section_tipo);

		$tool_relation_obj 	= $component_relation->load_specific_tool('tool_relation');

		if (is_object($tool_relation_obj)) {
			$html 			= $tool_relation_obj->get_html();
			return $html;
		}

		/*
		$component_relation = $ar_children_objects[0];
		$tool_relation_obj 	= $component_relation->load_tools('tool_relation');
			#dump($tool_relation_obj,'tool_relation_obj');

		if (isset($tool_relation_obj[0])) {
			$html 		= $tool_relation_obj[0]->get_html();
			return $html;
		}
		*/			
	}//end get_tool_relation_button_html



}//end inspector
?>