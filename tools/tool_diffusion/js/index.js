// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_DIFFUSION — index.js
* Entry-point barrel for the tool_diffusion ES module.
*
* Re-exports every named export from tool_diffusion.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_diffusion') using a single, stable import path:
*
*   import {tool_diffusion} from '.../tool_diffusion/js/index.js'
*
* The tool drives publication of Dédalo work-data to external SQL/RDF/XML
* targets via a Bun-owned diffusion server. It does NOT connect to MariaDB
* directly — all persistence is routed through the Bun API actions layer.
*
* Main exports (from tool_diffusion.js):
*   - tool_diffusion  — constructor + prototype chain for the diffusion tool instance
*
* Related modules in this directory:
*   - render_tool_diffusion.js  — DOM/view rendering (called via the .edit prototype)
*   - tool_diffusion.js         — tool constructor, prototype assignments, API actions
*/


export * from './tool_diffusion.js'


// @license-end
