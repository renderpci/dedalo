<?php
/*
* CLASS COMPONENT_STATS
*/


class component_stats extends component_common {
	


	protected $stats_ob ;


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