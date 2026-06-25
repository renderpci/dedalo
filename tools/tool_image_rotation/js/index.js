// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_IMAGE_ROTATION — index.js
* Entry-point barrel for the tool_image_rotation ES module.
*
* Re-exports every named export from tool_image_rotation.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_image_rotation') via a single stable import path:
*
*   import {tool_image_rotation} from '.../tool_image_rotation/js/index.js'
*
* The tool provides an interactive client-side image editing panel that lets
* operators rotate image files by an arbitrary angle (−360 … +360 degrees,
* 0.01 step), optionally set a background fill colour or alpha transparency,
* optionally expand the canvas to avoid cropping the corners, and optionally
* crop the result with a drag-to-select overlay before writing back to disk.
* A second operation, Automatic Background Removal, runs entirely in the
* browser via a Web Worker (remove_background.js) that loads a Transformers.js
* pipeline (briaai/RMBG-1.4, WebGPU or WASM fallback), converts the segmented
* pixels to a PNG Blob and uploads it through service_upload, then calls
* process_uploaded_file (tool_upload) to move the staged file into every
* quality directory of the target component.
*
* Server-side image mutation (all quality levels, original quality skipped) is
* handled by class.tool_image_rotation.php → apply_rotation(), reached via:
*   dd_tools_api → action:'tool_request' → method:'apply_rotation'
*
* Main exports (from tool_image_rotation.js):
*   - tool_image_rotation  — constructor + prototype chain for the tool instance
*
* Related modules in this directory:
*   - tool_image_rotation.js        — constructor, prototype assignments,
*                                     apply_rotation(), automatic_background_removal()
*   - render_tool_image_rotation.js — DOM/view rendering (edit view, image panel,
*                                     rotation slider, colour picker, axis guides)
*   - render_tool_image_crop.js     — singleton crop-selection overlay (start/drag/
*                                     resize/update/reset lifecycle, 8 resize handles)
*/



export * from './tool_image_rotation.js'


// @license-end
