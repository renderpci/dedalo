// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
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
};//end page



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
		self.trigger_url 	= DEDALO_TOOLS_URL + "/tool_tc/trigger.tool_tc.php"
		self.lang 			= options.lang
		self.langs 			= page_globals.dedalo_projects_default_langs
		self.source_lang 	= options.caller.lang
		//self.target_lang 	= null


	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);


	return common_init
};//end init



/**
* BUILD_CUSTOM
*/
tool_tc.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(this, autoload);

	// specific actions..


	return common_build
};//end build_custom



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
};//end load_component



/**
* CHANGE_ALL_TIME_CODES
*/
tool_tc.prototype.change_all_time_codes = async function(save) {

	//this.change_all_timecodes = function( button_obj, save ) {

	const self = this

	// (!) Esto ya no tiene via directamente accediendo al DOM. Fijar los componentes en el
	// render y pedirle el contenido a ellos


	return false

	const wrapper 	= self.wrapper
	const tc_offset = wrapper.querySelector('#tc_offset')

	if (tc_offset.value==='' || tc_offset.value===null) {
		//response_div.innerHTML  = '<span style=\"color:red\">Ops.. Empty tc offset value</span>'
		const error_empty_offset = 'Ops.. Empty tc offset'
		ui.show_message(wrapper, get_label['error_empty_offset'] || error_empty_offset, 'error', 'response_div', true)

		tc_offset.focus()
		return false
	}

	if (save===true) {

		return self.add_and_save_time_code_offset(wrapper, tc_offset.value)

	} else {

		//Changes only preview, don't updates the DB
			const tc_target_content = wrapper.querySelector('#tc_target_content')
			const ar_images 		= tc_target_content.querySelectorAll('.tc')

			for (let i = 0; i < ar_images.length; i++) {

				const ar_image_string 	= ar_images[i].src.split('/')
				const tc_image_string 	= ar_image_string[ar_image_string.length - 1]
				const new_tc_image_time	= self.add_time_code_offset(tc_image_string, tc_offset.value)

				ar_images[i].src = ar_images[i].src.replace(tc_image_string, new_tc_image_time)
			}

			const msg = 'Total tc tags changed: ' + ar_images.length

			ui.show_message(wrapper, msg, 'ok' , 'response_div', true)
	}

	return true
};//end change_all_time_codes



/**
* ADD_TIME_CODE_OFFSET
*/
tool_tc.prototype.add_time_code_offset = function (tc_tag, offset) {

	tc_tag = tc_tag.replace('[TC_','').replace('_TC]','')

	const ar_tag_tc 	= tc_tag.split(':')
	const ar_seconds 	= ar_tag_tc[2].split('.')

	const hours 	= (ar_tag_tc[0])	? Number(ar_tag_tc[0])	: 0
	const minutes 	= (ar_tag_tc[1]) 	? Number(ar_tag_tc[1]) 	: 0
	const seconds 	= (ar_seconds[0]) 	? Number(ar_seconds[0])	: 0
	const mseconds 	= (ar_seconds[1]) 	? ar_seconds[1]			: 0

	const total_secs = (hours * 3600) + (minutes * 60) + seconds + Number(offset)

	const new_hours 	= parseInt(total_secs / 3600)
	const new_minutes 	= parseInt((total_secs % 3600) / 60)
	const new_seconds	= total_secs - (new_hours * 3600 + new_minutes * 60)

	const new_tag = '[TC_'.concat(new_hours.toString().padStart(2, '0'), ':', new_minutes.toString().padStart(2, '0'), ':', new_seconds.toString().padStart(2, '0'), '.', mseconds, '_TC]')

	return new_tag
};//end add_time_code_offset



/**
* ADD_AND_SAVE_TIME_CODE_OFFSET
*/
tool_tc.prototype.add_and_save_time_code_offset = async function (wrapper, offset) {

	const self = this

	if (!confirm(get_label.seguro))  return false;

	const tc_lang 	= document.getElementById('tc_lang')

	const body = {
		url 			: self.trigger_url,
		mode 			: 'change_all_timecodes',
		component_tipo	: self.caller.tipo,
		section_tipo  	: self.caller.section_tipo,
		section_id 		: self.caller.section_id,
		lang 			: tc_lang.value,
		offset_seconds 	: offset
	}

	const handle_errors = function(response) {
		if (!response.ok) {
			throw Error(response.statusText);
		}
		return response;
	}

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
			body		: JSON.stringify(body)
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

	//trigger_fetch.then((trigger_response)=>{
		// user messages
			const msg_type = (trigger_response.result===false) ? 'error' : 'ok'
			//if (trigger_response.result===false) {
				//ui.show_message(buttons_container, trigger_response.msg, msg_type)
				ui.show_message(wrapper, trigger_response.msg, msg_type , 'response_div', true)

				//response_div.innerHTML  = trigger_response.msg
			//}

		// reload target content
			const target_component_container = self.node[0].querySelector('.target_component_container')
			add_component(self, target_component_container, tc_lang.value)

		// debug
			if(SHOW_DEBUG===true) {
				console.log("trigger_response:",trigger_response);
			}
	//})

	console.log("trigger_response:",trigger_response);

	return trigger_response
};//end add_and_save_time_code_offset
