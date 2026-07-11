// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, Promise, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* VIEW_INDEXATION_EDIT_PORTAL
*
* Edit-mode view for `component_portal` when its configured view is `'indexation'`.
* This view is designed for the tool_indexation workflow: it displays the set of
* portal entries that have been tagged inside a companion text-area component (typically
* `component_text_area`) and lets the cataloguer interact with those tags directly from
* the portal UI.
*
* Key differences from the default (`view_default_edit_portal`) table view:
* - Autocomplete is intentionally disabled (`self.autocomplete = false`), because new
*   entries are created by tagging text in the editor, not by searching and adding.
* - The 'delete link and record' button is hidden (`show_interface.button_delete_link_and_record
*   = false`) — indexation entries are managed through the tagging workflow.
* - Entries are de-duplicated by `section_tipo`+`section_id` before fetching section
*   records, because the same target record may be tagged multiple times (once per tag
*   anchor). The tag column renders all individual tag instances.
* - When `self.active_tag` is set the list is filtered to the matching tag; a
*   "Remove filter" button in the footer calls `self.reset_filter_data()`.
* - Each row carries a clickable tag chip (rendered by `render_tag_column`) that fires
*   the `click_tag_index_<id_base>` or `click_tag_reference_<id_base>` event on the
*   matching `component_text_area` instance, scrolling and selecting the tag in the editor.
*
* Exports:
* - `view_indexation_edit_portal`   — constructor stub (never instantiated directly).
* - `view_indexation_edit_portal.render(self, options)` — async entry point called by
*   `render_edit_component_portal.prototype.edit` for the `'indexation'` case.
*
* Data shapes consumed from `self` (the `component_portal` instance):
* - `self.data.entries`            — `Array<Locator>` where each Locator is
*                                    `{ id, type, section_tipo, section_id,
*                                       from_component_tipo, tag_id?, tag_type?,
*                                       tag_component_tipo? }`.
* - `self.data.references`         — optional `Array<Reference>` for relation-related items.
* - `self.active_tag`              — `{ caller, text_editor, tag: { tag_id, … } }` set by
*                                    `filter_data_by_tag_id`; null when no filter is active.
* - `self.columns_map`             — base column definitions (extended by rebuild_columns_map).
* - `self.fixed_columns_map`       — boolean guard: true once columns have been augmented.
* - `self.add_component_info`      — boolean: add a ddinfo column when true.
* - `self.target_section`          — `Array<DDO>` descriptors for the target section(s).
* - `self.permissions`             — `1` = read-only, `2` = full edit.
* - `self.ar_instances`            — child instance registry (section_record instances are
*                                    pushed here so they are destroyed on component refresh).
*
* @module view_indexation_edit_portal
* @see render_edit_component_portal.js  for the view-dispatch switch.
* @see component_portal.js              for the full constructor and prototype.
* @see view_default_edit_portal.js      for the canonical default table view.
* @see docs/core/components/component_portal.md for the full specification.
*/



// imports
	import {get_section_records} from '../../section/js/section.js'
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {get_all_instances} from '../../common/js/instances.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {
		render_column_component_info,
		render_column_remove,
		render_references,
		get_buttons
	} from './render_edit_component_portal.js'



/**
* VIEW_INDEXATION_EDIT_PORTAL
* Constructor stub for the indexation edit view.
*
* Never instantiated directly. Its role is purely as a namespace for the static
* `render` method assigned below. `render_edit_component_portal.prototype.edit`
* calls `view_indexation_edit_portal.render(self, options)` directly when the
* configured portal view is `'indexation'`.
*/
export const view_indexation_edit_portal = function() {

	return true
}//end view_indexation_edit_portal



/**
* RENDER
* Main entry point for the indexation edit view of `component_portal`.
*
* Builds the complete wrapper DOM node (or just the inner content_data when
* `render_level === 'content'`). The function:
* 1. Disables autocomplete — indexation portals are populated by the tagging workflow,
*    not by the standard autocomplete search box.
* 2. De-duplicates `self.data.entries` by `section_tipo`+`section_id` to obtain a
*    unique list of target records (`entries_combined`). The same record may be tagged
*    multiple times (e.g. two index tags pointing at the same authority record), but
*    `get_section_records` needs one request per unique record.
* 3. Builds a stable `id_variant` for the section-record cache key: when a tag filter
*    is active (`self.active_tag`) it appends the tag_id so filtered and unfiltered
*    render passes do not collide in the instance cache.
* 4. Fetches and renders `section_record` instances for all unique entries, then
*    alphabetically sorts the resulting DOM nodes by their `innerText`.
* 5. Wraps everything in the standard `ui.component.build_wrapper_edit` shell and
*    appends the `'portal'` and `'view_indexation'` CSS classes.
*
* @param {Object} self    - The `component_portal` instance (the component being rendered).
* @param {Object} options - Render options forwarded from the view dispatcher.
* @param {string} [options.render_level='full'] - `'full'` renders the entire wrapper
*   including toolbar buttons; `'content'` returns only the inner content_data node
*   (used by `self.refresh()` to update the record list without rebuilding the shell).
* @returns {Promise<HTMLElement>} The rendered wrapper node (full render) or the
*   `content_data` node (content-level render).
*/
view_indexation_edit_portal.render = async function(self, options) {

	// prevents to load autocomplete service
		self.autocomplete = false

	// options
		const render_level = options.render_level || 'full'

	// columns_map
		self.columns_map = await rebuild_columns_map(self)

	// entries_combined (grouped by tag id)
	// De-duplicate entries so that each unique target record (section_tipo + section_id)
	// appears only once in the get_section_records request, even if it is tagged multiple times.
		const data				= self.data || {}
		const entries			= data.entries || []
		const entries_combined	= []
		const entries_length	= entries.length
		for (let i = 0; i < entries_length; i++) {
			const item = entries[i]
			const found = entries_combined.find(el => el.section_tipo===item.section_tipo && el.section_id===item.section_id)
			if (!found) {
				entries_combined.push(item)
			}
		}

	// ar_section_record
	// Build a tag-aware cache key: if a tag filter is active, include its tag_id in
	// the id_variant so filtered renders are cached independently of the full list.
		const id_variant = self.active_tag && self.active_tag.tag
			? self.id_variant + '_' + self.active_tag.tag.tag_id
			: self.id_variant + '_' + (new Date()).getTime()

		const ar_section_record	= await get_section_records({
			caller		: self,
			mode		: 'list',
			columns_map	: self.columns_map,
			value		: entries_combined,
			id_variant	: id_variant,
			view		: 'text'
		})

		// store to allow destroy later
		self.ar_instances.push(...ar_section_record)

	// content_data
		const content_data = await get_content_data(self, ar_section_record)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		// ! configure interface to avoid display modal button_delete_link_and_record
		// Indexation entries are managed via the tag workflow; the "delete link and record"
		// action would bypass that workflow and is therefore suppressed.
		self.show_interface.button_delete_link_and_record = false
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		wrapper.classList.add(
			'portal',
			'view_indexation'
		)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* Renders all resolved section-record nodes and assembles the scrollable content area.
*
* Steps performed:
* 1. Calls `render()` on every `section_record` instance in parallel using `Promise.all`.
* 2. Sorts the resulting DOM nodes alphabetically by their `innerText`. Because the
*    section records are fetched by unique (section_tipo, section_id) pairs and may
*    arrive in any order from the server, client-side sorting gives a consistent list.
* 3. If `self.data.references` is non-empty, appends a read-only back-reference list
*    via `render_references` (used by relation-related indexation portals).
* 4. When a tag filter is active (`self.active_tag` is set), appends a footer bar with a
*    "Remove filter" button that calls `self.reset_filter_data()` to restore the full list.
* 5. Wraps the DocumentFragment in the standard `ui.component.build_content_data` node.
*
* @param {Object}   self              - The `component_portal` instance.
* @param {Array}    ar_section_record - Array of section_record instances returned by
*                                       `get_section_records`. May be empty when there are
*                                       no matching indexed entries.
* @returns {Promise<HTMLElement>} The assembled `content_data` DOM node, ready to be
*   inserted into the wrapper.
*/
const get_content_data = async function(self, ar_section_record) {

	// build_values
		const fragment = new DocumentFragment()

		// add all section_record rendered nodes
			const ar_section_record_length	= ar_section_record.length
			if (ar_section_record_length===0) {

				// no records found case
				// const row_item = no_records_node()
				// fragment.appendChild(row_item)
			}else{

				const ar_promises = []
				for (let i = 0; i < ar_section_record_length; i++) {
					const render_promise = ar_section_record[i].render()
					ar_promises.push(render_promise)
				}
				const values = await Promise.all(ar_promises)

				// sort values alphabetically
				// Records arrive in fetch order (by section_id). Sort by innerText so the
				// list is stable and easy to scan regardless of when records were created.
					values.sort((a,b)=>a.innerText>b.innerText?1:-1)

				for (let i = 0; i < ar_section_record_length; i++) {

					const section_record = values[i]

					fragment.appendChild(section_record)
				}
			}//end if (ar_section_record_length===0)

		// build references
		// Render back-references when `self.data.references` is populated.
		// This applies to portals configured as relation-related (inverse relation) views.
			if(self.data.references && self.data.references.length > 0){
				const references_node = render_references(self.data.references)
				fragment.appendChild(references_node)
			}

	// active_tag
	// When a tag filter is active, add a footer button that lets the cataloguer
	// clear the filter and return to the full unfiltered entry list.
		if (self.active_tag) {
			const list_footer =  ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'list_footer',
				parent			: fragment
			})
			const button_remove_filter = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'primary button_remove_filter icon eye',
				inner_html		: get_label.remove_filter || 'Remove filter',
				parent			: list_footer
			})
			const fn_click = function(e) {
				e.stopPropagation()
				// reset filter
				self.reset_filter_data()
			}
			button_remove_filter.addEventListener('click', fn_click)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data



/**
* REBUILD_COLUMNS_MAP
* Extends the base `self.columns_map` (set from the ontology / request config) with
* control columns specific to the indexation view.
*
* Column order after rebuild:
* 1. `section_id`  — "open record in new window" button (`render_column_id`).
* 2. *base columns* — ontology-defined content columns (labels, dates, etc.).
* 3. `tag`         — tag chips for each locator pointing at this record (`render_tag_column`).
* 4. `ddinfo`      — optional debug/admin info overlay, added only when
*                    `self.add_component_info === true`.
* 5. `info`        — section label + (when permissions ≥ 2) the unlink/delete button,
*                    rendered by `render_info_column`.
*
* The flag `self.fixed_columns_map` is set to `true` after the first run so that
* repeated calls (e.g. on content-level refreshes) return the already-extended map
* without duplicating columns.
*
* @param {Object} self - The `component_portal` instance.
* @returns {Promise<Array>} The augmented columns_map array. Each entry is an object:
*   `{ id: string, label: string, width?: string, callback: Function }`.
*/
const rebuild_columns_map = async function(self) {

	// columns_map already rebuilt case
	// Guard against calling rebuild more than once per component lifecycle.
		if (self.fixed_columns_map===true) {
			return self.columns_map
		}

	const columns_map = []

	// section_id column add
	// Provides the "open record" navigation button at the start of each row.
		columns_map.push({
			id			: 'section_id',
			label		: 'Id',
			width		: 'auto',
			callback	: render_column_id
		})

	// regular columns add
	// Splice in the base columns from the ontology/request config (e.g. title, date).
		const base_columns_map = self.columns_map || []
		columns_map.push(...base_columns_map)

	// tag column add
	// Shows the tag chips for each index anchor that points at the current row's record.
		columns_map.push({
			id			: 'tag',
			label		: 'Tag',
			width		: 'auto',
			callback	: render_tag_column
		})

	// ddinfo. column_component_info column add
	// Only included when value_with_parents is configured on the ddo_map (self.add_component_info).
		if (self.add_component_info===true) {
			columns_map.push({
				id			: 'ddinfo',
				label		: 'Info',
				callback	: render_column_component_info
			})
		}

	// info. render_info_column column add
	// Appended last: shows the section type label and the unlink/delete control.
		columns_map.push({
			id			: 'info',
			label		: 'Info',
			callback	: render_info_column
		})

	// button_remove column (Moved to inside render_info_column for readability)

	// fixed as calculated
	// Mark columns as already built so subsequent refreshes skip this augmentation.
		self.fixed_columns_map = true


	return columns_map
}//end rebuild_columns_map



/**
* RENDER_COLUMN_ID
* Renders the first cell of each portal row: a button that opens the target record in
* a new window (reusing a stable window name `'edit_window'`).
*
* The button fires on `mousedown` (not `click`) to avoid focus-loss side effects in
* the main editing context. It uses `open_window` from utils, which manages window
* reuse and optional tab opening.
*
* Note: this is a simplified version of the `render_column_id` exported by
* `render_edit_component_portal.js`. It omits the drag handle and drop zone because
* reordering is not meaningful in the indexation view (order is determined by the text
* editor's tag sequence, not a manual sort).
*
* @param {Object} options              - Options object supplied by `section_record` per row.
* @param {Object} options.caller       - The `component_portal` instance.
* @param {string} options.section_id   - The section_id of the target record for this row.
* @param {string} options.section_tipo - The section_tipo of the target record for this row.
* @returns {DocumentFragment} Fragment containing the open-record button and its icon.
*/
const render_column_id = function(options) {

	// options
		const self 			= options.caller
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo

	const fragment = new DocumentFragment()

	// button_edit
		const button_edit = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'button_edit',
			title_label		: get_label.open || 'Open',
			parent			: fragment
		})
		// event click
		const click_handler = (e) => {
			e.stopPropagation()

			const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
				tipo			: section_tipo,
				id				: section_id,
				mode			: 'edit',
				menu			: false,
				session_save	: false
			})

			open_window({
				url			: url,
				target		: 'edit_window'
			})
		}
		button_edit.addEventListener('mousedown', click_handler)

	// edit icon
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button edit icon',
			parent			: button_edit
		})


	return fragment
}//end render_column_id



/**
* RENDER_TAG_COLUMN
* Renders the tag-chip column for a single portal row.
*
* Each entry in `self.data.entries` that matches the current row's `section_tipo` and
* `section_id` produces one chip. A single target record can have multiple chips when
* it is tagged more than once in the companion text editor.
*
* Chip appearance:
* - `class_name` is `'no_tag'` when `tag_id` is absent (provisional/unsaved tag),
*   or `'tags'` when a stable tag_id is assigned.
* - `tag_type` defaults to `'index'` when absent. It is also used as an additional
*   CSS class and to choose the `event_manager` channel (`'indexIn'` or the raw type).
* - The chip's text content is the `tag_id` string (e.g. `"4"`) for a confirmed tag,
*   or the localised string `'Provisional'` for an unsaved anchor.
*
* On click, the chip:
* 1. Resolves `tag_component_tipo` from the locator (preferred) or falls back to
*    `self.context.properties.config_relation.tag_component_tipo`. If neither is
*    available the click is silently aborted and a warning is logged.
* 2. Builds the `id_base` of the companion `component_text_area` as:
*    `<caller.section_tipo>_<caller.section_id>_<tag_component_tipo>`.
* 3. Looks up that component in the global instance registry via `get_all_instances`.
* 4. Calls `text_editor.get_view_tag_attributes` to obtain the live tag object from
*    the editor's current DOM/model state.
* 5. Publishes the appropriate `click_tag_index_*` or `click_tag_reference_*` event
*    on `event_manager`, which the text editor subscribes to in order to scroll to and
*    highlight the tag.
*
* @param {Object} options              - Options object supplied by `section_record` per row.
* @param {Object} options.locator      - The canonical locator for this row (section_tipo + section_id).
* @param {Object} options.caller       - The `component_portal` instance.
* @returns {DocumentFragment} Fragment containing one chip `<div>` per matching entry.
*/
const render_tag_column = function(options) {

	// options
		const locator		= options.locator
		const caller		= options.caller
		const data			= caller.data || {}
		const entries		= data.entries || []
		// Filter all locators that belong to this row's record (there may be several tags).
		const entries_tags	= entries.filter(el => el.section_tipo===locator.section_tipo && el.section_id==locator.section_id)

	const self = caller

	const fragment = new DocumentFragment()

	// add a tag for each value
		const entries_tags_length = entries_tags.length
		for (let i = 0; i < entries_tags_length; i++) {

			const current_locator = entries_tags[i]

			// Determine chip CSS class: unconfirmed tags (no tag_id) get 'no_tag'.
			const class_name = !current_locator.tag_id
				? 'no_tag'
				: 'tags'

			// Normalise tag_type: the server may omit it for legacy index annotations.
			const tag_type = !current_locator.tag_type
				? 'index'
				: current_locator.tag_type

			// Display the tag_id for confirmed tags, or the 'Provisional' label for new ones.
			const text_value = !current_locator.tag_id
				? (get_label.provisional || 'Provisional')
				: (current_locator.tag_id || null)

			const tag_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: class_name+' '+tag_type,
				inner_html		: text_value,
				parent			: fragment
			})
			tag_node.addEventListener('click', function(e) {
				e.stopPropagation()
				e.preventDefault()

				if(SHOW_DEBUG===true) {
					console.log('Clicked tag_id from column:', current_locator.tag_id);
				}

				// tag_component_tipo
				// The locator must carry tag_component_tipo to locate the companion text editor.
				// If it is absent (older data or a bug in the add-link flow), fall back to the
				// portal's own properties before giving up.
					if (!current_locator.tag_component_tipo) {
						// get from properties
						const tag_component_tipo = self.context.properties?.config_relation?.tag_component_tipo
						if (tag_component_tipo) {
							current_locator.tag_component_tipo = tag_component_tipo
							console.warn('WARNING: locator tag_component_tipo is mandatory! Adding auto tag_component_tipo from properties', current_locator);
						}else{
							console.warn('ERROR: locator tag_component_tipo is mandatory! Not received into current locator and unable to get it from properties fallback', self.context.properties);
							return
						}
					}

				// id_base build like rsc167_5_rsc36
				// Construct the id_base used by the companion component_text_area instance.
				// Pattern: <host section_tipo>_<host section_id>_<tag_component_tipo>
					const id_base = [
						caller.section_tipo,
						caller.section_id,
						current_locator.tag_component_tipo
					].join('_')

				// locate component into the global array of instances
				// Search the live instance registry for the matching text-area component.
					const all_instances	= get_all_instances()
					const component		= all_instances.find(el => el.id_base===id_base)
					if (component) {

						// text_area_instance
						const text_area_instance = component

						// get the text_editor (service)
						// (!) text_editor is an array; take the first (and normally only) entry.
						const text_editor = text_area_instance.text_editor[0]

						// id_base of component_text_area
						// (!) This shadows the outer `id_base` variable — both refer to the same value.
						const id_base = text_area_instance.id_base

						// tag. Get the tag object selecting the tag into the text_area editor (get the tag attributes)
						// needed to get the tag state, to show the tag info inside the tool_indexation
						// 'indexIn' is the ProseMirror mark name for standard index tags.
						const tag = text_editor.get_view_tag_attributes({
							type	: tag_type==='index' ? 'indexIn' : tag_type,
							tag_id	: current_locator.tag_id
						})
						switch (tag_type) {
							case 'reference':
								event_manager.publish('click_tag_reference_'+ id_base, {tag: tag})
								break;

							default:
								// fire the event to select tag
								event_manager.publish('click_tag_index_'+ id_base, {tag: tag})
								break;
						}

					}else{
						console.error('Unable to locate component into instances. id_base:', id_base);
					}
			})//end event click
		}


	return fragment
}//end render_tag_column



/**
* RENDER_INFO_COLUMN
* Renders the final cell of each portal row: the target section's display label and,
* when the user has edit permissions, the unlink/delete button.
*
* The section label is read from `self.target_section` — the DDO array that was built
* from the request config during `component_portal.build()`. Each entry has a `tipo`
* and a `label` property. When the `section_tipo` for the current row cannot be matched
* (e.g. the target section was removed from the ontology), the label falls back to an
* empty string and an empty fragment is returned early.
*
* The `render_column_remove` helper (imported from `render_edit_component_portal.js`)
* is appended directly inside `info_node` rather than as a sibling column — this is a
* deliberate layout choice (see inline comment in `rebuild_columns_map`) for readability.
*
* @param {Object} options              - Options object supplied by `section_record` per row.
* @param {Object} options.locator      - Locator for this row; used by `render_column_remove`.
* @param {Object} options.caller       - The `component_portal` instance.
* @returns {DocumentFragment} Fragment containing the label div (and optionally the remove button).
*/
const render_info_column = function(options) {

	// options
		const locator	= options.locator
		const self		= options.caller

	// short vars
		const section_tipo		= locator.section_tipo
		const target_section	= self.target_section

	const fragment = new DocumentFragment()

	// check vars
	// Guard: both section_tipo and target_section are required to resolve the label.
		if (!section_tipo || !target_section) {
			return fragment // null
		}

		const found			= target_section.find(el => el.tipo===section_tipo)
		const section_label	= found
			? found.label
			: ''

	// info_node
	// The section label is displayed as a bracketed italicised note, e.g. "[Objects]".
		const info_node = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'note italic',
			inner_html		: '[' + section_label + ']',
			parent			: fragment
		})

	// remove node (former column_remove)
	// The remove button is nested inside info_node (not a separate column) for layout compactness.
		if (self.permissions>1) {
			info_node.appendChild(
				render_column_remove(options)
			)
		}


	return fragment
}//end render_info_column



// @license-end
