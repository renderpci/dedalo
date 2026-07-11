// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_IRI
* Client-side controller for the IRI (Internationalized Resource Identifier) component.
*
* `component_iri` stores web URLs together with optional human-readable title labels
* following RFC 3987. Data is kept as a flat array of objects (`dd_iri` shape), one
* object per value, each carrying:
*   - `id`    {number}  — server-minted per-item counter; used as the pairing key for
*                         the title label dataframe (slot `DEDALO_COMPONENT_IRI_LABEL_DATAFRAME`).
*   - `iri`   {string}  — the URL, including http/https scheme.
*   - `title` {string}  — deprecated literal label; kept for legacy data fallback until
*                         the title-materialisation migration runs. New labels live in the
*                         paired label dataframe and are resolved by `resolve_title()`.
*   - `lang`  {string}  — language marker (e.g. `lg-nolan`, `lg-eng`). The component is
*                         non-translatable by default but supports per-language variants
*                         shared by `id` (surfaced as `transliterate_value` in the data layer).
*
* This class wires the lifecycle, data-change, save, and render methods by delegating
* to shared prototypes from `component_common` and `common`. Mode-specific rendering is
* handled by the dedicated render modules imported below.
*
* Registered render modes / views:
*   - `edit`   — view_default_edit_iri, view_line_edit_iri, view_mini_iri, print (read-only)
*   - `list`   — view_default_list_iri, view_mini_iri, view_text_list_iri
*   - `tm`     — aliases list renderer (Time Machine read mode)
*   - `search` — render_search_component_iri
*
* Exports: {Function} component_iri (constructor)
*/

// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {render_edit_component_iri} from '../../component_iri/js/render_edit_component_iri.js'
	import {render_list_component_iri} from '../../component_iri/js/render_list_component_iri.js'
	import {render_search_component_iri} from '../../component_iri/js/render_search_component_iri.js'



/**
* COMPONENT_IRI
* Constructor. Declares instance property slots consumed throughout the lifecycle.
* All properties are populated during `init()` via `component_common.prototype.init`.
*/
export const component_iri = function() {

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

	// ui
	this.minimum_width_px = 135 // integer pixels

	// search config
	this.q_split = true
}//end component_iri



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_iri.prototype.init				= component_common.prototype.init
	component_iri.prototype.build				= component_common.prototype.build
	component_iri.prototype.render				= common.prototype.render
	component_iri.prototype.refresh				= common.prototype.refresh
	component_iri.prototype.destroy				= common.prototype.destroy

	// change data
	component_iri.prototype.save				= component_common.prototype.save
	component_iri.prototype.update_data_value	= component_common.prototype.update_data_value
	component_iri.prototype.update_datum		= component_common.prototype.update_datum
	component_iri.prototype.change_value		= component_common.prototype.change_value
	component_iri.prototype.set_changed_data	= component_common.prototype.set_changed_data
	component_iri.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_iri.prototype.list				= render_list_component_iri.prototype.list
	component_iri.prototype.tm					= render_list_component_iri.prototype.list
	component_iri.prototype.edit				= render_edit_component_iri.prototype.edit
	component_iri.prototype.search				= render_search_component_iri.prototype.search

	component_iri.prototype.change_mode			= component_common.prototype.change_mode



/**
* BUILD_VALUE
* Constructs a single IRI data object from the two raw `<input>` values that make up
* one edit row (a `<input type="text">` for the title and a `<input type="url">` for
* the IRI). Both fields are read from `self.node.content_data[key]`.
*
* Returns `null` when both fields are empty so that a blank, unfilled row is not
* persisted as `{iri:"",title:""}`.
*
* @param {number} key - Index of the content_value element inside `content_data`.
*   Corresponds to the position of the value within `data.entries`.
* @returns {Object|null} A plain object `{iri, title}` when at least one field has
*   content, otherwise `null`.
*/
component_iri.prototype.build_value = function(key) {

	const self = this

	const title_value	= self.node.content_data[key].querySelector('input[type="text"]').value
	const iri_value		= self.node.content_data[key].querySelector('input[type="url"]').value

	const value = (title_value.length > 0 || iri_value.length > 0)
		? {
			iri		: iri_value,
			title	: title_value
		  }
		: null

	return value
}//end build_value



/**
* CHANGE_HANDLER
* Records a pending edit for a single IRI entry in `self.data.changed_data`.
*
* Called from the `change` events of both the title and IRI `<input>` elements in the
* edit view. The frozen `changed_data_item` object carries enough state for
* `component_common.prototype.update_data_value` (called by `change_value`) to splice,
* update, or remove the item from the entries array on the server.
*
* The `deactivate` lifecycle event listens for a non-empty `changed_data` and will
* trigger `save()` automatically when the component loses focus. Pressing Enter in the
* IRI field dispatches a `change` event followed by an explicit `save()` call from the
* render layer.
*
* @param {number} key - Zero-based index of the edited entry in `data.entries`.
* @param {Object|null} current_value - The updated value object `{id, iri, title}` as it
*   stands after the user's edit, or `null` when the entry is being removed.
* @returns {boolean} Always `true`.
*/
component_iri.prototype.change_handler = function(key, current_value) {

	const self = this

	// change data
		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: current_value?.id || null,
			key		: key,
			value	: current_value
		})

	// fix instance changed_data
		self.set_changed_data(changed_data_item)


	return true
}//end change_handler



/**
* FOCUS_FIRST_INPUT
* Overrides the default `focus_first_input` behaviour defined in `ui.component.activate`.
*
* The standard behaviour focuses the first `<input>` in the component. For `component_iri`
* the URL field (type="url") is more relevant than the title field, so this method
* focuses the URL input instead, but only when it is not already the active element and
* no `q_operator` input has stolen focus (which happens when tabbing through search
* filters).
*
* The focus is deferred with `dd_request_idle_callback` to avoid fighting with the
* browser's own tab-focus cycle on the same event tick.
*
* @returns {boolean} `false` if the title input already has focus (nothing to do),
*   `true` in all other cases.
*/
component_iri.prototype.focus_first_input = function() {

	const self = this

	// title_input
		const title_input = self.node.content_data && self.node.content_data[0]
			? self.node.content_data[0].querySelector('.input_value.title')
			: null;
		if (title_input && document.activeElement === title_input) {
			return false
		}

	// url_input
		const url_input = self.node.content_data && self.node.content_data[0]
			? self.node.content_data[0].querySelector('.input_value.url')
			: null;
		if (url_input) {
			dd_request_idle_callback(
				() => {
					if (self.active && url_input !== document.activeElement) {

						// check another focus elements like q_operator
						if (document.activeElement && document.activeElement.classList.contains('q_operator')) {
							return
						}

						url_input.focus()
					}
				}
			)
		}


	return true
}//end focus_first_input



/**
* CHECK_IRI_VALUE
* Validates that `input_iri_value` is an acceptable IRI for storage.
*
* Two-stage check:
*  1. A strict regex ensures the string begins with `http://` or `https://` followed
*     by a valid host segment (no double dots, no unencoded spaces). This pre-check is
*     needed because the `URL` constructor is permissive and accepts pathological inputs
*     like `https:///` that the server-side `parse_url()` would reject.
*  2. `new URL()` is used for structural parse; the resulting `.protocol` and `.hostname`
*     are inspected against the same rules.
*
* Empty values (null, empty string) are accepted: they signal deletion of an existing
* entry rather than an invalid edit.
*
* @param {string} input_iri_value - Raw string from the IRI `<input type="url">` field.
* @returns {boolean} `true` when the value is empty or is a valid http/https URL;
*   `false` when the format is recognisably wrong (wrong scheme, multiple dots in host,
*   or a string that `URL` cannot parse).
*/
component_iri.prototype.check_iri_value = function( input_iri_value ) {

	// Empty values are accepted to clean up the value
	if (!input_iri_value || input_iri_value.length===0) {
		return true
	}

	// First check the input string with a strict regex before passing to URL
	const strict_pattern = /^https?:\/\/([a-zA-Z0-9\-._~%]+)(:[0-9]+)?(\/.*)?$/i;
	if (!strict_pattern.test(input_iri_value)) {
		return false;
	}

	try {
		const uri = new URL(input_iri_value);

		// Must use http or https
		if (!['http:', 'https:'].includes(uri.protocol)) {
			return false;
		}

		// Hostname sanity: prevent multiple dots in a row
		if (!/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/.test(uri.hostname)) {
			return false;
		}

		return true;
	} catch (err) {
		return false;
	}
}//end check_iri_value



// @license-end
