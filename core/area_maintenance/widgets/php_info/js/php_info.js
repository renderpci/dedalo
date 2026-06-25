// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* PHP_INFO
* Area-maintenance widget that surfaces the server's `phpinfo()` output inside
* the Dédalo UI.
*
* The widget renders a single `<iframe>` whose `src` points to
* `php_info.php` — a thin PHP file (protected by `login::is_logged()`) that
* calls `phpinfo()` and then injects a small `<script>` to auto-resize the
* iframe to match the document height.  Loading the iframe is deliberately
* deferred: `build()` creates the `<iframe>` element without setting `src`,
* and `load()` sets `_open = true` and calls `activate()`, which assigns `src`
* only once (guarded by `_activated`).  This prevents the heavy phpinfo page
* from loading until the widget panel is actually opened.
*
* Lifecycle (inherited from widget_common / common):
*   init() → build() → render() → load() [triggered by panel open] → destroy()
*
* Server peer:  core/area_maintenance/widgets/php_info/php_info.php
* Render peer:  core/area_maintenance/widgets/php_info/js/render_php_info.js
* Base widget:  core/widgets/widget_common/js/widget_common.js
*
* Exported:
*   php_info — constructor (function, used via prototype assignment only)
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_php_info} from './render_php_info.js'



/**
* PHP_INFO
* Constructor for the php_info widget instance.
*
* Properties are intentionally left `undefined` on construction — they are
* populated by `widget_common.prototype.init()` when the widget is initialised
* from its server-supplied descriptor (section_tipo, section_id, lang, mode,
* value, …).  Only the two collection properties are pre-initialised to empty
* arrays so that push/splice operations in lifecycle helpers never fail.
*
* Key instance properties:
*   @property {string}        id             - Unique instance identifier (set by init).
*   @property {string}        section_tipo   - Ontology tipo of the host section.
*   @property {string|number} section_id     - Record id of the host section.
*   @property {string}        lang           - Active UI language code (e.g. 'lg-spa').
*   @property {string}        mode           - Render mode: 'edit' | 'list'.
*   @property {Object}        value          - Resolved widget value; contains `src`
*                                             (the URL to the php_info.php endpoint).
*   @property {HTMLElement}   node           - Root DOM node owned by this instance.
*   @property {Array}         events_tokens  - Subscription tokens held for cleanup by destroy().
*   @property {Array}         ar_instances   - Child widget/component instances (unused here).
*   @property {string}        status         - Lifecycle status string (set by init/build).
*/
export const php_info = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end php_info



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the shared widget/common lifecycle and the
* php_info-specific render methods onto the constructor.
*
* Lifecycle methods are delegated wholesale from widget_common (which itself
* delegates destroy/render to common):
*   init    — resolves the server descriptor into instance properties.
*   build   — makes the 'get_widget_data' API call and stores the response in
*             `this.value` (contains `src`, the phpinfo URL).
*   render  — dispatches to `this.edit()` or `this.list()` based on `this.mode`.
*   destroy — unsubscribes all event tokens and removes the DOM node.
*
* Both `edit` and `list` modes map to `render_php_info.prototype.list` because
* the phpinfo output is always read-only; there is no editable form.
*
* The `load` method is defined locally (not inherited) to implement the
* deferred-iframe pattern: area_maintenance calls `load()` when the panel is
* first opened, at which point `activate()` assigns the iframe's `src`.
*/
// prototypes assign
	// // lifecycle
	php_info.prototype.init		= widget_common.prototype.init
	php_info.prototype.build	= widget_common.prototype.build
	php_info.prototype.render	= widget_common.prototype.render
	php_info.prototype.destroy	= widget_common.prototype.destroy
	// // render
	php_info.prototype.edit		= render_php_info.prototype.list
	php_info.prototype.list		= render_php_info.prototype.list
	// // load (defer heavy iframe load until widget is opened)
	/**
	* LOAD
	* Called by area_maintenance when the widget panel is first opened.
	* Sets `_open = true` so that `activate()` (wired by render_php_info) knows
	* it is safe to assign `iframe.src`, then calls `activate()` if the render
	* has already run.  Guards against the race where `load()` fires before
	* `render()` has attached `activate` to the instance.
	*
	* @returns {Promise<boolean>} Resolves to `true` once the deferred load
	*   has been triggered (or skipped because render has not yet run).
	*/
	php_info.prototype.load = async function() {
		// Signal that the panel is now open so that activate() (set up in
		// get_content_data_edit) knows it is safe to assign iframe.src.
		this._open = true
		// activate() is created by render_php_info.prototype.list; guard against
		// the edge case where load() is called before render has run.
		if (typeof this.activate==='function') {
			this.activate()
		}
		return true
	}



// @license-end
