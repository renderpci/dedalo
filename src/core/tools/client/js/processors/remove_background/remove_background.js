// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global self */
/*eslint no-undef: "error"*/

/**
* REMOVE_BACKGROUND
* Web Worker module that performs AI-based image background removal using the
* HuggingFace Transformers.js library (v3.6.3, loaded from CDN at runtime).
*
* This file runs entirely inside a dedicated Web Worker spawned by
* tool_image_rotation's `automatic_background_removal` method. Because it
* executes off the main thread, it can perform heavy ML inference (model
* download + segmentation) without blocking the UI.
*
* Workflow:
*   1. The main thread creates a Worker from this file and posts a message with
*      an `options` payload (model, image_file, device).
*   2. `self.onmessage` receives the message and delegates to
*      `self.background_removal`, which loads the segmentation pipeline and
*      processes the image.
*   3. On success the worker posts `{ status: 'end', data: masked_data }` back
*      to the main thread, where the caller converts the raw pixel data to a
*      PNG Blob and uploads it to the Dédalo server.
*   4. On failure the worker posts `{ status: 'error', error: <message> }`.
*
* Message protocol (main thread → worker):
*   { options: { model, image_file, device } }
*
* Message protocol (worker → main thread):
*   { status: 'end',   data: Array<RawImage> }  — segmentation succeeded
*   { status: 'error', error: string }           — an exception was thrown
*
* The caller (`tool_image_rotation.automatic_background_removal`) extracts
* `data[0]` (the first RawImage), wraps its `Uint8ClampedArray` pixel buffer
* in an `ImageData`, renders it onto an `OffscreenCanvas`, and converts it to
* a PNG Blob for upload.
*
* (!) This module is loaded as `type: 'module'` by the spawning Worker
* constructor, which means `import` statements work but top-level `await` is
* available only in supported browsers. The CDN `pipeline` import requires a
* network connection on first use; subsequent runs may be served from the
* browser's module cache.
*/

// imports
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.6.3';



/**
* ONMESSAGE
* Entry point for the Web Worker. Receives the options payload from the main
* thread, delegates to `self.background_removal`, and posts the result or any
* error back to the caller.
*
* Expected `e.data` shape:
*   {
*     options: {
*       model      : {string} HuggingFace model id or path, e.g. 'briaai/RMBG-1.4'
*       image_file : {string} URL of the image to process (must be accessible
*                             from the worker's origin or a CORS-enabled URL)
*       device     : {string} Inference backend — 'webgpu' (GPU-accelerated) or
*                             'wasm' (CPU fallback)
*     }
*   }
*
* Posts back one of:
*   { status: 'end',   data: Array<RawImage> }  on success
*   { status: 'error', error: string }           on failure
*
* (!) The commented-out `performance.now()` call was left in place for
* future profiling; do not remove it.
*/
self.onmessage = async (e) => {
	// const t1 = performance.now()

	// options
	const options = e.data.options // object of options to sent to the function

	try {
		// fire function
		const response = await self.background_removal( options )

		self.postMessage({
			status: 'end',
			data: response
		});

	} catch (error) {
		console.error('Error in background_removal worker:', error);
		self.postMessage({
			status: 'error',
			error: error.message || error
		});
	}

}//end onmessage



/**
* BACKGROUND_REMOVAL
* Loads a HuggingFace Transformers.js 'background-removal' pipeline for the
* specified model and runs it against the supplied image URL. Returns the raw
* segmentation output, which the caller must post-process into a usable image.
*
* The pipeline is created fresh on every call (no instance caching). The
* `dtype: 'fp32'` setting requests 32-bit floating-point precision for the
* inference run, which is the safest default across both WebGPU and WASM
* backends.
*
* The return value (`masked_data`) is whatever the Transformers.js pipeline
* yields for the 'background-removal' task — in practice an Array containing
* one `RawImage`-like object with the properties:
*   { data: Uint8ClampedArray, width: number, height: number }
*
* The caller (`tool_image_rotation.automatic_background_removal`) accesses
* `masked_data[0]` to obtain the first (and typically only) result.
*
* @param {Object} options - Configuration for the removal operation
* @param {string} [options.model='briaai/RMBG-1.4'] - HuggingFace model id or
*   path; must be a model that is compatible with the Transformers.js
*   'background-removal' task
* @param {string} options.image_file - URL of the source image to process;
*   must be reachable from the worker context (same-origin or CORS-enabled)
* @param {string} [options.device='webgpu'] - Inference backend: 'webgpu' for
*   GPU-accelerated inference (preferred), 'wasm' for CPU-only fallback
* @returns {Promise<Array>} Resolves with the raw segmentation output array
*   produced by the Transformers.js pipeline (typically one RawImage entry)
* @throws {Error} Propagates any pipeline initialisation or inference error
*   to the `onmessage` catch block, which forwards it to the main thread as a
*   `{ status: 'error' }` message
*/
self.background_removal = async function( options ) {

	const model			= options.model || 'briaai/RMBG-1.4';
	const image_file	= options.image_file;
	const device 		= options.device || 'webgpu'; // 'wasm' or 'webgpu'

	// Initialize the pipeline
	// (!) A new pipeline instance is constructed on each invocation; there is no
	// cross-call caching. Model weights are fetched from the CDN or browser cache.
	const segmenter = await pipeline("background-removal", model,{
		device : device,
		dtype  : 'fp32'
	});

	// remove background
	// The segmenter call is the computationally expensive step; it may take several
	// seconds depending on model size, device capability, and image resolution.
	const masked_data = await segmenter( image_file );


	return masked_data
}//end background_removal



// @license-end