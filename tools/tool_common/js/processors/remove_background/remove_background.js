// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/


// imports
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.6.3';



/**
* ONMESSAGE
* Init the worker process the e.data contains the options:
* {
*	model		: string | model file to load into the pipeline compatible with transformers.js
*	image_file	: string | a image URL to be processed
*	device		: string | 'wasm' : 'webgpu'
* }
*/
self.onmessage = async (e) => {
	// const t1 = performance.now()

	// options
		const options	= e.data.options // object of options to sent to the function

	// fire function
		const response = await self.background_removal( options )

	self.postMessage({
		status: 'end',
		data: response
	});

}//end onmessage



/**
* BACKGROUND_REMOVAL
* Use the transformers.js library to create a pipeline
* Return the final image with mask data, it needs to be processed to obtain the final data
* @param object options
* {
* 	model		: string | model file to load into the pipeline compatible with transformers.js
* 	image_file	: string | a image URL to be processed
* 	device		: string | 'webgpu' or 'wasm' by default 'webgpu'
* }
* @return array data
*/
self.background_removal = async function( options ) {

		const model			= options.model || 'briaai/RMBG-1.4';
		const image_file	= options.image_file;
		const device 		= options.device || 'webgpu'; // 'wasm' or 'webgpu'


	// Initialize the pipeline
		const segmenter = await pipeline("background-removal", model,{
			device: device,
			dtype : 'fp32'
		});


	// remove background
	const masked_data = await segmenter( image_file );


	return masked_data
}




// @license-end