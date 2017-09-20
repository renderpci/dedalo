<?php
/*
* TOOL_LANG_MULTI
*
*
*/
class tool_lang_multi extends tool_common {


	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Para unificar el acceso, se copia el componente a $this->component_obj
		$this->component_obj = $component_obj;
		$this->section_tipo  = $component_obj->get_section_tipo();
	}
	



}//end class
?>