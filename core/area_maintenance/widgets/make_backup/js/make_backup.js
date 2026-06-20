// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* MAKE_BACKUP
* Maintenance widget that exposes on-demand database backup controls for both
* PostgreSQL (Dédalo's primary store) and MySQL/MariaDB (publication database).
*
* Architecture
* ------------
* This module is the controller half of the make_backup widget.  It follows the
* standard Dédalo widget pattern:
*
*   Constructor  — declares instance properties (set to null / []).
*   Prototypes   — lifecycle methods delegated to widget_common (init/build/render/
*                  destroy) and render methods delegated to render_make_backup (edit/list).
*                  `get_value` is delegated to area_maintenance so the widget fetches
*                  its server-side value (backup_path, file_name, mysql_db …) through
*                  the unified `dd_area_maintenance_api::get_widget_value` endpoint.
*   Own methods  — `make_backup`, `make_mysql_backup`, `get_backup_files` each fire
*                  a long-lived API worker call via the module-private `widget_request`
*                  helper.  They are called from the DOM event handlers built in
*                  render_make_backup.js.
*
* Server counterpart: core/area_maintenance/widgets/make_backup/class.make_backup.php
*   API_ACTIONS: 'make_psql_backup', 'make_mysql_backup', 'get_dedalo_backup_files'
*
* DOM rendering is fully delegated to render_make_backup.js (imported as
* `render_make_backup`).
*
* Main export: `make_backup` (constructor).
*
* @see core/area_maintenance/widgets/make_backup/class.make_backup.php — PHP backend
* @see core/area_maintenance/widgets/make_backup/js/render_make_backup.js — DOM layer
* @see core/widgets/widget_common/js/widget_common.js — shared widget lifecycle
* @see core/area_maintenance/js/area_maintenance.js — get_value delegation source
*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_make_backup} from './render_make_backup.js'



/**
* MAKE_BACKUP
* Constructor for the make_backup widget controller.
*
* All properties are initialised to null / empty collections here; they are
* populated by the standard widget lifecycle (init → build → render) which is
* wired through the prototype assignments below.
*
* @property {string|null}      id            - Unique instance identifier, set by
*                                              widget_common.prototype.init.
* @property {string|null}      section_tipo  - Ontology tipo of the owning section.
* @property {string|null}      section_id    - Record id within the owning section.
* @property {string|null}      lang          - Active UI language code (e.g. 'lg-eng').
* @property {string|null}      mode          - Render mode: 'edit' or 'list'.
* @property {Object|null}      value         - Widget value payload from the server.
*                                              Shape (from class.make_backup.php::get_value):
*                                              {
*                                                dedalo_db_management : boolean,
*                                                backup_path          : string,
*                                                file_name            : string,
*                                                mysql_db             : Array<{db_name:string}>|null
*                                              }
* @property {HTMLElement|null} node          - Root DOM node after render.
* @property {Array}            events_tokens - Event subscription tokens collected
*                                              during lifecycle; released by destroy().
* @property {Array}            ar_instances  - Child widget/component instances
*                                              (used for autocomplete and sub-widgets).
* @property {string|null}      status        - Lifecycle state string (e.g. 'building').
*/
export const make_backup = function() {

	this.id				= null

	this.section_tipo	= null
	this.section_id		= null
	this.lang			= null
	this.mode			= null

	this.value			= null

	this.node			= null

	this.events_tokens	= []
	this.ar_instances	= []

	this.status			= null
}//end make_backup



/**
* WIDGET_REQUEST
* Shared helper for the widget's API worker calls.
*
* Wraps `data_manager.request` with the fixed envelope required by the
* `dd_area_maintenance_api::widget_request` dispatcher so that individual
* prototype methods need only supply an action name and optional options bag.
*
* The call always uses `use_worker: true` and `prevent_lock: true` so that
* long-running backup operations (up to 1 hour) do not block the main thread
* or the normal request lock queue.  `retries` is set to 1 (one attempt only)
* because backup operations must not be accidentally repeated.
*
* @param {string} action    - Backend action name dispatched to class.make_backup.php,
*                             e.g. 'make_psql_backup', 'make_mysql_backup',
*                             'get_dedalo_backup_files'.
* @param {Object} [options={}] - Extra options forwarded to the backend method as the
*                             `$options` parameter (e.g. { max_files, psql_backup_files }).
* @param {number} [timeout=3600000] - Per-attempt request timeout in milliseconds.
*                             Defaults to 1 hour for the long backup operations;
*                             pass a short value (e.g. 15 000 ms) for lightweight
*                             polling calls such as get_backup_files.
* @returns {Promise<Object>} Resolves with the raw api_response object from the
*                             server: { result, msg, errors? }.
*/
const widget_request = (action, options={}, timeout=3600*1000) => {

	return data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'make_backup',
				action	: action
			},
			options			: options
		},
		retries : 1, // one try only
		timeout : timeout
	})
}//end widget_request



/**
* COMMON FUNCTIONS
* Prototype assignments that wire standard lifecycle and render methods into
* make_backup, avoiding code duplication.
*
* Lifecycle (from widget_common):
*   init     — resolves context + data via build_autoload; populates identity
*              fields and calls get_value to fill this.value.
*   build    — builds the DOM wrapper by invoking this.render().
*   render   — selects and calls the correct render mode method (edit or list).
*   destroy  — unsubscribes all event tokens and removes the DOM node.
*
* Value retrieval (from area_maintenance):
*   get_value — fires a worker request to dd_area_maintenance_api::get_widget_value
*               and stores the result as this.value.
*
* Render modes (from render_make_backup):
*   edit  — aliased to render_make_backup.prototype.list (the widget has a
*            single unified view for both edit and list modes).
*   list  — builds the full backup-controls UI: backup path info, submit button,
*            psql file list, and (conditionally) MySQL form + file list.
*/
// prototypes assign
	// lifecycle
	make_backup.prototype.init		= widget_common.prototype.init
	make_backup.prototype.build		= widget_common.prototype.build
	make_backup.prototype.render	= widget_common.prototype.render
	make_backup.prototype.destroy	= widget_common.prototype.destroy
	make_backup.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	make_backup.prototype.edit		= render_make_backup.prototype.list
	make_backup.prototype.list		= render_make_backup.prototype.list



/**
* MAKE_BACKUP
* Triggers a full PostgreSQL dump of the current Dédalo database.
*
* Delegates to `class.make_backup.php::make_psql_backup`, which is itself an
* alias for `backup::init_backup_sequence`.  The operation is spawned as a
* background process on the server; the returned `pid` and `pfile` fields allow
* the render layer to poll progress via `update_process_status`.
*
* The request uses a 1-hour timeout because a large-database pg_dump can take
* many minutes to complete.
*
* @returns {Promise<Object>} Resolves with api_response from the server:
*   {
*     result  : boolean,  // true on successful process spawn
*     pid     : number,   // OS process id of the pg_dump child process
*     pfile   : string,   // path to the progress/status file polled by update_process_status
*     msg     : string
*   }
*/
make_backup.prototype.make_backup = async function() {

	// API worker call. 1 hour timeout for the long backup operation
	const api_response = await widget_request('make_psql_backup')

	return api_response
}//end make_backup



/**
* MAKE_MYSQL_BACKUP
* Triggers a full dump of the MySQL/MariaDB publication database(s).
*
* Delegates to `class.make_backup.php::make_mysql_backup`, which is itself an
* alias for `backup::make_mysql_backup`.  Only available when the server is
* configured with `API_WEB_USER_CODE_MULTIPLE` (one or more MySQL connection
* descriptors); if that constant is not defined, this widget section is hidden
* by the render layer.
*
* The request uses a 1-hour timeout because the dump may be large.
*
* @returns {Promise<Object>} Resolves with api_response from the server:
*   {
*     result : boolean,
*     msg    : string
*   }
*/
make_backup.prototype.make_mysql_backup = async function() {

	// API worker call. 1 hour timeout for the long backup operation
	const api_response = await widget_request('make_mysql_backup')

	return api_response
}//end make_mysql_backup



/**
* GET_BACKUP_FILES
* Retrieves a paginated list of existing backup files from the server.
*
* Used by the render layer to populate the psql / MySQL file-list panels, which
* call this method on an interval (every 2 s while the panel is visible) so the
* list stays current during and after a backup operation.
*
* A short 15-second timeout is applied because this is a lightweight polling
* call — unlike the backup operations themselves.
*
* @param {Object} [options={}]                   - Filter options forwarded to
*                                                  class.make_backup.php::get_dedalo_backup_files.
* @param {number} [options.max_files=20]          - Maximum number of files to return per
*                                                  type (applied server-side with array_slice).
* @param {boolean} [options.psql_backup_files=false] - When true, include PostgreSQL
*                                                  backup files in the result.
* @param {boolean} [options.mysql_backup_files=false] - When true, include MySQL/MariaDB
*                                                  backup files in the result.
* @returns {Promise<Object>} Resolves with api_response from the server:
*   {
*     result : {
*       psql_backup_files?  : Array<{name:string, size:string}>,
*       mysql_backup_files? : Array<{name:string, size:string}>
*     },
*     msg : string
*   }
*   Each file entry has at least `name` (filename) and `size` (human-readable
*   e.g. "5.34 GB").  Only the keys requested via the boolean flags are present.
*/
make_backup.prototype.get_backup_files = async function(options={}) {

	const {
		max_files = 20,
		psql_backup_files = false,
		mysql_backup_files = false
	} = options

	// API worker call. 15 sec timeout; this endpoint is polled, keep it short
	const api_response = await widget_request(
		'get_dedalo_backup_files',
		{ max_files, psql_backup_files, mysql_backup_files },
		15 * 1000
	)

	return api_response
}//end get_backup_files



// @license-end
