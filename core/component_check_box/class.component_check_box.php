<?php
/*
* CLASS COMPONENT CHECK BOX
*
*
*/
class component_check_box extends component_relation_common {

	public $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* GET VALOR
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECDIFIC COMPONENT
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $format='string' ) {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		# Test dato format (b4 changed to object)
		foreach ($dato as $key => $value) {
			if (!is_object($value)) {
				if(SHOW_DEBUG) {
					dump($dato," dato");
				}
				trigger_error(__METHOD__." Wrong dato format. OLD format dato in label:$this->label tipo:$this->tipo section_id:$this->section_id.Expected object locator, but received: ".gettype($value) .' : '. print_r($value,true) );
				return null;
			}
		}

		$ar_list_of_values = $this->get_ar_list_of_values2($lang); # Importante: Buscamos el valor en el idioma actual
		$ar_values = [];
		foreach ($ar_list_of_values->result as $key => $item) {

			$locator = $item->value;

			if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
				$ar_values[] = $item->label;
			}
		}

		# Set format
		$valor = ($format==='array')
			? $ar_values
			: implode(', ', $ar_values);


		return $valor;
	}//end get_valor



	public function get_dato_as_string() {

		return json_handler::encode($this->get_dato());
	}//end get_dato_as_string



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



	public function get_dataframe_value($type){

		$dataframe_value = RecordObj_dd::get_termino_by_tipo($type,DEDALO_APPLICATION_LANG, true);

		return $dataframe_value;

	}
}
