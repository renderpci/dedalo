// imports
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'


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
* COMPONENT_LOAD_DATA
* Generic component data loader from section_record
* @param object component
* @return promise data
*/
data_manager.prototype.component_load_data = async function(component) {
	
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



/**
* COMPONENT_LOAD_CONTEXT
* Generic component context loader from section_record
* @param object component
* @return promise context
*/
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



