// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, confirm */
/*eslint no-undef: "error"*/



/**
* VIEW_SEARCH_USER_PRESETS
* List-view module that renders and manages the user search-presets panel
* embedded inside the search UI of any section.
*
* This module is the client-side view counterpart of the 'search_user_presets'
* section view (registered in the section's view map). It mirrors the
* architecture of view_export_user_presets.js but targets search presets
* stored in ontology section dd623 instead of export presets.
*
* A "search preset" is a named, optionally-public, JSON filter object (stored
* in component_json dd625) that the user can apply to reload a previously
* saved filter configuration in the search panel.
*
* Responsibilities:
*  - Build a columns_map augmented with three control columns: Apply, ID/edit,
*    and (when permissions > 1) Delete.
*  - Render the preset list as a paginated list of section_record rows.
*  - Provide the Apply, Edit-modal, and Delete column callbacks that are
*    invoked by each section_record row.
*  - Delegate actual preset loading to
*    core/search/js/search_user_presets.js (load_search_preset,
*    edit_user_search_preset) and filter rendering to
*    core/search/js/render_search.js (render_filter).
*
* Main exports:
*  - view_search_user_presets        – constructor stub (required by section view registry)
*  - view_search_user_presets.render – async full/content render
*  - render_column_apply_preset      – column callback: Apply button
*  - render_column_id                – column callback: Edit/ID button
*  - render_column_remove            – column callback: Delete button
*  - render_preset_modal             – modal launcher for preset name/visibility/default editing
*  - select_preset                   – loads and applies a preset + updates the row highlight
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {set_element_css} from '../../page/js/css.js'
	import {edit_user_search_preset, load_search_preset} from '../../search/js/search_user_presets.js'
	import {render_filter} from '../../search/js/render_search.js'
	import {
		apply_semantic_from_preset
	} from '../../search/js/render_semantic.js'
	import {get_section_records} from '../../section/js/section.js'
	import {no_records_node} from '../../section/js/render_common_section.js'



/**
* VIEW_SEARCH_USER_PRESETS
* Constructor stub required by the section view-registration system.
* The real rendering entry-point is the static method
* view_search_user_presets.render, which is called by the section renderer
* when view === 'search_user_presets'.
* @returns {boolean} Always returns true (no initialization needed).
*/
export const view_search_user_presets = function() {

	return true
}//end view_search_user_presets



/**
* RENDER
* Builds the full wrapper DOM tree for the search-presets list view, or returns
* only the inner content_data node when render_level === 'content' (used by
* pagination refresh to replace just the row area without rebuilding the shell).
*
* Sequence:
*  1. Rebuild the columns_map with control columns prepended/appended.
*  2. Resolve or reuse cached section_record instances (self.ar_instances).
*  3. Build content_data (the rows).
*  4. Short-circuit and return content_data when render_level === 'content'.
*  5. Build the full wrapper: optional paginator + list_body containing
*     content_data, wrapped in a <section> element.
*
* Side effects:
*  - Mutates self.columns_map, self.ar_instances, and self.node_body.
*  - May inject custom CSS via set_element_css when self.context.css is set.
*  - Sets wrapper.content_data and wrapper.list_body as DOM pointers for
*    callers that need to reach inside the rendered tree.
*
* The paginator is built and rendered asynchronously via .then() chaining
* (fire-and-forget relative to the main awaited path) so that the wrapper
* is returned before the paginator is ready. The paginator container is
* appended to the fragment first, so it appears above the list in the DOM
* regardless of when the paginator resolves.
*
* @param {Object} self    - The section instance (search's presets section).
* @param {Object} options - Render options.
* @param {string} [options.render_level='full'] - 'full' returns the complete
*   wrapper; 'content' returns only the content_data div (used by refresh).
* @returns {Promise<HTMLElement>} The wrapper <section> element (render_level
*   'full') or the content_data <div> (render_level 'content').
*/
view_search_user_presets.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		const columns_map	= await rebuild_columns_map(self)
		self.columns_map	= columns_map

	// ar_section_record. section_record instances (init and built)
		self.ar_instances = self.ar_instances && self.ar_instances.length>0
			? self.ar_instances
			: await get_section_records({caller: self})

	// content_data
		const content_data = await get_content_data(self.ar_instances, self)
		if (render_level === 'content') {
			return content_data
		}

	// DocumentFragment
		const fragment = new DocumentFragment()

	// paginator container node
		if (self.paginator) {
			const paginator_container = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'paginator_container',
				parent			: fragment
			})

			self.paginator.build()
			.then(function(){
				self.paginator.mode = 'mini'
				self.paginator.render().then(paginator_wrapper => {
					paginator_container.appendChild(paginator_wrapper)
				})
			})
		}

	// list body
		const list_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'list_body',
			parent			: fragment
		})
		// fix last list_body (for pagination selection)
		self.node_body = list_body

		// list_body css
			const selector = `${self.section_tipo}_${self.tipo}.list`
		// custom properties defined css
			if (self.context.css) {
				// use defined section css
				set_element_css(selector, self.context.css)
			}

	// content_data append
		list_body.appendChild(content_data)

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'section',
			id				: self.id,
			class_name		: `wrapper_${self.type} ${self.model} ${self.tipo} ${self.section_tipo+'_'+self.tipo} view_${self.view} list`
		})
		wrapper.appendChild(fragment)
		// set pointers
		wrapper.content_data	= content_data
		wrapper.list_body		= list_body


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Renders all section_record rows into a content_data container div.
* When the ar_section_record array is empty, renders the standard
* no_records_node placeholder. Otherwise renders all rows in parallel
* (Promise.all) to minimise sequential await overhead, then appends
* them in order to preserve the original sort.
*
* add_hilite_row is passed as false to each section_record render call
* because the preset list manages its own row highlighting (the 'selected'
* class applied by select_preset), and the default highlight behavior
* from the section_record renderer would conflict with it.
*
* @param {Array}  ar_section_record - Array of section_record instances,
*   already built (build() called). May be empty.
* @param {Object} self              - The section instance; provides self.mode
*   and self.type for the content_data CSS classes.
* @returns {Promise<HTMLElement>} A <div class="content_data …"> containing
*   the rendered row nodes (or the no-records placeholder).
*/
const get_content_data = async function(ar_section_record, self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// add all section_record rendered nodes
		const ar_section_record_length = ar_section_record.length
		if (ar_section_record_length === 0) {

			// no records found case
			const row_item = no_records_node()
			fragment.appendChild(row_item)

		}else{
			// rows
			// parallel mode
				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					// render
					const render_promise_node = ar_section_record[i].render({
						add_hilite_row : false
					})
					ar_promises.push(render_promise_node)
				}
				await Promise.all(ar_promises)
				.then(function(values) {
					for (let i = 0; i < ar_section_record_length; i++) {
						const section_record_node = values[i]
						fragment.appendChild(section_record_node)
					}
				});
		}

	// content_data
		const content_data = document.createElement('div')
			  content_data.classList.add('content_data', self.mode, self.type)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Constructs the final columns_map for the preset list by prepending and
* appending control columns around the section's base columns.
*
* The result order is:
*  1. 'apply_preset' – Apply button (always present, leftmost).
*  2. 'edit'         – ID / edit button (always present).
*  3. …base columns… – taken from self.columns_map as configured on the
*     section (e.g. the preset name column dd624).
*  4. 'delete'       – Delete button (only when self.permissions > 1).
*
* Each control column specifies a `callback` function that is invoked per row
* by the section_record renderer with a standard options object
* {caller, section_id, section_tipo, locator, …}.
*
* The 'edit' column's `path` entry uses component_tipo 'section_id' — a
* special sentinel recognized by the search layer as a direct DB column rather
* than a JSONB component lookup. The model/name fields are aesthetic only and
* do not affect data resolution.
*
* Note: `await self.columns_map` is used to handle both a resolved array and a
* Promise (the section may lazily produce the base columns_map).
*
* @param {Object} self - The section instance; provides self.section_tipo and
*   self.permissions.
* @returns {Promise<Array>} The augmented columns_map array.
*/
const rebuild_columns_map = async function(self) {

	const columns_map = []

	// column apply_preset
		columns_map.push({
			id			: 'apply_preset',
			label		: 'Apply',
			tipo		: 'apply_preset', // used to sort only
			width		: 'auto',
			callback	: render_column_apply_preset
		})

	// column section_id check
		columns_map.push({
			id			: 'edit',
			label		: 'Id',
			tipo		: 'edit', // used to sort only
			width		: 'auto',
			path		: [{
				// note that component_tipo=section_id is valid here
				// because section_id is a direct column in search
				component_tipo	: 'section_id',
				// optional. Just added for aesthetics
				model			: 'component_section_id',
				name			: 'ID',
				section_tipo	: self.section_tipo
			}],
			callback	: render_column_id
		})

	// columns base
		const base_columns_map = await self.columns_map
		columns_map.push(...base_columns_map)

	// button_remove
		if (self.permissions > 1) {
			columns_map.push({
				id			: 'delete',
				label		: '',
				width 		: 'auto',
				callback	: render_column_remove
			})
		}


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_APPLY_PRESET
* Column callback that renders the Apply button for a single preset row.
* When clicked, the button loads the preset filter blob from the database
* (via load_search_preset → dd625 component_json) and rebuilds the search
* panel's filter UI with that filter, then highlights the row as 'selected'.
*
* options.caller is the section instance (the presets list section), and
* options.caller.caller is the search instance that owns the presets panel.
* The double-dereference is intentional: the section is a child of the search.
*
* Side effects on click:
*  - Adds/removes 'loading' CSS class on self.node (the search node).
*  - Calls select_preset which calls render_filter + render_search_buttons
*    (mutates the search DOM) and updates the row highlight.
*
* @param {Object}        options             - Standard column-callback options.
* @param {Object}        options.caller      - The section instance (presets list).
* @param {Object}        [options.caller.caller] - The search instance.
* @param {string|number} options.section_id  - The preset's section_id (dd623).
* @returns {HTMLElement} A <span> button element with a click listener.
*/
export const render_column_apply_preset = function(options) {

	// options
		const self			= options.caller?.caller // object instance search
		const section_id	= options.section_id

	// button_apply
		const button_apply = ui.create_dom_element({
			element_type	: 'span',
			id				: 'apply_preset_' + section_id,
			class_name		: 'button_apply_preset button icon arrow_link'
		})
		// click handler
		const apply_preset_handler = async (e) => {
			e.stopPropagation()

			// loading
			self.node?.classList.add('loading')

			// select_preset
			await select_preset({
				self			: self,
				section_id		: section_id,
				button_apply	: button_apply,
				load_preset		: true
			})

			// loading
			self.node?.classList.remove('loading')
		}
		button_apply.addEventListener('click', apply_preset_handler)


	return button_apply
}//end render_column_apply_preset



/**
* SELECT_PRESET
* Loads the saved search preset filter blob for the given section_id, renders
* it into the search panel's filter DOM, and refreshes the search button bar.
* Also updates the row highlight in the preset list so exactly one row shows
* the 'selected' class.
*
* When load_preset is false the function skips the load+render step and only
* updates the visual selection and self.user_preset_section_id. This is used
* when the calling code has already applied the preset by another path and
* only needs the UI state synchronized.
*
* Filter loading sequence (when load_preset === true):
*  1. load_search_preset fetches the JSON filter from component_json dd625
*     for the given preset record (dd623 section_id).
*  2. render_filter rebuilds the search_container_selection DOM area with the
*     loaded filter, passing allow_duplicates=true so repeated field types
*     are all rendered.
*  3. self.render_search_buttons() recreates the search button toolbar to
*     reflect the new filter state (save, clear, etc.).
*
* DOM traversal for the row highlight:
*  button_apply → parentNode (column cell) → parentNode (section_record row)
*  → parentNode (content_data). All .section_record elements in content_data
*  have 'selected' removed before the current row gets it.
*
* @param {Object}        options                    - Options bag.
* @param {Object}        options.self               - The search instance.
* @param {string|number} options.section_id         - ID of the preset to select (dd623).
* @param {HTMLElement}   [options.button_apply]     - The Apply button element for
*   the row; used for the DOM traversal that highlights the row. May be null
*   when called programmatically (no visual highlight update in that case).
* @param {boolean}       [options.load_preset=true] - When true, fetches and
*   renders the preset filter. When false, only updates selection state.
* @returns {Promise<boolean>} Resolves to true on completion.
*/
export const select_preset = async function (options) {

	// options
		const self			= options.self
		const section_id	= options.section_id
		const button_apply	= options.button_apply
		const load_preset	= options.load_preset ?? true

	// load_preset
	if (load_preset) {
		// load DDBB component_json data
		const json_filter = await load_search_preset({
			section_id : section_id
		})

		// render_filter (into search_container_selection at center)
		render_filter({
			self				: self,
			editing_preset		: json_filter,
			allow_duplicates	: true
		})

		// semantic (RAG): restore the preset's live NL query as state (Apply
		// re-runs it) and reflect it in the toolbar quick input — the single
		// semantic UI since 2026-07-23.
		apply_semantic_from_preset(self, json_filter)
		const quick_input = document.querySelector('.semantic_quick_search input.semantic_query')
		if (quick_input) {
			quick_input.value = self.semantic?.q || ''
		}

		// render buttons (force to re-create the buttons)
		self.render_search_buttons()
	}

	// reset all and set current as selected
	if (button_apply) {
		const section_record	= button_apply.parentNode?.parentNode
		const content_data		= section_record?.parentNode
		content_data?.querySelectorAll('.section_record').forEach(el => {
			el.classList.remove('selected')
		});
		section_record?.classList.add('selected')
	}

	// fix user_preset_section_id
	self.user_preset_section_id = section_id


	return true
}//end select_preset



/**
* RENDER_COLUMN_ID
* Column callback that renders the ID/edit button for a single preset row.
* When clicked (mousedown), opens the preset edit modal (render_preset_modal)
* so the user can change the preset name, its public visibility, and whether
* it is the default preset.
*
* Uses mousedown (not click) to match the convention used by other edit
* buttons in Dédalo's section views, which avoids focus-blur race conditions
* with editable fields in the same view.
*
* @param {Object}        options            - Standard column-callback options.
* @param {Object}        options.caller     - The section instance (presets list).
* @param {string|number} options.section_id - The preset's section_id (dd623).
* @returns {HTMLElement} A <span> button element with a mousedown listener.
*/
export const render_column_id = function(options) {

	// options
		const section		= options.caller // object instance section
		const section_id	= options.section_id

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_edit button icon edit button_view_' + section.context.view
		})
		const click_handler = (e) => {
			e.stopPropagation()
			// open modal to edit preset
			render_preset_modal({
				caller		: section,
				section_id	: section_id
			})
		}
		button_edit.addEventListener('mousedown', click_handler)


	return button_edit
}//end render_column_id



/**
* RENDER_PRESET_MODAL
* Opens a small modal dialog containing the preset edit form (name, public
* flag, default flag, save_arguments flag) for the given preset record.
*
* The modal body starts empty; a spinner is shown while the edit section
* (dd623 in 'edit' mode, via edit_user_search_preset) is built and rendered.
* Once the section node is ready, focus is moved to the first editable input
* using dd_request_idle_callback to avoid a focus race with the CSS transition
* of the modal opening animation.
*
* The modal width is overridden to 20rem via a dd_modal callback because the
* default small modal is wider than needed for a few-field form.
*
* @param {Object}        options            - Options bag.
* @param {Object}        options.caller     - The section instance (presets list).
* @param {string|number} options.section_id - The preset's section_id to edit (dd623).
* @param {Function|null} [options.on_close] - Optional callback invoked when
*   the modal is dismissed; useful for refreshing the preset list.
* @returns {void}
*/
export const render_preset_modal = function (options) {

	// options
		const section		= options.caller // object instance section
		const section_id	= options.section_id
		const on_close		= options.on_close || null

	// modal body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'container'
		})

	// modal attach to document
		ui.attach_to_modal({
			header		: get_label.search_presets || 'User search preset',
			body		: body,
			footer		: null,
			size		: 'small',
			callback	: (dd_modal) => {
				dd_modal.modal_content.style.width = '20rem'
			},
			on_close	: on_close
		})

	// load section user_search_preset into modal body
		ui.load_item_with_spinner({
			container	: body,
			label		: 'Preset ' + section_id,
			style : {
				height : '273px'
			},
			callback	: async function() {
				// section load
				const edit_section	= await edit_user_search_preset(section, section_id)
				const section_node	= await edit_section.render()

				// activate input name
				dd_request_idle_callback(
					() => {
						edit_section.focus_first_input()
					}
				)

				return section_node
			}
		})
}//end render_preset_modal



/**
* RENDER_COLUMN_REMOVE
* Column callback that renders the Delete button for a single preset row.
* Only added to the columns_map when self.permissions > 1 (see rebuild_columns_map).
*
* On click:
*  1. Shows a browser confirm() dialog (uses get_label.sure for i18n with
*     a fallback of 'Sure?').
*  2. Calls section.delete_section with a targeted SQO (single-record locator,
*     delete_record mode, diffusion disabled because presets are user data
*     that should not propagate to publication targets).
*  3. On success: resets the section offset to 0, clears total to force a
*     recount, refreshes the list.
*  4. Also cleans up the search instance state: hides the save-preset button
*     if visible, and clears search_instance.user_preset_section_id so no
*     preset is considered active.
*
* options.caller is the presets list section and options.caller.caller is the
* search instance — the same double-dereference pattern used in
* render_column_apply_preset.
*
* (!) Uses the browser's built-in confirm() which is declared via the
* global directive at the top of the file because it is a global injected
* by the page environment, not from an import.
*
* @param {Object}        options              - Standard column-callback options.
* @param {Object}        options.caller       - The section instance (presets list).
* @param {Object}        [options.caller.caller] - The search instance; used to
*   clean up button_save_preset and user_preset_section_id after deletion.
* @param {string|number} options.section_id   - The preset record to delete (dd623).
* @param {string}        options.section_tipo - The preset section tipo (dd623);
*   used to build the delete SQO.
* @returns {HTMLElement} A <span> delete button with an async click listener.
*/
export const render_column_remove = function(options) {

	// options
		const section		= options.caller // object instance section
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	// delete_button
		const delete_button = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button_delete button delete_light icon'
		})
		// click event
		const click_handler = async (e) => {
			e.stopPropagation()

			// confirm dialog
				if (!confirm(get_label.sure || 'Sure?')) {
					return
				}

			// delete section
				const sqo = {
					section_tipo		: [section_tipo],
					filter_by_locators	: [{
						section_tipo	: section_tipo,
						section_id		: section_id
					}],
					limit				: 1
				}
				const result = await section.delete_section({
					sqo							: sqo,
					delete_mode					: 'delete_record',
					delete_diffusion_records	: false
				})

				if (result) {

					// reset offset
					section.rqo.sqo.offset = 0

					// force to recalculate total records
					section.total = null
					// refresh section section
					await section.refresh()

					// search : update buttons and selections
					const search_instance = options.caller?.caller
					if (search_instance) {
						// hide save button if is visible
						const button_save_preset = search_instance.button_save_preset
						if (button_save_preset && !button_save_preset.classList.contains('hide')) {
							button_save_preset.classList.add('hide')
						}
						// unset user_preset_section_id selection
						search_instance.user_preset_section_id = null
					}
				}
		}
		delete_button.addEventListener('click', click_handler)


	return delete_button
}//end render_column_remove



// @license-end
