// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_publication} from '../../component_publication/js/render_component_publication.js'
	//import * as instances from '../../common/js/instances.js'
	//import event_manager from '../../page/js/page.js'
	//import {ui} from '../../common/js/ui.js'	
	//import {data_manager} from '../../common/js/data_manager.js'



export const component_publication = function(){
	
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
}//end component_publication



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_publication.prototype.init 	 = component_common.prototype.init
	component_publication.prototype.save 	 = component_common.prototype.save
	component_publication.prototype.load_data = component_common.prototype.load_data
	component_publication.prototype.get_value = component_common.prototype.get_value
	component_publication.prototype.set_value = component_common.prototype.set_value

// render
	component_publication.prototype.render 	= component_common.prototype.render
	component_publication.prototype.list 	= render_component_publication.prototype.list
	component_publication.prototype.edit 	= render_component_publication.prototype.edit




/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*/
component_publication.prototype.update_data_value_from_dom = function() {

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


