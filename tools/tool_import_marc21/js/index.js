// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_IMPORT_MARC21
*
* ES-module entry point for the MARC 21 import tool.
* Re-exports everything from tool_import_marc21.js so that the
* instances.js loader (which resolves tools by their module name)
* can import this tool via a single canonical path:
*   tools/tool_import_marc21/js/index.js
*
* The named export 'tool_import_marc21' (the constructor function) MUST
* keep that exact name — instances.js uses it as the model key to look up
* and instantiate the tool at runtime.
*
* Main exports (from tool_import_marc21.js):
*   - tool_import_marc21  Constructor/prototype for the import tool.
*/



export * from './tool_import_marc21.js'



// @license-end
