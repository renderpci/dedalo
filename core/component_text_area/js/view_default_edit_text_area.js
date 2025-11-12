// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_instance} from '../../common/js/instances.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {pause, url_vars_to_object} from '../../common/js/utils/index.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {LZString as lzstring} from '../../common/js/utils/lzstring.js'
	import {render_draw} from './render_draw.js'



/**
* VIEW_DEFAULT_EDIT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const view_default_edit_text_area = function() {

	return true
}//end view_default_edit_text_area



/**
* RENDER
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
view_default_edit_text_area.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'
		// fix render_level
		self.render_level = render_level

	// fix non value scenarios
		// self.data.value = (self.data && self.data.value.length>0)
		// 	? self.data.value
		// 	: [null]

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label node
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data

		// label add lang
		if (SHOW_DEVELOPER===true && self.view!=='line') {
			wrapper.label.innerHTML += ' <span class="note">[' + self.lang + ']</span>'
		}

	// label custom style based on activate/deactivate events. (!) Deactivated 11-02-2023. Moved to inspector)
		// event_manager.subscribe('activate_component', fn_activate_component)
		// function fn_activate_component(component) {
		// 	if (component.id===self.id) {
		// 		wrapper.label.classList.add('move_top')
		// 	}
		// }
		// event_manager.subscribe('deactivate_component', fn_deactivate_component)
		// function fn_deactivate_component(component) {
		// 	if (component.id===self.id) {
		// 		if(wrapper.label.classList.contains('move_top')) {
		// 			wrapper.label.classList.remove('move_top')
		// 		}
		// 	}
		// }

	// fix editor height. This guarantees that content_data grow to the maximum possible height
		// when_in_viewport(wrapper, ()=> {
		// 	const wrapper_height	= wrapper.offsetHeight
		// 	const label_height		= wrapper.label ? wrapper.label.offsetHeight : 0
		// 	wrapper.content_data.style.height = (wrapper_height - label_height) + 'px'
		// 	console.log('wrapper_height calculated but not set:', wrapper_height);
		// })


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []


	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value // is array
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			// get the content_value
			const content_value = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			// add node to content_data
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}

	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// get fallback when current_value is empty
	// clean fallback to only text
		const data					= self.data || {}
		const value					= data.value || []

		const ar_fallback_value		= data.fallback_value || []
		const fallback				= get_fallback_value(value, ar_fallback_value)
		const dirty_fallback_value	= fallback[i]

	// clean fallback of any tag
		const fallback_fragment = document.createDocumentFragment();
		const fb_content_value = ui.create_dom_element({
			element_type	: 'div',
			inner_html		: dirty_fallback_value,
			parent			: fallback_fragment
		})
		const fallback_value = fallback_fragment.firstChild.innerText;

	// value_string is a raw html without parse into nodes (txt format)
		const value_string = current_value?.value
			? self.tags_to_html(current_value.value)
			: null

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// toolbar_container
		const toolbar_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toolbar_container hide',
			parent			: content_value
		})

	// value_container
		const value_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value_container editor_container ck-content ck',
			inner_html 		: value_string,
			parent			: content_value
		})
		// placeholder_node. Create a Place placeholder if no value found
		const placeholder_node = (!value_string)
			? ui.create_dom_element({
				element_type	: 'p',
				class_name		: 'placeholder ck-placeholder',
				inner_html		: fallback_value,
				parent			: value_container
			  })
			: null

	// init_current_service_text_editor
		const init_current_service_text_editor = async function() {

			// permissions check
				if (!self.permissions || parseInt(self.permissions)<2) {
					return
				}

			// placeholder_node. Remove it from value_container
				if (placeholder_node) {
					placeholder_node.remove()
				}

			// service_editor. Fixed on init
				const current_service_text_editor = new self.service_text_editor()

			// fix service instance with current input key
				self.service_text_editor_instance[i] = current_service_text_editor

			// toolbar. create the toolbar base
				const toolbar = ['bold','italic','underline','|','undo','redo','find_and_replace','html_source','|']
				// toolbar add custum_buttons
					if(self.context.toolbar_buttons){
						toolbar.push(...self.context.toolbar_buttons)
					}
				// toolbar add standard buttons
					// toolbar.push(...['button_lang','reference','|','button_save'])
					toolbar.push(...['button_lang'])

			// editor_config
				const editor_config = {
					// plugins		: ['paste','image','print','searchreplace','code','noneditable','fullscreen'], // ,'fullscreen'
					toolbar			: toolbar, // array of strings like ['bold','italic']
					custom_buttons	: get_custom_buttons(self, current_service_text_editor, i),
					custom_events	: get_custom_events(self, i, current_service_text_editor),
					read_only		: self.show_interface.read_only || false
				}

			// init editor
				await current_service_text_editor.init({
					caller				: self,
					value_container		: value_container,
					toolbar_container	: toolbar_container,
					fallback_value		: fallback_value,
					key					: i,
					editor_config		: editor_config,
					editor_class		: self.context.view==='html_text'
						? 'InlineEditor'
						: 'ddEditor' // ddEditor | InlineEditor
				})

			// fix current_service_text_editor when is ready
				self.text_editor[i] = current_service_text_editor

			// permissions <2 turn editor read only
				// if (!self.permissions || parseInt(self.permissions)<2) {
				// 	current_service_text_editor.editor.enableReadOnlyMode(
				// 		current_service_text_editor.editor.id
				// 	)
				// }

			// event ready
				event_manager.publish(
					'editor_ready_' + self.id,
					current_service_text_editor
				)

			// tag selected case (URL) Normally from dd_grid indexation tag button
				dd_request_idle_callback(
					() => {
						const url_vars = url_vars_to_object(window.location.search)
						const raw_data = url_vars.raw_data ?? null
						if(raw_data) {

							const url_data_string	= lzstring.decompressFromEncodedURIComponent(raw_data)
							const url_data_object	= JSON.parse(url_data_string)
							const tag_id			= url_data_object.caller_options?.tag_id || null
							if(tag_id) {

								// tag. Get the tag object selecting the tag into the text_area editor (get the tag attributes)
								// needed to get the tag state, to show the tag info inside the tool_indexation
								const tag = current_service_text_editor.get_view_tag_attributes({
									type	: 'indexIn',
									tag_id	: tag_id
								})

								// fire the event to select tag
								event_manager.publish('click_tag_index_'+ self.id_base, {tag: tag})
							}
						}
					}
				)//end dd_request_idle_callback


			return current_service_text_editor
		}//end init_current_service_text_editor


	// user click in the wrapper and init the editor. When it's not read only
		if (self.show_interface.read_only!==true && self.permissions >1) {

			const auto_init_editor = self.auto_init_editor!==undefined
				? self.auto_init_editor
				: (self.render_level==='content') ? true : false
			// const auto_init_editor = true
			if (auto_init_editor===true) {

				// activate now
				value_container.classList.add('loading')
				// use timeout only to force real async execution
				dd_request_idle_callback(
					() => {
						init_current_service_text_editor()
						value_container.classList.remove('loading')
					}
				)

			}else{

				// activate on user click

				// click event
				const click_handler = function(e) {
					e.stopPropagation()

					value_container.classList.add('loading')

					// init editor on user click
					init_current_service_text_editor()
					.then(function(service_editor) {
						if (self.context.view === 'html_text') {
							service_editor.editor.focus()
							// service_editor.value_container.classList.remove('loading')
						}else{
							// trigger service_editor click action (show toolbar and focus it)
							service_editor.click(e)
						}
					})
					// once only. Remove event to prevent duplicates
					content_value.removeEventListener('mousedown', click_handler)
				}//end click_handler
				content_value.addEventListener('mousedown', click_handler)
			}
		}//end if (self.show_interface.read_only!==true)


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	// value is a raw html without parse into nodes (txt format)
		const value = self.tags_to_html(current_value.value)

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value editor_container read_only',
			inner_html		: value
		})

	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){

			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			button_fullscreen.addEventListener('click', function(e) {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			})
		}

	// save
		if (show_interface.button_save === true) {

			const save = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button tool save',
				title			: get_label.save || 'Save',
				parent			: fragment
			})
			save.addEventListener('click', fn_save)
			function fn_save(e) {
				e.stopPropagation()
				self.text_editor[0].save()
			}
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* GET_CUSTOM_BUTTONS
* @param instance self
* @param int i
*	self data element from array of values
* @return array custom_buttons
*/
const get_custom_buttons = (self, text_editor, i) => {

	// custom_buttons
	const custom_buttons = []

	// separator
		custom_buttons.push({
			name			: '|',
			manager_editor	: false,
			options	: {
				tooltip		: '',
				image		: '../../core/themes/default/icons/separator.svg',
				class_name	: 'separator',
				onclick		: null
			}
		})

	// bold
		custom_buttons.push({
			name			: "bold",
			manager_editor	: true,
			options	: {
				tooltip	: 'bold',
				image	: '../../core/themes/default/icons/bold.svg'
			}
		})

	// italic
		custom_buttons.push({
			name			: "italic",
			manager_editor	: true,
			options	: {
				tooltip	: 'italic',
				image	: '../../core/themes/default/icons/italic.svg'
			}
		})

	// underline
		custom_buttons.push({
			name			: "underline",
			manager_editor	: true,
			options	: {
				tooltip	: 'underline',
				image	: '../../core/themes/default/icons/underline.svg'
			}
		})

	// undo
		custom_buttons.push({
			name			: "undo",
			manager_editor	: true,
			options	: {
				tooltip		: 'undo',
				image		: '../../core/themes/default/icons/undo.svg',
				class_name	: 'disable'
			}
		})

	// redo
		custom_buttons.push({
			name			: "redo",
			manager_editor	: true,
			options	: {
				tooltip		: 'redo',
				image		: '../../core/themes/default/icons/redo.svg',
				class_name	: 'disable'
			}
		})

	// find_and_replace
		custom_buttons.push({
			name			: "find_and_replace",
			manager_editor	: true,
			options	: {
				tooltip	: 'find_and_replace',
				image	: '../../core/themes/default/icons/search.svg'
			}
		})

	// html_source
		custom_buttons.push({
			name			: "html_source",
			manager_editor	: true,
			options	: {
				tooltip	: 'html_source',
				image	: '../../core/themes/default/icons/html_source.svg'
			}
		})


	// button_person
		custom_buttons.push({
			name			: "button_person",
			manager_editor	: false,
			options	: {
				tooltip	: 'Show persons list',
				image	: '../../core/themes/default/icons/person.svg',
				onclick	: function(e) {
					e.stopPropagation()
					// event_manager.publish('toggle_persons_list_'+ self.id_base + '_' + i, {
					// 	caller		: self,
					// 	text_editor	: text_editor
					// })
					render_persons_list(self, text_editor, i)
				}
			}
		})

	// button_geo
		custom_buttons.push({
			name			: "button_geo",
			manager_editor	: false,
			options	: {
				tooltip	: 'Add georef',
				image	: '../../core/themes/default/icons/geo.svg',
				onclick	: function(e) {
					e.stopPropagation()
					event_manager.publish('create_geo_tag_'+ self.id_base, {
						caller		: self,
						text_editor	: text_editor
					})
				}
			}
		})

	// button_draw
		custom_buttons.push({
			name			: "button_draw",
			manager_editor	: false,
			options	: {
				tooltip	: 'Add draw_ref',
				image	: '../../core/themes/default/icons/eye.svg',
				onclick	: function(e) {
					e.stopPropagation()
					const tag_selected = text_editor.get_selected_tag()
					if(tag_selected.type === 'draw'){
						// get a default draw tag, it get the layers avalible into the image
						// to be used to create the layer selector into the draw editor.
						const default_tag = event_manager.publish('key_up_f2' +'_'+ self.id_base, 'F2')

						tag_selected.layers = default_tag[0].layers
						// open the draw modal to get the locator to be assigned
						render_draw({
							self		: self,
							text_editor	: text_editor,
							i			: i,
							tag			: tag_selected,
						})
					}else{

						event_manager.publish('build_tag_'+ self.id_base, {
							caller		: self,
							text_editor	: text_editor
						})
					}
				}
			}
		})

	// button_note
		custom_buttons.push({
			name			: "button_note",
			manager_editor	: false,
			options	: {
				tooltip	: 'Add note',
				image	: '../../core/themes/default/icons/note.svg',
				onclick	: function(e) {
					e.stopPropagation()
					event_manager.publish('create_note_tag_'+ self.id_base + '_' + i, {
						caller		: self,
						text_editor	: text_editor
					})
					// create the new tag in the server and get the new note section_id from server response
					self.create_note_tag({
						text_editor	: text_editor
					})
					.then((note_section_id)=>{
						if (note_section_id){
							// create the new locator of the new note section
							const locator = {
								section_tipo	: self.context.features.notes_section_tipo,
								section_id		: note_section_id
							};
							// create the new tag for the note
							const tag_type		='note'
							const last_tag_id	= self.get_last_tag_id(tag_type, text_editor)
							const note_number	= parseInt(last_tag_id) + 1
							const note_tag		= {
								type	: tag_type,
								label	: note_number,
								tag_id	: String(note_number),
								state	: 'a',
								data	: locator
							}
							const tag = self.build_view_tag_obj(note_tag, note_tag.tag_id)
							// insert the new note tag in the caret position of the text_editor
							text_editor.set_content(tag)
							// render and open the note section inside a modal
							render_note({
								self		: self,
								text_editor	: text_editor,
								i			: i,
								tag			: tag
							})
						}
					})
				}
			}
		})

	// button_reference
		custom_buttons.push({
			name			: "reference",
			manager_editor	: true,
			options	: {
				tooltip	: 'Add reference',
				image	: '../../core/themes/default/icons/link.svg'
			}
		})

	// button_lang
		custom_buttons.push({
			name			: 'button_lang',
			manager_editor	: false,
			options	: {
				tooltip	: 'Add lang',
				image	: '../../core/themes/default/icons/lang.svg',
				onclick	: function(e) {
					e.stopPropagation()
					// show the langs list to be selected the new lang for create the new tag
					// event_manager.publish('toggle_langs_list_'+ self.id_base + '_' + i, {
					// 	caller		: self,
					// 	text_editor	: text_editor
					// })
					render_langs_list(self, text_editor, i)
				}
			}
		})

	// button_save
		// const save_label = get_label.save.replace(/<\/?[^>]+(>|$)/g, "") || "Save"
		// custom_buttons.push({
		// 	name			: 'button_save',
		// 	manager_editor	: false,
		// 	options	: {
		// 		text	: save_label,
		// 		tooltip	: save_label,
		// 		icon	: false,
		// 		onclick	: function(e) {
		//			e.stopPropagation()
		// 			// save. text_editor save function calls current component save_value()
		// 			text_editor.save()
		// 		}
		// 	}
		// })


	return custom_buttons
}//end get_custom_buttons



/**
* GET_CUSTOM_EVENTS
* @param instance self
* @param int i
*	self data element from array of values
* @param function text_editor
*	select and return current text_editor
* @return object custom_events
*/
const get_custom_events = (self, i, text_editor) => {

	const custom_events	= {}
	const features		= self.context.features || {}

	// focus
		custom_events.focus = (evt, options) => {
			if (!self.active) {
				ui.component.activate(self)
			}
		}//end focus

	// blur
		// custom_events.blur = (evt, options) => {
		// 	// save. text_editor save function calls current component save_value()
		// 		text_editor.save()
		// }//end blur

	// click
		custom_events.click = (evt, options) => {
			// use the observe property into ontology of the components to subscribe to this events
			// img : click on img
			evt.preventDefault()
			evt.stopPropagation()

			if(options.node_name==='img' || options.node_name==='reference') {
				const tag_obj = options
				switch(tag_obj.type) {

					case 'tc':
						// Video go to timecode by tc tag
						event_manager.publish('click_tag_tc_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						break;

					case 'indexOut':
					case 'indexIn':
						// click_tag_index_
						// (!) Note publish 2 events: using 'id_base' to allow properties definition and
						// 'self.id' for specific uses like tool indexation
						// console.log("PUBLISH self.id:",self.id, self.id_base);
						event_manager.publish('click_tag_index_'+ self.id_base, {tag: tag_obj})
						break;

					case 'svg' :
						// not defined yet
						break;

					case 'draw' :
						// Load draw editor
						event_manager.publish('click_tag_draw_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						break;

					case 'geo' :
						// subscribed by component_geolocation from properties like 'numisdata264'
						event_manager.publish('click_tag_geo_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						break;

					case 'page':
						// PDF go to the specific page
						event_manager.publish('click_tag_pdf_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						break;

					case 'person': {
						// Show person info
						event_manager.publish('click_tag_person_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						// get the locator in string format
						const data_string	= tag_obj.data
						// rebuild the correct locator witht the " instead '
						const data			= data_string.replace(/\'/g, '"')
						// parse the string to object or create new one
						const locator		= JSON.parse(data) || {}
						// get the match of the locator with the tag_persons array inside the instance
						// console.log("self.data:",self.data);
						const tags_persons = self.data.tags_persons || []
						const person = tags_persons.find(el =>
							el.data.section_tipo===locator.section_tipo &&
							el.data.section_id==locator.section_id &&
							el.data.component_tipo===locator.component_tipo
						)
						// if person is available create a node with the full name of the person
						if(person) {

							// save editor changes to prevent conflicts with modal components changes
								// text_editor.save()

							// modal. create new modal with the person full name
								ui.attach_to_modal({
									header	: 'Person info',
									body	: person.full_name,
									footer	: null,
									size	: 'small'
								})
						}
						break;
					}

					case 'note':
						// Show note info
							event_manager.publish('click_tag_note_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})

						// save editor changes to prevent conflicts with modal components changes
							// text_editor.save()

						// modal tag note info
							render_note({
								self		: self,
								text_editor	: text_editor,
								i			: i,
								tag			: tag_obj
							})
						break;

					case 'lang': {
						// Show note info
						event_manager.publish('click_tag_lang_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})

						const ar_project_langs		= page_globals.dedalo_projects_default_langs
						const tag_data_lang_string	= tag_obj.data
						// rebuild the correct data with the " instead '
						const data_lang			= tag_data_lang_string.replace(/\'/g, '"')
						// parse the string to object or create new one
						const tag_data_lang		= JSON.parse(data_lang) || []
						// get the object of the lang clicked from all project_langs
						const lang_obj 			= ar_project_langs.find(el => el.value===tag_data_lang[0]) || {label: data_lang}

						// save editor changes to prevent conflicts with modal components changes
							// text_editor.save()

						// modal tag lang info
							ui.attach_to_modal({
								header	: 'Lang info',
								body	: lang_obj.label,
								footer	: null,
								size	: 'small'
							})
						break;
					}

					case 'reference':
						// Show reference info
						event_manager.publish('click_tag_reference_'+ self.id_base, {tag: tag_obj})
						break;

					default:
						// nothing to do here
						break;
				}//end switch evt.target.className
			}else{
				// click_no_tag_
				// event_manager.publish('click_no_tag_'+ self.id_base, {caller: self})
			}//end click on img
		}//end click

	// mouseup
		custom_events.MouseUp = (evt, options) => {

			// user text selection event
				const selection = options.selection
				event_manager.publish('text_selection_'+ self.id, {selection: selection, caller: self})

			// click_no_tag_ . Used by tool_indexation to de-select the active tag
				if (!evt) {
					event_manager.publish('click_no_tag_'+ self.id_base, {caller: self})
				}
		}//end MouseUp

	// keyup
		custom_events.KeyUp = (evt, options) => {

			// use the observe property into ontology of the components to subscribe to this events
			switch(true) {

				// NumpadEnter (enter key from numeric keyboard)
				case (evt.code==='NumpadEnter'):
					evt.preventDefault()
					text_editor.save()
					break;

				// 'Escape'
				case features.av_player && evt.code===features.av_player.av_play_pause_code: {
					evt.stopPropagation()
					evt.preventDefault()

					event_manager.publish('key_up_esc' +'_'+ self.id_base, features.av_player.av_rewind_seconds)
					break;
				}

				// 'F2'
				case features.av_player && evt.code===features.av_player.av_insert_tc_code: {
					evt.stopPropagation()
					evt.preventDefault()

					self.build_tag({
						caller		: self,
						text_editor	: text_editor
					})

					/*
					// publish event and receive subscription responses
					const susbscriptors_responses			= event_manager.publish('key_up_f2' +'_'+ self.id_base, evt.code)
					const susbscriptors_responses_length	= susbscriptors_responses.length

					// debug
						if(SHOW_DEBUG===true) {
							console.log("[view_default_edit_text_area.get_custom_events] susbscriptors_responses (key_up_f2):", susbscriptors_responses);
						}

					// text_editor. get editor and content data
						// const editor_content_data = text_editor.get_editor_content_data()

					// iterate subscription responses
						for (let i = 0; i < susbscriptors_responses_length; i++) {
							const data_tag	= susbscriptors_responses[i]
							const tag_id	= (!data_tag.tag_id)
								? self.get_last_tag_id(data_tag.type, text_editor) + 1
								: data_tag.tag_id;

							switch(data_tag.type) {
								case ('draw'):
									data_tag.tag_id = tag_id
									const layer_selector = render_layer_selector({
										self		: self,
										data_tag	: data_tag,
										text_editor	: text_editor,
										callback	: self.create_draw_tag.bind(self)
									})
									// append layer selector to wrapper
									self.node.appendChild(layer_selector)
									break;
								case ('geo'): {
									data_tag.tag_id = tag_id
									const layer_selector = render_layer_selector({
										self		: self,
										data_tag	: data_tag,
										text_editor	: text_editor,
										callback	: self.create_geo_tag.bind(self)
									})
									// append layer selector to wrapper
									self.node.appendChild(layer_selector)
									break;
								}
								case ('page'): {
									// modal selector
									render_page_selector(self, data_tag, tag_id, text_editor)
									break;
								}
								default: {
									const tag = self.build_view_tag_obj(data_tag, tag_id)
									text_editor.set_content(tag)
									break;
								}
							}//end switch
						}
					*/
					break;
				}

				// ctrl + 0
				case evt.ctrlKey && !evt.shiftKey && (evt.code.startsWith('Digit') || evt.code.startsWith('Numpad')): {
					evt.stopPropagation()
					evt.preventDefault()

					// resolve the key number pressed by the user, it will be the key of the person array
					const key_person_number	= evt.code.match(/\d+/g);
					// get the person with the number pressed
					const person_tag		= self.data.tags_persons[key_person_number[0]]
					event_manager.publish('key_up_persons' +'_'+ self.id_base, key_person_number)
					// get the node tag defined in the person (it's prepared in server)
					const node_tag_person	= self.build_view_tag_obj(person_tag, person_tag.tag_id)
					// set the new tag at caret position in the text.
					text_editor.set_content(node_tag_person)
					break;
				}

				// ctrl + Shift + 0
				case evt.ctrlKey && evt.shiftKey && (evt.code.startsWith('Digit') || evt.code.startsWith('Numpad')): {
					evt.stopPropagation()
					evt.preventDefault()

					// get the project langs
					const ar_project_langs	= page_globals.dedalo_projects_default_langs
					// resolve the key number pressed by user, it will match with the key of the array of languages
					const key_lang_number	= evt.code.match(/\d+/g);
					// get the lang object
					const current_lang		= ar_project_langs[key_lang_number]
					// create the new lang tag
					const tag_type			='lang'
					const last_tag_id		= self.get_last_tag_id(tag_type, text_editor)
					const lang_number		= parseInt(last_tag_id) + 1
					const lang_tag			= {
						type	: tag_type,
						label	: current_lang.value.split('-')[1],
						tag_id	: String(lang_number),
						state	: 'a',
						data	: current_lang.value
					}
					const node_tag_lang = self.build_view_tag_obj(lang_tag, lang_tag.tag_id)
					// set the new tag at caret position in the text.
					text_editor.set_content(node_tag_lang)
					break;
				}

				// Tab
				case evt.code==='Tab': {
					evt.stopPropagation()
					// prevent to jump cursor to another input
					evt.preventDefault()
					break;
				}

				// case evt.code==='Backspace' || evt.code==='Delete':
					//	console.log(options)
					//	break;
			}
		}//end KeyUp

	// changeData
		custom_events.changeData = (evt, options) => {

			const ar_changes	= options
			const changes_len	= ar_changes.length
			for (let i = changes_len - 1; i >= 0; i--) {
				const change = ar_changes[i]
				// create the event name as:
				// editor_tag_geo_change_
				// editor_tag_indexIn_change_
				const event_name = 'editor_tag_'+ change.type + '_change_' + self.id_base
				event_manager.publish(event_name, change)
			}
		}//end changeData event


	return custom_events
}//end get_custom_events



/**
* BUILD_NODE_TAG
* Create a DOM node from tag info (type, state, label, data, id)
* @param object view_data
* @return HTMLElement node_tag
*/
export const build_node_tag = function(view_data) {

	const src			= view_data.src
	const id			= view_data.id
	const class_name	= view_data.class_name
	const type			= view_data.type
	const tag_id		= view_data.tag_id
	const state			= view_data.state
	const label			= view_data.label
	const data			= view_data.data

	const dataset = {
		type	: type,
		tag_id	: tag_id,
		state	: state,
		label	: label,
		data	: data
	}

	const node_tag = ui.create_dom_element({
		element_type	: 'img',
		src				: src,
		id				: id,
		class_name		: class_name,
		dataset			: dataset
	})

	return node_tag
}//end build_node_tag



/**
* RENDER_NOTE
* Creates a modal dialog with note options
* @param object options
* @return HTMLElement fragment
*/
const render_note = async function(options) {

	// options
		const self			= options.self
		const text_editor	= options.text_editor
		const i				= options.i
		const view_tag		= options.tag

	// short vars
		const data_string		= view_tag.data
		// convert the data_tag form string to json*-
		// replace the ' to " stored in the html data to JSON "
		const data				= data_string.replace(/\'/g, '"')
		const locator			= JSON.parse(data)
		const note_section_id	= locator.section_id
		const note_section_tipo	= locator.section_tipo
		const features			= self.context.features || {}

	// note section
		const get_note_section = async function(){
			// create the instance of the note section, it will render without inspector or filter and with edit mode
			const instance_options = {
				model			: 'section',
				tipo			: note_section_tipo,
				section_tipo	: note_section_tipo,
				section_id		: note_section_id,
				mode			: 'edit',
				lang			: self.lang,
				caller			: self,
				inspector		: false,
				filter			: false
			}
			// get the instance, built and render
			const note_section	= await get_instance(instance_options)
								  await note_section.build(true)

			return note_section
		}

		// subscribe to the change publication of the component_publication of the section node
		// when the component_publication change it will change the tag note state, showing if the note is private or public
		const publication_id_base = note_section_tipo+'_'+note_section_id+'_'+features.notes_publication_tipo

		// change_publication_value_ event
		const change_publication_value_handler = (changed_value) => {
			// change the state of the note with the data of the component_publication (section_id = 2 means no publishable)
			const state = changed_value.section_id=='2' // no active value
				? 'a' // no publishable
				: 'b' // publishable
			const current_tag_state = view_tag.state || 'a'
			// create new tag with the new state of the tag

			if (current_tag_state !== state){
				const note_tag = {
					type	: 'note',
					label	: view_tag.label,
					tag_id	: view_tag.tag_id,
					state	: state,
					data	: locator // object format
				}
				text_editor.update_tag({
					type			: 'note',
					tag_id			: view_tag.tag_id,
					new_data_obj	: note_tag
				})

				// const tag				= self.build_view_tag_obj(note_tag, note_tag.tag_id)
				// // change the values to the current tag node
				// tag_node.id				= tag.id
				// tag_node.src			= tag.src
				// view_tag.state	= tag.dataset.state
				// Save the change, set the text_editor as dirty (has changes) and save it
				text_editor.set_dirty(true)
				// text_editor.save()
			}
		}
		self.events_tokens.push(
			event_manager.subscribe('change_publication_value_'+publication_id_base, change_publication_value_handler)
		)

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		// header_label_node
			const header_label_node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				inner_html		: (get_label.note || 'Note') + ' ' + note_section_id,
				parent			: header
			})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body'
		})

	// footer
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'footer content distribute'
		})
		// section info
			const section_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'section_info hide',
				inner_html		: 'Loading',
				parent			: footer
			})
		// button remove
			const button_remove = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'danger remove hide',
				text_content	: get_label.delete || 'Delete',
				parent			: footer
			})
			// When the user click on remove button, two actions happens:
			// first, delete the section in the server
			// second, remove the tag from the text_area
			const fn_remove = function(e){
				e.stopPropagation()

				// ask to user if really want delete the note
				const delete_label = get_label.are_you_sure_to_delete_note || 'Are you sure you want to delete this note?' +' '+ view_tag.tag_id
				// if yes, delete the note section in the server
				if(window.confirm(delete_label)) {
					// remove the tag of the note in the component_text_area
					text_editor.delete_tag(view_tag)
					.then(function(){

						if (typeof note_section==='undefined') {
							alert("Undefined note_section");
						}

						// Delete the server note data in the DDBB
							// create sqo the the filter_by_locators of the section to be deleted
							const sqo = {
								section_tipo		: [note_section.section_tipo],
								filter_by_locators	: [{
									section_tipo	: note_section.section_tipo,
									section_id		: note_section.section_id
								}],
								limit				: 1
							}
							// create the request to delete the record
							// telling the section to do the action
							note_section.delete_section({
								sqo			: sqo,
								delete_mode	: 'delete_record'
							})
							// destroy the instance of the note section
							note_section.destroy(true,true,true)

						// text_area. Prepare the text_editor to save setting it in dirty mode and save the change
							text_editor.set_dirty(true)
							// text_editor.save()

						// remove the modal
							modal.remove()
					})
				}
			}//end fn_remove
			button_remove.addEventListener('click', fn_remove)

	// save editor changes to prevent conflicts with modal components changes
		// text_editor.save()

	// modal. Create a standard modal with the note information
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: footer
			// size	: 'normal' // string size big|normal|small
		})
		// resize modal content
		const modal_content = modal.get_modal_content()
				modal_content.style.width	= '600px'
				modal_content.style.height	= '515px';

	// load note section and render. On finish, add to body node and fill header and footer info
		ui.load_item_with_spinner({
			container : body,
			callback : async function() {

				const note_section = await get_note_section()

				// permissions check
				if (!note_section.permissions || parseInt(note_section.permissions)<1) {
					body.classList.add('content')
					body.innerHTML = (get_label.no_access || 'Not access here') + ' ' + note_section.tipo
					return false
				}

				const note_section_node	= await note_section.render()
				body.appendChild(note_section_node)

				// on_close modal. when the modal is closed the section instance of the note need to be destroyed with all events and components
					modal.on_close = () => {
						note_section.destroy(true,true,true)
					}

				if (!note_section.data.value || !note_section.data.value[0]) {
					section_info.remove()
					button_remove.remove()
					return false
				}

				// header_label. Created label with Title case (first letter to uppercase)
					const created_label			= get_label.created || 'created'
					const by_user_label			= get_label.by_user || 'by user'
					const created_by_user		= note_section.data.value[0].created_by_user_name || 'undefined'
					const header_label			= (get_label.note || 'Note') + ' ' + created_label +' '+ by_user_label + ': ' + created_by_user
					header_label_node.innerHTML	= header_label

				// section info (bottom)
					const date_label			= get_label.date.toLowerCase() || 'date'
					const created_date			= note_section.data.value[0].created_date || ''
					section_info.innerHTML		= created_label + ' ' + date_label + ': '+ created_date
					section_info.classList.remove('hide')
					button_remove.classList.remove('hide')
			}
		})


	return true
}//end render_note



/**
* RENDER_PERSONS_LIST
* Creates a modal dialog with persons_list options
* @return HTMLElement fragment|null
*/
const render_persons_list = function(self, text_editor, i) {

	// short vars
		const ar_persons = self.data.tags_persons
			// console.log(`(!ar_persons) ${self.tipo}:`, ar_persons);

	// if ar_persons is empty, stop and return the fragment
		if(!ar_persons || ar_persons.length === 0 || typeof(ar_persons)==='undefined') {
			return null
		}

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			text_node		: get_label.persons || 'Persons',
			parent			: header
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content text_area_persons_list_container'
		})

		// person sections
			const ref_datum	= self.data.related_sections || {}
			const context	= ref_datum.context
			const data		= ref_datum.data
			const sections	= data.find(el => el.typo==='sections')

			if(!sections){
				return null
			}

		// sections loop
			// get the value of related sections (the locator of his data)
			const value_ref_sections = sections.value
			// add the self section, the section of the compnent_text_area, to be processed as common section (for interviewed, camera, etc.)
			const self_component_section = [{
				section_tipo	: self.section_tipo,
				section_id		: self.section_id
			}]
			// create unique array with all locators
			const value = [...value_ref_sections, ...self_component_section]

			const value_length	= value.length
			let k = 0;
			for (let i = 0; i < value_length; i++) {

				const section_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'section_container',
					parent			: body
				})
				// get current_locator to be used in common and simple way
				const current_locator = {
					section_tipo	: value[i].section_tipo,
					section_id		: value[i].section_id
				}
				// check if the section to be processed is the self section, the section of the component_text_area, (only related sections need to be processed)
				if(current_locator.section_tipo!==self.section_tipo){
					const section_label		= context.find(el => el.section_tipo===current_locator.section_tipo).label
					const ar_component_data	= data.filter(el => el.section_tipo===current_locator.section_tipo && el.section_id===current_locator.section_id)

					// get the ar_component_value of the components related to this section
						const ar_component_value = []
						for (let j = 0; j < ar_component_data.length; j++) {
							const current_value = ar_component_data[j].value // toString(ar_component_data[j].value)
							ar_component_value.push(current_value)
						}

					// label
						const label = 	section_label + ' | ' +
										current_locator.section_id +' | ' +
										ar_component_value.join(' | ')

					// section_label_node
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'label',
							inner_html		: label,
							parent			: section_container
						})
				}//end if check the section

				// get the people for every section, self section and related sections
				const ar_persons_for_this_section = ar_persons.filter(el => el.section_tipo === current_locator.section_tipo && el.section_id === current_locator.section_id)
				for (let j = 0; j < ar_persons_for_this_section.length; j++) {

					const current_person = ar_persons_for_this_section[j] // toString(ar_component_data[j].value)

					// person_container
						const person_container = ui.create_dom_element({
							element_type	: 'div',
							class_name 		: 'person_container',
							parent			: section_container
						})
						person_container.addEventListener('mousedown', function (evt) {
							evt.preventDefault()
							evt.stopPropagation()

							// event_manager.publish('key_up_persons' +'_'+ self.id_base, k)
							const tag = self.build_view_tag_obj(current_person, current_person.tag_id)
							text_editor.set_content(tag)
						});

					// person_keyboard
						ui.create_dom_element({
							element_type	: 'span',
							text_node		: 'control ctrl+'+ k++,
							class_name		: 'label person_keyboard',
							parent			: person_container
						})
						const html_tag = self.tags_to_html(current_person.tag)
						person_container.insertAdjacentHTML('afterbegin', html_tag)

					// person_name
						ui.create_dom_element({
							element_type	: 'span',
							text_node		: current_person.full_name || '',
							class_name		: 'label person_name',
							parent			: person_container
						})
						// person_role
						ui.create_dom_element({
							element_type	: 'span',
							text_node		: '('+current_person.role + ')',
							class_name		: 'label person_role',
							parent			: person_container
						})
				}//end for (let j = 0; j < ar_persons_for_this_section.length; j++)
			}//end for (let i = 0; i < value_length; i++)

	// save editor changes to prevent conflicts with modal components changes
		// text_editor.save()

	// modal
		ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: null,
			size	: 'small' // string size big|normal|small
		})


	return true
}//end render_persons_list



/**
* RENDER_LANGS_LIST
* Creates a modal dialog with langs_list options
* @return HTMLElement fragment
*/
const render_langs_list = function(self, text_editor, i) {

	// short vars
		const ar_project_langs = page_globals.dedalo_projects_default_langs
			// console.log(`(!ar_project_langs) ${self.tipo}:`, ar_project_langs);

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			text_node		: get_label.language || 'Language ',
			parent			: header
		})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content text_area_project_langs_container'
		})
		// sections loop
			const value_length = ar_project_langs.length
			let k = 0;
			for (let i = 0; i < value_length; i++) {

				const current_lang = ar_project_langs[i]

				const lang_container = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'lang_container',
					parent			: body
				})
				lang_container.addEventListener('click', function (evt) {
					evt.preventDefault()
					evt.stopPropagation()

					// create the new lang tag
					const tag_type		= 'lang'
					const last_tag_id	= self.get_last_tag_id(tag_type, text_editor)
					const lang_number	= parseInt(last_tag_id) + 1
					const lang_tag		= {
						type	: tag_type,
						label	: current_lang.value.split('-')[1], //.substring(0, 3),
						tag_id	: String(lang_number),
						state	: 'a',
						data	: [current_lang.value]
					}

					const tag = self.build_view_tag_obj(lang_tag, lang_tag.tag_id)
					// set the new lang tag at caret position of the text_editor.

					text_editor.set_content(tag)
					// save value
					text_editor.set_dirty(true)
					// close current modal
						modal.close()
				});

				// lang_icon
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'button icon lang',
						parent			: lang_container
					})

				// lang_label
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'lang_label',
						inner_html		: current_lang.label,
						parent			: lang_container
					})

				// label_keyboard
					ui.create_dom_element({
						element_type	: 'span',
						text_node		: 'Control + Shift + ' + k++,
						class_name		: 'label label_keyboard',
						parent			: lang_container
					})
			}//end for (let i = 0; i < value_length; i++)

	// save editor changes to prevent conflicts with modal components changes
		// text_editor.save()

	// modal
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: null,
			size	: 'small' // string size big|normal|default
		})


	return true
}//end render_langs_list



// @license-end
