//import event_manager from './page.js'
	//import {context_parser} from '../../common/js/context_parser.js'
	//import * as instances from '../../common/js/instances.js'
	import {render_section_group} from './render_section_group.js'


export const section_group = function(){

	// element properties declare
		this.model	
		this.tipo	
		this.section_tipo
		this.section_id	
		this.mode
		this.lang	

		this.context
		this.parent
		this.type

		this.node

		//this.section_lang
		
		//this.section_id

	return true
}//end section_group



/**
* INIT
* @return 
*/
section_group.prototype.init = function(options) {
		console.log("options:",options);
	const self = this

	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode
	self.lang 			= options.lang		
	
	self.context 		= options.context || null
	self.parent 		= options.parent
	self.type 			= options.type

	return true
}//end init



/**
* RENDER
* @return 
*/
section_group.prototype.render = async function(){

	const self = this

	// render using external proptotypes of 'render_component_input_text'
		const mode = self.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_input_text
				section_group.prototype.list = render_section_group.prototype.list
				const list_node = self.list()
				if (self.node) {
					// replace old node
					self.node.parentNode.replaceChild(list_node, self.node)
				}
				// set
				self.node = list_node				
				break
		
			case 'edit':
			default :
				// add prototype edit function from render_section
				section_group.prototype.edit = render_section_group.prototype.edit
				const edit_node = self.edit()
				if (self.node) {
					// replace old node
					self.node.parentNode.replaceChild(edit_node, self.node)
				}
				// set
				self.node = edit_node
				break
		}
		
	
	return self
}//end render


/**
* LOAD_CONTEXT
* @return 
*//*
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
*/



/**
* GET_CONTEXT_CHILDRENS
* @return 
*//*
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
*/






