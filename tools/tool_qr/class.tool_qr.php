<?php declare(strict_types=1);
/**
* CLASS TOOL_QR
* Server-side handler for the Dédalo QR-code generation tool.
*
* Generates QR codes for section records so that physical items (warehouse
* stock, archival objects, photographs, etc.) can be labelled and later
* scanned to navigate directly to the corresponding Dédalo record.
*
* Architecture overview:
* - The entire rendering pipeline runs in the browser (tool_qr.js /
*   render_tool_qr.js).  The server side has no callable API actions; its
*   only responsibility is to be instantiated as a dd_object context that
*   the JS layer receives and uses to wire up the UI.
* - On the client, `tool_qr.prototype.init` dynamically imports the
*   third-party EasyQRCodeJS library (lib/qrcode/easy.qrcode.min.js).
* - `tool_qr.prototype.build` calls `load_section`, which fetches the full
*   section record set via `data_manager.get_element_context` and a
*   `get_instance` / `build(true)` cycle, applying the `ddo_map` declared
*   in the button's `tool_config.tool_qr` properties.
* - Each record in the section produces one QR wrapper containing:
*     · An EasyQRCodeJS canvas encoding the record's canonical URL
*       (`<host><DEDALO_CORE_URL>/page/?tipo=<section_tipo>&section_id=<id>`).
*     · Optional image component rendered via `render_component`.
*     · Optional label component rendered via `render_component`.
*     · Optional entity logo (`tool_config.options.entity_logo`).
* - The print canvas supports portrait/landscape switching via a CSS-class
*   toggle on the `.qr_canvas` element.
*
* Configuration (button properties → tool_config.tool_qr):
*   {
*     "ddo_map": [
*       { "role": "image", "tipo": "<tipo>", ... },  // zero or more
*       { "role": "label", "tipo": "<tipo>", ... }   // zero or more
*     ],
*     "options": {
*       "host":        "https://myhost/",            // optional; defaults to window.location.origin
*       "entity_logo": "https://myhost/logo.svg"     // optional
*     }
*   }
*   When `section_tipo` / `parent` values in ddo_map entries are set to
*   `"self"`, the same button configuration works across all virtual
*   sections that share a common base section tipo (e.g. tch100, tch200,
*   tch300 all inheriting from tch7).
*
* Activation:
* - Triggered by a button component (see component tipo `tch350` convention
*   documented in register.json dd1362) placed in a section layout.
* - Opens as a floating window (`open_as: "window"` in misc/dd1335).
*
* Relationships:
* - Extends tool_common (base class for all Dédalo v7 tools).
* - All rendering is delegated to render_tool_qr.js on the client.
* - Called exclusively through the browser; no server-side API actions are
*   exposed, so `dd_tools_api::tool_request` will reject any attempt to
*   dispatch against this tool (empty API_ACTIONS allowlist enforces this).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_qr extends tool_common {



	/**
	* API_ACTIONS
	* Empty allowlist — this is a purely UI-driven tool with no server-side
	* callable methods.
	*
	* SEC-024 (§9.2): The empty array prevents `dd_tools_api::tool_request`
	* from dispatching any action against this class, even if the request
	* names a method that exists on the parent `tool_common`.  All logic
	* (QR rendering, section loading, EasyQRCodeJS integration) runs entirely
	* in the browser via tool_qr.js / render_tool_qr.js.
	*
	* @var array<string,string> API_ACTIONS
	*/
	public const API_ACTIONS = [];



}//end class tool_qr
