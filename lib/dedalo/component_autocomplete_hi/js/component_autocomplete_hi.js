"use strict";
/**
* COMPONENT_AUTOCOMPLETE_HI
*
*
*/
var component_autocomplete_hi = new function() {


	this.wrapper_id;
	this.save_arguments = {}
	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/component_autocomplete_hi/trigger.component_autocomplete_hi.php';

	// autocomplete_trigger_url . For service autocomplete
	this.autocomplete_trigger_url = this.url_trigger

	this.cookie_name;
	this.limit = 0; // Max items to manage (zero to unlimited)
	this.min_length;



	/**
	* INIT
	* @param object options
	* @return bool
	*/
	this.init = function(options) {
		
		const self = this;

		// Reset activated (important)
		self.activated={};
		
		// wrapper
		const wrapper = document.getElementById(options.wrapper_id)			
			if (wrapper===null) {
				console.error("[component_autocomplete_hi.init] ERROR. Wrapper not found. " + options.wrapper_id);
				return false;
			}


		self.wrapper_id  = options.wrapper_id
		self.cookie_name = options.cookie_name
		self.limit 		 = options.limit || 0 // Max items to manage (zero to unlimited)
		self.min_length  = options.min_length || 2 // Min chars needed for start search
		
		const toponymy_list_button_options = wrapper.querySelector('.toponymy_list_button_options')			
		if(toponymy_list_button_options) {	
			
			// set_hierarchy_sections . Read from cookie if exists and update ul list
			self.set_hierarchy_sections(wrapper, options.cookie_name)	
			
			// Blur
			/*autocomplete_input.addEventListener("blur",function(event){
				//event.preventDefault();
				var toponymy_list_ul = wrapper.querySelector('ul.toponymy_list')
				toponymy_list_ul.style.display = "";
			},false);*/
		
			// Close button
			/*
			var toponymy_list_close = wrapper.querySelector('.toponymy_list_close')
				toponymy_list_close.addEventListener("click",function(event){				
					var toponymy_list_ul = wrapper.querySelector('ul.toponymy_list')
					toponymy_list_ul.style.display = "";
				},false);*/
		}
		
		const autocomplete_wrapper = document.getElementById('aw_' + options.uid)
			if (!autocomplete_wrapper) {
				alert("Error on get component autocomplete_wrapper from uid: " + options.uid); return false
			}
	
		// Init autocomplete service
		service_autocomplete.init({
			component_js  		 : self,
			autocomplete_wrapper : autocomplete_wrapper
		})
		
		return true
	};//end init



	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return string dato
	*	json encoded data
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_autocomplete:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const component_obj = wrapper_obj.querySelector('input[data-role="autocomplete_hi_dato_hidden"]')
		if (typeof(component_obj)==="undefined" || !component_obj) {
			console.log("[component_autocomplete:get_dato] Error. Invalid component_obj");
			return false
		}

		let dato = []
		if (component_obj.value && component_obj.value.length>0) {
			dato = JSON.parse(component_obj.value) || []
		}
		

		return dato
	};//end get_dato



	/**
	* SAVE
	*/
	var link_fields ;
	var autocomplete_hi_wrapper ;
	this.Save = function(component_obj) {

		let self = this
	
		if(page_globals.modo!=='edit') return false;

		// Set current wrapper_id from current component 
		//component_autocomplete_hi.wrapper_id = $(component_obj).parents('.css_wrap_autocomplete_hi').first().attr('id')
	
		// From component wrapper
		if (component_obj instanceof jQuery ) {
			component_obj = component_obj[0]	// object jquery case
			console.log("[component_autocomplete_hi:Save] Warning!! Don't use jQuery objects anymore!!!!!",);
		}
			
		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("component_autocomplete_hi:Save: Sorry: wrap_div dom element not found")
			}
			// Fix selected wrapper id
			component_autocomplete_hi.wrapper_id = wrap_div.id	

		// Fix data link fields from hidden input data
		//console.log($(component_obj).data('link_fields').component_geolocation )
		//link_fields 	   		= $(component_obj).data('link_fields');
		//autocomplete_hi_wrapper = $(component_obj).parents('.css_wrap_autocomplete_hi').first();
			//console.log(input_autocomplete_hi_valor);

		// Set current wrapper_id from current component
		//component_autocomplete_hi.wrapper_id = $(autocomplete_hi_wrapper).attr('id');
			//console.log(component_autocomplete_hi.wrapper_id);

		let dato = self.get_dato(wrap_div)

		self.save_arguments.dato = dato
			//console.log("self.save_arguments:",self.save_arguments); return;

		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments)
			
			js_promise.then(function(response) {
				
				component_autocomplete_hi.refresh_component(null)
				if(typeof component_obj.dataset.link_fields !== "undefined"){
					component_autocomplete_hi.update_component_related(component_obj)
				}

			}, function(xhrObj) {
				console.log(xhrObj)
			});

		return js_promise	
	}//end Save



	/**
	* ACTIVATE
	*/ /*
	this.activated = {};
	this.activate = function( input_obj ) {

		const self = this
		
		// Activate once
		const tipo = input_obj.dataset.tipo
		if ( typeof component_autocomplete_hi.activated[tipo] !== 'undefined' ) {
			if(SHOW_DEBUG===true) {
				console.log("[component_autocomplete_hi.activate] Component already activated :",component_autocomplete_hi.activated);
			}
			return false;
		}
		component_autocomplete_hi.activated[tipo] = true;
		//console.log(input_obj);	
		
		// From component wrapper		
		const wrap_div = find_ancestor(input_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(input_obj);
				return alert("component_autocomplete_hi:activate: Sorry: wrap_div dom element not found")
			}
			const obj_warp = wrap_div;

		// Custom events defined in propiedades
		let custom_events = []
		if (wrap_div.dataset.component_info) {
			const component_info = JSON.parse(wrap_div.dataset.component_info)
			const propiedades 	 = component_info.propiedades
				console.log("propiedades:",propiedades);
			if (propiedades.custom_events) {
				custom_events = propiedades.custom_events
			}
			if(SHOW_DEBUG===true) {
				console.log("[component_autocomplete_hi.activate] custom_events:",custom_events);
			}
		}

		const component_info  = JSON.parse(wrap_div.dataset.component_info)
		const distinct_values = component_info.propiedades.distinct_values || false		
		
		// HIDDEN_INPUT
		const hidden_input = input_obj.parentNode.querySelector('[data-role="autocomplete_hi_dato_hidden"]')

		// BUTTON DELETE : Hide when hidden_input no value		
		//var	button_delete	= input_obj.parentNode.querySelector('[data-role="autocomplete_hi_button_delete"]')
		//if( hidden_input.value.length <1 || hidden_input.value==='' || hidden_input.value==='""') button_delete.style.display = 'none';
	
		const hierarchy_types 	 = input_obj.dataset.hierarchy_types
		const hierarchy_sections = this.get_hierarchy_sections(wrap_div)	//input_obj.dataset.hierarchy_sections
			//console.log(input_obj.dataset.hierarchy_sections);			

		let cache = {};
		$(input_obj).autocomplete({
			delay: 250,
			minLength: self.min_length,
			source: function( request, response ) {
				let start = new Date().getTime()
				let term  = request.term
				// Cache
				// if ( term in cache ) {
				// 	response( cache[term] );
				// 	return;
				// }

				const trigger_vars = {
					mode 				: 'autocomplete',
					hierarchy_types 	: hierarchy_types,
					hierarchy_sections 	: JSON.stringify(component_autocomplete_hi.get_hierarchy_sections(wrap_div)),
					string_to_search 	: request.term,
					top_tipo 			: page_globals.top_tipo,
					from_component_tipo : tipo,
					distinct_values 	: distinct_values
				}
				//console.log("[autocomplete_hi.autocomplete] trigger_vars", trigger_vars); return
				
				// Ajax call
				common.get_json_data(component_autocomplete_hi.url_trigger, trigger_vars).then(function(response_data) {
						if(SHOW_DEBUG===true) {								
							var end  = new Date().getTime(); var time = end - start;
							//console.log("Time for "+term+": "+time+"ms");
							console.log("[autocomplete_hi.autocomplete] response_data", response_data, "Total: "+time+" ms");
						}
						// cache[term] = response_data

						// search_query_object
						self.search_query_object = response_data.search_query_object
						
						const label_value = component_autocomplete_hi.convert_data_to_label_value(response_data.result)
						response(label_value)

					}, function(error) {
						console.error("[autocomplete_hi.autocomplete] Failed get_json!", error);
					});				
			},
			// When a option is selected in list
			select: function( event, ui ) {

				const custom_events_select = custom_events.filter(item => item.hasOwnProperty("select"))
				if (custom_events_select.length>0) {

					// Custom behavior
					for (var i = 0; i < custom_events_select.length; i++) {
						let fn = custom_events_select[i].select						
						self[fn]({
							event 		 : event,
							ui 			 : ui,
							input_obj 	 : this,
							hidden_input : hidden_input,
							params 		 : custom_events_select[i].params || {}
						})
					}
					
				}else{

					// Default behavior
					self.on_select({
						event 		 : event,
						ui 			 : ui,
						input_obj 	 : this,
						hidden_input : hidden_input,
						params 		 : {}
					})
				}				
			},
			// When a option is focus in list
			focus: function( event, ui ) { 
				// prevent set selected value to autocomplete input
				event.preventDefault();
			},
			change: function( event, ui ) {
				//console.log(event)
				//console.log(ui)			   		
				//$(this).val('')
				this.value = ''
			},
			response: function( event, ui ) {
				//console.log(ui);
			}	 
		});//end $(this).autocomplete({		
	};//end this.activate */



	/**
	* ON_SELECT
	* Default action on autocomplete select event
	* @return bool true
	*//*
	this.on_select = function(options) {

		const self = this

		// Prevent set selected value to autocomplete input
		options.event.preventDefault()
		// Clean input value
		options.input_obj.value = ''			

		// Default beaviour
		const ui 	= options.ui
		const label = ui.item.label
		const value = JSON.parse(ui.item.value)

		// Add locator (and saves in edit mode)
		self.add_locator(value, label, options.hidden_input)

		// Blur input
		options.input_obj.blur()

		return true
	};//end on_select */



	/**
	* ADD_LOCATOR
	* @return 
	*/
	this.add_locator = function(locator, wrap_div, ui) {
	
		const self = this

		// wrap_div
		if (wrap_div===null) {
			if(SHOW_DEBUG===true) console.log(hidden_input);
			alert("[component_autocomplete_hi.add_locator] Sorry: wrap_div dom element not found")
			return false
		}		

		const value = locator
		const label = ui.item.label
		

		// Converts terminoID to locator object, like es1281 => Object {section_id: "1281", section_tipo: "es1"}
		//var value = component_autocomplete_hi.convert_dato_to_locator(value)
		
		if (value && typeof value==='object') {

			const hidden_input = wrap_div.querySelector("input.css_autocomplete_hi_dato_hidden")
			if (!hidden_input) {
				alert("[component_autocomplete_hi.add_locator] Error on get hidden_input")
				return false
			}
		
			// Get current hidden input value
			const current_input_value = hidden_input.value || '[]';
			//console.log(current_input_value); return;

			// parse josn string value to object
			const current_val = JSON.parse( current_input_value ) || []
				
				// check if value already exits
				for (let key in current_val) {
					if(JSON.stringify(current_val[key]) === JSON.stringify(value)){
						console.log("[component_autocomplete_hi.add_locator] Value already exits. Ignored value: "+JSON.stringify(value)+" => "+label);
						return false
					}
				}

			// Limit (optional, defined in 'propiedades' and set on init)
			const limit = parseInt(hidden_input.dataset.limit)							
			if(limit>0 && parseInt(current_val.length)>=limit) {
				// Warning. Limit reached
				alert("[component_autocomplete_hi.add_locator] Limit reached ("+limit+"). Skipped term !!"); return false
			}else{
				// Add value to current object
				current_val.push(value)
			}
	
			// Set modified value to component input as text
			hidden_input.value = JSON.stringify(current_val)

			switch(page_globals.modo){
				case 'edit':
					// Edit Save value 
					self.Save(hidden_input)
					break;
				case 'search':					
				case 'tool_indexation':
				case 'tool_structuration':
				case 'tool_transcription':				
				case 'list':
					// Search
					/*
					var div_valor = $(hidden_input).parent().find('.css_autocomplete_hi_valor')
					div_valor.html( div_valor.html() + "<li><div class=\"icon_bs link css_autocomplete_hi_button_delete\" \
						data-current_value='"+JSON.stringify(value)+"' onclick=\"component_autocomplete_hi.delete(this)\"></div>"+ label + "</li>" )
					*/
					
					// 'ul_valor' is ul element
					const ul_valor = wrap_div.querySelector('.css_autocomplete_hi_valor')

					// New li element
					const new_li 	  = document.createElement('li')
					const new_li_button_delete = document.createElement('div')
						new_li_button_delete.classList.add('icon_bs','link','css_autocomplete_hi_button_delete')
						new_li_button_delete.dataset.current_value = JSON.stringify(value)
						new_li_button_delete.addEventListener('click', function(event){
							component_autocomplete_hi.delete(this)
						}, false);
					const new_li_label = document.createElement('span')
						new_li_label.innerHTML = label

						new_li.appendChild(new_li_button_delete)
						new_li.appendChild(new_li_label)

					// Add created li to ul
					ul_valor.appendChild(new_li)

					// Search component modo case
					if (wrap_div.dataset.modo==="search") {
						component_common.fix_dato(hidden_input,'component_autocomplete_hi')
					}
					break;	
				default:
					break;
			}						
		}

		return true
	};//end add_locator



	/**
	* BUILD_GRID_IMAGES
	* @return 
	*/
	this.build_grid_images = function(options) {

		if(SHOW_DEBUG===true) {
			console.log("[component_autocomplete_hi.build_grid_images] options:",options);
		}
		
		const self = this

		// Prevent set selected value to autocomplete input
		options.event.preventDefault()
		// Clean input value
		options.input_obj.value = ''		

		const content_data 		  = options.input_obj.parentNode;		
		let grid_images_container = content_data.querySelector(".grid_images_container")
		if (!grid_images_container) {
			// Create
			grid_images_container = common.create_dom_element({
				element_type 	: "div",
				class_name 	 	: "grid_images_container",
				parent 			: content_data
			})
		}

		const operator = "$and"; // "$and"

		// parse stringified search_query_object
		let search_query_object = JSON.parse(self.search_query_object)
						
			// Remove unnecessary properties
			delete search_query_object.distinct_values

			// Set no limit
			search_query_object.limit = 0
			
			// Change filter values for user selection
			// Split value by commas (remember component_input_text is an array and can contain more than a value)
			const ar_elements  	 = options.ui.item.original.split(",")
			const len 		   	 = ar_elements.length
			const reference_item = JSON.parse(JSON.stringify(search_query_object.filter[operator][0])) // Clone old sentence to re-use
			// Delete current filter sentence
			delete search_query_object.filter[operator]
			// Create new one
			search_query_object.filter[operator] = []
			// Add each word as a different filter sentence
			for (let i = 0; i < len; i++) {
				let q = "=" + ar_elements[i]; // Original value without parents, etc.
				let filter_item   = JSON.parse(JSON.stringify(reference_item))
					filter_item.q = q
				search_query_object.filter[operator].push(filter_item)
			}								
		
		if(SHOW_DEBUG===true) {
			console.log("ar_elements:",ar_elements);
			//console.log("search_query_object:",search_query_object);
			console.log("search_query_object:",JSON.stringify(search_query_object));
		}		

		const trigger_url  = this.url_trigger
		const trigger_vars = {
				mode 				: 'build_grid_images',
				search_query_object	: search_query_object,
				component_tipo 		: options.params.component_tipo
			}
			
		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete_hi.build_grid_images] response:", response); 
				}
				if (response && response.result) {

					// Clean grid_images_container html
					while (grid_images_container.firstChild) {
						grid_images_container.removeChild(grid_images_container.firstChild);
					}

					const len = response.result.length
					for (let i = 0; i < len; i++) {
						self.build_grid_image_dom(response.result[i], grid_images_container)
					}
					//grid_images_container.innerHTML = JSON.stringify(response.result)

					if (len===0) {
						grid_images_container.innerHTML = "Not found: " + options.ui.item.original
					}

				}else{
					alert("Error. response is null")
				}
		})
		

		return js_promise
	};//end build_grid_images



	/**
	* BUILD_GRID_IMAGE_DOM
	* @return DOM object grid_image
	*/
	this.build_grid_image_dom = function(item, parent) {

		// Reference 
		// <img id="[svg-n-1-]" src="/dedalo4/media_test/media_development/svg/0/test53_test65_1.svg" class="svg" 
		// data-type="svg" data-tag_id="1" data-state="n" data-label="" data-data="{'section_tipo':'test65','component_tipo':'test53','section_id':'1'}" />
		
		let locator_string = JSON.stringify(item.locator)
			locator_string = locator_string.replace(/\"/g, "'");

		const grid_image = common.create_dom_element({
			element_type 	: "img",
			id 				: "[svg-n-1-]",
			class_name 	 	: "svg grid_image",
			parent 			: parent,
			src 			: item.url,
			data_set 		: {				
				type 	: "svg",
				tag_id  : "0",
				state 	: "n",
				label 	: "",
				data 	: locator_string,
			}
		})
		//console.log("grid_image:",grid_image);

		const grid_image_click_event = new CustomEvent('grid_image_click', {
			detail : { "locator" : item.locator }
		})
		grid_image.addEventListener("click",function(e){
			// console.log("e:",this,e);			
			// launch custom event
			// console.log("grid_image_click_event",grid_image_click_event);
			window.dispatchEvent(grid_image_click_event)
		})

		return grid_image
	};//end build_grid_image_dom



	/**
	* UPDATE_COMPONENTS_RELATED
	* Get the geolocation lat long of the term that is searched and put inside the related term "geolocation" (the map)
	*/
	this.update_component_related = function(component_obj) {

		const related_term 	= component_obj.dataset.link_fields;
		const related 		=  JSON.parse(related_term)

		const current_tipo 	= related.component_geolocation
		const ar_values 	= component_obj.value
		if (ar_values==='[]'){return}

		const trigger_vars = {
				mode 		: 'update_component_related',
				ar_locators	: JSON.stringify(ar_values)
			}
			
		// Return a promise of XMLHttpRequest
		let js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[component_autocomplete_hi.update_component_related] response:", response); 
					}
					if (response && response.result) {

						component_geolocation.update_component_related(current_tipo, response.result)

					}else{
						alert("Error. response is null")
					}
			})

		return js_promise		
	};//end update_component_related
	


	/**
	* REFRESH_COMPONENT
	* Triggered when this component save
	* received data is section_id of current new/existing component
	*/
	this.refresh_component = function(received_data) {
		
		return component_common.load_component_by_wrapper_id( component_autocomplete_hi.wrapper_id );
	}//end refresh_component



	/**
	* DELETE
	*/
	this.delete = function(btn_obj) {

		if (page_globals.modo==='edit') {
			if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		}

		const value_to_remove = JSON.parse(btn_obj.dataset.current_value)
			//console.log(current_value);

		// From component wrapper		
		const wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log("[component_autocomplete_hi:delete] btn_obj",btn_obj);
				return alert("[component_autocomplete_hi:delete] Sorry: wrap_div dom element not found")
			}

				//console.log("wrap_div:",wrap_div);

		// Set value to component hidden dato input		
		const input_text_hide = wrap_div.querySelector('input.css_autocomplete_hi_dato_hidden')	//$(btn_obj).parents('.content_data').first().find('.css_autocomplete_hi_dato_hidden:input');

		let current_value = input_text_hide.value
			current_value = JSON.parse(current_value)

		// Remove current value from array
		const len = current_value.length
		for(let i = len - 1; i >= 0; i--) {
			///console.log(current_value[i]); console.log(value_to_remove);
			if( JSON.stringify(current_value[i]) === JSON.stringify(value_to_remove) ) {			
			   current_value.splice(i, 1);
			   if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete_hi:delete] deleted i:"+i+" "+JSON.stringify(value_to_remove)) ;
			   }
			}
		}

		// Update input value
		input_text_hide.value = JSON.stringify(current_value)			

		// Update showed text. Remove li element
		btn_obj.parentNode.remove();

		// Save when edit
		if (page_globals.modo==='edit') {		
			this.Save(input_text_hide);
		}

		// Search component modo case
		if (wrap_div.dataset.modo==="search") {
			component_common.fix_dato(input_text_hide,'component_autocomplete_hi')
		}
	}//end delete



	/**
	* SELECT_ALL_HIERARCHY_SECTIONS
	* Check or uncheck all elements at once
	*/
	this.select_all_hierarchy_sections = function(input_obj, cookie_name) {

		const wrap_div 		 	= find_ancestor(input_obj, 'wrap_component')
		const toponymy_list_ul 	= wrap_div.querySelector('ul.toponymy_list')
		const ar_inputs 		= toponymy_list_ul.querySelectorAll('input')
		
		const len = ar_inputs.length	
		for (let i = len - 1; i >= 0; i--) {
			ar_inputs[i].checked = input_obj.checked
		}		

		this.save_hierarchy_sections(input_obj, cookie_name)
	}//end select_all_hierarchy_sections



	/**
	* SET_HIERARCHY_SECTIONS
	* Reads cookie if exists and aply values to current list
	*/
	this.set_hierarchy_sections = function(wrap_div, cookie_name) {

		let ar_values = readCookie(cookie_name)
			if (!ar_values) {
				return false;
			}
		
		ar_values = JSON.parse(ar_values);
			//console.log(ar_values); return;
		
		const toponymy_list_ul 	= wrap_div.querySelector('ul.toponymy_list')
		const ar_inputs 		= toponymy_list_ul.querySelectorAll('input')
		
		const len = ar_inputs.length
		for (let i = len - 1; i >= 0; i--) {
			if(ar_values.indexOf(ar_inputs[i].value)!==-1) {
				ar_inputs[i].checked = true
			}else{
				ar_inputs[i].checked = false
			}
		}

		return true
	}//end set_hierarchy_sections



	/**
	* GET_HIERARCHY_SECTIONS
	* @return array of checked hierarchy_sections sections
	*/
	this.get_hierarchy_sections = function(wrap_div) {
		
		const toponymy_list_ul 	= wrap_div.querySelector('ul.toponymy_list')
		const ar_inputs 		= toponymy_list_ul.querySelectorAll('input')

		let selected_values = []
		const len = ar_inputs.length
		for (let i = len - 1; i >= 0; i--) {
			if(ar_inputs[i].checked) {
				selected_values.push(ar_inputs[i].value)
			}
		}

		if (selected_values.length<1) {

			// Get from wrapper dataset
			selected_values = JSON.parse(wrap_div.dataset.hierarchy_sections)
			if(SHOW_DEBUG===true) {
				console.log("Fallback apply. Get hierarchy_sections from wrapper:",selected_values);
			}
		}


		return selected_values
	}//end get_hierarchy_sections



	/**
	* SAVE_HIERARCHY_SECTIONS
	* Cookie stores current list values as json encoded array
	*/
	this.save_hierarchy_sections = function(input, cookie_name) {

		const wrap_div 			  = input.parentNode.parentNode.parentNode.parentNode;
		const hierarchy_sections  = JSON.stringify( this.get_hierarchy_sections(wrap_div) )
		if(SHOW_DEBUG===true) {
			//console.log("[component_autocomplete.save_hierarchy_sections] hierarchy_sections:",hierarchy_sections, cookie_name)
		}

		return createCookie(cookie_name, hierarchy_sections, 365)
	}//end save_hierarchy_sections



	/**
	* CONVERT_DATA_TO_label_value
	* @return array result
	*//*
	this.convert_data_to_label_value = function(data) {
		
		let result = []
		for (let key in data) {
			
			let obj = {
				label 	 : data[key].label, // Label with additional info (parents, model, etc.)
				value 	 : data[key].key, 	// Locator stringnified
				original : data[key].value  // Original value without parents etc
			}
			result.push(obj)
		}

		return result
	};//end convert_data_to_label_value
	*/



	/**
	* LINK_TERM
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		const locator = {
			section_id 		: section_id,
			section_tipo	: section_tipo
		}

		const wrap_div = component_common.selected_wrap_div

		const ui = {
			item : {
				label : label
			}
		}

		// add_locator
		component_autocomplete_hi.add_locator(locator, wrap_div, ui) // locator, wrap_div, ui

		return true
	};//end link_term
	


	/**
	* OPEN_TS_WINDOW
	* Abrir listado de tesauro para hacer relaciones
	*//*
	var relwindow = null
	this.selected_wrap_div = null;
	this.open_ts_window = function(button_obj) {
	
		// Fix current this.selected_wrap_div (Important)
		// Nota: el wrapper no cambia al actualizar el componente tras salvarlo, por lo que es seguro
		this.selected_wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (this.selected_wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(button_obj);
				return alert("component_autocomplete_hi:open_ts_window: Sorry: this.selected_wrap_div dom element not found")
			}

		var THESAURUS_TIPO = 'dd100'
		var url_vars = {
				t 					: THESAURUS_TIPO,
				menu 				: 'no',
				thesaurus_mode 		: 'relation',
				component_name 		: 'component_autocomplete_hi',
				hierarchy_types 	: button_obj.dataset.hierarchy_types,
				hierarchy_sections 	: button_obj.dataset.hierarchy_sections
			}
			//return 	console.log(url_vars);
			
		var url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)

		relwindow = window.open(url ,'listwindow','status=yes,scrollbars=yes,resizable=yes,width=900,height=650');//resizable
		if (relwindow) relwindow.moveTo(-10,1);
		if (window.focus) { relwindow.focus() }
	};//end open_ts_window
	*/



	this.is_root = function(tipo) {
		let tipo_id = parseInt(tipo.substring(2));
			//alert(tipo + ' '+ tipo_id)
		if(tipo_id==1) {
			return true;
		}else{
			return false;
		}
	};



	/**
	* TOGGLE_TOPONYMY_LIST
	* @return 
	*/
	this.toggle_toponymy_list = function(button_obj) {

		let toponymy_list_ul = button_obj.parentNode.querySelector('ul.toponymy_list')

		if (toponymy_list_ul.style.display==="table") {
			toponymy_list_ul.style.display = "";
		}else{
			toponymy_list_ul.style.display = "table";			

			//var rect = this.getBoundingClientRect();
			//console.log(rect.top, rect.right, rect.bottom, rect.left);
			//toponymy_list_ul.style.left = (event.clientX )+"px";
			//toponymy_list_ul.style.top = (event.clientY )+"px";
			//toponymy_list_ul.style.left = (rect.right - 19) +"px";
			//toponymy_list_ul.style.top = -24+"px";	
		}

		return true;
	};//end toggle_toponymy_list



}//end component_autocomplete_hi