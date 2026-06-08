// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
 * Browser Translation Worker (Web Worker)
 *
 * Runs TranslateGemma (4B-it) locally in the browser via HuggingFace Transformers
 * and ONNX runtime. Receives HTML blocks from the main thread, translates each
 * block sequentially, and streams results back as they complete.
 *
 * Communication protocol (postMessage):
 *   Main → Worker:
 *     { options: { blocks[], sourceLangCode, targetLangCode, device } }  – start translation
 *     { cancel: true }                                                  – abort in-progress translation
 *   Worker → Main:
 *     { status: 'init',           data: { progress, status, device, file } }           – model loading
 *     { status: 'on_chunk',       data: { accumulated_text, remaining } }              – progress stream
 *     { status: 'on_block_error', data: { message, block, total, accumulated_text, remaining } } – non-fatal block error
 *     { status: 'end',            data: { accumulated_text } }                        – done
 *     { status: 'error',          data: { message, name?, stack? } }                  – fatal error
 *     { status: 'cancelled',      data: { accumulated_text, remaining } }              – cancelled
 *
 * HTML preservation:
 *   Source HTML is converted to markdown before being sent to the model.
 *   The prompt instructs the model to keep all markdown syntax and raw
 *   HTML tags (unsupported tags like <table>) intact.
 *   The system instruction is embedded inside the single user message
 *   (not as a separate system role) because TranslateGemma requires the
 *   conversation to start with a user turn.
 */

//import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
import { pipeline, env } from './lib/transformers.js';

/**
 * ONNX-optimised 4B instruction-tuned translation model.
 * Uses q4 quantisation for memory-efficient local inference.
 */
//const MODEL_ID			= 'onnx-community/translategemma-text-4b-it-ONNX';

// Self-hosted model: serve from same origin instead of HuggingFace CDN
// In browser context, the library uses fetch() with remoteHost + remotePathTemplate
env.remoteHost			= new URL('./models/', self.location.href).href;
env.remotePathTemplate	= '{model}/';
const MODEL_ID			= 'translategemma-text-4b-it-ONNX';

/**
 * Maximum tokens the model may generate per call.
 * Blocks are pre-chunked to ~1000 chars on the main thread,
 * so 1024 tokens is typically sufficient for a single block.
 */
const MAX_NEW_TOKENS	= 2048;

/**
 * Per-block timeout in milliseconds.
 * If a single block translation exceeds this duration it is treated as a failure.
 */
const BLOCK_TIMEOUT_MS	= 120_000;

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
 * Extract all [[n]] placeholders from a string.
 * @param {string} text
 * @returns {string[]} Array of placeholder strings found
 */
function extract_placeholders(text) {
	const re = /\[\[\d+\]\]/g;
	const matches = [];
	let m;
	while ((m = re.exec(text)) !== null) {
		matches.push(m[0]);
	}
	return matches;
}

/**
 * Detect missing placeholders in the translated output.
 *
 * Compares placeholders in the input text against those in the output
 * and returns the list of missing ones, without performing any restoration.
 *
 * @param {string} input_text    - Original text sent to the model (with placeholders)
 * @param {string} output_text   - Model's translated text (may have lost placeholders)
 * @returns {{ missing: string[], has_missing: boolean }}
 *   - missing: array of placeholder strings absent from the output
 *   - has_missing: true if any placeholder is missing
 */
function detect_missing_placeholders(input_text, output_text) {
	const input_ph  = extract_placeholders(input_text);
	const output_ph = extract_placeholders(output_text);

	if (input_ph.length === 0) return { missing: [], has_missing: false };

	const output_set = new Set(output_ph);
	const missing    = input_ph.filter(p => !output_set.has(p));

	return { missing, has_missing: missing.length > 0 };
}

/**
 * Restore missing placeholders in the translated output using
 * heuristic offset-based positioning.
 *
 * This is the fallback when the LLM retry also fails to preserve
 * all placeholders. It applies two strategies:
 *
 *   Strategy 1 — Anchor + relative-gap positioning (preferred):
 *     For each missing placeholder, find the nearest present neighbor
 *     in the input (preceding or following). Measure the text gap
 *     between them in the input, then position the missing one at the
 *     same relative distance from the anchor in the output:
 *       - Gap = 0 (adjacent, e.g. [[34]][[25]]) → insert right next to anchor
 *       - Gap > 0 (separated by text) → scale gap by output/input ratio,
 *         snap to word boundary, and insert there
 *
 *   Strategy 2 — Absolute offset positioning (fallback):
 *     When no anchor exists, use the missing placeholder's character
 *     offset from the text start, proportionally scaled.
 *
 *   Placeholders are inserted in reverse offset order so earlier
 *   insertions don't shift the positions of later ones.
 *
 * @param {string}   input_text  - Original text sent to the model (with placeholders)
 * @param {string}   output_text - Model's translated text (may have lost placeholders)
 * @param {string[]} missing    - Array of missing placeholder strings to restore
 * @returns {string}             - Output text with placeholders restored (or unchanged)
 */
function restore_missing_placeholders(input_text, output_text, missing) {

	if (!missing || missing.length === 0) return output_text;

	console.warn(
		`[browser_transformer] Placeholders missing from translation: ${missing.join(', ')}. ` +
		`Applying heuristic restoration.`
	);

	const input_ph = extract_placeholders(input_text);
	const output_ph = extract_placeholders(output_text);
	const output_set = new Set(output_ph);

	// Build ordered list of all input placeholders with their offsets
	// so we can find neighbors and calculate relative gaps
	const input_ordered = [];
	for (const ph of input_ph) {
		const idx = input_text.indexOf(ph);
		if (idx !== -1) {
			input_ordered.push({ placeholder: ph, input_offset: idx });
		}
	}
	input_ordered.sort((a, b) => a.input_offset - b.input_offset);

	// Build list of missing placeholders with their input offsets
	const to_insert = [];
	for (const ph of missing) {
		const idx = input_text.indexOf(ph);
		if (idx === -1) continue;
		to_insert.push({ placeholder: ph, input_offset: idx });
	}

	// Sort by offset descending so we insert from right to left
	// and don't shift earlier positions
	to_insert.sort((a, b) => b.input_offset - a.input_offset);

	const input_len = input_text.length;
	let result = output_text;

	for (const { placeholder, input_offset } of to_insert) {

		// ── Strategy 1: Anchor + relative-gap positioning ──────────────
		const insert_pos = find_anchor_gap_position(
			placeholder, input_offset, input_ordered,
			input_text, input_len, output_set, result
		);

		if (insert_pos !== -1) {
			result = result.slice(0, insert_pos) + placeholder + result.slice(insert_pos);
			continue;
		}

		// ── Strategy 2: Absolute offset positioning (fallback) ────────
		const output_len = result.length;
		const length_diff_ratio = Math.abs(output_len - input_len) / input_len;

		const target_offset = length_diff_ratio < 0.3
			? input_offset
			: Math.round((input_offset / input_len) * output_len);

		let snap = find_nearest_boundary(result, target_offset, 10);
		snap = avoid_placeholder_overlap(result, snap);

		result = result.slice(0, snap) + placeholder + result.slice(snap);
	}

	return result;
}

/**
 * Find the insertion position for a missing placeholder using its
 * nearest present neighbor as an anchor, plus the relative text gap
 * between them in the input.
 *
 * Instead of always placing the missing placeholder adjacent to its
 * anchor, this function measures how much text separates them in the
 * input and applies that gap proportionally in the output:
 *
 *   - Gap = 0  → placeholders were adjacent → insert right after/before anchor
 *   - Gap > 0  → there was text between them → insert at proportional distance
 *
 * This handles both clustered placeholders (e.g. [[34]][[25]]) and
 * spaced-out ones (e.g. [[25]] next text[[35]]) accurately.
 *
 * @param {string} placeholder     - The missing placeholder (e.g. '[[35]]')
 * @param {number} input_offset    - Character offset of the missing placeholder in the input
 * @param {Array}  input_ordered   - All input placeholders sorted by offset: [{ placeholder, input_offset }]
 * @param {string} input_text      - Full input text
 * @param {number} input_len       - Length of input text
 * @param {Set}    output_set      - Set of placeholders present in the output
 * @param {string} result          - Current output text
 * @returns {number}               - Insertion offset, or -1 if no anchor found
 *
 * @example
 *   // Adjacent placeholders (gap = 0)
 *   // Input:  "text[[34]][[25]]more"
 *   // Output: "text[[34]]more"  ([[25]] missing)
 *   // Anchor: [[34]], gap from [[34]] end to [[25]] start = 0
 *   // → insert right after [[34]] → "text[[34]][[25]]more"
 *
 * @example
 *   // Separated placeholders (gap > 0)
 *   // Input:  "my text[[34]][[25]] next text[[35]] other"
 *   // Output: "mi texto[[25]] siguiente texto otros"  ([[34]] and [[35]] missing)
 *   // For [[34]]: anchor [[25]], gap from [[25]] start back to [[34]] start = 6
 *   //   → insert 6 chars before [[25]] in output → "mi texto[[34]][[25]]..."
 *   // For [[35]]: anchor [[25]], gap from [[25]] end to [[35]] start = 12
 *   //   → insert 12 scaled chars after [[25]] in output → "...[[25]] siguiente[[35]] texto..."
 */
function find_anchor_gap_position(placeholder, input_offset, input_ordered,
                                   input_text, input_len, output_set, result) {
	const my_idx = input_ordered.findIndex(p => p.placeholder === placeholder);
	if (my_idx === -1) return -1;

	// Search backwards for the nearest preceding anchor present in output
	let prev_anchor = null;
	let prev_anchor_offset = -1;
	for (let i = my_idx - 1; i >= 0; i--) {
		if (output_set.has(input_ordered[i].placeholder)) {
			prev_anchor = input_ordered[i].placeholder;
			prev_anchor_offset = input_ordered[i].input_offset;
			break;
		}
	}

	// Search forwards for the nearest following anchor present in output
	let next_anchor = null;
	let next_anchor_offset = -1;
	for (let i = my_idx + 1; i < input_ordered.length; i++) {
		if (output_set.has(input_ordered[i].placeholder)) {
			next_anchor = input_ordered[i].placeholder;
			next_anchor_offset = input_ordered[i].input_offset;
			break;
		}
	}

	const output_len = result.length;

	// Try preceding anchor: measure gap from its END to the missing placeholder's START
	if (prev_anchor) {
		const prev_end_in_input = prev_anchor_offset + prev_anchor.length;
		const gap_in_input = input_offset - prev_end_in_input; // chars of text between them

		const prev_pos_in_output = result.indexOf(prev_anchor);
		if (prev_pos_in_output !== -1) {
			const anchor_output_end = prev_pos_in_output + prev_anchor.length;

			if (gap_in_input <= 1) {
				// Adjacent or overlapping → insert right after the anchor
				return anchor_output_end;
			}

			// Scale the gap proportionally (input → output text ratio)
			const scale = output_len / input_len;
			const gap_in_output = Math.round(gap_in_input * scale);
			let target = anchor_output_end + gap_in_output;

			// Clamp and snap to word boundary
			target = Math.min(target, output_len);
			target = find_nearest_boundary(result, target, 10);
			target = avoid_placeholder_overlap(result, target);

			// If we have a following anchor too, make sure we don't overshoot it
			if (next_anchor) {
				const next_pos_in_output = result.indexOf(next_anchor);
				if (next_pos_in_output !== -1 && target > next_pos_in_output) {
					target = next_pos_in_output;
				}
			}

			return target;
		}
	}

	// Try following anchor: measure gap from missing placeholder's END to its START
	if (next_anchor) {
		const my_end_in_input = input_offset + placeholder.length;
		const gap_in_input = next_anchor_offset - my_end_in_input;

		const next_pos_in_output = result.indexOf(next_anchor);
		if (next_pos_in_output !== -1) {

			if (gap_in_input <= 1) {
				// Adjacent → insert right before the anchor
				return next_pos_in_output;
			}

			// Scale the gap proportionally
			const scale = output_len / input_len;
			const gap_in_output = Math.round(gap_in_input * scale);
			let target = next_pos_in_output - gap_in_output;

			// Clamp and snap
			target = Math.max(target, 0);
			target = find_nearest_boundary(result, target, 10);
			target = avoid_placeholder_overlap(result, target);

			return target;
		}
	}

	// No anchors found
	return -1;
}

/**
 * Avoid inserting a placeholder inside an existing [[…]] placeholder.
 *
 * If the given offset falls between a `[[` and its matching `]]` of an
 * existing placeholder, move the insertion point to just after the `]]`.
 *
 * @param {string} text   - The text to check
 * @param {number} offset - Proposed insertion offset
 * @returns {number}      - Adjusted offset (or original if no overlap)
 *
 * @example
 *   // offset 12 falls inside [[786]]
 *   // text: "some text [[786]] more"
 *   //              0123456789012345678
 *   // offset 12 is at '7' inside [[786]]
 *   // → returns 16 (just after ']]')
 */
function avoid_placeholder_overlap(text, offset) {
	const len = text.length;
	if (offset < 0 || offset > len) return offset;

	// Scan backwards from offset to find the nearest unopened '[['
	let open_pos = -1;
	let depth = 0;
	for (let i = offset - 1; i >= 1; i--) {
		if (text[i - 1] === ']' && text[i] === ']') depth++;
		if (text[i - 1] === '[' && text[i] === '[') {
			if (depth > 0) {
				depth--;
				i--; // skip the second '[' so we don't re-match it
			} else {
				open_pos = i - 1;
				break;
			}
		}
	}

	// If we found an unmatched '[[' before offset, check if it starts a [[…]] pattern
	if (open_pos !== -1) {
		const rest = text.slice(open_pos);
		const match = rest.match(/^\[\[\d+\]\]/);
		if (match) {
			// offset is inside this placeholder — move to just after its closing ']]'
			return open_pos + match[0].length;
		}
	}

	return offset;
}

/**
 * Find the nearest word-boundary character (space, '<', or '>') to a
 * target offset, searching outward within a maximum radius.
 *
 * This avoids inserting a placeholder in the middle of a word or
 * inside an HTML tag name.
 *
 * @param {string} text          - The text to search within
 * @param {number} target        - Desired character offset
 * @param {number} max_radius    - Maximum distance to search (default 10)
 * @returns {number}             - Snapped offset (clamped to text length)
 */
function find_nearest_boundary(text, target, max_radius = 10) {
	const len = text.length;
	const clamped = Math.min(Math.max(target, 0), len);

	// If already at a boundary, use it
	if (clamped === 0 || clamped === len) return clamped;
	const ch = text[clamped];
	if (ch === ' ' || ch === '<' || ch === '>' || ch === '\n' || ch === '[') return clamped;

	// Search outward: ±1, ±2, … up to max_radius
	for (let d = 1; d <= max_radius; d++) {
		// Check left first (prefer inserting before a word rather than after)
		const left = clamped - d;
		if (left >= 0) {
			const lc = text[left];
			if (lc === ' ' || lc === '<' || lc === '>' || lc === '\n' || lc === '[') return left + 1;
		}
		// Then check right
		const right = clamped + d;
		if (right < len) {
			const rc = text[right];
			if (rc === ' ' || rc === '<' || rc === '>' || rc === '\n' || rc === '[') return right;
		}
	}

	// No boundary found within radius — use raw offset
	return clamped;
}

/**
 * Wrap a promise with a timeout.
 * @param {Promise} promise
 * @param {number}  ms    - Timeout in milliseconds
 * @param {string}  label - Description for the timeout error message
 * @returns {Promise}
 */
function with_timeout(promise, ms, label) {
	let timerId;
	const timer = new Promise((_, reject) => {
		timerId = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
	});
	return Promise.race([promise, timer]).finally(() => clearTimeout(timerId));
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
			try {
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
			} catch (init_error) {
				// If WebGPU fails (OOM, buffer mapping error, etc.), auto-fallback to WASM/CPU
				const is_gpu_error = device === 'webgpu' && (
					/init|webgpu|gpu|buffer|mapping|allocation|out of memory/i.test(
						init_error?.message || init_error?.name || ''
					)
				);
				if (is_gpu_error) {
					self.postMessage({
						status : 'init',
						data   : {
							progress : 0,
							status   : 'fallback_to_wasm',
							device   : 'wasm',
							file     : null
						}
					});
					cached_translator = await pipeline('text-generation', MODEL_ID, {
						device : 'wasm',
						dtype  : 'q4',
						progress_callback: ({ progress, status, file }) => {
							self.postMessage({
								status : 'init',
								data   : { progress, status, device: 'wasm', file }
							});
						}
					});
				} else {
					throw init_error;
				}
			}
		}

		const blocks        = options.blocks;
		const total_blocks  = blocks.length;
		const result        = {
			accumulated_text : '',
			remaining        : total_blocks
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

			try {

				const translated = await with_timeout(
					translate_text(
						cached_translator,
						blocks[i],
						source_lang_code,
						target_lang_code
					),
					BLOCK_TIMEOUT_MS,
					`Block ${i + 1}/${total_blocks}`
				);

				// Post-validation: detect missing placeholders and retry up to 3 times
				let   final_text = translated;
				const detection  = detect_missing_placeholders(blocks[i], translated);

				if (detection.has_missing) {

					const MAX_RETRIES = 3;

					// Accumulate every failed attempt so each retry sees the full
					// mistake history and avoids repeating the same errors
					const failed_attempts = [{ text: translated, missing: detection.missing }];

					console.warn(
						`[browser_transformer] Block ${i + 1}: placeholders missing (${detection.missing.join(', ')}). ` +
						`Retrying up to ${MAX_RETRIES} times with corrective prompt.`
					);

					for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {

						if (cancelled) break;

						try {
							const retry_translated = await with_timeout(
								translate_text(
									cached_translator,
									blocks[i],
									source_lang_code,
									target_lang_code,
									{ failed_attempts }
								),
								BLOCK_TIMEOUT_MS,
								`Block ${i + 1}/${total_blocks} (retry ${attempt}/${MAX_RETRIES})`
							);

							const retry_detection = detect_missing_placeholders(blocks[i], retry_translated);

							if (!retry_detection.has_missing) {
								// Retry succeeded — all placeholders present
								console.log(`[browser_transformer] Block ${i + 1}: retry ${attempt} succeeded, all placeholders preserved.`);
								final_text = retry_translated;
								break;
							}

							// Still missing — record this attempt and try again
							failed_attempts.push({ text: retry_translated, missing: retry_detection.missing });

							if (attempt < MAX_RETRIES) {
								console.warn(
									`[browser_transformer] Block ${i + 1}: retry ${attempt} still missing placeholders (${retry_detection.missing.join(', ')}). ` +
									`Retrying again.`
								);
							} else {
								// All retries exhausted — fall back to heuristic restoration
								console.warn(
									`[browser_transformer] Block ${i + 1}: all ${MAX_RETRIES} retries exhausted, still missing placeholders (${retry_detection.missing.join(', ')}). ` +
									`Falling back to heuristic restoration.`
								);
								final_text = restore_missing_placeholders(blocks[i], retry_translated, retry_detection.missing);
							}

						} catch (retry_err) {
							// Retry itself failed (timeout/error) — fall back to heuristic on last attempt
							const last = failed_attempts[failed_attempts.length - 1];
							console.warn(
								`[browser_transformer] Block ${i + 1}: retry ${attempt} failed (${retry_err?.message || retry_err}). ` +
								`Falling back to heuristic restoration.`
							);
							final_text = restore_missing_placeholders(blocks[i], last.text, last.missing);
							break;
						}
					}
				}

				result.accumulated_text += (result.accumulated_text ? '\n\n' : '') + final_text;
				result.remaining = total_blocks - (i + 1);

				// ── 3. Stream partial result to the main thread ────────
				// The UI layer uses `remaining` to show progress like "3 of 8 blocks done"
				self.postMessage({
					status : 'on_chunk',
					data   : result
				});

			} catch (err) {

				// Non-fatal per-block error — report and continue with remaining blocks
				console.warn(`[browser_transformer] Block ${i + 1} failed: ${err?.message || err}`);

				self.postMessage({
					status : 'on_block_error',
					data   : {
						message          : err?.message || String(err),
						block            : i + 1,
						total            : total_blocks,
						accumulated_text : result.accumulated_text,
						remaining        : total_blocks - (i + 1)
					}
				});

				// Skip this block — accumulated_text stays unchanged
				result.remaining = total_blocks - (i + 1);
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
 * @param {string}   text             - Markdown block to translate (may contain **, *, #, raw HTML)
 * @param {string}   sourceLangCode   - Source language locale code (e.g. 'en')
 * @param {string}   targetLangCode   - Target language locale code (e.g. 'es')
 * @param {Object|null} retryContext  - When non-null, sends a corrective retry prompt
 *   built from the full history of failed attempts:
 *   { failed_attempts: Array<{ text: string, missing: string[] }> }
 * @returns {string}                  - Model response with translated text
 *
 * Implementation notes:
 *
 *   System instruction:
 *     TranslateGemma's chat template does not accept a separate 'system' role —
 *     the conversation must start with 'user'. Therefore the preservation
 *     instruction is prepended to the user text content with a blank-line
 *     separator so the model treats it as a task description.
 *
 *   Markdown preservation:
 *     The prompt tells the model to keep all markdown syntax and raw HTML tags intact.
 *     See also: tool_lang.js → html_to_markdown / markdown_to_html for the round-trip.
 *
 *   Deterministic output:
 *     `do_sample: false` disables temperature sampling, making the model
 *     behave greedily — the same input always produces the same output.
 *     This avoids random tag mutations across runs.
 */
async function translate_text(translator, text, sourceLangCode, targetLangCode, retryContext=null) {

	let prompt;

	if (retryContext) {
		// ── Retry prompt: include the full history of failed attempts ──
		const { failed_attempts } = retryContext;
		const latest_missing = failed_attempts[failed_attempts.length - 1].missing;

		const history_lines = [];
		failed_attempts.forEach((att, idx) => {
			history_lines.push(`Attempt ${idx + 1} (incorrect) — missing: ${att.missing.join(', ')}`);
			history_lines.push(att.text);
			history_lines.push(``);
		});

		prompt = [
			`Translate from ${sourceLangCode} to ${targetLangCode}.`,
			`CORRECTION REQUEST: Your previous translation(s) were incorrect.`,
			`The following placeholders are STILL MISSING from your output: ${latest_missing.join(', ')}`,
			`You MUST include every single one of them EXACTLY as shown.`,
			``,
			`Your previous (incorrect) translation attempts:`,
			...history_lines,
			`RULES:`,
			`1. The text is in MARKDOWN format. Keep all markdown syntax (**, *, #, __, etc.) unchanged.`,
			`2. Keep ALL placeholders like [[18]], [[1]], [[5]], [[424]], etc. EXACTLY as-is — never modify, translate, or remove them.`,
			`3. The missing placeholders ${latest_missing.join(', ')} MUST appear in your output.`,
			`4. Preserve any raw HTML tags (e.g. <img>, <span>) exactly as they appear.`,
			`5. Do not add or remove blank lines.`,
			`6. Verify every placeholder [[…]] from the input appears IDENTICALLY in your output.`,
			``,
			`Text to translate:`,
			text
		].join('\n');
	} else {
		// ── First-attempt prompt ──────────────────────────────────────────
		prompt = [
			`Translate from ${sourceLangCode} to ${targetLangCode}.`,
			`RULES:`,
			`1. The text is in MARKDOWN format. Keep all markdown syntax (**, *, #, __, etc.) unchanged.`,
			`2. Keep all placeholders like [[18]], [[1]], [[5]], [[424]], etc. EXACTLY as-is — never modify, translate, or remove them.`,
			`3. Preserve any raw HTML tags (e.g. <img>, <span>) exactly as they appear.`,
			`4. Do not add or remove blank lines.`,
			`5. Ensure the translated text was done with the target language: ${targetLangCode}`,
			`6. Verify every placeholder [[…]] from the input appears IDENTICALLY in your output.`,
			``,
			`Examples:`,
			`Input:  "**Hola[[5]]** ¿como estás[[2]][[3]]?"`,
			`Correct output: "**Hello[[5]]** how are you[[2]][[3]]?"`,
			`Wrong output: "Hello[[9]] how are you[[2]]?"`,
			``,
			`Input:  "[[1]][[2]]Gracias por tu[[3]] \"tiempo[[18]]\"[[4]].[[68]][[108]]"`,
			`Correct output: "[[1]][[2]]Thank for your[[3]] \"time[[18]]\"[[4]].[[68]][[108]]"`,
			`Wrong output: "[[1]]Thank for your[[2]][[3]] \"time[[18 ]]\".[ [68]]"`,
			``,
			`Input: "Hello[[1]], welcome!"`,
			`Correct output: "Hola[[1]], ¡bienvenido!"`,
			`Wrong output: "Hola, ¡bienvenido!"`,
			``,
			`Input: "[[1]]Hello, [[2]]welcome! new [[8]]eeerew[[35]]"`,
			`Correct output: "[[1]]Hola, [[2]]¡bienvenido! nuevo [[8]]eeerew[[35]]"`,
			`Wrong output: "Hola, [[2]]¡bienvenido! nuevo texto"`,
			``,
			`Input: "[[36]] Hola [[37]] [[105]]¿como estás? [[52]]"`,
			`Correct output: "[[36]] नमस्ते [[37]] [[105]]तिमीलाई कस्तो छ? [[52]]"`,
			`Wrong output: "[[36] नमस्ते [37]] [[105तिमीलाई कस्तो छ? 52]]"`,
			``,
			`Text to translate:`,
			text
		].join('\n');
	}

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

	const output = await translator(messages, {
		max_new_tokens : MAX_NEW_TOKENS,
		do_sample      : false
	});

	// The model returns the full conversation so far;
	// grab the assistant's last (newly generated) message.
	const generated_text = output[0].generated_text;
	const last_message   = generated_text[generated_text.length - 1];

	return last_message.content;
}


// @license-end