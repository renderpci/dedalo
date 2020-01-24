// import
	import {data_manager} from '../../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../common/js/instances.js'
	import {common} from '../../../common/js/common.js'
	import {tool_common} from '../../../tool_common/js/tool_common.js'
	import {render_tool_tc, add_component} from './render_tool_tc.js'



/**
* TOOL_TC
* Tool to manage time codes
*/
export const tool_tc = function () {

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
	tool_tc.prototype.render 	= common.prototype.render
	tool_tc.prototype.destroy 	= common.prototype.destroy
	tool_tc.prototype.edit 		= render_tool_tc.prototype.edit



/**
* INIT
*/
tool_tc.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url 	= DEDALO_CORE_URL + "/tools/tool_tc/trigger.tool_tc.php"
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
tool_tc.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(this, autoload);

	// specific actions..


	return common_build
}//end build_custom



/**
* LOAD_COMPONENT
*/
tool_tc.prototype.load_component = async function(lang) {

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
		datum 			: component.datum,
		//sqo_context 	: component.sqo_context
	})

	await component_instance.build(true)

	// set current tool as component caller (to check if component is inside tool or not)
		component_instance.caller = this

	// add
		const instance_found = self.ar_instances.find( el => el===component_instance )
		if (component_instance!==self.caller && typeof instance_found==="undefined") {
			self.ar_instances.push(component_instance)
		}


	return component_instance
}//end load_component



/**
* CHANGE_ALL_TIME_CODES
*/
tool_tc.prototype.change_all_time_codes = async function(save) {
	//this.change_all_timecodes = function( button_obj, save ) {

	var response_div 		= document.getElementById('response_div')
	var tc_target_content 	= document.getElementById('tc_target_content')
	var tc_offset 	 		= document.getElementById('tc_offset')
	
	response_div.innerHTML  = ''
	
	if (tc_offset.value==='' || tc_offset.value===null) {
		//alert('Ops.. Empty tc offset value')
		response_div.innerHTML  = '<span style=\"color:red\">Ops.. Empty tc offset value</span>'
		tc_offset.focus()
		return false
	}

	if (save===true) {
		if( !confirm(get_label.seguro) )  return false;	
		//TODO - change the code to call the trigger only in case save===true 
			//var trigger_vars = {
			//		mode 			: 'change_all_timecodes',
			//		tipo 			: tc_offset.dataset.tipo,
			//		section_tipo 	: tc_offset.dataset.section_tipo,
			//		parent 			: parseInt(tc_offset.dataset.parent),
			//		lang 			: tc_offset.dataset.lang,
			//		offset_seconds 	: parseInt(tc_offset.value),
			//		save 			: save,	
			//}
			////return console.log("[tool_tc.change_all_timecodes] trigger_vars",trigger_vars);
		
			//html_page.loading_content( tc_content_right, 1 );
		
			//// Return a promise of XMLHttpRequest
			//var js_promise = common.get_json_data(this.url_trigger, trigger_vars).then(function(response) {
			//		if(SHOW_DEBUG===true) {
			//			console.log("[tool_tc.change_all_timecodes]",response)
			//		}
		
			//		if (response===null) {
			//			response_div.innerHTML  = "<span style=\"color:red\">Error on change timecode tags</span>";							
			//		}else{							
		
			//			// msg
			//			response_div.innerHTML  = response.msg;
		
			//			// Reloads page
			//			if (save===true) {
			//				tc_content_right.innerHTML  = "Reloading.."
			//				window.location.href 		= window.location.href
			//			}else{
			//				// result text
			//				tc_content_right.innerHTML 	= response.result
			//			}
			//		}
		
			//		html_page.loading_content( tc_content_right, 0 );												
			//})

				//return js_promise
	} else {
			console.log("tc_target_content:",tc_target_content)
			alert("preview")

	}

	return true
}//end change_all_time_codes