// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance, find_instances} from '../../common/js/instances.js'
	import {clone} from '../../common/js/utils/index.js'



/**
* RENDER_REFERENCE
*
* @param object options
* @return bool
* 	True if all is alright, false on missing vars or problems
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

		if(!component_tags_reference){
			console.error("Error! misconfigured text area with references, the tags reference component is not available, create new one in the ontology, see rsc36 and rsc1368");
			return false
		}

		const found_tag_data = component_tags_reference.datum.data.find(el =>
			el.tipo===component_tags_reference.tipo &&
			el.section_tipo===component_tags_reference.section_tipo &&
			el.section_id==component_tags_reference.section_id)

		const all_tag_data = found_tag_data && found_tag_data.value
			? found_tag_data.value
			: []

		const ar_tags_values = component_tags_reference.data.value

		const locator = (ar_tags_values)
			? ar_tags_values.filter(el => el.tag_id === view_tag.tag_id && el.tag_type === 'reference')
			: null

		const existing_values = []
		for (let i = all_tag_data.length - 1; i >= 0; i--) {
			const current_locator = all_tag_data[i]

			const found = component_tags_reference.datum.data.find(el =>
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
		const instance_options = {
			model			: references_component_model,
			tipo			: references_component_tipo,
			section_tipo	: references_section_tipo,
			section_id		: 'tmp',
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan,
			caller			: self
		}
		// get the instance, built and render
			const reference_component = await get_instance(instance_options)
										await reference_component.build(true)

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
			const changed_data = [Object.freeze({
				action	: 'set_data',
				value	: locator || null
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
			const ar_existing_value_node =[]
			for (let i = 0; i < existing_values.length; i++) {

				const current_value = existing_values[i]
				const existing_value_node = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'value',
					inner_html		: current_value.fallback_value.join(' | '),
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
						existing_value_node.activated = false
						existing_value_node.classList.remove('selected_tag')
						// reset the selected tag_id with the original tag_id
						selected_tag.tag_id = view_tag.tag_id
						selected_tag.reuse = false
						selected_tag.fallback_value = null
					}else{
						existing_value_node.activated = true
						existing_value_node.classList.add('selected_tag')
						// set the selected tag_id with the selection
						selected_tag.tag_id = existing_value_node.data.tag_id
						selected_tag.reuse = true
						selected_tag.fallback_value = existing_value_node.data.fallback_value.join(' | ')
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
				const delete_label = get_label.are_you_sure_to_delete_refrence || 'Are you sure you want to delete this reference?'
				// if yes, delete the note section in the server
				if(window.confirm(delete_label)) {

					if(locator.length > 0){

						// if the locator is not empty, remove it of the component.
						component_tags_reference.unlink_record({
							paginated_key	: locator[0].paginated_key,
							row_key			: null,
							section_id		: locator[0].section_id
						});
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
			button_apply.addEventListener('mouseup',function(e) {

				// save the locator when is a new tag_id
				// if a reuse is active, the locator already exist into the portal
				if(selected_tag.reuse === false){

					const locator = reference_component.data.value

					if(!locator || locator.length === 0){
						button_remove.click()
						return
					}

					// set the tag_id and tag_type into the locator to be saved
					const new_locator = locator[0]
						new_locator.tag_id = view_tag.tag_id
						new_locator.tag_type = 'reference'

					// remove type from locator to be set as preferences says in server.
					// see the ontology node properties
					delete new_locator.type

					component_tags_reference.add_value(new_locator);

					// get the data from the new locator
					const locator_data = new_locator
					 	? reference_component.datum.data.find(el =>
					 		// el.from_component_tipo === new_locator.from_component_tipo &&
							el.section_id	=== new_locator.section_id &&
 							el.section_tipo	=== new_locator.section_tipo
					 	  )
					 	: null

					 // is possible that user don't select any text (collapse selection), in those cases it will insert a text value of the locator or empty text.
					 // get the resolution of the new locator with the value_fallback (ensure text value if it's not translated)
					 // if the locator data is not set, empty space is used to create the text for the collapse selection
					 selected_tag.fallback_value  = locator_data
					 	? locator_data.fallback_value.join(' | ')
					 	: ' '
				 }

				// create the new tag for the reference, it's necessary to change the referenceIn tag only
					const tag_type		='reference'

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
		modal.on_close = async () => {

			if( reference_component.data.value){
				// change data to set empty value in the component (it saved in Session instead DDBB)
					const changed_data = [Object.freeze({
						action	: 'set_data',
						key		: 0,
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
