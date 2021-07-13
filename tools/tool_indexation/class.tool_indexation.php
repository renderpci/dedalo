<?php
include( dirname(__FILE__) . '/translators/class.babel.php');
/*
* CLASS TOOL_indexation
*
*
*/
class tool_indexation { // extends tool_common


	public $source_component;
	public $target_component;
	public $ar_source_langs;
	public $ar_source_components;
	public $target_langs;	# From filter 'Projects'
	public $last_target_lang;
	public $section_tipo;



	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Para unificar el acceso, se copia el componente a $this->component_obj
		$this->component_obj 	= $component_obj;

		# Fix component
		$this->source_component = $component_obj;
		$this->source_component->set_modo('tool_indexation');
		#$this->source_component->set_variant( tool_indexation::$source_variant );
			#dump($component_obj,'component_obj');

		$this->section_tipo = $component_obj->get_section_tipo();
	}//end __construct


}//end class
