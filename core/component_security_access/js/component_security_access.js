/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_security_access} from '../../component_security_access/js/render_component_security_access.js'



export const component_security_access = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	this.tools

	return true
};//end component_security_access



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_security_access.prototype.init				= component_common.prototype.init
	component_security_access.prototype.build				= component_common.prototype.build
	component_security_access.prototype.render				= common.prototype.render
	component_security_access.prototype.refresh				= common.prototype.refresh
	component_security_access.prototype.destroy				= common.prototype.destroy

	// change data
	component_security_access.prototype.save				= component_common.prototype.save
	component_security_access.prototype.update_data_value	= component_common.prototype.update_data_value
	component_security_access.prototype.update_datum		= component_common.prototype.update_datum
	component_security_access.prototype.change_value		= component_common.prototype.change_value
	component_security_access.prototype.build_dd_request	= common.prototype.build_dd_request

	// render
	component_security_access.prototype.mini				= render_component_security_access.prototype.mini
	component_security_access.prototype.list				= render_component_security_access.prototype.list
	component_security_access.prototype.edit				= render_component_security_access.prototype.edit
	component_security_access.prototype.edit_in_list		= render_component_security_access.prototype.edit
	component_security_access.prototype.search				= render_component_security_access.prototype.search
	component_security_access.prototype.change_mode			= component_common.prototype.change_mode
