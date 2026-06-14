<?php declare(strict_types=1);
/**
* CLASS COMPONENT_CHECK_BOX
* Multi-select checkbox component for closed-vocabulary relation fields.
*
* Stores the selected options as an array of locator objects in the section's
* global 'relations' bag, not in a dedicated column. Each locator has the shape:
*   {type, section_tipo, section_id, from_component_tipo}
* where 'type' is the relation type (default dd151 / DEDALO_RELATION_TYPE_LINK)
* and 'from_component_tipo' scopes the locator to this component.
*
* Responsibilities:
* - Builds the full option list via get_datalist() (wraps get_list_of_values()).
* - Overrides get_sortable() to return true (base class returns false).
* - Enriches the datalist with tool metadata when the component is the
*   security-tools profiles field (dd1067 / DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO).
* - Inherits all locator validation, save, search, export, and diffusion logic
*   from component_relation_common.
*
* Extended by: nothing — this is a concrete leaf class.
* Extends: component_relation_common (which extends component_common).
*
* Deduplication of locators on save uses $test_equal_properties to identify
* identical locators: two locators are considered equal when section_tipo,
* section_id, type, and from_component_tipo all match.
*
* @package Dédalo
* @subpackage Core
*/
class component_check_box extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type written into each locator's 'type' field when no
		 * explicit 'config_relation.relation_type' is set in the ontology properties.
		 * DEDALO_RELATION_TYPE_LINK = 'dd151' (generic link relation).
		 * The base class (component_relation_common) defaults to null; this subclass
		 * overrides it so every checkbox locator carries the link type automatically.
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
		 * The combination guarantees that the same target record cannot be checked twice
		 * through the same component, even if it appears in multiple relation types.
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_DATALIST
	* Returns the full option list for this checkbox group as an array of objects.
	*
	* Each item in the returned array has at minimum:
	*   {value: {section_tipo, section_id, ...}, label: string, section_id: string}
	*
	* The option list is resolved by get_list_of_values(), which executes the SQO
	* defined in the component's 'source.request_config' ontology property against the
	* target list-of-values section. The render layer uses this list to draw one
	* checkbox per item and to determine which options are currently selected.
	*
	* Special case — security-tools profiles (dd1067):
	*   When this component's tipo is DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO,
	*   each datalist item is enriched with two extra properties by tool_common::hydrate_tools_info():
	*   - tool_name    : string — internal tool name (e.g. 'tool_lang').
	*   - always_active: bool   — whether the tool cannot be deactivated for a profile.
	*   The 'tools' render view uses these to show the tool icon and to disable the
	*   checkbox for always-active tools.
	*
	* @param ?string $lang = DEDALO_DATA_LANG - Language for label resolution; falls back to DEDALO_DATA_LANG when null.
	* @return array - Array of option objects; empty array when no options are found.
	*/
	public function get_datalist( ?string $lang=DEDALO_DATA_LANG ) : array {

		// Resolve the option list via the canonical resolver.
		// Pass false for $include_negative so deleted/disabled targets are excluded.
		$list_of_values_response = $this->get_list_of_values($lang ?? DEDALO_DATA_LANG, false);

		$datalist = $list_of_values_response->result ?? [];

		// Security-tools profiles enrichment
		// When this component is the security-tools profiles field (dd1067), the 'tools'
		// render view needs extra per-tool metadata (tool_name, always_active) that is not
		// stored in the option-list section but in the registered tools registry.
		// hydrate_tools_info() does an O(N) lookup via the tool cache and stamps the
		// extra properties directly onto each datalist item.
		// (!) The constant name in the inline comment below is intentionally different
		//     from the one in the code: the comment refers to the old name 'dd1353' while
		//     DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO currently resolves to 'dd1067'.
		//     The guard is correct — it compares $this->tipo to the constant value.
		if($this->tipo===DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO) {
			$datalist = tool_common::hydrate_tools_info($datalist, $lang);
		}


		return $datalist;
	}//end get_datalist



	/**
	* GET_SORTABLE
	* Declares that this component's column is sortable in list and export views.
	*
	* component_relation_common::get_sortable() returns false for all relation components
	* by default (sorting a free-form relation list makes no semantic sense for most of
	* them). component_check_box overrides to true because its option list is a closed
	* vocabulary, and sorting by the resolved label string is well-defined and expected
	* by end users (e.g. "sort records by acquisition type").
	*
	* The sort itself is performed by sort_data_by_column() (inherited from
	* component_relation_common) when an explicit 'sort_by_column' changed_data action
	* is received; this method only declares capability.
	* @return bool - Always true.
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_check_box
