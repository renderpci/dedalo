"use strict";
/**
* MCE_EDITOR CLASS
*
*
*/
var mce_editor = new function() {


	// CONTEXT : Get from url
	var context_name = get_current_url_vars()['context_name'];

	//if (typeof context_name=='undefined') {
	//	return alert("Error on read context_name")
	//};


	/**
	* INIT
	* @param string text_area_id
	* @param string modo
	* @param propiedades 
	*	Propiedades es opcional. Si se pasa, será un string en formato json del tipo {"mce_editor_options":"full"}
	*/
	this.init = function (text_area_id, modo, propiedades) {
		
		// Verify text_area_id is valid
		if (typeof text_area_id === 'undefined') return ;
		//if(SHOW_DEBUG===true) console.log("->mce_editor.init: "+text_area_id)

		//var text_area_component = $('#'+text_area_id);
		let text_area_component = document.getElementById(text_area_id) // Use let (reasignable)
			if(!text_area_component) {
				if(SHOW_DEBUG) console.log("Ops.. text_area_component not found. text_area_id: "+text_area_id)
				return false;
			}

		let text_area_wrapper	= component_common.get_wrapper_from_element(text_area_component) // Use let (reasignable)
		let	cssFile				= DEDALO_LIB_BASE_URL + '/component_text_area/css/' + 'mce_editor_default.css?' + page_globals.dedalo_version
		let	editor_height		= parseInt(window.getComputedStyle(text_area_wrapper).height)-60; //126
		
		if(!editor_height) {
			editor_height = 125
		}		

		// BODY_CLASS . Propagate component propiedades.wrap_css_selectors to editor body styles
		let body_class = null; // 'viewing_glyphs'	
		if(typeof text_area_wrapper.dataset.component_info!=="undefined"){

			const component_info = JSON.parse(text_area_wrapper.dataset.component_info)		
			if (component_info.propiedades && component_info.propiedades.wrap_css_selectors && component_info.propiedades.wrap_css_selectors[modo]) {
				body_class = component_info.propiedades.wrap_css_selectors[modo]
			}
		}
	
		// CONTEXT_NAME
		if(typeof text_area_wrapper.dataset.related_name!=='undefined'){

			const related_component_name = JSON.parse(text_area_wrapper.dataset.related_name)
			const related_component_length = related_component_name.length
		
			if(related_component_length > 0 ){
				for (let i = related_component_length - 1; i >= 0; i--) {

					if (related_component_name[i]!=='component_select_lang' || typeof context_name!=='undefined' || context_name==='') {
						context_name = related_component_name[i];
						//console.log("[mce_editor.init] context_name",context_name);
					}				
				}
			}
		}
		// tabindex heritage from textarea
		//var text_area_tabindex = text_area_component.getAttribute('tabindex')
		//$('#'+text_area_id+'_ifr').attr('tabindex', 1);
		//text_area_component.setAttribute('tabindex',null);

		// propiedades_obj
		let propiedades_obj = {}		
		if(typeof propiedades==="string"){
			// parse propiedades string
			propiedades_obj = JSON.parse(propiedades)						
		}else if(typeof propiedades==="object") {
			propiedades_obj = propiedades
		}
		
		// current_statusbar
		let current_statusbar = true
		if(propiedades_obj && propiedades_obj.statusbar===false){	
			current_statusbar = false						
		}

		// CONFIG DEFAULT
		let current_inline 	 = false
		let	current_menubar  = false
		let	current_toolbar  = "bold italic underline undo redo searchreplace pastetext code fullscreen | button_save"		
		let	current_plugings = ["paste","image","print","searchreplace","code","fullscreen","noneditable"]// "wordcount"							
		// TR rsc36 case
		if (text_area_wrapper.dataset && text_area_wrapper.dataset.tipo==='rsc36') {
			current_plugings.push("wordcount")
		}
		
		switch(modo) {
			case 'tool_transcription':
					if(context_name === 'component_geolocation') {
						current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_geo | button_note | button_save"
					}else{
						current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_person | button_save"
					}
					//cssFile 		 = DEDALO_LIB_BASE_URL + '/component_text_area/css/' + 'mce_editor_tool_transcription.css?' + page_globals.dedalo_version
					editor_height 	 = 597 -70								
					break;
			/* tool_structuration Not use text editor
			case 'tool_structuration':
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_reference | button_save"
					cssFile 		 = DEDALO_LIB_BASE_URL + '/component_text_area/css/' + 'mce_editor_tool_transcription.css?' + page_globals.dedalo_version
					editor_height 	 = 597 -70					
					break;*/
			case 'tool_lang':
					editor_height 	 = 407 -70
					if (text_area_wrapper.dataset.role && text_area_wrapper.dataset.role==="source_lang") {
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_save"
					}else{					
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_add_structuration button_change_structuration button_delete_structuration | button_save"
					}
					break;
			case 'tool_indexation':
					editor_height 	 = 250
			case 'indexation':
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_reference | button_save"
					current_inline   = false
					current_statusbar= false
					editor_height    = 270
					break;
			case 'edit_note':
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_save"
					current_inline   = false
					current_statusbar= false
					editor_height    = 270
					break;
			default:
					switch(context_name){
						case 'component_geolocation':
							current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_geo | button_note | button_save"
							break;
						case 'component_av':
							current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_person | button_save"
							break
					}
					break;				
		}

		// HTML_TAGS_ALLOWED . Any others will be removed on save
		let html_tags_allowed  = "strong/b,em/i,div[class],span[class|style],img[id|src|class],br,p,apertium-notrans,section[id|class],reference[id|class],h2[class],label[class]"

		// CONFIG CUSTOM PROPIEDADES (configure editor options in component propiedades)		
		if(propiedades_obj.text_editor_options==='full') {
			// CONFIG CUSTOM
			current_menubar  = true,
			current_plugings = [
								"advlist autolink lists link image charmap print preview hr anchor pagebreak",
								"searchreplace visualblocks visualchars code fullscreen",
								"insertdatetime media nonbreaking save table contextmenu directionality",
								"paste textcolor autoresize noneditable",
								], //wordcount
			current_toolbar  = "insertfile undo redo | styleselect | bold italic forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image print preview";
		} 
		
		/*
		let paste_data_images = true // Default tiny is false
		if (text_area_wrapper.dataset.role && text_area_wrapper.dataset.role==="source_lang") {
			// readonly
			paste_data_images = false;
		}*/

		// Clean all editors
		//tinymce.editors=[];
		//console.log(tinyMCE.editors)

		// To cleanly remove an editor instance and avoid any errors
		//tinymce.EditorManager.execCommand('mceRemoveEditor',true, text_area_id);
		tinymce.remove('#'+text_area_id);

		// To reinitialize the instance
		//tinymce.EditorManager.execCommand('mceAddEditor',true, text_area_id); return;

		// INIT TINYMCE
		tinymce.init({
				selector 			: '#'+text_area_id,
				//selector 			: "textarea#"+text_area_id,
				//cache_suffix		: "?v="+page_globals.dedalo_version,
				cache_suffix		: "?"+page_globals.dedalo_version,
				mode 				: "textareas",//"exact",

				// CUSTOM OPTIONS
				inline	 			: current_inline,
				//theme 			: 'inlite',
				menubar  			: current_menubar,
				statusbar 			: current_statusbar,
				toolbar_items_size	: 'small',
				toolbar  			: current_toolbar,				

				// CDN NO COMPATBLE
				plugins  			: current_plugings,

				// CDN COMPATIBLE DEFINITIONS
				/*
				external_plugins: {

					"image" 		: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/image/plugin.min.js",
					"print" 		: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/print/plugin.min.js",
					"searchreplace"	: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/searchreplace/plugin.min.js",
					"code"			: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/code/plugin.min.js",
					"fullscreen" 	: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/fullscreen/plugin.min.js",
					"paste"			: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/paste/plugin.min.js",
					//"wordcount" 	: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/plugins/wordcount/plugin.min.js",
					"nanospell": DEDALO_ROOT_WEB + "/lib/tinymce/nanospell/plugin.js"
				},
				*/
				skin_url 			: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/skins/lightgray",
				theme_url			: DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/themes/modern/theme.min.js?" +page_globals.dedalo_version,


				// ENCODING
				// This option allows you to get XML escaped content out of TinyMCE. By setting this option to xml, posted content will be converted to an XML string escaping characters such as <, >, ", and & to <, >, ", and &.
				// encoding 			: 'xml',
				entity_encoding		: "raw",

				// P : FORCE NO INSERT TINYMCE PARAGRAPS "<p>"
				//v3 force_br_newlines	: true, // need true for webkit
				force_p_newlines		: false,
				forced_root_block		: false, // Needed for 3.x

				// SIZE :
				width 					: '100%',
				height 					: editor_height,

				autoresize_min_height	: 80,
				autoresize_max_height	: 276,
				autoresize_bottom_margin: 10,

				// CSS
				content_css 			: cssFile,
				//skin 					: 'lightgray',
				body_class 				: body_class,

				// IMAGES : Avoid user resize images
				object_resizing			: false,
				paste_block_drop 		: false, // block drag images on true

				// HTML ELEMENTS ALLOWED
				valid_elements 			: html_tags_allowed, //"strong/b,em/i,div[class],span[class],img[id|src|class],br,p",				

				// This option enables or disables the element cleanup functionality. If you set this option to false,
				// all element cleanup will be skipped but other cleanup functionality such as URL conversion will still be executed.
				//v3 verify_html 			: false,		// default false (IMPORTANT FOR IMAGE TAGS ALWAYS SET FALSE)
				//v3 apply_source_formatting : false,

				// Gestion de URL's por tiny. Default is both true
				relative_urls			: false,
				convert_urls			: false,

				// TESTING
				//v3 remove_linebreaks		: false, // remove line break stripping by tinyMCE so that we can read the HTML
				//v3 verify_css_classes 	: false,
				paste_create_linebreaks 	: true, // for paste plugin - single linefeeds are converted to hard line break elements
				paste_auto_cleanup_on_paste : true, // for paste plugin - word paste will be executed when the user copy/paste content
				
				//paste_data_images 			: true, // allow data:url copy images
				//paste_as_text 				: true, // for paste plugin - forces to paste as text by default 15-09-2017
				
				// SPELLCHECKER
				browser_spellcheck 		: true,	// Browser (Chrome) spellchecker bool				
				//spellchecker_rpc_url: DEDALO_ROOT_WEB + '/lib/tinymce/spellchecker/' + 'spellchecker.php',

				schema: 'html5-strict',


				// SETUP EDITOR
				setup : function(ed) {

						// BUTTON GEOREF
						ed.addButton('button_geo', {
							tooltip: 'Add georef',
							image:  '../themes/default/buttons/geo.svg',
							onclick: function(evt) {
								component_text_area.load_tags_geo(ed, evt, text_area_component) //ed, evt, text_area_component
							}
						});

						// BUTTON PERSON
						ed.addButton('button_person', {
							tooltip: 'Add person',
							image:  '../themes/default/buttons/person.svg',
							onclick: function(evt) {
								component_text_area.load_tags_person() //ed, evt, text_area_component
							}
						});

						// BUTTON NOTE
						ed.addButton('button_note', {
							tooltip: 'Add note',
							image:  '../themes/default/buttons/note.svg',
							onclick: function(evt) {
								component_text_area.create_new_note(ed, evt, text_area_component)
							}
						});

						// BUTTON REFERENCE
						ed.addButton('button_reference', {
							tooltip: 'Add reference',
							image:  '../themes/default/buttons/reference.svg',
							onclick: function(evt) {
								component_text_area.create_new_reference(ed, evt, text_area_component)
							}
						});

						// BUTTON_DELETE_STRUCTURATION
						ed.addButton('button_delete_structuration', {
							tooltip: 'Delete structuration',
							text: "Delete chapter",
							onclick: function(evt) {
								tool_lang.delete_structuration(ed, evt, text_area_component)
							}
						});

						// BUTTON_ADD_STRUCTURATION
						ed.addButton('button_add_structuration', {
							tooltip: 'Add structuration',
							text: "Add chapter",
							onclick: function(evt) {
								tool_lang.add_structuration(ed, evt, text_area_component)
							}
						});

						// BUTTON_CHANGE_STRUCTURATION
						ed.addButton('button_change_structuration', {
							tooltip: 'Change structuration',
							text: "Change chapter",
							onclick: function(evt) {
								tool_lang.change_structuration(ed, evt, text_area_component)
							}
						});

						// BUTTON SAVE ADD
						ed.addButton('button_save', {
							text: get_label.salvar,
							tooltip: get_label.salvar,
							icon: false,
							onclick: function(evt) {
								// SAVE COMMAND
								// It will get dirty if the user has made modifications to the contents
								//ed.setDirty(true);	// Force dirty state
								mce_editor.save_command(ed, evt, text_area_component);
							}
						});

						
						// INIT
						ed.on('init', function(evt) {

							// Enable browser spellcheck
							//ed.getBody().setAttribute('spellcheck', true);
							switch(modo) {
								case 'edit':
									// RESIZE VERTICAL . Adjust editor height to wrap height
									//setTimeout(function(){
										if(text_area_wrapper) {											
											let content_data  = text_area_wrapper.querySelector("div.content_data")	
											let target_height = content_data.offsetHeight -70
											if (target_height>90 && ed.theme) {
												ed.theme.resizeTo ('100%', target_height)
												if(SHOW_DEBUG===true) {
													//console.log("resizeTo target_height: " +target_height, text_area_wrapper.id);
												}
											}
										}
									//},900)
									break;
								case 'tool_transcription' :
									// RESIZE VERTICAL . Adjust editor height to wrap height
									//setTimeout(function(){
										if(text_area_wrapper) {
											let warp_height = text_area_wrapper.offsetHeight -100 //parseInt(text_area_wrapper.offsetHeight) -100;
											if (warp_height>100 && ed.theme) {
												//ed.theme.resizeTo ('100%', warp_height)
												tool_transcription.fix_height_of_texteditor()
												if(SHOW_DEBUG===true) {
													//console.log("resizeTo warp_height: " +warp_height);
												}
											}
										}
									//},900)
									tool_transcription.verify_tc_tags(ed)
									break;
								case 'indexation' :
									// Fix text area height on init
									tool_indexation.fix_height() 
									break;
								case 'tool_lang' :
									
									break;
							}												
						});

						
						// POSTRENDER EVENT
						ed.on('PostRender', function(evt){
							// Render tc tags with canvas
							/* window.setTimeout(function(){
								let render_all_tags_promise = component_text_area.render_all_tags(ed, "tc", true)
							}, 1)*/

							// Set tabindex
							let iframe = document.getElementById(ed.id + "_ifr");
							ed.dom.setAttrib(iframe, 'tabindex', 1);

							switch(modo) {
								case 'tool_lang' :
									// Set read only mode when source lang
									if (text_area_wrapper.dataset.role && text_area_wrapper.dataset.role==="source_lang") {
										ed.setMode("readonly")
									}
									// Resize editor height
									let warp_height = window.innerHeight - 250 //parseInt(text_area_wrapper.offsetHeight) -100;
									if (warp_height>100 && ed.theme) {
										ed.theme.resizeTo ('100%', warp_height)
									}
									break;
								case 'tool_indexation' :
									// Set read only mode when source lang
									if (text_area_wrapper.dataset.role && text_area_wrapper.dataset.role!=="source_lang") {
										ed.setMode("readonly")
									}
									break;
							}							

						});


						// FOCUS EVENT
						ed.on('focus', function(evt) {
							// RE-Select elements (IMPORTANT!)
							text_area_component = document.getElementById( ed.id );
							text_area_wrapper	= component_common.get_wrapper_from_element(text_area_component)

							component_common.select_wrap(text_area_wrapper)

							ed.isNotDirty = true; // Force not dirty state
						});// END FOCUS EVENT


						// BLUR EVENT
						ed.on('blur', function(evt) {
							// SAVE COMMAND
							// It will get dirty if the user has made modifications to the contents
							if(SHOW_DEBUG===true) {
								//console.log("triggered blur event from tiny");
								//console.log("ed.isDirty(): "+ed.isDirty());
							}
							// If user has made changes, save content							
							mce_editor.save_command(ed,evt,text_area_component)
						});// END BLUR EVENT


						// CHANGE EVENT
						ed.on('change', function(evt) {
							// SAVE COMMAND
							//if(page_globals.modo=='tool_indexation') mce_editor.save_command(ed,evt,text_area_component);
						});// END BLUR EVENT


						// CLICK EVENT
						ed.on('click', function(evt) {
	
							// Fix text area selection values
							// Note that when in structuration mode, we don't want loose the main editor vars (text_preview editor)
							// and in this case we skip fix this component selected vars (case modal notes text area for example)
							if (page_globals.modo!=='tool_structuration') {
								component_text_area.section_tipo 	= text_area_wrapper.dataset.section_tipo
								component_text_area.section_id 		= text_area_wrapper.dataset.parent
								component_text_area.component_tipo 	= text_area_wrapper.dataset.tipo
								component_text_area.lang 			= text_area_wrapper.dataset.lang
								component_text_area.wrapper_id 		= text_area_wrapper.id
							}
							//component_text_area.tag
							//component_text_area.tag_id

							// IMG : CLICK ON IMG
							if( evt.target.nodeName === 'IMG' || evt.target.nodeName === 'REFERENCE' ) {
								
								// Fix text area selection values
								if (page_globals.modo!=='tool_structuration') {
									component_text_area.tag_obj = evt.target
								}

								// SELECTED_TAG_DATA
								// Fix selected_tag_data var in class component_text_area	
								component_text_area.selected_tag_data = {
										id 				: evt.target.id,
										type 			: evt.target.dataset.type,
										tag_id 			: evt.target.dataset.tag_id,
										state 			: evt.target.dataset.state,
										label 			: evt.target.dataset.label,
										data 			: evt.target.dataset.data,
										component_tipo 	: text_area_wrapper.dataset.tipo,
										lang 			: text_area_wrapper.dataset.lang
									}

								switch(evt.target.className) {
									case 'person':
										// Show person info
										component_text_area.show_person_info( ed, evt, text_area_component )
										break;
									case 'note':
										// Show note info
										component_text_area.show_note_info( ed, evt, text_area_component )
										break;
									case 'reference':										
										if(evt.altKey===true){
											// Select all node to override content
											ed.selection.select(ed.selection.getNode())																			
										}else{
											// Show reference info
											component_text_area.show_reference_info( ed, evt, text_area_component )
										}
										break;
									default:
										// IMAGE COMMAND GENERIG
										mce_editor.image_command( ed, evt, text_area_component )
								}
							}else if( evt.target.nodeName === 'LABEL' ) {
								// Fix text area selection values
								if (page_globals.modo==='tool_lang') {

									component_text_area.show_structuration_info(ed, evt, text_area_component)

									//component_text_area.tag_obj = evt.target
								}
								//reference
							}else{
								// Sets styles on all paragraphs in the currently active editor
								if (ed.dom.select('img').length>0) {
									ed.dom.setStyles(ed.dom.select('img'), {'opacity':'0.8'});
								}
							}// END CLICK ON IMG
						});// END CLICK EVENT

						/*
						// MouseOver EVENT
						ed.on('MouseOver', function(evt) {
							
							if( evt.target.nodeName === 'IMG' && evt.target.className==='person') {
								// Show person info
								//component_text_area.show_person_info( evt )
							}
						});// END MouseOver EVENT

						// MouseOver EVENT
						ed.on('MouseOut', function(evt) {
							
							if( evt.target.nodeName === 'IMG' && evt.target.className==='person') {
								// Show person info
								//component_text_area.show_person_info( evt )
							}
						});// END MouseOut EVENT
						*/

						// MOUSEUP EVENT
						ed.on('MouseUp', function(evt) {
							// CREATE_FRAGMENT_COMMAND
							mce_editor.create_fragment_command(ed,evt,text_area_component)							
						});//END MOUSEUP EVENT

						// KEYPRESS
						ed.on('KeyPress', function(evt) {													
							
							var minor_that_key = 60 // 188
							var more_that_key  = 62	// 190							

							if(evt.keyCode===minor_that_key || evt.keyCode===more_that_key) {
								evt.preventDefault()					
								
								switch(evt.keyCode) {
									case minor_that_key:
										ed.insertContent("[")
										break;
									case more_that_key:
										ed.insertContent("]")
										break;
								}
								alert("Warning! This key is reserved and will be replaced for safe char. Key: " + evt.key + " ["+evt.keyCode+"]" );
							}							
						});						

						// KEY UP EVENT
						ed.on('KeyUp', function(evt) {
							switch(context_name) {
								case 'component_av':
										// Send keys for tool_transcription (F2, ESC, etc..)
										component_text_area.av_editor_key_up(evt);
										break;
								case 'component_image':
										// 114 : Key F2 Write draw tag in text
										var tag_insert_key_cookie = get_localStorage('tag_insert_key')
										var tag_insert_key = tag_insert_key_cookie ? tag_insert_key_cookie : 113; // Default 113 'F2'
										if(evt.keyCode==tag_insert_key) {
											mce_editor.write_tag('draw', ed, evt, text_area_component)
										}
										break;
								case 'component_geolocation':
										// 115 : Key F2 Write geo tag in text
										var tag_insert_key_cookie = get_localStorage('tag_insert_key')
										var tag_insert_key = tag_insert_key_cookie ? tag_insert_key_cookie : 113; // Default 113 'F2'
										if(evt.keyCode==tag_insert_key) {
											mce_editor.write_tag('geo', ed, evt, text_area_component)
										}
										break;
							}
						});//END KEY UP EVENT

				}//end setup
		});//end tinymce.init(

	}//end this.init



	/**
	* WRITE_TAG
	* Build DOM element and writes outerHTML in editor 
	*/
	this.write_tag = function(tag_type, ed, evt, text_area_component) {
	
		// tool_transcription only
		//if(page_globals.modo!=='tool_transcription') return;
		
		var new_tag_id  = component_text_area.get_last_tag_id(ed,tag_type) + 1
		var state 		= 'n'
		var label 		= ''
		var data 		= ''

		// IMG : Create and insert image in text
		var element 	= component_text_area.build_dom_element_from_data(tag_type, new_tag_id, state, label, data)

		ed.selection.setContent( element.outerHTML );
	};//end write_tag



	// SAVE_COMMAND
	this.save_command = function(ed, evt, text_area_component) {

		// REAL TEXT AREA OBJ
		if(text_area_component) {

			// SAVE ON COMPONENT
			var save_arguments = {};
			component_text_area.Save(text_area_component, save_arguments, ed)

			// Notify time machine tool content is changed
			top.component_common.changed_original_content = 1;	//if(SHOW_DEBUG===true) console.log(tool_time_machine.changed_original_content)

			// Tools custom actions
			switch(page_globals.modo) {
				case 'tool_lang':
					// TOOL_LANG . Update paragraph counter (if function exists)
					/*
					if (typeof tool_lang.writeLeftParagraphsNumber === 'function') {
						tool_lang.writeLeftParagraphsNumber();
					}
					if (typeof tool_lang.writeRightParagraphsNumber === 'function') {
						tool_lang.writeRightParagraphsNumber();
					}*/
					break;
				case 'tool_structuration':
					if (component_text_area.is_tiny(ed)===true) {
						// Case saving elements in modal window like notes, etc..
						// NOthing to do now
					}else{
						// Case saving text preview element
						var text_preview = window.parent.document.getElementById('text_preview')
						if (text_preview) {
							// Updates preview with editor contents
							text_preview.innerHTML = ed.getContent()
						}
					}								
					break;
			}			

		}else{
			alert("[mce_editor.save_command] Errro. text_area_component not found: "+ text_area_component);
		}
	}//end save_command



	/**
	* IMAGE_COMMAND
	*  Control de imágenes tags de indexaciones, geo, etc. (ACTION ON CLICK)
	*/
	this.image_command = function(ed, evt, text_area_component) {
		
		// TAG 
		// tag is full tag like: 
		// [geo-n-3-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties'…pe':'Point','coordinates':[0.3543322160840035,40.424776191320426]}}]}:data]
		var tag_obj = evt.target
		var type 	= tag_obj.dataset.type		

		switch(type) {

			// TC TAG : CONTROL VIDEO PLAYER
			case ('tc') :
					// Video goto timecode by tc tag
					var timecode = evt.target.dataset.data
					component_text_area.goto_time(timecode);	//alert(tc)
					// Sets styles on all paragraphs in the currently active editor
					//ed.dom.setStyles(ed.dom.select('img'), {'opacity' : 'initial'});
					break;

			// INDEX TAG 
			case ('indexIn') :
			case ('indexOut') :
	
					var tipo 			= text_area_component.dataset.tipo
					var	lang 			= text_area_component.dataset.lang
					var	section_tipo 	= text_area_component.dataset.section_tipo
					var	parent 			= text_area_component.dataset.parent

					switch(page_globals.modo) {

						case 'edit' :
								// INSPECTOR : Show info about indexations in inspector
								tool_indexation.load_inspector_indexation_list(tag_obj, tipo, parent, section_tipo, lang)
								
								// RELATIONS
								//component_text_area.load_relation(tag, tipo, parent, section_tipo);								
								//alert("Show info about in inspector relations - context_name:"+get_current_url_vars()['context_name'])							

								// PORTAL SELECT FRAGMENT FROM TAG BUTTON
								if (page_globals.context_name=='list_into_tool_portal') {
									// Show hidden button link_fragmet_to_portal and configure to add_resource
									component_text_area.show_button_link_fragmet_to_portal(tag_obj, tipo, parent, section_tipo);										
								}
								break;

						case 'tool_indexation' :
								// Show info about in tool relation window
								component_text_area.load_fragment_info_in_indexation(tag_obj, tipo, parent, section_tipo, lang);	//alert(tag+' - '+ tipo+' - '+ parent)
								break;
					}
					// mask_tags on click image index
					mce_editor.mask_tags(ed, evt);
					break;

			// SVG TAG
			case ('svg') :
					// Click action
					/*
					// Load svg editor
					switch(page_globals.modo) {

						case 'tool_transcription' :
							if (typeof component_image=="undefined") {
								console.warn("[mde_editor.image_command] component_image class is not avilable. Ignored svg action");	
							}else{
								component_image.load_svg_editor(tag_obj);
							}
							break;

						case 'edit' :
							var canvas_id = text_area_component.dataset.canvas_id;
							if (typeof component_image_read !== "undefined") {
								component_image_read.load_svg_editor_read(tag_obj, canvas_id);
							}else{
								console.log("component_image_read is lod loaded! Ignoring action load_svg_editor_read");
							}
							break;
					}*/
					break;

			// DRAW TAG
			case ('draw') :

					// Load draw editor
					switch(page_globals.modo) {

						case 'tool_transcription' :
							if (typeof component_image==="undefined") {
								console.warn("[mde_editor.image_command] component_image class is not avilable. Ignored draw action");	
							}else{
								component_image.load_draw_editor(tag_obj);
							}
							break;

						case 'edit' :
							var canvas_id = text_area_component.dataset.canvas_id;
							if (typeof component_image_read!=="undefined") {
								component_image_read.load_draw_editor_read(tag_obj, canvas_id);
							}else{
								console.log("component_image_read is lod loaded! Ignoring action load_draw_editor_read");
							}
							break;
					}
					break;

			// GEO TAG
			case ('geo') :
	
					// Load geo editor
					switch(page_globals.modo) {
						case 'edit' :
						case 'tool_transcription' :
							if (typeof component_geolocation==="undefined") {
								console.warn("[mde_editor.image_command] component_geolocation class is not avilable. Ignored geo action");	
							}else{
								component_geolocation.load_geo_editor(tag_obj);
							}							
							break;
					}
					break;
		}//end switch

	}//end image_command



	/**
	* MASK_TAGS
	*/
	this.mask_tags = function(ed, evt) {

		var tag = evt.target.id
			//console.log(tag);

		// Calculate common tag_base from current tag. Like 'index-n-1' from '[/index-d-1]'
		var myRe 	 = new RegExp("(index)-[a-z]-([0-9]+)", "");
		var tag_base = myRe.exec(tag);
			//console.log( tag_base );

		// Iterate all content images and filter by regex
		var images = ed.dom.select('img')
			//console.log(images);
		var opacity_changed = 0;
		var i_len = images.length
		for (var i = i_len - 1; i >= 0; i--) {
			
			var current_image = images[i]
				//console.log('current_image.id: '+current_image.id);
			current_image.style.opacity = 1;

			var search = myRe.exec(current_image.id);
				//console.log(search);
			if (search && search[2]==tag_base[2]) {
				//console.log(search);
				current_image.style.opacity = 1;
				opacity_changed ++
			}else{
				current_image.style.opacity = 0.15;
			}
		}

		if (opacity_changed<2) alert("Warning: Tag pair is damaged. Only one tag exists in text")
		if (opacity_changed>2) alert("Warning: Tag pair is incorrect. More than 2 tags with same number exists. Please, review this tag integrity")

		return false;
	}//end mask_tags



	/**
	* CREATE_FRAGMENT_COMMAND
	*/
	this.create_fragment_command = function(ed,evt,text_area_component) {

		// Tool indexation
		//if(page_globals.modo=='tool_indexation') {

			// Btn create fragment
			var btn_create_fragment = $(text_area_component).parent('.content_data').first().children('.btn_create_fragment');

			// Show / hide button create fragment if current_selection.length > 1
			var current_selection = ed.selection.getContent({format : 'text'});

			if (current_selection.length>1) {
				$(btn_create_fragment).fadeIn(100);		//if(SHOW_DEBUG===true) console.debug('btn_create_fragment -> fadeIn');
				$('.indexation_page_list').html(current_selection);
			}else{
				$(btn_create_fragment).fadeOut(100);	//if(SHOW_DEBUG===true) console.debug('btn_create_fragment -> fadeOut');
				$('.indexation_page_list').html('');
			}
		//}
	}//end create_fragment_command





};//end mce_editor class