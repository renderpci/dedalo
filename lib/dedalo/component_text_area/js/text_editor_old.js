// JavaScript Document
// TEXT EDITOR


// TEXT EDITOR CLASS
var text_editor = new function() {


	
	// INIT TINY MCE EDITOR FOR CURRENT AREA (text_area_id)
	this.initMCE_OLD = function (text_area_id, css_file) {
		/*
		tinymce.init({selector:"div#'.$identificador_unico.'",						
   						inline: true,
						menubar:false,
					 toolbar: "undo redo | bold italic print preview media fullpage "
		*/
		//alert(text_area_id)
		// TinyMCE vars
		var my_pluins			= 'paste,print,searchreplace,preview,visualchars,xhtmlxtras,template,fullscreen,noneditable';	// noneditable,save,autoresize
		var my_buttons			= 'bold,italic,pasteword,undo,redo,selectall,code,print,fullscreen';
		var my_resizing			= true;	

		//my_buttons += ',|,search,code,cleanup';		
		var my_readonly			= false;	// default false
		var my_height			= '';
		var my_width			= '100.5%';		
		var cssFile 			= DEDALO_LIB_BASE_URL + '/component_text_area/css/' + 'text_editor_default.css';
		var my_valid_elements	= "strong/b,em/i,div[class],span[class],img[id|src|class],br,p";
		var my_verify_html 		= false;	// default false


		// Overwrite default css
		if (typeof css_file != 'undefined') {
			cssFile 			= DEDALO_LIB_BASE_URL + '/component_text_area/css/' + css_file ;
			switch(css_file) {

				case 'text_editor_hideAll.css':
					// Allow ony tags bold, italic and br
					my_valid_elements	= "strong/b,em/i,br";
					// Remove all no valid tags (images..) 
					my_verify_html 		= true;
					// Read only mode
					my_readonly 		= true;
					break;

				case 'text_editor_tool_transcription.css':
					my_resizing = false;
					my_height 	= 613;
					var my_pluins			= 'paste,print,searchreplace,preview,visualchars,xhtmlxtras,template,fullscreen,noneditable';
					break;
			}
		};

	 	try{
	 		
		 
		//tinyMCE.init({
		tinymce.init({
			
			// Generic selector
			//mode 								: "textareas",	//"textareas", specific_textareas , exact

			// Exact id selector
			//
			mode 								: "exact",	//"textareas", specific_textareas , exact
			elements 							: text_area_id,
			
			
			//editor_selector 					: "css_text_area",			
			theme 								: "advanced",			
			entity_encoding 					: "raw",
			//doctype							: "",
			//encoding 							: "xml",	//estaba comentado <----
			plugins 							: my_pluins,
			readonly							: my_readonly,
			theme_advanced_buttons1 			: my_buttons,
			theme_advanced_buttons2 			: "",
			theme_advanced_buttons3				: "",
			theme_advanced_toolbar_location 	: "top",
			theme_advanced_toolbar_align 		: "left",
			theme_advanced_statusbar_location 	: "bottom",
			theme_advanced_resizing 			: my_resizing,
			theme_advanced_resize_horizontal 	: false,
			//auto_focus 						: "texto", // focus the editor
			//save_enablewhendirty 				: true,
			//save_onsavecallback 				: "saveTR",
			width 								: my_width,
			height 								: my_height,
			content_css 						: cssFile ,
			autoresize_min_height				: 88,
			autoresize_max_height				: 276,

			//extended_valid_elements 			: "dedalo",
			//custom_elements					: "dedalo",
			valid_elements 						: my_valid_elements, //"strong/b,em/i,div[class],span[class],img[id|src|class],br,p",
			object_resizing 					: false,
			paste_block_drop 					: false,	// block drag images on true		
			//convert_newlines_to_brs 			: true,	
			
			// Gestion de URL's por tiny. Default is both true
			relative_urls 						: false,
			convert_urls 						: false,
			

			// FORCE NO INSERT TINYMCE PARAGRAPS "<p>"		
			force_br_newlines					: true,		// need true for webkit
			force_p_newlines					: false,
			forced_root_block					: false, 	// Needed for 3.x	
			/**/
			
			// If you enable this feature, whitespace such as tabs and spaces will be preserved. Much like the behavior of a <pre> element. 
			// This can be handy when integrating TinyMCE with webmail clients. This option is disabled by default.
			preformatted 						: true,
			
			// This option enables or disables the element cleanup functionality. If you set this option to false, 
			// all element cleanup will be skipped but other cleanup functionality such as URL conversion will still be executed.
			verify_html 						: my_verify_html,		// default false	
			apply_source_formatting 			: false,
			
			// TESTING
			remove_linebreaks					: false,	// remove line break stripping by tinyMCE so that we can read the HTML		
			paste_create_linebreaks 			: true,		// for paste plugin - single linefeeds are converted to hard line break elements
			paste_auto_cleanup_on_paste 		: true,		// for paste plugin - word paste will be executed when the user copy/paste content
			verify_css_classes 					: false,		
		  
			//SET UP
			setup : 				function(ed) {										
										/*
										ed.onBeforeRenderUI.add(function(ed, cm) {
									  		ed.setProgressState(1); // Show progress en texto
										});
										ed.onPostRender.add(function(ed, cm) {
											  ed.setProgressState(0); // Hide progress en texto
										});


										// Force Paste-as-Plain-Text
										ed.onPaste.add( function(ed, e, o) {
											ed.execCommand('mcePasteText', true);
											//return tinymce.dom.Event.cancel(e);
										});
										*/
										// Notify editor js events
										ed.onEvent.add(function(ed, evt) {					
											$('#inspector_events').html("Editor event occured: <br>" + evt + "<br>" + evt.target.nodeName + "<br>" +evt.target+"<br>id:" +evt.target.id +"<br>"+ new Date() );											
										});	

										// INDEXATION SELECTED FRAGMENT
										if(page_globals.modo=='tool_indexation') {
										// Btn create fragment locator
										var btn_create_fragment = $('#'+ed.id).parent('.content_data').first().children('.btn_create_fragment'); 	//if (DEBUG) console.debug(ed.id);											
										ed.onMouseUp.add(function(ed, e) {

											// Show / hide button create fragment if current_selection.length > 1
											var current_selection = ed.selection.getContent({format : 'text'});				//if (DEBUG) console.debug(current_selection);	
											if (current_selection.length>1) {
												$(btn_create_fragment).fadeIn(100);		//if (DEBUG) console.debug('btn_create_fragment -> fadeIn');
												$('.indexation_page_list').html(current_selection);
											}else{
												$(btn_create_fragment).fadeOut(100);	//if (DEBUG) console.debug('btn_create_fragment -> fadeOut');
												$('.indexation_page_list').html('');
											}
										});
										}

										/*
										ed.onGetContent.add(function(ed, o) {								         
											if (DEBUG) console.log(o)
										});
										*/
										
										// CLICK EVENT			
										ed.onClick.add(function(ed,evt) {

											// Select parent wrap
											var obj_warp = $('#'+ed.id).parents('.wrap_component').first();		//if (DEBUG) console.log( obj_warp )
											component_common.select_wrap(obj_warp)

											// CLICK ON IMG
											if( evt.target.nodeName == 'IMG' ) {

												// store id for verify if index content is changed (revised at save)
												var tag = evt.target.id ;

												// select
												//e = evt.target;
												//ed.selection.select(e);

												/**
												* Control de imágenes tags de tc's
												*/
												if( tag.indexOf('[TC_')!=-1 ) {													
													//var tc = tag.substr(4,8);	// [TC_00:01:23_TC] to '00:01:23'																
													component_text_area.goto_time(tag);	//alert(tc)		
													return false;			
												}

												/**
												* Control de imágenes tags de indexaciones (ACTION ON  CLICK)
												*/
												if( tag.indexOf('index')!=-1 ) {

													var tipo 			= $(obj_warp).data('tipo');
													var lang 			= $(obj_warp).data('lang');
													var current_parent 	= $(obj_warp).data('parent');		//alert("test editor: "+current_parent);
													var id_matrix 		= $(obj_warp).data('id_matrix');	//alert("test editor: "+id_matrix);

													switch(page_globals.modo) {

														case 'edit' :
																	var context = get_current_url_vars()['context'];	console.log("context in text_editor:"+context)
																	if (context=='list_into_tool_relation' || typeof context=='undefined') {
																		// Show button and info about in inspector relations
																		component_text_area.load_relation(tag, tipo, id_matrix);	//alert("Show info about in inspector relations - context:"+get_current_url_vars()['context'])	
																	}
																	else if (context=='list_into_tool_portal') {
																		// Show button add fragmento
																		component_text_area.load_button_link_fragmet_to_portal(tag, tipo, id_matrix);
																			//alert("called load_button_link_fragmet_to_portal in text-editor")
																	};
																	
																	break;

														case 'tool_lang' :
																	// Show info about in tool lang window
																	component_text_area.load_fragment_info(tag, tipo, lang);
																	break;

														case 'tool_indexation' :
																	// Show info about in tool relation window
																	component_text_area.load_fragment_info_in_idexation(tag, tipo, id_matrix);	//alert(tag+' - '+ tipo+' - '+ parent)
																	break;
													}
																
													// id of index like [index_001_in]						
													//component_text_area.logIndexChanges(tag);
													//alert(" " + tag + " tipo:"+tipo);
													
													//component_text_area.HighlightText(ed,tag,tipo);
													// load fragment and tesaurus . Send img id like [index_001_in]				
													//component_text_area.loadFr(tag);
													return false;
												}
												
											}// END CLICK ON IMG
											

										});// END CLICK EVENT

										
									  	
										if(page_globals.modo=='tool_transcription') {
											// KEY UP FUNCTIONS
											ed.onKeyUp.add(function(editor,e) {
												//ed.windowManager.alert('A ver. ' + editor +' '+ e.keyCode ); // alert(ed + ' - ' +e)

												component_text_area.editor_key_up(e);
												/*
												switch(e.keyCode) {

													//case 27 : 	// Key ESC(27) llamamos a la función de control de video / rec. posición TC
													case videoFrame.av_media_player.av_media_player_play_pause_key :
																component_text_area.videoPlay(e);				if (DEBUG) console.log('->text editor videoPlay ed.onKeyUp: '+e.keyCode);
																break;

													//case 113 : 	// Key F2 (113) Write tc tag in text
													case videoFrame.av_media_player.av_media_player_insert_tc_key :
																component_text_area.get_and_write_tc_tag(e);	if (DEBUG) console.log('->text editor write_tc_tag ed.onKeyUp: '+e.keyCode);
																break;
												}
												*/
											});
										}//if(modo=='transcription')
										
					  
									},//fin setup 

			setupcontent_callback :	function() {																										
										//loadTR();													
										//resize_text_area();																														
									},
			onchange_callback : 	function(ed) {
													
										// SELECT PARENT TEXT AREA OBJ
										//var component_obj = $('#'+ed.id, parent.document);	//if (DEBUG) console.log( component_obj )
										var component_obj = $('#'+ed.id);	//if (DEBUG) console.log( component_obj )
										
										if($(component_obj).length>0) {
											
											// FORCE UPDATE REAL TEXT AREA CONTENT														
											tinyMCE.triggerSave();		//alert(ed.getContent())
											
											// SAVE REAL TEXTAREA CONTENTS
											component_text_area.Save(component_obj);		if (DEBUG) console.log("-> trigger Save from tinyMCE " + ed.id);

											// Notify time machine tool content is changed
											top.changed_original_content = 1;	//if (DEBUG) console.log(tool_time_machine.changed_original_content)

											// Update paragraph counter (if function exists)
											if (page_globals.modo=='tool_lang' && typeof tool_lang.writeLeftParagraphsNumber == 'function') {
											  tool_lang.writeLeftParagraphsNumber();
											}
											if (page_globals.modo=='tool_lang' && typeof tool_lang.writeRightParagraphsNumber == 'function') {
											  tool_lang.writeRightParagraphsNumber(); 
											}

											//if (DEBUG) console.log( component_obj )	
										}else{
											alert("text editor component_obj not found "+ed.id)
										}
													
									}
		  
		});
	
		}catch(err){ alert(err); }
	};// end initMCE




	// INIT TINYMCE TIME MACHINE MODE
	this.initMCE_tm_OLD = function () {

		
		// TinyMCE vars
		var my_pluins			= 'print,xhtmlxtras,fullscreen,xhtmlxtras,noneditable,autoresize';	// noneditable,save	 'paste,print,searchreplace,preview,visualchars,xhtmlxtras,template,fullscreen,noneditable';			
		var my_buttons			= 'selectall,code,print,fullscreen';
		var my_resizing			= true;			
		var my_readonly			= false;		
		var my_height			= '';
		var my_width			= '100.5%';
		var cssFile 			= DEDALO_LIB_BASE_URL + '/component_text_area/css/' + 'text_editor_tm.css'
		
	 	try{
		 
		tinyMCE.init({
			
			mode 								: "specific_textareas",
			editor_selector 					: "text_area_tm",//text_area_tm",
			content_css 						: cssFile ,

			autoresize_min_height				: 80,
			autoresize_max_height				: 500,

			theme 								: "advanced",			
			entity_encoding 					: "raw",
			plugins 							: my_pluins,
			readonly							: my_readonly,
			theme_advanced_buttons1 			: my_buttons,
			theme_advanced_buttons2 			: "",
			theme_advanced_buttons3				: "",
			theme_advanced_toolbar_location 	: "top",
			theme_advanced_toolbar_align 		: "left",
			theme_advanced_statusbar_location 	: "bottom",
			theme_advanced_resizing 			: my_resizing,
			theme_advanced_resize_horizontal 	: false,			
			width 								: my_width,
			height 								: my_height,			
			valid_elements 						: "strong/b,em/i,div[class],span[class],img[id|src|class],br,p",
			object_resizing 					: false,
			paste_block_drop 					: false,	// block drag images on true		
			//convert_newlines_to_brs 			: true,	
			
			// Gestion de URL's por tiny. Default is both true
			relative_urls 						: false,
			convert_urls 						: false,
			

			// FORCE NO INSERT TINYMCE PARAGRAPS "<p>"		
			force_br_newlines					: true,		// need true for webkit
			force_p_newlines					: false,
			forced_root_block					: false, 	// Needed for 3.x	
			/**/
			
			// If you enable this feature, whitespace such as tabs and spaces will be preserved. Much like the behavior of a <pre> element. 
			// This can be handy when integrating TinyMCE with webmail clients. This option is disabled by default.
			preformatted 						: true,
			
			// This option enables or disables the element cleanup functionality. If you set this option to false, 
			// all element cleanup will be skipped but other cleanup functionality such as URL conversion will still be executed.
			verify_html 						: false,			
			apply_source_formatting 			: false,
			
			// TESTING
			remove_linebreaks					: false,	// remove line break stripping by tinyMCE so that we can read the HTML		
			paste_create_linebreaks 			: true,		// for paste plugin - single linefeeds are converted to hard line break elements
			paste_auto_cleanup_on_paste 		: true,		// for paste plugin - word paste will be executed when the user copy/paste content
			verify_css_classes 					: false,		
		  
			
			setup : 					function(ed) {											

											ed.onBeforeRenderUI.add(function(ed, cm) {
										  		ed.setProgressState(1); // Show progress en texto
											});
											ed.onPostRender.add(function(ed, cm) {
												ed.setProgressState(0); // Hide progress en texto
											});

											// CLICK EVENT			
											ed.onClick.add(function(ed,evt) {

												// Select parent wrap
												var obj_warp = $('#'+ed.id).parents('.wrap_component').first();	//if (DEBUG) console.log( obj_warp )
												component_common.select_wrap(obj_warp)

											});// END CLICK EVENT
						  
										},//fin setup 

			setupcontent_callback : 	function() {

											// Insertamos todo el contenido dentro de un <span> no editable 
											// (debe estar habilitado el plugin 'noneditable')											
											//this.setContent( '<span class="mceNonEditable">' + this.getContent({format : 'raw'}) + '</span>');	//if (DEBUG) console.log(this.getContent())
																															
										},
			onchange_callback : 		function(ed) {
														
										}
		  
		});
		
		}catch(err){ alert(err) };

	}//fin function initMCE_tm

}







