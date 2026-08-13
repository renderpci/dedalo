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
	import { when_in_viewport } from '../../../core/common/js/events.js'
	import { ui } from '../../../core/common/js/ui.js'
	import { ua } from '../../../core/common/js/ua.js'
	import { keyboard_codes } from '../../../core/common/js/utils/keyboard.js'
	import { render_node_info } from '../../../core/common/js/utils/notifications.js'
	import { open_tool } from '../../../core/tools_common/js/tool_common.js'
	import { get_current_lang_info } from './tool_transcription.js'
	import { create_status_panel } from './render_transcription_status.js'
	import { MODEL_STATES, model_state_of } from './transcription_report.js'
	import Split from '../../../lib/split/dist/split.es.js'

// localStorage key holding the user's last pane ratio. @see activate_split
	const SPLIT_SIZES_KEY = 'tool_transcription_split_sizes'

// Width of the drag separator, in px. Split.js is told this AND the panes are
// pre-sized against it, so the two must stay one number.
// (!) The .gutter rule in the tool's less has no width of its own — Split.js
// sets it inline from this value.
	const SPLIT_GUTTER_SIZE = 10

// Viewport width below which the panes stack and there is no horizontal axis
// left to split. Must match the @width_break_point_0 media query in the less.
	const SPLIT_MIN_VIEWPORT = 800



/**
* TOOL_REPORT
* Speak through the ONE panel from anywhere in the tool.
*
* The panel belongs to the automatic-transcription block (its `nodes` bus is local
* to render_automatic_transcription), but failures happen outside it too — the
* subtitles builder, the speaker assignment. Those used to open a blocking modal
* dialog, which freezes the tab and says nothing an archivist can act on. The
* panel is published on the instance so every one of them reaches the same place.
*
* WHEN THERE IS NO PANEL there is still a user. An install with no
* `transcriber_engine` configured never renders the automatic-transcription block
* (see the guard in get_content_data_edit) — but it DOES render the subtitles
* builder and "Assign speakers". Falling back to the console there would make a
* failed subtitle build invisible on exactly those installs: the regression this
* task exists to reverse. So the fallback is a visible banner (`ui.show_message`)
* in the caller's own container, with the console line kept beside it for the
* administrator reading a support request (CONVENTIONS §1).
*
* @param {Object} self - the tool_transcription instance
* @param {Object} input - a report: {phase, severity, message, cause, action, detail}
* @param {HTMLElement} [container] - where the fallback banner is shown
* @returns {bool} true when the one panel took it
*/
const tool_report = function(self, input, container) {

	const message = (input && input.message) || ''

	if (self && self.status_panel) {
		self.status_panel.report( input )
		return true
	}

	console.error('[tool_transcription]', message);
	if (container) {
		ui.show_message(
			container,
			message,
			(input && input.severity==='warning') ? 'warning' : 'error'
		)
	}
	return false
}//end tool_report



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
		// rendered in parallel but in the proper order.
		// (!) AWAITED. This used to be a fire-and-forget `.then()`, so edit()
		// returned and the tool was mounted and PAINTED with an empty
		// tool_buttons_container — which tool_common hides entirely
		// (`&:empty { display: none !important }`). The band then landed a few
		// frames later and the header grew from 48px to 85px, shoving the whole
		// body down 37px in front of the reader. Measured: a 0.0217 layout-shift
		// entry sourced to `.content_data.tool.edit`, ~12ms after first paint.
		// Awaiting costs that same ~12ms (both promises are all but resolved by
		// the time we get here) and buys a header that is its final height on the
		// first frame.
		const header_nodes = await Promise.all(promises)
		header_nodes.forEach(function (node) {
			wrapper.tool_buttons_container.appendChild(node)
		})

	// render_activity_info are the information of the activity as "Save"
		const activity_info_node = await render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info_node)

	// caller_options.tag_id. The tool can be opened already positioned on one
	// tag — the indexation grid's transcription button (dd_grid view_indexation)
	// sends the clicked fragment's tag_id through caller_options. select_tag
	// republishes the normal click event, so the editor selects and scrolls to
	// the tag. It self-defers until the CKEditor service is ready.
		const caller_tag_id = self.caller_options?.tag_id ?? null
		if (caller_tag_id!==null && self.transcription_component) {
			self.transcription_component.select_tag(caller_tag_id)
		}


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* Build the two-column content body for the transcription tool's edit view.
*
* Layout:
*   content_data
*   ├── left_container   — the transcription text-area component
*   ├── (gutter)         — drag separator inserted by Split.js, see activate_split
*   └── right_container  — the media player + AV-specific controls + references component
*
* (!) content_data is a FLEX row, not a grid: Split.js inserts its gutter as a
* third sibling between the two columns, which a fixed grid-template-columns
* would place in a track of its own and break.
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

	// split_sizes. Read ONCE, here, and applied to the panes below before they
	// are ever painted — activate_split is then handed the same pair so the two
	// can never disagree.
	// (!) This is what stops the panes moving on load. Split.js cannot run until
	// the columns are in the viewport with real computed sizes, so leaving the
	// CSS 50/50 to paint first meant every load shifted the transcript sideways
	// once Split took over: by 5px for a user who had never dragged (each pane
	// gives up half the gutter), and by the whole difference for one who had
	// (a stored 33/67 painted as 50/50 first).
		const split_sizes = get_stored_split_sizes()

	// left_container
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_container',
			parent			: fragment
		})
		apply_split_width(left_container, split_sizes[0])

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
		apply_split_width(right_container, split_sizes[1])

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
								// error case. Reported in the tool's one panel: a
								// blocking modal dialog freezes the tab and is gone
								// the moment it is dismissed.
								tool_report(self, {
									phase		: 'done',
									severity	: 'error',
									message		: response.msg
										|| self.get_tool_label('subtitles_build_failed')
										|| 'The subtitles file could not be built'
								// an install with no transcriber_engine has no panel:
								// the banner lands in this block instead
								}, subtitles_block)
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
			// OPTIONAL, like the two status roles above: build() logs a warning and
			// leaves the property null when the section's tool_config ddo_map does not
			// declare it. Dereferencing it unconditionally threw
			// "Cannot read properties of undefined (reading 'render')" from inside a
			// promise — which aborted the rest of this callback, so the whole right
			// column silently stopped building on any section without a references field.
			const references_component = self.references_component
			if (references_component) {
				references_component.render()
				.then(function(references_component_node){
					right_container.appendChild(references_component_node)
				})
			}

		})


	// split. Vertical drag separator between the transcript and the player.
	// @see activate_split
		activate_split(left_container, right_container, split_sizes)

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)
		// save the pointers of the content_data nodes, to used by the buttons to access to the components
		content_data.left_container		= left_container
		content_data.right_container	= right_container


	return content_data
}//end get_content_data_edit



/**
* ACTIVATE_SPLIT
* Turn the two content columns into user-resizable panes with a drag separator
* between them, using Split.js.
* @see https://github.com/nathancahill/split/tree/master/packages/splitjs
*
* Why a resizer at all
* ───────────────────
* The two panes hold work of opposite shapes: the left one is a long transcript
* that is READ and typed into for hours, the right one is a video whose useful
* size depends on what is being transcribed (a talking head needs little, a
* wide shot with several speakers needs a lot). A fixed 50/50 serves neither,
* and the correct ratio is the transcriptionist's call, not ours — the same
* reasoning that already gave tool_indexation its separator.
*
* Timing
* ──────
* Split.js reads computed sizes at construction, so it must not run while the
* tool is still off-screen (it would read zeros and hand out broken widths).
* when_in_viewport defers it until the columns are actually laid out.
*
* Below 800 px the columns stack (see the @width_break_point_0 media query in
* the tool's less) and there is no horizontal axis left to divide, so the split
* is skipped entirely rather than fought with.
*
* (!) Split.js is given the ELEMENTS, not '#id' selectors as tool_indexation
* does: these containers carry no id, and an id would collide the moment two
* tools are open at once.
*
* Persistence
* ───────────
* The dragged ratio is stored to localStorage under SPLIT_SIZES_KEY. It is NOT
* read here: the caller reads it once and has already applied it to the panes
* (see apply_split_width) before they were painted, so Split.js is handed the
* same pair and its activation moves nothing.
*
* @param {HTMLElement} left_container - The transcript column.
* @param {HTMLElement} right_container - The media player column.
* @param {number[]} sizes - The [left, right] percentage pair the panes are
*   already laid out with.
* @returns {void}
*/
const activate_split = function(left_container, right_container, sizes) {

	when_in_viewport(
		left_container, // node to observe
		() => { // callback
			// don't add on small windows. There the columns are stacked.
			if (window.innerWidth<SPLIT_MIN_VIEWPORT) {
				return
			}

			Split([left_container, right_container], {
				sizes		: sizes,
				minSize		: 320, // px. Below this neither pane is usable
				gutterSize	: SPLIT_GUTTER_SIZE,
				onDragEnd	: function(dragged_sizes){
					try {
						localStorage.setItem(SPLIT_SIZES_KEY, JSON.stringify(dragged_sizes))
					} catch (error) {
						// storage full or blocked (private mode). The split still
						// works, it just will not be remembered.
					}
				}
			})
		}
	)
}//end activate_split



/**
* APPLY_SPLIT_WIDTH
* Lay a pane out at the width Split.js is going to give it, BEFORE it is
* painted, so that Split.js taking over is invisible.
*
* The formula is Split.js's own: each pane gets its share of the width minus
* half the gutter, which is what makes the two panes plus the gutter add up to
* exactly 100%.
*
* (!) Skipped below SPLIT_MIN_VIEWPORT. There the panes stack at `width: 100%`
* from the media query, and an inline width — which beats any stylesheet rule —
* would pin them to half a column each on a phone.
*
* @param {HTMLElement} container - The pane to size.
* @param {number} size - Its share of the width, in percent.
* @returns {void}
*/
const apply_split_width = function(container, size) {

	if (window.innerWidth<SPLIT_MIN_VIEWPORT) {
		return
	}

	container.style.width = `calc(${size}% - ${SPLIT_GUTTER_SIZE / 2}px)`
}//end apply_split_width



/**
* GET_STORED_SPLIT_SIZES
* Read the last dragged pane ratio from localStorage, validating it before use.
*
* @returns {number[]} A [left, right] percentage pair; the 50/50 default when
*   nothing valid is stored.
*/
const get_stored_split_sizes = function() {

	const fallback = [50, 50]

	try {
		const stored = localStorage.getItem(SPLIT_SIZES_KEY)
		if (!stored) {
			return fallback
		}

		const sizes = JSON.parse(stored)
		const valid = Array.isArray(sizes)
			&& sizes.length===2
			&& sizes.every(size => typeof size==='number' && isFinite(size) && size>0)
			&& Math.abs((sizes[0] + sizes[1]) - 100) < 1

		return valid
			? sizes
			: fallback

	} catch (error) {
		// unreadable or unparseable storage is not worth failing the render for
		return fallback
	}
}//end get_stored_split_sizes



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
* The control carries a caption above it, like every other header control
* (see the header block of the tool's less). Without one the select showed a
* record title — "Història Oral | 1 | 2009/001/001" — with nothing saying what
* that title WAS, or that changing it re-scopes the whole session.
*
* @param {Object} self - The tool_transcription instance.
* @returns {DocumentFragment} Fragment containing the captioned related-list
*   wrapper and the populated `<select>`, or an EMPTY fragment when no 'sections'
*   datum exists.
*/
const render_related_list = function(self) {

	const datum		= self.relation_list
	const context	= datum.context
	const data		= datum.data

	const fragment = new DocumentFragment();

	// select -> options.
	// (!) Resolved BEFORE any DOM is built: when the transcription section is not
	// referenced by any other section there is nothing to choose, and the tool
	// used to emit an empty <select> anyway — which now, captioned, would read as
	// a "Record" field the user had somehow left blank.
		const sections = data.find(el => el.typo==='sections')
		// if the section is not called by other sections (related sections) return empty node
		if(!sections){
			return fragment
		}

	// related list
		const related_list_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'related_list_container',
			parent			: fragment
		})
		// caption
		ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'container_label',
			inner_html		: self.get_tool_label('related_record') || 'Record',
			title			: self.get_tool_label('related_record_description')
				|| 'Record this transcription belongs to',
			parent			: related_list_container
		})
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'selector',
			title			: self.get_tool_label('related_record_description')
				|| 'Record this transcription belongs to',
			parent			: related_list_container
		})

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
				// so the option label carries enough context to distinguish entries.
				// (!) Empty values are DROPPED. A component the record left blank
				// used to contribute an empty string, and the join below then
				// emitted its separator anyway — the option read
				// "Història Oral | 1 | 2009/001/001 | " with a dangling pipe, which
				// in a width-capped select looks exactly like a truncated label.
				const ar_component_value = []
				for (let j = 0; j < ar_component_data.length; j++) {
					const current_value = ar_component_data[j].value // toString(ar_component_data[j].value)
					if (current_value===null || current_value===undefined || String(current_value).trim()==='') {
						continue
					}
					ar_component_value.push(current_value)
				}

			// label
			// Format: "Section Label | section_id | component_value_1 | component_value_2 …"
			// (built from the non-empty parts, so no separator is ever left hanging)
				const label = [
					section_label,
					current_locator.section_top_id,
					...ar_component_value
				].join(' | ')

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
		// caption. Carries .container_label so it obeys the same header caption
		// rule as every other control here; .lang_label is kept because the
		// tool's own less still targets it.
		const lang_label = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'lang_label container_label',
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

	// Button assign speakers — ALWAYS visible in the tool header: it binds
	// identities to the speaker tags of the STORED text (placeholders from a
	// detection run, or re-binding an already assigned voice), so it must be
	// reachable at any time, not only right after a run. See
	// tool_transcription.assign_speakers.
		const button_assign_speakers_header = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'tool_button button_assign_speakers light',
			inner_html		: self.get_tool_label('assign_speakers') || 'Assign speakers',
			title			: self.get_tool_label('assign_speakers_info')
				|| 'Assign the detected speakers (P1, P2, …) to the record\'s people',
			parent			: fragment
		})
		button_assign_speakers_header.addEventListener('click', function(event) {
			event.stopPropagation()
			self.assign_speakers({}).then(function(result){
				// false = nothing to offer (null = user cancelled: say nothing)
				if (result===false) {
					tool_report(self, {
						phase		: 'speakers',
						severity	: 'warning',
						message		: self.get_tool_label('no_speaker_tags')
							|| 'The transcription has no speaker tags to assign'
					// no panel on this install? the banner lands in the button's own
					// (live) parent — the fragment this was built into is long spent
					}, button_assign_speakers_header.parentElement)
				}
			})
		})

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
* A FAILING envelope is not a status code and never reaches that switch: when the
* response is missing, or carries `result:false` (the server's truthful shape for an
* unreachable/blocked/misconfigured transcriber, or a denied gate), the poll shows the
* server's message as an error, STOPS, and KEEPS the stored pid — the run stays
* resumable/inspectable instead of being reported as finished and forgotten.
* Gate: test/unit/tool_transcription.test.ts ('client poll honesty'), which loads THIS
* source and drives the poll against a stubbed browser world.
*
* The poll is initiated once at call time via `check_current_server_status()`. If the
* local DB holds no entry for this process (no job was ever started or it was already
* cleaned up), the function returns immediately without touching the UI.
*
* @param {Object} options - Configuration object.
* @param {Object} options.self  - The tool_transcription instance.
* @param {Object} options.nodes - Named references to DOM nodes that must exist:
*   `nodes.status_panel`                  — the tool's one status panel,
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

		// outage honesty (audit 2026-07-28)
		// The transcriber is an EXTERNAL server: an unreachable host, an HTTP error,
		// a blocked (SSRF) uri, a missing config or a denied gate all come back as
		// {result:false, msg} — never as a status code. Falling through to the
		// switch below landed on 'default:', which reads 'Process done' AND deletes
		// the stored pid: the transcriptionist was told that a transcription that
		// never ran had finished, and the only handle on the job was destroyed.
		// So: report the real message, STOP polling, and KEEP the pid (a reload
		// re-polls it, so a job that IS running can still be recovered).
		const status_result = (response && typeof response.result === 'object')
			? response.result
			: null
		if (!status_result) {
			const error_msg = (response && response.msg)
				? response.msg
				: 'Transcriber server did not answer'
			// SEC-XSS-006: every panel field is a text node.
			nodes.status_panel.report({
				phase		: 'transcribe',
				severity	: 'error',
				message		: (self.get_tool_label('transcription_error') || 'Transcription error')
					+ ': ' + error_msg
			})
			// The button is deliberately left as it is: the job's real state is
			// UNKNOWN, so re-enabling it here would invite a duplicate submit over
			// a transcription that may still be running on the transcriber server.
			console.error('[tool_transcription] transcriber status poll failed:', response)
			return
		}

		const status = status_result.status
			? status_result.status
			: null

		switch (status) {
			case 1:
				// any process is active, transcriber pid is obsolete, delete it
				data_manager.delete_local_db_data(
					server_process_id,
					'status'
				)
				// SEC-XSS-006: status labels are plain text
				nodes.status_panel.progress( self.get_tool_label('inactive') || 'Inactive' )
				nodes.button_automatic_transcription.classList.remove('disable');
				break;

			case 2:
				// Processing, the transcriber server is working
				setTimeout(function(){
					check_current_server_status()
				}, 4000)

				nodes.status_panel.progress( self.get_tool_label('processing') || 'Processing' )
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
				nodes.status_panel.report({
					phase		: 'done',
					severity	: 'info',
					message		: self.get_tool_label('finished') || 'Process done'
				})
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
*   - The tool's ONE status panel (render_transcription_status.js): the readiness
*     line, the transient progress line, and every warning and failure — which is
*     never hidden, by construction.
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
* A READINESS LINE (`refresh_readiness`) states what is true BEFORE anything is
* pressed: the selected model's real state in the install's store (with its Repair /
* Download / Check remedy), whether the run will fall back to the processor because
* the browser has no usable WebGPU, and the language being transcribed. It replaced
* a blocking pre-flight question raised on every click — asked after the decision was
* made, and nagging an archivist who had deliberately chosen the CPU device.
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

	// cancel button
	// A browser transcription of a long interview runs for a long time, and until
	// now the only way out was closing the window — which threw away everything
	// recognised so far. Cancelling ASKS the worker to stop: it finishes the window
	// it is on and returns what it has, which is then saved like a normal result.
		const button_cancel_transcription = ui.create_dom_element({
			element_type	: 'button',
			class_name		: 'light button_cancel_transcription hide',
			inner_html		: self.get_tool_label('cancel') || 'Cancel',
			parent			: automatic_transcription_container
		})
		//save the pointer
			nodes.button_cancel_transcription = button_cancel_transcription

		button_cancel_transcription.addEventListener('click', function(e){
			e.stopPropagation()
			button_cancel_transcription.classList.add('disable')
			self.abort_transcription()
		})

		const button_automatic_transcription_click_handler = async function(e){
			e.stopPropagation()

			// (No WebGPU pre-flight dialog here.) It used to be a blocking modal question
			// on EVERY click — asked after the decision was made, nagging the
			// archivist who deliberately chose the CPU device, and freezing the tab
			// until dismissed. The readiness line states the same fact permanently,
			// before anything is pressed. See refresh_readiness below.

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

			// The catalog entry behind the selected quality, when there is one: it
			// carries the per-model quantisation the browser engine needs (the
			// wrong quantisation is what used to make the model repeat words).
			const quality_entry = (transcriber_quality && Array.isArray(transcriber_quality.value))
				? transcriber_quality.value.find(el => el.name === (nodes.transcriber_engine_quality || {}).value)
				: null

			// options to be sent to engine
			const automatic_transcription_options = {
				transcriber_engine	: engine.name,
				transcriber_quality	: nodes.transcriber_engine_quality && nodes.transcriber_engine_quality.value
					? nodes.transcriber_engine_quality.value
					: false,
				source_lang			: lang,
				device				: nodes.transcriber_device_select
					? nodes.transcriber_device_select.value
					: 'auto',
				dtype				: quality_entry ? quality_entry.dtype : undefined,
				// How the recognised segments are turned into TEXT: paragraphs and
				// timecode density. The archivist's choice, not a constant.
				format_options		: {
					tc_mode	: nodes.transcriber_tc_mode_select
						? nodes.transcriber_tc_mode_select.value
						: 'paragraph_anchors'
				},
				// Speaker detection: only when asked for AND the model is in the
				// local store (the checkbox is disabled otherwise, but the run
				// handler re-checks — the store answer may have changed).
				detect_speakers		: (nodes.detect_speakers_checkbox
					&& nodes.detect_speakers_checkbox.checked
					&& nodes.diarization_info
					&& nodes.diarization_info.installed===true)
						? {
							model			: nodes.diarization_info.name,
							// voice fingerprints: same voice = same tag across
							// the whole recording (coherence on long interviews)
							embedding_model	: nodes.diarization_info.embedding_name
						  }
						: false,
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
					// the job is cancellable from here on
					button_cancel_transcription.classList.remove('hide')
					button_cancel_transcription.classList.remove('disable')

					// return a Promise with the data to be saved into transcription component.
					self.automatic_transcription(automatic_transcription_options)
					.then((response)=>{
						if(SHOW_DEBUG){
							console.log('----> automatic_transcription response', response);
						}

						button_cancel_transcription.classList.add('hide')
						button_automatic_transcription.classList.remove('disable')

						// A failed or cancelled-to-nothing run already reported itself
						// in the status area; there is no value to write.
						if (response===false) {
							return
						}
						// SEC-031: every panel field is a text node.
						// Retire the percentage line, but NOT the run's warnings: a
						// run that fell back to the CPU or lost speaker detection
						// must still say so next to "completed" (which is why this
						// is progress('') and not clear()).
						nodes.status_panel.progress('')
						nodes.status_panel.report({
							phase		: 'done',
							severity	: 'info',
							message		: self.get_tool_label('transcription_completed')
								|| 'Transcription completed.'
						})

						// Persist as THE transcription: item id 1 of the current lang,
						// replaced — never appended (see save_transcription).
						const html = response[0] || ''
						// capture the persons feed BEFORE saving: the save's refresh
						// rebuilds the component and its data is briefly empty
						const persons_snapshot = (self.transcription_component
							&& self.transcription_component.data
							&& Array.isArray(self.transcription_component.data.tags_persons))
								? self.transcription_component.data.tags_persons
								: []
						const save_promise = self.save_transcription( html )

						// Speaker detection saved PLACEHOLDER tags (P1, P2 … empty
						// data payloads)? Offer the identity binding right away —
						// non-blocking: the text is already saved, and closing the
						// dialog just leaves the placeholders for later
						// ("Assign speakers" reopens it any time).
						if (/\[person-[a-z]-[0-9]+-[^-]{0,22}?-data::data\]/.test(html)) {
							Promise.resolve(save_promise).then(function(){
								// pass the saved html AND the persons snapshot: the
								// component refresh is still in flight, and reading
								// either from the instance here would race it
								self.assign_speakers({ value: html, persons: persons_snapshot })
							})
						}
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

		// device used for inference
		// 'auto' (default) lets the worker detect WebGPU and fall back to WASM by
		// itself. It used to be a checkbox the user had to understand: leaving it
		// unchecked on a machine without WebGPU meant a failed run rather than a
		// slower one, and the fallback is now automatic in both directions.
				const device_container = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'device_container',
					parent 			: configuration_container
				})

				const device_label = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'device_label',
					inner_html		: self.get_tool_label('device') || 'Device',
					parent			: device_container
				})

				const transcriber_device_select = ui.create_dom_element({
					element_type	: 'select',
					parent			: device_label
				})
				//save the pointer
				nodes.transcriber_device_select = transcriber_device_select

				const device_options = [
					{ value: 'auto',	label: self.get_tool_label('device_auto') || 'Automatic' },
					{ value: 'webgpu',	label: self.get_tool_label('device_gpu') || 'GPU (faster)' },
					{ value: 'wasm',	label: self.get_tool_label('cpu_device') || 'More compatible, slower.' }
				]
				for (let i = 0; i < device_options.length; i++) {
					ui.create_dom_element({
						element_type	: 'option',
						value			: device_options[i].value,
						inner_html		: device_options[i].label,
						parent			: transcriber_device_select
					})
				}

				/**
				* APPLY_DEVICE_LIMITS
				* CPU/WASM cannot hold the large models — their weights exceed what a
				* WASM heap can address — so choosing it restricts the quality list to
				* the models that actually run there. The catalog says which those are
				* (`requires`); before the catalog existed this was hardcoded to the
				* one model literally labelled 'small'.
				*/
				const apply_device_limits = function() {

					const quality_select = nodes.transcriber_engine_quality
					if (!quality_select || !transcriber_quality || !Array.isArray(transcriber_quality.value)) {
						return
					}

					const wasm_only	= transcriber_device_select.value==='wasm'
					const entries	= transcriber_quality.value

					let selectable = null
					for (let i = 0; i < quality_select.options.length; i++) {
						const option	= quality_select.options[i]
						const entry		= entries.find(el => el.name===option.value)
						// A model is unavailable on CPU when the catalog says it needs a
						// GPU. Entries with no `requires` are assumed to run anywhere.
						const blocked	= wasm_only && entry!==undefined && entry.requires==='webgpu'
						option.disabled	= blocked
						if (!blocked && selectable===null) {
							selectable = option.value
						}
					}

					if (wasm_only) {
						quality_select.classList.add('lock')
						const current = entries.find(el => el.name===quality_select.value)
						if (current!==undefined && current.requires==='webgpu' && selectable!==null) {
							quality_select.value = selectable
						}
					} else {
						quality_select.classList.remove('lock')
					}
				}

				//save the pointer: the panel's "run on the processor instead" remedy
				//switches the device and must re-apply the same restrictions
					nodes.apply_device_limits = apply_device_limits

				// local_db
					const device_id = 'transcriber_device_select'
					transcriber_device_select.addEventListener('change', function(){
						data_manager.set_local_db_data({
							id		: device_id,
							value	: transcriber_device_select.value
						}, 'status')
						apply_device_limits()
					})

					data_manager.get_local_db_data(
						device_id,
						'status'
					).then(function( device_saved ){
						if(device_saved && device_saved.value){
							transcriber_device_select.value = device_saved.value
						}
						apply_device_limits()
					})

		// paragraph structure of the resulting text
		// A recogniser emits subtitle-sized segments; an interview transcript needs
		// paragraphs. This is where the archivist says how much timecode detail to
		// keep — and 'anchors' is the default because the subtitle builder derives
		// its cue times by interpolating between marks, so paragraph-only marks
		// would read well and drift the .vtt.
				const tc_mode_label = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'tc_mode_label',
					inner_html		: self.get_tool_label('paragraphs') || 'Paragraphs',
					parent			: configuration_container
				})

				const transcriber_tc_mode_select = ui.create_dom_element({
					element_type	: 'select',
					parent			: tc_mode_label
				})
				//save the pointer
				nodes.transcriber_tc_mode_select = transcriber_tc_mode_select

				const tc_mode_options = [
					{
						value : 'paragraph_anchors',
						label : self.get_tool_label('tc_mode_paragraph_anchors') || 'Paragraphs with time marks'
					},
					{
						value : 'paragraph',
						label : self.get_tool_label('tc_mode_paragraph') || 'Paragraphs, one mark each'
					},
					{
						value : 'segment',
						label : self.get_tool_label('tc_mode_segment') || 'One mark per phrase'
					}
				]
				for (let i = 0; i < tc_mode_options.length; i++) {
					ui.create_dom_element({
						element_type	: 'option',
						value			: tc_mode_options[i].value,
						inner_html		: tc_mode_options[i].label,
						parent			: transcriber_tc_mode_select
					})
				}

				// Rebuild the paragraphs of the transcription that is ALREADY there.
				// Transcripts made before the grouper existed are one paragraph per
				// recogniser segment; this re-groups them under the current rules
				// without re-recognising a single word.
					const button_regroup_paragraphs = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'light button_regroup_paragraphs',
						inner_html		: self.get_tool_label('regroup_paragraphs') || 'Rebuild paragraphs',
						parent			: configuration_container
					})
					button_regroup_paragraphs.addEventListener('click', function(e){
						e.stopPropagation()
						const done = self.regroup_paragraphs({
							format_options : {
								tc_mode : transcriber_tc_mode_select.value
							}
						})
						if (!done) {
							ui.show_message(
								automatic_transcription_container,
								self.get_tool_label('empty_transcription') || 'There is no transcription to rebuild',
								'error'
							)
						}
					})

				// local_db
					const tc_mode_id = 'transcriber_tc_mode_select'
					transcriber_tc_mode_select.addEventListener('change', function(){
						data_manager.set_local_db_data({
							id		: tc_mode_id,
							value	: transcriber_tc_mode_select.value
						}, 'status')
					})

					data_manager.get_local_db_data(
						tc_mode_id,
						'status'
					).then(function( tc_mode_saved ){
						if(tc_mode_saved && tc_mode_saved.value){
							transcriber_tc_mode_select.value = tc_mode_saved.value
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

				/**
				* APPLY_INSTALLED_MODELS
				* Mark the models that are NOT in the install's model store, and offer
				* the download for them.
				*
				* A model the archivist can pick but nobody downloaded fails deep inside
				* the ONNX runtime with "Could not locate file: …/config.json" — after
				* the audio has been prepared, and with a message that helps no one. The
				* store is the authority on what can actually run, so the picker asks it.
				*
				* Uninstalled models stay SELECTABLE on purpose: selecting one is how an
				* administrator reaches the Download button below (and how anyone else
				* discovers which models exist and asks for them). The transcription run
				* itself still refuses an uninstalled model up front.
				*/
				const not_installed_suffix = ` — ${self.get_tool_label('not_installed') || 'not installed'}`
				let installed_models = null

				const apply_installed_models = function( installed ) {

					if (!Array.isArray(installed)) {
						return
					}
					installed_models = installed

					for (let i = 0; i < transcriber_engine_quality.options.length; i++) {
						const option	= transcriber_engine_quality.options[i]
						const present	= installed.includes(option.value)
						const marked	= option.text.endsWith(not_installed_suffix)
						if (!present && !marked) {
							option.text = `${option.text}${not_installed_suffix}`
						}
						if (present && marked) {
							option.text = option.text.slice(0, -not_installed_suffix.length)
						}
					}

					update_download_button()
				}
				// The status panel is created OUTSIDE this block (the quality picker
				// is optional; the panel is not), so its remedy buttons reach the
				// download affordance through the nodes bus and never through a
				// closure identifier that may not exist — a ReferenceError here
				// blanks the whole tool, which is the failure class this panel exists
				// to end.
				nodes.apply_installed_models = apply_installed_models

				/**
				* UPDATE_DOWNLOAD_BUTTON
				* Show the download control exactly when the SELECTED model is missing
				* from the store. The server gates the action (global admin only), so
				* showing the button to everyone leaks nothing — a non-admin who clicks
				* it gets the refusal that tells them who to ask.
				*/
				const update_download_button = function() {
					const selected	= transcriber_engine_quality.value
					const missing	= Array.isArray(installed_models) && !installed_models.includes(selected)
					button_download_model.classList.toggle('hide', !missing)
				}

				// Ask the server which models are usable, once, while the rest renders.
				self.get_model_sources().then(function(response){
					if (response && response.result) {
						apply_installed_models( response.result.installed )
					}
				})

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
						update_download_button()
					})

			// Download the selected model into the install's store, from the UI.
			// The server gates it (global admin + catalog names only) and runs the
			// download as a background job; here we start it and poll until the
			// store reports the model usable. Before this button, seeding required
			// shell access to the server — out of reach for a hosted install's admin.
				const button_download_model = ui.create_dom_element({
					element_type	: 'button',
					class_name		: 'light button_download_model hide',
					inner_html		: self.get_tool_label('download_model') || 'Download model',
					parent			: quality_label
				})
				//save the pointer (see nodes.apply_installed_models above)
					nodes.button_download_model = button_download_model
				button_download_model.addEventListener('click', function(e){
					e.stopPropagation()
					const model = transcriber_engine_quality.value
					button_download_model.classList.add('disable')

					self.download_model( model ).then(function(response){
						if (!response || response.result===false) {
							button_download_model.classList.remove('disable')
							ui.show_message(
								automatic_transcription_container,
								(response && response.msg) || 'Download failed',
								'error'
							)
							return
						}

						// SEC-031: i18n label, plain text only.
						nodes.status_panel.progress(
							self.get_tool_label('downloading_model')
							|| 'Downloading the model… this can take several minutes.'
						)

						// Poll until installed. Bounded: a download that outlives the
						// cap is not declared failed — the job keeps running server-side
						// and the next tool open will find the model in place.
						let polls = 0
						const poll = setInterval(function(){
							if (++polls > 360) { // ~30 min at 5 s
								clearInterval(poll)
								button_download_model.classList.remove('disable')
								nodes.status_panel.progress(
									self.get_tool_label('download_still_running')
									|| 'Still downloading — the model will appear when it finishes.'
								)
								return
							}
							self.get_model_sources().then(function(sources){
								const installed = (sources && sources.result && Array.isArray(sources.result.installed))
									? sources.result.installed
									: []
								if (installed.includes(model)) {
									clearInterval(poll)
									button_download_model.classList.remove('disable')
									apply_installed_models( installed )
									nodes.status_panel.progress('')
									nodes.status_panel.report({
										phase		: 'model',
										severity	: 'info',
										message		: self.get_tool_label('model_ready') || 'Model installed.'
									})
									refresh_readiness()
								}
							})
						}, 5000)
					})
				})

					data_manager.get_local_db_data(
						quality_id,
						'status'
					).then(async function( quality_saved ){
						if(quality_saved && quality_saved.value){
							transcriber_engine_quality.value = quality_saved.value
						}
						// Re-apply both restrictions: a SAVED choice may be a model the
						// current device cannot run, or one that is no longer installed.
						apply_device_limits()
						const sources = await self.get_model_sources()
						if (sources && sources.result) {
							apply_installed_models( sources.result.installed )
						}
						// The saved choice landed AFTER the first readiness line was
						// computed, and setting `.value` fires no 'change' event: the
						// line would stand describing a model the archivist did not
						// pick. This is the third and last event wired to it.
						refresh_readiness()
					})
			}//end if(transcriber_quality)

		// speaker detection (diarization)
		// A separate model slot (never part of the ASR quality picker): the
		// pyannote segmentation model detects WHO speaks WHEN, so the result
		// can carry person tags at each speaker turn. The checkbox is enabled
		// only when the model is in the local store; when it is missing, an
		// admin gets the same Download affordance the ASR models have.
			const speakers_label = ui.create_dom_element({
				element_type	: 'label',
				class_name 		: 'speakers_label hide',
				inner_html		: self.get_tool_label('detect_speakers') || 'Detect speakers',
				parent 			: configuration_container
			})
			const detect_speakers_checkbox = ui.create_dom_element({
				element_type	: 'input',
				type			: 'checkbox',
				parent			: speakers_label
			})
			nodes.detect_speakers_checkbox = detect_speakers_checkbox

			const button_download_speaker_model = ui.create_dom_element({
				element_type	: 'button',
				class_name		: 'light button_download_speaker_model hide',
				inner_html		: self.get_tool_label('download_speaker_model') || 'Download speaker model',
				parent			: speakers_label
			})

			// The server's answer (get_model_sources → result.diarization) drives
			// the whole block; kept on `nodes` so the run handler reads ONE truth.
			nodes.diarization_info = null
			const detect_speakers_id = 'transcriber_detect_speakers'

			const apply_diarization = function( diarization ) {
				if (diarization===undefined) {
					return // an older server: leave the block hidden
				}
				nodes.diarization_info = diarization
				if (!diarization || !diarization.name) {
					speakers_label.classList.add('hide')
					return
				}
				speakers_label.classList.remove('hide')
				detect_speakers_checkbox.disabled = diarization.installed!==true
				button_download_speaker_model.classList.toggle('hide', diarization.installed===true)
				if (diarization.installed!==true) {
					detect_speakers_checkbox.checked = false
					speakers_label.title = `${diarization.label || diarization.name} — ${self.get_tool_label('not_installed') || 'not installed'}`
				} else {
					speakers_label.title = diarization.label || diarization.name
					// Saved preference; DEFAULT ON — detection is the reason the
					// model was installed, and the mapping dialog can always skip.
					data_manager.get_local_db_data( detect_speakers_id, 'status' ).then(function(saved){
						detect_speakers_checkbox.checked = saved && typeof saved.value==='boolean'
							? saved.value
							: true
					})
				}
			}
			detect_speakers_checkbox.addEventListener('change', function(){
				data_manager.set_local_db_data({
					id		: detect_speakers_id,
					value	: detect_speakers_checkbox.checked
				}, 'status')
			})

			button_download_speaker_model.addEventListener('click', function(e){
				e.stopPropagation()
				const diarization = nodes.diarization_info
				if (!diarization || !diarization.name) {
					return
				}
				button_download_speaker_model.classList.add('disable')
				// both halves of speaker detection: segmentation + the voice-
				// fingerprint model (the server skips whichever is installed)
				const downloads = [ self.download_model( diarization.name ) ]
				if (diarization.embedding_name) {
					downloads.push( self.download_model( diarization.embedding_name ) )
				}
				Promise.all( downloads ).then(function(responses){
					const response = responses.find(r => !r || r.result===false) || responses[0]
					if (!response || response.result===false) {
						button_download_speaker_model.classList.remove('disable')
						ui.show_message(
							automatic_transcription_container,
							(response && response.msg) || 'Download failed',
							'error'
						)
						return
					}
					nodes.status_panel.progress(
						self.get_tool_label('downloading_model')
						|| 'Downloading the model… this can take several minutes.'
					)
					let polls = 0
					const poll = setInterval(function(){
						if (++polls > 120) { // ~10 min at 5 s — the model is ~6 MB
							clearInterval(poll)
							button_download_speaker_model.classList.remove('disable')
							return
						}
						self.get_model_sources().then(function(sources){
							const info = sources && sources.result ? sources.result.diarization : null
							if (info && info.installed===true) {
								clearInterval(poll)
								button_download_speaker_model.classList.remove('disable')
								apply_diarization( info )
								nodes.status_panel.progress('')
								nodes.status_panel.report({
									phase		: 'model',
									severity	: 'info',
									message		: self.get_tool_label('model_ready') || 'Model installed.'
								})
							}
						})
					}, 5000)
				})
			})

			// Ask once for the block's own state (the quality block's calls also
			// re-apply it when they land — see apply_installed_models' callers).
			self.get_model_sources().then(function(response){
				if (response && response.result) {
					apply_diarization( response.result.diarization )
				}
			})

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
	// The ONE voice of the engine (see render_transcription_status.js). It replaces
	// a one-line, overflow-hidden div that the error writer left carrying its `hide`
	// class: every failure raised before the run started was invisible by
	// construction, and the archivist saw a button that stopped responding.
		const status_panel = create_status_panel({
			self		: self,
			on_action	: function( action_key ) {

				// The selected model, when there is a quality picker at all.
				const model = nodes.transcriber_engine_quality
					? nodes.transcriber_engine_quality.value
					: null

				switch (action_key) {

					case 'action_repair_model':
						if (!model) break;
						self.repair_model( model ).then(function(response){
							if (!response || response.result===false) {
								status_panel.report({
									phase		: 'model',
									severity	: 'error',
									message		: (response && response.msg)
										|| self.get_tool_label('repair_failed')
										|| 'The model could not be repaired'
								})
								return
							}
							status_panel.progress(
								self.get_tool_label('downloading_model')
								|| 'Downloading the model… this can take several minutes.'
							)
							poll_model_state( model )
						})
						break;

					case 'action_verify_model':
						if (!model) break;
						self.verify_model( model ).then(function(response){
							if (!response || response.result===false) {
								status_panel.report({
									phase		: 'model',
									severity	: 'error',
									message		: (response && response.msg)
										|| self.get_tool_label('verify_failed')
										|| 'The model could not be verified'
								})
							}
							refresh_readiness()
						})
						break;

					// Reuse the download control rather than duplicating its polling:
					// it lives inside the optional quality block, so it is reached
					// through the nodes bus and simply absent when there is no picker.
					case 'action_download_model':
						if (nodes.button_download_model) {
							nodes.button_download_model.classList.remove('hide')
							nodes.button_download_model.classList.remove('disable')
							nodes.button_download_model.click()
						}
						break;

					case 'action_retry_cpu':
						if (nodes.transcriber_device_select) {
							nodes.transcriber_device_select.value = 'wasm'
							if (nodes.apply_device_limits) {
								nodes.apply_device_limits()
							}
							refresh_readiness()
						}
						button_automatic_transcription.click()
						break;

					case 'action_retry':
						button_automatic_transcription.click()
						break;
				}
			}
		})
		automatic_transcription_container.appendChild( status_panel.node )
		//save the pointer
			nodes.status_panel = status_panel
		// and publish it on the instance: the subtitles builder and the speaker
		// assignment live outside this block and must reach the same panel
		// (see tool_report).
			self.status_panel = status_panel

		/**
		* DEVICE_CAPABILITY
		* Probe the browser's WebGPU support ONCE per tool window.
		*
		* ua.check_transformers_webgpu runs a million-iteration benchmark and creates
		* and destroys a GPU adapter and device. As a per-click pre-flight that was
		* paid once; the readiness line is recomputed on every model/device change,
		* and re-paying it there would jank the main thread of exactly the weak
		* machines the warning is written for. The answer cannot change while the
		* page is open, so the PROMISE is memoized (concurrent callers share one
		* probe, not two).
		*/
		let capability_probe = null
		const device_capability = function() {
			if (capability_probe===null) {
				// An unanswerable probe is not a verdict: say nothing rather than
				// warn about a GPU we could not ask about (and never let it reject
				// the readiness line, which would leave the block silent again).
				capability_probe = ua.check_transformers_webgpu().catch(function(){
					return { overall : true }
				})
			}
			return capability_probe
		}


	/**
	* REFRESH_READINESS
	* What is true BEFORE the button is pressed.
	*
	* The tool used to say nothing until something failed — and then say it in the
	* console. This states the model's real state, the device that will actually be
	* used and the language being transcribed, standing, from the moment the block
	* renders.
	*
	* It costs one get_model_sources request, so it is wired ONLY to the events that
	* can change its answer: the model picker, the device picker, and the completion
	* of a download/repair/verification.
	*
	* What each model state MEANS is not decided here: MODEL_STATES is the one table,
	* shared with the run's own refusal (transcription_report.js). The two used to
	* disagree, and the refusal was the one that lied.
	*/
		const refresh_readiness = async function() {

			const lines		= []
			const sources	= await self.get_model_sources()
			const models	= (sources && sources.result && Array.isArray(sources.result.models))
				? sources.result.models
				: []
			const selected	= nodes.transcriber_engine_quality
				? nodes.transcriber_engine_quality.value
				: null
			const model_state	= model_state_of( models, selected )
			const state_info	= model_state ? (MODEL_STATES[model_state] || null) : null

			if (state_info) {
				// An UNVERIFIED model is not a fault: it is the normal state of every
				// store seeded before the verification existed. Only incomplete,
				// damaged and missing are refusals (MODEL_STATES.usable).
				const state_label = self.get_tool_label( state_info.state_key ) || model_state
				lines.push({
					severity	: state_info.usable ? 'info' : 'error',
					text		: `${self.get_tool_label('readiness_model') || 'Model'}: ${state_label}`,
					action_key	: state_info.action_key
				})
			} else if (model_state) {
				// The server answered with a word this build does not know — it is a
				// version ahead of us. Say so with its own word rather than render
				// nothing: an unreadable answer is still an answer, and a blank
				// readiness line is the exact silence this panel exists to end.
				// No remedy is offered: we cannot know which one would apply.
				lines.push({
					severity	: 'warning',
					text		: `${self.get_tool_label('readiness_model') || 'Model'}: ${model_state}`
				})
			}

			// The device probe that used to be a blocking modal question on every click.
			// It is stated, not asked: someone who deliberately chose the processor
			// is not nagged, and someone who did not is told before they wait.
			const capability	= await device_capability()
			const device		= nodes.transcriber_device_select
				? nodes.transcriber_device_select.value
				: 'auto'
			if (capability && !capability.overall && device!=='wasm') {
				lines.push({
					severity	: 'warning',
					text		: `${self.get_tool_label('readiness_device') || 'Device'}: ${self.get_tool_label('device_no_gpu') || 'no GPU detected — this will run on the processor, several times slower'}`
				})
			}

			lines.push({
				severity	: 'info',
				text		: `${self.get_tool_label('readiness_language') || 'Language'}: ${get_current_lang_info(self.transcription_component.lang)}`
			})

			status_panel.readiness( lines )
		}

	/**
	* POLL_MODEL_STATE
	* Watch one model until it stops being broken, after a repair.
	*
	* Bounded, and a hit of the cap is NOT a failure: the job runs server-side and
	* outlives the poll, so the next open of the tool finds the model in place.
	*/
		const poll_model_state = function( model ) {

			let polls = 0
			const poll = setInterval(function(){
				if (++polls > 360) { // ~30 min at 5 s
					clearInterval(poll)
					return
				}
				self.get_model_sources().then(function(sources){
					const models = (sources && sources.result && Array.isArray(sources.result.models))
						? sources.result.models
						: []
					const entry = models.find(el => el.name===model)
					if (entry && (entry.state==='ready' || entry.state==='unverified')) {
						clearInterval(poll)
						status_panel.progress('')
						if (nodes.apply_installed_models) {
							nodes.apply_installed_models( sources.result.installed )
						}
						refresh_readiness()
					}
				})
			}, 5000)
		}

		refresh_readiness()
		// ONLY these two: a request per keystroke or per re-render is not a status
		// line, it is a poll of the server.
		if (nodes.transcriber_engine_quality) {
			nodes.transcriber_engine_quality.addEventListener('change', refresh_readiness)
		}
		if (nodes.transcriber_device_select) {
			nodes.transcriber_device_select.addEventListener('change', refresh_readiness)
		}

	// get and check the server status
	// it change the button and display the status into the nodes.
		get_server_status({
			self : self,
			nodes: nodes
		})


	return automatic_transcription_container
}//end render_automatic_transcription



// @license-end
