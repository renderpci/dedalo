// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_PASSWORD
* Dédalo client-side component for hashed-password credential fields.
*
* Responsibilities:
* - Stores a single password value per record. The raw plaintext is never
*   persisted: the server layer hashes it before writing to the matrix table.
* - Validates the candidate password on the client side via
*   `validate_password_format()` before sending it to the API. Validation
*   covers length, character-class requirements, banned words/chars, and
*   sequential-character sequences.
* - Delegates all rendering to the per-mode sub-modules:
*     - `render_edit_component_password`  → edit / line / mini / print
*     - `render_list_component_password`  → list / tm / search
*       (list/tm/search all reuse the same list renderer — no plaintext shown)
* - Inherits the full component lifecycle (init → build → render → save →
*   destroy) from `component_common` and `common` via prototype assignment.
*
* Data shape (`this.data.entries`): Array with a single entry object
*   `{ id: number|null, value: {value: string}|null }`
* An entry with `value: null` means the password field is empty/cleared.
*
* Exported helpers (also used by edit-view modules):
*   `build_changed_data_item(value, id)` – builds the frozen change payload.
*   `handle_password_change(self, input_value, input, id)` – validates input,
*     builds the payload, and calls `change_value`; shared across edit views.
*
* @see component_common  Generic lifecycle, save, change_value, mode-switch.
* @see render_edit_component_password  Edit-mode view dispatch.
* @see render_list_component_password  List / TM / search view dispatch.
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_password} from '../../component_password/js/render_edit_component_password.js'
	import {render_list_component_password} from '../../component_password/js/render_list_component_password.js'
	import {ui} from '../../common/js/ui.js'



/**
* COMPONENT_PASSWORD
* Constructor. Declares all instance properties used throughout the lifecycle.
* All fields are left undefined (or set to a safe default); `component_common.init()`
* populates them from the options object passed at mount time.
*
* Property notes:
* - `id`           – unique DOM/instance identifier assigned during init.
* - `model`        – ontology model string, e.g. `'component_password'`.
* - `tipo`         – structure tipo of this component, e.g. `'dd82'`.
* - `section_tipo` – tipo of the owning section, e.g. `'dd80'`.
* - `section_id`   – record identifier for the current record.
* - `mode`         – active render mode: `'edit'`, `'list'`, `'search'`, etc.
* - `lang`         – current UI language tag, e.g. `'lg-nolan'`.
* - `section_lang` – language tag carried by the owning section.
* - `context`      – server-provided structure context (properties, tools, …).
* - `data`         – server-provided component data object (`{entries: [...]}`).
* - `parent`       – tipo of the structural parent (section group or portal).
* - `node`         – placeholder element in the light DOM (set during build).
* - `tools`        – array of tool instances attached to this component.
* - `duplicates`   – password components do not support duplicate detection;
*                    fixed to `false`.
*/
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
* Extend component_password with shared prototype methods from component_common and common.
* No own implementations are needed for these methods — all logic lives in the shared
* prototypes.  The `tm` (Time Machine) and `search` render modes intentionally reuse
* the list renderer because passwords are never shown in plaintext in read-only views.
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
	// (!) list, tm, and search all use the same renderer — no plaintext is ever exposed
	component_password.prototype.list				= render_list_component_password.prototype.list
	component_password.prototype.tm					= render_list_component_password.prototype.list
	component_password.prototype.edit				= render_edit_component_password.prototype.edit
	component_password.prototype.search				= render_list_component_password.prototype.list



/**
* BUILD_CHANGED_DATA_ITEM
* Builds a frozen `changed_data_item` object describing a single password field change.
* Called by `handle_password_change` (edit views) and can be called directly when
* constructing the change payload outside the standard change handler.
*
* Normalization rules:
* - A non-empty string value is wrapped as `{value: string}` to match the server's
*   expected entry shape.
* - An empty string or `null` input is coerced to `null` (value), and the resulting
*   `action` is set to `'remove'`, which tells the server to clear the credential.
*
* The returned object is frozen so that callers cannot accidentally mutate it after
* it has been passed to `set_changed_data` or `change_value`.
*
* @param {string|null} value - Raw password string from the input element, or null.
* @param {number|null} id - Entry `id` from `this.data.entries[0].id`, or null when
*   the component starts empty and no entry exists yet on the server.
* @returns {Object} Plain object with two keys:
*   - `changed_data_item` {Object} – frozen change descriptor `{action, id, value}`.
*   - `parsed_value`      {Object|null} – the normalized `{value}` wrapper, or null.
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
* Shared change handler for component_password across all edit views.
* Validates the candidate password, builds the change payload, wires `changed_data`,
* and persists via `change_value`. Returns the parsed value so the calling view can
* update any confirmation/strength UI without duplicating the save logic.
*
* Flow:
* 1. Resolve `id` from the live data entry (the closure-captured value may be null
*    the first time a password is set on an empty component; after the first save
*    the API assigns a real entry id).
* 2. Validate format via `validate_password_format`; show/hide error state on the
*    input element and return null immediately on failure.
* 3. Build the frozen `changed_data_item` via `build_changed_data_item`.
* 4. Record the change with `set_changed_data` so the component is marked dirty.
* 5. Call `change_value` with `refresh: false` and `remove_dialog: false` to persist
*    without a full re-render or discard confirmation.
*
* @param {Object} self - The component_password instance.
* @param {string} input_value - Current value of the password input element.
* @param {HTMLElement} input - The `<input>` DOM element; used for error styling via
*   `ui.component.error()`.
* @param {number|null} id - Entry id captured in the view's closure; may be stale —
*   the handler re-reads from `self.data.entries[0].id` before use.
* @returns {Promise<Object|null>} Resolves to the parsed value object `{value: string}`
*   when the change was saved, or `null` when validation failed.
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
* VALIDATE_PASSWORD_FORMAT
* Client-side password policy validator. Returns a result object indicating
* whether `pw` meets all configured rules.
*
* Default policy (applied when `options` is omitted or partially provided):
* - At least 1 lowercase letter, 1 uppercase letter, 1 digit.
* - No special characters required by default (`special: 0`).
* - Length between 6 and 32 characters.
* - Banned words (case-insensitive): "password", "contraseña", "clave", etc.
* - Banned character: `&`.
* - No runs of 4+ consecutive alphabetical or numeric characters (e.g. "abcd", "1234").
* - No sequential identical characters rule (commented-out; see inline note).
* - QWERTY-sequence ban is disabled by default (`noQwertySequences: false`).
*
* Callers can override individual policy keys via `options`; only the supplied
* keys are merged — unrecognised keys in `options` are copied in as-is.
*
* Empty password handling: an empty string passes validation immediately with
* `result: true` and a descriptive message. This allows components to save a
* blank field (clearing the credential) without triggering a policy error.
*
* Return shape in all cases:
* ```js
* { result: boolean, msg: string }
* ```
*
* Adapted from Password Validator 0.1 © 2007 Steven Levithan (MIT License).
* The original function has been integrated as a prototype method; the algorithm
* and default policy remain mostly unchanged.
*
* @param {string} pw - The candidate password string from the input element.
* @param {Object} [options] - Optional policy override map. Supported keys:
*   `lower` {number}              – minimum lowercase characters (default 1).
*   `upper` {number}              – minimum uppercase characters (default 1).
*   `alpha` {number}              – minimum alpha characters lower+upper (default 0).
*   `numeric` {number}            – minimum numeric characters (default 1).
*   `special` {number}            – minimum special characters (default 0).
*   `length` {Array}              – `[min, max]` length bounds (default [6, 32]).
*   `custom` {Array}              – array of RegExp or Function validators (default []).
*   `badWords` {Array}            – banned substrings, case-insensitive (default list).
*   `badChars` {Array}            – banned individual characters (default ['&']).
*   `badSequenceLength` {number}  – max allowed run of sequential chars (default 4).
*   `noQwertySequences` {boolean} – if true, QWERTY runs are also banned (default false).
*   `noSequential` {boolean}      – if true, identical adjacent chars are banned (default true,
*                                   but the check is currently commented out — see inline note).
* @returns {Object} Validation result: `{ result: boolean, msg: string }`.
*   `result: true` means the password is acceptable; `result: false` means it is not,
*   and `msg` carries a human-readable reason suitable for display.
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
		// (!) This block is disabled. `o.noSequential` defaults to true but the guard
		// below is commented out, so identical consecutive characters (e.g. "aabb") are
		// currently accepted even though the policy declares them forbidden.
		// if (o.noSequential && /([\S\s])\1/.test(pw)) {
		// 	const response = {
		// 		result	: false,
		// 		msg		: 'identical characters in sequential order are not allowed'
		// 	}
		// 	return response;
		// }

	// enforce alphanumeric/qwerty sequence ban rules
	// sliding window of length `badSequenceLength` scanned against known alphabet strings
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
