


/**
* TOOL_TRANSCRIPTION CLASS
*/
var tool_transcription = new function() {

	// LOCAL VARS
	this.trigger_tool_transcription_url = DEDALO_LIB_BASE_URL + '/tools/tool_transcription/trigger.tool_transcription.php';
	this.text_area_obj	= null;
	this.wrap_text_area = null;



	/**
	* READY (EVENT)
	*/
	$(function() {

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
					tool_transcription.text_area_obj 	= $('.text_area_transcription').first()[0];
					tool_transcription.wrap_text_area 	= $('.css_wrap_text_area').first()[0];					

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



	/**
	* LOAD (EVENT)
	*/
	window.addEventListener("load", function (event) {
		tool_transcription.fix_height_of_texteditor()
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
		if(typeof lock_components!='undefined') lock_components.update_lock_components_state( tool_transcription.wrap_text_area, 'focus' );

		// Updates subtitles track lang (useful when text area lang is forced)
		if (tool_transcription.text_area_obj.dataset.lang) {
			// console.log(tool_transcription.text_area_obj.dataset.lang);
			//tool_transcription.update_av_subtitle_track( tool_transcription.text_area_obj.dataset.lang )
		}
	});//end load



	/**
	* BEFOREUNLOAD (EVENT)
	*/
	window.addEventListener("beforeunload", function (event) {
		//console.log("-> triggered beforeunload event (tool_transcription)");
		event.preventDefault();

		if (tinymce.activeEditor.isDirty()) {

			var confirmationMessage = "Leaving tool transcription page.. ";
			event.returnValue  	= confirmationMessage;	// Gecko, Trident, Chrome 34+
			return confirmationMessage;              	// Gecko, WebKit, Chrome <34
		}
	});//end beforeunload



	/**
	* UNLOAD (EVENT)
	*/
	window.addEventListener("unload", function (event) {
		//console.log("-> triggered unload event (tool_transcription) saving_state: "+component_common.saving_state);
		event.preventDefault();

		// SAVE ON EXIT
		tool_transcription.save_on_exit();

		// UPDATE PARENT WINDOW COMPONENT TEXT AREA ON CLOSE WINDOW
		// Note component_related_obj_tipo is defined globally	
		tool_transcription.update_related_component( component_related_obj_tipo );

		// Update lock_components state (BLUR)
		if(typeof lock_components!='undefined') {
			lock_components.update_lock_components_state( tool_transcription.wrap_text_area, 'blur' );
		}
	});//end unload



	/**
	* RESIZE (EVENT)
	*/
	window.addEventListener("resize", function (event) {
		tool_transcription.fix_height_of_texteditor();
	});//end resize



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
		try {
			var record_wrap = window.opener.document.getElementById('current_record_wrap')
		}catch(e) {
			window.opener.console.log(e)
		}
		//window.opener.console.log(record_wrap); //return;

		if (record_wrap==null) {

			// EDITING FROM PROCESSES
	
			// RELOAD_ROWS_LIST
			var call_uid = 'wrap_' + page_globals.section_tipo + '_' + 'list';	// wrap_dd1140_list
			window.opener.search.reload_rows_list(call_uid);

			window.opener.console.log("Reload rows..")

		}else{

			// EDITING FROM EDIT RECORD

			// REFRESH_COMPONENTS
			// Calculate wrapper_id and ad to page global var 'components_to_refresh'
			// Note that when tool window is closed, main page is focused and trigger refresh elements added 
			var wrapper = window.opener.component_common.get_component_wrapper(component_related_obj_tipo, page_globals._parent, page_globals.section_tipo);
				if (wrapper) {
					window.opener.html_page.add_component_to_refresh(wrapper.id)
				}
		}
		
			
		/* OLD WAY
		try {
			var related_component_wrapper 	= window.opener.document.querySelectorAll(".wrap_component[data-tipo='"+ component_related_obj_tipo +"']");
			//window.opener.console.log(related_component_wrapper);
		}catch(err) {
			//console.log(err.message;);
		}

		if (related_component_wrapper) {

			related_component_wrapper = related_component_wrapper[0];

			// Update component text area
			window.opener.component_common.load_component_by_wrapper_id( related_component_wrapper.id )
			if (DEBUG) {
				window.opener.console.log("--> Updating component from tool_transcription "+ component_related_obj_tipo);
			};
			
		}else{
			//window.opener.console.log("WARNING: Unable update related component from tool_transcription "+ component_related_obj_tipo + ". No found wrapper in DOM");
		}
		*/
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
			var id_wrapper 	= $(wrapper).attr('id');
			//console.log("tipo:"+tipo+ " ,parent:"+parent+" id_wrapper:"+id_wrapper+" del esperado: wrapper__dd343_15_lg-spa_edit_source_lang__2")
			window.opener.component_common.load_component_by_wrapper_id(id_wrapper);
		}else{
			if (DEBUG) {
				alert("Error on update text area component. Text area id_wrapper not exist in current DOM : "+id_wrapper)
			};
		}
	};//end update_opener_component



	/**
	* CHANGE_TEXT_EDITOR_LANG
	* On change, reload current component_text_area with received lang
	* Note: this function don't change application lang, only current used editor (component_text_area)
	* Note2 : this function uses 'trigger.tool_lang.php' to load the component
	* @see tool_lang::load_target_component
	*/
	this.change_text_editor_lang = function(select_obj) {

		if (!select_obj || !select_obj.value) {
			return alert("Sorry. lang selector not found")
		}

		var tipo 		 = select_obj.dataset.tipo,
			parent 		 = select_obj.dataset.parent,
			section_tipo = select_obj.dataset.section_tipo,
			lang 		 = select_obj.value,
			wrap_div 	 = tool_transcription.wrap_text_area;	// $('.css_wrap_text_area').first();	

		html_page.loading_content( wrap_div, 1 );

		//return tool_transcription.update_av_subtitle_track( lang );

		var mydata	= { 'mode'			: 'change_text_editor_lang',
						'tipo'			: tipo,
						'parent'		: parent,
						'section_tipo'	: page_globals.section_tipo,
						'lang'			: lang,
						'top_tipo'		: page_globals.top_tipo
					}
					//return console.log(mydata)

		// AJAX REQUEST
		$.ajax({
			url		: tool_transcription.trigger_tool_transcription_url,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {
			/*
			// Replace wrapper with received component html
			//$(wrap_div).html(received_data)
			$(wrap_div).html(
						$(received_data).find('.content_data:first>*')
						);
			*/
				// Pure javascript option
				// Parse html text as object
				var el = document.createElement('div')
				el.innerHTML = received_data

				//var content = $(received_data).find("div.css_section_group_content:first>*")
				//var content = $(received_data).find("[data-rol='section_records']") //'[data-type="component_autocomplete_new_element"]'
				var content_obj = el.querySelector(".content_data")
					if(typeof content_obj === 'undefined') {
						return alert('Error on parse received data: \n' + received_data)
					}
				var target_obj  = wrap_div.querySelector(".content_data")
					if(typeof target_obj === 'undefined') {
						return alert('Error on place received data. Target DOM obj (data-rol="section_records") not found')
					}
				// Pure javascript option (replace content and exec javascript code inside)
				insertAndExecute(target_obj, content_obj)


			// Update wrapper lang !important
			wrap_div.dataset.lang = lang

			// fix_height_of_texteditor
			tool_transcription.fix_height_of_texteditor();

			// update_av_subtitle_track
			tool_transcription.update_av_subtitle_track( lang );

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
	* UPDATE_AV_SUBTITLE_TRACK
	* @return 
	*/
	this.update_av_subtitle_track = function( lang ) {

		return top.tool_subtitles.add_subtitle_track_to_video()
		/*
		// Update iframe video player subtitles track source
		var videoFrame 			= document.getElementById('videoFrame');
		var video_obj  			= videoFrame.contentWindow.document.querySelector('video')
		
		// Get current subtitles track
		var subtitle_track 		= video_obj.querySelector('track')
			if (!subtitle_track) {
				console.log("Error on select video subtitle track");
				return false
			}

		// Current trak source
		var subtitle_track_src 	= subtitle_track.src
			//console.log(video_obj); console.log(subtitle_track); console.log(subtitle_track_src);

		var expresion 	= /(.+)(lg-.{3,4})(\.vtt)/;
		var current_url = subtitle_track_src // "http://192.168.0.7:8888/dedalo4/media_test/media_development/av/subtitles/rsc35_rsc167_42_lg-spa.vtt";
		var new_url 	= current_url.replace(expresion, "$1"+lang+"$3");

		// Clone old track
		var new_track = subtitle_track.cloneNode(false);

		// Delete old track
		subtitle_track.parentNode.removeChild(subtitle_track)

		// Set new track url 
		new_track.src = new_url
			//console.log(subtitle_track);

		// Add new track to video
		video_obj.appendChild(new_track)

		if(SHOW_DEBUG===true) {
			console.log("-> Changed subtiltes track lang from \n"+current_url + " to \n"+new_url)
		}

		return new_url
		*/
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

	}//end pdf_automatic_transcription


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
	}//end select_tag_in_editor


	/**
	* SAVE_ON_EXIT
	* Save text when user close window if changed
	*/
	this.save_on_exit = function() {

		// Save text_area
		var ed = tinymce.activeEditor;
		if (ed === null || typeof ed !== 'object') {
			window.opener.console.log("-> tool_transcription:save_on_exit: Error: editor not found");
			return false;
		}
		if (ed.isDirty()) {

			if (DEBUG) {
				window.opener.console.log("-> tool_transcription:save_on_exit: ed isDirty. Text need save and saving_state = "+component_common.saving_state);
			}

			// IMPORTANT
			// Reselect always (lang selector updates component text area)
			var text_area_obj = document.querySelectorAll('[data-rol="text_area_transcription"]')[0];
				//window.opener.console.log(typeof text_area_obj);

			//component_common.save_async = 1; // Set async false

			var jsPromise = component_text_area.Save(text_area_obj, null, ed);
				jsPromise.then(function(response) {
				  	if (DEBUG) {
				  		window.opener.console.log("-> Saved and reloaded component from 'save_on_exit' ");
				  	}
				  	//window.opener.alert("Saved text")
				}, function(xhrObj) {
				  	//console.log(xhrObj);
				});
		}

	}//end save_on_exit



	/**
	* FIX_HEIGHT_OF_TEXTEDITOR
	* Automatically change the height of the editor based on window resize
	*/
	this.fix_height_of_texteditor = function() {

		if (page_globals.modo!='tool_transcription') {
			return false;
		};

		$(function() {

		    if (tinyMCE==undefined || !tinyMCE || typeof tinyMCE===undefined) {
		    	if(SHOW_DEBUG===true) {
		    		console.log("Text editor not found");
		    	}
		    	return false
		    }

		    //try {

				var w = $('.tool_transcription_left').width();
			   // var h = $('.tool_transcription_left').height();
			    var h = document.querySelector('.tool_transcription_left').offsetHeight;
			    //console.log(w+"+"+h)

			    var h_adjust = 66
			    var text_area_warning = document.getElementById("text_area_warning")
			    if (text_area_warning) {
			    	h_adjust = h_adjust + text_area_warning.offsetHeight;
			    }
			    /**/
			    setTimeout(function(){
				    tinyMCE.activeEditor.theme.resizeTo(
				        "100%",
				        h - h_adjust
				    )
			    },1)
				
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

			//}catch(e) {
			//	console.log("Error: "+e)
			//}
	    });

	}//end fix_height_of_texteditor


	/**
	* SPEED_RANGE_VALUE_CHANGE
	* Change the video speed played in realtime with the value of the slider
	*/
	this.speed_range_value_change = function(value){
		var speed_range_label = document.getElementById('speed_range_value');
		speed_range_label.value = value;
		videoFrame.set_playback_rate(value);
	}


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

			
	}//end set_av_add_ons


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

	}//end set_tag_insert_key


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
	};//end keycode obj


};//end tool_transcription
