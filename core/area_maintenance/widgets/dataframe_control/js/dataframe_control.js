// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
	import {render_dataframe_control} from './render_dataframe_control.js'



/**
* DATAFRAME_CONTROL
* Maintenance widget: dataframe pairing integrity report and orphan cleanup
*/
export const dataframe_control = function() {

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
}//end dataframe_control



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	dataframe_control.prototype.init		= widget_common.prototype.init
	dataframe_control.prototype.render		= widget_common.prototype.render
	dataframe_control.prototype.refresh		= widget_common.prototype.refresh
	dataframe_control.prototype.destroy		= widget_common.prototype.destroy
	dataframe_control.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	dataframe_control.prototype.edit		= render_dataframe_control.prototype.list
	dataframe_control.prototype.list		= render_dataframe_control.prototype.list



/**
* BUILD
* Custom build overwrites common widget method
* @param bool autoload = false
* @return bool
*/
dataframe_control.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await widget_common.prototype.build.call(this, autoload);

	try {

		self.value = await self.get_value()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* RUN_ACTION
* Executes a widget action (run_check | run_fix) through widget_request
* @param object options
* {
* 	action: string 'run_check'|'run_fix'
* }
* @return object|null api_response
*/
dataframe_control.prototype.run_action = async function(options) {

	const self = this

	const action = options.action

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api			: 'dd_area_maintenance_api',
			action			: 'widget_request',
			prevent_lock	: true,
			source	: {
				type	: 'widget',
				model	: 'dataframe_control',
				action	: action
			},
			options	: {}
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('dataframe_control '+action+' api_response:', api_response);
	}

	return api_response
}//end run_action



// @license-end
