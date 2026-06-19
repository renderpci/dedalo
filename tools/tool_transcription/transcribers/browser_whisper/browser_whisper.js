// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


/**
* BROWSER_WHISPER
* Web Worker module that runs an in-browser automatic speech recognition (ASR)
* pipeline using Hugging Face Transformers.js and a Whisper ONNX model.
*
* This file is always loaded as a Web Worker (never as a plain ES module in the
* main thread) because:
*   - AudioContext / audio decoding is done on the caller side and the resulting
*     raw Float32Array is transferred via postMessage.
*   - Long-running WASM/WebGPU inference blocks the main thread; isolating it in
*     a Worker keeps the UI responsive.
*
* Message protocol (caller → worker):
*   postMessage({ options: { model, audio_file, language, device } })
*
* Message protocol (worker → caller):
*   { status: 'init',              data: { progress, status, device } }
*   { status: 'on_chunk_start:',   data: '' }
*   { status: 'callback_function', data: <partial transcript string> }
*   { status: 'end',               data: <Array of transcript segment objects> }
*
* Transcript segment shape (element of the returned array):
*   {
*     text     : string,    // raw recognised text for the segment
*     start    : string,    // timecode 'HH:MM:SS.mmm'
*     end      : string,    // timecode 'HH:MM:SS.mmm'
*     dd_format: string     // Dédalo TC-tagged string '[TC_HH:MM:SS.mmm_TC]text'
*   }
*
* Exports (on self):
*   self.onmessage       — entry point; dispatches to self.transcribe
*   self.transcribe      — ASR pipeline runner
*   self.seconds_to_tc   — seconds→timecode formatter
*/

// imports
import { pipeline, WhisperTextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';


/**
* ONMESSAGE
* Entry-point handler for messages sent by the caller (main thread).
* Reads `e.data.options`, delegates to `self.transcribe`, then posts the
* final result back as `{ status: 'end', data: <transcripts array> }`.
*
* `e.data` shape:
* {
*   options: {
*     audio_file : {Float32Array} — raw 16 kHz mono PCM (decoded on the caller side)
*     language   : {string}       — BCP-47 / tld2 code, e.g. 'en', 'es', 'fr'
*     model      : {string}       — HuggingFace model ID compatible with Transformers.js
*     device     : {string}       — 'webgpu' (default) or 'wasm'
*   }
* }
*
* (!) The caller must decode the audio file to a Float32Array BEFORE posting it
* to the worker because AudioContext is not available inside a Worker scope.
*
* @param {MessageEvent} e - Worker message event
* @returns {Promise<void>}
*/
self.onmessage = async (e) => {
	// const t1 = performance.now()

	// options
		const options	= e.data.options // object of options to sent to the function

	// fire function
		const response = await self.transcribe( options )

	self.postMessage({
		status: 'end',
		data: response
	});
}//end onmessage



/**
* TRANSCRIBE
* Builds a Transformers.js Whisper ASR pipeline, runs it over the supplied
* Float32Array audio, and returns a fully annotated transcript array.
*
* Pipeline configuration:
*   - dtype: large/medium models use fp16 encoder + q4 merged decoder (memory
*     saving); smaller models use fp32 throughout for accuracy.
*   - Sliding-window chunking: 30-second chunks with 5-second stride overlap
*     so words cut at chunk boundaries are recovered from the overlapping region.
*   - Greedy decoding (top_k=0, do_sample=false) for deterministic output.
*   - return_timestamps:true forces Whisper to emit per-segment start/end times.
*
* During processing the function streams intermediate results back via
* postMessage so the UI can show live progress (see `streamer` callbacks).
*
* @param {Object} options
* @param {string} options.model       - HuggingFace model ID (e.g. 'onnx-community/whisper-large-v3-ONNX')
* @param {Float32Array} options.audio_file - 16 kHz mono PCM audio samples
* @param {string} [options.language='en'] - tld2 language code for the audio
* @param {string} [options.device='webgpu'] - inference backend; 'webgpu' or 'wasm'
* @returns {Promise<Array<{text:string, start:string, end:string, dd_format:string}>>}
*/
self.transcribe = async function( options ) {

	// sort variables
		const model			= options.model;
		const audio_file	= options.audio_file;
		const language		= options.language || 'en'; //or 'spanish', 'french', etc.
		const device 		= options.device || 'webgpu'; // 'wasm' or 'webgpu'

	// Initialize the Whisper pipeline
		const transcriber = await pipeline('automatic-speech-recognition', model,  {
			device: device,//'webgpu',
			dtype: {
				encoder_model:
					( model.includes('large') || model.includes('medium') )
						? "fp16"
						: "fp32",
				decoder_model_merged:
					( model.includes('large') || model.includes('medium') )
						? 'q4'
						: 'fp32'
			},

			// show the status in the browser
			progress_callback: ({ progress, status, file }) => {
				self.postMessage({
					status: 'init',
					data: {
						progress,
						status,
						device
					}
				});
			}
		});

	// cut the audio file to be processed
	const chunk_length_s	= 30;
	// overlapping between audio files (improve the result of the transcription when the chunk cut in middle of word)
	const stride_length_s	= 5;
	// every chunk is a object with the text
	const ar_chunks = [];
	// create the Text processor for Whisper (streamer)
	// WhisperTextStreamer emits decoded token strings incrementally so the UI can
	// display partial results while inference is still running.
	const streamer = new WhisperTextStreamer(transcriber.tokenizer, {
		// when the chunk start empty its text
		on_chunk_start: (chunkIndex) => {
			ar_chunks.push({
				text	: ""
			})

			self.postMessage({
				status: 'on_chunk_start:',
				data: ''
			});
		},
		// every time that a token is ready (as word processed) show it.
		callback_function: (text) => {
			const chunk_text = ar_chunks.at(-1).text += text;

			self.postMessage({
				status: 'callback_function',
				data: chunk_text
			});
			// console.log("text:",ar_chunks.at(-1).text);
		},
		// token_callback_function: (token) => {
		//   // console.log(`Generated token: ${token}`);
		// },
		// on_chunk_end: (chunkIndex) => {
		// 	 const current = ar_chunks.at(-1);

		// 	 current.end = chunkIndex + current.offset

		// 	 console.log("text:",ar_chunks.at(-1).text);
		// },
		// on_finalize: () => {
		// 	nodes.status_container.innerHTML = 'Transcription finalized.';
		// 	console.log('Transcription finalized.');
		// }
	 });

	// Final processed chunks
	// Every chunk is a object with the text and the start and end time in seconds
	const transcripts = [];
	const { chunks } = await transcriber( audio_file, {

		// Greedy
			top_k		: 0, //The number of highest probability vocabulary tokens to keep for top-k-filtering.
			do_sample	: false, // Whether or not to use sampling ; use greedy decoding otherwise.

		// Sliding window
			chunk_length_s	: 30, // set the chunk length
			stride_length_s	: 5, // set the overlapping between chunks (better when the chunk cut in middle of phrase)

		// Language and task
			language	: language,
			task		: 'transcribe', // or 'translate' (to English)

		// Return timestamps
			return_timestamps		: true,
			force_full_sequences	: false,

		// control the process
			streamer : streamer

	});

	// Add global time offset to each segment
	// segment.timestamp is [startSeconds, endSeconds] as returned by Whisper.
	// Each segment is mapped to the Dédalo dd_format string that component_text_area
	// understands: '[TC_HH:MM:SS.mmm_TC]text'.
		const timed_chunks = chunks.map(segment => ({
			text		: segment.text,
			start		: seconds_to_tc (segment.timestamp[0]),
			end			: seconds_to_tc (segment.timestamp[1]),
			dd_format	: `[TC_${seconds_to_tc(segment.timestamp[0])}_TC]${segment.text}`
		}));

	// Insert the chunk with correct time code into the transcripts
		transcripts.push(...timed_chunks);

	return transcripts;
}



/**
* SECONDS_TO_TC
* Converts a floating-point seconds value (as returned by Whisper's timestamp
* output) into a Dédalo timecode string with millisecond precision.
*
* Example:
*   seconds_to_tc(5.6)    → '00:00:05.600'
*   seconds_to_tc(3661.5) → '01:01:01.500'
*
* (!) `total_seconds` may be null/undefined for the last chunk's end timestamp
* when Whisper cannot determine the end of audio; callers should guard for that
* case if they need a strict string.
*
* @param {number} total_seconds - Duration in seconds (may include fractional part)
* @returns {string} Timecode string in 'HH:MM:SS.mmm' format
*/
self.seconds_to_tc = function( total_seconds ) {

	const hours			= Math.floor(total_seconds / 3600);
	const minutes		= Math.floor((total_seconds % 3600) / 60);
	const seconds		= Math.floor(total_seconds % 60);
	const milliseconds	= Math.round((total_seconds % 1) * 1000);

	// add 0 to the value from 2 to 02
	const pad = (num, length = 2) => num.toString().padStart(length, '0');

	// set the time code format with semicolon between values as 01:02:05.546
	const tc = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`

	return tc;
}//end seconds_to_tc




// @license-end
