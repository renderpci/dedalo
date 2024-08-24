// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {keyboard_codes} from '../../../core/common/js/utils/keyboard.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'
	import {open_tool} from '../../tool_common/js/tool_common.js'



/**
* RENDER_TOOL_SUBTITLES
* Manages the component's logic and appearance in client side
*/
export const render_tool_subtitles = function() {

	return true
}//end render_tool_subtitles



/**
* EDIT
* Render node
* @return HTMLElement wrapper
*/
render_tool_subtitles.prototype.edit = async function(options={render_level:'full'}) {

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

	// transcription_options are the buttons to get access to other tools (buttons in the header)
		const tanscription_options = await render_subtitles_options(self, content_data)
		wrapper.tool_buttons_container.appendChild(tanscription_options)

	// render_activity_info are the information of the activity as "Save"
		const activity_info = render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info)


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

	// create the nodes for the subtitles
		const subtitles_nodes = render_subtitles(self)
		.then(function(node){
			left_container.appendChild(node)
		})

	// component_text_area.component caller
		const component_text_area = self.caller

		// component_text_area.render()
		// .then(function(node){
		// 	left_container.appendChild(node)
		// })

	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'right_container',
			parent 			: fragment
		})

	// media_component
		self.media_component.mode = 'player'
		await self.media_component.build(true)
		const media_component_node = await self.media_component.render();
		right_container.appendChild(media_component_node)

	// component_av specifics
		if (self.media_component.model==='component_av') {
			// slider for control audiovisual speed
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

						const av_playpause_keyboard_code									= av_playpause_key_value ? av_playpause_key_value : 'Escape' // Default 'Escape'
						// get the user friendly name of the key code based in specific object imported form /common/utils/js/keyborad.js
						const av_playpause_keyboard_key										= keyboard_codes[av_playpause_keyboard_code]
						component_text_area.features.context.av_player.av_play_pause_code	= av_playpause_keyboard_code
						playpause_key_input.value											= av_playpause_keyboard_key

						playpause_key_input.addEventListener('keyup', function(event){
							const keyborard_code					= event.code
							const keyborard_key						= event.key
							// set the cookie of the key
							localStorage.setItem('av_playpause_key', keyborard_code);
							playpause_key_input.value									= keyborard_key
							component_text_area.features.context.av_player.av_play_pause_code	= keyborard_code
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
						component_text_area.features.context.av_player.av_rewind_seconds	= secs_val

						av_rewind_secs_input.addEventListener('change', function(event){
							// if the key pressed is not a number use the default
							const value = parseInt(event.target.value)
								? parseInt(event.target.value)
								: 3
							// set the cookie of the key
							localStorage.setItem('av_rewind_secs', value);
							av_rewind_secs_input.value				= value
							component_text_area.features.context.av_player.av_rewind_seconds	= value
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
						component_text_area.features.context.av_player.av_insert_tc_code	= tag_insert_keyboard_code

						tag_insert_key_input.addEventListener('keyup', function(event){
							const keyborard_code					= event.code
							const keyborard_key						= event.key
							// set the cookie of the key
							localStorage.setItem('tag_insert_key', keyborard_code);
							tag_insert_key_input.value				= keyborard_key
							component_text_area.features.context.av_player.av_insert_tc_code	= keyborard_code
						})

			// subtitles_block
				const subtitles_block = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'subtitles_block',
					parent 			: right_container
				})

				// button_build_subtitles
					ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'light btn_subtitles',
						inner_html		: get_label.build_subtitles || 'Build subtitles',
						parent			: subtitles_block
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
						inner_html		: get_label.characters_per_line || 'Characters per line',
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
* RENDER_SUBTITLES_OPTIONS
* This is used to build a optional buttons inside the header
* @return HTMLElement fragment
*/
const render_subtitles_options = async function(self, content_data) {

	const fragment = new DocumentFragment()

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
			id			: "index_lang_selector",
			selected	: self.lang,
			class_name	: 'dd_input',
			action		: async function(e){
				// create new one
				await self.get_subtitles_data(e.target.value)
				self.lang = e.target.value
				render_subtitles(self).then(function(node){
					// remove previous nodes
					while (content_data.left_container.lastChild) {//} && content_data.left_container.lastChild.id!==lang_selector.id) {
						content_data.left_container.removeChild(content_data.left_container.lastChild)
					}
					// add the new one
					content_data.left_container.appendChild(node)
				})
			}
		})
		lang_container.appendChild(lang_selector)

	// external tools
		const ar_register_tools	= await self.get_user_tools(['tool_time_machine'])
		const tool_tm			= ar_register_tools.find(el => el.name === 'tool_time_machine')


	// Button tool time machine
		if(tool_tm) {
			const tool_tm_button = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'tool_button tool_tm_button light',
				inner_html		: tool_tm.label || 'Tool Time machine',
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
						caller			: self.caller
					})
			})
		}

	return fragment
}//end render_subtitles_options



/**
* RENDER_ACTIVITY_INFO
* This is used to build a optional buttons inside the header
* @param object self
* 	instance of current tool
* @return HTMLElement fragment
*/
const render_activity_info = function(self) {

	const fragment = new DocumentFragment()

	// activity alert
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body',
			parent			: fragment
		})
		self.events_tokens.push(
			event_manager.subscribe('save', fn_saved)
		)
		function fn_saved(options){
			const node_info = render_node_info(options)
			activity_info_body.prepend(node_info)
		}


	return fragment
}//end render_activity_info




/**
* RENDER_SUBTITLES
* This is used to build a optional buttons inside the header
* @return HTMLElement fragment
*/
const render_subtitles = async function(self) {

	const fragment	= new DocumentFragment()
	const lang		= self.lang

	const ar_value_len = self.ar_value.length

	for (let i = 0; i < ar_value_len; i++) {
		const current_value = self.ar_value[i]

		switch (current_value.type) {
			case 'tc':

			const current_tc_node = ui.create_dom_element({
					element_type	: 'div',
					contenteditable : true,
					class_name		: current_value.type,
					inner_html		: current_value.value,
					parent			: fragment
				})

				break;
			case 'text':
			default:

				// value is a raw html without parse into nodes (txt format)
					const value = current_value.value

				// text_editor_container container
					const text_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'text_container'
					})

				// toolbar_container
					const toolbar_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'toolbar_container hide',
						parent			: text_container
					})

				// value_container
					const value_container = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'value_container ' +current_value.type,
						inner_html		: value,
						parent			: text_container
					})

					const options = {
						value_container		: value_container,
						toolbar_container	: toolbar_container,
						value				: value
					}

				// observer. Init the editor when container node is in DOM
				// const observer = new IntersectionObserver(function(entries) {
				// 	// if(entries[0].isIntersecting === true) {}
				// 	const entry = entries[1] || entries[0]
				// 	if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
				// 		observer.disconnect();
					await init_current_service_text_editor(self, i, options)


				// 		// observer.unobserve(entry.target);
				// 	}
				// }, { threshold: [0] });
				// observer.observe(text_container);

				// const contenteditable_buttons = get_contenteditable_buttons(current_text_node)

				// InlineEditor.create( current_text_node, {} )
				// 	.then( editor => {} )
				// 	.catch( error => {
				// 		console.error( 'Oops, something went wrong! it is not possible load ckeditor' );
				// 		console.error( error );
				// 	} );

				// fragment.appendChild(contenteditable_buttons)
				fragment.appendChild(text_container)

			break;
		}

	}


	return fragment
}//end render_subtitles



// init_current_service_text_editor
const init_current_service_text_editor = async function(self, i, options) {

	// init the option variables
		const value_container	= options.value_container
		const toolbar_container	= options.toolbar_container

	// service_editor. Fixed on init
		const current_service_text_editor = new self.service_text_editor()

	// fix service instance with current input key
		self.service_text_editor_instance[i] = current_service_text_editor

	// toolbar. create the toolbar base
		const toolbar = ['bold','italic','underline','|','undo','redo','|','button_save']

	// editor_config
		const editor_config = {
			// plugins		: ['paste','image','print','searchreplace','code','noneditable','fullscreen'], // ,'fullscreen'
			toolbar			: toolbar, // array of strings like ['bold','italic']
			custom_buttons	: get_custom_buttons(self, current_service_text_editor, i),
			custom_events	: get_custom_events(self, i, current_service_text_editor),
			read_only		: false
		}

	// init editor
		await current_service_text_editor.init({
			caller				: self,
			value_container		: value_container,
			toolbar_container	: toolbar_container,
			key					: i,
			editor_config		: editor_config,
			editor_class		: 'ddEditor'
		})
		// .then(function(){
			// fix current_service_text_editor when is ready
			self.text_editor[i] = current_service_text_editor
		// })

	return current_service_text_editor
}//end init_current_service_text_editor


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
	// button_save
		const save_label = get_label.save.replace(/<\/?[^>]+(>|$)/g, "") || "Save"
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
	return custom_events
}//end get_custom_events

































/**
* GET_CONTENTEDITABLE_BUTTONS
*/
// const get_contenteditable_buttons = function(text_node) {

// 	const fragment = new DocumentFragment()

// 	// bold
// 		const button_bold = ui.create_dom_element({
// 			element_type	: 'button',
// 			class_name 		: 'light bold',
// 			text_content 	: "B",
// 			parent 			: fragment
// 		})
// 		button_bold.addEventListener("click", (e)=>{
// 			e.stopPropagation()
// 			do_command('strong', text_node)
// 		})
// 	// italic
// 		const button_italic = ui.create_dom_element({
// 			element_type	: 'button',
// 			class_name 		: 'light italic',
// 			text_content 	: "I",
// 			parent 			: fragment
// 		})
// 		button_italic.addEventListener("click", (e)=>{
// 			e.stopPropagation()
// 			do_command('em', text_node)
// 		})
// 	// underline
// 		const button_underline = ui.create_dom_element({
// 			element_type	: 'button',
// 			class_name 		: 'light underline',
// 			text_content 	: "U",
// 			parent 			: fragment
// 		})
// 		button_underline.addEventListener("click", (e)=>{
// 			e.stopPropagation()
// 			do_command('u', text_node)
// 		})
// 	// // find and replace
// 	// 	const button_replace = ui.create_dom_element({
// 	// 		element_type	: 'button',
// 	// 		class_name 		: 'light replace',
// 	// 		text_content 	: "Replace",
// 	// 		parent 			: fragment
// 	// 	})
// 	// 	button_replace.addEventListener("click", (e)=>{
// 	// 		e.stopPropagation()
// 	// 		do_command('insertText', 'nuevoooooXXX')
// 	// 	})

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
// const do_command = (node_type, text_node) => {
// 	// get the selection object done by user
// 	const selection_object = document.getSelection();



// 	// console.log("parent_tag:",parent_tag);
// 	// get the node that content the text selected
// 	// const content_element = (selection_object.baseNode.nodeType === Node.TEXT_NODE)
// 	// 	? selection_object.baseNode.parentNode
// 	// 	: selection_object.baseNode;

// 	// if the section is not the current text attached stop it!
// 	// if(content_element !== text_node){
// 	// 	return
// 	// }
// 	// create the node type (bold, italics, etc)
// 	const new_node = document.createElement(node_type);

// 	// const found = selection_object.containsNode(node, true);
// 	// console.log("found:",found);

// 	// get the selection range done by user
// 	const selection_range = selection_object.getRangeAt(0);

// 	const old_range = selection_range.extractContents();

// 	if (old_range.nodeType !== Node.TEXT_NODE){

// 		// find is the node_type is inside the selection, node_type need to be in uppercase
// 		// const parent_tag = findParentTag(node_type.toUpperCase())

// 		// the Node in which the selection begins
// 		const start_anchor_node	= selection_object.anchorNode
// 		// the Node in which the selection ends
// 		const end_anchor_node	= selection_object.focusNode

// 		const start_parent_tag = find_tag(text_node, start_anchor_node, node_type.toUpperCase())
// 		if(start_parent_tag){
// 			const start_range = document.createRange();
// 			start_range.selectNode(start_parent_tag)
// 			// start_range.setStart(start_parent_tag, 0);
// 			start_range.setEnd(selection_range.startContainer, selection_range.startOffset);
// 			const start_node = start_range.extractContents();
// 			console.log("start_range:",start_node);
// 			start_range.insertNode(start_node);
// 		}

// 		const end_parent_tag = find_tag(text_node, end_anchor_node, node_type.toUpperCase())
// 		if(end_parent_tag){
// 			const end_range = document.createRange();
// 			end_range.selectNode(end_parent_tag)
// 			end_range.setStart(selection_range.endContainer, selection_range.endOffset);

// 			const end_node = end_range.extractContents();
// 			end_range.insertNode(end_node);
// 		}

// 		const old_node = document.createElement('div');
// 		old_node.appendChild(old_range)

// 		const node_string = old_node.innerHTML;

// 		const remove_regex 	= '(<\/?'+node_type+'>)'
// 		const regex =  new RegExp(remove_regex,'gi');

// 		const match = node_string.match(remove_regex)
// 		const clean_string = node_string.replace( regex, '')

// 		if(match){
// 			const fragment = new DocumentFragment()

// 			const clean_node = document.createElement('div');
// 			clean_node.innerHTML = clean_string

// 			const child_nodes = [...clean_node.childNodes]
// 			const len = child_nodes.length
// 			for (let i = 0; i < len; i++) {

// 				fragment.append(child_nodes[i])
// 			}
// 			selection_range.insertNode(fragment);

// 			selection_object.removeAllRanges();
// 			selection_object.addRange(selection_range);
// 			return
// 		}

// 		new_node.insertAdjacentHTML('afterbegin',clean_string )

// 	}else{
// 		new_node.appendChild(old_range)
// 	}

// 	// new_node.appendChild(old_range)
// 	selection_range.insertNode(new_node);

// 	selection_object.removeAllRanges();
// 	selection_object.addRange(selection_range);
// }

// const wrap_text = function(argument) {

// 	const new_node = document.createElement(node_type);

// 	// get the selection range done by user
// 	const selection_range = selection_object.getRangeAt(0);

// 	const old_range = selection_range.extractContents();
// 	new_node.appendChild(old_range)
// 	selection_range.insertNode(new_node);

// }

// const unwrap_text = function(text_wrapper) {

// 	// Expand selection to all term-tag
// 	// expandToTag(text_wrapper);

// 	const sel = window.getSelection();
// 	const range = sel.getRangeAt(0);

// 	const unwrappedContent = range.extractContents();


// 	// Remove empty term-tag
// 	text_wrapper.parentNode.removeChild(text_wrapper);


// 	// Insert extracted content
// 	range.insertNode(unwrappedContent);

// 	// Restore selection
// 	sel.removeAllRanges();
// 	sel.addRange(range);

// }


// const find_tag = function(text_node, node_anchor, node_tag) {

// 	const parent_node = node_anchor

// 	if(parent_node === text_node){
// 		return null
// 	}
// 	if(parent_node.tagName === node_tag){
// 		return parent_node
// 	}else{
// 		return find_tag(text_node, parent_node.parentNode, node_tag)
// 	}
// }



// /**
// * Looks ahead to find passed tag from current selection
// *
// * @param  {string} tagName       - tag to found
// * @param  {string} [className]   - tag's class name
// * @param  {number} [searchDepth] - count of tags that can be included. For better performance.
// *
// * @returns {HTMLElement|null}
// */
// const findParentTag = function (tagName, className, searchDepth = 10){
// 	const selection = window.getSelection();
// 	let parentTag = null;

// 	// If selection is missing or no anchorNode or focusNode were found then return null
// 	if (!selection || !selection.anchorNode || !selection.focusNode) {
// 		return null;
// 	}

// 	// Define Nodes for start and end of selection
// 	const boundNodes = [
// 		// the Node in which the selection begins
// 		selection.anchorNode, // as HTMLElement,
// 		// the Node in which the selection ends
// 		selection.focusNode // as HTMLElement,
// 	];

// 	// For each selection parent Nodes we try to find target tag [with target class name]
// 	// It would be saved in parentTag variable
// 	boundNodes.forEach((parent) => {
// 		// Reset tags limit
// 		let searchDepthIterable = searchDepth;

// 		while (searchDepthIterable > 0 && parent.parentNode) {

// 			// Check tag's name
// 			if (parent.tagName === tagName) {

// 				// Save the result
// 				parentTag = parent;

// 				// Optional additional check for class-name mismatching
// 				if (className && parent.classList && !parent.classList.contains(className)) {
// 					parentTag = null;
// 				}

// 				// If we have found required tag with class then go out from the cycle
// 				if (parentTag) {
// 					break;
// 				}
// 			}
// 			// Target tag was not found. Go up to the parent and check it
// 			parent = parent.parentNode //as HTMLElement;
// 			searchDepthIterable--;
// 		}
// 	});

// 	// Return found tag or null
// 	return parentTag;
// }

// /**
// * Expands selection range to the passed parent node
// *
// * @param {HTMLElement} element - element which contents should be selected
// */
// const expandToTag = function ( element ){
// 	const selection = window.getSelection();

// 	selection.removeAllRanges();
// 	const range = document.createRange();

// 	range.selectNodeContents(element);
// 	selection.addRange(range);
// }



// @license-end
