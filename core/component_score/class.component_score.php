<?php
/*
* CLASS COMPONENT SCORE
*/

class component_score extends component_common {


	# GET DATO : Format "DD#60 ..."
	public function get_dato() {
		$dato = parent::get_dato();
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	}


	public function get_rel_textarea() {

		$ar_textarea_rel = $this->RecordObj_dd->get_relaciones()[0];
		foreach ($ar_textarea_rel as $modelo => $tipo) ;			
			#dump($tipo,'$tipo');
		return $tipo;
	}

}
?>