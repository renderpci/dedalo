/*
	TRANSCRIPTION
*/
$(document).ready(function() {
		
	switch(page_globals.modo){

		case 'edit':
				/*
				// OBJ SELECTOR BUTTON OPEN NEW WINDOW
				var button_transcription_open = $('#btn_transcription_open');
					
					// LIVE EVENT CLICK TO BUTTON (ICON) LOAD TOOL
					$(document.body).on("click", button_transcription_open.selector, function(){
						
						// LOAD TOOL (OPEN NEW WINDOW)
						tool_transcription.open_tool_transcription(this,true);
					});
				*/
				break;

		case 'tool_transcription':				
				$('.html_page_debugger_wrap').hide(0);
				break;
		
	}
});
/*
// BEFORE UNLOAD
$(window).bind("beforeunload", function(event){
	
	component_text_area.Save( $('.text_area_transcription') );

	try {
		
		switch(page_globals.modo) {
			case 'tool_transcription':			
				// Get current text area wraper tipo and parent and update opener wrapper component
				var wrapper_transcriptions 	= $('.css_wrap_text_area').first();
				if ($(wrapper_transcriptions).length==1) {
					var tipo 	= $(wrapper_transcriptions).data('tipo'),
						parent 	= $(wrapper_transcriptions).data('parent');
					var wrapper 	= window.opener.$('.css_wrap_text_area[data-tipo='+tipo+'][data-parent='+parent+']');
					if ($(wrapper).length!=1) {
						return alert("Error on update component.  Text area id_wrapper not exist in top DOM");
					}
					var id_wrapper 	= $(wrapper).attr('id');
					console.log("tipo:"+tipo+ " ,parent:"+parent+" id_wrapper:"+id_wrapper+" del esperado: wrapper__dd343_15_lg-spa_edit_source_lang__2")
					window.opener.component_common.load_component_by_wrapper_id(id_wrapper); 
				}else{
					alert("Error on update text area component. Text area id_wrapper not exist in current DOM : "+id_wrapper)
				}
				break;
		}

	}catch(e) {
		console.log("Error: "+e)
	}	
});
*/

window.onload = function(event) {
	fix_height_of_texteditor()
	tool_transcription.select_tag_in_editor()
};

window.onresize = function(event) {
    fix_height_of_texteditor() 
};



// TOOL transcription CLASS
var tool_transcription = new function() {

	// LOCAL VARS
	this.trigger_tool_transcription_url = DEDALO_LIB_BASE_URL + '/tools/tool_transcription/trigger.tool_transcription.php' ;


	// RESIZE WINDOW
	this.resize_window = function() {

		if(window.self !== window.top) return alert("Please exec in top window");

		var selector= $('#html_page_wrap'),
			wo 		= 0,
			ho 		= 70;
		
		setTimeout ( function () {
	        var contentWidth  = $(selector).outerWidth(true) + wo;	//alert(contentWidth)
		   	var contentHeight = $(selector).outerHeight(true)+ ho;	

			//alert( $('#html_page_wrap').outerWidth(true) +" - " +$('#html_page_wrap').outerHeight(true) )

		   	window.moveTo(0,0);
			window.resizeTo(contentWidth,contentHeight);		
	    }, 2000);	   
	}	


	this.update_opener_component = function() {
	
		// Get current text area wraper tipo and parent and update opener wrapper component
		var wrapper_transcriptions 	= $('.css_wrap_text_area').first();
		if ($(wrapper_transcriptions).length==1) {
			var tipo 			= $(wrapper_transcriptions).data('tipo'),
				parent 			= $(wrapper_transcriptions).data('parent');
				section_tipo	= $(wrapper_transcriptions).data('section_tipo');
			var wrapper 	= window.opener.$('.css_wrap_text_area[data-tipo='+tipo+'][data-parent='+parent+']data-section_tipo='+section_tipo+']');
			if ($(wrapper).length!=1) {
				return alert("Error on update component.  Text area id_wrapper not exist in top DOM");
			}
			var id_wrapper 	= $(wrapper).attr('id');
			//console.log("tipo:"+tipo+ " ,parent:"+parent+" id_wrapper:"+id_wrapper+" del esperado: wrapper__dd343_15_lg-spa_edit_source_lang__2")
			window.opener.component_common.load_component_by_wrapper_id(id_wrapper); 
		}else{
			if (DEBUG) {
				alert("Error on update text area component. Text area id_wrapper not exist in current DOM : "+id_wrapper)
			};			
		}
	}


	/**
	* CHANGE_TEXT_EDITOR_LANG
	* On change, reload current component_text_area with received lang
	* Note: this function don't change application lang, only current used editor (component_text_area)
	* Note2 : this function uses 'trigger.tool_lang.php' to load the component
	* @see tool_lang::load_target_component
	*/
	this.change_text_editor_lang = function(select_obj) {
		
		//if (!confirm("Sure?")) return false;		
		
		if( !$(select_obj).val() ) {
			return false;
		}

		var tipo 		 = $(select_obj).data('tipo'),
			parent 		 = $(select_obj).data('parent'),
			section_tipo = $(select_obj).data('section_tipo'),
			lang 		 = $(select_obj).val();

		var wrap_div 	= $('.css_wrap_text_area').first();

		html_page.loading_content( wrap_div, 1 );
			
		var mode 		= 'load_target_component';
		var mydata		= { 'mode': mode,
							'tipo': tipo,
							'parent': parent,
							'section_tipo': page_globals.section_tipo,
							'lang': lang,
							'top_tipo':page_globals.top_tipo
						}
						//return console.log(mydata)

		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/tools/tool_lang/trigger.tool_lang.php',
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			$(wrap_div).html(received_data)			
			fix_height_of_texteditor();
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			inspector.show_log_msg(" <span class='error'>ERROR: on change_text_editor_lang load_target_component !</span> ");
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrap_div, 0 );
		});

	}//end change_text_editor_lang



	/**
	* PDF AUTOMÁTIC TRANSCRIPTION
	* @param DOM object 'button_obj'
	*/
	this.pdf_automatic_transcription = function(button_obj) {		

		var source_tipo  = button_obj.getAttribute("data-source_tipo"),
			target_tipo  = button_obj.getAttribute("data-target_tipo"),
			section_id 	 = button_obj.getAttribute("data-section_id"),
			section_tipo = button_obj.getAttribute("data-section_tipo")
			//return console.log(section_tipo)

		// Locate target component wrap on page for reload on finish
		var target_component_wrap = $('.wrap_component[data-parent='+page_globals._parent+'][data-tipo='+target_tipo+'][data-lang='+page_globals.dedalo_data_lang+']');
		if ( $(target_component_wrap).length<1) {
			return alert("Error on pdf_automatic_transcription: target_component_wrap not found.");
		}
		var target_wrapper_id = $(target_component_wrap).attr('id');

		// Spinner on
		var wrap_div = $(button_obj); html_page.loading_content( wrap_div, 1 );

		var mydata = {
				"mode" 		  : "pdf_automatic_transcription",
				"source_tipo" : source_tipo,
				"target_tipo" : target_tipo,
				"section_tipo" : section_tipo,
				"section_id"   : section_id
			}
			//return console.log(mydata)


		// AJAX REQUEST
		$.ajax({
			url			: this.trigger_tool_transcription_url,
			data		: mydata,
			type		: 'POST'
		})
		// DONE
		.done(function(received_data) {
			if (DEBUG) {
				console.log(received_data);
			}
			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// Error show
				alert(received_data)
			}else{
				// Refresh text area component
				component_common.load_component_by_wrapper_id(target_wrapper_id, null, fix_height_of_texteditor)
				//setTimeout(function(){
				//	fix_height_of_texteditor()
				//}, 100)
			}								
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			inspector.show_log_msg(" <span class='error'>Error: on change_text_editor_lang load_target_component !</span> "+error_data);
		})
		// ALWAYS
		.always(function() {
			// Spinner off
			html_page.loading_content( wrap_div, 0 );
		});

	}//end pdf_automatic_transcription




	/**
	* SELECT_TAG_IN_EDITOR
	* Select first tag (index in) image in text editor and scroll to he 
	*/
	this.select_tag_in_editor = function() {
		
		try {
			if(tinyMCE.activeEditor) {
				// Select request tag
				var tagname = '[id$=-'+page_globals.tag_id+'\\]]'
				var ed = tinyMCE.activeEditor
					ed.selection.select(ed.dom.select(tagname)[0]).scrollIntoView(true); //select the inserted element
	    	}
    	}catch(e) {
			//console.log("Error: "+e)
		}
	}//end select_tag_in_editor



};
//end tool_transcription


// Automatically change the height of the editor based on window resize
function fix_height_of_texteditor() {

	if (page_globals.modo!='tool_transcription') {
		return false;
	};

	$(document).ready(function() {
		
	    if (tinyMCE==undefined || !tinyMCE || typeof tinyMCE===undefined) return;

	    try {

			var w = $('.tool_transcription_left').width();	
		    var h = $('.tool_transcription_left').height();
		    //console.log(w+"+"+h)
		    tinyMCE.activeEditor.theme.resizeTo(
		        null,
		        h -66
		    );

		    // PDF VIEWER IF EXISTS
			var pdf_iframe = $('.pdf_viewer_frame')
			if ( $(pdf_iframe).length === 1 ) {
		   		$(pdf_iframe).height( h -33 )
			}

			// GEOLOCATION VIEWER IF EXISTS
			var geolocation_iframe = $('.leaflet-container')
			if ( $(geolocation_iframe).length === 1 ) {
		   		$(geolocation_iframe).height( h +6 )
			}

		}catch(e) {
			console.log("Error: "+e)
		}
    })

}//end fix_height_of_texteditor




