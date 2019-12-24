"use strict";
/**
* BUTTON_NEW CLASS
*
*
*/
var button_new = new function() {	



	this.trigger_url = DEDALO_CORE_URL + '/button_new/trigger.button_new.php';



	// NEW
	this.New = function (button_obj) {
	
		// Section tipo
		const section_tipo = common.safe_tipo( button_obj.dataset.tipo )

		const trigger_url  = this.trigger_url
		const trigger_vars = { 
			mode 			: 'new_record',
			section_tipo	: section_tipo,
			top_tipo 		: page_globals.top_tipo
		}	
		if(SHOW_DEBUG===true) {
			//console.log("[button_new.New] trigger_vars: " , trigger_vars); return
		}		

		// SECTION_WRAP_DIV
		const section_wrap_div = document.getElementsByClassName('css_section_wrap')[0]
		html_page.loading_content( section_wrap_div, 1 );

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				
				if (response && response.result) {
					if( Number.isInteger(response.result)===true && response.result > 0 ){
						// Go to edit record page of created section						
						window.location.href = '?t=' + section_tipo + '&id=' + response.result	
					}else{
						alert("[button_new.New] Error: section_id: " + response.result + " received is not valid")
						html_page.loading_content( section_wrap_div, 0 );
					}					
				}else{
					// Alert error
					alert("[button_new.New] Error on create new record")				
					console.error("[button_new.New] Error on new: ",response)
					if(SHOW_DEBUG===true) {
						console.trace()
					}
					html_page.loading_content( section_wrap_div, 0 );				
				}

		},function(error) {
			console.error("[button_new.New] error:",error);
			// Notify to log messages in top of page
			let msg = "<span class='error'>Error on create new record<br>Nothing is created!</span>";				
			inspector.show_log_msg(msg);
			html_page.loading_content( section_wrap_div, 0 );
		})

		return js_promise
	}//end this.New



};//end button_new