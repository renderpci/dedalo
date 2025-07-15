// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_check_config} from './render_check_config.js'



/**
* CHECK_CONFIG
*/
export const check_config = function() {

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
}//end check_config



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	check_config.prototype.init		= widget_common.prototype.init
	check_config.prototype.build	= widget_common.prototype.build
	check_config.prototype.render	= widget_common.prototype.render
	check_config.prototype.refresh	= widget_common.prototype.refresh
	check_config.prototype.destroy	= widget_common.prototype.destroy
	// // render
	check_config.prototype.edit		= render_check_config.prototype.list
	check_config.prototype.list		= render_check_config.prototype.list



/**
* GET_WIDGET_VALUE
* Get widget value from class maintenance
* The options 'model' property is the class method name
* @return array result
* [{
*   config_constants_list : array as ["DEDALO_HOST","DEDALO_PROTOCOL"]
*   config_vs_sample : array as ["DEDALO_OLD_HOST"],
* 	sample_config_constants_list :["DEDALO_HOST",..]
* 	sample_vs_config : []
* }]
*/
check_config.prototype.get_widget_value = async () => {

	// get value info
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'get_widget_value',
			prevent_lock	: true,
			source	: {
				type	: 'widget',
				model	: 'check_config'
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_widget_value check_config api_response:', api_response);
	}

	const result = api_response?.result || []


	return result
}//end get_widget_value



// @license-end
