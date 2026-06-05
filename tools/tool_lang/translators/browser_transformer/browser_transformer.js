// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
 * Browser Translation Worker (Web Worker)
 *
 * Runs TranslateGemma (4B-it) locally in the browser via HuggingFace Transformers
 * and ONNX runtime. Receives HTML blocks from the main thread, translates each
 * block sequentially, and streams results back as they complete.
 *
 * Communication protocol (postMessage):
 *   Main → Worker:  { options: { blocks[], sourceLangCode, targetLangCode, device } }
 *   Worker → Main:
 *     { status: 'init',     data: { progress, status, device, file } }  – model loading
 *     { status: 'on_chunk', data: { accumulated_text, remaining } }      – progress stream
 *     { status: 'end',      data: { accumulated_text } }                 – done
 *     { status: 'error',    data: { message, block, total } | { … } }   – error
 *
 * HTML preservation:
 *   The prompt explicitly instructs the model to keep all tags intact.
 *   The system instruction is embedded inside the single user message
 *   (not as a separate system role) because TranslateGemma requires the
 *   conversation to start with a user turn.
 */

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';

/**
 * ONNX-optimised 4B instruction-tuned translation model.
 * Uses q4 quantisation for memory-efficient local inference.
 */
const MODEL_ID			= 'onnx-community/translategemma-text-4b-it-ONNX';
//const MODEL_ID			= 'Xenova/nllb-200-distilled-1.3B';

/**
 * Maximum tokens the model may generate per call.
 * Blocks are pre-chunked to ~2000 chars on the main thread,
 * so 1024 tokens is typically sufficient for a single block.
 */
const MAX_NEW_TOKENS	= 1024;


/**
 * Entry point: called when the main thread posts a message to this worker.
 *
 * Flow:
 *   1. Load the pipeline (async – download + compile model)
 *   2. Iterate through each HTML block
 *   3. Translate one block at a time, streaming each result back
 *   4. Signal completion or error
 */
self.onmessage = async (e) => {

	const options = e.data.options

	// ---- 1. Load / initialise the model pipeline ---------------------------
	// The pipeline is cached after the first call; subsequent calls reuse it.
	// Quantised to q4 to fit within browser memory limits (~2 GB for GPU).
	pipeline('text-generation', MODEL_ID, {
		device	: options.device || 'webgpu',
		dtype	: 'q4',

		progress_callback: ({ progress, status, file }) => {
			// Relay download/compile progress to the UI thread
			self.postMessage({
				status	: 'init',
				data	: { progress, status, device: options.device, file }
			});
		}
	})
	.then(async function(translator) {

		const blocks		= options.blocks;
		const total_blocks	= blocks.length;
		const result		= {
			accumulated_text: '',
			remaining: total_blocks
		};

		// ---- 2. Translate each block sequentially ----------------------------
		// Blocks are processed one-by-one (not batched) to stream partial
		// results as soon as each block finishes. This gives the user a
		// progressive UX instead of a single long wait.
		for (let i = 0; i < total_blocks; i++) {

			try {

				const translated = await translate_text(
					translator,
					blocks[i],
					options.sourceLangCode || 'en',
					options.targetLangCode || 'es'
				);

				result.accumulated_text += translated;
				result.remaining 		= total_blocks - (i + 1);

				// ---- 3. Stream partial result to the main thread ---------------
				// The UI layer uses `remaining` to show progress like "3 of 8 blocks done"
				self.postMessage({
					status	: 'on_chunk',
					data	: result
				});

			} catch (err) {

				// Per-block error – report which block failed and stop
				self.postMessage({
					status	: 'error',
					data	: JSON.stringify({
						message	: err?.message || '',
						block	: i + 1,
						total	: blocks.length
					})
				});
				return;
			}
		}

		// ---- 4. Signal completion --------------------------------------------
		self.postMessage({ status: 'end', data: result });
	})
	.catch(function(error) {

		// Pipeline-level error (model load failed, GPU out of memory, etc.)
		self.postMessage({
			status	: 'error',
			data	: JSON.stringify({
				message	: error?.message || '',
				name	: error?.name || error?.constructor?.name || '',
				stack	: error?.stack || '',
				raw		: String(error)
			})
		});
	});
}


/**
 * Translate a single text block using the loaded model pipeline.
 *
 * @param {Function} translator    - The loaded HuggingFace text-generation pipeline
 * @param {string}   text          - HTML block to translate (may contain <p>, <em>, etc.)
 * @param {string}   sourceLangCode- Source language locale code (e.g. 'en')
 * @param {string}   targetLangCode- Target language locale code (e.g. 'es')
 * @returns {string}               - Model response with translated text
 *
 * Implementation notes:
 *
 *   System instruction:
 *     TranslateGemma's chat template does not accept a separate 'system' role —
 *     the conversation must start with 'user'. Therefore the preservation
 *     instruction is prepended to the user text content with a blank-line
 *     separator so the model treats it as a task description.
 *
 *   HTML preservation:
 *     The prompt explicitly tells the model to keep every tag intact.
 *     See also: tool_lang.js → splitHtmlByParagraph which wraps bare text
 *     nodes in <p> blocks for consistency.
 *
 *   Deterministic output:
 *     `do_sample: false` disables temperature sampling, making the model
 *     behave greedily — the same input always produces the same output.
 *     This avoids random tag mutations across runs.
 */
async function translate_text(translator, text, sourceLangCode, targetLangCode) {

	const prompt = [
		`Translate from ${sourceLangCode} to ${targetLangCode}.`,
		`RULES:`,
		`1. Keep all HTML tags unchanged.`,
		`2. Keep all placeholders like [[18]], [[1]], [[5]], [[424]], etc. EXACTLY as-is — never modify, translate, or remove them.`,
		`3. Do not use markdown.`,
		`4. Verify every placeholder [[…]] from the input appears IDENTICALLY in your output.`,
		``,
		`Examples:`,
		`Input:  "<p>Hola[[5]] ¿como estás[[2]][[3]]?</p>"`,
		`Correct output: "<p>Hello[[5]] how are you[[2]][[3]]?</p>"`,
		`Wrong output: "<p>Hello[[9]] how are you[[2]]?</p>"`,
		``,
		`Input:  "<p>[[1]][[2]]Gracias por tu[[3]] \"tiempo[[18]]\"[[4]].[[68]][[108]]</p>[[10]]<p>Saludos</p>"`,
		`Correct output: "<p>[[1]][[2]]Thank for your[[3]] \"time[[18]]\"[[4]].[[68]][[108]]</p>[[10]]<p>Regards</p>"`,
		`Wrong output: "<p>[[1]]Thank for your[[2]][[3]] \"time[[18 ]]\".[ [68]]</p>[[10]]<p>Regards/p>"`,
		``,
		`Input: "<p> </p><p>Hello[[1]], welcome!</p><p> </p>"`,
		`Correct output: "<p> </p><p>Hola[[1]], ¡bienvenido!</p><p> </p>"`,
		`Wrong output: "<p>Hola, ¡bienvenido!</p>"`,
		``,
		`Input: "<p>[[1]]Hello, [[2]]welcome! new [[8]]eeerew[[35]]</p><p>[[62]]More[[29]] [[84]]text[[438]] [[3]]in[[45]] [[99]]English[[24]]</p>"`,
		`Correct output: "<p>Hola[[1]], [[2]]¡bienvenido! nuevo [[8]]eeerew[[35]]</p><p>[[62]]Mas[[29]] [[84]]texto[[438]] [[3]]en[[45]] [[99]]inglés[[24]]</p>"`,
		`Wrong output: "<p>Hola, [[2]]¡bienvenido! nuevo texto</p><p>[[62]]Mas [[29]]texto[[438]] en [[99]]inglés</p>"`,
		``,
		`Input: "<p>[[5]]Her directives</p>"`,
		`Correct output: "<p>[[5]]Οι οδηγίες του</p>"`,
		`Wrong output: "<p><p>Οι [[5]]οδηγίες του</p>"`,
		``,
		`Text to translate:`,
		text
	].join('\n');

	// const prompt = [
	// 	`Translate the following text into **[${targetLangCode}]**.`,
	// 	'**CRITICAL CONSTRAINTS:**',
	// 	'1. The text contains placeholders in the format `[[1]]`, `[[88]]`, etc. These are non-translatable constants.',
	// 	'2. **DO NOT** translate, modify, or remove the placeholders.',
	// 	'3. **DO NOT** change the numbers inside the placeholders.',
	// 	'5. **Output ONLY** the translated text without any explanations or introductory remarks.',
	// 	'6. Keep all HTML tags unchanged.',

	// 	`**Text to translate:**`,
	// 	`${text}`
	// ].join('\n');

	const messages = [
		{
			role    : 'user',
			content : [
				{
					type             : 'text',
					source_lang_code : sourceLangCode,
					target_lang_code : targetLangCode,
					text             : prompt
				}
			]
		}
	];

	const output		= await translator(messages, {
		max_new_tokens	: MAX_NEW_TOKENS,	// Enough for one block after chunking
		do_sample		: false				// Greedy decoding for predictable output
	});

	// The model returns the full conversation so far;
	// grab the assistant's last (newly generated) message.
	const generated_text	= output[0].generated_text;
	const last_message		= generated_text[generated_text.length - 1];

	return last_message.content;
}


// @license-end