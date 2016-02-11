<?php
/*
* CLASS TOOL IMAGE VERSION
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');


class tool_indexation extends tool_common {
	
	# media component
	protected $component_obj ;

	# Tag label selected in component_text_area .Received when load inspector info trigger is called like [/index-n-1]
	public $selected_tagName ;

	public $context = 'inspector'; # inspector | tool_window

	
	public function __construct($component_obj, $modo='button') {
		
		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;

			#dump($component_obj,"component_obj");
	}


	
	
	
	/**
	* GET_AR_INVERSE
	* Format, filter and sort inverse_locators values for use in selector
	* @return array $ar_inverse
	*/
	public function get_ar_inverse( $inverse_locators ) {
		$ar_inverse=array();

		$section_name = RecordObj_dd::get_termino_by_tipo( TOP_TIPO );
		foreach ((array)$inverse_locators as $current_locator) {
			if ($current_locator->section_tipo!=TOP_TIPO) {
				continue;
			}			
			$ar_inverse[$current_locator->section_id] = "$section_name - $current_locator->section_id";				
		}
		natsort($ar_inverse);
		
		return $ar_inverse;

	}#end get_ar_inverse
	
	













	
	
}
?>