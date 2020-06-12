// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_posterframe, add_button} from './render_tool_posterframe.js'




/**
* TOOL_POSTERFRAME
* Tool to manage time codes
*/
export const tool_posterframe = function () {

	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type

	this.source_lang
	//this.target_lang
	this.langs
	this.caller


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_posterframe.prototype.render 	= common.prototype.render
	tool_posterframe.prototype.destroy 	= common.prototype.destroy
	tool_posterframe.prototype.edit		= render_tool_posterframe.prototype.edit



/**
* INIT
*/
tool_posterframe.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url 	= DEDALO_TOOLS_URL + "/tool_posterframe/trigger.tool_posterframe.php"
		self.lang 			= options.lang
		self.langs 			= page_globals.dedalo_projects_default_langs
		self.source_lang 	= options.caller.lang
		//self.target_lang 	= null


	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD_CUSTOM
*/
tool_posterframe.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(this, autoload);

	// specific actions..


	return common_build
}//end build_custom



/**
* LOAD_COMPONENT
*/
tool_posterframe.prototype.load_component = async function(lang) {

	const self = this

	const component = self.caller

	const context = JSON.parse(JSON.stringify(component.context))
		  context.lang = lang

	const component_instance = await get_instance({
		model 			: component.model,
		tipo 			: component.tipo,
		section_tipo 	: component.section_tipo,
		section_id 		: component.section_id,
		mode 			: component.mode==='edit_in_list' ? 'edit' : component.mode,
		lang 			: lang,
		section_lang 	: component.lang,
		//parent 			: component.parent,
		type 			: component.type,
		context 		: context,
		data 			: {value:[]},
		datum 			: component.datum
	})

	// set current tool as component caller (to check if component is inside tool or not)
		component_instance.caller = this

	await component_instance.build(true)

	// add
		const instance_found = self.ar_instances.find( el => el===component_instance )
		if (component_instance!==self.caller && typeof instance_found==="undefined") {
			self.ar_instances.push(component_instance)
		}


	return component_instance
}//end load_component

/**
* BUTTON CLICK
*/
tool_posterframe.prototype.button_click = function(value, button_obj) {

	console.log("value:",value);

	const self = this

	switch (value) {

		case 'Play':

//TODO - cambiar la llamada
			self.generate_posterframe(button_obj, 45);
			break;

		case '< 10 seg':
		case '< 5 seg':
		case '- 1':
		case '+ 1':
		case '5 seg >':
		case '5 seg >':


//TODO - cambiar la llamada
			self.generate_posterframe(button_obj, 45);
			break;

		case 'Create identifyying image':

			self.generate_identifying_image(button_obj, 45);
			break;

		case 'Make Posterframe':

			self.generate_posterframe(button_obj, 45);
			break;

		case 'Delete Posterframe':

			self.delete_posterframe(button_obj);
			break;

	}

	return true
}//end button_click

/**
* GENERATE POSTERFRAME
*/
tool_posterframe.prototype.generate_posterframe = function(button_obj, current_time_in_seconds) {

	//TODO - change function code to adapt to the new version, the function contains old code that has been copied

	//if(window.self !== window.top) return alert("Please exec in top window");

	var video_id 		= $(button_obj).data('video_id'),
		quality			= $(button_obj).data('quality'),
		parent			= $(button_obj).data('parent');

	if(SHOW_DEBUG===true) console.log("->generate_posterframe vars: " +video_id+' '+quality+ ' '+current_time_in_seconds);

	// TC
	var timecode = parseFloat( current_time_in_seconds );
	// Minimun tc fix
	if(timecode==0) timecode = 0.001;

	var mode 		= 'generate_posterframe';
	var mydata		= { 'mode': mode,
						'video_id': video_id,
						'quality': quality ,
						'timecode': timecode,
						'parent': parent,
						'top_tipo':page_globals.top_tipo
					};

	/*
	var video_element 	= top.$('.css_av_video[data-video_id="'+video_id+'"]', window.opener);
	var wrap_div 		= $(video_element).parents('.wrap_component:first');
		//return alert( 'css_av_video lengh: '+$(wrap_div).length )
	*/
	var wrap_div 	= top.$('.css_wrap_av[data-dato="'+video_id+'"]', window.opener);
		//console.log(wrap_div.length); return false;

	var wrap_div_tool = $(button_obj).parents('.wrap_tool:first');
	html_page.loading_content( wrap_div_tool, 1 );

	// AJAX REQUEST
	$.ajax({
		url		: tool_posterframe.url_trigger,
		data	: mydata,
		type	: "POST"
	})
	// DONE
	.done(function(received_data) {

		// Search 'error' string in response
		var error_response = /error/i.test(received_data);	//alert(error_response)

		// If received_data contains 'error' show alert error with (received_data), else reload the page
		if(error_response) {
			// Warning msg
			var msg = "<span class='error'>Error when generate posterframe: \n" + received_data + "</span>" ;
				inspector.show_log_msg(msg);
				alert( $(msg).text() )
		}else{
			// Notification msg ok
			var msg = "<span class='ok'>"+received_data+"</span>";
				inspector.show_log_msg(msg);

			// Update image av_posterframe
			if($(wrap_div).length===1) {
				let wrapper_id 		= $(wrap_div).attr('id')
				let my_arguments 	= null
				let varcallback 	= null
				top.component_common.load_component_by_wrapper_id(wrapper_id, my_arguments, varcallback);	//wrapper_id, my_arguments, callback
			}else{
				console.log("Error: wrap div not found! Sorry, no component update is done.");
			}
		}
	})
	// FAIL ERROR
	.fail(function(error_data) {
		// Notify to log messages in top of page
		var msg = "<span class='error'>ERROR: on generate_posterframe data:" + error_data + "</span>";
		inspector.show_log_msg(msg);
		if(SHOW_DEBUG===true) console.log(error_data);
	})
	// ALWAYS
	.always(function() {
		html_page.loading_content( wrap_div_tool, 0 );
	})

}//end generate_posterframe



/**
* DELETE POSTERFRAME
*/
tool_posterframe.prototype.delete_posterframe = function(button_obj) {


	//TODO - change function code to adapt to the new version, the function contains old code that has been copied

	//if(window.self !== window.top) return alert("Please exec in top window");

	var video_id 		= $(button_obj).data('video_id'),
		quality			= $(button_obj).data('quality'),
		parent			= $(button_obj).data('parent');

	if(SHOW_DEBUG===true) console.log("->delete_posterframe vars: " +video_id+' '+quality);

	var mode 		= 'delete_posterframe';
	var mydata		= { 'mode': mode,
						'video_id': video_id,
						'quality': quality,
						'parent': parent,
						'top_tipo':page_globals.top_tipo
					};

	var video_element 	= top.$('.css_av_video[data-video_id="'+video_id+'"]');
	var wrap_div 		= $(video_element).parents('.wrap_component:first');


	if( !confirm( get_label.borrar +' '+ get_label.fichero + ' posterframe ?') ) return false;


	var wrap_div_tool = $(button_obj).parents('.wrap_tool:first');
	html_page.loading_content( wrap_div_tool, 1 );

	// AJAX REQUEST
	$.ajax({
		url		: this.url_trigger,
		data	: mydata,
		type	: "POST"
	})
	// DONE
	.done(function(received_data) {

		// Search 'error' string in response
		var error_response = /error/i.test(received_data);	//alert(error_response)

		// If received_data contains 'error' show alert error with (received_data), else reload the page
		if(error_response) {
			// Warning msg
			var msg = "<span class='error'>Error when generate posterframe: \n" + received_data + "</span>" ;
				inspector.show_log_msg(msg);
				alert( $(msg).text() )
		}else{
			// Notification msg ok
			var msg = "<span class='ok'>"+received_data+"</span>";
				inspector.show_log_msg(msg);

			// Update image av_posterframe
			var wrapper_id 	= $(wrap_div).attr('id'),
				myarguments = null,
				callback 	= null;
			top.component_common.load_component_by_wrapper_id(wrapper_id, myarguments, callback);
		}
	})
	// FAIL ERROR
	.fail(function(error_data) {
		// Notify to log messages in top of page
		var msg = "<span class='error'>ERROR: on delete_posterframe data:" + error_data + "</span>";
		inspector.show_log_msg(msg);
		if(SHOW_DEBUG===true) console.log(error_data);
	})
	// ALWAYS
	.always(function() {
		html_page.loading_content( wrap_div_tool, 0 );
	})

}//end delete_posterframe



/**
* GENERATE_IDENTIFYING_IMAGE
*/
tool_posterframe.prototype.generate_identifying_image = function(button_obj, current_time_in_seconds) {


	//TODO - change function code to adapt to the new version, the function contains old code that has been copied

	//if(window.self !== window.top) return alert("Please exec in top window");

	var video_id 	= button_obj.dataset.video_id,
		quality		= button_obj.dataset.quality,
		parent		= button_obj.dataset.parent

	var select 		= document.getElementById('identifying_image_selector'),
		select_val 	= select.value


	if(SHOW_DEBUG===true) console.log("->generate_identifying_image vars: " +video_id+' '+quality+ ' '+current_time_in_seconds);

	// TC
	var timecode = parseFloat( current_time_in_seconds );
	// Minimun tc fix
	if(timecode==0) timecode = 0.001;

	var mydata		= { 'mode' 		: 'generate_identifying_image',
						'video_id' 	: video_id,
						'quality' 	: quality ,
						'timecode' 	: timecode,
						'parent' 	: parent,
						'select_val': select_val,
						'top_tipo' 	: page_globals.top_tipo
					}
					//return console.log(mydata);


	var wrap_div 	= top.$('.css_wrap_av[data-dato="'+video_id+'"]', window.opener);
		//console.log(wrap_div.length); return false;

	var wrap_div_tool = $(button_obj).parents('.wrap_tool:first');
	html_page.loading_content( wrap_div_tool, 1 );

	// AJAX REQUEST
	$.ajax({
		url		: tool_posterframe.url_trigger,
		data	: mydata,
		type	: "POST"
	})
	// DONE
	.done(function(received_data) {

		// If received_data contains 'error' show alert error with (received_data), else reload the page
		if(/error/i.test(received_data)) {
			// Warning msg
			var msg = "<span class='error'>Error when generate posterframe: \n" + received_data + "</span>" ;
				inspector.show_log_msg(msg);
				alert( $(msg).text() )
		}else{
			// Notification msg ok
			var msg = "<span class='ok'>"+received_data+"</span>";
				inspector.show_log_msg(msg);
		}
	})
	// FAIL ERROR
	.fail(function(error_data) {
		// Notify to log messages in top of page
		var msg = "<span class='error'>ERROR: on generate_identifying_image data:" + error_data + "</span>";
		inspector.show_log_msg(msg);
		if(SHOW_DEBUG===true) console.log(error_data);
	})
	// ALWAYS
	.always(function() {
		html_page.loading_content( wrap_div_tool, 0 );
	})

}//end generate_identifying_image
