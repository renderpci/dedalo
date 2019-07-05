// imports
	import * as instances from '../../common/js/instances.js'
	import event_manager from '../../page/js/page.js'
	import {render_component_email} from '../../component_email/js/render_component_email.js'



export const component_email = function(){
	
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

}//end component_email



/**
* INIT
* @return 
*/
component_email.prototype.init = function(options) {
	
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

	//console.log("component_email: init:",self);	

	//event_manager.subscribe('stateChange', () => self.render())
}//end init



/**
* LOAD_CONTEXT
* @return 
*/
component_email.prototype.load_context = function() {

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
component_email.prototype.load_data = function(){

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
component_email.prototype.render = function(){

	const self = this
	
	const context = self.context
	return self.load_data().then(function(){

		return new Promise(function(resolve){

			// render
				const current_render = new render_component_email(self)
				
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
component_email.prototype.get_value = function(){

	const self = this 
	const value = self.data.value

	return value

}//end get_value


/**
* SET_VALUE
* @return 
*/
component_email.prototype.set_value = function() {

	const self = this 
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value = []
		for (let i = 0; i < ar_inputs.length; i++) {			
			ar_value.push(ar_inputs[i].value)
		}

	//set value in data isntance
		self.data.value = ar_value

	return true	
};//end set_value


/**
* SAVE
*/
component_email.prototype.save = function(){

	const self = this
	const node = self.node

	// Avoid Safari autofill save
	if (!confirm(get_label["seguro"] + " [save email]")) {
		return false
	}

	if(node){
		self.set_value()
	}

	const value = self.data.value

	if( self.verify_email(value) ) {
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

		// Remove possible error class
		//TODO - Change element selection and create css definition in a proper file
		//       currently is defined in page.less just for testing purpose
		node.classList.remove('css_email_error');	

	}else{
			
		// Add error class
		//TODO - Change element selection and create css definition in a proper file
		//       currently is defined in page.less just for testing purpose
		node.classList.add('css_email_error');

		//component_obj.focus();
		alert("Data is NOT saved. Please enter a valid email address.");			
	}	

}//end save

/**
* VERIFY E-MAIL
*/
component_email.prototype.verify_email = function(email_value) {
			
	// When we want delete email data, allow empty value
	if (email_value.length<1) {			
		return true;
	}

	let status = false;     
	let emailRegEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;
	let ar_email=[]
	
	if (!Array.isArray(email_value)){
		ar_email.push(email_value)
	}else{
		ar_email = email_value
	}
	
	ar_email.forEach(function(email) {
	 	if (email.search(emailRegEx) == -1) {			
			status = false;		  
		}else{			 
			status = true;
		}
  	})

	return status;	    
}//end verify_email