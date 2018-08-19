/**
* SERVICE_AUTOCOMPLETE
* Used as service by component_autocomplete, component_autocomplete_hi, 
* component_relation_parent, component_relation_children, component_relation_related
*
*/
var service_autocomplete = new function() {

	'use strict';

	/**
	* INIT
	* @return bool
	*/
	this.init = function(request_options) {
	
		const self = this
		
		const options = {
			component_js    	 : null,
			autocomplete_wrapper : null,

		}
		for(let key in request_options) {
			if (options.hasOwnProperty(key)) { options[key] = request_options[key] }
		}		

		const wrapper = options.autocomplete_wrapper
			if (!wrapper) {
				alert("Error. Invalid wrapper");
				return false
			}

		// Build_autocomplete_input input 
		const input_obj = self.build_autocomplete_input({
			parent : wrapper
		})
		// Activate autocomplete on click
		input_obj.addEventListener("click", function(e){
			// Activate
			self.activate(input_obj, options.component_js)
		}, false)


		return true
	};//end init



	/**
	* BUILD_AUTOCOMPLETE_INPUT
	* Create the html of input search autocomplete
	* @return dom object input_obj
	*/
	this.build_autocomplete_input = function(options) {

		const self = this
		
		const input_obj = common.create_dom_element({
			element_type 	: "input",
			class_name 	 	: "autocomplete_input", // css_autocomplete_hi_search_field 
			parent 			: options.parent		
		})
		input_obj.setAttribute("type", "text")
		input_obj.setAttribute("placeholder", get_label.buscar + '...')
		input_obj.setAttribute("autocomplete", "off")
		input_obj.setAttribute("autocorrect", "off")

		// <input class="css_autocomplete_hi_search_field" type="text" placeholder="Find..." 
		// data-id_wrapper="wrapper__hierarchy92_1_lg-nolan_edit__ts1" data-tipo="hierarchy92" data-hierarchy_types="[]" data-hierarchy_sections="[&quot;ca1&quot;,&quot;co1&quot;,&quot;es1&quot;,&quot;fr1&quot;,&quot;gr1&quot;,&quot;gt1&quot;,&quot;sv1&quot;,&quot;xk1&quot;,&quot;ru1&quot;,&quot;af1&quot;]" 
		// onfocus="component_autocomplete_hi.activate(this)" tabindex="1" autocomplete="off" autocorrect="off">
		
		return input_obj
	};//end build_autocomplete_input



 	/**
	* ACTIVATE
	* This method is invoked when user clicks on input text field of current component
	*/
	let cache = {};
	this.activate = function( input_obj, component_js ) {
		
		const self = this

		// wrap_div . From component wrapper
			const wrap_div = find_ancestor(input_obj, 'wrap_component')
				if (wrap_div===null) {
					if(SHOW_DEBUG) console.log(input_obj);
					return alert("component_relation_related:activate: Sorry: wrap_div dom element not found")
				}

		// Vars
			const tipo 				 = wrap_div.dataset.tipo
			const component_info 	 = (wrap_div.dataset.component_info) ? JSON.parse(wrap_div.dataset.component_info) : {}
			const propiedades 	 	 = component_info.propiedades || {}

		// Custom events defined in propiedades
			let custom_events = []		
			if (propiedades.custom_events) {
				custom_events = propiedades.custom_events
			}
			if(SHOW_DEBUG===true) {
				console.log("[service_autocomplete.activate] custom_events:",custom_events)
			}

		
		$(input_obj).autocomplete({
			delay 		: 250,
			minLength 	: component_js.min_length || 1,
			source: function( request, response ) {

				// Cache
				//const uid = tipo + '_' + request.term
				//if ( uid in cache ) {
				//	if(SHOW_DEBUG===true) {
				//		//console.log("From cache!!: ",uid);;
				//	}
				//	response(cache[uid])
				//	return;
				//}
				
				// Request term
				const q 				  = request.term
				// Get wrap_div base search_query_object and updates with user input value
				const search_query_object = component_js.rebuild_search_query_object(wrap_div, q)
				
				self.autocomplete_search({
					component_tipo 		: wrap_div.dataset.tipo,
					section_tipo 		: wrap_div.dataset.section_tipo,
					divisor 			: wrap_div.dataset.divisor || " | ",
					search_query_object : search_query_object
				})
				.then(function(response_data){
					if(SHOW_DEBUG===true) {
						console.log("[service_autocomplete.activate] response_data:",response_data);
					}
						
					// Format result for use in jquery label / value
					const label_value = self.convert_data_to_label_value(response_data)
					
					// Exec response callback for jquery source
					response(label_value)
				})				
			},
			// When a option is selected in list
			select: function( event, ui ) {
				
				const custom_events_select = custom_events.filter(item => item.hasOwnProperty("select"))
				if (custom_events_select.length>0) {

					// Custom behavior
					for (let i = 0; i < custom_events_select.length; i++) {
						const fn = custom_events_select[i].select						
						component_js[fn]({
							event 		 : event,
							ui 			 : ui,
							input_obj 	 : this,
							params 		 : custom_events_select[i].params || {},
							component_js : component_js,
							wrap_div 	 : wrap_div
						})
					}
					
				}else{

					// Default behavior
					if (typeof component_js.on_select!=="undefined") {
						// Component specific action
						component_js.on_select({
							event 		 : event,
							ui 			 : ui,
							input_obj 	 : this,
							params 		 : {},
							component_js : component_js,
							wrap_div 	 : wrap_div
						})
					}else{
						// Generic action
						self.on_select({
							event 		 : event,
							ui 			 : ui,
							input_obj 	 : this,
							params 		 : {},
							component_js : component_js,
							wrap_div 	 : wrap_div
						})
					}
				}
			},
			// When a option is focus in list
			focus: function( event, ui ) {
				event.preventDefault(); // prevent set selected value to autocomplete input
			},
			change: function( event, ui ) {
				this.value = ''
			},
			response: function( event, ui ) {
			}
		});//end $(this).autocomplete({	

		return true	
	};//end this.activate



	/**
	* AUTOCOMPLETE_SEARCH
	* @param object options {
	* 	component_tipo, section_tipo, divisor, search_query_object
	* }
	*/
	this.autocomplete_search = function(search_options){

		const url_trigger  = DEDALO_LIB_BASE_URL + "/services/service_autocomplete/trigger.service_autocomplete.php"
		const trigger_vars = {
				mode 	 			: 'autocomplete_search',
				component_tipo 		: search_options.component_tipo, 
				section_tipo 		: search_options.section_tipo, 
				divisor 			: search_options.divisor || " | ",
				search_query_object : search_options.search_query_object,
				top_tipo 			: page_globals.top_tipo
			}; //console.log("[autocomplete_search.load_rows] trigger_vars", trigger_vars)

		// PROMISE JSON XMLHttpRequest
		const js_promise = common.get_json_data(url_trigger, trigger_vars).then(function(response){
			if (SHOW_DEBUG===true) {				
				if (!response.result) {
					console.warn("[services.autocomplete_search] response:",response);
					//console.log("[services.autocomplete_search] response "+response.msg +" "+ response.debug.exec_time);
				}
			}

			if (!response) {
				// Notify to log messages in top of page
				console.error("[services.autocomplete_search] Error. response is null", response);
				return null
			}else{
				// Return result
				return response.result				
			}			
		})

		return js_promise
	}//autocomplete_search



	/**
	* ON_SELECT (GENERIC)
	* Default action on autocomplete select event
	* @return bool true
	*/
	this.on_select = function(options) {
	
		const self = this

		// Prevent set selected value to autocomplete input
		options.event.preventDefault()
		// Clean input value
		options.input_obj.value = ''

		// Default behavior
		const ui 	= options.ui
		const label = ui.item.label
		const value = JSON.parse(ui.item.value)

		const wrap_div = options.wrap_div

		// Add locator (and saves in edit mode)
		// add_locator is a generic and needed function in each component tha use autocomplete
		options.component_js.add_locator(value, wrap_div, ui)

		// Blur input
		options.input_obj.blur()

		return true
	};//end on_select



	/**
	* CONVERT_DATA_TO_LABEL_VALUE
	* @return array result
	*/
	this.convert_data_to_label_value = function(data) {
		
		const result = []
		const len 	 = data.length
		for (let i = 0; i < len; i++) {
			
			const obj = {
				label 	 : data[i].label, // Label with additional info (parents, model, etc.)
				value 	 : data[i].key,   // Locator stringnified
				original : data[i].value  // Original value without parents etc
			}
			result.push(obj)
		}

		// Sort result by original property
		result.sort(function(a,b) {return (a.label.toLowerCase() > b.label.toLowerCase()) ? 1 : ((b.label.toLowerCase() > a.label.toLowerCase()) ? -1 : 0);} );

		
		return result
	};//end convert_data_to_label_value



}//end class