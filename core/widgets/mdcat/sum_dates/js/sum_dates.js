// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_sum_dates} from '../js/render_sum_dates.js'



export const sum_dates = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node

	this.events_tokens = []

	this.status

	return true
}//end sum_dates



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	sum_dates.prototype.init	= widget_common.prototype.init
	sum_dates.prototype.build	= widget_common.prototype.build
	sum_dates.prototype.render	= widget_common.prototype.render
	sum_dates.prototype.destroy	= widget_common.prototype.destroy
	// render
	sum_dates.prototype.edit	= render_sum_dates.prototype.edit



// @license-end
