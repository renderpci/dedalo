/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/widget_common.js'
	import {render_get_archive_weights} from '../js/render_get_archive_weights.js'



export const get_archive_weights = function(){

	this.id

	this.section_tipo
	this.section_id
	this.lang
	this.mode

	this.value

	this.node = null

	this.events_tokens = []

	this.status

	return true
}//end get_archive_weights



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	get_archive_weights.prototype.init		= widget_common.prototype.init
	get_archive_weights.prototype.build		= widget_common.prototype.build
	get_archive_weights.prototype.render	= widget_common.prototype.render
	get_archive_weights.prototype.destroy	= widget_common.prototype.destroy
	// render
	get_archive_weights.prototype.edit		= render_get_archive_weights.prototype.edit
