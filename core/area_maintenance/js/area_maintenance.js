// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, JSONEditor, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



/**
* AREA_MAINTENANCE
* Controller class for the system-administrator maintenance area.
*
* This area aggregates a dashboard of "widgets" — self-contained tool panels
* (backup, migration, config, integrity checks, diffusion, developer tools, etc.)
* that a superuser can open and run without leaving the Dédalo UI.
*
* Architecture:
*  - Follows the standard Dédalo area lifecycle: init → build → render.
*  - `init`  delegates to `area_common.prototype.init` and then loads the
*    highlight.js stylesheet needed by code-display widgets.
*  - `build` fetches context + data via `build_autoload`, then populates
*    `this.context`, `this.data`, and `this.widgets` (the flat datalist of
*    widget definitions served by `class.area_maintenance.php::get_ar_widgets`).
*  - `render` delegates to `common.prototype.render`, which in turn calls
*    `this.edit()` (aliased from `render_area_maintenance.prototype.edit`),
*    producing the full maintenance dashboard DOM.
*  - `get_value` fires a long-lived worker request (up to 1 hour) to
*    `dd_area_maintenance_api::get_widget_value` — used by widget instances
*    to retrieve async operation results.
*
* Widget rendering is handled entirely in render_area_maintenance.js.
* Individual widget JS modules live under core/area_maintenance/widgets/.
*
* Main exports: `area_maintenance` (constructor).
*
* @see core/area_maintenance/class.area_maintenance.php  — server widget registry
* @see core/area_maintenance/js/render_area_maintenance.js — DOM rendering
* @see core/area_common/js/area_common.js — shared area base / init contract
*/



// imports
	import {common, build_autoload} from '../../common/js/common.js'
	import {load_style} from '../../common/js/utils/index.js'
	import {area_common} from '../../area_common/js/area_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_area_maintenance, build_form} from './render_area_maintenance.js'



/**
* AREA_MAINTENANCE
* Constructor for the maintenance area controller.
*
* Instance properties are declared here (undefined) and populated by
* `area_common.prototype.init` (identity fields) and `build` (data fields).
* The constructor is intentionally lightweight — all async work happens in
* `init` and `build`.
*
* @property {string}        id      - Unique instance identifier, set by init.
* @property {string}        model   - Module model name ('area_maintenance').
* @property {string}        type    - Area type string (mirrors model).
* @property {string}        tipo    - Ontology tipo (e.g. 'dd88').
* @property {string}        mode    - Render mode: 'edit' or 'list'.
* @property {string}        lang    - Active UI language code.
* @property {Object}        datum   - Raw API response (context + data arrays).
* @property {Object}        context - Area context record from the API response.
* @property {Object}        data    - Area data record (section_tipo === tipo match).
* @property {Array}         widgets - Flat list of widget definition objects from datalist.
* @property {HTMLElement}   node    - Root DOM node after render.
* @property {string}        status  - Lifecycle state: 'building' | 'built'.
*/
export const area_maintenance = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.widgets

	this.node
	this.status


	return true
}//end area_maintenance



/**
* COMMON FUNCTIONS
* Prototype assignments that wire shared lifecycle and render methods into
* area_maintenance.  Each entry delegates to the canonical implementation so
* that area_maintenance participates fully in the standard Dédalo lifecycle
* without duplicating code.
*
* Lifecycle (from common):
*   refresh          — tears down and rebuilds the instance in place.
*   destroy          — removes the DOM node and cleans up event subscriptions.
*   build_rqo_show   — constructs the request query object (rqo) for 'show' calls.
*
* Render (from render_area_maintenance):
*   edit / list      — both produce the maintenance dashboard DOM; `list` is an
*                      alias of `edit` so the area works in either mode.
*/
// prototypes assign
	area_maintenance.prototype.refresh			= common.prototype.refresh
	area_maintenance.prototype.destroy			= common.prototype.destroy
	area_maintenance.prototype.build_rqo_show	= common.prototype.build_rqo_show
	area_maintenance.prototype.edit				= render_area_maintenance.prototype.edit
	area_maintenance.prototype.list				= render_area_maintenance.prototype.list



/**
* INIT
* Initializes the area_maintenance instance.
*
* Extends `area_common.prototype.init` with maintenance-specific setup:
* injects the highlight.js CSS (atom-one-dark theme) used by code-display
* widgets (e.g. check_config, system_info).  The stylesheet is loaded once
* per page via `load_style`, which is a no-op if the link tag already exists.
*
* @param {Object} options - Initialization options forwarded to area_common.init.
*   Typically includes: id, model, tipo, mode, lang, section_tipo, section_id.
* @returns {Promise<boolean>} Resolves to the return value of area_common.init
*   (true on success).
*/
area_maintenance.prototype.init = async function(options) {

	// call the generic common tool init
		const common_init = await area_common.prototype.init.call(this, options);

	// load additional JS/CSS
		// highlightjs from https://highlightjs.org/
		load_style(
			DEDALO_ROOT_WEB + '/lib/highlightjs/styles/atom-one-dark.css'
		)


	return common_init
}//end init



/**
* BUILD
* Loads context and widget data from the API and populates the instance.
*
* When `autoload` is true (the normal path), the method:
*  1. Issues a `build_autoload` request (context + data in one call).
*  2. Aborts with false if the response is missing or has no context entries.
*  3. Stores `api_response.result` in `self.datum`.
*  4. Sets `self.context` only when not already set — this preserves any
*     ddo_map overrides applied by section_record.js before build() was called.
*     (e.g. oh27 may configure rsc368 with mode:list/view:line while the API
*     would return the plain default mode:edit/view:default.)
*  5. Sets `self.data`    — the data record whose tipo matches section_tipo.
*  6. Sets `self.widgets` — the flat datalist array of widget definition objects
*     (id, label, category, class, value…) as returned by
*     `class.area_maintenance.php::get_ar_widgets`.
*  7. Rebuilds `self.rqo` from the fresh context.
*
* When `autoload` is false (headless / embedding via render_update_data_maintenance),
* only the initial rqo is built; the caller is responsible for supplying
* `self.widgets` directly before calling build(false).
*
* `prevent_lock` is set on the rqo so that long-running maintenance calls do
* not trigger the Dédalo record-lock mechanism.
*
* @param {boolean} [autoload=true] - When true, fetches context + data from the
*   server.  Pass false to skip the network call (caller pre-populates widgets).
* @returns {Promise<boolean>} true on success, false if the API response is
*   missing or contains no context for this area.
*/
area_maintenance.prototype.build = async function(autoload=true) {

	const self = this

	// status update
		self.status = 'building'

	// request_config_object
		self.request_config_object	= (self.context && self.context.request_config)
			? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
			: {}

	// rqo build
		self.rqo = self.rqo || await self.build_rqo_show(self.request_config_object, 'get_data')
		self.rqo.prevent_lock = true

	// load from DDBB
		if (autoload===true) {

			// build_autoload
			// Use unified way to load context and data with
			// errors and not login situation managing
				const api_response = await build_autoload(self)

				// server: wrong response
				if (!api_response) {
					return false
				}
				// server: bad build context
				if(!api_response.result.context.length){
					console.error("Error!!!!, area_maintenance without context:", api_response);
					return false
				}

			// set the result to the datum
				self.datum	= api_response.result

			// set context and data to current instance
			// set Context
				// context is only set when it's empty the origin context,
				// if the instance has previous context, it will need to preserve.
				// because the context could be modified by ddo configuration and it can no be changed
				// ddo_map -----> context
				// ex: oh27 define the specific ddo_map for rsc368
				// 		{ mode: list, view: line, children_view: text ... }
				// if you call to API to get the context of the rsc368 the context will be the default config
				// 		{ mode: edit, view: default }
				// but it's necessary preserve the specific ddo_map configuration in the new context.
				// Context is set and changed in section_record.js to get the ddo_map configuration
				if(!self.context){
					const context = self.datum.context.find(el => el.tipo===self.tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context || {}
					}
				}
				// data record: matched by tipo===section_tipo (the area's own section)
				self.data		= self.datum.data.find(el => el.tipo===el.section_tipo)
				// widgets: the datalist on the data record; empty array when absent
				self.widgets	= self.data && self.data.datalist
					? self.data.datalist
					: []

			// rebuild the request_config_object and rqo in the instance
			// request_config_object
				self.request_config_object = self.context
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: null

			// rqo build
				self.rqo = await self.build_rqo_show(self.request_config_object, 'get_data')
		}//end if (autoload===true)

	// label: use context label when available; fall back to a hardcoded default
		self.label = self.context
			? self.context.label
			: 'Area Development'

	// status update
		self.status = 'built'


	return true
}//end build



/**
* RENDER
* Paints the maintenance dashboard into the DOM and publishes the
* 'render_instance' event so that the page header menu can update the
* active-area label.
*
* Delegates to `common.prototype.render`, which in turn calls `this.edit()`
* (aliased from `render_area_maintenance.prototype.edit`) to build the full
* dashboard wrapper, sticky toolbar, category chips, and widget grid.
*
* @param {Object} [options={}] - Render options.
* @param {string} [options.render_level='full'] - Depth of rendering:
*   'full'    — builds the complete wrapper including outer chrome.
*   'content' — returns only the inner content_data node (used for refreshes).
* @returns {Promise<HTMLElement>} The root DOM node stored in `this.node`.
*/
area_maintenance.prototype.render = async function(options={}) {

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)


	return result_node
}//end render



/**
* INIT_FORM
* Convenience alias that exposes `build_form` as an instance method so
* individual widget instances can call `caller.init_form(widget_object)`
* without importing render_area_maintenance directly.
*
* `build_form` creates a `<form>` with the supplied inputs, a submit button,
* optional confirm dialog, spinner, and API request wiring.  See
* render_area_maintenance.js::build_form for the full widget_object contract.
*
* @param {Object} widget_object - Widget form descriptor.  Key fields:
*   body_info     {HTMLElement} — container for the form.
*   body_response {HTMLElement} — container where API responses are printed.
*   inputs        {Array}       — input descriptor objects (name, type, label, value, mandatory).
*   trigger       {Object}      — API call descriptor (dd_api, action, source, options).
*   confirm_text  {string}      — confirmation prompt text (default: label 'sure?').
*   submit_label  {string}      — submit button text (default: 'OK').
*   on_submit     {Function}    — optional override called instead of the API request.
*   on_done       {Function}    — optional callback invoked after the API request.
*   on_render     {Function}    — optional callback invoked after the form is rendered.
* @returns {HTMLElement} The constructed `<form>` element.
*/
area_maintenance.prototype.init_form = function(widget_object) {

	return build_form(widget_object)
}//end init_form



/**
* GET_VALUE
* Fetches the current computed value for this widget from the server.
*
* Called by individual widget instances (e.g. system_info, update_data_version)
* to retrieve their data payload.  The request is routed through a dedicated
* web worker (`use_worker: true`) because some widgets run long maintenance
* operations that would block the main thread.
*
* The server-side handler is `dd_area_maintenance_api::get_widget_value`, which
* dispatches to the widget class identified by `source.model` (= `this.id`).
*
* Timeouts and retries: only one attempt is made (retries:1) with a 1-hour
* ceiling — maintenance operations (e.g. full backup, data migration) can
* legitimately take tens of minutes.
*
* @throws {Error} 'Invalid widget id' when `this.id` is falsy or empty —
*   guards against accidental calls before init().
* @returns {Promise<*>} The `result` field of the API response, whose shape
*   varies per widget (object, array, or scalar).
*/
area_maintenance.prototype.get_value = async function () {

	if (!this.id || !this.id.length) {
		console.warn('this:', this);
		throw new Error('Invalid widget id')
	}

	// get files list updated
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'get_widget_value',
			prevent_lock	: true,
			source	: {
				type	: 'widget',
				model	: this.id
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log(`))) get_value ${this.id} api_response:`, api_response);
	}

	const result = api_response?.result


	return result
}//end get_value



// @license-end
