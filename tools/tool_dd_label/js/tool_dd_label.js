// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_dd_label} from './render_tool_dd_label.js'



/**
* TOOL_UPLOAD
* Tool to translate contents from one language to other in any text component
*/
export const tool_dd_label = function () {

	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type
	this.caller

	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_dd_label.prototype.render 		= common.prototype.render
	tool_dd_label.prototype.destroy 	= common.prototype.destroy
	tool_dd_label.prototype.build 		= tool_common.prototype.build
	tool_dd_label.prototype.edit 		= render_tool_dd_label.prototype.edit



/**
* INIT
*/
tool_dd_label.prototype.init = async function(options) {

	const self = this

	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// languages
		self.loaded_langs 	= page_globals.dedalo_projects_default_langs
		self.ar_data		= typeof this.caller.data.value[0]==="object" && JSON.stringify(this.caller.data.value[0])==="{}"
			? []
			: this.caller.data.value[0]
		self.ar_names 		= [...new Set(self.ar_data.map(item => item.name))];


	return common_init
};//end init



/**
* UPDATE_DATA
* Set new json data to json editor
*/
tool_dd_label.prototype.update_data = function() {
	
	const self = this
	this.caller.set_value(self.ar_data)

	return true
};//end update_data
