// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_UPDATE_CACHE — index.js
* Entry-point barrel for the tool_update_cache ES module.
*
* Re-exports every named export from tool_update_cache.js so that external
* callers can resolve the tool from a single, stable import path:
*
*   import {tool_update_cache} from '.../tool_update_cache/js/index.js'
*
* tool_update_cache is a Dédalo operator tool for bulk-regenerating the
* stored/cached data of one or more components across an entire section.
* The operator selects which components to reprocess, optionally configures
* per-component regeneration flags (e.g. delete_normalized_files for media
* components), then submits the job.  The server processes records in chunks
* of CHUNK_SIZE (default 1 000) via a recursive process_chunk loop and runs
* the whole operation in the background through process_runner.php so that
* the PHP time-limit and browser timeout do not abort long-running updates.
* Progress is streamed back to the browser via a Server-Sent Events (SSE)
* channel and rendered by update_process_status / render_stream.
*
* Server side:  tools/tool_update_cache/class.tool_update_cache.php
*   API_ACTIONS : ['update_cache', 'get_component_list']
*   BACKGROUND_RUNNABLE : ['update_cache']  (dispatched via process_runner.php)
*
* Client flow:
*   1. build() → get_components_list() — fetches the section's component tree
*      from dd_tools_api::get_component_list, which enriches each entry with
*      its regenerate_options (server static method get_regenerate_options()).
*   2. render_tool_update_cache.prototype.edit() builds the UI:
*      a checkbox list (render_components_list), per-component regenerate-option
*      controls (render_regenerate_options), and an "Update Records" button.
*   3. On button click the tool calls update_cache() which posts an rqo with
*      background_running:true.  The API response includes a pid/pfile pair
*      used by update_process_status to poll the SSE progress stream until
*      the background process exits.
*   4. On completion render_response_report summarises n_components, records
*      processed and total.
*
* Persistence: an in-progress operation is saved in the browser's local_db
* under the key 'process_update_cache' / 'status' so that a page reload can
* re-attach to an already-running background job.
*
* Main exports (from tool_update_cache.js):
*   - tool_update_cache — constructor + prototype chain (init, build,
*     get_components_list, update_cache) for the update-cache tool instance.
*
* Related modules in this directory:
*   - tool_update_cache.js        — tool constructor, prototype assignments,
*                                   API request helpers.
*   - render_tool_update_cache.js — DOM/view rendering: edit(), get_content_data(),
*                                   render_components_list(), render_regenerate_options(),
*                                   update_process_status(), render_response_report().
*/


export * from './tool_update_cache.js'


// @license-end
