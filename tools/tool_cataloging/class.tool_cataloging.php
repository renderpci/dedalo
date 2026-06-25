<?php declare(strict_types=1);
/**
* CLASS TOOL_CATALOGING
* Section toolbar tool for hierarchical cataloging of cultural-asset records.
*
* Opens as a split-pane window (`open_as: window`, view `tool_cataloging_mosaic`):
* - LEFT PANE — the source section rendered as a draggable mosaic grid.
*   Each card represents one record from the section defined by the
*   `section_to_cataloging` ddo role in `tool_config.ddo_map`.
* - RIGHT PANE — a thesaurus tree (area_thesaurus) defined by the
*   `area_thesaurus` ddo role. Users drag mosaic cards onto thesaurus nodes to
*   classify records within the hierarchy.
*
* DROP WORKFLOW
* When a card is dropped, the thesaurus creates a new child term (new section
* record). The tool's JS layer then fires the `ts_add_child_tool_cataloging`
* event with:
*   - `new_ts_section` — the freshly created thesaurus record
*   - `locator`        — the dragged source record's locator
*   - `callback`       — function the thesaurus node calls once its tree is updated
*
* The PHP class plays no role in this flow; all processing happens in the browser.
* After the drop, a `component_portal` instance at
* `tool_config.set_new_thesaurus_value.tipo` inside the new thesaurus record is
* updated with the dragged locator so the hierarchy node points back to the source
* record. The drag indicator in the mosaic card (`render_column_drag`) then gains
* the CSS class `used` to show the record has been placed.
*
* CONFIGURATION (ddo_map roles in the ontology's tool_config):
*   `section_to_cataloging` — the source section whose records populate the mosaic.
*   `area_thesaurus`        — the thesaurus section that receives drag-dropped items.
*   `set_new_thesaurus_value` — {tipo, section_tipo}: identifies the portal component
*       inside each new thesaurus record where the source locator is stored.
*
* PERSISTENCE
* No bespoke tables. Classification state lives in the standard relation data of
* the affected thesaurus and source sections (The Dédalo way).
*
* PHP ROLE
* This class is a thin registration stub: it extends tool_common so the framework
* can discover and serve the tool via dd_tools_api, but every operation (mosaic
* render, drag-and-drop, thesaurus interaction, portal update) is handled in JS:
*   js/tool_cataloging.js        — model + init (event subscription, load_section)
*   js/render_tool_cataloging.js — split-pane wrapper, activity info
*   js/view_tool_cataloging_mosaic.js — mosaic view, drag events, hover overlay
*
* Extends tool_common (tools/tool_common/class.tool_common.php).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_cataloging extends tool_common {



	/**
	* SEC-024 (§9.2): allowlist of methods callable via dd_tools_api::tool_request.
	* Empty because tool_cataloging is UI-only: the drag-and-drop workflow and
	* portal updates are orchestrated entirely in the browser. No server-side
	* action is needed beyond the generic core data API (already permission-checked).
	*/
	public const API_ACTIONS = [];



}//end class tool_cataloging
