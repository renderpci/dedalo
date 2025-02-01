// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_dedalo_version} from './render_dedalo_version.js'



/**
* dedalo_version
*/
export const dedalo_version = function() {

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
}//end dedalo_version



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	dedalo_version.prototype.init		= widget_common.prototype.init
	dedalo_version.prototype.build		= widget_common.prototype.build
	dedalo_version.prototype.render		= widget_common.prototype.render
	dedalo_version.prototype.destroy	= widget_common.prototype.destroy
	// // render
	dedalo_version.prototype.edit		= render_dedalo_version.prototype.list
	dedalo_version.prototype.list		= render_dedalo_version.prototype.list



// @license-end
