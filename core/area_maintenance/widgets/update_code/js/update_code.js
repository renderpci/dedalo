// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_update_code} from './render_update_code.js'
	import {data_manager} from '../../../../common/js/data_manager.js'



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
	// render
	update_code.prototype.edit		= render_update_code.prototype.list
	update_code.prototype.list		= render_update_code.prototype.list



/**
* GET_VALUE
* Get widget value from class maintenance
* The options 'name' property is the class method name
* @return result
* {
    "datalist": array as [{"name":"cpu","value":"Linux",..}]
    "errors": array|null
  }
*/
update_code.prototype.get_value = async () => {

	// get files list updated
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'get_widget_value',
			source	: {
				type	: 'widget',
				model	: 'update_code'
			}
		}
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_value update_code api_response:', api_response);;
	}

	const result = api_response.result


	return result
}//end get_value




/**
* GET_CODE_UPDATE_INFO
* Call code remote server API and gets update info before update the ontology
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
update_code.prototype.get_code_update_info = async (server) => {

	// short vars
		const code				= server.code
		const url				= server.url
		const dedalo_version	= page_globals.dedalo_version

	const api_response = await data_manager.request({
		url		: url,
		body	: {
			dd_api	: 'dd_utils_api',
			action	: 'get_code_update_info',
			source	: {},
			options : {
				version	: dedalo_version,
				code	: code
			}
		}
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_code_update_info update_code api_response:', api_response);;
	}


	return api_response
}//end get_code_update_info



// @license-end
