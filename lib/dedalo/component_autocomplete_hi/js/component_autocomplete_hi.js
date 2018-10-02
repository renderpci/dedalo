/**
* COMPONENT_AUTOCOMPLETE_HI
*
*
*
*/
var component_autocomplete_hi = new function() {

	'use strict';

	this.wrapper_id;
	this.save_arguments = {}
	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/component_autocomplete_hi/trigger.component_autocomplete_hi.php';

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
		
		// Check exists dom autocomplete_wrapper
		const autocomplete_wrapper = document.getElementById('aw_' + options.uid)
			if (!autocomplete_wrapper) {
				alert("Error on get component autocomplete_wrapper from uid: " + options.uid); return false
			}
	
		// Init autocomplete service
		service_autocomplete.init({
			component_js  		 : self,
			autocomplete_wrapper : autocomplete_wrapper
		})

		// Avoid component_options_container propagate click event and deselect current wrapper
		/*wrapper.querySelector(".component_options_container").addEventListener("click", function(event) {
			//event.stopPropagation()
		}, false);*/
		
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

		const component_obj = wrapper_obj.querySelector('input[data-role="dato_hidden"]')
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
	* @param dom node component_obj
	* @return promise js_promise
	*/
	this.Save = function(component_obj) {

		const self = this
	
		if(page_globals.modo!=='edit') return false;

		// Set current wrapper_id from current component 
		//component_autocomplete_hi.wrapper_id = $(component_obj).parents('.css_wrap_autocomplete_hi').first().attr('id')
	
		// From component wrapper
		if (component_obj instanceof jQuery ) {
			component_obj = component_obj[0]	// object jquery case
			console.log("[component_autocomplete_hi:Save] Warning!! Don't use jQuery objects anymore!!!!!",);
		}
			
		const wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log(component_obj);
				return alert("[component_autocomplete_hi:Save]: Sorry: wrap_div dom element not found")
			}
			// Fix selected wrapper id
			component_autocomplete_hi.wrapper_id = wrap_div.id
	
		const dato = self.get_dato(wrap_div)

		self.save_arguments.dato = dato
			//console.log("self.save_arguments:",self.save_arguments); return;

		// Exec general save
		const js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {
				
				component_autocomplete_hi.refresh_component(null)
				if(typeof component_obj.dataset.link_fields !== "undefined"){
					component_autocomplete_hi.update_component_related(component_obj)
				}

			}, function(xhrObj) {
				console.log("[component_autocomplete_hi:Save] Error: " + xhrObj)
			});

		return js_promise	
	};//end Save



	/**
	* ON_SELECT (SPECIFIC)
	* Check component specific elements and later exe the default action on service autocomplete on_select
	* @return bool true
	*/
	this.on_select = function(options) {
	
		// Limit check
		// Useful in search mode basically
		const wrap_div 			 = options.wrap_div
		const hidden_input  	 = wrap_div.querySelector('[data-role="dato_hidden"]')
		const limit  			 = parseInt(wrap_div.dataset.limit)
		const current_val 		 = JSON.parse( hidden_input.value )
		const current_val_length = current_val.length + 1
		if (limit>0 && (current_val_length > limit)) {
			alert (get_label.exceeded_limit +" "+ limit)
			return false
		}

		// Standard default execution in service_autocomplete
		return service_autocomplete.on_select(options)
	};//end on_select



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
			const limit = parseInt(wrap_div.dataset.limit)							
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
					const new_li = document.createElement('li')
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
	* SELECT_COMPONENT
	* Change the the css to open the search input 
	* Display the buttons and options
	*/
	this.select_component = function(obj_wrap) {

		if (page_globals.modo==='tool_time_machine') {
			return true;
		}
		
		const component_options_container = obj_wrap.querySelector(".component_options_container")			
		if(component_options_container){
			component_options_container.classList.add("component_options_container_active")
			const autocomplete_wrapper 	= component_options_container.querySelector(".autocomplete_wrapper")
			const input_search_field 	= autocomplete_wrapper.querySelector("input")
				  input_search_field.focus()
				  input_search_field.click()
		}		

		return true;
	};//end select_component



	/**
	* UNSELECT_COMPONENT
	* Remove the visualitzaction of the search input
	* Remove the visualitzaction the buttons and options
	*/
	this.unselect_component = function(obj_wrap){

		const component_options_container = obj_wrap.querySelector(".component_options_container")
		if(component_options_container){
			component_options_container.classList.remove("component_options_container_active")
		}		

		return true;
	}//end unselect_component



	/**
	* REBUILD_SEARCH_QUERY_OBJECT (SPECIFIC)
	* Re-combines filter by fields and by sections in one search_query_object
	* @return json object search_query_object
	*/
	this.rebuild_search_query_object = function(wrap_div, q) {

		const self = this

		// search_query_object base stored in wrapper dataset
		const search_query_object 	= JSON.parse(wrap_div.dataset.search_query_object)
		// hierarchy_sections calculated from user selector checkboxes
		const hierarchy_sections 	= self.get_hierarchy_sections(wrap_div)

		// Update sections property in search_query_object
		search_query_object.section_tipo = hierarchy_sections

		const operator  = Object.keys(search_query_object.filter)[0] || '$and'
		const key 		= 0
		
		//const input 	= wrap_div.querySelector("input.autocomplete_input")
		//const q 		= input.value
		
		// Update q property
		search_query_object.filter[operator][key].q 	  = q + "*" // Begins with
		search_query_object.filter[operator][key].q_split = false

		// Update wrapper dataset
		wrap_div.dataset.search_query_object = JSON.stringify(search_query_object)
		
		if(SHOW_DEBUG===true) {
			//console.log("rebuild_search_query_object final filter ", JSON.stringify(search_query_object), search_query_object.filter);
		}

		return search_query_object
	};//end rebuild_search_query_object



	/**
	* BUILD_GRID_IMAGES
	* Rebuild last search query object (stored in wrapper) and search again. With results
	* create a dom list of images (svg)
	* This behavior is defined in component structure propiedades.custom_events
	* @param object options
	* @return promise js_promise
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

		// User selected item label
		const item_label = options.ui.item.original //+" - "+ options.ui.item.label

		const content_data 		  = options.input_obj.parentNode

		// grid_item_selected_label. Place where user selected item label is showed
		let grid_item_selected_label = content_data.querySelector(".grid_item_selected_label")
		if (!grid_item_selected_label) {
			// Create first time
			grid_item_selected_label = common.create_dom_element({
				element_type 	: "div",
				class_name 	 	: "grid_item_selected_label",
				parent 			: content_data
			})
		}
		grid_item_selected_label.innerHTML = item_label

		// grid_images_container
		let grid_images_container = content_data.querySelector(".grid_images_container")
		if (!grid_images_container) {
			// Create first time
			grid_images_container = common.create_dom_element({
				element_type 	: "div",
				class_name 	 	: "grid_images_container",
				parent 			: content_data
			})
		}

		const operator = "$and";

		// parse stringified search_query_object
		//const search_query_object = JSON.parse(self.search_query_object)
		const wrap_div 			  = options.wrap_div
		const search_query_object = JSON.parse(wrap_div.dataset.search_query_object)
			//console.log("+++++++ search_query_object:",search_query_object); return

			// Remove unnecessary properties
			delete search_query_object.distinct_values

			// Set no limit
			search_query_object.limit = 0
			
			// Change filter values for user selection
			// Split value by commas (remember component_input_text is an array and can contain more than a value)
			//const ar_elements  	 = options.ui.item.original.split(",")
			const ar_elements  	 = [options.ui.item.original]
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
			console.log("[component_autocomplete_hi.build_grid_images] ar_elements:",ar_elements);
			//console.log("search_query_object:",search_query_object);
			console.log("[component_autocomplete_hi.build_grid_images] search_query_object:",JSON.stringify(search_query_object));
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

					const result_length = response.result.length
					if (result_length===0) {
						grid_images_container.innerHTML = "Not found: " + options.ui.item.original
					}else{
						for (let i = 0; i < result_length; i++) {
							self.build_grid_image_dom(response.result[i], grid_images_container)
						}
						//grid_images_container.innerHTML = JSON.stringify(response.result
					}

				}else{
					alert("Error. response is null")
				}
		})		

		return js_promise
	};//end build_grid_images



	/**
	* BUILD_GRID_IMAGE_DOM
	* @return DOM node grid_image
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
		});	//console.log("grid_image:",grid_image);

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

		const trigger_url  = this.url_trigger
		const trigger_vars = {
				mode 		: 'update_component_related',
				ar_locators	: JSON.stringify(ar_values)
			}
			
		// Return a promise of XMLHttpRequest
		let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
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
		// Get fixed wrapper_id
		const current_wrapper_id = component_autocomplete_hi.wrapper_id
		
		return component_common.load_component_by_wrapper_id( current_wrapper_id );
	}//end refresh_component



	/**
	* DELETE
	* @param dom node btn_obj
	* @return bool true
	*/
	this.delete = function(btn_obj) {

		if (page_globals.modo==='edit') {
			if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		}

		const value_to_remove = JSON.parse(btn_obj.dataset.current_value)

		// From component wrapper		
		const wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(SHOW_DEBUG===true) console.log("[component_autocomplete_hi:delete] btn_obj",btn_obj)
				return alert("[component_autocomplete_hi:delete] Sorry: wrap_div dom element not found")
			}

		// Set value to component hidden dato input		
		const input_text_hide = wrap_div.querySelector('input.css_autocomplete_hi_dato_hidden')

		let current_value = input_text_hide.value
			current_value = JSON.parse(current_value)

		// Remove current value from array
		const len 					= current_value.length
		const value_to_remove_str 	= JSON.stringify(value_to_remove)
		for(let i = len - 1; i >= 0; i--) {
			///console.log(current_value[i]); console.log(value_to_remove);
			if( JSON.stringify(current_value[i]) === value_to_remove_str ) {			
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

		return true
	}//end delete



	/**
	* SELECT_ALL_HIERARCHY_SECTIONS
	* Check or uncheck all elements at once
	* @param dom node input_obj
	* @param string cookie_name
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

		return true
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
			ar_values = JSON.parse(ar_values)		
		
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

		let selected_values = [] // Default
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
		
		return createCookie(cookie_name, hierarchy_sections, 365)
	}//end save_hierarchy_sections

	

	/**
	* LINK_TERM
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		const locator 	= {
			section_id 		: section_id,
			section_tipo	: section_tipo
		}
		const wrap_div 	= component_common.selected_wrap_div
		const ui 		= {
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



	/**
	* IS_ROOT
	* Check if current tipo is thesaurus root
	*//*
	this.is_root = function(tipo) {
		const tipo_id = parseInt(tipo.substring(2));
		
		if(tipo_id==1) {
			return true;
		}

		return false		
	}//end is_root
	*/



	/**
	* TOGGLE_TOPONYMY_LIST
	* @return bool true
	*/
	this.toggle_toponymy_list = function(button_obj) {

		const toponymy_list_ul = button_obj.parentNode.querySelector('ul.toponymy_list')

		if (toponymy_list_ul.style.display==="table") {
			toponymy_list_ul.style.display = "";
		}else{
			toponymy_list_ul.style.display = "table";				
		}

		return true;
	};//end toggle_toponymy_list



}//end component_autocomplete_hi