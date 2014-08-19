// JavaScript Document
$(document).ready(function() {
	
	switch(page_globals.modo) {
		case 'tool_time_machine' :
		case 'edit' :
				/*
				// OBJ SELECTOR
				var ref_obj = $('.css_ref:input');
				
				$(document.body).on("change", ref_obj.selector, function(){
					component_autocomplete.Save(this);
				});
				*/
				break;
	}

});


/**
* COMPONENT_AUTOCOMPLETE CLASS
*/
var component_autocomplete = new function() {
	

	this.trigger_url = DEDALO_LIB_BASE_URL + '/component_autocomplete/trigger.component_autocomplete.php';

	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		var save_arguments = {	"dato_in_db" : $(component_obj).data('dato_in_db'),
							} // End save_arguments	

		//return console.log(component_obj)
		// Exec general save
		component_common.Save(component_obj, save_arguments);
	}


	/**
	* SAVE_RELATED
	*/
	this.Save_related = function(select_object, tipo_to_search) {

		// Component vars
		var dato		= $(select_object).val();
		var wrap_div 	= $(select_object).parents('.wrap_component:first');

		var hidden_input	= $(select_object).parent().find('.css_autocomplete_dato_hidden:input');
		var	div_valor		= $(select_object).parent().find('div.css_autocomplete_valor');
		var button_delete 	= $(select_object).parent().find('div.css_autocomplete_button_delete');
	  				
		var mode 		= 'Save_related';
		var mydata		= { 'mode': mode, 'tipo': tipo_to_search, 'dato': dato };
			//return console.log(mydata)
		
		html_page.loading_content( wrap_div, 1 );


		// AJAX REQUEST
		$.ajax({
			url		: component_common.url_trigger ,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// SET ID Si el objeto se creó con id=NULL , se le asigna el id devuelto
			// Response new 'id_matrix' expected
			if ($.isNumeric(received_data) && received_data>0) {
				
				//alert('received_data: '+received_data)
				$(hidden_input).val(received_data)
				$(div_valor).val(dato)

				// HIDDEN FIELD : Set value to component hidden dato input
				$(hidden_input).val( received_data );			

				// TEXT : Update valor text
				$(div_valor).html( dato );

				// SAVE : Component save value 
				component_autocomplete.Save(hidden_input);

				// BUTTON DELETE : Show again delete button
				$(button_delete).delay(500).show(300);				

				$(select_object).val('');
				$(select_object).blur();
			}					
			
			// INSPECTOR LOG INFO												
			if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
				var msg = "<span class='error'>Failed Save!<br>" +received_data+ " for " + dato + "</span>";			
				// Notify to log messages in top of page
				inspector.show_log_msg(msg);				
			}
			else {
				var msg = "<span class='ok'>Saved " + dato + " ["+ received_data +"]</span>";
				inspector.show_log_msg(msg);						
			}
			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on Save data id:" + id + "<br>Data is NOT saved!</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALLWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
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
		this.Save(input_text_hide);

		// Update valor text
		var set_valor =  $(btn_obj).parent().find('div.css_autocomplete_valor').html('');

		$(btn_obj).hide();
	}


	/**
	* ACTIVATE
	*/
	this.activate = function(input_obj) {

		// AUTOCOMPLETE FUNCIONALITY
		//$('.css_autocomplete_search_field').each(function() {
		$(input_obj).each(function() {    

			var tipo_to_search		= $(this).data('tipo_to_search'),
				button_delete 		= $(this).parent().find('div.css_autocomplete_button_delete'),
				hidden_input 		= $(this).parent().find('.css_autocomplete_dato_hidden:input'),
				div_valor 			= $(this).parent().find('div.css_autocomplete_valor');
					//console.log( 'tipo_to_search: '+tipo_to_search )

			// BUTTON DELETE : Hide when hidden_input no value
			if( $(hidden_input).val().length <1 || $(hidden_input).val()=='' || $(hidden_input).val()=='""') $(button_delete).hide();

			var cache = {};
			$(this)	
			.autocomplete({
				minLength: 1,						
				source: function( request, response ) {
					var term = request.term;
			        if ( term in cache ) {
			          response( cache[ term ] );
			          return;
			        }
			        $.ajax({
			          url: component_autocomplete.trigger_url,
			          dataType: "json",
			          data: {
			            mode: "autocomplete",
			            tipo_to_search: tipo_to_search,
			            string_to_search: request.term
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
			   	//close: function( event, ui ) { alert(ui)}
		    })
		    .bind( "keydown", function( event ) {
		        if ( event.keyCode === $.ui.keyCode.ENTER  ) {
		        	
		        	//console.log( $(this).val() )
		         	event.preventDefault();  

		         	var term 			= $(this).val();

		         	// TEST CACHE IS LOADED
		         	var cache_exists 	= term in cache;
		         	if(cache_exists!=true) {
		         		console.log("Cache no avalaible")
						return;
		         	}
		         	
		         	// CACHE OBJ
		         	var term_from_cache_obj = cache[ term ];
		         		//console.log( $(term_from_cache_obj).length )

		         	// CACHE TEST
		         	var term_in_cache = false;
		         	if ( $(term_from_cache_obj).length == 0 ) {
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
			        		//alert('key: ' + key + '\n' + 'value: ' + element);
						    id_matrix 	= key;
						    dato 		= element;
						});
			        	//console.log("id_matrix: "+id_matrix + " "+dato); return

			        	// HIDDEN FIELD : Set value to component hidden dato input
						$(hidden_input).val( id_matrix );

						// TEXT : Update valor text
						$(div_valor).html( dato );

						// SAVE : Component save value 
						component_autocomplete.Save(hidden_input);

						// BUTTON DELETE : Show again delete button
						$(button_delete).delay(500).show(300);

						if(DEBUG) console.log("->autocomplete: Save from cache term "+id_matrix+" "+label);
						// INPUT CLEAN
						$(this).blur();
						return;

			        }else{
			        	// ADD NEW RECORD AND SAVE

			        	// SAVE RELATED
		         		component_autocomplete.Save_related( $(this), tipo_to_search );

		         		if(DEBUG) console.log("->autocomplete: Save new term "+$(this).val());

		         		// INPUT CLEAN
						$(this).blur();
						return;

			        }//end if ( term in cache ) {
		        }//end if ( event.keyCode === $.ui.keyCode.ENTER  )

		    });// bind

		});//end //$('.css_autocomplete_search_field').each(function() 


	}//end this.activate


	

}//end component_autocomplete


