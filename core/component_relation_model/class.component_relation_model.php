<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_MODEL
* Manages model-type hierarchical relations between sections in Dédalo.
*
* Handles relationships where records are linked through the ontology's hierarchical
* model structure, allowing records to reference other records based on their
* position in the hierarchy tree.
*
* Key features:
* - Resolves target sections from ontology hierarchy structure
* - Supports 'free' mode for direct target_values configuration
* - Uses component_select for client-side user interface
* - Supports sortable locator lists for ordered relationships
* - Prefix-based fallback calculation (prefix.'2') for hierarchy resolution
*
* Target resolution modes:
* - Hierarchy mode: Calculates from hierarchy section's target model component
* - Free mode: Uses target_values defined directly in ontology properties
*
* Extends component_relation_common with DEDALO_RELATION_TYPE_MODEL_TIPO relation type.
*
* @package Dédalo
* @subpackage Core
*/
class component_relation_model extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for model relations (DEDALO_RELATION_TYPE_MODEL_TIPO).
		 * Defines the ontology tipo used for model-type section relations.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_MODEL_TIPO;

		/**
		 * Cached array of target section tipos for this relation.
		 * Stores resolved target sections from hierarchy or free mode lookup.
		 * @var array $ar_target_section_tipo
		 */
		protected array $ar_target_section_tipo = [];

		/**
		 * Properties used to verify duplicate locators when adding relations.
		 * Array of property names that must match to consider two locators equal.
		 * @var array $test_equal_properties
		 */
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
			if(!empty($this->ar_target_section_tipo)) {
				return $this->ar_target_section_tipo;
			}

		// section_tipo check
			$section_tipo = $this->get_section_tipo();
			if (empty($section_tipo)) {
				$msg = "Error. section_tipo is not defined! "
					. ' tipo: ' . $this->tipo . PHP_EOL
					. ' section_tipo: ' . $section_tipo . PHP_EOL
					. ' section_id: '   . $this->section_id;
				debug_log(__METHOD__ . ' ' . $msg, logger::ERROR);
				return [];
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
