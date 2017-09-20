/**
* HIERARCHY CLASS
*
*
*
*/
var hierarchy = new function() {


	this.url_trigger = DEDALO_LIB_BASE_URL + '/hierarchy/trigger.hierarchy.php';


	/**
	* GENERATE_VIRTUAL_SECTION
	* @return 
	*/
	this.generate_virtual_section = function(button_obj, event) {
		
		button_trigger.trigger(button_obj).then(function(response){
			if(SHOW_DEBUG===true) {
				console.log("[hierarchy.generate_virtual_section] response",response)
			}
			/*
			if (response) {
				var div = document.createElement('div') 
					div.innerHTML = response
				button_obj.addChild(div)
			}
			*/

			// On finish, update default target_section for termns and models of current hierarchy
			hierarchy.update_target_section(button_obj)
		})

	};//end generate_virtual_section



	/**
	* UPDATE_TARGET_SECTION
	* @return 
	*/
	this.update_target_section = function(button_obj) {

		var trigger_vars = {
				mode 	: 'update_target_section',
				parent 	: button_obj.dataset.parent
		}
		//return console.log("[hierarchy.update_target_section]trigger_vars",trigger_vars)

		var tipo			= button_obj.dataset.tipo
		var response_div 	= document.getElementById('button_trigger_'+tipo)
			if (!response_div) {
				return alert("update_target_section: error response_div not found!")
			}

		html_page.loading_content( response_div, 1 );

		// Return a promise of XMLHttpRequest
		var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[hierarchy.update_target_section]response",response);
			}
				
			if (response &&  response.result) {

				// Show response	
				response_div.innerHTML += "<div>"+response.msg+"</div>";
				//response_div.innerHTML += "<pre>"+ JSON.stringify(response, null, 2) +"</pre>";

				// Refresh target components
				// Target section tipo (like ts1)
				var hierarchy53 = document.querySelector('.wrap_component[data-tipo="hierarchy53"]')
				if (hierarchy53) {
					component_common.load_component_by_wrapper_id( hierarchy53.id );
				}
				// Target section modelo tipo (like ts2)
				var hierarchy58 = document.querySelector('.wrap_component[data-tipo="hierarchy58"]')
				if (hierarchy58) {
					component_common.load_component_by_wrapper_id( hierarchy58.id );
				}
				// Children tipo (like ts1-1)
				var hierarchy45 = document.querySelector('.wrap_component[data-tipo="hierarchy45"]')
				if (hierarchy45) {
					component_common.load_component_by_wrapper_id( hierarchy45.id );
				}
				// Children model tipo (like ts2-1)
				var hierarchy59 = document.querySelector('.wrap_component[data-tipo="hierarchy59"]')
				if (hierarchy59) {
					component_common.load_component_by_wrapper_id( hierarchy59.id );
				}

				//return response
			}else{
				var msg = "[hierarchy.update_target_section] Error on ajax request"
				response_div.innerHTML = "<pre>"+msg+"</pre>";
			}
			
			html_page.loading_content( response_div, 0 );					
		}, function(error) {			
			// log
			console.log("[hierarchy.update_target_section] Error.", error);			
			html_page.loading_content( response_div, 0 );
		})


		return js_promise
	};//end update_target_section
		



};//end hierarchy