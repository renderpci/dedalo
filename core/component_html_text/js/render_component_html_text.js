/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_html_text = function() {

	return true
}//end render_component_html_text


/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_html_text.prototype.list = async function() {

	const self = this

	// Options vars
		const context 		= self.context
		const data 			= self.data
		const value 		= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Value as string
		const value_string = value.join(self.divisor)

	// Set value
		wrapper.innerHTML = value_string

	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_html_text.prototype.edit = async function(options={render_level : 'full'}) {

	const self = this

 	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const render_level = options.render_level

	//load
	//await self.init_editor()

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	// add events
		add_events(self, wrapper)

	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		function add_element(changed_data) {
			const inputs_container = wrapper.querySelector('.inputs_container')
			// add new dom input element
			const input_element = get_input_element(changed_data.key, changed_data.value, self)
			inputs_container.appendChild(input_element)
		}

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
				if (e.target.matches('.button.add')) {

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

			// change_mode
				if (e.target.matches('.button.close')) {

					// change mode
					self.change_mode('list', false)

					return true
				}

			//const current_buttons_editor = document.querySelector(".buttons_editor")
			//if (current_buttons_editor) current_buttons_editor.remove()

		}, false)


	return true
}//end add_events



/**
* GET_CONTENT_DATA_EDIT
* @return
*/
const get_content_data_edit = async function(self) {

	const value = self.data.value

	const fragment 			= new DocumentFragment()
	const is_inside_tool 	= ui.inside_tool(self)

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// build values
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			//input_element(i, inputs_value[i], inputs_container, self)
			const input_element = get_input_element(i, inputs_value[i], self, is_inside_tool)
			inputs_container.appendChild(input_element)
		}

	// buttons
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: fragment
		})

	// button close input
		if(self.mode==='edit_in_list' && !is_inside_tool){
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button close',
				parent 			: buttons_container
			})
		}

	// button add input
		// if(self.mode==='edit' || 'edit_in_list'){
		// 	const button_add_input = ui.create_dom_element({
		// 		element_type	: 'span',
		// 		class_name 		: 'button add',
		// 		parent 			: buttons_container
		// 	})
		// }

	// tools
		if (!is_inside_tool) ui.add_tools(self, buttons_container)

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = (i, current_value, self, is_inside_tool) => {

	const mode 		= self.mode

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// q operator (search only)
		if(mode==='search'){
			const q_operator = self.data.q_operator
			const input_q_operator = ui.create_dom_element({
				element_type 	: 'input',
				type 		 	: 'text',
				value 		 	: q_operator,
				class_name 		: 'q_operator',
				parent 		 	: li
			})
		}

	// input contenteditable
		// const input = ui.create_dom_element({
		// 	element_type 	: 'div',
		// 	class_name 		: 'input_tex_area contenteditable',
		// 	dataset 	 	: { key : i },
		// 	inner_html 		: current_value,
		// 	contenteditable : true,
		// 	parent 		 	: li
		// })

	// service_tinymce
		const get_service = () => { return current_service; }
		// editor_config
		const editor_config   		 = {}
		editor_config.plugins 		 = [
							"advlist autolink lists link image charmap print preview hr anchor pagebreak",
							"searchreplace wordcount visualblocks visualchars code fullscreen",
							"insertdatetime nonbreaking save table contextmenu directionality",
							"emoticons template paste textcolor table"
							]
		editor_config.toolbar 		 = [
							"bold italic undo redo searchreplace | cut copy paste pastetext | alignleft aligncenter alignright alignjustify | forecolor backcolor | bullist numlist outdent indent table",
							"link image | fontsizeselect | print preview fullscreen | code | button_upload"
							]
		editor_config.custom_buttons = get_custom_buttons(self, i, get_service)
		editor_config.custom_events  = get_custom_events(self, i, get_service)

		// init editor
		const current_service = new service_tinymce()
		current_service.init(self, li, {
			value 			: current_value,
			key 			: i,
			editor_config 	: editor_config
		})

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

}//end input_element



/**
* GET_CUSTOM_BUTTONS
* @param instance self
* @param int i
*	self data element from array of values
* @return array custom_buttons
*/
const get_custom_buttons = (self, i, get_service) => {

	// custom_buttons
	const custom_buttons = []

	// const editor = get_editor()

	let button_name

	// button_upload
		button_name = "button_upload"
		custom_buttons.push({
			name 	: button_name,
			options : {
				tooltip: 'Insert image desde disco',
				image:  '../themes/default/icons/upload.svg',
				onclick: function(evt) {
					alert("Inserting image !");
					// component_text_area.load_tags_person() //ed, evt, text_area_component
					//id 		: 'upload-'+html_text_id
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
* @return object custom_events
*/
const get_custom_events = (self, i, get_service) => {

	const custom_events = {}

	custom_events.focus = (evt, options) => {

		event_manager.publish('active_component', self)
	}//end focus

	custom_events.blur = (evt, options) => {
		// save. service save function calls current component save_value()
			const actual_value 	= self.data.value[i]
			const service 		= get_service()
			service.save(actual_value)
	}//end blur

	custom_events.click = (evt, options) => {
		// img : click on img
		if(evt.target.nodeName==='IMG' || evt.target.nodeName==='REFERENCE') {
			switch(evt.target.className) {

				case 'tc':
					// Video goto timecode by tc tag
					const timecode = evt.target.dataset.data
					// component_text_area.goto_time(timecode);
					alert("Click on image/reference tc "+timecode);
					break;

				case 'indexIn' :
				case 'indexOut' :
					var tipo 			= text_area_component.dataset.tipo
					var	lang 			= text_area_component.dataset.lang
					var	section_tipo 	= text_area_component.dataset.section_tipo
					var	parent 			= text_area_component.dataset.parent

					switch(page_globals.modo) {

						case 'edit' :
							// INSPECTOR : Show info about indexations in inspector
							tool_indexation.load_inspector_indexation_list(tag_obj, tipo, parent, section_tipo, lang)

							// RELATIONS
							//component_text_area.load_relation(tag, tipo, parent, section_tipo);
							//alert("Show info about in inspector relations - context_name:"+get_current_url_vars()['context_name'])

							// PORTAL SELECT FRAGMENT FROM TAG BUTTON
							if (page_globals.context_name=='list_into_tool_portal') {
								// Show hidden button link_fragmet_to_portal and configure to add_resource
								component_text_area.show_button_link_fragmet_to_portal(tag_obj, tipo, parent, section_tipo);
							}
							break;

						case 'tool_indexation' :
							// Show info about in tool relation window
							component_text_area.load_fragment_info_in_indexation(tag_obj, tipo, parent, section_tipo, lang);	//alert(tag+' - '+ tipo+' - '+ parent)
							break;
					}
					// mask_tags on click image index
					mce_editor.mask_tags(ed, evt);
					break;

				case 'svg' :
					// not defined yet
					break;

				case 'draw' :
					// Load draw editor
					switch(page_globals.modo) {

						case 'tool_transcription' :
							if (typeof component_image==="undefined") {
								console.warn("[mde_editor.image_command] component_image class is not avilable. Ignored draw action");
							}else{
								component_image.load_draw_editor(tag_obj);
							}
							break;

						case 'edit' :
							var canvas_id = text_area_component.dataset.canvas_id;
							if (typeof component_image_read!=="undefined") {
								component_image_read.load_draw_editor_read(tag_obj, canvas_id);
							}else{
								console.log("component_image_read is lod loaded! Ignoring action load_draw_editor_read");
							}
							break;
					}
					break;

				case 'geo' :
					// Load geo editor
					switch(page_globals.modo) {
						case 'edit' :
						case 'tool_transcription' :
							if (typeof component_geolocation==="undefined") {
								console.warn("[mde_editor.image_command] component_geolocation class is not avilable. Ignored geo action");
							}else{
								component_geolocation.load_geo_editor(tag_obj);
							}
							break;
					}
					break;

				case 'person':
					// Show person info
					component_text_area.show_person_info( ed, evt, text_area_component )
					break;
				case 'note':
					// Show note info
					component_text_area.show_note_info( ed, evt, text_area_component )
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
			}//end switch
		}else if(evt.target.nodeName==='LABEL') {
			// Fix text area selection values
			if (page_globals.modo==='tool_lang') {
				component_text_area.show_structuration_info(ed, evt, text_area_component)
			}
		}else{
			// Sets styles on all paragraphs in the currently active editor
			// if (ed.dom.select('img').length>0) {
			// 	ed.dom.setStyles(ed.dom.select('img'), {'opacity':'0.8'});
			// }
		}//end click on img
	}//end click

	custom_events.MouseUp = (evt, options) => {
		// console.log("options.selection:",options.selection);
		// CREATE_FRAGMENT_COMMAND
		// mce_editor.create_fragment_command(ed,evt,text_area_component)
	}//end MouseUp

	return custom_events
}//end get_custom_events
