// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_edit_descriptors} from './render_edit_descriptors.js'
	import {render_list_descriptors} from './render_list_descriptors.js'


/**
* DESCRIPTORS
* Widget that renders an OH (Oral History) descriptor summary for a section record.
*
* A "descriptor" in this context is an indexation entry linking a thesaurus term
* to a time-segment of an audiovisual record.  This widget aggregates those
* entries and displays them in two modes:
*  - edit  : shows all descriptor groups rendered through a dd_grid sub-instance,
*             allowing the user to expand or review term lists.
*  - list  : shows a compact count-badge per group with a toggle to reveal the
*             full term grid on demand.
*
* The widget wires together data supplied by the server (via `options.value` and
* `options.ipo`) with two render modules:
*  - render_edit_descriptors  (edit/edit_in_list mode)
*  - render_list_descriptors  (list/list_in_list mode)
*
* Lifecycle and shared helpers (init, build, destroy, render, refresh) come from
* widget_common, which in turn delegates to common.  The constructor only declares
* instance properties; all methods are assigned to the prototype below.
*/
export const descriptors = function(){

	/** @type {string} Unique instance identifier assigned during init. */
	this.id

	/** @type {string} Ontology tipo of the parent section (e.g. 'dd123'). */
	this.section_tipo
	/** @type {string|number} Record identifier of the parent section. */
	this.section_id
	/** @type {string} Active language code (e.g. 'lg-spa'). */
	this.lang
	/**
	* Current display mode — one of 'edit', 'list', 'edit_in_list', 'list_in_list'.
	* Switched at runtime by the toggle buttons in each render module to alternate
	* between the compact list view and the expanded edit view.
	* @type {string}
	*/
	this.mode

	/**
	* Descriptor data as delivered by the server.  Expected shape is an array of
	* objects, each with a `value` sub-object carrying:
	*  - `key`       {number}  - positional index matching an entry in `ipo`
	*  - `widget_id` {string}  - either 'indexation' (count) or 'terms' (grid data)
	*  - `value`     {*}       - the payload for that widget_id
	* @type {Array}
	*/
	this.value

	/** @type {HTMLElement} Root DOM node rendered by this widget instance. */
	this.node

	/**
	* Registered event tokens for cleanup on destroy.
	* Each entry is a token returned by event_manager when subscribing to an event.
	* widget_common.destroy() iterates this array to unsubscribe all listeners.
	* @type {Array}
	*/
	this.events_tokens = []

	/**
	* Lifecycle status string.  Progresses through: undefined → 'initializing' →
	* 'initialized' → 'building' → 'built'.  Used by the framework to guard
	* against double-init and to track readiness.
	* @type {string|undefined}
	*/
	this.status

	return true
}//end descriptors



/**
* COMMON FUNCTIONS
* Extend the descriptors prototype with shared lifecycle and render methods.
* Lifecycle methods (init, build, destroy, render, refresh) are inherited from
* widget_common, which delegates most logic to common.prototype.
* Render methods are provided by the two dedicated render modules so that edit
* and list concerns are kept in separate files.
*/
// prototypes assign
	// lifecycle
	descriptors.prototype.init		= widget_common.prototype.init
	descriptors.prototype.build		= widget_common.prototype.build
	descriptors.prototype.destroy	= widget_common.prototype.destroy
	descriptors.prototype.render	= widget_common.prototype.render
	descriptors.prototype.refresh	= widget_common.prototype.refresh
	// render
	descriptors.prototype.edit		= render_edit_descriptors.prototype.edit
	descriptors.prototype.list		= render_list_descriptors.prototype.list




// @license-end
