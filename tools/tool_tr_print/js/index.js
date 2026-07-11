// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_TR_PRINT — index.js
* Entry-point barrel for the tool_tr_print ES module.
*
* Re-exports every named export from tool_tr_print.js so that external callers
* can import from this stable path without depending on the internal module
* layout:
*
*   import {tool_tr_print} from '.../tool_tr_print/js/index.js'
*
* NOTE: instances.js resolves tools by importing `tools/<model>/js/<model>.js`
* directly (not index.js), so this barrel is not part of the dynamic-loading
* path. It exists for explicit cross-module imports and for symmetry with the
* other tools in the codebase.
*
* tool_tr_print is the "Print transcription" tool (registered as dd1326).
* It generates a printable version of an interview transcript attached to a
* text-area component. The user can customise the printout by toggling which
* inline tags (time-code [TC_…], index, note, reference) are included or
* omitted before sending to the browser print dialog.
*
* The tool opens as a floating window (open_as:"window") and is available on
* text-area components (rsc36) that belong to interview sections. It uses the
* caller component's lang as the source language and resolves related sections
* via a `related_search` API call to build the relation list shown in the print
* view.
*
* Main exports (from tool_tr_print.js):
*   - tool_tr_print — constructor + full prototype chain (init, build,
*     load_relation_list, tags_to_html, build_subtitles).
*
* Related modules in this directory:
*   - tool_tr_print.js         — constructor, prototype assignments, and all
*                                API action methods (init, build,
*                                load_relation_list, tags_to_html,
*                                build_subtitles).
*   - render_tool_tr_print.js  — DOM/view rendering; exposes the `edit`
*                                prototype used by tool_tr_print for its
*                                main render pass.
*/



export * from './tool_tr_print.js'


// @license-end
