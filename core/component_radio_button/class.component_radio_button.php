<?php
/*
* CLASS COMPONENT RADIO BUTTON
*
*
*/
class component_radio_button extends component_relation_common {


	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* GET_VALOR
	* Get resolved value in requested lang
	* Note that no value is fixed here because 'valor' depends of requested lang
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG ) {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		// Test dato format (b4 changed to object)
			foreach ($dato as $key => $value) {
				if (!is_object($value)) {
					if(SHOW_DEBUG===true) {
						dump($dato," dato");
						trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($value) .' : '. print_r($value,true) );
					}
					return null;
				}
			}

		switch ($this->modo) {

			case 'diffusion':
				// dd64 case
				$object_si = new stdClass();
					$object_si->section_id   = (string)NUMERICAL_MATRIX_VALUE_YES;
					$object_si->section_tipo = (string)DEDALO_SECTION_SI_NO_TIPO; // 'dd64'

				$valor = ($dato[0]===$object_si) ? 'si' : 'no';
				break;

			default:
				// list_of_values. Always run list of values. (!) Get values only in requested lang
				$ar_list_of_values = $this->get_ar_list_of_values2($lang);
				$valor = '';
				foreach ($ar_list_of_values->result as $key => $item) {

					$locator = $item->value;
					if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
						$valor = $item->label;
						break;
					}
				}
				break;
		}//end switch


		return $valor;
	}//end get_valor



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*//*
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
												 	 $parent,
												 	 'list',
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);


		# Use already query calculated values for speed
		$ar_records   = (array)json_handler::decode($value);
		$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions

		return  $component->get_valor($lang);
	}//end render_list_value */



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {

		$diffusion_value = $this->get_valor($lang);
		$diffusion_value = strip_tags($diffusion_value);

		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return string $diffusion_value
	*/
	public function get_diffusion_dato() {

		$dato = $this->get_dato();
		if (is_array($dato)) {
			$ar_id =array();
			foreach ($dato as $current_locator) {
				$ar_id[] = $current_locator->section_id;
			}
			$final_dato = $ar_id;
		}
		$diffusion_value = json_encode($final_dato);

		return (string)$diffusion_value;
	}//end get_diffusion_dato



}//end class
?>
