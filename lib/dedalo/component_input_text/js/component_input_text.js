import {render_component_input_text} from './render_component_input_text.js'

export const component_input_text = function(){
	
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
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

		this.mode 	= options.mode
		this.lang 	= options.lang
		this.model 	= options.model
	
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
			mode			: this.mode
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
				mode			: self.mode
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
			const mode				= self.mode

			const options ={
				context 	: self.context,
				data 		: self.data
			}
				
			const current_render = new render_component_input_text(options)
			
			let node =""

			switch (mode){
				case 'list':
					node = current_render.list()
				break

				case 'edit':
				default :
					node = current_render.edit()
			}

		console.log("render :",self.model);

		resolve(node)
	})

	return loaded


}//end render
