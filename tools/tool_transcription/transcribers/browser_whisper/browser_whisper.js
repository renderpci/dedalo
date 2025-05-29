// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


// imports
import { pipeline, WhisperTextStreamer } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';

/**
* TRANSCRIBE
* Use the transformers.js library to create a pipeline with Whisper
* Create a chunk files of 30 seg with stride of 5 to improve the cuts.
* Final chunks are processed to create set the seconds provide by Whisper to tc
* Return the final transcription with correct format to be saved into the component_text_area
* @param object options
* {
* 	self		: object | the instance that call
* 	model		: string | model file to load into the pipeline (Whisper model) compatible with transformers.js
* 	audio_file	: string | URI of the audio_file to be processed
* 	language	: string | tld2 format of the language of the audiovisual
* 	nodes		: object | HTML nodes of user interface to set the status and the text done by the process.
* }
* @return array data
*/
export const transcribe = async function( options ) {

	// sort variables
		const self			= options.self;
		const model			= options.model;
		const audio_file	= options.audio_file;
		const language		= options.language || 'en'; //or 'spanish', 'french', etc.
		const nodes			= options.nodes;
		const device 		= options.device || 'webgpu'; // 'wasm' or 'webgpu'

		const procesing_label = device==='webgpu' ? 'setting_up' : 'procesing';

	// Initialize the Whisper pipeline
		const transcriber = await pipeline('automatic-speech-recognition', model,  {
			device: device,//'webgpu',
			// show the status in the browser
			progress_callback: ({ progress, status, file }) => {
				// set the label for all status as initializing and the ready to Setting_up
				// both labels are translated into the tool config.
				const label = status==='ready'
					? self.get_tool_label( procesing_label )
					: self.get_tool_label( 'initializing' )

				const loaded = (progress)
					? ` : ${parseInt(progress).toString().padStart(2, 0)}%`
					: (status==='ready')
						? ''
						: ' : 00%'
				const procesing = `${label}${loaded}`;
				nodes.status_container.innerHTML = procesing
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
			nodes.status_container.innerHTML = '';
			nodes.status_container.classList.remove('loading_status')
		},
		// every time that a token is ready (as word processed) show it.
		callback_function: (text) => {
			ar_chunks.at(-1).text += text;
			nodes.status_container.innerHTML = ar_chunks.at(-1).text;
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

	// Parse the final dedalo format
		const data = parse_dedalo_format(transcripts)


	return data;
}



/**
* SECONDS_TO_TC
* Transform a float seconds number to time code
* from: 5.6
* to: 00:00:05.600
* @param float total_seconds
* @return striing tc
*/
function seconds_to_tc( total_seconds ) {

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




/**
* parse_DEDALO_FORMAT
* Process the segments into the HTML format supported by Dédalo with the time code tag format
* every segment is enclosed by a paragraph a <p> element
* @param array transcripts
* @return array data
* Dédalo transcription format as HTML:
* <p>
* 	[TC_00:00:05.600_TC] My transcription
* <\p>
*/
function parse_dedalo_format ( transcripts ){

	const transcripts_length = transcripts.length;

	// creating a fragment to storage all nodes
	const fragment = new DocumentFragment();

	for (let i = 0; i < transcripts_length; i++) {
		// create the text node with the transcription
		const current_text_node = document.createTextNode(transcripts[i].dd_format)

		// create the paragraph to enclose the text fragment
		const current_node = document.createElement("p");

		// add the text to the paragraph
		current_node.appendChild(current_text_node)
		// add to the fragment
		fragment.appendChild(current_node)
	}

	// Create a temporary container to insert the fragment and get the final HTML
	const temp_div = document.createElement('div');
	temp_div.appendChild(fragment);

	// create a valid data for the component_text_area
	const data = [ temp_div.innerHTML ]

	return data;
}// end parse_dedalo_format





// @license-end