// JavaScript Document
// TEXT EDITOR


// TEXT EDITOR CLASS
var component_html_text_editor = new function() {

	// CONTEXT : Get from url
	var context = get_current_url_vars()['context'];

	
	/**
	* INIT
	* @param Propiedades es opcional. Si se pasa, será un string en formato json del tipo {"component_html_text_editor_options":"full"} 
	*/
	this.init = function (html_text_id, modo, propiedades) {
		//console.log(html_text_id)


		// Verify html_text_id is valid
		if (typeof html_text_id == 'undefined') return false;

		//if(DEBUG) console.log("->component_html_text_editor.init: "+html_text_id)

		var component_html_text = $('#'+html_text_id);
		var cssFile, 
			editor_height = 150;
		
		switch(modo) {          
			case 'tool_lang' :
					editor_height   = 307 -70;
					//break;
			default :
					cssFile = DEDALO_LIB_BASE_URL + '/component_html_text/css/' + 'component_html_text_editor_default.css';
		}
		/*
		// CONFIG CUSTOM PROPIEDADES (configure editor options in component propiedades)
		try {           
			//console.log(propiedades)
			if(typeof propiedades!='undefined' && propiedades!='null') {
				var propiedades_obj = $.parseJSON(propiedades);
					// under construction               
			}
		}catch(e){
			console.log(e); // pass exception object to error handler           
		}
		*/                      
				
		// LANG . EDITOR LOCALIZATION
		var file_lang = '';
		if(page_globals.dedalo_application_lang=='lg-cat' || page_globals.dedalo_application_lang=='lg-spa' || page_globals.dedalo_application_lang=='lg-fra') {
			file_lang = page_globals.dedalo_application_lang
		}


		/*
		switch(page_globals.dedalo_application_lang) {          
			case 'lg-cat' :
					file_lang   = 'ca';
					break;

			case 'lg-spa' :
					file_lang   = 'es';
					break;

			case 'lg-fra' :
					file_lang   = 'fr_FR';
					break;
			default :
					file_lang   = '';
		}*/

		// To cleanly remove an editor instance and avoid any errors
		//tinymce.EditorManager.execCommand('mceRemoveEditor',true, html_text_id);
		tinymce.remove('#'+html_text_id);
		

		// INIT TINYMCE
		tinymce.init({
				
				selector :'#'+html_text_id,
						
				// CUSTOM OPTIONS
				inline   : false,
				menubar  : false, 
				toolbar_items_size: 'small',

				plugins  : [
							"advlist autolink lists link image charmap print preview hr anchor pagebreak",
							"searchreplace wordcount visualblocks visualchars code fullscreen",
							"insertdatetime nonbreaking save table contextmenu directionality",
							"emoticons template paste textcolor"
							], 
							//media
				//toolbar  : "bold italic undo redo code fullscreen",  bullist numlist outdent indent | link image
				toolbar1  : "bold italic undo redo searchreplace | cut copy paste pastetext | alignleft aligncenter alignright alignjustify | forecolor backcolor | bullist numlist outdent indent",
				toolbar2  : "link image | fontsizeselect | print preview fullscreen | code ",
				language : file_lang,

				// ENCODING 
				entity_encoding     : "raw",    // named , numeric , raw

				/*
				// P : FORCE NO INSERT TINYMCE PARAGRAPS "<p>"      
				force_br_newlines   : true,     // need true for webkit
				force_p_newlines    : false,
				forced_root_block   : false,    // Needed for 3.x   
				*/          

				// SIZE :
				width                   : '100.5%',
				height                  : editor_height,                
				//autoresize_min_height : 88,
				//autoresize_max_height : 276,
				
				// CSS
				content_css             : cssFile,
				//skin                  : 'lightgray',

				image_advtab			: true,
				

				/*
				// IMAGES : Avoid user resize images
				object_resizing         : false,
				paste_block_drop        : false,    // block drag images on true

				// HTML ELEMENTS ALLOWED
				//valid_elements            : "strong/b,em/i,div[class],span[class],img[id|src|class],br,p,apertium-notrans", //"strong/b,em/i,div[class],span[class],img[id|src|class],br,p",
				
				// This option enables or disables the element cleanup functionality. If you set this option to false, 
				// all element cleanup will be skipped but other cleanup functionality such as URL conversion will still be executed.
				verify_html             : false,        // default false (IMPORTANT FOR IMAGE TAGS ALWAYS SET FALSE)    
				apply_source_formatting : false,            

				// Gestion de URL's por tiny. Default is both true
				relative_urls           : false,
				convert_urls            : false,                    

				// TESTING
				remove_linebreaks           : false,    // remove line break stripping by tinyMCE so that we can read the HTML      
				//paste_create_linebreaks   : true,     // for paste plugin - single linefeeds are converted to hard line break elements
				paste_auto_cleanup_on_paste : true,     // for paste plugin - word paste will be executed when the user copy/paste content
				verify_css_classes          : false,
				*/
				// SETUP EDITOR
				setup : function(ed) {
						
						// BLUR EVENT   
						ed.on('blur', function(evt) {
							// SAVE COMMAND
							// It will get dirty if the user has made modifications to the contents
							if(ed.isDirty())   
								component_html_text_editor.save_command(ed,evt,component_html_text);
						});// END BLUR EVENT

						// CLICK EVENT          
						ed.on('click', function(evt) {
							// Select current wrap
							component_common.select_wrap( $(component_html_text).parents('.wrap_component') );							
						});// END CLICK EVENT
						/*
						// CHANGE EVENT 
						ed.on('change', function(evt) {
							// Nothing to do
						});// END BLUR EVENT

						// MOUSEUP EVENT
						ed.on('MouseUp', function(evt) {
							// Nothing to do
						});//END MOUSEUP EVENT


						// KEY UP EVENT
						ed.on('KeyUp', function(evt) {
							// Nothing to do                                                                        
						});//END KEY UP EVENT
						*/                      
				}//end setup
		});
	}




	// SAVE_COMMAND
	this.save_command = function(ed,evt,obj_html_text) {

		//
		// DATO : Overwrite
		// Reemplazamos el dato a guardar (que sería el contenido del textarea real) por el contenido del editor (tinyMCE)
		// eliminando los saltos de línea (IMPORTANTE!)
		var text = ed.getContent();
			text = text.replace(/(\r\n|\n|\r)/gm," ");
			component_html_text.save_arguments.dato = text;

		
		// REAL TEXT AREA OBJ
		if($(obj_html_text).length>0) {

			var text_area_id = $(obj_html_text).attr('id');
			
			// FORCE UPDATE REAL TEXT AREA CONTENT                                                      
			tinyMCE.triggerSave();      //alert(ed.getContent())
			
			// SAVE REAL TEXTAREA CONTENTS
			component_html_text.Save(obj_html_text);        if (DEBUG) console.log("-> trigger Save from tinyMCE " + text_area_id);     
			//var text = ed.getContent();
			//$(obj_html_text).val( escape('xxx '+text) );  console.log($(obj_html_text))
			//component_html_text.Save(obj_html_text);
			//alert( $(obj_html_text).val() )

			// Notify time machine tool content is changed
			top.changed_original_content = 1;   //if (DEBUG) console.log(tool_time_machine.changed_original_content)

			//if (DEBUG) console.log( obj_html_text )   
		}else{
			alert("text editor obj_html_text not found "+ text_area_id);
		}
	}//end save_command


};//end component_html_text_editor class




