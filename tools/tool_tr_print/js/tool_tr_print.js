// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_tr_print} from './render_tool_tr_print.js'
	import {tr} from '../../../core/common/js/tr.js'



/**
* TOOL_TRANSCRIPTION
* Tool to translate contents from one language to other in any text component
*/
export const tool_tr_print = function () {

	this.id							= null
	this.model						= null
	this.mode						= null
	this.node						= null
	this.ar_instances				= null
	this.status						= null
	this.events_tokens				= []
	this.type						= null
	this.source_lang				= null
	this.target_lang				= null
	this.langs						= null
	this.caller						= null
	this.transcription_component	= null // component text area where we are working into the tool
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_tr_print.prototype.render	= tool_common.prototype.render
	tool_tr_print.prototype.destroy	= common.prototype.destroy
	tool_tr_print.prototype.refresh	= common.prototype.refresh
	tool_tr_print.prototype.edit	= render_tool_tr_print.prototype.edit



/**
* INIT
* @param object options
* @return bool true
*/
tool_tr_print.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.langs			= page_globals.dedalo_projects_default_langs
		self.source_lang	= self.caller && self.caller.lang
			? self.caller.lang
			: null
		self.target_lang	= null


	return common_init
}//end init



/**
* BUILD
* @param bool autoload = false
* @return object self
*/
tool_tr_print.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// transcription_component. fix transcription_component for convenience
			const transcription_component_tipo	= self.caller.tipo
			self.transcription_component		= self.ar_instances.find(el => el.tipo===transcription_component_tipo)
			self.ar_raw_data					= self.transcription_component.data.value

			self.tags_info	= await self.transcription_component.get_tags_info(['index','note','reference'])
	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_RELATION_LIST
* Get the list of related sections with the actual resource
* @return object datum
*/
tool_tr_print.prototype.load_relation_list = async function() {

	const self = this

	const transcription_component = self.transcription_component

	const source = {
		action			: 'related_search',
		model			: transcription_component.model,
		tipo			: transcription_component.tipo,
		section_tipo	: transcription_component.section_tipo,
		section_id		: transcription_component.section_id,
		lang			: transcription_component.lang,
		mode			: 'related_list'
	}

	const sqo = {
		section_tipo		: ['all'],
		mode				: 'related',
		// limit				: 1,
		offset				: 0,
		full_count			: false,
		filter_by_locators	: [{
			section_tipo	: transcription_component.section_tipo,
			section_id		: transcription_component.section_id
		}]
	}

	const rqo = {
		action	: 'read',
		source	: source,
		sqo		: sqo
	}

	// get context and data
		const api_response = await data_manager.request({
			body : rqo
		})

	const datum = api_response.result


	return datum
}//end load_relation_list



/**
* TAGS_TO_HTML
* Parses Dédalo server side tags to html tags
* i.e. '[TC_00:15:12:01.000]' => '<img id="[TC_00:00:25.684_TC]" class="tc" src="" ... />'
*/
tool_tr_print.prototype.tags_to_html = function(value) {

	const html = (value)
		? tr.add_tag_img_on_the_fly(value)
		: null

	return html
}//end tags_to_html



/**
* BUILD_SUBTITLES
* @return object self.service_subtitles
*/
tool_tr_print.prototype.build_subtitles = async function() {

	const component_text_area = self.transcription_component || await self.get_component(self.lang)

	// get instance and init
		self.service_subtitles = await get_instance({
			model				: 'service_subtitles',
			mode				: 'edit',
			caller				: self,
			component_text_area	: component_text_area
		})

	self.ar_instances.push(self.service_subtitles)

	await self.service_subtitles.build()


	return self.service_subtitles
}// end build_subtitles



// @license-end
