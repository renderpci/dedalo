// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_UPLOAD — index.js
* Entry-point barrel for the tool_upload ES module.
*
* Re-exports every named export from tool_upload.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_upload') using a single, stable import path:
*
*   import {tool_upload} from '.../tool_upload/js/index.js'
*
* The tool provides a file-upload widget that lets operators upload a single
* file to the server and associate it with a Dédalo component or tool caller.
* File staging is delegated to the service_upload service (which handles the
* drag-and-drop UI, file validation, and multipart POST).  Once the file is
* staged, the tool calls the server via dd_tools_api (action 'tool_request' →
* server method 'process_uploaded_file') to move the temporary file to its
* definitive location, optionally trigger OCR, and apply quality/target-dir
* overrides declared in the caller's context.features.
*
* The tool supports two caller types selected at build time via
* caller.context.type:
*   - 'component' : after a successful upload a fresh component instance is
*                   built in edit mode and rendered as a live preview inside
*                   the tool window, so the operator can see the result without
*                   reloading the parent section.
*   - 'tool'      : post-upload processing is handled entirely server-side;
*                   no in-window preview is rendered.
*
* Allowed file extensions come from caller.context.features.allowed_extensions
* (e.g. ['csv', 'jpg']).  The server-side timeout for the API call is set to
* 3600 seconds to accommodate large files and slow OCR processing.
*
* Main exports (defined in tool_upload.js):
*   - tool_upload              — constructor + prototype chain for the upload tool instance
*   - process_uploaded_file    — standalone async function that builds and dispatches
*                                the 'process_uploaded_file' tool_request RQO; also
*                                used directly by callers that need headless file processing
*
* Related modules in this directory:
*   - tool_upload.js           — tool constructor, prototype assignments (init, build,
*                                process_uploaded_file_controller), and the exported
*                                process_uploaded_file API helper
*   - render_tool_upload.js    — DOM/view rendering (edit view, get_content_data,
*                                upload_done callback that triggers processing and
*                                optional preview rendering)
*/


export * from './tool_upload.js'


// @license-end
