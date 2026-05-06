<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SELECT
* Manages single-select dropdown components for creating relationships in Dédalo.
*
* Provides a dropdown interface for selecting a single record from a target section,
* creating a one-to-one or many-to-one relationship. Unlike component_portal which
* shows a list with multiple selections, component_select uses a simple dropdown.
*
* Key features:
* - Single selection only (dropdown behavior)
* - Creates locator-based relationships to target sections
* - Supports sorting by selected value
* - Dropdown options populated from ar_list_of_values
* - Duplicate prevention when setting values
*
* Common use cases:
* - Selecting a single category, status, or type
* - Choosing a parent record in hierarchical relationships
* - Assigning a single owner or responsible entity
*
* Extends component_relation_common for relationship management capabilities.
*
* @package Dédalo
* @subpackage Core
*/
class component_select extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for select components (DEDALO_RELATION_TYPE_LINK).
		 * Defines the ontology tipo used for link-type relations in this component.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Properties used to verify duplicate locators when adding relations.
		 * Array of property names that must match to consider two locators equal.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_SORTABLE
	* @return bool true
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_select
