"use strict";
/**
* COMPONENT_EMAIL
*
*
*/
var component_email = new function() {


	this.save_arguments = {} // End save_arguments 



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init
	
	

	/**
	* GET_DATO
	* update 13-01-2018
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)=="undefined" || !wrapper_obj) {
			console.log("[component_email:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		//String dato model
		let input_elements 	= wrapper_obj.getElementsByTagName("input");
		let dato 			= input_elements[0].value;
		
		return dato;
		

		// future array dato model
		let ar_dato = [];
		const len = input_elements.length
		for(let i=0; i < len; ++i) {
			if(input_elements[i].value) {
				ar_dato.push( input_elements[i].value)
			}
		}

		return ar_dato;
	};//end get_dato


	
	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// Avoid Safari autofill save
		if (!confirm(get_label["seguro"] + " [save email]")) {
			return false
		}

		if( component_email.verify_email(component_obj.value) ) {

			let wrapper_obj 		 = component_common.get_wrapper_from_element(component_obj)
			this.save_arguments.dato = this.get_dato(wrapper_obj)

			// Exec general save
			component_common.Save(component_obj, this.save_arguments)

			// Remove possible error class
			component_obj.classList.remove('css_email_error');	

		}else{
			
			// Add error class
			component_obj.classList.add('css_email_error');

			//component_obj.focus();
			alert("Data is NOT saved. Please enter a valid email address.");			
		}				
	}//end Save

	

	/**
	* VERIFY E-MAIL
	*/
	this.verify_email = function(email_value) {
			
		// When we want delete email data, allow empty value
		if (email_value.length<1) {			
			return true;
		}

		let status = false;     
		let emailRegEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;
		
		if (email_value.search(emailRegEx) == -1) {			
			status = false;		  
		}else{			 
			status = true;
		}
		

		return status;	    
	}//end verify_email



	/**
	* SEND E-MAIL
	*/
	this.send_email = function(component_obj) {

		let parent = component_obj.parentNode
		let email  = parent.querySelector("input").value
		
		if(email.length <= 0){
			return false
		}
		//window.open(iri, '_blank')
		//window.open('mailto:'+email, '_blank');
		window.location.href = 'mailto:' + email

		return true
	}//end send_email



	/**
	* SEND MULTIPLE EMAIL CALCULATION
	*/
	this.send_multiple_email_calculation = function(component_obj) {

		let multiple_data_tipo 	= component_obj.dataset.multiple_data_tipo		
		let wrap_calculation 	= document.querySelector(".wrap_component[data-tipo="+multiple_data_tipo+"]")

		// refresh_dato promise
		component_calculation.refresh_dato(wrap_calculation).then(function(response){
			
			const emails = response.toString()

			//let mail_body = document.createElement( 'html' );
			window.location.href = "mailto:?bcc=" + emails ; //+ "&body=" +mail_body 
		});
	}//end send_multiple_email_calculation



}//end component_email