// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
 * MODEL_ENGINE
 * Wraps Transformers.js for local LLM inference in the browser.
 */
export const model_engine = class model_engine {



	constructor(config={}) {
		this._pipeline	= null
		this._tokenizer	= null
		this._TextStreamer = null
		this._config	= config
		this._model_id	= config.model_id || 'onnx-community/Qwen3.5-0.8B-ONNX'
		this._device	= config.device || 'webgpu'
		this._loaded	= false
		// per-model fallback: same model_id reloaded on `fallback_device` (e.g. wasm)
		this._fallback_device = config.fallback_device || 'wasm'
	}//end constructor



	async load(options={}) {

		const on_progress = options.on_progress || (() => {})

		let device = this._device
		if (device === 'webgpu' && !navigator.gpu) {
			console.warn('[model_engine] WebGPU not available, falling back to WASM')
			device = this._config.fallback_device || 'wasm'
		}

		const dtype = device === 'wasm'
			? 'q4'
			: (this._config.dtype || 'q4f16')

		console.log('[model_engine] loading model:', this._model_id, 'device:', device, 'dtype:', dtype)

		const transformers = await import(
			'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0'
		)

		transformers.env.allowLocalModels = false

		this._TextStreamer = transformers.TextStreamer
		this._transformers = transformers

		// detect Qwen3.5 models (use AutoProcessor + direct model API)
		this._is_qwen35 = this._model_id.indexOf('Qwen3.5') !== -1

		let actual_device = device
		if (this._is_qwen35) {
			actual_device = await this._load_qwen35(transformers, device, dtype, on_progress)
		} else {
			actual_device = await this._load_pipeline(transformers, device, dtype, on_progress)
		}

		this._device	= actual_device
		this._loaded	= true
	}//end load



	async _load_qwen35(transformers, device, dtype, on_progress) {

		const dtype_config = {
			embed_tokens			: dtype,
			decoder_model_merged	: dtype
		}

		console.log('[model_engine] loading Qwen3.5 with dtype config:', JSON.stringify(dtype_config))

		try {
			this._processor = await transformers.AutoProcessor.from_pretrained(this._model_id)
			this._model = await transformers.Qwen3_5ForConditionalGeneration.from_pretrained(
				this._model_id,
				{
					device		: device,
					dtype		: dtype_config,
					progress_callback: (progress) => {
						if (progress.status === 'progress' && progress.progress !== undefined) {
							on_progress(progress.progress)
						}
						if (progress.status === 'done') {
							on_progress(100)
						}
					}
				}
			)
			return device
		} catch (load_err) {
			if (device === 'webgpu') {
				console.warn('[model_engine] Qwen3.5 WebGPU failed, retrying with WASM:', load_err.message)
				this._processor = await transformers.AutoProcessor.from_pretrained(this._model_id)
				this._model = await transformers.Qwen3_5ForConditionalGeneration.from_pretrained(
					this._model_id,
					{
						device		: 'wasm',
						dtype		: { embed_tokens: 'q4', decoder_model_merged: 'q4' },
						progress_callback: (progress) => {
							if (progress.status === 'progress' && progress.progress !== undefined) {
								on_progress(progress.progress)
							}
							if (progress.status === 'done') {
								on_progress(100)
							}
						}
					}
				)
				return 'wasm'
			} else {
				throw load_err
			}
		}
	}//end _load_qwen35



	async _load_pipeline(transformers, device, dtype, on_progress) {

		const load_with_device = async function(dev, dt) {
			return await transformers.pipeline(
				'text-generation',
				this._model_id,
				{
					device		: dev,
					dtype		: dt,
					progress_callback: (progress) => {
						if (progress.status === 'progress' && progress.progress !== undefined) {
							on_progress(progress.progress)
						}
						if (progress.status === 'done') {
							on_progress(100)
						}
					}
				}
			)
		}.bind(this)

		try {
			this._pipeline = await load_with_device(device, dtype)
		} catch (load_err) {
			if (device === 'webgpu') {
				console.warn('[model_engine] WebGPU failed, retrying with WASM:', load_err.message)
				this._pipeline = await load_with_device('wasm', 'q4')
				return 'wasm'
			} else {
				throw load_err
			}
		}

		return device
	}//end _load_pipeline



	async generate(options={}) {

		const is_ready = this._model_type === 'pipeline'
			? !!this._pipeline
			: !!(this._model && this._processor)
		if (!is_ready) {
			throw new Error('Model not loaded. Call load() first.')
		}

		const messages			= options.messages || []
		const tools				= options.tools || []
		const max_new_tokens	= options.max_new_tokens || this._config.max_new_tokens || 2048
		const on_token			= options.on_token || (() => {})
		const on_think_token	= options.on_think_token || (() => {})

		try {
			if (this._model_type === 'pipeline') {
				return await this._do_generate_pipeline(messages, tools, max_new_tokens, on_token, on_think_token)
			}
			return await this._do_generate_direct(messages, tools, max_new_tokens, on_token, on_think_token)
		} catch (err) {
			if (this._device === 'webgpu' && model_engine._is_retryable_backend_error(err)) {
				console.warn('[model_engine] WebGPU inference failed, falling back to WASM:', err.message)
				try {
					await this._reload_as_wasm()
					if (this._model_type === 'pipeline') {
						return await this._do_generate_pipeline(messages, tools, max_new_tokens, on_token, on_think_token)
					}
					return await this._do_generate_direct(messages, tools, max_new_tokens, on_token, on_think_token)
				} catch (wasm_err) {
					throw new Error('Model backend failed on WebGPU and fallback device. Use a smaller model or switch device. Last error: ' + wasm_err.message)
				}
			}
			throw err
		}
	}//end generate



	static _is_retryable_backend_error(err) {

		const message = err && err.message
			? err.message
			: String(err || '')

		return message.indexOf('bad_alloc') !== -1
			|| message.indexOf('unaligned accesses') !== -1
			|| message.indexOf('device lost') !== -1
			|| message.indexOf('GPU') !== -1
			|| message.indexOf('allocate memory') !== -1
			|| message.indexOf('buffer mapping') !== -1
	}//end _is_retryable_backend_error



	async _reload_as_wasm() {

		// reload the SAME model on the configured fallback device (wasm by default)
		const fb_device = this._fallback_device || 'wasm'
		const fb_dtype = fb_device === 'wasm' ? 'q4' : (this._config.dtype || 'q4f16')
		console.log('[model_engine] reloading on fallback device:', fb_device, 'model:', this._model_id)
		this._pipeline	= null
		this._model		= null
		this._processor	= null
		this._loaded	= false

		const transformers = await import(
			'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0'
		)

		this._TextStreamer	= transformers.TextStreamer
		this._transformers	= transformers

		if (this._model_type === 'pipeline') {
			this._pipeline = await transformers.pipeline(
				'text-generation',
				this._model_id,
				{ device: fb_device, dtype: fb_dtype }
			)
		} else {
			const model_class_name	= model_engine._MODEL_CLASS_MAP[this._model_type]
			const ModelClass		= transformers[model_class_name]
			const dtype_config		= model_engine._build_dtype_config(this._model_type, fb_dtype)
			this._processor = await transformers.AutoProcessor.from_pretrained(this._model_id)
			this._model = await ModelClass.from_pretrained(this._model_id, {
				device	: fb_device,
				dtype	: dtype_config
			})
		}
		this._device	= fb_device
		this._loaded	= true
	}//end _reload_as_wasm



	_is_thinking_enabled() {
		// `thinking` is a level string: 'none' | 'low' | 'high'. Any non-'none'
		// value turns on the chat-template thinking flag.
		const level = (this._config && this._config.thinking) || 'none'
		return level !== 'none' && level !== false
	}//end _is_thinking_enabled



	async _do_generate_pipeline(messages, tools, max_new_tokens, on_token, on_think_token) {

		const generate_options = {
			max_new_tokens		: max_new_tokens,
			do_sample			: true,
			temperature			: 0.7,
			top_p				: 0.9,
			repetition_penalty	: 1.1,
			enable_thinking		: this._is_thinking_enabled()
		}

		if (tools.length > 0) {
			generate_options.tools = tools
		}

		const streamed_text	= this._create_streamer(this._pipeline.tokenizer, on_token, on_think_token)
		generate_options.streamer = streamed_text.streamer

		const result = await this._pipeline(messages, generate_options)
		streamed_text.flush()

		return this._build_result(streamed_text.get_text(), result)
	}//end _do_generate_pipeline



	async _do_generate_direct(messages, tools, max_new_tokens, on_token, on_think_token) {

		const tokenizer		= this._processor.tokenizer || this._processor
		const stream		= this._create_streamer(tokenizer, on_token, on_think_token)

		// apply chat template with tools
		const inputs = tokenizer.apply_chat_template(
			messages,
			{
				tokenize			: true,
				return_dict			: true,
				add_generation_prompt: true,
				tools				: tools.length > 0 ? tools : undefined,
				enable_thinking		: this._is_thinking_enabled()
			}
		)

		const generate_options = {
			...inputs,
			max_new_tokens		: max_new_tokens,
			do_sample			: true,
			temperature			: 0.7,
			top_p				: 0.9,
			repetition_penalty	: 1.1,
			streamer			: stream.streamer
		}

		const output_ids = await this._model.generate(generate_options)
		stream.flush()

		// decode only the new tokens (skip input length)
		const input_length	= inputs.input_ids.dims[inputs.input_ids.dims.length - 1]
		const new_ids		= output_ids.slice([0, [input_length]])
		const decoded		= tokenizer.decode(new_ids[0], { skip_special_tokens: true })

		return this._build_result(stream.get_text(), { generated_text: decoded, raw_output: output_ids })
	}//end _do_generate_direct



	_create_streamer(tokenizer, on_token, on_think_token) {

		const think_cb = on_think_token || function(){}

		// state machine: accumulates raw text and emits only content that is
		// outside <think>...</think> and <tool_call>...</tool_call> blocks.
		// Thinking content is forwarded to `think_cb` so the UI can render it.
		// Uses a small pending buffer to never emit partial tag prefixes.
		const state = {
			text		: '',  // full raw stream (used by parse_tool_calls / _build_result)
			in_think	: false,
			in_tool		: false,
			seen_think	: false, // a <think> block was opened at any point
			pending		: ''   // bytes withheld until we know they are not a tag prefix
		}

		const suspicious_prefix = function(s) {
			// returns true if s could be the start of <think>, </think>, <tool_call>, </tool_call>
			if (s.length === 0) return false
			const tags = ['<think>', '</think>', '<tool_call>', '</tool_call>']
			for (let i = 0; i < tags.length; i++) {
				if (tags[i].startsWith(s)) return true
			}
			return false
		}

		const flush_safe = function() {
			// emit all of pending that is guaranteed not to be a partial tag.
			// Strategy: keep last 12 chars in pending if they could be a tag prefix,
			// otherwise emit pending fully.
			let emit = ''
			let hold = state.pending
			while (hold.length > 0) {
				const lt = hold.indexOf('<')
				if (lt === -1) {
					emit += hold
					hold = ''
					break
				}
				emit += hold.substring(0, lt)
				const tail = hold.substring(lt)
				// is the tail a complete tag we recognise? if yes, leave for process_buffer
				if (tail === '<' || suspicious_prefix(tail)) {
					hold = tail
					break
				}
				// '<' followed by non-tag chars: emit '<' and continue
				emit += '<'
				hold = tail.substring(1)
			}
			state.pending = hold
			if (emit.length > 0) on_token(emit)
		}

		const process_buffer = function() {
			while (true) {
				if (state.in_think) {
					const close = state.pending.indexOf('</think>')
					if (close === -1) {
						// emit everything that cannot be the start of '</think>'
						const keep = Math.max(0, state.pending.length - 8)
						if (keep > 0) {
							think_cb(state.pending.substring(0, keep))
						}
						state.pending = state.pending.substring(keep)
						return
					}
					if (close > 0) {
						think_cb(state.pending.substring(0, close))
					}
					state.pending = state.pending.substring(close + '</think>'.length)
					state.in_think = false
					continue
				}
				if (state.in_tool) {
					const close = state.pending.indexOf('</tool_call>')
					if (close === -1) {
						const keep = Math.max(0, state.pending.length - 12)
						state.pending = state.pending.substring(keep)
						return
					}
					state.pending = state.pending.substring(close + '</tool_call>'.length)
					state.in_tool = false
					continue
				}
				// not inside a special block: try to detect openings
				const think_open	= state.pending.indexOf('<think>')
				const tool_open		= state.pending.indexOf('<tool_call>')
				let next_open = -1
				let next_kind = null
				if (think_open !== -1 && (tool_open === -1 || think_open < tool_open)) {
					next_open = think_open
					next_kind = 'think'
				} else if (tool_open !== -1) {
					next_open = tool_open
					next_kind = 'tool'
				}
				if (next_open === -1) {
					flush_safe()
					return
				}
				// emit content before the tag (with safe flush logic on '<')
				const before = state.pending.substring(0, next_open)
				const rest = state.pending.substring(next_open)
				state.pending = before
				flush_safe()
				state.pending = rest
				if (next_kind === 'think') {
					state.pending = state.pending.substring('<think>'.length)
					state.in_think = true
					state.seen_think = true
				} else {
					state.pending = state.pending.substring('<tool_call>'.length)
					state.in_tool = true
				}
			}
		}

		const streamer = new this._TextStreamer(tokenizer, {
			skip_prompt			: true,
			skip_special_tokens	: true,
			callback_function	: function(chunk) {
				state.text += chunk
				state.pending += chunk
				process_buffer()
			}
		})

		return {
			streamer: streamer,
			get_text: function() { return state.text },
			flush: function() {
				// emit any safely-buffered tail at end of stream
				if (state.in_think) {
					if (state.pending.length > 0) think_cb(state.pending)
					state.pending = ''
					return
				}
				if (state.in_tool) {
					state.pending = ''
					return
				}
				if (state.pending.length > 0) {
					on_token(state.pending)
					state.pending = ''
				}
			}
		}
	}//end _create_streamer



	_build_result(streamed_text, raw_result) {

		let full_text = streamed_text
		if (full_text.indexOf('</think>') !== -1) {
			full_text = full_text.substring(full_text.indexOf('</think>') + '</think>'.length)
		} else if (full_text.indexOf('<think>') !== -1) {
			full_text = ''
		}
		full_text = full_text
			.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
			.replace(/(?:^|\s)call\s*:\s*[a-zA-Z0-9_]+\s*\{[\s\S]*?\}/g, '')
			.trim()

		if (!full_text) {
			const generated = Array.isArray(raw_result)
				? (raw_result[0] && raw_result[0].generated_text)
				: (raw_result && raw_result.generated_text)

			if (typeof generated === 'string') {
				full_text = generated
			} else if (Array.isArray(generated)) {
				const last_assistant = generated.filter(function(m) {
					return m.role === 'assistant'
				}).pop()
				full_text = last_assistant ? last_assistant.content : ''
			} else if (generated) {
				full_text = JSON.stringify(generated)
			}
		}

		return {
			full_text		: full_text || '',
			raw_result		: raw_result,
			streamed_text	: streamed_text
		}
	}//end _build_result



	parse_tool_calls(generation_result) {

		const text = generation_result.streamed_text || generation_result.full_text || ''
		const tool_calls = []

		// 1. Structured tool_calls from v4.2.0 pipeline (chat mode)
			const raw = generation_result.raw_result
			if (raw) {
				let generated = null
				if (Array.isArray(raw)) {
					generated = raw[0] && raw[0].generated_text
				} else if (raw && raw.generated_text) {
					generated = raw.generated_text
				}
				if (Array.isArray(generated)) {
					const last_msg = generated[generated.length - 1]
					if (last_msg && last_msg.role === 'assistant' && last_msg.tool_calls && last_msg.tool_calls.length > 0) {
						return last_msg.tool_calls
					}
				}
			}

		// 2. Qwen3 native <tool_call>...</tool_call> format
			const tool_call_regex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g
			let match
			while ((match = tool_call_regex.exec(text)) !== null) {
				try {
					const parsed = JSON.parse(match[1])
					if (parsed.name) {
						tool_calls.push({
							id			: 'call_' + tool_calls.length,
							type		: 'function',
							function	: {
								name		: parsed.name,
								arguments	: typeof parsed.arguments === 'string'
									? parsed.arguments
									: JSON.stringify(parsed.arguments || {})
							}
						})
					}
				} catch(e) {
					// skip malformed JSON
				}
			}

			const inline_call_regex = /(?:^|\s)call\s*:\s*([a-zA-Z0-9_]+)\s*(\{[\s\S]*?\})/g
			while ((match = inline_call_regex.exec(text)) !== null) {
				const name = match[1]
				const args = model_engine._parse_relaxed_arguments(match[2])
				tool_calls.push({
					id			: 'call_' + tool_calls.length,
					type		: 'function',
					function	: {
						name		: name,
						arguments	: JSON.stringify(args)
					}
				})
			}

		return tool_calls.length > 0 ? tool_calls : null
	}//end parse_tool_calls



	static _parse_relaxed_arguments(raw_arguments) {

		if (!raw_arguments || typeof raw_arguments !== 'string') {
			return {}
		}

		try {
			return JSON.parse(raw_arguments)
		} catch(e) {}

		const source = raw_arguments.trim().replace(/^\{|\}$/g, '')
		const args = {}
		const parts = source.split(/\s*,\s*/)

		for (const part of parts) {
			if (!part) continue
			const separator = part.indexOf(':')
			if (separator === -1) continue

			const key = part.substring(0, separator).trim().replace(/^['"]|['"]$/g, '')
			let value = part.substring(separator + 1).trim().replace(/^['"]|['"]$/g, '')

			if (!key) continue
			if (value === 'true') {
				value = true
			} else if (value === 'false') {
				value = false
			} else if (value === 'null') {
				value = null
			}
			args[key] = value
		}

		return args
	}//end _parse_relaxed_arguments



	unload() {
		this._pipeline	= null
		this._model		= null
		this._processor	= null
		this._loaded	= false
	}//end unload



	is_loaded() {
		return this._loaded
	}//end is_loaded



	get_device() {
		return this._device
	}//end get_device



	get_model_id() {
		return this._model_id
	}//end get_model_id



	// ── Static helpers ────────────────────────────────────────────────

	static _MODEL_CLASS_MAP = {
		qwen35	: 'Qwen3_5ForConditionalGeneration',
		gemma4	: 'Gemma4ForConditionalGeneration'
	}

	static _detect_model_type(model_id) {
		if (model_id.indexOf('Qwen3.5') !== -1 || model_id.indexOf('Qwen3_5') !== -1) return 'qwen35'
		if (model_id.indexOf('Gemma4') !== -1 || model_id.indexOf('gemma-4') !== -1) return 'gemma4'
		return 'pipeline'
	}

	static _build_dtype_config(model_type, dtype) {
		if (model_type === 'gemma4') {
			return {
				embed_tokens			: dtype,
				vision_encoder			: 'fp16',
				decoder_model_merged	: dtype
			}
		}
		// qwen35 and future direct-model families
		return {
			embed_tokens			: dtype,
			decoder_model_merged	: dtype
		}
	}

}//end model_engine class