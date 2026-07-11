// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_QR — index.js
* Entry-point barrel for the tool_qr ES module.
*
* Re-exports every named export from tool_qr.js so that external callers can
* import from this stable path without relying on the internal module layout:
*
*   import {tool_qr} from '.../tool_qr/js/index.js'
*
* NOTE: the dynamic tool-loader in instances.js resolves tools by importing
* `tools/<model>/js/<model>.js` directly (not index.js), so this barrel is
* not part of the automatic loading path. It exists for explicit cross-module
* imports and for symmetry with the rest of the tool catalogue.
*
* tool_qr generates printable QR-code sheets for the records returned by the
* current section. On init it dynamically loads the EasyQRCodeJS library from
* `lib/qrcode/easy.qrcode.min.js`. On build it fetches the caller's full
* section data (limit 0, offset 0) and renders one QR tile per record onto
* an A4-sized print canvas. Each tile contains:
*   - a QR code whose payload is the canonical Dédalo page URL for the record,
*   - optional image and label components driven by the tool_config.ddo_map
*     (roles: 'image' and 'label'),
*   - the numeric section_id, and
*   - an optional entity logo sourced from tool config options.
*
* The canvas orientation (portrait / landscape) is toggled by a <select>
* element rendered in the info bar above the canvas.
*
* Main exports (from tool_qr.js):
*   - tool_qr — constructor + prototype chain (init, build, load_section)
*               plus inherited render/destroy/refresh/edit from tool_common
*               and common prototypes.
*
* Related modules in this directory:
*   - tool_qr.js           — constructor, prototype assignments, and the async
*                            init / build / load_section lifecycle methods.
*   - render_tool_qr.js    — DOM rendering: edit(), get_content_data(),
*                            render_info_container(), render_canvas(),
*                            render_component(), generate_qr().
*   - lib/qrcode/          — vendored EasyQRCodeJS library (loaded lazily in
*                            tool_qr.prototype.init).
*/



export * from './tool_qr.js'



// @license-end
