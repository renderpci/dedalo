// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


// imports
import { pipeline, WhisperTextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';


/**
* ONMESSAGE
* Init the worker process the e.data contains the options:
* {
* 	audio_file	: float32Array or string with the URI (don't use the URI in worker!)
*	language	: string | tld2 format of the language of the audiovisual
*	model		: string | model file to load into the pipeline (Whisper model) compatible with transformers.js
*	device		: string | 'wasm' : 'webgpu'
* }
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
* Use the transformers.js library to create a pipeline with Whisper
* Create a chunk files of 30 seg with stride of 5 to improve the cuts.
* Final chunks are processed to create set the seconds provide by Whisper to tc
* Return the final transcription with correct format to be saved into the component_text_area
* @param object options
* {
* 	model		: string | model file to load into the pipeline (Whisper model) compatible with transformers.js
* 	audio_file	: string | as worker Float32Array and module URI of the audio_file to be processed
* 	language	: string | tld2 format of the language of the audiovisual
* 	device		: string | 'webgpu' or 'wasm' by default 'webgpu'
* }
* @return array data
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
* Transform a float seconds number to time code
* from: 5.6
* to: 00:00:05.600
* @param float total_seconds
* @return striing tc
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