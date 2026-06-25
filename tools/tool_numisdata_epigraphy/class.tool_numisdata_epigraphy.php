<?php declare(strict_types=1);
/**
* CLASS TOOL_NUMISDATA_EPIGRAPHY
* Specialized tool for transcribing epigraphic elements on numismatic objects (coins).
*
* PURPOSE
* Provides a structured workspace for entering and linking the textual and symbolic content
* found on coins: legends (inscriptions), designs (iconographic descriptions), symbols,
* countermarks, and edge markings. Each surface element (obverse, reverse, edge) has a
* dedicated editing slot backed by a portal or relation component that references entries in
* an epigraphy thesaurus. A paired text-area component stores the Unicode transcription that
* results from combining individual glyphs selected through the thesaurus.
*
* LAYOUT
* The tool opens as a window (open_as: window, register.json dd1335). The rendered
* UI (render_tool_numisdata_epigraphy.js) is split into two panes:
*
*   LEFT PANE — epigraphy glyph picker
*     A text-area component (role: 'epigraphy') backed by an epigraphy thesaurus. Users
*     select or compose Unicode glyphs here before associating them with a surface element.
*
*   RIGHT PANE — structured coin-surface fields
*     One portal/relation per coin surface and element type, each rendered as an editable
*     component and followed by a read-only text container that shows matching transcription
*     records with a "Used in" count:
*
*       coins             — a listing/portal for the numismatic objects being described.
*       obverse_legend    — inscription on the front face (legend role).
*       reverse_legend    — inscription on the back face (legend role).
*       obverse_desing    — iconographic design on the front face.
*       reverse_desing    — iconographic design on the back face.
*       obverse_symbol    — secondary symbol on the front face.
*       reverse_symbol    — secondary symbol on the back face.
*       obverse_mark      — countermark or mint mark on the front face.
*       reverse_mark      — countermark or mint mark on the back face.
*       edge_desing       — design element along the coin's edge.
*       edge_legend       — inscription running along the coin's edge.
*
*     Each of these roles maps to a ddo_map entry in the tool's ontology config.  After a
*     save event on a legend/design/symbol/mark portal, the corresponding text container
*     is refreshed: get_component() loads the text-area component for the updated section,
*     and get_relations() issues a 'related_search' API call (mode: 'related', count: true)
*     to display a "Used in: N" label beneath each transcription node.
*
* DDO_MAP ROLES (resolved in tool_numisdata_epigraphy.prototype.build)
* The twelve role keys ('coins', 'epigraphy', 'obverse_legend', 'reverse_legend',
* 'obverse_desing', 'reverse_desing', 'obverse_symbol', 'reverse_symbol',
* 'obverse_mark', 'reverse_mark', 'edge_desing', 'edge_legend') are resolved
* against tool_config.ddo_map. Missing roles emit a console.warn and are skipped;
* the tool continues rendering the remaining roles.
*
* PHP ROLE
* This class is a registration stub only. The full tool lifecycle — component loading,
* event subscriptions, get_component(), get_relations(), and get_user_tools() — is handled
* exclusively in the browser:
*   js/tool_numisdata_epigraphy.js        — model constructor, init, build, get_component,
*                                           get_relations, get_user_tools prototype methods.
*   js/render_tool_numisdata_epigraphy.js — edit view, left/right panes, update_text_nodes
*                                           helper, render_activity_info save notification.
*   js/index.js                           — ES module re-export barrel.
*   css/tool_numisdata_epigraphy.less     — layout and theme styles for the split UI.
*
* Extends tool_common (tools/tool_common/class.tool_common.php), which provides:
*   get_json(), get_structure_context(), create_tool_simple_context(),
*   get_config(), get_user_tools(), get_all_registered_tools().
*
* Registry entry: register.json (section dd1324, section_id resolved at import).
*   Version: 2.0.1 — requires Dédalo dd_version 6.0.0+.
*   open_as: window (registered in dd1335 misc component).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_numisdata_epigraphy extends tool_common {



	/**
	* SEC-024 (§9.2): allowlist of methods callable remotely via dd_tools_api::tool_request.
	* Empty because tool_numisdata_epigraphy is UI-only: glyph transcription, portal loading,
	* relation queries, and component saves all go through the generic core data API
	* (already permission-checked), without any server-side action on this class.
	*/
	public const API_ACTIONS = [];



}//end class tool_numisdata_epigraphy