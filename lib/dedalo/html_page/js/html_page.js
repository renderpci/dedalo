"use strict";
/**
* HTML_PAGE  CLASS
*
*
*/
var html_page = new function() {

	// Global vars
	// ON DIALOG WINDOW 
	this.dialog_width_default  = window.innerWidth  - 50
	this.dialog_height_default = window.innerHeight - 50
	// ON DIALOG WINDOW . If caller_id exists we are in dialog window
	this.on_dialog_window = 0
	if (page_globals.caller_id > 0) {
		this.on_dialog_window = 1
	}



	// WINDOW ON READY
	$(function() {

		// Default JQUERY speed for fx
		$.fx.speeds._default = 300

		// PAGE SPINNER OVERLAY : SHOW SPINNER OVERLAY UNTIL ALL PAGE IS LOADED
		//html_page.show_page_spinner_overlay();

		if(SHOW_DEBUG===true) {
			// DEBUG INFO : SHOW AND HIDE DEBUG INFO AT BOTTOM PAGE
			const button_debugger_label_obj = $('.html_page_debugger_label');
			$(document.body).on('click', button_debugger_label_obj.selector, function(e){
				$(this).parent().find('.html_page_debugger_content').toggle(200)
			});

			// DEBUG SPECIFIC INFO : SHOW AND HIDE DEBUG SPECIFIC INFO
			const button_page_title_obj = $('.css_debug_html_page_title');
			$(document.body).on('click', button_page_title_obj.selector, function(e){
				$(this).parent().find('.css_debug_html_page_content').toggle(200)				
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

			/*
			// AJAX RESPONSES
			$(document)
			.ajaxSuccess(function( event, xhr, settings ) {
				// TAPS : Update SHOW / HIDE TAPS
				// Cada vez que se efectúe una transacción ajax, actualizaremos los taps (principalmente usado para preservar el estado 
				// de los taps en los registros de los portales al desplegarlos desde la ficha principal)
				//html_page.taps_state_update();
			})
			.ajaxError(function( event, jqxhr, settings, thrownError ) {
			  	// ERROR : Notify ajax call failed
				if(jqxhr.readyState !== 4) {
					//console.log(settings)
					//console.log(thrownError)
					var msg = "->ajaxError Error on ajax call. url:"+settings.url;
					console.log(msg);
					//alert("Error on ajax call. " +msg)
					//alert("Error on ajax call.")
				}
			})*/
		}//en if debug
	

		// DIALOG GENERAL PREFS
		// Needed for tool_av_version, posterframe, etc.. to show modal window
		$("#dialog_page_iframe").dialog({
			title: 'Page dialog',
			modal: true,
			autoOpen: false,
			closeOnEscape: true,
			width:  html_page.dialog_width_default,
			height: html_page.dialog_height_default,
			draggable: false
			//position: [10,20]
		});



		// TAPS : INITIAL ITERATION TO SHOW / HIDE TAPS
		html_page.taps_state_update()
		
		// TAPS : LIVE EVENT CLICK TO SHOW / HIDE TAPS
		const button_tab_title_obj = $('.tab_title');
		$(document.body).on('click', button_tab_title_obj.selector, function(e){

			const tab_id = $(this).data('tab_id')
			if(tab_id !== null) {
				const tab_value = get_localStorage(tab_id)
				
				// SET TAP
				if(tab_value === '1') {
					remove_localStorage(tab_id)
				}else{
					set_localStorage(tab_id, 1)
				}
			}
			// TOOGLE DIV
			$(this).next('.tab_content').fadeToggle('fast')
		});


		// PRE : LIVE EVENT CLICK TO SHOW / HIDE TAPS
		$(document.body).on("dblclick", $('pre').selector, function(){
			$(this).fadeOut(200);
		});


		// MODO SWITCH
		switch(page_globals.modo) {
			case 'tool_time_machine' :
			case 'tool_portal' :
						// Show html_page_wrap
						document.getElementById('html_page_wrap').style.display = 'table'
						break
			case 'edit' :
						//$('#load_time_table').appendTo( "#load_time_inspector" );
						break
			case 'list' :
						document.getElementById('html_page_wrap').style.display = 'table'
						//$('#html_page_spinner_overlay').remove()
						break
			default :
						let html_page_wrap = document.getElementById('html_page_wrap')
						if (html_page_wrap) {
							html_page_wrap.style.display = 'table'
						}					
		}
		// CONTEXT_NAME SWITCH
		switch(page_globals.context_name) {
			case 'list_into_tool_portal':
				// INSPECTOR : HIDE INSPECTOR
				//$('html').addClass("body_relation_mode")
				// Hides sidebar inspector
				let side_bar = document.getElementById('sidebar')
				if(side_bar) side_bar.style.display = 'none'
				// Resize content div to full width page				
				let section_content = document.querySelector('.css_section_content')
				if(section_content) section_content.style.width = '99.5%'
				break
		}
		

		// ACTIVATE_TOOL_TIPS
		// Note: Bootstrap catch jquery default tooltip !
		html_page.activate_tool_tips()
			

		// Remove div #html_page_spinner_overlay if exists
		//$('#html_page_spinner_overlay').remove();
	});//end $(document).ready(function()



	// WINDOW FOCUS
	window.addEventListener('focus', function(e) {
		// Refresh components added in array : page_globals.components_to_refresh
		html_page.refresh_components()
	}, false);

	

	// WINDOW LOAD
	window.addEventListener('load', function(e) {
		// MODO SWITCH
		switch(page_globals.modo) {
			case 'list' :
				break

			default :
				// SPINNER OVERLAY : Remove div #html_page_spinner_overlay if exists
				//$('#html_page_spinner_overlay').remove()
				const spinner = document.getElementById('html_page_spinner_overlay')
				if (spinner) spinner.parentNode.removeChild(spinner)

				// PAGE WRAP : html_page WRAP fadeIn after images are loaded . When finish, show Debugger whith delay 
				/*
				$('#html_page_wrap').fadeIn(200, function(){
					// Debuger fadeIn
					$('.html_page_debugger_wrap').delay(1000).fadeIn(300);
				});
				*/
				// Default style display is none
				//$('#html_page_wrap').css("display", "table")
				const el = document.getElementById('html_page_wrap')
				if(el) el.style.display = 'table'
				break
		}
		/*
		setTimeout(function(){
			document.location.reload(true);
		}, 4000)
		*/
		//if(SHOW_DEBUG===true) {
		//	console.log("track_loaded_models:",component_common.track_loaded_models);
		//}
		
	}, false);



	// WINDOW BEFORE UNLOAD
	window.addEventListener("beforeunload", function(e) {
	 	//e.preventDefault();
	 	//console.log(document.activeElement.nodeName);
	 	
	 	if (page_globals.modo==='edit') {

	 		if (SHOW_DEBUG===true) {
				console.log("->beforeunload fired (html_page) activeElement nodeName: "+ document.activeElement.nodeName+" id: "+document.activeElement.id);
			}	
			
			if (document.activeElement.nodeName!=='BODY') {

				//console.log(document.activeElement)
				// Save current selected component before exit page (Forcing component blur)
				try{

					//component_common.save_async = false	// Force save async false	

					// ALWAYS BLUR ACTIVE COMPONENT TO FORCE SAVE
					document.activeElement.blur(); // Blur component trigger save when is selected	

				}catch(err){ 
					if (SHOW_DEBUG===true) console.log("Error on beforeunload:" + err)
				};
			}

			// DELETE_USER_SECTION_EVENTS
			if (typeof lock_components!=="undefined" && lock_components) {
				lock_components.delete_user_section_locks({skip_reset_wraps:false});
			}			

	 	}	 	
	}, false);



	/**
	* TAPS STATE UPDATE
	*/
	this.taps_state_update = function() {
		
		$(function() {
						
			// ITERATION TO SHOW / HIDE TAPS
			$('.tab_title').each(function() {
				
				const tab_id = this.dataset.tab_id || null
				if(typeof tab_id !== 'undefined' && tab_id !== null) {
					const tab_value	= get_localStorage(tab_id)

					// TOOGLE DIV IF EXISTS COOKIE
					if(tab_value === '1') {
						//$(this).parent().find('.tab_content').toggle(0);
						//$(this).next('.tab_content').toggle(0);
						//$(this).next('.tab_content').hide(0)
						this.nextElementSibling.style.display = 'none'
					}
				}
			});

		});//end ready
	};//end taps_state_update



	/**
	* SHOW_PAGE_SPINNER_OVERLAY 
	*/
	this.show_page_spinner_overlay = function() {
		
		// Not for Safari
		if(navigator.userAgent.indexOf('Safari') === -1) return false;
		
		// Add spinner overlay
		$('body').prepend('<div id="html_page_spinner_overlay"><span>Loading...</span></div>')

		return true
	};//end show_page_spinner_overlay



	/**
	* LOADING CONTENT : SHOW SEMITRANSPARENT OVERLAY 
	*/
	this.loading_content_active = 0;
	this.loading_content = function (target_obj, mode) {
		
		if (target_obj instanceof jQuery ) {
			target_obj = target_obj[0];	// object jquery case
		}else if (typeof target_obj === 'string' || target_obj instanceof String) {
			target_obj = document.getElementById(target_obj)
		}

		try {
			// Target object not found case
			if( typeof target_obj==='undefined' || !target_obj || target_obj.length===0  ) {
				this.loading_content_active = 0
				return false
			}
			// || target_obj.indexOf('#')!=-1

			if (mode === 1) {

				// If is already activated, don't do anything
				if (this.loading_content_active > 0) {
					return false
				}

				this.loading_content_active = 1
				target_obj.style.cursor 	= 'progress'
				target_obj.style.opacity 	= 0.4
				
			}else{

				this.loading_content_active = 0
				target_obj.style.cursor  	= 'default'
				target_obj.style.opacity 	= 1
			}

		} catch(e) {
			// statements
			if (SHOW_DEBUG===true) {console.log(e);}

			if (target_obj) {
				target_obj.style.cursor = 'default'
			}	
		}
		
		return false		
	};//end loading_content



	/**
	* REFRESH_COMPONENTS
	* Components to refresh are wrapper_id strings included in array (page_globals.components_to_refresh)
	* Page have a window focus event that trigger this method on every window focus (that occurs when tool window is closed too)
	*/
	this.refresh_components = function() {

		// If var is empty, nothing to do
		if (!page_globals.components_to_refresh || page_globals.components_to_refresh.length<1) {
			if(SHOW_DEBUG===true) {
				//console.log("[html_page.refresh_components] Not necessary refresh any component", page_globals.components_to_refresh);
			}			
			return false
		}

		if(SHOW_DEBUG===true) {
			///const components_to_refresh_original = cloneDeep(page_globals.components_to_refresh)
			//console.log(page_globals.components_to_refresh);
			//console.log('[html_page.refresh_components]+++++ page_globals.components_to_refresh: ',page_globals.components_to_refresh)			
		}
		
		const len = page_globals.components_to_refresh.length
		for (let i = len - 1; i >= 0; i--) {
			
			// Every element of array is a string contains component wrapper id			

			// Reload component by wrapper_id
			component_common.load_component_by_wrapper_id( page_globals.components_to_refresh[i] );
				
			// Remove current reloaded component
			//page_globals.components_to_refresh.splice(i, 1);
		}

		// Reset
		page_globals.components_to_refresh = []

		if(SHOW_DEBUG===true) {
			//console.log("[html_page.refresh_components] Refreshed components: ", components_to_refresh_original);
		}	

		// Remove window focus listener on finish
		//window.removeEventListener("focus", tool_common.refresh_components, false);
	};//end refresh_components



	/**
	* ADD_COMPONENT_TO_REFRESH
	* Add component wrapper id to global page array
	*/
	this.add_component_to_refresh = function( wrapper_id ) {

		// Add to page global array
		page_globals.components_to_refresh.push( wrapper_id )
	};//end add_component_to_refresh



	/**
	* DEBUG_INFO_TOGGLE
	* @return 
	*/
	this.debug_info_toggle = function() {
		//$('.debug_info').toggle(); return
		
		const ar_elements = document.querySelectorAll('.debug_info')
		const len = ar_elements.length
		for (let i = len - 1; i >= 0; i--) {
			let element = ar_elements[i]
			if (element.style.display==='block') {
				element.style.display = ''
			}else{
				element.style.display = 'block';
			}
		}		
	};//end debug_info_toggle



	/**
	* CLOSE_CONTENT
	* Clean html content from a warning div or similar
	*/
	this.close_content = function(object) {
		
		const wrap = object.parentNode;
		if (wrap) {
			while (wrap.firstChild) {
				wrap.removeChild(wrap.firstChild);
			}
		}		

		return true
	};//end close_content



	/**
	* ACTIVATE_TOOL_TIPS
	* JQUERY tooltips are catched by bootstrap. Use BOOSTRAP options ONLY
	* @return bool
	* @see https://v4-alpha.getbootstrap.com/components/tooltips/#example-enable-tooltips-everywhere
	*/
	this.activate_tool_tips = function(options) {

		if (!options) {
			// Defaults
			options = {
				placement 	: "bottom", // top | bottom | left | right		    	
				html  		: true,
				container 	: 'body',
				delay 		: { "show": 700, "hide": 50 },
				selector 	: ".tooltip_active"
			}
		}
		
		//$(".tooltip_active").tooltip(options);
		$("body").tooltip(options);

	    return true
	};//end activate_tool_tips



};//end html_page class