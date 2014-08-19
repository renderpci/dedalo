<?php
/*
* CLASS INSPECTOR
*/


class inspector {

	protected $modo;

	public function __construct($modo) {
		$this->modo = $modo;
	}

	/**
	* HTML
	*/
	public function get_html() {

		if(SHOW_DEBUG) $start_time = start_time();

		/*
		# DEDALO_CACHE_MANAGER : var
		$cache_var='get_html_inspector_'.navigator::get_selected('area').'_'.navigator::get_selected('id').'_'.navigator::get_selected('modo');
		if(DEDALO_CACHE_MANAGER && cache::exists($cache_var)) {
			dump($cache_var,"COMPONENT SHOW FROM CACHE");
			return cache::get($cache_var);
		}
		#dump($cache_var,'$cache_var');
		*/

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/'. __CLASS__ .'/'. __CLASS__ .'.php' );
		$html =  ob_get_clean();
		

		/*
		# DEDALO_CACHE_MANAGER : Lo metemos en cache
		if(DEDALO_CACHE_MANAGER) {
			# For now, only in list mode (and variants like portal_list, etc..)
			#if (strpos($cache_var, '_list')!==false ) {
				cache::set($cache_var, $html);
				#error_log("Added cache: $cache_var ");
			#}
		}
		*/
		 
		if(SHOW_DEBUG) {
			$GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}


	/**
	* GET_TOOL_RELATION_BUTTON_HTML
	*/
	protected function get_tool_relation_button_html() {

		if(SHOW_DEBUG) $start_time = start_time();

		$current_section_id_matrix = navigator::get_selected('id');
			#dump($current_section_id_matrix,'current_section_id_matrix');

		$current_section_tipo = navigator::get_selected('section');
			#dump($current_section_tipo,'current_section_tipo');

		$section 			 = new section($current_section_id_matrix, $current_section_tipo);
		$ar_children_objects = $section->get_ar_children_objects_by_modelo_name_in_section('component_relation');
			#dump($ar_children_objects,'ar_children_objects');

		if (!empty($ar_children_objects[0])) {

			$component_relation = $ar_children_objects[0];
			$tool_relation_obj 	= $component_relation->load_specific_tool('tool_relation');
			if (is_object($tool_relation_obj)) {
				$html 			= $tool_relation_obj->get_html();

				if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );

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
		}

		if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__. ' ' );
	}






};
?>
