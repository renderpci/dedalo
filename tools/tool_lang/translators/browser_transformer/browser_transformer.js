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
import { conform_emphasis, restore_wrapping_emphasis } from '../../js/markdown_utils.js';

/**
 * NLLB / FLORES-200 language codes, keyed by the ISO 639-1 code dedalo_to_locale emits.
 * Covers every language Dédalo ships labels for.
 * @type {Object<string,string>}
 */
const NLLB_LANGS = {
	en : 'eng_Latn',
	es : 'spa_Latn',
	fr : 'fra_Latn',
	it : 'ita_Latn',
	pt : 'por_Latn',
	ca : 'cat_Latn',
	de : 'deu_Latn',
	ne : 'npi_Deva',
	ar : 'arb_Arab',
	el : 'ell_Grek',
	eu : 'eus_Latn'
};

/**
 * English language names, keyed by the ISO 639-1 code dedalo_to_locale emits. A general
 * instruction LLM is not a lang-code model — 'Spanish → Basque' is far clearer to it than
 * 'es → eu'. Falls back to the raw code for anything unlisted.
 * @type {Object<string,string>}
 */
const LANG_NAMES = {
	en : 'English', es : 'Spanish', fr : 'French', it : 'Italian', pt : 'Portuguese',
	ca : 'Catalan', de : 'German', ne : 'Nepali', ar : 'Arabic', el : 'Greek', eu : 'Basque'
};

/**
 * QWEN_SYSTEM_PROMPT
 * The instruction turn for a general instruct model (Qwen3). Unlike TranslateGemma, Qwen has
 * a real `system` role that it treats as instructions rather than as text to translate — so
 * the rules live here, and the segment goes in the user turn untouched.
 *
 * The marker rule is stated IN WORDS, with no worked example. The [[[1]]] example that used to
 * sit in the TranslateGemma prompt is exactly what got copied into the output and mapped back
 * to a real Dédalo tag. Describing the rule preserves it without ever showing a live token.
 *
 * @param {string} src - source ISO code
 * @param {string} tgt - target ISO code
 * @returns {string}
 */
function qwen_system_prompt(src, tgt) {

	const source = LANG_NAMES[src] || src;
	const target = LANG_NAMES[tgt] || tgt;

	return [
		`You are a professional translator. Translate the user's text from ${source} to ${target}.`,
		`Output only the translation — no preamble, no notes, no explanation, no quotation marks.`,
		`Preserve the meaning, tone and register; this is transcribed speech and archival text, not to be summarised.`,
		`Some text contains placeholders written as triple square brackets around a number, for example three open brackets, a number, three close brackets. Keep every placeholder exactly as written and in place: never translate, renumber, add or remove one.`,
		`Keep Markdown emphasis (*, **, __) exactly as in the source; do not add any that is not there.`
	].join('\n');
}


/**
 * MADLAD target-language codes, keyed by the ISO 639-1 code dedalo_to_locale emits.
 * MADLAD encodes only the TARGET (source is auto-detected), as a <2xx> prefix on the input.
 * Every value here was verified present in the model's tokenizer vocabulary.
 * @type {Object<string,string>}
 */
const MADLAD_TARGETS = {
	en : '<2en>', es : '<2es>', fr : '<2fr>', it : '<2it>', pt : '<2pt>', ca : '<2ca>',
	de : '<2de>', ne : '<2ne>', ar : '<2ar>', el : '<2el>', eu : '<2eu>'
};


/**
 * ENGINES
 * The translation back-ends, and everything that differs between them.
 *
 * ADDING A MODEL IS ONE ENTRY IN THIS TABLE. Nothing else in the pipeline — segmentation,
 * marker hoisting, repair, the save gate, the UI — knows or cares which engine ran.
 *
 * The two shapes differ in a way that matters:
 *
 *   'text-generation' — an instruction-tuned CHAT model. Its chat template turns whatever
 *     you give it into a prompt. TranslateGemma is one, and that is the source of most of
 *     the grief in this file's history: it translated our instructions into the record.
 *
 *   'translation' — a real seq2seq MT model (NLLB, Marian/opus-mt). No chat template, no
 *     prompt, no instructions to leak. Takes a sentence, returns a sentence — which is
 *     exactly the shape this pipeline already feeds it.
 *
 * Per engine:
 *   task           — the transformers.js pipeline task
 *   model_id       — (src, tgt) => Hub id. Marian is per-pair, hence the arguments.
 *   default_dtype  — quantisation when the caller does not force one
 *   supports       — (src, tgt) => boolean. Checked BEFORE loading, so an unsupported pair
 *                    fails with a sentence instead of a 404 on a 600 MB download.
 *   translate      — (translator, text, src, tgt, generation) => Promise<string>
 *   note           — surfaced to the caller; used for the licence warning
 */
const ENGINES = {

	// The current default. 4B, chat-shaped, ~3 GB at q4. Covers every language, but
	// quality on low-resource targets (eu, ne) is poor and it is prone to repetition loops.
	translategemma : {
		task			: 'text-generation',
		model_id		: () => 'onnx-community/translategemma-text-4b-it-ONNX',
		default_dtype	: 'q4',
		requires_webgpu	: true,
		supports		: () => true,
		translate		: async function(translator, text, src, tgt, generation) {

			// The text field is the SOURCE TEXT. Not a prompt. See the long note on
			// translate_text — putting instructions here gets them translated into the record.
			const messages = [{
				role    : 'user',
				content : [{
					type             : 'text',
					source_lang_code : src,
					target_lang_code : tgt,
					text             : text
				}]
			}];

			const output         = await translator(messages, generation);
			const generated_text = output[0].generated_text;

			return generated_text[generated_text.length - 1].content;
		}
	},

	// A general instruction LLM, ~2.5-3 GB at q4. NOT a translation model — its draw is that
	// it can be INSTRUCTED, which no other engine here can. The rules (keep the markers, output
	// only the translation) go in a real system turn that the model treats as instructions, not
	// as content — the exact thing TranslateGemma lacked. On low-resource targets (eu, ne) and
	// domain text a strong instruct model is often more fluent than a literal MT model.
	//
	// The -Instruct-2507 variant is non-thinking (no <think> traces). Apache-2.0.
	qwen : {
		task			: 'text-generation',
		model_id		: () => 'onnx-community/Qwen3-4B-Instruct-2507-ONNX',
		// q4f16, NOT q4. Qwen3-4B at q4 is ~4 GB of weights and overruns the WASM 4 GB
		// address space the moment the KV cache is allocated ('memory access out of bounds').
		// q4f16 is ~2.9 GB — comparable to TranslateGemma — and faster. It needs fp16, i.e.
		// WebGPU, which is required here anyway (see requires_webgpu).
		default_dtype	: 'q4f16',
		requires_webgpu	: true,
		supports		: () => true,
		note			: 'apache',
		translate		: async function(translator, text, src, tgt, generation) {

			// the segment goes in the USER turn, unwrapped; the SYSTEM turn carries the rules
			const messages = [
				{ role : 'system', content : qwen_system_prompt(src, tgt) },
				{ role : 'user',   content : text }
			];

			const output         = await translator(messages, generation);
			const generated_text = output[0].generated_text;

			return generated_text[generated_text.length - 1].content;
		}
	},

	// Purpose-built multilingual MT, 600M — a quarter the size of TranslateGemma and the
	// only browser-viable model that covers Basque AND Nepali.
	//
	// LICENCE: CC-BY-NC-4.0. Non-commercial. That is a decision for the deployment, not for
	// this file, so the engine is offered and the restriction is stated plainly in the UI.
	nllb : {
		task			: 'translation',
		model_id		: () => 'Xenova/nllb-200-distilled-600M',
		default_dtype	: 'q8',
		supports		: (src, tgt) => !!(NLLB_LANGS[src] && NLLB_LANGS[tgt]),
		note			: 'non_commercial',
		translate		: async function(translator, text, src, tgt, generation) {

			const output = await translator(text, {
				...generation,
				src_lang : NLLB_LANGS[src],
				tgt_lang : NLLB_LANGS[tgt]
			});

			return output[0].translation_text;
		}
	},

	// Marian, ~75 MB per pair. Fast enough on CPU, which matters for the users who cannot
	// use WebGPU at all.
	//
	// Coverage is per-pair and there are dozens of these on the Hub — so `supports` does NOT
	// try to enumerate them (an earlier hardcoded list wrongly rejected es→de, which exists).
	// It only rejects a pair that cannot exist — same language both sides, or a code Dédalo
	// never emits. Whether the SPECIFIC model exists is settled by trying to load it: a 404
	// on the tiny config comes back as 'unsupported_pair'. Basque, Nepali and most non-en
	// pairs simply have no model and fail that way, cleanly.
	opus : {
		task			: 'translation',
		model_id		: (src, tgt) => `Xenova/opus-mt-${src}-${tgt}`,
		default_dtype	: 'q8',
		supports		: (src, tgt) => src!==tgt && KNOWN_LANGS.has(src) && KNOWN_LANGS.has(tgt),
		translate		: async function(translator, text, src, tgt, generation) {

			// the model IS the language pair — there are no lang arguments
			const output = await translator(text, generation);

			return output[0].translation_text;
		}
	},

	// MADLAD-400 3B — a T5 seq2seq covering 400+ languages, including every one Dédalo
	// ships. ~3 GB at int8 (the only published quantisation), so it is the LARGEST option —
	// bigger even than TranslateGemma. Its draw is the licence: Apache-2.0, i.e. commercial
	// use is fine, which NLLB (the other model that reaches Basque/Nepali) does not allow.
	//
	// Unlike NLLB it is not instructed with src_lang/tgt_lang: the target language is a
	// <2xx> token PREPENDED to the source text, and the source language is auto-detected. So
	// only the target has to be known, and the prefix is added here in the engine.
	madlad : {
		task			: 'text2text-generation',
		model_id		: () => 'Kutalia/madlad400-3b-mt-onnx',
		default_dtype	: 'q8',
		requires_webgpu	: true,
		supports		: (src, tgt) => !!MADLAD_TARGETS[tgt],
		note			: 'large_download',
		translate		: async function(translator, text, src, tgt, generation) {

			const output = await translator(`${MADLAD_TARGETS[tgt]} ${text}`, generation);

			return output[0].generated_text;
		}
	}
};

/**
 * Engine used when the caller does not name one.
 */
const DEFAULT_ENGINE = 'translategemma';


/**
 * ISO 639-1 codes Dédalo can emit (the keys of NLLB_LANGS). Used by opus to reject
 * obviously-bogus pairs cheaply without claiming to know which specific Marian models exist.
 * @type {Set<string>}
 */
const KNOWN_LANGS = new Set(Object.keys(NLLB_LANGS));


/**
 * IS_MODEL_NOT_FOUND
 * Did a pipeline() load fail because the model simply does not exist (vs. a network drop,
 * an out-of-memory, a corrupt file)? A missing model is expected — opus is one model per
 * pair — and must be reported as an unsupported pair, not as a fatal worker crash.
 *
 * transformers.js surfaces a Hub 404 as an error whose message names the file it could not
 * fetch; there is no typed error class to key on, so we match the message.
 *
 * @param {Error} error
 * @returns {boolean}
 */
function is_model_not_found(error) {

	const message = String(error && error.message || error).toLowerCase();

	return message.includes('could not locate')
		|| message.includes('not found')
		|| message.includes('404')
		|| message.includes('unauthorized')	// private/removed repos answer 401
		|| message.includes('failed to fetch');
}

/**
 * Hard ceiling on generated tokens. A backstop for pathological long sentences — the real
 * per-segment limit is computed from the source length (see max_new_tokens_for). Note this
 * is a CEILING, not a target: the model stops at its end-of-text token well before this for
 * a normal segment, so a generous ceiling costs nothing on the common path.
 */
const MAX_NEW_TOKENS	= 2048;

/**
 * Output token budget = source CHARACTER count × this, plus a margin.
 *
 * Deliberately based on characters, NOT on the source token count. A Spanish sentence of 70
 * tokens becomes 300-500 tokens in Nepali (Devanagari) or Arabic, because those scripts
 * tokenise far less efficiently. Budgeting from source *tokens* — which are compact for the
 * Latin source — truncated every Devanagari translation mid-sentence: the model hit the cap
 * before finishing. Source character count tracks output length across scripts; source token
 * count does not.
 *
 * 4 tokens per source character is generous enough for the worst expanding target while
 * still bounding a repetition loop's blast radius to the (small) segment size.
 */
const OUTPUT_TOKENS_PER_SOURCE_CHAR	= 4.0;
const NEW_TOKENS_MARGIN				= 64;

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
 * How many tokens this segment is allowed to generate.
 *
 * Derived from the source CHARACTER count, not its token count — see
 * OUTPUT_TOKENS_PER_SOURCE_CHAR for why. Budgeting from source tokens truncated every
 * Devanagari/Arabic translation mid-sentence, because the compact Latin source under-counts
 * the tokens the expanded target needs.
 *
 * This is still what bounds a repetition loop: segments are small (≤ SEGMENT_MAX_CHARS), so
 * the budget is small, so a loop cannot run away — and the output is caught by
 * detect_repetition regardless. It no longer needs the tokenizer at all, which removes a
 * fragile per-engine dependency.
 *
 * @param {Function} translator - unused; kept for signature stability with the callers.
 * @param {string}   text       - The segment being translated.
 * @returns {number} Token budget, clamped to MAX_NEW_TOKENS.
 */
function max_new_tokens_for(translator, text) {

	const budget = Math.ceil(text.length * OUTPUT_TOKENS_PER_SOURCE_CHAR) + NEW_TOKENS_MARGIN;

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
async function process_block(engine, translator, block, source_lang_code, target_lang_code, label) {

	// Everything the model hands back goes through here: unwrap whatever it wrapped its
	// answer in, repair mangled markers, delete any emphasis it invented, and restore
	// emphasis it dropped from a wholly-emphasised segment (an all-bold question).
	const clean_output = function(raw) {
		const text = conform_emphasis(block.text, normalize_placeholders(strip_fences(raw)));
		return restore_wrapping_emphasis(block.text, text);
	};

	// ── 1. translate ────────────────────────────────────────────────────
	const raw = await with_timeout(
		translate_text(engine, translator, block.text, source_lang_code, target_lang_code, {
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
				translate_text(engine, translator, block.text, source_lang_code, target_lang_code, overrides),
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
	const engine_name      = options.engine || DEFAULT_ENGINE;

	const engine = ENGINES[engine_name];
	if (!engine) {
		self.postMessage({
			status : 'error',
			data   : { message: `Unknown translation engine '${engine_name}'. Known: ${Object.keys(ENGINES).join(', ')}` }
		});
		return;
	}

	// Refuse a pair the engine KNOWS it cannot do, before touching the network. For NLLB and
	// MADLAD this is authoritative (their coverage is a fixed table). For opus it is only a
	// sanity check — Marian is one model per pair and there are dozens on the Hub, far too
	// many to mirror in a list here without getting it wrong. So opus says "plausible" for
	// any real pair and lets the load below be the real test: if the specific model does not
	// exist, the pipeline() fetch 404s on its (tiny) config and we report it cleanly, rather
	// than pretending to know the Hub's inventory.
	if (!engine.supports(source_lang_code, target_lang_code)) {
		self.postMessage({
			status : 'error',
			data   : {
				message : `The '${engine_name}' engine does not support ${source_lang_code} → ${target_lang_code}.`,
				code    : 'unsupported_pair'
			}
		});
		return;
	}

	// A multi-gigabyte model cannot run on the WASM (CPU) backend — wasm32 caps the address
	// space at 4 GB, and a 4B model plus its KV cache overruns it ('memory access out of
	// bounds'). Refuse before loading, with a message the user can act on, rather than letting
	// it crash mid-generation. Small MT models (NLLB, opus) have no such flag and run on CPU.
	if (engine.requires_webgpu) {
		const webgpu_available = (typeof navigator!=='undefined') && !!navigator.gpu;
		if (device!=='webgpu' || !webgpu_available) {
			self.postMessage({
				status : 'error',
				data   : {
					message : `The '${engine_name}' model needs WebGPU (GPU). `
						+ (webgpu_available
							? `Turn off the "more compatible / CPU" option to use it.`
							: `This browser has no WebGPU available, so this model cannot run here — try a smaller model (Opus-MT or NLLB).`),
					code    : 'needs_webgpu'
				}
			});
			return;
		}
	}

	const dtype    = options.dtype || engine.default_dtype;
	const model_id = engine.model_id(source_lang_code, target_lang_code);

	// Reset cancel flag for this run
	cancelled = false;

	try {

		// ── 1. Load / reuse the model pipeline ───────────────────────────
		// Cached after the first call, but only reused when the engine, the model, the
		// device AND the dtype all still match — otherwise switching engine in the UI would
		// silently keep translating with the previous model and look like it did nothing.
		const signature = `${engine_name}:${model_id}:${device}:${dtype}`;
		if (cached_translator && cached_signature!==signature) {
			cached_translator = null;
			cached_signature  = null;
		}

		if (!cached_translator) {
			try {
				cached_translator = await pipeline(engine.task, model_id, {
					device : device,
					dtype  : dtype,
					progress_callback: ({ progress, status, file }) => {
						// Relay download/compile progress to the UI thread
						self.postMessage({
							status : 'init',
							data   : { progress, status, device, file, engine : engine_name }
						});
					}
				});
				cached_signature = signature;
			} catch (load_error) {

				// A missing model is not a fatal worker error — it means this engine has no
				// model for this pair (the common case for opus, which is per-pair). Report it
				// as the same clean "unsupported pair" the pre-check uses, and do NOT dispose
				// the worker: the next attempt with a different engine or pair must still work.
				if (is_model_not_found(load_error)) {
					self.postMessage({
						status : 'error',
						data   : {
							message : `No '${engine_name}' model is available for ${source_lang_code} → ${target_lang_code}.`,
							code    : 'unsupported_pair'
						}
					});
					return;
				}

				throw load_error;
			}
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
					engine,
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
async function translate_text(engine, translator, text, sourceLangCode, targetLangCode, overrides={}) {

	// Generation settings are shared across engines — a seq2seq MT model takes
	// max_new_tokens / do_sample / repetition_penalty just as a causal LM does. What differs
	// (the chat message vs. src_lang/tgt_lang vs. nothing at all) lives in ENGINES.translate.
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

	return engine.translate(translator, text, sourceLangCode, targetLangCode, generation);
}


// @license-end
