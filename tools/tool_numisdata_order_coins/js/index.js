// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_NUMISDATA_ORDER_COINS — index.js
* Entry-point barrel for the tool_numisdata_order_coins ES module.
*
* Re-exports every named export from tool_numisdata_order_coins.js so that the
* instances.js loader can resolve the tool by its canonical model string
* ('tool_numisdata_order_coins') using a single, stable import path:
*
*   import {tool_numisdata_order_coins} from '.../tool_numisdata_order_coins/js/index.js'
*
* The tool provides grouping and sorting of numismatic objects (coins) within
* Dédalo, allowing catalogue editors to visually reorder coin records, assign
* original/copy status, and sort by attributes such as weight and diameter.
*
* Main exports (from tool_numisdata_order_coins.js):
*   - tool_numisdata_order_coins — constructor + prototype chain for the tool instance
*
* Related modules in this directory:
*   - render_tool_numisdata_order_coins.js — DOM/view rendering (called via the .edit prototype)
*   - view_coins_mosaic_portal.js          — mosaic portal view for the coin grid display
*   - tool_numisdata_order_coins.js        — tool constructor, prototype assignments, API actions
*/


export * from './tool_numisdata_order_coins.js'


// @license-end
