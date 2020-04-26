"use strict";
/**
* COMPONENT_HTML_TEXT_EDITOR
*
*
*/
var component_html_text_editor = new function() {

	// CONTEXT : Get from url
	var context = get_current_url_vars()['context'];


	/**
	* INIT
	* @param Propiedades es opcional. Si se pasa, será un string en formato json del tipo {"component_html_text_editor_options":"full"}
	*/
	this.init = function (html_text_id, modo, propiedades) {


		// Verify html_text_id is valid
		if (typeof html_text_id==='undefined') return false;

		let component_html_text = document.getElementById(html_text_id)
			if(!component_html_text) {
				if(SHOW_DEBUG) console.log("Ops.. component_html_text not found. html_text_id: "+html_text_id)
				return false;
			}

		let component_wrapper 	= component_common.get_wrapper_from_element(component_html_text)

		// editor_height
			// let	editor_height	= (parseInt(window.getComputedStyle(component_wrapper).height)-60) || 125 //126
			// if(!editor_height) {
			// 	editor_height = 125
			// }
			// switch(modo) {
			// 	case 'tool_lang' :
			// 		editor_height = 407 - 50
			// 		break;
			// 	default :

			// 		break;
			// }

		// cssFile
			const cssFile = DEDALO_LIB_BASE_URL + '/component_html_text/css/' + 'component_html_text_editor_default.css?' + page_globals.dedalo_version

		// config custom propiedades (configure editor options in component propiedades)
			// try {
			// 	//console.log(propiedades)
			// 	if(typeof propiedades!='undefined' && propiedades!='null') {
			// 		var propiedades_obj = $.parseJSON(propiedades);
			// 			// under construction
			// 	}
			// }catch(e){
			// 	console.log(e); // pass exception object to error handler
			// }

		// lang. editor localization
			const ar_lang_files = ["lg-cat","lg-spa","lg-deu","lg-ell"]
			const file_lang 	= (ar_lang_files.indexOf(page_globals.dedalo_application_lang)!==-1) ? page_globals.dedalo_application_lang : ""

		// upload pluploader
			const PluploadHandler = function( $, plupload ) {
				var self = this;
				this.plupload = plupload;

				// Custom example logic
				this.uploader = new plupload.Uploader({
					runtimes 			: 'html5,flash,silverlight,html4',
					browse_button 		: document.getElementById('upload-'+html_text_id),
					url 				: DEDALO_ROOT_WEB + '/lib/tinymce/plupload/upload.php',
					flash_swf_url 		: DEDALO_ROOT_WEB + '/lib/tinymce/plupload/js/Moxie.swf',
					silverlight_xap_url : DEDALO_ROOT_WEB + '/lib/tinymce/plupload/js/Moxie.xap',
					drop_element 		: "dropFilesHere",

					filters : {
						max_file_size : '10mb',
						mime_types: [
							{title : "Image files", extensions : "jpg,jpeg,gif,png"}
						]
					},
					init: {
						PostInit: function() {
							$('.filelist').html('');
						},
						Error: function(up, err) {
							console.log("\nError #" + err.code + ": " + err.message);
						}
					}
				});

			  this.uploader.init();
				this.uploader.bind("FilesAdded", handlePluploadFilesAdded);
				this.uploader.bind("FileUploaded", handlePluploadFileUploaded);

				function handlePluploadFilesAdded(up, files) {
					console.log("+ handlePluploadFilesAdded");
					up.start();
				}

				function handlePluploadFileUploaded(up, file, res) {
					console.log("++ res.response: " + JSON.stringify(res.response));
					var img = "<img src='" + res.response + "?" + Date.now() + "'>";
					tinymce.activeEditor.execCommand('mceInsertContent', false, img);
				}
			}//end PluploadHandler

		// plugins
			const plugins = [
				"advlist autolink lists link image charmap print preview hr anchor pagebreak",
				"searchreplace wordcount visualblocks visualchars code fullscreen",
				"insertdatetime nonbreaking save table contextmenu directionality",
				"emoticons template paste textcolor" // autoresize
			]

		// remove. To cleanly remove an editor instance and avoid any errors
			tinymce.remove('#'+html_text_id);


		// INIT TINYMCE
		tinymce.init({
				selector 			:'#'+html_text_id,
				cache_suffix 		: '?'+page_globals.dedalo_version,
				mode 				: "textareas",

				// CUSTOM OPTIONS
				inline   			: false,
				menubar  			: false,
				statusbar 			: true,
				toolbar_items_size 	: 'small',

				plugins  			: plugins,

				toolbar1  			: "bold italic undo redo searchreplace | cut copy paste pastetext | alignleft aligncenter alignright alignjustify | forecolor backcolor | bullist numlist outdent indent table",
				toolbar2  			: "link image | fontsizeselect | print preview fullscreen | code | upload ",

				language  			: file_lang,

				// ENCODING
				entity_encoding     : "raw",    // named , numeric , raw

				// // P : FORCE NO INSERT TINYMCE PARAGRAPS "<p>"
				// force_br_newlines   : true,     // need true for webkit
				// force_p_newlines    : false,
				// forced_root_block   : false,    // Needed for 3.x

				force_p_newlines		: false,
				forced_root_block		: false,

				// SIZE :
				width                   : '100%',
				// height                  : editor_height,
				resize 					: true, // Possible Values: true, false, 'both'

				autoresize_min_height	: 80,
				autoresize_max_height	: 276,
				autoresize_bottom_margin: 10,

				// CSS
				content_css             : cssFile,
				skin                  	: 'lightgray',

				image_advtab			: true,

				// SPELLCHECKER
				browser_spellcheck 		: true,	// Browser (Chrome) spellchecker bool

				// // IMAGES : Avoid user resize images
 				// object_resizing         : false,
 				// paste_block_drop        : false,    // block drag images on true

 				// // HTML ELEMENTS ALLOWED
 				// //valid_elements            : "strong/b,em/i,div[class],span[class],img[id|src|class],br,p,apertium-notrans", //"strong/b,em/i,div[class],span[class],img[id|src|class],br,p",

 				// // This option enables or disables the element cleanup functionality. If you set this option to false,
 				// // all element cleanup will be skipped but other cleanup functionality such as URL conversion will still be executed.
 				// verify_html             : false,        // default false (IMPORTANT FOR IMAGE TAGS ALWAYS SET FALSE)
 				// apply_source_formatting : false,

 				// // Gestion de URL's por tiny. Default is both true
 				// relative_urls           : false,
 				// convert_urls            : false,

				// // TESTING
				// remove_linebreaks           : false,    // remove line break stripping by tinyMCE so that we can read the HTML
				// //paste_create_linebreaks   : true,     // for paste plugin - single linefeeds are converted to hard line break elements
				// paste_auto_cleanup_on_paste : true,     // for paste plugin - word paste will be executed when the user copy/paste content
				// verify_css_classes          : false,

				// SETUP EDITOR
				setup : function(ed) {

						// Upload button
						ed.addButton('upload', {
							type 	: 'button',
							title 	: 'Insert image desde disco',
							icon 	: 'image',
							id 		: 'upload-'+html_text_id
						});

						// Init
						ed.on('init', function(evt) {
							// Enable browser spellcheck
							// ed.getBody().setAttribute('spellcheck', true);
							// Enable file upload manager
							if (modo==='edit') {
								let pluploadHandler = new PluploadHandler(jQuery, plupload, 'html', 800)
							}

							// height adjust
								switch(modo) {
									case 'edit':
									default:
										let content_data  = component_wrapper.querySelector("div.content_data")
										let target_height = content_data.offsetHeight - 120
										if (target_height>90 && ed.theme) {
											ed.theme.resizeTo ('100%', target_height)
											if(SHOW_DEBUG===true) {
												//console.log("resizeTo target_height: " +target_height, component_wrapper.id);
											}
										}
										break;
								}

							// resizehandle. allow resize to down removing wrapper height
							// mce-flow-layout-item mce-resizehandle mce-last
								const resizehandle = component_wrapper.querySelector('.mce-resizehandle')
								if (resizehandle) {
									resizehandle.addEventListener("mousedown", function(evt){
										component_wrapper.style.height = "auto"
									}, false)
								}
						});


						// PostRender
						ed.on('PostRender', function(evt){

							// Set tabindex
							const iframe = document.getElementById(ed.id + "_ifr");
							ed.dom.setAttrib(iframe, 'tabindex', 1);

							// resize in tool
							switch(modo) {
								case 'tool_lang' :
									// Set read only mode when source lang
									if (component_wrapper.dataset.role && component_wrapper.dataset.role==="source_lang") {
										ed.setMode("readonly")
									}
									// Resize editor height based on window instead wrapper
									// const base_height = window.innerHeight - 270
									// if (base_height>100 && ed.theme) {
									// 	ed.theme.resizeTo(null, base_height)
									// }
									break;
							}

						});//end PostRender


						// FOCUS EVENT
						ed.on('focus', function(evt) {
							// RE-Select elements (IMPORTANT!)
							component_html_text = document.getElementById( ed.id );
							component_wrapper	= component_common.get_wrapper_from_element(component_html_text)

							component_common.select_wrap(component_wrapper)

							ed.isNotDirty = true; // Force not dirty state
						});// END FOCUS EVENT


						// Blur event
						ed.on('blur', function(evt) {
							// SAVE COMMAND
							// It will get dirty if the user has made modifications to the contents
							if(ed.isDirty()) {
								component_html_text_editor.save_command(ed,evt,component_html_text);
							}
						});// end blur event


						// Click event
						ed.on('click', function(evt) {
							// Select current wrap
							const current_wrap = component_common.get_wrapper_from_element(component_html_text) //$(component_html_text).parents('.wrap_component').first()
							component_common.select_wrap(current_wrap);
						});// end click event

						// // CHANGE EVENT
						// ed.on('change', function(evt) {
						// 	// Nothing to do
						// });// END BLUR EVENT

 						// // MOUSEUP EVENT
 						// ed.on('MouseUp', function(evt) {
 						// 	// Nothing to do
 						// });//END MOUSEUP EVENT

 						// // KEY UP EVENT
 						// ed.on('KeyUp', function(evt) {
 						// 	// Nothing to do
						// });//END KEY UP EVENT

				}//end setup
		});

		return true
	}//end init



	/**
	* SAVE_COMMAND
	*/
	this.save_command = function(ed, evt, obj_html_text) {

		//
		// DATO : Overwrite
		// Reemplazamos el dato a guardar (que sería el contenido del textarea real) por el contenido del editor (tinyMCE)
		// eliminando los saltos de línea (IMPORTANTE!)
		var text = ed.getContent();
			text = text.replace(/(\r\n|\n|\r)/gm," ");
			component_html_text.save_arguments.dato = text;


		// REAL TEXT AREA OBJ
		if(obj_html_text) {

			var text_area_id = obj_html_text.id;

			// FORCE UPDATE REAL TEXT AREA CONTENT
			tinyMCE.triggerSave();      //alert(ed.getContent())

			// SAVE REAL TEXTAREA CONTENTS
			component_html_text.Save(obj_html_text);        if(SHOW_DEBUG===true) console.log("-> trigger Save from tinyMCE " + text_area_id);
			//var text = ed.getContent();
			//$(obj_html_text).val( escape('xxx '+text) );  console.log($(obj_html_text))
			//component_html_text.Save(obj_html_text);
			//alert( $(obj_html_text).val() )

			// Notify time machine tool content is changed
			top.component_common.changed_original_content = 1;   //if(SHOW_DEBUG===true) console.log(tool_time_machine.changed_original_content)

			//if(SHOW_DEBUG===true) console.log( obj_html_text )
		}else{
			alert("text editor obj_html_text not found "+ text_area_id);
		}
	}//end save_command



};//end component_html_text_editor class
