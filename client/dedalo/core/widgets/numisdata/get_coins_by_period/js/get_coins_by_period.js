// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* GET_COINS_BY_PERIOD
* Client-side constructor for the get_coins_by_period numisdata widget.
*
* This widget counts linked numismatic records (coins) grouped by chronological
* period, using a thesaurus hierarchy. The PHP peer (class.get_coins_by_period.php)
* walks a source portal, resolves the thesaurus hierarchy recursively, filters out
* duplicated coins (section_id === '2' in the duplicated marker component), and
* accumulates per-period coin counts. When `use_parent` is enabled in the IPO
* configuration, individual period terms are rolled up into their parent "Era"
* model terms (e.g. from "s.I to s.II" → "Roman"). Coins with no matching period
* term are collected in a catch-all "?" bucket appended at the end of the list.
* This constructor receives those aggregated results in this.value and delegates
* all DOM construction to render_get_coins_by_period.
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
*       "input": [
*         { "type": "source",     "section_tipo": "numisdata5", "component_tipo": "numisdata322" },
*         {
*           "type": "period",
*           "use_parent": true,
*           "section_tipo": "numisdata4",
*           "component_tipo": "numisdata1373",
*           "target_sections": ["dc1"],
*           "target_model_section_id": 1
*         },
*         { "type": "target_component_section_id", "section_tipo": "numisdata4", "component_tipo": "numisdata130" },
*         { "type": "duplicated", "section_tipo": "numisdata4", "component_tipo": "numisdata157" }
*       ],
*       "output": [
*         { "id": "period", "value": "string" }
*       ]
*     },
*     …
*   ]
*
* this.value is the flat result array returned by class.get_coins_by_period.php.
* Each element corresponds to one named output slot (currently only 'period').
* The 'value' property of each element is a keyed object (order → period entry):
*   [
*     {
*       "widget":    "get_coins_by_period",
*       "key":       0,
*       "widget_id": "period",
*       "value": {
*         "0": { "section_id": "42", "section_tipo": "dc1", "parent": {...}, "label": "Roman",  "count": 15 },
*         "1": { "section_id": "77", "section_tipo": "dc1", "parent": {...}, "label": "Greek",  "count": 8  },
*         "2": { "section_id": null, "section_tipo": null,  "parent": null,  "label": "?",      "count": 3  }
*       }
*     },
*     …  (repeated for each IPO entry, distinguished by 'key')
*   ]
* The "?" entry (section_id: null) is only present when at least one coin lacked
* a resolvable or matching period term.
* 'key' maps each flat item to its position in the ipo array.
* 'widget_id' identifies the output slot ("period" is the only defined slot).
*
* render_get_coins_by_period iterates this.ipo by index, filters this.value
* entries whose 'key' matches the current index, then iterates the 'value'
* object by order to build one <li> per period showing label and count.
*
* Only the 'edit' render mode is wired; list-mode rendering is not implemented
* (the widget is designed for use inside component_info in edit context).
*
* Server peer: core/widgets/numisdata/get_coins_by_period/class.get_coins_by_period.php
* Renderer:    core/widgets/numisdata/get_coins_by_period/js/render_get_coins_by_period.js
* Styles:      core/widgets/numisdata/get_coins_by_period/css/get_coins_by_period.less
*/
// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_get_coins_by_period} from '../js/render_get_coins_by_period.js'



/**
* GET_COINS_BY_PERIOD
* Constructor function for the get_coins_by_period widget instance.
* Property declarations without assignment are JavaScript instance-variable
* declarations that will be populated by widget_common.prototype.init.
* @returns {boolean} true
*/
export const get_coins_by_period = function(){

	// {string} Unique widget instance id; set by widget_common.init from options.id.
	this.id

	// {string} Ontology tipo of the parent section (e.g. 'numisdata5').
	this.section_tipo
	// {string|number} Record id of the parent section.
	this.section_id
	// {string} Active language code (e.g. 'lg-eng').
	this.lang
	// {string} Render mode; only 'edit' is wired to a prototype method here.
	this.mode

	// {Array} Flat result array from class.get_coins_by_period.php.
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
}//end get_coins_by_period



/**
* COMMON FUNCTIONS
* Extend the get_coins_by_period prototype with shared lifecycle and render
* methods from widget_common and render_get_coins_by_period.
*
* All lifecycle methods (init, build, render, destroy) are sourced from
* widget_common, which in turn delegates to core/common/js/common.js.
* The 'edit' render method is sourced from render_get_coins_by_period, which
* builds the DOM list of period labels paired with their coin counts.
*
* (!) Only 'edit' mode is wired — there is no 'list' prototype assignment.
* The widget is designed for use inside component_info in edit context only.
*/
// prototypes assign
	// lifecycle
	get_coins_by_period.prototype.init		= widget_common.prototype.init
	get_coins_by_period.prototype.build		= widget_common.prototype.build
	get_coins_by_period.prototype.render	= widget_common.prototype.render
	get_coins_by_period.prototype.destroy	= widget_common.prototype.destroy
	// render
	get_coins_by_period.prototype.edit		= render_get_coins_by_period.prototype.edit



// @license-end
