// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_make_backup} from './render_make_backup.js'



/**
* MAKE_BACKUP
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
* @param string action
* 	Backend action, e.g. 'make_psql_backup'
* @param object options = {}
* @param int timeout = 3600 * 1000
* 	Per-attempt timeout in ms. Defaults to 1 hour for long backup operations;
* 	pass a short value for polled/lightweight calls.
* @return promise - api_response
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
* extend functions from common
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
* Creates a PostgreSQL database backup.
* @return promise - api_response
*/
make_backup.prototype.make_backup = async function() {

	// API worker call. 1 hour timeout for the long backup operation
	const api_response = await widget_request('make_psql_backup')

	return api_response
}//end make_backup



/**
* MAKE_MYSQL_BACKUP
* Creates a MySQL database backup.
* @return promise - api_response
*/
make_backup.prototype.make_mysql_backup = async function() {

	// API worker call. 1 hour timeout for the long backup operation
	const api_response = await widget_request('make_mysql_backup')

	return api_response
}//end make_mysql_backup



/**
* GET_BACKUP_FILES
* Retrieves list of backup files.
* @param object options
* @return promise - api_response
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
