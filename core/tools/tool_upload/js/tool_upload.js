// import
	import {data_manager} from '../../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../common/js/instances.js'
	import {common} from '../../../common/js/common.js'
	import {tool_common} from '../../../tool_common/js/tool_common.js'
	import {render_tool_upload, add_component} from './render_tool_upload.js'



/**
* TOOL_UPLOAD
* Tool to translate contents from one language to other in any text component
*/
export const tool_upload = function () {

	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type
	this.caller

	this.max_size_bytes

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_upload.prototype.render 		= common.prototype.render
	tool_upload.prototype.destroy 		= common.prototype.destroy
	tool_upload.prototype.edit 			= render_tool_upload.prototype.edit



/**
* INIT
*/
tool_upload.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url = DEDALO_CORE_URL + "/tools/tool_upload/trigger.tool_upload.php"

	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD
*/
tool_upload.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(this, autoload);

	// fetch system info
		const system_info = await get_system_info(self)


	return common_build
}//end build_custom



/**
* GET_SYSTEM_INFO
* Call trigger to obtain useful system info
*/
const get_system_info = async function(self) {

	// errors
		const handle_errors = function(response) {
			if (!response.ok) {
				throw Error(response.statusText);
			}
			return response;
		}

	// trigger call
		const trigger_response = await fetch(
	 		self.trigger_url,
	 		{
				method		: 'POST',
				mode		: 'cors',
				cache		: 'no-cache',
				credentials	: 'same-origin',
				headers		: {'Content-Type': 'application/json'},
				redirect	: 'follow',
				referrer	: 'no-referrer',
				body		: JSON.stringify({
					mode : 'get_system_info'
				})
			})
			.then(handle_errors)
			.then(response => response.json()) // parses JSON response into native Javascript objects
			.catch(error => {
				console.error("!!!!! REQUEST ERROR: ",error)
				return {
					result 	: false,
					msg 	: error.message,
					error 	: error
				}
			});

	// set
		self.max_size_bytes 		= trigger_response.result.max_size_bytes
		self.sys_get_temp_dir 		= trigger_response.result.sys_get_temp_dir
		self.upload_tmp_dir 		= trigger_response.result.upload_tmp_dir
		self.upload_tmp_perms 		= trigger_response.result.upload_tmp_perms
		self.session_cache_expire 	= trigger_response.result.session_cache_expire


	return trigger_response.result
}//end get_system_info



/**
* UPLOAD_FILE
*/
tool_upload.prototype.upload_file = async function(e, content_data) {

	const self = this

	// console.log("upload_file e:",e)
	// console.log("upload_file e.target:",e.target);
	// console.log("upload_file e.target.files:",e.target.files);
	// console.log("size:",e.target.files[0].size);

	// check max file size
		const file_size_bytes = e.target.files[0].size
		if (file_size_bytes>self.max_size_bytes) {
			alert("Error. File is too big. Max file size is " + Math.floor(self.max_size_bytes / (1024*1024)) + " MB and current file is " + Math.floor(file_size_bytes / (1024*1024)));
			return false
		}

	// dom elements
		const response_container = content_data.querySelector(".response_container")


	// FormData build
		const fd = new FormData();
			  fd.append("mode", 			"upload_file");
			  fd.append("component_tipo", 	self.caller.tipo);
			  fd.append("section_tipo", 	self.caller.section_tipo);
			  fd.append("section_id", 		self.caller.section_id);
			  fd.append("quality", 			self.caller.default_target_quality);
			  // file
			  fd.append("fileToUpload", e.target.files[0]);

			  	// console.log("fd:",fd);
			  	// console.log("self:",self);
			  	// return;

	try {

		const xhr = new XMLHttpRequest();

				// progress event
					// xhr.upload.addEventListener("progress", tool_upload.uploadProgress, false);
					xhr.addEventListener("progress", function(e) {
						upload_progress(e, content_data)
					}, false);

				// load complete event
					xhr.addEventListener("load", function(e) {

						// parse response string as JSON
							const response = JSON.parse(e.target.response);
							if (!response) {
								console.error("Error in XMLHttpRequest load response. Nothing is received");
								return false
							}

						// debug
							if(SHOW_DEBUG===true) {
								console.log("upload_file.XMLHttpRequest load response:", response);
							}

						// print message
							response_container.innerHTML = response.msg

						// refresh component
							self.caller.refresh().then((refresh_reponse)=>{

							})

						// close modal. On close, modal destroy the caller (this tool)
							setTimeout(()=>{
								const modal_container = document.querySelector('dd-modal')
								if (modal_container) {
									modal_container._closeModal()
								}
							}, 5000)


					}, false);

				// failed event
					// xhr.addEventListener("error", tool_upload.uploadFailed, false);

				// cancel event
					// xhr.addEventListener("abort", tool_upload.uploadCanceled, false);

				// open connection
					xhr.open("POST", self.trigger_url);

				// send data
					xhr.send(fd);

		// intervalTimer = setInterval( tool_upload.updateTransferSpeed, 1000 );

		// hide button submit
		// document.getElementById('btn_upload').style.display = 'none';

	}catch(error) {
		console.error('ERROR uploadFile: ', error);
	}


	return true
}//end upload_file



/**
* UPLOAD_PROGRESS
*/
const upload_progress = function(evt, content_data) {

		console.log("++++++++++++++++++++++ upload_progress evt:",evt);

		return

	try {

		if (evt.lengthComputable) {

			bytesUploaded = evt.loaded;

			bytesTotal = evt.total;

			let percentComplete = Math.round(evt.loaded * 100 / evt.total);

			// bytesTransfered
				let bytesTransfered = '';

				if (bytesUploaded > 1024*1024)
					bytesTransfered = (Math.round(bytesUploaded * 100/(1024*1024))/100).toString() + 'MB';
				else if (bytesUploaded > 1024)
					bytesTransfered = (Math.round(bytesUploaded * 100/1024)/100).toString() + 'KB';
				else
					bytesTransfered = (Math.round(bytesUploaded * 100)/100).toString() + 'Bytes';


			document.getElementById('progressNumber').innerHTML = percentComplete.toString() + '%';
			document.getElementById('progressBar').style.width = (percentComplete * 3.9).toString() + 'px';
			document.getElementById('transferBytesInfo').innerHTML = bytesTransfered;

			if (percentComplete == 100) {

				if(document.getElementById('progressInfo'))
				document.getElementById('progressInfo').style.display = 'none';

				const 	uploadResponse 		 		 = document.getElementById('uploadResponse');
						uploadResponse.innerHTML 	 = '<div class="please_wait blink">'+get_label.por_favor_espere+'</div>';
						uploadResponse.style.display = 'block';

				// Redimensiona ventana
				tool_upload.resize_window();
			}

		}else{

			document.getElementById('progressBar').innerHTML = 'Unable to compute';
		}

	}catch(error) {
		console.error('ERROR upload_progress:', error)
	}

	return true

}//end upload_progress





// /**
// * UPLOAD_FILE
// */
// tool_upload.prototype.upload_file9999999 = async function(file) {

// 	const self = this

// 	uploading = 'si';

// 	clearInterval(intervalTimer);
// 	intervalTimer = 0;

// 	previousBytesLoaded = 0;
// 	document.getElementById('uploadResponse').style.display = 'none'
// 	document.getElementById('progressNumber').innerHTML 	= ''

// 	const progressBar = document.getElementById('progressBar')
// 		  progressBar.style.display = 'block'
// 		  progressBar.style.width   = '0px'


// 	// If you want to upload only a file along with arbitary data that is not in the form, use this:

// 		// var fd = new FormData();

// 		// fd.append("author", "Shiv Kumar");

// 		// fd.append("name", "Html 5 File API/FormData");

// 		// fd.append("fileToUpload", document.getElementById('fileToUpload').files[0]);


// 	// If you want to simply post the entire form, use this:

// 		// var fd = document.getElementById('form_upload').getFormData();


// 	const fd = new FormData(document.getElementById('form_upload'));

// 	const validacion = tool_upload.validar_formulario();
// 	if(validacion!==true) return false;


// 	try {

// 		const 	xhr = new XMLHttpRequest();

// 				xhr.upload.addEventListener("progress", tool_upload.uploadProgress, false);

// 				xhr.addEventListener("load", tool_upload.uploadComplete, false);

// 				xhr.addEventListener("error", tool_upload.uploadFailed, false);

// 				xhr.addEventListener("abort", tool_upload.uploadCanceled, false);

// 				xhr.open("POST", trigger_url);

// 				xhr.send(fd);

// 		intervalTimer = setInterval( tool_upload.updateTransferSpeed, 1000 );

// 		// hide button submit
// 		document.getElementById('btn_upload').style.display = 'none';

// 	}catch(error) {
// 		console.error('ERROR uploadFile:')
// 		console.error(error)
// 	}

// 	// tool_upload.resize_window()

// 	return true
// }//end upload_file


