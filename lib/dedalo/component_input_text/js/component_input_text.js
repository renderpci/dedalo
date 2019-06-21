//import event_manager from './page.js'

export const component_input_text = function(){
	
	this.tipo
	this.section_tipo
	this.section_id
	this.modo
	this.lang
	this.model

	this.context
	this.data


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		const self = this

		// Options vars 
		this.context = options.context
		this.data 	 = options.data

		this.tipo 			= this.context.tipo
		this.section_tipo 	= this.context.section_tipo
		this.section_id 	= this.data.section_id

		this.modo 	= options.modo
		this.lang 	= options.lang
		this.model 	= options.model
	
		console.log("component_input_text: init:",this.section_id,this.tipo);
		//event_manager.subscribe('stateChange', () => self.render())

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

		const tipo = this.tipo		

		// section instance
			const js_promise = instances.get_instance(options).then(function(current_section){
								
				self.context =current_section.get_component_context(tipo);
				
			})

		return js_promise
	}//end load_context


	this.load_data = function(){

		const self = this

		self.loaded_context.then(function(){
			
			const options = {
				model 			: 'section',
				section_tipo 	: self.section_tipo,
				section_id		: self.section_id,
				modo			: self.modo
			}

			const tipo = self.tipo	

			// section instance
				const js_promise = instances.get_instance(options).then(function(current_section){
				
					self.data =	current_section.get_component_data(tipo);
				})

			return js_promise		
		})			
	}//end load_data
}


/**
* RENDER
* @return 
*/
component_input_text.prototype.render = function(){

	const self = this

	const loaded = new Promise(function(resolve){

		// Options vars 
			const context 			= self.context
			const data 				= self.data
			const node_type 		= "div"
			const node_class_name 	= self.model + "_list"
		
		// Value as string 
			const value_string = data.value.join(' | ')

		// Node create
			const node = common.create_dom_element({
				element_type	: node_type,
				class_name		: node_class_name,
				text_content 	: value_string
			})


		console.log("render :",self.model);

		resolve(node)
	})

	return loaded


}//end render
