// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_PROPAGATE_COMPONENT_DATA — index.js
* Entry-point barrel for the tool_propagate_component_data ES module.
*
* Re-exports every named export from tool_propagate_component_data.js so that
* external callers can import from this stable path without depending on the
* internal module layout:
*
*   import {tool_propagate_component_data} from '.../tool_propagate_component_data/js/index.js'
*
* This tool lets operators copy the current value of one component field into
* the same field across multiple section records in a single bulk operation.
* It opens as a modal or window attached to a specific component instance; the
* operator edits the value to propagate using a temporary (session-only) clone
* of that component, then confirms which action to apply:
*
*   - replace : overwrite the field value in every matched record
*   - add     : merge the propagated entries into each record's existing value
*               (hidden for single-value component models listed in
*               config.components_monovalue, e.g. component_image, component_av)
*   - delete  : remove matching entries from each record's field
*
* The set of target records is determined by the SQO currently active on the
* parent section (obtained via self.caller.caller?.caller). When no filter is
* active the operation targets all records in the section; in that case the
* operator must pass a second confirmation dialog before the request is sent.
*
* The propagation itself runs as a long-running background process on the
* server (dd_tools_api → action 'tool_request' → server method
* 'propagate_component_data') with a 3600-second timeout. Progress is
* streamed back via Server-Sent Events (SSE) and rendered in the tool's
* response_message area by update_process_status / render_stream.
*
* Main exports (from tool_propagate_component_data.js):
*   - tool_propagate_component_data — constructor + full prototype chain
*     (init, build, get_component_to_propagate, propagate_component_data,
*     on_close_actions) for the propagate-component-data tool instance.
*
* Related modules in this directory:
*   - tool_propagate_component_data.js        — tool constructor, prototype
*     assignments, and all API action methods.
*   - render_tool_propagate_component_data.js — DOM/view rendering (edit view,
*     action buttons, SSE progress display, process-status polling).
*/


export * from './tool_propagate_component_data.js'


// @license-end
