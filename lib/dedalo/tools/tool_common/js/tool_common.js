
// TOOL_COMMON CLASS
var tool_common = new function() {
			
	// Global var. Set when load fragment info
	this.selected_tag;
	this.selected_rel_locator;
	this.selected_tipo;

	this.add_url_globals = '&top_tipo='+page_globals.top_tipo+'&top_id='+page_globals.top_id+'&section_tipo='+page_globals.section_tipo

	
	/**
	* OPEN TOOL TIME MACHINE
	* Open time machine dialog window (from time machine tool button in inspector)
	*/
	this.open_tool_time_machine = function ( button_obj ) {

		switch(page_globals.modo){

			case 'edit':
					// LOAD TOOL (OPEN DIALOG WINDOW)
					var tipo 				= $(button_obj).data('tipo'),
						section_tipo		= $(button_obj).data('section_tipo'),
						parent 				= $(button_obj).data('parent'),
						lang 				= $(button_obj).data('lang'),
						target_modo 		= 'tool_time_machine',
						iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&section_tipo='+section_tipo +'&parent='+parent +tool_common.add_url_globals;	//?m=tm&id=1230					
					
					// Dialog Title
					top.$("#dialog_page_iframe").dialog({						
						//position: { my: "left top", at: "left bottom", of: button },
						// Change title
						title: "Time  machine "+tipo ,
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
				break;

			case 'list':
					// LOAD TOOL (AJAX LOAD BOTTOM ROWS HISTORY)
					var tipo 		= $(button_obj).data('tipo'),
						wrap_div	= $('#tm_list_container');					

					// swap visibility
					if( $(wrap_div).css('display') !== 'none' ) {
						$(wrap_div).hide(100);
						return false;
					}

					$(wrap_div).html("<span class='loading'>Loading..</span>").show(0)			
					
					var mode 	= 'section_records_load_rows_history';
					var mydata	= {
						'mode': mode,
						'current_tipo_section': tipo,
						'top_tipo': page_globals.top_tipo
						};
						//return 	console.log(mydata)

					html_page.loading_content( wrap_div, 1 );

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
						html_page.loading_content( wrap_div, 0 );
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
		
		var	parent				= $(button_obj).data('parent'),
			tipo				= $(button_obj).data('tipo'),
			lang				= $(button_obj).data('lang'),
			target_modo 		= 'tool_lang',
			iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +tool_common.add_url_globals;	//return alert(iframe_src)
		
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
	}


	/**
	* LOAD TOOL POSTERFRAME (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_posterframe = function ( button_obj ) {
		
		var parent				= $(button_obj).data('parent');
		var tipo 				= $(button_obj).data('tipo');
		var target_modo 		= 'tool_posterframe';						
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +tool_common.add_url_globals ;
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Posterframe "+tipo ,
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
	            	top.component_common.update_component_by_parent_tipo_lang(parent, tipo);
	            };
				
	        }													
        });

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;
	}

	
	/**
	* OPEN TOOL AV VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_av_versions = function ( button_obj ) {
		
		var parent				= $(button_obj).data('parent');
		var tipo 				= $(button_obj).data('tipo');
		var target_modo 		= 'tool_av_versions';
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +tool_common.add_url_globals ;

		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool AV versions "+parent ,
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
			}
		});

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;
	}


	/**
	* OPEN TOOL IMAGE VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_image_versions = function ( button_obj ) {
		
		var parent				= $(button_obj).data('parent'),
			tipo 				= $(button_obj).data('tipo'),
			section_tipo 		= $(button_obj).data('section_tipo')
			//return 	console.log(section_tipo)

		var target_modo 		= 'tool_image_versions',
			iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +tool_common.add_url_globals,
			$dialog_page_iframe = top.$("#dialog_page_iframe")
		
		// Dialog Title
		$dialog_page_iframe.dialog({
			// Change title
			title: "Tool Image versions "+parent ,
			width:810,
			height:780,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
	            $(this).attr( 'src', '');

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
				};
				

	        }												
        });
		
		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		$dialog_page_iframe.attr('src',iframe_src).dialog( "open" );		
		return false;
	}


	/**
	* OPEN TOOL transcription (OPEN DIALOG WINDOW)
	* Open TOOL transcription dialog window (from TOOL transcription button in inspector)
	*/
	this.open_tool_transcription = function ( button_obj ) {
		
		var tipo				= $(button_obj).data('tipo'),
			parent				= $(button_obj).data('parent'),
			section_tipo		= $(button_obj).data('section_tipo'),
			context_name		= $(button_obj).data('context_name');

		var window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_transcription&t='+tipo+'&section_tipo='+section_tipo+'&parent='+parent+'&context_name='+context_name +tool_common.add_url_globals ,	
			window_name			= "Tool Transcription",
			w_width				= screen.width, //1320,	
			w_height			= screen.height //678 ;
		
		//return alert(window_url)

		// Open and focus window
		transcription_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
		transcription_window.focus()
	}


	/**
	* OPEN TOOL UPLOAD (OPEN NEW WINDOW)
	*/
	this.open_tool_upload = function ( button_obj ) {
		
		var tipo				= $(button_obj).data('tipo'),
			parent				= $(button_obj).data('parent'),
			SID 				= $(button_obj).data('sid'),
			quality				= $(button_obj).data('quality'),
			//aditional_path		= $(button_obj).data('aditional_path'),
			//initial_media_path 	= $(button_obj).data('initial_media_path'),
			section_tipo		=  $(button_obj).data('section_tipo')
			//return 	console.log(section_tipo)

			// DES : +'&initial_media_path='+initial_media_path+'&aditional_path='+aditional_path

		var window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_upload&t='+tipo+'&parent='+parent+'&section_tipo='+section_tipo+'&quality='+quality+tool_common.add_url_globals ,	
			window_name			= "Tool Upload " + parent + ' ' + tipo +' '+ quality   ,
			w_width				= 500,
			w_height			= 390;
		
		//return alert(window_name)

		// Open and focus window
		var upload_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
		upload_window.focus()
	}

	/**
	* OPEN_TOOL_INDEXATION (OPEN DIALOG WINDOW)
	*/
	this.open_tool_indexation = function ( button_obj ) {
		
		var parent		= $(button_obj).data('parent'),
			tipo 		= $(button_obj).data('tipo')

		//var caller_id 			= $(button_obj).data('caller_id');
		var target_modo = 'tool_indexation';						
		var iframe_src	= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +tool_common.add_url_globals ;	//alert(iframe_src)
		//return console.log(iframe_src);
		//return window.open(iframe_src)

		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Indexation "+parent ,
			//width:810,
			//height:780,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
				$(this).attr( 'src', '');

				// Update component in opener page
				var component_related_obj_parent = parent;
				var component_related_obj_tipo 	= tipo;
				var component_related_obj = top.$(".css_text_area[data-parent=" +component_related_obj_parent+ "][data-tipo=" +component_related_obj_tipo+ "]");
				//console.log(component_related_obj);

				if( $(component_related_obj).length == 1 ) {
					top.component_common.update_component_by_parent_tipo_lang(parent, tipo);
					if(DEBUG) top.console.log("->trigger opener update component "+component_related_obj)
				}else{
					if(DEBUG) top.alert("->trigger opener update component ERROR for "+component_related_obj)
				}
			}
		});

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;		
	}


	/**
	* OPEN_TOOL_RELATION (Open dialog window)
	*/
	this.open_tool_relation = function ( button_obj ) {
		
		var parent			= $(button_obj).data('parent');
		var tipo 			= $(button_obj).data('tipo');
		var caller_id 		= $(button_obj).data('caller_id');
		var target_modo 	= 'tool_relation';						
		var iframe_src		= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +tool_common.add_url_globals ;	//alert(iframe_src)
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Relation "+parent ,
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
	}


	/**
	* OPEN_TOOL_PORTAL
	*/
	this.open_tool_portal = function ( button_obj ) {
		
		var parent		= $(button_obj).data('parent'),
			tipo 		= $(button_obj).data('tipo'),
			top_tipo 	= $(button_obj).data('top_tipo'),
			section_tipo= $(button_obj).data('section_tipo'),		
			modo 		= 'tool_portal';

			// NOTA: portal_tipo y portal_parent son 't' y 'parent' respectivamente.
			var iframe_src = DEDALO_LIB_BASE_URL + '/main/?m='+modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo+tool_common.add_url_globals; //return alert(iframe_src)

		var id_wrapper = $(button_obj).parents('.css_wrap_portal').first().attr('id');
			//return console.log(id_wrapper);
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Portal "+parent ,
			width:  '97.7%',
			height: html_page.dialog_height_default+20,
			//width:810,
			//height:780,
			// Clear current content on close
			close: function(event, ui) {
				
				// Clean url
	            $(this).attr( 'src', '');	         
	            /* 
	            // Update component in opener page
	            // De momento y dado que cada section tipo crea su propio wrap independiente, recargamos la página entera.
	            // Preparar el component para actualizar todos sus grupos de una vez
	            top.location.reload();
	            */
	            component_common.load_component_by_wrapper_id(id_wrapper);                 		
	        }												
        });

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;	
	}



	/**
	* OPEN TOOL PDF VERSIONS (OPEN DIALOG WINDOW)
	* Open tool dialog window (from tool button in inspector)
	*/
	this.open_tool_pdf_versions = function ( button_obj ) {
		
		var parent				= $(button_obj).data('parent'),
			tipo 				= $(button_obj).data('tipo'),
			parent_matrix		= $(button_obj).data('parent_matrix');

		var target_modo 		= 'tool_pdf_versions';						
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&parent='+parent +tool_common.add_url_globals ;
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool PDF versions "+parent ,
			width:700,
			height:700,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
	            $(this).attr( 'src', '');

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
	}



	


	
	/**
	* OPEN TOOL IMPORT IMAGES (OPEN NEW WINDOW)
	*/
	this.open_tool_layout_print = function ( button_obj ) {
		
		var button_tipo			= $(button_obj).data('tipo'),
			target_section_tipo	= $(button_obj).data('target_section_tipo'),
			window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_layout_print&t='+target_section_tipo+'&button_tipo='+button_tipo+'&context_name=list' +tool_common.add_url_globals ,	
			window_name			= "Tool print records";

		// Open and focus window
		var tool_print_window=window.open(window_url,window_name);
		tool_print_window.focus()
	}



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
				window.open(url,"player_window","width=810,height=410");
				break;

			case 'component_image':
				var url = options.image_full_url;
				// Note: For the moment we use a normal new window instead a player
				window.open(url,"player_window","width=1100,height=830");
				break;

			default:
				// Nothing to do
				if (DEBUG) { console.log("Undefined options type for tool_common:open_player") };
		}
		return false;
	}



	/**
	* open_tool_replace_component_data
	* @param object button_obj
	*/
	this.open_tool_replace_component_data = function(button_obj) {

		var parent		= $(button_obj).data('parent'),
			tipo 		= $(button_obj).data('tipo'),
			top_tipo 	= $(button_obj).data('top_tipo'),
			section_tipo= $(button_obj).data('section_tipo'),
			modo 		= 'tool_replace_component_data';

		// NOTA: portal_tipo y portal_parent son 't' y 'parent' respectivamente.
		var iframe_src = DEDALO_LIB_BASE_URL + '/main/?m='+modo+'&t='+tipo+'&parent='+parent +'&section_tipo='+section_tipo+tool_common.add_url_globals; //return alert(iframe_src)
	
		
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

	}//end open_tool_replace_component_data



	/**
	* OPEN TOOL IMPORT (OPEN NEW WINDOW) GENERIC TO USE WITH SECTION LIST BUTTON (LIKE MUPREVA)
	*/
	this.open_tool_import = function ( button_obj ) {
		
		var button_tipo			= $(button_obj).data('tipo'),
			target_section_tipo	= $(button_obj).data('target_section_tipo'),
			tool_name			= $(button_obj).data('tool_name'),
			context_name		= $(button_obj).data('context_name'),
			window_url			= DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+target_section_tipo+'&button_tipo='+button_tipo+'&context_name='+context_name +tool_common.add_url_globals ,	
			window_name			= "Tool import "+tool_name;

		// Open and focus window
		var tool_import_images_window=window.open(window_url,window_name);
		tool_import_images_window.focus()

	}//end open_tool_import



	/**
	* OPEN_TOOL_IMPORT_IMAGES (OPEN NEW WINDOW)
	*/
	this.open_tool_import_files = function(button_obj) {

		var component_tipo		= button_obj.dataset.tipo,
			parent				= button_obj.dataset.parent,		
			tool_name			= 'tool_import_files',
			context_name		= 'files',
			window_url			= DEDALO_LIB_BASE_URL + '/main/?m='+tool_name+'&t='+component_tipo+'&parent='+parent+'&context_name='+context_name +tool_common.add_url_globals ,	
			window_name			= "Tool import "+tool_name;

		// Open and focus window
		//var tool_import_images_window=window.open(window_url,window_name);
		//tool_import_images_window.focus()
		//return 	console.log(window_url);
		
		window.location.href = window_url;

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

	}//end open_tool_import_images




	
}//end class tool_common

