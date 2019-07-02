// imports
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	import event_manager from '/dedalo/lib/dedalo/page/js/page.js'
	import {render_component_input_text} from '/dedalo/lib/dedalo/component_input_text/js/render_component_input_text.js'
	


export const component_input_text = function(){
	
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

	return true
}//end component_input_text



/**
* INIT
* @return bool true
*/
component_input_text.prototype.init = function(options) {
	
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


	//event_manager.subscribe('component_active', self.component_active)

	//console.log("component_input_text: init:",self);	

	//event_manager.subscribe('stateChange', () => self.render())

	return true
}//end init



/**
* LOAD_CONTEXT
* @return 
*/
component_input_text.prototype.load_context = function() {

	const self = this

	if (self.context) {
		return new Promise(function(resolve) {
		  resolve(self.context)
		})
	}

	// section_record instance
		const tipo = self.tipo
		const section_record_options = {
			model 			: 'section_record',
			tipo 			: self.section_tipo,
			section_tipo 	: self.section_tipo,
			section_id		: self.section_id,
			mode			: self.mode,
			lang			: self.section_lang
		}
		const js_promise = instances.get_instance(section_record_options).then(function(section_record){

			const context = section_record.get_component_context(tipo);	

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
component_input_text.prototype.load_data2 = function(){

	const js_promise = component_load_data(this).then(function(data){
		self.data = data
	})
	
	return js_promise
}//end load_data



/**
* LOAD_DATA
* @return 
*/
component_input_text.prototype.load_data = function(){

	const self = this
	
	const tipo = self.tipo	

	// section instance
		const section_record_options = {
			model 			: 'section_record',
			tipo 			: self.section_tipo,
			section_tipo 	: self.section_tipo,
			section_id		: self.section_id,
			mode			: self.mode,
			lang			: self.section_lang
		}
		const js_promise = instances.get_instance(section_record_options).then(function(section_record){
			
			// set
				self.data =	section_record.get_component_data(tipo);

			return self.data
		})
	
	return js_promise
}//end load_data



/**
* RENDER
* @return promise
*/
component_input_text.prototype.render = function(){

	const self = this
	
	const context = self.context
	return self.load_data().then(function(){

		return new Promise(function(resolve){

			// render
				const current_render = new render_component_input_text(self)
				
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



/**
* GET_VALUE
*/
component_input_text.prototype.get_value = function(){

	const self  = this 
	const value = self.data.value

	return value
}//end get_value


/**
* SET_VALUE
* @return bool true
*/
component_input_text.prototype.set_value = function() {

	const self = this 
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value = []
		for (let i = 0; i < ar_inputs.length; i++) {			
			ar_value.push(ar_inputs[i].value)
		}

	// set value in data isntance
		self.data.value = ar_value

	return true	
}//end set_value



/**
* SAVE
* @return promise save_promise
* resolve section_record response
*/
component_input_text.prototype.save = function(){

	const self = this
	const node = self.node

	// force to update / sync dom node and component value
		if(node){
			self.set_value()
		}

	const tipo  = self.tipo
	const value = self.data.value

	// section_record instance
		const instance_options = {
			model 			: 'section_record',
			tipo 			: self.section_tipo,
			section_tipo 	: self.section_tipo,
			section_id		: self.section_id,
			mode			: self.mode,
			lang			: self.section_lang
		}
		const save_promise = instances.get_instance(instance_options).then(function(section_record){

			// section record save
				return section_record.save(tipo)

		})

	return save_promise
}//end save


/**
* ACTIVE
* @return bool true
*/
component_input_text.prototype.active = function() {
	
	const self = this
	const node = self.node

	node.classList.add("active")

	const sender_data = {
			tipo : self.tipo,
			node : node,
			lable : self.context.label,
		}

	event_manager.publish('component_active', self)
	
	return true
}//end active



/**
* COMPONENT_ACTIVE
* @return bool true
*/
component_input_text.prototype.component_active = function(data) {
	
	const self = this

	const active_node 	= data.node
	const node 			= self.node

	console.log("active_node:",active_node);
	console.log("node:",node);
	console.log("(node != active_node):",(node != active_node));

	if (node != active_node){
		node.classList.remove("active");
	}
	
	return true
}//end component_active


