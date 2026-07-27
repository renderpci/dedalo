<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SELECT
* Single-select dropdown relation component that links the host record to exactly one
* target record via a locator stored in the 'relation' matrix column.
*
* Responsibilities:
* - Renders as a native HTML <select> dropdown (or equivalent client widget) listing
*   every record in the configured target section as an option.
* - Stores the chosen option as a single locator object
*   (type dd151 / DEDALO_RELATION_TYPE_LINK) in the 'relation' matrix column.
* - Builds the full option list (datalist) via get_list_of_values() (inherited from
*   component_relation_common), which executes the SQO defined in the component's
*   'source.request_config' ontology property against the target section.
* - In 'edit' mode the JSON controller returns both the current value (get_data_lang)
*   and the full option list (datalist) so the client can render a populated dropdown.
* - Overrides get_sortable() to return true, exposing the component as sortable in
*   list and export views (the closed vocabulary makes value-based sorting well-defined).
* - When a dataframe is present in the request_config ddo_map, the JSON controller
*   also resolves and injects subdatum context/data for the selected locator.
* - Inherits all locator validation, duplicate prevention, save, search, export,
*   and diffusion logic from component_relation_common.
*
* Contrast with related components:
*   component_radio_button : Identical single-select semantics but rendered as radio
*     buttons; shares the same default_relation_type and test_equal_properties.
*   component_check_box    : Multi-select — accumulates an array of locators.
*   component_portal       : Multi-record navigation list, not a closed dropdown.
*
* Data shape (stored in the 'relation' matrix column):
*   [ { "type": "dd151", "section_tipo": "dd64", "section_id": "1",
*       "from_component_tipo": "test91" } ]
*   (An array of one locator; an empty array means no selection.)
*
* JSON output (component_select_json.php):
*   context : structure context including target_sections with permissions.
*   data    : [ { value: <locator[]>, datalist: <option[]> } ] in 'edit' mode;
*             [ { value: <locator> } ] in 'list'/'tm' mode.
*
* Extended by: nothing — this is a concrete leaf class.
* Extends: component_relation_common (which extends component_common).
*
* @package Dédalo
* @subpackage Core
*/
class component_select extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type written into each locator's 'type' field when no
		 * explicit 'config_relation.relation_type' is present in the ontology properties.
		 * DEDALO_RELATION_TYPE_LINK = 'dd151' (generic link relation, defined in
		 * core/base/dd_tipos.php).
		 * The base class (component_relation_common) defaults to null; this subclass
		 * overrides it so every select locator automatically carries the link type
		 * without requiring per-instance ontology configuration.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Keys used by locator::in_array_locator() to detect duplicate locators before
		 * a new one is added to the data array. A locator is considered a duplicate when
		 * every key in this list has an identical value in an existing entry.
		 *
		 * Fields:
		 * - section_tipo        : Type identifier of the target section (e.g. 'dd64').
		 * - section_id          : Record ID in the target section.
		 * - type                : Relation type of the locator (e.g. 'dd151').
		 * - from_component_tipo : Tipo of this component, scoping the locator to it.
		 *
		 * The four-field combination ensures that the same target record cannot be added
		 * twice through the same component, preventing corrupted multi-locator state in
		 * data that should contain at most one locator.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_SORTABLE
	* Declares that this component's column is sortable in list and export views.
	*
	* component_relation_common::get_sortable() returns false for all relation components
	* by default — sorting a free-form relation list makes no semantic sense for most of
	* them. component_select overrides to true because its option list is a closed
	* vocabulary fetched from a target section; each host record holds at most one
	* selected value, so sorting by the resolved label string is well-defined and
	* expected by end users (e.g. "sort records by assigned category").
	*
	* The actual sort is performed by sort_data_by_column() (inherited from
	* component_relation_common) when a 'sort_by_column' changed_data action is received;
	* this method only advertises the capability to callers such as the list-view renderer
	* and tool_export.
	* @return bool - Always true.
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_select
