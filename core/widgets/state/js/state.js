// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../widget_common/js/widget_common.js'
	import {render_edit_state} from '../js/render_edit_state.js'
	import {render_list_state} from '../js/render_list_state.js'



/**
* STATE
* Client-side constructor for the state widget.
*
* The state widget is an IPO-driven (Input → Process → Output) read-only
* display widget that visualises the completion status and situational progress
* of a record. It is the JS counterpart of class.state.php.
*
* Two measurement dimensions are shown side-by-side for every configured output
* row:
*   - situation  — user-controlled progress stored in ontology section dd174
*                  (component_type dd92, a percentage numeric field).
*   - state      — administrator-controlled status stored in section dd501
*                  (component_type dd83, also a percentage numeric field).
*
* Each dimension shows:
*   - A summary "total" percentage — the weighted average across all project
*     languages and all source locators.
*   - A per-language "detail" breakdown revealed on hover (edit mode) or on
*     click (list mode, as a tooltip).
*
* Instance lifecycle (orchestrated by widget_common):
*   init()    — populates all instance properties from the options bag provided
*               by the parent component or section renderer.
*   build()   — optional data-load hook; uses the component_info autoload path
*               when this.caller === 'component_info'.
*   render()  — delegates to common.render(), which dispatches to edit() or
*               list() depending on this.mode.
*   destroy() — unsubscribes all event tokens accumulated in events_tokens.
*
* The IPO array (this.ipo) is delivered by the server and describes the output
* structure.  Each element represents one "row" in the display:
*   [
*     {
*       input:  { type, source, paths },
*       output: [ { id, label }, … ]
*     },
*     …
*   ]
*
* this.value is the flat data array produced by class.state.php::get_data().
* Each element is one metric item:
*   {
*     widget:     {string}  'state'
*     key:        {number}  index in this.ipo matching the enclosing IPO entry
*     widget_id:  {string}  var_name from the last path node (e.g. 'av', 'state')
*     lang:       {string}  language code (e.g. 'lg-eng') or 'lg-nolan' for non-translatable
*     value:      {number}  raw numeric value (0–1 range for totals; integer for details)
*     locator:    {Object|null}  locator pointing to the source record, or null for empty rows
*     column:     {string}  'situation' | 'state'
*     type:       {string}  'detail' | 'total'
*   }
*
* this.datalist is the flat list-of-values array produced by
* class.state.php::get_data_list(). Each element is one option available for
* the situation/state selector, enriched with `widget` and `key` fields:
*   {
*     widget:       {string}
*     key:          {number}
*     value:        { section_tipo, section_id, … }
*     label:        {string}  human-readable option label
*   }
*
* Live updates are received through event_manager events keyed as
* 'update_widget_value_{key}_{id}' — subscribed inside the render modules.
*
* Server peer:    core/widgets/state/class.state.php
* Edit renderer:  core/widgets/state/js/render_edit_state.js
* List renderer:  core/widgets/state/js/render_list_state.js
*/
export const state = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.status

	this.events_tokens = []

	return true
}//end state



/**
* COMMON FUNCTIONS
* Extend the state prototype with shared lifecycle and render methods from
* widget_common, render_edit_state, and render_list_state.
*
* Lifecycle methods are sourced from widget_common (which delegates further to
* core/common/js/common.js):
*   init    — populates instance properties from the caller-supplied options bag.
*   build   — optional async data-load hook; handles the component_info autoload path.
*   render  — mode-dispatch shim; calls this.edit() or this.list() based on this.mode.
*   destroy — iterates events_tokens and unsubscribes all event_manager listeners.
*
* Render methods are sourced from the specialised renderers:
*   edit    — builds the full table layout (render_edit_state.js); shows situation
*             and state columns with hover-reveal per-language detail rows.
*   list    — builds a compact icon-strip layout (render_list_state.js); clicking
*             an icon shows a floating tooltip with the per-language breakdown.
*/
// prototypes assign
	// lifecycle
	state.prototype.init	= widget_common.prototype.init
	state.prototype.build	= widget_common.prototype.build
	state.prototype.render	= widget_common.prototype.render
	state.prototype.destroy	= widget_common.prototype.destroy
	// render
	state.prototype.edit	= render_edit_state.prototype.edit
	state.prototype.list	= render_list_state.prototype.list




// @license-end
