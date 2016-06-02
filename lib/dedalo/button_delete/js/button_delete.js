// JavaScript Document





var button_delete = new function() {

	$(document).ready(function() {	
		
		// ADD DELETE CONFIRMATION DIALOG TEXT
		$('body').append( '<!-- ui-dialog -->\
							<div id="delete_dialog" title="Delete">\
							<p>'+get_label.esta_seguro_de_borrar_este_registro+'</p>\
							</div>\
							' );
	});



	$(window).load(function() {   
		
		// JQUERY UI CONFIRMATION DIALOG AND DELETE ACTION 
		$(function(){
			//alert(get_label.cancelar)

			var noButtonName = "No";

			// DELETE DIALOG 
			$('#delete_dialog').dialog({
						
				autoOpen: false,
				width: 600,
				closeOnEscape: true,
				modal: true,
				buttons: [
							{
								// CANCEL BUTTON
								text: get_label.cancelar,
								click: function() {
									$(this).dialog("close");
									}
							},
							{
								// DELETE ONLY DATA BUTTON
								text: get_label.borrar_solo_datos,
								click: function() {
									button_delete.Del('delete_data');
									$(this).dialog("close");
									}
							},
							{
								// DELETE DATA AND RECORD BUTTON
								text: get_label.borrar_registro_completo,
								click: function() {
									button_delete.Del('delete_record');
									$(this).dialog("close");
									}
							}
						  ]
			});
			
			// OBJ SELECTOR
			var button_obj = $('a.button_delete');

			// DELETE LINK
			$(document.body).on("click", button_obj.selector, function(e){
				// Configure global object to be delete
				delete_obj = $(this);
				// Open delete dialog
				$('#delete_dialog').dialog('open');
				return false;
			});
			
		});//$(function()
		
	});



	var delete_obj = null;
	this.Del = function (modo) {
		
		var obj			= delete_obj;	if(obj==null || obj.length==0) return( alert(" Del : delete_obj is null ") );	
		var tipo		= $(obj).data('tipo');				//alert(tipo); return false;
		var id			= $(obj).data('section_id');
			
		var myurl 		= DEDALO_LIB_BASE_URL + '/button_delete/trigger.button_delete.php' ;
		var mode 		= modo;
		var mydata		= { 'mode': mode,
							'tipo': tipo,
							'id': id,
							'top_tipo':page_globals.top_tipo
						  };
						//if (DEBUG) console.log("Del data vars: " + 'mode:'+ mode+ ' tipo:'+ tipo + ' id:'+ id );		//return false;	
		
		// AJAX REQUEST
		$.ajax({
			url		: myurl,
			data	: mydata,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// Search 'error' string in response
			var error_response = /error/i.test(received_data);

			// If received_data contains 'error' show alert error with (received_data), else reload the page
			if(error_response) {
				// Alert error
				alert("Del: " + received_data )
				//component_common.dd_alert(received_data);
			}else{
				// Reload the current page
				window.location.href = window.location.href;
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on Del data id:" + id + "<br>Data is NOT deleted!</span>";				
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			//html_page.loading_content( wrap_div, 0 );
		});
		
		if (DEBUG) console.log("Fired Del modo: "+ modo + " " );	
		return false;	
	};



};//end button__delete

