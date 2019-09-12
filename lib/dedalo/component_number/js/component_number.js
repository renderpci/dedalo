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
	component_number.prototype.render 		= component_common.prototype.render
	component_number.prototype.list 		= render_component_number.prototype.list
	component_number.prototype.edit 		= render_component_number.prototype.edit



/**
* ACTIVE
* Custom active function triggered after ui.active has finish
*/
component_number.prototype.active = function() {		
	return true
}//end active

/**
* FIX_NUMBER_FORMAT
* Force unified number format.
* Example: Change 17,2 to 17.2
* @return 
*/
component_number.prototype.fix_number_format = function( number ) {
	
	const new_number = number.replace(/\,/g, ".");

	return new_number
}//end fix_number_format


