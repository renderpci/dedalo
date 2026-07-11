// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance, find_instances} from '../../common/js/instances.js'
	import {clone} from '../../common/js/utils/index.js'
	import {render_layer_selector} from './render_edit_component_text_area.js'



/**
* RENDER_DRAW
* Opens a modal dialog that allows the user to assign or reassign a thesaurus
* locator to an existing 'draw' tag embedded in a component_text_area rich-text
* field, and to select the image layer that the drawing should be linked to.
*
* Flow overview:
*  1. Resolve the sibling component_tags_draw instance (persisted locators).
*  2. Determine the current locator already stored for the clicked tag (if any),
*     and collect all previously used locators in this record for the "Reuse tag"
*     shortcut panel.
*  3. Instantiate a temporary reference portal component (portal-style autocomplete
*     that searches the thesaurus) so the user can pick a new target concept.
*  4. Build a three-section modal:
*       - Header  : tag id + layer id derived from view_tag.label.
*       - Body    : (a) new-tag search portal, (b) reuse-from-history list,
*                   (c) layer selector (delegates to render_layer_selector).
*       - Footer  : "Delete" (unlinks the locator) and "Apply" (saves the locator).
*  5. On "Apply" the chosen locator is injected into component_tags_draw via
*     add_value(), the editor tag is re-created with the new layer, and the modal
*     is closed.
*  6. On modal close, the temporary reference component is cleared and destroyed
*     so it does not pollute the instance registry.
*
* Ontology prerequisites:
*  - The text_area section must have a tags_draw component configured
*    (see rsc30, rsc1368).
*  - context.features must expose references_section_tipo,
*    references_component_tipo, and references_component_model pointing to a
*    portal-type component capable of thesaurus lookup.
*
* Called from view_default_edit_text_area when the user clicks "button_draw"
* on an already-selected draw tag in the CKEditor toolbar.
*
* @param {Object} options
* @param {Object} options.self         - The component_text_area instance that owns the tag.
* @param {Object} options.text_editor  - The active service_ckeditor instance.
* @param {number} options.i            - Index of the active editor within the component
*                                        (used to scope the editor to the right input).
* @param {Object} options.tag          - The view-tag object for the draw tag being edited.
*                                        Shape: { tag_id, tag_type:'draw', label, state, layers, … }
* @returns {Promise<boolean>} Resolves to true on success, false when prerequisites
*                             are missing (no tags_draw component, no permissions).
*/
export const render_draw = async function(options) {

	// options
		const self			= options.self
		const text_editor	= options.text_editor
		const i				= options.i
		const view_tag		= options.tag
		const tags_draw		= self.properties.tags_draw // the component with all locators of draw tags
		const selected_tag	= clone(options.tag)
			selected_tag.reuse = false

	// component with the tag data
	// Locate the already-rendered sibling component_tags_draw for this section/record.
	// This component stores all draw-tag locators for the current record and is
	// responsible for persisting add/unlink operations to the server.
		const tag_component_options = {
			tipo			: tags_draw.tipo,
			section_tipo	: self.section_tipo,
			section_id		: self.section_id,
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan
		}
		// get the reference component instance
		const found_instances		= find_instances(tag_component_options)
		const component_tags_draw	= found_instances.length > 0
			? found_instances[0]
			: null

		if(!component_tags_draw){
			console.error("Error! misconfigured text area with draw, the tags draw component is not available, create new one in the ontology, see rsc30 and rsc1368");
			return false
		}

		// found_tag_data: the datum entry whose tipo/section matches this component,
		// giving access to the full entries array of stored draw locators for the record.
		const found_tag_data = component_tags_draw.datum.data.find(el =>
			el.tipo===component_tags_draw.tipo &&
			el.section_tipo===component_tags_draw.section_tipo &&
			el.section_id==component_tags_draw.section_id)

		// all_tag_data: flat array of every draw-tag locator entry stored for this record;
		// used to build the "Reuse tag" list of previously used concepts.
		const all_tag_data = found_tag_data && found_tag_data.entries
			? found_tag_data.entries
			: []

		// ar_tags_values: the component's current live data entries (may differ from
		// datum if unsaved changes are pending in the session).
		const ar_tags_values = component_tags_draw.data.entries

		// locator: the existing stored locator(s) for the specific tag_id the user clicked.
		// An empty array means the tag has no linked concept yet; null means no data at all.
		const locator = (ar_tags_values)
			? ar_tags_values.filter(el => el.tag_id === view_tag.tag_id && el.tag_type === 'draw')
			: null

		// Build existing_values: deduplicated list of previously used locators across all
		// draw tags in this record, enriched with fallback_value for display.
		// Iterating in reverse so the most-recently added entries appear first.
		const existing_values = []
		for (let i = all_tag_data.length - 1; i >= 0; i--) {
			const current_locator = all_tag_data[i]

			// Look up the matching datum entry to get fallback_value (human-readable label).
			// The match is on from_component_tipo + section_tipo + section_id because a
			// locator entry may point to the same concept from different contexts.
			const found = component_tags_draw.datum.data.find(el =>
				el.from_component_tipo === current_locator.from_component_tipo &&
				el.section_tipo === current_locator.section_tipo &&
				el.section_id === current_locator.section_id
			)

			if(found){
				const used_locator = clone(current_locator)
				used_locator.fallback_value = found.fallback_value
				existing_values.push(used_locator)
			}
		}

	// get the reference portal
	// used as temporal portal to search into thesaurus and get the locator to be assigned to the tag
		const references_section_tipo		= self.context.features.references_section_tipo // the section with a empty autocomplete to be use to search
		const references_component_tipo		= self.context.features.references_component_tipo // empty autocomplete to be use to search
		const references_component_model	= self.context.features.references_component_model

	// reference_component
	// A transient (is_temporal: true) portal component is spun up so the user can
	// search and select a thesaurus concept without creating a persistent record.
	// section_id is forced to 1 as a placeholder — no real section backs this instance.
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
			if(reference_component.permissions<1){
				const label = get_label.no_access  || 'No access here'

				// modal
				// (!) The modal variable assigned here is intentionally unused after this
				// early-return path; it is created solely to display the warning to the user.
				const modal = ui.attach_to_modal({
					header	: get_label.warning || 'Warning',
					body	: label+': '+ reference_component.label,
					footer	: false,
					size	: 'small' // string size big|normal
				})
				return false
			}
			// force to prevent to show tool buttons
			// Tool buttons (save, restore, etc.) must not appear inside the modal panel
			// because the component is transient and saves are managed by component_tags_draw.
			reference_component.show_interface.tools = false

			const reference_component_node = await reference_component.render()

		// save_animation
		// Suppress the spinning save animation — saves are deferred to the modal's Apply action.
			reference_component.show_interface.save_animation = false

		// change data to set empty value in the component (it saved in Session instead DDBB)
		// Pre-populate the reference component with the existing locator for this tag so the
		// user sees the currently linked concept; value is null when no locator exists yet.
			const changed_data = [Object.freeze({
				action	: 'set_data',
				value	: locator || null
			})]

		// fix instance changed_data
		// Trigger build_autoload so dependent sub-components (autocomplete dropdown, etc.) refresh.
			await reference_component.change_value({
				changed_data	: changed_data,
				refresh			: true,
				build_autoload 	: true
			})

	// header
	// The modal header identifies the tag by its numeric id and the linked image layer id.
	// view_tag.label encodes both as "tagId:layerId" (colon-separated), so we split it
	// to present them in a friendlier format.
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		// header_label. created label with Title case (first letter to uppercase)
			const ar_info_label = view_tag.label.split(':')
			const header_label = `${get_label.tag || 'Tag'} id: ${ar_info_label[0]} | ${get_label.layer || 'Layer'} id: ${ar_info_label[1]} `
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				inner_html		: header_label,
				parent			: header
			})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body content fill_vertical text_area_draw_selector'
		})
	// new tag
	// Upper section: renders the transient reference portal so the user can search
	// for a new concept to link to this draw tag.
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
	// Lower section: lists concepts already linked to other draw tags in this record,
	// letting the user pick one without re-searching the thesaurus.
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
			// ar_existing_value_node: tracks rendered span nodes so the mutual-exclusion
			// logic (only one reuse item selected at a time) can clear sibling .selected_tag.
			const ar_existing_value_node = []
			for (let i = 0; i < existing_values.length; i++) {

				const current_value = existing_values[i]

				// Deduplicate by section_tipo + section_id so that the same concept linked
				// from multiple tags appears only once in the reuse list.
				const same_previous = ar_existing_value_node.find(el =>
					parseInt(el.data.section_id) === parseInt(current_value.section_id) &&
					el.data.section_tipo === current_value.section_tipo
				)

				if(same_previous){
					continue
				}

				const existing_value_node = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'value',
					inner_html		: current_value.fallback_value.join(' | '),
					parent			: existing_tags_container
				})
				// existing_value_node.data = current_value
				// Attach the locator data directly to the DOM node so the Apply handler
				// can read it without an additional lookup.
				existing_value_node.data = current_value
				existing_value_node.activated = false
				existing_value_node.key = i
				ar_existing_value_node.push(existing_value_node)
				existing_value_node.addEventListener("mouseup", function(e) {
					e.stopPropagation()
					// remove all selected node classes when user click in one of them
					// Deselect every other node before toggling the clicked one so the
					// selection is always exclusive (radio-button semantics).
					for (let i = ar_existing_value_node.length - 1; i >= 0; i--) {
						if(ar_existing_value_node[i].key !== existing_value_node.key){
							ar_existing_value_node[i].classList.remove('selected_tag')
							ar_existing_value_node[i].activated = false
						}
					}
					if(existing_value_node.activated){
						// Second click on an already-selected node: deselect it and revert
						// selected_tag.reuse to false so Apply falls back to the search portal.
						existing_value_node.activated = false
						existing_value_node.classList.remove('selected_tag')
						selected_tag.reuse = false
					}else{
						// First click: activate this node and store its locator in selected_tag
						// so the Apply handler knows which concept to persist.
						existing_value_node.activated = true
						existing_value_node.classList.add('selected_tag')
						selected_tag.reuse = true
						selected_tag.data = current_value
					}
				})
			}

	// assign layer to tag
	// set_layer_selected is the callback passed to render_layer_selector. It is invoked
	// when the user confirms a layer choice in the layer panel.
	// It deletes the existing editor tag (to replace it) and then calls create_draw_tag
	// to insert a new one with the updated layer, then closes the modal.
		const set_layer_selected = function(options){
				// Remove the old draw tag from the editor before re-inserting with the new layer.
				// The Promise chain ensures the tag is fully removed before create_draw_tag fires.
				text_editor.delete_tag(options.data_tag).then(function(response){
					if(response){
						// Transition state to 'n' (normal) before re-creating, clearing any
						// transient edit states the tag may have carried.
						options.data_tag.state = 'n'
						self.create_draw_tag(options)
					}
				})
			// remove the modal
				modal.remove()
		}

		const layer_selector_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'layer_selector_container',
			parent			: body
		})
		// layer_selector_label
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'label layer_selector_label',
			inner_html		: get_label.set_img_layer || 'Set image layer',
			parent			: layer_selector_container
		})
		// layer_selector_node
		// Renders the list of image layers available in the linked image component.
		// The callback (set_layer_selected) fires when the user selects a layer.
		const layer_selector_node = render_layer_selector({
			self		: self,
			data_tag	: selected_tag,
			text_editor	: text_editor,
			callback	: set_layer_selected
		})
		if (layer_selector_node) {
			layer_selector_container.appendChild(layer_selector_node)
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
				const delete_label = get_label.are_you_sure_to_delete_refrence || 'Are you sure you want to delete this reference?'
				// if yes, delete the note section in the server
				if(window.confirm(delete_label)) {

					if(locator.length > 0){

						// if the locator is not empty, remove it of the component.
						// unlink_record signals component_tags_draw to remove the locator
						// from its entries array and persist the change to the server.
						component_tags_draw.unlink_record(locator[0]);
					}

					// remove the modal
						modal.remove()
				}
			})

		// button Apply reference
		// Persists the selected locator (from the search portal or the reuse list) to
		// component_tags_draw via add_value(), then closes the modal.
			const button_apply = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'success apply check',
				text_content	: get_label.apply || 'Apply',
				parent			: footer
			})
			button_apply.addEventListener('mouseup',function(evt) {

				// save the locator when is a new tag_id
				// if a reuse is active, the locator already exist into the portal
				// Determine the source of the locator:
				//   reuse===false → user picked via the search portal → read from reference_component.data.entries
				//   reuse===true  → user picked a previously used concept → read from selected_tag.data
				const locator = (selected_tag.reuse === false)
					? reference_component.data.entries
					: [selected_tag.data]

				if(!locator || locator.length === 0){
					// No concept selected in either the portal or the reuse list;
					// treat as an intent to remove (mimic the Delete button).
					button_remove.click()
					return
				}

				// set the tag_id and tag_type into the locator to be saved
				// Inject the current tag's identifiers into the locator before persisting,
				// so the server can correlate the locator with the correct draw tag.
				const new_locator = locator[0]
					new_locator.tag_id = view_tag.tag_id
					new_locator.tag_type = 'draw'

				// remove type from locator to be set as preferences says in server.
				// see the ontology node properties
				// (!) The 'type' property (relation type) is deliberately deleted here.
				// The server derives the correct relation type from the ontology node properties
				// of the target concept, so a client-supplied value would conflict.
				delete new_locator.type

				component_tags_draw.add_value(new_locator);

				// remove the modal
					modal.remove()
			})

	// save editor changes to prevent conflicts with modal components changes
		// text_editor.save()

	// modal. Create a standard modal with the note information
	// (!) modal must be declared after set_layer_selected and the button handlers because
	// those closures capture `modal` via the outer scope. JavaScript hoisting does not apply
	// to `const`, so any reference to `modal` inside those callbacks is only valid once the
	// declaration below is reached at runtime (the callbacks are never called before that point).
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: footer
			// size	: 'small' // string size big|normal
		})
		// when the modal is closed the section instance of the note need to be destroyed with all events and components
		// Clean up the transient reference component when the modal is dismissed without
		// pressing Apply — clear its value first so no stale locator remains in the session,
		// then fully destroy the instance (and its sub-context children) to free memory and
		// avoid stale entries in the instance registry.
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
}//end render_draw



// @license-end
