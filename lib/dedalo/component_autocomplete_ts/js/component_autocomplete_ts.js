





var component_autocomplete_ts = new function() {


	this.wrapper_id;
	this.save_arguments = {}

	this.trigger_url = DEDALO_LIB_BASE_URL + '/component_autocomplete_ts/trigger.component_autocomplete_ts.php';


	/**
	* UPDATE_COMPONENTS_RELATED
	* Obtiene el string de texto del componente:css_autocomplete_ts_valor, tipo 'Los Monegros, Huesca, Aragón, España' recibido 
	* y actualiza (si procede, cuando hay un término relacionado en estructura de modelo 'component_geolocation')
	*/
	this.update_components_related = function(component_obj) {
	
		//console.log(component_obj)

		// El que viene (component_obj) no es correto... cogemos el que hemos fijado

		var component_obj = autocomplete_ts_wrapper;

		// TYPE OBJECT Verify
		if(typeof component_obj !== 'object') {
			return alert("Error on update_components_related. Wrong component_obj type")
		}
		//console.log('-->update_components_related:'); console.log($(input_autocomplete_ts_valor).length); console.log( $(input_autocomplete_ts_valor).text() )


		var toponimia_string = $(component_obj).find('.css_autocomplete_ts_valor').text();
		//var toponimia_string = $(input_autocomplete_ts_valor).find('.css_autocomplete_ts_valor').text();		
			//console.log("toponimia_string:"+toponimia_string)

		// toponimia_string text verify
		if( toponimia_string.length <5 ) {

			return null; // estamos borrando, por lo que no habrá dato
			//return alert("Error on update_components_related. Wrong data found in toponimia_string: "+toponimia_string)
		}

		// PROCESADO Y ACTUALIZACIÓN DEL COMPONENTE RELACIONADO
		var parent = $(component_obj).find('.css_autocomplete_ts_dato_hidden:input').data('parent');
		var ar_related_components = $(component_obj).find('.css_autocomplete_ts_dato_hidden:input').data('link_fields');
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
	* SAVE
	*/
	var link_fields ;
	var autocomplete_ts_wrapper ;
	this.Save = function(component_obj) {

		if(page_globals.modo!='edit') return false;

		// Set current wrapper_id from current component 
		//component_autocomplete_ts.wrapper_id = $(component_obj).parents('.css_wrap_autocomplete_ts').first().attr('id')
	
		// From component wrapper
		if (component_obj instanceof jQuery ) component_obj = component_obj[0]	// object jquery case
		//console.log(component_obj);	
		var wrap_div = find_ancestor(component_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(component_obj);
				return alert("component_autocomplete_ts:Save: Sorry: wrap_div dom element not found")
			}
			component_autocomplete_ts.wrapper_id = wrap_div.id	

		// Fix data link fields from hidden input data
		//console.log($(component_obj).data('link_fields').component_geolocation )
		//link_fields 	   		= $(component_obj).data('link_fields');
		//autocomplete_ts_wrapper = $(component_obj).parents('.css_wrap_autocomplete_ts').first();
			//console.log(input_autocomplete_ts_valor);

		// Set current wrapper_id from current component
		//component_autocomplete_ts.wrapper_id = $(autocomplete_ts_wrapper).attr('id');
			//console.log(component_autocomplete_ts.wrapper_id);			

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments)
			
			jsPromise.then(function(response) {
			  	//console.log(response);
			  	component_autocomplete_ts.refresh_component(null)
			}, function(xhrObj) {
			  	console.log(xhrObj)
			});		
	};


	/**
	* REFRESH_COMPONENT
	* Triggered when this component save
	* received data is section_id of current new/existing component
	*/
	this.refresh_component = function(received_data) {				
		return component_common.load_component_by_wrapper_id( component_autocomplete_ts.wrapper_id );
	};


	/**
	* DELETE
	*/
	this.delete = function(btn_obj) {

		if (page_globals.modo=='edit') {
			if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		}

		var value_to_remove = JSON.parse(btn_obj.dataset.current_value)
			//console.log(value_to_remove);

		// From component wrapper		
		var wrap_div = find_ancestor(btn_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(btn_obj);
				return alert("component_autocomplete_ts:delete: Sorry: wrap_div dom element not found")
			}

		// Set value to component hidden dato input	
		var input_text_hide = wrap_div.querySelector('input.css_autocomplete_ts_dato_hidden')

		var current_value = input_text_hide.value
			current_value = JSON.parse(current_value)

		// Remove current value from array
		var len = current_value.length
		for(var i = len - 1; i >= 0; i--) {
			///console.log(current_value[i]); console.log(value_to_remove);
			if( JSON.stringify(current_value[i]) === JSON.stringify(value_to_remove) ) {			
		       current_value.splice(i, 1);
		       if (DEBUG) {
		       		console.log("deleted i:"+i+" "+JSON.stringify(value_to_remove)) ;
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
	};//end delete



	/**
	* ACTIVATE
	*/
	this.activated = false;
	this.activate = function( input_obj ) {

		if (this.activated===true) {
			//return false;
		}	

		/*
		$(function() {
		    var cache = {};
		    $( this).autocomplete({
		      minLength: 2,
		      source: function( request, response ) {
		        var term = request.term;
		        if ( term in cache ) {
		          response( cache[ term ] );
		          return;
		        }
		 
		        $.getJSON( component_autocomplete_ts.trigger_url, request, function( data, status, xhr ) {
		          cache[ term ] = data;
		          response( data );
		          console.log(data)
		        });
		      }
		    });
		});
		return false;
		*/

		//var obj_warp = document.getElementById(input_obj.dataset.id_wrapper);
		// From component wrapper
		if (input_obj instanceof jQuery ) input_obj = input_obj[0]	// object jquery case
		var wrap_div = find_ancestor(input_obj, 'wrap_component')
			if (wrap_div === null ) {
				if(DEBUG) console.log(input_obj);
				return alert("component_autocomplete_ts:activate: Sorry: wrap_div dom element not found")
			}
			var obj_warp = wrap_div;
			//console.log(obj_warp);
			//console.log(input_obj);

    	component_common.select_wrap(obj_warp)
		
		// AUTOCOMPLETE TS FUNCIONALITY
		//$('.css_autocomplete_ts_search_field').each(function() {
		$(input_obj).each(function() {

			var ar_tipo_to_search 	= $(this).data('ar_tipo_to_search')
			var	source_mode 		= $(this).data('source_mode')
			var	hidden_input 		= $(this).parent().find('[data-role="autocomplete_ts_dato_hidden"]')[0]
			var	button_delete 		= $(this).parent().find('[data-role="autocomplete_ts_button_delete"]')[0]								

			// BUTTON DELETE : Hide when hidden_input no value
			if (hidden_input) {
				if( $(hidden_input).val().length <1 || $(hidden_input).val()=='' || $(hidden_input).val()=='""') $(button_delete).hide();
			}			

			// TRIGGER AJAX TREE RESOLUTION
			//component_autocomplete_ts.fire_tree_resolution(ar_tipo_to_search);
			
			var cache = {};
			$(this)
			.autocomplete({
				delay: 100,
				minLength: 3,
				source: function( request, response ) {
					
					// Cache
					var term = request.term;
					if ( term in cache ) {
						response( cache[ term ] );
						return;
			        }
					var my_data = {
						"mode" 				: 'autocomplete_ts',
						"ar_tipo_to_search" : ar_tipo_to_search,
						"source_mode" 		: source_mode,
						"string_to_search" 	: request.term,
						"top_tipo" 			: page_globals.top_tipo
						}
					
					$.ajax({
						url 		: component_autocomplete_ts.trigger_url,
						dataType 	: 'json',
						data 		: my_data,
						success 	: function( response_data ) {
						
										cache[ term ] = response_data;
										response( $.map( response_data, function( my_key, my_value ) {
											return {
												label: my_key,
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

			        // Add locator (and saves in edit mode)
			        component_autocomplete_ts.add_locator(value, label, hidden_input)			      					

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
			   		//console.log(ui)			   		
			   		$(this).val('')
			   	}
			   	/**/
		    });//end $(this).autocomplete({		
		
		});// end $('.css_autocomplete_ts_search_field').each(function()

		this.activated=true;
	};//end this.activate



	/**
	* ADD_LOCATOR
	* @return 
	*/
	this.add_locator = function(value, label, hidden_input) {

		if (typeof hidden_input=='undefined') {
			return alert("Error on get hidden_input ")
		}
		
		// Converts terminoID to locator object, like es1281 => Object {section_id: "1281", section_tipo: "es1"}
		var value = component_autocomplete_ts.convert_dato_to_locator(value)
		if (value && typeof value=='object') {
			
			// Get current hidden input value
			var current_input_value = hidden_input.value;
	    	// parse josn string value to object
	        var current_val = JSON.parse( current_input_value )   		
	        	
	        	// check if value already exits
				for (var key in current_val) {
					if(JSON.stringify(current_val[key]) === JSON.stringify(value)){
						console.log("Value already exits. Skipped !!");
						return false
					}
				}

	        	// Add value to current object
	        	current_val.push(value)

			// Set modified value to component input as text
			hidden_input.value = JSON.stringify(current_val)

			switch(page_globals.modo){
				case 'edit':
					// Edit Save value 
					component_autocomplete_ts.Save(hidden_input)
					break;
				case 'search':
				case 'list':
					// Search
					var div_valor = $(hidden_input).parent().find('.css_autocomplete_ts_valor')
					div_valor.html( div_valor.html() + "<li><div class=\"icon_bs link css_autocomplete_ts_button_delete\" \
						data-current_value='"+JSON.stringify(value)+"' onclick=\"component_autocomplete_ts.delete(this)\"></div>"+ label + "</li>" )
					break;	
				default:
					break;
			}
		}

		return true
	};//end add_locator



	/**
	* ADD_INDEX
	* Se llama aquí desde la ventana flotante del tesauro
	* @param object button_obj
	*	Botón del tesauro desde donde se hace click (contiene los datos su dataset)
	* @param object url_vars
	*	Objecto con las variables que la ventana del tesauro recibe y después vuelve a pasar de forma transparente
	*/
	this.add_index = function( button_obj, url_vars ) {		
		//console.log(button_obj);
		//console.log(url_vars);

		var tipo  = button_obj.dataset.termino_id
		var label = button_obj.dataset.termino

		// hidden_input
		// Calculate always again from selected wrapper
		var hidden_input = this.selected_wrap_div.querySelectorAll('[data-role="autocomplete_ts_dato_hidden"]')[0];

		component_autocomplete_ts.add_locator(tipo, label, hidden_input)

		return false
	};//end add_index



	/**
	* OPEN_TS_WINDOW
	* Abrir listado de tesauro para hacer relaciones
	*/
	var relwindow = null
	this.selected_wrap_div = null;
	this.open_ts_window = function(button_obj) {
	
		var modo 				 = 'tesauro_rel',
			rel_type 			 = 'autocomplete_ts_tree',
			exclude_tipo 		 = [3,7],
			locator_section_tipo = button_obj.dataset.locator_section_tipo,
			locator_section_id 	 = button_obj.dataset.locator_section_id,
			hide_types 			 = button_obj.dataset.hide_types

		// Fix current this.selected_wrap_div (Important)
		// Nota: el wrapper no cambia al actualizar el componente tras salvarlo, por lo que es seguro		
		this.selected_wrap_div = find_ancestor(button_obj, 'wrap_component')
			if (this.selected_wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("component_autocomplete_ts:open_ts_window: Sorry: this.selected_wrap_div dom element not found")
			}

			
		var url = DEDALO_LIB_BASE_URL + '/ts/ts_list.php?'
			url += 'modo=' + modo
			url += '&hide_types=' + hide_types
			url += '&rel_type=' + rel_type
			//url += '&locator_section_tipo=' + locator_section_tipo
			//url += '&locator_section_id=' + locator_section_id			

		relwindow = window.open(url ,'listwindow','status=yes,scrollbars=yes,resizable=yes,width=900,height=650');//resizable
		if (relwindow) relwindow.moveTo(-10,1);
		if (window.focus) { relwindow.focus() }
	}//end open_ts_window



	/**
	* CONVERT_DATO_TO_LOCATOR
	*/
	this.convert_dato_to_locator = function(dato) {
		
		var prefix 	= this.get_prefix_from_tipo(dato),
			id 		= this.get_id_from_tipo(dato)
			
		var locator = {
			"section_id" 	: id,
			"section_tipo"  : prefix+"1"
		}
		return locator
	};
	

	this.get_prefix_from_tipo = function(tipo) {	
		var matches = tipo.match(/\D+/);
			//console.log(matches);

		if (matches[0].length<2) {
			console.log(matches[0]);
			alert("Error: prefix not valid in tipo: "+tipo)
		}
		return matches[0];
	};


	this.get_id_from_tipo = function(tipo) {
		var matches = tipo.split(/\D+/);

		if (matches[1].length<1) {
			console.log(matches[1]);
			alert("Error: id not valid in tipo: "+tipo)
		}
		return matches[1];
	};
	

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
	* FIRE TREE RESOLUTION
	*/
	/*
	this.fire_tree_resolution_DES = function(ar_tipo_to_search) {
		
		return false;
		if(page_globals.modo!='edit') return null;

		
		var wrapper_id 	= '#autocomplete_ts_tree_stats_'+tipo_to_search;		
		var mode 		= 'fire_tree_resolution';
		var mydata		= { 'mode': mode,
							'tipo_to_search': tipo_to_search,
							'top_tipo':page_globals.top_tipo
						  };
						//if(DEBUG) console.log(JSON.stringify(mydata))

		// If get tre resolution for root term, return null
		var is_root = this.is_root(tipo_to_search);
		if (is_root===true) {
			$(wrapper_id).html('')
			return null;
		}


		var cookie_name = 'component_autocomplete_ts_' + tipo_to_search
		var current_cookie = get_localStorage(cookie_name);
		if ( typeof(current_cookie)!='undefined' && current_cookie ) {			
			$(wrapper_id).html( current_cookie );
				//if(DEBUG) console.log('->fire_tree_resolution. '+tipo_to_search+' cookie exists ('+cookie_name+')' );
			return null;
		};

		if(DEBUG) console.log("->fire_tree_resolution calculating: "+tipo_to_search)

		html_page.loading_content( wrapper_id, 1 );

		// AJAX REQUEST
		$.ajax({
			url			: this.trigger_url,
			data		: mydata,
			type		: "GET"
		})
		// DONE
		.done(function(received_data) {

			$(wrapper_id).html( received_data );
			if(DEBUG) console.log('->fire_tree_resolution. '+tipo_to_search+' finish ' + received_data );

			// COOKIE TREE RESOLUTION DONE
			set_localStorage(cookie_name,received_data);								
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on fire_tree_resolution " + error_data + "</span>");
		})
		// ALWAYS
		.always(function() {			
			html_page.loading_content( wrapper_id, 0 );
		});

		return false;
	}
	*/

	

}//end component_autocomplete_ts


