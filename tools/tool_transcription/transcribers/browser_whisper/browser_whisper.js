// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global self*/
/*eslint no-undef: "error"*/


/**
* BROWSER_WHISPER
* Web Worker that runs speech recognition ENTIRELY IN THE BROWSER via
* Transformers.js and an ONNX Whisper model. The audio never leaves the machine —
* which is the whole point for oral-history interviews holding personal data.
*
* It is always a Worker, never a plain module: audio decoding needs AudioContext
* (main thread only, so the caller decodes and transfers the PCM), and WASM/WebGPU
* inference would otherwise freeze the UI for the length of the recording.
*
* HOW IT TRANSCRIBES (and why it is not the obvious way).
* The obvious way — hand the model the whole recording and let it cut every 30
* seconds with a 5-second overlap — is what produced the repeated words this
* rewrite fixes. Blind cuts land inside words, so the windows must overlap, and
* the overlap gets transcribed twice; and the silence inside those windows is the
* single most reliable trigger of Whisper's repetition loops. Instead:
*
*   1. VAD (lib/vad.js) finds where somebody is actually speaking and plans decode
*      windows that start and end AT PAUSES — no overlap needed, and long silences
*      are never sent to the model at all;
*   2. each window is decoded independently, with anti-loop decoding parameters
*      (see DEFAULT_DECODE) and no conditioning on the previous window, so one
*      looping window cannot poison the next;
*   3. a window whose output still looks like a loop is RETRIED up the temperature
*      ladder — the same fallback reference Whisper implementations use — and the
*      least repetitive attempt wins;
*   4. whatever survives goes through lib/transcript_postprocess.js, the
*      deterministic net for the repetitions no decoding parameter prevents.
*
* MESSAGE PROTOCOL (caller → worker):
*   { action:'transcribe', options:{ audio, sample_rate, language, model, device,
*                                    dtype, decode, vad, postprocess,
*                                    diarize:{ model, tuning } } }
*   { action:'abort' }   — stop after the current window and return what is done
*
* MESSAGE PROTOCOL (worker → caller):
*   { status:'init',             data:{ progress, status, device, file } }
*   { status:'plan',             data:{ windows, speech_seconds, duration } }
*   { status:'window_start',     data:{ index, total, from, to, done_seconds, speech_seconds } }
*   { status:'partial',          data:{ text } }      live tokens (greedy only)
*   { status:'progress',         data:{ segments, done_seconds, speech_seconds } }
*   { status:'diarize_init',     data:{ progress, status, file } }
*   { status:'diarize_progress', data:{ done_seconds, duration } }
*   { status:'diarize_error',    data:{ message } }   best-effort: run continues
*   { status:'end',              data:{ segments, aborted } }
*   { status:'warning',          data:{ phase, label_key, message, detail, count } }   degradation the
*                                 run survived; `count` is present only for a count-bearing warning
*                                 (label_key's text then carries a `{count}` placeholder for the caller
*                                 to fill in), and is `undefined` for every other warning
*   { status:'error',            data:{ message, phase, device, log } }
*
* SEGMENT SHAPE returned to the caller: { text, start, end } with times in SECONDS
* from the start of the recording — plus `speaker` (integer) when speaker
* detection ran (options.diarize, the pyannote segmentation model from the
* install's own store). Formatting (paragraphs, timecode marks, person tags) is
* NOT done here — the caller applies lib/paragraphs.js, so the archivist can
* change paragraph rules or the speaker mapping without re-running the
* recogniser.
*/

// The ASR runtime. Served from the engine's own client-lib registry
// (/dedalo/lib/transformers/), never from a CDN: an archive may be air-gapped,
// and a request to a third party would leak WHEN a record is transcribed.
// AutoProcessor/AutoModelForAudioFrameClassification are the DIARIZATION half:
// the runtime ships the pyannote segmentation model classes natively.
import {
	pipeline,
	WhisperTextStreamer,
	env,
	AutoProcessor,
	AutoModel,
	AutoModelForAudioFrameClassification
} from '/dedalo/lib/transformers/dist/transformers.js';

import { DEFAULT_DIARIZE, assign_speakers_to_segments, cluster_speaker_turns, stitch_diarization_chunks } from '../lib/diarize.js';
import { clean_transcript, has_time_regression, is_degenerate, repetition_score } from '../lib/transcript_postprocess.js';
import { plan_windows, total_speech_seconds } from '../lib/vad.js';


/**
* RUNTIME LOG TAIL.
*
* onnxruntime writes the useful half of its diagnosis to the console and throws a
* vaguer exception: "Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: Failed
* to load model because protobuf parsing failed." is a LOG line, not an Error
* message. Keeping the last few lines means the failure the caller reports can
* name the actual cause instead of "Failed to load model".
*/
const log_tail = [];
const LOG_TAIL_MAX = 12;
for (const level of ['error', 'warn']) {
	const original = console[level].bind( console );
	console[level] = function(...args) {
		try {
			log_tail.push( args.map( arg => (typeof arg==='string' ? arg : String(arg && arg.message ? arg.message : arg)) ).join(' ') );
			if (log_tail.length > LOG_TAIL_MAX) log_tail.shift();
		} catch (capture_error) {
			// The capture must never be why a message is lost.
		}
		original(...args);
	};
}

/** The captured runtime log, newest last. */
const runtime_log = function() {
	return log_tail.join('\n');
}//end runtime_log

// The phase the worker is in, so a failure can say WHERE it happened. Starts
// 'audio': the FIRST work self.transcribe does is validating/decoding the caller's
// PCM and VAD-planning the windows, before any model is touched — a failure there
// reported as phase 'model' would send the archivist to re-download a model that
// was never the problem. classify_failure() gives info.phase PRIORITY over its own
// rule's phase (transcription_report.js), so a stale phase here silently overrides
// otherwise-correct classification.
let current_phase = 'audio';

// The device actually in use (or last attempted), so a terminal failure can name
// it even when the caller didn't pass one explicitly to post_failure. Sourced from
// load_pipeline, which is the only place a device is chosen.
let current_device = '';

// Offsets (seconds) of windows that produced no decodable output THIS RUN. Counted
// here, not posted per window: the panel APPENDS one block per 'warning' message,
// so posting on every skip would fill it with dozens of identical blocks on a
// badly-degrading long interview. self.transcribe posts ONE summarising warning
// after the decode loop, once the count is known.
let skipped_windows = [];

/**
* Post a degradation the run survived. The caller shows it and continues.
* `count` is optional: only the skipped-windows warning carries one, so the
* receiver can substitute it into its label's `{count}` placeholder — a label
* with no placeholder just ignores an extra field.
*/
const post_warning = function( label_key, message, detail, count ) {
	self.postMessage({
		status	: 'warning',
		data	: {
			phase		: current_phase,
			label_key	: label_key,
			message		: message,
			detail		: detail || '',
			count		: typeof count==='number' ? count : undefined
		}
	});
}//end post_warning

/** Post the terminal failure, with everything the classifier needs. Never throws. */
const post_failure = function( error, device ) {
	let message;
	if (error && error.message) {
		message = error.message;
	} else if (typeof error==='string' && error.length>0) {
		message = error;
	} else {
		// Neither an Error with a message nor a non-empty string — a plain object
		// would otherwise stringify to the useless "[object Object]", and an empty
		// ErrorEvent (event.error undefined, event.message '') would otherwise
		// stringify to '' or the literal text "undefined". Both are worse than
		// saying plainly that the message is unknown.
		message = 'Unknown error';
	}
	self.postMessage({
		status	: 'error',
		data	: {
			message	: message,
			phase	: current_phase,
			device	: device || current_device,
			log		: runtime_log()
		}
	});
}//end post_failure


/**
* DEFAULT_DECODE
* Decoding parameters, quality-first. Every one of them exists to stop the decoder
* looping; they cost speed and buy correctness, which is the trade this tool wants.
*
*   num_beams            — MUST STAY 1. Transformers.js' Whisper ASR pipeline does
*                          not support beam search with timestamps: with beams the
*                          `_decode_asr` chunk accumulator receives EMPTY token
*                          lists and the run dies with "token_ids must be a
*                          non-empty array of integers" on the first window
*                          (observed live, 2026-07-28). Anti-loop quality comes
*                          from the penalties below + the temperature retry
*                          ladder + VAD windows — and greedy is what makes live
*                          token streaming possible at all.
*   repetition_penalty   — down-weights tokens already produced.
*   no_repeat_ngram_size — forbids repeating any n-gram of this length verbatim.
*                          Kept at 4: shorter would forbid ordinary speech
*                          ("no, no, no"), longer would miss short loops.
*   temperature ladder   — retry values for a window that came back degenerate.
*/
export const DEFAULT_DECODE = {
	num_beams				: 1,
	repetition_penalty		: 1.15,
	no_repeat_ngram_size	: 4,
	temperature_ladder		: [0.2, 0.4, 0.6, 0.8],
	max_retries				: 3
};


/** Sample rate the caller must resample to — Whisper's only accepted input rate. */
const REQUIRED_SAMPLE_RATE = 16000;

/** Set by the 'abort' message; checked between windows. */
let aborted = false;


/**
* ONMESSAGE
* Entry point. Dispatches on `action` and always answers with exactly one terminal
* message ('end' or 'error'), so the caller's promise can never hang.
*
* @param {MessageEvent} e
* @returns {Promise<void>}
*/
self.onmessage = async (e) => {

	const data = e.data || {};

	// The cancel signal: flip the flag and return. The running window finishes
	// (there is no way to interrupt an inference call) and the loop stops after it,
	// so the user still keeps everything transcribed so far.
	if (data.action==='abort') {
		aborted = true;
		return;
	}

	try {
		const segments = await self.transcribe( data.options || {} );

		self.postMessage({
			status	: 'end',
			data	: {
				segments	: segments,
				aborted		: aborted
			}
		});
	} catch (error) {
		post_failure( error );
	}
}//end onmessage


/**
* The contract this module's header promises — "always answers with exactly one
* terminal message, so the caller's promise can never hang" — was not enforced.
* An ASR runtime that rejects from a promise OUTSIDE the awaited chain never
* reached the try/catch above, the caller's onerror received an empty message, and
* the user saw a button that stopped responding. These two handlers are what make
* the promise true.
*/
self.onunhandledrejection = function(event) {
	event.preventDefault?.();
	post_failure( event.reason );
}

// preventDefault() here is load-bearing, not decoration: without it the browser
// still propagates this exception to the PARENT's `Worker.onerror` after this
// listener runs, so the caller would see the classified 'error' MESSAGE (good)
// immediately followed by the parent's generic onerror handling (empty message,
// "The transcription failed") for the SAME failure — a second, useless report
// appended under the useful one, and delete_audio() run twice. A worker that
// fails to LOAD (bad URL, a syntax error in a module import) never reaches this
// line at all — that failure is still, correctly, the parent onerror's alone.
self.addEventListener('error', function(event){
	event.preventDefault();
	post_failure( event.error || event.message );
});


/**
* RESOLVE_DTYPE
* The quantisation used for the encoder and the decoder.
*
* THIS IS THE SETTING THAT CAUSED THE REPEATED WORDS. The previous code forced a
* 4-bit (`q4`) decoder for every model whose id contained 'large' or 'medium' —
* and 'large' is the shipped default — while 4-bit quantisation of Whisper's
* DECODER is the best-known trigger of repetition loops. The encoder tolerates
* quantisation far better than the decoder, so they are chosen separately, and the
* catalog may override per model.
*
* @param {string} model - model id
* @param {Object} [override] - {encoder_model, decoder_model_merged} from the catalog
* @returns {Object} the Transformers.js dtype map
*/
function resolve_dtype( model, override ) {

	if (override && override.encoder_model && override.decoder_model_merged) {
		return {
			encoder_model			: override.encoder_model,
			decoder_model_merged	: override.decoder_model_merged
		};
	}

	const heavy = model.includes('large') || model.includes('medium');

	return {
		// fp16 halves the encoder's memory at no measurable accuracy cost.
		encoder_model			: heavy ? 'fp16' : 'fp32',
		// q4f16 keeps 4-bit weights but 16-bit activations — the accuracy of the
		// decoder's arithmetic is what a loop is sensitive to.
		decoder_model_merged	: heavy ? 'q4f16' : 'fp32'
	};
}//end resolve_dtype


/**
* CONFIGURE_SOURCES
* Point Transformers.js at THIS INSTALL for everything it loads at runtime: the
* model weights and the onnxruntime WASM binaries.
*
* Out of the box the library fetches both from public CDNs. For an archive that
* runs the recogniser locally *because* the recordings are confidential, that is
* the wrong default twice over: it fails outright with no outbound internet, and
* where there is internet it tells a third party when a record is being worked on.
*
* `model_host` is normally the engine's own model store (/dedalo/ai_models/). An
* install that has internet and prefers on-demand downloads can opt back in to the
* public hub — explicitly, never silently.
*
* @param {Object} [sources]
* @param {string} [sources.model_host] - base URL of the model store
* @param {boolean} [sources.allow_hub] - allow the public model hub as a fallback
* @param {string} [sources.wasm_path] - base URL of the onnxruntime WASM binaries
* @returns {void}
*/
function configure_sources( sources ) {

	const options = sources || {};

	// onnxruntime WASM binaries, served from the client-lib registry.
	const wasm_path = options.wasm_path || '/dedalo/lib/onnxruntime/dist/';
	if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
		env.backends.onnx.wasm.wasmPaths = new URL( wasm_path, self.location.origin ).href;
	}

	if (options.allow_hub===true) {
		// Explicit opt-in: leave the library's own hub defaults in place.
		return;
	}

	// Model weights from this install only. `remoteHost` + `remotePathTemplate`
	// make '<host><model>/…' the resolved URL of every model file.
	env.allowRemoteModels	= true;	// "remote" here means our own origin
	env.allowLocalModels	= false;	// (a browser has no local filesystem anyway)
	env.remoteHost			= new URL( options.model_host || '/dedalo/ai_models/', self.location.origin ).href;
	env.remotePathTemplate	= '{model}/';
	env.useBrowserCache		= true;	// a second transcription must not re-download
}//end configure_sources


/**
* LOAD_PIPELINE
* Build the ASR pipeline, preferring WebGPU and falling back to WASM.
*
* The fallback is automatic on purpose: the device used to be a checkbox the user
* had to understand, and an unchecked box on a machine without WebGPU meant a
* failure instead of a slower run.
*
* @param {string} model
* @param {string} requested_device - 'webgpu' | 'wasm' | 'auto'
* @param {Object} dtype
* @returns {Promise<{transcriber:Object, device:string}>}
*/
async function load_pipeline( model, requested_device, dtype, sources ) {

	configure_sources( sources );

	const progress_callback = ({ progress, status, file }) => {
		self.postMessage({
			status	: 'init',
			data	: {
				progress	: progress,
				status		: status,
				file		: file,
				device		: requested_device
			}
		});
	};

	const webgpu_available = typeof navigator!=='undefined' && navigator.gpu!==undefined;
	const device = (requested_device==='auto' || requested_device===undefined)
		? (webgpu_available ? 'webgpu' : 'wasm')
		: requested_device;

	// Known before the attempt: a failure thrown BY the attempt still names the
	// device it was trying, instead of leaving post_failure's device blank.
	current_device = device;

	try {
		const transcriber = await pipeline('automatic-speech-recognition', model, {
			device				: device,
			dtype				: dtype,
			progress_callback	: progress_callback
		});
		return { transcriber: transcriber, device: device };
	} catch (error) {
		if (device==='wasm') {
			throw error;
		}
		// The fallback exists for DEVICE failures — WebGPU can die late (out of
		// memory, buffer mapping) on machines that advertise it, and slower is a
		// better answer than failed. A failure to FETCH the model is not that: the
		// files are equally absent on WASM, so retrying re-downloads everything
		// that did arrive and then fails identically, doubling the wait before the
		// user sees the real error.
		const message = (error && error.message) ? error.message : String(error);
		if (/could not locate file|failed to fetch|status code 404/i.test(message)) {
			throw error;
		}
		console.warn('[browser_whisper] WebGPU pipeline failed, falling back to WASM:', error);
		post_warning(
			'warning_fallback_cpu',
			'The graphics card could not be used; the transcription continued on the processor.',
			message
		);
		current_device = 'wasm';
		const transcriber = await pipeline('automatic-speech-recognition', model, {
			device				: 'wasm',
			dtype				: dtype,
			progress_callback	: progress_callback
		});
		return { transcriber: transcriber, device: 'wasm' };
	}
}//end load_pipeline


/**
* DECODE_WINDOW
* Run the recogniser over ONE window of audio and return its segments, with
* timestamps already shifted to the whole recording's timeline.
*
* @param {Object} params
* @param {Object} params.transcriber - the loaded pipeline
* @param {Float32Array} params.samples - this window's PCM
* @param {number} params.offset - the window's start, in seconds
* @param {string} params.language
* @param {Object} params.decode - resolved decoding parameters
* @param {number} params.temperature - 0 for the first attempt, then the ladder
* @param {boolean} params.stream - emit live tokens (greedy attempts only)
* @returns {Promise<Array<Object>>} segments {text, start, end}
*/
async function decode_window({ transcriber, samples, offset, language, decode, temperature, stream }) {

	// Live token streaming is only available while decoding greedily — beam search
	// has no single running hypothesis to show. When beams are on, the caller's
	// progress comes from the per-window messages instead.
	const streamer = (stream===true)
		? new WhisperTextStreamer( transcriber.tokenizer, {
			callback_function: (text) => {
				self.postMessage({ status: 'partial', data: { text: text } });
			}
		})
		: undefined;

	const options = {
		language				: language,
		task					: 'transcribe',
		return_timestamps		: true,
		// No chunking here: a window is already shorter than the model's context,
		// and it starts and ends at a pause.
		num_beams				: temperature>0 ? 1 : decode.num_beams,
		do_sample				: temperature>0,
		temperature				: temperature>0 ? temperature : undefined,
		repetition_penalty		: decode.repetition_penalty,
		no_repeat_ngram_size	: decode.no_repeat_ngram_size,
		// Each window is decoded independently: a loop in one cannot seed the next.
		condition_on_prev_tokens: false,
		// The pre-rewrite worker always passed this, against a long-known
		// transformers.js failure in the strict timestamp-sequence decode
		// ("token_ids must be a non-empty array of integers"). Keep it.
		force_full_sequences	: false
	};
	if (streamer!==undefined) {
		options.streamer = streamer;
	}

	const output = await transcriber( samples, options );
	const chunks = Array.isArray(output?.chunks) ? output.chunks : [];

	if (chunks.length===0) {
		const text = (output?.text || '').trim();
		return text===''
			? []
			: [{ text: text, start: offset, end: null }];
	}

	return chunks.map( chunk => {
		const start	= Array.isArray(chunk.timestamp) ? chunk.timestamp[0] : null;
		const end	= Array.isArray(chunk.timestamp) ? chunk.timestamp[1] : null;
		return {
			text	: chunk.text,
			start	: typeof start==='number' ? offset + start : offset,
			end		: typeof end==='number' ? offset + end : null
		};
	});
}//end decode_window


/**
* TRANSCRIBE_WINDOW
* Decode one window, and retry it up the temperature ladder while the result looks
* like a repetition loop. The least repetitive attempt is the one kept.
*
* Retrying rather than dropping matters for an archive: a looped window usually
* still contains real speech, and silently discarding it would leave a hole in the
* transcript that nobody can see.
*
* @param {Object} params - as decode_window, minus `temperature`
* @returns {Promise<Array<Object>>} segments
*/
async function transcribe_window( params ) {

	const decode	= params.decode;
	const ladder	= [0].concat( decode.temperature_ladder.slice(0, decode.max_retries) );

	let best		= null;
	let best_score	= Number.POSITIVE_INFINITY;

	for (let attempt = 0; attempt < ladder.length; attempt++) {

		const temperature = ladder[attempt];

		let segments;
		try {
			segments = await decode_window( Object.assign({}, params, {
				temperature	: temperature,
				// Only the first, greedy attempt streams: a retry would
				// otherwise re-print the same window's text in the status line.
				stream		: attempt===0 && params.stream===true && decode.num_beams<=1
			}));
		} catch (error) {
			// A window the decoder cannot finish (the timestamp-sequence decode
			// is known to throw "token_ids must be a non-empty array" on some
			// audio/model combinations) is a FAILED ATTEMPT, never a dead run:
			// an archivist 80 minutes into an interview keeps those 80 minutes.
			// Retry up the ladder; if every attempt throws, the window is skipped
			// loudly and the recording continues.
			console.warn(
				`[browser_whisper] decode attempt ${attempt + 1}/${ladder.length} failed for window at ${params.offset}s:`,
				(error && error.message) ? error.message : error
			);
			continue;
		}

		const text	= segments.map( segment => segment.text ).join(' ');
		// A timestamp REGRESSION is degeneration too: the model looped and
		// re-emitted earlier content with broken time tokens (backwards
		// timecodes + duplicated sentences in the transcript). Rank such an
		// attempt far below any monotonic one, and retry.
		const regressed	= has_time_regression( segments );
		const score		= repetition_score( text ) + (regressed ? 1 : 0);

		if (score<best_score) {
			best		= segments;
			best_score	= score;
		}

		if (!is_degenerate( text ) && !regressed) {
			return segments;
		}
	}

	if (best===null) {
		// Administrator-visible per window, always. The ARCHIVIST-visible warning is
		// collapsed to one at the end of the run (see self.transcribe) — one block
		// per skipped fragment would fill the panel with identical text on a
		// badly-degrading long interview, and the panel APPENDS, it never merges.
		console.warn(`[browser_whisper] window at ${params.offset}s produced no decodable output — skipped`);
		skipped_windows.push( params.offset );
		return [];
	}
	return best;
}//end transcribe_window


/**
* DIARIZE_AUDIO
* Run the speaker-segmentation model over the whole recording and return
* global speaker turns [{speaker, start, end}].
*
* Runs on WASM deliberately: the model is small (a few MB — SincNet + BiLSTM),
* CPU decodes it far faster than real time, and its recurrent graph is exactly
* the kind WebGPU backends reject with late, confusing errors. The audio is
* decoded in LONG chunks with a conversational overlap; the identity stitching
* and its limits are documented in lib/diarize.js.
*
* @param {Float32Array} audio - mono PCM at 16 kHz (the transcriber's buffer)
* @param {number} sample_rate
* @param {Object} options
* @param {string} options.model - diarization model id from the catalog
* @param {Object} [options.sources] - as configure_sources
* @param {Object} [options.tuning] - DEFAULT_DIARIZE overrides
* @returns {Promise<Array<Object>>} turns
*/
async function diarize_audio( audio, sample_rate, options ) {

	configure_sources( options.sources );

	const tuning		= Object.assign({}, DEFAULT_DIARIZE, options.tuning || {});
	const chunk_len		= Math.max( 1, Math.floor(tuning.chunk_seconds * sample_rate) );
	const overlap_len	= Math.max( 0, Math.floor(tuning.overlap_seconds * sample_rate) );
	const step			= Math.max( 1, chunk_len - overlap_len );

	const progress_callback = ({ progress, status, file }) => {
		self.postMessage({
			status	: 'diarize_init',
			data	: { progress: progress, status: status, file: file }
		});
	};

	const processor	= await AutoProcessor.from_pretrained( options.model, { progress_callback: progress_callback } );
	const model		= await AutoModelForAudioFrameClassification.from_pretrained( options.model, {
		device				: 'wasm',
		dtype				: 'fp32',
		progress_callback	: progress_callback
	});

	const chunks = [];
	for (let from = 0; from < audio.length; from += step) {

		if (aborted===true) {
			break;
		}

		const to		= Math.min( audio.length, from + chunk_len );
		const samples	= audio.subarray( from, to );
		const inputs	= await processor( samples );
		const { logits }= await model( inputs );
		// Per-frame powerset classes → local turns {id, start, end, confidence},
		// times in seconds RELATIVE to this chunk.
		const turns		= processor.post_process_speaker_diarization( logits, samples.length )[0] || [];

		chunks.push({
			offset	: from / sample_rate,
			// The post-processing labels silence as id -1 on some builds; only
			// real speaker ids enter the stitcher.
			turns	: turns.filter( turn => typeof turn.id==='number' ? turn.id>=0 : true )
		});

		self.postMessage({
			status	: 'diarize_progress',
			data	: {
				done_seconds	: Math.min( audio.length, to ) / sample_rate,
				duration		: audio.length / sample_rate
			}
		});

		if (to>=audio.length) {
			break;
		}
	}

	// GLOBAL identity. With the voice-fingerprint model available, every
	// chunk-local speaker is embedded and clustered across the WHOLE
	// recording — the same voice keeps the same speaker id however far apart
	// its turns are. Without it (or if it fails), fall back to co-activity
	// overlap stitching: coherent on short clips, known to fragment voices on
	// long ones (that is exactly what the embedding model exists to fix).
	if (options.embedding_model) {
		try {
			const groups = await embed_speaker_groups( audio, sample_rate, chunks, {
				model	: options.embedding_model,
				tuning	: tuning
			});
			return cluster_speaker_turns( groups, tuning );
		} catch (error) {
			console.warn('[browser_whisper] voice-fingerprint clustering failed — falling back to overlap stitching:', error);
		}
	}
	return stitch_diarization_chunks( chunks, tuning );
}//end diarize_audio


/**
* EMBED_SPEAKER_GROUPS
* One voice fingerprint per CHUNK-LOCAL speaker: the segmentation model is
* consistent within a chunk, so all of a local speaker's turns are one voice —
* its longest clean turn (centered, capped) is fingerprinted once. That keeps
* the embedding count at (chunks × voices), not (turns), and feeds
* cluster_speaker_turns' duration-weighted clustering.
*
* @param {Float32Array} audio - the full recording PCM
* @param {number} sample_rate
* @param {Array<Object>} chunks - [{offset, turns:[{id, start, end}]}] chunk-relative
* @param {Object} options - { model, tuning }
* @returns {Promise<Array<Object>>} groups for cluster_speaker_turns
*/
async function embed_speaker_groups( audio, sample_rate, chunks, options ) {

	const progress_callback = ({ progress, status, file }) => {
		self.postMessage({
			status	: 'diarize_init',
			data	: { progress: progress, status: status, file: file }
		});
	};

	const processor	= await AutoProcessor.from_pretrained( options.model, { progress_callback: progress_callback } );
	const model		= await AutoModel.from_pretrained( options.model, {
		device				: 'wasm',
		dtype				: 'fp32',
		progress_callback	: progress_callback
	});

	const embed = async function( start_seconds, end_seconds ) {
		const max		= options.tuning.embed_max_seconds;
		const duration	= end_seconds - start_seconds;
		// Centered cap: the middle of a long turn is its cleanest speech.
		const from_s	= duration>max ? start_seconds + (duration - max) / 2 : start_seconds;
		const to_s		= duration>max ? from_s + max : end_seconds;
		const from		= Math.max( 0, Math.floor(from_s * sample_rate) );
		const to		= Math.min( audio.length, Math.ceil(to_s * sample_rate) );
		if (to - from < sample_rate * 0.3) {
			return null; // too little audio to fingerprint honestly
		}
		const inputs	= await processor( audio.subarray(from, to) );
		const output	= await model( inputs );
		const tensor	= output.embeddings ?? output.logits ?? Object.values(output)[0];
		return tensor && tensor.data ? Array.from( tensor.data ) : null;
	};

	const groups = [];
	for (let k = 0; k < chunks.length; k++) {

		const chunk		= chunks[k];
		const by_local	= new Map(); // local id -> absolute turns
		for (const turn of chunk.turns) {
			if (typeof turn.start!=='number' || typeof turn.end!=='number' || turn.end<=turn.start) continue;
			const absolute = { start: chunk.offset + turn.start, end: chunk.offset + turn.end };
			const list = by_local.get( turn.id );
			if (list===undefined) by_local.set( turn.id, [absolute] );
			else list.push( absolute );
		}

		for (const turns of by_local.values()) {
			// Fingerprint the LONGEST turn of this local voice.
			const longest = turns.reduce( (best, turn) =>
				(turn.end - turn.start)>(best.end - best.start) ? turn : best );
			let embedding = null;
			try {
				embedding = await embed( longest.start, longest.end );
			} catch (error) {
				console.warn('[browser_whisper] fingerprint failed for turn at', longest.start, error);
			}
			groups.push({ turns: turns, embedding: embedding });
		}

		self.postMessage({
			status	: 'diarize_progress',
			data	: {
				done_seconds	: Math.min( (k + 1) / chunks.length, 1 ) * (audio.length / sample_rate),
				duration		: audio.length / sample_rate
			}
		});
	}

	return groups;
}//end embed_speaker_groups


/**
* TRANSCRIBE
* The pipeline runner: plan windows, decode them one by one, clean up, return.
*
* @param {Object} options
* @param {Float32Array} options.audio - mono PCM at 16 kHz (decoded by the caller)
* @param {number} [options.sample_rate=16000]
* @param {string} [options.language='en'] - ISO 639-1 code
* @param {string} options.model - model id resolved by the catalog
* @param {string} [options.device='auto'] - 'auto' | 'webgpu' | 'wasm'
* @param {Object} [options.dtype] - per-model quantisation override
* @param {Object} [options.decode] - overrides of DEFAULT_DECODE
* @param {Object} [options.vad] - overrides of the VAD defaults
* @param {Object} [options.postprocess] - overrides of the clean-up defaults
* @returns {Promise<Array<Object>>} cleaned segments {text, start, end}
*/
self.transcribe = async function( options ) {

	aborted = false;
	// Reset for this run: a stale phase/device from a PRIOR call (this worker is
	// reused for consecutive transcriptions) must never leak into this one's
	// failures or warnings.
	current_phase = 'audio';
	current_device = '';
	skipped_windows = [];

	const audio			= options.audio || options.audio_file;
	const sample_rate	= options.sample_rate || REQUIRED_SAMPLE_RATE;
	const language		= options.language || 'en';
	const model			= options.model;
	const decode		= Object.assign({}, DEFAULT_DECODE, options.decode || {});
	// Beam search is unsupported by the runtime (see DEFAULT_DECODE): a stale
	// catalog or caller override must degrade to greedy, never kill the run.
	if (decode.num_beams > 1) {
		console.warn('[browser_whisper] num_beams>1 is not supported by the ASR runtime; using greedy decoding');
		decode.num_beams = 1;
	}

	if (!audio || audio.length===0) {
		throw new Error('No audio was supplied to the transcriber');
	}
	if (!model) {
		throw new Error('No model was supplied to the transcriber');
	}

	// 1. Plan the decode windows BEFORE loading the model: planning is cheap, and
	// a recording with no speech at all should not download 1.5 GB of weights.
	const windows		= plan_windows( audio, sample_rate, options.vad );
	const speech_seconds= total_speech_seconds( windows );

	self.postMessage({
		status	: 'plan',
		data	: {
			windows			: windows.length,
			speech_seconds	: speech_seconds,
			duration		: audio.length / sample_rate
		}
	});

	if (windows.length===0) {
		return [];
	}

	// 2. Load the model.
	current_phase = 'model';
	const dtype						= resolve_dtype( model, options.dtype );
	const { transcriber, device }	= await load_pipeline(
		model,
		options.device || 'auto',
		dtype,
		options.sources
	);

	self.postMessage({
		status	: 'init',
		data	: { status: 'ready', device: device, progress: 100 }
	});

	// 3. Decode window by window.
	// A resumed run starts with what the interrupted one already produced, and
	// skips every window that lies entirely behind that point — an archivist whose
	// browser died 50 minutes into an interview does not transcribe it twice.
	const resume_seconds	= typeof options.resume_seconds==='number' ? options.resume_seconds : 0;
	const collected			= Array.isArray(options.resume_segments) ? options.resume_segments.slice() : [];
	let done_seconds		= 0;

	current_phase = 'transcribe';
	for (let index = 0; index < windows.length; index++) {

		if (aborted===true) {
			break;
		}

		const window	= windows[index];

		if (window.end<=resume_seconds) {
			done_seconds += (window.end - window.start);
			continue;
		}
		const from		= Math.max( 0, Math.floor(window.start * sample_rate) );
		const to		= Math.min( audio.length, Math.ceil(window.end * sample_rate) );

		self.postMessage({
			status	: 'window_start',
			data	: {
				index			: index,
				total			: windows.length,
				from			: window.start,
				to				: window.end,
				done_seconds	: done_seconds,
				speech_seconds	: speech_seconds
			}
		});

		const segments = await transcribe_window({
			transcriber	: transcriber,
			samples		: audio.subarray( from, to ),
			offset		: window.start,
			language	: language,
			decode		: decode,
			stream		: true
		});

		collected.push(...segments);
		done_seconds += (window.end - window.start);

		// Incremental result: the caller persists this so a closed tab can resume
		// instead of starting the whole interview again.
		self.postMessage({
			status	: 'progress',
			data	: {
				segments		: clean_transcript( collected, options.postprocess ),
				done_seconds	: done_seconds,
				speech_seconds	: speech_seconds
			}
		});
	}

	// One collapsed warning for every window this run skipped, instead of one per
	// window — see skipped_windows' own comment. Never posted mid-loop: the count
	// is only final once the loop is done.
	if (skipped_windows.length>0) {
		const plural = skipped_windows.length>1;
		post_warning(
			plural ? 'warning_windows_skipped' : 'warning_window_skipped',
			plural
				? `${skipped_windows.length} fragments of the recording could not be transcribed and were skipped.`
				: 'A fragment of the recording could not be transcribed and was skipped.',
			`windows at ${skipped_windows.join('s, ')}s`,
			skipped_windows.length
		);
	}

	// 4. The deterministic clean-up (loops, boundary duplication, timing repair).
	const cleaned = clean_transcript( collected, options.postprocess );

	// 5. Speaker detection (optional): attribute each segment to a speaker turn.
	// STRICTLY BEST-EFFORT — a diarization failure must never cost the
	// transcription: the segments are returned without speakers and the caller
	// is told, loudly, through 'diarize_error'.
	if (options.diarize && options.diarize.model && cleaned.length>0) {
		current_phase = 'speakers';
		try {
			const turns = await diarize_audio( audio, sample_rate, {
				model			: options.diarize.model,
				// voice-fingerprint model (global identity across the whole
				// recording); absent = overlap stitching only
				embedding_model	: options.diarize.embedding_model,
				sources			: options.sources,
				tuning			: options.diarize.tuning
			});
			return assign_speakers_to_segments( cleaned, turns );
		} catch (error) {
			console.warn('[browser_whisper] speaker detection failed — transcript kept without speakers:', error);
			self.postMessage({
				status	: 'diarize_error',
				data	: { message: (error && error.message) ? error.message : String(error) }
			});
		}
	}

	return cleaned;
}//end transcribe


// @license-end
