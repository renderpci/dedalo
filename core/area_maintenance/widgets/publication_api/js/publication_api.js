// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_publication_api} from './render_publication_api.js'



/**
* PUBLICATION_API
*/
export const publication_api = function() {

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
}//end publication_api



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	publication_api.prototype.init		= widget_common.prototype.init
	publication_api.prototype.build		= widget_common.prototype.build
	publication_api.prototype.render	= widget_common.prototype.render
	publication_api.prototype.destroy	= widget_common.prototype.destroy
	// // render
	publication_api.prototype.edit		= render_publication_api.prototype.list
	publication_api.prototype.list		= render_publication_api.prototype.list



// @license-end
