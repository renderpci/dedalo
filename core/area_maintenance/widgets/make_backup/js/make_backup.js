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
}//end make_backup



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
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
make_backup.prototype.build = async function(autoload=false) {

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
* MAKE_BACKUP
* Creates a PostgreSQL database backup.
* @return promise - api_response
*/
make_backup.prototype.make_backup = async function() {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'make_backup',
				action  : 'make_psql_backup'
			},
			options		: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	return api_response
}//end make_backup



/**
* MAKE_MYSQL_BACKUP
* Creates a MySQL database backup.
* @return promise - api_response
*/
make_backup.prototype.make_mysql_backup = async function() {

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'make_backup',
				action  : 'make_mysql_backup'
			},
			options		: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

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

	// API worker call
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'make_backup',
				action  : 'get_dedalo_backup_files'
			},
			options		: {
				max_files,
				psql_backup_files,
				mysql_backup_files
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})

	return api_response
}//end get_backup_files



/**
* GET_LAST_FILE_INFO
* Gets information about the last backup file.
* @return promise - api_response
*/
make_backup.prototype.get_last_file_info = async function() {

	// API worker call
	const api_response = await this.get_backup_files({
		max_files			: 1,
		psql_backup_files	: true,
		mysql_backup_files	: false
	})

	return api_response
}//end get_last_file_info



// @license-end
