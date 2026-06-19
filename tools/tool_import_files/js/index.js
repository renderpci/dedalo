// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_IMPORT_FILES — index.js
* Entry-point barrel for the tool_import_files ES module.
*
* Re-exports every named export from tool_import_files.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_import_files') using a single, stable import path:
*
*   import {tool_import_files} from '.../tool_import_files/js/index.js'
*
* The tool provides a drag-and-drop bulk file importer that lets operators
* upload one or more files and associate them with records in a Dédalo section.
* Files are staged via service_dropzone, optional per-file metadata is collected
* through a service_tmp_section (input_component DDO entries), and the final
* import is dispatched as a long-running background process through dd_tools_api
* (action 'tool_request' → server method 'import_files').  Progress is streamed
* back via a Server-Sent Events (SSE) channel and rendered by update_process_status.
*
* The tool is activated per-component through the ontology tool_config property;
* it does NOT appear unless a component_portal (or equivalent) is correctly
* configured with a ddo_map that includes at least a 'target_component' role entry.
*
* File-to-record association supports four modes selected via the UI checkboxes:
*   - enumerate        : prefix the generated section_id into the file name
*   - named            : same file name maps to the same record (new section_id created)
*   - match            : match file name against the id of a previously uploaded file
*   - match_freename   : match file name against the free name of a previously uploaded file
*
* Main exports (from tool_import_files.js):
*   - tool_import_files  — constructor + prototype chain for the import-files tool instance
*
* Related modules in this directory:
*   - tool_import_files.js         — tool constructor, prototype assignments, API actions
*   - render_tool_import_files.js  — DOM/view rendering (called via the .edit prototype),
*                                    file-processor selector, target-field selector,
*                                    quality selector, matching options, configuration options
*/


export * from './tool_import_files.js'


// @license-end
