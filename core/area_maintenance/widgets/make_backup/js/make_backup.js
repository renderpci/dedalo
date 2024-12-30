// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_make_backup} from './render_make_backup.js'



/**
* MAKE_BACKUP
*/
export const make_backup = function() {

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
}//end make_backup



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	make_backup.prototype.init		= widget_common.prototype.init
	make_backup.prototype.build		= widget_common.prototype.build
	make_backup.prototype.render	= widget_common.prototype.render
	make_backup.prototype.destroy	= widget_common.prototype.destroy
	// render
	make_backup.prototype.edit		= render_make_backup.prototype.list
	make_backup.prototype.list		= render_make_backup.prototype.list



// @license-end
