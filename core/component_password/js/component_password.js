// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_password} from '../../component_password/js/render_edit_component_password.js'
	import {render_list_component_password} from '../../component_password/js/render_list_component_password.js'
	import {ui} from '../../common/js/ui.js'



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
	component_password.prototype.search				= render_list_component_password.prototype.list



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
/**
* BUILD_CHANGED_DATA_ITEM
* Builds a frozen changed_data_item object for password value changes.
* Used by edit views (via handle_password_change) and search view.
* @param string|null value
*	The password value from input
* @param int|null id
*	Entry id from data
* @return object {changed_data_item, value}
*/
export const build_changed_data_item = function(value, id=null) {

	// normalize value: null when empty, object with value key otherwise
		const parsed_value = (value !== null && value.length > 0)
			? {value: value}
			: null

	// build changed_data_item
		const changed_data_item = Object.freeze({
			action	: (parsed_value !== null) ? 'update' : 'remove',
			id		: id,
			value	: parsed_value
		})

	return {
		changed_data_item	: changed_data_item,
		parsed_value		: parsed_value
	}
}//end build_changed_data_item



/**
* HANDLE_PASSWORD_CHANGE
* Common change handler for component_password across all edit views.
* Validates the password format, builds changed_data_item, sets changed_data,
* and saves via change_value. Returns parsed_value for view-specific hooks.
* @param object self - Component instance
* @param string input_value - The input element value
* @param HTMLElement input - The input DOM element (for error display)
* @param int|null id - Entry id from data
* @return object|null parsed_value - The parsed value or null
*/
export const handle_password_change = async function(self, input_value, input, id=null) {

	// resolve id from current data if not provided
	// (when component was initially empty, the closure id is null,
	// but after first save the entry gets an id from the API)
		if (id === null) {
			id = self.data.entries?.[0]?.id ?? null
		}

	// validated. Test password is acceptable string
		const validation_obj	= self.validate_password_format(input_value)
		const validated		= validation_obj.result
		ui.component.error(!validated, input)
		if (!validated) {
			return null
		}

	// build changed_data_item (validate + freeze)
		const {changed_data_item, parsed_value} = build_changed_data_item(input_value, id)

	// fix instance changed_data
		self.set_changed_data(changed_data_item)

	// force to save on every change
		await self.change_value({
			changed_data	: [changed_data_item],
			refresh			: false,
			remove_dialog	: false
		})

	return parsed_value
}//end handle_password_change



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
*		msg		: "Pw is invalid! Please mix lowercase / uppercase chars and numbers"
*	}
*/
component_password.prototype.validate_password_format = function (pw, options) {

	// empty case
		if (!pw || pw.length < 1) {
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
			badChars			: ["&"],
			badSequenceLength	: 4,
			noQwertySequences	: false,
			noSequential		: true
		};

	// set options
		const opts = options || {};
		for (const property in opts) {
			if (opts.hasOwnProperty(property)) {
				o[property] = opts[property];
			}
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
			if (!re.hasOwnProperty(rule)) continue;
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

	// enforce character ban
		for (i = 0; i < o.badChars.length; i++) {
			if (pw.indexOf(o.badChars[i]) > -1) {
				const response = {
					result	: false,
					msg		: "Invalid character '" + o.badChars[i] + "'! \nPlease use a different password"
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
