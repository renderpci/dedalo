// JavaScript Document
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
			buttons: {
			
				Cancel : function() {
					$(this).dialog("close");
				},
								
				"Delete only data": function() {
					Del('delete_data');
					$(this).dialog("close");
				},
				
				"Delete data and record": function() {
					Del('delete_record');
					$(this).dialog("close");
				},				
			}			
		});
		// Asignamos varianles traducidas a los botones del dialog
		$('.ui-dialog-buttonpane button:contains(Cancel)').find('span').html(get_label.cancelar);
		$('.ui-dialog-buttonpane button:contains(Delete only data)').find('span').html(get_label.borrar_solo_datos);
		$('.ui-dialog-buttonpane button:contains(Delete data and record)').find('span').html(get_label.borrar_registro_completo);

		//$('.ui-dialog-buttonpane button:contains(Cancel)').attr("id","dialog_box_send-button");            
		//$('#dialog_box_send-button').html(get_label.cancelar) 
		
		// OBJ SELECTOR
		var button_obj = $('div.css_button_delete');

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

function Del(modo) {
	
	var obj			= delete_obj;	if(obj==null || obj.length==0) return( alert(" Del : delete_obj is null ") );
	
	var tipo		= $(obj).data('tipo');				//alert(tipo); return false;
	var id			= $(obj).data('id_matrix');;	
		
	var myurl 		= DEDALO_LIB_BASE_URL + '/button_delete/trigger.button_delete.php' ;
	var mode 		= modo;
	var mydata		= { 'mode': mode, 'tipo': tipo, 'id': id };		//if (DEBUG) console.log("Del data vars: " + 'mode:'+ mode+ ' tipo:'+ tipo + ' id:'+ id );		//return false;	
	
	// AJAX REQUEST
	$.ajax({
		url		: myurl,
		data	: mydata,
		type 	: "POST"
	})
	// DONE
	.done(function(received_data) {

		// Search 'error' string in response
		var error_response = /error/i.test(received_data);	//alert(error_response)

		// If received_data contains 'error' show alert error with (received_data), else reload the page
		if(error_response != false) {
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
	// ALLWAYS
	.always(function() {
		//html_page.loading_content( wrap_div, 0 );
	});
	
	if (DEBUG) console.log("Fired Del modo: "+ modo + " " );	
	return false;	
}

