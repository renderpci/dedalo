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
			// data_limit. Only one locator is allowed by reference tag (instance only, the ontology node is shared)
			reference_component.context.properties = Object.assign({}, reference_component.context.properties, {data_limit : 1})
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
					// tag_id is added to differentiate the same term used by several tags
					inner_html		: current_value.fallback_value.join(' | ') + ' [' + current_value.tag_id + ']',
					parent			: existing_tags_container
				})
				existing_value_node.data = current_value

				existing_value_node.activated = false
				existing_value_node.key = i
				ar_existing_value_node.push(existing_value_node)
				existing_value_node.addEventListener("mouseup", async function(e) {
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
					// temporal portal. Show the reused term (or the original value on deselect) for clarity
					const reused_locator = clone(existing_value_node.data)
					delete reused_locator.fallback_value
					const temp_value = existing_value_node.activated
						? [reused_locator]
						: (locator || null)
					await reference_component.change_value({
						changed_data	: [Object.freeze({
							action	: 'set_data',
							value	: temp_value
						})],
						refresh			: true,
						build_autoload	: true
					})
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

					// remove the reference attribute of the text selected in the component_text_area
						text_editor.remove_reference()

					// remove all locators of the tag from the component (don't wait)
					// only when the tag is not used in other text fragments (reused tag)
					// (!) always removed in server because the client data could be paginated or filtered by other tag
						if (!is_tag_used(text_editor, view_tag.tag_id)) {
							remove_tag_locators(component_tags_reference, view_tag.tag_id)
						}

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

				// reuse check. The user could change the temporal portal value after select a reuse tag
				// in this case, the reuse is discarded and the temporal portal value is used as new tag value
				if (selected_tag.reuse===true) {
					const temp_value	= reference_component.data.value || []
					const reused_data	= existing_values.find(el => el.tag_id===selected_tag.tag_id)
					const is_reused		= reused_data && temp_value.length===1
						&& temp_value[0].section_tipo===reused_data.section_tipo
						&& temp_value[0].section_id==reused_data.section_id
					if (!is_reused) {
						selected_tag.tag_id	= view_tag.tag_id
						selected_tag.reuse	= false
					}
				}

				// save the locator when is a new tag_id
				// if a reuse is active, the locator already exist into the portal
				if(selected_tag.reuse === false){

					const temp_value = reference_component.data.value

					if(!temp_value || temp_value.length === 0){
						button_remove.click()
						return
					}

					// set the tag_id and tag_type into the locator to be saved
					// (cloned to preserve the temporal portal value on errors)
					const new_locator = clone(temp_value[0])
						new_locator.tag_id = view_tag.tag_id
						new_locator.tag_type = 'reference'

					// remove type from locator to be set as preferences says in server.
					// see the ontology node properties
					delete new_locator.type

					// unchanged. The tag already has this unique locator
					const unchanged = locator && locator.length===1
						&& locator[0].section_tipo===new_locator.section_tipo
						&& locator[0].section_id==new_locator.section_id
					if (!unchanged) {
						// replace previous tag locators (only one locator is allowed by tag)
						// (!) always removed in server because the client data could be paginated or filtered by other tag
						const removed = await remove_tag_locators(component_tags_reference, view_tag.tag_id)
						const added = removed
							? await component_tags_reference.add_value(new_locator)
							: false
						if (!added) {
							// restore previous tag locators (best effort, only the loaded ones are available)
							// to prevent to leave the current tag without locator if the user closes the modal
							if (removed && locator && locator.length > 0) {
								for (const old_locator of locator) {
									const restore_locator = clone(old_locator)
									delete restore_locator.paginated_key
									await component_tags_reference.add_value(restore_locator)
								}
							}
							// prevent to create a tag without locator. Modal stays open to allow retry
							console.error('Error adding reference locator:', new_locator);
							alert(get_label.error_on_save || 'Error on save the reference. Please try again');
							return
						}
					}

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
					// reuse case. Label is set as the reused tag to keep tag_id and label coherent
					label	: selected_tag.reuse===true
						? 'reference ' + selected_tag.tag_id
						: selected_tag.label,
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

				// reuse case. Remove the original tag locators to prevent orphan values
				// only when the original tag is not used in other text fragments (reused tag)
				// (!) always removed in server because the client data could be paginated or filtered by other tag
					if (selected_tag.tag_id!==view_tag.tag_id && !is_tag_used(text_editor, view_tag.tag_id)) {
						await remove_tag_locators(component_tags_reference, view_tag.tag_id)
					}

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



/**
* IS_TAG_USED
* Checks if any text fragment of the editor has a reference tag with given tag_id
* (a tag could be used by several fragments when it is reused)
* (!) Only the current editor (lang and value key) is checked. Other langs of the text
* could use the same tag_id because the tags component is not translatable (nolan)
* @param object text_editor
* @param string tag_id
* @return bool
*/
const is_tag_used = function(text_editor, tag_id) {

	const model	= text_editor.editor.model
	const range	= model.createRangeIn( model.document.getRoot() )

	for (const value of range.getWalker({ ignoreElementEnd: true })) {
		const reference = value.item.getAttribute('reference')
		if (reference && reference.tag_id==tag_id) {
			return true
		}
	}

	return false
}//end is_tag_used



/**
* REMOVE_TAG_LOCATORS
* Removes all reference locators of given tag_id from the tags component (saved in server)
* and refresh the component to sync the client data
* @param object component_tags_reference
* @param string tag_id
* @return bool
*/
const remove_tag_locators = async function(component_tags_reference, tag_id) {

	// delete_locator. Removes all locators matching tag_id and tag_type
		const api_response = await component_tags_reference.delete_locator(
			{
				tag_id		: tag_id,
				tag_type	: 'reference'
			},
			['tag_id','tag_type']
		)
		if (!api_response || api_response.result===false) {
			console.error('Error on remove tag locators:', api_response);
			return false
		}

	// refresh to get the real data
		await component_tags_reference.refresh({
			build_autoload : true
		})

	// check if the component has active a tag_id filter
		if(component_tags_reference.active_tag){
			await component_tags_reference.filter_data_by_tag_id(component_tags_reference.active_tag)
		}


	return true
}//end remove_tag_locators



// @license-end
