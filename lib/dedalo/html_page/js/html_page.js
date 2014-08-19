// JavaScript Document

// ON READY
$(document).ready(function() {

	// Default JQUERY speed for fx
	$.fx.speeds._default = 300;

	// PAGE SPINNER OVERLAY : SHOW SPINNER OVERLAY UNTIL ALL PAGE IS LOADED
	html_page.show_page_spinner_overlay();
	
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

		// DEBUG INFO SPAN's : KEYBOARD TOGGLE DEBUG INFO SPAN's
		// $('.debug_info').hide(0);	
		$("body").keydown(function(e){
			//console.log(e.keyCode);	    
		    // CONTROL + D (ctrlKey+68) SHOW/HIDE INSPECTOR
		    if (e.ctrlKey==1 && e.keyCode==68) { // d=68	 
		        // do something
		        $('.debug_info').slideToggle('100');	        
		    }
		    // CONTROL + I (ctrlKey+73) SHOW/HIDE INSPECTOR
		    if (e.ctrlKey==1 && e.keyCode==73) { // i=73	 
		    	inspector.toggle_sidebar()
		    }

		     // CONTROL + D (ctrlKey+68) INIT GRIDSTER
		    if (e.ctrlKey==1 && e.keyCode==68) { // d=68	
		    $(function(){ //DOM Ready 	
			    $(".gridster ul").gridster({
			        widget_margins: [10, 10],
			        widget_base_dimensions: [100, 35],
			        min_cols:12,
			        min_rows:12,
			        resize: {
			            enabled: true
			          }
			    });
				/*
			    $( ".wrap_component" )
			    .draggable({
			    	//containment: "parent",
			    	grid: [ 80, 80 ]
			    })
			    .resizable({
			    	//containment:'.css_section_group_content'
			    	//containment: "parent"
			    });
			 	*/
			});
			}

		});//$("body").keydown(function(e){
	

	
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

	}//en if debug
	
	
	// DIALOG GENERAL PREFS	
	$("#dialog_page_iframe").dialog({
		title: 'Page dialog',
		modal: true,
		autoOpen: false,
		closeOnEscape: true,
		width:  html_page.dialog_width_default,
		height: html_page.dialog_height_default,
		//position: [10,20]
	});
	
	// INSPECTOR : HIDE INSPECTOR WHEN CALLER ID (MODE RELATION)
	if (page_globals.caller_id > 0) {	//if (typeof callback === "undefined")
		$('html').addClass("body_relation_mode");
		// Hides sidebar inspector
		$("#sidebar").hide();
		// Resize content div to full width page
		$('.css_section_content').css('width','99.5%');		
	}
	
	// TAPS : INITIAL ITERATION TO SHOW / HIDE TAPS
	html_page.taps_state_update();
	
	// TAPS : LIVE EVENT CLICK TO SHOW / HIDE TAPS
	$(document.body).on("click", $('.tap_title').selector, function(){
		
		var tap_id = $(this).data('tap_id');
		if(tap_id != null) {			
			var tap_value	= get_localStorage(tap_id);		//alert(tap_id + ' ' +tap_value)		
			
			// SET TAP 
			if(tap_value == 1) {
				remove_localStorage(tap_id);
			}else{
				set_localStorage(tap_id, 1);
			}
		}		
		// TOOGLE DIV
		$(this).next('.tap_content').toggle(100);		
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
	.ajaxError(function( event, jqxhr, settings, exception ) {		
	  	// ERROR : Notify ajax call failed
		if(jqxhr.readyState != 4) {
			if(DEBUG) {
				console.log(exception)
				console.log(settings)
				alert("Error on ajax call. url:"+settings.url)
			}else{
				alert("Error on ajax call.")
			}
		}
	});
	
	

	

	// MODO SWITCH
	switch(page_globals.modo) {		
		case 'tool_time_machine' :
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
});

// ON LOAD
$(window).load(function(){

	// MODO SWITCH
	switch(page_globals.modo) {	
		case 'list' : 
			break;
		default :
			// SPINNER OVERLAY : Remove div #html_page_spinner_overlay if exists
			$('#html_page_spinner_overlay').remove();
			
			// PAGE WRAP : html_page WRAP fadeIn after images are loaded . When finish, show Debugger whith delay 
			$('#html_page_wrap').fadeIn(190, function(){
				// Debuger fadeIn
				$('.html_page_debugger_wrap').delay(1000).fadeIn(300);		
			});
			break;
	}
	

});

// BEFORE UNLOAD
$(window).bind('beforeunload', function(event){	

	// Save current selected component before exit page (Forcing component blur)
	try{
		//event.stopImmediatePropagation();
  		//event.preventDefault();
		document.activeElement.blur();		

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
			$('.tap_title').each(function() {
				
				var tap_id = $(this).data('tap_id');	
				if( typeof tap_id != 'undefined' && tap_id != null) {
					var tap_value	= get_localStorage(tap_id);		
					
					// TOOGLE DIV IF EXISTS COOKIE
					if(tap_value == 1) {
						//$(this).parent().find('.tap_content').toggle(0);
						//$(this).next('.tap_content').toggle(0);
						$(this).next('.tap_content').hide(0);
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
	this.loading_content = function (target_obj, mode) {
		
		if( $(target_obj).length<1) {
			if (DEBUG) console.log("loading_content: Not found in mode:" +mode)
			if (DEBUG) console.log(target_obj);	alert("loading_content target_obj <1")
			alert("Error on loading_content 0")
			return false;
		}
		if( $(target_obj).length>1) {
			if (DEBUG) console.log("loading_content: Too much targets in mode:" +mode)
			if (DEBUG) console.log(target_obj); alert("loading_content target_obj >1")
			alert("Error on loading_content >1. target_obj length:"+$(target_obj).length)
			return false;
		}

		if (mode==1) {

			$('html').css('cursor','progress');

			// mode 1 . Add spinner overlay			
			var position 	= $(target_obj).offset(),
				width 		= $(target_obj).outerWidth(),
				height 		= $(target_obj).outerHeight();

			// Create a new div 'loading_content_overlay' and append html to current target_obj
			jQuery('<div class="loading_content_overlay"> </div>').css( {'position':'fixed', 'left':position.left, 'top':position.top, 'width': width, 'height': height} ).appendTo(target_obj);
			//if (DEBUG) console.log("->loading_content:"+mode + " w:"+width + " h:"+height + " id:"+target_obj.attr('id'))	
			
		}else{

			$('html').css('cursor','default');

			$(target_obj).find(".loading_content_overlay").first().remove()
			/*
			// mode 0 . Remove spinner overlay
			$(target_obj).find(".loading_content_overlay").fadeOut(1350, function(){
				//$(this).delay(200).remove(); //.css('cursor','pointer')
				$('html').css('cursor','default');
			});
			//if (DEBUG) console.log("->loading_content:"+mode + " removed:.loading_content_overlay")
			*/	
		}
		
	}//end loading_content

	


};//end html_page class


