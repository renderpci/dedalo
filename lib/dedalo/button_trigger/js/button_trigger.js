// JavaScript Document


/**
* BUTTON_TRIGGER CLASS
*/
var button_trigger = new function() {	


	this.executing = false;

	/**
	* TRIGGER
	*
	*/
	this.trigger = function (button_obj) {

		if (button_trigger.button_trigger === true) {
			console.log("Please wait process finish");
			return false;
		}
		
		var tipo		= button_obj.dataset.tipo,
			propiedades = JSON.parse( button_obj.dataset.propiedades );
		
		propiedades.section_tipo = page_globals.section_tipo

		if (typeof propiedades.trigger_url =='undefined') {
			return alert("Wrong url data [propiedades]")
		}else{
			var trigger_url = DEDALO_LIB_BASE_URL + propiedades.trigger_url;
		}
		
		var target_div = document.getElementById('button_trigger_'+tipo);
		if (!target_div) return alert("trigger: error target_div not found!");
				
		var mydata = propiedades;
			//return console.log(propiedades);

		// Spinner ON		
		target_div.innerHTML = ''
		target_div.style.display = 'block'
		target_div.classList.add("button_trigger_response_loading");
		html_page.loading_content( target_div, 1 );

		button_trigger.button_trigger = true;	

		// AJAX REQUEST
		$.ajax({
		  	url		: trigger_url,
			data	: mydata,
			type	: "POST"
		})
		// DONE
		.done(function(received_data) {		

			// If received_data contain 'error' show alert error with (received_data) else reload the page
			if(/error/i.test(received_data)) {
				// Alert error
				alert("[trigger] Request failed: \n" + received_data );
			}else{
				target_div.innerHTML  = received_data
				target_div.classList.remove("button_trigger_response_loading");
				target_div.style.cursor = 'pointer'
				target_div.addEventListener("dblclick", function(){
					this.innerHTML = ''
					this.style.display = 'none'
				}, false);
			}
		})
		// FAIL ERROR	 
		.fail(function(jqXHR, textStatus) {
			var msg = "[trigger] Request failed: " + textStatus ;
			target_div.innerHTML = " <span class='error'>Error on call trigger " + msg + "</span>";
		 	alert( msg );
		})
		// ALWAYS
		.always(function() {
			// Spinner OFF
			html_page.loading_content( target_div, 0 );
			button_trigger.button_trigger = false;
		})

	}//end this.trigger


};//end button_trigger
