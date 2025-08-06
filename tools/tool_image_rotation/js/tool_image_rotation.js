// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import { clone, dd_console } from '../../../core/common/js/utils/index.js'
	import { data_manager } from '../../../core/common/js/data_manager.js'
	import { common, create_source } from '../../../core/common/js/common.js'
	import { tool_common } from '../../tool_common/js/tool_common.js'
	import { render_tool_image_rotation } from './render_tool_image_rotation.js' // self tool rendered (called from render common)
	import { upload } from '../../../core/services/service_upload/js/service_upload.js'
	import { process_uploaded_file } from '../../tool_upload/js/tool_upload.js'


/**
* TOOL_IMAGE_ROTATION
* Tool to make interesting things
*/
export const tool_image_rotation = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_image_rotation.prototype.render	= tool_common.prototype.render
	tool_image_rotation.prototype.destroy	= common.prototype.destroy
	tool_image_rotation.prototype.refresh	= common.prototype.refresh
	tool_image_rotation.prototype.edit		= render_tool_image_rotation.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_image_rotation.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return bool
*/
tool_image_rotation.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
		// main_element
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom




/**
* APPLY_ROTATION
* 	rotate all quality images with the value set by user in degrees
* @param object options
* {
* 	rotation_degrees: float like '64.8'
* 	background_color: string like '#ffffff'
* 	alpha: bool
* }
* @return promise > bool
*/
tool_image_rotation.prototype.apply_rotation = function(options) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	const rotation_degrees	= options.rotation_degrees
	const background_color	= options.background_color
	const alpha				= options.alpha
	const rotation_mode		= options.rotation_mode
	const crop_area			= options.crop_area

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'apply_rotation')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo				: self.main_element.tipo,
				section_tipo		: self.main_element.section_tipo,
				section_id			: self.main_element.section_id,
				rotation_degrees	: rotation_degrees,
				background_color	: background_color,
				rotation_mode 		: rotation_mode,
				alpha				: alpha,
				crop_area			: crop_area,
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> apply_rotation API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end apply_rotation



/**
* AUTOMATIC_BACKGROUND_REMOVAL
* Create a transformer pipeline to remove the image background
* using a browser WASM and save the resulting value
* @param object options
* {
* 	self_caller			: object, //the component_image instance
* 	engine				: string // engine to be used as 'briaai/RMBG-1.4'
* 	image				: string // the URK of the image to be used, usually the original image
* 	original_file_name 	: string // the original image used to be saved when the final image will upload
* 	nodes				: object // HTML nodes
* }
* @return promise response
*/
tool_image_rotation.prototype.automatic_background_removal = async function(options) {

	const self = this

	// options
		const transcriber_engine	= options.transcriber_engine
		const transcriber_quality	= options.transcriber_quality
		const nodes					= options.nodes
		const image					= options.image
		const self_caller 			= options.self_caller
		const original_file_name 	= options.original_file_name
		const engine 				= options.engine

	// transcribe worker
		const background_removal_worker = new Worker( '../../tools/tool_common/js/processors/remove_background/remove_background.js', {
			type : 'module'
		})

	return new Promise( async function(resolve){

		// call to the API, fetch data and get response
			nodes.status_container.classList.remove('hide')
			nodes.status_container.classList.add('loading_status')
			nodes.status_container.innerHTML = self.get_tool_label('processing_image') || 'Processing image...'

		// Manage the worker answers
		// it could be the status of the process or the final transcription data
		background_removal_worker.onmessage = async function(e) {
			const status	= e.data.status
			const data		= e.data.data

			switch (status) {
				case 'init':

					const progress	= data.progress;
					const status	= data.status;
					const device	= data.device;

					const procesing_label = device==='webgpu' ? 'setting_up' : 'procesing';

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
					nodes.status_container.innerHTML = procesing;

					break;
				// on new chunk start empty the status_container, new phrase will be processed
				case 'on_chunk_start':
					nodes.status_container.innerHTML = '';
					nodes.status_container.classList.remove('loading_status')

					break;
				//every time that a word is processed and ready it is set at end of the phrase
				case 'callback_function':
					nodes.status_container.classList.remove('loading_status')
					nodes.status_container.innerHTML = data;

					break;
				// final data as returned as array of objects with a dd_format parameter.
				case 'end':

					background_removal_worker.terminate()
					// get the first data
					const output = data[0];

					// Convert Uint8ClampedArray to ImageData
					const image_data = new ImageData(
						output.data,  // Uint8ClampedArray
						output.width,
						output.height
					);

					// Create PNG Blob from ImageData
					const canvas = new OffscreenCanvas(output.width, output.height);
					let ctx = canvas.getContext('2d');
					ctx.putImageData( image_data, 0, 0);
					// Create a final blob image
					const blob = await canvas.convertToBlob({ type: 'image/png' });

					// upload the final data to server
					await upload_image({
						image_blob : blob
					})

					resolve( true )
					break;
			}
		}
		background_removal_worker.onerror = function(e) {
			console.error('Worker error [transcribe]:', e);
			nodes.status_container.innerHTML = `<div class="error">Worker error [transcribe]</div>`;
		}

		const removal_options = {
			image_file	: image,
			model		: engine,
			device		: 'webgpu' //nodes.transcriber_device_checkbox.checked ? 'wasm' : 'webgpu'
		}

		// init the worker for transcription
		background_removal_worker.postMessage({
			options	: removal_options
		})

		// Upload image
		const upload_image = async( options )=>{

			// set the extension to the main image name
			const image_blob	= options.image_blob
			image_blob.name		= original_file_name.replace(/\.[^/.]+$/, '.png');

			// upload file (using service_upload)
			// upload file as another images to tmp directory
			const api_response = await upload({
				id					: self_caller.id,
				file				: image_blob, // binary data as file
				resource_type		: 'image', // target dir
				allowed_extensions	: ['png'],
				key_dir				: 'image',
				max_size_bytes		: image_blob.size
			})

			if (!api_response.result) {
				console.error("Error on upload api_response:", api_response);
				return false
			}
			// file_data set
			const file_data = api_response.file_data

			// process_uploaded_file
			// When the image is upload it will save as temporal image and needs to be moved and processed
			// for every quality and formats define in config
			const api_response_upload_done = await process_uploaded_file({
				file_data		: file_data,
				process_options	: null,
				caller			: {
					type	: "tool",
					model	: "tool_upload"
				},
				tipo			: self_caller.tipo,
				section_tipo	: self_caller.section_tipo,
				section_id		: self_caller.section_id,
				caller_type		: self_caller.context.type, // like 'tool' or 'component'. Switch different process actions on tool_upload class
				quality			: 'modified',
				target_dir		: null
			})

			// debug
			if(SHOW_DEBUG===true) {
				console.log('image file_data (on upload finish):', file_data);
			}
			return true
		}
	})

}//end automatic_background_removal





// @license-end
