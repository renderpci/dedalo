// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
 * Browser Translation Worker (Web Worker)
 *
 * Runs TranslateGemma (4B-it) locally in the browser via HuggingFace Transformers
 * and ONNX runtime. Receives Markdown blocks from the main thread, translates each
 * block sequentially, and streams results back as they complete.
 *
 * Communication protocol (postMessage):
 *   Main → Worker:
 *     { options: { blocks[], sourceLangCode, targetLangCode, device } }  – start translation
 *     { cancel: true }                                                  – abort in-progress translation
 *   Worker → Main:
 *     { status: 'init',           data: { progress, status, device, file } }            – model loading
 *     { status: 'on_chunk',       data: { accumulated_text, remaining } }               – progress stream
 *     { status: 'on_block_error', data: { message, block, total, accumulated_text, remaining } } – non-fatal block error
 *     { status: 'end',            data: { accumulated_text, remaining, repair_stats } } – done
 *     { status: 'error',          data: { message, name?, stack? } }                    – fatal error
 *     { status: 'cancelled',      data: { accumulated_text, remaining } }               – cancelled
 *
 * A block is:
 *   {
 *     text         : '…[[[1]]]término[[[2]]]…',            // Markdown, tokens local to this block
 *     placeholders : [{ token, kind:'open'|'close'|'atom', pair }],
 *     restore_map  : { '[[[1]]]' : '[[[7]]]' }              // local token → document-wide token
 *   }
 *
 * Tokens are renumbered per block by the main thread so the model only ever has to copy
 * short ids. This worker translates and repairs entirely in that local numbering, then
 * maps back through restore_map before returning, so the main thread always sees one
 * consistent document-wide namespace.
 *
 * Placeholder preservation:
 *   The model is asked to copy every [[[n]]] marker verbatim. When it does not, we
 *   escalate: ask it to fix its own output, then — failing that — re-insert the tokens
 *   ourselves via repair_placeholders() and report exactly which ones we had to place,
 *   so the main thread can put the result in front of the user rather than saving it.
 *
 *   The system instruction is embedded inside the single user message (not as a separate
 *   system role) because TranslateGemma requires the conversation to start with a user turn.
 */

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
import {
	placeholder_re,
	extract_placeholders,
	normalize_placeholders,
	repair_placeholders
} from '../../js/placeholders.js';

/**
 * ONNX-optimised 4B instruction-tuned translation model.
 * Uses q4 quantisation for memory-efficient local inference.
 */
const MODEL_ID			= 'onnx-community/translategemma-text-4b-it-ONNX';

/**
 * Maximum tokens the model may generate per call.
 * Blocks are pre-chunked to ~1000 chars on the main thread,
 * so 1024 tokens is typically sufficient for a single block.
 */
const MAX_NEW_TOKENS	= 1024;

/**
 * Per-block timeout in milliseconds.
 * If a single block translation exceeds this duration it is treated as a failure.
 */
const BLOCK_TIMEOUT_MS	= 120_000;

/**
 * Repetition penalty for the FIRST attempt.
 *
 * Deliberately 1.0 — i.e. off.
 *
 * A [[[12]]] marker is a run of bracket and digit tokens. A repetition penalty divides
 * the logits of tokens the model has already emitted, so as soon as it copies the first
 * marker the bracket tokens are suppressed for the rest of the generation and every
 * subsequent marker becomes less likely than the one before it. The penalty was, in
 * other words, taxing exactly the tokens we most need repeated.
 *
 * Degeneration is instead caught after the fact by detect_repetition(), which retries
 * the affected block with a real penalty. That keeps the guarantee without paying for
 * it on every block.
 */
const REPETITION_PENALTY_FIRST = 1.0;

/**
 * Penalty applied when the first attempt actually degenerated into repetition.
 * >1 discourages the model from repeating the same token; 1.2 is moderate enough to
 * allow legitimate repetition (citations, markers).
 */
const REPETITION_PENALTY = 1.2;

/**
 * Higher penalty used when the moderate one still degenerates.
 * 1.5 is aggressive enough to break most repetition loops.
 */
const REPETITION_PENALTY_RETRY = 1.5;

/**
 * How many times to ask the model to reinsert markers it dropped before falling back
 * to repair_placeholders(). Each round is a full generation pass on a 4B in-browser
 * model, so this is deliberately small.
 */
const MAX_PLACEHOLDER_RETRIES = 2;

/**
 * Verbose per-block tracing. Off by default; flip while debugging placeholder loss.
 */
const DEBUG = false;

/**
 * Cached pipeline instance — reused across multiple translation requests
 * without re-downloading or re-compiling the model.
 * @type {Function|null}
 */
let cached_translator = null;

/**
 * Flag set by the main thread to cancel an in-progress translation.
 * @type {boolean}
 */
let cancelled = false;


// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip the <<< / >>> fencing (and any conversational preamble) from a model response.
 *
 * The model is asked to emit only the translation between the fences, but it variously
 * echoes the fences, omits them, or prefixes the answer with "Here is the translation:".
 * Take what is inside the fences when they are there; otherwise clean up what we got.
 *
 * @param {string} text - Raw model response.
 * @returns {string}
 */
function strip_fences(text) {

	if (!text) return '';

	const fenced = text.match(/<<<\s*([\s\S]*?)\s*>>>/);
	if (fenced) {
		return fenced[1].trim();
	}

	return text
		.trim()
		.replace(/^(?:here (?:is|'s)[^\n:]{0,40}:|translation:|traducci[oó]n:)\s*/i, '')
		.replace(/^<<<\s*/, '')
		.replace(/\s*>>>$/, '')
		.trim();
}


/**
 * Detect which of a block's markers the model failed to reproduce.
 *
 * @param {string} input_text  - Block as sent to the model.
 * @param {string} output_text - Model output, already normalised.
 * @returns {{ missing: string[], has_missing: boolean }}
 */
function detect_missing_placeholders(input_text, output_text) {

	const input_ph = extract_placeholders(input_text);
	if (input_ph.length === 0) {
		return { missing: [], has_missing: false };
	}

	const output_set = new Set(extract_placeholders(output_text));
	const missing    = input_ph.filter(ph => !output_set.has(ph));

	return { missing, has_missing: missing.length > 0 };
}


/**
 * Map a block's local tokens back to the document-wide tokens the main thread uses.
 *
 * A token with no entry in the map is one the model invented; it is left as-is so the
 * main thread can spot it and strip it, rather than being silently rewritten to a real
 * marker it was never meant to be.
 *
 * @param {string} text
 * @param {Object} restore_map - local token → global token
 * @returns {string}
 */
function to_global_tokens(text, restore_map) {

	if (!text || !restore_map) return text;

	return text.replace(placeholder_re(), (match) => restore_map[match] || match);
}


/**
 * Wrap a promise with a timeout.
 * @param {Promise} promise
 * @param {number}  ms    - Timeout in milliseconds
 * @param {string}  label - Description for the timeout error message
 * @returns {Promise}
 */
function with_timeout(promise, ms, label) {
	const timer = new Promise((_, reject) =>
		setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
	);
	return Promise.race([promise, timer]);
}


/**
 * Detect repetition degeneration in translated text.
 *
 * Checks whether any single word appears consecutively more than `threshold` times.
 * This catches the common failure mode where greedy decoding (do_sample: false) gets
 * stuck repeating a token.
 *
 * @param {string} text      - Translated text to check
 * @param {number} threshold - Max allowed consecutive repeats (default 5)
 * @returns {boolean}        - true if repetition degeneration is detected
 */
function detect_repetition(text, threshold = 5) {
	if (!text || text.length < 50) return false;
	const words = text.split(/\s+/);
	if (words.length < threshold) return false;
	let consecutive = 1;
	for (let i = 1; i < words.length; i++) {
		if (words[i] === words[i - 1]) {
			consecutive++;
			if (consecutive >= threshold) {
				return true;
			}
		} else {
			consecutive = 1;
		}
	}
	return false;
}


// ── Block processing ───────────────────────────────────────────────────────

/**
 * Translate one block and guarantee that every marker it carried comes back.
 *
 * The escalation, cheapest first:
 *   1. Translate. If the output degenerated into repetition, retry with a penalty
 *      (see REPETITION_PENALTY_FIRST for why the penalty is not on by default).
 *   2. If markers are missing, ask the model to reinsert them into its own output —
 *      up to MAX_PLACEHOLDER_RETRIES times. A retry is only kept when it recovers
 *      ground, so a worse retry can never make things worse.
 *   3. Whatever is still missing is placed by repair_placeholders() and reported.
 *
 * @param {Function} translator
 * @param {Object}   block            - { text, placeholders, restore_map }
 * @param {string}   source_lang_code
 * @param {string}   target_lang_code
 * @param {string}   label            - Human label used in timeout messages, e.g. 'Block 2/5'
 * @returns {Promise<{text:string, repaired:string[], unrepairable:string[]}>} in LOCAL tokens.
 */
async function process_block(translator, block, source_lang_code, target_lang_code, label) {

	// ── 1. translate ────────────────────────────────────────────────────
	const raw = await with_timeout(
		translate_text(translator, block.text, source_lang_code, target_lang_code, null, {
			repetition_penalty : REPETITION_PENALTY_FIRST
		}),
		BLOCK_TIMEOUT_MS,
		label
	);

	let text = normalize_placeholders(strip_fences(raw));

	// ── 1b. repetition degeneration → escalate the penalty ──────────────
	if (detect_repetition(text)) {

		for (const penalty of [REPETITION_PENALTY, REPETITION_PENALTY_RETRY]) {

			const retry_raw = await with_timeout(
				translate_text(translator, block.text, source_lang_code, target_lang_code, null, {
					repetition_penalty : penalty
				}),
				BLOCK_TIMEOUT_MS,
				`${label} (repetition retry, penalty ${penalty})`
			);

			// NOTE the normalise: the repetition retry used to bypass placeholder
			// handling entirely, so a block that degenerated came back unprotected.
			text = normalize_placeholders(strip_fences(retry_raw));

			if (!detect_repetition(text)) {
				break;
			}
		}

		if (detect_repetition(text)) {
			throw new Error(`${label}: excessive repetition even with penalty ${REPETITION_PENALTY_RETRY}`);
		}
	}

	// ── 2. ask the model to reinsert the markers it dropped ─────────────
	const failed_attempts = [];

	for (let attempt = 1; attempt <= MAX_PLACEHOLDER_RETRIES; attempt++) {

		const detection = detect_missing_placeholders(block.text, text);
		if (!detection.has_missing || cancelled) {
			break;
		}

		failed_attempts.push({ text, missing: detection.missing });

		if (DEBUG) {
			console.warn(`[browser_transformer] ${label}: missing ${detection.missing.join(', ')} — corrective retry ${attempt}/${MAX_PLACEHOLDER_RETRIES}`);
		}

		let retry_text;
		try {
			const retry_raw = await with_timeout(
				translate_text(translator, block.text, source_lang_code, target_lang_code, { failed_attempts }),
				BLOCK_TIMEOUT_MS,
				`${label} (placeholder retry ${attempt}/${MAX_PLACEHOLDER_RETRIES})`
			);
			retry_text = normalize_placeholders(strip_fences(retry_raw));
		} catch (retry_error) {
			// the retry timed out or errored — fall through to deterministic repair
			if (DEBUG) {
				console.warn(`[browser_transformer] ${label}: corrective retry failed (${retry_error?.message || retry_error})`);
			}
			break;
		}

		const retry_detection = detect_missing_placeholders(block.text, retry_text);

		// only keep a retry that recovered ground; never let it lose more
		if (retry_detection.missing.length < detection.missing.length) {
			text = retry_text;
		}
		if (!retry_detection.has_missing) {
			break;
		}
	}

	// ── 3. place whatever the model would not ───────────────────────────
	return repair_placeholders(block.text, text, block.placeholders);
}


// ── Message handler ────────────────────────────────────────────────────────

self.onmessage = async (e) => {

	// ── Cancel command ──────────────────────────────────────────────────
	if (e.data.cancel) {
		cancelled = true;
		return;
	}

	// ── Validate input ──────────────────────────────────────────────────
	const options = e.data?.options;
	if (!options || !Array.isArray(options.blocks) || options.blocks.length === 0) {
		self.postMessage({
			status : 'error',
			data   : { message: 'Invalid or missing options.blocks' }
		});
		return;
	}
	if (typeof options.blocks[0]?.text !== 'string') {
		self.postMessage({
			status : 'error',
			data   : { message: 'options.blocks must be objects: { text, placeholders, restore_map }' }
		});
		return;
	}

	const source_lang_code = options.sourceLangCode || 'en';
	const target_lang_code = options.targetLangCode || 'es';
	const device           = options.device || 'webgpu';

	// Reset cancel flag for this run
	cancelled = false;

	try {

		// ── 1. Load / reuse the model pipeline ───────────────────────────
		// The pipeline is cached after the first call; subsequent calls reuse it.
		// Quantised to q4 to fit within browser memory limits (~2 GB for GPU).
		if (!cached_translator) {
			cached_translator = await pipeline('text-generation', MODEL_ID, {
				device : device,
				dtype  : 'q4',
				progress_callback: ({ progress, status, file }) => {
					// Relay download/compile progress to the UI thread
					self.postMessage({
						status : 'init',
						data   : { progress, status, device, file }
					});
				}
			});
		}

		const blocks       = options.blocks;
		const total_blocks = blocks.length;

		// translated blocks, in order. Joined with the paragraph separator they were
		// split on — concatenating them bare would weld the last paragraph of one block
		// onto the first paragraph of the next when the main thread re-parses the Markdown.
		const parts = [];

		// every marker WE placed rather than the model, in document-wide tokens
		const repair_stats = {
			repaired     : [],
			unrepairable : []
		};

		const result = {
			accumulated_text : '',
			remaining        : total_blocks,
			repair_stats     : repair_stats
		};

		// ── 2. Translate each block sequentially ─────────────────────────
		// Blocks are processed one-by-one (not batched) to stream partial
		// results as soon as each block finishes. This gives the user a
		// progressive UX instead of a single long wait.
		for (let i = 0; i < total_blocks; i++) {

			// Check cancel flag between blocks
			if (cancelled) {
				self.postMessage({
					status : 'cancelled',
					data   : result
				});
				return;
			}

			const block = blocks[i];
			const label = `Block ${i + 1}/${total_blocks}`;

			let block_error = null;

			try {

				const outcome = await process_block(
					cached_translator,
					block,
					source_lang_code,
					target_lang_code,
					label
				);

				parts.push(to_global_tokens(outcome.text, block.restore_map));

				for (const token of outcome.repaired) {
					repair_stats.repaired.push(block.restore_map?.[token] || token);
				}
				for (const token of outcome.unrepairable) {
					repair_stats.unrepairable.push(block.restore_map?.[token] || token);
				}

				if (DEBUG && (outcome.repaired.length || outcome.unrepairable.length)) {
					console.warn(`[browser_transformer] ${label}: repaired ${outcome.repaired.length}, unrepairable ${outcome.unrepairable.length}`);
				}

			} catch (err) {

				// Non-fatal per-block error. Emit the block's SOURCE text untranslated
				// rather than dropping it: losing a paragraph of the record outright is a
				// far worse outcome than leaving one paragraph in the source language.
				parts.push(to_global_tokens(block.text, block.restore_map));
				block_error = err;
				console.warn(`[browser_transformer] ${label} failed, keeping source text: ${err?.message || err}`);
			}

			result.accumulated_text = parts.join('\n\n');
			result.remaining        = total_blocks - (i + 1);

			// ── 3. Stream partial result to the main thread ────────
			// The UI layer uses `remaining` to show progress like "3 of 8 blocks done"
			if (block_error) {
				self.postMessage({
					status : 'on_block_error',
					data   : {
						message          : block_error?.message || String(block_error),
						block            : i + 1,
						total            : total_blocks,
						accumulated_text : result.accumulated_text,
						remaining        : result.remaining
					}
				});
			} else {
				self.postMessage({
					status : 'on_chunk',
					data   : result
				});
			}
		}

		// ── 4. Signal completion ────────────────────────────────────────
		self.postMessage({ status: 'end', data: result });

	} catch (error) {

		// Fatal error (pipeline load failed, GPU out of memory, etc.)
		self.postMessage({
			status : 'error',
			data   : {
				message : error?.message || '',
				name    : error?.name || error?.constructor?.name || '',
				stack   : error?.stack || ''
			}
		});
	}
};


/**
 * Translate a single text block using the loaded model pipeline.
 *
 * @param {Function} translator       - The loaded HuggingFace text-generation pipeline
 * @param {string}   text             - Markdown block to translate, carrying [[[n]]] markers
 * @param {string}   sourceLangCode   - Source language locale code (e.g. 'en')
 * @param {string}   targetLangCode   - Target language locale code (e.g. 'es')
 * @param {Object|null} retryContext  - When non-null, sends a corrective retry prompt built
 *   from the history of failed attempts: { failed_attempts: Array<{ text, missing }> }
 * @param {Object}   overrides        - { repetition_penalty }
 * @returns {Promise<string>} The model's response text
 *
 * Implementation notes:
 *
 *   System instruction:
 *     TranslateGemma's chat template does not accept a separate 'system' role — the
 *     conversation must start with 'user'. The preservation instruction is therefore
 *     prepended to the user content so the model reads it as a task description.
 *
 *   Deterministic output:
 *     `do_sample: false` disables temperature sampling, making the model behave greedily,
 *     so the same input always produces the same output.
 */
async function translate_text(translator, text, sourceLangCode, targetLangCode, retryContext=null, overrides={}) {

	let prompt;

	if (retryContext) {

		// ── Retry prompt: fix the previous output, don't retranslate ──
		// The previous output is a good translation that happens to be missing markers.
		// Ask for those markers to be inserted into it, rather than starting over — a
		// fresh translation would be just as likely to drop them again.
		const { failed_attempts } = retryContext;
		const last_attempt = failed_attempts[failed_attempts.length - 1];

		const source_ph  = extract_placeholders(text);
		const present    = new Set(extract_placeholders(last_attempt.text));

		// For each missing marker, name the neighbours it sits between in the source, so
		// the model has an anchor it can actually see in its own output.
		const hints = last_attempt.missing.map(function(missing_ph){

			const position = source_ph.indexOf(missing_ph);

			const before = source_ph.slice(0, position).reverse().find(ph => present.has(ph));
			const after  = source_ph.slice(position + 1).find(ph => present.has(ph));

			if (before && after) return `${missing_ph} — between ${before} and ${after}`;
			if (before)          return `${missing_ph} — after ${before}`;
			if (after)           return `${missing_ph} — before ${after}`;
			return missing_ph;
		});

		prompt = [
			`Your translation is missing some markers. Insert them; do not retranslate.`,
			``,
			`Rules:`,
			`1. Keep the existing translation text exactly as it is.`,
			`2. Insert each missing marker where it belongs, matching its position in the source.`,
			`3. Do not remove, renumber or alter the markers that are already there.`,
			`4. Output the complete corrected text, and nothing else.`,
			``,
			`Source (shows where each marker belongs):`,
			text,
			``,
			`Markers to insert:`,
			hints.join('\n'),
			``,
			`Your previous translation (fix this):`,
			`<<<`,
			last_attempt.text,
			`>>>`
		].join('\n');

	} else {

		// ── First-attempt prompt ──────────────────────────────────────────
		// Short and direct: TranslateGemma 4B follows brief instructions better than
		// elaborate ones. Stating the marker count gives the model something concrete
		// to check its own output against.
		const tokens = [...new Set(extract_placeholders(text))];

		const marker_rules = tokens.length > 0
			? [
				`Copy every marker exactly as written: ${tokens.join(' ')}`,
				`They are reference ids, not words. Never translate, renumber or drop them.`,
				`Your output must contain all ${tokens.length} of them.`,
				``,
				`Example:`,
				`Hello[[[1]]] how are you[[[2]]]? → Hola[[[1]]] ¿cómo estás[[[2]]]?`,
				``
			]
			: [];

		prompt = [
			`Translate from ${sourceLangCode} to ${targetLangCode}.`,
			`Preserve the Markdown formatting.`,
			``,
			...marker_rules,
			`Translate the text between <<< and >>>. Output only the translation.`,
			`<<<`,
			text,
			`>>>`
		].join('\n');
	}

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

	const output = await translator(messages, {
		max_new_tokens     : MAX_NEW_TOKENS,
		do_sample          : false,
		repetition_penalty : overrides.repetition_penalty || REPETITION_PENALTY_FIRST
	});

	// The model returns the full conversation so far;
	// grab the assistant's last (newly generated) message.
	const generated_text = output[0].generated_text;
	const last_message   = generated_text[generated_text.length - 1];

	return last_message.content;
}


// @license-end
