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
*                                    dtype, decode, vad, postprocess } }
*   { action:'abort' }   — stop after the current window and return what is done
*
* MESSAGE PROTOCOL (worker → caller):
*   { status:'init',         data:{ progress, status, device, file } }
*   { status:'plan',         data:{ windows, speech_seconds, duration } }
*   { status:'window_start', data:{ index, total, from, to, done_seconds, speech_seconds } }
*   { status:'partial',      data:{ text } }          live tokens (greedy only)
*   { status:'progress',     data:{ segments, done_seconds, speech_seconds } }
*   { status:'end',          data:{ segments, aborted } }
*   { status:'error',        data:{ message } }
*
* SEGMENT SHAPE returned to the caller: { text, start, end } with times in SECONDS
* from the start of the recording. Formatting (paragraphs, timecode marks) is NOT
* done here — the caller applies lib/paragraphs.js, so the archivist can change
* paragraph rules without re-running the recogniser.
*/

// The ASR runtime. Served from the engine's own client-lib registry
// (/dedalo/lib/transformers/), never from a CDN: an archive may be air-gapped,
// and a request to a third party would leak WHEN a record is transcribed.
import { pipeline, WhisperTextStreamer, env } from '/dedalo/lib/transformers/dist/transformers.js';

import { clean_transcript, is_degenerate, repetition_score } from '../lib/transcript_postprocess.js';
import { plan_windows, total_speech_seconds } from '../lib/vad.js';


/**
* DEFAULT_DECODE
* Decoding parameters, quality-first. Every one of them exists to stop the decoder
* looping; they cost speed and buy correctness, which is the trade this tool wants.
*
*   num_beams            — beam search explores alternatives instead of committing
*                          to the first token; a loop is rarely the best BEAM, so
*                          this alone removes many of them. Greedy (1) is faster
*                          and is what live token streaming requires.
*   repetition_penalty   — down-weights tokens already produced.
*   no_repeat_ngram_size — forbids repeating any n-gram of this length verbatim.
*                          Kept at 4: shorter would forbid ordinary speech
*                          ("no, no, no"), longer would miss short loops.
*   temperature ladder   — retry values for a window that came back degenerate.
*/
export const DEFAULT_DECODE = {
	num_beams				: 4,
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
		self.postMessage({
			status	: 'error',
			data	: { message: (error && error.message) ? error.message : String(error) }
		});
	}
}//end onmessage


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
		// WebGPU can fail late (out of memory, buffer mapping) on machines that
		// advertise it. Slower is a better answer than failed.
		console.warn('[browser_whisper] WebGPU pipeline failed, falling back to WASM:', error);
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
		condition_on_prev_tokens: false
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

		const temperature	= ladder[attempt];
		const segments		= await decode_window( Object.assign({}, params, {
			temperature	: temperature,
			// Only the first, greedy-or-beam attempt streams: a retry would
			// otherwise re-print the same window's text in the status line.
			stream		: attempt===0 && params.stream===true && decode.num_beams<=1
		}));

		const text	= segments.map( segment => segment.text ).join(' ');
		const score	= repetition_score( text );

		if (score<best_score) {
			best		= segments;
			best_score	= score;
		}

		if (!is_degenerate( text )) {
			return segments;
		}
	}

	return best===null ? [] : best;
}//end transcribe_window


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

	const audio			= options.audio || options.audio_file;
	const sample_rate	= options.sample_rate || REQUIRED_SAMPLE_RATE;
	const language		= options.language || 'en';
	const model			= options.model;
	const decode		= Object.assign({}, DEFAULT_DECODE, options.decode || {});

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

	// 4. The deterministic clean-up (loops, boundary duplication, timing repair).
	return clean_transcript( collected, options.postprocess );
}//end transcribe


// @license-end
