





var component_profile = new function() {

	this.url_trigger 	= DEDALO_LIB_BASE_URL + '/component_profile/trigger.component_profile.php' ;
	this.save_arguments = {} 


	
	/**
	* SAVE
	* @return 
	*/
	this.Save = function( component_obj ) {

		var value = parseInt(component_obj.value)
		
		if (component_obj.value<1) {
			return alert("Please, select one profile")
		}

		this.save_arguments = {
			'dato' : value
		}		

		// Exec general save		
		var jsPromise = component_common.Save(component_obj, this.save_arguments);

	};//end Save



	/**
	* go_to_profile
	* @return 
	*/
	this.go_to_profile = function( button_obj, section_tipo, uid ) {

		var profile_select  = document.getElementById(uid)
		if (profile_select) {
			
			var section_id  = profile_select.value,
				url 		= '?t='+section_tipo+'&id='+section_id+'&m=edit&top_tipo='+page_globals.top_tipo+'&top_id='+page_globals.top_id
			
			//console.log(url);			
			window.location.href = url
		}		

	}//end go_to_profile


	/**
	* APPLY_PROFILE [DEPRECATED]
	*/
	this.apply_profile = function(button_obj) {

		return alert("apply_profile IS DEPRECATED !!")	

		var selected_option = $(button_obj).prev('select').val(),
			wrapper_obj 	= $(button_obj).parents('.css_wrap_profile').first();
			current_user_id = $(wrapper_obj).data('parent');

		if (selected_option<1) {
			alert("Please, select one option")
			return false;
		}
		if (current_user_id<1) {
			alert("Error. current_user_id (parent) undefined")
			return false;
		}
		//console.log(button_obj)
		console.log("selected_option:"+selected_option+" - current_user_id:"+current_user_id)

		if(!confirm("Overwrite current user data?")) return false;
		
		var mode 		= 'apply_profile',
			mydata		= { 'mode': mode, 'selected_option': selected_option, 'current_user_id': current_user_id };	//return console.log(mydata)

		html_page.loading_content( wrapper_obj, 1 );

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger ,
			data	: mydata ,
			type 	: "POST"
		})
		// DONE
		.done(function(received_data) {

			// INSPECTOR LOG INFO			
			if (received_data.indexOf("Error")!=-1 || received_data.indexOf("error")!=-1 || received_data.indexOf("Failed")!=-1) {
				var msg = "<span class='error'>Failed apply profile</span>";
				inspector.show_log_msg(msg);
			}else{
				// Reload current page
				location.reload();
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			// Notify to log messages in top of page
			var msg = "<span class='error'>ERROR: on apply profile</span>";
			inspector.show_log_msg(msg);
			if (DEBUG) console.log(error_data);	
		})
		// ALWAYS
		.always(function() {
			html_page.loading_content( wrapper_obj, 0 );
		});


	}//end apply_profile




}//end component_profile


