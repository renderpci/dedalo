// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_regenerate_relations} from './render_regenerate_relations.js'



/**
* REGENERATE_RELATIONS
*/
export const regenerate_relations = function() {

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
}//end regenerate_relations



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	regenerate_relations.prototype.init		= widget_common.prototype.init
	regenerate_relations.prototype.build	= widget_common.prototype.build
	regenerate_relations.prototype.render	= widget_common.prototype.render
	regenerate_relations.prototype.destroy	= widget_common.prototype.destroy
	// render
	regenerate_relations.prototype.edit		= render_regenerate_relations.prototype.list
	regenerate_relations.prototype.list		= render_regenerate_relations.prototype.list



// @license-end
