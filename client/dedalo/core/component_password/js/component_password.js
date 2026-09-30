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
* - The password policy is `password_policy.js` — ONE evaluator shared with the
*   server (src/core/security/password_policy.ts refuses a non-conforming
*   plaintext with `validation.password_policy`). The edit view shows it as a
*   live checklist; `save_password` re-checks it before sending.
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
*   `save_password(self, value)` – checks the policy, saves, and returns the
*     verdict `{ok, error}` the view renders in its status line.
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
	import {request_failed} from '../../common/js/api_error.js'
	import {check_password} from './password_policy.js'



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
* SAVE_PASSWORD
* Persist a NEW password the user explicitly accepted, and report the verdict.
*
* Flow:
* 1. Re-check the policy (password_policy.js). A refusal here never leaves the
*    browser; it returns the same `validation.password_policy` shape the server
*    would, so the view renders one kind of rejection.
* 2. Build the frozen change item (entry id read LIVE from self.data: on a
*    record whose password was empty the id only exists after the first save).
* 3. `change_value` with refresh:false / remove_dialog:false.
* 4. On ANY failure, drop the pending changed_data: a refused password must not
*    be re-sent behind the user's back by the navigation auto-save sweep.
*
* An empty value is refused (`action:'remove'` is not offered here): clearing a
* credential is not what "type a new password" means.
*
* @param {Object} self - The component_password instance.
* @param {string} value - The plaintext the user typed (and confirmed).
* @returns {Promise<{ok: boolean, error: Object|null, api_response: Object|null}>}
*/
export const save_password = async function(self, value) {

	// policy (client leg of the one policy)
		const verdict = check_password(value)
		if (!value || !verdict.valid) {
			return {
				ok				: false,
				api_response	: null,
				error			: {
					code		: 'validation.password_policy',
					label_key	: 'error_validation_password_policy',
					message		: 'The password does not meet the password policy',
					details		: {rule: verdict.failed || 'length'}
				}
			}
		}

	// change item
		const id = self.data?.entries?.[0]?.id ?? null
		const {changed_data_item} = build_changed_data_item(value, id)
		self.set_changed_data(changed_data_item)

	// save
		const api_response = await self.change_value({
			changed_data	: [changed_data_item],
			refresh			: false,
			remove_dialog	: false
		})

	// verdict
		if (!api_response || request_failed(api_response)) {
			if (self.data) {
				self.data.changed_data = []
			}
			return {
				ok				: false,
				api_response	: api_response || null,
				// change_value answers `false` (no request) when a save is already
				// in flight: nothing was stored, and the status line must say so.
				error			: api_response?.error || {label_key: 'password_not_saved', message: 'Not saved yet'}
			}
		}

	return {
		ok				: true,
		api_response	: api_response,
		error			: null
	}
}//end save_password



/**
* VALIDATE_PASSWORD_FORMAT
* Compatibility shape over the ONE policy (password_policy.js): the pre-2026-09-30
* signature `{valid, message}` for callers that only need a verdict. There are no
* per-caller policy overrides any more — a policy the server does not enforce
* is not a policy.
* An empty value is `valid:true` (the caller decides what empty means).
*
* @param {string} pw - Candidate plaintext.
* @returns {{valid: boolean, message: string, rule: string|null}}
*/
component_password.prototype.validate_password_format = function(pw) {

	if (!pw) {
		return {
			valid	: true,
			message	: 'Password is empty. ignored validation',
			rule	: null
		}
	}

	const verdict = check_password(pw)
	if (verdict.valid) {
		return {
			valid	: true,
			message	: '',
			rule	: null
		}
	}

	const failed	= verdict.rules.find(el => el.id===verdict.failed)
	const template	= (typeof get_label!=='undefined' && get_label[failed.label]) || failed.label
	const message	= String(template).replace(/\$\{(\w+)\}/g, (m, key) => (key in failed.params ? String(failed.params[key]) : m))

	return {
		valid	: false,
		message	: message,
		rule	: verdict.failed
	}
}//end validate_password_format



// @license-end
