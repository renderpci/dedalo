// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, JSONEditor, SHOW_DEBUG, DEDALO_ROOT_WEB */
/*eslint no-undef: "error"*/



// imports
	import {common, build_autoload} from '../../common/js/common.js'
	import {area_common} from '../../area_common/js/area_common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_area_maintenance, build_form} from './render_area_maintenance.js'



/**
* AREA_MAINTENANCE
*/
export const area_maintenance = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.widgets

	this.node
	this.status


	return true
}//end area_maintenance



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	area_maintenance.prototype.refresh			= common.prototype.refresh
	area_maintenance.prototype.destroy			= common.prototype.destroy
	area_maintenance.prototype.build_rqo_show	= common.prototype.build_rqo_show
	area_maintenance.prototype.edit				= render_area_maintenance.prototype.edit
	area_maintenance.prototype.list				= render_area_maintenance.prototype.list



/**
* INIT
* @param object options
* @return bool common_init
* Custom init
*/
area_maintenance.prototype.init = async function(options) {

	// call the generic common tool init
		const common_init = await area_common.prototype.init.call(this, options);

	// load additional JS/CSS
		// highlightjs from https://highlightjs.org/
		common.prototype.load_style(
			DEDALO_ROOT_WEB + '/lib/highlightjs/styles/atom-one-dark.css'
		)


	return common_init
}//end init



/**
* BUILD
* @return promise
*	bool true
*/
area_maintenance.prototype.build = async function(autoload=true) {

	const self = this

	// status update
		self.status = 'building'

	// request_config_object
		self.request_config_object	= (self.context && self.context.request_config)
			? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
			: {}

	// rqo build
		self.rqo = self.rqo || await self.build_rqo_show(self.request_config_object, 'get_data')
		self.rqo.prevent_lock = true

	// load from DDBB
		if (autoload===true) {

			// build_autoload
			// Use unified way to load context and data with
			// errors and not login situation managing
				const api_response = await build_autoload(self)

				// server: wrong response
				if (!api_response) {
					return false
				}
				// server: bad build context
				if(!api_response.result.context.length){
					console.error("Error!!!!, area_maintenance without context:", api_response);
					return false
				}

			// set the result to the datum
				self.datum	= api_response.result

			// set context and data to current instance
			// set Context
				// context is only set when it's empty the origin context,
				// if the instance has previous context, it will need to preserve.
				// because the context could be modified by ddo configuration and it can no be changed
				// ddo_map -----> context
				// ex: oh27 define the specific ddo_map for rsc368
				// 		{ mode: list, view: line, children_view: text ... }
				// if you call to API to get the context of the rsc368 the context will be the default config
				// 		{ mode: edit, view: default }
				// but it's necessary preserve the specific ddo_map configuration in the new context.
				// Context is set and changed in section_record.js to get the ddo_map configuration
				if(!self.context){
					const context = self.datum.context.find(el => el.tipo===self.tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context || {}
					}
				}
				self.data		= self.datum.data.find(el => el.tipo===el.section_tipo)
				self.widgets	= self.data && self.data.datalist
					? self.data.datalist
					: []

			// rebuild the request_config_object and rqo in the instance
			// request_config_object
				self.request_config_object = self.context
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: null

			// rqo build
				self.rqo = await self.build_rqo_show(self.request_config_object, 'get_data')
		}//end if (autoload===true)

	// label
		self.label = self.context
			? self.context.label
			: 'Area Development'

	// status update
		self.status = 'built'


	return true
}//end build



/**
* RENDER
* @param object options = {}
*	render_level : level of deep that is rendered (full | content)
* @return promise
*	node first DOM node stored in instance 'node' array
*/
area_maintenance.prototype.render = async function(options={}) {

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)


	return result_node
}//end render



/**
* INIT_FORM
* Alias of build_form
* @param object widget_object
* @return HTMLElement form_container
*/
area_maintenance.prototype.init_form = function(widget_object) {

	return build_form(widget_object)
}//end init_form



/**
* GET_VALUE
* @return mixed result
* 	API response value
*/
area_maintenance.prototype.get_value = async function () {

	if (!this.id || !this.id.length) {
		console.warn('this:', this);
		throw new Error('Invalid widget id')
	}

	// get files list updated
	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'get_widget_value',
			prevent_lock	: true,
			source	: {
				type	: 'widget',
				model	: this.id
			}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log(`))) get_value ${this.id} api_response:`, api_response);
	}

	const result = api_response?.result


	return result
}//end get_value



// @license-end
