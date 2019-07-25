// imports
	import {component_common} from '../../common/js/component_common.js'
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
	component_text_area.prototype.init 	 			= component_common.prototype.init
	component_text_area.prototype.save 	 			= component_common.prototype.save
	component_text_area.prototype.load_data 		= component_common.prototype.load_data
	component_text_area.prototype.get_value 		= component_common.prototype.get_value
	component_text_area.prototype.set_value 		= component_common.prototype.set_value
	component_text_area.prototype.update_data_value = component_common.prototype.update_data_value

	// render
	component_text_area.prototype.render 	= component_common.prototype.render
	component_text_area.prototype.list 		= render_component_text_area.prototype.list
	component_text_area.prototype.edit 		= render_component_text_area.prototype.edit



/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*//*
component_text_area.prototype.update_data_value_from_dom = function() {

	const self = this 
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value  = []
		for (let i = 0; i < ar_inputs.length; i++) {
			ar_value.push(ar_inputs[i].value)
		}

	// set value in data instance
		self.data.value = ar_value

	return true	
}//end update_data_value_from_dom
*/


