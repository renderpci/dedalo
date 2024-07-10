// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'



/**
* RENDER_REFERENCE
*
* @param object options
* @return HTMLElement fragment
*/
export const render_reference = async function(options) {

	// options
		const self				= options.self
		const text_editor		= options.text_editor
		const i					= options.i
		const view_tag			= options.tag
		const tags_reference	= options.tags_reference // the component with all locator references

	// short vars
		// const data_string		= view_tag.data
		const reference_element = text_editor.get_selected_reference_element()

		const data_string = (reference_element)
			? reference_element.data
			: ''

		// convert the data_tag form string to json*-
		// replace the ' to " stored in the html data to JSON "
		const data		= data_string.replace(/\'/g, '"')
		const locator	= data && data.length > 0
			? JSON.parse(data)
			: null

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
			const reference_component = await instances.get_instance(instance_options)
										await reference_component.build(true)
			if(reference_component.permissions<1){
				const label = get_label.no_access  || 'No access here'

				// modal
				const modal = ui.attach_to_modal({
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
			class_name		: 'body content fill_vertical'
		})
		body.appendChild(reference_component_node)

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
			button_apply.addEventListener('mouseup',function(evt) {
				const new_locator = reference_component.data.value

				if(!new_locator){
					button_remove.click()
					return
				}
				// get the data from the new locator
				const locator_data = new_locator
				 	? reference_component.datum.data.find(el =>
				 		el.from_component_tipo === new_locator[0].from_component_tipo
						&& el.section_id	=== new_locator[0].section_id
						&& el.section_tipo	=== new_locator[0].section_tipo
				 		)
				 	: null
				 // is possible that user don't select any text (collapse selection), in those cases it will insert a text value of the locator or empty text.
				 // get the resolution of the new locator with the value_fallback (ensure text value if it's not translated)
				 // if the locator data is not set, empty space is used to create the text for the collapse selection
				 const locator_text_value = locator_data
				 	? locator_data.fallback_value[0]
				 	: ' '

				// create the new tag for the reference, it's necessary to change the referenceIn tag only
					const tag_type		='reference'

				const reference_tag = {
					type	: tag_type,
					label	: view_tag.label,
					tag_id	: view_tag.tag_id,
					state	: view_tag.state,
					data	: new_locator // object format
				}
				const tag = self.build_view_tag_obj(reference_tag, reference_tag.tag_id)
				const reference_obj = {
					locator 			: new_locator,
					locator_text_value	: locator_text_value,
					new_data_obj		: tag
				}

				text_editor.set_reference(reference_obj)

				// text_area. Prepare the text_editor to save setting it in dirty mode and save the change
					text_editor.set_dirty(true)
					// text_editor.save()

				// remove the modal
					modal.remove()

				// text_editor.update_tag({
				// 	type			: tag_type,
				// 	tag_id			: view_tag.tag_id,
				// 	new_data_obj	: reference_tag
				// })
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
