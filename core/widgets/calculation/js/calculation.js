// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../widget_common/js/widget_common.js'
	import {render_calculation} from '../js/render_calculation.js'



/**
* CALCULATION
* Client-side constructor for the calculation widget.
*
* The calculation widget is an IPO-driven (Input → Process → Output) display
* widget that presents pre-computed values delivered by class.calculation.php.
* It does not collect user input; its sole purpose is to render read-only
* aggregated or processed values alongside configurable labels.
*
* Instance lifecycle (orchestrated by widget_common):
*   init()    — populates instance properties from the options bag passed by
*               the parent component or section renderer.
*   build()   — optional data-load hook (autoload path for component_info callers).
*   render()  — delegates to common.render(), which calls edit() or list().
*   destroy() — tears down event subscriptions accumulated in events_tokens.
*
* The IPO array (this.ipo) is delivered by the server inside the widget's
* server data and describes the output structure:
*   [ { output: [ { id, format, label_before, label_after, separator }, … ] }, … ]
*
* this.value holds the flat data array returned by class.calculation.php:
*   [ { widget, key, id, value }, … ]
*   where key maps each item to its position in the ipo array and id
*   identifies which output slot the value fills.
*
* Live updates are received through event_manager events keyed as
* 'update_widget_value_{key}_{id}' — subscribed in render_calculation.js.
*
* Server peer: core/widgets/calculation/class.calculation.php
* Renderer:    core/widgets/calculation/js/render_calculation.js
*/
export const calculation = function(){

	this.id           // {string} unique widget instance id (set by widget_common.init)

	this.section_tipo // {string} ontology tipo of the parent section
	this.section_id   // {string|number} record id of the parent section
	this.lang         // {string} active language code (e.g. 'lg-eng')
	this.mode         // {string} render mode: 'edit' | 'list'

	// this.value holds the flat result array produced by class.calculation.php.
	// Each element corresponds to one output slot: { widget, key, id, value }.
	// 'key' is the IPO array index; 'id' is the output slot identifier.
	this.value

	this.node         // {HTMLElement} mounted DOM node for this widget instance

	// Tokens returned by event_manager.subscribe() — stored here so that
	// destroy() can unsubscribe all live event listeners in one sweep.
	this.events_tokens = []

	this.status       // {string} lifecycle state: 'initializing' | 'initialized' | 'building' | 'built'

	return true
}//end calculation



/**
* COMMON FUNCTIONS
* Extend the calculation prototype with shared lifecycle and render methods
* from widget_common and render_calculation.
*
* All lifecycle methods (init, build, render, destroy) are sourced from
* widget_common, which in turn delegates to core/common/js/common.js.
* The render methods (edit, list) are sourced from render_calculation, which
* builds the DOM output for both edit and list modes.
*
* (!) list is aliased to edit — render_calculation.prototype.list is itself
* an alias of render_calculation.prototype.edit, so both modes share the
* same DOM-building path.
*/
// prototypes assign
	// lifecycle
	calculation.prototype.init		= widget_common.prototype.init
	calculation.prototype.build		= widget_common.prototype.build
	calculation.prototype.render	= widget_common.prototype.render
	calculation.prototype.destroy	= widget_common.prototype.destroy
	// render
	calculation.prototype.edit		= render_calculation.prototype.edit
	calculation.prototype.list		= render_calculation.prototype.list



// @license-end
