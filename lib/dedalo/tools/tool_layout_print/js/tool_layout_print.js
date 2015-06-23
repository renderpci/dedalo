// JS




/**
* TOOL_LAYOUT_PRINT CLASS
*/
var tool_layout_print = new function() {

	this.trigger_url 		 = DEDALO_LIB_BASE_URL + '/tools/tool_layout_print/trigger.tool_layout_print.php?top_tipo='+page_globals.top_tipo ;
	this.layout_html_content = '';
	
	/**
	* GOTO_EDIT
	* @param object button_obj
	*/
	this.goto_edit = function(button_obj) {

		var template_id 	= $(button_obj).parent('li').data('template_id'),
			template_tipo 	= $(button_obj).parent('li').data('template_tipo'),
			url_vars 		= get_current_url_vars();

		// Edit / update object
		url_vars.context_name 	= 'edit';
		url_vars.template_id 	= template_id;
		url_vars.template_tipo 	= template_tipo;
	
		var url='?'
		$.each( url_vars, function( key, value ) {
		  url += key + "=" + value + '&';
		});
		//return console.log(url.slice(0,-1))

		return window.location.href = url.slice(0,-1);

	}//end goto_edit



	/**
	* DELETE_TEMPLATE
	* @param object button_obj
	*/
	this.delete_template = function(button_obj) {

		var section_layout_id 	= $(button_obj).parent('li').data('template_id'),
			section_layout_tipo = $(button_obj).parent('li').data('template_tipo'),
			wrap_div 			= $('#wrap_list')
		
		// Spinner ON
		html_page.loading_content( wrap_div, 1 );

		if (!confirm( get_label.esta_seguro_de_borrar_este_registro )) {
			html_page.loading_content( wrap_div, 0 );
			return false;
		};

		var mydata = {
				'mode' 				  : 'delete_template',
				'section_layout_tipo' : section_layout_tipo,
				'section_layout_id'	  : section_layout_id,
			}
			//return console.log(mydata)

			// AJAX REQUEST
			$.ajax({
			  	url		: this.trigger_url,
				data	: mydata,
				type	: "POST",
			})
			// DONE
			.done(function(data_response) {
				//console.log(data_response);
			  	
			  	// Search 'error' string in response
				var error_response = /error/i.test(data_response);								

				// If data_response contain 'error' show alert error with (data_response) else reload the page
				if(error_response) {
					// Alert error
					alert("[trigger] Request failed: \n" + data_response +' ' );
				}else{
					// Simply reload page							
					location.reload();
				}			
			})
			// FAIL ERROR	 
			.fail(function(jqXHR, textStatus) {
				var msg = "[trigger] Request failed: " + textStatus ;
				wrap_div.html(" <span class='error'>Error on call trigger " + msg + "</span>");
			 	alert( msg );
			})
			// ALWAYS
			.always(function() {
				// Spinner OFF
				html_page.loading_content( wrap_div, 0 );
			})

	}//end delete_template


	/**
	* GET_PAGE_TEMPLATE
	* Get html content of all pages and clean code removing unnecessary elements
	* @return string html_content
	* @see save_template()
	*/
	this.get_page_template = function() {

		var ar_pages 	 = $('.page'),
			html_content = ''

			//console.log(ar_pages);

		$.each(ar_pages, function(index, page_value) {
			
			// Clone element to manipulate contents without affect original element
			var temp_page_obj = $(page_value).clone()
				//console.log(temp_page_obj)

			// Remove resizable elements and close buttons
			// NOT USED...
			//$(temp_page_obj).find(".ui-resizable-handle, .close, .page_close_button" ).remove()			
			//$(temp_page_obj[0]).find('.draggable').draggable("destroy").resizable("destroy");
			//console.log(temp_page_obj)

			// Remove drag / resize elements from DOM before continue
			html_content += clean_page_to_save(temp_page_obj).outerHTML;

			//return 	console.log(clean_page_obj)

			// Add page and contents html
			//html_content += $(temp_page_obj)[0].outerHTML

			//html_content += $(val)[0].outerHTML
		});
		
		return html_content;
	}


	/**
	* SAVE_TEMPLATE
	* Get pages html code and save contents into component_layout using ajax call to trigger
	* @param object button_obj
	*/
	this.save_template = function(button_obj) {

		var html_content 			= this.get_page_template(),
			component_layout_tipo	= $(button_obj).data('component_layout_tipo'),
			section_layout_id		= $('#input_section_layout_id').val(),
			section_layout_tipo		= $(button_obj).data('section_layout_tipo'),
			section_target_tipo		= $('#input_section_target_tipo').val(),
			layout_label			= $('#input_layout_label').val()

			//return 	console.log(html_content.length)

		//return console.log(html_content)
		if ( html_content.length < 155 ) return alert("Please, add one page at least and content before save.");

		wrap_div = $('.right')

		var mydata = {
				'mode' 					: 'save_template',
				'component_layout_tipo'	: component_layout_tipo,
				'section_layout_id'		: section_layout_id,
				'section_layout_tipo'	: section_layout_tipo,
				'type'					: 'edit',
				'html_content' 			: html_content,
				'section_target_tipo'	: section_target_tipo,
				'layout_label'  		: layout_label
			}
			//return console.log(mydata)

			// AJAX REQUEST
			$.ajax({
			  	url		: this.trigger_url,
				data	: mydata,
				type	: "POST",
			})
			// DONE
			.done(function(data_response) {
				//console.log(data_response);			  							

				// If data_response contain 'error' show alert error with (data_response) else reload the page
				if(/error/i.test(data_response)) {
					// Alert error
					alert("[trigger] Request failed: \n" + data_response +' ' );
				
				}else{

					var template_id = parseInt(data_response);

					// Update input value
					$('#input_section_layout_id').val(template_id)
					
					// Update page url
					var url 	= window.location.href,
						new_url = change_url_variable(url, 'template_id', template_id)
						window.history.pushState("", "", new_url)					
					
					// Show msg in save response div		
					$('#save_response').html('ok').css('padding','5px');
					setTimeout(function(){
						$('#save_response').fadeOut(1000, function(){ $(this).html('')})
					}, 5000);				

					// Change mode
					tool_layout_print.set_mode('print');
				}			
			})
			// FAIL ERROR	 
			.fail(function(jqXHR, textStatus) {
				var msg = "[trigger] Request failed: " + textStatus ;
				wrap_div.html(" <span class='error'>Error on call trigger " + msg + "</span>");
			 	alert( msg );
			})
			// ALWAYS
			.always(function() {
				// Spinner OFF
				html_page.loading_content( wrap_div, 0 );
			})
	}//end save_template


	/**
	* SET_MODE
	* @param string mode like 'edit' / 'print'
	* Change visual apperance of page in different modes
	*/
	this.set_mode = function(mode) {

		switch(mode) {

			case 'print':
				// Hide elements
				$('.wrap_save, .wrap_add_page_fixed, .wrap_add_page_fluid, .wrap_select_option_pages_fixed, .wrap_select_option_pages_fluid').fadeOut(300); // Right side buttons
				$('#left').children().fadeOut(300); // Left side components
				$('.template_name, .warp_icon_editable_text, .warp_icon_header_button, .warp_icon_footer_button').fadeOut(300); // Top buttons				
				$('.page_close_button, .close').hide()// page
				
				$('.wrap_edit').fadeIn(1000); // Show edit page button

				window.scrollTo(0,0);
				break;

			case 'edit':

				break;

		}

	}//end set_mode



	/**
	* INIT_EDITABLE_TEXT
	* Init inline text editor of request object id
	*/
	this.init_editable_text = function(obj_id) {

		setTimeout(function() {
			tinymce.init({
			    selector: "#"+obj_id,
			    inline: true,
			    plugins: [
			        "advlist autolink lists link image charmap print preview anchor",
			        "searchreplace visualblocks code fullscreen",
			        "insertdatetime media table contextmenu paste"
			    ],
			    toolbar: "insertfile undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image"
			});
		}, 1000)	

	}//end init_editable_text

	
	/*
	*PRINT THE TEMPLATE
	*/
	this.print_pdf = function(button_obj){

		this.save_template(button_obj);
		return;

		var section_target_tipo		= page_globals.top_tipo,
			section_layout_id		= button_obj.dataset.section_layout_id,
			component_layout_tipo	= button_obj.dataset.component_layout_tipo;

		var html_content 	= this.get_page_template();
		wrap_div = $('.right')
		var mydata = {
				'mode' 					: 'print_pages',
				'tipo' 					: tipo,
				'section_layout_id'		: section_layout_id,
				'component_layout_tipo'	: component_layout_tipo
			}
			//return console.log(mydata)

			// AJAX REQUEST
			$.ajax({
			  	url		: this.trigger_url,
				data	: mydata,
				type	: "POST",
			})
			// DONE
			.done(function(data_response) {
				//console.log(data_response);
			  	
			  	// Search 'error' string in response
				var error_response = /error/i.test(data_response);								

				// If data_response contain 'error' show alert error with (data_response) else reload the page
				if(error_response) {
					// Alert error
					// console.log(data_response)
					alert("[trigger] Request failed: \n" + data_response +' ' );
				}else{
					console.log("HECHOOOOO");

					// Change mode
					tool_layout_print.set_mode('print');
				}			
			})
			// FAIL ERROR	 
			.fail(function(jqXHR, textStatus) {
				var msg = "[trigger] Request failed: " + textStatus ;
				wrap_div.html(" <span class='error'>Error on call trigger " + msg + "</span>");
			 	alert( msg );
			})
			// ALWAYS
			.always(function() {
				// Spinner OFF
				html_page.loading_content( wrap_div, 0 );
			})

	}




};//end class	