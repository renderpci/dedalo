<?php
/**
* CLASS COMPONENT_FILTER_RECORDS
*
*/
class component_filter_records extends component_common {



	/**
	* GET DATO
	* @return array $dato
	* Sample data:
	* [
	*	 {
	*	  "tipo": "oh1",
	*	  "value": null
	*	 },
	*	 {
	*	  "tipo": "rsc167",
	*	  "value": [1,3,6]
	*	 }
	* ]
	*/
	public function get_dato() {
		$dato = parent::get_dato();

		/*
		if (!empty($dato) && !is_array($dato)) {
			#dump($dato,"dato");
			trigger_error("Error: ".__CLASS__." dato type is wrong. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent");
			$this->set_dato(array());
			$this->Save();
		}
		*/
		if ($dato===null) {
			$dato=array();
		}

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	* dato is object (from js json data) and set as array
	* @return bool
	*/
	public function set_dato($dato) : bool {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		#if (is_object($dato)) {
		#	$dato = array($dato);
		#}

		return parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET_VALOR
	* @return string|null $valor
	*/
	public function get_valor() {

		$dato = $this->get_dato();

		$valor = empty($dato)
			? null
			: json_encode($dato);

		return $valor;
	}//end get_valor



	/**
	* GET_GRID_VALUE
	* Alias of component_common->get_grid_value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
		// public function get_grid_value( object $ddo=null) : dd_grid_cell_object {

		// 	$dd_grid_cell_object = parent::get_grid_value($lang, $ddo);

		// 	// map values to JOSN to allow render it in list
		// 		if (!empty($dd_grid_cell_object->value)) {
		// 			$dd_grid_cell_object->value = array_map(function($el){
		// 				return json_encode($el);
		// 			}, $dd_grid_cell_object->value);
		// 		}


		// 	return $dd_grid_cell_object;
		// }//end get_grid_value



	/**
	* GET_DATALIST
	* Get the list of authorized sections and resolve label
	* @return array $sections
	*/
	public function get_datalist() : array {

		// user areas
		$areas_for_user = security::get_ar_authorized_areas_for_user();

		$sections = [];
		foreach ($areas_for_user as $area_item) {
			// ignore no authorized for user
				if ($area_item->value<2) {
					continue;
				}
			// resolve model
				$model = RecordObj_dd::get_modelo_name_by_tipo($area_item->tipo,true);

			// ignore non sections (areas)
			if($model!=='section') continue;

			// object item
			$sections[] = (object)[
				'tipo'			=> $area_item->tipo,
				'label'			=> RecordObj_dd::get_termino_by_tipo($area_item->tipo, DEDALO_DATA_LANG, true, true),
				'permissions'	=> $area_item->value
			];
		}

		// sort by label
			uasort($sections, function($a, $b) {
				// return $a->label > $b->label;
				if ($a->label == $b->label) {
					return 0;
				}
				return ($a->label < $b->label) ? -1 : 1;
			});

		// regenerate array keys
			$sections = array_values($sections);

		// // get all structure sections
		// $ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name('section');
		// $ar_sections = array();
		// $permissions_user = security::get_permissions_table_of_specific_user($parent);
		// foreach ($ar_section_tipo as $current_section_tipo) {
		// 	$section_permissions = isset($permissions_user->$current_section_tipo->$current_section_tipo) ? (int)$permissions_user->$current_section_tipo->$current_section_tipo : 0;
		// 	if ($section_permissions>0) {

		// 		$plain_value = '';
		// 		if (isset($dato[$current_section_tipo])) {
		// 			$plain_value = implode(',', (array)$dato[$current_section_tipo]);
		// 		}

		// 		$current_label = RecordObj_dd::get_termino_by_tipo($current_section_tipo, DEDALO_DATA_LANG, true, true); //, $terminoID, $lang=NULL, $from_cache=false, $fallback=true

		// 		$data = array(
		// 			'label' 	  => $current_label,
		// 			'permissions' => $section_permissions,
		// 			'plain_value' => $plain_value,
		// 			);
		// 		$ar_sections[$current_section_tipo] = $data;
		// 	}
		// }
		// # sort by label
		// uasort($ar_sections, function($a, $b) {
		//     return $a['label'] > $b['label'];
		// });


		return $sections;
	}//end get_datalist



}//end class component_filter_records