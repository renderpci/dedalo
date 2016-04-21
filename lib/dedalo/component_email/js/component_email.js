





var component_email = new function() {

	this.save_arguments = {} // End save_arguments
	
	
	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		if (page_globals.modo=='edit' || page_globals.modo=='tool_time_machine') {

			if( component_email.verify_email(component_obj.value) ) {

				// Exec general save
				component_common.Save(component_obj, this.save_arguments);
				component_obj.classList.remove('css_email_error');	

			}else{
				
				component_obj.classList.add('css_email_error');
				//component_obj.focus();
				alert("Data is NOT saved. Please enter a valid email address.");				
				
			}
		}		
	};
	

	/**
	* VERIFY E-MAIL
	*/
	this.verify_email = function(email_value) {
		
		/* 
			var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
			//var re = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i; // Accept unicode

	    	return re.test(email_value);
	    	*/

    	// When we want delete email data
    	if (email_value.length<1) {
    		return true;
    	}

		var status = false;     
		var emailRegEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;
		
		if (email_value.search(emailRegEx) == -1) {
			 
	          //alert("Please enter a valid email address.");			  
	     }else {
			 
	          status = true;
	     }
		 
	     return status;
	    
	};

}//end component_email









