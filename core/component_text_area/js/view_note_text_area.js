// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from '../../common/js/instances.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'



/**
* VIEW_NOTE_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_note_text_area = function() {

	return true
}//end view_note_text_area



/**
* RENDER
* Render node to be used by service autocomplete or any datalist
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_note_text_area.render = async function(self, options) {

	// short vars
		const data					= self.data
		const value					= data.value || []
		const matrix_id				= data.matrix_id
		const parent_section_tipo	= data.parent_section_tipo || self.section_tipo

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`
		})

	// image_note
		const css = value.length===0 ? '' : ' green'
		const image_note = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button note' + css,
			title			: 'matrix_id: ' + matrix_id,
			parent			: wrapper
		})
		// click event handler
		const click_handler = async (e) => {
			e.stopPropagation()

			// validating note creation
				// created_by_userID: component text area note creation if is already created
				const created_by_userID	= self.data.created_by_userID
				// user_id: current logged user
				const user_id			= page_globals.user_id
				// tm_user_id: column userID from time machine record
				const tm_user_id		= parseInt(self.data.tm_user_id)

				// If a note does not yet exist, one will be created, but only the user who
				// made the change will be able to create it.
				if (!created_by_userID && user_id!==tm_user_id) {
					alert(get_label.not_allow_to_create_note || 'Cannot create notes of a change that is not yours')
					console.error('Access prohibited. This note is not yours');
					return
				}

			// loading
				wrapper.classList.add('loading')

			// refresh service. Only refresh if a new history note record needs to be created
				const refresh_service = self.data.parent_section_id ? false : true

			// parent_section_id. Get existing or create a new one
				const parent_section_id	= self.data.parent_section_id
					? self.data.parent_section_id
					: await self.add_component_history_note({
						notes_section_tipo	: parent_section_tipo,
						matrix_id			: matrix_id
					})

			// error creating parent_section_id check
				if (!parent_section_id) {
					console.error('Invalid parent_section_id!', self);
					// loading
					wrapper.classList.remove('loading')
					return
				}

			// force to refresh this component caller (service time machine) (new note is created)
				if (refresh_service) {
					const service_time_machine = self.caller.caller
					await service_time_machine.refresh(true)
				}

			// modal creation

			// content. Modal content node
				const content = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'content_no_buttons'
				})

			// footer. Modal footer node
				const footer = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'footer content distribute'
				})

				// button_delete
					const button_delete = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'danger delete hide',
						inner_html		: get_label.delete || 'Delete',
						parent			: footer
					})
					// click event
					const click_delete_handler = async (e) => {
						e.stopPropagation()

						if (!confirm(get_label.sure || 'Sure?')) {
							return
						}

						// delete notes record
						const rqo = {
							action	: 'delete',
							source	: {
								delete_mode		:'delete_record',
								tipo			: parent_section_tipo,
								section_tipo	: parent_section_tipo,
								section_id		: parent_section_id
							}
						}
						const api_response = await data_manager.request({
							body : rqo
						})
						if (!api_response.result || api_response.result.length<1) {
							console.error('Error on delete matrix note record. api_response:', api_response);
							return null
						}

						modal_container.close()
					}
					button_delete.addEventListener('click', click_delete_handler)

				// button_ok
					const button_ok = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'success hide',
						inner_html		: 'OK',
						parent			: footer
					})
					// click event
					const click_ok_handler = (e) => {
						e.stopPropagation()

						modal_container.close()
					}
					button_ok.addEventListener('click', click_ok_handler)

			// modal. create new modal
				const modal_container = ui.attach_to_modal({
					header		: `Note ${parent_section_tipo}-${parent_section_id} TM: ${matrix_id}`,
					body		: content,
					footer		: footer,
					on_close	: () => {
						// service_time_machine refresh, forces to update tag color (green|grey)
						self.caller.caller.refresh()
					}
				})

			// create and load a component_text_area gracefully
				const node = await ui.load_item_with_spinner({
					container			: content,
					preserve_content	: false,
					label				: self.tipo,
					callback			: async () => {

						// component. Create a component_text_area in edit mode
						const options = {
							model				: self.model,
							tipo				: self.tipo,
							section_tipo		: parent_section_tipo,
							section_id			: parent_section_id,
							mode				: 'edit',
							view				: 'default',
							lang				: self.lang,
							auto_init_editor	: true,
							caller				: self
						}
						const component = await get_instance(options)

						await component.build(true)
						// force to remove buttons
						component.show_interface.tools = false
						// render component
						component.auto_init_editor = true
						const node = await component.render()

						// if user has enough permissions, activate buttons
						const permissions = component.permissions || 1
						if (permissions>1) {
							[button_delete,button_ok].map(el => el.classList.remove('hide'))
						}

						// activate
						ui.component.activate(component)

						// event subscription. Focus editor when ready
						const editor_ready_handler = (service_text_editor) => {
							// force focus component editor
							service_text_editor.editor.editing.view.focus()
						}
						self.events_tokens.push(
							event_manager.subscribe('editor_ready_' + component.id,	editor_ready_handler)
						)

						return node
					}
				})

				// user_name_info. Append user name (change owner) before the component
					// user_instance: contains the resolved user name (from section record)
					const section_record	= self.caller
					const user_instance		= section_record.ar_instances.find(el => el.tipo==='dd543')
					if (user_instance) {
						// user_name_info
						const user_name_info = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'user_name_info block',
							inner_html		: (get_label.created || 'Created') +' '+ (get_label.by_user || 'By user') + ': ',
							parent			: content
						})
						user_name_info.appendChild( user_instance.node.cloneNode(true) )
					}else{
						// If refresh_service is false, the section_id is not new and the section_record
						// must to contains the component 'dd543'
						if (!refresh_service) {
							console.error('Unable to get user instance (dd543) from section_record:', section_record);
						}
					}

				// append component at end
				content.appendChild(node)

			// loading
				wrapper.classList.remove('loading')
		}
		image_note.addEventListener('click', click_handler)


	return wrapper
}//end render



// @license-end
