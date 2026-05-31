<?php declare(strict_types=1);
/**
* CLASS COMPONENT_CHECK_BOX
* Manages checkbox selection components in Dédalo.
*
* Provides multi-select checkbox functionality for relating records.
* Used for creating many-to-many relationships between sections,
* such as assigning tools to user profiles.
*
* Key features:
* - Renders as checkboxes based on a list of values (ar_list_of_values)
* - Stores selected values as locator objects in the database
* - Supports sorting of selected items
* - Special handling for security tools (tipo 'dd1353') with tool metadata
*
* Extends component_relation_common for relationship management capabilities.
*
* @package Dédalo
* @subpackage Core
*/
class component_check_box extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for checkbox linking relationships.
		 * Inherited from DEDALO_RELATION_TYPE_LINK constant.
		 * Defines the type of relationship created when a checkbox is selected.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Properties used to detect duplicate locators when adding new relationships.
		 * Locators with identical values for all these properties are considered duplicates.
		 * - section_tipo : Target section type identifier
		 * - section_id : Target section record ID
		 * - type : Relation type (typically link type)
		 * - from_component_tipo : Source component tipo creating the relation
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_DATALIST
	* Get datalist for check_box component.
	* Add tool name and always_active value to the datalist when tipo is 'dd1353'
	* @param ?string $lang = DEDALO_DATA_LANG
	* @return array $datalist
	* 	Array of objects
	*/
	public function get_datalist( ?string $lang=DEDALO_DATA_LANG ) : array {

		// Resolve the option list via the canonical resolver
		$list_of_values_response = $this->get_list_of_values($lang ?? DEDALO_DATA_LANG, false);

		$datalist = $list_of_values_response->result ?? [];

		// Add tool information when the component is component_security_tools (dd1353).
		// The component_security_tools is built as component_check_box and rendered with view 'view_tools'.
		// This information is required to get specific tool information.
		if($this->tipo===DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO) {
			$datalist = tool_common::hydrate_tools_info($datalist, $lang);
		}


		return $datalist;
	}//end get_datalist



	/**
	* GET_SORTABLE
	* @return bool
	* Default for component_relation_common is false. Override to true
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_check_box
