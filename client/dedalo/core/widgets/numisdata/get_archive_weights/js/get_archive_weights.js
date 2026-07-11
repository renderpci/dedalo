// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* GET_ARCHIVE_WEIGHTS
* Client-side constructor for the get_archive_weights numisdata widget.
*
* This widget is an IPO-driven (Input → Process → Output) read-only display that
* presents pre-aggregated weight and diameter statistics for linked numismatic
* records (e.g. coins). The PHP peer (class.get_archive_weights.php) walks a
* source portal, filters out "unused" and "duplicated" coin records, computes
* per-record averages (mean of all stored values), and then derives the
* cross-record mean, maximum, minimum, and count for both weight and diameter.
* This constructor receives those results in this.value and delegates all DOM
* construction to render_get_archive_weights.
*
* Instance lifecycle (orchestrated by widget_common):
*   init()    — populates instance properties from the options bag supplied by
*               the parent component or section renderer.
*   build()   — optional data-load hook; for component_info callers it fires a
*               'get_widget_data' API request and stores the result in this.value.
*   render()  — delegates to common.render(), which dispatches to edit().
*   destroy() — unsubscribes all event listeners accumulated in events_tokens.
*
* this.ipo (set by widget_common.init from options.ipo) is the IPO array
* delivered by the server that describes the widget's input/output structure:
*   [
*     {
*       input:  [ { type: 'source'|'used'|'duplicated'|'data_weights'|'data_diamenter',
*                   section_tipo: string, component_tipo: string }, … ],
*       output: [ { id: string }, … ]
*     },
*     …
*   ]
* Note: the 'data_diamenter' type key is a misspelling carried over from the
* ontology configuration and the PHP peer; callers must use this exact spelling.
*
* this.value is the flat result array returned by class.get_archive_weights.php.
* Each element corresponds to one named output slot:
*   [
*     { widget: 'get_archive_weights', key: 0, widget_id: 'media_weight',            value: number|null },
*     { widget: 'get_archive_weights', key: 0, widget_id: 'max_weight',              value: number|null },
*     { widget: 'get_archive_weights', key: 0, widget_id: 'min_weight',              value: number|null },
*     { widget: 'get_archive_weights', key: 0, widget_id: 'total_elements_weights',  value: number|null },
*     { widget: 'get_archive_weights', key: 0, widget_id: 'media_diameter',          value: number|null },
*     { widget: 'get_archive_weights', key: 0, widget_id: 'max_diameter',            value: number|null },
*     { widget: 'get_archive_weights', key: 0, widget_id: 'min_diameter',            value: number|null },
*     { widget: 'get_archive_weights', key: 0, widget_id: 'total_elements_diameter', value: number|null },
*     … (repeated for each IPO entry, distinguished by 'key')
*   ]
* 'key' maps each flat item to its position in the ipo array.
* 'widget_id' identifies the output slot. Values are null when no qualifying
* records exist for that measurement group (empty weights or diameter arrays
* on the PHP side).
*
* Live updates: render_get_archive_weights subscribes each IPO slot to the
* 'update_widget_value_<key>_<id>' event channel (event_manager).  When the
* source component's data changes the parent can broadcast on that channel with
* a new array of { widget_id, value } items so the DOM is refreshed without a
* full re-render.  Subscriptions are tracked in events_tokens for cleanup.
*
* Only the 'edit' render mode is wired; list-mode rendering is not implemented
* (the widget is intended for use inside component_info in edit context).
*
* Server peer: core/widgets/numisdata/get_archive_weights/class.get_archive_weights.php
* Renderer:    core/widgets/numisdata/get_archive_weights/js/render_get_archive_weights.js
* Styles:      core/widgets/numisdata/get_archive_weights/css/get_archive_weights.less
*/
// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_get_archive_weights} from '../js/render_get_archive_weights.js'



export const get_archive_weights = function(){

	// {string} Unique widget instance id; set by widget_common.init from options.id.
	this.id

	// {string} Ontology tipo of the parent section (e.g. 'numis1').
	this.section_tipo
	// {string|number} Record id of the parent section.
	this.section_id
	// {string} Active language code (e.g. 'lg-eng').
	this.lang
	// {string} Render mode; only 'edit' is wired to a prototype method here.
	this.mode

	// {Array} Flat result array from class.get_archive_weights.php.
	// Each element: { widget, key, widget_id, value }.
	// See module header for the full shape description.
	this.value

	// {HTMLElement} Mounted DOM node for this widget instance.
	this.node

	// {Array} Tokens returned by event_manager.subscribe(); stored here so that
	// destroy() can unsubscribe all live listeners in one sweep.
	this.events_tokens = []

	// {string} Lifecycle state: 'initializing' | 'initialized' | 'building' | 'built'.
	this.status

	return true
}//end get_archive_weights



/**
* COMMON FUNCTIONS
* Extend the get_archive_weights prototype with shared lifecycle and render
* methods from widget_common and render_get_archive_weights.
*
* All lifecycle methods (init, build, render, destroy) are sourced from
* widget_common, which in turn delegates to core/common/js/common.js.
* The 'edit' render method is sourced from render_get_archive_weights, which
* builds the DOM list of per-IPO-key weight and diameter summary rows.
*
* (!) Only 'edit' mode is wired — there is no 'list' prototype assignment.
* The widget is designed for use inside component_info in edit context only.
*/
// prototypes assign
	// lifecycle
	get_archive_weights.prototype.init		= widget_common.prototype.init
	get_archive_weights.prototype.build		= widget_common.prototype.build
	get_archive_weights.prototype.render	= widget_common.prototype.render
	get_archive_weights.prototype.destroy	= widget_common.prototype.destroy
	// render
	get_archive_weights.prototype.edit		= render_get_archive_weights.prototype.edit



// @license-end
