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
 * THE MODEL CANNOT BE INSTRUCTED. TranslateGemma is a translation model, not a chat model:
 * its chat template builds the instruction from source_lang_code/target_lang_code, and the
 * `text` field is the source text to translate. Anything you put there — a rule, an
 * example, a fence — is translated and handed back as content. See translate_text for the
 * full account of how that corrupted a live record.
 *
 * Placeholder preservation therefore rests entirely on mechanisms that do not require the
 * model's cooperation:
 *   - hoisting: markers at a segment's edges are stripped on the main thread and
 *     re-attached here, so the model never sees them (on a transcription, that is most);
 *   - copying: interior markers ride through as [[[n]]], which translation models generally
 *     copy as unknown tokens — when they do, we get the exact position for free;
 *   - repair_placeholders(): places whatever was dropped, and reports every one it placed
 *     so the main thread can put the result in front of the user rather than saving it.
 */

import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
import {
	placeholder_re,
	normalize_placeholders,
	repair_placeholders
} from '../../js/placeholders.js';
import { conform_emphasis } from '../../js/markdown_utils.js';

/**
 * ONNX-optimised 4B instruction-tuned translation model.
 * Uses q4 quantisation for memory-efficient local inference.
 */
const MODEL_ID			= 'onnx-community/translategemma-text-4b-it-ONNX';

/**
 * Hard ceiling on generated tokens. The real limit is computed per block from the input
 * length (see max_new_tokens_for) — this is only a backstop.
 */
const MAX_NEW_TOKENS	= 1024;

/**
 * A translation is roughly as long as its source. Allow this multiple of the input's
 * token count, plus a small constant for scripts that tokenise less efficiently than the
 * source (Devanagari, Arabic).
 *
 * This is what bounds the blast radius: a loop on a 40-token sentence can now run for
 * ~110 tokens, not 1024. The reported failure generated ~900 tokens of 'सामान्य भन्दा'
 * because every call was allowed the full budget regardless of how little it was given.
 */
const NEW_TOKENS_RATIO	= 2.0;
const NEW_TOKENS_MARGIN	= 32;

/**
 * Per-block timeout in milliseconds.
 * If a single block translation exceeds this duration it is treated as a failure.
 */
const BLOCK_TIMEOUT_MS	= 120_000;

/**
 * Repetition penalty for the FIRST attempt.
 *
 * A penalty divides the logits of tokens already emitted, which is exactly what a
 * [[[12]]] marker does NOT want — its bracket tokens have to repeat once per marker.
 * That is why this was previously turned off entirely (1.0), and turning it off is what
 * let greedy decoding fall into the repetition loop that started this.
 *
 * It is back, mildly, because the tension is now largely gone: boundary markers are
 * hoisted out of the model input on the main thread, so most blocks reach the model
 * carrying no markers at all and pay nothing for the penalty.
 */
const REPETITION_PENALTY_FIRST = 1.1;

/**
 * Penalty used when the first attempt degenerated anyway.
 */
const REPETITION_PENALTY = 1.2;

/**
 * Sampling settings for the degeneration retry.
 *
 * A stiffer penalty alone often does not break a loop — greedy decoding is *itself* what
 * falls into the attractor, and a deterministic decoder walks back into it. Introducing a
 * little randomness is what actually escapes. Low temperature keeps the translation
 * faithful; this path is a fallback, so giving up bit-for-bit reproducibility here (and
 * only here) is the right trade.
 */
const RETRY_TEMPERATURE	= 0.3;
const RETRY_TOP_P		= 0.9;

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
 * The (device, dtype) the cached pipeline was built with. When the user changes either,
 * the cache must be thrown away — silently reusing a q4 pipeline after the user asked
 * for q8 would look like the setting does nothing.
 * @type {string|null}
 */
let cached_signature = null;

/**
 * Flag set by the main thread to cancel an in-progress translation.
 * @type {boolean}
 */
let cancelled = false;


// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip fencing and any conversational preamble from a model response.
 *
 * The first-attempt prompt no longer uses <<< / >>> fences (the model was imitating them,
 * wrapping its answer in 《…》), but the corrective retry prompt still does, and a model
 * given no fence at all will sometimes invent one. So this handles all of it: take what is
 * inside the fence when there is one, and otherwise clean up whatever wrapper the model
 * decided to add.
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

	// the model's own invented wrappers: 《…》 (imitating the fences), or CJK/guillemet
	// quotes around the whole answer
	const quoted = text.trim().match(/^[《「『]\s*([\s\S]*?)\s*[》」』]$/);
	if (quoted) {
		return quoted[1].trim();
	}

	return text
		.trim()
		.replace(/^(?:here (?:is|'s)[^\n:]{0,40}:|translation:|traducci[oó]n:)\s*/i, '')
		.replace(/^<<<\s*/, '')
		.replace(/\s*>>>$/, '')
		.replace(/^[《「『]\s*/, '')
		.replace(/\s*[》」』]$/, '')
		.trim();
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
 * MAX_NEW_TOKENS_FOR
 * How many tokens this block is allowed to generate.
 *
 * A translation is roughly as long as its source, so the budget is derived from the input
 * rather than being a flat 1024 for every call. That flat budget is what let the reported
 * failure emit ~900 tokens of 'सामान्य भन्दा' from a single paragraph: a loop will happily
 * fill whatever room it is given. Bounding the room bounds the damage — and the truncated
 * output still trips detect_repetition, so the block is caught rather than saved.
 *
 * Falls back to a character estimate if the tokenizer is not reachable through the
 * pipeline, which keeps this a hardening measure rather than a new failure mode.
 *
 * @param {Function} translator - The loaded pipeline (carries .tokenizer).
 * @param {string}   text       - The block being translated.
 * @returns {number} Token budget, clamped to MAX_NEW_TOKENS.
 */
function max_new_tokens_for(translator, text) {

	let input_tokens;

	try {
		const encoded = translator.tokenizer(text);
		// transformers.js Tensor: dims is [batch, seq_len]
		input_tokens = encoded?.input_ids?.dims?.[1];
	} catch (error) {
		input_tokens = null;
	}

	if (!input_tokens || !Number.isFinite(input_tokens)) {
		// ~4 chars per token is a serviceable average; it only has to be the right order
		input_tokens = Math.ceil(text.length / 4);
	}

	const budget = Math.ceil(input_tokens * NEW_TOKENS_RATIO) + NEW_TOKENS_MARGIN;

	return Math.min(budget, MAX_NEW_TOKENS);
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
 * Longest repeating cycle to look for, in words. A greedy-decode loop is almost always
 * a short phrase; beyond ~6 words it is far more likely to be legitimate repetition.
 */
const MAX_CYCLE_WORDS = 6;

/**
 * How many times a multi-word cycle must repeat back-to-back before we call it
 * degeneration. Three is unambiguous while still letting a phrase appear twice.
 */
const MIN_CYCLE_REPEATS = 3;

/**
 * A single word needs a higher bar — 'no, no, no' is ordinary speech, especially in the
 * transcriptions this tool translates.
 */
const MIN_UNIGRAM_REPEATS = 5;

/**
 * A translation is roughly as long as its source. Anything past this multiple is not a
 * translation any more, whatever the n-gram scan says.
 */
const MAX_LENGTH_RATIO = 2.5;


/**
 * DETECT_REPETITION
 * Detect that greedy decoding fell into a loop.
 *
 * The previous version only checked whether a word equalled the word BEFORE it — an
 * adjacent, unigram repeat. Real degeneration is usually an n-gram *cycle*:
 *
 *   सामान्य भन्दा सामान्य भन्दा सामान्य भन्दा …
 *
 * No two adjacent words there are ever equal, so the old check returned false and ~900
 * tokens of garbage were written to the record. This scans for a repeating cycle of any
 * length up to MAX_CYCLE_WORDS, which subsumes the unigram case (n=1).
 *
 * The scan runs over the WHOLE text, not just its tail. Anchoring at the tail looks
 * tempting — that is where a loop ends up — but it is brittle: the reported output ended
 * '…सामान्य।' with the sentence-final danda glued on, so the last word never repeated
 * and the cycle was invisible from the end. A loop anywhere is a loop.
 *
 * @param {string} text          - Translated text to check.
 * @param {string} [source_text] - The text it was translated FROM. When given, a wildly
 *   longer output is treated as degenerate regardless of the n-gram scan.
 * @returns {boolean} true if the output is degenerate.
 */
function detect_repetition(text, source_text) {

	if (!text || text.length < 50) return false;

	// a translation that ballooned is degenerate whatever shape it has
	if (source_text && source_text.length > 0 && text.length > source_text.length * MAX_LENGTH_RATIO) {
		return true;
	}

	const words = text.trim().split(/\s+/);

	for (let size = 1; size <= MAX_CYCLE_WORDS; size++) {

		const min_repeats = (size===1) ? MIN_UNIGRAM_REPEATS : MIN_CYCLE_REPEATS;
		if (words.length < size * min_repeats) break;

		for (let start = 0; start + (size * min_repeats) <= words.length; start++) {

			// how many times does the cycle at `start` repeat back-to-back?
			let repeats = 1;
			let next    = start + size;

			while (next + size <= words.length) {
				let same = true;
				for (let i = 0; i < size; i++) {
					if (words[next + i] !== words[start + i]) {
						same = false;
						break;
					}
				}
				if (!same) break;
				repeats++;
				next += size;
			}

			if (repeats >= min_repeats) {
				return true;
			}
		}
	}

	return false;
}


// ── Block processing ───────────────────────────────────────────────────────

/**
 * Translate one block and get every marker it carried back.
 *
 *   1. Translate the segment. Nothing but the segment goes to the model — see translate_text.
 *   2. If the output degenerated into a repetition loop, retry with a stiffer penalty and
 *      then with SAMPLING: greedy decoding is itself what falls into the loop, and a
 *      deterministic decoder just walks straight back into it.
 *   3. Whatever markers the model dropped are placed by repair_placeholders() and reported
 *      as uncertain, and the hoisted edge markers are re-attached verbatim.
 *
 * There is no step that ASKS the model to fix anything. It cannot be asked — it translates
 * whatever it is given, instructions included.
 *
 * Throws when the block degenerates and cannot be recovered. The caller keeps the SOURCE
 * text for that block and records it in failed_blocks, which fires the review gate — a
 * looping block must never be silently written to the record.
 *
 * @param {Function} translator
 * @param {Object}   block            - { text, placeholders, restore_map, prefix, suffix }
 * @param {string}   source_lang_code
 * @param {string}   target_lang_code
 * @param {string}   label            - Human label used in timeout messages, e.g. 'Block 2/5'
 * @returns {Promise<{text:string, repaired:string[], unrepairable:string[]}>} in LOCAL tokens.
 */
async function process_block(translator, block, source_lang_code, target_lang_code, label) {

	// Everything the model hands back goes through here: unwrap whatever it wrapped its
	// answer in, repair mangled markers, and delete any emphasis it invented.
	const clean_output = function(raw) {
		return conform_emphasis(block.text, normalize_placeholders(strip_fences(raw)));
	};

	// ── 1. translate ────────────────────────────────────────────────────
	const raw = await with_timeout(
		translate_text(translator, block.text, source_lang_code, target_lang_code, {
			repetition_penalty : REPETITION_PENALTY_FIRST
		}),
		BLOCK_TIMEOUT_MS,
		label
	);

	let text = clean_output(raw);

	// ── 2. repetition degeneration ──────────────────────────────────────
	// block.text is passed as the source so a ballooned output is caught even when it has
	// no clean n-gram cycle.
	if (detect_repetition(text, block.text)) {

		// escalate: a stiffer penalty first (cheap, still deterministic), then sampling
		const escalations = [
			{ repetition_penalty : REPETITION_PENALTY },
			{ repetition_penalty : REPETITION_PENALTY, do_sample : true, temperature : RETRY_TEMPERATURE, top_p : RETRY_TOP_P }
		];

		for (const overrides of escalations) {

			if (cancelled) break;

			const retry_raw = await with_timeout(
				translate_text(translator, block.text, source_lang_code, target_lang_code, overrides),
				BLOCK_TIMEOUT_MS,
				`${label} (repetition retry${overrides.do_sample ? ', sampling' : `, penalty ${overrides.repetition_penalty}`})`
			);

			text = clean_output(retry_raw);

			if (!detect_repetition(text, block.text)) {
				break;
			}
		}

		if (detect_repetition(text, block.text)) {
			throw new Error(`${label}: the model looped and could not be recovered (repetition degeneration)`);
		}
	}

	// There is deliberately NO "you dropped some markers, put them back" retry here.
	//
	// TranslateGemma translates whatever is in the text field — it cannot be instructed. A
	// corrective prompt would simply come back TRANSLATED, which is exactly how our own
	// instructions ended up written into a record as Nepali prose. Two wasted generations
	// per block to produce something the guard then threw away.
	//
	// Markers survive by three mechanisms that actually work: hoisting (edge markers never
	// reach the model), the model copying interior markers as unknown tokens, and
	// repair_placeholders below for whatever it drops — all of it reported to the save gate.

	// ── 3. place whatever the model would not ───────────────────────────
	// ── 3. place whatever the model would not ───────────────────────────
	const repaired = repair_placeholders(block.text, text, block.placeholders);

	// ── 4. put back the markers that never went to the model ────────────
	// Markers sitting at the very start or end of a block were hoisted out on the main
	// thread precisely so the model never had to copy them. Re-attach them verbatim: at
	// this granularity most blocks are entirely made of these, so most blocks come back
	// with their markers guaranteed intact rather than merely probably intact.
	repaired.text = (block.prefix || '') + repaired.text + (block.suffix || '');

	return repaired;
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
	const dtype            = options.dtype || 'q4';

	// Reset cancel flag for this run
	cancelled = false;

	try {

		// ── 1. Load / reuse the model pipeline ───────────────────────────
		// The pipeline is cached after the first call; subsequent calls reuse it — but
		// only when device AND dtype still match. Reusing a q4 pipeline after the user
		// asked for q8 would make the setting look inert.
		//
		// q4 (~2.5 GB) is the default because it is what makes in-browser inference
		// viable at all; it also costs real translation quality, which is one of the
		// reasons long, low-resource translations degenerate. q8 trades memory for that.
		const signature = `${device}:${dtype}`;
		if (cached_translator && cached_signature!==signature) {
			cached_translator = null;
			cached_signature  = null;
		}

		if (!cached_translator) {
			cached_translator = await pipeline('text-generation', MODEL_ID, {
				device : device,
				dtype  : dtype,
				progress_callback: ({ progress, status, file }) => {
					// Relay download/compile progress to the UI thread
					self.postMessage({
						status : 'init',
						data   : { progress, status, device, file }
					});
				}
			});
			cached_signature = signature;
		}

		const blocks       = options.blocks;
		const total_blocks = blocks.length;

		// translated blocks, in order. Rejoined with each block's OWN separator — the
		// literal text that stood before it in the source ('\n\n' between paragraphs, '\n'
		// for a <br>, ' ' between sentences).
		//
		// This used to be a hardcoded '\n\n', which was right only while blocks were whole
		// paragraphs. Once segmentation started cutting inside paragraphs, every seam became
		// a paragraph break and a record of one <p> with four <br> came back as ~25 <p>.
		const parts = [];

		// every marker WE placed rather than the model, in document-wide tokens
		const repair_stats = {
			repaired     : [],
			unrepairable : []
		};

		// blocks that failed and were emitted in the source language. These carry all their
		// marks intact, so the mark-count check downstream would happily pass them — the
		// main thread needs to be told explicitly, or it would report a partially
		// untranslated result as a complete success.
		const failed_blocks = [];

		const result = {
			accumulated_text : '',
			remaining        : total_blocks,
			repair_stats     : repair_stats,
			failed_blocks    : failed_blocks
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

				failed_blocks.push({
					block   : i + 1,
					total   : total_blocks,
					message : err?.message || String(err)
				});

				console.warn(`[browser_transformer] ${label} failed, keeping source text: ${err?.message || err}`);
			}

			// parts[k] is the translation of blocks[k], so each one is prefixed with the
			// separator that preceded that block in the source. blocks[0].sep is '' by
			// construction, so the result never starts with stray whitespace.
			result.accumulated_text = parts
				.map((part, k) => (blocks[k].sep || '') + part)
				.join('');
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
 * ─────────────────────────────────────────────────────────────────────────────
 * DO NOT PUT INSTRUCTIONS IN `text`. TranslateGemma WILL TRANSLATE THEM.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is not a chat model that happens to translate; it is a translation model. Its chat
 * template builds the instruction itself from source_lang_code/target_lang_code, and the
 * `text` field is the SOURCE TEXT TO TRANSLATE — the model card says so in as many words:
 * "The text field is not meant for free-form prompts with instructions."
 *
 * We learned this the hard way. `text` used to carry a whole prompt — a task description,
 * a list of the markers to preserve, a worked example, <<< >>> fences — and the model
 * faithfully translated all of it into the target language and wrote it into the record. A
 * user's oral-history transcript opened with two paragraphs of our own instructions
 * rendered in Nepali, and the `[[[1]]]`/`[[[2]]]` from the worked example were mapped back
 * through restore_map into REAL Dédalo index tags that had never been in the source.
 *
 * It had appeared to work only because strip_fences was extracting the <<<…>>> span from
 * the output and silently discarding the translated instructions wrapped around it.
 *
 * The same fault produced the 《…》 quoting (it translated the fences) and the phantom
 * <strong>/<u> in a source that contained only <i> (it translated the line that said
 * "Keep the Markdown formatting (**bold**, *italic*, __underline__)" — markers included).
 *
 * So: the segment, and nothing but the segment. The model cannot be told anything, which is
 * why marker survival rests on hoisting, on the model copying unknown tokens, and on
 * repair_placeholders — never on asking nicely.
 *
 * @param {Function} translator     - The loaded HuggingFace text-generation pipeline
 * @param {string}   text           - The segment to translate, carrying [[[n]]] markers
 * @param {string}   sourceLangCode - Source language code (e.g. 'es')
 * @param {string}   targetLangCode - Target language code (e.g. 'ne')
 * @param {Object}   overrides      - { repetition_penalty, do_sample, temperature, top_p }
 * @returns {Promise<string>} The model's response text
 */
async function translate_text(translator, text, sourceLangCode, targetLangCode, overrides={}) {

	const messages = [
		{
			role    : 'user',
			content : [
				{
					type             : 'text',
					source_lang_code : sourceLangCode,
					target_lang_code : targetLangCode,
					text             : text
				}
			]
		}
	];

	const generation = {
		max_new_tokens     : max_new_tokens_for(translator, text),
		do_sample          : overrides.do_sample===true,
		repetition_penalty : overrides.repetition_penalty || REPETITION_PENALTY_FIRST
	};

	// temperature/top_p are only meaningful when sampling; passing them with
	// do_sample:false makes the config look like it does something it does not
	if (generation.do_sample) {
		generation.temperature = overrides.temperature ?? RETRY_TEMPERATURE;
		generation.top_p       = overrides.top_p ?? RETRY_TOP_P;
	}

	const output = await translator(messages, generation);

	// The model returns the full conversation so far;
	// grab the assistant's last (newly generated) message.
	const generated_text = output[0].generated_text;
	const last_message   = generated_text[generated_text.length - 1];

	return last_message.content;
}


// @license-end
