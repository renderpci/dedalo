// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_ontology_processes} from './render_ontology_processes.js'



/**
* ontology_processes
*/
export const ontology_processes = function() {

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
}//end ontology_processes



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	ontology_processes.prototype.init		= widget_common.prototype.init
	ontology_processes.prototype.build		= widget_common.prototype.build
	ontology_processes.prototype.render	= widget_common.prototype.render
	ontology_processes.prototype.destroy	= widget_common.prototype.destroy
	// render
	ontology_processes.prototype.edit		= render_ontology_processes.prototype.list
	ontology_processes.prototype.list		= render_ontology_processes.prototype.list



/**
* SUPPORTED_CODE_VERSION
* Compare given required_version with current Dédalo version
* (from page_globals environment value)
* to determine whether it is less than, equal to or greater than current.
* If is greater than current installed returns false, else true
* This required_version value comes from Ontology root term (dd1) properties
* @param string required_version
* 	Like '6.2.5'
* @return bool
*/
ontology_processes.prototype.supported_code_version = (required_version) => {

	// Parse version strings into arrays of integers
	const required_version_parts	= required_version.split('.').map(Number);
	const current_version_parts		= page_globals.dedalo_version.split('.').map(Number);

	// Iterate over version parts and compare
	for (let i = 0; i < required_version_parts.length; i++) {
		if (current_version_parts[i] > required_version_parts[i]) {
			return true; // Current version is greater
		} else if (current_version_parts[i] < required_version_parts[i]) {
			return false; // Current version is less
		}
	}

	// If all parts are equal, current version is supported
	return true;
}//end supported_code_version



// @license-end
