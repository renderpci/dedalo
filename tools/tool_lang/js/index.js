// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* TOOL_LANG
*
* Barrel entry-point for the translation tool.
* Re-exports the `tool_lang` constructor and all public symbols from
* `tool_lang.js` so that callers can import from the stable path
* `tools/tool_lang/js/index.js` without depending on the internal module
* layout.
*
* The named export `tool_lang` MUST match the model string used by the
* instance loader (`instances.js`) to resolve and instantiate the tool;
* renaming or aliasing it here would silently break tool instantiation.
*
* Main exports (defined in tool_lang.js):
*   - tool_lang  — constructor; prototype carries init / build / edit /
*                  automatic_translation_browser /
*                  automatic_translation_server
*/



export * from './tool_lang.js'



// @license-end
