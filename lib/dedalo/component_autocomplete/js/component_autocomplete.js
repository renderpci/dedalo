// JavaScript Document


/**
* COMPONENT_AUTOCOMPLETE CLASS
*/
var component_autocomplete = new function() {	

	this.trigger_url = DEDALO_LIB_BASE_URL + '/component_autocomplete/trigger.component_autocomplete.php'
	this.ajax_container
	this.tipo
	this.parent
	this.current_tipo_section
	this.propiedades
	this.label
	this.wrapper_id

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
				return alert("component_autocomplete:remove_locator: Sorry: wrap_div dom element not found")
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
				//console.log(response);
				component_common.load_component_by_wrapper_id(wrapper_id);
			}, function(xhrObj) {
				console.log(xhrObj);
			});
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
			console.log("ya exite el component_autocomplete_new_element ("+id_wrapper+"). Lo ocultamos solamente")
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
		
		var mydata	= { 'mode'					: 'new_element',
						'tipo'					: tipo,
						'parent'				: parent,
						'section_tipo'			: section_tipo,
						'target_section_tipo' 	: target_section_tipo,
						'tipo_to_search'		: tipo_to_search,
						'top_tipo'				: page_globals.top_tipo,
					  };
					  //return console.log(mydata)						
		
		//html_page.loading_content( wrap_div, 1 );
		ajax_container.innerHTML = '<span class=""> Loading.. </span>'

		// AJAX REQUEST
		$.ajax({
			url		: this.trigger_url,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			if (received_data.length<1) {
				ajax_container.innerHTML = "Sorry. Empty data is received!";
				return false;
			};
				console.log(received_data);
			// Draw trigger html response
			ajax_container.innerHTML = received_data;				

			// Focus first input text			
			ajax_container.getElementsByTagName('input')[0].focus()

			// EVENT HANDLER FOR ENTER KEY (13)
			$(ajax_container).on('keypress', function(event) {
		
				if (event.keyCode===13) {
					var button_submit = $(ajax_container).find('.button_submit_new_element').first();
					button_submit.trigger( "click" );
					//console.log("Click in trigger")
				};
			});
			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on new_element</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		})
	};//end new_element



	/**
	* SUBMIT_NEW_ELEMENT
	*/
	this.submit_new_element = function(button_obj) {

		var component_autocomplete  = this,
			ajax_container  		= this.ajax_container,
			wrap_div 				= this.wrap_div,			
			target_section_tipo 	= button_obj.dataset.target_section_tipo,
			hidden_input 			= wrap_div.querySelectorAll('[data-type="autocomplete_dato_hidden"]')[0],	//$(wrap_div).find('.css_autocomplete_dato_hidden');
			ar_inputs 				= ajax_container.querySelectorAll('.wrap_component')
			
		// ar_data recoge en formato 'Object {rsc214: "vag"}' los datos de tipo-valor de los input text del formulario, para pasarlos al post
		var ar_data  = {}
		var is_empty = false
		var len 	 = ar_inputs.length
		for (var i = len - 1; i >= 0; i--) {

			var tipo 	= ar_inputs[i].dataset.tipo,
				component_name = ar_inputs[i].dataset.component_name,
				dato 	= window[component_name].get_dato(ar_inputs[i])


				//value 	= ar_inputs[i].value
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
		
		var mydata = { 	'mode'				  	: 'submit_new_element',
						'tipo'				  	: this.tipo,
						'parent'			  	: this.parent,
						'section_tipo'			: this.section_tipo,
						'target_section_tipo' 	: target_section_tipo,
						'ar_data'			  	: JSON.stringify(ar_data),
						'propiedades'		 	: JSON.stringify(this.propiedades),
						'top_tipo'			  	: page_globals.top_tipo,
					  }
					  //return console.log( mydata );

		// AJAX REQUEST
		$.ajax({
			url		: this.trigger_url,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {
			
			if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1 || received_data.length<1) {				

				ajax_container.innerHTML = received_data
				return;			
			
			}else{				

				// INPUT HIDDEN
				// trigger returns int new created section id matrix				
				var current_input_value = hidden_input.value

				 var current_val = JSON.parse( current_input_value );
					 current_val.push( JSON.parse(received_data) )

				// INPUT HIDDEN . Set value to component input
				hidden_input.value = JSON.stringify(current_val);//val( value );				

				// Save
				component_autocomplete.Save(hidden_input);				
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page						
			ajax_container.innerHTML = "<span class='error'>ERROR: on submit_new_element</span>";
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		})
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
				if(DEBUG) console.log(btn_obj);
				return alert("component_autocomplete:delete: Sorry: wrap_div dom element not found")
			}
		//var wrap_div 		= document.getElementById(btn_obj.dataset.id_wrapper),
			input_text_hide = wrap_div.querySelectorAll('[data-type="autocomplete_dato_hidden"]')[0]


		var locator 		= btn_obj.dataset.current_value,
			tipo 			= btn_obj.dataset.tipo,
			parent 			= wrap_div.dataset.parent,
			section_tipo 	= wrap_div.dataset.section_tipo

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

		//Remove inverse locator in reference 
		component_autocomplete.inverse_locator('remove_locator',locator, tipo, parent, section_tipo);

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
	* ACTIVATE
	* This method is invoked when user click on input text field of current component
	*/
	this.activated = {};
	this.activate = function(input_obj) {
		
		// Activate once
		var tipo = input_obj.dataset.tipo
		if ( typeof component_autocomplete.activated[tipo] !== 'undefined' ) {
			return false;
		}
		component_autocomplete.activated[tipo] = true;
		//console.log(input_obj);

		// From component wrapper		
		var wrap_div = find_ancestor(input_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(input_obj);
				return alert("component_autocomplete:activate: Sorry: wrap_div dom element not found")
			}
			var obj_warp = wrap_div;

		component_common.select_wrap(obj_warp)

		// HIDDEN_INPUT
		var	hidden_input			= wrap_div.querySelector('[data-role="autocomplete_dato_hidden"]')

		// BUTTON DELETE : Hide when hidden_input no value		
		var	button_delete			= wrap_div.querySelector('[data-role="autocomplete_button_delete"]')
		//if( hidden_input.value.length <1 || hidden_input.value==='' || hidden_input.value==='""') button_delete.style.display = 'none';

		var	ar_target_section_tipo	= input_obj.dataset.ar_target_section_tipo		
		var	div_valor 				= wrap_div.querySelector('[data-role="autocomplete_valor"]')
		

		var cache = {};
		$(input_obj).autocomplete({
			delay 	 : 100,
			minLength: 1,					
			source 	 : function( request, response ) {

				// Cache
				var term = request.term;
				if ( term in cache ) {
				  response( cache[ term ] );
				  return;
				}

				var my_data = {
					'mode' 					 : "autocomplete",
					'tipo'					 : tipo,
					'ar_target_section_tipo' : ar_target_section_tipo, //JSON.stringify(
					'string_to_search' 		 : request.term,
					'top_tipo' 				 : page_globals.top_tipo,
					'id_path' 				 : page_globals.id_path
					}
					//return 	console.log(my_data);

				$.ajax({
				  url 		: component_autocomplete.trigger_url,
				  dataType 	: "json",
				  data 		: my_data,
					success: function( data ) {
						cache[ term ] = data;
						response( $.map( data, function( my_key, my_value ) {
							//my_key = my_key.replace(/<\/?[^>]+(>|$)/g, "");
							return {
								label: my_key.replace(/<\/?[^>]+(>|$)/g, ""),
								value: my_value
							}
						}));
					}
				});
			},
			// When a option is selected in list
			select: function( event, ui ) {			    	
				// prevent set selected value to autocomplete input
				event.preventDefault();
				$(this).val('')
				var label = ui.item.label ;
				var value = ui.item.value ;


				 var current_input_value = hidden_input.value
				 var current_val 		 = JSON.parse( current_input_value );
					 current_val.push( JSON.parse(value) )

					//return console.log(current_val)
					//console.log(page_globals.modo);

				// INPUT HIDDEN . Set value to component input
				$(hidden_input).attr('value', JSON.stringify(current_val) );//val( value );

			
				switch(page_globals.modo){
					
					case 'edit':
						// Edit Save value 
						component_autocomplete.Save(hidden_input)
						component_autocomplete.inverse_locator('add_locator',value, tipo, input_obj.dataset.parent, input_obj.dataset.section_tipo);
						break;
					case 'tool_import_files':
					case 'search':						
					case 'list':
						// Search set hidden input value
						div_valor.html( div_valor.html() + "<li><div class=\"icon_bs link css_autocomplete_button_delete\" \
							data-current_value='"+JSON.stringify(value)+"' onclick=\"component_autocomplete.delete(this)\"></div>"+ label + "</li>" )							
						break;	
					default:
						break;
				}					

				$(this).blur();
				//alert(ui.item.value + ' '+input_text_hide.length)
			},
			// When a option is focus in list
			focus: function( event, ui ) { 
				// prevent set selected value to autocomplete input
				event.preventDefault();			    	
			},
			change: function( event, ui ) {
				//console.log(event)			   		
			}
			//close: function( event, ui ) { alert(ui)}
		})
		.on( "keydown", function( event ) {
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
		

		this.activated=true;
	};//end this.activate



	this.inverse_locator = function(mode, locator, tipo, parent, section_tipo){

		var mydata		= { 'mode': mode,
							'tipo': tipo,
							'parent': parent,
							'section_tipo': section_tipo,				
							'locator':locator
						  };
						  //return console.log(mydata)						

		// AJAX REQUEST
		$.ajax({
			url		: this.trigger_url,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {
				
			//console.log(received_data);
			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on new_element</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		})
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



}//end component_autocomplete