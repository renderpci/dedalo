/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_move_tld} from './render_move_tld.js'



/**
* MOVE_TLD
*/
export const move_tld = function() {

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
}//end move_tld



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	move_tld.prototype.init		= widget_common.prototype.init
	move_tld.prototype.build	= widget_common.prototype.build
	move_tld.prototype.render	= widget_common.prototype.render
	move_tld.prototype.destroy	= widget_common.prototype.destroy
	// render
	move_tld.prototype.edit		= render_move_tld.prototype.list
	move_tld.prototype.list		= render_move_tld.prototype.list
