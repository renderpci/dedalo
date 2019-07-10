// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_section_id} from '../../component_section_id/js/render_component_section_id.js'
	//import * as instances from '../../common/js/instances.js'
	//import event_manager from '../../page/js/page.js'
	//import {ui} from '../../common/js/ui.js'	
	//import {data_manager} from '../../common/js/data_manager.js'



export const component_section_id = function(){
	
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
}//end component_section_id



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_section_id.prototype.init 	 = component_common.prototype.init
	component_section_id.prototype.save 	 = component_common.prototype.save
	component_section_id.prototype.load_data = component_common.prototype.load_data
	component_section_id.prototype.get_value = component_common.prototype.get_value
	component_section_id.prototype.set_value = component_common.prototype.set_value



/**
* RENDER
* @return promise
*/
component_section_id.prototype.render = function(){

	const self = this
	
	const context = self.context
	return self.load_data().then(function(){

		return new Promise(function(resolve){

			// render
				const current_render = new render_component_section_id(self)
				
				let node = ""
				const mode = self.mode	
				switch (mode){
					case 'list':
						node = current_render.list()
					break

					case 'edit':
					default :
						node = current_render.edit()
				}

			// set node
				self.node = node

			// return self
				//setTimeout(function(){
					resolve(self)
				//},1000)			
		})
	})
}//end render
