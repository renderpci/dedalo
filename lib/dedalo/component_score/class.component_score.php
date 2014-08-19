<?php
/*
* CLASS COMPONENT SCORE
*/

class component_score extends component_common {


	public function get_rel_textarea() {

		$ar_textarea_rel = $this->RecordObj_ts->get_relaciones()[0];
		foreach ($ar_textarea_rel as $modelo => $tipo) ;			
			#dump($tipo,'$tipo');
		return $tipo;
	}

}
?>