// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_number} from '../../component_number/js/render_component_number.js'



export const component_number = function(){

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
}//end component_number



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_number.prototype.init 	 		 = component_common.prototype.init
	component_number.prototype.destroy 	 		 = common.prototype.destroy
	component_number.prototype.save 	 		 = component_common.prototype.save
	component_number.prototype.load_data 		 = component_common.prototype.load_data
	component_number.prototype.get_value 		 = component_common.prototype.get_value
	component_number.prototype.set_value 		 = component_common.prototype.set_value
	component_number.prototype.update_data_value = component_common.prototype.update_data_value
	component_number.prototype.update_datum 	 = component_common.prototype.update_datum

	// render
	component_number.prototype.render 		= common.prototype.render
	component_number.prototype.list 		= render_component_number.prototype.list
	component_number.prototype.edit 		= render_component_number.prototype.edit
	component_number.prototype.search 		= render_component_number.prototype.search


/**
* FIX_NUMBER_FORMAT
* Force unified number format.
* Example: Change 17,2 to 17.2
* @return
*/
component_number.prototype.fix_number_format = function( number ) {

	const new_number = number.replace(/\,/g, ".");

	return Number(new_number)
}//end fix_number_format


/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*//*
component_email.prototype.update_data_value_from_dom = function() {

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

