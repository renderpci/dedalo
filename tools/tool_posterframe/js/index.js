// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_POSTERFRAME — index.js
* Entry-point barrel for the tool_posterframe ES module.
*
* Re-exports every named export from tool_posterframe.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_posterframe') via a single, stable import path:
*
*   import {tool_posterframe} from '.../tool_posterframe/js/index.js'
*
* tool_posterframe allows editors to create and delete the posterframe
* (thumbnail still image) for audio-visual (component_av) and 3-D
* (component_3d) media records.  It also supports creating an
* "identifying image" — a separate still extracted at a chosen timecode
* and stored in a linked portal section — for component_av records.
*
* All media write operations are delegated to the underlying
* component's own create_posterframe / delete_posterframe methods;
* the tool itself never writes media files directly.
*
* Main exports (from tool_posterframe.js):
*   - tool_posterframe  — constructor + prototype chain for the tool instance
*
* Related modules in this directory:
*   - tool_posterframe.js         — tool constructor, prototype assignments, API actions
*   - render_tool_posterframe.js  — DOM/view rendering (called via the .edit prototype)
*/


export * from './tool_posterframe.js'


// @license-end
