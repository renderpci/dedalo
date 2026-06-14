// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_media_icons} from '../js/render_media_icons.js'



/**
* MEDIA_ICONS
* Widget that renders a row of quick-action icons for each audiovisual (AV) record
* linked to a parent OH (Oral History) section.
*
* Each linked AV record is presented as a list item (`<li class="widget_item media_icons">`)
* containing four icon/label columns:
*  - ID link    : the numeric section_id, clickable to open the record in a new viewer window.
*  - AV icon    : opens the AV component in its native viewer (view='viewer').
*  - TR (transcription) : opens the transcription tool via open_tool() when tool_context is present.
*  - IN (indexation)    : opens the indexation tool via open_tool() when tool_context is present.
*  - TL (translation)   : opens the translation tool via open_tool() when tool_context is present.
*  - TC (time code)     : displays a read-only time-code value.
*
* Data shape expected in `this.value` (array):
*   [{ id: { id, key, value, widget, locator: { type, section_id, section_tipo, from_component_tipo } },
*      transcription: { tool_context? },
*      indexation:    { tool_context? },
*      translation:   { tool_context? },
*      tc:            { value? }
*   }, ...]
*
* The IPO array (`this.ipo`) provides per-column widget path information; each entry's
* `input.paths[0][0]` carries the { component_tipo, section_tipo } needed to build
* the AV viewer URL.
*
* Lifecycle and shared helpers (init, build, destroy, render) come from widget_common,
* which delegates most logic to common.prototype.  Render methods for both 'edit' and
* 'list' modes are supplied by render_media_icons (both modes share the same layout).
*
* The constructor only declares instance properties; all methods are prototype-assigned below.
*/
export const media_icons = function(){

	/** @type {string} Unique instance identifier assigned by widget_common.init(). */
	this.id

	/** @type {string} Ontology tipo of the parent section (e.g. 'rsc167'). */
	this.section_tipo
	/** @type {string|number} Record identifier of the parent section. */
	this.section_id
	/** @type {string} Active language code (e.g. 'lg-spa'). */
	this.lang
	/**
	* Current display mode — one of 'edit', 'list', 'edit_in_list', 'list_in_list'.
	* Both 'edit' and 'list' resolve to the same render_media_icons layout.
	* @type {string}
	*/
	this.mode

	/**
	* AV record data array delivered by the server.  Each element describes one linked
	* AV record; see the module header for the full expected shape.
	* @type {Array}
	*/
	this.value

	/** @type {HTMLElement} Root DOM node rendered by this widget instance. */
	this.node

	/**
	* Registered event tokens for cleanup on destroy.
	* Each entry is a token returned by event_manager on subscription.
	* widget_common.destroy() iterates this array to unsubscribe all listeners.
	* @type {Array}
	*/
	this.events_tokens	= []

	/**
	* Child widget/component instances created during render (e.g. sub-widgets,
	* autocomplete helpers).  Populated and consumed by widget_common.
	* @type {Array}
	*/
	this.ar_instances	= []

	/**
	* Lifecycle status string.  Progresses through: undefined → 'initializing' →
	* 'initialized' → 'building' → 'built'.  Used by the framework to guard against
	* double-init and to track readiness before render.
	* @type {string|undefined}
	*/
	this.status

	return true
}//end media_icons



/**
* COMMON FUNCTIONS
* Extend the media_icons prototype with shared lifecycle and render methods.
* Lifecycle methods (init, build, render, destroy) are inherited from widget_common,
* which in turn delegates most logic to common.prototype.
* Both 'edit' and 'list' render methods are provided by render_media_icons; they
* share identical markup — the distinction matters only for the wrapper element that
* widget_common wires around the content.
*/
// prototypes assign
	// lifecycle
	media_icons.prototype.init		= widget_common.prototype.init
	media_icons.prototype.build		= widget_common.prototype.build
	media_icons.prototype.render	= widget_common.prototype.render
	media_icons.prototype.destroy	= widget_common.prototype.destroy
	// render
	media_icons.prototype.edit		= render_media_icons.prototype.edit
	media_icons.prototype.list		= render_media_icons.prototype.list



// @license-end
