// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_update_data_version} from './render_update_data_version.js'



/**
* UPDATE_DATA_VERSION
*/
export const update_data_version = function() {

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.value			= null

	this.status
}//end update_data_version



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	// update_data_version.prototype.init	= widget_common.prototype.init
	// update_data_version.prototype.build	= widget_common.prototype.build
	update_data_version.prototype.render	= widget_common.prototype.render
	update_data_version.prototype.refresh	= widget_common.prototype.refresh
	update_data_version.prototype.destroy	= widget_common.prototype.destroy
	// render
	update_data_version.prototype.edit		= render_update_data_version.prototype.list
	update_data_version.prototype.list		= render_update_data_version.prototype.list



/**
* INIT
* Custom init
*/
update_data_version.prototype.init = async function(options) {

	const self = this

	// call generic common tool init
		const common_init = await widget_common.prototype.init.call(this, options);


	// event publish
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
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
update_data_version.prototype.build = async function(autoload=false) {

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
    "update_version": null,
    "current_version_in_db": [6,2,9],
    "dedalo_version": [6,3,0],
    "updates": null
  }
*/
update_data_version.prototype.get_widget_value = async () => {

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
				name : 'update_data_version'
			}
		}
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_widget_value api_response:', api_response);;
	}

	const result = api_response.result


	return result
}//end get_widget_value



// @license-end
