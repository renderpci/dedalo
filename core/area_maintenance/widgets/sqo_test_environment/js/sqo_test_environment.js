// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_sqo_test_environment} from './render_sqo_test_environment.js'



/**
* SQO_TEST_ENVIRONMENT
* Maintenance-area widget that lets administrators interactively compose and submit
* a Search Query Object (SQO) and inspect the resulting SQL that the Dédalo search
* pipeline would execute.
*
* Purpose
* -------
* Provides a sandboxed JSON editor (via the `vanilla-jsoneditor` `createJSONEditor`
* wrapper) pre-populated with a sample SQO, allowing developers and system
* administrators to:
*   1. Write or paste a full SQO JSON structure.
*   2. Submit it to the server-side `dd_utils_api::convert_search_object_to_sql_query`
*      action (requires global-admin privileges server-side).
*   3. View the resolved SQL, unresolved SQL template, matching section IDs, and raw
*      row data returned by the PostgreSQL query — all rendered in a structured
*      response block by `print_response()`.
*
* Lifecycle
* ---------
* This widget follows the standard Dédalo maintenance-widget lifecycle orchestrated
* by `render_area_maintenance.render_widget()`:
*
*   init()   — Seeds instance properties from the descriptor passed by the dashboard
*              (delegates to widget_common.prototype.init).
*   build()  — Resolves the widget's computed value from the server when autoload is
*              true (delegates to widget_common.prototype.build; this widget does not
*              preload server data so autoload is typically false).
*   render() — Dispatches to `this.edit()` or `this.list()` based on `this.mode`
*              (delegates to common.prototype.render via widget_common).
*   load()   — Custom override (defined below on the prototype). Marks the instance
*              as open and triggers `this.activate()`, which builds the JSON editor
*              lazily only when the accordion card is first expanded.
*   destroy()— Unsubscribes event tokens and tears down the DOM node (delegates to
*              common.prototype.destroy via widget_common).
*
* Lazy editor construction
* ------------------------
* The JSON editor (a heavy dependency) is NOT built at render time. Instead:
*   - `render_sqo_test_environment.list` exposes `self.activate` as a function that,
*     when called, creates the editor and mounts it into the pre-built container.
*   - `load()` on this prototype sets `this._open = true` and immediately calls
*     `this.activate()` if it has already been assigned by the render step.
*   - If the render step has not yet run when the card is opened, `_open` is checked
*     inside `get_content_data_edit` and `load_editor` is called synchronously
*     at the end of the spinner callback.
* This decoupling ensures the editor never blocks the initial dashboard paint.
*
* Server API
* ----------
* Action: `convert_search_object_to_sql_query`
* Handler: `dd_utils_api` (core/api/v1/common/class.dd_utils_api.php)
* Route:   POST → data_manager.request({ body: rqo })
*
* SQO sample (pre-populated in the editor and persisted to localStorage):
*   {"section_tipo":["rsc170"],"limit":5,"offset":0}
*
* API response shape (on success):
*   {
*     result          : true,
*     msg             : {string}  resolved SQL (placeholders substituted),
*     sql             : {string}  unresolved SQL template,
*     ar_section_id   : {Array}   deduplicated section IDs returned,
*     db_data         : {Array}   raw row objects from the PostgreSQL result
*   }
*
* Persistence
* -----------
* The SQO text is persisted in `localStorage` under the key `'json_editor_sqo'`
* so that the last-edited query survives page refreshes.
*
* Server peer: core/area_maintenance/widgets/sqo_test_environment/class.sqo_test_environment.php
* Render module: render_sqo_test_environment.js
* API handler:   core/api/v1/common/class.dd_utils_api.php
*/
export const sqo_test_environment = function() {

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
}//end sqo_test_environment



/**
* COMMON FUNCTIONS
* Extends sqo_test_environment with the standard maintenance-widget lifecycle and
* render methods from widget_common and render_sqo_test_environment.
*
* Lifecycle methods (from widget_common):
*   init    — Seeds instance properties from the descriptor options bag.
*   build   — Resolves server value when autoload is true (no-op for this widget).
*   render  — Dispatches to edit() or list() based on this.mode.
*   destroy — Unsubscribes events and removes the DOM node.
*
* Render methods (from render_sqo_test_environment):
*   edit / list — Both map to render_sqo_test_environment.prototype.list, which
*                 builds the JSON editor container and response display. The widget
*                 exposes the same layout in edit and list modes because it has no
*                 editable record data — it is purely a developer tool.
*/
// prototypes assign
	// // lifecycle
	sqo_test_environment.prototype.init		= widget_common.prototype.init
	sqo_test_environment.prototype.build	= widget_common.prototype.build
	sqo_test_environment.prototype.render	= widget_common.prototype.render
	sqo_test_environment.prototype.destroy	= widget_common.prototype.destroy
	// // render
	sqo_test_environment.prototype.edit		= render_sqo_test_environment.prototype.list
	sqo_test_environment.prototype.list		= render_sqo_test_environment.prototype.list
	// // load (defer heavy JSON editor build until widget is opened)
	sqo_test_environment.prototype.load = async function() {
		this._open = true
		if (typeof this.activate==='function') {
			this.activate()
		}
		return true
	}



// @license-end
