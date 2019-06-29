// imports
	import {render_component_date} from '/dedalo/lib/dedalo/component_date/js/render_component_date.js'
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'



export const component_date = function(){
	
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang
	this.section_lang
	this.model

	this.context
	this.data
	this.parent
	this.node
	this.id

}//end component_date



/**
* INIT
* @return 
*/
component_date.prototype.init = function(options) {
	
	const self = this

	self.mode 			= options.mode
	self.lang 			= options.lang
	self.section_lang 	= options.section_lang
	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.parent 		= options.parent
	self.id 			= options.id

	// Options vars 
	self.context = options.context || null
	self.data 	 = options.data || []	

	//console.log("component_date: init:",self);	

	//event_manager.subscribe('stateChange', () => self.render())
}//end init



/**
* LOAD_CONTEXT
* @return 
*/
component_date.prototype.load_context = function() {

	const self = this

	if (self.context) {

		return new Promise(function(resolve) {
		  resolve(self.context)
		});
	}

	const options = {
		model 			: 'section_record',
		tipo 			: self.section_tipo,
		section_tipo 	: self.section_tipo,
		section_id		: self.section_id,
		mode			: self.mode,
		lang			: self.section_lang
	}

	const tipo = self.tipo		

	// section instance
		const js_promise = instances.get_instance(options).then(function(current_section_record){

			const context = current_section_record.get_component_context(tipo);	

			//event_manager.publish('stateChange')

			// set
				self.context = context
		})

	//event_manager.subscribe('stateChange', () => self.render())

	return js_promise
}//end load_context



/**
* LOAD_DATA
* @return 
*/
component_date.prototype.load_data = function(){

	const self = this

	const options = {
		model 			: 'section_record',
		tipo 			: self.section_tipo,
		section_tipo 	: self.section_tipo,
		section_id		: self.section_id,
		mode			: self.mode,
		lang			: self.section_lang
	}

	const tipo = self.tipo	

	// section instance
		const js_promise = instances.get_instance(options).then(function(current_section){
		
			self.data =	current_section.get_component_data(tipo);

			return self.data
		})

	return js_promise
}//end load_data



/**
* RENDER
* @return promise
*/
component_date.prototype.render = function(){

	const self = this
	
	const context = self.context
	return self.load_data().then(function(){

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
	})
}//end render
