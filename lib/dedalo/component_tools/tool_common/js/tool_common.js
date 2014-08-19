// TOOL_COMMON CLASS
var tool_common = new function() {
			
	// Global var. Set when load fragment info
	this.selected_tag;
	this.selected_rel_locator;
	this.selected_tipo;
		

	/**
	* OPEN TOOL TIME MACHINE
	* Open time machine dialog window (from time machine tool button in inspector)
	*/
	this.open_tool_time_machine = function ( button_obj ) {
		
		switch(page_globals.modo){

			case 'edit':			
					// LOAD TOOL (OPEN DIALOG WINDOW)
					var id_matrix			= $(button_obj).data('id_matrix');
					var tipo 				= $(button_obj).data('tipo');
					var current_tipo_section= $(button_obj).data('current_tipo_section');
					var target_modo 		= 'tool_time_machine';
					var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix+'&current_tipo_section='+current_tipo_section;	//?m=tm&id=1230
					
					// Dialog Title
					top.$("#dialog_page_iframe").dialog({
						// Change title
						title: "Time  machine "+id_matrix ,
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
								//top.component_common.update_component_by_ajax(id_matrix, callback=null);
								top.component_common.update_component_by_ajax(id_matrix, callback=null)
							};

						}
					});

					// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
					top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );
					return false;	
				break;

			case 'list':
					// LOAD TOOL (AJAX LOAD BOTTOM ROWS)
					// SECTION LIST LOAD ROWS HISTORY
					var tipo 		= $(button_obj).data('tipo');
					var wrap_div	= $('#tm_list_container');

					// swap visibility
					if( $(wrap_div).css('display') !== 'none' ) {
						$(wrap_div).hide(150);
						return false;
					}else{
						$(wrap_div).show(0);
					}

					html_page.loading_content( wrap_div, 1 );
					
					var mode 		= 'section_list_load_rows_history';
					var mydata		= { 'mode': mode, 'tipo': tipo };

					var trigger_tool_time_machine_url	= DEDALO_LIB_BASE_URL + '/component_tools/tool_time_machine/trigger.tool_time_machine.php' ;

					// AJAX REQUEST
					$.ajax({
						url			: trigger_tool_time_machine_url,
						data		: mydata,
						type		: "POST"
					})
					// DONE
					.done(function(received_data) {
						$(wrap_div).html(received_data);
					})
					// FAIL ERROR 
					.fail(function(error_data) {
						inspector.show_log_msg(" <span class='error'>ERROR: on section_list_load_rows_history !</span> ");
					})
					// ALLWAYS
					.always(function() {			
						html_page.loading_content( wrap_div, 0 );
					});
					if (DEBUG) console.log("->Fired section_list_load_rows_history: "+ tipo + " " );
				break;

		}//end switch(page_globals.modo)
	}//end open_tool_time_machine


	/**
	* OPEN TOOL LANG (OPEN DIALOG WINDOW)
	* Open tool lang dialog window (from tool lang button in inspector)
	*/
	this.open_tool_lang = function ( button_obj ) {
		
		var id_matrix			= $(button_obj).data('id_matrix'),
			parent				= $(button_obj).data('parent'),
			tipo				= $(button_obj).data('tipo'),
			lang				= $(button_obj).data('lang'),
			target_modo 		= 'tool_lang',
			iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix;	//return alert(iframe_src)
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Lang "+id_matrix ,
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
	            	//top.component_common.update_component_by_ajax(id_matrix, callback=null);
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
		
		var id_matrix			= $(button_obj).data('id_matrix');
		var tipo 				= $(button_obj).data('tipo');
		var target_modo 		= 'tool_posterframe';						
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix ;
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Posterframe "+id_matrix ,
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
	            	//top.component_common.update_component_by_ajax(id_matrix, callback=null);
	            	top.component_common.update_component_by_ajax(id_matrix, callback=null)
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
		
		var id_matrix			= $(button_obj).data('id_matrix');
		var tipo 				= $(button_obj).data('tipo');
		var target_modo 		= 'tool_av_versions';
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix ;

		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool AV versions "+id_matrix ,
			width:810,
			height:700,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
				$(this).attr( 'src', '');

				// Update component in opener page
				var component_related_obj_id = id_matrix;
				var component_related_obj = top.$(".css_wrap_av[data-id_matrix=" +component_related_obj_id+ "]");
				if( $(component_related_obj).length == 1 ) {
					top.component_common.update_component_by_ajax(component_related_obj_id);
					if(DEBUG) top.console.log("->trigger opener update component "+component_related_obj_id)
				}else{
					if(DEBUG) top.alert("->trigger opener update component ERROR for "+component_related_obj_id)
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
		
		var id_matrix			= $(button_obj).data('id_matrix'),
			tipo 				= $(button_obj).data('tipo'),
			parent_matrix		= $(button_obj).data('parent_matrix');

		var target_modo 		= 'tool_image_versions';						
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix ;
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Image versions "+id_matrix ,
			width:810,
			height:780,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
	            $(this).attr( 'src', '');

	            // Update component in opener page
				var component_related_obj_id = id_matrix;
				var component_related_obj = top.$(".css_image[data-id_matrix=" +component_related_obj_id+ "]");	
				if( $(component_related_obj).length == 1 ) {
					top.component_common.update_component_by_ajax(component_related_obj_id);
					if(DEBUG) top.console.log("->trigger opener update component "+component_related_obj_id)
				}else{
					if(DEBUG) top.alert("->open_tool_image_versions trigger opener update component ERROR for "+component_related_obj_id + "<br>Cause: n images:"+$(component_related_obj).length)
				}

				
				// Search and update posible thumbs (case portal)
				var matches = $('.image_image_in_list[data-parent_matrix='+parent_matrix+']');	//alert("Search for id_matrix: "+parent_matrix+ " matches: "+matches.length)
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
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;
	}


	/**
	* OPEN TOOL transcription (OPEN DIALOG WINDOW)
	* Open TOOL transcription dialog window (from TOOL transcription button in inspector)
	*/
	this.open_tool_transcription = function ( button_obj ) {
		
		var tipo				= $(button_obj).data('tipo'),
			id_matrix			= $(button_obj).data('id_matrix'),
			context				= $(button_obj).data('context');

		var window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_transcription&t='+tipo+'&id='+id_matrix+'&context='+context ,	
			window_name			= "Tool Transcription",
			w_width				= 1320,			
			w_height			= 678 ;
		
		//return alert(window_url)

		// Open and focus window
		transcription_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
		transcription_window.focus()
	}


	/**
	* OPEN TOOL UPLOAD (OPEN NEW WINDOW)
	*/
	this.open_tool_upload = function ( button_obj ) {
		
		var tipo			= $(button_obj).data('tipo'),
			id_matrix		= $(button_obj).data('id_matrix'),
			SID 			= $(button_obj).data('sid'),
			quality			= $(button_obj).data('quality'),
			aditional_path	= $(button_obj).data('aditional_path');

		var window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_upload&t='+tipo+'&id='+id_matrix+'&quality='+quality+'&aditional_path='+aditional_path ,	
			window_name			= "Tool Upload " + id_matrix + ' ' + tipo +' '+ quality   ,
			w_width				= 495,
			w_height			= 380;
		
		//return alert(window_name)

		// Open and focus window
		var upload_window=window.open(window_url,window_name,'status=yes,scrollbars=yes,resizable=yes,width='+w_width+',height='+w_height);
		upload_window.focus()
	}

	/**
	* OPEN_TOOL_INDEXATION (OPEN DIALOG WINDOW)
	*/
	this.open_tool_indexation = function ( button_obj ) {
		
		var id_matrix			= $(button_obj).data('id_matrix');
		var tipo 				= $(button_obj).data('tipo');
		var caller_id 			= $(button_obj).data('caller_id');
		var target_modo 		= 'tool_indexation';						
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix+'&caller_id='+caller_id ;	//alert(iframe_src)
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Indexation "+id_matrix ,
			//width:810,
			//height:780,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
				$(this).attr( 'src', '');

				// Update component in opener page
				var component_related_obj_id = id_matrix;
				var component_related_obj = top.$(".css_text_area[data-id_matrix=" +component_related_obj_id+ "]");
				if( $(component_related_obj).length == 1 ) {
					top.component_common.update_component_by_ajax(component_related_obj_id);
					if(DEBUG) top.console.log("->trigger opener update component "+component_related_obj_id)
				}else{
					if(DEBUG) top.alert("->trigger opener update component ERROR for "+component_related_obj_id)
				}
			}
		});

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)		
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );		
		return false;
		/*
		var current_tipo 	= $(button_obj).data('tipo');
	  	var caller_tipo 	= $(button_obj).data('caller_tipo');
		var caller_id 		= $(button_obj).data('id_matrix');
		
		// Dialog Title
		$("#dialog_page_iframe").dialog({
			// Change title
			title: 'Tool Indexation ',
			// Clear current content on close
			close: function(event, ui) {
	            //$(this).attr( 'src', '');
	        },
	        modal: false,
	        width: $(window).width()*0.6,
	        height:$(window).height(),
	        position: { my: "left top", at: "left top", of: document }
        });

		var iframe_src 	 	= DEDALO_LIB_BASE_URL + "/../../ts/ts_list.php?modo=tesauro_rel&type=4&current_tipo="+current_tipo+"&caller_id="+caller_id+"&caller_tipo="+caller_tipo;

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)
		if( $('#dialog_page_iframe').attr('src').length < 12 ) //about:blank
		$('#dialog_page_iframe').attr('src',iframe_src);	
		$('#dialog_page_iframe').dialog( "open" );

		// Fix global var selected_rel_locator
		selected_rel_locator = $(button_obj).data('rel_locator');	

		return false;
		*/
	}



	/**
	* LOAD_INSPECTOR_INDEXATION_LIST
	*/
	this.load_inspector_indexation_list = function(tagName, tipo, id_matrix) {
		
		this.selected_tag 	= tagName;
		this.selected_tipo 	= tipo;	

		var wrapper_id 	= '#inspector_indexations';
		
		var mode 		= 'load_inspector_indexation_list';
		var mydata		= { 'mode':mode, 'tagName':tagName, 'tipo':tipo, 'id_matrix':id_matrix }; //, 'top_id_matrix': top_id_matrix, 'top_tipo': top_tipo
			//if(DEBUG) console.log(JSON.stringify(mydata))

		html_page.loading_content( wrapper_id, 1 );
		
		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/component_tools/tool_indexation/trigger.tool_indexation.php',
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			//if(DEBUG) console.log("->load_inspector_indexation_list: "+received_data)
			$(wrapper_id).html( received_data )									
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on load_inspector_indexation_list [terminoID] " + terminoID + "</span>");
		})
		// ALLWAYS
		.always(function() {			
			html_page.loading_content( wrapper_id, 0 );
		});
	}//end load_inspector_indexation_list


	/**
	* OPEN_TOOL_RELATION (Open dialog window)
	*/
	this.open_tool_relation = function ( button_obj ) {
		
		var id_matrix			= $(button_obj).data('id_matrix');
		var tipo 				= $(button_obj).data('tipo');
		var caller_id 			= $(button_obj).data('caller_id');
		var target_modo 		= 'tool_relation';						
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix+'&caller_id='+caller_id ;	//alert(iframe_src)
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Relation "+id_matrix ,
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

	            /*
				var component_related_obj_id = id_matrix;
				var component_related_obj = top.$(".css_wrap_relation");	
				if( $(component_related_obj).length == 1 ) {
					top.component_common.update_component_by_ajax(component_related_obj_id);
					if(DEBUG) top.console.log("->trigger opener update component "+component_related_obj_id)
				}else{
					if(DEBUG) top.alert("->trigger opener update component ERROR for "+component_related_obj_id)
				}
				*/           		
	        }												
        });

		// Carga la url del iframe y abre el modal box (el iframe 'dialog_page_iframe' está al final de la página principal)
		top.$('#dialog_page_iframe').attr('src',iframe_src).dialog( "open" );
		return false;	
	}


	/**
	* LOAD_INSPECTOR_RELATION_LIST_TAG
	*/
	this.load_inspector_relation_list_tag = function(tagName, tipo, parent) {	

		if(typeof tagName=='undefined') return alert("Error load_inspector_relation_list_tag: tagName is undefined")
		if(typeof tipo=='undefined') 	return alert("Error load_inspector_relation_list_tag: tipo is undefined")
		if(typeof parent=='undefined') 	return alert("Error load_inspector_relation_list_tag: parent is undefined")

		this.selected_tag 	= tagName;
		this.selected_tipo 	= tipo;

		var section_top_tipo 		= page_globals.tipo;
		var section_top_id_matrix	= page_globals._parent;
			//return alert(section_top_id_matrix)

		var wrapper_id 	= '#inspector_relation_list_tag';
		
		var mode 		= 'load_inspector_relation_list_tag';
		var mydata		= { 'mode': mode, 'tagName': tagName, 'tipo': tipo, 'parent': parent, 'section_top_tipo': section_top_tipo, 'section_top_id_matrix': section_top_id_matrix };
			//if(DEBUG) console.log(JSON.stringify(mydata))

		html_page.loading_content( wrapper_id, 1 );
		
		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/component_tools/tool_relation/trigger.tool_relation.php',
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			//if(DEBUG) console.log("->load_inspector_relation_list_tag: "+received_data)
			$(wrapper_id).html( received_data );
									
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on load_inspector_relation_list_tag [terminoID] " + terminoID + "</span>");
		})
		// ALLWAYS
		.always(function() {			
			html_page.loading_content( wrapper_id, 0 );
		});
	}//end load_inspector_relation_list_tag

	



	/**
	* REMOVE RELATION
	*/
	this.remove_relation_from_tag = function (btn_obj) {
		
		var id_matrix 	= $(btn_obj).data('id_matrix');		//return alert(caller_id);
		var rel_locator = $(btn_obj).data('rel_locator');	// like '1604.0.0'	or '1241.dd87.2'
		//var tag 		= $(btn_obj).data('tag');			// like [index-u-1] or [/index-u-1] 
		var tag 		= this.selected_tag ;
		var tipo 		= this.selected_tipo ; 	//return alert(tag + ' '+tipo)

		if (typeof tag=='undefined') 	return  alert("Error remove_relation_from_tag: tag is undefined")
		if (typeof tipo=='undefined') 	return  alert("Error remove_relation_from_tag: tipo is undefined")

		//var tipo 		= $(btn_obj).parents('.wrap_component').first().data('tipo');

		var wrapper_id 	= '#inspector_relation_list_tag';

		// Confirm action
		if( !confirm("¿ Remove relation ?\nID "+id_matrix) ) return false;

		var mode 		= 'remove_relation_from_tag';
		var mydata		= { 'mode': mode, 'id_matrix': id_matrix, 'rel_locator': rel_locator };
			//return alert( JSON.stringify(mydata) )

		html_page.loading_content( wrapper_id, 1 );	

		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/component_tools/tool_relation/trigger.tool_relation.php' ,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			if (DEBUG) console.log("->remove_relation_from_tag: " + received_data)

			// Notify complete to user
				//alert("Relation removed!\n\nID: " + id_matrix);
			// Reload 
				tool_common.load_inspector_relation_list_tag(tag, tipo, page_globals._parent);						
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg("<span class='error'>Error on " + getFunctionName() + " [caller_id] " + caller_id + "</span>");
		})
		// ALLWAYS
		.always(function() {			
			html_page.loading_content( wrapper_id, 0 );
		});

	}





	/**
	* OPEN_TOOL_PORTAL
	*/
	this.open_tool_portal = function ( button_obj ) {
		
		var id_matrix			= $(button_obj).data('id_matrix'),
			tipo 				= $(button_obj).data('tipo'),
			caller_id 			= $(button_obj).data('id_matrix'),
			top_tipo 			= $(button_obj).data('top_tipo'),
			top_id 				= $(button_obj).data('top_id'),
			portal_section_tipo = $(button_obj).data('target_section_tipo'),
			target_modo 		= 'tool_portal',
			iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix+'&caller_id='+caller_id +'&top_tipo='+top_tipo +'&top_id='+top_id+'&portal_section_tipo='+portal_section_tipo ;	//alert(iframe_src)

		var id_wrapper = $(button_obj).parents('.css_wrap_portal').first().attr('id');
			//return console.log(id_wrapper);
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool Portal "+id_matrix ,
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
		
		var id_matrix			= $(button_obj).data('id_matrix'),
			tipo 				= $(button_obj).data('tipo'),
			parent_matrix		= $(button_obj).data('parent_matrix');

		var target_modo 		= 'tool_pdf_versions';						
		var iframe_src			= DEDALO_LIB_BASE_URL + '/main/?m='+target_modo+'&t='+tipo+'&id='+id_matrix ;
		
		// Dialog Title
		top.$("#dialog_page_iframe").dialog({
			// Change title
			title: "Tool PDF versions "+id_matrix ,
			width:700,
			height:700,
			// Clear current content on close
			close: function(event, ui) {

				// Clean url
	            $(this).attr( 'src', '');

	            // Update component in opener page
				var component_related_obj_id = id_matrix;
				var component_related_obj = top.$(".pdf_object_thumb[data-id_matrix=" +component_related_obj_id+ "]");	
				if( $(component_related_obj).length == 1 ) {
					top.component_common.update_component_by_ajax(component_related_obj_id);
					if(DEBUG) top.console.log("->trigger opener update component "+component_related_obj_id)
				}else{
					if(DEBUG) top.alert("->open_tool_pdf_versions trigger opener update component ERROR for "+component_related_obj_id + "<br>Cause: n elements:"+$(component_related_obj).length)
				}

				
				// Search and update posible thumbs (case portal)
				var matches = $('.pdf_in_list[data-parent_matrix='+parent_matrix+']');	//alert("Search for id_matrix: "+parent_matrix+ " matches: "+matches.length)
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
	* SECTION LIST LOAD ROWS HISTORY
	*/
	this.section_list_recover_section = function ( btn_obj ) {

		var id_time_machine	= $(btn_obj).data('id_time_machine'),
			tipo 			= $(btn_obj).data('tipo'),
			wrap_div		= $('#tm_list_container');
		
		// CONFIRM
		if( !confirm( 'Recover record ?' )) return false;

		html_page.loading_content( wrap_div, 1 );
		
		var mydata		= { 
							'mode': 'section_list_recover_section',
							'tipo': tipo,
							'id_time_machine': id_time_machine
						  }

		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/component_tools/tool_time_machine/trigger.tool_time_machine.php',
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);	//alert(error_response)

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response != false) {
				// Alert error
				alert( received_data )
				//component_common.dd_alert(received_data);
			}else{
				// Reload page (in the future versions ajax load..)		
				window.location.href = window.location.href;
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on section_list_recover_section !</span> ");
		})
		// ALLWAYS
		.always(function() {			
			html_page.loading_content( wrap_div, 0 );
		});
		if (DEBUG) console.log("Fired section_list_recover_section: "+ id_time_machine + " " );	
	}








		/**
		* LOAD COMPONENT BY WRAPPER ID __EN_PROCESO__
		*
		*/
		this.load_tool_by_wrapper_id__EN_PROCESO__ = function (wrapper_id, arguments, callback) {
			
			var wrapper_obj	= $('#'+wrapper_id);	

			if($(wrapper_obj).length<1) return alert("load_tool_by_wrapper_id Error: \nDebug:\n  wrapper_id not found! : " +wrapper_id);

			//alert("vamos pallá... load_tool_by_wrapper_id \n wrapper localizado:" + wrapper_id)

			// VARS ON  WRAPPER
			var id			= $(wrapper_obj).data('id_matrix');
			var tipo		= $(wrapper_obj).data('tipo');
			var modo		= $(wrapper_obj).data('modo');
			var parent		= $(wrapper_obj).data('parent');
			var lang		= $(wrapper_obj).data('lang');
			var caller_id	= $(wrapper_obj).data('caller_id');

			var current_tipo_section = $(wrapper_obj).data('current_tipo_section');	// Usado al actualizar relation list

			var mode 		= 'load_tool_by_ajax';
			var mydata		= { 'mode': mode, 'id': id, 'tipo': tipo, 'modo': modo, 'parent': parent, 'lang': lang, 'caller_id': caller_id, 'current_tipo_section': current_tipo_section };	//if (DEBUG) console.log(mydata);


			var target 		=  $(wrapper_obj).find('.content_data').first();
				if(!$(target).length) return alert("load_tool_by_wrapper_id Error: (content_data not found inside!) : " +wrapper_id);
			
			//html_page.loading_content( wrapper_obj, 1 );

			$(target).load(
				this.url_trigger + " .content_data:first>*",
				mydata,
				function(response, status, xhr) {

				  	if (status == "error") {
				    	var msg = "Sorry but there was an error: ";
				    	$("#inspector_debug").html(msg + xhr.status + " " + xhr.statusText);
				    	return false;
					}
					//alert(response)

					/**
					* RELOAD JS COMPONENT SCRIPT
					* To reload DOM event handlers to current component
					*/
					// Data defined in component wrap like 'data-component_name=\"{$component_name}\"'
					var component_name 	= $(wrapper_obj).data('component_name');
					// Apply only to certain components
					if (typeof component_name != "undefined") {					
						
						if(component_name=='component_text_area') {
							
							$(function() {
								var textarea_id =  $(wrapper_obj).find('textarea').first().attr('id');
								// Init current text area editor by id
								text_editor.init(textarea_id);					
							});

							/**/
							// BTN RELATION CURRENT TAG SHOW
							// Context
							var url_caller_id = get_current_url_vars()['caller_id'];	//alert(url_caller_id);
							//alert(typeof url_caller_id)
							if (typeof url_caller_id != "undefined") {								
								$('.btn_relate_fragment').css('display','inline-block');
							};



							/*
							// Usage . Ajax cached load of script
							// URL path absolute by components standar js path
							var js_url 			= DEDALO_LIB_BASE_URL + '/'+component_name+'/js/'+component_name+'.js';
							//alert(modo + 'inside')
							// Set global modo like current modo before load javascript
							modo = modo;

							$.cachedScript(js_url).done(function(script, textStatus) {
								//if (DEBUG) console.log( '->>textStatus '+textStatus + ' '+script );
								if (textStatus!='success') { alert("Error on load script " + js_url)};
							});
							*/
						}
						// UPDATE GERERAL TAP STATE
						// Needed for portal component updates
						html_page.taps_state_update();
						
					}else{
						if (DEBUG) console.log( "->load_tool_by_wrapper_id: ALERT: component_name is undefined" )
					}							
					if (DEBUG) console.log( "->load_tool_by_wrapper_id: loaded wrapper: " + wrapper_id + " "+xhr.statusText )

					

					// Callback optional
					if (callback && typeof(callback) === "function") {  
				        callback();
				    }

				    // Focus loaded component
				    if (changed_original_content == 1) {						
						component_common.select_wrap(wrapper_obj);
					}

					//html_page.loading_content( wrapper_obj, 0 );				
				}
			);
			//if (DEBUG) console.log( "->load_tool_by_wrapper_id: " + wrapper_id )
			
			return false;
		}


	/**
	* OPEN TOOL IMPORT IMAGES (OPEN NEW WINDOW)
	*/
	this.open_tool_import_images = function ( button_obj ) {
		
		var button_tipo			= $(button_obj).data('tipo'),
			target_section_tipo	= $(button_obj).data('target_section_tipo'),
			window_url			= DEDALO_LIB_BASE_URL + '/main/?m=tool_import_images&t='+target_section_tipo+'&button_tipo='+button_tipo+"&context=files" ,	
			window_name			= "Tool import images";

		// Open and focus window
		var tool_import_images_window=window.open(window_url,window_name);
		tool_import_images_window.focus()
	}
	
}//end class tool_common

