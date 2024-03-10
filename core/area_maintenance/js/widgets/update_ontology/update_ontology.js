// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_update_ontology} from './render_update_ontology.js'



/**
* UPDATE_ONTOLOGY
*/
export const update_ontology = function() {

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
}//end update_ontology



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	update_ontology.prototype.init		= widget_common.prototype.init
	update_ontology.prototype.build		= widget_common.prototype.build
	update_ontology.prototype.render	= widget_common.prototype.render
	update_ontology.prototype.destroy	= widget_common.prototype.destroy
	// render
	update_ontology.prototype.edit		= render_update_ontology.prototype.list
	update_ontology.prototype.list		= render_update_ontology.prototype.list



// @license-end
