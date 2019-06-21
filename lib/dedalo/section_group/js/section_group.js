//import event_manager from './page.js'

export const section_group = function(){
	
	this.tipo
	this.section_tipo
	this.modo
	this.model

	this.context


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		const self = this

		// Options vars 
		this.context = options.context

		this.tipo = this.context.tipo
		this.section_tipo 	= this.context.section_tipo

		this.modo 	= options.modo
		this.model 	= options.model

		//event_manager.subscribe('stateChange', () => self.render())

	
		console.log("section_group: init:",this.section_tipo);	

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
			modo			: this.modo
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

	const loaded = new Promise(function(resolve){

	//create the header of the tool
			const dom_node = common.create_dom_element({
							element_type		: 'div',
							id 					: self.tipo+'_'+options.section_id,
							class_name			: self.model,
							inner_html			: self.model
							})

		console.log("render :",self.model);


		resolve(dom_node)
	})

	return loaded


}//end render
