// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_build_install_version} from './render_build_install_version.js'



/**
* BUILD_INSTALL_VERSION
*/
export const build_install_version = function() {

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
}//end build_install_version



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	build_install_version.prototype.init	= widget_common.prototype.init
	build_install_version.prototype.build	= widget_common.prototype.build
	build_install_version.prototype.render	= widget_common.prototype.render
	build_install_version.prototype.destroy	= widget_common.prototype.destroy
	// render
	build_install_version.prototype.edit	= render_build_install_version.prototype.list
	build_install_version.prototype.list	= render_build_install_version.prototype.list



// @license-end
