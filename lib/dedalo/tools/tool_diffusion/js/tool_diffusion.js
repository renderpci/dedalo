"use strict";
/**
* TOOL_DIFFUSION
*
*
*
*/
var tool_diffusion = new function (){

	this.url_trigger = DEDALO_LIB_BASE_URL + '/tools/tool_diffusion/trigger.tool_diffusion.php'
	this.publishing  = false



	/**
	* EXPORT_RECORD
	* @param DOM object button_obj
	*/
	this.export_record = function(button_obj, input_levels) {

		// already publishing
			if (tool_diffusion.publishing===true) {
				if(SHOW_DEBUG===true) console.log("Already publishing. Please wait finish")
				return false;
			}

		// publication levels
			input_levels		= input_levels || button_obj.parentNode.querySelector('input')
			const level_value	= (input_levels && input_levels.value)
				? parseInt(input_levels.value)
				: 2

		// user confirm
			if( !confirm(get_label.seguro + "\n" + (get_label.niveles || 'Levels') + " : "+ level_value) ) {
				return false
			}
		
		const options = JSON.parse(button_obj.dataset.options)
		let tool_diffusion_response = document.getElementById('log_messages')
			tool_diffusion_response.innerHTML = "<div class=\"log_messages_response\"><span class=\"css_spinner\">Publishing. Please wait..</span></div>"
		
		const trigger_vars = {
				mode					: options.mode,	// 'export_record' | 'export_list',
				section_tipo			: options.section_tipo,
				diffusion_element_tipo	: options.diffusion_element_tipo,
				section_id				: page_globals._parent,
				top_tipo				: page_globals.top_tipo,
				level_value				: level_value
		}
		//return console.log(trigger_vars);

		tool_diffusion.publishing = true

		if(SHOW_DEBUG===true) console.log('->Fired export_record: ' , trigger_vars.section_tipo )

		// Return a promise of XMLHttpRequest
		const js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response){
				if(SHOW_DEBUG===true) {
					console.log("[tool_diffusion.export_record] response",response);
				}			

				if (response===null) {
					// statements to handle any exceptions
					tool_diffusion_response.innerHTML += common.print_response("Error on export_record. Response is null")
				}else{

					tool_diffusion_response.innerHTML = ''
					tool_diffusion_response.innerHTML += common.print_response(response.msg)	
					
					if (typeof response.debug!=='undefined' && typeof response.debug.msg!=='undefined') {
						tool_diffusion_response.innerHTML += common.print_response("("+response.debug.msg+")")
					}

					// Scrool top page to view msg
					document.body.scrollTop = document.documentElement.scrollTop = 0
				}

				tool_diffusion.publishing = false
		}, function(error) {
			tool_diffusion.publishing = false
			console.log("[tool_diffusion.export_record] error",error)
		});

		return js_promise
	};//end export_record



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
	};//end export_thesaurus



	/**
	* EXPORT_LIST
	* Alias of export_record
	*/
	this.export_list = function(button_obj) {

		const input_levels = button_obj.querySelector('input')

		return this.export_record(button_obj, input_levels)
	};



}//end tool_diffusion