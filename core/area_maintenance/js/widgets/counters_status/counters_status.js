// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {dd_request_idle_callback} from '../../../../common/js/events.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_counters_status} from './render_counters_status.js'



/**
* COUNTERS_STATUS
*/
export const counters_status = function() {

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
}//end counters_status



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	counters_status.prototype.init		= widget_common.prototype.init
	counters_status.prototype.build		= widget_common.prototype.build
	counters_status.prototype.render	= widget_common.prototype.render
	counters_status.prototype.refresh	= widget_common.prototype.refresh
	counters_status.prototype.destroy	= widget_common.prototype.destroy
	// // render
	counters_status.prototype.edit		= render_counters_status.prototype.list
	counters_status.prototype.list		= render_counters_status.prototype.list



/**
* MODIFY_COUNTER
* Execute counter maintenance operations: reset|fix
* @param object options
* @return bool
*/
counters_status.prototype.modify_counter = async function(options) {

	// options
		const body_response		= options.body_response
		const section_tipo		= options.section_tipo
		const counter_action	= options.counter_action

	// self
		const self = this

	// content_data
		const content_data = self.node.content_data

	// data_manager
		const api_response = await data_manager.request({
			use_worker	: true,
			body		: {
				dd_api	: 'dd_area_maintenance_api',
				action	: 'modify_counter',
				options	: {
					section_tipo	: section_tipo,
					counter_action	: counter_action
				}
			}
		})
		if(SHOW_DEBUG===true) {
			console.log('modify_counter api_response:', api_response);
		}

		if (api_response.result===true) {

			// success

			body_response.innerHTML = api_response.msg

			// update datalist value
			self.value.datalist = api_response.datalist

			dd_request_idle_callback(
				() => {
					// refresh DOM only
					self.refresh({
						build_autoload	: false, // default is true
						destroy			: true // default is true
					})
				}
			)

			alert(api_response.msg)

		}else{
			// error

			body_response.innerHTML = api_response.msg || 'Unknown error'

			alert('Error! \n' + (api_response.msg || 'Unknown error'))
		}


	return true
}//end counters_status.prototype.modify_counter



// @license-end
