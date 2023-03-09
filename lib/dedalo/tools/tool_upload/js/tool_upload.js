"use strict";

// BASED ON HTLM5 SCRIPT:
// http://www.matlus.com/html5-file-upload-with-progress/

// Evaluate
// JQUERY UPLOAD LIB: http://bclennox.com/extremely-large-file-uploads-with-nginx-passenger-rails-and-jquery


// Exit page msg
var uploading = 'no';


/**
* TOOL_UPLOAD CLASS
*/
var tool_upload = new function() {

	// GLOBAL VARS
	var bytesUploaded		= 0,
		bytesTotal			= 0,
		previousBytesLoaded	= 0,
		intervalTimer		= 0;


	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_upload/trigger.tool_upload.php?top_tipo=' + page_globals.top_tipo + '&section_tipo=' + page_globals.section_tipo;


	// READY
	$(function() {

		switch(page_globals.modo) {
			case 'tool_upload' :
			case 'tool_upload_zotero' :
					tool_upload.set_max_size();
					tool_upload.resize_window();
					window.moveTo(0,0);
					break;
		}
	});



	// BEFOREUNLOAD
	window.addEventListener("beforeunload", function (event) {

		switch(page_globals.modo) {
			case 'tool_upload' :
				if(uploading!='no') {
					// cualquiera menos firefox
					return get_label.abandonando_esta_pagina ;
				}
				break;
		}
	});



	// SET MAX SIZE TEXT
	this.set_max_size = function () {

		const max_size_info_node = document.getElementById('max_size_info')
		if(max_size_info_node) {

			// max_size_bytes
			if(max_size_bytes) {
				max_size_info_node.innerHTML = ' Max: ' + Math.floor(max_size_bytes / (1024*1024)) + 'MB';
			}

			// dedalo_upload_service_chunk_files
			if (DEDALO_UPLOAD_SERVICE_CHUNK_FILES) {
				max_size_info_node.innerHTML += '. Chunks: ' + DEDALO_UPLOAD_SERVICE_CHUNK_FILES + 'MB'
			}
		}

		return true
	}//end set_max_size



	// RESIZE WINDOW
	this.resize_window = function() {

		if(window.self !== window.top) {
			console.log("[tool_upload.resize_window] Please exec in top window");
			return false;
		}

		const selector 	= document.getElementById('form_upload')
		const wo 		= 105
		const ho 		= 140

		setTimeout ( function () {

			const contentWidth  = selector.offsetWidth  + wo
			const contentHeight = selector.offsetHeight + ho


			window.resizeTo(contentWidth, contentHeight);

			//console.log(contentWidth + ' x ' + contentHeight);
		}, 100);
	}//end resize_window



	// FILE SELECTED
	this.fileSelected = function() {

		const self = this

		// Filed upload DOM element (note that this element have an event on input that trigger this function automatically)
		const fileToUpload = document.getElementById('fileToUpload')

		// Select firs file of set
		const file = fileToUpload.files[0]

		// debug
			if(SHOW_DEBUG===true) {
				console.log("[fileSelected] file:", file);
			}

		// fileSize
			let fileSize = 0;
			if (file.size > 1024 * 1024) {
				fileSize = ( Math.round(file.size  *100 / (1000 * 1000)) /100 ).toString() + 'MB';
			}else{
				fileSize = (Math.round(file.size * 100 / 1024) / 100).toString() + 'KB';
			}

		document.getElementById('fileInfo').style.display	= 'block'
		document.getElementById('fileName').innerHTML		= 'Name: ' + file.name
		document.getElementById('fileSize').innerHTML		= 'Size: ' + fileSize
		document.getElementById('fileType').innerHTML		= 'Type: ' + file.type

		// time calculation
			let time_aprox_min = parseInt( ((file.size / 1024) / 65) / 60 );
			if( time_aprox_min > 60 ) {
				let min_resto = (((time_aprox_min /60) - parseInt(time_aprox_min /60)) ) * 60 ;
				document.getElementById('progress_info').innerHTML = " ADSL estimated load time: " + Math.floor(time_aprox_min  /60)  + " Hours " + Math.floor(min_resto) + " Minutes" ;
			}else{
				document.getElementById('progress_info').innerHTML = " ADSL estimated load time: " + time_aprox_min + " Minutes" ;
			}

		// Resize window
		tool_upload.resize_window();

		// Submit form
		tool_upload.uploadFile();

		return true
	}//end fileSelected



	/**
	* UPLOAD FILE
	* @return bool
	*/
	this.uploadFile = function() {

		// progress
			uploading = 'si';

			clearInterval(intervalTimer);
			intervalTimer = 0;

			previousBytesLoaded = 0;
			document.getElementById('uploadResponse').style.display = 'none'
			document.getElementById('progressNumber').innerHTML 	= ''

			const progressBar = document.getElementById('progressBar')
				  progressBar.style.display = 'block'
				  progressBar.style.width   = '0px'

		// fileToUpload
			const fileToUpload	= document.getElementById('fileToUpload')
			const file			= fileToUpload.files[0];

		// short vars
			const mode			= 'upload_file'
			const SID			= document.getElementById('SID').value
			const quality		= document.getElementById('quality').value
			const tipo			= document.getElementById('tipo').value
			const parent		= document.getElementById('parent').value
			const section_tipo	= document.getElementById('section_tipo').value

		// xhr_load. The upload finish successfully
			const files_chunked		= []
			const count_uploaded	= []
			const xhr_load = function(evt) {

				// parse response string as JSON
					// let response = null
					// try {

						// trigger response
							const api_response = JSON.parse(evt.target.response);
							if (!api_response) {
								console.error("Error in XMLHttpRequest load response. Invalid response is received");
								// resolve(response)
								return false
							}

						// debug
							if(SHOW_DEBUG===true) {
								console.log("upload_file.XMLHttpRequest load response:", api_response);
							}

						// check if the file uploaded is a chunk
						const file_data = api_response.file_data
						// if upload is chunked, it is necessary join the files in the server before resolve the upload
						if(file_data.chunked) {

							// get the index
							const chunk_index = file_data.chunk_index
							files_chunked[chunk_index] = file_data.tmp_name
							count_uploaded.push(file_data.chunk_index)
							// get filename of every chunk
							const total_chunks = parseInt(file_data.total_chunks)
							// finished upload all chunks
							if(count_uploaded.length===total_chunks){

								// debug
									if(SHOW_DEBUG===true) {
										console.log('-> xhr_load > total_chunks is reached:', total_chunks);
									}

								// join_chunked_files
									tool_upload.join_chunked_files({
										file_data		: file_data,
										files_chunked	: files_chunked
									})
									.then(function(api_response){

										tool_upload.uploadProgress({
											event			: evt,
											chunk_index		: chunk_index,
											total_chunks	: total_chunks
										})

										// uploadComplete
										tool_upload.uploadComplete(api_response)

										return true
									})
							}

						}else{

							// uploadComplete
							tool_upload.uploadComplete(api_response)
							return true
						}

					// } catch (error) {
						// alert(evt.target.response)
						// console.warn("response:",evt.target.response);
						// console.error(error)

						// resolve(response)
						// return false
					// }

				// print message
					// response_msg.innerHTML = response.msg

			}//end xhr_load

		// proces_file
			const process_file = function (file) {

				const file_size		= file.size;
				// split into xMB chunks
				const size			= DEDALO_UPLOAD_SERVICE_CHUNK_FILES || 80; // DEDALO_UPLOAD_SERVICE_CHUNK_FILES maximum size for chunks
				const chunk_size	= size*1024*1024;
				let start			= 0;

				const total_chunks	= Math.ceil(file_size / chunk_size);
				for (let i = 0; i < total_chunks; i++) {

					const check_end	= start + chunk_size
					const end		= (file_size - check_end < 0)
						? file_size
						: check_end;
					const chunk		= slice(file, start, end);

					send_chunk({
						chunk			: chunk,
						chunk_index		: i,
						total_chunks	: total_chunks,
						start			: start,
						end				: end,
						file_size		: file_size
					});

					start += chunk_size;
				}
			}//end process_file

		// slice the file
			function slice(file, start, end) {
				const slice = file.mozSlice
					? file.mozSlice
					: file.webkitSlice
						? file.webkitSlice
						: file.slice
							? file.slice
							: function(){};

				return slice.bind(file)(start, end);
			}

		// send the chunk files to server
			function send_chunk(options) {

				// short vars
					const chunked		= true
					const chunk			= options.chunk
					const chunk_index	= options.chunk_index
					const total_chunks	= options.total_chunks
					const start			= options.start
					const end			= options.end
					const file_size		= options.file_size
					const chunk_end		= end-1;

				// XHR request
					const xhr = new XMLHttpRequest();
					xhr.open('POST', tool_upload.url_trigger, true);

				// Content-Range: bytes 0-999999/4582884
					const contentRange = "bytes "+ start +"-"+ chunk_end +"/"+ file_size;
					xhr.setRequestHeader("Content-Range",contentRange);

				// request header
					xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

				// form data
					const formdata = new FormData();

					formdata.append('mode', mode);
					formdata.append('SID', SID);
					formdata.append('quality', quality);
					formdata.append('tipo', tipo);
					formdata.append('parent', parent);
					formdata.append('section_tipo', section_tipo);

					formdata.append('file_name', file.name);
					formdata.append('chunked', chunked);
					formdata.append('start', start);
					formdata.append('end', end);
					formdata.append('chunk_index', chunk_index);
					formdata.append('total_chunks', total_chunks);
					formdata.append('file_to_upload', chunk);

				// upload_loadstart (the upload begins)
					// xhr.upload.addEventListener("loadstart", upload_loadstart, false);

				// error. upload_error (the upload ends in error)
					xhr.upload.addEventListener("error", tool_upload.uploadFailed, false);

				// abort. upload_abort (the upload has been aborted by the user)
					xhr.upload.addEventListener("abort",  tool_upload.uploadCanceled, false);

				// progress
					xhr.upload.addEventListener("progress", function(event){
						tool_upload.uploadProgress({
							event			: event,
							chunk_index		: chunk_index,
							total_chunks	: total_chunks
						})
					}, false);

				// load (the XMLHttpRequest ends successfully)
					xhr.addEventListener("load", xhr_load, false);

				xhr.send(formdata);
			}//end send_chunk

		// send the entire file to server
			function send(options) {

				const chunked = false

				// XHR request
					const xhr = new XMLHttpRequest();
					xhr.open('POST',  tool_upload.url_trigger, true);

				// request header
					xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

				// form data
					const formdata = new FormData();

					formdata.append('mode', mode);
					formdata.append('SID', SID);
					formdata.append('quality', quality);
					formdata.append('tipo', tipo);
					formdata.append('parent', parent);
					formdata.append('section_tipo', section_tipo);

					formdata.append('file_name', file.name);
					formdata.append('chunked', chunked);
					formdata.append('file_to_upload', file);

				// upload_loadstart (the upload begins)
					// xhr.upload.addEventListener("loadstart", upload_loadstart, false);

				// error (the upload ends in error)
					xhr.upload.addEventListener("error", tool_upload.uploadFailed, false);

				// abort (the upload has been aborted by the user)
					xhr.upload.addEventListener("abort",  tool_upload.uploadCanceled, false);

				// progress
					xhr.upload.addEventListener("progress", function(event){
						 tool_upload.uploadProgress({
							event			: event,
							chunk_index		: 1,
							total_chunks	: 1
						 })
					}, false);

				// load (the XMLHttpRequest ends successfully)
					xhr.addEventListener("load", xhr_load, false);
				// upload_load file (the upload ends successfully)
					// xhr.upload.addEventListener("load", tool_upload.uploadComplete, false);

				xhr.send(formdata);
			}//end send

		// validation. Check if something is missing
			const validacion = tool_upload.validar_formulario();
			if(validacion!==true) {
				return false;
			}

		// debug
			if(SHOW_DEBUG===true) {
				console.log("tool_upload > DEDALO_UPLOAD_SERVICE_CHUNK_FILES:", DEDALO_UPLOAD_SERVICE_CHUNK_FILES);
			}

		// process_file(file)
			switch (true) {

				// chunked. constant DEDALO_UPLOAD_SERVICE_CHUNK_FILES is set in config file. Could be false or int megabytes
				case DEDALO_UPLOAD_SERVICE_CHUNK_FILES > 0:
					process_file(file)
					break;

				// no chunked file case
				default:
					send()
					break;
			}


		return true
	 }//end uploadFile



	/**
	* GET_SYSTEM_INFO
	* Call API to obtain useful system info
	*/
	this.join_chunked_files = function(options) {

		// options
			const file_data		= options.file_data
			const files_chunked	= options.files_chunked

		// call to the API, fetch data and get response
		return new Promise(function(resolve){

			// short vars
				const tipo			= document.getElementById('tipo').value
				const parent		= document.getElementById('parent').value
				const section_tipo	= document.getElementById('section_tipo').value

			// trigger_vars
				const trigger_vars = {
					file_data		: file_data,
					files_chunked	: files_chunked,
					tipo			: tipo,
					parent			: parent,
					section_tipo	: section_tipo
				}

			// trigger call
				common.get_json_data(
					tool_upload.url_trigger + '&mode=join_chunked_files',
					trigger_vars
				)
				.then(function(response){
					if(SHOW_DEVELOPER===true) {
						console.log("-> join_chunked_files trigger response:", response);
					}

					resolve(response)
				})
		})
	}//end get_system_info



	/**
	* UPDATE TRASFER SPEED
	*/
	this.updateTransferSpeed = function() {

		try {

			let currentBytes = bytesUploaded;

			let bytesDiff = currentBytes - previousBytesLoaded;

			if (bytesDiff == 0 || bytesDiff <0) return;

			previousBytesLoaded = currentBytes;

			bytesDiff = bytesDiff * 2;

			let bytesRemaining = bytesTotal - previousBytesLoaded;

			let secondsRemaining = bytesRemaining / bytesDiff;


			let speed = "";

			if (bytesDiff > 1024 * 1024)

			  speed = ( Math.round(bytesDiff * 100/(1000*1000)) / 100 ).toString() + 'MBps';

			else if (bytesDiff > 1024)

			  speed =  (Math.round(bytesDiff * 100/1024)/100).toString() + 'KBps';

			else

			  speed = bytesDiff.toString() + 'Bps';

			document.getElementById('transferSpeedInfo').innerHTML = speed;
			document.getElementById('timeRemainingInfo').innerHTML = '| ' + tool_upload.secondsToString(secondsRemaining);

		}catch(error) {
			console.log('ERROR updateTransferSpeed:')
			console.log(error);
		}

		return true
	}//end updateTransferSpeed



	/**
	* SECONDS TO STRING
	*/
	this.secondsToString = function(seconds) {

		const h = Math.floor(seconds / 3600);
		const m = Math.floor(seconds % 3600 / 60);
		const s = Math.floor(seconds % 3600 % 60);

		return ((h > 0 ? h + ":" : "") + (m > 0 ? (h > 0 && m < 10 ? "0" : "") + m + ":" : "0:") + (s < 10 ? "0" : "") + s);
	}//end secondsToString



	/**
	* UPLOAD PROGRESS (EVENT)
	* @param object options
	* @return bool
	*/
	const loaded = []
	this.uploadProgress = function(options) {

		try {

			const event			= options.event
			const chunk_index	= options.chunk_index
			const total_chunks	= options.total_chunks

			if (event && event.lengthComputable) {
				const current_chunk_loaded = parseInt(event.loaded/event.total*100);
				loaded[chunk_index] = current_chunk_loaded;
				const sum = loaded.reduce((first, second) => first + second);

				const percent = Math.round(sum/total_chunks);
				// info line show numerical percentage of load

				bytesUploaded = event.loaded;

				bytesTotal = event.total;

				// let percentComplete = Math.round(evt.loaded * 100 / evt.total);

				let bytesTransfered = '';

				if (bytesUploaded > 1024*1024)
					bytesTransfered = (Math.round(bytesUploaded * 100/(1024*1024))/100).toString() + 'MB';
				else if (bytesUploaded > 1024)
					bytesTransfered = (Math.round(bytesUploaded * 100/1024)/100).toString() + 'KB';
				else
					bytesTransfered = (Math.round(bytesUploaded * 100)/100).toString() + 'Bytes';


				document.getElementById('progressNumber').innerHTML = percent.toString() + '%';
				document.getElementById('progressBar').style.width = (percent * 3.9).toString() + 'px';
				document.getElementById('transferBytesInfo').innerHTML = bytesTransfered;

				if (percent == 100) {

					if(document.getElementById('progressInfo')) {
						document.getElementById('progressInfo').style.display = 'none';
					}

					const uploadResponse_node			= document.getElementById('uploadResponse');
					uploadResponse_node.innerHTML		= '<div class="please_wait blink">'+get_label.por_favor_espere+'</div>';
					uploadResponse_node.style.display	= 'block';

					// Redimensiona ventana
					tool_upload.resize_window();
				}

			}else{

				document.getElementById('progressBar').innerHTML = 'unable to compute';
				console.warn('unable to compute progressBar. event:', event);
			}

		}catch(error) {
			console.error('ERROR uploadProgress:')
			console.error(error);
		}

		return true
	}//end uploadProgress



	/**
	* UPLOAD COMPLETE
	* @param object response
	* @return bool
	*/
	this.uploadComplete = function(response) {

		if(SHOW_DEBUG===true) {
			console.log("-> uploadComplete response:", response);
			// console.log("evt.target.response:",evt.target.response);
			// console.log("JSON.parse(evt.target.response):",JSON.parse(evt.target.response));
		}

		clearInterval(intervalTimer);

		const uploadResponse = document.getElementById('uploadResponse');

		// let response = null
		try {
			// response = JSON.parse(evt.target.response);
			const html = response.html
				//console.log(response);
		}catch(err) {
			uploadResponse.innerHTML = err.message;
		}

		if (!response || !response.html) {
			// Error. Invalid data
			uploadResponse.innerHTML = "Error. Invalid received data. ";
			console.warn("Error. Invalid received data. response:", response);
			return false;
		}else{
			// OK. Success
			uploadResponse.innerHTML = response.html;
		}


		// Response.update_components. When response.update_components is defined, reload related components in opener window
			if (typeof response.update_components!=='undefined') {

				const len = response.update_components.length
				for (let i = 0; i < len; i++) {

					let current_component_tipo = response.update_components[i];

					//window.opener.top.console.log("Recargar "+response.update_components[0]);
					let component_related_obj = window.opener.top.$(".wrap_component[data-tipo=" +current_component_tipo+ "]").first();
						//console.log(component_related_obj);

					if( component_related_obj.length == 1 ) {
						component_related_obj = component_related_obj[0];
						window.opener.top.component_common.update_component_by_parent_tipo_lang(component_related_obj.dataset.parent, current_component_tipo);
						if(SHOW_DEBUG===true) window.opener.top.console.log("->trigger opener update component "+current_component_tipo)
					}else{
						if(SHOW_DEBUG===true) window.opener.top.alert("->trigger opener update component ERROR for "+current_component_tipo)
					}
				}
			}

		uploadResponse.style.display = 'block';
		uploading 	= 'no';

		// hide some upload form elements
			$('.row, #fileInfo').hide(0);

		// Reload opener window in list mode
			// NOTE: When we use this class in other contexts (ex. 'tool_import_zotero'), SID is not defined and
			// this action is unnecessary and omitted
			if ( typeof SID!=="undefined" ) {

				// Update opener window component
				$(function(){

					const video_id 	= SID
					const ar 		= video_id.split("-")
					const tipo 	 	= ar[0]

					let current_caller_mode = null
					if (window.opener) {
						current_caller_mode = get_parameter_value(window.opener.location, 'm');
					}

					switch(media_type) {
						case 'image' :
						case 'svg' :
						case 'av' :
						case 'pdf' :
							// When tool_upload is called from tool_xxx_versions, reload tool_xxx_versions window
							// else, page focus components_to_refresh do the work
							//if( /tool_/i.test(window.opener.location) ) {
							if(current_caller_mode!=='edit') {
								if (window.opener) {
									window.opener.location.reload(false);
								}
							}
							break;
						default:
							alert("uploadComplete. media_type is not valid : " + media_type)
					}

					// Resize current window again
					tool_upload.resize_window();
				});
			}
			//alert( get_label.carga_de_archivo_completada );

		// Close window after x time for convenience (Manolo) only when upload success
			window.focus();
			setTimeout(function(){
				if (window.opener) {
					window.close();
				}
			}, 5000)

		return true
	}//end uploadComplete



	// UPLOAD FAILED
	this.uploadFailed = function(evt) {

		clearInterval(intervalTimer);

		console.log("ERROR tool_upload.uploadFailed:")
		console.log(evt)

		alert('Error. ' + get_label.error_al_subir_el_archivo + ' \n ' + evt)

		return true
	}//end uploadFailed



	// UPLOAD CANCELED
	this.uploadCanceled = function(evt) {

		clearInterval(intervalTimer);

		console.log('WARNING tool_upload.uploadCanceled:')
		console.log(evt);

		alert("The upload has been canceled by the user or the browser dropped the connection.");

		return true
	}//end uploadCanceled



	/**
	* VALIDATE FORM
	*/
	this.validar_formulario = function() {

		const fileToUpload   = document.getElementById('fileToUpload')
		const userfile_value = fileToUpload.value;

		if (userfile_value == -1 || userfile_value==null || userfile_value.length < 1) {
			alert( get_label.seleccione_un_fichero || 'Select file' );
			form_upload.fileToUpload.focus();
			return false;
		}

		const valid_extension = tool_upload.valid_extension(userfile_value);
		if(valid_extension===false) {
			const extension_to_test = userfile_value.split('.').pop();
			alert( (get_label.extension_no_valida || 'Invalid extension') + ": \n" + extension_to_test );
			return false;
		}

		// Only for modern browsers. Detect size on client side
		if (typeof FileReader !== "undefined" || window.FileReader || fileToUpload.files[0].size) {

			const size = fileToUpload.files[0].size;	//alert(size);

			const size_in_mb		= tool_upload.formatNumber(parseInt(size /1048576));
			const max_size_in_mb	= tool_upload.formatNumber(parseInt(max_size_bytes /1048576));

			// check file size
			if(size > max_size_bytes) {
				alert( get_label.fichero_demasiado_grande + " \n\n File size: " + size_in_mb + " MB \n Max size: " +max_size_in_mb + " MB" );
				return false;
			}
		}


		return true;
	}//end validar_formulario



	/**
	* VALID EXTENSION
	* @param string id_value
	* @return bool
	*/
	this.valid_extension = function(id_value) {

		let is_valid = false

		// check id_value
			if( typeof id_value==='undefined' || id_value=='' ) {
				return false;
			}

		const ar_extensions		= JSON.parse(valid_extensions_json)
		const extension_to_test	= id_value.split('.').pop()

		for (let i = 0; i < ar_extensions.length; i++) {

			const current_extension = ar_extensions[i]
			if (current_extension.toLowerCase()==extension_to_test.toLowerCase()) {
				is_valid = true
				break;  // stop the loop
			}
		}

		return is_valid;
	}//end valid_extension



	// CLOSE WINDOW
	this.cerrar = function(){

		window.close();
	};



	// FORMAT NUMBER
	this.formatNumber = function(num,prefix){

		prefix = prefix || '';
		num += '';
		var splitStr = num.split('.');
		var splitLeft = splitStr[0];
		var splitRight = splitStr.length > 1 ? '.' + splitStr[1] : '';
		var regx = /(\d+)(\d{3})/;
		while (regx.test(splitLeft)) {
		  splitLeft = splitLeft.replace(regx, '$1' + '.' + '$2');
		}

		return prefix + splitLeft + splitRight;
	}//end formatNumber


	/**
	* HANDLE_FILE_SELECT
	* @return
	*/
	this.drop = function(evt) {
		evt.stopPropagation();
		evt.preventDefault();

		const files = evt.dataTransfer.files; // FileList object.

		if (typeof files[0]!=="undefined") {

			const fileToUpload = document.getElementById('fileToUpload')
			if (!fileToUpload) {
				alert("Error on get dom element fileToUpload");
			}

			// Set
			fileToUpload.files = files

			// call fileSelected to start upload
			this.fileSelected()
		}

		return true
	}//end handle_file_select



	/**
	* DRAG_OVER
	* @return
	*/
	this.drag_over = function(evt) {
		evt.stopPropagation();
		evt.preventDefault();

		evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.

		evt.target.classList.add('border_drag_over');

		return true
	}//end drag_over



	/**
	* DRAG_LEAVE
	* @return
	*/
	this.drag_leave = function(evt) {
		evt.stopPropagation();
		evt.preventDefault();

		if (evt.target.nodeName==="LABEL") {
			if(evt.target.classList.contains('border_drag_over')){
				evt.target.classList.remove('border_drag_over');
			}
		}

		return true
	}//end drag_leave



}//end class


