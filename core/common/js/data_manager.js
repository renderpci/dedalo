/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



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

	this.url 			= options.url || DEDALO_CORE_URL + '/api/v1/json/'
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
			console.warn("-> handle_errors response:",response);
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
		.then(response => {
			// console.log("-> json response 1 ok:",response.body);
			const json_parsed = response.json().then((result)=>{
				//console.log("-> json result 2:",result);
				return result
			})
			return json_parsed
		})// parses JSON response into native Javascript objects
		.catch(error => {
			console.error("!!!!! [data_manager.request] ERROR:", error)
			return {
				result 	: false,
				msg 	: error.message,
				error 	: error
			}
		});

	// const api_response = await fetch(this.url, {
	// 		method		: this.method,
	// 		mode		: this.mode,
	// 		cache		: this.cache,
	// 		credentials	: this.credentials,
	// 		headers		: this.headers,
	// 		redirect	: this.redirect,
	// 		referrer	: this.referrer,
	// 		body		: JSON.stringify(this.body)
	// 	})
	// if (api_response.status >= 200 && api_response.status <= 299) {
	// 	const json_response = await api_response.json();
	// 	console.log("json_response", json_response);
	// 	return json_response
	// } else {
	// 	// Handle errors
	// 	console.log(api_response.status, api_response.statusText);
	// }

	return api_response
}//end request



/**
* SECTION_LOAD_DATA
* Generic section data loader (API read)
* @param object context
* @return promise api_response
*/
data_manager.prototype.section_load_data = async function(sqo_context) {

	// data_manager
		const api_response = this.request({
			body : {
				action 	: 'read',
				context : sqo_context
			}
		})

	// debug
		if(SHOW_DEBUG===true) {
			api_response.then((response)=>{
				console.log(`__Time to section_load_data ${response.debug.exec_time} [data_manager.section_load_data] response:`, response, `sqo_context:`, sqo_context);
			})
		}

	return api_response
}//end section_load_data



/**
* COUNT
* Generic section data loader
* @param object context
* @return promise api_response
*/
data_manager.prototype.count = async function(sqo) {

	// data_manager
		const api_response = this.request({
			body : {
				action 	: 'count',
				sqo 	: sqo
			}
		})

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("----------------------------------- count sqo:", sqo);
			// console.log("----------------------------------- count total:", total);
			// console.log("----------------------------------- count sqo stringify:", JSON.stringify(sqo));
			// console.log(`[data_manager.count] Count total: ${total}, time: ${api_response.result.debug.exec_time}, based on sqo filter:`, sqo.filter);
		}

	return api_response
}//end count



/**
* COUNT
* Generic section data loader
* @param object context
* @return promise api_response
*/
data_manager.prototype.count_OLD = async function(sqo) {

	// data_manager
		const api_response = await this.request({
			body : {
				action 	: 'count',
				sqo 	: sqo
			}
		})

	const total = api_response.result.total

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("----------------------------------- count sqo:", sqo);
			// console.log("----------------------------------- count total:", total);
			// console.log("----------------------------------- count sqo stringify:", JSON.stringify(sqo));
			console.log(`[data_manager.count] Count total: ${total}, time: ${api_response.result.debug.exec_time}, based on sqo filter:`, sqo.filter);
		}

	return total
}//end count



/**
* GET_ELEMENT_CONTEXT
* Resolves full element context based on minimal source vars
* Like:
*	source = {
*		model: "component_input_text"
*		tipo: "test159"
*		section_tipo: "test65"
*		section_id: null
*		mode: "search"
*	}
* @param object source
* @return promise api_response
*/
data_manager.prototype.get_element_context = async function(source) {

	// api request
		// const api_response = await this.request({
		const api_response = this.request({
			body : {
				action 	: 'get_element_context',
				source 	: source
			}
		})


	return api_response
}//end get_element_context



/**
* GET_PAGE_ELEMENT
* Get full page element
* @param object options
* @return promise api_response
*/
data_manager.prototype.get_page_element = async function(options) {

	// api request
		// const api_response = await this.request({
		const api_response = this.request({
			body : {
				action 	: 'get_page_element',
				options : options
			}
		})


	return api_response
}//end get_page_element



/**
* DOWNLOAD_URL
* @param string url
* @param string filename
* Donwload url blob data and create a temporal autofired link
*/
export function download_url(url, filename) {
	fetch(url).then(function(t) {
		return t.blob().then((b)=>{
			var a = document.createElement("a");
			a.href = URL.createObjectURL(b);
			a.setAttribute("download", filename);
			a.click();
			a.remove();
		}
		);
	});
}//end download_url



/**
* AREA_LOAD_DATA
* Generic area data loader
* @param object context
* @return promise api_response
*//*
data_manager.prototype.area_load_data = async function(basic_context) {

	// data_manager
		const api_response = this.request({
			body : {
				context : basic_context,
				action 	: 'read'
			}
		})

	// debug
		if(SHOW_DEBUG===true) {
			console.log("[data_manager.area_load_data] api_response for sqo_context:", api_response, sqo_context);
		}

	return api_response
}//end area_load_data
*/



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
