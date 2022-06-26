/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'
	// import {service_ckeditor} from '../../services/service_ckeditor/js/service_ckeditor.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {tr} from '../../common/js/tr.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'
	import * as instances from '../../common/js/instances.js'


/**
* RENDER_EDIT_COMPONENT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const render_edit_component_text_area = function() {

	return true
}//end render_edit_component_text_area



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_text_area.prototype.edit = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// fix non value scenarios
		self.data.value = (self.data && self.data.value.length>0)
			? self.data.value
			: [null]

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// fix element
		self.wrapper = wrapper

	// add events
		add_events(self, wrapper)

	// defaultParagraphSeparator for contenteditable
		// document.execCommand("defaultParagraphSeparator", false, "p");


	return wrapper
}//end edit



/**
* ADD_EVENTS
* @return bool
*/
const add_events = function(self, wrapper) {

	// add element, subscription to the events
		// self.events_tokens.push(
		// 	event_manager.subscribe('add_element_'+self.id, add_element)
		// )
		// function add_element(changed_data) {
		// 	const inputs_container = wrapper.querySelector('.inputs_container')
		// 	// add new DOM input element
		// 	const input_element = get_input_element(changed_data.key, changed_data.value, self)
		// 	inputs_container.appendChild(input_element)
		// }

	// focus
		// wrapper.addEventListener('focus', async (e) => {
		// 	// e.stopPropagation()

		// 	// store current inner html to compare when blur
		// 	if (e.target.matches('.input_tex_area')) {

		// 		// store current contenteditable content
		// 			e.target.data_orig = e.target.innerHTML;

		// 		// contenteditable_buttons. use existing contenteditable_buttons or create a fresh one if not
		// 			const contenteditable_buttons = document.querySelector(".contenteditable_buttons") || ui.get_contenteditable_buttons()
		// 				  contenteditable_buttons.target = e.target // set current contenteditable as target
		// 			e.target.parentNode.appendChild(contenteditable_buttons)

		// 		return true
		// 	}

		// }, true)

	// blur
		// wrapper.addEventListener('blur', async (e) => {
		// 	// e.stopPropagation()

		// 	// store current inner html to compare when blur
		// 	if (e.target.matches('.input_tex_area')) {

		// 		// remove existing contenteditable_buttons
		// 			const contenteditable_buttons = document.querySelector(".contenteditable_buttons")
		// 			if (contenteditable_buttons) contenteditable_buttons.remove()

		// 		// save changes if content is different
		// 			const changed = e.target.innerHTML!==e.target.data_orig
		// 			if (changed===true) {

		// 				const value = e.target.innerHTML

		// 				const changed_data = Object.freeze({
		// 					action	: 'update',
		// 					key		: JSON.parse(e.target.dataset.key),
		// 					value	: value
		// 				})
		// 				self.change_value({
		// 					changed_data : changed_data,
		// 					refresh 	 : false
		// 				})
		// 				.then((save_response)=>{
		// 					// event to update the dom elements of the instance
		// 					event_manager.publish('update_value_'+self.id, changed_data)
		// 				})
		// 			}
		// 		return true
		// 	}

		// }, true)

	// click [click]
		wrapper.addEventListener("click", e => {
			// e.stopPropagation()

			// remove_buttons
				const all_remove_buttons = wrapper.querySelectorAll('.remove')
				for (let i = all_remove_buttons.length - 1; i >= 0; i--) {
					all_remove_buttons[i].classList.add("display_none")
				}

				// if (e.target.matches('.contenteditable')) {
				// 	// set the button_remove associated to the input selected to visible
				// 		const button_remove = e.target.parentNode.querySelector('.remove')
				// 		button_remove.classList.remove("display_none")
				// }

			// insert
				if (e.target.matches('.button.add_input')) {

					const changed_data = Object.freeze({
						action	: 'insert',
						key		: self.data.value.length,//self.data.value.length>0 ? self.data.value.length : 1,
						value	: null
					})
					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						event_manager.publish('add_element_'+self.id, changed_data)
					})

					return true
				}

			// remove
				if (e.target.matches('.button.remove')) {

					// force possible input change before remove
					document.activeElement.blur()

					const changed_data = Object.freeze({
						action	: 'remove',
						key		: e.target.dataset.key,
						value	: null,
						refresh : true
					})
					self.change_value({
						changed_data : changed_data,
						label 		 : e.target.previousElementSibling.value,
						refresh 	 : true
					})
					.then(()=>{
					})

					return true
				}

			//const current_buttons_editor = document.querySelector(".buttons_editor")
			//if (current_buttons_editor) current_buttons_editor.remove()
		})//end wrapper.addEventListener("click"


	return true
}//end add_events



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	const value 		 = self.data.value
	const is_inside_tool = self.is_inside_tool

	const fragment = new DocumentFragment()

	// init the editor with the wrapper
		// const editor = ui.create_dom_element({
		// 	element_type	: 'div',
		// 	class_name 		: 'editor',
		// 	parent 			: fragment
		// })
		// const load_editor = (wrapper) => {
		// 	self.init_editor(editor)
		// }
		// self.events_tokens.push(
		// 	event_manager.subscribe('render_'+self.id, load_editor)
		// )

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container',
			parent			: fragment
		})

	// values (inputs)
		const inputs_value = value // is array
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element = get_input_element(i, inputs_value[i], self, is_inside_tool)
			inputs_container.appendChild(input_element)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	// const is_inside_tool	= self.is_inside_tool
	// const mode				= self.mode

	// short vars
		const is_inside_tool	= (self.caller && self.caller.type==='tool')
		const fragment			= new DocumentFragment()

	// prevent show buttons inside a tool
		// if (self.caller && self.caller.type==='tool') {
		// 	return fragment
		// }

	// button add input
		// if((self.mode==='edit' || self.mode==='edit_in_list') && !is_inside_tool){
		// 	const button_add_input = ui.create_dom_element({
		// 		element_type	: 'span',
		// 		class_name 		: 'button add',
		// 		parent 			: buttons_container
		// 	})
		// }

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
			// console.log("Added buttons to buttons_container:", buttons_container, self.tipo);
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		// buttons_container.appendChild(fragment)

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
* GET_INPUT_ELEMENT
* @return DOM element li
*/
const get_input_element = (i, current_value, self) => {

	const mode = self.mode

	// value is a raw html without parse into nodes (txt format)
		const value = self.tags_to_html(current_value)

	// text_editor_container container
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// toolbar_container
		const toolbar_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'toolbar_container hide',
			parent			: li
		})

	// value_container
		const value_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'value_container',
			parent			: li
		})


	// input contenteditable
		// const input = ui.create_dom_element({
		// 	element_type 	: 'div',
		// 	class_name 		: 'input_tex_area contenteditable',
		// 	dataset 	 	: { key : i },
		// 	inner_html 		: value,
		// 	contenteditable : true,
		// 	parent 		 	: li
		// })

	// init_current_service_text_editor
		const init_current_service_text_editor = function() {

			// service_editor. Fixed on init
				// const current_service_text_editor = new service_tinymce()
				// const current_service_text_editor = new service_ckeditor()
				const current_service_text_editor = new self.service_text_editor()

			// toolbar. create the toolbar base
				const toolbar = ['bold','italic','underline','|','undo','redo','find_and_replace','html_source','full_screen','|']
				// toolbar add custum_buttons
					if(self.context.toolbar_buttons){
						toolbar.push(...self.context.toolbar_buttons)
					}
				// toolbar add standard buttons
					toolbar.push(...['button_lang','|','button_save'])

			// editor_config
				const editor_config = {
					// plugins		: ['paste','image','print','searchreplace','code','noneditable','fullscreen'], // ,'fullscreen'
					// toolbar		: 'bold italic underline undo redo searchreplace pastetext code fullscreen |'+toolbar_buttons+' button_lang | button_save', // tinnyMCE
					toolbar			: toolbar,
					custom_buttons	: get_custom_buttons(self, current_service_text_editor, i),
					custom_events	: get_custom_events(self, i, current_service_text_editor)
				}

			// init editor
				current_service_text_editor.init({
					caller				: self,
					value_container		: value_container,
					toolbar_container	: toolbar_container,
					value				: value,
					key					: i,
					editor_config		: editor_config
				})
				.then(function(){
					// fix current_service_text_editor
					self.text_editor[i] = current_service_text_editor
					// show toolbar_container
					// toolbar_container.classList.remove('hide')
					const node = li
					node.addEventListener("mouseup", function(){
						toolbar_container.classList.remove('hide')
						setTimeout(function(){
							document.body.addEventListener("mouseup", fn_remove)
						}, 10)
					})
					function fn_remove(e) {
						if (e.target!=node) {
							toolbar_container.classList.add('hide')
							document.body.removeEventListener("mouseup", fn_remove)
						}
					}
				})

			return current_service_text_editor
		}//end init_current_service_text_editor

	// direct. Init the editor now
		// const text_editor = init_current_service_text_editor()

	// observer. Init the editor when container node is in DOM
		const observer = new IntersectionObserver(function(entries) {
			// if(entries[0].isIntersecting === true) {}
			const entry = entries[1] || entries[0]
			if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
				observer.disconnect();
				init_current_service_text_editor()
				// observer.unobserve(entry.target);
			}
		}, { threshold: [0] });
		observer.observe(li);

		// value_container.innerHTML = value

	// add button create fragment (Only when caller is a tool_indexation instance)
		if (self.caller && self.caller.constructor.name==="tool_indexation") {

			// create_fragment event subscription
				// self.events_tokens.push(
				// 	event_manager.subscribe('create_fragment'+'_'+ self.id, self.create_fragment.bind(self))
				// )

			// // text_selection
				// 	console.log("event_manager.events:",event_manager.events);
				// 	self.events_tokens.push(
				// 		event_manager.subscribe('text_selection_'+ self.id, show_button_create_fragment)
				// 	)
				// 	function show_button_create_fragment(options) {
				// 		dd_console('--> show_button_create_fragment options', 'DEBUG', options)

				// 		// options
				// 			const selection	= options.selection
				// 			const callet	= options.caller

				// 		const component_container	= li
				// 		const button				= component_container.querySelector(".create_fragment")
				// 		const last_tag_id			= self.get_last_tag_id('index', current_service_text_editor)
				// 		const label					= (get_label["create_fragment"] || "Create fragment") + ` ${last_tag_id+1} ` + (SHOW_DEBUG ? ` (chars:${selection.length})` : "")

				// 		const create_button = function(selection) {
				// 			const button_create_fragment = ui.create_dom_element({
				// 				element_type	: 'button',
				// 				class_name 		: 'warning compress create_fragment',
				// 				inner_html 		: label,
				// 				parent 			: component_container
				// 			})

				// 			// event create_fragment add publish on click
				// 				button_create_fragment.addEventListener("click", () => {

				// 					event_manager.publish('create_fragment_'+ self.id, {
				// 						caller	: self,
				// 						key		: i,
				// 						text_editor	: current_service_text_editor
				// 					})
				// 				})

				// 			return button_create_fragment
				// 		}

				// 		if (selection.length<1) {
				// 			if (button) {
				// 				button.remove()
				// 			}
				// 		}else{
				// 			if (!button) {
				// 				create_button(selection)
				// 			}else{
				// 				button.innerHTML = label
				// 			}
				// 		}
				// 	}
		}//end if (self.caller && self.caller.constructor.name==="tool_indexation")

	// button remove
		// if((mode==='edit' || 'edit_in_list') && !is_inside_tool){
		// 	const button_remove = ui.create_dom_element({
		// 		element_type	: 'div',
		// 		class_name 		: 'button remove display_none',
		// 		dataset			: { key : i },
		// 		parent 			: li
		// 	})
		// }


	return li
}//end get_input_element



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

	// const editor = get_editor()

	// separator
		custom_buttons.push({
			name			: '|',
			manager_editor	: false,
			options	: {
				tooltip	: '',
				image	: '../../core/themes/default/icons/separator.svg',
				onclick	: null
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
				tooltip	: 'undo',
				image	: '../../core/themes/default/icons/undo.svg'
			}
		})

	// redo
		custom_buttons.push({
			name			: "redo",
			manager_editor	: true,
			options	: {
				tooltip	: 'redo',
				image	: '../../core/themes/default/icons/redo.svg'
			}
		})

	// find_and_replace
		custom_buttons.push({
			name			: "find_and_replace",
			manager_editor	: false,
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

	// full_screen
		custom_buttons.push({
			name			: "full_screen",
			manager_editor	: false,
			options	: {
				tooltip	: 'full_screen',
				image	: '../../core/themes/default/icons/full_screen.svg'
			}
		})


	// button_person
		custom_buttons.push({
			name			: "button_person",
			manager_editor	: false,
			options	: {
				tooltip	: 'Show persons list',
				image	: '../../core/themes/default/icons/person.svg',
				onclick	: function(evt) {
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
				onclick	: function(evt) {
					event_manager.publish('create_geo_tag_'+ self.id_base, {
						caller		: self,
						text_editor	: text_editor
					})
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
				onclick	: function(evt) {
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
								section_tipo	: self.context.notes_section_tipo,
								section_id		: note_section_id
							};
							// create the new tag for the note
							const tag_type		='note'
							const last_tag_id	= self.get_last_tag_id(tag_type, text_editor)
							const note_number	= parseInt(last_tag_id) + 1
							const note_tag		= {
								type	: tag_type,
								label	: note_number,
								tag_id	: note_number,
								state	: 'a',
								data	: locator
							}
							const tag = build_node_tag(note_tag, note_tag.tag_id)
							// insert the new note tag in the caret position of the text_editor
							const inserted_tag = text_editor.set_content(tag.outerHTML)
							// render and open the note section inside a modal
							render_note({
								self		: self,
								text_editor	: text_editor,
								i			: i,
								tag			: inserted_tag
							})
						}
					})
				}
			}
		})

	// button_reference
		custom_buttons.push({
			name			: "button_reference",
			manager_editor	: false,
			options	: {
				tooltip	: 'Add reference',
				image	: '../../core/themes/default/icons/reference.svg',
				onclick	: function(evt) {
					alert("Adding reference !");
					// component_text_area.create_new_reference(ed, evt, text_area_component)
				}
			}
		})

	// button_lang
		custom_buttons.push({
			name			: "button_lang",
			manager_editor	: false,
			options	: {
				tooltip	: 'Add lang',
				image	: '../../core/themes/default/icons/lang.svg',
				onclick	: function() {
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
		const save_label = get_label.salvar.replace(/<\/?[^>]+(>|$)/g, "") || "Save"
		custom_buttons.push({
			name			: "button_save",
			manager_editor	: false,
			options	: {
				text	: save_label,
				tooltip	: save_label,
				icon	: false,
				onclick	: function(evt) {
					// save. text_editor save function calls current component save_value()
					text_editor.save()
				}
			}
		})


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

	const custom_events = {}

	// focus
		custom_events.focus = (evt, options) => {

			event_manager.publish('active_component', self)
		}//end focus

	// blur
		custom_events.blur = (evt, options) => {
			// save. text_editor save function calls current component save_value()
			text_editor.save()
		}//end blur

	// click
		custom_events.click = (evt, options) => {
			// use the observe property into ontology of the components to subscribe to this events
			// img : click on img
			if(evt.target.nodeName==='IMG' || evt.target.nodeName==='REFERENCE') {
				const tag_obj = evt.target
				switch(evt.target.className) {

					case 'tc':
						// Video go to timecode by tc tag
						event_manager.publish('click_tag_tc_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						break;

					case 'index':
						// click_tag_index_
						// (!) Note publish 2 events: using 'id_base' to allow properties definition and
						// 'self.id' for specific uses like tool indexation
						// console.log("PUBLISH self.id:",self.id, self.id_base);
						event_manager.publish('click_tag_index_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						// event_manager.publish('click_tag_index_'+ self.id, {tag:tag_obj, caller: self})
						// des
							// const tipo			= text_area_component.dataset.tipo
							// const lang			= text_area_component.dataset.lang
							// const section_tipo	= text_area_component.dataset.section_tipo
							// const parent		= text_area_component.dataset.parent

							// switch(page_globals.modo) {

							// 	case 'edit' :
							// 		// inspector : Show info about indexations in inspector
							// 		tool_indexation.load_inspector_indexation_list(tag_obj, tipo, parent, section_tipo, lang)

							// 		// relations
							// 		//component_text_area.load_relation(tag, tipo, parent, section_tipo);
							// 		//alert("Show info about in inspector relations - context_name:"+get_current_url_vars()['context_name'])

							// 		// portal select fragment from tag button
							// 		if (page_globals.context_name=='list_into_tool_portal') {
							// 			// Show hidden button link_fragmet_to_portal and configure to add_resource
							// 			component_text_area.show_button_link_fragmet_to_portal(tag_obj, tipo, parent, section_tipo);
							// 		}
							// 		break;

							// 	case 'tool_indexation' :
							// 		// Show info about in tool relation window
							// 		component_text_area.load_fragment_info_in_indexation(tag_obj, tipo, parent, section_tipo, lang);	//alert(tag+' - '+ tipo+' - '+ parent)
							// 		break;
							// }
							// // mask_tags on click image index
							// mce_editor.mask_tags(ed, evt);
						break;

					case 'svg' :
						// not defined yet
						break;

					case 'draw' :
						// Load draw editor
						event_manager.publish('click_tag_draw_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						// des
							// switch(page_globals.modo) {

							// 	case 'tool_transcription' :
							// 		if (typeof component_image==="undefined") {
							// 			console.warn("[mde_editor.image_command] component_image class is not avilable. Ignored draw action");
							// 		}else{
							// 			component_image.load_draw_editor(tag_obj);
							// 		}
							// 		break;

							// 	case 'edit' :
							// 		var canvas_id = text_area_component.dataset.canvas_id;
							// 		if (typeof component_image_read!=="undefined") {
							// 			component_image_read.load_draw_editor_read(tag_obj, canvas_id);
							// 		}else{
							// 			console.log("component_image_read is lod loaded! Ignoring action load_draw_editor_read");
							// 		}
							// 	break;
							// }
						break;

					case 'geo' :
						// subscribed by component_geolocation from properties like 'numisdata264'
						event_manager.publish('click_tag_geo_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						break;

					case 'page':
						// PDF go to the specific page
						event_manager.publish('click_tag_pdf_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						break;

					case 'person':
						// Show person info
						event_manager.publish('click_tag_person_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})
						// get the locator in string format
						const data_string	= tag_obj.dataset.data
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
								text_editor.save()

							// modal. create new modal with the person full name
								ui.attach_to_modal({
									header	: 'Person info',
									body	: person.full_name,
									footer	: null,
									size	: 'small'
								})
						}
						break;

					case 'note':
						// Show note info
							event_manager.publish('click_tag_note_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})

						// save editor changes to prevent conflicts with modal components changes
							text_editor.save()

						// modal tag note info
							render_note({
								self		: self,
								text_editor	: text_editor,
								i			: i,
								tag			: tag_obj
							})
						break;

					case 'lang':
						// Show note info
						event_manager.publish('click_tag_lang_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})

						const ar_project_langs		= page_globals.dedalo_projects_default_langs
						const tag_data_lang_string	= tag_obj.dataset.data
						// rebuild the correct data with the " instead '
						const data_lang			= tag_data_lang_string.replace(/\'/g, '"')
						// parse the string to object or create new one
						const tag_data_lang		= JSON.parse(data_lang) || ''
						// get the object of the lang clicked from all project_langs
						const lang_obj 			= ar_project_langs.find(el => el.value===tag_data_lang) || {label: data_lang}

						// save editor changes to prevent conflicts with modal components changes
							text_editor.save()

						// modal tag lang info
							ui.attach_to_modal({
								header	: 'Lang info',
								body	: lang_obj.label,
								footer	: null,
								size	: 'small'
							})
						break;

					case 'reference':
						if(evt.altKey===true){
							// Select all node to override content
							ed.selection.select(ed.selection.getNode())
						}else{
							// Show reference info
							component_text_area.show_reference_info( ed, evt, text_area_component )
						}
						break;

					default:
						// nothing to do here

						break;
				}//end switch evt.target.className
			}else if(evt.target.nodeName==='LABEL') {
				// Fix text area selection values
				if (page_globals.modo==='tool_lang') {
					component_text_area.show_structuration_info(ed, evt, text_area_component)
				}
			}else{
				// click_no_tag_
				event_manager.publish('click_no_tag_'+ self.id_base, {caller: self})
			}//end click on img
		}//end click

	// mouseup
		custom_events.MouseUp = (evt, options) => {
			// user text selection event
			const selection = options.selection
			event_manager.publish('text_selection_'+ self.id, {selection:selection, caller: self})
		}//end MouseUp

	// keyup
		custom_events.KeyUp = (evt, options) => {
			// use the observe property into ontology of the components to suscribe to this events
			switch(true) {

				// 'Escape'
				case  evt.code === self.context.av_player.av_play_pause_code:
					event_manager.publish('key_up_esc' +'_'+ self.id_base, self.context.av_player.av_rewind_seconds)
					break;

				// 'F2'
				case evt.code === self.context.av_player.av_insert_tc_code:
					// publish event and receive susbscriptors responses
					const susbscriptors_responses			= event_manager.publish('key_up_f2' +'_'+ self.id_base, evt.code)
					const susbscriptors_responses_length	= susbscriptors_responses.length

					// debug
						if(SHOW_DEBUG===true) {
							console.log("[render_edit_component_text_area.get_custom_events] susbscriptors_responses (key_up_f2):", susbscriptors_responses);
						}

					// text_editor. get editor and content data
						const editor_content_data = text_editor.get_editor_content_data()

					// iterate susbscriptors responses
						for (let i = 0; i < susbscriptors_responses_length; i++) {
							const data_tag 	= susbscriptors_responses[i]
							const tag_id 	= (!data_tag.tag_id)
								? self.get_last_tag_id(data_tag.type, text_editor) + 1
								: data_tag.tag_id;

							switch(data_tag.type) {
								case ('draw'):
								case ('geo'):
									render_layer_selector(self, data_tag, tag_id, text_editor)
									break;
								case ('page'):
									render_page_selector(self, data_tag, tag_id, text_editor)
									break;
								default:
									const tag = build_node_tag(data_tag, tag_id)
									text_editor.set_content(tag.outerHTML)
							}// end switch
						}
					break;

				// ctrl + 0
				case evt.ctrlKey && !evt.shiftKey && (evt.code.startsWith('Digit') || evt.code.startsWith('Numpad')):
					// resolve the key number pressed by the user, it will be the key of the person array
					const key_person_number	= evt.code.match(/\d+/g);
					// get the person with the number pressed
					const person_tag		= self.data.tags_persons[key_person_number[0]]
					event_manager.publish('key_up_persons' +'_'+ self.id_base, key_person_number)
					// get the node tag defined in the person (it's prepared in server)
					const node_tag_person	= build_node_tag(person_tag, person_tag.tag_id)
					// set the new tag at caret position in the text.
					text_editor.set_content(node_tag_person.outerHTML)

					break;

				// ctrl + Shift + 0
				case evt.ctrlKey && evt.shiftKey && (evt.code.startsWith('Digit') || evt.code.startsWith('Numpad')):
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
						tag_id	: lang_number,
						state	: 'a',
						data	: current_lang.value
					}
					const node_tag_lang = build_node_tag(lang_tag, lang_tag.tag_id)
					// set the new tag at caret position in the text.
					text_editor.set_content(node_tag_lang.outerHTML)

					break;
			}
		}//end KeyUp


	return custom_events
}//end get_custom_events



/**
* BUILD_NODE_TAG
* Create a DOM node from tag info (type, state, label, data, id)
* @param object data_tag
* @param int tag_id
* @return DOM node node_tag
*/
export const build_node_tag = function(data_tag, tag_id) {

	const type			= data_tag.type
	const state			= data_tag.state
	const label			= data_tag.label
	// convert the data_tag to string to be used it in html
	const data_string	= JSON.stringify(data_tag.data)
	// replace the " to ' to be compatible with the dataset of html5, the tag strore his data ref inside the data-data html
	// json use " but it's not compatible with the data-data storage in html5
	const data			= data_string.replace(/"/g, '\'')


	const images_factory_url = "../component_text_area/tag/?id="

	// Bracket_in is different for close tag
	const bracket_in = (type.indexOf("Out")!==-1)
		? "[/"
		: "["

	// Removes sufixes 'In' and 'Out'
	const type_name = type.replace(/In|Out/, '');

	const src = (type==='tc')
		? images_factory_url  + "[TC_" + tag_id + "_TC]"
		: images_factory_url  + bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "]"

	const id = (type==='tc')
		? tag_id
		: bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "]"

	const class_name = (type==='tc')
		? type
		: type_name

	const dataset = {
		type	: type,
		tag_id	: (type==='tc') ? "[TC_" + tag_id + "_TC]" : tag_id,
		state	: (type==='tc') ? 'n': state,
		label	: (type==='tc') ? tag_id : label,
		data	: (type==='tc') ? tag_id : data
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
* RENDER_LAYER_SELECTOR
* Used from component_image
* @return DOM node fragment
*/
const render_layer_selector = function(self, data_tag, tag_id, text_editor){

	const ar_layers = data_tag.layers

	const fragment = new DocumentFragment()

	const add_layer = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button add',
		parent			: fragment
	})
	add_layer.addEventListener("click", (e) =>{
		e.preventDefault()

		data_tag.data = "["+data_tag.last_layer_id+"]"
		const tag 	= build_node_tag(data_tag, tag_id)
		text_editor.set_content(tag.outerHTML)
		layer_selector.remove()
	})

	const layer_icon = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'layer_icon',
		parent			: fragment,
		text_node		: data_tag.type
	})

	const close = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'button close',
		parent			: fragment
	})
	close.addEventListener("click", (e) =>{
		e.preventDefault()
		layer_selector.remove()
	})

	// inputs container
		const layer_ul = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'layer_ul',
			parent			: fragment
		})

		for (let i = 0; i < ar_layers.length; i++) {
			const layer = ar_layers[i]

			const layer_li = ui.create_dom_element({
				element_type	: 'li',
				parent			: layer_ul
			})
			layer_li.addEventListener("click", (e) =>{
				e.preventDefault()

				data_tag.data = "["+layer.layer_id+"]"
				const tag = build_node_tag(data_tag, tag_id)
				text_editor.set_content(tag.outerHTML)
				layer_selector.remove()
			})

				const layer_id = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'layer_id',
					parent			: layer_li,
					text_node		: layer.layer_id
				})

				const user_layer_name = ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'user_layer_name',
					parent			: layer_li,
					text_node		: layer.user_layer_name
				})

				// const layer_color_box = ui.create_dom_element({
				// 	element_type	: 'div',
				// 	class_name 		: 'layer_color_box',
				// 	parent 			: layer_li,
				// })
				// const layer_color = ui.create_dom_element({
				// 	element_type	: 'div',
				// 	class_name 		: 'layer_color',
				// 	parent 			: layer_color_box,
				// })
				// layer_color.style.backgroundColor = typeof layer.layer_color !== 'undefined'
				// 	? layer.layer_color
				// 	: 'black'
		}// end for

	const layer_selector = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'layer_selector',
	})
	layer_selector.appendChild(fragment)

	self.wrapper.appendChild(layer_selector)

	return fragment
}//end render_layer_selector



/**
* RENDER_PAGE_SELECTOR
* @return
*/
const render_page_selector = function(self, data_tag, tag_id, text_editor){

	const total_pages	= data_tag.total_pages
	const offset		= data_tag.offset
	const page_in		= offset
	const page_out		= (offset -1) + total_pages


	const header = ui.create_dom_element({
		element_type	: 'div',
		text_node		: get_label.select_page_of_the_doc
	})

	const body = ui.create_dom_element({
		element_type	: 'span',
		class_name 		: 'body',
	})

	const label = eval('`'+get_label.choose_page_between+'`')

	const body_title = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'body_title',
		text_node		: label,
		parent			: body
	})

	const body_input = ui.create_dom_element({
		element_type	: 'input',
		type			: 'text',
		class_name		: 'body_title',
		parent			: body
	})

	const error_input = ui.create_dom_element({
		element_type	: 'span',
		class_name		: 'body_title',
		text_node		: '',
		parent			: body
	})


	const footer = ui.create_dom_element({
		element_type	: 'span'
	})

	const user_option_cancelar = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'user_option ',
		inner_html		: get_label.cancelar || 'Cancel',
		parent			: footer
	})

	const user_option_ok = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'user_option',
		inner_html		: get_label.insertar_etiqueta || 'Insert label',
		parent			: footer
	})

	// save editor changes to prevent conflicts with modal components changes
		text_editor.save()

	// modal
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: footer,
			size	: 'normal'
		})

	user_option_ok.addEventListener("click", (e) =>{
		e.preventDefault()
		const user_value = body_input.value
		if(user_value === null) {
			modal.renove()
		}
		if(user_value > page_out || user_value < page_in){
			error_input.textContent = get_label.value_out_of_range || 'Value out of range'
			return
		}
		const data		= body_input.value - (offset -1)
		data_tag.label	= body_input.value
		data_tag.data	= "["+data+"]"
		const tag		= build_node_tag(data_tag, tag_id)
		text_editor.set_content(tag.outerHTML)
		modal.remove()
	})

	user_option_cancelar.addEventListener("click", (e) =>{
		modal.remove()
	})


	return true
}//end render_page_selector



/**
* RENDER_NOTE
*
* @param object options
* @return DOM node fragment
*/
const render_note = async function(options) {

	// options
		const self				= options.self
		const text_editor		= options.text_editor
		const i					= options.i
		const tag_node 			= options.tag

	// short vars
		const data_string		= tag_node.dataset.data
		// convert the data_tag form string to json*-
		const data				= data_string.replace(/\'/g, '"')
		// replace the ' to " stored in the html data to JSON "
		const locator			= JSON.parse(data)
		const note_section_id	= locator.section_id
		const note_section_tipo	= locator.section_tipo

	// section
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
		const note_section		=	await instances.get_instance(instance_options)
									await note_section.build(true)
		const note_section_node	=	await note_section.render()

		// subscribe to the change publication of the component_publication of the section node
		// when the component_publication change it will change the tag note state, showing if the note is private or public
		const publication_id_base = note_section_tipo+'_'+note_section_id+'_'+self.context.notes_publication_tipo
		event_manager.subscribe('change_publication_value_'+publication_id_base, fn_change_publication_state)
		function fn_change_publication_state(changed_value) {
			// change the state of the note with the data of the component_publication (section_id = 2 means no publishable)
			const state = changed_value.section_id=='2' // no active value
				? 'a' // no publishable
				: 'b' // publishable
			const current_tag_state = tag_node.dataset.state || 'a'
			// create new tag with the new state of the tag
			if (current_tag_state !== state){
				const note_tag		= {
					type	: 'note',
					label	: tag_node.dataset.label,
					tag_id	: tag_node.dataset.tag_id,
					state	: state,
					data	: locator
				}
				const tag				= build_node_tag(note_tag, note_tag.tag_id)
				// change the values to the current tag node
				tag_node.id				= tag.id
				tag_node.src			= tag.src
				tag_node.dataset.state	= tag.dataset.state
				// Save the change, set the text_editor as dirty (has changes) and save it
				text_editor.set_dirty(true)
				text_editor.save()
			}
		}

	// header
		const header = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'header'
		})
		// header_label. created label with Title case (first letter to uppercase)
			// const created_label		= get_label.created.replace(/\b(\S)/, function(t) { return t.toUpperCase() }) || 'Create'
			const created_label		= get_label.created || 'created'
			const by_user_label		= get_label.by_user || 'by user'
			const created_by_user	= note_section.data.value[0].created_by_user_name || 'undefined'
			const header_label		= (get_label.note || 'Note') + ' ' + created_label+' '+ by_user_label + ': '+created_by_user
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'label',
				inner_html		: header_label,
				parent			: header
			})

	// body
		const body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'body'
		})
		body.appendChild(note_section_node)

	// footer
		const footer = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'footer'
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
				const delete_label = get_label.are_you_sure_to_delete_note || 'Are you sure you want to delete this note?' +' '+ tag_node.dataset.tag_id
				// if yes, delete the note section in the server
				if(window.confirm(delete_label)) {
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
					// remove the tag of the note in the component_text_area
					tag_node.remove()
					// prepare the text_editor to save setting it in dirty mode and save the change
					text_editor.set_dirty(true)
					text_editor.save()
					// destroy the instance of the note section
					note_section.destroy(true,true,true)
					// remove the modal
					modal.remove()
				}
			})

		// section info
			const date_label			= get_label.date.toLowerCase() || 'date'
			const created_date			= note_section.data.value[0].created_date || ''
			const created_date_label	= created_label + ' ' + date_label + ': '+created_date
			// section_info
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'section_info',
				inner_html		: created_date_label,
				parent			: footer
			})

	// save editor changes to prevent conflicts with modal components changes
		text_editor.save()

	// modal. Create a standard modal with the note information
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: footer,
			size	: 'normal' // string size big|normal
		})
		// when the modal is closed the section instance of the note need to be destroyed with all events and components
		modal.on_close = () => {
			note_section.destroy(true,true,true)
		}


	return true
}//end render_note



/**
* RENDER_PERSONS_LIST
* @return DOM node fragment|null
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
			class_name		: 'text_area_persons_list_container'
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
					class_name 		: 'section_container',
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

					// label DOM element
						const section_label_node = ui.create_dom_element({
							element_type	: 'span',
							class_name 		: 'label',
							inner_html		: label,
							parent			: section_container
						})
				}// end if check the section

				// get the people for every section, self section and related sections
				const ar_persons_for_this_section = ar_persons.filter(el => el.section_tipo === current_locator.section_tipo && el.section_id === current_locator.section_id)
				for (let j = 0; j < ar_persons_for_this_section.length; j++) {

					const current_person = ar_persons_for_this_section[j] // toString(ar_component_data[j].value)

					const person_container = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'person_container',
						parent			: section_container
					})
						const person_keyboard = ui.create_dom_element({
							element_type	: 'span',
							text_node		: 'control ctrl+'+ k++,
							class_name 		: 'label person_keyboard',
							parent			: person_container
						})
						const html_tag = self.tags_to_html(current_person.tag)
						person_container.insertAdjacentHTML('afterbegin', html_tag)

						const person_name = ui.create_dom_element({
							element_type	: 'span',
							text_node		: current_person.full_name || '',
							class_name 		: 'label person_name',
							parent			: person_container
						})

						const person_role = ui.create_dom_element({
							element_type	: 'span',
							text_node		: '('+current_person.role + ')',
							class_name 		: 'label person_role',
							parent			: person_container
						})

					person_container.addEventListener("mousedown", function (evt) {
						evt.preventDefault()
						evt.stopPropagation()

						// event_manager.publish('key_up_persons' +'_'+ self.id_base, k)
						const tag = build_node_tag(current_person, current_person.tag_id)
						text_editor.set_content(tag.outerHTML)
					});
				}//end for (let j = 0; j < ar_persons_for_this_section.length; j++)
			}//end for (let i = 0; i < value_length; i++)

	// save editor changes to prevent conflicts with modal components changes
		text_editor.save()

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
* @return DOM node fragment
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
			class_name 		: 'content text_area_project_langs_container'
		})
		// sections loop
			const value_length	= ar_project_langs.length
			let k = 0;
			for (let i = 0; i < value_length; i++) {

				const current_lang = ar_project_langs[i]

				const lang_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'lang_container',
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
						tag_id	: lang_number,
						state	: 'a',
						data	: current_lang.value
					}
					const tag = build_node_tag(lang_tag, lang_tag.tag_id)
					// set the new lang tag at caret position of the text_editor.
					text_editor.set_content(tag.outerHTML)
					// save value
					text_editor.save()
					.then(function(){
						// close current modal
						modal.close()
					})
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
						text_node		: 'Control + Shift + '+ k++,
						class_name		: 'label label_keyboard',
						parent			: lang_container
					})
			}//end for (let i = 0; i < value_length; i++)

	// save editor changes to prevent conflicts with modal components changes
		text_editor.save()

	// modal
		const modal = ui.attach_to_modal({
			header	: header,
			body	: body,
			footer	: null,
			size	: 'small' // string size big|normal
		})


	return true
}//end render_langs_list



/**
* GET_CONTENTEDITABLE_BUTTONS
*/
	// const get_contenteditable_buttons = () => {

	// 	const fragment = new DocumentFragment()

	// 	// bold
	// 		const button_bold = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name 		: 'button bold',
	// 			text_content 	: "Bold",
	// 			parent 			: fragment
	// 		})
	// 		button_bold.addEventListener("click", (e)=>{
	// 			e.stopPropagation()
	// 			do_command('bold', null)
	// 		})
	// 	// italic
	// 		const button_italic = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name 		: 'button italic',
	// 			text_content 	: "Italic",
	// 			parent 			: fragment
	// 		})
	// 		button_italic.addEventListener("click", (e)=>{
	// 			e.stopPropagation()
	// 			do_command('italic', null)
	// 		})
	// 	// underline
	// 		const button_underline = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name 		: 'button underline',
	// 			text_content 	: "Underline",
	// 			parent 			: fragment
	// 		})
	// 		button_underline.addEventListener("click", (e)=>{
	// 			e.stopPropagation()
	// 			do_command('underline', null)
	// 		})
	// 	// find and replace
	// 		const button_replace = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name 		: 'button replace',
	// 			text_content 	: "Replace",
	// 			parent 			: fragment
	// 		})
	// 		button_replace.addEventListener("click", (e)=>{
	// 			e.stopPropagation()
	// 			//replace_selected_text('nuevooooo')
	// 			do_command('insertText', 'nuevoooooXXX')
	// 		})

	// 	// contenteditable_buttons
	// 		const contenteditable_buttons = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name 		: 'contenteditable_buttons'
	// 		})
	// 		contenteditable_buttons.addEventListener("click", (e)=>{
	// 			e.preventDefault()
	// 		})
	// 		contenteditable_buttons.appendChild(fragment)


	// 	return contenteditable_buttons
	// }//end get_contenteditable_buttons



/**
* DO_COMMAND
*/
	// const do_command = (command, val) => {
	// 	document.execCommand(command, false, (val || ""));
	// }



/**
* REPLACE_SELECTED_TEXT
*/
	// function replace_selected_text(replacementText) {
	// 	document.execCommand( 'insertText', false, replacementText );
	// }


