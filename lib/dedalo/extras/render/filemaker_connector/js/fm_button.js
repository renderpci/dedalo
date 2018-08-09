


var fm_button = new function() {

	/**
	* UPDATE_DEDALO
	* @param string options (json encoded object)
	*/
	this.update_dedalo = function( button, options ) {
		
		//console.log(options);
		$(button).html("Please wait..");

		$.ajax({
			url: 'filemaker_connector.php',
			type: 'POST',
			data: {
				'mode': 'update_dedalo',
				'data': options
			},
		})
		.done(function(response) {
			console.log(response);
			alert(response)
		})
		.fail(function() {
			console.log("error");
		})
		.always(function() {
			//console.log("complete");
			$(button).html("Update Dedalo");
		});
		

	}//end update_dedalo




}