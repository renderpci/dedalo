// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_sequences_status} from './render_sequences_status.js'



/**
* SEQUENCES_STATUS
*/
export const sequences_status = function() {

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
}//end sequences_status



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	sequences_status.prototype.init		= widget_common.prototype.init
	sequences_status.prototype.build	= widget_common.prototype.build
	sequences_status.prototype.render	= widget_common.prototype.render
	sequences_status.prototype.destroy	= widget_common.prototype.destroy
	// // render
	sequences_status.prototype.edit		= render_sequences_status.prototype.list
	sequences_status.prototype.list		= render_sequences_status.prototype.list



// @license-end
