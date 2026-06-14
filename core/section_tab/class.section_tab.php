<?php declare(strict_types=1);
/**
* CLASS SECTION_TAB
* UI layout grouper that organises components into a tabbed panel set within a
* section's edit form.
*
* section_tab operates in two distinct visual modes determined by its ontology
* legacy model (resolved at JSON-output time in section_tab_json.php):
*
* - 'section_tab' (default): acts as the outer tab-bar container. The JSON
*   controller resolves its direct ontology children, filters them against the
*   section's valid tab list, and serialises them as context.children. The
*   client (render_section_tab.js) renders a clickable label strip, publishes
*   'tab_active_<tipo>' events, and persists the selected tab in local DB
*   (IndexedDB key: status_id = "section_tab_<section_tipo>_<tipo>").
*
* - 'tab' (legacy alias): a single tab panel that is a child of a section_tab
*   container. The JSON controller sets context.view = 'tab'; the client simply
*   subscribes to 'tab_active_<tipo>' and toggles an 'active' CSS class.
*
* As a structural/presentational element it carries no section data of its own.
* Its responsibilities are:
* - Carrying identity (tipo, section_tipo, mode, lang) so that the inherited
*   common::get_structure_context() pipeline can build the client DDO context.
* - Delegating all structure resolution to common::load_structure_data(), which
*   populates $this->model, $this->label, $this->properties, and
*   $this->ontology_node from the ontology cache.
* - Suppressing tool calculation: like section_group, it overrides get_tools()
*   to return [] immediately rather than running the expensive common lookup.
*
* section_tab is listed in common::$groupers alongside section_group,
* section_group_div, and tab. The section traversal helper
* section::get_ar_children_tipo_by_model_name_in_section() recurses into
* section_tab children when searching for nested components, exactly as it does
* for section_group. section_elements_context() excludes section_tab from the
* flat element list by default (it is a container, not a data component).
*
* Sister class: section_group (identical structure, different visual rendering).
* Extends: common (identity, context, JSON pipeline).
* Not extended by any other class.
*
* @package Dédalo
* @subpackage Core
*/
class section_tab extends common {


	/**
	* VARS
	* No additional properties beyond those inherited from common (tipo,
	* section_tipo, mode, lang, ontology_node, model, label, properties, …).
	* All state is set in __construct and populated by load_structure_data().
	*/



	/**
	* __CONSTRUCT
	* Initialises the grouper's identity and loads its ontology structure data.
	*
	* Assigns the four mandatory identity properties and then calls
	* load_structure_data() (inherited from common) to populate $this->model,
	* $this->label, $this->properties, and $this->ontology_node from the
	* ontology cache. After construction the instance is ready for get_json(),
	* which delegates to section_tab_json.php for context serialisation.
	*
	* @param string $tipo         - Ontology tipo identifier for this tab node
	* @param string $section_tipo - Tipo of the owning section
	* @param string $mode         - Render mode ('edit', 'list', 'tm', …)
	* @return void
	*/
	function __construct($tipo, $section_tipo, $mode) {

		$this->tipo			= $tipo;
		$this->section_tipo	= $section_tipo;
		$this->mode			= $mode;
		$this->lang			= DEDALO_DATA_LANG;

		$this->load_structure_data();
	}//end __construct



	/**
	* GET_TOOLS
	* Short-circuits the common tool-resolution pipeline for grouper elements.
	*
	* section_tab nodes are pure layout containers and never own tools.
	* common::get_tools() performs an expensive per-user ontology walk and cache
	* lookup; overriding it here with an immediate empty-array return avoids that
	* cost every time a tab's context is built inside get_structure_context().
	*
	* The override is intentional and must not be removed — without it the parent
	* implementation would query tool registrations for a node that can never have
	* any, wasting CPU on every request that renders a section containing tabs.
	*
	* @return array - Always empty; tab groupers have no associated tools
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



}//end section_tab class
