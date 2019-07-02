// imports
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	import event_manager from '/dedalo/lib/dedalo/page/js/page.js'
	import {render_component_check_box} from '/dedalo/lib/dedalo/component_check_box/js/render_component_check_box.js'
	
	

export const component_check_box = function(){
	
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
	
}//end component_check_box


/**
* INIT
* @return 
*/
component_check_box.prototype.init = function(options) {
	
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

	//console.log("component_check_box: init:",self);	

	//event_manager.subscribe('stateChange', () => self.render())
}//end init



/**
* LOAD_CONTEXT
* @return 
*/
component_check_box.prototype.load_context = function() {

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
component_check_box.prototype.load_data = function(){

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
component_check_box.prototype.render = function(){

	const self = this
	
	const context = self.context
	return self.load_data().then(function(){

		return new Promise(function(resolve){

			// render
				const current_render = new render_component_check_box(self)
				
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
component_check_box.prototype.get_value = function(){

	const self  = this 
	const value = self.data.value

	return value
}//end get_value


/**
* SET_VALUE
* @return bool true
*/
component_check_box.prototype.set_value = function() {

	const self = this 
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value = []
		for (let i = 0; i < ar_inputs.length; i++) {			
			if(ar_inputs[i].checked) {
				//dato.push( JSON.parse(input_elements[i].value) )
				let element = ar_inputs[i]
				if(element.value.length>1) {
					let locator = null;
					try {
					  locator = JSON.parse(element.value)
					} catch (e) {
					  console.log(e.message); // "missing ; before statement"
					  //return alert(e.message) 
					}
					if(locator)	ar_value.push( locator )
				}
			}
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
component_check_box.prototype.save = function(){

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