// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_IDENTIFY
*
* Barrel entry-point for the tool_identify module.
*
* This file re-exports the `tool_identify` constructor and every other
* public symbol defined in `tool_identify.js`, so that callers can import
* from the stable path `tools/tool_identify/js/index.js` without depending
* on the internal module layout.
*
* The named export `tool_identify` MUST match the model string that the
* instance loader (`instances.js`) uses to resolve and instantiate the tool;
* renaming or aliasing it here would silently break tool instantiation.
*
* What the tool does: opened from an object record, it asks
* `dd_identify_api:find_matches` for the records most likely to be the same
* type, and renders each candidate WITH its per-criterion reason. See
* `engineering/IDENTIFY_SPEC.md` for the engine behind it.
*
* It also groups a whole batch (`tool_identify::cluster`) and PROMOTES a group
* to a canonical Type record every member links to — through the ordinary
* component save, never a bespoke write path (IDENTIFY_SPEC §8.4).
*
* Main exports (defined in tool_identify.js):
*   - tool_identify — constructor; prototype carries init / build /
*                     edit (via wire_tool) / tool_request / find_matches /
*                     get_proposals / accept_proposal / cluster /
*                     resolve_type_link / check_type_record / create_type_record /
*                     name_type_record / attach_members / resolve_labels /
*                     open_record / on_close_actions
*/



export * from './tool_identify.js'



// @license-end
