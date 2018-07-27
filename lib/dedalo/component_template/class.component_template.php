<?php
/*
* CLASS COMPONENT TEMPLATE
*/


class component_template extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# GET DATO : Format {"dd22":["tool_lang:lg-spa"]}
	public function get_dato() {
		$dato = parent::get_dato();
		return (object)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}
	
}
?>