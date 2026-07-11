// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_ONTOLOGY — index.js
* Entry-point barrel for the tool_ontology ES module.
*
* Re-exports every named export from tool_ontology.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_ontology') via a single, stable import path:
*
*   import {tool_ontology} from '.../tool_ontology/js/index.js'
*
* The tool provides an ontology-node processing action surfaced as a section
* toolbar button.  When triggered, it calls the server-side
* set_records_in_dd_ontology action (dd_tools_api / tool_request) to
* materialise the ontology node for the current record into dd_ontology rows.
*
* Main export (from tool_ontology.js):
*   - tool_ontology  — constructor + prototype chain (init / build / edit /
*                      set_records_in_dd_ontology / on_close_actions)
*
* Related modules in this directory:
*   - tool_ontology.js        — tool constructor, prototype assignments, API call
*   - render_tool_ontology.js — DOM/view rendering (called via the .edit prototype)
*/



export * from './tool_ontology.js'



// @license-end
