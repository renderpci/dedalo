<?php declare(strict_types=1);
/**
* CLASS SECTION_GROUP
* UI layout grouper that wraps a set of components inside a named panel or box
* within a section's edit form.
*
* section_group is a structural/presentational element, not a data-bearing one.
* Its sole responsibilities are:
* - Carrying enough identity (tipo, section_tipo, mode, lang) for the context
*   pipeline in common::get_structure_context() to build the client's DDO context
*   object, which drives layout and labelling on the browser side.
* - Providing its ontology-defined label and structural properties (e.g. add_label,
*   tool_config) through the inherited load_structure_data() + get_json() flow.
* - Suppressing tool calculation: groupers never own tools, so get_tools() is
*   overridden to return [] rather than running the expensive common::get_tools()
*   lookup (see section_group_json.php for the JSON output pipeline).
*
* Legacy alias: 'section_group_div' is mapped to 'section_group' across the
* codebase (common::$ar_temp_map_models, ontology_node, RecordObj_dd). The
* section_group_json.php controller uses the legacy_model value to decide whether
* to set add_label=false (section_group_div panels suppress their header label).
*
* In list mode the DDO pipeline (trait.request_config_ddo.php, step 4) drops
* section_group entries from the show map entirely — groupers are not rendered
* in list views.
*
* Extended by: nothing (leaf class in the grouper hierarchy).
* Sister class: section_tab (identical structure, different model/rendering).
* Extends: common (identity, context, JSON pipeline).
*
* @package Dédalo
* @subpackage Core
*/
class section_group extends common {



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
	* ontology cache. After construction the instance is ready for get_json().
	*
	* @param string $tipo        - Ontology tipo identifier for this group node
	* @param string $section_tipo - Tipo of the owning section
	* @param string $mode        - Render mode ('edit', 'list', 'tm', …)
	* @return void
	*/
	function __construct(string $tipo, string $section_tipo, string $mode) {

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
	* section_group nodes are pure layout containers and never own tools.
	* common::get_tools() performs an expensive per-user ontology walk and cache
	* lookup; overriding it here with an immediate empty-array return avoids that
	* cost every time a group's context is built inside get_structure_context().
	*
	* The override is intentional and must not be removed — without it the parent
	* implementation would query tool registrations for a node that can never have
	* any, wasting CPU on every request that renders a section.
	*
	* @return array - Always empty; groupers have no associated tools
	*/
	public function get_tools() : array {

		return [];
	}//end get_tools



}//end section_group class
