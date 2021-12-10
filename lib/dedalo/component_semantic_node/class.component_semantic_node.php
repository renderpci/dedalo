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

		// compatibility
			// converts old format
			//	{
			//      "oh89": [
			//        {
			//          "section_id": "2",
			//          "section_tipo": "ds1"
			//        }
			//      ]
			//  }
			// to the new one:
			// {
			//      [
			//        {
			//          "section_id": "2",
			//          "section_tipo": "ds1",
			//          "from_component_tipo": "oh89"
			//        }
			//      ]
			//  }
			if (!empty($row_locator->ds) && is_object($row_locator->ds) && is_array($row_locator->ds->{$this->tipo})) {

				$ds = [];
				foreach ($row_locator->ds->{$this->tipo} as $ds_object) {

					$new_value = (object)[
						'section_id'			=> $ds_object->section_id,
						'section_tipo'			=> $ds_object->section_tipo,
						'from_component_tipo'	=> $this->tipo,
						'type'					=> $this->relation_type
					];
					$ds[] = $new_value;
				}
				$row_locator->ds = $ds;
				debug_log(__METHOD__." Changed value of ds from OLD format to the new one ".to_string($row_locator), logger::WARNING);
				// update portal data (!)
				$this->update_portal_dato($row_locator);
			}

		// dato in this component, is the portal row locator portion called as property 'ts'
		$this->dato = $row_locator->ds ?? null;

		// set as db loaded
		$this->bl_loaded_matrix_data = true;
	}//end set_dato



	/**
	* UPDATE_PORTAL_DATO
	* @return bool
	*/
	public function update_portal_dato($new_row_locator) {

		$portal_tipo = $new_row_locator->from_component_tipo;

		// portal update
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($portal_tipo,true);
			$component = component_common::get_instance( $modelo_name,
														 $portal_tipo,
														 $this->parent,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $this->section_tipo);
			$current_dato = $component->get_dato();
			foreach ($current_dato as $key => $current_locator) {
				if ($current_locator->section_id==$new_row_locator->section_id &&
					$current_locator->section_tipo==$new_row_locator->section_tipo
				) {
					// replace old locator
					$current_dato[$key] = $new_row_locator;

					$new_dato = array_values($current_dato);
					$component->set_dato($new_dato);
					$component->Save();
					debug_log(__METHOD__." Updated portal value with updated new_row_locator ".to_string($current_dato), logger::WARNING);

					return true;
				}
			}

		return false;
	}//end update_portal_dato



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


