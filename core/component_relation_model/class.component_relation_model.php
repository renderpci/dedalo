<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_MODEL
*
*/
class component_relation_model extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_MODEL_TIPO;
	protected $default_relation_type_rel	= null;
	public $ar_target_section_tipo;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Select source section/s
	* Overrides component common method
	* @return array $ar_target_section_tipo
	*/
	public function get_ar_target_section_tipo() : array {

		// cache
			if(isset($this->ar_target_section_tipo)) {
				return $this->ar_target_section_tipo;
			}

		$target_mode = $this->properties->target_mode ?? null;
		switch ($target_mode) {

			case 'free':
				// Defined in ontology
				$ar_target_section_tipo = (array)$this->properties->target_values;
				break;

			default:
				// try to calculate from hierarchy section looking in target model value of hierarchy
					$section_tipo				= $this->section_tipo;
					$hierarchy_component_tipo	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
					$section_id					= hierarchy::get_hierarchy_section($section_tipo, $hierarchy_component_tipo);

					if (!empty($section_id)) {
						// get target section model component value
							$model		= ontology_node::get_model_by_tipo(DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO,true);
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
						$prefix = get_tld_from_tipo($section_tipo);
						$target_section_tipo = $prefix.'2';
					}

				// set into array
					$ar_target_section_tipo = [$target_section_tipo];
				break;
		}//end switch ($target_mode)


		// Fix value
		$this->ar_target_section_tipo = $ar_target_section_tipo;


		return $ar_target_section_tipo;
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
