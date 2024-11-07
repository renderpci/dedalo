// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_system_info} from './render_system_info.js'



/**
* SYSTEM_INFO
*/
export const system_info = function() {

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
}//end system_info



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	system_info.prototype.init		= widget_common.prototype.init
	system_info.prototype.build		= widget_common.prototype.build
	system_info.prototype.render		= widget_common.prototype.render
	system_info.prototype.destroy	= widget_common.prototype.destroy
	// // render
	system_info.prototype.edit		= render_system_info.prototype.list
	system_info.prototype.list		= render_system_info.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
system_info.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
		self.value = await self.get_widget_value()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_WIDGET_VALUE
* Get widget value from class maintenance
* The options 'name' property is the class method name
* @return result
* {
    "datalist": array as [{"name":"cpu","value":"Linux",..}]
    "errors": array|null
  }
*/
system_info.prototype.get_widget_value = async () => {

	// get files list updated
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'class_request',
			source	: {
				action : 'get_widget_value'
			},
			options	: {
				name : 'system_info'
			}
		}
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_widget_value system_info api_response:', api_response);;
	}

	const result = api_response.result


	return result
}//end get_widget_value



// @license-end
