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

	// current code version from environment
	const current_version = page_globals.dedalo_version

	const ar_required_version	= required_version.split('.')
	const ar_current_version	= current_version.split('.')

	if (parseInt(ar_required_version[0]) > parseInt(ar_current_version[0])) {
		return true
	}

	if (parseInt(ar_required_version[0]) === parseInt(ar_current_version[0]) &&
		parseInt(ar_required_version[1]) > parseInt(ar_current_version[1])
		) {
		return true
	}

	if (parseInt(ar_required_version[0]) === parseInt(ar_current_version[0]) &&
		parseInt(ar_required_version[1]) === parseInt(ar_current_version[1]) &&
		parseInt(ar_required_version[2]) >= parseInt(ar_current_version[2])
		) {
		return true
	}


	return false
}//end supported_code_version



// @license-end
