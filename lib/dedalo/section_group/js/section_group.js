//import event_manager from './page.js'

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

	
		console.log("section_group: init:",options);	

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

		console.log("context:",self.context);

	const loaded = new Promise(function(resolve){

		//create the header of the tool
			const node = common.create_dom_element({
							element_type		: 'div',
							class_name			: self.model,
							inner_html			: self.model
							})

		console.log("render :",self.model);

		resolve(node)
	})

	return loaded


}//end render
