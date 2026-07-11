// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_TOOL_DD_LABEL
*
* Client-side render layer for `tool_dd_label` — a developer-facing tool used
* exclusively in section dd1340, component dd1372 (Tool labels) to compose
* multi-language label sets for Dédalo tools.
*
* The tool presents a matrix UI:
*   - rows    → named label keys (e.g. "title", "save", "cancel")
*   - columns → one per project language (from page_globals.dedalo_projects_default_langs)
*
* Underlying data shape stored in component_json (dd1372):
*   Array<{ lang: string, name: string, value: string }>
*   e.g. [{ lang: "lg-eng", name: "title", value: "My tool" }, ...]
*
* The render module exports a single constructor (`render_tool_dd_label`) whose
* `edit` method is mixed into `tool_dd_label.prototype.edit` at wire-up time in
* `tool_dd_label.js`. Private helpers (`get_content_data`, `render_row`,
* `render_language_label`) are module-scoped and not exported.
*
* Key contracts:
*   - `self.ar_data`   — flat array of {lang, name, value} items; mutated in place.
*   - `self.ar_names`  — ordered array of unique name keys; drives row order.
*   - `self.label_matix` — pointer to the `<ul>` grid node; kept on `self` so that
*     the add-row handler can append new rows without re-querying the DOM.
*   - `self.update_data()` — defined on tool_dd_label; must be called after every
*     mutation to propagate changes to the caller JSON editor.
*   - `self.save_label_lang_sequence(value, key, lang)` — also defined on the main
*     class; handles upsert/delete for a single cell's value.
*
* Exports:
*   {Function} render_tool_dd_label — constructor (assigned to prototype chain)
*/



// imports
	import {ui} from '../../../core/common/js/ui.js'



/**
* RENDER_TOOL_DD_LABEL
* Constructor for the render prototype mixin.
* No state is initialised here; all instance state lives on the `tool_dd_label`
* instance that inherits this prototype's methods.
* @returns {boolean} Always true (Dédalo constructor convention).
*/
export const render_tool_dd_label = function() {

	return true
}//end render_tool_dd_label



/**
* EDIT
* Renders the tool's main interactive node for edit mode.
*
* When `options.render_level === 'content'` the call returns early with just
* the content_data fragment (used by tool_common internals that need only the
* inner content without the outer wrapper). Otherwise it builds the full
* wrapper node via `ui.tool.build_wrapper_edit` and attaches the content_data
* fragment as a child, then stores a back-reference on `wrapper.content_data`
* for later access by other lifecycle methods.
*
* @param {Object} options              - Render options passed by the tool lifecycle.
* @param {string} [options.render_level] - When set to 'content', skip wrapper build
*   and return only the inner content node.
* @returns {Promise<HTMLElement>} Resolves to either the outer wrapper node
*   (normal case) or the raw content_data node ('content' render_level).
*/
render_tool_dd_label.prototype.edit = async function (options={}) {

	const self = this

	// options
		const render_level = options.render_level

	// content_data
		const content_data = await get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render_tool_dd_label



/**
* GET_CONTENT_DATA
* Builds and returns the full label-matrix content node.
*
* Constructs a `<ul class="label_matix">` CSS-grid element whose column layout
* is computed dynamically from the number of project languages:
*   grid-template-columns: 2em repeat(<lang_count + 1>, 1fr)
* The extra column accommodates the row-action button (add/remove).
*
* Rendering order:
*   1. A single header row (column names: action button | "name" | lang labels).
*   2. One data row per entry in `self.ar_names` (existing named label keys).
*
* After building, the `<ul>` node is stored as `self.label_matix` so that the
* add-row event handler in `render_row` can append new rows directly.
*
* @param {Object} self - The tool_dd_label instance.
* @param {Array}  self.loaded_langs - Array of lang objects from page_globals.
* @param {Array}  self.ar_names     - Ordered array of unique label key names.
* @returns {Promise<HTMLElement>} The populated content_data container element.
*/
const get_content_data = async function(self) {

	// short vars
		const ar_langs = self.loaded_langs
		const ar_names = self.ar_names

	// DocumentFragment
		const fragment = new DocumentFragment()

	// table
		const label_matix = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'label_matix',
			parent			: fragment
		})
		// Dynamic grid: 2em action column + one equal-width column per lang plus one for 'name'
		label_matix.style = `grid-template-columns: 2em repeat(${ar_langs.length+1}, 1fr);`
		// set pointer
		self.label_matix = label_matix

	// header_row
		const header_row = await render_row(
			self,
			ar_langs,
			true, // bool is header
			'name',
			null // key
		)
		label_matix.appendChild(header_row)

	// rows. One row for each name
		const ar_names_length = ar_names.length
		for (let i = 0; i < ar_names_length; i++) {
			const current_name = ar_names[i]
			const row = await render_row(
				self,
				ar_langs,
				false, // bool is header
				current_name,
				i
			)
			label_matix.appendChild(row)
		}

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* RENDER_ROW
* Builds a single `<li>` row for the label matrix grid.
*
* The row has three kinds of cells:
*   1. Action cell (leftmost, 2em column):
*      - Header row → "add" button; clicking it appends a new blank data row.
*        The new row's key is computed as the current live count of `.label_data`
*        rows (`safe_length`) rather than `self.ar_names.length`, to stay accurate
*        even if names were removed without re-rendering.
*      - Data row   → "remove" button; clicking it:
*          a. Prompts the user for confirmation via `confirm()`.
*          b. Re-derives its own position (`safe_key`) live from the DOM to avoid
*             stale-index issues when multiple rows have been added/removed.
*          c. Removes all `self.ar_data` entries whose `name` matches the row's
*             label key (reverse-iteration splice pattern to avoid index shift).
*          d. Removes the key from `self.ar_names`.
*          e. Calls `self.update_data()` to propagate changes.
*          f. Removes the `<li>` node from the DOM.
*   2. Name cell: a `contenteditable` div showing the label key name.
*      `save_label_value` (fired on blur and on Enter/Return) normalises the
*      entered text to lowercase-and-underscored form and then updates all
*      `ar_data` items whose `name` matches the old value, updates `ar_names`,
*      refreshes the displayed text, and calls `self.update_data()`.
*   3. Language cells: one per entry in `ar_langs`, each built by
*      `render_language_label`.
*
* Note: `key` is `null` for the header row and is only used in data rows.
*
* @param {Object}      self     - The tool_dd_label instance.
* @param {Array}       ar_langs - Array of lang descriptor objects
*   (each has at least `.value` (lang code) and `.label` (display name)).
* @param {boolean}     header   - True for the header row, false for data rows.
* @param {string}      name     - The label key name (e.g. "title"); empty string
*   for newly added rows.
* @param {number|null} key      - Zero-based index of this row in `self.ar_names`;
*   null for the header row.
* @returns {Promise<HTMLElement>} The `<li>` element representing the row.
*/
const render_row = async function(self, ar_langs, header, name, key) {

	const lang_length = ar_langs.length

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'row ' + (header===true ? 'label_header' : 'label_data')
		})

	// left button : add / remove based on row type
		if(header===true) {

			// add button
			const add_button = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button tool add',
				inner_html		: '',
				parent			: li
			})
			add_button.addEventListener('click', async (e) =>{
				e.stopPropagation()

				// safe_length
				// (!) Re-count live DOM rows so the key stays accurate after add/remove cycles.
					const rows_list = li.parentNode.querySelectorAll('.label_data')
					const safe_length = [...rows_list].length

				const row = await render_row(
					self,
					ar_langs, // array ar_langs
					false, // bool is header
					'', // string name
					safe_length // self.ar_names.length // int key
				)
				self.label_matix.appendChild(row)
			})

		}else{

			// remove_button
			const remove_button = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'button tool remove',
				parent			: li
			})
			remove_button.addEventListener('click', async (e) =>{
				e.stopPropagation()

				// confirm remove
					if (!confirm(get_label.sure || 'Sure?')) {
						return
					}

				// safe key
				// Re-derive position from live DOM to stay correct after prior additions/removals.
					const rows_list = li.parentNode.querySelectorAll('.label_data')
					const safe_key = [...rows_list].findIndex(el => el==li)

				// old value
					const old_value = self.ar_names[safe_key]

				// remove from array
				// Reverse iteration to safely splice while walking the array.
					for (let i = self.ar_data.length - 1; i >= 0; i--) {
						const item = self.ar_data[i]
						if(item.name===old_value) {
							self.ar_data.splice(i,1)
						}
					}
					self.ar_names.splice(safe_key,1)

				// update data
					self.update_data()

				// remove row node
					li.remove()
			})
		}

	// label_name
		const label_name = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label name',
			inner_html		: header===true ? 'name' : name,
			contenteditable	: header===true ? false : true,
			parent			: li
		})
		// save_label_value
		// Normalises the key name entered by the user and propagates the change.
		// Transformation: trim → lowercase → spaces replaced with underscores.
		// Also updates all ar_data items whose 'name' matches the previous value,
		// keeping the data layer consistent with the renamed key.
		const save_label_value = () => {

			const old_value		= self.ar_names[key]
			const dirty_value	= label_name.textContent
			const lower_value	= dirty_value.replace(/\w/g, u => u.toLowerCase())
			const value			= lower_value.trim().replace(/\s/g, '_')

			// update names
			const data = self.ar_data.filter(item => item.name===old_value)
			for (let i = 0; i < data.length; i++) {
				data[i].name = value
			}

			// update ar_names element
			self.ar_names[key] = value

			// update normalized value in content editable
			label_name.innerText = value

			// update the data into the instance, prepared to save
			// (but is not saved directly, the user needs to do click in the save button)
			self.update_data()
		}
		// event blur
		label_name.addEventListener('blur', save_label_value)
		// event keydown. If the user press return key = 13, we save the value
		const keydown_handler = (e) => {
			if(e.keyCode === 13) {
				e.stopPropagation()
				e.preventDefault()
				save_label_value()
			}
		}
		label_name.addEventListener('keydown', keydown_handler)

	// add language_label nodes
		for (let i = 0; i < lang_length; i++) {

			const language_label_node = await render_language_label(
				self,
				ar_langs[i],
				header, name,
				key
			)
			li.appendChild(language_label_node)
		}


	return li
}//end render_row



/**
* RENDER_LANGUAGE_LABEL
* Creates the cell node for a single (name × language) intersection in the matrix.
*
* Behaviour differs between header and data rows:
*   - Header row: renders a read-only div displaying the language's human-readable
*     label (e.g. "English"). No events attached.
*   - Data row:   renders a `contenteditable` div pre-filled with the stored
*     translation value (looked up from `self.ar_data` by matching both `name`
*     and `current_lang.value`). A `placeholder` dataset attribute is set to the
*     label key name so CSS can show a hint when the cell is empty.
*
* Events (data rows only):
*   - blur    → `self.save_label_lang_sequence(textContent, key, lang)` persists
*               the cell value into `self.ar_data` and calls `self.update_data()`.
*   - keydown → Same save on Enter/Return (keyCode 13); prevents newline insertion.
*
* Data lookup uses `Array.find`, so only the first matching item is used if the
* data array somehow contains duplicates (which should not occur in normal use).
*
* @param {Object}      self         - The tool_dd_label instance.
* @param {Object}      current_lang - Lang descriptor: `{ value: string, label: string }`.
*   `value` is the lang code (e.g. "lg-eng"); `label` is the display name.
* @param {boolean}     header       - True when rendering the matrix header row.
* @param {string|null} name         - The label key name for this row; used as
*   `placeholder` text and to look up existing data.
* @param {number|null} key          - Zero-based row index in `self.ar_names`;
*   forwarded to `save_label_lang_sequence` for accurate upsert targeting.
* @returns {Promise<HTMLElement>} The cell `<div>` element.
*/
const render_language_label = async function(self, current_lang, header, name, key) {

	// get the current data for the node
		const current_data = self.ar_data.find(item => item.name===name && item.lang===current_lang.value )

	// label
		const label_value = typeof current_data!=='undefined'
			? current_data.value || null
			: null
		const placeholder = name || ''

	// language_label. Content editable div to write lang value
		const language_label = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label',
			inner_html		: header===true ? current_lang.label : label_value,
			dataset			: header===true ? '' : { placeholder : placeholder },
			contenteditable	: header===true ? false : true
		})

		// blur event. When the user blur the text box save the name into the layer structure
			language_label.addEventListener('blur', (e)=> {
				// save
				self.save_label_lang_sequence(
					language_label.textContent,
					key,
					current_lang.value
				)
			})

		// keydown event. If the user press return key = 13, we blur the text box
			language_label.addEventListener('keydown', (e) =>{
				if(e.keyCode === 13) {
					e.preventDefault()
					e.stopPropagation()
					// save
					self.save_label_lang_sequence(
						language_label.textContent,
						key,
						current_lang.value
					)
				}
			})


	return language_label
}//end render_language_label



// @license-end
