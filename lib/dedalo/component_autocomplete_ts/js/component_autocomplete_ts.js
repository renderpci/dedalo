// JavaScript Document

// ON LOAD
$(window).load(function() {
	/*
	// TRIGGER AJAX TREE RESOLUTION
	// Is calculated one and stored in a php session
	$('.css_autocomplete_ts_search_field').each(function() {
		var ar_tipo_to_search 	= $(this).data('ar_tipo_to_search');
		component_autocomplete_ts.fire_tree_resolution(ar_tipo_to_search);
	});
	*/	 
});

var component_autocomplete_ts = new function() {


	/**
	* update_components_related
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
			console.log("toponimia_string:"+toponimia_string)

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
	}


	/**
	* REFRESH_COMPONENT
	* triggered when this component save
	* received data is section_id of current new/existing component
	*/
	this.refresh_component = function(received_data) {
				
		return component_common.load_component_by_wrapper_id(this.wrapper_id);

		if (DEBUG) {
				console.log("refresh_component // DE MOMENTO NO ACTUALIZA NADA. SOLUCIONAR ESTO");
		};
		return false; // DE MOMENTO NO ACTUALIZA NADA. SOLUCIONAR ESTO
	

		var component_geolocations_tipo 	= link_fields.component_geolocation,
			component_geolocations_parent	= received_data;

		if (typeof component_geolocations_tipo != 'undefined' && component_geolocations_tipo!=null) {

			var geolocation_wrapper = $('.css_wrap_geolocation[data-tipo='+component_geolocations_tipo+'][data-parent='+component_geolocations_parent+']');
			if ($(geolocation_wrapper).length==1) {
				var wrapper_id 	= $(geolocation_wrapper).attr('id'),
					arguments  	= null,
					callback 	= null;
				component_common.load_component_by_wrapper_id(wrapper_id,received_data,component_autocomplete_ts.update_components_related);
			}else{
				console.log("Error on update geolocation component from autocomplete_ts refresh_component")
			}
		}
		
		// received data is id_matrix of current new/existing component
		//return component_common.update_component_by_ajax( received_data, component_autocomplete_ts.update_components_related );
		//$(target).find('.css_autocomplete_ts_valor').text()		
	}



	this.wrapper_id;
	this.save_arguments = {
						  } // End save_arguments

	this.trigger_url = DEDALO_LIB_BASE_URL + '/component_autocomplete_ts/trigger.component_autocomplete_ts.php';

	/**
	* SAVE
	*/
	var link_fields ;
	var autocomplete_ts_wrapper ;
	this.Save = function(component_obj) {

		// Set current wrapper_id from current component 
		component_autocomplete_ts.wrapper_id = $(component_obj).parents('.css_wrap_autocomplete_ts').first().attr('id');
			//console.log(component_autocomplete_ts.wrapper_id);	
		
		if(page_globals.modo!='edit') return false;

		// Fix data link fields from hidden input data
		//console.log($(component_obj).data('link_fields').component_geolocation )
		//link_fields 	   		= $(component_obj).data('link_fields');
		//autocomplete_ts_wrapper = $(component_obj).parents('.css_wrap_autocomplete_ts').first();
			//console.log(input_autocomplete_ts_valor);

		// Set current wrapper_id from current component
		//component_autocomplete_ts.wrapper_id = $(autocomplete_ts_wrapper).attr('id');
			//console.log(component_autocomplete_ts.wrapper_id);			

		// Exec general save
		var jsPromise = component_common.Save(component_obj, this.save_arguments);	
		
		jsPromise.then(function(response) {
		  	//console.log(response);
		  	component_autocomplete_ts.refresh_component(null)
		}, function(xhrObj) {
		  	console.log(xhrObj);
		});
		
	}


	/**
	* DELETE
	*/
	this.delete = function(btn_obj) {

		if (page_globals.modo=='edit') {
			if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		}

		var value_to_remove = JSON.parse(btn_obj.dataset.current_value)
			//console.log(value_to_remove);

		// Set value to component hidden dato input		
		var input_text_hide = $(btn_obj).parents('.content_data').first().find('.css_autocomplete_ts_dato_hidden:input');
		//return console.log(input_text_hide);

		var current_value = $(input_text_hide).attr('value');
			current_value = JSON.parse(current_value)
				//console.log(current_value);			


		// Remove current value from array
		for(var i = current_value.length - 1; i >= 0; i--) {
			///console.log(current_value[i]); console.log(value_to_remove);
			if( JSON.stringify(current_value[i]) == JSON.stringify(value_to_remove) ) {			
		       current_value.splice(i, 1);
		       if (DEBUG) {
		       		console.log("deleted i:"+i+" "+JSON.stringify(value_to_remove)) ;
		       }
		    }
		}

		// Update input value
		$(input_text_hide).attr('value', JSON.stringify(current_value) );			

		// Update showed text. Remove li element
		btn_obj.parentNode.remove();

		// Save when edit
		if (page_globals.modo=='edit') {		
			this.Save(input_text_hide);
		}
	}

	


	/**
	* ACTIVATE
	*/
	this.activate = function(input_obj) {		

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
		
		// AUTOCOMPLETE TS FUNCIONALITY
		//$('.css_autocomplete_ts_search_field').each(function() {
		$(input_obj).each(function() {	

			var ar_tipo_to_search 	= $(this).data('ar_tipo_to_search'),
				button_delete 		= $(this).parent().find('div.css_autocomplete_ts_button_delete'),
				hidden_input 		= $(this).parent().find('.css_autocomplete_ts_dato_hidden:input'),
				div_valor 			= $(this).parent().find('.css_autocomplete_ts_valor');

			if( $(hidden_input).val().length <1 || $(hidden_input).val()=='null' ) $(button_delete).hide();

			// TRIGGER AJAX TREE RESOLUTION
			//component_autocomplete_ts.fire_tree_resolution(ar_tipo_to_search);
			
			var cache = {};
			$(this).autocomplete({
				delay: 500,
				minLength: 3
				,source: function( request, response ) {
					
					// Cache
					var term = request.term;
			        if ( term in cache ) {
			          response( cache[ term ] );
			          return;
			        }			        			       
			        $.ajax({
			          url: component_autocomplete_ts.trigger_url,
			          dataType: "json",
			          data: {
			            mode: "autocomplete_ts",
			            ar_tipo_to_search: ar_tipo_to_search,
			            string_to_search: request.term,
			            top_tipo: page_globals.top_tipo
			          },
					  success: function( data ) {					  	
			          	cache[ term ] = data;
						response( $.map( data, function( my_key, my_value ) {
			              return {
								label: my_key,
								value: my_value
			              		}
			            }));
			          }
			        });
			    }			    
			    // When a option is selected in list
			    ,select: function( event, ui ) {
			    	// prevent set selected value to autocomplete input
			    	event.preventDefault();
					$(this).val('')
			        var label = ui.item.label ;
			        var value = ui.item.value ;

			        //console.log(label);
			        //console.log(value);
			        // Dato from selector is like es521 . Need convert to locator like {"section_tipo":"es1","section_id":521}
			        var value = component_autocomplete_ts.convert_dato_to_locator(value)
			        	//console.log(locator);
			        
			        var current_input_value = $(hidden_input).attr('value')
						/*
			        	if (typeof current_input_value == 'string' || current_input_value.length==0 ) {
			        		// Use array as base value
			        		current_input_value = []
			        	}
			        	//console.log(typeof current_input_value); console.log( current_input_value.length );
					*/
			        var current_val = JSON.parse( current_input_value );
			        	//console.log(typeof current_val);		        	
			        	//console.log(current_val);
			        	current_val.push(value)
			        	//console.log(current_val);

					// Set value to component input
					$(hidden_input).attr('value', JSON.stringify(current_val) );//val( value );
						//console.log(current_val);					

					switch(page_globals.modo){
						case 'edit':
							// Edit Save value 
							component_autocomplete_ts.Save(hidden_input);
							break;
						case 'search':
						case 'list':
							// Search
							div_valor.html( div_valor.html() + "<li><div class=\"icon_bs link css_autocomplete_ts_button_delete\" \
								data-current_value='"+JSON.stringify(value)+"' onclick=\"component_autocomplete_ts.delete(this)\"></div>"+ label + "</li>" )
							break;	
						default:
							break;
					}								

					$(this).blur();
			       //alert(ui.item.value + ' '+input_text_hide.length)
			    }
			    // When a option is focus in list
			    ,focus: function( event, ui ) { 
			    	// prevent set selected value to autocomplete input
			    	event.preventDefault(); 
			   	}
			   	,change: function( event, ui ) {
			   		//console.log(event)
			   		//console.log(ui)			   		
			   		$(this).val('')
			   	}
			   	/**/
		    });//end $(this).autocomplete({
		
		
		});// end $('.css_autocomplete_ts_search_field').each(function()

	}//end this.activate


	this.convert_dato_to_locator = function(dato) {
		
		var prefix 	= this.get_prefix_from_tipo(dato),
			id 		= this.get_id_from_tipo(dato)
			
		var locator = {
			"section_id" 	: id,
			"section_tipo"  : prefix+"1"
		}
		return locator
	}
	

	this.get_prefix_from_tipo = function(tipo) {	
		var matches = tipo.match(/\D+/);
			//console.log(matches);

		if (matches[0].length<2) {
			console.log(matches[0]);
			alert("Error: prefix not valid in tipo: "+tipo)
		}
		return matches[0];
	}

	this.get_id_from_tipo = function(tipo) {
		var matches = tipo.split(/\D+/);

		if (matches[1].length<1) {
			console.log(matches[1]);
			alert("Error: id not valid in tipo: "+tipo)
		}
		return matches[1];
	}
	

	this.is_root = function(tipo) {
		var tipo_id = parseInt(tipo.substring(2));
			//alert(tipo + ' '+ tipo_id)
		if(tipo_id==1) {
			return true;
		}else{
			return false;
		}
	}

	/**
	* FIRE TREE RESOLUTION
	*/
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


	

}//end component_autocomplete_ts


