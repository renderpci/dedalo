// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {open_window, object_to_url_vars} from '../../common/js/utils/index.js'
	import {view_default_edit_input_text} from './view_default_edit_input_text.js'
	import {view_line_edit_input_text} from './view_line_edit_input_text.js'
	import {view_text_input_text} from './view_text_input_text.js'
	import {view_mini_input_text} from './view_mini_input_text.js'
	import {view_colorpicker_edit_input_text} from './view_colorpicker_edit_input_text.js'



/**
* RENDER_EDIT_COMPONENT_INPUT_TEXT
* Edit-mode render mixin for component_input_text.
*
* This module is NOT a standalone class.  It is a prototype-assignment vehicle:
* component_input_text.prototype.edit is wired to
* render_edit_component_input_text.prototype.edit (see component_input_text.js).
* The constructor itself is a no-op placeholder so that prototype methods can be
* attached to it in the standard Dédalo pattern.
*
* Exports (named, used by view files and the host component):
*   render_edit_component_input_text — constructor (prototype carrier)
*   change_handler  — shared input 'change' event handler (used by all edit views)
*   remove_handler  — shared remove-button handler with translatable confirmation modal
*   check_duplicates — async unique-value duplicate checker; shows inline warning
*
* Consumed context properties (self.context.properties):
*   mandatory     {boolean} — adds/removes a CSS 'mandatory' class on the input as the user types
*   unique        {boolean} — triggers a live duplicate check via self.find_equal()
*   validation    {Object}  — client-side input shaping; see component_input_text.validate()
*   translatable  {boolean} — when true, remove_handler shows a cross-language deletion warning
*
* Data shape expected on self.data:
*   entries {Array<{id: number|null, lang: string, value: string|null}>}
*     One item per stored value; a freshly-added entry has id:null until saved.
*
* Global references (declared in host pages, resolved at runtime):
*   get_label       — localised label map (UIUX-09 warning: remove_handler and check_duplicates
*                     reference this global but it is NOT listed in the /*global*\/ directive
*                     at the top of this file — see FLAGS section in the file header comment)
*   DEDALO_CORE_URL — base URL for building deep-link URLs to duplicate records
*/
export const render_edit_component_input_text = function() {

	return true
}//end render_edit_component_input_text



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
*
* Dispatches to the appropriate view renderer based on self.context.view.
* Ensures self.context.fields_separator has a sensible default (', ') before
* handing off, because view files read it to join multi-value displays.
*
* View routing:
*   'mini'        — compact <span>; used by service_autocomplete dropdowns
*   'text'        — bare <span> with the joined value; no chrome
*   'line'        — same layout as 'default' but without the label row
*   'colorpicker' — text input paired with a native colour swatch
*   'print'       — forces read-only (permissions=1) then falls through to 'default'
*   'default'     — full wrapper: label, buttons, content_data with one input per entry
*
* (!) The 'print' case intentionally falls through to 'default' (no break/return).
*     It mutates self.permissions to 1 so that view_default_edit_input_text renders
*     a read-only content_value instead of a live <input>. This mutation is
*     side-effectful on the component instance for the lifetime of the render call.
*
* @param {Object} options - Render options forwarded verbatim to the selected view renderer
* @returns {Promise<HTMLElement>} Resolved component wrapper node
*/
render_edit_component_input_text.prototype.edit = async function(options) {

	const self = this

	// self.context.fields_separator
		if (!self.context.fields_separator) {
			self.context.fields_separator = ', '
		}

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'mini':
			// used by service_autocomplete
			// one span with class as '<span class="component_input_text_mini">CODE 2, CODDE 2-b</span>'
			return view_mini_input_text.render(self, options)

		case 'text':
			// one span clean as '<span>CODE 2, CODDE 2-b</span>'
			return view_text_input_text.render(self, options)

		case 'line':
			// same as default but without label
			return view_line_edit_input_text.render(self, options)

		case 'colorpicker':
			// used as view color and open the color picker
			return view_colorpicker_edit_input_text.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			// full with wrapper, label, buttons and content_data
			return view_default_edit_input_text.render(self, options)
	}
}//end edit



/**
* CHANGE_HANDLER
* Shared 'change' event callback invoked by every edit-view input.
*
* Responsibility chain:
*   1. Reads the raw value from e.target.value and, if self.context.properties.validation
*      is configured, runs self.validate() to shape/strip it (e.g. regex replace,
*      lowercase transform).  If the shaped value differs from what the user typed the
*      input is corrected in-place so the UI stays in sync.
*   2. Writes the shaped value back into the relevant entries[key] item (creating a
*      minimal {lang} stub when the slot is empty).
*   3. Calls self.change_value() with a frozen changed_data atom (action:'update') so
*      the common save pipeline records the mutation without an immediate re-render.
*   4. Toggles the 'mandatory' CSS class on the input when the component is flagged
*      mandatory, giving live visual feedback.
*   5. Invalidates the find_equal cache entry for the typed value and calls
*      check_duplicates() when the component is flagged unique.
*   6. Optionally invokes options.post_process(e, key, self) for view-specific
*      side-effects (e.g. colour-picker swatch synchronisation in view_colorpicker).
*
* Data shape written to self.data (via change_value):
*   changed_data item: {action:'update', id:number|null, key:number, value:{lang, value}}
*
* (!) Cache invalidation note: the cache key used here (e.target.value, i.e. the NEW
*     value) is invalidated before check_duplicates is called.  This ensures a fresh
*     network round-trip for the new string even if a previous check happened to cache
*     a null for it.
*
* @param {Event}    e       - DOM input 'change' event whose target is the <input>/<textarea>
* @param {number}   key     - Zero-based index into self.data.entries for this input slot
* @param {Object}   self    - Component instance (component_input_text)
* @param {Object}   [options={}]
* @param {Function} [options.post_process] - Optional callback(e, key, self) executed after
*                                            all standard logic; used for view-specific work
* @returns {boolean} Always true
*/
export const change_handler = function(e, key, self, options={}) {

	const data			= self.data || {}
	const entries		= data.entries || []
	const item_value	= (entries[key]) ? entries[key] : {lang: self.lang}

	const safe_value = self.context.properties?.validation
		? self.validate(e.target.value)
		: e.target.value || ''

	if (e.target.value!=safe_value) {
		e.target.value = safe_value
	}

	item_value.value = safe_value

	// change data
		const changed_data_item = Object.freeze({
			action	: 'update',
			id		: entries[key]?.id || null,
			key		: key,
			value	: item_value
		})

	// change_value (save data)
		self.change_value({
			changed_data : [changed_data_item],
			refresh		 : false
		})

	// mandatory style update
		if (self.context.properties.mandatory) {
			const input = e.target
			if (input.value && input.value.length) {
				input.classList.remove('mandatory')
			}else{
				input.classList.add('mandatory')
			}
		}

	// is_unique check
		if (self.context.properties.unique) {
			// invalidate cache for the old value so re-check is fresh
			self.find_equal_cache.delete(e.target.value)
			check_duplicates(self, e.target.value)
		}

	// view-specific post-processing
		if (typeof options.post_process==='function') {
			options.post_process(e, key, self)
		}

	return true
}//end change_handler



/**
* REMOVE_HANDLER
* Shared remove-button handler; confirms deletion then delegates to _do_remove.
*
* Two confirmation paths depending on whether the component is translatable:
*
*   Translatable (self.context.translatable === true):
*     Builds a <dd-modal> with header/body/footer explaining that the entry will
*     be deleted across ALL language versions (because entries share an `id` across
*     langs on the server).  The modal footer exposes 'Delete' (danger) and
*     'Cancel' (warning) buttons.  Deletion only proceeds when the user confirms.
*     Returns void (no value) in this branch — the return inside the function ends
*     early if the modal path is taken.
*
*   Non-translatable:
*     Uses a synchronous browser confirm() dialog only when the input currently
*     has a value; if the input is empty the entry is removed silently.
*
* In both paths, document.activeElement.blur() is called first to flush any
* uncommitted input change event before the remove action executes.
*
* (!) get_label is referenced here as a bare global (not declared in the file's
*     /*global*\/ directive).  This is a pre-existing issue — do not resolve.
* (!) modal.on_close() inside the click handler references a variable (modal) that
*     is declared later in the same block.  This works due to closure scoping but
*     the forward reference may be confusing.
* (!) confirm() is a blocking browser dialog.  See FLAGS note at file top.
*
* @param {HTMLElement}   input         - The <input> or <textarea> node being removed
* @param {number|null}   id            - Server-side entry id (null for unsaved entries)
* @param {number}        key           - Zero-based index of the entry in data.entries
* @param {Object}        self          - Component instance (component_input_text)
* @returns {void}
*/
export const remove_handler = function(input, id, key, self) {

	// force possible input change before remove
		document.activeElement.blur()

	// value
		const current_value = input.value ? input.value : null

	// translatable components: show modal warning that deletion affects all languages
		const is_translatable = self.context?.translatable === true

	if (is_translatable) {

		// header
			const header = ui.create_dom_element({
				element_type	: 'div',
				class_name	: 'header'
			})
			ui.create_dom_element({
				element_type	: 'span',
				class_name	: 'label',
				inner_html	: (get_label.delete || 'Delete'),
				parent		: header
			})

		// body
			const body = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content delete_entry'
			})
			ui.create_dom_element({
				element_type	: 'p',
				inner_html		: (get_label.sure_delete_entry_all_langs || 'This entry will be deleted from all languages.'),
				parent			: body
			})

		// footer
			const footer = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'content footer'
			})
			// button delete
				const button_delete = ui.create_dom_element({
					element_type	: 'button',
					class_name	: 'danger remove',
					text_content	: (get_label.delete || 'Delete'),
					parent			: footer
				})
				button_delete.addEventListener('click', function(e) {
					e.stopPropagation()
					// proceed with deletion
					modal.on_close()
					_do_remove(input, id, key, self, current_value)
				})
			// button cancel
				const button_cancel = ui.create_dom_element({
					element_type	: 'button',
					class_name	: 'warning',
					text_content	: (get_label.cancel || 'Cancel'),
					parent			: footer
				})
				button_cancel.addEventListener('click', function(e) {
					e.stopPropagation()
					modal.on_close()
				})

		// modal
			const modal = ui.attach_to_modal({
				header	: header,
				body	: body,
				footer	: footer,
				size	: 'small'
			})

		return
	}

	// non-translatable: simple confirm dialog
	if (current_value) {
		if (!confirm(get_label.sure)) {
			return
		}
	}

	_do_remove(input, id, key, self, current_value)
}//end remove_handler



/**
* _DO_REMOVE
* Executes the actual remove operation after all confirmation gates have passed.
*
* Builds a single frozen changed_data atom with action:'remove' and calls
* self.change_value() with refresh:true so the component re-renders after the
* server responds (the removed entry disappears from the DOM).
*
* Dataframe note: dataframe row cleanup after a remove is server-authoritative.
* The server-side update_data_value('remove') cascades paired dataframe rows
* through the single-writer rule (see dedalo-dataframe skill).  There is no
* client-side delete_dataframe call here by design.
*
* @param {HTMLElement}   input         - The <input> or <textarea> node being removed
* @param {number|null}   id            - Server-side entry id; null for unsaved entries
* @param {number}        key           - Zero-based index of the entry in data.entries
* @param {Object}        self          - Component instance (component_input_text)
* @param {string|null}   current_value - The last typed value; used as the human-readable
*                                        label in the change_value call (for undo history)
* @returns {Promise<Object>} The promise returned by self.change_value()
*/
const _do_remove = function(input, id, key, self, current_value) {

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'remove',
			id		: id,
			key		: key,
			value	: null
		})]

	// change_value. Returns a promise that is resolved on api response is done
		const response = self.change_value({
			changed_data	: changed_data,
			label			: current_value,
			refresh			: true
		})


		// dataframe cleanup is server-authoritative: update_data_value 'remove'
		// cascades the paired dataframe rows (single-writer rule). No client
		// delete_dataframe call here.


	return response
}//end _do_remove



/**
* CHECK_DUPLICATES
* Async helper that checks whether the current value already exists elsewhere
* in the same section tipo and shows an inline warning when a duplicate is found.
*
* Guards:
*   - Skips when self.context.properties.unique is not truthy.
*   - Skips (and clears any existing warning) when value is empty.
*   - Skips when the component is hosted inside a tool (self.caller.type==='tool')
*     because tool contexts do not represent real section records.
*
* When a duplicate IS found, calls ui.component.add_component_warning() to attach
* an alert badge to self.node.  The badge includes a clickable link that opens the
* duplicate record in a new browser window (using open_window from utils).  After
* the user closes the new window the on_blur callback re-runs check_duplicates so
* the warning is cleared if the record was renamed.
*
* When no duplicate is found (equal_value is falsy), any existing warning is
* removed by reset_warning().
*
* Cache: find_equal() maintains an instance-level Map cache (self.find_equal_cache).
*   change_handler pre-invalidates the entry for the new value before calling here,
*   so the cache is always fresh for the most recently typed string.
*   Earlier values that were already checked and resolved to null remain cached to
*   avoid redundant network round-trips as the user edits.
*
* (!) get_label and DEDALO_CORE_URL are consumed as bare globals here.  Neither is
*     listed in the file-level /*global*\/ directive.  Pre-existing; do not resolve.
* (!) UIUX-09: the warning label falls back to the hardcoded English string
*     'Duplicated' when get_label.duplicated is absent.
*
* @param {Object}       self  - Component instance (component_input_text)
* @param {string|null}  value - The value to check; falsy values short-circuit immediately
* @returns {Promise<void>}
*/
export const check_duplicates = async function(self, value) {

	if (!self.context?.properties?.unique) {
		return
	}

	// reset warning
	const reset_warning = () => {
		if (self.node.warning_wrap) {
			self.node.warning_wrap.remove()
			self.node.warning_wrap = null
		}
	}

	// empty case
		if (!value || value.length<1) {
			reset_warning()
			return
		}

	// into tool case
		if (self.caller?.type==='tool') {
			reset_warning()
			return
		}

	const equal_value = await self.find_equal(value)
	if (equal_value) {
		ui.component.add_component_warning(
			self.node,
			// UIUX-09: use the localized label instead of a hardcoded English string.
			`${get_label.duplicated || 'Duplicated'}: '${value}' (id: ${equal_value})`,
			'alert',
			true, // clean buttons
			function(e) {
				e.stopPropagation()
				const section_id = equal_value
				// open new window
				const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
					tipo			: self.section_tipo,
					id				: section_id,
					mode			: 'edit',
					menu			: false,
					session_save	: false
				})
				open_window({
					url		: url,
					name	: 'section_id_' + section_id,
					on_blur : function(e) {
						// check again
						check_duplicates(self, value)
					}
				})
			}
		)
	}else{
		reset_warning()
	}
}//end check_duplicates



// @license-end
