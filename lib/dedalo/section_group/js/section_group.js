//import event_manager from './page.js'
	//import {context_parser} from '../../common/js/context_parser.js'
	import * as instances from '../../common/js/instances.js'


export const section_group = function(){
	
	this.tipo
	this.section_tipo
	this.mode
	this.model

	this.context
	this.lang
	this.section_lang

	this.parent

	this.section_id
	this.node

}

/**
* INIT
* @return 
*/
section_group.prototype.init = function(options) {
	
	const self = this

	// Options vars 
	self.context 		= options.context || null

	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id

	self.mode 			= options.mode
	self.lang 			= options.lang
	self.section_lang 	= options.section_lang
	self.model 			= options.model
	self.parent			= options.parent

	
	//console.log("section_group: init:",self);	

};//end init


/**
* LOAD_CONTEXT
* @return 
*/
section_group.prototype.load_context = function() {

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

			return context
		})

	//event_manager.subscribe('stateChange', () => self.render())

	return js_promise
}//end load_context



/**
* GET_CONTEXT_CHILDRENS
* @return 
*/
section_group.prototype.get_context_childrens = function(){

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
		
			self.childrens = current_section.get_context_childrens(tipo);
		})

		return js_promise		
			
}//end get_context_childrens




/**
* RENDER
* @return 
*/
section_group.prototype.render = function(){

	const self = this

		 return new Promise(function(resolve){

			//create the header of the tool
			const section_group_node = common.create_dom_element({
							element_type		: 'div',
							id 					: self.tipo + '_' + self.section_id,
							class_name			: self.model
							})

			self.node = section_group_node

			resolve(self)
				
		})
	
}//end render