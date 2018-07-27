<?php
/*
* CLASS TOOL_SUBTITLES
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(dirname(dirname(__FILE__))) .'/media_engine/class.OptimizeTC.php');
require_once( dirname(__FILE__) .'/class.subtitles.php');

class tool_subtitles extends tool_common {


	public $source_component;
	public $section_tipo;

	
	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {
	
		# Fix modo
		$this->modo = $modo;

		# Para unificar el acceso, se copia el componente a $this->component_obj
		$this->component_obj = $component_obj;
		$this->section_tipo  = $component_obj->get_section_tipo();

		$this->show_debug = false;
	}



	/**
	* BUILD_SUBTITLES_TEXT
	* Alias of generic static subtitles::build_subtitles_text
	* @param object $request_options
	* @return string | false $subtitles_text
	*/
	public function build_subtitles_text($request_options) {
		
		$subtitles_text = subtitles::build_subtitles_text($request_options);

		return $subtitles_text;
	}//end build_subtitles_text



}//end tool_subtitles
?>