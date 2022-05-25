<?php
/*
* CLASS COMPONENT SELECT
*
*
*/
class component_select extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string|null $valor
	*/
	public function get_valor(string $lang=DEDALO_DATA_LANG) : ?string {

		$dato = $this->get_dato();

		// case user id root
			if (isset($dato[0])
				&& $dato[0]->section_tipo===DEDALO_SECTION_USERS_TIPO
				&& $dato[0]->section_id==='-1') {
				return 'root';
			}

		# Test dato format (b4 changed to object)
		foreach ($dato as $key => $current_value) {
			if (!is_object($current_value)) {
				if(SHOW_DEBUG) {
					dump($dato," actual invalid dato: ");
				}
				trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->section_tipo - $this->tipo - $this->parent .Expected object locator, but received: ".gettype($current_value) .' : '. print_r($current_value,true) );
				return null;
			}
		}

		$ar_list_of_values = $this->get_ar_list_of_values($lang, true); # Importante: Buscamos el valor en el idioma actual
		$ar_values = [];
		if (!empty($ar_list_of_values->result)) {
			foreach ($ar_list_of_values->result as $key => $item) {

				$locator = $item->value;
				if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
					$ar_values[] = $item->label;
				}
			}
		}

		# Set value
		$valor = implode(', ', $ar_values);

		return $valor;
	}//end get_valor



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MySQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_value = $this->get_valor($lang);

		$diffusion_value = !empty($diffusion_value)
			? strip_tags($diffusion_value)
			: null;

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return array|null $diffusion_value
	*/
	public function get_diffusion_dato() : ?array {

		$dato = $this->get_dato();

		if (is_array($dato)) {

			$final_dato = [];
			foreach ($dato as $current_locator) {
				$final_dato[] = $current_locator->section_id;
			}
			$diffusion_value = json_encode($final_dato);

		}else{

			$diffusion_value = null;
		}

		return $diffusion_value;
	}//end get_diffusion_dato



}//end class
