// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
 * MODEL_ENGINE
 * Browser-side inference adapter for the Dédalo AI assistant.
 *
 * Wraps the Transformers.js library (loaded dynamically at runtime from the
 * jsDelivr CDN) to provide a unified API that covers three execution paths:
 *
 *   1. Local WebGPU   — weights run natively on the GPU via the WebGPU backend.
 *                       Fastest, but requires a WebGPU-capable browser.
 *   2. Local WASM     — weights run in the browser's WebAssembly sandbox.
 *                       Universal fallback; slower than WebGPU, no GPU required.
 *   3. Remote server  — when `config.api_url` is set, no local weights are
 *                       loaded; generation is routed to the server by the
 *                       caller (`ai_assistant`). The engine marks itself
 *                       loaded and returns immediately.
 *
 * Two internal loading strategies are used depending on model family:
 *   - 'pipeline'  : uses `transformers.pipeline('text-generation', …)` — the
 *                   high-level Transformers.js API, suitable for most HF models.
 *   - 'qwen35'
 *   - 'gemma4'    : uses `AutoProcessor` + a named model class directly
 *                   (Qwen3_5ForConditionalGeneration / Gemma4ForConditionalGeneration).
 *                   These families expose dedicated dtype maps (per-sub-model
 *                   quantisation) and require the lower-level API.
 *
 * The class also handles:
 *   - Automatic WebGPU→WASM fallback on `load()` failure or on mid-generation
 *     device loss (retried only for known-recoverable error patterns).
 *   - Token streaming with inline `<think>…</think>` and
 *     `<tool_call>…</tool_call>` block filtering: thinking tokens are forwarded
 *     to `on_think_token`; tool-call markup is stripped so the visible chat
 *     bubble only shows prose.
 *   - Structured tool-call parsing from both the Transformers.js native format
 *     (v4.2+ pipeline with chat templates) and the Qwen3 XML-tag format.
 *
 * Consumed by: `ai_assistant` (tools/tool_assistant/js/ai_assistant.js).
 * External dependency: https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0
 *
 * @module model_engine
 */
export const model_engine = class model_engine {



	/**
	 * MODEL_ENGINE constructor
	 * Initialises instance state; does NOT load model weights — call load() separately.
	 *
	 * @param {Object} config - Configuration options.
	 * @param {string} [config.model_id='onnx-community/Qwen3.5-0.8B-ONNX'] - HuggingFace
	 *   model ID or a local ONNX path recognisable by Transformers.js.
	 * @param {string} [config.device='webgpu'] - Primary inference device: 'webgpu' or 'wasm'.
	 * @param {string} [config.fallback_device='wasm'] - Device to use when the primary device
	 *   fails. Applied both during load() and on mid-generation device-loss errors.
	 * @param {string} [config.dtype='q4f16'] - Quantisation dtype for WebGPU loads.
	 *   WASM loads always use 'q4' regardless of this setting.
	 * @param {number} [config.max_new_tokens=512] - Default token budget per generation call.
	 * @param {string} [config.thinking='none'] - Thinking level: 'none' | 'low' | 'high'.
	 *   Any value other than 'none' enables the chat-template `enable_thinking` flag,
	 *   which causes supporting models (Qwen3-family) to emit a `<think>…</think>` block
	 *   before the visible answer.
	 * @param {string} [config.api_url] - When present, the engine operates in server-proxy
	 *   mode: load() is a no-op and `this._device` is set to 'server'.
	 */
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
		// detect model family: 'pipeline' (default), 'qwen35', or 'gemma4'
		this._model_type = model_engine._detect_model_type(this._model_id)
	}//end constructor



	/**
	 * LOAD
	 * Downloads and initialises model weights in the browser.
	 *
	 * The method is idempotent in practice — callers should check is_loaded()
	 * before calling, but calling twice with the same config is safe (the second
	 * call will re-fetch weights from the HTTP cache).
	 *
	 * Execution paths:
	 *   1. Server mode (config.api_url set) → sets device='server', returns immediately.
	 *   2. WebGPU requested but navigator.gpu absent → silently demotes to WASM.
	 *   3. 'pipeline' model_type → delegates to _load_pipeline().
	 *   4. 'qwen35' / 'gemma4' → delegates to _load_direct().
	 *
	 * On success, `this._loaded` becomes true and `this._device` reflects the actual
	 * device used (may differ from the original config if a fallback occurred).
	 *
	 * @param {Object} [options={}] - Load-time options.
	 * @param {Function} [options.on_progress] - Progress callback invoked with a number
	 *   in [0, 100] as weight shards are downloaded. The engine calls it on each
	 *   Transformers.js 'progress' event and once more with 100 on 'done'.
	 * @returns {Promise<void>}
	 * @throws {Error} If model loading fails on all available devices.
	 */
	async load(options={}) {

		const on_progress = options.on_progress || (() => {})

		// Server/API models have no local weights to load.
		// Mark as loaded so the assistant can route generation to the API.
		if (this._config.api_url) {
			console.log('[model_engine] server model configured, skipping local load:', this._model_id)
			this._device = 'server'
			this._loaded = true
			return
		}

		let device = this._device
		if (device === 'webgpu' && !navigator.gpu) {
			console.warn('[model_engine] WebGPU not available, falling back to WASM')
			device = this._config.fallback_device || 'wasm'
		}

		// WASM requires 'q4' (integer-only); WebGPU supports q4f16 (mixed float16/int4).
		const dtype = device === 'wasm'
			? 'q4'
			: (this._config.dtype || 'q4f16')

		console.log('[model_engine] loading model:', this._model_id, 'device:', device, 'dtype:', dtype)

		const transformers = await import(
			'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0'
		)

		// Disable local model resolution — all models come from HuggingFace Hub via CDN.
		transformers.env.allowLocalModels = false

		this._TextStreamer = transformers.TextStreamer
		this._transformers = transformers

		let actual_device = device
		if (this._model_type === 'pipeline') {
			actual_device = await this._load_pipeline(transformers, device, dtype, on_progress)
		} else {
			actual_device = await this._load_direct(transformers, device, dtype, on_progress)
		}

		this._device	= actual_device
		this._loaded	= true
	}//end load



	/**
	 * _LOAD_DIRECT
	 * Loads a non-pipeline model family (qwen35, gemma4) using the low-level
	 * AutoProcessor + named model class API.
	 *
	 * This path is needed because Qwen3.5 and Gemma4 expose per-sub-model dtype
	 * configuration (vision encoder, embed_tokens, decoder_model_merged) that the
	 * high-level `pipeline()` API cannot express.
	 *
	 * On WebGPU failure, retries automatically with WASM + 'q4' dtype.
	 *
	 * Side effects: populates `this._processor` and `this._model`.
	 *
	 * @param {Object} transformers - The Transformers.js module namespace.
	 * @param {string} device - Primary device to attempt ('webgpu' or 'wasm').
	 * @param {string} dtype - Base quantisation dtype (e.g. 'q4f16', 'q4').
	 * @param {Function} on_progress - Progress callback (see load()).
	 * @returns {Promise<string>} The device that was actually used ('webgpu' or 'wasm').
	 * @throws {Error} If loading fails on the specified device and no fallback applies
	 *   (i.e. device is not 'webgpu', or WebGPU failed for a non-retryable reason).
	 */
	async _load_direct(transformers, device, dtype, on_progress) {

		const model_class_name	= model_engine._MODEL_CLASS_MAP[this._model_type]
		const ModelClass		= transformers[model_class_name]

		if (!ModelClass) {
			throw new Error('Unknown model class "' + model_class_name + '" for model_type "' + this._model_type + '"')
		}

		const dtype_config = model_engine._build_dtype_config(this._model_type, dtype)

		console.log('[model_engine] loading', this._model_type, 'with model class', model_class_name, 'dtype:', JSON.stringify(dtype_config))

		const progress_cb = (progress) => {
			if (progress.status === 'progress' && progress.progress !== undefined) {
				on_progress(progress.progress)
			}
			if (progress.status === 'done') {
				on_progress(100)
			}
		}

		try {
			this._processor = await transformers.AutoProcessor.from_pretrained(this._model_id)
			this._model = await ModelClass.from_pretrained(this._model_id, {
				device				: device,
				dtype				: dtype_config,
				progress_callback	: progress_cb
			})
			return device
		} catch (load_err) {
			if (device === 'webgpu') {
				console.warn('[model_engine]', this._model_type, 'WebGPU failed, retrying with WASM:', load_err.message)
				const wasm_dtype = model_engine._build_dtype_config(this._model_type, 'q4')
				this._processor = await transformers.AutoProcessor.from_pretrained(this._model_id)
				this._model = await ModelClass.from_pretrained(this._model_id, {
					device				: 'wasm',
					dtype				: wasm_dtype,
					progress_callback	: progress_cb
				})
				return 'wasm'
			} else {
				throw load_err
			}
		}
	}//end _load_direct



	/**
	 * _LOAD_PIPELINE
	 * Loads a 'pipeline' family model via the high-level `transformers.pipeline()` API.
	 *
	 * This is the default path for any model not matched by `_detect_model_type()`.
	 * It is simpler than _load_direct because the pipeline API handles processor
	 * selection and dtype application internally.
	 *
	 * On WebGPU failure, retries automatically with WASM + 'q4' dtype.
	 *
	 * Side effect: populates `this._pipeline`.
	 *
	 * @param {Object} transformers - The Transformers.js module namespace.
	 * @param {string} device - Primary device to attempt ('webgpu' or 'wasm').
	 * @param {string} dtype - Base quantisation dtype (e.g. 'q4f16', 'q4').
	 * @param {Function} on_progress - Progress callback (see load()).
	 * @returns {Promise<string>} The device that was actually used ('webgpu' or 'wasm').
	 * @throws {Error} If loading fails on a non-WebGPU device, or if WASM retry also fails.
	 */
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



	/**
	 * GENERATE
	 * Runs one forward pass (prompt → completion) on the loaded model.
	 *
	 * Dispatches to _do_generate_pipeline() or _do_generate_direct() depending on
	 * `this._model_type`. Streaming tokens arrive in real time via the `on_token`
	 * and `on_think_token` callbacks; the returned promise resolves only after the
	 * full generation is complete.
	 *
	 * WebGPU error recovery: if a generation fails on WebGPU with a recoverable
	 * backend error (device-lost, unaligned accesses, buffer invalidated), the engine
	 * unloads the model, reloads it on the fallback device (WASM), and retries the
	 * same request once. Non-recoverable errors and WASM failures are thrown directly.
	 *
	 * @param {Object} [options={}] - Generation options.
	 * @param {Array}  [options.messages=[]] - Chat-template messages array
	 *   (each element: `{role: 'user'|'assistant'|'system'|'tool', content: string}`).
	 * @param {Array}  [options.tools=[]] - JSON-schema tool declarations to expose
	 *   to the model. Passed to the chat template; ignored when empty.
	 * @param {number} [options.max_new_tokens=512] - Maximum new tokens to generate.
	 *   Overrides config.max_new_tokens.
	 * @param {Function} [options.on_token] - Callback invoked with each visible prose
	 *   token chunk (string). Thinking and tool-call markup are filtered out before
	 *   this callback fires.
	 * @param {Function} [options.on_think_token] - Callback invoked with each token
	 *   chunk from inside a `<think>…</think>` block, so the UI can render the
	 *   model's reasoning separately.
	 * @returns {Promise<Object>} Generation result object with shape:
	 *   `{ full_text: string, raw_result: *, streamed_text: string }`.
	 *   `full_text` is the cleaned visible answer (thinking/tool blocks stripped).
	 *   `streamed_text` is the raw concatenated token stream (used by parse_tool_calls).
	 * @throws {Error} If the model is not loaded, or if generation fails unrecoverably.
	 */
	async generate(options={}) {

		const is_ready = this._model_type === 'pipeline'
			? !!this._pipeline
			: !!(this._model && this._processor)
		if (!is_ready) {
			throw new Error('Model not loaded. Call load() first.')
		}

		const messages			= options.messages || []
		const tools				= options.tools || []
		const max_new_tokens	= options.max_new_tokens || this._config.max_new_tokens || 512
		const on_token			= options.on_token || (() => {})
		const on_think_token	= options.on_think_token || (() => {})

		try {
			if (this._model_type === 'pipeline') {
				return await this._do_generate_pipeline(messages, tools, max_new_tokens, on_token, on_think_token)
			}
			return await this._do_generate_direct(messages, tools, max_new_tokens, on_token, on_think_token)
		} catch (err) {
			// Any error on WebGPU may have left the device in a bad state.
			// Unload so the next generation starts fresh instead of re-using
			// potentially invalid buffers.
			if (this._device === 'webgpu') {
				console.warn('[model_engine] WebGPU inference failed, unloading:', err.message)
				await this.unload()
				if (model_engine._is_retryable_backend_error(err)) {
					console.warn('[model_engine] Retrying on fallback device (WASM)')
					try {
						await this._reload_as_wasm()
						if (this._model_type === 'pipeline') {
							return await this._do_generate_pipeline(messages, tools, max_new_tokens, on_token, on_think_token)
						}
						return await this._do_generate_direct(messages, tools, max_new_tokens, on_token, on_think_token)
					} catch (wasm_err) {
						throw new Error(
							'Model backend failed on WebGPU and fallback device. ' +
							'Original error: ' + err.message + '. ' +
							'Fallback error: ' + wasm_err.message + '. ' +
							'Use a smaller model or switch device in settings.'
						)
					}
				}
			}
			throw err
		}
	}//end generate



	/**
	 * _IS_RETRYABLE_BACKEND_ERROR (static)
	 * Determines whether a generation error is transient and worth retrying on
	 * the fallback device (WASM), rather than propagating to the caller.
	 *
	 * Only a narrow set of error messages indicate a GPU-side transient failure
	 * that a CPU/WASM context can recover from:
	 *   - 'device lost'                   — GPU process crashed or timed out;
	 *                                        reloading on WASM re-fetches weights.
	 *   - 'unaligned accesses'            — Known WASM/CPU alignment bug;
	 *                                        switching device helps.
	 *   - 'invalid due to a previous error' — WebGPU buffer corrupted by a prior
	 *                                        silent OOM; a fresh WASM context recovers.
	 *
	 * Everything else (OOM, bad_alloc, model logic errors) is considered fatal.
	 *
	 * @param {Error|*} err - The caught error object.
	 * @returns {boolean} True if the error is retryable on the fallback device.
	 */
	static _is_retryable_backend_error(err) {

		const message = err && err.message
			? err.message
			: String(err || '')

		// Only retry on errors that indicate a transient device issue.
		// "device lost" → GPU process crashed / timed out; reloading on CPU/WASM
		//                  can recover because the weights are re-fetched.
		// "unaligned accesses" → known WASM/CPU alignment bug; switching device helps.
		// "invalid due to a previous error" → WebGPU buffer corrupted by a prior
		//    failed operation (often silent OOM). A fresh WASM context recovers.
		// Everything else (OOM, bad_alloc, etc.) is fatal.
		return message.indexOf('device lost') !== -1
			|| message.indexOf('unaligned accesses') !== -1
			|| message.indexOf('invalid due to a previous error') !== -1
	}//end _is_retryable_backend_error



	/**
	 * _RELOAD_AS_WASM
	 * Disposes the current model/pipeline and reloads it on the configured fallback
	 * device (defaults to 'wasm').
	 *
	 * Called automatically by generate() after a retryable WebGPU error. Can also be
	 * called manually if the caller detects a device issue outside of generation.
	 *
	 * The method:
	 *   1. Disposes the existing pipeline or model to release GPU/WASM memory.
	 *   2. Yields to the JS event loop (setTimeout 0) so the browser can reclaim
	 *      WebGPU buffers before the new allocation starts.
	 *   3. Re-imports the Transformers.js CDN module (browser HTTP cache hit).
	 *   4. Reloads via the same path (pipeline vs. direct) used during the first load.
	 *
	 * (!) Disposing before reallocating is critical: without it, the old WebGPU
	 * allocations compete with the new WASM heap and cause bad_alloc on some devices.
	 *
	 * Side effects: resets `this._pipeline`, `this._model`, `this._processor`,
	 * `this._loaded`, `this._device`, and all Transformers.js references.
	 *
	 * @returns {Promise<void>}
	 * @throws {Error} If the fallback load itself fails.
	 */
	async _reload_as_wasm() {

		// reload the SAME model on the configured fallback device (wasm by default)
		const fb_device = this._fallback_device || 'wasm'
		const fb_dtype = fb_device === 'wasm' ? 'q4' : (this._config.dtype || 'q4f16')
		console.log('[model_engine] reloading on fallback device:', fb_device, 'model:', this._model_id)

		// dispose old model before allocating a second copy; otherwise WebGPU
		// buffers + WASM heap compete for the same memory and we get bad_alloc.
		if (this._pipeline && typeof this._pipeline.dispose === 'function') {
			try { await this._pipeline.dispose() } catch(e) {}
		}
		if (this._model && typeof this._model.dispose === 'function') {
			try { await this._model.dispose() } catch(e) {}
		}
		this._pipeline	= null
		this._model		= null
		this._processor	= null
		this._loaded	= false

		// yield to GC so the browser can reclaim WebGPU buffers
		await new Promise(function(resolve) { setTimeout(resolve, 0) })

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



	/**
	 * _IS_THINKING_ENABLED
	 * Returns whether the model's chain-of-thought (thinking) mode is active.
	 *
	 * Thinking is controlled by `config.thinking`: any non-'none' string value
	 * enables it. When enabled, the chat template sets `enable_thinking: true`,
	 * which causes Qwen3-family models to emit a `<think>…</think>` block
	 * before the answer. The streamer filters those tokens to `on_think_token`.
	 *
	 * @returns {boolean} True when thinking is enabled (level !== 'none' and !== false).
	 */
	_is_thinking_enabled() {
		// `thinking` is a level string: 'none' | 'low' | 'high'. Any non-'none'
		// value turns on the chat-template thinking flag.
		const level = (this._config && this._config.thinking) || 'none'
		return level !== 'none' && level !== false
	}//end _is_thinking_enabled



	/**
	 * _DO_GENERATE_PIPELINE
	 * Runs a generation pass using the Transformers.js pipeline API.
	 *
	 * Builds sampling parameters, attaches the streaming callback via a TextStreamer,
	 * then calls `this._pipeline(messages, options)`. The streamer feeds visible
	 * tokens to `on_token` and thinking tokens to `on_think_token` in real time.
	 * After the pipeline resolves, the raw result is normalised by `_build_result()`.
	 *
	 * @param {Array}    messages       - Chat messages (role/content objects).
	 * @param {Array}    tools          - Tool declarations (JSON-schema format).
	 * @param {number}   max_new_tokens - Maximum tokens to generate.
	 * @param {Function} on_token       - Callback for each visible prose chunk.
	 * @param {Function} on_think_token - Callback for each thinking-block chunk.
	 * @returns {Promise<Object>} Normalised result from _build_result().
	 */
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



	/**
	 * _DO_GENERATE_DIRECT
	 * Runs a generation pass using the low-level model + processor API
	 * (used for 'qwen35' and 'gemma4' model families).
	 *
	 * Steps:
	 *   1. Apply the model's chat template via `tokenizer.apply_chat_template()` to
	 *      produce encoded input tensors.
	 *   2. Call `this._model.generate()` with sampling parameters and a streamer.
	 *   3. Slice out only the newly generated token IDs (skip the prompt prefix)
	 *      and decode them to a string for the fallback text path in `_build_result`.
	 *
	 * The streamer feeds tokens to `on_token` and `on_think_token` in real time,
	 * so the chat bubble updates before the promise resolves.
	 *
	 * @param {Array}    messages       - Chat messages (role/content objects).
	 * @param {Array}    tools          - Tool declarations (JSON-schema format).
	 * @param {number}   max_new_tokens - Maximum tokens to generate.
	 * @param {Function} on_token       - Callback for each visible prose chunk.
	 * @param {Function} on_think_token - Callback for each thinking-block chunk.
	 * @returns {Promise<Object>} Normalised result from _build_result().
	 */
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



	/**
	 * _CREATE_STREAMER
	 * Constructs a Transformers.js TextStreamer that parses the raw token stream
	 * on the fly, routing chunks to `on_token` (visible prose) or `on_think_token`
	 * (chain-of-thought) while silently dropping `<tool_call>…</tool_call>` markup.
	 *
	 * Implementation — state machine:
	 *   The streamer maintains a small state object with the following fields:
	 *   - `text`       : full raw concatenation of every chunk (used by
	 *                    parse_tool_calls and _build_result for post-processing).
	 *   - `in_think`   : true while inside a `<think>…</think>` block.
	 *   - `in_tool`    : true while inside a `<tool_call>…</tool_call>` block.
	 *   - `seen_think` : latched to true once any `<think>` was opened (used by
	 *                    _build_result to decide whether to strip the think prefix).
	 *   - `pending`    : a look-ahead buffer that withholds the last few bytes
	 *                    until it is certain they are not the start of a tag.
	 *
	 *   `flush_safe()` drains `pending` up to the last possible tag-prefix boundary
	 *   so partial '<' sequences are never emitted prematurely.
	 *   `process_buffer()` is the main dispatch loop:
	 *     - inside `<think>` : forward to think_cb; advance on `</think>`.
	 *     - inside `<tool_call>` : silently drop; advance on `</tool_call>`.
	 *     - outside : call flush_safe(), detect the next opening tag.
	 *
	 *   (!) The 'keep last N chars' heuristic in process_buffer (8 for `</think>`,
	 *   12 for `</tool_call>`) must stay in sync with the tag lengths; otherwise
	 *   partial closing tags leak into the visible output.
	 *
	 * @param {Object}   tokenizer      - Transformers.js tokenizer instance (used by
	 *   TextStreamer for decoding; must have a `decode()` method).
	 * @param {Function} on_token       - Called with each decoded visible prose chunk.
	 * @param {Function} on_think_token - Called with each decoded thinking-block chunk.
	 * @returns {Object} Streamer handle:
	 *   - `streamer`  {Object}   — TextStreamer instance to pass to generate options.
	 *   - `get_text`  {Function} — Returns the full raw concatenated token string.
	 *   - `flush`     {Function} — Must be called after generation ends to drain the
	 *                              pending buffer; emits any remaining visible content.
	 */
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



	/**
	 * _BUILD_RESULT
	 * Normalises the raw generation output into the standard result object
	 * returned by generate().
	 *
	 * Cleaning steps applied to `streamed_text`:
	 *   1. If `</think>` is present, strip everything up to and including it
	 *      (the thinking preamble).
	 *   2. If `<think>` is present but no matching `</think>` (truncated), treat
	 *      full_text as empty (the model only produced thinking, no answer).
	 *   3. Strip any remaining `<tool_call>…</tool_call>` blocks via regex.
	 *   4. Strip inline `call: name { … }` patterns (a looser tool-call format
	 *      some model families emit outside XML tags).
	 *   5. Trim whitespace.
	 *
	 * If after cleaning `full_text` is empty, fall back to `raw_result.generated_text`
	 * (may be a string, a message array, or an arbitrary object from the pipeline).
	 * The last assistant-role message is extracted from an array if needed.
	 *
	 * @param {string} streamed_text - Full raw concatenation of all streamed tokens
	 *   (i.e. the value returned by `stream.get_text()`).
	 * @param {*}      raw_result    - The unmodified return value from the underlying
	 *   pipeline or model.generate() call.
	 * @returns {Object} Normalised result:
	 *   - `full_text`    {string} — Cleaned visible prose answer.
	 *   - `raw_result`   {*}      — Original pipeline/model output (for parse_tool_calls).
	 *   - `streamed_text`{string} — Unmodified raw token stream (for parse_tool_calls).
	 */
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



	/**
	 * PARSE_TOOL_CALLS
	 * Extracts structured tool-call declarations from a generation result.
	 *
	 * Tries three extraction strategies in priority order:
	 *
	 *   1. Native pipeline format (Transformers.js v4.2+ with chat template):
	 *      The pipeline returns `generated_text` as an array of messages; the last
	 *      assistant message may carry a `tool_calls` array already parsed by the
	 *      library. This is the most reliable path — returned immediately if present.
	 *
	 *   2. Qwen3 XML format — `<tool_call>{ … }</tool_call>`:
	 *      Scanned via regex over `streamed_text`. Each match is JSON-parsed; if
	 *      it has a `name` key it is normalised to the OpenAI function-call shape:
	 *      `{ id, type: 'function', function: { name, arguments } }`.
	 *      Malformed JSON blocks are silently skipped.
	 *
	 *   3. Inline call syntax — `call: name { … }`:
	 *      A looser format emitted by some models outside XML tags. Parsed via
	 *      `_parse_relaxed_arguments()` which tolerates single-quoted keys and
	 *      unquoted values.
	 *
	 * Returns null (not an empty array) when no tool calls are found, so callers
	 * can use a simple truthiness check.
	 *
	 * @param {Object} generation_result - The object returned by generate().
	 * @returns {Array|null} Array of tool-call objects in the OpenAI function-call
	 *   shape, or null if no tool calls were found.
	 */
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



	/**
	 * _PARSE_RELAXED_ARGUMENTS (static)
	 * Parses a tool-call argument block that may not be strict JSON.
	 *
	 * The method first attempts `JSON.parse()`. On failure it falls back to a
	 * simple key:value splitter that tolerates:
	 *   - Single-quoted or unquoted string keys.
	 *   - Unquoted bare values (strings, numbers, booleans, null).
	 *   - Values quoted with either ' or ".
	 *
	 * (!) The fallback parser is intentionally minimal: it does NOT handle nested
	 * objects, arrays, or escaped quotes inside values. It is designed only for the
	 * flat argument objects that small language models emit in the inline `call:`
	 * format. Complex arguments should come via the XML `<tool_call>` format which
	 * uses strict JSON.
	 *
	 * @param {string} raw_arguments - The raw argument string (typically the
	 *   content between the outer braces of a tool-call block).
	 * @returns {Object} Parsed arguments as a plain object. Returns `{}` on empty
	 *   or unparseable input.
	 */
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



	/**
	 * UNLOAD
	 * Disposes the model and releases all allocated resources (GPU buffers, WASM heap).
	 *
	 * Calls `.dispose()` on the pipeline or model if available, then nulls all
	 * internal references. Yields to the JS event loop after disposal so the
	 * browser garbage collector can reclaim GPU buffers before the next allocation.
	 *
	 * After calling unload(), `is_loaded()` returns false and `generate()` will
	 * throw until `load()` is called again.
	 *
	 * @returns {Promise<void>}
	 */
	async unload() {
		if (this._pipeline && typeof this._pipeline.dispose === 'function') {
			try { await this._pipeline.dispose() } catch(e) {}
		}
		if (this._model && typeof this._model.dispose === 'function') {
			try { await this._model.dispose() } catch(e) {}
		}
		this._pipeline	= null
		this._model		= null
		this._processor	= null
		this._loaded	= false
		// yield to GC so the browser can reclaim GPU buffers
		await new Promise(function(resolve) { setTimeout(resolve, 0) })
	}//end unload



	/**
	 * IS_LOADED
	 * Returns whether model weights have been successfully loaded and the engine
	 * is ready to generate. Also returns true in server-proxy mode (api_url set),
	 * where `this._loaded` is set by load() without fetching local weights.
	 *
	 * @returns {boolean} True when the engine is ready for generation calls.
	 */
	is_loaded() {
		return this._loaded
	}//end is_loaded



	/**
	 * GET_DEVICE
	 * Returns the device currently in use for inference.
	 *
	 * Possible values: 'webgpu', 'wasm', 'server'.
	 * The value may change after a WebGPU→WASM fallback triggered by a load or
	 * generation failure; callers should re-read this after any such event.
	 *
	 * @returns {string} Current inference device identifier.
	 */
	get_device() {
		return this._device
	}//end get_device



	/**
	 * GET_MODEL_ID
	 * Returns the HuggingFace model ID (or ONNX path) this engine instance was
	 * configured with. Useful for display in settings UI and logging.
	 *
	 * @returns {string} Model identifier string.
	 */
	get_model_id() {
		return this._model_id
	}//end get_model_id



	// ── Static helpers ────────────────────────────────────────────────

	/**
	 * _MODEL_CLASS_MAP (static)
	 * Maps internal model_type keys to the Transformers.js exported class names
	 * used by the direct (non-pipeline) loading path.
	 *
	 * Keys are the values returned by `_detect_model_type()`.
	 * Values are property names on the Transformers.js module namespace object.
	 * 'pipeline' family models are NOT listed here — they use `transformers.pipeline()`.
	 *
	 * @type {Object}
	 */
	static _MODEL_CLASS_MAP = {
		qwen35	: 'Qwen3_5ForConditionalGeneration',
		gemma4	: 'Gemma4ForConditionalGeneration'
	}

	/**
	 * _DETECT_MODEL_TYPE (static)
	 * Infers the model family from the model ID string so the engine can select
	 * the correct loading and generation strategy.
	 *
	 * Detection is by substring matching on the model_id:
	 *   - 'Qwen3.5' or 'Qwen3_5' → 'qwen35' (direct load via Qwen3_5ForConditionalGeneration)
	 *   - 'Gemma4'  or 'gemma-4'  → 'gemma4'  (direct load via Gemma4ForConditionalGeneration)
	 *   - anything else            → 'pipeline' (high-level transformers.pipeline() API)
	 *
	 * (!) When adding support for a new model family, add the detection pattern here
	 * AND add the corresponding class name to `_MODEL_CLASS_MAP`.
	 *
	 * @param {string} model_id - HuggingFace model ID or ONNX path.
	 * @returns {string} Model type key: 'qwen35', 'gemma4', or 'pipeline'.
	 */
	static _detect_model_type(model_id) {
		if (model_id.indexOf('Qwen3.5') !== -1 || model_id.indexOf('Qwen3_5') !== -1) return 'qwen35'
		if (model_id.indexOf('Gemma4') !== -1 || model_id.indexOf('gemma-4') !== -1) return 'gemma4'
		return 'pipeline'
	}

	/**
	 * _BUILD_DTYPE_CONFIG (static)
	 * Constructs the per-sub-model dtype configuration object required by the
	 * direct loading path (`_load_direct`).
	 *
	 * Transformers.js v4+ accepts an object instead of a scalar dtype so that
	 * different sub-models within the same checkpoint can use different precision:
	 *   - `embed_tokens` and `decoder_model_merged` use the caller-provided dtype
	 *     (e.g. 'q4f16' for WebGPU, 'q4' for WASM).
	 *   - Gemma4's `vision_encoder` is fixed at 'fp16' because the vision tower
	 *     does not benefit from extreme int4 quantisation and degrades badly.
	 *
	 * @param {string} model_type - One of 'qwen35', 'gemma4' (direct families only).
	 * @param {string} dtype      - Base quantisation dtype (e.g. 'q4f16', 'q4').
	 * @returns {Object} Dtype config map for the Transformers.js `from_pretrained` call.
	 */
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
