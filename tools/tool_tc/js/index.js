// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_TC — index.js
* Entry-point barrel for the tool_tc ES module.
*
* Re-exports every named export from tool_tc.js so that external callers can
* import from this stable path without relying on the internal module layout:
*
*   import {tool_tc} from '.../tool_tc/js/index.js'
*
* NOTE: the dynamic tool-loader in instances.js resolves tools by importing
* `tools/<model>/js/<model>.js` directly (not index.js), so this barrel is
* not part of the automatic loading path. It exists for explicit cross-module
* imports and for symmetry with the rest of the tool catalogue.
*
* tool_tc is a timecode-offset tool restricted to AV-transcription sections
* (rsc36). It lets an editor select a language, enter a numeric offset in
* seconds (positive or negative), and apply that offset uniformly to every
* timecode tag embedded in the component's text data.
*
* Timecode tags use the format [TC_HH:MM:SS.mmm_TC] (e.g.
* [TC_00:01:37.960_TC]). The server-side action `change_all_timecodes`
* (tool_tc::API_ACTIONS) parses each tag with a regex, converts it to total
* seconds via OptimizeTC::TC2seg, adds the offset, clamps to 0 to prevent
* negative timecodes, and serialises the result back with OptimizeTC::seg2tc.
* Positive offsets process elements in reverse order to avoid double-counting.
*
* Main exports (from tool_tc.js):
*   - tool_tc — constructor + prototype chain (render, destroy, refresh, edit)
*               inherited from tool_common and common, plus the async
*               change_all_time_codes API action method.
*
* Related modules in this directory:
*   - tool_tc.js           — constructor, prototype assignments, and the async
*                            change_all_time_codes action that calls the PHP
*                            server-side API via data_manager.
*   - render_tool_tc.js    — DOM rendering: edit(), content_data_edit(),
*                            and the exported change_component_lang helper
*                            used to switch the previewed language without
*                            reloading the tool.
*/



export * from './tool_tc.js'


// @license-end
