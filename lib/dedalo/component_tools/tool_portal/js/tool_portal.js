// JavaScript Document
/*
	tool_portal
*/



// TOOL_PORTAL CLASS
var tool_portal = new function() {

	// LOCAL VARS
	this.url_trigger = DEDALO_LIB_BASE_URL + '/component_tools/tool_portal/trigger.tool_portal.php' ;

	// Global var. Set when load fragment info	
	this.selected_tag;
	this.selected_tipo;
	this.selected_rel_locator;


	/**
	* ADD RESOURCE
	* Añade la relación seleccionada desde el listado de registros (rows) o desde el botón add resource of current tag en component_text_area (etiquetas de indexación)
	*/
	this.add_resource = function (button_obj) {

		// CALLER_ID Parámetro global pasado en el url 
		// Nótese que al ser llamado este método desde un iframe y ejecutado desde el parent, caller_id es equivalente a page_globals._parent en el dialog box que lo aloja
		// caller_id es el id matrix del componente resource que alberga este tool
		var caller_id = page_globals.caller_id;		
			if (typeof caller_id=='undefined' || !caller_id) 		return alert("Error: add_resource: caller_id is not defined!");

		// REL LOCATOR etiqueta actual like '1604.0.0'	or '1241.dd87.2'
		var rel_locator = $(button_obj).data('rel_locator');
			if(typeof rel_locator=='undefined' || rel_locator==-1)	return alert("Error: add_resource: rel_locator is not valid! " +rel_locator);
		
		// TIPO
		var tipo = $(button_obj).data('tipo');
			if(typeof tipo=='undefined' || tipo==-1)	return alert("Error: add_resource: tipo is not valid! " +tipo);

			//return alert( "add_resource test pasado. caller_id:"+caller_id+" rel_locator:"+rel_locator+" tipo:"+tipo  );	

		var target_obj 	= $('#html_page_wrap');	
		// Spinner loading
		html_page.loading_content( target_obj, 1 );

		var mode 		= 'add_resource';
		//var mydata		= { 'mode': mode, 'id_matrix': id_matrix, 'caller_id': caller_id , 'caller_tipo': caller_tipo , 'rel_locator': rel_locator};
		var mydata		= { 'mode': mode , 'caller_id': caller_id , 'rel_locator': rel_locator , 'tipo': tipo };
		
		$.ajax({
			url			: this.url_trigger,
			data		: mydata,
			type		: "POST"
		})
		.done(function(data_response) {

			// Search 'error' string in response
			var error_response = /error/.test(data_response);

			// If data_response contain 'error' show alert error with (data_response) else reload the page
			if(error_response != false) {
				// Alert error
				alert("[add_resource] Request failed: \n" + data_response + $(data_response).text() );
			}else{
				// Espected value string ok
				if(data_response=='ok') {

					//alert("Resource added!", 'Info', function(){
						top.$("#dialog_page_iframe").dialog("close");
					//});
				
				}else{
					alert("[add_resource] Warning: " + data_response);
				}
			}
		})
		.fail( function(jqXHR, textStatus) {
			alert("resource error!")
			// log
			top.inspector.show_log_msg( "<span class='error'>Error on " + getFunctionName() + "</span>" + textStatus );
		})
		.always(function() {
			html_page.loading_content( target_obj, 0 );
		})

	}//end add_resource
	


	


};//end tool_portal