// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common, load_component} from '../../tool_common/js/tool_common.js'
	import {render_tool_tc} from './render_tool_tc.js'




/**
* TOOL_TC
* Tool to manage time codes
*/
export const tool_tc = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
	this.type			= null

	this.source_lang	= null
	//this.target_lang
	this.langs			= null
	this.caller			= null
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_tc.prototype.render	= tool_common.prototype.render
	tool_tc.prototype.destroy	= common.prototype.destroy
	tool_tc.prototype.refresh	= common.prototype.refresh
	tool_tc.prototype.edit		= render_tool_tc.prototype.edit



/**
* INIT
* @param object options
* @return bool common_init
*/
tool_tc.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.langs			= page_globals.dedalo_projects_default_langs
		self.source_lang	= self.caller.lang


	return common_init
}//end init



/**
* BUILD_CUSTOM
* @param bool autoload = false
* @return bool common_build
*/
tool_tc.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// main_element. fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_COMPONENT
* @param string lang
* @return object component_instance
*/
tool_tc.prototype.get_component = async function(lang) {

	const self = this

	// to_delete_instances. Select instances with different lang to the desired
		const to_delete_instances = self.ar_instances.filter(el => el.lang!==lang)

	// options (clone context and edit)
		const options = Object.assign(clone(self.main_element.context),{
			self				: self,
			lang				: lang,
			mode				: 'edit',
			section_id			: self.main_element.section_id,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		})

	// call generic common tool build
		const component_instance = await load_component(options);


	return component_instance
}//end get_component



/**
* CHANGE_ALL_TIME_CODES
* Replace current tc tags with the new calculated values
* @param int offset_seconds
* @return promise
*/
tool_tc.prototype.change_all_time_codes = function(offset_seconds) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'change_all_timecodes')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				component_tipo	: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				lang			: self.main_element.lang,
				offset_seconds	: offset_seconds,
				key				: null
			}
		}

	// call to the API, fetch data and get response
	return new Promise(function(resolve){

		data_manager.request({
			body : rqo,
			retries : 1, // one try only
			timeout : 120 * 1000 // 120 secs waiting response
		})
		.then(function(response){
			if(SHOW_DEVELOPER===true) {
				dd_console("-> change_all_time_codes API response:",'DEBUG',response);
			}

			const result = response.result // array of changed tc

			resolve(result)
		})
	});
}//end change_all_time_codes



/**
* ADD_TIME_CODE_OFFSET
*/
	// tool_tc.prototype.add_time_code_offset = function (tc_tag, offset) {

	// 	tc_tag = tc_tag.replace('[TC_','').replace('_TC]','')

	// 	const ar_tag_tc 	= tc_tag.split(':')
	// 	const ar_seconds 	= ar_tag_tc[2].split('.')

	// 	const hours 	= (ar_tag_tc[0])	? Number(ar_tag_tc[0])	: 0
	// 	const minutes 	= (ar_tag_tc[1]) 	? Number(ar_tag_tc[1]) 	: 0
	// 	const seconds 	= (ar_seconds[0]) 	? Number(ar_seconds[0])	: 0
	// 	const mseconds 	= (ar_seconds[1]) 	? ar_seconds[1]			: 0

	// 	const total_secs = (hours * 3600) + (minutes * 60) + seconds + Number(offset)

	// 	const new_hours 	= parseInt(total_secs / 3600)
	// 	const new_minutes 	= parseInt((total_secs % 3600) / 60)
	// 	const new_seconds	= total_secs - (new_hours * 3600 + new_minutes * 60)

	// 	const new_tag = '[TC_'.concat(new_hours.toString().padStart(2, '0'), ':', new_minutes.toString().padStart(2, '0'), ':', new_seconds.toString().padStart(2, '0'), '.', mseconds, '_TC]')

	// 	return new_tag
	// }//end add_time_code_offset



// @license-end
