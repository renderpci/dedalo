// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_add_hierarchy} from './render_add_hierarchy.js'



/**
* ADD_HIERARCHY
*/
export const add_hierarchy = function() {

	this.id

	this.value

	this.node

	this.events_tokens	= []
	this.ar_instances	= []

	this.status
}//end add_hierarchy



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	add_hierarchy.prototype.init		= widget_common.prototype.init
	// add_hierarchy.prototype.build	= widget_common.prototype.build
	add_hierarchy.prototype.render		= widget_common.prototype.render
	add_hierarchy.prototype.destroy		= widget_common.prototype.destroy
	add_hierarchy.prototype.refresh		= widget_common.prototype.refresh
	// render
	add_hierarchy.prototype.edit		= render_add_hierarchy.prototype.list
	add_hierarchy.prototype.list		= render_add_hierarchy.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
add_hierarchy.prototype.build = async function(autoload=false) {

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
* @return object result
*/
add_hierarchy.prototype.get_widget_value = async () => {

	// get value from API
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'get_widget_value',
			prevent_lock	: true,
			source			: {
				type	: 'widget',
				model	: 'add_hierarchy'
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_widget_value add_hierarchy api_response:', api_response);;
	}

	const result = api_response.result


	return result
}//end get_widget_value



// @license-end
