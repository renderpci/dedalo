"use strict";
/**
* TOOL_TRANSCRIPTION CLASS
*
*
*/
var tool_transcription = new function() {


	// LOCAL VARS
	this.trigger_tool_transcription_url = DEDALO_LIB_BASE_URL + '/tools/tool_transcription/trigger.tool_transcription.php'
	this.text_area_obj	= null
	this.wrap_text_area = null



	/**
	* INIT
	* @return 
	*/
	this.inited = false
	this.init = function(data) {

		const self = this;

		// Set data vars
		self.textarea_lang = data.textarea_lang

		if (self.inited!==true) {

			// READY (EVENT)
			//$(function() {
			window.ready(function(){
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

						// Fix elements
						//tool_transcription.text_area_obj 	= $('.text_area_transcription').first()[0];
						//tool_transcription.wrap_text_area 	= $('.css_wrap_text_area').first()[0];
						tool_transcription.text_area_obj 	= document.querySelector(".text_area_transcription")
						tool_transcription.wrap_text_area 	= document.querySelector(".css_wrap_text_area")

						/*
						$(document).on( "click", 'body', function(e) {
							e.stopPropagation();
							// Reset selected components
							component_common.reset_all_selected_wraps(true);
						});
						*/
						if (page_globals.context_name==='component_av') {
							tool_transcription.set_av_add_ons();
							tool_transcription.set_tag_insert_key();
						}					
						break;
				}				
			});//end ready


			// LOAD (EVENT)			
			window.addEventListener("load", function (event) {
				//tool_transcription.fix_height_of_texteditor()
				tool_transcription.select_tag_in_editor()

				// DELETE_USER_SECTION_EVENTS
				try {
					// window opener sometimes is not in edit mode and not have loaded lock_components.js
					if(typeof lock_components!='undefined') {
						window.opener.lock_components.delete_user_section_locks()
					}
				}catch (e) {
					// statements to handle any exceptions
					console.log("->load event: no window.opener available. "+e);
					//console.log(e); // pass exception object to error handler
				}

				// Update lock_components state (FOCUS)
				if(typeof lock_components!='undefined') {
					lock_components.update_lock_components_state( tool_transcription.wrap_text_area, 'focus' );
				}

				// Updates subtitles track lang (useful when text area lang is forced)
				if (tool_transcription.text_area_obj.dataset.lang) {
					// console.log(tool_transcription.text_area_obj.dataset.lang);
					//tool_transcription.update_av_subtitle_track( tool_transcription.text_area_obj.dataset.lang )
				}

				//tool_transcription.verify_tc_tags(tinyMCE.activeEditor)
			}, false)//end load

			
			// BEFOREUNLOAD (EVENT)
			window.addEventListener("beforeunload", function (event) {
				//console.log("-> triggered beforeunload event (tool_transcription)");
				event.preventDefault();

				if (tinymce.activeEditor.isDirty()) {

					// SAVE ON EXIT
					tool_transcription.save_on_exit();
					
					var confirmationMessage = "Leaving tool transcription page.. ";
					event.returnValue  	= confirmationMessage;	// Gecko, Trident, Chrome 34+
					return confirmationMessage;					// Gecko, WebKit, Chrome <34
				}
			}, false)//end beforeunload


			// UNLOAD (EVENT)			
			window.addEventListener("unload", function (event) {
				//console.log("-> triggered unload event (tool_transcription) saving_state: "+component_common.saving_state);
				event.preventDefault();

				// SAVE ON EXIT
				//tool_transcription.save_on_exit();

				// UPDATE PARENT WINDOW COMPONENT TEXT AREA ON CLOSE WINDOW
				// Note component_related_obj_tipo is defined globally	
				tool_transcription.update_related_component( component_related_obj_tipo );

				// Update lock_components state (BLUR)
				if(typeof lock_components!=="undefined") {
					lock_components.update_lock_components_state( tool_transcription.wrap_text_area, 'blur' );
				}
			}, false)//end unload


			// RESIZE (EVENT)		
			window.addEventListener("resize", function (event) {
				tool_transcription.fix_height_of_texteditor();
			}, false)//end resize
			

			// VISIBILITYCHANGE (EVENT)
			window.addEventListener("visibilitychange", function (event) {
				if (document.hidden===true) return false;

				const locator = {
					section_tipo 	: page_globals.section_tipo,
					section_id 		: page_globals._parent,
					component_tipo 	: component_related_obj_tipo,
					lang 			: self.textarea_lang
				}
				if(SHOW_DEBUG===true) {
					console.warn("[tool_transcription.visibilitychange_action] locator:", locator)
				}				
				tool_common.update_tracking_status(event,{locator:locator})
			}, false)//end resize


			// GRID_IMAGE_CLICK_EVENT (lanunched from component_autocomplete_hi)
			window.addEventListener('grid_image_click_event', function(e){
				console.log("grid_image_click_event e:",e);
			}, false)//end grid_image_click_event

		}//end if (this.inited!==true)		

		self.inited = true

		return true
	}//end init



	/**
	* VERIFY_TC_TAGS
	* Test if tc tags order is correct. If not, change wrong tag style to mark it 
	*/
	this.verify_tc_tags = function(ed) {
		
		let tcs = ed.dom.select('img.tc')
			//console.log(tcs);

		var len   = tcs.length
		var ar_ms = []
		for (var i = 0; i < len; i++) {
			var value = tcs[i].dataset.data
			var ms 	  = this.get_tg_absolute_value(value)
				//console.log(value); console.log(ms);
			// Add resolved values to ar_ms
			ar_ms.push(ms)			
		}

		//var len = ar_ms.length
		for (var i = 0; i < len; i++) {		
			if ( ar_ms[i] <= ar_ms[i-1] && (ar_ms[i-1] > ar_ms[i-2] && ar_ms[i+1] < ar_ms[i+2])  ) {
				tcs[i].classList.add('tc_wrong')
			}else if(ar_ms[i] <= ar_ms[i-1]) {
				tcs[i].classList.add('tc_wrong')
			}
		}
	};//end verify_tc_tags



	/**
	* GET_TG_ABSOLUTE_VALUE
	* Calculate total time in miliseconds from tc like 00:05:02.241
	* @return int miliseconds
	*/
	this.get_tg_absolute_value = function(value) {

		var tc  = value.split('.')
		var hms = tc[0]
		//var hms = '02:04:33';   // your input string
		var a = hms.split(':'); // split it at the colons

		// minutes are worth 60 seconds. Hours are worth 60 minutes.
		var seconds = (+a[0]) * 60 * 60 + (+a[1]) * 60 + (+a[2]);

		var miliseconds = seconds * 1000

		if (tc[1]) {
			miliseconds = miliseconds + parseInt(tc[1])
		}

		return miliseconds;
	};//end get_tg_absolute_value
	


	/**
	* RESIZE WINDOW
	*/
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
	};//end resize_window



	/**
	* UPDATE_RELATED_COMPONENT
	*/
	this.update_related_component = function(component_related_obj_tipo) {

		if(!window.opener) return false;

		// Test if caller is in edit mode or list
		let record_wrap = null		
		try {
			record_wrap = window.opener.document.getElementById('current_record_wrap')
		}catch(e) {
			window.opener.console.log("[tool_transcriptions.update_related_component] Error:", e)
		}
				
		if (record_wrap===null) {

			// EDITING FROM PROCESSES
	
			// RELOAD_ROWS_LIST
			const call_uid = 'wrap_' + page_globals.section_tipo + '_' + 'list';		
			window.opener.search.reload_rows_list(call_uid);

			if(SHOW_DEBUG===true) {
				window.opener.console.log("[tool_transcriptions.update_related_component] Reloading rows (reload_rows_list).. ", call_uid)
			}			

		}else{

			// EDITING FROM EDIT RECORD

			// REFRESH_COMPONENTS
			// Calculate wrapper_id and ad to page global var 'components_to_refresh'
			// Note that when tool window is closed, main page is focused and trigger refresh elements added 
			const wrapper = window.opener.component_common.get_component_wrapper(component_related_obj_tipo, page_globals._parent, page_globals.section_tipo);
			if (wrapper) {
				window.opener.html_page.add_component_to_refresh(wrapper.id)
			}
		}
			
		return true
	};//end update_related_component



	/**
	* UPDATE_OPENER_COMPONENT
	*/
	this.update_opener_component = function() {

		// Get current text area wraper tipo and parent and update opener wrapper component
		var wrapper_transcriptions 	= tool_transcription.wrap_text_area;	// $('.css_wrap_text_area').first();
		if ($(wrapper_transcriptions).length==1) {
			var tipo 			= $(wrapper_transcriptions).data('tipo'),
				parent 			= $(wrapper_transcriptions).data('parent');
				section_tipo	= $(wrapper_transcriptions).data('section_tipo');
			var wrapper 	= window.opener.$('.css_wrap_text_area[data-tipo='+tipo+'][data-parent='+parent+']data-section_tipo='+section_tipo+']');
			if ($(wrapper).length!=1) {
				return alert("Error on update component.  Text area id_wrapper not exist in top DOM");
			}
			var id_wrapper = $(wrapper).attr('id');
			//console.log("tipo:"+tipo+ " ,parent:"+parent+" id_wrapper:"+id_wrapper+" del esperado: wrapper__dd343_15_lg-spa_edit_source_lang__2")
			window.opener.component_common.load_component_by_wrapper_id(id_wrapper);
		}else{
			if(SHOW_DEBUG===true) {
				alert("Error on update text area component. Text area id_wrapper not exist in current DOM : "+id_wrapper)
			};
		}
	};//end update_opener_component



	/**
	* UPDATE_AV_SUBTITLE_TRACK
	* @return 
	*/
	this.update_av_subtitle_track = function( lang ) {

		return top.tool_subtitles.add_subtitle_track_to_video()		
	};//end update_av_subtitle_track



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
				"mode" 		   : "pdf_automatic_transcription",
				"source_tipo"  : source_tipo,
				"target_tipo"  : target_tipo,
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
			if(SHOW_DEBUG===true) {
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
				component_common.load_component_by_wrapper_id(target_wrapper_id, null, tool_transcription.fix_height_of_texteditor)
				//setTimeout(function(){
				//	tool_transcription.fix_height_of_texteditor()
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
	};//end pdf_automatic_transcription



	/**
	* SELECT_TAG_IN_EDITOR
	* Select first tag (index in) image in text editor and scroll to he
	*/
	this.select_tag_in_editor = function() {

		try {
			if(tinyMCE.activeEditor && page_globals.tag_id.length>0) {
				// Select request tag
				var tagname = '[id$=-'+page_globals.tag_id+'\\]]'
				var ed = tinyMCE.activeEditor
					ed.selection.select(ed.dom.select(tagname)[0]).scrollIntoView(false); //select the inserted element
			}
		}catch(e) {
			console.log("Error: "+e)
		}
	};//end select_tag_in_editor



	/**
	* SAVE_ON_EXIT
	* Save text when user close window if changed
	*/
	this.save_on_exit = function() {

		// Save text_area
		var ed = tinymce.activeEditor;
		if (ed === null || typeof ed !== 'object') {
			if(window.opener)
			window.opener.console.log("-> tool_transcription:save_on_exit: Error: editor not found");
			return false;
		}
		if (ed.isDirty()) {

			if (SHOW_DEBUG===true) {
				if (window.opener)
				window.opener.console.log("-> tool_transcription:save_on_exit: ed isDirty. Text need save and saving_state = "+component_common.saving_state);
			}

			// IMPORTANT
			// Reselect always (lang selector updates component text area)
			//var text_area_obj = document.querySelector('textarea[data-role="text_area_transcription"]');
			var text_area_obj = document.getElementById(ed.id);
				//window.opener.console.log(typeof text_area_obj);

			//component_common.save_async = 1; // Set async false

			var jsPromise = component_text_area.Save(text_area_obj, null, ed);
				jsPromise.then(function(response) {
					if(SHOW_DEBUG===true) {
						if(window.opener)
						window.opener.console.log("-> Saved and reloaded component from 'save_on_exit' ");
					}
					//window.opener.alert("Saved text")
				}, function(xhrObj) {
					//console.log(xhrObj);
				});
		}
	};//end save_on_exit



	/**
	* FIX_HEIGHT_OF_TEXTEDITOR
	* Automatically change the height of the editor based on window resize
	*/
	this.fix_height_of_texteditor = function() {

		//return false;
		if (page_globals.modo!=='tool_transcription') {
			return false;
		}		

		if (typeof tinyMCE==="undefined" || !tinyMCE) {
			if(SHOW_DEBUG===true) {
				console.log("Text editor not found");
			}
			return false
		}

		//try {

			const text_area_tool_transcription = document.querySelector('.text_area_tool_transcription')

			// Width
			let w = text_area_tool_transcription.offsetWidht;
			// Height
			let h = text_area_tool_transcription.offsetHeight;
			//console.log(w+"+"+h)

			let h_adjust = 71
			let text_area_warning = document.getElementById("text_area_warning")
			if (text_area_warning) {
				h_adjust = h_adjust + text_area_warning.offsetHeight;
			}

			if (page_globals.modo==="tool_transcription") {
				h_adjust = h_adjust + 15
			}
			
			//setTimeout(function(){
			if(tinyMCE.activeEditor)
				tinyMCE.activeEditor.theme.resizeTo(
					"100%",
					h - h_adjust
				)
			//},50)
			
			// PDF VIEWER IF EXISTS
			// var pdf_iframe = $('.pdf_viewer_frame')
			// if ( $(pdf_iframe).length === 1 ) {
			// 	$(pdf_iframe).height( h -33 )
			// }
			const pdf_iframe = document.querySelector('.pdf_viewer_frame')				
			if (pdf_iframe) {
				pdf_iframe.style.height = (h -33) + "px"				
			}

			// GEOLOCATION VIEWER IF EXISTS
			// var geolocation_iframe = $('.leaflet-container')
			// if ( $(geolocation_iframe).length === 1 ) {
			// 	$(geolocation_iframe).height( h +6 )
			// }
			const geolocation_iframe = document.querySelector('.leaflet-container')
			if (geolocation_iframe) {
				geolocation_iframe.style.height = (h +6) + "px"
			}

		//}catch(e) {
		//	console.log("Error: "+e)
		//}
		

		return true
	};//end fix_height_of_texteditor



	/**
	* SPEED_RANGE_VALUE_CHANGE
	* Change the video speed played in realtime with the value of the slider
	*/
	this.speed_range_value_change = function(value){
		var speed_range_label = document.getElementById('speed_range_value');
			speed_range_label.value = value;

		videoFrame.set_playback_rate(value);

		return true
	};//end speed_range_value_change



	/**
	* SET_AV_ADD_ONS
	*/
	this.set_av_add_ons = function() {

		// PLAYPAUSE_KEY
			var add_on_av_playpause_key_input  = document.getElementById('add_on_av_playpause_key'),
				add_on_av_playpause_key_span   = $(add_on_av_playpause_key_input).next('span').first(),
				add_on_av_playpause_key_cookie = get_localStorage('av_playpause_key')
				//console.log(add_on_av_playpause_key_span); console.log(add_on_av_playpause_key_cookie);
			
			var key_val  = add_on_av_playpause_key_cookie ? add_on_av_playpause_key_cookie : 27, // Default 27 'ESC'
				key_name = keycode.getKeyCodeValue(key_val)

			// Set value from cookie or default
			add_on_av_playpause_key_input.value = key_val
			// Key code to name span info
			add_on_av_playpause_key_span[0].innerHTML = key_name

			// Set handler to inputs
			$(add_on_av_playpause_key_input)
				.keyup(function(event) {
					key_val = event.which;
					$(this).val(key_val).blur();
					$(add_on_av_playpause_key_span).text( keycode.getKeyCodeValue(key_val) );
					// store cookie
					set_localStorage('av_playpause_key',key_val);
					// Fix value in videFrame vars
					videoFrame.av_media_player_play_pause_key = key_val
				})
				.click(function() {$(this).select();});


		// REWIND SECS
			var add_on_av_rewind_secs_input  = document.getElementById('add_on_av_rewind_secs'),			
				add_on_av_rewind_secs_cookie = get_localStorage('av_rewind_secs')
				//console.log(add_on_av_rewind_secs_input);

			var secs_val  = add_on_av_rewind_secs_cookie ? add_on_av_rewind_secs_cookie : 3; // Default 3 sec

			// Set value from cookie or default
			add_on_av_rewind_secs_input.value = secs_val

			// Set handler to inputs
			$(add_on_av_rewind_secs_input)
				.keyup(function(event) {
					// store cookie
					secs_val = event.target.value;
					set_localStorage('av_rewind_secs',secs_val);
				})
				.click(function() {$(this).select();});			
	};//end set_av_add_ons



	/**
	* SET_TAG_INSERT_KEY
	*/
	this.set_tag_insert_key = function() {
		
		var tag_insert_key_input  = document.getElementById('tag_insert_key');
		if(!tag_insert_key_input) return false;

		var	tag_insert_key_span   = $(tag_insert_key_input).next('span').first(),
			tag_insert_key_cookie = get_localStorage('tag_insert_key')
				//console.log(tag_insert_key_span); console.log(tag_insert_key_cookie);
			
			var key_val  = tag_insert_key_cookie ? tag_insert_key_cookie : 113, // Default 113 'F2'
				key_name = keycode.getKeyCodeValue(key_val)					

			// Set value from cookie or default
			tag_insert_key_input.value = key_val
			// Key code to name span info
			tag_insert_key_span[0].innerHTML = key_name

			// Set handler to inputs
			$(tag_insert_key_input)
				.keyup(function(event) {
					key_val = event.which;
					$(this).val(key_val).blur();
					$(tag_insert_key_span).text( keycode.getKeyCodeValue(key_val) );
					// store cookie
					set_localStorage('tag_insert_key',key_val);

					// Fix value in videFrame vars
					videoFrame.av_media_player_insert_tc_key = key_val	
				})
				.click(function() {$(this).select();});

		return true
	};//end set_tag_insert_key



	/**
	* KEYCODE OBJ
	*/
	var keycode = {
		
		getKeyCode : function(e) {
			var keycode = null;
			if(window.event) {
				keycode = window.event.keyCode;
			}else if(e) {
				keycode = e.which;
			}
			return keycode;
		},
		getKeyCodeValue : function(keyCode, shiftKey) {
			shiftKey = shiftKey || false;
			var value = null;
			if(shiftKey === true) {
				value = this.modifiedByShift[keyCode];
			}else {
				value = this.keyCodeMap[keyCode];
			}
			return value;
		},
		getValueByEvent : function(e) {
			return this.getKeyCodeValue(this.getKeyCode(e), e.shiftKey);
		},
		keyCodeMap : {
			8:"backspace", 9:"tab", 13:"return", 16:"shift", 17:"ctrl", 18:"alt", 19:"pausebreak", 20:"capslock", 27:"escape", 32:" ", 33:"pageup",
			34:"pagedown", 35:"end", 36:"home", 37:"left", 38:"up", 39:"right", 40:"down", 43:"+", 44:"printscreen", 45:"insert", 46:"delete",
			48:"0", 49:"1", 50:"2", 51:"3", 52:"4", 53:"5", 54:"6", 55:"7", 56:"8", 57:"9", 59:";",
			61:"=", 65:"a", 66:"b", 67:"c", 68:"d", 69:"e", 70:"f", 71:"g", 72:"h", 73:"i", 74:"j", 75:"k", 76:"l",
			77:"m", 78:"n", 79:"o", 80:"p", 81:"q", 82:"r", 83:"s", 84:"t", 85:"u", 86:"v", 87:"w", 88:"x", 89:"y", 90:"z",
			96:"0", 97:"1", 98:"2", 99:"3", 100:"4", 101:"5", 102:"6", 103:"7", 104:"8", 105:"9",
			106: "*", 107:"+", 109:"-", 110:".", 111: "/",
			112:"f1", 113:"f2", 114:"f3", 115:"f4", 116:"f5", 117:"f6", 118:"f7", 119:"f8", 120:"f9", 121:"f10", 122:"f11", 123:"f12",
			144:"numlock", 145:"scrolllock", 186:";", 187:"=", 188:",", 189:"-", 190:".", 191:"/", 192:"`", 219:"[", 220:"\\", 221:"]", 222:"'"
		},
		modifiedByShift : {
			192:"~", 48:")", 49:"!", 50:"@", 51:"#", 52:"$", 53:"%", 54:"^", 55:"&", 56:"*", 57:"(", 109:"_", 61:"+",
			219:"{", 221:"}", 220:"|", 59:":", 222:"\"", 188:"<", 189:">", 191:"?",
			96:"insert", 97:"end", 98:"down", 99:"pagedown", 100:"left", 102:"right", 103:"home", 104:"up", 105:"pageup"
		}
	};//end keycode



	/**
	* FAST_SWITCH_LANG
	* @return 
	*/
	this.fast_switch_lang = function(selector_obj) {

		var self = this

		// Exec standard component switch
		var js_promise = component_common.fast_switch_lang(selector_obj)

		js_promise.then(function(response){
			/* Not necessary anymore
			var tool_transcription_left 	= document.getElementById('tool_transcription_left'),
			wrap_tool_transcription 		= tool_transcription_left.querySelector(".wrap_component")
			selector_obj.dataset.id_wrapper = wrap_tool_transcription.id */

			self.textarea_lang = selector_obj.value

			// update subtitle track
				if (typeof(tool_subtitles)!=="undefined") {
					tool_subtitles.add_subtitle_track_to_video()
				}							
		})
		
		return true
	};//end fast_switch_lang



};//end tool_transcription