<?php
/*
Clase principal del modelo del objeto

*/


class button_trigger extends button_common {


	public $parent;

	function __construct($tipo, $target='') {

		# common __construct
		parent::__construct($tipo, $target);

		#dump($this->propiedades);
	}




}#end button_trigger class
?>