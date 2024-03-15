// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_get_coins_by_period} from '../js/render_get_coins_by_period.js'



export const get_coins_by_period = function(){

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
}//end get_coins_by_period



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	get_coins_by_period.prototype.init		= widget_common.prototype.init
	get_coins_by_period.prototype.build		= widget_common.prototype.build
	get_coins_by_period.prototype.render	= widget_common.prototype.render
	get_coins_by_period.prototype.destroy	= widget_common.prototype.destroy
	// render
	get_coins_by_period.prototype.edit		= render_get_coins_by_period.prototype.edit



// @license-end
