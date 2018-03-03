"use strict";
/**
* component_autocomplete
*
*
*/
var component_autocomplete = new function() {

	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_autocomplete/trigger.component_autocomplete.php'
	this.ajax_container
	this.tipo
	this.parent
	this.current_tipo_section
	this.propiedades
	this.label
	this.wrapper_id
	this.cookie_name;
	this.limit = 0; // Max items to manage (zero to unlimited)
	this.save_arguments = {}


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		return true
	};//end init



	/**
	* GET_DATO
	* dato is a string value from input hidden that contains a json encoded array of locators
	* @param DOM object wrapper_obj
	* @return string dato
	*/
	this.get_dato = function(wrapper_obj) {
	
		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_autocomplete:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		let component_obj = wrapper_obj.querySelector('input[data-role="autocomplete_dato_hidden"]')

		if (typeof(component_obj)=="undefined" || !component_obj) {
			console.log("[component_autocomplete:get_dato] Error. Invalid component_obj");
			return false
		}

		let dato = JSON.parse(component_obj.value) || []
		

		return dato
	};//end get_dato


	/**
	* GET_SEARCH_VALUE_FROM_DATO
	* Converts dato object to string ready to search
	* @return string search_value
	*/
	this.get_search_value_from_dato = function(dato) {
		
		let dato_parsed  = dato
		
		let search_value = JSON.stringify(dato_parsed)
			console.log("search_value:",search_value, dato);

		return search_value
	};//end get_search_value_from_dato



	/**
	* SAVE
	*/
	this.Save = function(component_obj, request_options) {

		let self = this
		
		if(page_globals.modo!=='edit' && page_globals.modo!=='tool_import_files') return false;
		
		if (!component_obj) {
			console.log(component_obj);
			return false
		}
		
		// From component wrapper
		let wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_autocomplete:Save: Sorry: wrap_div dom element not found")
			}
			let wrapper_id = wrap_div.id

		// save_options		
		let save_options = typeof request_options!=="undefined" ? request_options : {}
			//console.log("save_options:",save_options);

		// dato
		let dato = self.get_dato(wrap_div)
		
		// Set save_arguments
		self.save_arguments.dato = dato
			//console.log("self.save_arguments.dato:",self.save_arguments.dato); return;

		// Exec general save
		let js_promise = component_common.Save(component_obj, self.save_arguments).then(function(response) {
				if(SHOW_DEBUG===true) {
					//console.log("[component_autocomplete.Save] response",response)
				}
				if (save_options.reload===true) {
					component_common.load_component_by_wrapper_id(wrapper_id)
					//console.log("reloading component wrapper_id:",wrapper_id,wrap_div);
				}	
		}, function(xhrObj) {
			console.log("[component_autocomplete.Save] Error xhrObj",xhrObj);
		});


		return js_promise
	};//end Save



	/**
	* INIT_FILTER_BY_LIST
	* @return 
	*/
	this.init_filter_by_list = function(options) {
		
		let wrapper = document.getElementById(options.wrapper_id)	
			if (wrapper===null) {
				console.log("Error. Wrapper not found. " + options.wrapper_id);
				return false;
			}
				
		/*
		this.wrapper_id  = options.wrapper_id
		this.cookie_name = options.cookie_name
		this.limit 		 = options.limit || null // Max items to manage (zero to unlimited)		
		
		let autocomplete_list_button_options = wrapper.querySelector('.autocomplete_list_button_options')
		if (autocomplete_list_button_options) {
			autocomplete_list_button_options.addEventListener("click",function(event){
				//event.preventDefault();
				//console.log(this)

				let filter_by_list_ul = this.parentNode.querySelector('ul.filter_by_list') 

				if (filter_by_list_ul.style.display==="table") {
					filter_by_list_ul.style.display = "";
				}else{
					filter_by_list_ul.style.display = "table";	
				}
			},false);
			
			// set_filter_sections . Read from cookie if exists and update ul list
			this.set_filter_sections(wrapper, options.cookie_name)
		}*/

		// set_filter_sections . Read from cookie if exists and update ul list
		this.set_filter_sections(wrapper, options.cookie_name)


		return true
	};//end init_filter_by_list



	/**
	* TOGGLE_OPTIONS
	* @return 
	*/
	this.toggle_options = function(button_obj) {

		// [data-tipo="'+tipo+'"]

		let tipo = button_obj.dataset.tipo
			console.log("tipo:",tipo);
		
		let options_div = button_obj.parentNode.querySelector('.autosearch_options[data-tipo="'+tipo+'"]')
			//console.log(options_div);

		if (options_div.style.display==="block") {
			options_div.style.display = "";
		}else{
			options_div.style.display = "block";	
		}

		return true
	};//end toggle_options



	/**
	* DELETE
	*/
	this.delete = function(btn_obj) {

		let self = this

		if (page_globals.modo==='edit') {
			if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		}

		let wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				return alert("[component_autocomplete:delete]: Sorry: wrap_div dom element not found")
			}
		//let wrap_div 		= document.getElementById(btn_obj.dataset.id_wrapper),
		let	input_text_hide = wrap_div.querySelector('[data-type="autocomplete_dato_hidden"]')
			if (!input_text_hide) {
				return alert("[component_autocomplete:delete]: Sorry: input_text_hide dom element not found")
			}

		let	tipo 			= btn_obj.dataset.tipo
		let	parent 			= wrap_div.dataset.parent
		let	section_tipo 	= wrap_div.dataset.section_tipo
		let value_to_remove = JSON.parse(btn_obj.dataset.current_value)

		let dato = input_text_hide.value;
			dato = JSON.parse(dato)

		if(SHOW_DEBUG===true) {
			console.log("Current dato :",dato);
			console.log("Dato to delete :",value_to_remove);
		}
	
		// Remove current value from array
		//dato.splice( dato.indexOf(value_to_remove), 1 );		
		// Remove current value from array
		let dato_len = dato.length
		for(let i = dato_len - 1; i >= 0; i--) {
			if( JSON.stringify(dato[i]) == JSON.stringify(value_to_remove) ) {
				dato.splice(i, 1);
				if(SHOW_DEBUG===true) {
					//console.log("deleted i:"+i+" "+JSON.stringify(value_to_remove)) ;
				}
			}
		}

		// UPDATE Final input value (dato stringnified)
		input_text_hide.value = JSON.stringify(dato);
	
		switch(page_globals.modo) {
			case 'edit' :
				// Save when edit
				let save = self.Save(input_text_hide)
				if (save) {
					save.then(function(response){
						if(SHOW_DEBUG===true) {
							//console.log("component_autocomplete.delete response: ",response);
						}
						// Update showed text. Remove li element
						btn_obj.parentNode.remove();
					})
				}
				break;
			case 'search':
			case 'list':				
				// Component showed in search form
				component_common.fix_dato(btn_obj,'component_autocomplete')
				// Update showed text. Remove li element
				btn_obj.parentNode.remove();
				break;
			default:
				wrap_div.dataset.dato = "[]"
				btn_obj.parentNode.remove();
				break;
		}
		
		return true
	};//end delete


	
	/**
	* NEW_ELEMENT
	*/
	this.new_element = function(button_obj) {

		let self = this

		let wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_autocomplete:new_element: Sorry: wrap_div dom element not found")
			}

		let id_wrapper = wrap_div.id

		//let wrap_div 				= document.getElementById(id_wrapper),	//$(button_obj).parents('.wrap_component:first'),
		let	tipo 					= wrap_div.dataset.tipo
		let parent 					= wrap_div.dataset.parent
		let section_tipo			= wrap_div.dataset.section_tipo
		let ar_target_section_tipo 	= wrap_div.dataset.ar_target_section_tipo
		let target_section_tipo 	= button_obj.dataset.target_section_tipo
		let tipo_to_search 			= wrap_div.dataset.tipo_to_search
		let component_info 			= wrap_div.dataset.component_info
		let component_info_obj 		= JSON.parse(component_info)
		let propiedades 			= component_info_obj.propiedades
		//let ar_ajax_container 		= document.querySelectorAll('[data-type="new_element_container"]')
		//let ajax_container 			= wrap_div.querySelectorAll('[data-type="new_element_container"]')[0]
		let ajax_container 			= wrap_div.querySelector('[data-type="new_element_container"][data-tipo="'+tipo+'"]')

			// Fix selected component_autocomplete vars
			/*component_autocomplete.wrap_div 				= wrap_div;
			component_autocomplete.ajax_container 			= ajax_container;
			component_autocomplete.tipo 		 			= tipo;
			component_autocomplete.parent 					= parent;
			component_autocomplete.section_tipo				= section_tipo;
			component_autocomplete.ar_target_section_tipo	= ar_target_section_tipo;
			component_autocomplete.tipo_to_search			= tipo_to_search;
			component_autocomplete.propiedades				= propiedades;*/
				//console.log(this);

		//if (wrap_div.find('.component_autocomplete_new_element').length>0 ) {
		let component_autocomplete_new_element = wrap_div.querySelector('[data-type="component_autocomplete_new_element"]')
		if( component_autocomplete_new_element ) {

			ajax_container.innerHTML = ''
			ajax_container.style.display = 'none'
			if(SHOW_DEBUG===true) {
				console.log("Ya exite el component_autocomplete_new_element ("+id_wrapper+"). Lo ocultamos solamente")
			}			
			return false;

		}else{
			ajax_container.style.display = ''
			// Reset all
			//ajax_container.innerHTML = ''
			//ajax_container.style.display = 'block'

			// Remove all existing ajax_container
			/*let len = ar_ajax_container.length
			for (let i = len - 1; i >= 0; i--) {
				ar_ajax_container[i].innerHTML = '';
				ar_ajax_container[i].style.display = 'block'
			};*/
		}
		
		const trigger_vars = { 
				mode				: 'new_element',
				tipo				: tipo,
				parent				: parent,
				section_tipo		: section_tipo,
				target_section_tipo : target_section_tipo,
				tipo_to_search		: tipo_to_search,
				top_tipo			: page_globals.top_tipo
			}
		  //return console.log(trigger_vars)						
		
		//html_page.loading_content( wrap_div, 1 );
		ajax_container.innerHTML = '<span class=""> Loading.. </span>'


		var js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete.new_element] response debug:",response.debug)
				}
				//html_page.loading_content( wrap_div, 0 );
				if (response===null) {
					ajax_container.innerHTML = "<pre>An error has occurred. Null data is received</pre>";
				}else{					
					
					// Draw trigger html response		
					ajax_container.innerHTML = response.result;
					
					// Exec script inside html code
					exec_scripts_inside(ajax_container)

					// Focus first input text			
					ajax_container.getElementsByTagName('input')[0].focus()

					// EVENT HANDLER FOR ENTER KEY (13)
					ajax_container.addEventListener("keypress", function(event){
						if (event.keyCode===13) {
							let button_submit = ajax_container.querySelector('.button_submit_new_element')
								button_submit.click();
						};
					})
				}
		}, function(error) {
				let msg = "<span class='error'>ERROR: on get new_element</span>";
				inspector.show_log_msg(msg);
				console.error("[component_autocomplete.new_element] Failed get_json!", error);
		})//end js_promise


		return js_promise
	};//end new_element



	/**
	* SUBMIT_NEW_ELEMENT
	*/
	this.submit_new_element = function(button_obj) {

		let self = this

		// From component wrapper
		let wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_autocomplete:submit_new_element: Sorry: wrap_div dom element not found")
			}

		//let	ajax_container  = self.ajax_container		
		//let	wrap_div 		= self.wrap_div		
		let	target_section_tipo = button_obj.dataset.target_section_tipo
		let tipo 				= wrap_div.dataset.tipo
		let	hidden_input 		= wrap_div.querySelector('input[data-role="autocomplete_dato_hidden"][data-tipo="'+tipo+'"]')	//$(wrap_div).find('.css_autocomplete_dato_hidden');
		let ajax_container 		= wrap_div.querySelector('[data-type="new_element_container"][data-tipo="'+tipo+'"]')
		let	ar_wrappers 		= ajax_container.querySelectorAll('.wrap_component')

		// ar_data recoge en formato 'Object {rsc214: "vag"}' los datos de tipo-valor de los input text del formulario, para pasarlos al post
		let ar_data  = {}
		let is_empty = false
		const len 	 = ar_wrappers.length
		for (let i = 0; i < len; i++) {

			// wrap div
			let current_wrapper = ar_wrappers[i]

			let component_tipo 	= current_wrapper.dataset.tipo
			let component_name  = current_wrapper.dataset.component_name

			if ( (window[component_name].get_dato instanceof Function)===false ) {
				console.error("Skipped component_name:"+component_name+" (function get_dato not found in component class): ", window[component_name]);
				continue;
			}			

			// Get dato from components standar function 'get_dato'
			let dato = window[component_name].get_dato(current_wrapper)
				//console.log(component_name+" dato:",dato);
			
			// When first value is empty, alert and return
			if (i==0 && dato.length<1 && component_name==="component_input_text") {
				is_empty=true;
				return alert("Empty data")
			}else{
				ar_data[component_tipo] = dato
			}
		}//end for (let i = 0; i < len; i++)

		if (is_empty==true) {
			console.log("empty data. Nothing is saved!");
			if(SHOW_DEBUG===true) {
				alert("Error on add")
			}
			return false;
		}		

		//ajax_container.style.display = 'none';
		ajax_container.innerHTML = '<span class=""> Loading.. </span>'
		
		const trigger_vars = { 
				mode				: 'submit_new_element',
				tipo				: wrap_div.dataset.tipo,   //self.tipo,
				parent			  	: wrap_div.dataset.parent, //self.parent,
				section_tipo		: wrap_div.dataset.section_tipo, //self.section_tipo,
				target_section_tipo : target_section_tipo,
				ar_data			  	: JSON.stringify(ar_data), // JSON.stringify(ar_data),
				top_tipo			: page_globals.top_tipo
			  }
			  //console.log("trigger_vars:",trigger_vars); return;
		
		let js_promise = common.get_json_data(self.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete.submit_new_element] response",response)
				}
				//html_page.loading_content( wrap_div, 0 );
				if (response===null) {
					ajax_container.innerHTML = "<pre>An error has occurred. Null data is received</pre>";
				}else{
					
					// Current stored dato
					let current_dato = self.get_dato(wrap_div)

					// Add trigger response dato locator to array
					if (response.result) {

						// Add new locator to current dato
						current_dato.push( response.result )
						if(SHOW_DEBUG===true) {
							//console.log("[component_autocomplete.submit_new_element] current_dato:", current_dato);
						}

						// INPUT HIDDEN . Set new value to component input
						hidden_input.value = JSON.stringify(current_dato)

						// Save and reload
						self.Save(hidden_input,{"reload":true})
					}
				}
		}, function(error) {
				let msg = "<span class='error'>ERROR: on get submit_new_element</span>"
				inspector.show_log_msg(msg)
				console.error("[component_autocomplete.submit_new_element] Failed get_json!", error)
		})//end js_promise


		return js_promise;
	};//end submit_new_element	



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
	
		// POR SOLUCIONAR EL LOOP EN IMPORT_FILES

		obj_wrap.classList.add("selected_wrap");

		/*
		var input_text = $(obj_wrap).find('.css_autocomplete_search_field').first()
			if(input_text) {
				$(input_text).focus();
			}*/				

		return false;
	};//end select_component



	/**
	* CONVERT_DATA_TO_LABEL_VALUE
	* @return array result
	*/
	this.convert_data_to_label_value = function(data) {
		
		var result 	= []
		for (var key in data) {

			var obj = {
				label : data[key],
				value : key
			}
			result.push(obj)
		}

		return result
	};//end convert_data_to_label_value



	/**
	* ACTIVATE
	* This method is invoked when user click on input text field of current component
	*/
	this.activated = {};
	this.activate = function(input_obj) {
		
		let self = this

		// Activate once
		const tipo 		 	= input_obj.dataset.tipo
		const section_tipo 	= input_obj.dataset.section_tipo
		if ( typeof component_autocomplete.activated[tipo] !== "undefined" ) {
			//return false;
		}
		component_autocomplete.activated[tipo] = true;
		//console.log(input_obj);

		// From component wrapper		
		var wrap_div = find_ancestor(input_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(input_obj);
				return alert("[component_autocomplete:activate]: Sorry: wrap_div dom element not found")
			}
			var obj_warp = wrap_div;

			// Select current component wrap
			//component_common.select_wrap(obj_warp)

		// HIDDEN_INPUT
		var	hidden_input			= wrap_div.querySelector('[data-role="autocomplete_dato_hidden"]')

		var search_fields 			= hidden_input.dataset.search_fields
		var divisor 				= hidden_input.dataset.divisor

		// BUTTON DELETE : Hide when hidden_input no value		
		var	button_delete			= wrap_div.querySelector('[data-role="autocomplete_button_delete"]')
		//if( hidden_input.value.length <1 || hidden_input.value==='' || hidden_input.value==='""') button_delete.style.display = 'none';

		var	ar_target_section_tipo	= input_obj.dataset.ar_target_section_tipo		
		var	div_valor 				= wrap_div.querySelector('[data-role="autocomplete_valor"]')		
			
		// search_query_object
		//let search_query_object = JSON.parse(wrap_div.dataset.search_query_object);
			//console.log("search_query_object",search_query_object);
				
		let filter_fields 		= input_obj.parentNode.parentNode.querySelectorAll("input.filter_fields_input")
		let filter_fields_len 	= filter_fields.length

		var cache = {};
		$(input_obj).autocomplete({
			delay 	 : 650,
			minLength: 1,
			source 	 : function( request, response ) {
				let start = new Date().getTime();
				let term  = request.term;
				// Cache				
				/*if ( term in cache ) {
				  response( cache[ term ] );
				  return;
				}*/
				//console.log("term: ",term);
				//if(term.length<2) return false;

				// search_query_object
				let search_query_object = JSON.parse(wrap_div.dataset.search_query_object);
					//console.log("search_query_object",search_query_object);

				// Filter_sections
				let	filter_sections 	= self.get_filter_sections(wrap_div)

				if (term!=="manual_trigger") {
					
					// Reset filter fields
					for (let j = 0; j < filter_fields_len; j++) {
						filter_fields[j].value = ''
					}

					// ar q split iterate
					let split_q = self.split_q(term)
					let ar_q 	= split_q.ar_q
					if (split_q.divisor==='|') {
						// PROPAGATE TO FILTER FIELDS
						for (let j = 0; j < filter_fields_len; j++) {
							if (ar_q[j]) {
								let q 		= ar_q[j]							
								let q_type 	= 'all'//self.determine_q_type(q)
								self.propagate_to_filter_field(filter_fields[j], ar_q[j], q_type) 
							}							
						}
					}else{											
						for (let i = 0; i < ar_q.length; i++) {
							let q 		= ar_q[i]
							let q_type 	= self.determine_q_type(q)
							// PROPAGATE TO FILTER FIELDS
							for (let j = 0; j < filter_fields_len; j++) {
								self.propagate_to_filter_field(filter_fields[j], q, q_type) 
							}					
						}
					}					
				}//end if (term!=="manual_trigger") 							

				self.rebuild_search_query_object(search_query_object, wrap_div, filter_fields, filter_sections)
				//search_query_object = self.set_search_query_object_q(search_query_object, term)
					//console.log("search_query_object", JSON.stringify(search_query_object.filter)); //return

				const trigger_vars = {
						mode 					: "autocomplete2",
						tipo					: tipo,
						section_tipo 			: section_tipo,
						//ar_target_section_tipo: ar_target_section_tipo,
						//string_to_search 		: request.term,
						top_tipo 				: page_globals.top_tipo,
						//search_fields 		: search_fields,
						//filter_sections 		: filter_sections,
						divisor 				: divisor,
						search_query_object 	: JSON.stringify(search_query_object)
				}
				//return console.log("[component_autocomplete.autocomplete] trigger_vars",trigger_vars); //return

				common.get_json_data(component_autocomplete.url_trigger, trigger_vars).then(function(response_data) {
						if(SHOW_DEBUG===true) {
							console.log("[component_autocomplete.autocomplete] response_data",response_data)
						}
						/*
						if (response_data!==null) {
							cache[ term ] = response_data.result;
							
							response( $.map( response_data.result, function( my_key, my_value ) {
								return {
									label: my_key.replace(/<\/?[^>]+(>|$)/g, ""),
									value: my_value
								}
							}));
							//response( response_data.result )
						}*/
						let label_value = []
						if (response_data && response_data.result) {
							label_value = component_autocomplete.convert_data_to_label_value(response_data.result)
						}						

						response(label_value)

				}, function(error) {
						console.error("[component_autocomplete.autocomplete] Failed get_json!", error);
				});				
			},
			// When a option is selected in list
			select: function( event, ui ) {
				// prevent set selected value to autocomplete input
				event.preventDefault();
				/*$(this).val('')				
				var label = ui.item.label ;
				var value = ui.item.value ;*/
				this.value = ''
				let label = ui.item.label
				let value = ui.item.value

				// Input text hidden tracks component value
				var current_input_value 	= hidden_input.value || []
				
				// parse json stored array of locators value
				var current_val 			= JSON.parse( current_input_value )
				// New value selected in list. Parse to proper compare with ar locator values
				var new_value 				= JSON.parse(value) // parse Important !
					//console.log("new_value",new_value,"current_val",current_val); return

				// check if value already exits
				for (var key in current_val) {
					//if (JSON.stringify(current_val[key]) === JSON.stringify(new_value)) {
					// Compare js objects, NOT stringify the objects (fail somtimes)
					if (is_obj_equal(current_val[key], new_value)) {
						console.log("Value already exists (1). Ignored value: "+JSON.stringify(new_value)+" => "+label)
						return;
					}
				}
				
				let current_val_length = current_val.length + 1

				let limit = parseInt(hidden_input.dataset.limit)
				
				if (limit>0 && (current_val_length > limit)) {
					let exceeded_limit = get_label.exceeded_limit
					alert (exceeded_limit + limit)
					return false
				}
	
				// Add new value to array
				current_val.push( new_value )

				//return console.log("current_val",current_val)
				//console.log(page_globals.modo);

				// INPUT HIDDEN . Set value to component input
				//$(hidden_input).attr('value', JSON.stringify(current_val))
				hidden_input.value = JSON.stringify(current_val)
					//console.log("hidden_input.value", hidden_input.value);
		
					//console.log("page_globals.modo:",page_globals.modo);
				switch(page_globals.modo){
					case 'edit':
						// Edit Save value 
						self.Save(hidden_input, {"reload":true})						
						break;
					case 'list':
					case 'search':					
						// Component showed in search form
						component_common.fix_dato(this,'component_autocomplete')
					case 'tool_import_files':	
						// Search set hidden input value
						// New li element
						var new_li 	  = document.createElement('li')
						var new_li_button_delete = document.createElement('div')
							new_li_button_delete.classList.add('icon_bs','link','css_autocomplete_button_delete')
							new_li_button_delete.dataset.current_value = value
							new_li_button_delete.addEventListener('click', function(event){
								component_autocomplete.delete(this)
							}, false);
	
							new_li.appendChild(new_li_button_delete)
							new_li.appendChild( document.createTextNode(label) )

						// Add created li to ul
						div_valor.appendChild(new_li)

						//div_valor.innerHTML += "<li><div class=\"icon_bs link css_autocomplete_button_delete\" \
						//	data-current_value='"+JSON.stringify(value)+"' onclick=\"component_autocomplete.delete(this)\"></div>"+ label + "</li>"					
						break;	
					default:
						break;
				}

				// Search component mode
				//if (wrap_div.dataset.modo==="search") {
				//	component_common.fix_dato(hidden_input,'component_autocomplete')
				//}				

				$(this).blur()
			},
			// When a option is focus in list
			focus: function( event, ui ) {
				// prevent set selected value to autocomplete input
				event.preventDefault();			    	
			},
			change: function( event, ui ) {
				//console.log(event)
				this.value = ''   		
			},
			response: function( event, ui ) {
				//console.log(ui);
			}			
		})
		.on( "keydown", function( event ) {
			//return false
			//console.log(event)
			if ( event.keyCode === $.ui.keyCode.ENTER  ) {
				// prevent set selected value to autocomplete input
				event.preventDefault();

				var term = $(this).val();

				// TEST CACHE IS LOADED
				var cache_exists 	= term in cache;
				if(cache_exists!=true) {
					//console.log("Cache no avalaible")
					//return;
				}
				
				// CACHE OBJ
				var term_from_cache_obj = cache[ term ];
					//console.log( $(term_from_cache_obj).length )

				// CACHE TEST
				var term_in_cache = false;
				if ( $(term_from_cache_obj).length === 0 ) {
					// No hay términos en caché
					term_in_cache = false;

				}else{
					// Si hay términos en caché. Buscamos dentro para localizar el deseado
					$.each(term_from_cache_obj, function(key, element) {
						//console.log('key: ' + key + '\n' + 'value: ' + element);
						if( element.toLowerCase()==term.toLowerCase()) {
							term_in_cache = key;
							return
						}		    
					});
				}					        	
				//console.log(term_in_cache); return
				
				if ( term_in_cache > 0 ) {
					// SAVE FROM CACHE

					var label 		= $(this).val() ;
					var cache_value = cache[ term ] ;

					var id_matrix;
					var dato ;
					// CACHE KEY / VALUE
					$.each(cache_value, function(key, element) {
						id_matrix 	= key;
						dato 		= element;
					});
					//console.log("id_matrix: "+id_matrix + " "+dato); return

					// HIDDEN FIELD : Set value to component hidden dato input
					$(hidden_input).val( id_matrix );

					// TEXT : Update valor text
					$(div_valor).html( dato );

					// SAVE : Component save value 
					//component_autocomplete.Save(hidden_input);
					//if(DEBUG) console.log("->autocomplete: Save from cache term "+id_matrix+" "+label);

					// BUTTON DELETE : Show again delete button
					$(button_delete).delay(500).show(300);

					// Cache Clean
					cache = {};

					// INPUT CLEAN
					$(this).blur();
					return;

				}else{
					// ADD NEW RECORD AND SAVE

					// Save related
					//component_autocomplete.Save_related( $(this), tipo_to_search );
					//if(DEBUG) console.log("->autocomplete: Save new term "+$(this).val());

					// Cache Clean
					cache = {};

					// INPUT CLEAN
					$(this).blur();
					return;

				}//end if ( term in cache ) {
			}//end if ( event.keyCode === $.ui.keyCode.ENTER  )
		});// bind		

		//this.activated[tipo] = true;
	};//end this.activate



	/**
	* REBUILD_SEARCH_QUERY_OBJECT
	* Re-combines filter by fields and by sections in one search_query_object
	* @return bool
	*/
	this.rebuild_search_query_object = function(search_query_object, wrap_div, filter_fields, filter_sections) {
		
		const filter_sections_len = filter_sections ? parseInt(filter_sections.length) : 0;
		
		// input data
		const filter_fields_len = filter_fields.length
		let filter_fields_data 	= {}		
		for (let i = 0; i < filter_fields_len; i++) {		
			let tipo 				 = filter_fields[i].dataset.tipo
			filter_fields_data[tipo] = filter_fields[i].value
		}
		//console.log("filter_fields_data ",filter_fields_data)

		// filter_by_list
		let filter_by_list_tipo = false
		let filter_by_list 		= JSON.parse(wrap_div.dataset.filter_by_list)
		if (filter_by_list) {
			const filter_by_list_len = filter_by_list.length
			for (let i = 0; i < filter_by_list_len; i++) {
				filter_by_list_tipo = filter_by_list[i].component_tipo
			}			
		}

		// Selector operator
		const operator_selector = wrap_div.querySelector(".operator_selector")		
		let operator_selected   = (operator_selector) ? "$" + operator_selector.value : "$or";
		
		let clean_group = []
		// Iterate filter elements
		let filter_element = search_query_object.filter
		for (let operator in filter_element) {

			//console.log("operator, filter_element[operator]", operator, filter_element[operator]);			
			let group = filter_element[operator]

			let sub_group2 = {}
				sub_group2[operator_selected] = []

			group.forEach(function(search_unit, i) {
				//console.log("search_unit ",search_unit);

				let base_component_tipo 	= search_unit.path ? search_unit.path[0].component_tipo : false
				let current_component_tipo 	= search_unit.path ? search_unit.path[search_unit.path.length-1].component_tipo : false
					//console.log("current_component_tipo ",current_component_tipo);
				
				if (filter_sections_len>0 && base_component_tipo===filter_by_list_tipo) {
					
					let sub_group1 = {'$or':[]}					
					for (let k = 0; k < filter_sections_len; k++) {

						let locator 		= filter_sections[k]
						let new_search_unit = cloneDeep(search_unit)
						new_search_unit.q   = JSON.stringify(locator)
						// Remove all path filter_elements but first
						new_search_unit.path.splice(1)						
						// Add to group
						sub_group1['$or'].push(new_search_unit)
					}
					clean_group.push(sub_group1)
					
				}else{
					
					if (typeof filter_fields_data[current_component_tipo]!=="undefined") {

						let value = filter_fields_data[current_component_tipo]
						// If value is empty will be ignored in final object					
						if (value.length>0) {
							// Override q value
							search_unit.q = value		
							// When filter is not empy, send search_unit to a special subgroup
							if (filter_sections_len>0) {
								// Add to subgroup2
								sub_group2[operator_selected].push(search_unit)
							}else{
								// Add to subgroup
								clean_group.push(search_unit)
							}
						}//end if (value.length>0) 
					}
				}
				
			})//end group.forEach(function(search_unit, i)
			
			// When filter is not empy, add filled sub_group2
			if (filter_sections_len>0) {
				clean_group.push(sub_group2)
			}				
			//console.log(clean_group);

			// Overwrite filter value with modified group
			filter_element[operator] = clean_group

			break; // Only one is expected in fisrt level
		}//end for (let operator in filter_element) {
	
		// When filter_sections is not empy, use operator '$and' to exclude results by filter_sections
		if (filter_sections_len>0) {
			// Force and
			operator_selected = '$and'			
		}

		// New clean final filter
		const clean_filter = {}
			  clean_filter[operator_selected] = clean_group

		// Replaces old filter in search_query_object
		search_query_object.filter = clean_filter

		if(SHOW_DEBUG===true) {
			console.log("rebuild_search_query_object final clean_filter ",clean_filter);
		}
		//console.log("search_query_object ",search_query_object.filter[0]['$or'] );

		return true
	};//end rebuild_search_query_object



	/**
	* PROPAGATE_TO_FILTER_FIELD
	* @return 
	*/
	this.propagate_to_filter_field = function(input_obj, q, q_type) {

		const ar_type_map = JSON.parse(input_obj.dataset.type_map)
		const len 		  = ar_type_map.length
			//console.log("ar_type_map",ar_type_map, " - q: ",q," - ",input_obj.name);

		// Force skip types on q_type = 'all'
		// console.log("len ",len, " - q_type: ",q_type);
		if (len>0 && q_type!=='all') {

			// type is defined for current element
			if(ar_type_map.indexOf(q_type)!==-1) {
				if (input_obj.value.length===0) {
					input_obj.value = q
				}else{
					input_obj.value = input_obj.value +" "+ q
				}
			}
		}else{
			// type is NOT defined in structure
			if (input_obj.value.length===0) {
				input_obj.value = q
			}else{
				input_obj.value = input_obj.value +" "+ q
			}
		}

		return true
	};//end propagate_to_filter_field



	/**
	* SPLIT_Q
	* @return array ar_q
	*/
	this.split_q = function(q) {

		let ar_q = []
		
		const regex = /"[^"]+"|'[^']+'|[^|\s]+|[^\s|]+/ug;
		const str 	= q
		let m;

		while ((m = regex.exec(str)) !== null) {
		    // This is necessary to avoid infinite loops with zero-width matches
		    if (m.index === regex.lastIndex) {
		        regex.lastIndex++;
		    }
		    
		    // The result can be accessed through the `m`-variable.
		    m.forEach((match, groupIndex) => {
		        //console.log(`Found match, group ${groupIndex}: ${match}`);
		        ar_q.push(match)
		    });
		}
		//console.log("ar_q ",ar_q);

		let divisor = false;		
		if (q.indexOf('|')!==-1) {
			divisor = '|'
		}	
		

		let result = {
			ar_q 	: ar_q,
			divisor : divisor
		}
		//console.log("split_q",result,q);

		return result
	};//end split_q



	/**
	* DETERMINE_Q_TYPE
	* @return string q_type
	*/
	this.determine_q_type = function(q) {

		let q_type = ''

		const str  = q

		//const regex_code 	= /^(\W{1,2})?\d+([.,\/-][\d])?(\D)?$/
		const regex_code 	= /^(\W{1,2})?\d+([.,\/-]+[\d\w]*)?(\D)?$/
		const regex_date  	= /^(\W{1,2})?([0-9]{1,12})-?([0-9]{1,2})?-?([0-9]{1,2})?$/ 	//  /^(\W{1,2})?(-?[0-9]{1,12})(-[0-9]{1,2})?(-[0-9]{1,2})?$/
		const regex_int  	= /^(\W{1,2})?\d+$/
	
		switch(true) {

			case (regex_date.exec(str) !== null) :
				q_type = 'date'
				break;

			case (regex_code.exec(str) !== null) :
				q_type = 'code'
				break;			

			case (regex_int.exec(str) !== null) :
				q_type = 'int'
				break;			

			default:
				q_type = 'string'
		}
		if(SHOW_DEBUG===true) {
			console.log("[determine_q_type] q_type for "+q+" : ",q_type);
		}
		

		return q_type
	};//end determine_q_type



	/**
	* SET_SEARCH_QUERY_OBJECT_Q
	* @return 
	*/
	this.set_search_query_object_q = function(search_query_object, q) {
		
		let ar_filters = search_query_object.filter[0]['$or']
			//console.log(ar_filters);

		let len = ar_filters.length
		for (var i = len - 1; i >= 0; i--) {
			// Set q on each element
			ar_filters[i].q = q
		}	

		return search_query_object
	};//end set_search_query_object_q



	/**
	* SEARCH_FROM_FILTER_FIELDS
	* @return 
	*/
	this.search_from_filter_fields_busy = false
	this.search_from_filter_fields = function(input_obj) {

		let self = this

		const component_modelo_name = input_obj.dataset.modelo

		/*let component_js 	= window[component_modelo_name]
		let selected_wrap 	= find_ancestor(input_obj, 'wrap_component')
		let dato 			= component_js.get_dato(selected_wrap)
			console.log("search_from_filter_fields dato:",dato);*/

		// From component wrapper		
		const wrap_div = find_ancestor(input_obj, 'wrap_component')
		
		//if (self.search_from_filter_fields_busy===false) {
			const autocomplete_search_field = wrap_div.querySelector(".css_autocomplete_search_field")

			self.search_from_filter_fields_busy = true
			setTimeout(function() {
				
				// Trigger autocomplete
				$(autocomplete_search_field).autocomplete( "search", "manual_trigger" );					
				
				self.search_from_filter_fields_busy = false
			}, 200)
		//}

		return true
	};//end search_from_filter_fields




	/**
	* OPEN_ELEMENT
	*/
	this.open_element = function(button_obj) {

		var tipo = button_obj.dataset.section_tipo,
			id   = button_obj.dataset.section_id,
			modo = button_obj.dataset.modo,
			menu = button_obj.dataset.menu || 1

		var window_url 		= '?t='+tipo+'&id='+id+'&m='+modo //+'&menu='+menu
		var	window_name 	= 'Edit element '+tipo+' '+id

			//w_width			= screen.width,	
			//w_height		= screen.height
			//return 	console.log(window_url);

		//var strWindowFeatures = "menubar=no,location=no,resizable=yes,scrollbars=yes,status=no,width=470,height=415";

		var edit_elemet_window = window.open(window_url, window_name, page_globals.float_window_features.small);
			edit_elemet_window.focus()

		// REFRESH_COMPONENTS ADD PORTAL
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added
		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_autocomplete:open_element: Sorry: wrap_div dom element not found")
			}
		var wrapper_id = wrap_div.id;
		//var wrapper_id = component_common.get_wrapper_id_from_element(button_obj);			
		html_page.add_component_to_refresh(wrapper_id);
	};//end open_element



	/* FILTER_BY_LIST
	------------------------------------------------------------------ */



	/**
	* SELECT_ALL_FILTER_SECTIONS
	* Check or uncheck all elements at once
	*/
	this.select_all_filter_sections = function(input_obj, cookie_name) {

		var wrap_div 	= find_ancestor(input_obj, 'wrap_component')
		var list_ul		= wrap_div.querySelector('ul.filter_by_list')
		var ar_inputs	= list_ul.querySelectorAll('input')
		var len 		= ar_inputs.length

		for (var i = len - 1; i >= 0; i--) {
			ar_inputs[i].checked = input_obj.checked
		}

		this.save_filter_sections(input_obj, cookie_name)
	}//end select_all_filter_sections



	/**
	* SAVE_FILTER_SECTIONS
	* Cookie stores current list values as json encoded array
	*/
	this.save_filter_sections = function(input_obj, cookie_name) {

		const wrap_div 		  = input_obj.parentNode.parentNode.parentNode.parentNode;
		const filter_sections = JSON.stringify(this.get_filter_sections(wrap_div)) //  

		let autocomplete_search_field = wrap_div.querySelector(".css_autocomplete_search_field")

		if (autocomplete_search_field) {

			// Chek if autocomplete is instantiated before search (search mode case)
			let autocomplete_instance = $(autocomplete_search_field).autocomplete( "instance" );
			if (typeof autocomplete_instance!=="undefined") {
				// Trigger autocomplete
				$(autocomplete_search_field).autocomplete( "search", "manual_trigger" );
			}			
		}
		
		let cookie_create = createCookie(cookie_name, filter_sections, 365);
			//console.log(cookie_create, " cookie_name:",cookie_name," filter_sections:",filter_sections);
			//console.log( "cookie_name: ",cookie_name, readCookie(cookie_name) );

		return cookie_create;
	}//end save_filter_sections



	/**
	* GET_FILTER_SECTIONS
	* @return array of checked hierarchy_sections sections
	*/
	this.get_filter_sections = function(wrap_div) {		
		
		let selected_values = false

		const list_ul = wrap_div.querySelector('ul.filter_by_list')
		if (list_ul) {
			selected_values = []
			let ar_inputs = list_ul.querySelectorAll('input')
			const len 	  = ar_inputs.length
			for (let i = len - 1; i >= 0; i--) {
				if(ar_inputs[i].checked) {
					let current_val = ar_inputs[i].value // 
					if (current_val!=='on') {
						selected_values.push( JSON.parse(current_val) )
					}					
				}
			}
		}	

		return selected_values;
	}//end get_filter_sections



	/**
	* SET_FILTER_SECTIONS
	* Reads cookie if exists and aply values to current list
	*/
	this.set_filter_sections = function(wrap_div, cookie_name) {

		let ar_values = readCookie(cookie_name)
			//console.log("set_filter_sections ar_values from cookie",ar_values,cookie_name);
			if (!ar_values) {
				return false;
			}
		
		let list_ul   = wrap_div.querySelector('ul.filter_by_list')
		let ar_inputs = list_ul.querySelectorAll('input')
		
		const len = ar_inputs.length
		for (let i = len - 1; i >= 0; i--) {
			if(ar_values.indexOf(ar_inputs[i].value)!==-1 && ar_inputs[i].value!=='on') {
				ar_inputs[i].checked = true
			}else{
				ar_inputs[i].checked = false
			}
		}
	}//end set_filter_sections



}//end component_autocomplete