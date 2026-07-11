// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* RENDER_TOOL_TRANSCRIPTION
* Client-side view layer for the tool_transcription tool.
*
* This module exports the `render_tool_transcription` constructor whose prototype
* method `edit` is mixed into the `tool_transcription` instance (see tool_transcription.js).
* All DOM building for the transcription workspace lives here:
*
*   - Left panel  : the text-area component where the transcriptionist types.
*   - Right panel : the AV media player, play-speed slider, keyboard-shortcut controls,
*                   subtitle build button, and (when configured) the automatic-transcription
*                   block that drives the local browser Whisper worker or a remote API server.
*   - Header bar  : language selector, related-section dropdown, and optional external tool
*                   buttons (tool_tr_print, tool_time_machine).
*   - Activity strip: live save-notification area driven by the 'save' event.
*
* All private helpers are module-scoped `const` functions (not exported) and are therefore
* invisible outside this file. They receive `self` (the tool instance) explicitly.
*
* Main export: `render_tool_transcription` (constructor)
* Prototype method attached externally: `edit` (async, returns HTMLElement wrapper)
*/

// imports
	import { event_manager } from '../../../core/common/js/event_manager.js'
	import { data_manager } from '../../../core/common/js/data_manager.js'
	import { ui } from '../../../core/common/js/ui.js'
	import { ua } from '../../../core/common/js/ua.js'
	import { keyboard_codes } from '../../../core/common/js/utils/keyboard.js'
	import { render_node_info } from '../../../core/common/js/utils/notifications.js'
	import { open_tool } from '../../../core/tools_common/js/tool_common.js'
	import { get_current_lang_info } from './tool_transcription.js'



/**
* RENDER_TOOL_TRANSCRIPTION
* Manages the component's logic and appearance in client side
*/
export const render_tool_transcription = function() {

	return true
}//end render_tool_transcription



/**
* EDIT
* Build and return the full edit-mode DOM wrapper for the transcription tool.
*
* When `render_level` is 'content', only the inner content_data fragment is returned
* (used by refresh cycles that want to replace just the body, not the outer chrome).
* Otherwise the full wrapper including header buttons and activity strip is built.
*
* Header elements (transcription-options and process-status) are rendered in parallel
* via Promise.all to minimise latency; each resolves to a node that is appended in
* document order once both are ready.
*
* Side effects:
*   - Appends header nodes to `wrapper.tool_buttons_container`.
*   - Appends the save-notification node to `wrapper.activity_info_container`.
*
* @param {Object} options - Render configuration object.
* @param {string} [options.render_level='full'] - 'full' builds the complete wrapper;
*   'content' returns only the inner content_data node.
* @returns {Promise<HTMLElement>} The fully populated wrapper element, or the content_data
*   node when render_level === 'content'.
*/
render_tool_transcription.prototype.edit = async function(options={}) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
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
			render_transcription_options(self)
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
* Build the two-column content body for the transcription tool's edit view.
*
* Layout:
*   content_data
*   ├── left_container   — the transcription text-area component
*   └── right_container  — the media player + AV-specific controls + references component
*
* For `component_av` media, the right column is extended with:
*   - A playback-speed range slider (0–2 × normal speed, step 0.1).
*   - Keyboard-shortcut configuration inputs: play/pause key, auto-rewind duration (sec),
*     and timecode-tag insertion key. Values are persisted to localStorage so they survive
*     page reloads.
*   - A subtitle-generation block (calls `self.build_subtitles_file()` then fires the
*     'updated_subtitles_file_' event so the AV player reloads its caption track).
*   - An automatic-transcription block (only when `self.context.config.transcriber_engine`
*     is configured in the tool's ontology).
*
* The references component is always appended at the bottom of the right column, regardless
* of the media model.
*
* Pointers to `left_container` and `right_container` are attached directly to the returned
* `content_data` element so that other parts of the UI can reach them without re-querying.
*
* @param {Object} self - The tool_transcription instance.
* @returns {HTMLElement} content_data node with `left_container` and `right_container`
*   properties attached.
*/
const get_content_data_edit = function(self) {

	const fragment = new DocumentFragment()

	// left_container
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_container',
			parent			: fragment
		})

	// component_text_area. render another node of component caller and append to container
		const component_text_area = self.transcription_component
		// show_interface
		component_text_area.show_interface.tools = false
		// set auto_init_editor for convenience
		component_text_area.auto_init_editor = true
		component_text_area.render()
		.then(function(component_text_area_node){
			left_container.appendChild(component_text_area_node)
		})

	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_container',
			parent			: fragment
		})

	// media_component
		self.media_component.mode			= 'edit'
		self.media_component.context.view	= 'player'
		self.media_component.build(false) // build only to force new view
		self.media_component.render()
		.then(function(media_component_node) {
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
						// range: 0 (stopped/slowest) to 2× normal speed; default 1×
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
							// Fall back to 'Escape' when no stored preference exists
							const av_playpause_keyboard_code	= av_playpause_key_value ? av_playpause_key_value : 'Escape' // Default 'Escape'
							// get the user friendly name of the key code based in specific object imported from /common/utils/js/keyboard.js
							const av_playpause_keyboard_key										= keyboard_codes[av_playpause_keyboard_code]
							component_text_area.context.features.av_player.av_play_pause_code	= av_playpause_keyboard_code
							playpause_key_input.value											= av_playpause_keyboard_key

							// On each keyup, capture the raw KeyboardEvent.code (e.g. 'KeyF', 'Escape')
							// and display the human-readable key name. The code is persisted to localStorage
							// so the text-area's AV player logic can intercept the correct key next render.
							playpause_key_input.addEventListener('keyup', function(event){
								const keyboard_code	= event.code
								const keyboard_key		= event.key
								// set the cookie of the key
								localStorage.setItem('av_playpause_key', keyboard_code);
								playpause_key_input.value											= keyboard_key
								component_text_area.context.features.av_player.av_play_pause_code	= keyboard_code
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

							// On each change, coerce the input to a valid integer; fall back to 3 if NaN
							// to prevent the AV player from receiving a nonsensical rewind distance
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

							// Default 'F2' maps to the standard function key for inserting timecode tags
							const tag_insert_keyboard_code			= tag_insert_key_value ? tag_insert_key_value : 'F2' // Default 'F2'
							// get the user friendly name of the key code based in specific object imported from /common/utils/js/keyboard.js
							const tag_insert_keyboard_key			= keyboard_codes[tag_insert_keyboard_code]
							tag_insert_key_input.value				= tag_insert_keyboard_key
							component_text_area.context.features.av_player.av_insert_tc_code	= tag_insert_keyboard_code

							tag_insert_key_input.addEventListener('keyup', function(event){
								const keyboard_code					= event.code
								const keyboard_key						= event.key
								// set the cookie of the key
								localStorage.setItem('tag_insert_key', keyboard_code);
								tag_insert_key_input.value				= keyboard_key
								component_text_area.context.features.av_player.av_insert_tc_code	= keyboard_code
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
						button_build_subtitles.addEventListener('click', async function(e) {
							e.stopPropagation()

							// force input_characters_per_line to fix value if is selected
							// Blurring the active element ensures that a 'change' event fires on any
							// focused input before the characters_per_line value is read by the API call
							if (document.activeElement) {
								document.activeElement.blur();
							}

							subtitles_block.classList.add('loading')

							// call server API
							const response = await self.build_subtitles_file()
							if (!response.result) {
								// error case
								// (!) alert() used here for error feedback — consider replacing with ui.show_message()
								alert(response.msg || 'Unknown error on build_subtitles_file');
							}else{
								// success case
								// update video to force load the new subtitles file
								// The event name includes the media component id so that only the relevant
								// AV player instance reacts (component_av subscribes in its 'player' view)
								event_manager.publish('updated_subtitles_file_' + self.media_component.id, {
									lang	: self.transcription_component.data.lang,
									url		: response.url
								})
							}

							subtitles_block.classList.remove('loading')
						})
					// input characters per line
						// characters_per_line. Get the cookie of the key
						const chatacters_val = localStorage.getItem('subtitles_characters_per_line') || 90
						const input_characters_per_line = ui.create_dom_element({
							element_type	: 'input',
							type			: 'text',
							value			: chatacters_val,
							parent			: subtitles_block
						})
						// fix value
						self.characters_per_line = parseInt(input_characters_per_line.value)
						// change update
						input_characters_per_line.addEventListener('change', function(e) {
							// fix value
							self.characters_per_line = parseInt(input_characters_per_line.value)
							// set the cookie of the key
							localStorage.setItem('subtitles_characters_per_line', input_characters_per_line.value);
						})

						// label_characters_per_line
						ui.create_dom_element({
							element_type	: 'span',
							class_name		: 'label',
							inner_html		: (self.get_tool_label('chars_per_line') || 'Characters per line') + ' (default 90)',
							parent			: subtitles_block
						})

				// automatic_transcription block
					const automatic_transcription_block = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'automatic_transcription_block',
						parent 			: right_container
					})

					// check if tool has transcriber engine configuration
					// The transcriber_engine config key is set in the tool's ontology (register.json or similar).
					// If absent, the automatic-transcription UI is silently omitted.
					const transcriber_engine = (self.context.config)
						? self.context.config.transcriber_engine.value
						: false

					if (transcriber_engine) {
						const automatic_transcription_node = render_automatic_transcription({
							self : self
						})
						automatic_transcription_block.appendChild(automatic_transcription_node)
					}//end if (transcriber_engine)

				// update video to force load the new subtitles file
				// Fired immediately on render so that any previously generated .vtt file
				// is loaded into the AV player's captions track without requiring a full page reload
					event_manager.publish('updated_subtitles_file_' + self.media_component.id, {
						lang : self.transcription_component.data.lang
					})
			}//end if (self.media_component.model==='component_av')


			// references component
			const references_component = self.references_component

			references_component.render()
			.then(function(references_component_node){
				right_container.appendChild(references_component_node)
			})

		})


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
* Build a `<select>` element listing all top-level sections that reference the
* current transcription section, allowing the user to switch the active
* top_section_tipo / top_section_id context.
*
* The data source is `self.relation_list`, a datum object loaded by
* `tool_transcription.prototype.load_relation_list` during `build()`. Its `data`
* array contains a 'sections' entry whose `.value` is an array of locators
* `{ section_tipo, section_id }`. The corresponding labels come from `datum.context`.
*
* Each `<option>` element receives a `.locator` property (not a DOM attribute) so
* that the change handler can retrieve the full locator object via
* `this.options[this.selectedIndex].locator` without re-parsing the label string.
*
* Side effect: `self.top_locator` is set to the first locator immediately on
* construction (before any user interaction) and updated on each `<select>` change.
*
* @param {Object} self - The tool_transcription instance.
* @returns {DocumentFragment} Fragment containing the related-list wrapper div and
*   the populated `<select>`, or an empty fragment when no 'sections' datum exists.
*/
const render_related_list = function(self) {

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
				// Collect text values from all components that belong to this section/id pair
				// so the option label carries enough context to distinguish entries
				const ar_component_value = []
				for (let j = 0; j < ar_component_data.length; j++) {
					const current_value = ar_component_data[j].value // toString(ar_component_data[j].value)
					ar_component_value.push(current_value)
				}

			// label
			// Format: "Section Label | section_id | component_value_1 | component_value_2 …"
				const label = 	section_label + ' | ' +
								current_locator.section_top_id +' | ' +
								ar_component_value.join(' | ')

			// option DOM element
				const option = ui.create_dom_element({
					element_type	: 'option',
					inner_html		: label,
					parent			: select
				})
				// Attach the full locator object directly on the DOM node for fast retrieval
				// in the change handler — avoids re-parsing the display label
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
* Build the header-bar fragment containing: the related-section selector,
* a language switcher, and optional external-tool buttons.
*
* External tool buttons (tool_tr_print, tool_time_machine) are shown only when the
* current user has access to those tools; availability is determined by
* `self.get_user_tools()` which calls the `dd_tools_api` 'user_tools' action.
* Each button opens the tool via `open_tool()` with the transcription component as caller.
*
* Language selector: when the user picks a different language the transcription
* component is refreshed with `render_level: 'full'` so that the lang label in the
* text-area header also updates.
*
* @param {Object} self - The tool_transcription instance.
* @returns {Promise<DocumentFragment>} Resolved fragment with the selector, lang
*   switcher, and any accessible tool buttons.
*/
const render_transcription_options = async function(self) {

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
			selected	: self.source_lang,
			class_name	: 'dd_input selector',
			action		: async function(e){
				const lang = e.target.value
				self.transcription_component.lang = lang
				self.transcription_component.refresh({
					render_level : 'full' // use full here to force update label lang as [lg-spa]
				})
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
}//end render_transcription_options



/**
* RENDER_PROCESS_STATUS
* Render the status components to get control of the process of the tool
* the components are defined in ontology as tool_config->name_of_the_tool->ddo_map
*
* Renders the optional `status_user_component` and `status_admin_component` instances
* that are resolved from the tool's `ddo_map` during `build()`. Both are displayed in
* 'mini' view with their toolbar and save-animation suppressed so they fit compactly in
* the header bar.
*
* Either component may be absent (e.g. user lacks the admin status component) — the
* corresponding block is silently skipped.
*
* @param {Object} self - The tool_transcription instance.
* @returns {Promise<DocumentFragment>} Fragment containing zero, one, or two rendered
*   status component nodes.
*/
const render_process_status = async function(self) {

	const fragment = new DocumentFragment()

	// status_user_component
		if (self.status_user_component) {
			self.status_user_component.context.view = 'mini'
			self.status_user_component.show_interface.tools = false
			self.status_user_component.show_interface.save_animation = false
			const status_user_node = await self.status_user_component.render()
			fragment.appendChild(status_user_node)
		}

	// status_admin_component
		if (self.status_admin_component) {
			self.status_admin_component.context.view = 'mini'
			self.status_admin_component.show_interface.tools = false
			self.status_admin_component.show_interface.save_animation = false
			const status_admin_node	= await self.status_admin_component.render()
			fragment.appendChild(status_admin_node)
		}


	return fragment
}//end render_process_status



/**
* RENDER_ACTIVITY_INFO
* Build the activity-info container and wire it to the 'save' event so that
* each successful (or failed) save operation renders a transient notification node
* inside the strip at the top of the tool.
*
* The event token is pushed onto `self.events_tokens` so that `destroy()` can
* unsubscribe cleanly and prevent memory leaks.
*
* The 'save' event payload is expected to contain at minimum the fields consumed by
* `render_node_info()` from notifications.js (instance reference, api_response, etc.).
* The `container` property is injected before forwarding.
*
* @param {Object} self - The tool_transcription instance.
* @returns {Promise<HTMLElement>} The activity_info_body div (initially empty; populated
*   dynamically as 'save' events arrive).
*/
const render_activity_info = async function(self) {

	// activity alert
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body'
		})

	// event save
		const save_handler = (options) => {
			// revived options contains an object with instance and api_response
			const node_info_options = Object.assign(options, {
				container : activity_info_body
			})

			// render notification node
			const node_info = render_node_info(node_info_options)
			activity_info_body.prepend(node_info)
		}
		self.events_tokens.push(
			event_manager.subscribe('save', save_handler)
		)


	return activity_info_body
}//end render_activity_info



/**
* GET_SERVER_STATUS
* Poll the server to determine the current state of a background transcription process
* and update the UI nodes accordingly.
*
* The status is keyed by a stable `server_process_id` derived from the media component's
* tipo and section_id, stored in the local IndexedDB 'status' table via `data_manager`.
*
* Three server-side status codes are handled:
*   1 — Process ended or pid is stale: clear local DB entry, mark UI as 'Inactive'.
*   2 — Still processing: schedule a 4-second recursive poll, mark UI as 'Processing'.
*   3 (or default) — Finished: clear local DB entry, mark UI as done, schedule a
*       4-second delayed refresh of the transcription component so the new text appears.
*
* The poll is initiated once at call time via `check_current_server_status()`. If the
* local DB holds no entry for this process (no job was ever started or it was already
* cleaned up), the function returns immediately without touching the UI.
*
* @param {Object} options - Configuration object.
* @param {Object} options.self  - The tool_transcription instance.
* @param {Object} options.nodes - Named references to DOM nodes that must exist:
*   `nodes.status_container`              — element showing current status text,
*   `nodes.button_automatic_transcription` — the trigger button (enabled/disabled),
*   `nodes.transcriber_engine_select`     — `<select>` holding the chosen engine name.
* @returns {void}
*/
const get_server_status = function (options) {

	// options
		const self	= options.self
		const nodes	= options.nodes

	const server_process_id = 'transcriber_process_'+self.media_component.section_tipo+'_'+self.media_component.section_id

	// Status server cases:
	// 1 - the pid and the file do not exist and nothing can do
	// 2 - the pid is active, the process is working, try call later
	// 3 - the pid is not active but the file with the result exist, process is done so call to process the result with process_file()
	const check_current_server_status = async function(){

		const server_process = await data_manager.get_local_db_data(
			server_process_id,
			'status'
		)
		if(!server_process){
			return null;
		}

		const pid = server_process.pid

		const response = await self.check_server_transcriber_status({
			transcriber_engine	: nodes.transcriber_engine_select.value,
			pid : pid
		})

		const status = response.result.status
			? response.result.status
			: null

		switch (status) {
			case 1:
				// any process is active, transcriber pid is obsolete, delete it
				data_manager.delete_local_db_data(
					server_process_id,
					'status'
				)
				// SEC-XSS-006: status labels are plain text
			nodes.status_container.textContent = self.get_tool_label('inactive') || 'Inactive'
				nodes.status_container.classList.remove('processing');
				nodes.button_automatic_transcription.classList.remove('disable');
				break;

			case 2:
				// Processing, the transcriber server is working
				setTimeout(function(){
					check_current_server_status()
				}, 4000)

				nodes.status_container.textContent = self.get_tool_label('processing') || 'Processing'
				nodes.status_container.classList.add('processing');
				nodes.button_automatic_transcription.classList.add('disable');
				nodes.button_automatic_transcription.active = false

				break;

			case 3:
			default:
				// finished, the transcriber pid is finished, delete it and reload the component
				data_manager.delete_local_db_data(
					server_process_id,
					'status'
				)
				nodes.status_container.textContent = self.get_tool_label('finished') || 'Process done'
				nodes.status_container.classList.remove('processing');
				nodes.button_automatic_transcription.classList.remove('disable');

				setTimeout(function(){
					self.transcription_component.refresh()
				}, 4000)

				break;
		}
	}

	// fire the status check
	check_current_server_status()

}//end get_server_status



/**
* RENDER_AUTOMATIC_TRANSCRIPTION
* Build the automatic-transcription control block appended to the right column when
* a `transcriber_engine` is present in the tool's ontology config.
*
* This block contains:
*   - A trigger button that starts the transcription job.
*   - A collapsible configuration panel (gear icon) with:
*       * Engine selector (`<select>`) — choices come from `context.config.transcriber_engine.value`.
*       * Device checkbox — when checked, forces CPU/WASM mode (slower but compatible);
*         when unchecked, uses WebGPU. Checking it also locks quality to 'small' because
*         large Whisper models exceed WASM memory limits.
*       * Quality selector (`<select>`) — populated from `context.config.transcriber_quality`.
*       * Lang-info display — shows the current transcription language as "Label | tld3 | tld2"
*         and updates whenever the transcription component is re-rendered (language change).
*   - A status display that shows processing state (hidden initially).
*
* Engine/quality/device selections are persisted to the local IndexedDB 'status' table so
* that the user's preferences survive page reloads.
*
* Two transcription execution paths exist (selected by `engine.type`):
*   'browser' (default) — Spawns a Web Worker running the Whisper ONNX model via
*     Transformers.js. Audio is fetched from the server as an ArrayBuffer, decoded via
*     AudioContext at 16 kHz, and sent to the worker via postMessage. Worker messages
*     (`init`, `on_chunk_start`, `callback_function`, `end`) drive the status display in
*     real time. On completion, `parse_dedalo_format()` converts segments to the Dédalo
*     HTML timecode format and `self.transcription_component.set_value()` saves the result.
*   'server' — Sends an API request to the configured back-end service and then polls for
*     completion via `get_server_status()` using the returned process pid stored in the
*     local DB.
*
* A pre-flight WebGPU capability check (`ua.check_transformers_webgpu()`) warns the user
* if the browser cannot run the model efficiently before starting the job.
*
* The `nodes` object is used as an internal message bus between the button handler,
* configuration inputs, and status display to avoid repeated DOM queries.
*
* (!) `lang_info` is referenced in the button click handler via closure; it is declared
* later in the same function body. This works because `const` is hoisted within the
* function scope but the click handler only runs after the full function has returned.
*
* @param {Object} options - Configuration object.
* @param {Object} options.self - The tool_transcription instance.
* @returns {HTMLElement} The automatic_transcription_container div, ready to append.
*/
const render_automatic_transcription = function (options) {

	// options
		const self = options.self

	const transcriber_engine = (self.context.config)
		? self.context.config.transcriber_engine.value
		: false

	const transcriber_quality = (self.context.config)
		? self.context.config.transcriber_quality
		: false

	// nodes pointer
	// storage of the nodes to be used for check and change status.
		const nodes = {}

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
		//save the pointer
			nodes.button_automatic_transcription = button_automatic_transcription

		const button_automatic_transcription_click_handler = async function(e){
			e.stopPropagation()

			// Check the user agent can perform correctly and using webGPU
			const is_a_valid_user_agent = await ua.check_transformers_webgpu()
			if (!is_a_valid_user_agent.overall) {
				if(!confirm("For optimal performance, use a webGPU-compatible browser. Your current browser may run this task very slowly. Continue?")) {
					return false
				}
			}

			if(button_automatic_transcription.active === false){
				return
			}
			const engine = transcriber_engine.find(el => el.name === nodes.transcriber_engine_select.value)
			if(!engine){
				return
			}
			button_automatic_transcription.classList.add('disable')
			button_automatic_transcription.blur()

			// lang updated value form select lang selector at top
			const lang = self.transcription_component.lang

			// update the lang_info value
			// SEC-XSS-006: lang_info is plain text like "Greek | lg-ell | el"
			lang_info.textContent = get_current_lang_info(lang)

			// options to be sent to engine
			const automatic_transcription_options = {
				transcriber_engine	: engine.name,
				transcriber_quality	: nodes.transcriber_engine_quality && nodes.transcriber_engine_quality.value
					? nodes.transcriber_engine_quality.value
					: false,
				source_lang			: lang,
				nodes 				: nodes
			}

			// process with the engine
			// Two options:
			// type = browser -> (Default) the engine will be use the default transformer process in client browser
			// type = server -> the engine will call to any API server to process the av.
			switch (engine.type) {
				case 'server':
					// return a Promise to be resolved by the API response of the server
					self.automatic_transcription_server(automatic_transcription_options)
					.then((response)=>{
						// user messages
						const msg_type = (response.result===false) ? 'error' : 'ok'
						ui.show_message(automatic_transcription_container, response.msg, msg_type)

						if(response.result!==false){

							const pid = response.result.pid

							// derive the same stable status key used by get_server_status()
							const server_process_id = 'transcriber_process_'+self.media_component.section_tipo+'_'+self.media_component.section_id

							// set the server pid to the local database
							data_manager.set_local_db_data({
								id	: server_process_id,
								pid	: pid
							}, 'status')

							// fire the status poll (get_server_status owns check_current_server_status)
							get_server_status({
								self : self,
								nodes: nodes
							})
						}
					})
					break;

				case 'browser':
				default:
					// return a Promise with the data to be saved into transcription component.
					self.automatic_transcription(automatic_transcription_options)
					.then((response)=>{
						if(SHOW_DEBUG){
							console.log('----> automatic_transcription response', response);
						}

						button_automatic_transcription.classList.remove('disable')
						const msg = self.get_tool_label('transcription_completed') || 'Transcription completed.';
						// SEC-031: build success label via DOM; defence-in-depth on i18n label.
						status_container.replaceChildren()
						const success_span = document.createElement('span')
						success_span.className = 'success_text'
						success_span.textContent = msg
						status_container.appendChild(success_span)

						// set value and implicit save action in component_text_area
						self.transcription_component.set_value(
							0, // key
							response[0] || '' // value
						)
					})
					break;
			}
		}
		button_automatic_transcription.addEventListener('click', button_automatic_transcription_click_handler)

	// configuration
	// open/close the configuration options
		const show_configuration = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'icon gear',
			parent			: automatic_transcription_container
		})
		const show_configuration_click_handler = async function (e) {
			if(configuration_container.classList.contains('hide')){
				configuration_container.classList.remove('hide')
				show_configuration.classList.add('open')
			}else{
				configuration_container.classList.add('hide')
				show_configuration.classList.remove('open')
			}
		}
		show_configuration.addEventListener('click', show_configuration_click_handler)

		// configuration options
		const configuration_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'configuration_container hide unselectable',
			parent 			: automatic_transcription_container
		})

		// select engine
			// label
				const engine_label = ui.create_dom_element({
					element_type	: 'span',
					inner_html		: self.get_tool_label('engine') || 'Engine',
					class_name 		: 'engine_label',
					parent 			: configuration_container
				})

				const transcriber_engine_select = ui.create_dom_element({
					element_type	: 'select',
					parent 			: engine_label
				})
			//save the pointer
				nodes.transcriber_engine_select = transcriber_engine_select
			//options
				for (let i = 0; i < transcriber_engine.length; i++) {

					const engine = transcriber_engine[i]

					const option = ui.create_dom_element({
						element_type	: 'option',
						value			: engine.name,
						inner_html		: engine.label,
						parent			: transcriber_engine_select
					})
					// Pre-select the engine that was last used (persisted as self.target_transcriber
					// from the local DB during tool init)
					if (self.target_transcriber===engine.name) {
						option.selected = true
					}
				}
				// local_db
				// Persist the selected engine name so the next session starts with the same choice
					const engine_id = 'transcriber_engine_select'
					transcriber_engine_select.addEventListener('change', function(){
						data_manager.set_local_db_data({
							id		: engine_id,
							value	: transcriber_engine_select.value
						}, 'status')
					})

					data_manager.get_local_db_data(
						engine_id,
						'status'
					).then(function( quality_saved ){
						if(quality_saved){
							transcriber_engine_select.value = quality_saved.value
						}
					})

		// configuration of device to use in processing
		// two options 'gpu' or 'cpu' by default is 'gpu' but for compatibility 'cpu' can be set.
				const device_container = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'device_container',
					parent 			: configuration_container
				})

				const option_label = ui.create_dom_element({
					element_type	: 'label',
					inner_html		: self.get_tool_label('cpu_device') || 'More compatible, slower.',
					parent			: device_container
				})

				const transcriber_device_checkbox = ui.create_dom_element({
					element_type	: 'input',
					type			: 'checkbox'
				})

				//save the pointer
				nodes.transcriber_device_checkbox = transcriber_device_checkbox

				option_label.prepend(transcriber_device_checkbox)

				// local_db
				// When CPU/WASM mode is selected, the quality is locked to 'small' because
				// larger Whisper models require WebGPU memory bandwidth — they cannot run in WASM
					const device_id = 'transcriber_device_checkbox'
					transcriber_device_checkbox.addEventListener('change', function(){
						data_manager.set_local_db_data({
							id		: device_id,
							value	: transcriber_device_checkbox.checked
						}, 'status')

						if(transcriber_device_checkbox.checked){
							const quality_small	= transcriber_quality.value.find(el => el.label==='small').name
							nodes.transcriber_engine_quality.value = quality_small
							nodes.transcriber_engine_quality.classList.add('lock')
						}else{
							nodes.transcriber_engine_quality.classList.remove('lock')
						}
					})

					data_manager.get_local_db_data(
						device_id,
						'status'
					).then(function( quality_saved ){
						if(quality_saved){
							transcriber_device_checkbox.checked = quality_saved.value

						// initial change quality if the engine is checked.
						// if the engine is checked only can set the small version,
						// any large model use more ram that can be handled in wasm
						// only webGPU can load large models
							if(transcriber_device_checkbox.checked){
								const quality_small	= transcriber_quality.value.find(el => el.label==='small').name
								nodes.transcriber_engine_quality.value = quality_small
								nodes.transcriber_engine_quality.classList.add('lock')
							}
						}
					})

		// select quality of transcriber
			if(transcriber_quality){
				// label
				const quality_label = ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'quality_label',
					inner_html		: self.get_tool_label('quality') || 'Quality',
					parent 			: configuration_container
				})

				const transcriber_engine_quality = ui.create_dom_element({
					element_type	: 'select',
					parent 			: quality_label
				})
				//save the pointer
					nodes.transcriber_engine_quality = transcriber_engine_quality
				const quality_value = transcriber_quality.value
				for (let i = 0; i < quality_value.length; i++) {

					const quality	= quality_value[i]
					const label		= self.get_tool_label(quality.label) || quality.label

					const option = ui.create_dom_element({
						element_type	: 'option',
						value			: quality.name,
						inner_html		: label,
						parent			: transcriber_engine_quality
					})

					if (transcriber_quality.default===quality.label) {
						option.selected = true
					}
				}
				// local_db
					const quality_id = 'transcriber_engine_quality'

					transcriber_engine_quality.addEventListener('change', function(){
						data_manager.set_local_db_data({
							id		: quality_id,
							value	: transcriber_engine_quality.value
						}, 'status')
					})

					data_manager.get_local_db_data(
						quality_id,
						'status'
					).then(function( quality_saved ){
						// change the value if the user was change it and the engine check box is not selected
						// if the engine is checked only can set the small version,
						// any large model use more ram that can be handled in wasm
						// only webGPU can load large models
						if(quality_saved && !transcriber_device_checkbox.checked){
							transcriber_engine_quality.value = quality_saved.value
						}
					})
			}//end if(transcriber_quality)

		// lang info. Display target lang info as 'Greek | lg-ell | el'
			const lang_info = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'lang_info',
				parent			: configuration_container
			})
			// first value
			lang_info.textContent = get_current_lang_info(self.transcription_component.lang)
			// event component_text_area render on refresh (fired on change lang selector value)
			const update_lang_info = () => {
				lang_info.textContent = get_current_lang_info(self.transcription_component.lang)
			}
			event_manager.subscribe(`render_${self.transcription_component.id}`, update_lang_info);

	// status
		const status_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'status_container hide',
			parent 			: automatic_transcription_container
		})
		//save the pointer
			nodes.status_container = status_container

	// get and check the server status
	// it change the button and display the status into the nodes.
		get_server_status({
			self : self,
			nodes: nodes
		})


	return automatic_transcription_container
}//end render_automatic_transcription



// @license-end
