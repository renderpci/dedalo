<?php
/*
* CLASS COMPONENT SEMANTIC NODE
*/


class component_semantic_node extends component_relation_common {

	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	public $row_locator;
	

	/**
	* SET_DATO
	* Set raw dato overwrite existing dato.
	* Usually, dato is built element by element, adding one locator to existing dato, but some times we need
	* insert complete array of locators at once. Use this method in this cases
	*/
	public function set_dato($row_locator) {

		$this->dato = $row_locator->ds;

		$this->row_locator = $row_locator;

		$this->bl_loaded_matrix_data = true;
		return true;
	}//end set_dato

	/**
	* GET_VALOR_EXPORT
	* @return
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes='"', $add_id=false )  {

		$dato = $this->get_dato();

		$ar_values = [];
		foreach ($dato as $key => $current_locator) {

			// params: $locator, $lang=DEDALO_DATA_LANG, $section_tipo, $show_parents=false, $ar_componets_related=false, $divisor=false
			$ar_values[] = ts_object::get_term_by_locator( $current_locator, $lang, $from_cache=true );

		}//end foreach ($dato as $key => $current_locator)

		$valor_export = implode(', ', $ar_values);

		return $valor_export;
	}//end get_valor_export(

	
}//end semantic_node
