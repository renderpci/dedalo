// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_password} from '../../component_password/js/render_edit_component_password.js'
	import {render_list_component_password} from '../../component_password/js/render_list_component_password.js'



export const component_password = function(){

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

	this.tools

	this.duplicates = false
}//end component_password



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_password.prototype.init				= component_common.prototype.init
	component_password.prototype.build				= component_common.prototype.build
	component_password.prototype.render				= common.prototype.render
	component_password.prototype.refresh			= common.prototype.refresh
	component_password.prototype.destroy			= common.prototype.destroy

	// change data
	component_password.prototype.save				= component_common.prototype.save
	component_password.prototype.update_data_value	= component_common.prototype.update_data_value
	component_password.prototype.update_datum		= component_common.prototype.update_datum
	component_password.prototype.change_value		= component_common.prototype.change_value
	component_password.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_password.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_password.prototype.list				= render_list_component_password.prototype.list
	component_password.prototype.tm					= render_list_component_password.prototype.list
	component_password.prototype.edit				= render_edit_component_password.prototype.edit



/**
* PASSWORD VALIDATOR 0.1
* (c) 2007 Steven Levithan <stevenlevithan.com>
* MIT License
* @param string pw
* @param object options
* @return object response
*  Sample:
*  {
*		result	: false,
*		msg		: "Password is invalid! Please mix lowercase / uppercase chars and numbers"
*	}
*/
component_password.prototype.validate_password_format = function (pw, options) {

	// empty case
		if (pw.length<1) {
			const response = {
				result	: true,
				msg		: "Password is empty. ignored validation"
			}
			return response;
		}

	// default options (allows any password)
		const o = {
			lower				: 1,
			upper				: 1,
			alpha				: 0, /* lower + upper */
			numeric				: 1,
			special				: 0,
			length				: [6, 32],
			custom				: [ /* regexes and/or functions  (?=.*\d)(?=.*[a-z])(?=.*[A-Z])\w{6,} */ ],
			badWords			: ["password", "contraseña", "clave","Mynew2Pass5K","dios","micontraseña"],
			badSequenceLength	: 4,
			noQwertySequences	: false,
			noSequential		: true
		};

	// set options
		for (const property in options){
			o[property] = options[property];
		}

	let	re = {
			lower:   /[a-z]/g,
			upper:   /[A-Z]/g,
			alpha:   /[A-Z]/gi,
			numeric: /[0-9]/g,
			special: /[\W_]/g
		},
		rule, i;

	// enforce min/max length
		if (pw.length < o.length[0] || pw.length > o.length[1]) {
			const response = {
				result	: false,
				msg		: "Password is too short! \nPlease use from " + o.length[0] + " to " + o.length[1] + " chars "
			}
			return response;
		}

	// enforce lower/upper/alpha/numeric/special rules
		for (rule in re) {
			if ((pw.match(re[rule]) || []).length < o[rule]) {
				const response = {
					result	: false,
					msg		: "Password is invalid! \nPlease mix lowercase / uppercase chars and numbers"
				}
				return response;
			}
		}

	// enforce word ban (case insensitive)
		for (i = 0; i < o.badWords.length; i++) {
			if (pw.toLowerCase().indexOf(o.badWords[i].toLowerCase()) > -1) {
				const response = {
					result	: false,
					msg		: "Bad word! \nPlease use a different password"
				}
				return response;
			}
		}

	// enforce the no sequential, identical characters rule
		// if (o.noSequential && /([\S\s])\1/.test(pw)) {
		// 	const response = {
		// 		result	: false,
		// 		msg		: 'identical characters in sequential order are not allowed'
		// 	}
		// 	return response;
		// }

	// enforce alphanumeric/qwerty sequence ban rules
		if (o.badSequenceLength) {
			let	lower   = "abcdefghijklmnopqrstuvwxyz",
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
					const response ={
						result	: false,
						msg		: 'alphabetical order not allowed | numerical order not allowed'
					}
					return response;
				}
			}
		}

	// enforce custom regex/function rules
		for (i = 0; i < o.custom.length; i++) {
			rule = o.custom[i];
			if (rule instanceof RegExp) {
				if (!rule.test(pw)){
					const response = {
						result	: false,
						msg		: 'invalid pw for rule ' + rule
					}
					return response;
				}
			} else if (rule instanceof Function) {
				if (!rule(pw)){
					const response ={
						result	: false,
						msg		: 'invalid pw for function ' + rule
					}
					return response;
				}
			}
		}

	const response = {
		result	: true,
		msg		: 'pw is valid '
	}

	// great success!
	return response;
}//end password validator



// @license-end
