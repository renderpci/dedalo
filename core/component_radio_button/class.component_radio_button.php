<?php declare(strict_types=1);
/**
* CLASS COMPONENT RADIO BUTTON
*
*/
class component_radio_button extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');




	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	*
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_value = $this->get_valor(
			$lang ?? DEDALO_DATA_LANG
		);

		$diffusion_value = !empty($diffusion_value)
			? strip_tags($diffusion_value)
			: ''; // do not use null here (compatibility v5 sites issues)


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_dato() : ?string {

		$dato = $this->get_dato();
		if (is_array($dato)) {
			$ar_id = array();
			foreach ($dato as $current_locator) {
				$ar_id[] = $current_locator->section_id;
			}
			$final_dato = $ar_id;
		}

		$diffusion_value = !empty($final_dato)
			? json_encode($final_dato)
			: null;

		return $diffusion_value;
	}//end get_diffusion_dato



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_radio_button
