// JavaScript Document


/**
* COMPONENT_AUTOCOMPLETE CLASS
*/
var component_autocomplete = new function() {	

	this.trigger_url = DEDALO_LIB_BASE_URL + '/component_autocomplete/trigger.component_autocomplete.php',
	this.ajax_container,
	this.tipo,
	this.parent,
	this.current_tipo_section,
	this.propiedades,
	this.label

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		var save_arguments = { 
							"dato_in_db" : $(component_obj).data('dato_in_db'),
							 }	

		if (save_arguments.dato_in_db <1) {
			//console.log("Error on save. Zero value")
			//console.log( $(component_obj).val() ) 
			//return 
		};
		

		// Exec general save
		component_common.Save(component_obj, save_arguments);
	}


	



	this.new_element = function(button_obj) {		

		var wrap_div 				= $(button_obj).parents('.wrap_component:first'),
			tipo 					= $(wrap_div).data('tipo'),			
			parent 					= $(wrap_div).data('parent'),
			section_tipo			= $(wrap_div).data('section_tipo'),
			referenced_section_tipo = $(wrap_div).data('referenced_section_tipo'),
			tipo_to_search 			= $(wrap_div).data('tipo_to_search'),
			propiedades 			= $(wrap_div).data('component_info').propiedades,
			ajax_container 			= $(wrap_div).find('.new_element_container')
				//console.log($(ajax_container).length);

		component_autocomplete.wrap_div 				= wrap_div;
		component_autocomplete.ajax_container 			= ajax_container;
		component_autocomplete.tipo 		 			= tipo;
		component_autocomplete.parent 					= parent;
		component_autocomplete.section_tipo				= section_tipo;
		component_autocomplete.referenced_section_tipo	= referenced_section_tipo;
		component_autocomplete.tipo_to_search			= tipo_to_search;
		component_autocomplete.propiedades				= propiedades;
			//console.log(this);

		if ($(wrap_div).find('.component_autocomplete_new_element').length>0 ) {
			$(ajax_container)
				.html('')
				.empty()
				.hide()
			console.log("ya exite el component_autocomplete_new_element. Lo ocultamos solamente")
			return false;
		}else{
			// Reset all
			$('.new_element_container').html('')
			$(component_autocomplete.ajax_container).empty()
		};

		var mode 		= 'new_element';
		var mydata		= { 'mode': mode,
							'tipo': tipo,
							'parent': parent,
							'section_tipo': section_tipo,
							'referenced_section_tipo': referenced_section_tipo,
							'tipo_to_search': tipo_to_search,
							'top_tipo':page_globals.top_tipo,
						  };
						  //return console.log(mydata)						
		
		//html_page.loading_content( wrap_div, 1 );
		$(ajax_container).html('Loading..');

		// AJAX REQUEST
		$.ajax({
			url		: this.trigger_url,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {
			
			$(ajax_container)
				.html(received_data)
				.fadeIn(300)
				.find('input[type=text]').first().focus()

			// EVENT HANDLER FOR ENTER KEY (13)
			$(ajax_container).bind('keypress', function(event) {				
				if (event.keyCode===13) {
					var button_submit = $(ajax_container).find('.button_submit_new_element').first();
					$( button_submit ).trigger( "click" );
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

	}//end new_element





	this.submit_new_element = function(button_obj) {

		var ajax_container  		= this.ajax_container,
			wrap_div 				= this.wrap_div,
			div_valor 				= $(wrap_div).find('.css_autocomplete_valor'),
			component_autocomplete  = this,
			referenced_section_tipo = $(button_obj).data('referenced_section_tipo')
 
		
		var new_element_wrap = $(button_obj).parent(),
			ar_inputs 		 = $(new_element_wrap).find('input[type=text]') // Pude haber más de 1 input text (por ejemplo nombre, apellidos)
			//console.log(ar_inputs); return 

			
		// ar_data recoge en formato 'Object {rsc214: "vag"}' los datos de tipo-valor de los input text del formulario, para pasarlos al post
		var ar_data = {};
		var is_empty = false;
		$.each( ar_inputs, function( key, current_obj ) {

		  	var tipo 	= $(current_obj).data('tipo'),
		  		value 	= current_obj.value;

		  	if (key==0 && value.length<1) {
		  		is_empty=true;
		  		$(ar_inputs[0]).focus();
		  		return alert("Empty data")
		  	};

		  	ar_data[tipo] = value;
		});
		//return 	console.log(ar_data)

		if (is_empty==true) {return false;};


		// LABEL
		var ar_label = $.map( ar_data, function( value, index ) {
			return value;
		});
		var label = ar_label.join(", ")
			//console.log(this.label);

		var mode 		= 'submit_new_element';
		var mydata		= { 'mode'				  		: mode,
							'tipo'				  		: this.tipo,
							'parent'			  		: this.parent,
							'section_tipo'				: this.section_tipo,
							'referenced_section_tipo' 	: referenced_section_tipo,
							'ar_data'			  		: JSON.stringify(ar_data),
							'propiedades'		 		: JSON.stringify(this.propiedades),
							'top_tipo'			  		:page_globals.top_tipo,
						  };
						  //return console.log( mydata );

		// AJAX REQUEST
		$.ajax({
			url		: this.trigger_url,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {
			
			if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
				
				$(ajax_container).html(received_data)					
			
			}else{				

				// TEXT : Update valor text
				$(div_valor).html( label );

				// INPUT HIDDEN
				// trigger returns int new created section id matrix
				var input_hidden = $(wrap_div).find('.css_autocomplete_dato_hidden');
				$(input_hidden).val(received_data);	
				component_autocomplete.Save(input_hidden);

			/*
				$(ajax_container).unbind().empty();				
			*/	
				$(ajax_container).fadeOut('2500', function() {
					//$(this).html('')	
					$(this)
						.unbind()
						.empty();
				});

			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on submit_new_element</span>";				
			$(ajax_container)
				.html(msg)
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		})
	}



	/**
	* DELETE
	*/
	this.delete = function(btn_obj) {

		if( !confirm( get_label.esta_seguro_de_borrar_este_registro ) ) return false;
		
		// Set value to component hidden dato input
		var input_text_hide =  $(btn_obj).parent().find('.css_autocomplete_dato_hidden:input').val('');							
		
		// Save value 
		component_autocomplete.Save(input_text_hide);

		// Update valor text
		var set_valor =  $(btn_obj).parent().find('div.css_autocomplete_valor').html('');

		$(btn_obj).hide();
	}


	/**
	* ACTIVATE
	* This method is invoked when user click on input text field of current component
	*/
	this.activate = function(input_obj) {

		// AUTOCOMPLETE FUNCIONALITY
		//$('.css_autocomplete_search_field').each(function() {
		$(input_obj).each(function() {    

			var tipo					= $(this).data('tipo'),
				tipo_to_search			= $(this).data('tipo_to_search'),
				referenced_section_tipo	= $(this).data('referenced_section_tipo'),
				button_delete 			= $(this).parent().find('div.css_autocomplete_button_delete'),
				hidden_input 			= $(this).parent().find('.css_autocomplete_dato_hidden:input'),
				div_valor 				= $(this).parent().find('div.css_autocomplete_valor');					
					//console.log( 'tipo_to_search: '+tipo_to_search )

			// BUTTON DELETE : Hide when hidden_input no value
			if( $(hidden_input).val().length <1 || $(hidden_input).val()=='' || $(hidden_input).val()=='""') $(button_delete).hide();

			var cache = {};
			$(this)	
			.autocomplete({
				minLength: 1,						
				source: function( request, response ) {

					// Cache
					var term = request.term;
			        if ( term in cache ) {
			          response( cache[ term ] );
			          return;
			        }
			        $.ajax({
			          url: component_autocomplete.trigger_url,
			          dataType: "json",
			          data: {
			            'mode' 					 : "autocomplete",
			            'tipo'					 : tipo,
			            'tipo_to_search' 		 : tipo_to_search,
			            'referenced_section_tipo': referenced_section_tipo,
			            'string_to_search' 		 : request.term,
			            'top_tipo' 				 : page_globals.top_tipo,
			            'id_path' 				 : page_globals.id_path
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
			    },
			    // When a option is selected in list
			    select: function( event, ui ) {			    	
			    	// prevent set selected value to autocomplete input
			    	event.preventDefault();
					$(this).val('')
			        var label = ui.item.label ;
			        var value = ui.item.value ;

					// HIDDEN FIELD : Set value to component hidden dato input
					$(hidden_input).val( value );

					// TEXT : Update valor text
					$(div_valor).html( label );

					// SAVE : Component save value 
					component_autocomplete.Save(hidden_input);

					// BUTTON DELETE : Show again delete button
					$(button_delete).delay(500).show(300);

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
		    .bind( "keydown", function( event ) {
		    	//console.log(event)
		        if ( event.keyCode === $.ui.keyCode.ENTER  ) {

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

			        	var label = $(this).val() ;
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

		});//end //$('.css_autocomplete_search_field').each(function() 


	}//end this.activate


	

}//end component_autocomplete


