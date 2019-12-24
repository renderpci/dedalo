"use strict";
/**
* DEDALO_UPLOAD CLASS
* Create and manage uploader widget to upload files (one at a time)
*
*/
var dedalo_upload = new function() {
	
	this.container_id 		= null
	this.form_id 			= null
	this.input_file_id 		= null	
	this.target_file_path 	= null
	this.target_file_name 	= null
	this.allowed_extensions = []
	this.max_file_size 		= 10
	this.on_complete 		= null // function name to call on complete upload

	this.input_control

	this.msg_div = null

	this.url_trigger = DEDALO_CORE_URL + "/tools/tool_common/trigger.tool_common.php"

	/**
	* BUILD_UPLOAD_FORM
	* @return 
	*/
	this.build_upload_form = function( data ) {
		if(SHOW_DEBUG===true) {
			//console.log("[dedalo_upload.build_upload_form] data:",data);
		}
		
		this.container_id 		= data.container_id
		this.form_id 			= data.form_id || "dedalo_upload_form"		
		this.target_file_path 	= data.target_file_path
		this.target_file_name 	= data.target_file_name
		this.allowed_extensions = data.allowed_extensions
		this.max_file_size 		= data.max_file_size || 100 // In megabytes
		this.on_complete 		= data.on_complete || null

		// Input file
		var input_file = document.createElement('input')
			input_file.type = "file"
			input_file.name = "file_to_upload"
			input_file.style.display = "none"	 //
			input_file.addEventListener("change", function (event) {
				dedalo_upload.file_selected(input_file, event)
			});

		// Info div
		var info_div = document.createElement('div')
			info_div.classList.add("dedalo_upload_info_div")
			var t = document.createTextNode(get_label.extensiones_soportadas + " : " + this.allowed_extensions.join() + " - max_file_size: "+this.max_file_size + " MB")
			info_div.appendChild(t)
			

		// Message div
		var msg_div = document.createElement('div')
			msg_div.id = "dedalo_upload_msg"
			msg_div.classList.add("dedalo_upload_msg")			


		// Bootstrap styles
		var input_group = document.createElement('div')
			input_group.classList.add("input-group","col-lg-6","col-sm-6","col-12")
		var label = document.createElement('label')
			label.classList.add("input-group-btn")
			label.style.width ="10px"
		var span = document.createElement('span')
			span.classList.add("btn","btn-primary")
		var t = document.createTextNode(get_label.seleccione_un_fichero) // seleccione_un_fichero Browse
			span.appendChild(t)
			span.appendChild(input_file)
			label.appendChild(span)
			input_group.appendChild(label)
		var input_control = document.createElement('input')
			input_control.type = "text"
			input_control.classList.add("form-control")
			input_control.readOnly = true
			this.input_control = input_control
			input_group.appendChild(input_control)


		// Form
		var form = document.createElement('form')
			form.id 	 = this.form_id
			form.enctype = "multipart/form-data"
			form.method  = "post"
			form.classList.add("dedalo_upload_form")
			//form.appendChild(input_file)

			// Form append elements
			form.appendChild(info_div)
			form.appendChild(input_group)
			form.appendChild(msg_div)


		// Container add elements
		var container = document.getElementById(this.container_id)
			container.appendChild(form)
			
		// Fix selectors
		this.msg_div = msg_div
		this.form = form

		//console.log(this)
	};//end build_upload_form



	/**
	* FILE_SELECTED
	* When file is selected, check and validate the file.
	* If is ok, upload directly using XMLHttpRequest to php trigger processor
	*/
	this.file_selected = function(input_file, event) {
		if(SHOW_DEBUG===true) {
			//console.log("[dedalo_uploads.file_selected] input_file", input_file);
			//console.log("[dedalo_uploads.file_selected] event", event);
		}

		// Show file name in input_control	
		this.input_control.value = input_file.value.split(/(\\|\/)/g).pop();


		// Validate file (extension and size)
		var valid_file = this.valid_file(input_file)
			if(valid_file!==true) {
				if(SHOW_DEBUG===true) {
					console.log("[dedalo_uploads.file_selected] Invalid file (skipped) ",input_file);
				}
				return false;
			}


		// Use input file name
		this.target_file_name = this.input_control.value		


		this.msg_div.innerHTML = "<span class=\"blink\"> Loading.. </span>"


		// Form data object
		var fd = new FormData(document.getElementById(this.form_id))
			fd.append("info", "Html 5 File API/FormData from Dédalo") // Add any aditional data here
			fd.append("mode", "upload_file")
			fd.append("target_file_path", this.target_file_path)
			fd.append("target_file_name", this.target_file_name)
			//console.log(fd)
			
		// Send file to trigger manager
		var xhr = new XMLHttpRequest()

			//xhr.upload.addEventListener("progress", dedalo_upload.upload_progress, false);

			xhr.addEventListener("load", dedalo_upload.upload_complete, false);

			xhr.addEventListener("error", dedalo_upload.upload_failed, false);

			xhr.addEventListener("abort", dedalo_upload.upload_canceled, false);

			xhr.open("POST", this.url_trigger );

			xhr.send(fd);

	};//end file_selected



	/**
	* UPLOAD_COMPLETE
	* @return 
	*/
	this.upload_complete = function(e) {
		
		if(SHOW_DEBUG===true) {
			//console.warn("[dedalo_upload.upload_complete] e.target.response ",e.target.response)
		}

		var response = JSON.parse(e.target.response)
			if(SHOW_DEBUG===true) {
				console.log("[dedalo_upload.upload_complete] response parsed ",response)
			}

		if (response.result && response.result!==false) {
			dedalo_upload.msg_div.innerHTML = get_label.archivo_subido_con_exito // " Upload complete !!! "

			if (dedalo_upload.on_complete) {
				var function_name = dedalo_upload.on_complete
				call_custom_function(function_name, e)
			}

		}else{
			dedalo_upload.msg_div.innerHTML = get_label.error_al_subir_el_archivo
			dedalo_upload.msg_div.innerHTML += "<br><i>" + JSON.stringify(response.msg, null, 2)+"</i>"
		}
		
		if(SHOW_DEBUG===true) {
			dedalo_upload.msg_div.innerHTML += "<br><pre>" + JSON.stringify(response, null, 2)+"</pre>"
		}
	};//end upload_complete



	/**
	* UPLOAD_FAILED
	* @return 
	*/
	this.upload_failed = function(e) {
		if(SHOW_DEBUG===true) {
			console.log("dedalo_upload.upload_failed] e", e)
		}
		//dedalo_upload.msg_div.innerHTML = "upload_failed !!! <br>" + JSON.stringify(e)
		dedalo_upload.msg_div.innerHTML = get_label.ningun_archivo_fue_subido + " <br>" + JSON.stringify(e,null,2)
	};//end upload_failed



	/**
	* UPLOAD_CANCELED
	* @return 
	*/
	this.upload_canceled = function() {
		if(SHOW_DEBUG===true) {
			console.log("dedalo_upload.upload_canceled] Canceled")
		}
		dedalo_upload.msg_div.innerHTML = " Upload canceled ";	
	};//end upload_canceled



	/**
	* VALID_FILE
	* @return 
	*/
	this.valid_file = function( input_file ) {

		// Check file name
		var userfile_value = input_file.value		
			if (userfile_value === -1 || userfile_value===null || userfile_value.length < 1) {
				alert( get_label.seleccione_un_fichero )		    	
		   		return false;
			}

	  	// Check file extension
		var is_valid_extension = this.is_valid_extension(userfile_value);	
			if(is_valid_extension===false) {
				var extension_to_test = userfile_value.split('.').pop();
				//alert( get_label.extension_no_valida + ": \n" + extension_to_test );
				var t = document.createTextNode( get_label.extension_no_valida + ": \n" + extension_to_test )
				this.msg_div.innerHTML = "<span class=\"error\"> " + t.nodeValue + " </span>"
				return false;
			}
		
		// Check file size. Only for modern browsers. Detect size on client side
		if (typeof FileReader !== "undefined" || window.FileReader || document.getElementById('fileToUpload').files[0].size) {			
			var size_in_mb		= input_file.size
			var max_size_in_mb	= this.max_file_size
			//console.log("size_in_mb: "+size_in_mb +" - max_size_in_mb: " + max_size_in_mb)
			
			// check file size
			if(size_in_mb > max_size_in_mb) {			
				//alert( get_label.fichero_demasiado_grande + " \n\n File size: " + size_in_mb + " MB \n Max size: " +max_size_in_mb + " MB" );
				var t = document.createTextNode( get_label.fichero_demasiado_grande + ". \n\n File size: " + size_in_mb + " MB \n Max size: " +max_size_in_mb + " MB" )
				this.msg_div.innerHTML = t.nodeValue
				return false;	
			}
		}	
	   
	  	return true;
	};//end valid_file



	/**
	* VALID EXTENSION
	*/
	this.is_valid_extension = function(filename) {

		if( typeof filename==='undefined' || filename==='' ) return false;
		
		var ar_extensions = this.allowed_extensions
			//console.log(ar_extensions);
		var len = ar_extensions.length;
		for (var i = 0; i < len; i++) { 
            
            var current_extension = ar_extensions[i];
            
            var extension_to_test = filename.split('.').pop();
            	//console.log(extension_to_test + " - filename:" + filename + " - current_extension:"+current_extension)
            
            if (current_extension.toLowerCase()===extension_to_test.toLowerCase()) {
            	return true;
            }			
        }//end for loop

        return false;
	};



	/**
	* FORMAT_FILE_SIZE_NUMBER
	*/
	this.format_file_size_number = function(num,prefix){

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
	};//end format_file_size_number

	
	
}//end class dedalo_upload