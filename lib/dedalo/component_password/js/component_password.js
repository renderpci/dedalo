





var component_password = new function() {

	this.save_arguments = {}


	$(document).ready(function() {	
	
		switch(page_globals.modo) {			
			case 'edit' :	// OBJ SELECTOR
					$('.css_wrap_password .css_password:input').blur();			
					break;		
		}

	});

	
	/**
	* SAVE
	*/
	this.Save = function(component_obj) {

		// When in mode 'login' not save nothing
		if( $(component_obj).data('modo')=='login' ) return false;

		// Test password is aceptable string
		var verify_password = component_password.verify_password(component_obj, $(component_obj).val());
					
		if( verify_password ) {
			// Exec general save
			component_common.Save(component_obj, this.save_arguments);
			$(component_obj).removeClass('css_password_error');
		}else{
			//$(component_obj).addClass('css_password_error').focus();
			//alert("Invalid password format!");	
		}

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
			badWords: ["password", "contraseña", "clave","Mynew2Pass5K"],
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





}//end component_password







