// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_number} from '../../component_number/js/render_component_number.js'
	//import * as instances from '../../common/js/instances.js'
	//import event_manager from '../../page/js/page.js'
	//import {ui} from '../../common/js/ui.js'	
	//import {data_manager} from '../../common/js/data_manager.js'
	


export const component_number = function(){
	
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
}//end component_number



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_number.prototype.init 	 = component_common.prototype.init
	component_number.prototype.save 	 = component_common.prototype.save
	component_number.prototype.load_data = component_common.prototype.load_data
	component_number.prototype.get_value = component_common.prototype.get_value
	component_number.prototype.set_value = component_common.prototype.set_value



/**
* RENDER
* @return promise
*/
component_number.prototype.render = async function() {
	
	const self = this

	// load data before render
		await self.load_data()
 	
	// render using external proptotypes of 'render_component_number'
		const mode = self.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_number
				component_number.prototype.list = render_component_number.prototype.list			
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
				// add prototype edit function from render_component_number
				component_number.prototype.edit = render_component_number.prototype.edit
				const new_node = await self.edit()
				if (self.node) {
					// replace old node
					self.node = component_common.prototype.update_node_contents(self.node, new_node)
				}else{
					// set
					self.node = new_node
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
component_number.prototype.update_data_value_from_dom = function() {

	const self = this 
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value = []
		for (let i = 0; i < ar_inputs.length; i++) {					
			ar_value.push(Number(self.fix_number_format(ar_inputs[i].value)))
		}

	//set value in data instance
	self.data.value = ar_value

	return true	
}//end update_data_value_from_dom




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


