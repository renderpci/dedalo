// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_text_area} from '../../component_text_area/js/render_component_text_area.js'



export const component_text_area = function(){

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
}//end component_text_area



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_text_area.prototype.init 	 		= component_common.prototype.init
	component_text_area.prototype.build 		= component_common.prototype.build
	component_text_area.prototype.render 		= common.prototype.render
	component_text_area.prototype.refresh 		= common.prototype.refresh
	component_text_area.prototype.destroy 		= common.prototype.destroy

	// change data
	component_text_area.prototype.save 	 			= component_common.prototype.save
	component_text_area.prototype.change_value 		= component_common.prototype.change_value
	component_text_area.prototype.update_data_value	= component_common.prototype.update_data_value
	component_text_area.prototype.update_datum 		= component_common.prototype.update_datum

	// render
	component_text_area.prototype.list 			= render_component_text_area.prototype.list
	component_text_area.prototype.edit 			= render_component_text_area.prototype.edit
	component_text_area.prototype.edit_in_list	= render_component_text_area.prototype.edit
	component_text_area.prototype.search 		= render_component_text_area.prototype.search
	component_text_area.prototype.change_mode 	= component_common.prototype.change_mode

