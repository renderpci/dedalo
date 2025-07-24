// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_update_code} from './render_update_code.js'



/**
* UPDATE_CODE
*/
export const update_code = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	// bool beta_update
	this.beta_update

	// string update_mode : incremental | clean
	this.update_mode

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end update_code



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	update_code.prototype.init		= widget_common.prototype.init
	update_code.prototype.build		= widget_common.prototype.build
	update_code.prototype.render	= widget_common.prototype.render
	update_code.prototype.destroy	= widget_common.prototype.destroy
	update_code.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	update_code.prototype.edit		= render_update_code.prototype.list
	update_code.prototype.list		= render_update_code.prototype.list



/**
* GET_CODE_UPDATE_INFO
* Call code remote server API and gets update info before update the ontology
* @param object server
* {
* 	code: string,
* 	url : string
* }
* @return object api_response
* {
* 	result : {
* 		files: []
* 		info: {version: "6.4.0", ...}
* 	},
* 	msg: string
* 	errors: []
* }
*/
update_code.prototype.get_code_update_info = async ( server ) => {

	// short vars
		const code				= server.code
		const url				= server.url
		const dedalo_version	= page_globals.dedalo_version

	const api_response = await data_manager.request({
		url		: url,
		body	: {
			dd_api			: 'dd_utils_api',
			action			: 'get_code_update_info',
			prevent_lock	: true,
			source			: {},
			options			: {
				version	: dedalo_version,
				code	: code
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_code_update_info update_code api_response:', api_response);
	}


	return api_response
}//end get_code_update_info



/**
* UPDATE_CODE
* Call code remote server API and update the code passing the selected file info
* @param object options
* {
*	info : {
*		"version": "6.4.0",
*		"date": "2025-02-08T11:53:15+01:00",
*		"entity_id": 10,
*		"entity": "dedalo",
*		"entity_label": "Dédalo master",
*		"host": "dedalo.dev",
*		"tool_names": [
*			"tool_lang"
*		]
*	},
*	file_active: {
*		"version": "development",
*		"url": "https://dedalo.dev/dedalo/code/development/dedalo_development.zip",
*		"active": true
*	}
* }
* @return object api_response
*/
update_code.prototype.update_code = async ( options ) => {

	// options
	const file_active	= options.file_active
	const update_mode	= options.update_mode
	const info			= options.info

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api		: 'dd_area_maintenance_api',
			action		: 'widget_request',
			prevent_lock	: true,
			source		: {
				type	: 'widget',
				model	: 'update_code',
				action	: 'update_code'
			},
			options	: {
				file		: file_active,
				update_mode	: update_mode,
				info		: info
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) update_code update_code api_response:', api_response);
	}


	return api_response
}//end update_code



// @license-end
