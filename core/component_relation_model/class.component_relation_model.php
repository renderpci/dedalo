<?php
/**
* CLASS COMPONENT_RELATION_MODEL
*
*
*/
class component_relation_model extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_MODEL_TIPO;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string|null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG, $separator=', ') {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		# debug. Test dato format (b4 changed to object)
			if(SHOW_DEBUG) {
				foreach ($dato as $key => $current_value) {
					if (!is_object($current_value)) {
						if(SHOW_DEBUG) {
							dump($dato," dato");
						}
						trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($current_value) .' : '. print_r($current_value,true) );
						return null;
					}
				}
			}

		$ar_values = [];
		foreach ($dato as $locator) {
			// current_label array|null
			$current_label = component_relation_common::get_locator_value(
				$locator, // object locator
				$lang ?? DEDALO_DATA_LANG, // string lang
				false // bool show_parents
			);
			$ar_values[] = is_array($current_label)
				? implode($separator, $current_label)
				: $current_label;
		}

		$valor = implode($separator, $ar_values);


		return $valor;
	}//end get_valor



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
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
	* GET_AR_TARGET_SECTION_TIPO
	* Select source section/s
	* Overrides component common method
	*/
	public function get_ar_target_section_tipo() : ?array {

		// empty case
			if (!$this->tipo) {
				return null;
			}

		// cache
			if(isset($this->ar_target_section_tipo)) {
				return $this->ar_target_section_tipo;
			}

		$target_mode = $this->properties->target_mode ?? null;
		switch ($target_mode) {

			case 'free':
				// Defined in structure
				$ar_target_section_tipo = (array)$this->properties->target_values;
				break;

			default:
				// try to calculate from hierarchy section looking in target model value of hierarchy
					$section_tipo				= $this->section_tipo;
					$hierarchy_component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
					$section_id					= hierarchy::get_hierarchy_section($section_tipo, $hierarchy_component_tipo);

					if (!empty($section_id)) {
						// get target section model component value
							$model		= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO,true);
							$component	= component_common::get_instance(
								$model,
								DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO,
								$section_id,
								'list',
								DEDALO_DATA_NOLAN,
								DEDALO_HIERARCHY_SECTION_TIPO
							);

							$target_section_tipo = $component->get_valor();
					}

				// final fallback (calculated from current prefix)
					if (empty($target_section_tipo)) {
						$prefix = RecordObj_dd::get_prefix_from_tipo($section_tipo);
						$target_section_tipo = $prefix.'2';
					}

				// set into array
					$ar_target_section_tipo = [$target_section_tipo];
				break;
		}


		# Fix value
		$this->ar_target_section_tipo = $ar_target_section_tipo;


		return (array)$ar_target_section_tipo;
	}//end get_ar_target_section_tipo



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_relation_model