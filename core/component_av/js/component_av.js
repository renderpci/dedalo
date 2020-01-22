/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_av} from '../../component_av/js/render_component_av.js'



export const component_av = function(){

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
}//end component_av



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_av.prototype.init 	 			= component_common.prototype.init
	component_av.prototype.build 	 			= component_common.prototype.build
	component_av.prototype.render 				= common.prototype.render
	component_av.prototype.refresh 				= common.prototype.refresh
	component_av.prototype.destroy 	 			= common.prototype.destroy

	// change data
	component_av.prototype.save 	 			= component_common.prototype.save
	component_av.prototype.update_data_value	= component_common.prototype.update_data_value
	component_av.prototype.update_datum 		= component_common.prototype.update_datum
	component_av.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_av.prototype.list 				= render_component_av.prototype.list
	component_av.prototype.edit 				= render_component_av.prototype.edit
	component_av.prototype.edit_in_list			= render_component_av.prototype.edit
	component_av.prototype.search 				= render_component_av.prototype.search
	component_av.prototype.change_mode 			= component_common.prototype.change_mode


