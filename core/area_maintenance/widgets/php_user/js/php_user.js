// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* PHP_USER
* Area-maintenance widget that displays information about the OS user under
* which the PHP process is running — identity details, the PHP error-log path,
* and the PHP session-save path.
*
* The server-side counterpart (`class.area_maintenance.php`) builds the widget
* descriptor inline (no separate widget class file).  It calls:
*   - `system::get_php_user_info()`  → `value.info`  (posix user record object,
*                                       or a minimal {name, current_user} fallback)
*   - `system::get_error_log_path()` → `value.php_error_log_path`
*   - `session_save_path()`          → `value.php_session_path`
*
* The resolved `value` object therefore has the shape:
*   {
*     info             : {name, uid, gid, gecos, dir, shell, ...},  // posix or fallback
*     php_error_log_path : string,
*     php_session_path   : string
*   }
*
* Rendering is entirely read-only; both `edit` and `list` modes delegate to
* `render_php_user.prototype.list`, which builds a lightweight DOM fragment
* (a heading div + a pretty-printed <pre> for the posix object, plus two
* labelled <pre> blocks for the paths).
*
* Lifecycle (fully inherited from widget_common / common):
*   init() → build() → render() → destroy()
*
* Server peer:  core/area_maintenance/class.area_maintenance.php (php_user block)
* Render peer:  core/area_maintenance/widgets/php_user/js/render_php_user.js
* Base widget:  core/widgets/widget_common/js/widget_common.js
*
* Exported:
*   php_user — constructor (function, used via prototype assignment only)
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_php_user} from './render_php_user.js'



/**
* PHP_USER
* Constructor for the php_user widget instance.
*
* Instance properties are left `undefined` on construction; they are populated
* by `widget_common.prototype.init()` when the widget descriptor received from
* the server is applied.  Only the two collection properties are pre-initialised
* to empty arrays so that push/splice calls in lifecycle helpers never throw.
*
* Key instance properties:
*   @property {string}        id             - Unique instance identifier (set by init).
*   @property {string}        section_tipo   - Ontology tipo of the host section.
*   @property {string|number} section_id     - Record id of the host section.
*   @property {string}        lang           - Active UI language code (e.g. 'lg-spa').
*   @property {string}        mode           - Render mode: 'edit' | 'list'.
*   @property {Object}        value          - Widget data supplied by the server.
*                                             Shape: { info: Object,
*                                                      php_error_log_path: string,
*                                                      php_session_path: string }.
*   @property {HTMLElement}   node           - Root DOM node owned by this instance.
*   @property {Array}         events_tokens  - Subscription tokens held for cleanup by destroy().
*   @property {Array}         ar_instances   - Child widget/component instances (unused here).
*   @property {string}        status         - Lifecycle status string (set by init/build).
*/
export const php_user = function() {

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
}//end php_user



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the shared widget/common lifecycle and the
* php_user-specific render methods onto the constructor.
*
* Lifecycle methods are delegated wholesale from widget_common (which itself
* delegates destroy/render to common):
*   init    — resolves the server descriptor into instance properties.
*   build   — makes the 'get_widget_data' API call and stores the response in
*             `this.value` (contains info, php_error_log_path, php_session_path).
*   render  — dispatches to `this.edit()` or `this.list()` based on `this.mode`.
*   destroy — unsubscribes all event tokens and removes the DOM node.
*
* Both `edit` and `list` modes map to `render_php_user.prototype.list` because
* the PHP user information is always read-only; there is no editable form.
*/
// prototypes assign
	// // lifecycle
	php_user.prototype.init		= widget_common.prototype.init
	php_user.prototype.build	= widget_common.prototype.build
	php_user.prototype.render	= widget_common.prototype.render
	php_user.prototype.destroy	= widget_common.prototype.destroy
	// // render
	php_user.prototype.edit		= render_php_user.prototype.list
	php_user.prototype.list		= render_php_user.prototype.list



// @license-end
