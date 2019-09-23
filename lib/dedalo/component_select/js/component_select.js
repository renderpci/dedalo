// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_select} from '../../component_select/js/render_component_select.js'



export const component_select = function(){

	// element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.lang

		this.section_lang

		this.datum
		this.context
		this.data
		this.parent
		this.node
		this.id

	return true
}//end component_select



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_select.prototype.init 	 			= component_common.prototype.init
	component_select.prototype.destroy 	 			= common.prototype.destroy
	component_select.prototype.save 	 			= component_common.prototype.save
	component_select.prototype.load_data 			= component_common.prototype.load_data
	component_select.prototype.load_datum 			= component_common.prototype.load_datum
	component_select.prototype.get_value 			= component_common.prototype.get_value
	component_select.prototype.set_value 			= component_common.prototype.set_value
	component_select.prototype.update_data_value 	= component_common.prototype.update_data_value

	// render
	component_select.prototype.render 	= common.prototype.render
	component_select.prototype.list 	= render_component_select.prototype.list
	component_select.prototype.edit 	= render_component_select.prototype.edit



/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*/
/*
component_select.prototype.update_data_value_from_dom = function() {

	const self = this
	const node = self.node

	// select
		const select = node.querySelector('select')

	// value
		let value = null

		if (select.value.length>0) {
			value = JSON.parse(select.value)
			if (value!==null) {
				value = [value]
			}
		}

	// set value in data instance
		self.data.value = value

	return true
}//end update_data_value_from_dom
*/


/**
* SET_VALUE
* @return bool true
*//*
component_select.prototype.set_value = function() {

	const self = this
	const node = self.node

	// inputs
		const dato = []
		const component_obj = node.querySelector('select')

		const select_value = component_obj.value
		if (select_value.length>0) {

			let value_obj = JSON.parse(select_value)

			// Add component specific properties
			if (value_obj) {
				// add from_component_tipo
				value_obj.from_component_tipo = node.dataset.tipo
				// add type
				value_obj.type = node.dataset.relation_type

				dato.push( value_obj )
			}
		}

	// set value in data instance
		self.data.value = dato

	return true
}//end set_value
*/


