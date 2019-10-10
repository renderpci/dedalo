// import
	import {common} from '../../common/js/common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {render_tool_lang} from './render_tool_lang.js'



/**
* PAGE
*/
export const tool_lang = function () {

	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens

	return true
}//end page

tool_lang.prototype.render 				= common.prototype.render