// import
	import {data_manager} from '../../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../common/js/instances.js'
	import {common} from '../../../common/js/common.js'
	import {tool_common} from '../../../tool_common/js/tool_common.js'
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
}//end page



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

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url = DEDALO_CORE_URL + "/tools/tool_dd_label/trigger.tool_dd_label.php"

	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// languages
		self.loaded_langs 	= page_globals.dedalo_projects_default_langs
		self.ar_data		= this.caller.data.value[0]

		console.log("self.data", self.ar_data);
		console.log("self.loaded_langs", self.loaded_langs);

	return common_init
}//end init
