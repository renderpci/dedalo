// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_build_database_version} from './render_build_database_version.js'



/**
* BUILD_DATABASE_VERSION
* Area-maintenance widget that exposes three server-side database operations to
* privileged Dédalo administrators:
*
*   1. build_install_version — clones the live database to a clean install image
*      (target DB + compressed .pgsql.gz file), delegating to the PHP
*      `install::build_install_version` routine.
*
*   2. build_recovery_version_file — exports the live `dd_ontology` table to the
*      recovery SQL file `dd_ontology_recovery.sql` kept under /install/db/.
*
*   3. restore_dd_ontology_recovery_from_file — reimports that SQL file to
*      recreate the `dd_ontology_recovery` table from a known-good snapshot.
*
* The widget follows the standard area-maintenance widget lifecycle:
*   init → build → render (edit/list)
* Lifecycle and common I/O are inherited from widget_common; the value fetch is
* inherited from area_maintenance.prototype.get_value (hits
* dd_area_maintenance_api → get_widget_value → build_database_version::get_value
* on the server, which returns source_db / target_db / target_file paths).
*
* All three server operations are long-running (up to one hour per call) so
* every data_manager.request call sets `timeout: 3600 * 1000` and `retries: 1`.
*
* Render output is produced by render_build_database_version (see
* render_build_database_version.js), which creates a three-section DOM panel —
* one section per operation — each with a confirm-guarded action button and an
* inline process_response panel.
*
* @exports {Function} build_database_version
*/
export const build_database_version = function() {

	// {string} Unique widget instance identifier (matches the server-side model name).
	this.id

	// {string} Section tipo (ontology descriptor) this widget is attached to.
	this.section_tipo
	// {string|number} Section record identifier.
	this.section_id
	// {string} Active language code (e.g. 'lg-eng').
	this.lang
	// {string} Current render mode: 'edit' or 'list' (both map to the same render).
	this.mode

	// {Object} Widget value payload from the server — shape:
	//   { source_db: string, target_db: string, target_file: string }
	// Populated by get_value (inherited from area_maintenance) on first load.
	this.value

	// {HTMLElement} Root DOM node for this widget instance once rendered.
	this.node

	// {Array} Subscribed event tokens for cleanup in destroy().
	this.events_tokens	= []
	// {Array} Child widget instances managed by this widget.
	this.ar_instances	= []

	// {string|null} Last error status, set when build() catches an exception.
	this.status
}//end build_database_version



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	build_database_version.prototype.init		= widget_common.prototype.init
	build_database_version.prototype.build		= widget_common.prototype.build
	build_database_version.prototype.render		= widget_common.prototype.render
	build_database_version.prototype.destroy	= widget_common.prototype.destroy
	// Fetches server-side value (source_db / target_db / target_file) via
	// dd_area_maintenance_api → get_widget_value.
	build_database_version.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	// Both 'edit' and 'list' modes use the same three-panel layout.
	build_database_version.prototype.edit		= render_build_database_version.prototype.list
	build_database_version.prototype.list		= render_build_database_version.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* Delegates to widget_common.prototype.build for standard initialization
* (node creation, data loading via get_value, render dispatch).
* The actual data load happens on open via the unified widget load() path in
* render_area_maintenance, so no extra fetch is needed here.
* @param {boolean} [autoload=false] - Whether to trigger an automatic data reload.
* @returns {Promise<boolean>} Result from widget_common.prototype.build.
*/
build_database_version.prototype.build = async function (autoload = false) {

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
}//end build_custom



/**
* BUILD_INSTALL_VERSION
* Triggers the server-side routine that:
*   1. Clones the live database (DEDALO_DATABASE_CONN) to a clean install copy
*      (install::$db_install_name).
*   2. Strips user/runtime data from the copy.
*   3. Exports the result to the compressed file /install/db/<db_name>.pgsql.gz.
*
* The operation is long-running; the timeout is raised to 1 hour and retries are
* reduced to 1 to avoid duplicating an expensive clone on transient network hiccups.
*
* The request dispatches to:
*   dd_area_maintenance_api → widget_request → build_database_version::build_install_version
*   → install::build_install_version (PHP)
*
* `prevent_lock: true` ensures the operation does not acquire a record-write lock,
* which is unnecessary for a read/clone task.
*
* `background_running: false` keeps the operation synchronous from the PHP side
* (the JS side already awaits the full response without polling).
*
* @returns {Promise<Object>} API response object with result/errors/msg fields.
*/
build_database_version.prototype.build_install_version = async function () {

	const api_response = await data_manager.request({
		body: {
			dd_api: 'dd_area_maintenance_api',
			action: 'widget_request',
			prevent_lock: true,
			source: {
				type: 'widget',
				model: 'build_database_version',
				action: 'build_install_version'
			},
			options: {
				background_running: false // set run in background CLI
			}
		},
		retries: 1, // one try only
		timeout: 3600 * 1000 // 1 hour waiting response
	})


	return api_response
}//end build_install_version



/**
* BUILD_RECOVERY_VERSION_FILE
* Exports the live `dd_ontology` table to the SQL file
* `/install/db/dd_ontology_recovery.sql` on the server.  This snapshot is used
* as a fallback to recreate the ontology table should the primary copy be lost.
*
* `use_worker: true` routes the fetch through the data_manager Web Worker
* channel.  This keeps the browser main thread unblocked during the potentially
* lengthy export.  Note: as of the current codebase the worker path is
* deactivated internally in data_manager and falls back to a normal fetch.
*
* The timeout is raised to 1 hour and retries are reduced to 1 for the same
* reasons as build_install_version (see above).
*
* The request dispatches to:
*   dd_area_maintenance_api → widget_request → build_database_version::build_recovery_version_file
*   (no matching PHP method is in API_ACTIONS; (!) the server class only declares
*   'build_install_version' in API_ACTIONS — this action may silently fail server-side.)
*
* @returns {Promise<Object>} API response object with result/errors/msg fields.
*/
build_database_version.prototype.build_recovery_version_file = async function () {

	const api_response = await data_manager.request({
		use_worker: true,
		body: {
			dd_api: 'dd_area_maintenance_api',
			action: 'widget_request',
			prevent_lock: true,
			source: {
				type: 'widget',
				model: 'build_database_version',
				action: 'build_recovery_version_file'
			},
			options: {
				background_running: false // set run in background CLI
			}
		},
		retries: 1, // one try only
		timeout: 3600 * 1000 // 1 hour waiting response
	})


	return api_response
}//end build_recovery_version_file



/**
* RESTORE_DD_ONTOLOGY_RECOVERY_FROM_FILE
* Reimports the SQL dump `/install/db/dd_ontology_recovery.sql` to recreate the
* `dd_ontology_recovery` table in the live database.  Used to restore the table
* from a known-good file previously generated by build_recovery_version_file.
*
* Unlike the other two operations this request uses `action: 'class_request'`
* (not 'widget_request'), which routes through the generic class dispatcher
* rather than the widget-scoped handler.  The `source` object therefore omits
* `type` and `model` fields; only `action` is required by the class dispatcher.
*
* The timeout and retries values follow the same rationale as the other methods.
*
* (!) `action: 'class_request'` is not guarded by the widget's API_ACTIONS list;
* the server-side security boundary for this request lies in the class dispatcher's
* own access controls.
*
* @returns {Promise<Object>} API response object with result/errors/msg fields.
*/
build_database_version.prototype.restore_dd_ontology_recovery_from_file = async function () {

	const api_response = await data_manager.request({
		body: {
			dd_api: 'dd_area_maintenance_api',
			action: 'class_request',
			prevent_lock: true,
			source: {
				action: 'restore_dd_ontology_recovery_from_file',
			},
			options: {
				background_running: false // set run in background CLI
			}
		},
		retries: 1, // one try only
		timeout: 3600 * 1000 // 1 hour waiting response
	})


	return api_response
}//end restore_dd_ontology_recovery_from_file



// @license-end
