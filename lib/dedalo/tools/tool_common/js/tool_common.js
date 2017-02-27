
// TOOL_COMMON CLASS
var tool_common = new function() {
			
	// Global var. Set when load fragment info
	this.selected_tag;
	this.selected_rel_locator;
	this.selected_tipo;

	this.add_url_globals = '&top_tipo='+page_globals.top_tipo+'&top_id='+page_globals.top_id //+'&section_tipo='+page_globals.section_tipo

	
	/**
	* OPEN TOOL TIME MACHINE
	* Open time machine dialog window (from time machine tool button in inspector)
	*/
	this.open_tool_time_machine = function ( button_obj ) {

		switch(page_globals.modo){

			case 'edit':
			case 'tool_transcription':

					var	tipo				= button_obj.dataset.tipo,
						parent				= button_obj.dataset.parent,						
						section_tipo		= button_obj.dataset.section_tipo,
						lang				= button_obj.dataset.lang,
						target_modo 		= 'tool_time_machine',
						iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&lang='+lang +tool_common.add_url_globals; 	//return alert(iframe_src)	

					var window_url			= iframe_src,
						window_name			= "Time machine "+section_tipo+' -> '+tipo,
						w_width				= screen.width,
						w_height			= screen.height				

					// Open and focus window
					var tool_time_machine_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
						tool_time_machine_window.focus()

					// REFRESH_COMPONENTS
					// Calculate wrapper_id and ad to page global var 'components_to_refresh'
					// Note that when tool window is closed, main page is focused and trigger refresh elements added 
					var wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
						if (wrapper) {
							html_page.add_component_to_refresh(wrapper.id)
						}
					/*
					// On close window, update component if changed
					tool_time_machine_window.onbeforeunload = function () {
					    if (top.changed_original_content==1) {
							top.component_common.update_component_by_parent_tipo_lang(parent, tipo, lang);
							//if(DEBUG) console.log("top.changed_original_content: "+top.changed_original_content);
						}
					}
					*/
					return false;

					/* OLD WAY
						// LOAD TOOL (OPEN DIALOG WINDOW)
						var tipo 			= button_obj.dataset.tipo,
							section_tipo	= button_obj.dataset.section_tipo,
							parent 			= button_obj.dataset.parent,
							lang 			= button_obj.dataset.lang,
							target_modo 	= 'tool_time_machine',
							iframe_src		= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&section_tipo='+section_tipo +'&parent='+parent +tool_common.add_url_globals;	//?m=tm&id=1230					
						
						// Dialog Title
						top.$("#dialog_page_iframe").dialog({						
							//position: { my: "left top", at: "left bottom", of: button },
							// Change title
							title: "Time machine "+tipo ,
							width:  html_page.dialog_width_default,
							height: html_page.dialog_height_default,
							// Clear current content on close
							close: function(event, ui) {

								// Clean url
								$(this).attr( 'src', '');
								// Update component in section page
								// var changed_original_content is 0 default. When text editor (tinymce) launch change event, is updated to 1
								if (top.changed_original_content==1) {
									top.component_common.update_component_by_parent_tipo_lang(parent, tipo, lang);
								};
							}
							
						});

						// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
						top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );
						return false;
						*/
					break;

			case 'list':

					// LOAD TOOL (AJAX LOAD BOTTOM ROWS HISTORY)
					var tipo 		= button_obj.dataset.tipo,
						wrap_div	= document.getElementById('tm_list_container')	//$('#tm_list_container');					

					// swap visibility
					if( wrap_div.style.display !== 'none' ) {	// $(wrap_div).css('display')
						$(wrap_div).hide(100);
						return false;
					}

					//$(wrap_div).html("<span class='loading'>Loading..</span>").show(0)	
					wrap_div.innerHTML = "<span class=\"loading blink\"> Loading.. </span>"	
					
					var mydata	= {
								'mode' 					: 'section_records_load_rows_history',
								'current_tipo_section' 	: tipo,
								'top_tipo' 				: page_globals.top_tipo
								};
						//return 	console.log(mydata)

					//html_page.loading_content( wrap_div, 1 );

					// AJAX REQUEST
					$.ajax({
						url		: DEDALO_LIB_BASE_URL + '/tools/tool_time_machine/trigger.tool_time_machine.php',
						data	: mydata,
						type	: "POST"
					})
					// DONE
					.done(function(received_data) {
						$(wrap_div)
							.hide(0)
							.html(received_data)
							.fadeIn(100);
					})
					// FAIL ERROR 
					.fail(function(error_data) {
						inspector.show_log_msg(" <span class='error'>ERROR: on section_records_load_rows_history !</span> ");
						if (DEBUG) console.log("ERROR: error_data:" +error_data );
					})
					// ALWAYS
					.always(function() {			
						//html_page.loading_content( wrap_div, 0 );
					});
					if (DEBUG) console.log("->Fired section_records_load_rows_history: "+ tipo + " " );
					break;

		}//end switch(page_globals.modo)
	}//end open_tool_time_machine



	/**
	* OPEN TOOL LANG (OPEN DIALOG WINDOW)
	* Open tool lang dialog window (from tool lang button in inspector)
	*/
	this.open_tool_lang = function ( button_obj ) {
		
		var	parent				= button_obj.dataset.parent,
			tipo				= button_obj.dataset.tipo,
			section_tipo		= button_obj.dataset.section_tipo,
			lang				= button_obj.dataset.lang,
			target_modo 		= 'tool_lang',
			iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&lang='+lang +tool_common.add_url_globals; 	//return alert(iframe_src)	

		var window_url			= iframe_src,
			window_name			= "Tool Lang "+tipo+" "+parent,
			w_width				= screen.width, //1320,
			w_height			= screen.height //678 ;		
	

		// Open and focus window
		var tool_lang_window = window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
			tool_lang_window.focus()


		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		var wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}
		
		/*
		// On close window, update component if changed
		tool_lang_window.onbeforeunload = function () {
		    //if (top.changed_original_content==1) {
				top.component_common.update_component_by_parent_tipo_lang(parent, tipo, lang);
				//if(DEBUG) console.log("top.changed_original_content: "+top.changed_original_content);
			//}
			return 'Leaving tool lang page..';
		}
		*/
		return false;

		/*
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Lang "+parent ,
			width:  html_page.dialog_width_default,
			height: html_page.dialog_height_default,
			// Clear current content on close
			close: function(event, ui) {
				
				// Clean url
	            $(this).attr( 'src', '');	            
	           	//alert(top.changed_original_content)
	            // Update component in section page
	            // var changed_original_content is 0 default. When text editor (tinymce) launch change event, update var to 1
	            if (top.changed_original_content==1) {	            	
	            	top.component_common.update_component_by_parent_tipo_lang(parent, tipo, lang);
	            };				
	        }													
        });

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;
		*/
	};//end open_tool_lang



	/**
	* LOAD TOOL POSTERFRAME (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_posterframe = function ( button_obj ) {
		
		var tipo 			= button_obj.dataset.tipo,
			parent			= button_obj.dataset.parent,			
			section_tipo 	= button_obj.dataset.section_tipo,
			target_modo 	= 'tool_posterframe',
			iframe_src		= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo +tool_common.add_url_globals
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Posterframe "+tipo+" "+parent,
			width: 780,
			height: 715,
			//minHeight: 'auto',
			autoResize:true,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
	            $(this).attr( 'src', '');	            
	            //alert(top.changed_original_content)
	            // Update component in section page
	            // var changed_original_content is 0 default. When text editor (tinymce) launch change event, update var to 1
	            if (top.changed_original_content==1) {

	            	//top.component_common.update_component_by_parent_tipo_lang(parent, tipo);

	            	// REFRESH_COMPONENTS
					// Calculate wrapper_id and ad to page global var 'components_to_refresh'
					// Note that when tool window is closed, main page is focused and trigger refresh elements added 
					var wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
						if (wrapper) {
							html_page.add_component_to_refresh(wrapper.id)
						}
	            };				
	        }													
        });

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;
	};//end open_tool_posterframe


	
	/**
	* OPEN TOOL AV VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_av_versions = function ( button_obj ) {
		
		var parent			= button_obj.dataset.parent,
			tipo 			= button_obj.dataset.tipo,
			section_tipo 	= button_obj.dataset.section_tipo,
			target_modo 	= 'tool_av_versions',
			iframe_src		= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo +tool_common.add_url_globals ;

		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool AV versions "+tipo+" "+parent,
			width:810,
			height:700,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
				$(this).attr( 'src', '');

				// Update component in opener page
				var component_related_obj_parent = parent;
				var component_related_obj = top.$(".css_wrap_av[data-parent=" +component_related_obj_parent+ "]");
				if( component_related_obj.length == 1 ) {
					top.component_common.update_component_by_parent_tipo_lang(parent, tipo);
					if(DEBUG) top.console.log("->trigger opener update component "+component_related_obj_parent)
				}else{
					if(DEBUG) top.alert("->trigger opener update component ERROR for "+component_related_obj_parent)
				}
				
				//window.location.reload();
			}
		});

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		
		return false;
	};//end open_tool_av_versions



	/**
	* OPEN TOOL IMAGE VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_image_versions = function ( button_obj ) {
		
		var tipo 			= button_obj.dataset.tipo,
			parent			= button_obj.dataset.parent,			
			section_tipo 	= button_obj.dataset.section_tipo
			//return 	console.log(section_tipo)

		var target_modo 		= 'tool_image_versions',
			iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo +tool_common.add_url_globals,
			$dialog_page_iframe = top.$("#dialog_page_iframe")
		
		// Dialog Title
		$dialog_page_iframe.dialog({
			// Change title
			title: "Tool Image versions "+tipo+" "+parent,
			width:810,
			height:780,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
	            $(this).attr( 'src', '' );

	            // Update component in opener page
				var component_related_obj_parent = parent;
				var component_related_obj = top.$(".css_image[data-parent=" +component_related_obj_parent+ "]");	
				if( component_related_obj.length == 1 ) {					
					top.component_common.update_component_by_parent_tipo_lang(parent, tipo);
					if(DEBUG) top.console.log("->trigger opener update component "+component_related_obj_parent)
				}else{
					if(DEBUG) top.alert("->open_tool_image_versions trigger opener update component ERROR for "+component_related_obj_parent + "<br>Cause: n images:"+$(component_related_obj).length)
				}

				
				// Search and update posible thumbs (case portal)
				var matches = $('.image_image_in_list[data-parent='+parent+']');	//alert("Search for id_matrix: "+parent_matrix+ " matches: "+matches.length)
				if (matches.length>0) {
					jQuery.each(matches, function() {

						var objetive_thumb_url = $(this).data("objetive_thumb_url");
						$(this).attr("src",objetive_thumb_url+'?t='+new Date().getTime());
						$(this).parent('.div_image_image_in_list').css({backgroundImage:'none'});
						    	//if(DEBUG) console.log('new image loaded: ' + this.src);						

						/*
						// Como el thumb del listado, al crear un nuevo registro será 0, usaremos el SID del url creado por el tool image versions para refrescar la imagen
						// ya que no tenemos esa información de momento (contexto portales)

						// url from current edited image (big) 
						var src_image_edit 				= $(component_related_obj).attr("src");
						// param 'SID' from src_image_edit url
						//var src_image_edit_sid_value	= get_parameter_value(src_image_edit,'SID'); 	//alert(sid_value);
						var src_image_edit_sid_value 	= $(component_related_obj).data('objetive_thumb');
							if(DEBUG) console.log('--src_image_edit_sid_value get_parameter_value:'+src_image_edit_sid_value)

						if (typeof src_image_edit_sid_value == 'undefined') {
							if(DEBUG) console.log('open_tool_image_versions: close: Error on read src_image_edit_sid_value')
						}else{
							// Current thumb url src (SID can be 0 if is new record)
							//var src_image_list 	= $(this).attr("src");	// like http://host/dedalo/lib/dedalo/media_engine/html/img.php?m=image&quality=1.5MB&SID=0&w=102&h=57&fx=crop&p=&prop=
							//var new_url 		= change_url_variable(src_image_list, 'SID', src_image_edit_sid_value);
							var new_url 		= src_image_edit_sid_value; //change_url_variable(src_image_edit_sid_value, 'quality', 'thumb')+"&timestamp=" + new Date().getTime());
							// Change list thumb url and add timestamp to force reload
							$(this).attr("src", new_url +"?timestamp=" + new Date().getTime());
								if(DEBUG) console.log('--new_url:'+new_url)
						};
				    	//if(DEBUG) top.console.log("->open_tool_image_versions: n matches: "+ matches.length + " Updated list image parent_matrix:"+parent_matrix +" - src_image:"+src_image_list)
				   		*/
				   });
				};//end if (matches.length>0) {
	        }												
        });
		
		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		$dialog_page_iframe.attr('src',iframe_src).dialog( "open" );		
		return false;
	}//end open_tool_image_versions



	/**
	* OPEN TOOL PDF VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_pdf_versions = function ( button_obj ) {
		
		var parent				= button_obj.dataset.parent,
			tipo 				= button_obj.dataset.tipo,
			section_tipo 		= button_obj.dataset.section_tipo,
			parent_matrix		= button_obj.dataset.parent_matrix

		var target_modo 		= 'tool_pdf_versions';						
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo +tool_common.add_url_globals ;
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool PDF versions "+parent ,
			width:700,
			height:700,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
	            $(this).attr( 'src', '' );

	            // Update component in opener page
	            var component_related_obj = top.$('.css_wrap_pdf[data-parent='+parent+'][data-tipo='+tipo+']');
	            if( $(component_related_obj).length == 1 ) {
					top.component_common.load_component_by_wrapper_id( $(component_related_obj).attr('id') );
					if(DEBUG) top.console.log("->trigger opener update component wrapper "+$(component_related_obj).attr('id'))
				}else{
					if(DEBUG) top.alert("->open_tool_pdf_versions trigger opener update component ERROR for wrapper "+$(component_related_obj).attr('id') + "<br>Cause: n elements:"+$(component_related_obj).length)
				}

				
				// Search and update posible thumbs (case portal)
				var matches = $('.pdf_in_list[data-parent='+parent+'][data-tipo='+tipo+']')//alert("Search for id_matrix: "+parent_matrix+ " matches: "+matches.length)
				if (matches.length>0) {
					jQuery.each(matches, function() {

						alert("Update pdf content: work in progress")
						/*
						// Como el thumb del listado, al crear un nuevo registro será 0, usaremos el SID del url creado por el tool image versions para refrescar la imagen
						// ya que no tenemos esa información de momento (contexto portales)

						// url from current edited image (big) 
						var src_image_edit 				= $(component_related_obj).attr("src");
						// param 'SID' from src_image_edit url
						var src_image_edit_sid_value	= get_parameter_value(src_image_edit,'SID'); 	//alert(sid_value);

						if (typeof src_image_edit_sid_value == 'undefined') {
							alert('open_tool_pdf_versions: close: Error on read src_image_edit_sid_value')
						}else{
							// Current thumb url src (SID can be 0 if is new record)
							var src_image_list 	= $(this).attr("src");	// like http://host/dedalo/lib/dedalo/media_engine/html/img.php?m=image&quality=1.5MB&SID=0&w=102&h=57&fx=crop&p=&prop=
							var new_url 		= change_url_variable(src_image_list, 'SID', src_image_edit_sid_value);
							// Change list thumb url and add timestamp to force reload
							$(this).attr("src", new_url +"?timestamp=" + new Date().getTime());
						};
				    	if(DEBUG) top.console.log("->open_tool_pdf_versions: n matches: "+ matches.length + " Updated list image parent_matrix:"+parent_matrix +" - src_image:"+src_image_list)
				    	*/
				   });
				};
				

	        }												
        });

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;		
	};//end open_tool_pdf_versions



	/**
	* OPEN TOOL UPLOAD (OPEN NEW WINDOW)
	*/
	this.open_tool_upload = function ( button_obj ) {
		
		var tipo				= button_obj.dataset.tipo,
			parent				= button_obj.dataset.parent,
			section_tipo		= button_obj.dataset.section_tipo,
			SID 				= button_obj.dataset.sid,
			quality				= button_obj.dataset.quality
			
			//aditional_path	= button_obj.dataset.aditional_path,
			//initial_media_path= button_obj.dataset.initial_media_path'),
			
			// return console.log(section_tipo)
			// DES : +'&initial_media_path='+initial_media_path+'&aditional_path='+aditional_path

		var window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_upload&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&quality='+quality + tool_common.add_url_globals ,	
			window_name			= "Tool Upload " + parent + ' ' + tipo +' '+ quality,
			w_width				= 500,
			w_height			= 390

		// Open and focus window
		var upload_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
			upload_window.focus()

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		var wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}

		return false;
	};//end open_tool_upload



	/**
	* OPEN TOOL transcription (OPEN DIALOG WINDOW)
	* Open TOOL transcription dialog window (from TOOL transcription button in inspector)
	*/
	this.open_tool_transcription = function ( button_obj ) {
		
		var tipo				= button_obj.dataset.tipo
		var	parent				= button_obj.dataset.parent
		var	section_tipo		= button_obj.dataset.section_tipo		
		var	context_name		= button_obj.dataset.context_name

		var window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_transcription&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent+'&context_name='+context_name + tool_common.add_url_globals ,	
			window_name			= "Tool Transcription "+tipo+" "+parent,
			w_width				= screen.width, //1320,	
			w_height			= screen.height //678 ;
		
		//return alert(window_url)

		// Open and focus window
		var transcription_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
			transcription_window.focus();

		// REFRESH_COMPONENTS
		// Refresh is done from self tool

		return false;
	};//end open_tool_transcription
	


	/**
	* OPEN_TOOL_INDEXATION (OPEN DIALOG WINDOW)
	*/
	this.open_tool_indexation = function ( button_obj ) {
		
		var tipo 			= button_obj.dataset.tipo,
			parent			= button_obj.dataset.parent,
			lang 			= button_obj.dataset.lang,
			section_tipo 	= button_obj.dataset.section_tipo

		var window_url		= DEDALO_LIB_BASE_URL + '/main/?m=tool_indexation&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent +tool_common.add_url_globals ,	
			window_name		= "Tool Indexation "+tipo+' '+parent,
			w_width			= screen.width, //1320,	
			w_height		= screen.height //678 ;

		// Open and focus window
		var transcription_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
			transcription_window.focus();

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		var wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}

		return false;		
	};//end open_tool_indexation



	/**
	* OPEN_TOOL_RELATION (Open dialog window)
	*/
	this.open_tool_relation__DEPRECATED = function ( button_obj ) {
		
		var parent			= button_obj.dataset.parent
			tipo 			= button_obj.dataset.tipo
			section_tipo 	= button_obj.dataset.section_tipo
			caller_id 		= button_obj.dataset.caller_id
			target_modo 	= 'tool_relation',
			iframe_src		= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo +tool_common.add_url_globals ;	//alert(iframe_src)
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Relation "+tipo+" "+parent,
			width:  '97.7%',
			height: html_page.dialog_height_default+20,
			//width:810,
			//height:780,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
	            $(this).attr( 'src', '');	         
	             
	            // Update component in opener page
	            // De momento y dado que cada section tipo crea su propio wrap independiente, recargamos la página entera.
	            // Preparar el component para actualizar todos sus grupos de una vez
	            top.location.reload();	                    		
	        }												
        });

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );
		return false;	
	};//end open_tool_relation



	/**
	* OPEN_TOOL_PORTAL
	*/
	this.open_tool_portal = function ( button_obj ) {
		
		var parent				= button_obj.dataset.parent
		var	tipo 				= button_obj.dataset.tipo
		var	top_tipo 			= button_obj.dataset.top_tipo
		var	section_tipo 		= button_obj.dataset.section_tipo
		var	target_section_tipo = button_obj.dataset.target_section_tipo
		var	modo 				= 'tool_portal'

		var url_vars = {
				m 					: modo,
				t 					: tipo,
				portal_tipo 		: tipo, // Important!
				portal_section_tipo : section_tipo, // Important!
				portal_parent 		: parent, // Important!
				section_tipo 		: section_tipo,
				parent 				: parent,				
				target_section_tipo : target_section_tipo,
				hierarchy_sections 	: button_obj.dataset.hierarchy_sections
			}

		var url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)
			url += tool_common.add_url_globals

			// NOTA: portal_tipo y portal_parent son 't' y 'parent' respectivamente.
			//var iframe_src = DEDALO_LIB_BASE_URL + '/main/?m='+modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo +'&target_section_tipo='+target_section_tipo+ tool_common.add_url_globals; //return alert(iframe_src)

		// Open and focus window
		var window_url		= url
		var	window_name		= "Tool portal "+section_tipo+" "+tipo+" "+parent
		var	w_width			= screen.width //1320,
		var	w_height		= screen.height //678 ;

		var tool_portal_window = window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
			tool_portal_window.focus()


		// REFRESH_COMPONENTS ADD PORTAL
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		var wrapper_id = component_common.get_wrapper_id_from_element(button_obj);
			html_page.add_component_to_refresh(wrapper_id)

		return false	
	};//end open_tool_portal



	/**
	* OPEN TOOL IMPORT IMAGES (OPEN NEW WINDOW)
	*/
	this.open_tool_layout_print = function ( button_obj ) {
		
		var button_tipo			= button_obj.dataset.tipo,
			target_section_tipo	= button_obj.dataset.target_section_tipo,
			window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_layout_print&t='+target_section_tipo+'&button_tipo='+button_tipo+'&context_name=list' +tool_common.add_url_globals ,	
			window_name			= "Tool print records";

		// Open and focus window
		var tool_print_window=window.open(window_url,window_name);
			tool_print_window.focus();

		return false;
	};//end open_tool_layout_print



	/**
	* OPEN_PLAYER 
	* To do: Integrar en un modalbox para imagen con control de zoom y demás y para vídeo el equivalente
	* @params (dom object)button_obj , (object)options 
	*/
	this.open_player = function(button_obj, options) {
		
		switch(options.type) {

			case 'component_av':
				var url = DEDALO_LIB_BASE_URL + "/media_engine/av_media_player.php?reelID="+options.reelID+"&quality="+options.quality +tool_common.add_url_globals;
				// Note: Window player is auto resize because current dimensions are testimonial only
				window.open(url,"player_window","width=735,height=525");
				break;

			case 'component_image':
				var url = options.image_full_url + '?t=' + (new Date()).getTime();
				// Note: For the moment we use a normal new window instead a player
				window.open(url,"player_window","width=1100,height=830");
				break;

			default:
				// Nothing to do
				if (DEBUG) { console.log("Invalid options type for tool_common:open_player: "+options.type) };
		}
		return false;
	};//end open_player



	/**
	* open_tool_replace_component_data
	* @param object button_obj
	*/
	this.open_tool_replace_component_data = function(button_obj) {

		var parent		= button_obj.dataset.parent,
			tipo 		= button_obj.dataset.tipo,
			top_tipo 	= button_obj.dataset.top_tipo,
			section_tipo= button_obj.dataset.section_tipo,
			modo 		= 'tool_replace_component_data'

		// NOTA: portal_tipo y portal_parent son 't' y 'parent' respectivamente.
		var iframe_src = DEDALO_LIB_BASE_URL + '/main/?m='+modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo + tool_common.add_url_globals; //return alert(iframe_src)
	
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: get_label.herramienta +": " + get_label.tool_replace_component_data +" ("+parent+")" ,
			width:  460,	//'50.7%',
			height: 430,
			// Clear current content on close
			close: function(event, ui) {
				
				// Clean url
	            $(this).attr( 'src', '');
	        }
        });

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );
		return false;
	};//end open_tool_replace_component_data



	/**
	* OPEN TOOL IMPORT (OPEN NEW WINDOW) GENERIC TO USE WITH SECTION LIST BUTTON (LIKE MUPREVA)
	*/
	this.open_tool_import = function ( button_obj ) {

		var url_vars = {
				m 			 		: button_obj.dataset.tool_name,
				t			 		: button_obj.dataset.t,
				section_tipo 		: button_obj.dataset.target_section_tipo,			
				button_tipo	 		: button_obj.dataset.tipo,					
				context_name 		: button_obj.dataset.context_name,
				custom_params  		: button_obj.dataset.custom_params // optional config from propiedades
			}

		var url  = DEDALO_LIB_BASE_URL + '/main/?'
			url += build_url_arguments_from_vars(url_vars)
			url += tool_common.add_url_globals
			if(SHOW_DEBUG===true) console.log(url)
			//window_url			= DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+target_section_tipo+'&button_tipo='+button_tipo+'&context_name='+context_name +tool_common.add_url_globals ,	

			var window_name = "Tool import "+button_obj.dataset.tool_name;

		// Open and focus window
		var tool_import_images_window=window.open(url, window_name);
			tool_import_images_window.focus();
	};//end open_tool_import



	/**
	* OPEN_TOOL_IMPORT_IMAGES (OPEN NEW WINDOW)
	*/
	this.open_tool_import_files = function(button_obj) {

		var component_tipo	= button_obj.dataset.tipo
		var	section_tipo	= button_obj.dataset.section_tipo
		var	parent			= button_obj.dataset.parent
		var	tool_name		= 'tool_import_files'
		var	context_name	= 'files'
		var	window_url		= DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+component_tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&context_name='+context_name +tool_common.add_url_globals
		var	window_name		= "Tool import "+tool_name +" "+component_tipo+" "+parent

		// Set component to refresh
		// Find wrap from component tipo, parent, section_tipo
		var wrap_div = document.querySelector('.wrap_component[data-tipo="'+component_tipo+'"][data-parent="'+parent+'"][data-section_tipo="'+section_tipo+'"]');
			if (wrap_div === null ) {
				if(DEBUG) console.log(button_obj);
				return alert("tool_common:open_tool_import_files: Sorry: wrap_div dom element not found")
			}
			var wrapper_id = wrap_div.id
		// Add to array of component to refresh
		html_page.add_component_to_refresh(wrapper_id);

		// Open and focus window
		//var tool_import_images_window=window.open(window_url,window_name);
		//tool_import_images_window.focus()
		//return 	console.log(window_url);
		
		// Redirect page to tool url
		//window.location.href = window_url;

		// Open and focus window
		var tool_import_images_window=window.open(window_url, window_name);
			tool_import_images_window.focus();


		/* USING DIALOG VERSION
			var iframe_src = DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+target_section_tipo+'&parent='+parent +'&section_tipo='+section_tipo+tool_common.add_url_globals; //return alert(iframe_src)
					
			// Dialog Title
			top.$("#dialog_page_iframe").dialog({
				// Change title
				title: get_label.herramienta +": " + get_label.tool_replace_component_data +" ("+parent+")" ,
				"width": '100%',	//'50.7%',
				"height": common.get_page_height(),
				// Clear current content on close
				close: function(event, ui) {
					
					// Clean url
		            $(this).attr( 'src', '');
		        }
	        });
	        // Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
			top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );
			return false;
			*/
	};//end open_tool_import_images



	/**
	* OPEN TOOL EXPORT
	*/
	this.open_tool_export = function ( button_obj ) {
		
		var section_tipo	= button_obj.dataset.section_tipo,
			tool_name		= button_obj.dataset.tool_name,
			context_name	= button_obj.dataset.context_name,
			window_url		= DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+section_tipo+'&context_name='+context_name +tool_common.add_url_globals ,	
			window_name		= "Tool export "+tool_name;

		// Open and focus window
		var tool_export_window=window.open(window_url,window_name);
			tool_export_window.focus();
	};//end open_tool_export



	/**
	* OPEN_TOOL_TC
	* @return 
	*/
	this.open_tool_tc = function( button_obj ) {

		var tipo			= button_obj.dataset.tipo
		var section_tipo	= button_obj.dataset.section_tipo
		var parent			= button_obj.dataset.parent
		var lang			= button_obj.dataset.lang
		var tool_name		= 'tool_tc'
		var	context_name	= button_obj.dataset.context_name
		var	window_url		= DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent+'&lang='+lang+'&context_name='+context_name +tool_common.add_url_globals	
		var	window_name		= "Tool TC "+tool_name

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		var wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}

		// Open and focus window
		var tool_tc_window=window.open(window_url,window_name);
			tool_tc_window.focus();
	};//end open_tool_tc



	/**
	* OPEN_TOOL_tr_print
	* @return 
	*/
	this.open_tool_tr_print = function( button_obj ) {

		var tipo			= button_obj.dataset.tipo
		var section_tipo	= button_obj.dataset.section_tipo
		var parent			= button_obj.dataset.parent
		var lang			= button_obj.dataset.lang
		var tool_name		= 'tool_tr_print'
		var	context_name	= button_obj.dataset.context_name
		var	window_url		= DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent+'&lang='+lang+'&context_name='+context_name +tool_common.add_url_globals	
		var	window_name		= "Tool TC "+tool_name

		// REFRESH_COMPONENTS
		// Calculate wrapper_id and ad to page global var 'components_to_refresh'
		// Note that when tool window is closed, main page is focused and trigger refresh elements added 
		var wrapper = component_common.get_component_wrapper(tipo, parent, section_tipo);
			if (wrapper) {
				html_page.add_component_to_refresh(wrapper.id)
			}

		// Open and focus window
		var tool_tr_print_window=window.open(window_url,window_name);
			tool_tr_print_window.focus();		
	};//end open_tool_tr_print


	
}//end class tool_common