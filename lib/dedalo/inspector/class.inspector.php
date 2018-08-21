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
	protected function get_relation_list_button_html() {

		if(SHOW_DEBUG) $start_time = start_time();

		$current_section_id = navigator::get_selected('id');

		$current_section_tipo = navigator::get_selected('section');

		//get the relation_list
		$ar_modelo_name_required = array('relation_list');
		$resolve_virtual 		 = false;

		// Locate relation_list element in current section (virtual ot not)
		$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);

		// If not found children, try resolving real section
		if (empty($ar_children)) {
			$resolve_virtual = true;
			$ar_children = section::get_ar_children_tipo_by_modelo_name_in_section($current_section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual, $recursive=false, $search_exact=true);
		}// end if (empty($ar_children))

		$relation_list = new relation_list($ar_children[0],$current_section_id, $current_section_tipo, 'button' );

		$relation_list_html = $relation_list->get_html();

		return $relation_list_html;
	}//end get_tool_relation_button_html



}//end inspector
?>