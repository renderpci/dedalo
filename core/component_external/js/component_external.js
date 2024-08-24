// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_list_component_external} from '../../component_external/js/render_list_component_external.js'
	import {render_edit_component_external} from '../../component_external/js/render_edit_component_external.js'



export const component_external = function(){

	this.id				= null

	// element properties declare
	this.model			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null

	this.section_lang	= null
	this.context		= null
	this.data			= null
	this.parent			= null
	this.node			= null

	this.tools			= null

	this.duplicates		= false
}//end component_external



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_external.prototype.init				= component_common.prototype.init
	component_external.prototype.build				= component_common.prototype.build
	component_external.prototype.render				= common.prototype.render
	component_external.prototype.refresh			= common.prototype.refresh
	component_external.prototype.destroy			= common.prototype.destroy

	// change data
	component_external.prototype.save				= component_common.prototype.save
	component_external.prototype.update_data_value	= component_common.prototype.update_data_value
	component_external.prototype.update_datum		= component_common.prototype.update_datum
	component_external.prototype.change_value		= component_common.prototype.change_value
	component_external.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_external.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_external.prototype.list				= render_list_component_external.prototype.list
	component_external.prototype.tm					= render_edit_component_external.prototype.edit
	component_external.prototype.edit				= render_edit_component_external.prototype.edit
	// component_external.prototype.search			= render_search_component_external.prototype.search



// @license-end
