/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {keyboard_codes} from '../../../core/common/js/utils/keyboard.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'


/**
* RENDER_TOOL_TRANSCRIPTION
* Manages the component's logic and apperance in client side
*/
export const render_tool_transcription = function() {

	return true
};//end render_tool_transcription



/**
* EDIT
* Render node
* @return DOM node
*/
render_tool_transcription.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})


	// modal container
		const header = wrapper.querySelector('.tool_header')
		const modal  = ui.attach_to_modal(header, wrapper, null, 'big')
		modal.on_close = () => {
			self.destroy(true, true, true)
			// refresh source component text area
				if (self.transcription_component) {
					self.transcription_component.refresh()
				}
		}

	// related_list. This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
		const related_list_node = render_related_list(self)
		header.appendChild(related_list_node)

	console.log("related_list_node:",related_list_node);

	return wrapper
};//end render_tool_transcription



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()


	// left_container
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_container',
			parent			: fragment
		})

		// lang selector
			const lang_selector = ui.build_select_lang({
				id			: "index_lang_selector",
				selected	: self.lang,
				class_name	: 'dd_input',
				action		: async function(e){
					// create new one
					const component = await self.get_component(e.target.value)

					component.render().then(function(node){
						// remove previous nodeS
						while (left_container.lastChild && left_container.lastChild.id!==lang_selector.id) {
							left_container.removeChild(left_container.lastChild)
						}
						// add the new one
						left_container.appendChild(node)
					})
				}
			})
			left_container.appendChild(lang_selector)

		// component_text_area. render another node of component caller and append to container
			const component_text_area = self.transcription_component || await self.get_component(self.lang)
			component_text_area.render()
			.then(function(node){
				left_container.appendChild(node)
			})

	// component right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'right_container',
			parent 			: fragment
		})
		self.media_component.mode = 'player'
		const media_component_node = await self.media_component.render();

		right_container.appendChild(media_component_node)

		// Slider for control audiovisual speed
			const slider_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'slider_container',
				parent 			: right_container
			})
			const slider_label = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'slider_label',
				inner_html 		: get_label.play_speed || 'Play speed',
				parent 			: slider_container
			})
			const slider = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'slider',
				parent 			: slider_container
			})
				const output = ui.create_dom_element({
					element_type	: 'output',
					class_name		: 'speed_range_value',
					parent			: slider,
					value 			: 1
				})
				const range = ui.create_dom_element({
					element_type	: 'input',
					class_name 		: 'slider',
					type 			: 'range',
					parent 			: slider
				})
				range.value = output.value
				range.min = 0
				range.max = 2
				range.step = 0.1
				range.addEventListener('change', function(){
					output.value = range.value
					self.media_component.set_playback_rate(range.value)
				})

		// Inputs options for keyboard control and rewind controls
			const transcription_keys = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'transcription_keys',
				parent 			: right_container
			})
			// play / pause key used to stop and rewind the video, it change the text_area default key to the users specify
				const playpause_key = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'playpause_key',
					parent 			: transcription_keys
				})
					const playpause_key_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html		: get_label.play_pause_key || 'Play/pause key',
						parent			: playpause_key
					})
					const playpause_key_input = ui.create_dom_element({
						element_type	: 'input',
						type 			: 'text',
						parent 			: playpause_key
					})
					// get the cookie of the key
					const av_playpause_key_value = localStorage.getItem('av_playpause_key')

					const av_playpause_keyboard_code		= av_playpause_key_value ? av_playpause_key_value : 'Escape' // Default 'Escape'
					// get the user friendly name of the key code based in specific object imported form /common/utils/js/keyborad.js
					const av_playpause_keyboard_key			= keyboard_codes[av_playpause_keyboard_code]
					component_text_area.av_play_pause_code	= av_playpause_keyboard_code
					playpause_key_input.value				= av_playpause_keyboard_key

					playpause_key_input.addEventListener('keyup', function(event){
						const keyborard_code					= event.code
						const keyborard_key						= event.key
						// set the cookie of the key
						localStorage.setItem('av_playpause_key', keyborard_code);
						playpause_key_input.value				= keyborard_key
						component_text_area.av_play_pause_code	= keyborard_code
					})
				// rewind value is the time that the av rewind when is paused by the play/pause key
				// it change the text_area default rewind time to the user has specify
				const av_rewind_secs = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'av_rewind_secs',
					parent 			: transcription_keys
				})
					const av_rewind_secs_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html		: get_label.auto_rewind || 'Auto-rewind',
						parent			: av_rewind_secs
					})
					const av_rewind_secs_input = ui.create_dom_element({
						element_type	: 'input',
						type 			: 'text',
						parent 			: av_rewind_secs
					})
					const av_rewind_secs_name = ui.create_dom_element({
						element_type	: 'span',
						parent 			: av_rewind_secs,
						inner_html		: get_label.seconds_abbr || 'sec/s.'
					})
					// get the cookie of the key
					const av_rewind_secs_value = localStorage.getItem('av_rewind_secs')
					const secs_val  = av_rewind_secs_value ? av_rewind_secs_value : 3; // Default 3 sec

					// Set value from cookie or default
					av_rewind_secs_input.value				= secs_val
					component_text_area.av_rewind_seconds	= secs_val

					av_rewind_secs_input.addEventListener('keyup', function(event){
						// if the key pressed is not a number use the default
						const value = parseInt(event.key)
							? parseInt(event.key)
							: 3
						// set the cookie of the key
						localStorage.setItem('av_rewind_secs', value);
						av_rewind_secs_input.value				= value
						component_text_area.av_rewind_seconds	= value
					})

				// tag key is used to get the tc from av and insert the tag in the text_area
				// the user could change the default key "f2" to other key
				// it change the text_area default key to the users specify
				const tag_insert_key = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'tag_insert_key',
					parent 			: transcription_keys
				})
					const tag_insert_key_label = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'label',
						inner_html		: get_label.insert_tag || 'Insert tag',
						parent			: tag_insert_key
					})
					const tag_insert_key_input = ui.create_dom_element({
						element_type	: 'input',
						type 			: 'text',
						parent 			: tag_insert_key
					})
					// get the cookie of the key
					const tag_insert_key_value = localStorage.getItem('tag_insert_key')

					const tag_insert_keyboard_code			= tag_insert_key_value ? tag_insert_key_value : 'F2' // Default 'F2'
					// get the user friendly name of the key code based in specific object imported form /common/utils/js/keyborad.js
					const tag_insert_keyboard_key			= keyboard_codes[tag_insert_keyboard_code]
					tag_insert_key_input.value				= tag_insert_keyboard_key
					component_text_area.av_insert_tc_code	= tag_insert_keyboard_code

					tag_insert_key_input.addEventListener('keyup', function(event){
						const keyborard_code					= event.code
						const keyborard_key						= event.key
						// set the cookie of the key
						localStorage.setItem('tag_insert_key', keyborard_code);
						tag_insert_key_input.value				= keyborard_key
						component_text_area.av_insert_tc_code	= keyborard_code
					})

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit



/**
* RENDER_RELATED_LIST
* This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
*/
const render_related_list = function(self){

	const datum		= self.related_sections_list
	const context	= datum.context
	const data		= datum.data

	const fragment = new DocumentFragment();

	// related list
		const related_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'related_list_container',
			parent			: fragment
		})
		const select = ui.create_dom_element({
			element_type	: 'select',
			parent			: related_list_container
		})

	// select -> options
		const sections		= data.find(el => el.typo==='sections')
		const value			= sections.value
		const value_length	= value.length
		for (let i = 0; i < value_length; i++) {

			const current_locator = {
				section_top_tipo	: value[i].section_tipo,
				section_top_id		: value[i].section_id
			}
			// fix the first locator when tool is loaded (without user interaction)
				if(i===0){
					self.top_locator = current_locator
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

			// option DOM element
				const option = ui.create_dom_element({
					element_type	: 'option',
					inner_html		: label,
					parent			: select
				})
				option.locator = current_locator

		}//end for

	// event . Change
		select.addEventListener("change", async function(e){
			self.top_locator = this.options[this.selectedIndex].locator
		})

	return fragment
};//end render_related_list
