// JavaScript Document
$(document).ready(function() {
	
	/* TOGGLE FILTER TAP CONTENT 
	$('.css_rows_search_tap').each(function() {		
		
		$(this).bind("click", function(event) {			
			
			$(this).parent().find('.css_rows_search_content').toggle(250);
			
		});
	});
		*/
	// SET DEFAULT VALUE FOR FIELD MAX PER PAGE (5)
	var max_pp_obj = $('.css_max_rows');	if(max_pp_obj.val() <1)	max_pp_obj.val(5);
	
});



var section_list = new function() {

	/**
	* LOAD_ROWS : Ajax loads records
	*/
	this.load_rows = function(options, button_obj) {
		//console.log('load_rows options:');console.log(options); return false;

		if (typeof options ==='undefined' || typeof options =='null') {
			var options = $(button_obj).parents('.css_section_list_wrap').first().data('options');
			console.log("Using default options on load_rows");
		}		
		
		// Options
		if (typeof options.section_tipo==='undefined' || typeof options.section_tipo===null) {
			return alert("Error: Few vars: section_tipo is mandatory: "+options.section_tipo)
		}
		if (typeof options.modo==='undefined' || typeof options.modo===null) {
			return alert("Error: Few vars: modo is mandatory: "+options.modo)
		}

		// Target
		if (typeof button_obj != 'undefined') {
			var target  = $(button_obj).parents('.section_list_rows_content_div').first();	//return console.log( $(target) );
		}
		if ($(target).length!=1 ) {
			console.log(target)
			return alert("Error: target dom element not found: "+target);
		}
		
		var wrap_div = $(button_obj).parents('.css_section_list_wrap').first();	//console.log( $(wrap_div) )
		if ($(wrap_div).length!=1 ) {
			return alert("Error: wrap_div dom element not found: "+wrap_div);
		}	

		// Active loading overlap
		html_page.loading_content( wrap_div, 1 );
			

		// Convert json object options to string to send by ajax as text
		options = JSON.stringify(options);

		var mydata = {
					'mode': 'load_rows',
					'options': options,
					'top_tipo': page_globals.top_tipo 
					}
					//return 	console.log(mydata);

		// AJAX REQUEST
		$.ajax({
			url		: DEDALO_LIB_BASE_URL + '/section_list/trigger.section_list.php',
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {		
			var container = $(target).find('.css_section_list_wrap').first(); //console.log(container.length)				
			$(container).html( 
				$(received_data).find('.css_section_group_content:first>*')
			)			
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			if (DEBUG) {console.log(error_data)};	
		})
		// ALWAYS
		.always(function() {
			// Remove loading overlap		
			html_page.loading_content( wrap_div, 0 );			
		})

	
	}//end load_rows


	this.reload_rows_list = function (call_uid) {

		var options 	= $('#'+call_uid).data('options'),	// options data are stored in json format on wrap div like 'wrap_dd1140_list'
			button_obj 	= $('#'+call_uid).find('.paginator_first_icon').first() // Any button inside is valid

			// If button paginator not exits, reload complete page
			if ($(button_obj).length<1) {
				window.location.href = window.location.href;
				return false;
			}
		section_list.load_rows(options, button_obj)
	}



	/**
	* SEARCH
	*/
	this.Search = function(obj_form) {
		
		var dato_form = $(obj_form).serializeArray();
			//console.log(obj_form)

		/*
		Pendiente: recoger los datos manteniendo la integridad de los checkbox

		*/

		var obj = dato_form.reduce(function(o, v, i) {

				if(v.value.length >0){
					o[v.name] = v.value
				}	
				return o;
			}, {});
			//console.log(obj)

		var current_section_tipo 	= obj.section_tipo,
			current_max_rows 		= obj.max_rows,
			current_modo 			= obj.modo,
			context 				= obj.context

			//return 	console.log(context);

		// Clean final obj to send as filter_by_search var
		delete obj.section_tipo;
		delete obj.max_rows;
		delete obj.modo;
		delete obj.context; // Delete context as field

		// Create obj options to send to load_rows
		var options = {	
						section_tipo 	 	: current_section_tipo,
						modo 	 			: current_modo,
						context 	 		: context,	
						limit 	 		 	: current_max_rows,
						tipo_de_dato_search	: 'dato',
						filter_by_search 	: obj,
					}
		if (DEBUG) {
			//console.log(options.filter_by_search)
		}
		
		var virtual_button_obj = $(obj_form).parents('.css_section_wrap').first().find('.paginator_first_icon').first();
			//console.log(virtual_button_obj); //return;

		this.load_rows( options, virtual_button_obj );
		return false;
	}

	/**
	* RESET FORM
	*/
	this.reset_form = function(obj_form) {		
		// Get section tipo from form hidden input
		var section_tipo = $("input[name='section_tipo']", obj_form).val();
			//console.log(section_tipo)
		var current_modo = $("input[name='modo']", obj_form).val();

		var options = {	
						section_tipo : section_tipo,
						modo 		 : current_modo,
						context 	 : obj_form.context.value
					}
					//return	console.log(options);	

		var virtual_button_obj = $(obj_form).parents('.css_section_wrap').first().find('.paginator_first_icon').first();

		this.load_rows(options, virtual_button_obj);

		$(obj_form).trigger("reset");

		return false;
	}



	this.check_submit = function(form_obj, event) {
		//return ;
		
		/* en proceso */


		if(event && event.keyCode === 13) {
			//document.forms[0].submit();
			//trigger('event name')css_button_search 
			event.preventDefault()
			$(form_obj).find('.css_button_search').trigger('click');
		}
	}
	


}//end section_list










