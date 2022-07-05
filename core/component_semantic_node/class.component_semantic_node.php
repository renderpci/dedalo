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
		// protected $relation_type = DEDALO_RELATION_TYPE_LINK;
		protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
		protected $default_relation_type_rel	= null;
		public $parent_section_tipo;
		public $parent_section_id;
		public $row_locator;



	/**
	* SET_DATO
	* @return
	*/
	public function set_dato($dato) {

		// fix dato (clean and checked values)
		parent::set_dato( $dato );

		// update row_locator
		if(isset($this->row_locator)){
			$this->row_locator->ds = $this->dato;
		}

		return true;
	}//end set_dato



	/**
	* SET_ROW_LOCATOR
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
	* @return bool
	*/
	public function set_row_locator(object $row_locator) : bool {

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

		return true;
	}//end set_row_locator



	/**
	* SAVE
	* @return int|null $section_id
	*/
	public function Save() : ?int {

		$result = $this->update_portal_dato($this->row_locator);

		return $result===true ? (int)$this->section_id : null;
	}//end save



	/**
	* UPDATE_PORTAL_DATO
	* @return bool
	*/
	public function update_portal_dato(?object $new_row_locator) : bool {

		if(empty($new_row_locator)){
			return false;
		}

		$portal_tipo			= $new_row_locator->from_component_tipo;
		$portal_section_tipo	= $this->get_parent_section_tipo();
		$portal_section_id		= $this->get_parent_section_id();

		// portal update
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($portal_tipo,true);
			$component = component_common::get_instance( $modelo_name,
														 $portal_tipo,
														 $portal_section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $portal_section_tipo);
			$current_dato = $component->get_dato();

			foreach ($current_dato as $key => $current_locator) {
				if ($current_locator->section_id==$new_row_locator->section_id &&
					$current_locator->section_tipo==$new_row_locator->section_tipo
				) {
					// replace old locator
					$current_dato[$key] = $new_row_locator;

					$new_dato = array_values($current_dato);
					$component->set_dato($new_dato);

					$res = $component->Save();
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
	}//end get_valor_export



	/**
	* GET_TOOLS
	* 	Catch get_tools call to prevent load tools sections
	* @return array $tools
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql( object $query_object ) : object {
		# Always set fixed values
		$query_object->type 	= 'jsonb';
		$query_object->unaccent = false;

		# component path
		$query_object->component_path = ['relations'];

		$ds_q = new stdClass();
			$ds_q->ds = $query_object->q;
		$q = $ds_q;


		# For unification, all non string are json encoded
		# This allow accept mixed values (encoded and no encoded)
		if (!is_string($q)) {
			$q = json_encode($q);
		}

		$q_operator = isset($query_object->q_operator) ? $query_object->q_operator : null;


		switch (true) {
			# IS DIFFERENT
			case ($q_operator==='!=' && !empty($q)):
				$operator = '@>';
				$q_clean  = '\'['.$q.']\'::jsonb=FALSE';
				$query_object->operator = $operator;
				$query_object->q_parsed = $q_clean;
				break;
			# IS NULL
			case ($q_operator==='!*'):
				$operator = '@>';
				$q_obj = new stdClass();
					$q_obj->from_component_tipo = end($query_object->path)->component_tipo;
				$ar_q 	  = array($q_obj);
				$q_clean  = '\''.json_encode($ar_q).'\'::jsonb=FALSE';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
			# IS NOT NULL
			case ($q_operator==='*'):
				$operator = '@>';
				$q_obj = new stdClass();
					$q_obj->from_component_tipo = end($query_object->path)->component_tipo;
				$ar_q 	  = array($q_obj);
				$q_clean  = '\''.json_encode($ar_q).'\'';
				$query_object->operator = $operator;
				$query_object->q_parsed = $q_clean;
				break;
			# CONTAIN
			default:
				$operator = '@>';
				$q_clean  = '\'['.$q.']\'';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				break;
		}//end switch (true) {


		return $query_object;
	}//end resolve_query_object_sql



}//end class component_semantic_node
