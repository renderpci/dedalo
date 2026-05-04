<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_MODEL
*
* Manages model-type relations between sections.
* Extends component_relation_common to handle the specific relation_type
* defined by DEDALO_RELATION_TYPE_MODEL_TIPO.
*
* Key features:
* - Resolves target sections from ontology hierarchy or free mode
* - Uses component_select as its client-side representation
* - Supports sortable locator lists
*
* @package Dedalo
* @subpackage Core
*/
class component_relation_model extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_MODEL_TIPO;
	protected $default_relation_type_rel	= null;
	public $ar_target_section_tipo			= null;

	// test_equal_properties is used to verify duplicates when add locators
	public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Resolves the target section tipo(s) for this relation component.
	* Supports two modes via properties->target_mode:
	*   - 'free': uses target_values defined directly in ontology properties
	*   - default: calculates from hierarchy section's target model component,
	*     with fallback to prefix-based calculation (prefix.'2')
	*
	* Overrides component_common method.
	*
	* @return array Array of target section tipo strings
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
	* Returns whether the component's locator list is sortable.
	* Override to return false when sorting is not applicable.
	*
	* @return bool Always true for component_relation_model
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_relation_model
