// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {render_register_tools} from './render_register_tools.js'



/**
* REGISTER_TOOLS
*/
export const register_tools = function() {

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
}//end register_tools



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	register_tools.prototype.init		= widget_common.prototype.init
	register_tools.prototype.build		= widget_common.prototype.build
	register_tools.prototype.render		= widget_common.prototype.render
	register_tools.prototype.destroy	= widget_common.prototype.destroy
	// // render
	register_tools.prototype.edit		= render_register_tools.prototype.list
	register_tools.prototype.list		= render_register_tools.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
register_tools.prototype.build = async function(autoload=false) {

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
*	"datalist": array as [{"developer":"Dédalo Team","name":"tool_cataloging",..}]
*	"errors": array|null
* }
*/
register_tools.prototype.get_widget_value = async () => {

	// get files list updated
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'get_widget_value',
			source	: {
				type	: 'widget',
				model	: 'register_tools'
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) get_widget_value resgister_tools api_response:', api_response);;
	}

	const result = api_response.result


	return result
}//end get_widget_value



// @license-end
