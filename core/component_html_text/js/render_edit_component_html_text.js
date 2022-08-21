/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'



/**
* render_edit_component_html_text
* Manage the components logic and appearance in client side
*/
export const render_edit_component_html_text = function() {

	return true
}//end render_edit_component_html_text



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_html_text.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

 	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// load
		// await self.init_editor()

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOm node content_data
*/
const get_content_data_edit = function(self) {

	const value				= self.data.value
	const is_inside_tool	= self.is_inside_tool

	// content_data
		const content_data = ui.component.build_content_data(self)

	// build values
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element(i, inputs_value[i], self, is_inside_tool)
			content_data.appendChild(input_element_node)
				// set the pointer
			content_data[i] = input_element_node
		}

	return content_data
}//end get_content_data_edit



/**
* GET_INPUT_ELEMENT
* @return DOM node content_value
*/
const get_input_element = (i, current_value, self) => {

	const mode = self.mode

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// q operator (search only)
		if(mode==='search'){
			const q_operator = self.data.q_operator
			const input_q_operator = ui.create_dom_element({
				element_type	: 'input',
				type			: 'text',
				value			: q_operator,
				class_name		: 'q_operator',
				parent			: content_value
			})
		}

	// service_tinymce
		const current_service = new service_tinymce()

		// editor_config
			const editor_config = {
				plugins : [
					"advlist autolink lists link image charmap print preview hr anchor pagebreak",
					"searchreplace wordcount visualblocks visualchars code",
					"insertdatetime nonbreaking save table contextmenu directionality",
					"emoticons template paste textcolor table" // fullscreen
				],
				toolbar : [
					"bold italic undo redo searchreplace | cut copy paste pastetext | alignleft aligncenter alignright alignjustify | forecolor backcolor | bullist numlist outdent indent table",
					"link image | fontsizeselect | print preview | code | button_upload" // fullscreen
				],
				custom_buttons	: get_custom_buttons(self, i, current_service),
				custom_events	: get_custom_events(self, i, current_service)
			}

		// init editor
			current_service.init({
				caller			: self,
				value_container	: content_value,
				value			: current_value,
				key				: i,
				editor_config	: editor_config
			})

	return content_value
}//end input_element



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
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
* GET_CUSTOM_BUTTONS
* @param instance self
* @param int i
*	self data element from array of values
* @return array custom_buttons
*/
const get_custom_buttons = (self, i, service) => {

	// custom_buttons
	const custom_buttons = []

	// const editor = get_editor()

	const button_name = "button_upload"

	// button_upload
		custom_buttons.push({
			name 	: button_name,
			options : {
				tooltip	: 'Insert image desde disco',
				image	: '../themes/default/icons/upload.svg',
				onclick	: function(evt) {
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
const get_custom_events = (self, i, service) => {

	const custom_events = {}

	custom_events.focus = (evt, options) => {

		event_manager.publish('active_component', self)
	}//end focus

	custom_events.blur = (evt, options) => {
		// save. service save function calls current component save_value()
			const actual_value 	= self.data.value[i]
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
					const tipo			= text_area_component.dataset.tipo
					const lang			= text_area_component.dataset.lang
					const section_tipo	= text_area_component.dataset.section_tipo
					const parent		= text_area_component.dataset.parent

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


