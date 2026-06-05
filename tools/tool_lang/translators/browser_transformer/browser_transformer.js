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
 * Validate that every placeholder from the input text is present
 * in the translated output. Attempt automatic restoration for
 * missing or mutated placeholders using offset-based positioning.
 *
 * WHY: The main thread (tool_lang.js) replaces Dédalo tags like
 * [TC_00:01:25_TC], [index-n-123-data:…:data], [svg-…], etc. with
 * opaque placeholders [[1]], [[2]], [[3]]… before sending blocks to this
 * worker. The prompt instructs the model to keep them verbatim, but LLMs
 * occasionally drop, reorder, or mutate them (e.g. [[5]] → [5] or [[ 5]]).
 * A single lost placeholder breaks the round-trip: restore_placeholders()
 * on the main thread would leave that tag permanently missing from the
 * final HTML, corrupting the record. This function is a defence-in-depth
 * check that catches such errors immediately and attempts a best-effort
 * restoration so the translation can still be used.
 *
 * RESTORATION STRATEGY (two-pass):
 *
 *   Strategy 1 — Anchor + relative-gap positioning (preferred):
 *     For each missing placeholder, find the nearest present neighbor
 *     in the input (preceding or following). Measure the text gap
 *     between them in the input, then position the missing one at the
 *     same relative distance from the anchor in the output:
 *       - Gap = 0 (adjacent, e.g. [[34]][[25]]) → insert right next to anchor
 *       - Gap > 0 (separated by text) → scale gap by output/input ratio,
 *         snap to word boundary, and insert there
 *     This handles both clustered and spaced-out placeholders accurately.
 *
 *   Strategy 2 — Absolute offset positioning (fallback):
 *     When no anchor exists, use the missing placeholder's character
 *     offset from the text start, proportionally scaled.
 *
 *   Placeholders are inserted in reverse offset order so earlier
 *   insertions don't shift the positions of later ones.
 *
 * @param {string} input_text    - Original text sent to the model (with placeholders)
 * @param {string} output_text   - Model's translated text (may have lost placeholders)
 * @returns {string}             - Output text with placeholders restored (or unchanged)
 *
 * @example
 *   // All placeholders preserved — no change
 *   validate_placeholders(
 *     '<p>Hello[[1]] world[[2]]</p>',
 *     '<p>Hola[[1]] mundo[[2]]</p>'
 *   )
 *   // → '<p>Hola[[1]] mundo[[2]]</p>'
 *
 * @example
 *   // [[3]] dropped — raw offset restoration (similar length)
 *   // Input offset of [[3]]: 18 (after "Thanks for your")
 *   // Output nearest space to offset 18: after "su" → insert there
 *   validate_placeholders(
 *     '<p>Thanks for your[[3]] time. Regards</p>',
 *     '<p>Gracias por su tiempo. Saludos</p>'
 *   )
 *   // → '<p>Gracias por su[[3]] tiempo. Saludos</p>'
 *
 * @example
 *   // Proportional offset (output much longer than input)
 *   validate_placeholders(
 *     'Hello[[1]] world',
 *     'Bonjour le monde magnifique'
 *   )
 *   // [[1]] at offset 5/16 → proportional target ~5/16*27 ≈ 8
 *   // → 'Bonjour [[1]]le monde magnifique'
 *
 * @example
 *   // Placeholder mutated: [[3]] → [3] — treated as missing, restored
 *   validate_placeholders(
 *     '<p>Text[[3]]</p>',
 *     '<p>Texto[3]</p>'
 *   )
 *   // → '<p>Texto[3][[3]]</p>'  (mutated [3] remains, [[3]] re-added)
 */
function validate_placeholders(input_text, output_text) {
	const input_ph  = extract_placeholders(input_text);
	const output_ph = extract_placeholders(output_text);

	if (input_ph.length === 0) return output_text;

	const output_set = new Set(output_ph);
	const missing    = input_ph.filter(p => !output_set.has(p));

	if (missing.length === 0) return output_text;

	console.warn(
		`[browser_transformer] Placeholders missing from translation: ${missing.join(', ')}. ` +
		`Attempting restoration.`
	);

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
		// Find the nearest present neighbor in the input, then use the
		// text gap between them to position the missing placeholder
		// relative to that anchor in the output.
		//   - Gap = 0 (adjacent) → insert right next to anchor
		//   - Gap > 0 (separated by text) → insert at proportional distance
		const insert_pos = find_anchor_gap_position(
			placeholder, input_offset, input_ordered,
			input_text, input_len, output_set, result
		);

		if (insert_pos !== -1) {
			result = result.slice(0, insert_pos) + placeholder + result.slice(insert_pos);
			continue;
		}

		// ── Strategy 2: Absolute offset positioning (fallback) ────────
		// No anchor found — use hybrid offset heuristic from text start
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
	if (ch === ' ' || ch === '<' || ch === '>') return clamped;

	// Search outward: ±1, ±2, … up to max_radius
	for (let d = 1; d <= max_radius; d++) {
		// Check left first (prefer inserting before a word rather than after)
		const left = clamped - d;
		if (left >= 0) {
			const lc = text[left];
			if (lc === ' ' || lc === '<' || lc === '>') return left + 1;
		}
		// Then check right
		const right = clamped + d;
		if (right < len) {
			const rc = text[right];
			if (rc === ' ' || rc === '<' || rc === '>') return right;
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
	const timer = new Promise((_, reject) =>
		setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
	);
	return Promise.race([promise, timer]);
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

				// Post-validation: ensure placeholders survived translation
				const validated = validate_placeholders(blocks[i], translated);

				result.accumulated_text += validated;
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