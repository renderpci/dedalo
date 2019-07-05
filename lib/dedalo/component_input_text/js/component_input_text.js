// imports
	import * as instances from '../../common/js/instances.js'
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {render_component_input_text} from '../../component_input_text/js/render_component_input_text.js'



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


	//component_input_text.prototype.edit = render_component_input_text.prototype.edit

	// test 
		/*
		if (self.tipo==='test159' || self.tipo==='test160' || self.tipo==='test161' || self.tipo==='test162' 
		|| self.tipo==='test163' || self.tipo==='test164' || self.tipo==='test165' || self.tipo==='test166'
		|| self.tipo==='test167' || self.tipo==='test168'
		) { //  && self.section_id==5
			
			for (let i = 1; i <= 2; i++) {
					
				setTimeout( async () => {	

					const new_value 	= parseInt(self.data.value[0]) + 1
					const new_ar_value 	= [new_value]
					
					//if (new_ar_value!=self.data.value) {
					
						self.set_value(new_ar_value)
						
						// update dom
						await self.render()
						//.then(response => {
							// save
							event_manager.publish('component_save', self)
						//})						
					//}					
							
				}, (i*100))
			}
		}
		*/

	return true
}//end init



/**
* RENDER
* @return promise
*/
component_input_text.prototype.render = async function() {

	const self = this

	// load data before render (calling section_record across data manager)
		const current_data_manager = new data_manager()
		await current_data_manager.component_load_data(self)
 	
	// render using external proptotypes of 'render_component_input_text'
		const mode = 'edit'//self.mode
		switch (mode){
			case 'list':
				// add prototype list function from render_component_input_text
				component_input_text.prototype.list = render_component_input_text.prototype.list				
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
				// add prototype edit function from render_component_input_text
				component_input_text.prototype.edit = render_component_input_text.prototype.edit
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
* RENDER
* @return promise
*//*
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
*/



/**
* GET_VALUE
* Look component data value (we assume that it is updated)
* @return array value
*/
component_input_text.prototype.get_value = function() {

	const value = this.data.value

	return value
}//end get_value



/**
* SET_VALUE
* Update component data value with dom node actual value
* @return bool true
*/
component_input_text.prototype.set_value = function(value) {

	const self = this

	// set value in data instance
		self.data.value = value
	
	// force render component again
		//self.render()	


	return true	
}//end set_value



/**
* UPDATE_DATA_VALUE
* Update component data value with dom node actual value
* @return bool true
*/
component_input_text.prototype.update_data_value = function() {

	const self = this 
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value  = []
		for (let i = 0; i < ar_inputs.length; i++) {
			ar_value.push(ar_inputs[i].value)
		}

	// set value in data instance
		self.data.value = ar_value

	return true	
}//end update_data_value



/**
* ACTIVE_CUSTOM
*/
component_input_text.prototype.active_custom = function() {
		
	const self = this
	
	console.log("Yujuu! active_custom test ", self.id)

	return true
}//end active_custom



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



