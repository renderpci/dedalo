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
	this.cookie_name;
	this.limit = 0; // Max items to manage (zero to unlimited)



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		var self = this;

		//setTimeout(function(){

		
		/* WORKING HERE ! */
		let wrapper = document.getElementById(options.wrapper_id)			
			if (wrapper===null) {
				console.error("[component_autocomplete_hi.init] ERROR. Wrapper not found. "+ options.wrapper_id);
				return false;
			}

		self.wrapper_id  = options.wrapper_id
		self.cookie_name = options.cookie_name
		self.limit 		 = options.limit || 0 // Max items to manage (zero to unlimited)
		
		//var autocomplete_input = wrapper.querySelector('.css_autocomplete_hi_search_field')

		let toponymy_list_button_options = wrapper.querySelector('.toponymy_list_button_options')
		if(toponymy_list_button_options) {
			toponymy_list_button_options.addEventListener("click",function(event){
				//event.preventDefault();
				//console.log(this)

				let toponymy_list_ul = this.parentNode.querySelector('ul.toponymy_list') 

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
			},false);
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


			// set_hierarchy_sections . Read from cookie if exists and update ul list
			self.set_hierarchy_sections(wrapper, options.cookie_name)
		}
		/*
		wrapper.addEventListener("contextmenu",function(event){
			event.preventDefault();
			console.log(event)

			var toponymy_list_ul = this.querySelector('ul.toponymy_list') 
			//console.log(toponymy_list_ul);
			toponymy_list_ul.style.display = "block";
			toponymy_list_ul.style.left = (event.offsetX - 10)+"px";
			toponymy_list_ul.style.top = (event.offsetY - 20)+"px";			
		},false);
		*/
		//},1)
	};//end init



	/**
	* UPDATE_COMPONENTS_RELATED
	* Obtiene el string de texto del componente:css_autocomplete_hi_valor, tipo 'Los Monegros, Huesca, Aragón, España' recibido 
	* y actualiza (si procede, cuando hay un término relacionado en estructura de modelo 'component_geolocation')
	*/
	this.update_components_related_OLD = function(component_obj) {
		//console.log(component_obj)

		// El que viene (component_obj) no es correto... cogemos el que hemos fijado
		var component_obj = autocomplete_hi_wrapper;

		// TYPE OBJECT Verify
		if(typeof component_obj !== 'object') {
			return alert("Error on update_components_related. Wrong component_obj type")
		}
		//console.log('-->update_components_related:'); console.log($(input_autocomplete_hi_valor).length); console.log( $(input_autocomplete_hi_valor).text() )


		var toponimia_string = $(component_obj).find('.css_autocomplete_hi_valor').text();
		//var toponimia_string = $(input_autocomplete_hi_valor).find('.css_autocomplete_hi_valor').text();		
			//console.log("toponimia_string:"+toponimia_string)

		// toponimia_string text verify
		if( toponimia_string.length <5 ) {

			return null; // estamos borrando, por lo que no habrá dato
			//return alert("Error on update_components_related. Wrong data found in toponimia_string: "+toponimia_string)
		}

		// PROCESADO Y ACTUALIZACIÓN DEL COMPONENTE RELACIONADO
		var parent = $(component_obj).find('.css_autocomplete_hi_dato_hidden:input').data('parent');
		var ar_related_components = $(component_obj).find('.css_autocomplete_hi_dato_hidden:input').data('link_fields');
			//console.log(ar_related_components);

		// Iterate all related components
		$.each(ar_related_components, function(modelo, current_tipo) {
			//console.log(current_tipo);
			//console.log(modelo);
			//var current_modelo = modelo.update_component_related(current_tipo,toponimia_string);
			//alert("componente a actualizar: "+current_tipo+" <br>con el dato: "+toponimia_string)
			
			//console.log(modelo.update_component_related(current_tipo));
			//console.log(current_modelo);
			//component_geolocation.update_component_related(current_tipo,toponimia_string);

			// find object
			//var fn = window[fnstring];
			var fn = window[modelo]['update_component_related'];

			//console.log(fn);
			 
			// is object a function?
			if (typeof fn === "function") {
				//alert("llamando")
				fn.apply(null, [parent, current_tipo, toponimia_string]);
			}else{
				//alert("no se encuentra "+fnstring)
				console.log(fn)
			}

		});

		//return alert(toponimia_string);
	};


	/**
	* UPDATE_COMPONENTS_RELATED
	* Get the geolocation lat long of the term that is searched and put inside the related term "geolocation" (the map)
	*/
	this.update_component_related = function(component_obj) {

		let related_term = component_obj.dataset.link_fields;
		let related =  JSON.parse(related_term)

		let current_tipo = related.component_geolocation
		let ar_values = component_obj.value
		if (ar_values ==='[]'){return}

		var trigger_vars = {
				mode 		: 'update_component_related',
				ar_locators	: JSON.stringify(ar_values)
			}
			
		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
					if(SHOW_DEBUG===true) {
						console.log("[component_autocomplete_hi.update_component_related] response:", response); 
					}
					if (response && response.result) {

						let current_dato = response.result

						component_geolocation.update_component_related(current_tipo, response.result)


					}else{
						alert("Error. response is null")
					}
			})

		
	};
	


	/**
	* SAVE
	*/
	var link_fields ;
	var autocomplete_hi_wrapper ;
	this.Save = function(component_obj) {
	
		if(page_globals.modo!='edit') return false;

		// Set current wrapper_id from current component 
		//component_autocomplete_hi.wrapper_id = $(component_obj).parents('.css_wrap_autocomplete_hi').first().attr('id')
	
		// From component wrapper
		if (component_obj instanceof jQuery ) component_obj = component_obj[0]	// object jquery case
		//console.log(component_obj);	
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_autocomplete_hi:Save: Sorry: wrap_div dom element not found")
			}
			component_autocomplete_hi.wrapper_id = wrap_div.id	

		// Fix data link fields from hidden input data
		//console.log($(component_obj).data('link_fields').component_geolocation )
		//link_fields 	   		= $(component_obj).data('link_fields');
		//autocomplete_hi_wrapper = $(component_obj).parents('.css_wrap_autocomplete_hi').first();
			//console.log(input_autocomplete_hi_valor);

		// Set current wrapper_id from current component
		//component_autocomplete_hi.wrapper_id = $(autocomplete_hi_wrapper).attr('id');
			//console.log(component_autocomplete_hi.wrapper_id);			

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments)
			
			jsPromise.then(function(response) {
				//console.log(response);
				component_autocomplete_hi.refresh_component(null)
				if(typeof component_obj.dataset.link_fields != 'undefined'){
					component_autocomplete_hi.update_component_related(component_obj)
				}

			}, function(xhrObj) {
				console.log(xhrObj)
			});		
	}//end Save


	/**
	* REFRESH_COMPONENT
	* Triggered when this component save
	* received data is section_id of current new/existing component
	*/
	this.refresh_component = function(received_data) {
		return component_common.load_component_by_wrapper_id( component_autocomplete_hi.wrapper_id );
	}


	/**
	* DELETE
	*/
	this.delete = function(btn_obj) {

		if (page_globals.modo==='edit') {
			if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		}

		var value_to_remove = JSON.parse(btn_obj.dataset.current_value)
			//console.log(value_to_remove);

		// From component wrapper		
		var wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log("[component_autocomplete_hi:delete] btn_obj",btn_obj);
				return alert("[component_autocomplete_hi:delete] Sorry: wrap_div dom element not found")
			}

		// Set value to component hidden dato input		
		var input_text_hide = wrap_div.querySelector('input.css_autocomplete_hi_dato_hidden')	//$(btn_obj).parents('.content_data').first().find('.css_autocomplete_hi_dato_hidden:input');

		var current_value = input_text_hide.value
			current_value = JSON.parse(current_value)

		// Remove current value from array
		var len = current_value.length
		for(var i = len - 1; i >= 0; i--) {
			///console.log(current_value[i]); console.log(value_to_remove);
			if( JSON.stringify(current_value[i]) === JSON.stringify(value_to_remove) ) {			
			   current_value.splice(i, 1);
			   if (DEBUG) {
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
	}//end delete



	/**
	* SELECT_ALL_HIERARCHY_SECTIONS
	* Check or uncheck all elements at once
	*/
	this.select_all_hierarchy_sections = function(input_obj, cookie_name) {

		var wrap_div 		 = find_ancestor(input_obj, 'wrap_component')
		var toponymy_list_ul = wrap_div.querySelector('ul.toponymy_list')
		var ar_inputs 		 = toponymy_list_ul.querySelectorAll('input')
		var len 			 = ar_inputs.length
		
		for (var i = len - 1; i >= 0; i--) {
			ar_inputs[i].checked = input_obj.checked
		}		

		this.save_hierarchy_sections(input_obj, cookie_name)
	}//end select_all_hierarchy_sections



	/**
	* SET_HIERARCHY_SECTIONS
	* Reads cookie if exists and aply values to current list
	*/
	this.set_hierarchy_sections = function(wrap_div, cookie_name) {

		var ar_values = readCookie(cookie_name)
			if (!ar_values) {
				return false;
			}
		
		ar_values = JSON.parse(ar_values);
			//console.log(ar_values); return;
		
		var toponymy_list_ul = wrap_div.querySelector('ul.toponymy_list')
		var ar_inputs = toponymy_list_ul.querySelectorAll('input')
		
		var len = ar_inputs.length
		for (var i = len - 1; i >= 0; i--) {
			if(ar_values.indexOf(ar_inputs[i].value)!==-1) {
				ar_inputs[i].checked = true
			}else{
				ar_inputs[i].checked = false
			}
		}
	}//end set_hierarchy_sections



	/**
	* GET_HIERARCHY_SECTIONS
	* @return array of checked hierarchy_sections sections
	*/
	this.get_hierarchy_sections = function(wrap_div) {
		
		var toponymy_list_ul = wrap_div.querySelector('ul.toponymy_list')
		var ar_inputs 		 = toponymy_list_ul.querySelectorAll('input') 

		var selected_values = []
		var len = ar_inputs.length
		for (var i = len - 1; i >= 0; i--) {
			if(ar_inputs[i].checked) {
				selected_values.push(ar_inputs[i].value)
			}
		}

		return selected_values
	}//end get_hierarchy_sections



	/**
	* SAVE_HIERARCHY_SECTIONS
	* Cookie stores current list values as json encoded array
	*/
	this.save_hierarchy_sections = function(input, cookie_name) {

		var wrap_div 			= input.parentNode.parentNode.parentNode.parentNode;
		var hierarchy_sections  = JSON.stringify( this.get_hierarchy_sections(wrap_div) )
		
		return createCookie(cookie_name, hierarchy_sections, 365)
	}//end save_hierarchy_sections



	/**
	* ACTIVATE
	*/
	this.activated = {};
	this.activate = function( input_obj ) {	
		
		// Activate once
		var tipo = input_obj.dataset.tipo
		if ( typeof component_autocomplete_hi.activated[tipo] !== 'undefined' ) {
			return false;
		}
		component_autocomplete_hi.activated[tipo] = true;
		//console.log(input_obj);	
		
		// From component wrapper		
		var wrap_div = find_ancestor(input_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(input_obj);
				return alert("component_autocomplete_hi:activate: Sorry: wrap_div dom element not found")
			}
			var obj_warp = wrap_div;

			// Select current component wrap
			component_common.select_wrap(obj_warp)
		
		// HIDDEN_INPUT
		var	hidden_input = input_obj.parentNode.querySelector('[data-role="autocomplete_hi_dato_hidden"]')

		// BUTTON DELETE : Hide when hidden_input no value		
		//var	button_delete	= input_obj.parentNode.querySelector('[data-role="autocomplete_hi_button_delete"]')
		//if( hidden_input.value.length <1 || hidden_input.value==='' || hidden_input.value==='""') button_delete.style.display = 'none';
	
		var	hierarchy_types 	= input_obj.dataset.hierarchy_types
		var	hierarchy_sections 	= this.get_hierarchy_sections(wrap_div)	//input_obj.dataset.hierarchy_sections
			//console.log(input_obj.dataset.hierarchy_sections);			

		var cache = {};
		$(input_obj).autocomplete({
			delay: 200,
			minLength: 3,
			source: function( request, response ) {
				var start = new Date().getTime();				
				var term = request.term;
				// Cache
				/*if ( term in cache ) {
					response( cache[term] );
					return;
				}*/

				var trigger_vars = {
					mode 				: 'autocomplete',
					hierarchy_types 	: hierarchy_types,
					hierarchy_sections 	: JSON.stringify(component_autocomplete_hi.get_hierarchy_sections(wrap_div)),
					string_to_search 	: request.term,
					top_tipo 			: page_globals.top_tipo
				}
				//console.log("[autocomplete_hi.autocomplete] trigger_vars", trigger_vars);
				
				// Ajax call
				common.get_json_data(component_autocomplete_hi.url_trigger, trigger_vars).then(function(response_data) {
							if(SHOW_DEBUG===true) {								
								var end  = new Date().getTime(); var time = end - start;
								//console.log("Time for "+term+": "+time+"ms");
								console.log("[autocomplete_hi.autocomplete] response_data", response_data, "Total: "+time+" ms");
							}
							
							//cache[term] = response_data
							/*
							response( $.map( response_data, function( my_key, my_value ) {
								return {
									label: my_key,
									value: my_value
								}
							}))
							*/
							var label_value = component_autocomplete_hi.convert_data_to_label_value(response_data.result)

							response(label_value)

							//var toponymy_list_ul = wrap_div.querySelector('ul.toponymy_list')
							//	if (toponymy_list_ul) toponymy_list_ul.style.display='none'									

					}, function(error) {
						console.error("[autocomplete_hi.autocomplete] Failed get_json!", error);
					});				
			},
			// When a option is selected in list
			select: function( event, ui ) {
				// prevent set selected value to autocomplete input
				event.preventDefault();
				//$(this).val('')
				this.value = ''
				var label = ui.item.label
				var value = JSON.parse(ui.item.value)		     
	
				// Add locator (and saves in edit mode)
				component_autocomplete_hi.add_locator(value, label, hidden_input)

				//$(this).blur();
				this.blur()
			   //alert(ui.item.value + ' '+input_text_hide.length)
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
		
	};//end this.activate



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
	* ADD_LOCATOR
	* @return 
	*/
	this.add_locator = function(value, label, hidden_input) {

		if (typeof hidden_input=='undefined') {
			return alert("[component_autocomplete_hi.add_locator] Error on get hidden_input ")
		}
		
		// Converts terminoID to locator object, like es1281 => Object {section_id: "1281", section_tipo: "es1"}
		//var value = component_autocomplete_hi.convert_dato_to_locator(value)
		
		if (value && typeof value==='object') {
		
			// Get current hidden input value
			var current_input_value = hidden_input.value || '[]';
			//console.log(current_input_value); return;

			// parse josn string value to object
			var current_val = JSON.parse( current_input_value )
				
				// check if value already exits
				for (var key in current_val) {
					if(JSON.stringify(current_val[key]) === JSON.stringify(value)){
						console.log("[component_autocomplete_hi.add_locator] Value already exits. Ignored value: "+JSON.stringify(value)+" => "+label);
						return false
					}
				}

			// Limit (optional, defined in 'propiedades' and set on init)
			var limit = parseInt(hidden_input.dataset.limit)
			if(SHOW_DEBUG===true) {
				//console.log("limit:"+limit+" - current_val.length:"+current_val.length +" modo:"+page_globals.modo);
			}				
			if(limit>0 && parseInt(current_val.length)>=limit) {
				alert("[component_autocomplete_hi.add_locator] Limit reached ("+limit+"). Skipped term !!");
				return false
			}else{
				// Add value to current object
				current_val.push(value)
			}

			// Set modified value to component input as text
			hidden_input.value = JSON.stringify(current_val)

			switch(page_globals.modo){
				case 'edit':
					// Edit Save value 
					component_autocomplete_hi.Save(hidden_input)
					break;
				case 'tool_indexation':
				case 'tool_structuration':
				case 'tool_transcription':
				case 'search':
				case 'list':
					// Search
					/*
					var div_valor = $(hidden_input).parent().find('.css_autocomplete_hi_valor')
					div_valor.html( div_valor.html() + "<li><div class=\"icon_bs link css_autocomplete_hi_button_delete\" \
						data-current_value='"+JSON.stringify(value)+"' onclick=\"component_autocomplete_hi.delete(this)\"></div>"+ label + "</li>" )
					*/
					// From component wrapper		
					var wrap_div = find_ancestor(hidden_input, 'wrap_component')
						if (wrap_div === null ) {
							if(DEBUG) console.log(hidden_input);
							return alert("[component_autocomplete_hi.add_locator] Sorry: wrap_div dom element not found")
						}
					// 'ul_valor' is ul element
					var ul_valor = wrap_div.querySelector('.css_autocomplete_hi_valor')

					// New li element
					var new_li 	  = document.createElement('li')
					var new_li_button_delete = document.createElement('div')
						new_li_button_delete.classList.add('icon_bs','link','css_autocomplete_hi_button_delete')
						new_li_button_delete.dataset.current_value = JSON.stringify(value)
						new_li_button_delete.addEventListener('click', function(event){
							component_autocomplete_hi.delete(this)
						}, false);
					var new_li_label = document.createElement('span')
						new_li_label.innerHTML = label

						new_li.appendChild(new_li_button_delete)
						new_li.appendChild(new_li_label)

					// Add created li to ul
					ul_valor.appendChild(new_li)					
					break;	
				default:
					break;
			}
		}

		return true
	};//end add_locator



	/**
	* LINK_TERM
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.link_term = function( section_id, section_tipo, label ) {
		
		var locator = {
			"section_id" 	: section_id,
			"section_tipo"  : section_tipo
		}
		//return console.log(locator)
		//console.log(label);

		// HIDDEN_INPUT
		// Calculate always again from selected wrapper
		var hidden_input = component_common.selected_wrap_div.querySelector('[data-role="autocomplete_hi_dato_hidden"]');

		component_autocomplete_hi.add_locator(locator, label, hidden_input)

		return false
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
				if(DEBUG) console.log(button_obj);
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
		var tipo_id = parseInt(tipo.substring(2));
			//alert(tipo + ' '+ tipo_id)
		if(tipo_id==1) {
			return true;
		}else{
			return false;
		}
	};



	/**
	* GET_DATO
	* @param DOM object component_obj
	* @return string dato
	*	json encoded data
	*/
	this.get_dato = function(component_obj) {

		var dato = ""

		if (component_obj.classList.contains('wrap_component')===true) {
			// Case received object is the component wrapper
			var input_hidden = component_obj.querySelector('input.css_autocomplete_hi_dato_hidden')
		}else{
			// Common case, component received is a input text inside the wrapper
			var input_hidden = component_obj
		}
		dato = input_hidden.value


		return dato
	};//end get_dato
	


}//end component_autocomplete_hi