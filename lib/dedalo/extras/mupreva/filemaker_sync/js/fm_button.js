/**
* FM_BUTTON CLASS
*/
var fm_button = new function() {

	this.updating = false;
	

	/**
	* UPDATE_DEDALO
	* @param string options (json encoded object)
	*/
	this.update_dedalo = function( button, options ) {

		if( fm_button.updating !== false ) {
			return alert("Please wait for the end of the current process. This can take a few minutes")
		}
		
		//console.log(button);
		//console.log(options);
		
		//var label = jQuery(button).html();
		var label = button;		

		//jQuery(button).html("Please wait..");
		jQuery(button).removeClass("fm_button").addClass("fm_button_wait");
		fm_button.updating =true;

		jQuery.ajax({
			url: 'trigger.filemaker_sync.php',
			type: 'POST',
			data: {
				'mode':'update_dedalo',
				'data': options
			}
		})
		.done(function(response) {
			//console.log(response);
			jQuery(button).removeClass("fm_button").addClass("fm_button_ok");
			alert( response + " done")
			// rango de IDS que se calculan a partir de ID que se envía en la url
			/*console.log(response + " done");
			json_options = JSON.parse(options);
			var new_id = parseInt(json_options.id);
			new_id++;
			json_options.id = String(new_id);
			console.log(json_options);
			options = JSON.stringify(json_options);
			console.log(options);
			if(new_id <= 37000){
				fm_button.updating =false;
				fm_button.update_dedalo(button, options);
			}
			*/


		})
		.fail(function(jqXHR, textStatus) {
			//console.log("error");
			jQuery(button).removeClass("fm_button").addClass("fm_button_fail");
			alert("Timeout (is possible that the current script is very long and this message is not necessarily an error) \n"+textStatus)
		})
		.always(function() {
			//console.log("complete");
			//jQuery(button).html("Sync Dedalo complete");
			jQuery(button).html(label); // Restore label
			fm_button.updating =false;
		});		

	}//end update_dedalo




}//end fm_button