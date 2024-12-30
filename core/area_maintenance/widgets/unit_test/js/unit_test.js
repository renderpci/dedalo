// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// imports
	import {widget_common} from '../../../../widgets/widget_common/js/widget_common.js'
	import {render_unit_test} from './render_unit_test.js'



/**
* UNIT_TEST
*/
export const unit_test = function() {

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
}//end unit_test



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	// // lifecycle
	unit_test.prototype.init	= widget_common.prototype.init
	unit_test.prototype.build	= widget_common.prototype.build
	unit_test.prototype.render	= widget_common.prototype.render
	unit_test.prototype.destroy	= widget_common.prototype.destroy
	// // render
	unit_test.prototype.edit	= render_unit_test.prototype.list
	unit_test.prototype.list	= render_unit_test.prototype.list



// @license-end
