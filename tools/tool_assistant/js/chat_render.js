// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label*/
/*eslint no-undef: "error"*/



// import
	import { markdown } from './markdown.js'



/**
 * Localized label helper.
 * @param {string} key
 * @param {string} fallback
 * @return {string}
 */
const t = function(key, fallback) {
	if (typeof get_label !== 'undefined' && get_label && get_label[key]) {
		return get_label[key]
	}
	return fallback
}//end t



/**
 * CHAT_RENDER
 * Builds and manages the chat UI DOM elements.
 */
export const chat_render = class chat_render {



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



	_autogrow_input() {
		this._input.style.height = 'auto'
		const max = 6 * 18 // ~6 rows
		this._input.style.height = Math.min(this._input.scrollHeight, max) + 'px'
	}//end _autogrow_input



	_handle_send() {

		const message = this._input.value.trim()
		if (!message) return

		this._input.value = ''
		this._autogrow_input()
		this._auto_scroll = true
		this._on_send(message)
	}//end _handle_send



	set_model_badge(model_id, device) {
		if (!this._model_badge) return
		const short = (model_id || '').split('/').pop() || model_id || '?'
		this._model_badge.textContent = short + ' · ' + (device || '?')
		this._model_badge.title = (model_id || '') + ' (' + (device || '') + ')'
	}//end set_model_badge



	// ----- HISTORY DROPDOWN ---------------------------------------------------

	_toggle_history() {
		if (this._history_dropdown.style.display === 'none') {
			this._render_history()
			this._history_dropdown.style.display = 'block'
			this._close_settings()
		} else {
			this._close_history()
		}
	}//end _toggle_history



	_close_history() {
		if (this._history_dropdown) this._history_dropdown.style.display = 'none'
	}//end _close_history



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

	_toggle_settings() {
		if (this._settings_popover.style.display === 'none') {
			this._render_settings()
			this._settings_popover.style.display = 'block'
			this._close_history()
		} else {
			this._close_settings()
		}
	}//end _toggle_settings



	_close_settings() {
		if (this._settings_popover) this._settings_popover.style.display = 'none'
	}//end _close_settings



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

	add_system_message(text) {

		const node = document.createElement('div')
		node.classList.add('assistant_message', 'assistant_system_message')
		node.textContent = text
		this._messages.appendChild(node)
		this._scroll_to_bottom()
	}//end add_system_message



	add_user_message(text) {

		const node = document.createElement('div')
		node.classList.add('assistant_message', 'assistant_user_message')
		node.textContent = text
		this._messages.appendChild(node)
		this._scroll_to_bottom()
	}//end add_user_message



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



	start_assistant_message() {
		this._current_assistant_raw = ''
		this._current_assistant_node = document.createElement('div')
		this._current_assistant_node.classList.add('assistant_message', 'assistant_assistant_message')
		this._messages.appendChild(this._current_assistant_node)
	}//end start_assistant_message



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



	finalize_assistant_message() {

		if (this._current_assistant_node) {
			this._current_assistant_node.dataset.raw = this._current_assistant_raw
			this._add_copy_button(this._current_assistant_node)
		}
		this._current_assistant_node = null
		this._current_assistant_raw = ''
		if (this._thoughts_block_node) {
			this._thoughts_block_node.dataset.raw = this._thoughts_block_raw
		}
		this._thoughts_block_node = null
		this._thoughts_block_body = null
		this._thoughts_block_raw = ''
		this._hide_thinking()
	}//end finalize_assistant_message



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



	show_thinking() {
		if (this._thinking_node) return
		this._thinking_node = document.createElement('div')
		this._thinking_node.classList.add('assistant_message', 'assistant_thinking_message')
		this._thinking_node.textContent = t('thinking', 'Thinking...')
		this._messages.appendChild(this._thinking_node)
		this._scroll_to_bottom()
	}//end show_thinking



	_hide_thinking() {
		if (this._thinking_node && this._thinking_node.parentNode) {
			this._thinking_node.parentNode.removeChild(this._thinking_node)
		}
		this._thinking_node = null
	}//end _hide_thinking



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



	confirm_action(message) {
		return new Promise(function(resolve) {
			resolve(window.confirm(message))
		})
	}//end confirm_action



	show_progress(progress) {
		this._progress_bar.style.display = 'flex'
		if (this._progress_fill) {
			this._progress_fill.style.width = progress + '%'
		}
		this._progress_text.textContent = Math.round(progress) + '%'
	}//end show_progress



	hide_progress() {
		this._progress_bar.style.display = 'none'
	}//end hide_progress



	hide_input() {
		if (this._input) this._input.disabled = true
		if (this._send_button) {
			this._send_button.disabled = true
			this._send_button.style.display = 'none'
		}
		if (this._stop_button) this._stop_button.style.display = 'flex'
	}//end hide_input



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



	_scroll_to_bottom() {
		if (this._messages && this._auto_scroll) {
			this._messages.scrollTop = this._messages.scrollHeight
		}
	}//end _scroll_to_bottom



}//end chat_render class
