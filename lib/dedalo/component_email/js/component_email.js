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

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_email:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const dato = []

		// ul list of inputs
		const parent_ul = wrapper_obj.getElementsByTagName('ul')[0] //wrapper_obj.querySelector('.content_data')

		// li elements
		const li_nodes = parent_ul.childNodes

		const len = li_nodes.length
		for (let i = 0; i < len; i++) {
			let value = li_nodes[i].getElementsByTagName('input')[0].value
			if(value.length > 0){
				dato.push(value)
			}
		}

		return dato
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

			const wrapper_obj 		 = component_common.get_wrapper_from_element(component_obj)
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

		return true
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
	this.send_email = function(button, selector='current') {

		let emails = []
		if (selector==='all') {
			emails = button.parentNode.parentNode.querySelectorAll("input")
		}else{
			emails = button.parentNode.querySelectorAll(":scope > input")
		}

		const ar_values = []
		const emails_lenght = emails.length
		for (var i = 0; i < emails.length; i++) {
			if(emails[i].value.length>4) ar_values.push(emails[i].value)
		}

		if(ar_values.length<1){
			return false
		}
		//window.open(iri, '_blank')
		//window.open('mailto:'+email, '_blank');
		window.location.href = 'mailto:' + ar_values.join(",")

		return true
	}//end send_email



	/**
	* SEND MULTIPLE EMAIL CALCULATION
	*/
	this.send_multiple_email_calculation = function(component_obj) {

		const multiple_data_tipo = component_obj.dataset.multiple_data_tipo
		const wrap_calculation 	 = document.querySelector(".wrap_component[data-tipo="+multiple_data_tipo+"]")

		// refresh_dato promise
		component_calculation.refresh_dato(wrap_calculation).then(function(response){

			const emails = response.toString()

			//let mail_body = document.createElement( 'html' );
			window.location.href = "mailto:?bcc=" + emails ; //+ "&body=" +mail_body
		});
	}//end send_multiple_email_calculation



	/**
	* ADD_INPUT
	* Generates new full input html (including li) cloning first input element
	* and append to parent ul
	*/
	this.add_input = function(button) {

		const parent = button.parentNode.parentNode;
		//select the ul and li nodes
		const ul_input_text = parent.querySelector("ul");
		const li_input_text = ul_input_text.querySelector("li");
		//clone the frist li
		const new_li = li_input_text.cloneNode(true);

		//count the number of childrens
		const total_li_nodes = ul_input_text.childNodes.length
		//clear value for the new li node
		const new_li_input = new_li.querySelector("input")
		new_li_input.value = "";

		//set the id to the raid position
		new_li_input.id = new_li_input.id.replace("input_0","input_"+total_li_nodes);
		//remove the clone "onchange" listener
		//new_li_input.removeEventListener("onchange","component_iri")

		//append the new node to the ul
		ul_input_text.appendChild(new_li)

		return true
	}//end add_input



}//end component_email
