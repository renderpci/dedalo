// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_NUMISDATA_EPIGRAPHY — barrel entry-point
*
* Stable public import path for the numismatic epigraphy tool.
* Re-exports every public symbol from `tool_numisdata_epigraphy.js` so that
* callers can import from this path without depending on the internal module
* layout of the tool directory.
*
* The tool is used to transcribe legends, countermarks, and other epigraphic
* features of numismatic objects (coins, tokens, etc.).  It maps a fixed set
* of ontological roles (obverse/reverse legend, design, symbol, mark, edge …)
* to component instances resolved from `tool_config.ddo_map` at build time,
* and exposes them as named properties on the constructor instance.
*
* The named export `tool_numisdata_epigraphy` MUST match the model string used
* by the instance loader (`instances.js`) to resolve and instantiate the tool;
* renaming or aliasing it here would silently break tool instantiation.
*
* Main exports (defined in tool_numisdata_epigraphy.js):
*   - tool_numisdata_epigraphy — constructor; prototype carries:
*       init            — sets up lang/source_lang from page_globals
*       build           — maps ontological roles to ar_instances entries
*       get_component   — loads/replaces a single component instance by role
*       get_relations   — fetches related sections for a given section record
*       get_user_tools  — checks which tools the current user may access
*/


export * from './tool_numisdata_epigraphy.js'


// @license-end
