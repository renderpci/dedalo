// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_get_archive_states} from '../js/render_get_archive_states.js'



/**
* GET_ARCHIVE_STATES
* Client-side constructor for the get_archive_states DMM widget.
*
* This widget is an IPO-driven (Input → Process → Output) read-only display
* that presents pre-aggregated boolean-state statistics for linked archive
* records. The PHP peer (class.get_archive_states.php) iterates a source
* portal to collect "answer" and "closed" radio-button values from each
* linked record, then counts affirmative/negative responses and computes
* percentages relative to the total. This constructor receives those results
* in this.value and delegates DOM construction to render_get_archive_states.
*
* Instance lifecycle (orchestrated by widget_common):
*   init()    — populates instance properties from the options bag passed by
*               the parent component or section renderer.
*   build()   — optional data-load hook (autoload path for component_info callers).
*   render()  — delegates to common.render(), which calls edit().
*   destroy() — tears down event subscriptions accumulated in events_tokens.
*
* this.ipo (set by widget_common.init from options.ipo) is the IPO array
* delivered by the server describing the output structure:
*   [ { input: [ { type, section_tipo, component_tipo }, … ],
*       output: [ { id }, … ] }, … ]
*
* this.value is the flat data array returned by class.get_archive_states.php:
*   [
*     { widget: 'get_archive_states', key: 0, widget_id: 'closed_afirmative',
*       closed_label: string, answer_label: string, value: number|null },
*     { widget: 'get_archive_states', key: 0, widget_id: 'closed_afirmative_percent',
*       value: number|null },
*     … (14 items total per IPO entry)
*   ]
* 'key' maps each flat item to its position in the ipo array.
* 'widget_id' identifies which output slot the item represents.
* Human-readable labels (closed_label, answer_label) are only present on the
* 'closed_afirmative' item for each key group.
*
* Only the 'edit' render mode is wired; list-mode rendering is not implemented
* in this widget (the widget is consumed inside component_info edit contexts).
*
* Server peer: core/widgets/dmm/get_archive_states/class.get_archive_states.php
* Renderer:    core/widgets/dmm/get_archive_states/js/render_get_archive_states.js
*/
export const get_archive_states = function(){

	this.id           // {string} unique widget instance id (set by widget_common.init)

	this.section_tipo // {string} ontology tipo of the parent section
	this.section_id   // {string|number} record id of the parent section
	this.lang         // {string} active language code (e.g. 'lg-eng')
	this.mode         // {string} render mode: 'edit' (only mode implemented here)

	// this.value holds the flat result array produced by class.get_archive_states.php.
	// Each element corresponds to one output slot:
	//   { widget, key, widget_id, value [, closed_label, answer_label] }
	// 'key' is the IPO array index; 'widget_id' is the output slot identifier.
	// Labels appear only on the 'closed_afirmative' item for each key group.
	this.value

	this.node         // {HTMLElement} mounted DOM node for this widget instance

	// Tokens returned by event_manager.subscribe() — stored here so that
	// destroy() can unsubscribe all live event listeners in one sweep.
	// (!) The event-driven live-update path is commented out in the renderer;
	// events_tokens is kept for structural consistency with other widgets.
	this.events_tokens = []

	this.status       // {string} lifecycle state: 'initializing' | 'initialized' | 'building' | 'built'

	return true
}//end get_archive_states



/**
* COMMON FUNCTIONS
* Extend the get_archive_states prototype with shared lifecycle and render
* methods from widget_common and render_get_archive_states.
*
* All lifecycle methods (init, build, render, destroy) are sourced from
* widget_common, which in turn delegates to core/common/js/common.js.
* The 'edit' render method is sourced from render_get_archive_states, which
* builds the DOM list of per-key state summary rows.
*
* (!) Unlike most widgets, only 'edit' mode is wired — there is no 'list'
* prototype assignment. The widget is designed for use inside component_info
* in edit context only.
*/
// prototypes assign
	// lifecycle
	get_archive_states.prototype.init		= widget_common.prototype.init
	get_archive_states.prototype.build		= widget_common.prototype.build
	get_archive_states.prototype.render		= widget_common.prototype.render
	get_archive_states.prototype.destroy	= widget_common.prototype.destroy
	// render
	get_archive_states.prototype.edit		= render_get_archive_states.prototype.edit



// @license-end
