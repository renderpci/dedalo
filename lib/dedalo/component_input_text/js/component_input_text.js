// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_input_text} from '../../component_input_text/js/render_component_input_text.js'



export const component_input_text = function(){

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

	return true
}//end component_input_text



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_input_text.prototype.init 	 			= component_common.prototype.init
	component_input_text.prototype.render 				= common.prototype.render
	component_input_text.prototype.destroy 	 			= common.prototype.destroy
	component_input_text.prototype.refresh 				= common.prototype.refresh
	component_input_text.prototype.save 	 			= component_common.prototype.save
	component_input_text.prototype.load_data 			= component_common.prototype.load_data
	component_input_text.prototype.get_value 			= component_common.prototype.get_value
	component_input_text.prototype.set_value 			= component_common.prototype.set_value
	component_input_text.prototype.update_data_value	= component_common.prototype.update_data_value
	component_input_text.prototype.update_datum 		= component_common.prototype.update_datum
	component_input_text.prototype.remove_value 		= component_common.prototype.remove_value
	component_input_text.prototype.add_value 			= component_common.prototype.add_value
	component_input_text.prototype.update_value 		= component_common.prototype.update_value

	// render
	component_input_text.prototype.list 		= render_component_input_text.prototype.list
	component_input_text.prototype.edit 		= render_component_input_text.prototype.edit
	component_input_text.prototype.edit_in_list	= render_component_input_text.prototype.edit
	component_input_text.prototype.search 		= render_component_input_text.prototype.search
	component_input_text.prototype.change_mode 	= component_common.prototype.change_mode



/**
* BUILD
*/
component_input_text.prototype.build = function() {


	return true
}//end build



/**
* ACTIVE
* Custom active function triggered after ui.active has finish
*/
component_input_text.prototype.active = function() {

	console.log("Yujuu! This is my component custom active test triggered after ui.active. id:", this.id)

	return true
}//end active


