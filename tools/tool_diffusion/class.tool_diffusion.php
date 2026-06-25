<?php declare(strict_types=1);
/**
* CLASS TOOL_DIFFUSION
* Section toolbar button that launches the diffusion UI for a record.
*
* tool_diffusion is a UI-only tool: all diffusion work (publishing records to SQL,
* RDF, XML, Socrata, etc.) is driven by the browser JS and the Bun diffusion server.
* This PHP class exists solely to:
*   1. Declare the empty API_ACTIONS allowlist (enforces UI-only status, prevents
*      any method from being called via dd_tools_api).
*   2. Implement the is_available() lifecycle hook, which gate-keeps the tool button
*      so it only surfaces on sections that have at least one diffusion target defined
*      in the ontology.
*
* Relationships:
* - Extends tool_common (the shared base for all Dédalo tools).
* - Delegates the "does this section have diffusion?" check to
*   diffusion_utils::have_section_diffusion(), which is an O(1) lookup against
*   the persistent section-diffusion map cache (see diffusion_utils::get_section_diffusion_map()).
* - Called from common::get_tools() after affected_models/affected_tipos match;
*   the is_available() result is cached per (user_id, tipo, section_tipo) there.
*
* The tool registers itself in register.json under section_tipo dd1340 and surfaces
* as a button on every section whose tipo is in the section-diffusion map.
*
* @package Dédalo
* @subpackage Tools
*/
class tool_diffusion extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods remotely callable via
	* dd_tools_api::tool_request. An empty array means NO server method is
	* exposed: all diffusion operations are browser-driven (JS → Bun server).
	* This constant is read by tool_security before dispatching any API call;
	* omitting it, or adding entries here without corresponding security gates,
	* would create unauthorized server endpoints.
	* Lifecycle hooks such as is_available() must NEVER appear in this list.
	* @var array<int,string> $API_ACTIONS
	*/
	public const API_ACTIONS = [];



	/**
	* IS_AVAILABLE
	* Lifecycle hook checked by common::get_tools() to decide whether the
	* tool_diffusion button should appear for a given element.
	*
	* Two conditions must both hold for the button to surface:
	*   1. The caller is NOT a component (components are never diffusion targets;
	*      only section-level rows are published).
	*   2. The section tipo ($context->tipo) has at least one diffusion element
	*      defined in the flat virtual diffusion tree — verified via the persistent
	*      section-diffusion map (diffusion_utils::have_section_diffusion(), O(1)).
	*
	* This hook replaced a previously hardcoded case in core common::get_tools(),
	* keeping diffusion-specific logic inside the tool rather than in the core.
	* Returning false is cheap: the map is precomputed once per request and
	* cached at entity level on disk; the per-(user,tipo,section_tipo) result
	* cache in get_tools() prevents even repeated calls for the same element.
	*
	* Contract (from tool_common::tool_declares_availability):
	* - Must be public static.
	* - Must be side-effect-free and fast (result is cached; no writes allowed).
	* - Must NOT be listed in API_ACTIONS (it is a lifecycle hook, not an API action).
	*
	* @param object $context {
	*   caller_model: string,    — PHP class of the calling element (e.g. 'section_list')
	*   called_class: string,    — get_called_class() result of the caller
	*   is_component: bool,      — true when the caller is a component_* class
	*   tipo: string,            — ontology tipo of the element (e.g. 'rsc167')
	*   section_tipo: string,    — section tipo context of the caller
	*   mode: string|null        — current render mode ('edit', 'list', 'tm', …)
	* }
	* @return bool — true to show the button; false to hide it for this element
	*/
	public static function is_available(object $context) : bool {

		// Components are never diffusion targets: the tool only makes sense at
		// the section (record) level, where publishing is triggered.
		if ($context->is_component === true) {
			return false;
		}

		// O(1) lookup: the persistent map is keyed by section_tipo and built from
		// the flat virtual diffusion tree (diffusion_utils::get_section_diffusion_map).
		// !== false is used defensively; have_section_diffusion() currently returns
		// bool, but the guard protects against future nullable changes.
		return diffusion_utils::have_section_diffusion($context->tipo) !== false;
	}//end is_available



}//end class tool_diffusion
