// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {event_manager} from '../../../../common/js/event_manager.js'
	import {render_update_data_version} from './render_update_data_version.js'



/**
* UPDATE_DATA_VERSION
* Area-maintenance widget that runs the Dédalo database migration pipeline —
* updating stored data from the current DB schema version to the version
* expected by the installed PHP codebase.
*
* Workflow overview:
*  1. On load the widget fetches its value via the inherited get_value() path:
*        dd_area_maintenance_api → get_widget_value
*        → update_data_version::get_value (PHP)
*     which returns { update_version, current_version_in_db, dedalo_version, updates }.
*  2. render_update_data_version.list() displays:
*     - A success banner (already up to date) or a warning banner showing the
*       pending version hop (e.g. "5.8.2 ---> 6.0.0").
*     - A checklist of individual migration steps (SQL_update, components_update,
*       run_scripts) each guarded by a checkbox so the operator can skip items.
*     - A confirm-guarded "Update" button that fires the long-running migration via:
*           dd_area_maintenance_api → widget_request
*           → update_data_version::update_data_version (PHP)
*        with `background_running: true` (the PHP side spawns a CLI process) and a
*        1-hour client-side timeout.
*  3. After the server fires the background process the response carries a pid/pfile
*     pair; update_process_status() polls the log file and streams progress into the
*     body_response panel.
*
* Access guards enforced by both layers:
*   - Client: is_root check + maintenance_mode check before showing the submit form.
*   - Server: DEDALO_SUPERUSER check + DEDALO_MAINTENANCE_MODE check inside
*     update_data_version::update_data_version (PHP).
*
* Lifecycle (inherited from widget_common):
*   init() → build() → render() → [refresh cycles] → destroy()
*
* This module customises init() to register a cross-widget event listener and
* customises build() to document that data loads at idle via the shared
* render_area_maintenance background loader (not triggered here).
*
* Main exports: update_data_version (constructor)
*
* @see core/area_maintenance/widgets/update_data_version/class.update_data_version.php
* @see core/area_maintenance/widgets/update_data_version/js/render_update_data_version.js
* @see core/base/update/class.update.php  (server-side migration runner)
*/
export const update_data_version = function() {

	// {string} Unique widget instance identifier, set by widget_common.prototype.init.
	this.id

	// {string} Section tipo (ontology descriptor) this widget is attached to.
	this.section_tipo
	// {string|number} Section record identifier.
	this.section_id
	// {string} Active language code (e.g. 'lg-eng').
	this.lang
	// {string} Current render mode: 'edit' or 'list' (both map to the same render output).
	this.mode

	// {Object|null} Widget value payload from the server. Shape:
	//   {
	//     update_version       : Array<number>|null  — target version as integer array, e.g. [6,0,0];
	//                                                  null when the DB is already at the current version.
	//     current_version_in_db: Array<number>       — DB version at load time, e.g. [5,8,2].
	//     dedalo_version       : Array<number>        — installed PHP code version.
	//     updates              : Object|null          — migration step map keyed by category
	//                                                  ('SQL_update', 'components_update', 'run_scripts',
	//                                                  'alert_update', 'lock'); null when already up to date.
	//   }
	// Populated by get_value() (inherited from area_maintenance) during the idle-load phase.
	this.value

	// {HTMLElement|null} Root DOM node for this widget instance once rendered.
	this.node

	// {Array} Subscribed event tokens collected during init(); cleared by destroy().
	this.events_tokens	= []
	// {Array} Child widget instances managed by this widget (unused for this widget; present for interface parity).
	this.ar_instances	= []

	// Duplicate initialisation — this.value is declared twice (first above without a
	// value, then here as null). The second assignment wins; both declarations are
	// left as-is per codebase convention. (!)
	this.value			= null

	// {string|undefined} Lifecycle state: 'initializing' | 'initialized' | 'building' | 'built'.
	// Set by widget_common lifecycle methods; used by callers to guard double-init.
	this.status
}//end update_data_version



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	// init and build are overridden below with custom implementations; the commented-out
	// lines show what would otherwise be inherited directly from widget_common.
	// update_data_version.prototype.init	= widget_common.prototype.init
	// update_data_version.prototype.build	= widget_common.prototype.build
	update_data_version.prototype.render	= widget_common.prototype.render
	update_data_version.prototype.refresh	= widget_common.prototype.refresh
	update_data_version.prototype.destroy	= widget_common.prototype.destroy
	// Fetches the migration status from the server via
	// dd_area_maintenance_api → get_widget_value → update_data_version::get_value (PHP).
	update_data_version.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	// Both 'edit' and 'list' modes produce the same migration-checklist DOM panel.
	update_data_version.prototype.edit		= render_update_data_version.prototype.list
	update_data_version.prototype.list		= render_update_data_version.prototype.list



/**
* INIT
* Custom init. Delegates to widget_common.prototype.init, then subscribes to the
* 'update_code_done' cross-widget event so the migration panel auto-refreshes after
* a code deployment.
* @param {Object} options - Standard widget init options forwarded to widget_common.
* @returns {*} The return value of widget_common.prototype.init.
*/
update_data_version.prototype.init = async function(options) {

	const self = this

	// call generic common tool init
		const common_init = await widget_common.prototype.init.call(this, options);


	// event publish
	// Subscribe to the 'update_code_done' cross-widget event so that when another
	// widget (e.g. update_code) finishes a code deployment the data-version panel
	// automatically refreshes to reflect any new pending migrations.
	//
	// (!) As of the current codebase no publisher for 'update_code_done' has been
	// found; the subscription is a forward-looking integration point intended to
	// trigger a widget refresh once a code-update widget publishes this event.
		const update_code_done_handler = () => {
			self.refresh({
				build_autoload : false // do not use the default build data
			})
		}
		event_manager.subscribe('update_code_done', update_code_done_handler)


	return common_init
}//end init_custom



/**
* BUILD
* Custom build overwrites common widget method.
* @param {boolean} [autoload=false] - When true the widget load is triggered by the idle background loader.
* @returns {boolean} The return value of widget_common.prototype.build.
*/
update_data_version.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// data loads at idle via the unified background load (see render_area_maintenance)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



// @license-end
