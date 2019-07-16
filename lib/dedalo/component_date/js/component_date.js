// imports
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_date} from '../../component_date/js/render_component_date.js'



export const component_date = function(){
	
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
}//end component_date



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_date.prototype.init 	 	= component_common.prototype.init
	component_date.prototype.save 	 	= component_common.prototype.save
	component_date.prototype.load_data 	= component_common.prototype.load_data
	component_date.prototype.get_value 	= component_common.prototype.get_value
	component_date.prototype.set_value 	= component_common.prototype.set_value



/**
* RENDER
* @return promise
*//*
component_date.prototype.render = function(){

	const self = this
	
	const context = self.context


		return new Promise(function(resolve){

			// render
				const current_render = new render_component_date(self)
				
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
	
}//end render
*/


/**
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*/
component_date.prototype.render = async function() {
	
	const self = this

	// load data before render
		//await self.load_data()

	// render using external proptotypes of 'render_component_date'
		const mode = self.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_date
				component_date.prototype.list = render_component_date.prototype.list	
				const list_node = await self.list()
				// set
				self.node = list_node
				break
		
			case 'edit':
			default :
				// add prototype edit function from render_component_date
				component_date.prototype.edit = render_component_date.prototype.edit
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


