// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../widget_common/js/widget_common.js'
	import {render_test_info} from '../js/render_test_info.js'



/**
* TEST_INFO
* Simple test widget for component_info
*/
export const test_info = function(){

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

	return true
}//end test_info



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// lifecycle
	test_info.prototype.init		= widget_common.prototype.init
	test_info.prototype.build		= widget_common.prototype.build
	test_info.prototype.render		= widget_common.prototype.render
	test_info.prototype.destroy		= widget_common.prototype.destroy
	// render
	test_info.prototype.edit		= render_test_info.prototype.edit
	test_info.prototype.list		= render_test_info.prototype.list



// @license-end
