<?php declare(strict_types=1);
/**
* CLASS TOOL_NUMISDATA_ORDER_COINS
* Section toolbar tool for visually grouping, sorting, and classifying numismatic
* objects (coins) within a lot or collection.
*
* The tool opens as a separate browser window (`open_as: window`, from register.json
* dd1335) split into two panes:
*
* - LEFT PANE — the source portal (`coins` ddo role) rendered using the custom
*   `view_coins_mosaic_portal` view. Each coin card:
*     * displays mosaic-flagged fields (image, measurements) from the ontology ddo_map.
*     * provides a hover overlay showing additional detail fields.
*     * exposes a drag handle so the card can be dragged to the right pane.
*     * shows two radio buttons (Original / Copy) and a Snap checkbox driven by
*       the `render_column_original_copy` function in view_coins_mosaic_portal.js.
*
* - RIGHT PANE — an `ordered_coins` portal (`ordered_coins` ddo role) where the user
*   drops coins to assign them to a specific position within an order component
*   (component_relation or similar). The drop target columns are `.column_numisdata9`
*   nodes rendered by the portal; each has HTML5 drag-over/drop handlers wired by
*   `render_tool_numisdata_order_coins.prototype.drop`.
*
* SORTING (header toolbar buttons)
* The "Weight" (numisdata133) and "Diameter" (numisdata135) buttons re-sort the left
* pane client-side by reading the already-loaded sibling component data from
* `self.coins.datum.data`. Null values sort to the end. Toggling the active button
* restores the original section_id order. On portal refresh (`window_bur_` event),
* the active sort is reapplied automatically.
*
* ORIGINAL / COPY CLASSIFICATION
* The "Set Original / Copy" header button calls `self.set_original_copy`, which
* iterates checked radio inputs and persists each coin's classification by:
*   1. Writing a locator (`{section_id, section_tipo}`) to a numisdata341 dd64 locator
*      component (`numisdata157`) — value '1' = original, '2' = copy.
*   2. For coins marked as originals: updating a `component_relation_related`
*      (`numisdata55`) to point at all coins marked as copies, establishing the
*      equivalence relation between the original and its copies.
* All writes go through `component.change_value`, so they follow the standard
* component save path and fire the `save` event (rendered in the activity info bar).
*
* DROP ASSIGNMENT WORKFLOW
* When a coin card is dropped onto an `ordered_coins` column cell:
*   1. `render_tool_numisdata_order_coins.prototype.drop` captures the DataTransfer
*      JSON payload (`{locator: {section_id, section_tipo}}`).
*   2. `tool_numisdata_order_coins.prototype.assign_element` calls `change_value` on
*      the `component_relation` instance bound to the drop-target cell
*      (`current_node.component_instance`), inserting the dragged locator.
*   3. The right pane (`ordered_coins`) is destroyed and rebuilt to reflect the new
*      ordering; drop event listeners are re-attached via `assing_drop` subscribers
*      on the `window_bur_` and `add_row_` event channels.
*   4. The drag icon in the left pane gains the CSS class `used` to signal the coin
*      has been placed in the order.
*
* PERSISTENCE
* No bespoke tables. All state lives in standard component data:
*   - coin order       → relation data of the `ordered_coins` portal component.
*   - original/copy    → numisdata157 locator component and numisdata55 relation.
* This conforms to The Dédalo Way (no bespoke tables; state in sections/components).
*
* PHP ROLE
* This class is a thin registration stub. It extends tool_common so the framework
* can discover it, load its register.json (dd1324), and serve the tool JS through the
* tool lifecycle. Every business operation (mosaic render, drag-and-drop, sort, save)
* is handled in the browser:
*   js/tool_numisdata_order_coins.js        — model, init, build, assign_element,
*                                             set_original_copy
*   js/render_tool_numisdata_order_coins.js — edit view, header, activity info,
*                                             drop wiring (get_ordered_coins, drop)
*   js/view_coins_mosaic_portal.js          — custom portal mosaic view with hover
*                                             overlay and original/copy column
*
* Extends tool_common (tools/tool_common/class.tool_common.php).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_numisdata_order_coins extends tool_common {

	/**
	* SEC-024 (§9.2): allowlist of methods callable via dd_tools_api::tool_request.
	* Empty because tool_numisdata_order_coins is UI-only: coin ordering, original/copy
	* classification, and relation updates are all orchestrated in the browser through
	* the standard component change_value path, which is already permission-checked by
	* the core data API. No server-side action is needed beyond tool registration.
	*/
	public const API_ACTIONS = [];

}//end class tool_numisdata_order_coins