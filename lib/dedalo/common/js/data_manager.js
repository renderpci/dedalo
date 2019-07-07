// imports
	import * as instances from '../../common/js/instances.js'
	//import {ui} from '../../common/js/ui.js'


/**
* DATA_LOADER
*/
export const data_manager = function() {

}//end data_manager



/**
* REQUEST
* Make a fetch request to server api
* @param object options
* @return promise api_response
*/
data_manager.prototype.request = async function(options) {

	this.url 			= options.url
	this.method 		= options.method || 'POST' // *GET, POST, PUT, DELETE, etc.
	this.mode 			= options.mode || 'cors' // no-cors, cors, *same-origin
	this.cache 			= options.cache || 'no-cache' // *default, no-cache, reload, force-cache, only-if-cached
	this.credentials 	= options.credentials || 'same-origin' // include, *same-origin, omit
	this.headers 		= options.headers || {'Content-Type': 'application/json'}// 'Content-Type': 'application/x-www-form-urlencoded'
	this.redirect 		= options.redirect || 'follow' // manual, *follow, error
	this.referrer 		= options.referrer || 'no-referrer' // no-referrer, *client
	this.body 			= options.body // body data type must match "Content-Type" header

	const handle_errors = function(response) {
		if (!response.ok) {
			throw Error(response.statusText);
		}
		return response;
	}

 	const api_response = fetch(
 		this.url, 
 		{
			method		: this.method,
			mode		: this.mode,
			cache		: this.cache,
			credentials	: this.credentials,
			headers		: this.headers,
			redirect	: this.redirect,
			referrer	: this.referrer,
			body		: JSON.stringify(this.body)
		})
		.then(handle_errors)
		.then(response => response.json()) // parses JSON response into native Javascript objects
		.catch(error => {
			console.error("!!!!! [data_manager.request] ERROR: ",error)
			return {
				result 	: false,
				msg 	: error.message,
				error 	: error
			}
		});

	return api_response
}//end request



/**
* SECTION_LOAD_DATA
* Generic section data loader
* @param object context
* @return promise api_response
*/
data_manager.prototype.section_load_data = async function(context) {

	// data_manager
		const api_response = this.request({
			url  : DEDALO_LIB_BASE_URL + '/api/v1/json/',
			body : {
				context : context,
				action 	: 'read'
			}
		})
	
	
	return api_response
}//end section_load_data



/**
* COMPONENT_LOAD_DATA
* Generic component data loader from section_record
* @param object component
* @return promise data
*//*
data_manager.prototype.component_load_data = async function() {
	
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
}//end component_load_data
*/



/**
* COMPONENT_LOAD_CONTEXT
* Generic component context loader from section_record
* @param object component
* @return promise context
*//*
data_manager.prototype.component_load_context = async function(component) {
	
	// section_record instance
		const section_record = await instances.get_instance({
			model 			: 'section_record',
			tipo 			: component.section_tipo,
			section_tipo 	: component.section_tipo,
			section_id		: component.section_id,
			mode			: component.mode,
			lang			: component.section_lang
		})
	
	// get context from section_record
		const context = section_record.get_component_context(component.tipo)

	// inject property
		component.context = context
			
	return context
}//end component_load_context
*/



/**
* COMPONENT_SAVE
* Receive full component object and start the save process across the section_record
* @param object component
* @return promise save_promise
*//*
data_manager.prototype.component_save = async (component, saved_component) => {
	if(SHOW_DEBUG===true) {				
		//console.log("component save",component)
		//console.log("instances:",instances);				
	}

	if (component.id!==saved_component.id) {
		return saved_component
	}

	const tipo = component.tipo

	// force to update / sync dom node and component value
		const node = component.node
		if(node){
			component.update_data_value()
		}

		node.classList.remove("success")		
	
	// // section_record instance
	// 	const section_record = await instances.get_instance({
	// 		model 			: 'section_record',
	// 		tipo 			: component.section_tipo,
	// 		section_tipo 	: component.section_tipo,
	// 		section_id		: component.section_id,
	// 		mode			: component.mode,
	// 		lang			: component.section_lang
	// 	})
	// 		
	// // section record save execution
	// 	const save_promise = section_record.save(component)
	

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
			  	console.log("++++++ error:",error);
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
}//end active
*/


