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
		if(max_size_bytes && document.getElementById('max_size_info'))
		document.getElementById('max_size_info').innerHTML = ' Max.' + Math.floor(max_size_bytes / (1024*1024)) + 'MB';

		return true
	};



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

			window.moveTo(0,0);
			window.resizeTo(contentWidth, contentHeight);
			
			//console.log(contentWidth + ' x ' + contentHeight);
		}, 100);	   
	};	



	// FILE SELECTED
	this.fileSelected  = function(files) {
	
		const self = this	

		// Filed upload dom element (note that this element have an event on input that trigger this function automatically)
		const fileToUpload = document.getElementById('fileToUpload')
		
		// Select firs file of set
		const file = fileToUpload.files[0]
		
		if(SHOW_DEBUG===true) {
			console.log("[fileSelected] file:", file);
		}		
		

		let fileSize = 0;
		if (file.size > 1024 * 1024) {
			fileSize = ( Math.round(file.size  *100 / (1000 * 1000)) /100 ).toString() + 'MB';
		}else{
			fileSize = (Math.round(file.size * 100 / 1024) / 100).toString() + 'KB';
		}

		document.getElementById('fileInfo').style.display 	= 'block'
		document.getElementById('fileName').innerHTML 		= 'Name: ' + file.name
		document.getElementById('fileSize').innerHTML 		= 'Size: ' + fileSize
		document.getElementById('fileType').innerHTML 		= 'Type: ' + file.type
		
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
	};//end fileSelected



	/**
	* UPLOAD FILE
	*/
	this.uploadFile = function() {
		
		uploading = 'si';
		
		clearInterval(intervalTimer);
		intervalTimer = 0;		

		previousBytesLoaded = 0;
		document.getElementById('uploadResponse').style.display = 'none'
		document.getElementById('progressNumber').innerHTML 	= ''

		const progressBar = document.getElementById('progressBar')
			  progressBar.style.display = 'block'
			  progressBar.style.width   = '0px'
		

		/* If you want to upload only a file along with arbitary data that
		   is not in the form, use this 

		var fd = new FormData();

		fd.append("author", "Shiv Kumar");

		fd.append("name", "Html 5 File API/FormData");

		fd.append("fileToUpload", document.getElementById('fileToUpload').files[0]);
		*/


		/* If you want to simply post the entire form, use this

		var fd = document.getElementById('form_upload').getFormData();
		*/
		
		const fd = new FormData(document.getElementById('form_upload'));		
		
		const validacion = tool_upload.validar_formulario();
		if(validacion!==true) return false;
		

		try {

			const 	xhr = new XMLHttpRequest();        

					xhr.upload.addEventListener("progress", tool_upload.uploadProgress, false);

					xhr.addEventListener("load", tool_upload.uploadComplete, false);

					xhr.addEventListener("error", tool_upload.uploadFailed, false);

					xhr.addEventListener("abort", tool_upload.uploadCanceled, false);

					xhr.open("POST", this.url_trigger);

					xhr.send(fd);

			intervalTimer = setInterval( tool_upload.updateTransferSpeed, 1000 );
			
			// hide button submit
			document.getElementById('btn_upload').style.display = 'none';

		}catch(error) {
			console.log('ERROR uploadFile:')
			console.log(error)
		}

		tool_upload.resize_window()

		return true
	 };//end uploadFile



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
	};//end updateTransferSpeed



	/**
	* SECONDS TO STRING
	*/
	this.secondsToString = function(seconds) {
		
		const h = Math.floor(seconds / 3600);
		const m = Math.floor(seconds % 3600 / 60);
		const s = Math.floor(seconds % 3600 % 60);

		return ((h > 0 ? h + ":" : "") + (m > 0 ? (h > 0 && m < 10 ? "0" : "") + m + ":" : "0:") + (s < 10 ? "0" : "") + s);
	};//end secondsToString



	/**
	* UPLOAD PROGRESS (EVENT)
	*/
	this.uploadProgress = function(evt) {
		
		//console.log(evt);
		try {	

			if (evt.lengthComputable) {

				bytesUploaded = evt.loaded;

				bytesTotal = evt.total;

				let percentComplete = Math.round(evt.loaded * 100 / evt.total);

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

				document.getElementById('progressBar').innerHTML = 'unable to compute';
			}

		}catch(error) {
			console.log('ERROR uploadProgress:')
			console.log(error);
		}

		return true
	};//end uploadProgress



	/**
	* UPLOAD COMPLETE
	* @param event evt 
	*/
	this.uploadComplete = function(evt) {
		
		if(SHOW_DEBUG===true) {
			console.log("evt:",evt);
			console.log("evt.target.response:",evt.target.response);
			console.log("JSON.parse(evt.target.response):",JSON.parse(evt.target.response));
		}		

		clearInterval(intervalTimer);

		const uploadResponse = document.getElementById('uploadResponse');

		let response = null
		try {
			response = JSON.parse(evt.target.response);
				//console.log(response);
		}catch(err) {
			uploadResponse.innerHTML = err.message;
		}		

		if (!response || !response.html) {
			// Error. Invalid data
			uploadResponse.innerHTML = "Error. Invalid received data";
			return false;
		}else{
			// Ok. Success
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
						window.opener.top.component_common.update_component_by_parent_tipo_lang( component_related_obj.dataset.parent, current_component_tipo);
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
								window.opener.location.reload(false);						
							}
							break;
						default:
							alert("uploadComplete. media_type is not valid : "+media_type)
					}			

					// Resize current window again
					tool_upload.resize_window();
				});	
			}				
			//alert( get_label.carga_de_archivo_completada );

		// Close window after x time for convenience (Manolo) only when upload success
			window.focus();
			setTimeout(function(){
				window.close();
			},5000)

		return true
	};//end uploadComplete



	// UPLOAD FAILED
	this.uploadFailed = function(evt) {

		clearInterval(intervalTimer);

		console.log("ERROR tool_upload.uploadFailed:")
		console.log(evt)

		alert( get_label.error_al_subir_el_archivo + ' \n ' + evt)

		return true
	};//end uploadFailed



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
			alert( get_label.seleccione_un_fichero );
			form_upload.fileToUpload.focus();
			return false;
		}
	  
		const valid_extension = tool_upload.valid_extension(userfile_value);	
		if(valid_extension==false) {
			const extension_to_test = userfile_value.split('.').pop();
			alert( get_label.extension_no_valida + ": \n" + extension_to_test );
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
	};//end validar_formulario



	/**
	* VALID EXTENSION
	*/
	this.valid_extension = function(id_value) {

		if( typeof id_value == 'undefined' || id_value == '' ) return false;
		
		const ar_extensions = JSON.parse(valid_extensions_json)
		
		for (let i = 0; i < ar_extensions.length; i++) {
			
			let current_extension = ar_extensions[i]			
			let extension_to_test = id_value.split('.').pop()
			
			if (current_extension.toLowerCase()==extension_to_test.toLowerCase()) {
				return true;
			}			
		}

		return false;
	};



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
	};//end formatNumber


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

			// On set values, input element event trigger upload automatically
			fileToUpload.files = files
		}			
	 
		return true
	};//end handle_file_select



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
	};//end drag_over



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
	};//end drag_leave



}//end class


