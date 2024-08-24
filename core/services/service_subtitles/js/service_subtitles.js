// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../common/js/event_manager.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {clone, dd_console} from '../../../common/js/utils/index.js'
	import {common} from '../../../common/js/common.js'



/**
* SERVICE_SUBTITLES
* Common service to manage subtitles from transcription
* It is used by tools like 'transcription', 'tool_subtitle'
*/
export const service_subtitles = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= null
	this.type				= null
	this.caller				= null

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	service_subtitles.prototype.render	= common.prototype.render
	service_subtitles.prototype.destroy	= common.prototype.destroy
	service_subtitles.prototype.refresh	= common.prototype.refresh
	service_subtitles.prototype.edit	= render_edit_service_subtitles.prototype.edit



/**
* INIT
*/
service_subtitles.prototype.init = async function(options) {

	const self = this

	// call the generic common init
		const common_init = await common.prototype.init.call(this, options);

	// fix
		self.model = options.model || 'service_subtitles'

	// events

	return common_init
}//end init



/**
* BUILD
*/
service_subtitles.prototype.build = async function(autoload=false) {

	const self = this


	return true
}//end build_custom



// @license-end
