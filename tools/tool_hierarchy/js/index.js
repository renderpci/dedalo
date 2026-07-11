// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* TOOL_HIERARCHY — index.js
* Entry-point barrel for the tool_hierarchy ES module.
*
* Re-exports every named export from tool_hierarchy.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_hierarchy') using a single, stable import path:
*
*   import {tool_hierarchy} from '.../tool_hierarchy/js/index.js'
*
* The tool allows operators to generate a new Ontology virtual section
* (hierarchy1 preset) derived from a reference structure. It exposes a
* "Generate" action that POSTs to the server-side handler via
* dd_tools_api / tool_request, passing the caller's section_id and
* section_tipo so the PHP backend can build or rebuild the virtual tree.
* An optional force_to_create flag bypasses the existing-structure check.
*
* Main exports (from tool_hierarchy.js):
*   - tool_hierarchy — constructor + prototype chain for the hierarchy tool instance
*
* Related modules in this directory:
*   - render_tool_hierarchy.js — DOM/view rendering (called via the .edit prototype)
*   - tool_hierarchy.js        — tool constructor, prototype assignments, API call
*/



export * from './tool_hierarchy.js'


// @license-end
