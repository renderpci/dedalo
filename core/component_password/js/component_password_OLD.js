"use strict";
/**
* COMPONENT_PASSWORD
*
*
*/
var component_password = new function() {


	this.save_arguments = {}



	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		

		return true
	};//end init

	/**
	* GET_DATO
	* @param DOM object wrapper_obj
	* @return array dato
	*/
	this.get_dato = function(wrapper_obj) {

		if (typeof(wrapper_obj)==="undefined" || !wrapper_obj) {
			console.log("[component_password:get_dato] Error. Invalid wrapper_obj");
			return false
		}

		const dato = []

		let value = wrapper_obj.getElementsByTagName('input')[0].value
		if(value.length > 0){
			dato.push(value)
		}
		

		return dato
	};//end get_dato

	
	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		const wrap_div = find_ancestor(component_obj, 'wrap_component')
		if (wrap_div === null ) {
			if(SHOW_DEBUG===true) console.log(btn_obj);
			return alert("component_input_text:Save: Sorry: wrap_div dom element not found")
		}

		// When in mode 'login' not save nothing
		if( component_obj.dataset.modo==='login' ) return false;

		// Avoid Safari autofill save
		if (!confirm(get_label["seguro"] + " [edit password]")) {
			return false
		}

		// Test password is aceptable string
		const verify_password = component_password.verify_password(component_obj, component_obj.value);
		if( verify_password!==true ) {
			return false
		}
		
		// Exec general save
		const js_promise = component_common.Save(component_obj, this.save_arguments);
		//$(component_obj).removeClass('css_password_error');
		component_obj.classList.remove("css_password_error")

		// Exec mandatory test
		component_input_text.mandatory(wrap_div.id)


		return js_promise
	};//end save



	/**
	* PASSWORD VALIDATOR 0.1
	* (c) 2007 Steven Levithan <stevenlevithan.com>
	* MIT License
	*/ 
	this.verify_password = function (obj, pw, options) {

		if (pw.length<1) {
    		return true;
    	}
		
		// default options (allows any password)
		var o = {
			lower:    1,
			upper:    1,
			alpha:    0, /* lower + upper */
			numeric:  1,
			special:  0,
			length:   [6, 32],
			custom:   [ /* regexes and/or functions  (?=.*\d)(?=.*[a-z])(?=.*[A-Z])\w{6,} */ ],
			badWords: ["password", "contraseña", "clave","Mynew2Pass5K","dios","micontraseña"],
			badSequenceLength: 4,
			noQwertySequences: false,
			noSequential:      false
		};
		
		for (var property in options)
			o[property] = options[property];
		
		var	re = {
				lower:   /[a-z]/g,
				upper:   /[A-Z]/g,
				alpha:   /[A-Z]/gi,
				numeric: /[0-9]/g,
				special: /[\W_]/g
			},
			rule, i;
		
		// enforce min/max length
		if (pw.length < o.length[0] || pw.length > o.length[1]) {
			alert("Password is too short! \nPlease use from " + o.length[0] + " to " + o.length[1] + " chars ");
			return false;
		}
		
		// enforce lower/upper/alpha/numeric/special rules
		for (rule in re) {
			if ((pw.match(re[rule]) || []).length < o[rule]) {
				alert("Password is invalid! \nPlease mix lowercase / uppercase chars and numbers");
				return false;
			}
		}
		
		// enforce word ban (case insensitive)
		for (i = 0; i < o.badWords.length; i++) {
			if (pw.toLowerCase().indexOf(o.badWords[i].toLowerCase()) > -1) {
				alert("Bad word! \nPlease use a different password");
				return false;
			}
		}
		
		// enforce the no sequential, identical characters rule
		if (o.noSequential && /([\S\s])\1/.test(pw))
			return false;
		
		// enforce alphanumeric/qwerty sequence ban rules
		if (o.badSequenceLength) {
			var	lower   = "abcdefghijklmnopqrstuvwxyz",
				upper   = lower.toUpperCase(),
				numbers = "0123456789",
				qwerty  = "qwertyuiopasdfghjklzxcvbnm",
				start   = o.badSequenceLength - 1,
				seq     = "_" + pw.slice(0, start);
			for (i = start; i < pw.length; i++) {
				seq = seq.slice(1) + pw.charAt(i);
				if (
					lower.indexOf(seq)   > -1 ||
					upper.indexOf(seq)   > -1 ||
					numbers.indexOf(seq) > -1 ||
					(o.noQwertySequences && qwerty.indexOf(seq) > -1)
				) {
					return false;
				}
			}
		}
		
		// enforce custom regex/function rules
		for (i = 0; i < o.custom.length; i++) {
			rule = o.custom[i];
			if (rule instanceof RegExp) {
				if (!rule.test(pw))
					return false;
			} else if (rule instanceof Function) {
				if (!rule(pw))
					return false;
			}
		}
		
		// great success!
		return true;
	};//end password validator



	/**
	* MANDATORY
	* When input dataset mandatory var is true
	* Add class 'mandatory' to element (input) only when content is empty
	*/
	this.mandatory = function(id_wrapper) {

		const wrap_div = document.getElementById(id_wrapper)
			if (wrap_div===null) {
				console.log("Error on select wrap_div for id: "+id_wrapper);	
				return false;
			}

		const component_obj = wrap_div.querySelector('input.css_password')
		// Component dataset mandatory info
		const mandatory = JSON.parse(component_obj.dataset.mandatory)
		if (!mandatory || mandatory!==true) return false;

		if (this.is_empty_value(wrap_div)===true) {
			component_obj.classList.add('mandatory')
			
			
		}else{
			component_obj.classList.remove('mandatory')
			
		}

		return true
	};//end mandatory



	/**
	* IS_EMPTY_VALUE
	* @return bool
	*/
	this.is_empty_value = function(wrap_div) {

		let empty_value = true;

		const dato = this.get_dato(wrap_div);
		if (dato.length>0) {
			empty_value = false;
		}

		return empty_value;
	};//end is_empty_value




	/**
	* SELECT_WHEN_READ_ONLY
	* @return 
	*/
	this.select_when_read_only = function(input_obj, id_wrapper) {
		
		// Remove attribute
		input_obj.removeAttribute('readonly')

		// Select normally
		setTimeout(function(){
			component_common.select_wrap(input_obj, id_wrapper);
		},100)
		

		return true
	};//end select_when_read_only



}//end component_password