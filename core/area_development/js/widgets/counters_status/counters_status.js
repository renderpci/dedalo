// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/widget_common.js'
	import {render_counters_status} from './render_counters_status.js'



/**
* COUNTERS_STATUS
*/
export const counters_status = function() {

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
}//end counters_status



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	counters_status.prototype.init		= widget_common.prototype.init
	counters_status.prototype.build		= widget_common.prototype.build
	counters_status.prototype.render	= widget_common.prototype.render
	counters_status.prototype.destroy	= widget_common.prototype.destroy
	// // render
	counters_status.prototype.edit		= render_counters_status.prototype.list
	counters_status.prototype.list		= render_counters_status.prototype.list



// @license-end
