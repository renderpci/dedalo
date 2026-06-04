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

	const messages = [
		{
			role	: 'user',
			content	: [
				{
					type				: 'text',
					source_lang_code	: sourceLangCode,
					target_lang_code	: targetLangCode,
					text				: `
					CRITICAL RULE — PRESERVE PLACEHOLDERS EXACTLY:
					The text contains placeholders like {P1}, {P2}, {P3}, etc.
					- DO NOT modify, translate, move, add, or remove any character inside them.
					- DO NOT change { } to < > or any other symbols.
					- Output them **verbatim** (exactly as they appear in the input).
					- Treat them as opaque tokens — as if they were a single invisible character.
					- They ALWAYS start with { followed by a letter P, followed by digits, followed by }.
					- Treat them as invisible anchors — they are not text, do not touch them.
					Examples:
					Input:  "<p>Hola{P5} ¿como estás{P2}{P3}?</p>"
					Output: "<p>Hello{P5} how are you{P2}{P3}?</p>"

					Input:  "<p>{P1}{P2}Gracias por tu{P3} \"tiempo{p18}\"{P4}.{P68}{p108}</p>{P10}<p>Saludos</p>"
					Output: "<p>{P1}{P2}Thank for your{P3} \"time{p18}\"{P4}.{P68}{p108}</p>{P10}<p>Regards</p>"

					Input: "<p>.{P424}{P102}{P749}Buenos días, Carme. Muchas gracias...{P750}&nbsp;</p>"
					Output: "<p>.{P424}{P102}{P749}Good morning, Carme. Thank you very much...{P750}&nbsp;</p>"

					TASK: Translate the text from ${sourceLangCode} to ${targetLangCode}.
					- Only translate text, never placeholders or HTML tags.
					- Don't use markdown syntax.
					- Test your output: Before returning your answer, verify that every {PN} from the input appears  **identically** in the output.
					
					\n\nText to translate:${text}`
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