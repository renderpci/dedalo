




// TOOL_RELATION CLASS
var tool_relation = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_relation/trigger.tool_relation.php' ;

	// Global var. Set when load fragment info	
	this.selected_tag;
	this.selected_tipo;
	this.selected_rel_locator;
	

	/**
	* OPEN_SECTION_LINK
	*/
	this.open_section_link = function( button_obj ) {

		var current_tipo 	= $(button_obj).data('tipo'),
			caller_tipo 	= $(button_obj).data('caller_tipo'),
			iframe_src 	 	= DEDALO_LIB_BASE_URL + "/main/?m=list&tipo="+current_tipo+"&caller_id="+caller_id+"&caller_tipo="+caller_tipo+"&context_name=list_into_tool_relation";	//return alert(iframe_src)

		// Temporal
		//if(current_tipo=='dd335') return alert("Option temporarily disabled. Relation to 'Patrimonio Inmaterial' is under construction ")
		$('#iframe_records_relation').attr('src',iframe_src)
	};

	

	/**
	* ADD RELATION
	* Añade la relación seleccionada desde el listado de registros (rows) o desde el botón add relation of current tag en component_text_area (etiquetas de indexación)
	*/
	this.add_relation = function (btn_obj) {

		// CALLER_ID Parámetro global pasado en el url 
		// Nótese que al ser llamado este método desde un iframe y ejecutado desde el parent, caller_id es equivalente a page_globals._parent en el dialog box que lo aloja
		// caller_id es el id matrix del componente relation que alberga este tool
		var caller_id = page_globals._parent;
			if (typeof caller_id=='undefined' || !caller_id) { return alert("Error: add_relation: caller_id is not defined!"); };

		// REL LOCATOR etiqueta actual like '1604.0.0'	or '1241.dd87.2'
		var rel_locator = $(btn_obj).data('rel_locator');
			if(typeof rel_locator=='undefined' || rel_locator==-1) 	return alert("Error: add_relation: rel_locator is not valid! " +rel_locator);

		// TIPO : Lo extraemos de la etiqueta como '1241.dd87.2'
		var tipo = $(btn_obj).data('tipo');
			if(typeof tipo=='undefined' || tipo==-1) 	return alert("Error: add_relation: tipo is not valid! " +tipo);
		
			//return alert( "add_relation test pasado. caller_id:"+caller_id+" rel_locator:"+rel_locator+" tipo:"+tipo );


		var target_obj 	= $('#html_page_wrap');	
		// Spinner loading
		html_page.loading_content( target_obj, 1 );

		var mode 		= 'add_relation';
		//var mydata		= { 'mode': mode, 'id_matrix': id_matrix, 'caller_id': caller_id , 'caller_tipo': caller_tipo , 'rel_locator': rel_locator};
		var mydata		= { 'mode': mode,
							'caller_id': caller_id ,
							'rel_locator': rel_locator ,
							'tipo': tipo,
							'top_tipo': page_globals.top_tipo
						};
		
		$.ajax({
			url			: this.url_trigger,
			data		: mydata,
			type		: "POST"
		})
		.done(function(data_response) {

			// Search 'error' string in response
			var error_response = /error/i.test(data_response);							

			// If data_response contain 'error' show alert error with (data_response) else reload the page
			if(error_response) {
				// Alert error
				alert("[add_relation] Request failed: \n" + data_response + $(data_response).text() );
			}else{
				// Espected int value >0
				if(data_response=='ok') {
					alert( get_label.relacion_anadida )	
				}else{
					alert("[add_relation] Warning: " + data_response)
				}													
			}
		})
		.fail( function(jqXHR, textStatus) {
			alert("relation error!")					
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + "</span>" + textStatus );
		})
		.always(function() {
			html_page.loading_content( target_obj, 0 );																							
		})

	}//end add_relation
	


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
		var mydata		= { 'mode': mode,
							'tagName': tagName,
							'tipo': tipo,
							'parent': parent,
							'section_top_tipo': section_top_tipo,
							'section_top_id_matrix': section_top_id_matrix,
							'top_tipo':page_globals.top_tipo
						};
			//if(SHOW_DEBUG===true) console.log(JSON.stringify(mydata))

		html_page.loading_content( wrapper_id, 1 );
		
		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/tools/tool_relation/trigger.tool_relation.php',
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {

			//if(SHOW_DEBUG===true) console.log("->load_inspector_relation_list_tag: "+received_data)
			$(wrapper_id).html( received_data );
									
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg(" <span class='error'>ERROR: on load_inspector_relation_list_tag [terminoID] " + terminoID + "</span>");
		})
		// ALWAYS
		.always(function() {			
			html_page.loading_content( wrapper_id, 0 );
		});
	}//end load_inspector_relation_list_tag




	/**
	* REMOVE RELATION
	*/
	this.remove_relation_from_tag = function (btn_obj) {
		
		var parent 		= $(btn_obj).data('parent');		//return alert(caller_id);
		var rel_locator = $(btn_obj).data('rel_locator');	// like '1604.0.0'	or '1241.dd87.2'
		//var tag 		= $(btn_obj).data('tag');			// like [index-u-1] or [/index-u-1] 
		var tag 		= this.selected_tag ;
		var tipo 		= this.selected_tipo ; 	//return alert(tag + ' '+tipo)

		if (typeof tag=='undefined') 	return  alert("Error remove_relation_from_tag: tag is undefined")
		if (typeof tipo=='undefined') 	return  alert("Error remove_relation_from_tag: tipo is undefined")

		//var tipo 		= $(btn_obj).parents('.wrap_component').first().data('tipo');

		var wrapper_id 	= '#inspector_relation_list_tag';

		// Confirm action
		if( !confirm("¿ Remove relation ?\nID "+parent) ) return false;

		var mode 		= 'remove_relation_from_tag';
		var mydata		= { 'mode': mode,
							'parent': parent,
							'rel_locator': rel_locator,
							'top_tipo':page_globals.top_tipo
						};
			//return alert( JSON.stringify(mydata) )

		html_page.loading_content( wrapper_id, 1 );	

		// AJAX REQUEST
		$.ajax({
			url			: DEDALO_LIB_BASE_URL + '/tools/tool_relation/trigger.tool_relation.php' ,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			if(SHOW_DEBUG===true) console.log("->remove_relation_from_tag: " + received_data)

			// Notify complete to user
				//alert("Relation removed!\n\nID: " + id_matrix);
			// Reload 
				tool_relation.load_inspector_relation_list_tag(tag, tipo, page_globals._parent);						
		})
		// FAIL ERROR 
		.fail(function(error_data) {					
			inspector.show_log_msg("<span class='error'>Error on " + getFunctionName() + " [parent] " + parent + "</span>");
		})
		// ALWAYS
		.always(function() {			
			html_page.loading_content( wrapper_id, 0 );
		});

	}


};//end tool_relation