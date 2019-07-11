// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_text_area} from '../../component_text_area/js/render_component_text_area.js'
	//import * as instances from '../../common/js/instances.js'
	//import event_manager from '../../page/js/page.js'
	//import {ui} from '../../common/js/ui.js'	
	//import {data_manager} from '../../common/js/data_manager.js'



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
	component_text_area.prototype.init 	 = component_common.prototype.init
	component_text_area.prototype.save 	 = component_common.prototype.save
	component_text_area.prototype.load_data = component_common.prototype.load_data
	component_text_area.prototype.get_value = component_common.prototype.get_value
	component_text_area.prototype.set_value = component_common.prototype.set_value



/**
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*/
component_text_area.prototype.render = async function() {
	
	const self = this

	// load data before render
		await self.load_data()

	// render using external proptotypes of 'render_component_text_area'
		const mode = self.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_text_area
				component_text_area.prototype.list = render_component_text_area.prototype.list	
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
				// add prototype edit function from render_component_text_area
				component_text_area.prototype.edit = render_component_text_area.prototype.edit
				const new_node = await self.edit()
				if (self.node) {
					// replace old node contents
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


