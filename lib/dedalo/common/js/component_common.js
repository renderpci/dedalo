// imports
	import event_manager from '../../page/js/page.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'



export const component_common = function(){

}//end component_common



/**
* INIT
* Common init prototype to use in components as default
* @return bool true
*/
component_common.prototype.init = async function(options) {
		
	const self = this

	// instance key used vars
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
				if (response===true && typeof self.active==="function" ) {
					self.active()
				}
			})
		})
		// event save (when user change component value)
		event_manager.subscribe('component_save', (saved_component) => {
			// call component
			self.save(saved_component)
			.then( response => { // response is saved_component object
				//console.log("+++++++++++++++++++ component_save response:",response);
			})
		})
		//event_manager.publish('component_init', self)

		// test save
			//component_common.prototype.test_save(this)

	return true
}//end init



component_common.prototype.test_save = async function(component) {
	
	if (component.model==='component_input_text') {
		
		for (var i = 1; i <= 1; i++) {

			const time = i * 1000
			const ar_value = [i,"234"]

			setTimeout( async function() {
			
				component.set_value(ar_value)
				await component.render()
				component.save(component)

			},time)			


			//const my_promise = async function() {
			//
			//	component.set_value(ar_value)
			//	return component.render()
			//	.then( function() {
			//		component.save(component)
			//	})
			//}
		}		
	}	
}//end test_save



/**
* COMPONENT_SAVE
* Receive full component object and start the save process across the section_record
* @param object component
* @return promise save_promise
*/
component_common.prototype.save = async function(saved_component) {
	if(SHOW_DEBUG===true) {				
		//console.log("component save",component)
		//console.log("instances:",instances);				
	}

	const component = this

	if (component.id!==saved_component.id) {
		return saved_component
	}

	const tipo = component.tipo

	// force to update / sync dom node and component value
		const node = component.node
		if(node){
			component.update_data_value_from_dom()
		}

	// remove previous success class if exists
		node.classList.remove("success")		

	// direct way
		// send_data
		const send_data = async () => {
			try {
				// data_manager
					const current_data_manager 	= new data_manager()
					const api_response 			= await current_data_manager.request({
						url  : DEDALO_LIB_BASE_URL + '/api/v1/json/',
						body : {
							action 	: 'update',
							context : component.context,
							data 	: component.data
						}
					})				
					console.log("+++++++ api_response:",api_response);
				
				return api_response

			} catch (error) {
			  	//logAndReport(error)
			  	console.log("+++++++ error:",error);
			  	return {
			  		result 	: false,
			  		msg 	: error.message,
			  		error 	: error
			  	}
			}
		}
		const save_promise = send_data()


	// check result for errors
		save_promise.then(function(response){
				//console.log("+++++++++++++++++ save response:",response);
			// result expected is current section_id. False is returned if a problem found 
			const result = response.result
			if (result===false) {
				node.classList.add("error")
				if (response.error) {
					console.error(response.error)
				}
				if (response.msg) {
					alert("Error on save component "+component.model+" data: \n" + response.msg)
				}						
			}else{						
				node.classList.add("success")
				setTimeout(()=>{
					node.classList.remove("success")
				}, 2100)
			}
		})

	return save_promise
}//end save



/**
* LOAD_DATA
* Generic component data loader from section_record
* @param object component
* @return promise data
*/
component_common.prototype.load_data = async function() {
	
	const component = this

	// section_record instance
		const section_record = await instances.get_instance({
			model 			: 'section_record',
			tipo 			: component.section_tipo,
			section_tipo 	: component.section_tipo,
			section_id		: component.section_id,
			mode			: component.mode,
			lang			: component.section_lang
		})
	
	// get data from section_record
		const data = section_record.get_component_data(component.tipo)

	// inject property
		component.data = data
		
	return data
}//end load_data



/**
* GET_VALUE
* Look component data value (we assume that it is updated)
* @return array value
*/
component_common.prototype.get_value = function() {

	const value = this.data.value

	return value
}//end get_value



/**
* SET_VALUE
* Update component data value with dom node actual value
* @return bool true
*/
component_common.prototype.set_value = function(value) {

	// set value in data instance
		this.data.value = value
	
	// force render component again
		//this.render()	

	return true	
}//end set_value


