// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/widget_common.js'
	import {render_user_activity} from '../js/render_user_activity.js'



export const user_activity = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.status

	this.events_tokens = []
}//end user_activity



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	user_activity.prototype.init	= widget_common.prototype.init
	user_activity.prototype.build	= widget_common.prototype.build
	user_activity.prototype.destroy	= widget_common.prototype.destroy
	user_activity.prototype.render	= widget_common.prototype.render
	// render
	user_activity.prototype.edit	= render_user_activity.prototype.edit
	user_activity.prototype.list	= render_user_activity.prototype.edit



// @license-end
