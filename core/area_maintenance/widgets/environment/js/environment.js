// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_environment} from './render_environment.js'



/**
* ENVIRONMENT
* Maintenance widget that exposes the active Dédalo runtime environment to
* administrators from within the area_maintenance panel.
*
* Responsibilities:
*   - Display a button that opens the PHP-generated environment bootstrap file
*     (`core/common/js/environment.js.php`) in a new browser tab, giving
*     administrators a live view of the resolved server-side constants and
*     configuration values that are published to the browser at page load.
*   - Render a pretty-printed dump of the current `window.page_globals` object
*     so that runtime auth state, entity identifiers, API URLs, and ontology
*     settings can be inspected without opening DevTools.
*
* This widget has no server-side peer class (unlike most area_maintenance
* widgets) because all the data it presents is already available in the browser
* at render time — `page_globals` is a global injected by environment.js.php
* and requires no additional API request.
*
* Lifecycle (inherited entirely from widget_common):
*   init() → build() → render() → destroy()
*
* Render modes:
*   Both `edit` and `list` are aliased to render_environment.prototype.list,
*   which builds the same read-only inspection panel regardless of mode.
*
* Server peer: none (data is the already-present page_globals global)
* Render peer: render_environment.js (render_environment.prototype.list)
*
* Instance properties
* @property {string}   id           - Unique widget instance identifier
* @property {string}   section_tipo - Ontology tipo of the parent section
* @property {string|number} section_id - Record identifier within the section
* @property {string}   lang         - Active language tag (e.g. 'lg-eng')
* @property {string}   mode         - Render mode: 'edit' | 'list'
* @property {*}        value        - Widget data payload (unused here; data is
*                                     read directly from page_globals at render time)
* @property {HTMLElement} node      - Root DOM node assigned after render
* @property {Array}    events_tokens - Event subscription tokens; cleared on destroy
* @property {Array}    ar_instances  - Child widget instances (unused here, kept for
*                                      interface parity with other widgets)
* @property {string}   status       - Lifecycle status string ('initializing' |
*                                     'initialized' | 'building' | 'built')
*/
export const environment = function() {

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
}//end environment



/**
* COMMON FUNCTIONS
* Delegate all lifecycle and render methods to the shared widget_common base
* and to render_environment.
*
* Because the environment widget has no custom data-loading logic (page_globals
* is already in the browser), the standard widget_common lifecycle methods are
* used without override:
*
*   init    — seeds all instance properties from the options bag; guards against
*             duplicate initialisation.
*   build   — transitions status to 'built'; autoload is irrelevant here (no
*             API call needed) and will be invoked with autoload=false by the
*             area_maintenance host.
*   render  — dispatches to this.edit() or this.list() based on this.mode.
*   destroy — unsubscribes all events_tokens and marks the instance as destroyed.
*
* Both render aliases (edit, list) point to render_environment.prototype.list,
* which produces the same read-only inspection panel for all render modes.
*/
// prototypes assign
	// // lifecycle
	environment.prototype.init		= widget_common.prototype.init
	environment.prototype.build		= widget_common.prototype.build
	environment.prototype.render	= widget_common.prototype.render
	environment.prototype.destroy	= widget_common.prototype.destroy
	// // render
	environment.prototype.edit		= render_environment.prototype.list
	environment.prototype.list		= render_environment.prototype.list



// @license-end
