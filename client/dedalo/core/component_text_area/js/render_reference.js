// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance, find_instances} from '../../common/js/instances.js'
	import {clone} from '../../common/js/utils/index.js'



/**
* RENDER_REFERENCE
* Renders a modal dialog that lets the user assign or replace a "reference" tag
* inside a rich-text component_text_area (CKEditor) selection.
*
* A "reference" tag is a locator-based annotation: a span of text in the editor
* is decorated with a `reference` CKEditor attribute whose value is a view-tag
* object produced by `build_view_tag_obj`. That object points, via a locator, to
* a thesaurus or catalogue record managed by a companion portal component
* (the "tags_reference" component declared in the ontology under
* `self.properties.tags_reference`).
*
* The dialog has three sections:
*  1. NEW TAG — a live autocomplete portal (rendered as a temporal component with
*     `section_id: 1`) that lets the user search and pick a new record to link.
*  2. REUSE TAG — a list of locators that already exist inside the tags_reference
*     portal for this text-area record, so the user can share a locator across
*     multiple text spans without creating duplicates.
*  3. FOOTER — "Delete" (removes the reference attribute and unlinks the locator)
*     and "Apply" (saves the locator and writes the reference attribute via
*     `text_editor.set_reference`).
*
* Called as `self.render_reference(options)` on a component_text_area instance.
* The function is assigned to `component_text_area.prototype.render_reference`
* in component_text_area.js.
*
* @module render_reference
*/



/**
* GET_DISPLAY_VALUE
* Resolve the display string of a datum child item (the referenced record's
* label component as emitted by the tags_reference portal expansion).
*
* Wire contract (v7): `entries` holds the requested-lang slice of raw items
* `{id, lang, value}`; `fallback_value` holds the raw items of the FIRST
* non-empty other lang and exists ONLY when the requested-lang slice is empty
* (server cadence: lang equivalences → main data lang → lg-nolan → project
* langs — src/core/resolve/component_data.ts resolveComponentValue). It is
* therefore NEVER in the current lang: filtering it by `self.lang` (the old
* v6-era consumption) can never match, and the v6 flat-string shape that
* `.join(' | ')` assumed is gone — each entry is an object now.
*
* @param {Object} item - datum.data child item ({entries, fallback_value, ...})
* @returns {string} resolved display string ('' when nothing resolves)
*/
const get_display_value = (item) => {

	if (!item) {
		return ''
	}
	// entries (current lang) wins; else the server-resolved fallback slice
	const source = (item.entries && item.entries.length > 0)
		? item.entries
		: (item.fallback_value || [])

	return source
		.map(el => (el && typeof el === 'object') ? el.value : el)
		.filter(value => value !== null && value !== undefined && value !== '')
		.join(' | ')
}//end get_display_value



/**
* RENDER_REFERENCE
* Opens a modal for assigning or editing a "reference" tag on the active text
* selection in the CKEditor instance.
*
* Flow:
*  1. Locate the tags_reference companion component from the shared datum to
*     retrieve existing locators (`datum.data` entries keyed by
*     from_component_tipo / section_tipo / section_id).
*  2. Build a temporal autocomplete component
*     (`references_component_tipo` at `references_section_tipo`, section_id=1)
*     and pre-populate it with the locator currently attached to `view_tag`,
*     if any.
*  3. Render the modal. "Apply" either:
*       - saves a brand-new locator via `component_tags_reference.add_value()`
*         and writes a view-tag to the editor via `text_editor.set_reference()`,
*       - or reuses an existing locator (selected from the "Reuse" list) without
*         writing a new entry.
*  4. "Delete" calls `component_tags_reference.unlink_record()` to remove the
*     locator entry then `text_editor.remove_reference()` to strip the attribute.
*  5. On modal close the temporal component is reset and destroyed so its
*     Session-side data is cleared and instance memory is released.
*
* @param {Object} options - Configuration bundle passed by the caller.
* @param {Object} options.self - The component_text_area instance that owns this
*   reference tag (provides `section_tipo`, `section_id`, `context`, `properties`,
*   and helper methods such as `build_view_tag_obj`).
* @param {Object} options.text_editor - Active service_ckeditor instance whose
*   `set_reference()`, `remove_reference()`, and `set_dirty()` methods are called
*   to mutate the editor model.
* @param {number} options.i - Index of the tag inside the text_editor's internal
*   tag list (passed through for caller reference; not used internally here).
* @param {Object} options.tag - The view-tag object for the reference span that
*   was clicked. Shape: `{ tag_id, tag_type, label, state, data, reuse? }`.
*   `tag_id` identifies the reference span in both the editor markup and the
*   locator entries stored in the tags_reference component.
* @returns {Promise<boolean>} Resolves to `true` when the modal has been built
*   and attached successfully; `false` when a prerequisite is missing (e.g.
*   the tags_reference component instance cannot be found, or the user lacks
*   permissions for the autocomplete component).
*/
export const render_reference = async function(options) {

	// options
		const self				= options.self
		const text_editor		= options.text_editor
		const i					= options.i
		const view_tag			= options.tag
		const tags_reference	= self.properties.tags_reference // the component with all locator references
		const selected_tag 		= clone(options.tag)
			  selected_tag.reuse = false

	// component with the tag data
		const tag_component_options = {
			tipo			: tags_reference.tipo,
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan
		}

		// get the reference component instance
		const found_instances			= find_instances(tag_component_options)
		const component_tags_reference	= found_instances.length > 0
			? found_instances[0]
			: null

		// (!) The tags_reference companion component must already be built (it lives in
		// the same section context). If it is absent the ontology is misconfigured — the
		// component tipo declared in `self.properties.tags_reference` must exist.
		if(!component_tags_reference){
			console.error("Error! misconfigured text area with references, the tags reference component is not available, create new one in the ontology, see rsc36 and rsc1368");
			return false
		}
	
		// Locate this text-area's own datum entry inside the shared datum.data array.
		// datum.data is the flat array shared across the section; entries are keyed by
		// tipo + section_tipo + section_id. `found_tag_data.entries` holds the array of
		// locator objects for all reference tags recorded in this component.
		const found_tag_data = component_tags_reference.datum.data.find(el =>
			el.tipo===component_tags_reference.tipo &&
			el.section_tipo===component_tags_reference.section_tipo &&
			el.section_id==component_tags_reference.section_id)

		const all_tag_data = found_tag_data && found_tag_data.entries
			? found_tag_data.entries
			: []

		// component_tags_reference.data.entries is the live (potentially unsaved) array
		// of locator entries. Each entry carries: tag_id, tag_type, from_component_tipo,
		// section_tipo, section_id, and optionally fallback_value.
		const ar_tags_values = component_tags_reference.data.entries

		// Find the locator entry that corresponds to the clicked reference span.
		// `tag_type === 'reference'` distinguishes these from index/note/draw tags.
		// ALWAYS an array: a record whose tags_reference holds no locators yet
		// (the FIRST reference of a text) has data.entries null, and the Delete
		// handler — also reached by Apply-with-empty-selection — reads
		// `locator.length`, which crashed on null instead of cleanly removing
		// the half-created tag from the editor.
		const locator = (ar_tags_values)
			? ar_tags_values.filter(el => el.tag_id === view_tag.tag_id && el.tag_type === 'reference')
			: []

		// Build the list of reusable locators: iterate datum.data entries to enrich
		// each locator with a human-readable display_value resolved from the server
		// data (entries / fallback_value — see get_display_value).
		// Iterating in reverse so most-recently added entries appear first.
		const existing_values = []
		for (let i = all_tag_data.length - 1; i >= 0; i--) {
			const current_locator = all_tag_data[i]

			// Check whether a datum.data entry exists for this locator's pointed-at
			// section (from_component_tipo + section_tipo + section_id). Only locators
			// whose referenced record is present in datum get a display_value.
			const found = component_tags_reference.datum.data.find(el =>
				el.from_component_tipo === current_locator.from_component_tipo &&
				el.section_tipo === current_locator.section_tipo &&
				el.section_id === current_locator.section_id
			)

			if(found){
				const used_locator = clone(current_locator)
				// resolved display string (entries in current lang, else the
				// server fallback slice) — see get_display_value wire notes
				used_locator.display_value = get_display_value(found)
				existing_values.push(used_locator)
			}
		}

	// get the reference portal
	// used as temporal portal to search into thesaurus and get the locator to be assigned to the tag
		const references_section_tipo		= self.context.features.references_section_tipo // the section with a empty autocomplete to be use to search
		const references_component_tipo		= self.context.features.references_component_tipo // empty autocomplete to be use to search
		const references_component_model	= self.context.features.references_component_model

	// reference_component
		// Build a temporal (non-persisted) component instance to serve as the
		// autocomplete search widget. `is_temporal: true` makes the server's save
		// door RESOLVE + ECHO the picked value without persisting it, and its read
		// door serve an empty value (WC-059, src/core/section/record/temporal.ts) —
		// there is no server-side temporal store in the TS engine.
		// `section_id: 1` is a SENTINEL, not an address: until 2026-07-28 it was
		// taken as one, and this widget's `set_data` (which sends null to CLEAR)
		// wrote to the real record 1 of references_section_tipo.
		const instance_options = {
			model			: references_component_model,
			tipo			: references_component_tipo,
			section_tipo	: references_section_tipo,
			section_id		: 1, // Fake section_id for temporal component
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan,
			is_temporal		: true,
			caller			: self
		}
		// get the instance, built and render
			const reference_component = await get_instance(instance_options)
										await reference_component.build(true)

			// Permission guard: users without read access to the autocomplete component
			// see a "No access" warning modal and we bail out early.
			if(reference_component.permissions<1){
				const label = get_label.no_access  || 'No access here'

				// modal
				ui.attach_to_modal({
					header	: get_label.warning || 'Warning',
					body	: label+': '+ reference_component.label,
					footer	: false,
					size	: 'small' // string size big|normal
				})
				return false
			}
			// force to prevent to show tool buttons
			reference_component.show_interface.tools = false

			const reference_component_node = await reference_component.render()

		// save_animation
			reference_component.show_interface.save_animation = false

		// change data to set empty value in the component (it saved in Session instead DDBB)
			// Pre-populate the autocomplete with the locator already attached to this tag
			// (if any), so the user sees the current selection and can change or clear it.
			// `action: 'set_data'` replaces the component's in-memory value without a
			// server round-trip; `value: null` clears if no prior locator exists.
			const changed_data = [Object.freeze({
				action	: 'set_data',
				// locator is ALWAYS an array now (see its construction): an empty
				// one must still clear the autocomplete, exactly as null did.
				value	: locator.length > 0 ? locator : null
			})]

		// fix instance changed_data
			await reference_component.change_value({
				changed_data	: changed_data,
				refresh			: true,
				build_autoload 	: true
			})

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		// header_label. created label with Title case (first letter to uppercase)
			const header_label		= (view_tag.label || 'Reference')
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				inner_html		: header_label,
				parent			: header
			})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body content fill_vertical text_area_reference_selector'
		})
	// new tag
		const new_tags_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'new_tags_container',
			parent			: body
		})
			const new_tags_label = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'label new_tags_label',
				inner_html		: get_label.new_tag || 'New tag',
				parent			: new_tags_container
			})
			new_tags_container.appendChild(reference_component_node)

	// Previous values to be reused
		const existing_tags_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'existing_tags_container',
			parent			: body
		})
			const existing_tags_label = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'label existing_tags_label',
				inner_html		: get_label.reuse_tag || 'Reuse tag',
				parent			: existing_tags_container
			})
			// Build one clickable chip per reusable locator. The chip stores its locator
			// as `.data` and uses a boolean `.activated` flag to track toggle state.
			// Only one chip can be selected at a time; selecting a chip sets
			// `selected_tag.reuse = true` and overwrites `selected_tag.tag_id` so that
			// "Apply" uses the existing locator instead of creating a new one.
			const ar_existing_value_node =[]
			for (let i = 0; i < existing_values.length; i++) {

				const current_value = existing_values[i]
				const existing_value_node = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'value',
					inner_html		: current_value.display_value,
					parent			: existing_tags_container
				})
				existing_value_node.data = current_value

				existing_value_node.activated = false
				existing_value_node.key = i
				ar_existing_value_node.push(existing_value_node)
				existing_value_node.addEventListener("mouseup", function(e) {
					e.stopPropagation()
					// remove all selected node classes
					for (let i = ar_existing_value_node.length - 1; i >= 0; i--) {
						if(ar_existing_value_node[i].key !== existing_value_node.key){
							ar_existing_value_node[i].classList.remove('selected_tag')
							ar_existing_value_node[i].activated = false
						}
					}
					if(existing_value_node.activated){
						// Second click on the same chip: deselect and revert to new-tag mode.
						existing_value_node.activated = false
						existing_value_node.classList.remove('selected_tag')
						// reset the selected tag_id with the original tag_id
						selected_tag.tag_id = view_tag.tag_id
						selected_tag.reuse = false
						selected_tag.fallback_value = null
					}else{
						// First click: select this chip. Override selected_tag so "Apply"
						// will reuse this locator's tag_id rather than creating a new one.
						existing_value_node.activated = true
						existing_value_node.classList.add('selected_tag')
						// set the selected tag_id with the selection
						selected_tag.tag_id = existing_value_node.data.tag_id
						selected_tag.reuse = true
						selected_tag.fallback_value = existing_value_node.data.display_value
					}
				})
			}

	// footer
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'footer content'
		})

		// button remove
			const button_remove = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'danger remove',
				text_content	: get_label.delete || 'Delete',
				parent			: footer
			})
			// When the user click on remove button, two actions happens:
			// first, delete the section in the server
			// second, remove the tag from the text_area
			button_remove.addEventListener("click", function(e){
				e.stopPropagation()
				// ask to user if really want delete the note
				const delete_label = get_label.are_you_sure_to_delete_reference || 'Are you sure you want to delete this reference?'
				// if yes, delete the note section in the server
				if(window.confirm(delete_label)) {

					if(locator.length > 0){

						// if the locator is not empty, remove it of the component.
						component_tags_reference.unlink_record(locator[0]);
						// refresh the component of the tags to get the real data
						// component_tags_reference.reset_filter_data()
					}
					// remove the reference attribute of the text selected in the component_text_area
						text_editor.remove_reference()

					// text_area. Prepare the text_editor to save setting it in dirty mode and save the change
						text_editor.set_dirty(true)
						// text_editor.save()

					// remove the modal
						modal.remove()
				}
			})

		// button Apply reference
			const button_apply = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'success apply check',
				text_content	: get_label.apply || 'Apply',
				parent			: footer
			})
			button_apply.addEventListener('mouseup', async function(e) {
				e.stopPropagation()
				// save the locator when is a new tag_id
				// if a reuse is active, the locator already exist into the portal
				if(selected_tag.reuse === false){

					const locator = reference_component.data.entries

					// If the autocomplete is empty (user clicked Apply without selecting
					// a record), treat this as a delete: remove the tag from the editor.
					if(!locator || locator.length === 0){
						button_remove.click()
						return
					}

					// set the tag_id and tag_type into the locator to be saved
					// Stamp the tag_id and tag_type from the clicked view-tag onto the
					// new locator so the server can correlate it back to this text span.
					const new_locator = locator[0]
						new_locator.tag_id = view_tag.tag_id
						new_locator.tag_type = 'reference'

					// remove type from locator to be set as preferences says in server.
					// see the ontology node properties
					delete new_locator.type

					// Persist the locator into the tags_reference portal. `link_record`
					// is the v7 relation verb (it stamps from_component_tipo and saves
					// through the normal portal change_value path); the v6 `add_value`
					// this code shipped with never existed in the v7 client, so Apply
					// crashed here and the reference never reached the text. A `false`
					// return means the locator was already linked — the text span must
					// still get its reference attribute below, so we continue either way.
					await component_tags_reference.link_record(new_locator);

					// get the data from the new locator
					// Look up the datum.data entry for the newly added locator so we can
					// resolve its display string (entries / fallback_value).
					// Matching on section_id + section_tipo is sufficient here because the
					// portal has already disambiguated the entry by the time we reach this
					// point (from_component_tipo is commented out — left for reference).
					const locator_data = new_locator
					 	? reference_component.datum.data.find(el =>
					 		// el.from_component_tipo === new_locator.from_component_tipo &&
							el.section_id	=== new_locator.section_id &&
 							el.section_tipo	=== new_locator.section_tipo
					 	  )
					 	: null

					 // is possible that user don't select any text (collapse selection), in those cases it will insert a text value of the locator or empty text.
					 // get the resolution of the new locator (entries in current lang, else
					 // the server fallback slice — see get_display_value wire notes)
					 // if nothing resolves, empty space is used to create the text for the collapse selection
					 selected_tag.fallback_value = get_display_value(locator_data) || ' '
				 }

				// create the new tag for the reference, it's necessary to change the referenceIn tag only
					const tag_type		='reference'

				// Build a fresh view-tag object from selected_tag's resolved state and
				// pass it to `text_editor.set_reference()`. The view-tag's `data` field
				// carries the tag_id that CKEditor serialises into the rich-text model.
				const reference_tag = {
					type	: tag_type,
					label	: selected_tag.label,
					tag_id	: selected_tag.tag_id,
					state	: selected_tag.state,
					data	: selected_tag.tag_id
				}
				const tag = self.build_view_tag_obj(reference_tag, reference_tag.tag_id)
				const reference_obj = {
					locator_text_value	: selected_tag.fallback_value,
					new_data_obj		: tag
				}

				text_editor.set_reference(reference_obj)

				// text_area. Prepare the text_editor to save setting it in dirty mode and save the change
					text_editor.set_dirty(true)
					// text_editor.save()

				// remove the modal
					modal.remove()
			})

	// save editor changes to prevent conflicts with modal components changes
		// text_editor.save()

	// modal. Create a standard modal with the note information
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: footer
			// size	: 'small' // string size big|normal
		})
		// when the modal is closed the section instance of the note need to be destroyed with all events and components
		// (!) The temporal component holds Session-side state on the server. It must be
		// explicitly reset (value → null) and then destroyed so the Session entry is
		// cleared and the instance is removed from the instance registry. Failure to do
		// so would leak the temporal component across navigation events.
		modal.on_close = async () => {

			if( reference_component.data.entries){
				// change data to set empty value in the component (it saved in Session instead DDBB)
					const changed_data = [Object.freeze({
						action	: 'set_data',
						id		: null,
						value	: null
					})]

				// fix instance changed_data
					await reference_component.change_value({
						changed_data	: changed_data,
						refresh			: false
					})
				// destroy all of the component, it and his own subcontext instances
					reference_component.destroy(true,true,true)
			}
		}


	return true
}//end render_note



// @license-end
