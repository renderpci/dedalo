




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
	* ADD RELATION
	* Añade la relación seleccionada desde el listado de registros (rows) o desde el botón add relation of current tag en component_text_area (etiquetas de indexación)
	*/
	this.add_relation__DES = function (button_obj) {
		
		//return alert("SIMPLIFICAR ESTO, BUSCANDO SÓLO EL SELECTOR PARA COLOCAR EL SECTION GROUP ANTES , EN LUGAR DE DESPUÉS DEL ÚLTIMO SECTION GROUP...")
		// ID MATRIX id de la seccion actual
		var id_matrix 		= $(button_obj).data('id_matrix');
			if(typeof( id_matrix )=='undefined' || id_matrix==-1 )		return alert("Error: add_relation: id_matrix is not valid! " + id_matrix);

		// REL LOCATOR etiqueta actual like '1604.0.0'	or '1241.dd87.2'
		var rel_locator = $(button_obj).data('rel_locator');
			if(typeof( rel_locator )=='undefined' || rel_locator==-1) 	return alert("Error: add_relation: rel_locator is not valid! " +rel_locator);

		// CALLER TIPO tipo del component_relation origen like 'dd71'
		var caller_tipo = get_current_url_vars()['caller_tipo'];//$(button_obj).data('caller_tipo');
			if(typeof( caller_tipo )=='undefined' || caller_tipo==-1) 	return alert("Error: add_relation: caller_tipo is not valid! " +caller_tipo);

		// CALLER ID . id matrix del component_.relation actual 
		var caller_id = get_current_url_vars()['caller_id'];
			if(typeof( caller_id )=='undefined' || caller_id==-1) 		return alert("Error: add_relation: caller_id is not valid! " +caller_id);		

		// TIPO . Obtendremos 'tipo' de la URL, en lugar del dato del objeto (es el tipo de la sección actual, no del componente actual)		
		var tipo = get_current_url_vars()['tipo'];
			if (typeof( tipo )=='undefined'|| tipo==-1) {
				// try with var 't'
				tipo = get_current_url_vars()['t'];
				if (typeof( tipo )=='undefined'|| tipo==-1) 
				return alert("Error: add_relation: tipo is not valid! "+tipo);
			}				
		//return alert( tipo );			
		var mode 		= 'add_relation';
		var mydata		= { 'mode': mode,
							'id_matrix': id_matrix,
							'caller_id': caller_id ,
							'caller_tipo': caller_tipo ,
							'rel_locator': rel_locator,
							'top_tipo':page_globals.top_tipo
						};
			if(SHOW_DEBUG===true) console.log(JSON.stringify(mydata));

			return false;
		
		//if(SHOW_DEBUG===true) console.log("-> data from component_relation.add_relation:");
		//if(SHOW_DEBUG===true) console.log(mydata); return false;

		var received_data;

		var target_wrap_id 	= 'wrap_relation_list_'+tipo+'_'+caller_id;	//if(SHOW_DEBUG===true) console.log(target_wrap_id);return false;
		var target_obj 		= top.$('#'+target_wrap_id);	// OJO: EL WRAP DESEADO ESTÁ EN LA PÁGINA BASE, NO EN EL IFRAME ACTUAL DESDE DONDE RELACIONAMOS !!

		// Spinner loading
		//html_page.loading_content( target_obj, 1 );	

		$.ajax({
			url			: this.relation_trigger_url,
			data		: mydata,
			type		: "POST"
		})
		.done(function(received_data) {

			//target_div.hide(0);
			//target_div.removeClass('css_spinner');								
			//target_div.html(received_data);		
			//target_div.fadeIn(400);
			//alert("add_relation function: \n"+received_data);
			if(SHOW_DEBUG===true) console.log("->add_relation: " + received_data)

			// Reload ajax div records list
			if ( $(target_obj).length > 0 ) {
				// Reload only 1 box if exists
				top.component_common.load_component_by_wrapper_id( target_wrap_id );	
					if(SHOW_DEBUG===true) console.log("->add_relation: target_obj exists. Reloading target_wrap_id:" +target_wrap_id)

			}else{

				if(SHOW_DEBUG===true) console.log("->add_relation target_wrap_id not exists:" + target_wrap_id + ' Intentamos crear un nuevo section group');										

				// Buscamos el último relation section group
				//var last_relation_section_group = top.$('.css_wrap_relation').last();	//if(SHOW_DEBUG===true) console.log( last_relation_section_group )
				// Para evitar conflictos con los portales, buscamos filtrando las de "data-tipo=" tipo actual del componente relation
				//var last_relation_section_group = top.$('.css_wrap_relation[data-tipo='+caller_tipo+']').last();	//if(SHOW_DEBUG===true) console.log( last_relation_section_group.length )
				// Buscamos el relation selector correspondiente a esta relación
				// Como está decorado por un section_group, seleccionamos desde el, hacia arriba, el section group que lo contiene. Ese será el referente para insertar el nuevo wrap
				var last_relation_section_group = top.$('.css_section_group_content[data-caller_id=' + caller_id + ']').parents('.css_section_group_wrap').first();	//if(SHOW_DEBUG===true) console.log( last_relation_section_group.length )
				
				if ( last_relation_section_group.length>0) {

					// Build new wrap to insert before relation selector
					jQuery(function($) {
						// Wrapper . Create wrapper with data and div content_data
						$('<div class="css_wrap_relation wrap_component" id="'+target_wrap_id+'" \
						data-id_matrix="'+caller_id+'" \
						data-tipo="'+caller_tipo+'" \
						data-lang="'+dedalo_data_nolan+'" \
						data-parent="'+page_globals._parent+'" \
						data-modo="edit" \
						data-dato="" \
						data-current_tipo_section="'+tipo+'" \
						data-component_name="component_relation" \
						/>')						
						.insertBefore(last_relation_section_group)
						.prepend('<!-- RELATION EDIT [current_tipo_section:'+tipo+'] (BUILDED BY ADD_RELATION) -->')	
						.append('<div class="content_data">Loading..</div>');												

						// Load component on created wrapper
						top.component_common.load_component_by_wrapper_id( target_wrap_id );
							if(SHOW_DEBUG===true) console.log("->add_relation New wrap created. Reloading target_wrap_id:" +target_wrap_id)									
					});

					//console.log("located selector: ")
					//console.log(last_relation_section_group);
					//alert("target_wrap_id:"+target_wrap_id);


				}else{
					// Si no hay ningún selector, alertamos
					alert("add_relation Error: Selector section_group reference not found! \n Impossible load new relation created");
				};							
			}

			// Close dialog modal window
			top.$("#dialog_page_iframe").dialog('close');
		})
		.fail( function(jqXHR, textStatus) {					
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>" + textStatus );
		})
		.always(function() {
			top.inspector.show_log_msg("<span class='ok'>Added relation "+rel_locator+"</span>");	
			//html_page.loading_content( target_obj, 0 );																							
		})		
	}


	/**
	* RELATE FRAGMENT FROM TAG
	* Prepara un objeto 'button_obj' que simula el comportamiento del link 'Add relation' en modo list y después llama al mismo método 'add_relation'
	*/
	this.relate_fragment_from_tag__DESACTIVO = function (button_obj) {
		// El button_obj recibido ha de tener en 'data' al menos: 
		// id_matrix (el de la sección, NO el del componente) 
		// rel_locator like '945.dd404.1' 		
		// caller_tipo like 'dd404'

		// Lo verificaremos antes de proceder
		if(typeof( $(button_obj).data('id_matrix') )=='undefined') {
			return alert("Error: relate_fragment: id_matrix is not defined!");
		}
		if(typeof( $(button_obj).data('rel_locator') )=='undefined') {
			return alert("Error: relate_fragment: rel_locator is not defined!");
		}

		var caller_tipo = page_globals.caller_tipo;
			if (typeof caller_tipo=='undefined') { return alert("Error: relate_fragment: caller_tipo is not defined!"); };

		var caller_id = page_globals.caller_id;
			if (typeof caller_id=='undefined') { return alert("Error: relate_fragment: caller_id is not defined!"); };
	

		// caller_tipo is iframe or page global var already defined
		// add var to button_obj
		$(button_obj).data('caller_tipo',caller_tipo);		//alert('caller_tipo:'+caller_tipo)

		// caller_id is iframe or page global var already defined
		// add var to button_obj
		$(button_obj).data('caller_id',caller_id);			//alert('caller_id:'+caller_id)
		
		
		if(typeof( $(button_obj).data('caller_tipo') )=='undefined' || typeof( $(button_obj).data('caller_id') )=='undefined') {
			return alert("Error: relate_fragment: caller_tipo/caller_id is not defined!");
		}
		
		this.add_relation(button_obj);
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