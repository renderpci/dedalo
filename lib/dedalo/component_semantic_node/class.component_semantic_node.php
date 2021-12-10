<?php
/*
* CLASS COMPONENT SEMANTIC NODE
*
*
*/
class component_semantic_node extends component_relation_common {



	/**
	* VARS
	*/
		protected $relation_type = DEDALO_RELATION_TYPE_LINK;
		public $row_locator;



	/**
	* SET_DATO
	* Set raw dato overwrite existing dato.
	* Note that the current component does not have its own 'dato', rather the data is inside the portal locator
	* Anyway, we need the portal full row locator to work here.
	* @param object $row_locator
	* 	Full component_portal locator containing inside the ds locators formated as:
	* 	{
	* 		section_tipo: rsc197
	* 		section_id: 23
	* 		ds : [
	* 			{section_tipo: rsc87, section_id: 3}
	* 		]
	* 	}
	*/
	public function set_dato($row_locator) {

		// fix whole full locator
		$this->row_locator = $row_locator;

		// dato in this component, is the portal row locator portion called as property 'ts'
		$this->dato = $row_locator->ds ?? null;

		// set as db loaded
		$this->bl_loaded_matrix_data = true;
	}//end set_dato



	/**
	* GET_VALOR_EXPORT
	* @return string $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes='"', $add_id=false)  {

		$dato = $this->get_dato();

		$ar_values = [];
		if (!empty($dato)) {
			foreach ($dato as $key => $current_locator) {
				$label			= ts_object::get_term_by_locator( $current_locator, $lang, $from_cache=true );
				$ar_values[]	= $label;
			}//end foreach ($dato as $key => $current_locator)
		}

		$valor_export = implode(', ', $ar_values);

		return $valor_export;
	}//end get_valor_export(


	
}//end semantic_node


