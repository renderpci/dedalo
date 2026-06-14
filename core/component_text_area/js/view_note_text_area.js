// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* VIEW_NOTE_TEXT_AREA
* Time-machine note view module for component_text_area.
*
* Renders a single small icon button ('note') inside a list/tm row. Clicking the
* button opens a modal that lets the time-machine record's original author annotate
* the change by creating (or editing) a linked history-note section record. The icon
* turns green when at least one annotation entry already exists.
*
* Caller chain expected by this view:
*   self          — component_text_area instance rendered in 'tm'/'list' mode with view 'note'
*   self.caller   — the section_record (or section) row that holds this component; its
*                   .locator.user_id identifies the change owner and its .ar_instances
*                   array contains the resolved 'dd578' (who/author) component
*   self.caller.caller — the service_time_machine (or list container) that owns the row,
*                        whose .refresh() method is invoked on modal close to update the
*                        icon colour without reloading the full page
*
* Main export:
*   view_note_text_area         — constructor shell (no own state; used as a namespace)
*   view_note_text_area.render  — async factory that builds the wrapper + icon + click handler
*/

// imports
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from '../../common/js/instances.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'



/**
* VIEW_NOTE_TEXT_AREA
* Constructor shell. No instance state is initialised here; all logic lives on the
* static render method. This pattern is used uniformly across Dédalo view modules so
* that the export can be imported as a namespace and called via
* view_note_text_area.render(self, options).
*/
export const view_note_text_area = function() {

	return true
}//end view_note_text_area



/**
* RENDER
* Build the wrapper node containing the note icon button used in time-machine list rows.
*
* The note icon is coloured green when data.entries is non-empty (existing annotations)
* and grey otherwise (no annotation yet). Clicking the icon:
*   1. Guards creation: only the user who authored the change (identified by
*      self.caller.locator.user_id) may create a new note section; others are blocked
*      with an alert.
*   2. Lazily creates a notes section record via self.add_component_history_note() when
*      data.parent_section_id is absent; skips creation when the record already exists.
*   3. Opens a modal that contains:
*      - An inner component_text_area in 'edit' mode bound to the notes section record.
*      - A 'Delete' button (shown only when permissions > 1) that removes the notes
*        record from the server and closes the modal.
*      - An 'OK' button (same permission gate) that simply closes the modal.
*      - A user-name info block prepended above the editor, sourced from the 'dd578'
*        (author) component instance on the parent section_record.
*   4. On modal close, calls self.caller.caller.refresh() to propagate the colour change
*      (green/grey) without a full page reload.
*
* Data contract (self.data):
*   entries              {Array}  — existing annotation value items; non-empty → green icon
*   matrix_id            {number} — the time-machine matrix row id used as the code
*                                   value when creating a new notes section record
*   parent_section_tipo  {string} — tipo of the notes section type (ontology code);
*                                   falls back to self.section_tipo when absent
*   parent_section_id    {string|number|null} — id of an already-created notes section
*                                               record, or null/absent when not yet created
*   created_by_user_id   {number|null} — user id that originally created this notes record;
*                                        null/falsy means no note exists yet
*
* (!) self.caller.locator.user_id is read as an integer via parseInt(). If the caller chain
*     does not include a locator property (e.g. view used outside a time-machine context)
*     this will produce NaN and the ownership check will always fail, silently blocking note
*     creation. No null-guard is present in this code — document only, do not fix.
*
* (!) alert() is used for the ownership error instead of the standard notification system.
*     This is intentional legacy behaviour: alert() blocks until dismissed, preventing any
*     accidental downstream actions in the same click handler.
*
* @param {Object} self    - component_text_area instance (view 'note', mode 'tm' or 'list')
* @param {Object} options - render options (currently unused but forwarded for signature parity)
* @returns {Promise<HTMLElement>} wrapper div containing the note icon button
*/
view_note_text_area.render = async function(self, options) {

	// short vars
		const data					= self.data
		const entries				= data.entries || []
		const matrix_id				= data.matrix_id
		const parent_section_tipo	= data.parent_section_tipo || self.section_tipo

	// wrapper
		const wrapper = ui.create_dom_element({
			element_type	: 'div',
			class_name		: `wrapper_component ${self.model} ${self.mode} view_${self.view}`
		})

	// image_note
		// Apply 'green' CSS class when there are existing annotation entries to signal
		// visually that this TM row already has a note.
		const css = entries.length===0 ? '' : ' green'
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
				// created_by_user_id: component text area note creation if is already created
				const created_by_user_id = self.data.created_by_user_id
				// user_id: current logged user
				const user_id			= page_globals.user_id
				// tm_user_id: column userID from time machine record
				const tm_user_id		= parseInt(self.caller.locator.user_id)

				// If a note does not yet exist, one will be created, but only the user who
				// made the change will be able to create it.
				if (!created_by_user_id && user_id!==tm_user_id) {
					alert(get_label.not_allow_to_create_note || 'Cannot create notes of a change that is not yours')
					console.error('Access prohibited. This note is not yours');
					return
				}

			// loading
				wrapper.classList.add('loading')

			// refresh service. Only refresh if a new history note record needs to be created
				// When parent_section_id already exists the row is not new, so we don't
				// need to force a service_time_machine refresh on modal close.
				const refresh_service = self.data.parent_section_id ? false : true

			// parent_section_id. Get existing or create a new one
				// Reuse the existing parent_section_id when present; otherwise call
				// add_component_history_note(), which creates a new record server-side,
				// stores the matrix_id as the notes code, and returns the new section_id.
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
						// Sends a delete_record action targeting the full notes section,
						// which cascades to all its component data server-side.
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
				// The on_close callback triggers a full section_time_machine refresh so that the
				// note icon colour (green/grey) reflects the latest saved state.
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
				// ui.load_item_with_spinner renders a spinner inside `content` while the
				// async callback runs, then replaces it with the returned node.
				const node = await ui.load_item_with_spinner({
					container			: content,
					preserve_content	: false,
					label				: self.tipo,
					callback			: async () => {

						// component. Create a component_text_area in edit mode
						// Build a fresh component_text_area instance pointing at the notes
						// section record, then render it directly into the modal body.
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
						// The tools bar is suppressed inside the modal to keep the UI minimal;
						// only the Delete/OK footer buttons are shown instead.
						component.show_interface.tools = false
						// render component
						component.auto_init_editor = true
						const node = await component.render()

						// if user has enough permissions, activate buttons
						// Permissions level 1 = read-only; > 1 means the user may write.
						const permissions = component.permissions || 1
						if (permissions>1) {
							[button_delete,button_ok].forEach(el => el.classList.remove('hide'))
						}

						// activate
						ui.component.activate(component)

						// event subscription. Focus editor when ready
						// Subscribe to the editor_ready event so that as soon as CKEditor
						// finishes initialising we move keyboard focus into the editor,
						// allowing the user to start typing immediately.
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
					// Look up the 'dd578' (who/author) component instance that the parent
					// section_record already built and rendered, then clone its node into
					// the modal header area. This avoids a separate server round-trip.
					const section_record	= self.caller

					const user_instance		= section_record.ar_instances.find(el => el.tipo==='dd578')
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
						// must to contains the component 'dd578'
						// (!) When refresh_service is false the row is not freshly created, so the
						//     section_record should have already resolved dd578. Absence here likely
						//     indicates a build ordering issue or an unexpected caller chain shape.
						if (!refresh_service) {
							console.error('Unable to get user instance (dd578) from section_record:', section_record);
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
