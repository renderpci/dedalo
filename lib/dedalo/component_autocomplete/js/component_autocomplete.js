"use strict";
/**
* COMPONENT_AUTOCOMPLETE
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


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {	

		let wrapper = document.getElementById(options.wrapper_id)
			if (wrapper===null) {
				console.log("Error. Wrapper not found. "+ options.wrapper_id);
				return false;
			}

		this.wrapper_id  = options.wrapper_id
		this.cookie_name = options.cookie_name
		this.limit 		 = options.limit || 0 // Max items to manage (zero to unlimited)		

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
		}
		
	};//end init



	/**
	* SAVE
	*/
	this.Save = function(component_obj) {
		
		if(page_globals.modo!='edit' && page_globals.modo!='tool_import_files') return false;
		
		if (!component_obj) {
			console.log(component_obj);
			return false
		};
		/*
		var wrapper_id = component_obj.dataset.id_wrapper		
		if (!wrapper_id) {
			console.log("ERROR on get id_wrapper on Save");
			return false;
		}
		*/
		// From component wrapper
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_autocomplete:Save: Sorry: wrap_div dom element not found")
			}
			var wrapper_id = wrap_div.id

		var save_arguments = { "dato_in_db" : component_obj.dataset.dato_in_db }
		if (save_arguments.dato_in_db <1) {
			//console.log("Error on save. Zero value")
			//console.log( $(component_obj).val() ) 
			//return 
		}		

		// Exec general save
		var jsPromise = component_common.Save(component_obj, save_arguments);

			jsPromise.then(function(response) {
				if(SHOW_DEBUG===true) {
					//console.log("[component_autocomplete.Save] response",response);
				}
				
				component_common.load_component_by_wrapper_id(wrapper_id);
			}, function(xhrObj) {
				console.log("[component_autocomplete.Save] Errro xhrObj",xhrObj);
			});

		return jsPromise
	};//end Save


	
	/**
	* NEW_ELEMENT
	*/
	this.new_element = function(button_obj, id_wrapper) {

		var wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_autocomplete:new_element: Sorry: wrap_div dom element not found")
			}

		//var wrap_div 				= document.getElementById(id_wrapper),	//$(button_obj).parents('.wrap_component:first'),
		var	tipo 					= wrap_div.dataset.tipo,	
			parent 					= wrap_div.dataset.parent,
			section_tipo			= wrap_div.dataset.section_tipo,
			ar_target_section_tipo 	= wrap_div.dataset.ar_target_section_tipo,
			target_section_tipo 	= button_obj.dataset.target_section_tipo,
			tipo_to_search 			= wrap_div.dataset.tipo_to_search,
			component_info 			= wrap_div.dataset.component_info,
			component_info_obj 		= JSON.parse(component_info),
			propiedades 			= component_info_obj.propiedades,
			ar_ajax_container 		= document.querySelectorAll('[data-type="new_element_container"]'),
			ajax_container 			= wrap_div.querySelectorAll('[data-type="new_element_container"]')[0]


			// Fix selected component_autocomplete vars
			component_autocomplete.wrap_div 				= wrap_div;
			component_autocomplete.ajax_container 			= ajax_container;
			component_autocomplete.tipo 		 			= tipo;
			component_autocomplete.parent 					= parent;
			component_autocomplete.section_tipo				= section_tipo;
			component_autocomplete.ar_target_section_tipo	= ar_target_section_tipo;
			component_autocomplete.tipo_to_search			= tipo_to_search;
			component_autocomplete.propiedades				= propiedades;
				//console.log(this);

		//if (wrap_div.find('.component_autocomplete_new_element').length>0 ) {
		if( wrap_div.querySelectorAll('[data-type="component_autocomplete_new_element"]').length>0 ) {		
			ajax_container.innerHTML = ''
			ajax_container.style.display = 'none'
			if(SHOW_DEBUG===true) {
				console.log("Ya exite el component_autocomplete_new_element ("+id_wrapper+"). Lo ocultamos solamente")
			}			
			return false;
		}else{
			// Reset all
			//ajax_container.innerHTML = ''
			//ajax_container.style.display = 'block'

			// Remove all existing ajax_container
			var len = ar_ajax_container.length
			for (var i = len - 1; i >= 0; i--) {
				ar_ajax_container[i].innerHTML = '';
				ar_ajax_container[i].style.display = 'block'
			};
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


		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete.new_element] response",response)
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
							var button_submit = ajax_container.querySelector('.button_submit_new_element')
								button_submit.click();
						};
					})
				}
		}, function(error) {
				var msg = "<span class='error'>ERROR: on get new_element</span>";
				inspector.show_log_msg(msg);
				console.error("[component_autocomplete.new_element] Failed get_json!", error);
		})//end js_promise


		return js_promise
	};//end new_element



	/**
	* SUBMIT_NEW_ELEMENT
	*/
	this.submit_new_element = function(button_obj) {

		var self  = this

		let	ajax_container  		= this.ajax_container
		let	wrap_div 				= this.wrap_div			
		let	target_section_tipo 	= button_obj.dataset.target_section_tipo
		let	hidden_input 			= wrap_div.querySelectorAll('[data-type="autocomplete_dato_hidden"]')[0]	//$(wrap_div).find('.css_autocomplete_dato_hidden');
		let	ar_inputs 				= ajax_container.querySelectorAll('.wrap_component')		
		
		// ar_data recoge en formato 'Object {rsc214: "vag"}' los datos de tipo-valor de los input text del formulario, para pasarlos al post
		let ar_data  = {}
		let is_empty = false
		let len 	 = ar_inputs.length		
		for (var i = 0; i < len; i++) {

			var tipo 			= ar_inputs[i].dataset.tipo
			var component_name  = ar_inputs[i].dataset.component_name

			if ( (window[component_name].get_dato instanceof Function)===false ) {
				console.error("Skipped component_name:"+component_name+" (function get_dato not found in component class): ", window[component_name]);
				continue;
			}					
			
			// Get dato from components standar function 'get_dato'
			var dato = window[component_name].get_dato(ar_inputs[i])
			
			// When first input value is empty, alert and return
			if (i==0 && dato.length<1) {
				is_empty=true;
				return alert("Empty data")
			}
			ar_data[tipo] = dato;
		}
		if (is_empty==true) {return false;}

		//ajax_container.style.display = 'none';
		ajax_container.innerHTML = '<span class=""> Loading.. </span>'
		
		const trigger_vars = { 
				mode				: 'submit_new_element',
				tipo				: this.tipo,
				parent			  	: this.parent,
				section_tipo		: this.section_tipo,
				target_section_tipo : target_section_tipo,
				ar_data			  	: JSON.stringify(ar_data),
				propiedades		 	: JSON.stringify(this.propiedades),
				top_tipo			: page_globals.top_tipo
			  }
		
		let js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete.submit_new_element] response",response)
				}
				//html_page.loading_content( wrap_div, 0 );
				if (response===null) {
					ajax_container.innerHTML = "<pre>An error has occurred. Null data is received</pre>";
				}else{					
					
					// INPUT HIDDEN
					// trigger returns int new created section id matrix				
					var current_input_value = hidden_input.value

					var current_val = JSON.parse( current_input_value );
						current_val.push( response.result )

					// INPUT HIDDEN . Set value to component input
					hidden_input.value = JSON.stringify(current_val);//val( value );				

					// Save
					self.Save(hidden_input);
				}
		}, function(error) {
				var msg = "<span class='error'>ERROR: on get submit_new_element</span>";
				inspector.show_log_msg(msg);
				console.error("[component_autocomplete.submit_new_element] Failed get_json!", error);
		})//end js_promise


		return js_promise;
	};//end submit_new_element



	/**
	* DELETE
	*/
	this.delete = function(btn_obj) {

		if (page_globals.modo=='edit') {
			if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		}

		var wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				return alert("[component_autocomplete:delete]: Sorry: wrap_div dom element not found")
			}
		//var wrap_div 		= document.getElementById(btn_obj.dataset.id_wrapper),
		var	input_text_hide = wrap_div.querySelector('[data-type="autocomplete_dato_hidden"]')
			if (!input_text_hide) {
				return alert("[component_autocomplete:delete]: Sorry: input_text_hide dom element not found")
			}


		var locator 		= btn_obj.dataset.current_value
		var	tipo 			= btn_obj.dataset.tipo
		var	parent 			= wrap_div.dataset.parent
		var	section_tipo 	= wrap_div.dataset.section_tipo

		var value_to_remove =  JSON.parse(btn_obj.dataset.current_value)
			//console.log(value_to_remove);

		var current_value = input_text_hide.value;
			current_value = JSON.parse(current_value)
				//console.log(current_value);			

		// Remove current value from array
		//current_value.splice( current_value.indexOf(value_to_remove), 1 );		
		// Remove current value from array
		var len = current_value.length
		for(var i = len - 1; i >= 0; i--) {			
			if( JSON.stringify(current_value[i]) == JSON.stringify(value_to_remove) ) {			
			   current_value.splice(i, 1);
			   if (DEBUG) {
					//console.log("deleted i:"+i+" "+JSON.stringify(value_to_remove)) ;
			   }		       
			}
		}

		// Clear input value
		input_text_hide.value = JSON.stringify(current_value);

		// Remove from DDBB in edit mode only
		if (page_globals.modo==="edit") {
			//Remove inverse locator in reference 
			component_autocomplete.inverse_locator('remove_locator',
													locator,
													tipo,
													parent,
													section_tipo);
		}

		// Update showed text. Remove li element
		btn_obj.parentNode.remove();

		// Save when edit
		if (page_globals.modo=='edit') {		
			this.Save(input_text_hide);
		}
	};//end delete



	/**
	* SELECT_COMPONENT
	*/
	this.select_component = function(obj_wrap) {
	
		// POR SOLUCIONAR EL LOOP EN IMPORT_FILES


		obj_wrap.classList.add("selected_wrap");

		var input_text = $(obj_wrap).find('.css_autocomplete_search_field').first()
			if(input_text) {
				$(input_text).focus();
			}				

		return false;
	};//end select_component



	/**
	* CONVERT_DATA_TO_label_value
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
		
		// Activate once
		var tipo = input_obj.dataset.tipo
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

		// FILTER_SECTIONS
		var	filter_sections 		= this.get_filter_sections(wrap_div)  //  
			//console.log(filter_sections);	

		var cache = {};
		$(input_obj).autocomplete({
			delay 	 : 100,
			minLength: 1,
			source 	 : function( request, response ) {
				var start = new Date().getTime();
				var term = request.term;
				// Cache				
				/*if ( term in cache ) {
				  response( cache[ term ] );
				  return;
				}*/

				const trigger_vars = {
						mode 					: "autocomplete",
						tipo					: tipo,
						ar_target_section_tipo 	: ar_target_section_tipo,
						string_to_search 		: request.term,
						top_tipo 				: page_globals.top_tipo,
						search_fields 			: search_fields,
						filter_sections 		: filter_sections,
						divisor 				: divisor,
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
						var label_value = component_autocomplete.convert_data_to_label_value(response_data.result)

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
				var label = ui.item.label
				var value = ui.item.value

				// Input text hidden tracks component value
				var current_input_value 	= hidden_input.value
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

				// Add new value to array
				current_val.push( new_value )

				//return console.log(current_val)
				//console.log(page_globals.modo);

				// INPUT HIDDEN . Set value to component input
				$(hidden_input).attr('value', JSON.stringify(current_val))
			
				switch(page_globals.modo){
					case 'edit':
						// Edit Save value 
						component_autocomplete.Save(hidden_input)
						component_autocomplete.inverse_locator('add_locator',
																value,
																tipo,
																input_obj.dataset.parent,
																input_obj.dataset.section_tipo);
						break;
					case 'tool_import_files':
					case 'search':						
					case 'list':
						// Search set hidden input value
						// New li element
						var new_li 	  = document.createElement('li')
						var new_li_button_delete = document.createElement('div')
							new_li_button_delete.classList.add('icon_bs','link','css_autocomplete_button_delete')
							new_li_button_delete.dataset.current_value = JSON.stringify(value)
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
	* INVERSE_LOCATOR
	*/
	this.inverse_locator = function(mode, locator, tipo, parent, section_tipo){

		const trigger_vars = { 
				mode 			: mode,
				tipo 			: tipo,
				parent 			: parent,
				section_tipo 	: section_tipo,
				locator 		: locator
		}
		//return console.log("[component_autocomplete.inverse_locator] trigger_vars",trigger_vars)

		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					console.log("[component_autocomplete.inverse_locator] response", response)
				}
				//html_page.loading_content( wrap_div, 0 );
				if (response===null) {
					//alert("An error has occurred. Null data is received");
					var msg = "<span class='error'>[component_autocomplete.inverse_locator] ERROR: on add/remove locator</span>";				
					inspector.show_log_msg(msg);
				}else{
					console.log(response.msg);
				}
		}, function(error) {
				console.error("[component_autocomplete.inverse_locator] Failed get_json!", error);				
		})//end js_promise

		return js_promise;
	};//end inverse_locator



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
	this.save_filter_sections = function(input, cookie_name) {

		var wrap_div 		 = input.parentNode.parentNode.parentNode.parentNode;
		var filter_sections  = JSON.stringify(this.get_filter_sections(wrap_div)) //  
		
		return createCookie(cookie_name, filter_sections, 365);
	}//end save_filter_sections



	/**
	* GET_FILTER_SECTIONS
	* @return array of checked hierarchy_sections sections
	*/
	this.get_filter_sections = function(wrap_div) {		
		
		var list_ul = wrap_div.querySelector('ul.filter_by_list')
		if (list_ul) {
			var selected_values = []
			var ar_inputs = list_ul.querySelectorAll('input')
			var len 	  = ar_inputs.length
			for (var i = len - 1; i >= 0; i--) {
				if(ar_inputs[i].checked) {
					var current_val = ar_inputs[i].value // 
					if (current_val!=='on') {
						selected_values.push( JSON.parse(current_val) )
					}					
				}
			}
		}else{
			var selected_values = false
		}	

		return selected_values;
	}//end get_filter_sections



	/**
	* SET_FILTER_SECTIONS
	* Reads cookie if exists and aply values to current list
	*/
	this.set_filter_sections = function(wrap_div, cookie_name) {

		var ar_values = readCookie(cookie_name)
			if (!ar_values) {
				return false;
			}
		
		//ar_values = ar_values;
			//console.log(ar_values); return;
		
		var list_ul   = wrap_div.querySelector('ul.filter_by_list')
		var ar_inputs = list_ul.querySelectorAll('input')
		
		var len = ar_inputs.length
		for (var i = len - 1; i >= 0; i--) {
			if(ar_values.indexOf(ar_inputs[i].value)!==-1 && ar_inputs[i].value!=='on') {
				ar_inputs[i].checked = true
			}else{
				ar_inputs[i].checked = false
			}
		}
	}//end set_filter_sections



}//end component_autocomplete