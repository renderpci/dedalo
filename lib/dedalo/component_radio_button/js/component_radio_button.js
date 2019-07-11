// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_radio_button} from '../../component_radio_button/js/render_component_radio_button.js'
	

export const component_radio_button = function(){
		
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
}//end component_radio_button



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_radio_button.prototype.init 	 	= component_common.prototype.init
	component_radio_button.prototype.save 	 	= component_common.prototype.save
	component_radio_button.prototype.load_data 	= component_common.prototype.load_data
	component_radio_button.prototype.get_value 	= component_common.prototype.get_value
	component_radio_button.prototype.set_value 	= component_common.prototype.set_value


/**
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*/
component_radio_button.prototype.render = async function() {
	
	const self = this

	// load data before render
		await self.load_data()

	// render using external proptotypes of 'render_component_radio_button'
		const mode = self.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_radio_button
				component_radio_button.prototype.list = render_component_radio_button.prototype.list	
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
				// add prototype edit function from render_component_radio_button
				component_radio_button.prototype.edit = render_component_radio_button.prototype.edit
				const new_node = await self.edit()
				if (self.node) {			
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
component_radio_button.prototype.update_data_value_from_dom = function() {

	const self = this 
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value = []
		for (let i = 0; i < ar_inputs.length; i++) {		
			if(ar_inputs[i].checked) {
				//dato.push( JSON.parse(input_elements[i].value) )
				let element = ar_inputs[i]
				if(element.value.length>1) {
					let locator = null;
					try {
					  locator = JSON.parse(element.value)
					} catch (e) {
					  console.log(e.message); // "missing ; before statement"
					  //return alert(e.message) 
					}
					if(locator)	ar_value.push( locator )
				}
			}
 		}

	// set value in data instance
		self.data.value = ar_value

	return true	
}//end update_data_value_from_dom


/**
* CHECK_RADIO
* Used in search mode to reset radio values
* @return bool true
*/
component_radio_button.prototype.check_radio = function(input, event) {

	if (event.altKey===true) {
		input.checked = false
		//get the wrap_div
		const wrap_div = find_ancestor(input, 'wrap_component')
		//set previous_dato
		const previous_dato = component_radio_button.get_previous_dato(wrap_div)

		// Fix dato as blank
		component_common.fix_dato(input,'component_radio_button')
		
		if(wrap_div.dataset.modo ==='edit'){
			component_radio_button.Save(input, previous_dato)
		}
	}

	return true
}//end check_radio