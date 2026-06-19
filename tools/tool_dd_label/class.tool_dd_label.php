<?php declare(strict_types=1);
/**
* CLASS TOOL_DD_LABEL
* UI-only tool for composing multi-language labels for Dédalo tools.
*
* Responsibilities:
* - Presents an editable grid that maps each registered label name (e.g. a button
*   caption) to a translated string for every language configured in the project.
* - Reads the current label array from the hosting component_json editor (dd1372)
*   and writes the user-edited values back as a JSON array of {lang, name, value}
*   objects — the exact data shape that get_label() consumes at runtime.
* - All data flow and user interaction are handled entirely in the browser
*   (tool_dd_label.js + render_tool_dd_label.js). The PHP class exists only to
*   satisfy the tools registry contract and to declare the security surface.
*
* Scope constraint:
* - This tool is exclusively bound to section dd1340 ('Tools development') and
*   component_json dd1372 ('Tool labels'). Attempting to invoke it elsewhere will
*   produce no useful output because it reads data directly from its caller's JSON
*   editor rather than performing a generic API action.
*
* Data shape managed:
* - Input / output stored in component_json (dd1372):
*     [ { lang: "lg-spa", name: "button_save", value: "Guardar" }, … ]
*   Each entry is one translated string for one label slot. Multiple entries with
*   the same 'name' but different 'lang' values coexist in the array.
*
* Relationships:
* - Extends tool_common, which provides __construct(), get_json(),
*   get_structure_context(), and the full tool cache / config resolution chain.
* - Has no remotely-callable methods (API_ACTIONS = []). All mutations are
*   performed client-side; no PHP handler is needed.
* - Registered under section dd1340 (Tools development) with affected component
*   dd1372 (component_json for tool labels), as declared in register.json.
*
* @package Dédalo
* @subpackage Tools
*/
class tool_dd_label extends tool_common {



	/**
	* API_ACTIONS
	* Empty map — this tool exposes no server-side API actions.
	*
	* All user interactions (reading and writing label data) are performed
	* entirely in the browser by tool_dd_label.js, which writes directly
	* back to the caller's component_json editor (dd1372). No PHP handler
	* is therefore required, and exposing actions here would create an
	* unnecessary security surface (tool_security enforces this contract).
	*
	* @var array
	*/
	public const API_ACTIONS = [];



}//end class tool_dd_label
