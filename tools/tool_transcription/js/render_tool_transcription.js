// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {keyboard_codes} from '../../../core/common/js/utils/keyboard.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'
	import {open_tool} from '../../tool_common/js/tool_common.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_TRANSCRIPTION
* Manages the component's logic and appearance in client side
*/
export const render_tool_transcription = function() {

	return true
}//end render_tool_transcription



/**
* EDIT
* Render tool main node
* @param object options = {}
* @return HTMLElement wrapper
*/
render_tool_transcription.prototype.edit = async function(options={}) {

	const self = this

	// options
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

	// headers items
		const promises = []
		// transcription_options are the buttons to get access to other tools (buttons in the header)
		promises.push(
			render_tanscription_options(self)
		)
		// process status, render the status components for users and admins to control the process of the tool
		promises.push(
			render_process_status(self)
		)
		// rendered in parallel but in the proper order
		Promise.all(promises)
		.then((nodes) => {
			nodes.forEach(function (node, index) {
				wrapper.tool_buttons_container.appendChild(node)
			})
		})

	// render_activity_info are the information of the activity as "Save"
		const activity_info_node = await render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info_node)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// left_container
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_container',
			parent			: fragment
		})

	// component_text_area. render another node of component caller and append to container
		const component_text_area = self.transcription_component
		// set auto_init_editor for convenience
		component_text_area.auto_init_editor = true
		const component_text_area_node = await component_text_area.render()
		left_container.appendChild(component_text_area_node)

	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'right_container',
			parent 			: fragment
		})

	// media_component
		self.media_component.mode			= 'edit'
		self.media_component.context.view	= 'player'
		await self.media_component.build(false)
		const media_component_node = await self.media_component.render();
		right_container.appendChild(media_component_node)

	// component_av specifics
		if (self.media_component.model==='component_av') {

			media_component_node.classList.add('with_addons')

			// slider for control audiovisual speed
				const slider_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'slider_container',
					parent 			: right_container
				})
				const slider_label = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'slider_label',
					inner_html 		: self.get_tool_label('play_speed') || 'Play speed',
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
					range.value	= output.value
					range.min	= 0
					range.max	= 2
					range.step	= 0.1
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
							inner_html		: self.get_tool_label('play_pause') || 'Play/pause key',
							parent			: playpause_key
						})
						const playpause_key_input = ui.create_dom_element({
							element_type	: 'input',
							type 			: 'text',
							parent 			: playpause_key
						})
						// get the cookie of the key
						const av_playpause_key_value		= localStorage.getItem('av_playpause_key')
						const av_playpause_keyboard_code	= av_playpause_key_value ? av_playpause_key_value : 'Escape' // Default 'Escape'
						// get the user friendly name of the key code based in specific object imported form /common/utils/js/keyborad.js
						const av_playpause_keyboard_key										= keyboard_codes[av_playpause_keyboard_code]
						component_text_area.context.features.av_player.av_play_pause_code	= av_playpause_keyboard_code
						playpause_key_input.value											= av_playpause_keyboard_key

						playpause_key_input.addEventListener('keyup', function(event){
							const keyborard_code	= event.code
							const keyborard_key		= event.key
							// set the cookie of the key
							localStorage.setItem('av_playpause_key', keyborard_code);
							playpause_key_input.value											= keyborard_key
							component_text_area.context.features.av_player.av_play_pause_code	= keyborard_code
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
							inner_html		: self.get_tool_label('auto_rewind') || 'Auto-rewind',
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
							inner_html		: self.get_tool_label('seconds_abbr') || 'sec/s.'
						})
						// get the cookie of the key
						const av_rewind_secs_value = localStorage.getItem('av_rewind_secs')
						const secs_val  = av_rewind_secs_value ? av_rewind_secs_value : 3; // Default 3 sec

						// Set value from cookie or default
						av_rewind_secs_input.value				= secs_val
						component_text_area.context.features.av_player.av_rewind_seconds	= secs_val

						av_rewind_secs_input.addEventListener('change', function(event){
							// if the key pressed is not a number use the default
							const value = parseInt(event.target.value)
								? parseInt(event.target.value)
								: 3
							// set the cookie of the key
							localStorage.setItem('av_rewind_secs', value);
							av_rewind_secs_input.value				= value
							component_text_area.context.features.av_player.av_rewind_seconds	= value
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
							inner_html		: self.get_tool_label('insert_tag') || 'Insert tag',
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
						component_text_area.context.features.av_player.av_insert_tc_code	= tag_insert_keyboard_code

						tag_insert_key_input.addEventListener('keyup', function(event){
							const keyborard_code					= event.code
							const keyborard_key						= event.key
							// set the cookie of the key
							localStorage.setItem('tag_insert_key', keyborard_code);
							tag_insert_key_input.value				= keyborard_key
							component_text_area.context.features.av_player.av_insert_tc_code	= keyborard_code
						})

			// subtitles_block
				const subtitles_block = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'subtitles_block block_separator',
					parent 			: right_container
				})

				// button_build_subtitles
					const button_build_subtitles = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'light btn_subtitles',
						inner_html		: self.get_tool_label('build_subtitles') || 'Build subtitles',
						parent			: subtitles_block
					})
					button_build_subtitles.addEventListener('click', function(evt) {
						const subtitles_characters_value = localStorage.getItem('subtitles_characters_per_line')
					})

				// input characters per line
					const input_characters_per_line = ui.create_dom_element({
						element_type	: 'input',
						type			: 'text',
						parent			: subtitles_block
					})

				// label_characters_per_line
					ui.create_dom_element({
						element_type	: 'span',
						class_name		: 'label',
						inner_html		: self.get_tool_label('chars_per_line') || 'Characters per line',
						parent			: subtitles_block
					})

				// get the cookie of the key
					const subtitles_characters_value = localStorage.getItem('subtitles_characters_per_line')
					const chatacters_val  = subtitles_characters_value ? subtitles_characters_value : 90; // Default 90 sec

					// Set value from cookie or default
					input_characters_per_line.value				= chatacters_val
					// component_text_area.av_rewind_seconds	= chatacters_val

					input_characters_per_line.addEventListener('change', function(event){
						// if the key pressed is not a number use the default
						const value = parseInt(event.target.value)
							? parseInt(event.target.value)
							: 90
						// set the cookie of the key
						localStorage.setItem('subtitles_characters_per_line', value);
						input_characters_per_line.value				= value
						// component_text_area.av_rewind_seconds	= value
					})

			// automatic_transcription block
				const automatic_transcription_block = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'automatic_transcription_block',
					parent 			: right_container
				})

				// check if tool has transcriber engine configuration
				const transcriber_engine = (self.context.config)
					? self.context.config.transcriber_engine.value
					: false

				if (transcriber_engine) {
					const automatic_transcription_node = build_automatic_transcription({
						self					: self,
						source_select_lang		: self.transcription_component.lang,
						transcripton_container	: component_text_area_node
					})
					automatic_transcription_block.appendChild(automatic_transcription_node)
				}//end if (transcriber_engine)


		}//end if (self.media_component.model==='component_av') {

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)
		// save the pointers of the content_data nodes, to used by the buttons to access to the components
		content_data.left_container		= left_container
		content_data.right_container	= right_container


	return content_data
}//end get_content_data_edit



/**
* RENDER_RELATED_LIST
* This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
*/
const render_related_list = function(self){

	const datum		= self.relation_list
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
		const sections = data.find(el => el.typo==='sections')
		// if the section is not called by other sections (related sections) return empty node
		if(!sections){
			return fragment
		}
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

	// event change
		select.addEventListener('change', async function(e){
			self.top_locator = this.options[this.selectedIndex].locator
		})


	return fragment
}//end render_related_list



/**
* RENDER_TANSCRIPTION_OPTIONS
* This is used to build a optional buttons inside the header
* @param object self
* @return HTMLElement fragment
*/
const render_tanscription_options = async function(self) {

	const fragment = new DocumentFragment()

	// related_list. This is used to build a select element to allow user select the top_section_tipo and top_section_id of current indexation
		const related_list_node = render_related_list(self)
		fragment.appendChild(related_list_node)

	// lang selector
		const lang_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'lang_selector',
			parent			: fragment
		})
		const lang_label = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'lang_label',
			inner_html 		: get_label.language || 'Language',
			parent 			: lang_container
		})
		// the lang selector use the content_data pointer .left_container to remove the transcription text_area and rebuild the new node
		const lang_selector = ui.build_select_lang({
			selected	: self.lang,
			class_name	: 'dd_input selector',
			action		: async function(e){
				const lang = e.target.value
				self.transcription_component.lang = lang
				self.transcription_component.refresh()
			}
		})
		lang_container.appendChild(lang_selector)

	// external tools
		const ar_register_tools	= await self.get_user_tools(['tool_time_machine', 'tool_tr_print'])
		const tool_tr_print		= ar_register_tools.find(el => el.name === 'tool_tr_print')
		const tool_tm			= ar_register_tools.find(el => el.name === 'tool_time_machine')

	// Button tool transcription print
		if(tool_tr_print) {
			const tool_tr_print_button = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'tool_button tool_tr_print light',
				title			: tool_tr_print.label || 'Tool Transcription',
				parent			: fragment
			})
			const tool_tr_print_icon = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'icon',
				src				: tool_tr_print.icon
			})
			tool_tr_print_button.prepend(tool_tr_print_icon)
			tool_tr_print_button.addEventListener('click', function(event) {
				event.stopPropagation();
				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_tr_print,
						caller			: self.transcription_component
					})
			})
		}

	// Button tool time machine
		if(tool_tm) {
			const tool_tm_button = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'tool_button tool_tm_button light',
				title			: tool_tm.label || 'Tool Time machine',
				parent			: fragment
			})
			const tool_tm_icon = ui.create_dom_element({
				element_type	: 'img',
				class_name		: 'icon',
				src				: tool_tm.icon,
				parent			: tool_tm_button
			})
			tool_tm_button.prepend(tool_tm_icon)
			tool_tm_button.addEventListener('click', function(event) {
				event.stopPropagation();
				// open_tool (tool_common)
					open_tool({
						tool_context	: tool_tm,
						caller			: self.transcription_component
					})
			})
		}

	return fragment
}//end render_tanscription_options



/**
* RENDER_PROCESS_STATUS
* Render the status components to get control of the process of the tool
* the components are defined in ontology as tool_config->name_of_the_tool->ddo_map
* @param object self
* 	instance of current tool
* @return HTMLElement fragment
*/
const render_process_status = async function(self) {

	const fragment = new DocumentFragment()

	// status_user_component
		if (self.status_user_component) {
			self.status_user_component.context.view	= 'mini'
			self.status_user_component.is_inside_tool = true
			self.status_user_component.show_interface.save_animation = false
			const status_user_node = await self.status_user_component.render()
			fragment.appendChild(status_user_node)
		}

	// status_admin_component
		if (self.status_admin_component) {
			self.status_admin_component.context.view = 'mini'
			self.status_admin_component.is_inside_tool = true
			self.status_admin_component.show_interface.save_animation = false
			const status_admin_node	= await self.status_admin_component.render()
			fragment.appendChild(status_admin_node)
		}


	return fragment
}//end render_process_status



/**
* RENDER_ACTIVITY_INFO
* This is used to build a optional buttons inside the header
* @param object self
* 	instance of current tool
* @return HTMLElement activity_info_body
*/
const render_activity_info = async function(self) {

	// activity alert
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body'
		})

	// event save
		self.events_tokens.push(
			event_manager.subscribe('save', fn_saved)
		)
		function fn_saved(options) {

			// revived options contains an object with instance and api_response
			const node_info_options = Object.assign(options, {
				container : activity_info_body
			})

			// render notification node
			const node_info = render_node_info(node_info_options)
			activity_info_body.prepend(node_info)
		}


	return activity_info_body
}//end render_activity_info



/**
* BUILD_AUTOMATIC_TRANSCRIPTION
*/
const build_automatic_transcription = (options) => {


	const self						= options.self
	const source_select_lang		= options.source_select_lang
	const transcripton_container	= options.transcripton_container

	const transcriber_engine = (self.context.config)
		? self.context.config.transcriber_engine.value
		: false

	const transcriber_quality = (self.context.config)
		? self.context.config.transcriber_quality
		: false

	// container
		const automatic_transcription_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'automatic_transcription_container block_separator'
		})

	// button
		const button_automatic_transcription = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_automatic_transcription',
			inner_html		: self.get_tool_label('automatic_transcription') || "Automatic transcription",
			parent			: automatic_transcription_container
		})

		button_automatic_transcription.addEventListener('click', () => {

			transcripton_container.classList.add('loading')

			self.automatic_transcription({
					transcriber_engine	: self.transcriber_engine_select.value,
					transcriber_quality	: self.transcriber_engine_quality  && self.transcriber_engine_quality.value
						? self.transcriber_engine_quality.value
						: false,
					source_lang			: source_select_lang
			})
			.then((response)=>{
				transcripton_container.classList.remove('loading')
				// user messages
				const msg_type = (response.result===false) ? 'error' : 'ok'
				ui.show_message(automatic_transcription_container, response.msg, msg_type)
			})
		})

	// select engine
		// label
		ui.create_dom_element({
			element_type	: 'span',
			inner_html		: self.get_tool_label('engine') || 'Quality',
			parent 			: automatic_transcription_container
		})

		self.transcriber_engine_select = ui.create_dom_element({
			element_type	: 'select',
			parent 			: automatic_transcription_container
		})
		for (let i = 0; i < transcriber_engine.length; i++) {

			const engine = transcriber_engine[i]

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: engine.name,
				inner_html		: engine.label,
				parent			: self.transcriber_engine_select
			})
			if (self.target_transcriber===engine.name) {
				option.selected = true
			}
		}
		self.transcriber_engine_select.addEventListener('change', function(){
			data_manager.set_local_db_data({
				id		: 'transcriber_engine_select',
				value	: self.transcriber_engine_select.value
			}, 'status')
		})

	// select quality of transcriber
		if(transcriber_quality){
			// label
			ui.create_dom_element({
				element_type	: 'span',
				inner_html		: self.get_tool_label('quality') || 'Quality',
				parent 			: automatic_transcription_container
			})

			self.transcriber_engine_quality = ui.create_dom_element({
				element_type	: 'select',
				parent 			: automatic_transcription_container
			})
			const quality_value = transcriber_quality.value
			for (let i = 0; i < quality_value.length; i++) {

				const quality	= quality_value[i]
				const label		= self.get_tool_label(quality.label) || quality.label

				const option = ui.create_dom_element({
					element_type	: 'option',
					value			: quality.name,
					inner_html		: label,
					parent			: self.transcriber_engine_quality
				})
				if (transcriber_quality.default===quality.name) {
					option.selected = true
				}
			}
			self.transcriber_engine_quality.addEventListener('change', function(){
				data_manager.set_local_db_data({
					id		: 'transcriber_engine_quality',
					value	: self.transcriber_engine_quality.value
				}, 'status')
			})
		}// end if(transcriber_quality)


	return automatic_transcription_container
}//end build_automatic_transcription



// @license-end