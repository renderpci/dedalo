<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RADIO_BUTTON
* Manages radio button selection components in Dédalo.
*
* Provides single-select radio button functionality for choosing one option
* from a list of values. Used for creating one-to-many relationships between
* sections, such as selecting a single category or status.
*
* Key features:
* - Single selection only (one value at a time)
* - Renders as radio buttons based on ar_list_of_values
* - Stores selected value as a locator object in the database
* - Supports sorting by the selected value
* - Supports fallback to default value label
*
* Unlike component_check_box (multi-select), this component enforces
* single-value selection and replaces any previous selection.
*
* Data is stored in the 'relation' column of matrix tables.
*
* Extends component_relation_common for relationship management capabilities.
*
* @package Dédalo
* @subpackage Core
*/
class component_radio_button extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for radio button selection relationships.
		 * Inherited from DEDALO_RELATION_TYPE_LINK constant.
		 * Defines the type of relationship created when a radio button option is selected.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Properties used to detect duplicate locators when adding new selections.
		 * Locators with identical values for all these properties are considered duplicates.
		 * - section_tipo : Target section type identifier
		 * - section_id : Target section record ID
		 * - type : Relation type (typically link type)
		 * - from_component_tipo : Source component tipo creating the relation
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_radio_button
