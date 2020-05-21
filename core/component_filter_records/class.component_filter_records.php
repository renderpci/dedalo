<?php
/*
* CLASS component_filter_records
*/


class component_filter_records extends component_common {



	/**
	* GET DATO
	* @return array $dato
	*	$dato is stored in db as object (json encoded asoc array), but is converted to php array
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
	*/
	public function set_dato( $dato ) {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		#if (is_object($dato)) {
		#	$dato = array($dato);
		#}

		parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET_VALOR
	* @return
	*/
	public function get_valor() {
		return json_encode($this->get_dato());
	}//end get_valor



	/**
	* get_datalist
	* Get the list of authorized sections and resolve label
	* @return array $sections
	*/
	public function get_datalist() {

		// user areas
		$areas_for_user = security::get_ar_authorized_areas_for_user();

		$sections = [];
		foreach ($areas_for_user as $key => $area_item) {
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
				'tipo' 			=> $area_item->tipo,
				'label' 		=> RecordObj_dd::get_termino_by_tipo($area_item->tipo, DEDALO_DATA_LANG, true, true),
				'permissions' 	=> $area_item->value
			];
		}

		// sort by label
			uasort($sections, function($a, $b) {
			    return $a->label > $b->label;
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




}//end component_filter_records
