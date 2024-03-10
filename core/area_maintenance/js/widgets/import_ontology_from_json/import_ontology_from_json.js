// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_import_ontology_from_json} from './render_import_ontology_from_json.js'



/**
* IMPORT_ONTOLOGY_FROM_JSON
*/
export const import_ontology_from_json = function() {

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
}//end import_ontology_from_json



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	import_ontology_from_json.prototype.init		= widget_common.prototype.init
	import_ontology_from_json.prototype.build		= widget_common.prototype.build
	import_ontology_from_json.prototype.render	= widget_common.prototype.render
	import_ontology_from_json.prototype.destroy	= widget_common.prototype.destroy
	// // render
	import_ontology_from_json.prototype.edit		= render_import_ontology_from_json.prototype.list
	import_ontology_from_json.prototype.list		= render_import_ontology_from_json.prototype.list



// @license-end
