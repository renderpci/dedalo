//import event_manager from './page.js'
	import {context_parser} from '/dedalo/lib/dedalo/common/js/context_parser.js'


export const section_group = function(){
	
	this.tipo
	this.section_tipo
	this.mode
	this.model

	this.context
	this.childrens
	this.lang

	this.section_id


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		const self = this

		// Options vars 
		this.context 		= options.context

		this.tipo 			= options.tipo
		this.section_tipo 	= options.section_tipo
		this.section_id 	= options.section_id

		this.mode 			= options.mode
		this.lang 			= options.lang
		this.model 			= options.model
		this.childrens 		= options.childrens


		//event_manager.subscribe('stateChange', () => self.render())

	
		//console.log("section_group: init:",options);	

	};//end init


	/**
	* LOAD_CONTEXT
	* @return 
	*/
	this.load_context = function() {

		const self = this

		const options = {
			model 			: 'section',
			section_tipo 	: this.section_tipo,
			mode			: this.mode
		}

		const component_tipo = this.component_tipo		

		// section instance
			const js_promise = instances.get_instance(options).then(function(current_section){
								
				//self.context =current_section.get_component_context(component_tipo);
				
				//event_manager.publish('stateChange')
			})

		//event_manager.subscribe('stateChange', () => self.render())

		return js_promise
	}//end load_context

}


/**
* RENDER
* @return 
*/
section_group.prototype.render = function(options){

	const self = this

	const render_promise = new Promise(function(resolve){

		//create the header of the tool
			const section_group_node = common.create_dom_element({
							element_type		: 'div',
							class_name			: self.model
							})

			const options = {
						childrens 	: self.childrens,
						section_id 	: self.section_id,
						root_tipo 	: self.section_tipo,
						root_node 	: section_group_node
					}
			
			const current_context_parser = new context_parser(options)

			current_context_parser.render()


		resolve(section_group_node)
	})

	return render_promise


}//end render
