// imports
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	import event_manager from '/dedalo/lib/dedalo/page/js/page.js'
	import {render_component_number} from '/dedalo/lib/dedalo/component_number/js/render_component_number.js'
	


export const component_number = function(){
	
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
}//end component_number



/**
* INIT
* @return 
*/
component_number.prototype.init = function(options) {
	
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

	//console.log("component_number: init:",self);	

	//event_manager.subscribe('stateChange', () => self.render())
}//end init



/**
* LOAD_CONTEXT
* @return 
*/
component_number.prototype.load_context = function() {

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
component_number.prototype.load_data = function(){

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

	console.log("load data", self);

	return js_promise
}//end load_data



/**
* RENDER
* @return 
*/
component_number.prototype.render = function(){

	const self = this
	
	const context = self.context
	return self.load_data().then(function(){

		return new Promise(function(resolve){

			// render
				const current_render = new render_component_number(self)
				
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
			//	setTimeout(function(){
					resolve(self)
			//	},1000)
			
		})
	});

}//end render

/**
* GET_VALUE
*/
component_number.prototype.get_value = function(){

	const self = this 
	const value = self.data.value

	return value

}//end get_value


/**
* SET_VALUE
* @return 
*/
component_number.prototype.set_value = function() {

	const self = this 
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value = []
		for (let i = 0; i < ar_inputs.length; i++) {					
			ar_value.push(self.fix_number_format(ar_inputs[i].value))
		}

	//set value in data isntance
	if (Array.isArray(ar_value)) {
		self.data.value = Number(ar_value[0])
	}else{
		self.data.value = Number(ar_value)
	}

	return true	
};//end set_value


/**
* SAVE
*/
component_number.prototype.save = function(){

	const self = this
	const node = self.node

	if(node){
		self.set_value()
	}

	const value = self.data.value

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

			const save_promise = current_section_record.save(tipo).then(response => {
				console.log("response:",response)
			});

		})

}//

/**
* FIX_NUMBER_FORMAT
* Force unified number format.
* Example: Change 17,2 to 17.2
* @return 
*/
component_number.prototype.fix_number_format = function( number ) {
	
	const new_number = number.replace(/\,/g, ".");

	return new_number
}//end fix_number_format