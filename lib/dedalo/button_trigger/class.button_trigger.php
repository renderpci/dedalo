<?php
/*
Clase principal del modelo del objeto

*/


class button_trigger extends button_common {


	public $parent;

	function __construct($tipo, $target='', $section_tipo=null) {

		if (empty($section_tipo)) {
			$section_tipo = TOP_TIPO;
		}

		# common __construct
		parent::__construct($tipo, $target, $section_tipo);

	}




}#end button_trigger class
?>