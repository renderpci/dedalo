// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_tags} from '../js/render_tags.js'



/**
* TAGS
* Widget that renders a statistical summary of tagging activity for each
* item (IPO entry) in an Oral History (OH) section record.
*
* For every IPO entry the widget builds a `<li class="widget_item tags">` row
* containing labelled counters supplied by the server:
*  - TC              : total time-code count
*  - INDEX           : total indexed segments
*  - Deleted tags    : tags no longer present in the source (get_label.deleted_tags)
*  - To review       : tags flagged for editorial review (get_label.label_to_review)
*  - Work NOTES      : private (internal) notes count
*  - Public NOTES    : public notes count
*  - CHARS           : total character count
*  - NO SPACES       : character count excluding spaces
*  - CHARS REAL      : real character count (implementation-defined metric)
*
* The counters are reactive: each row subscribes to the event
* `update_widget_value_<ipo_index>_<widget_id>` via event_manager so that live
* updates emitted by other UI components (e.g. a TC editor) refresh the display
* without a full re-render.
*
* Data shape expected in `this.value` (Array):
*   [{ key: {number}, widget_id: {string}, value: {string|number} }, ...]
* where `key` identifies the IPO slot and `widget_id` is one of the counter
* identifiers above (e.g. 'total_tc', 'total_index', ...).
*
* `this.ipo` drives the per-row iteration; each IPO entry at index `i` corresponds
* to the set of `this.value` entries with `item.key === i`.
*
* Lifecycle and shared helpers (init, build, destroy, render) are inherited from
* widget_common, which in turn delegates most logic to common.prototype.
* Both 'edit' and 'list' modes use the same render_tags.prototype.edit layout.
*
* The constructor only declares instance properties; all methods are prototype-assigned below.
*/
export const tags = function(){

	/** @type {string} Unique instance identifier assigned by widget_common.init(). */
	this.id

	/** @type {string} Ontology tipo of the parent section (e.g. 'oh1'). */
	this.section_tipo
	/** @type {string|number} Record identifier of the parent section. */
	this.section_id
	/** @type {string} Active language code (e.g. 'lg-spa'). */
	this.lang
	/**
	* Current display mode — one of 'edit', 'list', 'edit_in_list', 'list_in_list'.
	* Both 'edit' and 'list' resolve to the same render_tags.prototype.edit layout.
	* @type {string}
	*/
	this.mode

	/**
	* Tag-statistics array delivered by the server.  Each element describes one
	* counter for a specific IPO slot; see the module header for the full shape.
	* @type {Array}
	*/
	this.value

	/** @type {HTMLElement} Root DOM node rendered by this widget instance. */
	this.node

	/**
	* Lifecycle status string.  Progresses through: undefined → 'initializing' →
	* 'initialized' → 'building' → 'built'.  Used by the framework to guard against
	* double-init and to track readiness before render.
	* @type {string|undefined}
	*/
	this.status

	/**
	* Registered event tokens for cleanup on destroy.
	* Each entry is a token returned by event_manager.subscribe(); the tokens are
	* collected here so that widget_common.destroy() can unsubscribe all listeners
	* in a single pass, preventing stale handler leaks after the widget is removed.
	* @type {Array}
	*/
	this.events_tokens = []

	return true
}//end tags



/**
* COMMON FUNCTIONS
* Extend the tags prototype with shared lifecycle and render methods.
* Lifecycle methods (init, build, render, destroy) are inherited from widget_common,
* which in turn delegates most logic to common.prototype.
* Both 'edit' and 'list' modes share render_tags.prototype.edit — the only difference
* between the two modes is the outer wrapper element wired by widget_common, not the
* content layout produced by render_tags.
*/
// prototypes assign
	// lifecycle
	tags.prototype.init		= widget_common.prototype.init
	tags.prototype.build	= widget_common.prototype.build
	tags.prototype.destroy	= widget_common.prototype.destroy
	tags.prototype.render	= widget_common.prototype.render
	// render
	tags.prototype.edit		= render_tags.prototype.edit
	// (!) 'list' intentionally reuses the 'edit' render — no separate list layout exists.
	tags.prototype.list		= render_tags.prototype.edit



// @license-end
