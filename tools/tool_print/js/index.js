// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_PRINT — index.js
* Entry-point barrel for the tool_print ES module.
*
* Re-exports every named export from tool_print.js so that external callers
* can import from this stable path without depending on the internal module
* layout:
*
*   import {tool_print} from '.../tool_print/js/index.js'
*
* NOTE: instances.js resolves tools by importing `tools/<model>/js/<model>.js`
* directly (not index.js), so this barrel is not part of the dynamic-loading
* path. It exists for explicit cross-module imports and for symmetry with the
* other tools in the codebase.
*
* tool_print is a visual print-layout / report-designer tool. Users drag the
* current section's components onto a document-flow grid of rows and cells,
* configure text/table box styles, and either print from the browser or
* generate a paginated multi-record document. Layout templates are saved per
* section_tipo in the dd25/dd625 section so that the same design can be
* reused across sessions and records.
*
* Main exports (from tool_print.js):
*   - tool_print — constructor + full prototype chain (init, build, get_data,
*     save_layout, on_close_actions, and all editor/print lifecycle methods).
*
* Related modules in this directory:
*   - tool_print.js             — constructor, prototype assignments, and all
*                                 API action methods (init, build, get_data…).
*   - render_tool_print.js      — DOM/view rendering for the editor and print
*                                 document; exposes render_print_document.
*   - canvas_tool_print.js      — document-flow data model (rows → cells →
*                                 blocks), all mutation helpers, and the canvas
*                                 render loop; exports SCHEMA_VERSION constant.
*   - flow_engine.js            — shared flow engine used by both the editor
*                                 and the print renderer (make_editor_ctx,
*                                 make_print_ctx, layout_flow).
*   - render_box_tool_print.js  — per-box rendering (text, table, image…).
*   - print_layout_presets.js   — persistence layer for named layout templates
*                                 (query_layouts, load_layout, create_new_layout,
*                                 save_layout, delete_layout).
*/



export * from './tool_print.js'



// @license-end
