// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_input_text} from '../../component_input_text/js/render_component_input_text.js'



export const component_input_text = function(){
	
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
}//end component_input_text



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_input_text.prototype.init 	 			= component_common.prototype.init
	component_input_text.prototype.save 	 			= component_common.prototype.save
	component_input_text.prototype.load_data 			= component_common.prototype.load_data
	component_input_text.prototype.get_value 			= component_common.prototype.get_value
	component_input_text.prototype.set_value 			= component_common.prototype.set_value
	component_input_text.prototype.update_data_value 	= component_common.prototype.update_data_value			

	// render
	component_input_text.prototype.render 			= component_common.prototype.render
	component_input_text.prototype.list 			= render_component_input_text.prototype.list
	component_input_text.prototype.edit 			= render_component_input_text.prototype.edit
	component_input_text.prototype.rebuild_nodes 	= component_common.prototype.rebuild_nodes



/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*/
/*
component_input_text.prototype.update_data_value_from_dom = function(selected_node) {

	const self = this 
	const node = selected_node.parentNode

	// inputs
		const ar_inputs = node.querySelectorAll('input')

		const ar_value  = []
		for (let i = 0; i < ar_inputs.length; i++) {
			ar_value.push(ar_inputs[i].value)
		}

	// set value in data instance
		self.data.value = ar_value

			console.log("data:",self.data.value);

	return true	
}//end update_data_value_from_dom

*/



/**
* ACTIVE
* Custom active function triggered after ui.active has finish
*/
component_input_text.prototype.active = function() {
	
	console.log("Yujuu! This is my custom active test triggered after ui.active. id:", this.id)

	return true
}//end active


