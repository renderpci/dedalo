// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/widget_common.js'
	import {render_export_ontology_to_json} from './render_export_ontology_to_json.js'



/**
* EXPORT_ONTOLOGY_TO_JSON
*/
export const export_ontology_to_json = function() {

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
}//end export_ontology_to_json



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	export_ontology_to_json.prototype.init		= widget_common.prototype.init
	export_ontology_to_json.prototype.build		= widget_common.prototype.build
	export_ontology_to_json.prototype.render	= widget_common.prototype.render
	export_ontology_to_json.prototype.destroy	= widget_common.prototype.destroy
	// // render
	export_ontology_to_json.prototype.edit		= render_export_ontology_to_json.prototype.list
	export_ontology_to_json.prototype.list		= render_export_ontology_to_json.prototype.list



// @license-end
