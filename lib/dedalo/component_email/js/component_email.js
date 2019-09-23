// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../common/js/component_common.js'
	import {render_component_email} from '../../component_email/js/render_component_email.js'



export const component_email = function(){

	this.id

	// element properties declare
	this.model
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.section_lang
	this.context
	this.data
	this.parent
	this.node

	return true
}//end component_email



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	component_email.prototype.init 					= component_common.prototype.init
	component_email.prototype.destroy 				= common.prototype.destroy
	component_email.prototype.save 	 				= component_common.prototype.save
	component_email.prototype.load_data 			= component_common.prototype.load_data
	component_email.prototype.get_value 			= component_common.prototype.get_value
	component_email.prototype.set_value 			= component_common.prototype.set_value
	component_email.prototype.update_data_value		= component_common.prototype.update_data_value
	component_email.prototype.update_datum 			= component_common.prototype.update_datum

	// render
	component_email.prototype.render 	= common.prototype.render
	component_email.prototype.list 		= render_component_email.prototype.list
	component_email.prototype.edit 		= render_component_email.prototype.edit
	component_email.prototype.search 	= render_component_email.prototype.search



/**
* UPDATE_DATA_VALUE_FROM_DOM
* Update component data value with dom node actual value
* @return bool true
*//*
component_email.prototype.update_data_value_from_dom = function() {

	const self = this
	const node = self.node

	// inputs
		const ar_inputs = node.querySelectorAll('input')
		const ar_value  = []
		for (let i = 0; i < ar_inputs.length; i++) {
			ar_value.push(ar_inputs[i].value)
		}

	// set value in data instance
		self.data.value = ar_value

	return true
}//end update_data_value_from_dom
*/



/**
* VERIFY E-MAIL
* @param string email_value
* @return bool status
*/
component_email.prototype.verify_email = function(email_value) {

	// When we want delete email data, allow empty value
	if (email_value.length<1) {
		return true;
	}

	let status = false;
	let emailRegEx = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;
	let ar_email=[]

	if (!Array.isArray(email_value)){
		ar_email.push(email_value)
	}else{
		ar_email = email_value
	}

	ar_email.forEach(function(email) {
	 	if (email.search(emailRegEx) == -1) {
			status = false;
		}else{
			status = true;
		}
  	})

	return status;
}//end verify_email

/**
* SEND E-MAIL
*/
component_email.prototype.send_email = function(component_obj) {

	const email = component_obj.parentNode.querySelector('input').value

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
component_email.prototype.send_multiple_email_calculation = function(component_obj) {
/** TODO
*   Not working currently. Adapt to version 6 and call it where/when it is needed.
*/
	let multiple_data_tipo 	= component_obj.dataset.multiple_data_tipo
	let wrap_calculation 	= document.querySelector(".wrap_component[data-tipo="+multiple_data_tipo+"]")

	// refresh_dato promise
	component_calculation.refresh_dato(wrap_calculation).then(function(response){

		const emails = response.toString()

		//let mail_body = document.createElement( 'html' );
		window.location.href = "mailto:?bcc=" + emails ; //+ "&body=" +mail_body
	});
}//end send_multiple_email_calculation

