"use strict"
/**
* COMPONENT_IP
*
*
*/
var component_ip = new function() {



	/**
	* INIT
	* @return
	*/
	this.init = function(options) {


		return true
	};//end init



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_input_text:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let dato = null

		// ul list of inputs
		const input = wrapper_obj.getElementsByTagName('input')[0] //wrapper_obj.querySelector('.content_data')
		if (input) {
			dato = input.value
		}
		if(SHOW_DEBUG===true) {
			console.log("[component_ip] dato:",dato);;
		}

		return dato
	};//end get_dato



	/**
	* SAVE
	* @param object component_obj
	* @return promise js_promise
	*/
	this.Save = function(component_obj) {

		let self = this

		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(btn_obj);
				return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
			}

		// Get dato specific
		let dato = self.get_dato(wrap_div)

		// Set for save
		self.save_arguments.dato = dato;

		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {

			  	// Update possible dato in list (in portal x example)
				component_common.propagate_changes_to_span_dato(component_obj);

				// Exec mandatory test
				component_input_text.mandatory(wrap_div.id)

			}, function(xhrObj) {
			  	console.log(xhrObj);
			});

		return js_promise
	};//end Save



	/**
	* OPEN IP INFO
	*/
	this.open_ip_info = function(obj) {

		let ip = $(obj).html();

		if (ip.length>2) {
			// Open geoip info window
			let url = "http://whatismyipaddress.com/ip/" + ip;
			window.open(url)
		}

		return true;
	};//end open_ip_info



	/**
	* LOAD_IP_INFO
	* Max 150 requests per minute
	* Unban IP: http://ip-api.com/docs/unban
	*/
	this.load_ip_info = function(ip) {
		$.getJSON("http://ip-api.com/json/"+ip, function(data) {
			console.log(data)
		});
	};//end load_ip_info



};//end component_ip
