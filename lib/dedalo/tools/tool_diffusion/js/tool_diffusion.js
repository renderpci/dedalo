


/**
* TOOL_DIFFUSION
*/
var tool_diffusion = new function (){

	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_diffusion/trigger.tool_diffusion.php'
	this.publishing  = false



	/**
	* EXPORT_RECORD
	* @param DOM object button_obj
	*/
	this.export_record = function(button_obj) {

		if (tool_diffusion.publishing==true) {
			if (DEBUG) console.log("Already publishing. Please wait finish")
			return false;
		}
		
		var options = JSON.parse(button_obj.dataset.options),
			tool_diffusion_response = document.getElementById('log_messages')
			tool_diffusion_response.innerHTML = "<div class=\"log_messages_response\"><span class=\"css_spinner\">Publishing. Please wait..</span></div>"
		
		var mydata	= {
			'mode' 					: options.mode,	// 'export_record' | 'export_list',
			'section_tipo' 			: options.section_tipo,
			'diffusion_element_tipo': options.diffusion_element_tipo,
			'section_id' 			: page_globals._parent,
			'top_tipo' 				: page_globals.top_tipo
			}
			//return console.log(mydata);

		tool_diffusion.publishing = true

		// AJAX REQUEST
		$.ajax({
			url		: this.url_trigger,
			data	: mydata,
			type	: 'POST'
		})
		// DONE
		.done(function(received_data) {

			try {
				var received_data_obj = JSON.parse(received_data)
				if (typeof received_data_obj.msg!='undefined' ) {

					tool_diffusion_response.innerHTML = ''

					tool_diffusion_response.innerHTML += common.print_response(received_data_obj.msg)	
					//tool_diffusion_response.innerHTML += received_data_obj.msg;
					if (typeof received_data_obj.debug!='undefined' && typeof received_data_obj.debug.msg!='undefined') {
						tool_diffusion_response.innerHTML += common.print_response("("+received_data_obj.debug.msg+")")
					}

					// Scrool top page to view msg
					document.body.scrollTop = document.documentElement.scrollTop = 0
				}								
				//console.log(response);
			}catch (e) {
				// statements to handle any exceptions
				tool_diffusion_response.innerHTML += common.print_response(received_data)

			   if (DEBUG) {
			   		console.log(e);
			   		console.log(received_data);
			   }
			}
		})
		// FAIL ERROR 
		.fail(function(error_data) {
			tool_diffusion_response.innerHTML = "<div class=\"log_messages_response\"> <span class='error'>ERROR: on export_record !</span></div> "
			if (DEBUG) console.log("ERROR: error_data:" + error_data )
		})
		// ALWAYS
		.always(function() {
			tool_diffusion.publishing = false
		});
		if (DEBUG) console.log('->Fired export_record: ' + options.section_tipo + ' ')
	};



	/**
	* EXPORT_THESAURUS
	* Alias of export_record
	*/
	this.export_thesaurus = function(select_obj) {

		if(!select_obj) select_obj = document.getElementById('tool_diffusion_thesaurus_select')

		// Select value
		// var select 	= document.getElementById('tool_diffusion_thesaurus_select'),
		var	value = select_obj.value
		if (!value) return alert("Please, select a table to publish")

		var ar_value = JSON.parse(value)
		if (ar_value.length>1) {
			if(!confirm("This process can take very long time. Are you sure?")) return false
		};		

		var options = JSON.parse(select_obj.dataset.options)

		// Inject select value into button dataset
		options.section_tipo = value;
		select_obj.dataset.options = JSON.stringify(options)

		return this.export_record(select_obj)
	};



	/**
	* EXPORT_LIST
	* Alias of export_record
	*/
	this.export_list = function(button_obj) {
		return this.export_record(button_obj)
	};


	






};