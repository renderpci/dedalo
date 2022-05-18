/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {tr} from '../../common/js/tr.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'



/**
* RENDER_edit_COMPONENT_TEXT_AREA
* Manage the components logic and appearance in client side
*/
export const render_edit_component_text_area = function() {

	return true
};//end render_edit_component_text_area



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

	// add events
		add_events(self, wrapper)

	// defaultParagraphSeparator for contenteditable
		// document.execCommand("defaultParagraphSeparator", false, "p");


	return wrapper
};//end edit



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

				const all_buttons_remove =wrapper.querySelectorAll('.remove')
					for (let i = all_buttons_remove.length - 1; i >= 0; i--) {
						all_buttons_remove[i].classList.add("display_none")
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
};//end add_events



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
};//end get_content_data_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	// const mode				= self.mode

	const fragment = new DocumentFragment()

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
};//end get_buttons



/**
* GET_INPUT_ELEMENT
* @return DOM element li
*/
const get_input_element = (i, current_value, self) => {

	const mode = self.mode

	// value is a raw html without parse into nodes (txt format)
		const value = self.tags_to_html(current_value)

	// li container
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// q operator (search only)
		if(mode==='search'){
			const q_operator = self.data.q_operator
			// input_q_operator
			ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				value			: q_operator,
				class_name		: 'q_operator',
				parent			: li
			})
		}

	// input contenteditable
		// const input = ui.create_dom_element({
		// 	element_type 	: 'div',
		// 	class_name 		: 'input_tex_area contenteditable',
		// 	dataset 	 	: { key : i },
		// 	inner_html 		: value,
		// 	contenteditable : true,
		// 	parent 		 	: li
		// })

	// init_current_text_editor
		const init_current_text_editor = function() {

			// service_tinymce
				const current_text_editor = new service_tinymce()

			// editor_config
				const editor_config = {
					plugins			: ['paste','image','print','searchreplace','code','noneditable'], // ,'fullscreen'
					toolbar			: 'bold italic underline undo redo searchreplace pastetext code | '+self.context.toolbar_buttons.join(' ')+' | button_save', // fullscreen
					custom_buttons	: get_custom_buttons(self, current_text_editor, i),
					custom_events	: get_custom_events(self, i, current_text_editor)
				}

			// init editor
				current_text_editor.init(self, li, {
					value			: value,
					key				: i,
					editor_config	: editor_config
				})
				.then(function(initied){
					// fix current_text_editor
					self.text_editor[i] = current_text_editor
				})

			return current_text_editor
		}//end init_current_text_editor

	// observer. init the editor when container node is in DOM
		const observer = new IntersectionObserver(function(entries) {
			// if(entries[0].isIntersecting === true) {}
			const entry = entries[1] || entries[0]
			if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
				observer.disconnect();

				init_current_text_editor()

				// observer.unobserve(entry.target);
			}
		}, { threshold: [0] });
		observer.observe(li);

	// persons
		const node_persons_list = render_persons_list(self, init_current_text_editor, i)
		li.appendChild(node_persons_list)

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
				// 		const last_tag_id			= self.get_last_tag_id('index', current_text_editor)
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
				// 						text_editor	: current_text_editor
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
};//end get_input_element



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

	// button_person
		custom_buttons.push({
			name	: "button_person",
			options	: {
				tooltip	: 'Show persons list',
				image	: '../themes/default/icons/person.svg',
				onclick	: function(evt) {
					event_manager.publish('toggle_persons_list_'+ self.id_base + '_' + i, {
						caller		: self,
						text_editor	: text_editor
					})
				}
			}
		})

	// button_geo
		custom_buttons.push({
			name	: "button_geo",
			options	: {
				tooltip	: 'Add georef',
				image	: '../themes/default/icons/geo.svg',
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
			name	: "button_note",
			options	: {
				tooltip	: 'Add note',
				image	: '../themes/default/icons/note.svg',
				onclick	: function(evt) {
					event_manager.publish('create_note_tag_'+ self.id_base, {
						caller		: self,
						text_editor	: text_editor
					})
				}
			}
		})

	// button_reference
		custom_buttons.push({
			name	: "button_reference",
			options	: {
				tooltip	: 'Add reference',
				image	: '../themes/default/icons/reference.svg',
				onclick	: function(evt) {
					alert("Adding reference !");
					// component_text_area.create_new_reference(ed, evt, text_area_component)
				}
			}
		})

	// button_delete_structuration
		custom_buttons.push({
			name	: "button_delete_structuration",
			options	: {
				text	: 'Delete chapter',
				tooltip	: 'Delete structuration',
				icon	: false,
				onclick	: function(evt) {
					alert("Deleting structuration !");
					// tool_lang.delete_structuration(ed, evt, text_area_component)
				}
			}
		})

	// button_add_structuration
		custom_buttons.push({
			name	: "button_add_structuration",
			options	: {
				text	: 'Add chapter',
				tooltip	: 'Add structuration',
				icon	: false,
				onclick	: function(evt) {
					alert("Adding structuration !");
					// tool_lang.add_structuration(ed, evt, text_area_component)
				}
			}
		})

	// button_change_structuration
		custom_buttons.push({
			name	: "button_change_structuration",
			options	: {
				text	: 'Change chapter',
				tooltip	: 'Change structuration',
				icon	: false,
				onclick	: function(evt) {
					alert("Changing structuration !");
					// tool_lang.change_structuration(ed, evt, text_area_component)
				}
			}
		})

	// button_save
		const save_label = get_label.salvar.replace(/<\/?[^>]+(>|$)/g, "") || "Save"
		custom_buttons.push({
			name	: "button_save",
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
};//end get_custom_buttons



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
		};//end focus

	// blur
		custom_events.blur = (evt, options) => {
			// save. text_editor save function calls current component save_value()
			text_editor.save()
		};//end blur

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
												console.log("tag_obj.data_tag:---------",tag_obj);
						component_text_area.show_person_info( {tag: tag_obj, caller: self, text_editor: text_editor} )
						break;

					case 'note':
						// Show note info
						event_manager.publish('click_tag_note_'+ self.id_base, {tag: tag_obj, caller: self, text_editor: text_editor})

						// component_text_area.show_note_info( ed, evt, text_area_component )
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
		};//end click

	// mouseup
		custom_events.MouseUp = (evt, options) => {
			// user text selection event
			const selection = options.selection
			event_manager.publish('text_selection_'+ self.id, {selection:selection, caller: self})
		};//end MouseUp

	// keyup
		custom_events.KeyUp = (evt, options) => {
			// use the observe property into ontology of the components to suscribe to this events

			switch( true ){

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
				case evt.ctrlKey && (evt.code.startsWith('Digit') || evt.code.startsWith('Numpad')):

					const number		= evt.code.match(/\d+/g);
					const person_tag	= self.context.tags_persons[number[0]]
					event_manager.publish('key_up_persons' +'_'+ self.id_base, number)
					const tag = build_node_tag(person_tag, person_tag.tag_id)
					text_editor.set_content(tag.outerHTML)

					break;
			}
		};//end KeyUp


	return custom_events
};//end get_custom_events



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
	const data_string	= JSON.stringify(data_tag.data)
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
};//end build_node_tag



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

	self.node[0].appendChild(layer_selector)

	return fragment
};//end render_layer_selector



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

	const page_selector = ui.attach_to_modal( header, body, footer)

	user_option_ok.addEventListener("click", (e) =>{
		e.preventDefault()
		const user_value = body_input.value
		if(user_value === null) {
			page_selector.renove()
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
		page_selector.remove()
	})

	user_option_cancelar.addEventListener("click", (e) =>{
		page_selector.remove()
	})


	return
};//end render_page_selector



/**
* RENDER_PERSONS_LIST
* @return DOM node fragment
*/
const render_persons_list = function(self, text_editor, i){

	// short vars
		const ar_persons = self.context.tags_persons
			console.log(`(!ar_persons) ${self.tipo}:`, ar_persons);

	const fragment = new DocumentFragment()

	// persons_list_container
		const persons_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'persons_list_container hide',
			parent			: fragment
		})

	// button_close
		const button_close = ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button icon close',
			parent			: persons_list_container
		})
		button_close.addEventListener("click", function(e){
			e.stopPropagation()
			persons_list_container.classList.toggle('hide')
		})

	// label
		ui.create_dom_element({
			element_type	: 'span',
			class_name 		: 'label',
			text_node 		: get_label.persons || 'Persons',
			parent			: persons_list_container
		})

	// if ar_persons is empty, stop and return the fragment
		if(!ar_persons || ar_persons.length === 0 || typeof(ar_persons)==='undefined') {
			return fragment
		}

	// person sections
		const datum		= self.context.related_sections || {}
		const context	= datum.context
		const data		= datum.data
		const sections	= data.find(el => el.typo==='sections')
		if(!sections){
			return fragment
		}

	// sections loop
		const value			= sections.value
		const value_length	= value.length
		let k = 0;
		for (let i = 0; i < value_length; i++) {

			const section_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'section_container',
				parent			: persons_list_container
			})

			const current_locator = {
				section_top_tipo	: value[i].section_tipo,
				section_top_id		: value[i].section_id
			}

			const section_label		= context.find(el => el.section_tipo===current_locator.section_top_tipo).label
			const ar_component_data	= data.filter(el => el.section_tipo===current_locator.section_top_tipo && el.section_id===current_locator.section_top_id)

			// ar_component_value
				const ar_component_value = []
				for (let j = 0; j < ar_component_data.length; j++) {
					const current_value = ar_component_data[j].value // toString(ar_component_data[j].value)
					ar_component_value.push(current_value)
				}

			// label
				const label = 	section_label + ' | ' +
								current_locator.section_top_id +' | ' +
								ar_component_value.join(' | ')

			// label DOM element
				const section_label_node = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'label',
					inner_html		: label,
					parent			: section_container
				})

			const ar_persons_for_this_section = ar_persons.filter(el => el.parent === current_locator.section_top_tipo && el.parent_section_id === current_locator.section_top_id)
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

					self.insert_person_image(ed, current_person.tag_id, current_person.state, current_person.label, current_person.data, evt)

					// Close persons selector
					persons_list_container.classList.toggle('hide')
				});
			}//end for (let j = 0; j < ar_persons_for_this_section.length; j++)
		}//end for (let i = 0; i < value_length; i++)


	// toggle_persons_list_ . User click over the button 'button_person'
		self.events_tokens.push(
			event_manager.subscribe('toggle_persons_list_' + self.id_base +'_'+i, ()=>{
				persons_list_container.classList.toggle('hide')
			})
		)



	return fragment
};//end render_persons_list




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
	// };//end get_contenteditable_buttons



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


