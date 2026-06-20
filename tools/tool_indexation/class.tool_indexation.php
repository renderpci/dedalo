<?php
/**
* CLASS TOOL_INDEXATION
* Section toolbar tool for linking text fragments to thesaurus terms (indexation tags).
*
* Provides a split-pane interface where users select a span of text in a transcription
* component and then pick a matching thesaurus term; the tool stores the resulting
* locator reference in a component_relation_index component (`indexing_component`).
* The workflow is entirely browser-side.
*
* ARCHITECTURE
* This PHP class is a thin registration stub: it extends tool_common so the framework
* can discover and serve the tool via dd_tools_api, but every operation — rendering the
* split pane, managing indexation tag overlays, saving locator relations — is handled in
* the JavaScript layer:
*   js/tool_indexation.js        — model and init (event subscriptions, load_section)
*   js/render_tool_indexation.js — split-pane wrapper, content-data wiring
*   js/tag_note.js               — tag-overlay widget (create / edit / delete UI)
*
* KEY RUNTIME PROPERTIES (JS layer, listed here for cross-language context)
*   - transcription_component: the component_text_area being indexed
*   - indexing_component:       component_relation_index that stores locator references
*   - related_sections_list:    top-section tipo/id list used to scope available terms
*   - DEDALO_INDEXATION_SECTION_TIPO  (rsc377), DEDALO_INDEXATION_TITLE_TIPO (rsc379),
*     DEDALO_INDEXATION_DESCRIPTION_TIPO (rsc380): ontology tipos for indexation notes
*
* CONFIGURATION (ddo_map roles in the ontology's tool_config)
*   The tool is activated on components whose tipo / section_tipo matches an entry in
*   the tool_config ddo_map stored in the tool registry (dd1324). No bespoke tables are
*   used: all state (locator relations, indexation notes) lives in standard Dédalo
*   sections and components (The Dédalo way).
*
* PERSISTENCE
*   Indexation relationships are stored as regular component_relation_index data items.
*   Tag notes (title + description) are stored in indexation-note section records
*   (rsc377) and linked via the indexation relations. Deleting a tag removes both the
*   relation entry and all associated note records via the standard delete API.
*
* Extends tool_common (tools/tool_common/class.tool_common.php).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_indexation extends tool_common {



	/**
	* SEC-024 (§9.2): allowlist of methods callable via dd_tools_api::tool_request.
	* Empty because tool_indexation is UI-only: creating, editing, and deleting
	* indexation tags are orchestrated entirely in the browser through the generic
	* core data API (component_relation_index save/delete actions), which are already
	* permission- and scope-checked by the core API layer. No custom server-side
	* action is needed beyond what the core API provides.
	* (!) Any future server-side action (e.g. bulk re-index, migration helper) MUST
	* be added here before it can be dispatched through dd_tools_api::tool_request.
	*/
	public const API_ACTIONS = [];



}//end class tool_indexation
