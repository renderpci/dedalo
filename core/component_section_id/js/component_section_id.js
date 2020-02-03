/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_section_id} from '../../component_section_id/js/render_component_section_id.js'



export const component_section_id = function(){

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
		this.id

	return true
}//end component_section_id



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_section_id.prototype.init 	 			= component_common.prototype.init
	component_section_id.prototype.build 	 			= component_common.prototype.build
	component_section_id.prototype.destroy 	 			= common.prototype.destroy
	component_section_id.prototype.save 	 			= component_common.prototype.save
	component_section_id.prototype.update_data_value	= component_common.prototype.update_data_value
	component_section_id.prototype.load_data 			= component_common.prototype.load_data
	component_section_id.prototype.get_value 			= component_common.prototype.get_value
	component_section_id.prototype.set_value 			= component_common.prototype.set_value

// render
	component_section_id.prototype.render 	= common.prototype.render
	component_section_id.prototype.list 	= render_component_section_id.prototype.list
	component_section_id.prototype.edit 	= render_component_section_id.prototype.edit
	component_section_id.prototype.search 	= render_component_section_id.prototype.search

