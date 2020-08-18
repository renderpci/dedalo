// imports
	import {data_manager} from '../../common/js/data_manager.js'
	import {common,create_source} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_password} from '../../component_password/js/render_component_password.js'



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

	return true
};//end component_password



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
	component_password.prototype.build_dd_request	= common.prototype.build_dd_request

	// render
	component_password.prototype.mini				= render_component_password.prototype.mini
	component_password.prototype.list				= render_component_password.prototype.list
	component_password.prototype.edit				= render_component_password.prototype.edit
	component_password.prototype.edit_in_list		= render_component_password.prototype.edit

/**
* PASSWORD VALIDATOR 0.1
* (c) 2007 Steven Levithan <stevenlevithan.com>
* MIT License
*/
component_password.prototype.validate_password_format = function (pw, options) {

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
