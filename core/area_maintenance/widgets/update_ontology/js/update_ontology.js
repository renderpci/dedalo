// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports	
	import {data_manager} from '../../../../common/js/data_manager.js'
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {area_maintenance} from '../../../../area_maintenance/js/area_maintenance.js'
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
	update_ontology.prototype.get_value	= area_maintenance.prototype.get_value
	// render
	update_ontology.prototype.edit		= render_update_ontology.prototype.list
	update_ontology.prototype.list		= render_update_ontology.prototype.list



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
update_ontology.prototype.supported_code_version = (required_version) => {

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



/**
* UPDATE_ONTOLOGY
* Execs the update_ontology action on server using the Working API dd_area_maintenance_api
* @param object options
* {
* 	server	: server,
	files	: selected_files,
	info	: result.info
* }
* @return object api_response
*/
update_ontology.prototype.update_ontology = async (options) => {

	const api_response = await data_manager.request({
		use_worker	: true,
		body		: {
			dd_api	: 'dd_area_maintenance_api',
			action	: 'class_request',
			source	: {
				action	: 'update_ontology',
			},
			options : options
		},
		retries : 1, // one try only
		timeout : 3600 * 1000 // 1 hour waiting response
	})
	if(SHOW_DEBUG===true) {
		console.log('))) update_ontology api_response:', api_response);
	}


	return api_response
}//end update_ontology



// @license-end
