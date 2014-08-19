// JavaScript Document
$(document).ready(function() {
	

	switch(page_globals.modo) {
		
		case 'edit' :	
					break;

		case 'relation' :
					break;

	}	
	
});


// COMPONENT COMMON
var component_relation = new function() {

	this.relation_trigger_url = DEDALO_LIB_BASE_URL + '/component_relation/trigger.component_relation.php' ;


	/**
	* REMOVE RELATION FROM SECTION
	*/
	this.remove_relation_from_section = function (btn_obj) {
		
		var caller_id 	= $(btn_obj).data('caller_id');		//return alert(caller_id);
			if(typeof( caller_id )=='undefined' )		return alert("Error: remove_relation_from_section: id_matrix is not valid! ");

		var caller_tipo 	= $(btn_obj).data('caller_tipo');		//return alert(caller_tipo);
			if(typeof( caller_tipo )=='undefined' )		return alert("Error: remove_relation_from_section: caller_tipo is not valid! ");

		var tipo 		= $(btn_obj).data('tipo');			//alert('component_relation_'+tipo );
			if(typeof( tipo )=='undefined' )			return alert("Error: remove_relation_from_section: tipo is not valid! ");

		var rel_locator = $(btn_obj).data('rel_locator');	// like '1604.0.0'	or '1241.dd87.2'
			if(typeof( rel_locator )=='undefined' )		return alert("Error: remove_relation_from_section: rel_locator is not valid! ");

		// Confirm action
		if( !confirm("Remove relation ?\nID "+rel_locator) )  return false;

		var mode 		= 'remove_relation_from_section';
		var mydata		= { 'mode': mode, 'caller_id': caller_id, 'rel_locator': rel_locator, 'tipo': tipo };		

		//var target_wrap_id 	= 'wrap_relation_list_'+tipo;	if (DEBUG) console.log(target_wrap_id);
		var target_wrap_id 	= 'wrap_relation_list_'+tipo+'_'+caller_id;
		var target_obj 		= $('#'+target_wrap_id);

		//html_page.loading_content( target_obj, 1 );
	
		// AJAX CALL
		$.ajax({
			url			: this.relation_trigger_url,
			data		: mydata,
			type		: "POST"
		})
		// DONE
		.done(function(received_data) {
			if (DEBUG) console.log("->remove_relation_from_section: " + received_data)
			// Reload ajax div
			component_common.load_component_by_wrapper_id(target_wrap_id)
		})
		.fail( function(jqXHR, textStatus) {					
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + " [id_matrix] " + id_matrix + "</span>" + textStatus );
		})
		.always(function() {
			top.inspector.show_log_msg("<span class='ok'>Removed relation "+rel_locator+"</span>");	
			//html_page.loading_content( target_obj, 0 );																							
		})	
	}





	/**
	* ADD RELATION (Pasado al tool)
	* Añade la relación seleccionada desde el listado de registros (rows) o desde el botón add relation of current tag en component_text_area (etiquetas de indexación)
	*//*
	this.add_relation = function (btn_obj) {
		
		//return alert("SIMPLIFICAR ESTO, BUSCANDO SÓLO EL SELECTOR PARA COLOCAR EL SECTION GROUP ANTES , EN LUGAR DE DESPUÉS DEL ÚLTIMO SECTION GROUP...")
		// ID MATRIX id de la seccion actual
		var id_matrix 		= $(btn_obj).data('id_matrix');
		if(typeof( id_matrix )=='undefined' || id_matrix==-1 )			return alert("Error: add_relation: id_matrix is not valid! " + id_matrix);

		// REL LOCATOR etiqueta actual like '1604.0.0'	or '1241.dd87.2'
		var rel_locator = $(btn_obj).data('rel_locator');
			if(typeof( rel_locator )=='undefined' || rel_locator==-1) 	return alert("Error: add_relation: rel_locator is not valid! " +rel_locator);

		// CALLER TIPO tipo del component_relation origen like 'dd71'
		var caller_tipo = get_current_url_vars()['caller_tipo'];//$(btn_obj).data('caller_tipo');
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
		var mydata		= { 'mode': mode, 'id_matrix': id_matrix, 'caller_id': caller_id , 'caller_tipo': caller_tipo , 'rel_locator': rel_locator};
		
		//if (DEBUG) console.log("-> data from component_relation.add_relation:");
		//if (DEBUG) console.log(mydata); return false;

		var received_data;

		var target_wrap_id 	= 'wrap_relation_list_'+tipo+'_'+caller_id;	//if (DEBUG) console.log(target_wrap_id);return false;
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
			if (DEBUG) console.log("->add_relation: " + received_data)

			// Reload ajax div records list
			if ( $(target_obj).length > 0 ) {
				// Reload only 1 box if exists
				top.component_common.load_component_by_wrapper_id( target_wrap_id );	
					if (DEBUG) console.log("->add_relation: target_obj exists. Reloading target_wrap_id:" +target_wrap_id)

			}else{

				if (DEBUG) console.log("->add_relation target_wrap_id not exists:" + target_wrap_id + ' Intentamos crear un nuevo section group');										

				// Buscamos el último relation section group
				//var last_relation_section_group = top.$('.css_wrap_relation').last();	//if (DEBUG) console.log( last_relation_section_group )
				// Para evitar conflictos con los portales, buscamos filtrando las de "data-tipo=" tipo actual del componente relation
				//var last_relation_section_group = top.$('.css_wrap_relation[data-tipo='+caller_tipo+']').last();	//if (DEBUG) console.log( last_relation_section_group.length )
				// Buscamos el relation selector correspondiente a esta relación
				// Como está decorado por un section_group, seleccionamos desde el, hacia arriba, el section group que lo contiene. Ese será el referente para insertar el nuevo wrap
				var last_relation_section_group = top.$('.css_section_group_content[data-caller_id=' + caller_id + ']').parents('.css_section_group_wrap').first();	//if (DEBUG) console.log( last_relation_section_group.length )
				
				if ( last_relation_section_group.length>0) {

					// Build new wrap to insert before relation selector
					jQuery(function($) {
						// Wrapper . Create wrapper with data and div content_data
						$('<div class="css_wrap_relation wrap_component" id="'+target_wrap_id+'" \
						data-id_matrix="'+caller_id+'" \
						data-tipo="'+caller_tipo+'" \
						data-lang="'+dedalo_data_nolan+'" \
						data-parent="'+parent+'" \
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
							if (DEBUG) console.log("->add_relation New wrap created. Reloading target_wrap_id:" +target_wrap_id)									
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
	*/

	/*
	this.load_selector_html = function(id_matrix) {
		
		var myurl 		= DEDALO_LIB_BASE_URL + '/component_relation/trigger.component_relation.php' ;
		var mode 		= 'load_selector_html';
		var mydata		= { 'mode': mode, 'id_matrix': id_matrix };

		var target_obj 	= $('#inspector_relations');

		if ( $(target_obj).html().length >5 ) { return null; };

		var received_data;

		$.ajax({
			url			: myurl,
			data		: mydata,
			type		: "POST",
			beforeSend	: function() {							
							// Spinner loading
							html_page.loading_content( target_obj, 1 );
						},
			success		: function(received_data) {
							//alert(received_data)
							$(target_obj).html(received_data);	if (DEBUG) console.log("->load_selector_html "+id_matrix );
						},
			complete	: function() {							
							html_page.loading_content( target_obj, 0 );
						},
			error		: function(error_data) {					
							
							inspector.show_log_msg("<span class='error'>Error on load_selector_html " + id_matrix + "</span>")							
							// Show old content
							html_page.loading_content( target_obj, 0 );																							
						}
		});//fin $.ajax	
	}
	*/

	/*
	// RELATION LIST CANDIDATES
		this.relation_candidates_list_DISABLED = function (btn_obj, close_div) {
			
			var section_tipo= $(btn_obj).data('tipo')
			
			var mode 		= 'relation_candidates_list';
			var mydata		= { 'mode': mode, 'section_tipo': section_tipo };
			var target_div	= $(btn_obj).next('.relation_candidates_list');
			var received_data;

			
			// Toogle
			close_div = true;
			if(target_div.css('display')!='none' && target_div.html().length >2 && close_div!==false) {
				target_div.css('display','none');
				return false;
			}
			
			$.ajax({
				url			: this.relation_trigger_url,
				data		: mydata,
				type		: "POST",
				beforeSend	: function() {
												
								target_div.html('<span>Loading..</span>');//target_div.html("id:" + id +" parent:"+parent + " tipo:" +tipo );	
								target_div.addClass('css_spinner');
								target_div.show(0);							
							},
				success		: function(received_data) {
																	
								target_div.hide(0);
								target_div.removeClass('css_spinner');								
								target_div.html(received_data);		
								target_div.fadeIn(400);
																													
							},
				complete	: function(data_complete) {

								inspector.show_log_msg("<span class='ok'>Loaded " + getFunctionName() + " [section_tipo] " + section_tipo + "</span>");

								// Rellena el dato 'parent' con el data-id_matrix del boton
								$(target_div).find('.btn_add_relation').html("Add to relation").data('parent','68');
																										
							},
				error		: function(error_data) {					
								
								inspector.show_log_msg("<span class='error'>Error on " + getFunctionName() + " [section_tipo] " + section_tipo + "</span>")
								
								target_div.html('');
								target_div.removeClass('css_spinner');																							
							}
			});//fin $.ajax	
	}
	*/




}; // end component_relation

