// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_SUBTITLES — index.js
* Entry-point barrel for the tool_subtitles ES module.
*
* Re-exports every named export from tool_subtitles.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_subtitles') using a single, stable import path:
*
*   import {tool_subtitles} from '.../tool_subtitles/js/index.js'
*
* The tool creates and edits subtitle segments for an audiovisual transcription
* and produces output in WebVTT format.  It pairs a transcription text component
* (the caller text_area, which holds raw time-coded text marked with <tc> tags)
* with a component_av media player and a JSON component that stores the parsed
* subtitle ar_value model (each entry typed as 'tc' or 'text').  Rich-text
* editing of individual subtitle segments is handled by service_ckeditor instances
* keyed by array index.
*
* The named export `tool_subtitles` MUST match the model string expected by
* get_instance() / instances.js; renaming or aliasing it here would silently
* break tool instantiation at runtime.
*
* Main exports (from tool_subtitles.js):
*   - tool_subtitles  — constructor; prototype carries init / build / edit /
*                       get_component / get_subtitles_data / get_user_tools /
*                       save_value / build_subtitles
*
* Related modules in this directory:
*   - tool_subtitles.js         — tool constructor, prototype chain, API actions
*   - render_tool_subtitles.js  — DOM/view rendering (edit view, subtitle list,
*                                 options header, activity-info panel,
*                                 per-segment CKEditor wiring)
*/


export * from './tool_subtitles.js'


// @license-end
