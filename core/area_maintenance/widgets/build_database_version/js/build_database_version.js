// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_build_database_version} from './render_build_database_version.js'



/**
* BUILD_DATABASE_VERSION
*/
export const build_database_version = function() {

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
	// render
	build_database_version.prototype.edit		= render_build_database_version.prototype.list
	build_database_version.prototype.list		= render_build_database_version.prototype.list



/**
* GET_WIDGET_VALUE
* Get widget value from class maintenance
* The options 'name' property is the class method name
* @return object result
*/
build_database_version.prototype.get_widget_value = async () => {

	// get files list updated
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'get_widget_value',
			source	: {
				type	: 'widget',
				model	: 'build_database_version'
			}
		}
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_widget_value update_ontology api_response:', api_response);;
	}

	const result = api_response.result


	return result
}//end get_widget_value



/**
* BUILD_INSTALL_VERSION
* Builds the install version of the current database in server
* @return object api_response
*/
build_database_version.prototype.build_install_version = async function () {

	const api_response  = await data_manager.request({
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'class_request',
			source	: {
				action	: 'build_install_version',
			},
			options : {
				background_running	: true // set run in background CLI
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})


	return api_response
}//end build_install_version



/**
* BUILD_RECOVERY_VERSION_FILE
* Creates the recovery file 'jer_dd_recovery.sql' from current 'jer_dd' table in server
* @return object api_response
*/
build_database_version.prototype.build_recovery_version_file = async function () {

	const api_response  = await data_manager.request({
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'class_request',
			source	: {
				action	: 'build_recovery_version_file',
			},
			options : {
				background_running	: false // set run in background CLI
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})


	return api_response
}//end build_recovery_version_file



/**
* RESTORE_JER_DD_RECOVERY_FROM_FILE
* Imports the SQL file '/install/db/jer_dd_recovery.sql'
* creating the table 'jer_dd_recovery'
* @return object api_response
*/
build_database_version.prototype.restore_jer_dd_recovery_from_file = async function () {

	const api_response  = await data_manager.request({
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'class_request',
			source	: {
				action	: 'restore_jer_dd_recovery_from_file',
			},
			options : {
				background_running	: false // set run in background CLI
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})


	return api_response
}//end restore_jer_dd_recovery_from_file



// @license-end
