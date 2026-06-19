// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/



// import
	import { markdown } from './markdown.js'



/**
 * T
 * Localised label helper. Looks up `key` in the global `get_label` map
 * (populated by Dédalo's server-side label system) and returns the translated
 * string, or `fallback` when the map is unavailable or the key is absent.
 *
 * `get_label` is declared via /*global*\/ so ESLint does not flag it as
 * undefined; it is injected into the page at render time by PHP and is not
 * imported as an ES module. Access is guarded by a typeof check so this
 * module is safe to import in environments where the global is absent.
 *
 * @param {string} key      - Label identifier in the Dédalo label registry.
 * @param {string} fallback - English default used when the key is not found.
 * @returns {string} Translated label or fallback.
 */
const t = function(key, fallback) {
	if (typeof get_label !== 'undefined' && get_label && get_label[key]) {
		return get_label[key]
	}
	return fallback
}//end t



/**
 * CHAT_RENDER
 * Pure-DOM view layer for the tool_assistant chat panel.
 *
 * Responsibilities:
 * - Build the entire chat UI (toolbar, message list, footer input) via
 *   `build(options)`, returning a `<div class="content_data">` ready to be
 *   mounted by `ai_assistant.build_chat_ui()`.
 * - Stream assistant responses token-by-token through `start_assistant_message` /
 *   `append_token` / `finalize_assistant_message`, re-rendering markdown on each
 *   token so the user sees progressive output.
 * - Display "thinking" tokens in a collapsible `<details>` block that auto-collapses
 *   once the final answer starts arriving.
 * - Render tool-call progress cards (`add_tool_call` / `update_tool_call`) for
 *   MCP/function-call transparency.
 * - Manage model-settings and conversation-history popovers in the toolbar.
 * - Expose lifecycle callbacks (on_send, on_abort, on_new_conversation,
 *   on_load_thread, on_delete_thread, on_settings_change, on_list_threads)
 *   so the caller (`ai_assistant`) can drive all business logic without
 *   knowing about the DOM.
 *
 * This class has NO knowledge of the AI engine, persistence, or MCP protocol.
 * It is intentionally a thin presentation layer: every callback fires upward
 * and the caller decides what to do.
 *
 * Auto-scroll behaviour: the messages pane follows the bottom automatically
 * unless the user scrolls up more than 80 px from the bottom (`_auto_scroll`
 * flag). The flag is reset to true whenever the user sends a new message.
 *
 * Localization: all user-visible strings go through the module-local `t(key,
 * fallback)` helper, which reads from the global `get_label` map when available.
 */
export const chat_render = class chat_render {



	/**
	 * CONSTRUCTOR
	 * Initialises all private DOM-reference slots and streaming-state accumulators
	 * to null / empty so that every method can safely test them before use.
	 *
	 * DOM references populated by `build()`:
	 *   _container, _messages, _input, _send_button, _stop_button,
	 *   _progress_bar, _progress_text, _progress_fill, _toolbar,
	 *   _history_dropdown, _settings_popover, _model_badge.
	 *
	 * Callback slots populated by `build(options)`:
	 *   _on_send, _on_new_conversation, _on_abort, _on_load_thread,
	 *   _on_delete_thread, _on_settings_change, _on_list_threads.
	 *   (_get_settings is assigned in `build()` but not initialised in the constructor.)
	 *
	 * Streaming state (reset in `clear_messages` and `finalize_assistant_message`):
	 *   _current_assistant_node  — the live <div> being filled token-by-token.
	 *   _current_assistant_raw   — accumulated raw markdown for the live message.
	 *   _thinking_node           — transient "Thinking…" spinner DOM node.
	 *   _thoughts_block_node     — persistent <details> holding model chain-of-thought.
	 *   _thoughts_block_body     — <div> inside the <details> for raw thought text.
	 *   _thoughts_block_raw      — accumulated raw text of model chain-of-thought.
	 *   _auto_scroll             — whether to keep the list scrolled to the bottom.
	 */
	constructor() {
		this._container				= null
		this._messages				= null
		this._input					= null
		this._send_button			= null
		this._stop_button			= null
		this._progress_bar			= null
		this._progress_text			= null
		this._progress_fill			= null
		this._toolbar				= null
		this._history_dropdown		= null
		this._settings_popover		= null
		this._on_send				= null
		this._on_new_conversation	= null
		this._on_abort				= null
		this._on_load_thread		= null
		this._on_delete_thread		= null
		this._on_settings_change	= null
		this._on_list_threads		= null
		this._current_assistant_node= null
		this._current_assistant_raw	= ''
		this._thinking_node			= null
		this._thoughts_block_node	= null
		this._thoughts_block_body	= null
		this._thoughts_block_raw	= ''
		this._auto_scroll			= true
	}//end constructor



	/**
	 * BUILD
	 * Creates the full chat panel DOM tree and wires all event listeners.
	 * Must be called exactly once per instance before any other method.
	 *
	 * The returned element is a `<div class="content_data assistant_content_data">`
	 * which the caller (ai_assistant) appends to the tool wrapper produced by
	 * `ui.tool.build_wrapper_edit`.
	 *
	 * Structure of the returned tree:
	 *   content_data
	 *     └─ .assistant_toolbar
	 *          ├─ new-conversation button
	 *          ├─ .assistant_history_wrap
	 *          │    ├─ history-toggle button
	 *          │    └─ .assistant_history_dropdown (initially hidden)
	 *          ├─ .assistant_settings_wrap
	 *          │    ├─ settings-toggle button
	 *          │    └─ .assistant_settings_popover (initially hidden)
	 *          └─ .assistant_model_badge
	 *     └─ .assistant_progress_bar (initially hidden)
	 *          ├─ .assistant_progress_fill
	 *          └─ .assistant_progress_text
	 *     └─ .assistant_messages  (scrollable message list)
	 *     └─ .assistant_footer
	 *          ├─ textarea.assistant_input
	 *          ├─ button.assistant_send_button
	 *          └─ button.assistant_stop_button (initially hidden)
	 *
	 * Popovers (history + settings) are closed by clicking anywhere on the
	 * `document`; clicks inside the settings popover are stopped from bubbling
	 * so that the settings form remains interactive.
	 *
	 * The `_auto_scroll` flag tracks whether the message list should follow
	 * new content: it becomes false if the user scrolls more than 80 px from
	 * the bottom, and resets to true on every sent message.
	 *
	 * Enter (without Shift) submits the message; Shift+Enter inserts a newline.
	 * The textarea auto-grows up to approximately 6 rows.
	 *
	 * @param {Object}   options                      - Configuration and lifecycle callbacks.
	 * @param {Function} [options.on_send]             - Called with the trimmed message string when the user submits.
	 * @param {Function} [options.on_new_conversation] - Called when the user clicks "+".
	 * @param {Function} [options.on_abort]            - Called when the user clicks the stop button during streaming.
	 * @param {Function} [options.on_load_thread]      - Called with thread.id when a history entry is clicked.
	 * @param {Function} [options.on_delete_thread]    - Called with thread.id when the delete icon is clicked in history.
	 * @param {Function} [options.on_settings_change]  - Called with `{model_id, device, dtype, thinking}` on Apply.
	 * @param {Function} [options.on_list_threads]     - Must return an array of thread objects for the history dropdown.
	 * @param {Function} [options.get_settings]        - Must return the current settings object (models, model_id, device, etc.).
	 * @returns {HTMLElement} The mounted `content_data` root element.
	 */
	build(options={}) {

		const self = this

		this._on_send				= options.on_send || function(){}
		this._on_new_conversation	= options.on_new_conversation || function(){}
		this._on_abort				= options.on_abort || function(){}
		this._on_load_thread		= options.on_load_thread || function(){}
		this._on_delete_thread		= options.on_delete_thread || function(){}
		this._on_settings_change	= options.on_settings_change || function(){}
		this._on_list_threads		= options.on_list_threads || function(){ return [] }
		const get_settings			= options.get_settings || function(){ return {} }
		this._get_settings			= get_settings

	// content_data container
		const content_data = document.createElement('div')
		content_data.classList.add('content_data', 'assistant_content_data')

	// toolbar
		this._toolbar = document.createElement('div')
		this._toolbar.classList.add('assistant_toolbar')

		// new conversation
			const new_conv_button = document.createElement('button')
			new_conv_button.type = 'button'
			new_conv_button.classList.add('assistant_toolbar_button', 'assistant_new_conv_button')
			new_conv_button.title = t('new_conversation', 'New conversation')
			new_conv_button.textContent = '+'
			new_conv_button.addEventListener('click', function() {
				self._on_new_conversation()
			})
			this._toolbar.appendChild(new_conv_button)

		// history dropdown
			const history_wrap = document.createElement('div')
			history_wrap.classList.add('assistant_history_wrap')

			const history_button = document.createElement('button')
			history_button.type = 'button'
			history_button.classList.add('assistant_toolbar_button', 'assistant_history_button')
			history_button.title = t('history', 'History')
			history_button.textContent = '\u2630' // ☰
			history_button.addEventListener('click', function(e) {
				e.stopPropagation()
				self._toggle_history()
			})

			this._history_dropdown = document.createElement('div')
			this._history_dropdown.classList.add('assistant_history_dropdown')
			this._history_dropdown.style.display = 'none'

			history_wrap.appendChild(history_button)
			history_wrap.appendChild(this._history_dropdown)
			this._toolbar.appendChild(history_wrap)

		// settings popover
			const settings_wrap = document.createElement('div')
			settings_wrap.classList.add('assistant_settings_wrap')

			const settings_button = document.createElement('button')
			settings_button.type = 'button'
			settings_button.classList.add('assistant_toolbar_button', 'assistant_settings_button')
			settings_button.title = t('settings', 'Settings')
			settings_button.textContent = '\u2699' // ⚙
			settings_button.addEventListener('click', function(e) {
				e.stopPropagation()
				self._toggle_settings()
			})

			this._settings_popover = document.createElement('div')
			this._settings_popover.classList.add('assistant_settings_popover')
			this._settings_popover.style.display = 'none'

			settings_wrap.appendChild(settings_button)
			settings_wrap.appendChild(this._settings_popover)
			this._toolbar.appendChild(settings_wrap)

		// model badge (informational)
			this._model_badge = document.createElement('span')
			this._model_badge.classList.add('assistant_model_badge')
			this._toolbar.appendChild(this._model_badge)

		content_data.appendChild(this._toolbar)

	// click outside closes popovers
		document.addEventListener('click', function() {
			self._close_history()
			self._close_settings()
		})

	// progress bar
		this._progress_bar = document.createElement('div')
		this._progress_bar.classList.add('assistant_progress_bar')
		this._progress_bar.style.display = 'none'

		this._progress_fill = document.createElement('div')
		this._progress_fill.classList.add('assistant_progress_fill')

		this._progress_text = document.createElement('div')
		this._progress_text.classList.add('assistant_progress_text')
		this._progress_text.textContent = '0%'

		this._progress_bar.appendChild(this._progress_fill)
		this._progress_bar.appendChild(this._progress_text)
		content_data.appendChild(this._progress_bar)

	// messages container
		this._messages = document.createElement('div')
		this._messages.classList.add('assistant_messages')
		this._messages.addEventListener('scroll', function() {
			// disable auto-scroll when the user has scrolled up more than 80 px
			// from the bottom; this lets them read older messages without the
			// view jumping while new tokens arrive
			const distance_from_bottom = self._messages.scrollHeight
				- self._messages.scrollTop
				- self._messages.clientHeight
			self._auto_scroll = distance_from_bottom < 80
		})
		content_data.appendChild(this._messages)

	// footer with input
		const input_row = document.createElement('div')
		input_row.classList.add('assistant_footer')

		this._input = document.createElement('textarea')
		this._input.classList.add('assistant_input')
		this._input.placeholder = t('ask_placeholder', 'Ask something...')
		this._input.rows = 1
		this._input.addEventListener('keydown', function(e) {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault()
				if (self._input.disabled) return
				self._handle_send()
			}
		})
		this._input.addEventListener('input', function() {
			self._autogrow_input()
		})

		this._send_button = document.createElement('button')
		this._send_button.type = 'button'
		this._send_button.classList.add('assistant_send_button')
		this._send_button.title = t('send', 'Send')
		this._send_button.textContent = '\u2192'
		this._send_button.addEventListener('click', function() {
			self._handle_send()
		})

		this._stop_button = document.createElement('button')
		this._stop_button.type = 'button'
		this._stop_button.classList.add('assistant_stop_button')
		this._stop_button.title = t('stop', 'Stop')
		this._stop_button.textContent = '\u25A0' // ■
		this._stop_button.style.display = 'none'
		this._stop_button.addEventListener('click', function() {
			self._on_abort()
		})

		input_row.appendChild(this._input)
		input_row.appendChild(this._send_button)
		input_row.appendChild(this._stop_button)
		content_data.appendChild(input_row)

		this._container = content_data

		return content_data
	}//end build



	/**
	 * _AUTOGROW_INPUT
	 * Grows the textarea to match its content, capped at approximately 6 rows.
	 * Resets height to 'auto' first so that shrinking (after deletion) also works.
	 * Called on every 'input' event and after programmatic value clears.
	 */
	_autogrow_input() {
		this._input.style.height = 'auto'
		const max = 6 * 18 // ~6 rows
		this._input.style.height = Math.min(this._input.scrollHeight, max) + 'px'
	}//end _autogrow_input



	/**
	 * _HANDLE_SEND
	 * Reads, trims, and clears the textarea, then fires `_on_send` with the text.
	 * Does nothing if the trimmed value is empty (guards against accidental submits).
	 * Resets `_auto_scroll` to true so the incoming response scrolls into view.
	 */
	_handle_send() {

		const message = this._input.value.trim()
		if (!message) return

		this._input.value = ''
		this._autogrow_input()
		this._auto_scroll = true
		this._on_send(message)
	}//end _handle_send



	/**
	 * SET_MODEL_BADGE
	 * Updates the toolbar badge showing which model and device are active.
	 * Extracts the short model name from the full HuggingFace-style path
	 * (e.g. "Qwen/Qwen2.5-0.5B-Instruct" \u2192 "Qwen2.5-0.5B-Instruct").
	 *
	 * @param {string} model_id - Full model identifier (may be a slash-separated path).
	 * @param {string} device   - Inference backend label (e.g. 'webgpu', 'wasm').
	 */
	set_model_badge(model_id, device) {
		if (!this._model_badge) return
		const short = (model_id || '').split('/').pop() || model_id || '?'
		this._model_badge.textContent = short + ' · ' + (device || '?')
		this._model_badge.title = (model_id || '') + ' (' + (device || '') + ')'
	}//end set_model_badge



	// ----- HISTORY DROPDOWN ---------------------------------------------------

	/**
	 * _TOGGLE_HISTORY
	 * Opens the history dropdown (re-rendering it fresh from `_on_list_threads`)
	 * if currently hidden; closes it otherwise. Always closes the settings
	 * popover to enforce mutual exclusion between the two panel types.
	 */
	_toggle_history() {
		if (this._history_dropdown.style.display === 'none') {
			this._render_history()
			this._history_dropdown.style.display = 'block'
			this._close_settings()
		} else {
			this._close_history()
		}
	}//end _toggle_history



	/**
	 * _CLOSE_HISTORY
	 * Hides the history dropdown. Safe to call when it is already hidden.
	 */
	_close_history() {
		if (this._history_dropdown) this._history_dropdown.style.display = 'none'
	}//end _close_history



	/**
	 * _RENDER_HISTORY
	 * Rebuilds the history dropdown content from the thread list returned by
	 * `_on_list_threads()`. Called each time the dropdown is opened to ensure
	 * the list reflects the current state.
	 *
	 * Thread object shape expected from the callback:
	 *   { id: string, title: string, updated_at: string|number (Date-parseable) }
	 *
	 * When no threads exist, renders a single "No saved conversations" empty-state
	 * element. Each thread row has a load button (fires `_on_load_thread`) and a
	 * delete button (fires `_on_delete_thread` then re-renders the list in place).
	 * Click events are stopped from propagating so the document-level "close
	 * popovers" listener does not immediately dismiss the dropdown.
	 */
	_render_history() {

		const self = this
		const threads = this._on_list_threads() || []

		this._history_dropdown.innerHTML = ''

		if (threads.length === 0) {
			const empty = document.createElement('div')
			empty.classList.add('assistant_history_empty')
			empty.textContent = t('no_threads', 'No saved conversations')
			this._history_dropdown.appendChild(empty)
			return
		}

		threads.forEach(function(thread) {
			const item = document.createElement('div')
			item.classList.add('assistant_history_item')

			const label = document.createElement('button')
			label.type = 'button'
			label.classList.add('assistant_history_item_label')
			label.textContent = thread.title
			label.title = thread.title + ' (' + new Date(thread.updated_at).toLocaleString() + ')'
			label.addEventListener('click', function(e) {
				e.stopPropagation()
				self._close_history()
				self._on_load_thread(thread.id)
			})

			const del = document.createElement('button')
			del.type = 'button'
			del.classList.add('assistant_history_item_delete')
			del.title = t('delete_thread', 'Delete conversation')
			del.textContent = '\u00D7'
			del.addEventListener('click', function(e) {
				e.stopPropagation()
				self._on_delete_thread(thread.id)
				self._render_history()
			})

			item.appendChild(label)
			item.appendChild(del)
			self._history_dropdown.appendChild(item)
		})
	}//end _render_history



	// ----- SETTINGS POPOVER ---------------------------------------------------

	/**
	 * _TOGGLE_SETTINGS
	 * Opens the settings popover (re-rendering it from `_get_settings`)
	 * if currently hidden; closes it otherwise. Always closes the history
	 * dropdown to enforce mutual exclusion between the two panel types.
	 */
	_toggle_settings() {
		if (this._settings_popover.style.display === 'none') {
			this._render_settings()
			this._settings_popover.style.display = 'block'
			this._close_history()
		} else {
			this._close_settings()
		}
	}//end _toggle_settings



	/**
	 * _CLOSE_SETTINGS
	 * Hides the settings popover. Safe to call when it is already hidden.
	 */
	_close_settings() {
		if (this._settings_popover) this._settings_popover.style.display = 'none'
	}//end _close_settings



	/**
	 * _RENDER_SETTINGS
	 * Rebuilds the settings popover from `_get_settings()` each time it is opened,
	 * ensuring the displayed values always reflect the live state.
	 *
	 * Expected shape of the object returned by `_get_settings()`:
	 *   {
	 *     models: Array<{
	 *       model_id: string,
	 *       label?: string,
	 *       dtype?: string,           // e.g. 'q4f16'
	 *       device?: string,          // e.g. 'webgpu'
	 *       fallback_device?: string,
	 *       max_new_tokens?: number,
	 *       thinking?: string,        // 'none' | 'low' | 'medium' | 'high'
	 *       thinking_options?: string[]
	 *     }>,
	 *     model_id: string,           // currently active model
	 *     device: string,             // currently active device
	 *     dtype?: string,
	 *     thinking?: string,
	 *     thinking_options?: string[]
	 *   }
	 *
	 * If `models` is absent or empty, a single synthetic entry is built from
	 * the flat `model_id`/`dtype`/`device`/`thinking` properties for backward
	 * compatibility with callers that do not supply the full `models` array.
	 *
	 * Controls rendered:
	 *   - Model <select>   — switching a model refreshes the device and thinking
	 *     selects from that model's `dataset.*` attributes stored on each <option>.
	 *   - Device <select>  — hard-coded to ['webgpu', 'wasm']; seeded from the
	 *     selected model's `dataset.device` when the model selection changes.
	 *   - Thinking <select>— disabled when only one option is available (models
	 *     that do not support variable thinking budgets).
	 *   - Apply button     — collects all select values and fires `_on_settings_change`.
	 *
	 * The popover's click events are stopped from bubbling so the document-level
	 * "close popovers" listener does not dismiss it while the user is interacting.
	 *
	 * (!) Model metadata (dtype, device, fallback_device, max_new_tokens, thinking,
	 * thinking_options) is stored in `dataset.*` on each <option> element so that
	 * the 'change' handler can read it without keeping a parallel in-memory map.
	 * `JSON.parse` is used for `thinking_options`; parse errors silently fall back
	 * to ['none'].
	 */
	_render_settings() {

		const self = this
		const settings = this._get_settings() || {}

		this._settings_popover.innerHTML = ''
		this._settings_popover.addEventListener('click', function(e) {
			e.stopPropagation()
		})

	// model select — each entry in `models` is a self-contained config
		const model_label = document.createElement('label')
		model_label.classList.add('assistant_settings_label')
		model_label.textContent = 'Model'
		const model_select = document.createElement('select')
		model_select.classList.add('assistant_settings_input')
		const models = Array.isArray(settings.models) && settings.models.length > 0
			? settings.models
			: [{
				model_id	: settings.model_id,
				label		: settings.model_id,
				dtype		: settings.dtype,
				device		: settings.device,
				thinking	: settings.thinking || 'none',
				thinking_options: settings.thinking_options || ['none']
			}]
		models.forEach(function(m) {
			if (!m || !m.model_id) return
			const opt = document.createElement('option')
			opt.value = m.model_id
			opt.textContent = m.label || m.model_id.split('/').pop()
			opt.dataset.dtype			= m.dtype || 'q4f16'
			opt.dataset.device			= m.device || 'webgpu'
			opt.dataset.fallback_device	= m.fallback_device || 'wasm'
			opt.dataset.max_new_tokens	= m.max_new_tokens || 512
			opt.dataset.thinking		= m.thinking || 'none'
			opt.dataset.thinking_options= JSON.stringify(m.thinking_options || ['none'])
			if (m.model_id === settings.model_id) opt.selected = true
			model_select.appendChild(opt)
		})
		model_label.appendChild(model_select)
		this._settings_popover.appendChild(model_label)

	// device select
		const device_label = document.createElement('label')
		device_label.classList.add('assistant_settings_label')
		device_label.textContent = 'Device'
		const device_select = document.createElement('select')
		device_select.classList.add('assistant_settings_input')
		;['webgpu', 'wasm'].forEach(function(d) {
			const opt = document.createElement('option')
			opt.value = d
			opt.textContent = d
			if (d === settings.device) opt.selected = true
			device_select.appendChild(opt)
		})
		device_label.appendChild(device_select)
		this._settings_popover.appendChild(device_label)

	// thinking select (per-model options)
		const thinking_label = document.createElement('label')
		thinking_label.classList.add('assistant_settings_label')
		thinking_label.textContent = 'Thinking'
		const thinking_select = document.createElement('select')
		thinking_select.classList.add('assistant_settings_input')
		const render_thinking_options = function(opts, current) {
			thinking_select.innerHTML = ''
			;(opts && opts.length ? opts : ['none']).forEach(function(level) {
				const opt = document.createElement('option')
				opt.value = level
				opt.textContent = level
				if (level === current) opt.selected = true
				thinking_select.appendChild(opt)
			})
			thinking_select.disabled = thinking_select.options.length <= 1
		}
		render_thinking_options(settings.thinking_options, settings.thinking)
		thinking_label.appendChild(thinking_select)
		this._settings_popover.appendChild(thinking_label)

	// refresh device+thinking when model changes
		model_select.addEventListener('change', function() {
			const sel = model_select.selectedOptions[0]
			if (!sel) return
			device_select.value = sel.dataset.device || device_select.value
			let opts = ['none']
			try { opts = JSON.parse(sel.dataset.thinking_options || '["none"]') } catch(e) {}
			render_thinking_options(opts, sel.dataset.thinking || 'none')
		})

	// apply button
		const apply = document.createElement('button')
		apply.type = 'button'
		apply.classList.add('assistant_settings_apply')
		apply.textContent = 'Apply'
		apply.addEventListener('click', function() {
			const selected = model_select.selectedOptions[0]
			self._close_settings()
			self._on_settings_change({
				model_id	: model_select.value,
				device		: device_select.value,
				dtype		: selected ? selected.dataset.dtype : null,
				thinking	: thinking_select.value
			})
		})
		this._settings_popover.appendChild(apply)
	}//end _render_settings



	// ----- MESSAGE RENDERING --------------------------------------------------

	/**
	 * ADD_SYSTEM_MESSAGE
	 * Appends a non-interactive system notification to the message list
	 * (e.g. "Model loaded", "Connection error"). Styled distinctly from
	 * user and assistant bubbles via `.assistant_system_message`.
	 *
	 * @param {string} text - Plain-text content of the notification.
	 */
	add_system_message(text) {

		const node = document.createElement('div')
		node.classList.add('assistant_message', 'assistant_system_message')
		node.textContent = text
		this._messages.appendChild(node)
		this._scroll_to_bottom()
	}//end add_system_message



	/**
	 * ADD_USER_MESSAGE
	 * Appends a user-turn bubble to the message list. Content is set via
	 * `textContent` (not innerHTML) so no markdown processing is applied —
	 * user text is displayed verbatim for clarity and to prevent XSS.
	 *
	 * @param {string} text - The user's raw message text.
	 */
	add_user_message(text) {

		const node = document.createElement('div')
		node.classList.add('assistant_message', 'assistant_user_message')
		node.textContent = text
		this._messages.appendChild(node)
		this._scroll_to_bottom()
	}//end add_user_message



	/**
	 * ADD_ASSISTANT_MESSAGE
	 * Appends a fully-rendered (non-streaming) assistant turn, used when
	 * restoring a saved thread rather than receiving live tokens.
	 * The raw markdown source is stored in `node.dataset.raw` so the
	 * copy button can copy the original markdown rather than the HTML.
	 *
	 * @param {string} text - Markdown source of the assistant message.
	 */
	add_assistant_message(text) {
		// finalized assistant message (used when restoring threads)
		const node = document.createElement('div')
		node.classList.add('assistant_message', 'assistant_assistant_message')
		node.dataset.raw = text || ''
		node.innerHTML = markdown.render(text || '')
		this._add_copy_button(node)
		this._messages.appendChild(node)
		this._scroll_to_bottom()
	}//end add_assistant_message



	/**
	 * START_ASSISTANT_MESSAGE
	 * Initialises a new streaming assistant turn by creating the host <div>
	 * and resetting `_current_assistant_raw`. Must be called before the first
	 * `append_token` for a new generation. Subsequent calls to `append_token`
	 * update this same node in place.
	 *
	 * The created node has no content yet; it is progressively filled by
	 * `append_token` and finalised by `finalize_assistant_message`.
	 */
	start_assistant_message() {
		this._current_assistant_raw = ''
		this._current_assistant_node = document.createElement('div')
		this._current_assistant_node.classList.add('assistant_message', 'assistant_assistant_message')
		this._messages.appendChild(this._current_assistant_node)
	}//end start_assistant_message



	/**
	 * APPEND_THINKING_TOKEN
	 * Appends a token from the model's chain-of-thought stream to the
	 * collapsible "Thoughts" block. Creates the `<details>` / `<summary>` /
	 * body DOM structure on the first call, then accumulates subsequent tokens
	 * as plain text in the body.
	 *
	 * The block starts open (`details.open = true`) so the user can observe
	 * reasoning as it arrives. `append_token` collapses it once the final
	 * answer begins. The block is intentionally left open here — do not
	 * collapse it inside this method.
	 *
	 * Also dismisses the transient "Thinking…" spinner (`_hide_thinking`)
	 * because the spinner and the thoughts block serve the same role and
	 * must not both appear simultaneously.
	 *
	 * @param {string} token_text - A single incremental token from the thinking stream.
	 */
	append_thinking_token(token_text) {

		if (!token_text) return
		this._hide_thinking()

		if (!this._thoughts_block_node) {
			const block = document.createElement('details')
			block.classList.add('assistant_message', 'assistant_thoughts_block')
			block.open = true

			const summary = document.createElement('summary')
			summary.classList.add('assistant_thoughts_summary')
			summary.textContent = t('thoughts', 'Thoughts')
			block.appendChild(summary)

			const body = document.createElement('div')
			body.classList.add('assistant_thoughts_body')
			block.appendChild(body)

			this._messages.appendChild(block)
			this._thoughts_block_node = block
			this._thoughts_block_body = body
			this._thoughts_block_raw = ''
		}

		this._thoughts_block_raw += token_text
		this._thoughts_block_body.textContent = this._thoughts_block_raw
		this._scroll_to_bottom()
	}//end append_thinking_token



	/**
	 * APPEND_TOKEN
	 * Appends one token to the current streaming assistant message and re-renders
	 * the entire accumulated markdown to HTML on each call.
	 *
	 * Re-rendering the whole message on every token (rather than diffing) keeps
	 * the logic simple and avoids mid-stream broken HTML, at the cost of O(n)
	 * work per token for long messages. Acceptable for typical LLM response lengths.
	 *
	 * Side effects:
	 *   - Calls `start_assistant_message` lazily if the node was not yet created.
	 *   - Collapses the thoughts block (`details.open = false`) the first time a
	 *     token arrives, so the user's attention shifts to the answer.
	 *   - Hides the "Thinking…" spinner via `_hide_thinking`.
	 *   - Scrolls to bottom (respects `_auto_scroll`).
	 *
	 * @param {string} token_text - A single incremental token from the answer stream.
	 */
	append_token(token_text) {

		if (!this._current_assistant_node) {
			this.start_assistant_message()
		}
		this._hide_thinking()
		// collapse the thoughts block once the final answer starts streaming
		if (this._thoughts_block_node && this._thoughts_block_node.open) {
			this._thoughts_block_node.open = false
		}
		this._current_assistant_raw += token_text
		this._current_assistant_node.innerHTML = markdown.render(this._current_assistant_raw)
		this._scroll_to_bottom()
	}//end append_token



	/**
	 * FINALIZE_ASSISTANT_MESSAGE
	 * Completes a streaming assistant turn after all tokens have arrived.
	 *
	 * For the answer node:
	 *   - If there is non-whitespace content: stores the raw markdown in
	 *     `dataset.raw` and attaches a copy button.
	 *   - If the content is empty or whitespace-only: removes the node from
	 *     the DOM (guards against blank messages when generation is aborted
	 *     before any tokens are emitted).
	 *
	 * For the thoughts block:
	 *   - If there is non-whitespace thought content: stores the raw text in
	 *     `dataset.raw` for potential future copy/export use.
	 *   - If the thoughts block is empty: removes it from the DOM.
	 *
	 * Resets all streaming state (_current_assistant_node, _current_assistant_raw,
	 * _thoughts_block_node, _thoughts_block_body, _thoughts_block_raw) to null/empty
	 * so the next generation starts clean. Also calls `_hide_thinking` as a safety
	 * net in case the generation produced no tokens at all.
	 */
	finalize_assistant_message() {

		if (this._current_assistant_node) {
			if (this._current_assistant_raw && this._current_assistant_raw.trim()) {
				this._current_assistant_node.dataset.raw = this._current_assistant_raw
				this._add_copy_button(this._current_assistant_node)
			} else {
				this._current_assistant_node.remove()
			}
		}
		this._current_assistant_node = null
		this._current_assistant_raw = ''
		if (this._thoughts_block_node) {
			if (this._thoughts_block_raw && this._thoughts_block_raw.trim()) {
				this._thoughts_block_node.dataset.raw = this._thoughts_block_raw
			} else {
				this._thoughts_block_node.remove()
			}
		}
		this._thoughts_block_node = null
		this._thoughts_block_body = null
		this._thoughts_block_raw = ''
		this._hide_thinking()
	}//end finalize_assistant_message



	/**
	 * _ADD_COPY_BUTTON
	 * Appends a clipboard copy button to a finished message node.
	 * Prefers reading from `node.dataset.raw` (the original markdown source)
	 * over `node.textContent` so that markdown syntax is preserved in the
	 * clipboard rather than the rendered plain text.
	 *
	 * Uses `navigator.clipboard.writeText` (async, requires secure context or
	 * user-gesture permission). On success, adds a 'copied' CSS class to the
	 * button for 1200 ms to give visual feedback. Clipboard failures are
	 * silently swallowed — the copy button is a convenience, not a critical path.
	 *
	 * @param {HTMLElement} node - The message bubble element to attach the button to.
	 */
	_add_copy_button(node) {
		const btn = document.createElement('button')
		btn.type = 'button'
		btn.classList.add('assistant_copy_button')
		btn.title = t('copy', 'Copy')
		btn.textContent = '\u29C9' // ⧉
		btn.addEventListener('click', function(e) {
			e.stopPropagation()
			const raw = node.dataset.raw || node.textContent || ''
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(raw).then(function() {
					btn.classList.add('copied')
					setTimeout(function() { btn.classList.remove('copied') }, 1200)
				}).catch(function() {})
			}
		})
		node.appendChild(btn)
	}//end _add_copy_button



	/**
	 * SHOW_THINKING
	 * Shows a transient "Thinking…" spinner as a message bubble while the model
	 * is processing but has not yet emitted any tokens. Idempotent: if the
	 * spinner node already exists it does nothing.
	 *
	 * The spinner is dismissed automatically by `append_thinking_token` or
	 * `append_token` (whichever fires first), or by `finalize_assistant_message`
	 * as a safety net.
	 */
	show_thinking() {
		if (this._thinking_node) return
		this._thinking_node = document.createElement('div')
		this._thinking_node.classList.add('assistant_message', 'assistant_thinking_message')
		this._thinking_node.textContent = t('thinking', 'Thinking...')
		this._messages.appendChild(this._thinking_node)
		this._scroll_to_bottom()
	}//end show_thinking



	/**
	 * _HIDE_THINKING
	 * Removes the "Thinking…" spinner from the DOM and clears `_thinking_node`.
	 * Uses `parentNode.removeChild` for compatibility, checking for a parent
	 * first in case the node was already removed by another code path.
	 * Safe to call when the node does not exist or has already been removed.
	 */
	_hide_thinking() {
		if (this._thinking_node && this._thinking_node.parentNode) {
			this._thinking_node.parentNode.removeChild(this._thinking_node)
		}
		this._thinking_node = null
	}//end _hide_thinking



	/**
	 * ADD_TOOL_CALL
	 * Renders a collapsible tool-call progress card in the message list.
	 * Used to show MCP / function-call activity transparently to the user.
	 *
	 * Card structure:
	 *   <details class="assistant_tool_call assistant_tool_call_{status}">
	 *     <summary>{icon} {tool_name}</summary>
	 *     [arguments section]
	 *     [result section]
	 *   </details>
	 *
	 * Status values and their icons:
	 *   'calling' \u2192 \u23F3 (U+23F3) — in progress
	 *   'done'    \u2192 \u2705 (U+2705) — completed successfully
	 *   'error'   \u2192 \u274C (U+274C) — failed
	 *   other     \u2192 \uD83D\uDEAB (U+1F6AB) — denied / unknown
	 *
	 * Arguments and result are stringified via `chat_render._stringify` with a
	 * 4096-character cap to prevent huge tool results from overwhelming the UI.
	 * Either or both may be null/undefined when not yet available.
	 *
	 * Returns the created node so the caller can pass it to `update_tool_call`
	 * when the tool completes or errors.
	 *
	 * @param {string} tool_name - Name of the tool being called.
	 * @param {string} status    - Initial status ('calling' | 'done' | 'error').
	 * @param {*}      args      - Tool arguments (any JSON-serialisable value), or null.
	 * @param {*}      result    - Tool result (any JSON-serialisable value), or null.
	 * @returns {HTMLElement} The `<details>` element appended to the message list.
	 */
	add_tool_call(tool_name, status, args, result) {

		const node = document.createElement('details')
		node.classList.add('assistant_tool_call', 'assistant_tool_call_' + status)

		const summary = document.createElement('summary')
		const icon = status === 'calling' ? '\u23F3'
			: status === 'done' ? '\u2705'
			: status === 'error' ? '\u274C'
			: '\uD83D\uDEAB' // 🚫
		summary.textContent = icon + ' ' + tool_name
		node.appendChild(summary)

		if (args !== undefined && args !== null) {
			const args_label = document.createElement('div')
			args_label.classList.add('assistant_tool_call_label')
			args_label.textContent = 'arguments:'
			node.appendChild(args_label)
			const args_pre = document.createElement('pre')
			args_pre.classList.add('assistant_tool_call_pre')
			args_pre.textContent = chat_render._stringify(args, 4096)
			node.appendChild(args_pre)
		}
		if (result !== undefined && result !== null) {
			const result_label = document.createElement('div')
			result_label.classList.add('assistant_tool_call_label')
			result_label.textContent = 'result:'
			node.appendChild(result_label)
			const result_pre = document.createElement('pre')
			result_pre.classList.add('assistant_tool_call_pre')
			result_pre.textContent = chat_render._stringify(result, 4096)
			node.appendChild(result_pre)
		}

		this._messages.appendChild(node)
		this._scroll_to_bottom()
		return node
	}//end add_tool_call



	/**
	 * UPDATE_TOOL_CALL
	 * Updates an existing tool-call card (previously created by `add_tool_call`)
	 * to reflect a new status and optionally append a result section.
	 *
	 * Strips all four known status CSS classes before adding the new one, making
	 * status transitions (e.g. 'calling' \u2192 'done' / 'error' / 'denied') safe
	 * regardless of the current state.
	 *
	 * The summary icon is updated by replacing the first character and preserving
	 * everything from the first space onward (the tool name). The extraction via
	 * `text.indexOf(' ')` is safe as long as `add_tool_call` always sets the
	 * summary to "{icon} {tool_name}".
	 *
	 * @param {HTMLElement|null} node   - The `<details>` node returned by `add_tool_call`.
	 * @param {string}           status - New status ('calling' | 'done' | 'error' | other).
	 * @param {*}                result - Result value to append, or undefined/null to skip.
	 */
	update_tool_call(node, status, result) {
		if (!node) return
		node.classList.remove('assistant_tool_call_calling')
		node.classList.remove('assistant_tool_call_done')
		node.classList.remove('assistant_tool_call_error')
		node.classList.remove('assistant_tool_call_denied')
		node.classList.add('assistant_tool_call_' + status)

		const summary = node.querySelector('summary')
		if (summary) {
			const icon = status === 'calling' ? '\u23F3'
				: status === 'done' ? '\u2705'
				: status === 'error' ? '\u274C'
				: '\uD83D\uDEAB'
			const text = summary.textContent
			summary.textContent = icon + text.substring(text.indexOf(' '))
		}
		if (result !== undefined && result !== null) {
			const result_label = document.createElement('div')
			result_label.classList.add('assistant_tool_call_label')
			result_label.textContent = 'result:'
			node.appendChild(result_label)
			const result_pre = document.createElement('pre')
			result_pre.classList.add('assistant_tool_call_pre')
			result_pre.textContent = chat_render._stringify(result, 4096)
			node.appendChild(result_pre)
		}
		this._scroll_to_bottom()
	}//end update_tool_call



	/**
	 * _STRINGIFY
	 * Converts any value to a display string, capped at `max_len` characters.
	 * Strings are returned as-is; other values are JSON-serialised with 2-space
	 * indentation. Falls back to `String(v)` if JSON.stringify throws (e.g. for
	 * circular references). Truncated output is suffixed with a newline and "…"
	 * to signal the truncation clearly.
	 *
	 * @param {*}      v       - The value to stringify.
	 * @param {number} max_len - Maximum character length of the result.
	 * @returns {string} Human-readable string representation, truncated if needed.
	 */
	static _stringify(v, max_len) {
		let s
		try {
			s = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
		} catch(e) {
			s = String(v)
		}
		if (s && s.length > max_len) {
			s = s.substring(0, max_len) + '\n…'
		}
		return s
	}//end _stringify



	/**
	 * CONFIRM_ACTION
	 * Prompts the user for a yes/no confirmation and returns a Promise that
	 * resolves to true (confirmed) or false (cancelled).
	 *
	 * (!) Uses the synchronous `window.confirm` dialog, which blocks the JS event
	 * loop. Avoid calling it from within streaming callbacks where blocking would
	 * be disruptive. A future version should replace this with a non-blocking
	 * inline dialog rendered inside the tool panel.
	 *
	 * @param {string} message - The confirmation question to display.
	 * @returns {Promise<boolean>} Resolves to true if the user confirms, false otherwise.
	 */
	confirm_action(message) {
		return new Promise(function(resolve) {
			resolve(window.confirm(message))
		})
	}//end confirm_action



	/**
	 * SHOW_PROGRESS
	 * Makes the progress bar visible and updates it to a given percentage.
	 * Used during model download or initialisation to give feedback while
	 * the page is otherwise idle. The fill element grows via CSS `width` and
	 * the text label shows the rounded integer percentage.
	 *
	 * @param {number} progress - Completion percentage (0–100).
	 */
	show_progress(progress) {
		this._progress_bar.style.display = 'flex'
		if (this._progress_fill) {
			this._progress_fill.style.width = progress + '%'
		}
		this._progress_text.textContent = Math.round(progress) + '%'
	}//end show_progress



	/**
	 * HIDE_PROGRESS
	 * Hides the progress bar after model loading is complete.
	 */
	hide_progress() {
		this._progress_bar.style.display = 'none'
	}//end hide_progress



	/**
	 * HIDE_INPUT
	 * Switches the footer from idle mode (send button visible, input enabled)
	 * to streaming mode (input disabled, send button hidden, stop button shown).
	 * Called when a generation begins so the user cannot submit another message
	 * mid-stream and can instead abort the current one.
	 */
	hide_input() {
		if (this._input) this._input.disabled = true
		if (this._send_button) {
			this._send_button.disabled = true
			this._send_button.style.display = 'none'
		}
		if (this._stop_button) this._stop_button.style.display = 'flex'
	}//end hide_input



	/**
	 * SHOW_INPUT
	 * Restores the footer to idle mode: re-enables the textarea, focuses it
	 * for immediate typing, shows the send button, and hides the stop button.
	 * Called when generation completes or is aborted.
	 */
	show_input() {
		if (this._input) {
			this._input.disabled = false
			this._input.focus()
		}
		if (this._send_button) {
			this._send_button.disabled = false
			this._send_button.style.display = 'flex'
		}
		if (this._stop_button) this._stop_button.style.display = 'none'
	}//end show_input



	/**
	 * CLEAR_MESSAGES
	 * Removes all messages from the DOM and resets all streaming state.
	 * Called by `ai_assistant` when starting a new conversation or loading
	 * a saved thread (after which the thread messages are re-added from history).
	 *
	 * Resets: _current_assistant_node, _current_assistant_raw, _thinking_node,
	 * _thoughts_block_node, _thoughts_block_body, _thoughts_block_raw, _auto_scroll.
	 */
	clear_messages() {
		if (this._messages) this._messages.innerHTML = ''
		this._current_assistant_node = null
		this._current_assistant_raw = ''
		this._thinking_node = null
		this._thoughts_block_node = null
		this._thoughts_block_body = null
		this._thoughts_block_raw = ''
		this._auto_scroll = true
	}//end clear_messages



	/**
	 * _SCROLL_TO_BOTTOM
	 * Scrolls the message list to the bottom, but only when `_auto_scroll` is true.
	 * Called after every DOM mutation that adds or updates content.
	 * The guard prevents scroll-hijacking while the user is reading older messages.
	 */
	_scroll_to_bottom() {
		if (this._messages && this._auto_scroll) {
			this._messages.scrollTop = this._messages.scrollHeight
		}
	}//end _scroll_to_bottom



}//end chat_render class
