<?php declare(strict_types=1);
/**
* CLASS COMPONENT_RADIO_BUTTON
* Single-select relation component that enforces exactly one chosen option at a time.
*
* Provides radio-button UI semantics for closed-vocabulary relation fields: the user
* may select at most one value from the option list; selecting a new value replaces
* the previous one rather than accumulating selections.
*
* Responsibilities:
* - Stores the selected option as a single locator object (type dd151/DEDALO_RELATION_TYPE_LINK)
*   in the section's 'relation' matrix column.
* - Builds the full option list via get_list_of_values() (inherited from
*   component_relation_common), which executes the SQO defined in the component's
*   'source.request_config' ontology property against the target list-of-values section.
* - Overrides get_sortable() to return true, exposing the component as sortable in
*   list and export views (the closed vocabulary makes value-based sorting well-defined).
* - Inherits all locator validation, save, search, export, and diffusion logic from
*   component_relation_common.
*
* Contrast with component_check_box:
*   component_check_box is multi-select — it accumulates an array of locators.
*   component_radio_button is single-select — the data array always has at most one
*   locator and any new selection replaces the existing one at the UI layer.
*
* Data shape (stored in the 'relation' matrix column):
*   [ { type: 'dd151', section_tipo: 'rsc723', section_id: '42',
*       from_component_tipo: 'oh28' } ]
*   (An array of one locator; an empty array means no selection.)
*
* Well-known usages inside the Dédalo ontology:
*   - ontology8  (is_translatable flag) — selects yes/no/lang-variant radio.
*   - Hierarchy 'active' / 'typology' fields in various TLDs.
*
* Extended by: nothing — this is a concrete leaf class.
* Extends: component_relation_common (which extends component_common).
*
* @package Dédalo
* @subpackage Core
*/
class component_radio_button extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type written into each locator's 'type' field when no
		 * explicit 'config_relation.relation_type' is present in the ontology properties.
		 * DEDALO_RELATION_TYPE_LINK = 'dd151' (generic link relation, defined in core/base/dd_tipos.php).
		 * The base class (component_relation_common) defaults to null; this subclass
		 * overrides it so every radio-button locator automatically carries the link type
		 * without requiring per-instance ontology configuration.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Keys used by locator::in_array_locator() to detect duplicate locators before
		 * a new one is added to the data array. A locator is considered a duplicate when
		 * every key in this list has an identical value in an existing locator.
		 *
		 * Fields:
		 * - section_tipo        : Type identifier of the target section (e.g. 'rsc723').
		 * - section_id          : Record ID in the target section.
		 * - type                : Relation type of the locator (e.g. 'dd151').
		 * - from_component_tipo : Tipo of this component, scoping the locator to it.
		 *
		 * The four-field combination ensures that the same target record cannot be added
		 * twice through the same component in the same language context. This mirrors the
		 * deduplication strategy used by component_check_box (its sibling multi-select
		 * class), so shared parent logic in validate_data_element() works identically.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_SORTABLE
	* Declares that this component's column is sortable in list and export views.
	*
	* component_relation_common::get_sortable() returns false for all relation components
	* by default — sorting a free-form relation list makes no semantic sense for most of
	* them. component_radio_button overrides to true because its option list is a closed
	* vocabulary; each record holds at most one selected value, so sorting by the resolved
	* label string is well-defined and expected by end users (e.g. "sort records by
	* active/inactive status").
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



}//end class component_radio_button
