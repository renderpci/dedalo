/**
* TEXT EDITOR CLASS
*
*
*
*/
var text_editor = new function() {


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
	*	Propiedades es opcional. Si se pasa, será un string en formato json del tipo {"text_editor_options":"full"}
	*/
	this.init = function (text_area_id, modo, propiedades) {

		// Verify text_area_id is valid
		if (typeof text_area_id === 'undefined') return ;
		//if(DEBUG) console.log("->text_editor.init: "+text_area_id)

		//var text_area_component = $('#'+text_area_id);
		var text_area_component = document.getElementById(text_area_id)
			if(!text_area_component) {
				if(DEBUG) console.log("Ops.. text_area_component not found. text_area_id: "+text_area_id);
				return false;
			}

		var	obj_warp 			= component_common.get_wrapper_from_element(text_area_component)	//document.getElementById(text_area_component.dataset.id_wrapper),
		var	cssFile				= DEDALO_LIB_BASE_URL + '/component_text_area/css/' + 'text_editor_default.css?' + page_globals.dedalo_version
		var	editor_height		= 100
	
		// tabindex heritage from textarea
		//var text_area_tabindex = text_area_component.getAttribute('tabindex')
		//$('#'+text_area_id+'_ifr').attr('tabindex', 1);
		//text_area_component.setAttribute('tabindex',null);

		// CONFIG DEFAULT
		var current_inline 	 = false
		var	current_menubar  = false
		var	current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_save"
		var current_statusbar= true
		var	current_plugings = [
								"paste image print",
								"searchreplace code fullscreen noneditable",// "wordcount"
								]

		switch(modo) {
			case 'tool_transcription':
					cssFile 		= DEDALO_LIB_BASE_URL + '/component_text_area/css/' + 'text_editor_tool_transcription.css?' + page_globals.dedalo_version
					editor_height 	= 597 -70
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_person button_save"
					break;
			case 'tool_structuration':
					cssFile 		= DEDALO_LIB_BASE_URL + '/component_text_area/css/' + 'text_editor_tool_transcription.css?' + page_globals.dedalo_version
					editor_height 	= 597 -70
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_note button_person button_save"
					break;		
			case 'tool_lang':
					editor_height 	= 407 -70
					break;
			case 'tool_indexation':
					editor_height 	= 250
					break;
			case 'edit_note':
					current_toolbar  = "bold italic undo redo searchreplace pastetext code fullscreen | button_save"
					current_inline   = false
					current_statusbar= false
					editor_height    = 270
					break;
			default:					
					break;
		}

		// HTML_TAGS_ALLOWED . Any others will be removed on save
		var html_tags_allowed = "strong/b,em/i,div[class],span[class],img[id|src|class],br,p,apertium-notrans,section[id|class]"

		// CONFIG CUSTOM PROPIEDADES (configure editor options in component propiedades)		
		//console.log(propiedades)
		if(typeof propiedades!=='undefined' && propiedades!='null') {
			//var propiedades_obj = $.parseJSON(propiedades);
			var propiedades_obj = JSON.parse(propiedades);
			if( propiedades_obj.text_editor_options==='full') {
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
		}
		

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
				plugins  : current_plugings,

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
				entity_encoding		: "raw",

				// P : FORCE NO INSERT TINYMCE PARAGRAPS "<p>"
				//v3 force_br_newlines	: true, // need true for webkit
				force_p_newlines		: false,
				forced_root_block		: false, // Needed for 3.x

				// SIZE :
				width 					: '100%',
				height 					: editor_height,

				autoresize_min_height	: 88,
				autoresize_max_height	: 276,
				autoresize_bottom_margin: 10,

				// CSS
				content_css 			: cssFile,
				//skin 					: 'lightgray',

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

				// SPELLCHECKER
				browser_spellcheck 		: true,	// Browser (Chrome) spellchecker bool				
				//spellchecker_rpc_url: DEDALO_ROOT_WEB + '/lib/tinymce/spellchecker/' + 'spellchecker.php',

				schema: 'html5-strict',

				// SETUP EDITOR
				setup : function(ed) {

						// BUTTON PERSON
						ed.addButton('button_person', {
							//text: 'Persons',//get_label.salvar,
							tooltip: 'Add person',
							image: tinymce.baseURL + '/buttons/person.svg',
							onclick: function(evt) {
								component_text_area.load_tags_person()
							}
						});

						// BUTTON NOTE
						ed.addButton('button_note', {
							//text: 'notes',//get_label.salvar,
							tooltip: 'Add note',
							image: tinymce.baseURL + '/buttons/note.svg',
							onclick: function(evt) {
								component_text_area.create_new_note()
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
								text_editor.save_command(ed,evt,text_area_component);
							}
						});

						
						// INIT
						ed.on('init', function(evt) {
							// Enable browser spellcheck
							//ed.getBody().setAttribute('spellcheck', true);
							switch(modo) {
								case 'edit':
									// RESIZE VERTICAL . Adjust editor height to wrap height
									setTimeout(function(){
										if(obj_warp) {
											var warp_height = obj_warp.offsetHeight -100 //parseInt(obj_warp.offsetHeight) -100;
											if (warp_height>100 && ed.theme) {
												ed.theme.resizeTo ('100%', warp_height)
												if(SHOW_DEBUG===true) {
													//console.log("resizeTo warp_height: " +warp_height);
												}
											}
										}
									},900)
									break;
								case 'tool_transcription' :
									// RESIZE VERTICAL . Adjust editor height to wrap height
									//setTimeout(function(){
										if(obj_warp) {
											var warp_height = obj_warp.offsetHeight -100 //parseInt(obj_warp.offsetHeight) -100;
											if (warp_height>100 && ed.theme) {
												ed.theme.resizeTo ('100%', warp_height)
												if(SHOW_DEBUG===true) {
													//console.log("resizeTo warp_height: " +warp_height);
												}
											}
										}
									//},900)
									break;
								case 'indexation' :
									// Fix text area height on init
									tool_indexation.fix_height() 
									break;
							}							
						});

						
						// POSTRENDER EVENT
						ed.on('PostRender', function(evt){
							// Set tabindex
							var iframe = document.getElementById(ed.id + "_ifr");
							ed.dom.setAttrib(iframe, 'tabindex', 1);
						});


						// FOCUS EVENT
						ed.on('focus', function(evt) {
							// RE-Select elements (IMPORTANT!)
							text_area_component = document.getElementById( ed.id );
							//obj_warp 			= document.getElementById( text_area_component.dataset.id_wrapper );
							obj_warp 			= component_common.get_wrapper_from_element(text_area_component)

							component_common.select_wrap(obj_warp)

							ed.isNotDirty = true; // Force not dirty state
						});// END FOCUS EVENT


						// BLUR EVENT
						ed.on('blur', function(evt) {
							// SAVE COMMAND
							// It will get dirty if the user has made modifications to the contents
							if(DEBUG) {
								//console.log("ed.isDirty(): "+ed.isDirty());
							}
							// If user has made changes, save content							
							text_editor.save_command(ed,evt,text_area_component);				
						});// END BLUR EVENT


						// CHANGE EVENT
						ed.on('change', function(evt) {
							// SAVE COMMAND
							//if(page_globals.modo=='tool_indexation') text_editor.save_command(ed,evt,text_area_component);
						});// END BLUR EVENT


						// CLICK EVENT
						ed.on('click', function(evt) {

							// Fix text area selection values
							component_text_area.section_tipo 	= obj_warp.dataset.section_tipo
							component_text_area.section_id 		= obj_warp.dataset.parent
							component_text_area.component_tipo 	= obj_warp.dataset.tipo
							component_text_area.lang 			= obj_warp.dataset.lang
							component_text_area.wrapper_id 		= obj_warp.id
							//component_text_area.tag
							//component_text_area.tag_id

							// IMG : CLICK ON IMG
							if( evt.target.nodeName === 'IMG' ) {
								
								// Fix text area selection values
								component_text_area.tag_obj = evt.target

								switch(evt.target.className) {
									case 'person':
										// Show person info
										component_text_area.show_person_info( evt )
										break;
									case 'note':
										// Show note info
										component_text_area.show_note_info( evt )
										break;
									default:
										// IMAGE COMMAND GENERIG
										text_editor.image_command(ed, evt,text_area_component)
								}
							}else{
								// Sets styles on all paragraphs in the currently active editor
								if (ed.dom.select('img').length>0) {
									ed.dom.setStyles(ed.dom.select('img'), {'opacity' : '0.8'});
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
							text_editor.create_fragment_command(ed,evt,text_area_component)
							
						});//END MOUSEUP EVENT


						// KEY UP EVENT
						ed.on('KeyUp', function(evt) {

							//tinyMCE.activeEditor.selection.select(tinyMCE.activeEditor.dom.select('img')[0]);
							//tinyMCE.activeEditor.selection.setNode(tinyMCE.activeEditor.dom.create('img', {src : 'some.gif', title : 'some title'}));
							//tinyMCE.activeEditor.selection.setNode(tinyMCE.activeEditor.dom.select('img', {id : '[index-n-1]'}));

							//var index_id = ed.dom.encode('[index-n-1]')
							//console.log(  index_id  );
							//tinyMCE.activeEditor.selection.select(tinymce.activeEditor.dom.select( encodeURI('#[mytc') )[0]); //#[index-n-1]
							//var $ = tinyMCE.dom.DomQuery;
							//$('img').attr('id', 'mytc').addClass('tool_lang_icon_inline');
							//console.log($('img').attr('id','#\\[index-n-1\\]'));
							//tinyMCE.activeEditor.selection.setNode(tinyMCE.activeEditor.dom.select('img', {'id' : 'mytc'} ));

							//var AAR = tinymce.dom.DomQuery; 	console.log(AAR('img').length);
							//$('img').attr('id', 'mytc').addClass('tool_lang_icon_inline');
							switch(context_name) {
								case 'component_av':
										// Send keys for tool_transcription (F2, ESC, etc..)
										component_text_area.av_editor_key_up(evt);
										break;

								case 'component_image':
										// 114 : Key F3 (114) Write svg tag in text
										var tag_insert_key_cookie = get_localStorage('tag_insert_key')
										var tag_insert_key = tag_insert_key_cookie ? tag_insert_key_cookie : 113; // Default 113 'F2'
										if(evt.keyCode==tag_insert_key) {
											text_editor.write_tag('svg', ed, evt, text_area_component)
										}
										break;

								case 'component_geolocation':
										// 115 : Key F4 (115) Write geo tag in text
										var tag_insert_key_cookie = get_localStorage('tag_insert_key')
										var tag_insert_key = tag_insert_key_cookie ? tag_insert_key_cookie : 113; // Default 113 'F2'
										if(evt.keyCode==tag_insert_key) {
											text_editor.write_tag('geo', ed, evt, text_area_component)
										}
										break;
							}
						});//END KEY UP EVENT

				}//end setup
		});

	}//end this.init



	/**
	* WRITE_TAG
	* Build DOM element and writes outerHTML in editor 
	*/
	this.write_tag = function(tag_type, ed, evt, text_area_component) {

		// tool_transcription only
		if(page_globals.modo!=='tool_transcription') return;
		
		var new_tag_id  = component_text_area.get_last_tag_id(ed,tag_type) + 1
		var state 		= 'n'
		var label 		= ''
		var data 		= ''

		// IMG : Create and insert image in text
		var element 	= component_text_area.build_dom_element_from_data(tag_type, new_tag_id, state, label, data)

		ed.selection.setContent( element.outerHTML );
	};//end write_tag



	// SAVE_COMMAND
	this.save_command = function(ed,evt,text_area_component) {

		// REAL TEXT AREA OBJ
		if(text_area_component) {

			// SAVE ON COMPONENT
			var save_arguments = {};
			component_text_area.Save(text_area_component, save_arguments, ed);			

			// Notify time machine tool content is changed
			top.changed_original_content = 1;	//if (DEBUG) console.log(tool_time_machine.changed_original_content)

			// Tools custom actions
			switch(page_globals.modo) {
				case 'tool_lang':
					// TOOL_LANG . Update paragraph counter (if function exists)
					if (typeof tool_lang.writeLeftParagraphsNumber === 'function') {
						tool_lang.writeLeftParagraphsNumber();
					}
					if (typeof tool_lang.writeRightParagraphsNumber === 'function') {
						tool_lang.writeRightParagraphsNumber();
					}
					break;
				case 'tool_structuration':
					var text_preview = window.parent.document.getElementById('text_preview')
						if (text_preview) {
							// Updates preview with editor contents
							text_preview.innerHTML = ed.getContent()					
						}					
					break;
			}			

		}else{
			alert("text editor text_area_component not found: "+ text_area_component);
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
								//if (context_name=='list_into_tool_portal') {
									// Show hidden button link_fragmet_to_portal and configure to add_resource
									component_text_area.show_button_link_fragmet_to_portal(tag_obj, tipo, parent, section_tipo);										
								//}
								break;

						case 'tool_lang' :
								// Show info about in tool lang window
								component_text_area.load_fragment_info(tag_obj, tipo, lang);
								break;

						case 'tool_indexation' :
								// Show info about in tool relation window
								component_text_area.load_fragment_info_in_indexation(tag_obj, tipo, parent, section_tipo, lang);	//alert(tag+' - '+ tipo+' - '+ parent)
								break;
					}
					// mask_tags on click image index
					text_editor.mask_tags(ed, evt);
					break;

			// SVG TAG
			case ('svg') :

					// Load svg editor
					switch(page_globals.modo) {

						case 'tool_transcription' :
							component_image.load_svg_editor(tag_obj);
							break;

						case 'edit' :
							var canvas_id = text_area_component.dataset.canvas_id;
							component_image_read.load_svg_editor_read(tag_obj, canvas_id);
							break;
					}
					break;

			// GEO TAG
			case ('geo') :

					// Load geo editor
					switch(page_globals.modo) {
						case 'edit' :
						case 'tool_transcription' :							
							component_geolocation.load_geo_editor(tag_obj);
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
				$(btn_create_fragment).fadeIn(100);		//if (DEBUG) console.debug('btn_create_fragment -> fadeIn');
				$('.indexation_page_list').html(current_selection);
			}else{
				$(btn_create_fragment).fadeOut(100);	//if (DEBUG) console.debug('btn_create_fragment -> fadeOut');
				$('.indexation_page_list').html('');
			}
		//}
	}//end create_fragment_command





};//end text_editor class