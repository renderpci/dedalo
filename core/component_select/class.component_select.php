<?php declare(strict_types=1);
/**
* CLASS COMPONENT SELECT
*
*/
class component_select extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @param string|null $lang = DEDALO_DATA_LANG
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG) : ?string {

		$dato = $this->get_dato();

		// case user id root value
			if (isset($dato[0])
				&& $dato[0]->section_tipo===DEDALO_SECTION_USERS_TIPO
				&& $dato[0]->section_id==='-1') {

				return 'root';
			}

		// Test dato format (b4 changed to object)
			foreach ($dato as $current_value) {
				if (!is_object($current_value)) {
					if(SHOW_DEBUG) {
						dump($dato," actual invalid dato: ");
					}
					debug_log(__METHOD__
						. " Wrong dato format. OLD format dato in $this->label Expected object locator, but received:" . PHP_EOL
						. ' type: ' . gettype($current_value) . PHP_EOL
						. ' tipo: ' . $this->tipo . PHP_EOL
						. ' section_tipo: ' . $this->section_tipo . PHP_EOL
						. ' section_id: ' . $this->section_id . PHP_EOL
						. ' current_value: ' . to_string($current_value)
						, logger::ERROR
					);
					return null;
				}
			}

		$ar_list_of_values = $this->get_ar_list_of_values($lang, true); // Important: We are looking for the value in the current language.
		$ar_values = [];
		if (!empty($ar_list_of_values->result)) {
			foreach ($ar_list_of_values->result as $item) {

				$locator = $item->value;
				if ( true===locator::in_array_locator($locator, $dato, ['section_id','section_tipo']) ) {
					$ar_values[] = $item->label;
				}
			}
		}

		// Set value
		$valor = implode(', ', $ar_values);

		return $valor;
	}//end get_valor



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MySQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_lang = $lang ?? DEDALO_DATA_LANG;
		$diffusion_value = $this->get_valor(
			$diffusion_lang
		);

		$diffusion_value = !empty($diffusion_value)
			? strip_tags($diffusion_value)
			: null;

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_dato() : ?string {

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



	/**
	* GET_SORTABLE
	* @return bool true
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_select
