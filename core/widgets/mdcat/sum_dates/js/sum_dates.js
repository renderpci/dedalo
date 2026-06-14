// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_sum_dates} from '../js/render_sum_dates.js'



/**
* SUM_DATES
* Client-side constructor for the sum_dates widget (mdcat domain).
*
* sum_dates is a read-only, IPO-driven display widget that presents pre-computed
* date-interval summations delivered by the server (class.sum_dates.php).  It
* does not collect user input; its purpose is to render the total time spanned
* by a set of linked date-pair records (date_in / date_out components accessed
* through a portal).
*
* The server computes three output values for each IPO entry and sends them as
* a flat array via this.value:
*   - sum_intervals          {Object}  Total accumulated interval: {y, m, d, h, i, s}
*   - sum_estitmated_time_add {Object} Interval added for records whose date_in or
*                                      date_out was missing (estimated as "1 day").
*   - estitmated_time_undefined {boolean} true when at least one gap between records
*                                        could not be bounded — the renderer appends
*                                        an "indeterminat" notice in that case.
*
* Instance lifecycle (orchestrated by widget_common):
*   init()    — populates instance properties from the options bag passed by the
*               parent component or section renderer.
*   build()   — optional data-load hook (autoload path for component_info callers).
*   render()  — delegates to common.render(), which calls edit().
*   destroy() — tears down event subscriptions accumulated in events_tokens.
*
* this.ipo is the IPO configuration array from the ontology properties.  Each
* entry carries an 'input' sub-array (source portal + date_in/date_out component
* tipos) and an 'output' sub-array listing the three widget_id keys above.
*
* this.value holds the flat result array produced by class.sum_dates.php:
*   [ { widget, key, widget_id, value }, … ]
*   where 'key' is the IPO array index and 'widget_id' is one of the three
*   output-slot identifiers listed above.
*
* (!) Note: 'sum_estitmated_time_add' and 'estitmated_time_undefined' contain a
*     typo ("estitmated" instead of "estimated") that is intentional in the sense
*     that it is load-bearing — it matches the widget_id keys produced by the PHP
*     server and consumed by render_sum_dates.js.  Do not rename.
*
* Server peer: core/widgets/mdcat/sum_dates/class.sum_dates.php
* Renderer:    core/widgets/mdcat/sum_dates/js/render_sum_dates.js
*/
export const sum_dates = function(){

	this.id               // {string} unique widget instance id (set by widget_common.init)

	this.section_tipo     // {string} ontology tipo of the parent section
	this.section_id       // {string|number} record id of the parent section
	this.lang             // {string} active language code (e.g. 'lg-eng')
	this.mode             // {string} render mode: 'edit'

	// Flat data array delivered by class.sum_dates.php.
	// Each element: { widget: string, key: number, widget_id: string, value: * }
	// key    — index into this.ipo array
	// widget_id — one of 'sum_intervals' | 'sum_estitmated_time_add' | 'estitmated_time_undefined'
	// value  — Object ({y,m,d,h,i,s}), or boolean for estitmated_time_undefined
	this.value

	this.node             // {HTMLElement} mounted DOM node for this widget instance

	// Tokens returned by event_manager.subscribe() — stored here so that
	// destroy() can unsubscribe all live event listeners in one sweep.
	// (!) render_sum_dates.js leaves this empty intentionally; the commented-out
	// event_manager block in that file explains why (value lives in a different
	// section from the visible input components).
	this.events_tokens = []

	this.status           // {string} lifecycle state: 'initializing'|'initialized'|'building'|'built'

	return true
}//end sum_dates



/**
* COMMON FUNCTIONS
* Extend the sum_dates prototype with shared lifecycle and render methods
* from widget_common and render_sum_dates.
*
* All lifecycle methods (init, build, render, destroy) are sourced from
* widget_common, which in turn delegates to core/common/js/common.js.
* The single render method (edit) is sourced from render_sum_dates and covers
* both 'edit' and 'edit_in_list' modes.
*
* (!) Unlike sibling widgets (e.g. calculation, state), sum_dates does NOT
*     expose a 'list' prototype method.  If a 'list' render is ever requested
*     by the orchestrator, it will fall through to undefined and throw — a
*     'list' alias should be added when list-mode support is needed.
*/
// prototypes assign
	// lifecycle
	sum_dates.prototype.init	= widget_common.prototype.init
	sum_dates.prototype.build	= widget_common.prototype.build
	sum_dates.prototype.render	= widget_common.prototype.render
	sum_dates.prototype.destroy	= widget_common.prototype.destroy
	// render
	sum_dates.prototype.edit	= render_sum_dates.prototype.edit



// @license-end
