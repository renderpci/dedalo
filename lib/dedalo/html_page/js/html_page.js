// JavaScript Document
document.write('<scr'+'ipt src="'+DEDALO_LIB_BASE_URL+'/html_page/js/keyboard_shortcuts.js" type="text/javascript"></scr'+'ipt>');


// ON READY
$(document).ready(function() {

	// Default JQUERY speed for fx
	$.fx.speeds._default = 300;

	// PAGE SPINNER OVERLAY : SHOW SPINNER OVERLAY UNTIL ALL PAGE IS LOADED
	//html_page.show_page_spinner_overlay();
	
	if(DEBUG) {

		// DEBUG INFO : SHOW AND HIDE DEBUG INFO AT BOTTOM PAGE
		$('.html_page_debugger_label').bind("click", function(event) {			
			$(this).parent().find('.html_page_debugger_content').toggle(200);		
		});

		// DEBUG SPECIFIC INFO : SHOW AND HIDE DEBUG SPECIFIC INFO
		$('.css_debug_html_page_title').each(function() {		
			$(this).bind("click", function(event) {			
				$(this).parent().find('.css_debug_html_page_content').toggle(200);			
			});		
		});		
		/* 
		// LOG MESSAGES : HIDE LOG INFO AND LOG ERROR MESSAGES ON TOP PAGE WHEN CLICK OVER
		$(document.body).on("dblclick", '#log_messages, .span_save', function(event){			
			$(this).fadeOut(250, function(){ 
				//$(this).empty().fadeIn(0)
				$('#log_messages_checkbox').prop('checked',false)
				remove_localStorage('log_messages_checkbox')
			});
		});
		// LOG MESSAGES CHECKBOX
		// Default is hided
		$('#log_messages').hide(0);
		// On click toggle log_messages display
		$('#log_messages_checkbox').on("click", function(){		
			
			// Toggle display
			if( $('#log_messages').css('display')=='block' ) {
				$('#log_messages').fadeOut(250);
			}else{
				$('#log_messages').fadeIn(250);
			}

			// Cookie checkbox state change store
			if( $('#log_messages_checkbox').prop('checked')===true ) {
				 set_localStorage('log_messages_checkbox',1)
			}else{
				remove_localStorage('log_messages_checkbox')
			}		
		});
		// Checkbox uodate with cookie value
		if(get_localStorage('log_messages_checkbox')==1) {
			$('#log_messages_checkbox').prop('checked',true);
			$('#log_messages').fadeIn(250);
		}
		*/
	}//en if debug
	
	
	// DIALOG GENERAL PREFS	
	$("#dialog_page_iframe").dialog({
		title: 'Page dialog',
		modal: true,
		autoOpen: false,
		closeOnEscape: true,
		width:  html_page.dialog_width_default,
		height: html_page.dialog_height_default,
		draggable: false,
		//position: [10,20]
	});
	
	
	
	// TAPS : INITIAL ITERATION TO SHOW / HIDE TAPS
	html_page.taps_state_update();
	
	// TAPS : LIVE EVENT CLICK TO SHOW / HIDE TAPS
	$(document.body).on("click", $('.tab_title').selector, function(){
		
		var tab_id = $(this).data('tab_id');
		if(tab_id != null) {			
			var tab_value	= get_localStorage(tab_id);		//alert(tab_id + ' ' +tab_value)		
			
			// SET TAP 
			if(tab_value == 1) {
				remove_localStorage(tab_id);
			}else{
				set_localStorage(tab_id, 1);
			}
		}
		// TOOGLE DIV
		$(this).next('.tab_content').toggle(100);
	});


	// TAPS : LIVE EVENT CLICK TO SHOW / HIDE TAPS
	$(document.body).on("dblclick", $('pre').selector, function(){		
		$(this).fadeOut(200);
	});


	// AJAX RESPONSES
	$(document)
	.ajaxSuccess(function( event, xhr, settings ) {
		/*
		// DEBUG : Show ajax data to debug
		if(DEBUG) {
			//$( "#log_messages" ).append("<br>Triggered ajaxComplete handler. The result is " +  xhr.responseHTML );
			var data_formated = replaceAll('&','<br>',settings.data )
			//$( "#inspector_log" ).append("<hr>" + data_formated );
			$( "#log_messages" ).append("<hr>" + data_formated );
			console.log("-> Ajax: settings Obj:")
			console.log(settings)
		}
		*/
		// TAPS : Update SHOW / HIDE TAPS
		// Cada vez que se efectúe una transacción ajax, actualizaremos los taps (principalmente usado para preservar el estado 
		// de los taps en los registros de los portales al desplegarlos desde la ficha principal)
		html_page.taps_state_update();
	})
	.ajaxError(function( event, jqxhr, settings, thrownError ) {
	  	// ERROR : Notify ajax call failed
		if(jqxhr.readyState != 4) {
			if(DEBUG) {
				console.log(settings)
				console.log(thrownError)				
				var msg = "Error on ajax call. url:"+settings.url;
				console.log(msg);
				alert(msg)
			}else{
				alert("Error on ajax call.")
			}
		}
	});
	
	


	// MODO SWITCH
	switch(page_globals.modo) {		
		case 'tool_time_machine' :
		case 'tool_portal' :
					// Show html_page_wrap 
					$('#html_page_wrap').show(0);	
					break;
		case 'edit' :
					
					//$('#load_time_table').appendTo( "#load_time_inspector" );
					break;
		case 'list' :
					$('#html_page_spinner_overlay').remove();
					$('#html_page_wrap').show(0);
					break;
		default :
					$('#html_page_spinner_overlay').remove();
					$('#html_page_wrap').show(0);			
	}
	// CONTEXT_NAME SWITCH
	switch(page_globals.context_name) {
		case 'list_into_tool_portal':
			// INSPECTOR : HIDE INSPECTOR 				
			//$('html').addClass("body_relation_mode");
			// Hides sidebar inspector
			$("#sidebar").hide();
			// Resize content div to full width page
			$('.css_section_content').css('width','99.5%');
			break;
	}

	$('.close_window').click(function(event) {
		window.close();
	});

	/*
	$( document ).tooltip({
      position: {
        my: "left-40 bottom-5",
        at: "center top",
        using: function( position, feedback ) {
          $( this ).css( position );
          $( "<div>" )
            .addClass( "dd_tooltip" )
            .addClass( feedback.vertical )
            .addClass( feedback.horizontal )
            .appendTo( this );
        }
      }
    });
	*/

	// Remove div #html_page_spinner_overlay if exists
	//$('#html_page_spinner_overlay').remove();

});//end $(document).ready(function() 

// ON LOAD
// $(window).load(function(){
window.addEventListener("load", function (event) {

	// MODO SWITCH
	switch(page_globals.modo) {	
		case 'list' : 
			break;
		default :
		
			// SPINNER OVERLAY : Remove div #html_page_spinner_overlay if exists
			$('#html_page_spinner_overlay').remove();
			
			// PAGE WRAP : html_page WRAP fadeIn after images are loaded . When finish, show Debugger whith delay 
			$('#html_page_wrap').fadeIn(200, function(){
				// Debuger fadeIn
				$('.html_page_debugger_wrap').delay(1000).fadeIn(300);
			});
			break;
	}
	/*
	setTimeout(function(){
		document.location.reload(true);
	}, 4000)
	*/
});

// BEFORE UNLOAD
// SAVING_STATE

// $(window).bind('beforeunload', function(event){
window.addEventListener("beforeunload", function (event) {
 	//event.stopImmediatePropagation();
	//event.preventDefault();

	if (DEBUG) {
		console.log("-> beforeunload fired (html_page) nodeName: "+ document.activeElement.nodeName+" id: "+document.activeElement.id);
	}	

	//console.log(document.activeElement)
	// Save current selected component before exit page (Forcing component blur)
	try{

		component_common.save_async = false;	// Force save async false

		/*
		// GLOBAL MODO
		switch(page_globals.modo) {
			case 'tool_transcription':
				//console.log("Activating focus of tinymce");
				tinymce.activeEditor.focus();			// Force focus editor before apply blur active						
				break;
		}
		*/


		
		// ALWAYS BLUR ACTIVE COMPONENT TO FORCE SAVE
		document.activeElement.blur(); // Blur component trigger save when is selected
		
		// CONTEXT_NAME
		switch(page_globals.context_name) {
			case 'list_in_portal':
				// PORTAL COMPONENT RELOAD : Update source portal component in opener window, on close this window
				var wrapper = window.opener.$('.css_wrap_portal[data-tipo='+page_globals.portal_tipo+'][data-parent='+page_globals.portal_parent+']');
				if (wrapper.length==1) {
					var id_wrapper = wrapper.attr('id');
					window.opener.component_common.load_component_by_wrapper_id(id_wrapper); 
				}else{
					console.log("Error on update portal component. Portal id_wrapper not exist in DOM : "+id_wrapper)
				}
				break;			
		}
		
	}catch(err){ 
		if (DEBUG) console.log("Error on beforeunload:" + err) 
	};	

});






// ON DIALOG WINDOW . If caller_id exists we are in dialog window
var on_dialog_window = 0
if (page_globals.caller_id > 0) {
	on_dialog_window = 1
}




/**
* HTML_PAGE  CLASS
*/
var html_page = new function() {	

	// Global vars
	this.dialog_width_default  = window.innerWidth  -50;
	this.dialog_height_default = window.innerHeight -50;

	
	/**
	* TAPS STATE UPDATE
	*/
	this.taps_state_update = function() {
		
		$(function() {
						
			// ITERATION TO SHOW / HIDE TAPS
			$('.tab_title').each(function() {
				
				var tab_id = $(this).data('tab_id');	
				if( typeof tab_id != 'undefined' && tab_id != null) {
					var tab_value	= get_localStorage(tab_id);		
					
					// TOOGLE DIV IF EXISTS COOKIE
					if(tab_value == 1) {
						//$(this).parent().find('.tab_content').toggle(0);
						//$(this).next('.tab_content').toggle(0);
						$(this).next('.tab_content').hide(0);
					}
				}
			});

		});//end ready
	}//end taps_state_update



	/**
	* SHOW_PAGE_SPINNER_OVERLAY 
	*/
	this.show_page_spinner_overlay = function() {
		
		// Not for Safari
		if(navigator.userAgent.indexOf('Safari') == -1) return false;
		
		// Add spinner overlay
		$('body').prepend('<div id="html_page_spinner_overlay"><span>Loading...</span></div>');		
	}


	/**
	* LOADING CONTENT : SHOW SEMITRANSPARENT OVERLAY 
	*/
	this.loading_content_active = 0;
	this.loading_content = function (target_obj, mode) {		
		
		if (target_obj instanceof jQuery ) {
			target_obj = target_obj[0];	// object jquery case
		}else if (typeof target_obj === 'string' || target_obj instanceof String) {
			target_obj = document.getElementById(target_obj);
		}
		//if(target_obj[0]) {
		//	target_obj = target_obj[0];
		//}

		try {
			// Target object not found case
			if( typeof target_obj=='undefined' || !target_obj || target_obj.length==0  ) {
				this.loading_content_active = 0;
				return false;
			}
			// || target_obj.indexOf('#')!=-1			

			if (mode===1) {

				// Si ya se ha activado, no hacemos nada
				if (this.loading_content_active>0) {
					return false;
				}
				
				this.loading_content_active = 1
				target_obj.style.cursor = "progress"
				target_obj.style.opacity 	= 0.4;
				
			}else{

				this.loading_content_active = 0;
				target_obj.style.cursor  	= 'default';
				target_obj.style.opacity 	= 1;		
			}

		} catch(e) {
			// statements
			if (DEBUG) {console.log(e);};

			if (target_obj) {
				target_obj.style.cursor = 'default';	
			}				
		}
		
		return false;
		
	}//end loading_content

	


};//end html_page class


