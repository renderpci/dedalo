// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* MEDIA_CONTROL (module)
* Area-maintenance widget for configuring, inspecting, and maintaining the
* Dédalo media-file access control system.
*
* Responsibilities
* ----------------
* - Exposes the current DEDALO_MEDIA_ACCESS_MODE state (effective mode,
*   source, .htaccess status, publication markers, diffusion-engine health).
* - Lets the root user switch the access mode at runtime via
*   set_media_access_mode(), which persists the override in config_core.php
*   and immediately rewrites media/.htaccess.
* - Lets any administrator trigger a full marker resync via
*   rebuild_media_index(), which walks every publication database and
*   re-creates the .publication/ marker tree inside the media directory.
*
* Data flow
* ---------
*   init() → build() → get_value() [via area_maintenance.prototype.get_value]
*     → server: dd_area_maintenance_api::get_widget_value → media_control::get_value
*     → {mode, mode_source, custom_override, config_mode, legacy_protect,
*        cookie_name, public_qualities, media_path, htaccess, markers, engine,
*        is_root}          (see class.media_control.php for the full shape)
*
* Prototype chain
* ---------------
*   media_control ← widget_common (lifecycle: init, render, refresh, destroy)
*                 ← area_maintenance (get_value)
*                 ← render_media_control (edit / list views)
*
* Server peer:  core/area_maintenance/widgets/media_control/class.media_control.php
* API handler:  core/api/v1/common/class.dd_area_maintenance_api.php
*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_media_control} from './render_media_control.js'



/**
* MEDIA_CONTROL
* Constructor for the media-access-control widget instance.
*
* Instance properties
* -------------------
* @property {string}        id             - Widget identifier; set during init().
* @property {string}        section_tipo   - Ontology tipo of the parent section.
* @property {string|number} section_id     - Parent section record id.
* @property {string}        lang           - Active UI language code.
* @property {string}        mode           - Display mode: 'list' | 'edit'.
* @property {Object}        value          - Loaded widget value; shape mirrors the
*                                            server-side get_value() return object
*                                            (see module header for full shape).
* @property {HTMLElement}   node           - Root DOM node rendered by the view.
* @property {Array}         events_tokens  - Subscribed event tokens; cleared by destroy().
* @property {Array}         ar_instances   - Child widget or component instances.
* @property {*}             status         - Lifecycle status string set by widget_common.
*/
export const media_control = function() {

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
}//end media_control



/**
* COMMON FUNCTIONS
* Prototype assignments delegate shared lifecycle and render methods to their
* canonical implementations. No custom logic lives here — this widget relies
* entirely on the widget_common and area_maintenance contracts:
*
*   init      — resolves the widget's configuration from the server and sets up
*               the base instance state (widget_common).
*   render    — dispatches to this.edit() or this.list() based on this.mode
*               (widget_common).
*   refresh   — tears down per-render state and re-runs build() + render()
*               (widget_common).
*   destroy   — unsubscribes event tokens and optionally removes the DOM node
*               (widget_common).
*   get_value — fires a worker request to dd_area_maintenance_api::get_widget_value
*               and returns the raw result object (area_maintenance).
*   edit/list — both delegate to render_media_control.prototype.list, which is
*               the only render view this widget needs (read-only status panel +
*               action controls).
*/
// prototypes assign
	// lifecycle
	media_control.prototype.init		= widget_common.prototype.init
	media_control.prototype.render		= widget_common.prototype.render
	media_control.prototype.refresh		= widget_common.prototype.refresh
	media_control.prototype.destroy		= widget_common.prototype.destroy
	media_control.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	media_control.prototype.edit		= render_media_control.prototype.list
	media_control.prototype.list		= render_media_control.prototype.list



/**
* BUILD
* Custom build overwrites common widget method: loads the widget value
* (configuration + runtime status) from the server.
*
* The actual data load is handled by widget_common.prototype.build (called as
* common_build), which detects the area_maintenance caller context and runs
* get_value() automatically when autoload is true.  The try/catch block is
* reserved for any future widget-specific post-load logic; currently it is
* intentionally empty.
*
* @param {boolean} autoload - When true, widget_common.prototype.build fires
*                             get_value() and stores the result in this.value
*                             before returning. Defaults to false.
* @returns {Promise<boolean>} Resolves to the return value of
*                             widget_common.prototype.build.call().
*/
media_control.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// data now loads on open via the unified widget load() (see render_area_maintenance)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* SET_MEDIA_ACCESS_MODE
* Persists a new media access mode override in config_core.php and applies it
* immediately on the server (rewrites media/.htaccess, restores auth markers
* when re-enabling protection).
*
* The request is sent through a web worker (use_worker: true) to keep the
* main thread free; a single attempt is made because the operation is not
* idempotent and the caller inspects api_response.result to decide how to
* proceed.
*
* Accepted values for `value`
* ---------------------------
*   'config'      — Remove the runtime override; fall back to the config.php
*                   constant DEDALO_MEDIA_ACCESS_MODE.
*   'off'         — Disable access control; media files become world-readable.
*   'private'     — Only logged-in users may access media files.
*   'publication' — Anonymous users may access published media qualities;
*                   unpublished media requires a session cookie.
*
* Server action: dd_area_maintenance_api  → widget_request
*                → media_control::set_media_access_mode
*
* @param {string} value - One of 'config' | 'off' | 'private' | 'publication'.
* @returns {Promise<Object>} api_response object with at minimum:
*   {boolean} result — true on success.
*   {string}  msg    — Human-readable outcome or error description.
*/
media_control.prototype.set_media_access_mode = async function(value) {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'media_control',
				action	: 'set_media_access_mode'
			},
			options	: {
				value : value
			}
		},
		retries : 1, // one try only
		timeout : 60 * 1000 // 1 minute waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('set_media_access_mode api_response:', api_response);
	}

	return api_response
}//end set_media_access_mode



/**
* REBUILD_MEDIA_INDEX
* Triggers a full resync of the media publication markers from the publication
* databases (global admin operation).
*
* The Bun diffusion engine maintains a .publication/ marker tree inside the
* media directory; this call asks the PHP backend to walk every publication
* database and rebuild that tree from scratch.  It is intended for:
*   - First-time setup after enabling publication mode.
*   - Repairing drift between the marker store and actual publication data.
*
* The timeout is set to 1 hour because large instances with many publication
* records and media files can take tens of minutes to complete the full walk.
* A single attempt is made; the caller checks api_response.result.
*
* Server action: dd_area_maintenance_api  → widget_request
*                → media_control::rebuild_media_index
*
* @returns {Promise<Object>} api_response object with at minimum:
*   {boolean}      result  — true on success.
*   {string|null}  msg     — Human-readable summary or error description.
*   {number|null}  markers — Total markers written.
*   {number|null}  targets — Number of publication database directories scanned.
*   {Array}        errors  — Per-record error messages if any records failed.
*/
media_control.prototype.rebuild_media_index = async function() {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'media_control',
				action	: 'rebuild_media_index'
			},
			options	: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('rebuild_media_index api_response:', api_response);
	}

	return api_response
}//end rebuild_media_index



// @license-end
