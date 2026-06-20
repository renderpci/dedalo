// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_ONTOLOGY_PARSER — index.js
* Entry-point barrel for the tool_ontology_parser ES module.
*
* Re-exports every named export from tool_ontology_parser.js so that the
* instances.js loader can resolve this tool by its canonical model string
* ('tool_ontology_parser') via a single, stable import path:
*
*   import {tool_ontology_parser} from '.../tool_ontology_parser/js/index.js'
*
* The tool is a Dédalo-native ontology management utility that lets operators:
*   1. Export selected ontologies — serialises chosen top-level-domain (TLD)
*      ontology entries into COPY files that can be sent to other Dédalo servers.
*   2. Regenerate ontologies — rebuilds the local dd_ontology cache from the
*      matrix ontology data for the selected TLDs.
*
* Both operations are long-running server tasks dispatched through dd_tools_api
* (action 'tool_request') with a 180-second timeout and a single attempt (no retry).
* Progress and error messages are returned in the API response and rendered
* safely via the _render_msg_lines helper (SEC-031) to prevent HTML injection.
*
* User selections are persisted to localStorage under the key
* 'selected_ontologies' (serialised JSON array of TLD strings) so that the
* same checkboxes are pre-ticked on the next tool open.
*
* Main exports (from tool_ontology_parser.js):
*   - tool_ontology_parser — constructor + prototype chain (init, build,
*     get_ontologies, export_ontologies, regenerate_ontologies,
*     on_close_actions) for the ontology-parser tool instance.
*
* Related modules in this directory:
*   - tool_ontology_parser.js         — tool constructor, prototype assignments,
*                                       and all API action methods.
*   - render_tool_ontology_parser.js  — DOM/view rendering (edit prototype),
*                                       ontology checkbox list, export and
*                                       regenerate button handlers.
*/


export * from './tool_ontology_parser.js'



// @license-end
