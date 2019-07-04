// imports
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	import event_manager from '/dedalo/lib/dedalo/page/js/page.js'
	import {ui} from '/dedalo/lib/dedalo/common/js/ui.js'
	import {data_manager} from '/dedalo/lib/dedalo/common/js/data_manager.js'
	import {render_component_input_text} from '/dedalo/lib/dedalo/component_input_text/js/render_component_input_text.js'


export const component_input_text = function(){
	
	// element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.lang

		this.section_lang
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

	// delegate init
		ui.component.init(this, options)

	/*
	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode
	self.lang 			= options.lang

	self.section_lang 	= options.section_lang	
	self.parent 		= options.parent
	self.id 			= options.id

	// Optional vars 
	self.context = options.context  || null
	self.data 	 = options.data 	|| []

	// events subscription
		// event active (when user focus in dom)
		event_manager.subscribe('component_active', (actived_component) => {
			// call ui.component
			ui.component.active(self, actived_component)
			.then( response => { // response is bool value
				if (response===true) {
					self.active_custom()
				}
			})
		})		
		// event save (when user change component value)
		event_manager.subscribe('component_save', (saved_component) => {
			// call ui.component
			ui.component.save(self, saved_component)
			.then( response => { // response is saved_component object
				//console.log("+++++++++++++++++++ component_save response:",response);
			})
		})
		//event_manager.subscribe('stateChange', () => self.render())
	*/

	return true
}//end init



/**
* ACTIVE_CUSTOM
*/
component_input_text.prototype.active_custom = function() {
		
	const self = this
	
	console.log("Yujuu! active_custom ", self.id)

	return true
}//end active_custom



/**
* LOAD_CONTEXT
* @return 
*//* MOVED TO DATA_MANAGER
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
*/



/**
* LOAD_DATA
* @return 
*//* MOVED TO DATA_MANAGER
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
*/



/**
* RENDER
* @return promise
*/
component_input_text.prototype.render = async function(){
	
	// load data before render 
		//await this.load_data()
		const current_data_manager = new data_manager
		await current_data_manager.component_load_data(this)
 	
	// render using external proptotypes of 'render_component_input_text'
		const mode = this.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_input_text
				component_input_text.prototype.list2 = render_component_input_text.prototype.list2
				this.node = this.list2()
				break
		
			case 'edit':
			default :
				// add prototype edit function from render_component_input_text
				component_input_text.prototype.edit2 = render_component_input_text.prototype.edit2
				this.node = this.edit2()
				break
		}

	return this	
}//end render



/**
* RENDER
* @return promise
*/
component_input_text.prototype.render_OLD = function(){

	const self = this
	
	const context = self.context
	return self.load_data().then( () => {

		return new Promise( resolve => {

			// render using instace of 'render_component_input_text'
				const current_render = new render_component_input_text(self)
				current_render.component = self
						
				let node   = ""
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

	const value = this.data.value

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
*//* MOVED TO UI (!)
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
*/



/**
* ACTIVE
* @return bool true
*//* MOVED TO UI (!)
component_input_text.prototype.active = function() {
	if(SHOW_DEBUG===true) {
		console.log("component active",this)
	}
	
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
*/



/**
* COMPONENT_ACTIVE
* @return bool true
*//*
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
*/


