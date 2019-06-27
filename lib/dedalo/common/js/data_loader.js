// imports
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'


/**
* DATA_LOADER
*/
export const data_loader = function(options) {

	this.url 			= options.url

	this.method 		= options.method || 'POST' // *GET, POST, PUT, DELETE, etc.
	this.mode 			= options.mode || 'cors' // no-cors, cors, *same-origin
	this.cache 			= options.cache || 'no-cache' // *default, no-cache, reload, force-cache, only-if-cached
	this.credentials 	= options.credentials || 'same-origin' // include, *same-origin, omit
	this.headers 		= options.headers || {'Content-Type': 'application/json'}// 'Content-Type': 'application/x-www-form-urlencoded'
	this.redirect 		= options.redirect || 'follow' // manual, *follow, error
	this.referrer 		= options.referrer || 'no-referrer' // no-referrer, *client
	this.body 			= options.body // body data type must match "Content-Type" header

}//end data_loader



/**
* LOAD
*/
data_loader.prototype.load = function() {

 	return fetch(
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
		.then(response => response.json()); // parses JSON response into native Javascript objects 
}//end load



/**
* COMPONENT_LOAD_DATA
*/
export const component_load_data = function(component) {
	
	const js_promise = (async () => {

		// section_record instance
			const section_record = await instances.get_instance({
				model 			: 'section_record',
				tipo 			: component.section_tipo,
				section_tipo 	: component.section_tipo,
				section_id		: component.section_id,
				mode			: component.mode,
				lang			: component.section_lang
			})
		
		// set
			const data = section_record.get_component_data(component.tipo)
				
		return data
	})();

	
	return js_promise
}//end component_load_data


