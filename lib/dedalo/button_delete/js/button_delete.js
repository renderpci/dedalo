





var button_delete = new function() {


	/**
	* LOAD (EVENT)
	*/
	window.addEventListener("load", function (event) {
		
		button_delete.create_dialog_div()

		// JQUERY UI CONFIRMATION DIALOG AND DELETE ACTION 
		$(function(){
			// DELETE LINK
			var button_delete_obj = $('a.button_delete');
			$(document.body).on('click', button_delete_obj.selector, function(e){			
				// Configure global object to be delete
				delete_obj = $(this);
				// Open delete dialog
				button_delete.open_delete_dialog()
				return false;
			});			
		});//$(function()

	});//end load



	/**
	* CREATE_DIALOG_DIV
	* Add delete confirmation dialog text
	*/
	this.create_dialog_div = function() {

		if (page_globals.modo!='list') return false;

		var confirmation_div = document.createElement('div');
			confirmation_div.id = 'delete_dialog'
			confirmation_div.style.display = 'none'
			confirmation_div.innerHTML = '<p>'+get_label.esta_seguro_de_borrar_este_registro+'</p>'
						
		document.body.appendChild(confirmation_div);
	};//end create_dialog_div



	/**
	* OPEN_DELETE_DIALOG
	* @return 
	*/
	this.open_delete_dialog = function() {

		var delete_dialog = document.getElementById('delete_dialog')
			delete_dialog.style.display = 'block'
		
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
		}).dialog('open');
	};//end open_delete_dialog
	


	/**
	* DEL
	* Delete record with options (modo)
	* Note: delete_obj is a global var (jquery object) set when user clicks on a delete button
	*/
	var delete_obj = null;
	this.Del = function (modo) {
		
		var obj		= delete_obj;	if(obj==null || obj.length==0) return( alert(" Del : delete_obj is null ") );	
		var tipo	= $(obj).data('tipo');				//alert(tipo); return false;
		var id		= $(obj).data('section_id');
			
		var myurl 	= DEDALO_LIB_BASE_URL + '/button_delete/trigger.button_delete.php' ;
		var mode 	= modo;
		var mydata	= { 'mode' 	  : mode,
						'tipo' 	  : tipo,
						'id'	  : id,
						'top_tipo': page_globals.top_tipo
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