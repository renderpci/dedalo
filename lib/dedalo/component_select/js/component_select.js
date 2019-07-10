// imports
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
	component_select.prototype.init 	 	= component_common.prototype.init
	component_select.prototype.save 	 	= component_common.prototype.save
	component_select.prototype.load_data 	= component_common.prototype.load_data
	component_select.prototype.load_datum = component_common.prototype.load_datum
	component_select.prototype.get_value 	= component_common.prototype.get_value
	component_select.prototype.set_value 	= component_common.prototype.set_value



/**
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*/
component_select.prototype.render = async function() {
	
	const self = this

	// load data before render
		await self.load_data()
	
	// render using external proptotypes of 'render_component_select'
		const mode = self.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_select
				component_select.prototype.list = render_component_select.prototype.list
				const list_node = await self.list()
				if (self.node) {
					// replace old node
					self.node.parentNode.replaceChild(list_node, self.node)
				}else{
					// set
					self.node = list_node
				}				
				break
		
			case 'edit':
			default :
				// add prototype edit function from render_component_select
				component_select.prototype.edit = render_component_select.prototype.edit
				const edit_node = await self.edit()
				if (self.node && self.node.parentNode) {
					// replace old node contents
					self.node.parentNode.replaceChild(edit_node, self.node)
					// // clean
					// 	while (self.node.firstChild) {
					// 		self.node.removeChild(self.node.firstChild);
					// 	}
					// // set children nodes
					// 	while (edit_node.firstChild) {
					// 		self.node.appendChild(edit_node.firstChild);
					// 	}
				}else{
					// set
						self.node = edit_node
				}
				break
		}

	return self	
}//end render



/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*/
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


