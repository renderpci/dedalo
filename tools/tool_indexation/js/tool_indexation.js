// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DD_TIPOS */
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common, load_component} from '../../tool_common/js/tool_common.js'
	import {render_tool_indexation} from './render_tool_indexation.js'
	import {event_manager} from '../../../core/common/js/event_manager.js'



/**
* TOOL_INDEXATION
* Tool to translate contents from one language to other in any text component
*/
export const tool_indexation = function () {

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
	this.caller						= null // component text area base optional
	this.transcription_component	= null // component text area where we are working into the tool
	this.indexing_component			= null // component_relation_index used to store indexation locators
	this.related_sections_list		= null // datum of related_sections_list (to obtain list of top_section_tipo/id)

	// indexation info notes
	this.DEDALO_INDEXATION_SECTION_TIPO		= 'rsc377'
	this.DEDALO_INDEXATION_TITLE_TIPO		= 'rsc379'
	this.DEDALO_INDEXATION_DESCRIPTION_TIPO	= 'rsc380'


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_indexation.prototype.render	= tool_common.prototype.render
	tool_indexation.prototype.destroy	= common.prototype.destroy
	tool_indexation.prototype.refresh	= common.prototype.refresh
	tool_indexation.prototype.edit		= render_tool_indexation.prototype.edit



/**
* INIT
*
* @param object options
* Sample:
* {
*	lang: "lg-eng"
*	mode: "edit"
*	model: "tool_indexation"
*	section_id: "1"
*	section_tipo: "rsc167"
*	tipo: "rsc36"
*	tool_config: {section_id: "2", section_tipo: "dd1324", name: "tool_indexation", label: "Tool Indexation", icon: "/v6/tools/tool_indexation/img/icon.svg", …}
* }
*/
tool_indexation.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// self.tool_config check
		if (!self.tool_config) {
			self.error = "Invalid self.tool_config"
			console.warn(self.error, 'options:', options);
			return false
		}

	// set the self specific vars not defined by the generic init (in tool_common)
		self.langs = page_globals.dedalo_projects_default_langs

	// label_states
		self.label_states = [
			{
				label	: get_label.label_normal || 'Normal',
				value	: 'n'
			},
			{
				label	: get_label.label_deleted || 'Deleted',
				value	: 'd'
			},
			{
				label	: get_label.label_to_review || 'To review',
				value	: 'r'
			}
		]

	// id_base from transcription_component. Needed to set event subscriptions on init
		const transcription_component_ddo = self.tool_config.ddo_map.find(el => el.role==='transcription_component')
		if (!transcription_component_ddo) {
			self.error = "Invalid transcription_component_ddo:"
			console.warn(self.error, 'options:', options);
			return false
		}
		const id_base = transcription_component_ddo.section_tipo +'_'+ transcription_component_ddo.section_id +'_'+ transcription_component_ddo.tipo

	// load libs
		// common.prototype.load_script(DEDALO_TOOLS_URL + '/tool_indexation/js/lib/split.min.js')


	// events
		// delete_tag_
			// self.events_tokens.push(
			// 	event_manager.subscribe('delete_tag_' + self.id, fn_delete_tag)
			// )
			// function fn_delete_tag(options) {

			// 	// options
			// 	const tag_id = options.tag_id

			// 	self.delete_tag(tag_id)
			// 	.then(function(response){
			// 		if (response.result!==false) {
			// 			// indexing_component. Remember force clean full data and datum before refresh
			// 				self.indexing_component.data	= null
			// 				self.indexing_component.datum	= null
			// 				self.indexing_component.refresh()
			// 			// transcription_component (text_area)
			// 				self.transcription_component.refresh()
			// 		}
			// 	})
			// }

		// click_no_tag_
			self.events_tokens.push(
				event_manager.subscribe('click_no_tag_' + id_base, fn_click_no_tag)
			)
			function fn_click_no_tag() {
				// reset selection
					self.active_tag_id = null

				// tag_info_container . Hide
					if (!self.tag_info_container.classList.contains('hide')) {
						self.tag_info_container.classList.add('hide')
					}

				// indexation_note_container . Clean
					while (self.indexation_note.lastChild) {
						self.indexation_note.removeChild(self.indexation_note.lastChild)
					}
			}

		// click_tag_index_. Observe user tag selection in text area.
			// (!) Note subscribe uses 'id_base' instead 'self.id' to allow switch main component lang
			self.events_tokens.push(
				event_manager.subscribe('click_tag_index_'+ id_base, fn_click_tag_index)
			)
			function fn_click_tag_index(options) {
				if(SHOW_DEVELOPER===true) {
					dd_console(`+++++++ [tool_indexation] click_tag_index ${id_base}`, 'DEBUG', options)
				}

				// options
					const tag				= options.tag || {} // object
					// const caller			= options.caller // instance of component text area
					// const text_editor	= options.text_editor // not used

				// short vars
					const tag_id	= tag.tag_id
					const state		= tag.state
					const data		= tag.data

				// fix selected tag
					self.active_tag_id = tag_id

				// force to update registered active values
					self.update_active_values([
						{
							name	: 'tag_id',
							value	: tag_id
						},
						{
							name	: 'state',
							value	: state
						}
					])

				// indexation_note
					self.render_indexation_note(tag)
					.then(function(tag_note_node){
						if (tag_note_node) {
							// container. Get and clean
							const container	= self.indexation_note
							while (container.lastChild) {
								container.removeChild(container.lastChild)
							}
							container.appendChild(tag_note_node)
						}
					})

				return true
			}//end fn_click_tag_index


	return common_init
}//end init



/**
* BUILD_CUSTOM
* @param bool autoload = false
* @return bool
*/
tool_indexation.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(self, autoload)


	try {

		// transcription_component. fix transcription_component for convenience
			const transcription_component_ddo	= self.tool_config.ddo_map.find(el => el.role==='transcription_component')
			self.transcription_component		= self.ar_instances.find(el => el.tipo===transcription_component_ddo.tipo)
			// force change lang if related_component_lang is defined (original lang)
			if (self.transcription_component.context.options && self.transcription_component.context.options.related_component_lang) {
				if (self.transcription_component.lang !== self.transcription_component.context.options.related_component_lang) {
					self.transcription_component.lang = self.transcription_component.context.options.related_component_lang
					// build again to force download data
					await self.transcription_component.build(true)
					if(SHOW_DEBUG===true) {
						console.log('Changed transcription_component lang to related_component_lang:', self.transcription_component.lang);
					}
				}
			}

		// indexing_component. fix indexing_component for convenience
			const indexing_component_ddo	= self.tool_config.ddo_map.find(el => el.role==='indexing_component')
			self.indexing_component			= self.ar_instances.find(el => el.tipo===indexing_component_ddo.tipo)
			// show_interface
			self.indexing_component.show_interface.tools = false

		// media_component. fix media_component for convenience
			const media_component_ddo	= self.tool_config.ddo_map.find(el => el.role==='media_component')
			self.media_component		= self.ar_instances.find(el => el.tipo===media_component_ddo.tipo)
			// show_interface
			self.media_component.show_interface.tools = false

		// area_thesaurus. fix area_thesaurus for convenience
			const area_thesaurus_ddo	= self.tool_config.ddo_map.find(el => el.role==='area_thesaurus')
			self.area_thesaurus			= self.ar_instances.find(el => el.tipo===area_thesaurus_ddo.tipo)
			// set instance in thesaurus mode 'relation'
			self.area_thesaurus.context.thesaurus_mode	= 'relation'
			self.area_thesaurus.caller					= self
			self.area_thesaurus.linker					= self.indexing_component

		// status_user. control the tool status process for users
			const status_user_ddo		= self.tool_config.ddo_map.find(el => el.role==="status_user_component")
			self.status_user_component	= self.ar_instances.find(el => el.tipo===status_user_ddo.tipo)

		// status_admin. control the tool status process for administrators
			const status_admin_ddo		= self.tool_config.ddo_map.find(el => el.role==="status_admin_component")
			self.status_admin_component	= self.ar_instances.find(el => el.tipo===status_admin_ddo.tipo)

		// references_component. Add references into the text
			const references_component	= self.tool_config.ddo_map.find(el => el.role==="references_component")
			self.references_component	= self.ar_instances.find(el => el.tipo===references_component.tipo)

		// related_sections_list. load_related_sections_list. Get the relation list.
		// This is used to build a select element to allow
		// user select the top_section_tipo and top_section_id of current indexation
			self.related_sections_list = await self.load_related_sections_list()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_INDEXING_COMPONENT
* @return promise bool true
*/
	// tool_indexation.prototype.load_indexing_component = async function() {

	// 	const self = this

	// 	// indexing_component
	// 		const component					= self.caller
	// 		const indexing_component_tipo	= component.context.properties.indexing_component

	// 	// search the component instance in the global array of instances first
	// 		const found_instance = instances.find(el => el.tipo===indexing_component_tipo
	// 												 && el.section_id===component.section_id
	// 												 && el.section_tipo===component.section_tipo )

	// 		if (found_instance) {

	// 			// use existing instance

	// 			self.indexing_component = found_instance

	// 		}else{

	// 			// create a new one

	// 			const indexing_component_options = {
	// 				model			: 'component_relation_index',
	// 				tipo			: indexing_component_tipo,
	// 				section_tipo	: component.section_tipo,
	// 				section_id		: component.section_id,
	// 				mode			: 'edit',
	// 				lang			: 'lg-nolan', // The only different property from caller
	// 				context			: {},
	// 				id_variant		: 'tool_indexation'
	// 			}

	// 			// init and build instance
	// 				self.indexing_component = await get_instance(indexing_component_options)
	// 				await self.indexing_component.build(true)

	// 			// store instances to remove on destroy
	// 				self.ar_instances.push(self.indexing_component)
	// 		}

	// 	return true
	// }//end load_indexing_component



/**
* GET_COMPONENT
* Load transcriptions component (text area) configured with the given lang
* @param string lang
* Create / recover and build a instance of current component in the desired lang
* @return object
* component instance
*/
tool_indexation.prototype.get_component = async function(lang) {

	const self = this

	// to_delete_instances. Select current self.transcription_component
		const to_delete_instances = self.ar_instances.filter(el => el===self.transcription_component)

	// options (clone and edit)
		const options = Object.assign(clone(self.transcription_component.context),{
			self				: self,
			lang				: lang,
			mode				: 'edit',
			section_id			: self.transcription_component.section_id,
			to_delete_instances	: to_delete_instances // array of instances to delete after create the new one
		})

	// call generic common tool build
		const component_instance = await load_component(options);

	// fix instance (overwrite)
		self.transcription_component = component_instance


	return component_instance
}//end get_component



/**
* LOAD_RELATED_SECTIONS_LIST
* Get the list of related sections with the actual resource
* Uses transcriptions component (component_text_area) to get
* related sections
* @return object datum
*/
tool_indexation.prototype.load_related_sections_list = async function() {

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
		limit				: 10,
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
}//end load_related_sections_list



/**
* GET_THESAURUS
* Creates a instance of area_thesaurus ready to render
* @return instance
*/
	// tool_indexation.prototype.get_thesaurus = async function() {

	// 	// short vars
	// 		const tipo	= 'dd100';
	// 		const model	= 'area_thesaurus';
	// 		const lang	= self.lang || page_globals.dedalo_data_lang
	// 		const mode	= 'list';


	// 	// context
	// 		const context = {
	// 			type			: 'area',
	// 			typo			: 'ddo',
	// 			tipo			: tipo,
	// 			section_tipo	: tipo,
	// 			lang			: lang,
	// 			mode			: mode,
	// 			model			: 'section',
	// 			parent			: tipo,
	// 			// request_config	: request_config
	// 		}

	// 	// instance options
	// 		const instance_options = {
	// 			model			: model,
	// 			tipo			: tipo,
	// 			section_tipo	: tipo,
	// 			mode			: mode,
	// 			lang			: lang,
	// 			context			: context,
	// 			caller			: self
	// 		}

	// 	// init section instance
	// 		const area_thesaurus = await get_instance(instance_options)

	// 	// set instance in thesaurus mode 'relation'
	// 		area_thesaurus.thesaurus_mode = "relation"

	// 	// build instance
	// 		await area_thesaurus.build()


	// 	return area_thesaurus
	// }//end get_thesaurus



/**
* CREATE FRAGMENT
* Create the images (with the tags) at the beginning and the end of the selected text, and save the data
*/
	// tool_indexation.prototype.create_fragment = function ( button_obj, event ) {
	// 	dd_console('button_obj','DEBUG', button_obj)

	// 	return alert("Don't use this function! Use compoent_text_area function instead")

	// 	event.preventDefault()
	// 	event.stopPropagation()

	// 	// btn dataset vars
	// 		const identificador_unico	= button_obj.dataset.identificador_unico
	// 		const parent				= button_obj.dataset.parent
	// 		const tipo					= button_obj.dataset.tipo
	// 		const section_tipo			= button_obj.dataset.section_tipo
	// 		const lang					= button_obj.dataset.lang

	// 	// component_id is 'dataset.identificador_unico'
	// 		const component_id = identificador_unico

	// 	// ed. Select current editor
	// 		const ed = tinyMCE.get(component_id);
	// 		if ($(ed).length<1) { return alert("Editor " + component_id + " not found [1]!") }

	// 	// current_text_area
	// 		const current_text_area = document.getElementById(component_id);
	// 		if (!current_text_area) {
	// 			return alert("Editor " + component_id + " not found [2]!")
	// 		}

	// 	// last_tag_index_id
	// 		const last_tag_index_id = parseInt( component_text_area.get_last_tag_id(ed, 'index') )

	// 	// string_selected
	// 		const string_selected	= ed.selection.getContent({format : 'raw'}); // Get the selected text in raw format
	// 		const string_len		= string_selected.length ;
	// 		if(string_len<1) return alert("Please, select a text fragment before ! " +string_len);

	// 	// New tag_id to use
	// 		const tag_id = parseInt(last_tag_index_id+1);		//alert("new tag_id:"+last_tag_index_id + " "+component_id); return false;

	// 	// State. Default is 'n' (normal)
	// 		const state = 'n';

	// 	// Final string to replace
	// 		const image_in  = component_text_area.build_dom_element_from_data('indexIn', tag_id, state, "label in "+tag_id, '')
	// 		const image_out = component_text_area.build_dom_element_from_data('indexOut', tag_id, state, "label out "+tag_id, '')

	// 	// Get selection range
	// 		const range			= ed.selection.getRng(0)
	// 		const range_clon	= range.cloneRange()
	// 	// Save start and end position
	// 		const startOffset		= range_clon.startOffset
	// 		const startContainer	= range_clon.startContainer
	// 		range_clon.collapse(false)	// Go to end of range position

	// 	// Insert end out image
	// 		range_clon.insertNode(image_out)

	// 	// Positioned to begin of range
	// 		range_clon.setStart(startContainer, startOffset)

	// 	// Insert note at beginning of range
	// 		range_clon.collapse(true) // Go to start of range position
	// 		range_clon.insertNode(image_in)

	// 	// Force ed dirty state
	// 		ed.setDirty(true);

	// 	// Update last_tag_index_id data on current text area
	// 		current_text_area.dataset.last_tag_index_id = tag_id

	// 	// Force update and save real text area content (and save is triggered when text area changes)
	// 		const js_promise = component_text_area.Save(current_text_area, null, ed)
	// 		.then(function(response) {
	// 			// fragment_info update
	// 			tool_indexation.fragment_info(image_in, tipo, parent, section_tipo, lang);	//tag_obj, tipo, parent, section_tipo, lang
	// 		})

	// 	// Hide "Create New Fragment" button
	// 		button_obj.style.display = 'none'

	// 	return js_promise
	// }//end create_fragment



/**
* CREATE_INDEXATION (REMOVED 04-05-2022 NOT USED ANYMORE)
* Add a new locator value to the target indexing_component (component_relation_index usually)
* @param object data
* 	{ section_tipo, section_id, label } from thesaurus selected term
* @return boolean from portal.add_value method
*/
	// tool_indexation.prototype.create_indexation = async function ( data ) {

	// 	const self = this

	// 	// tag_id. Previously selected by user. Check if is already selected before continue
	// 		const tag_id = self.active_tag_id || false
	// 		if(!tag_id){
	// 			console.warn("Must to be selected a index tag in text to continue");
	// 			alert("Please select a tag");
	// 			// should activate the component (focus)
	// 			event_manager.publish('activate_component', self.transcription_component)
	// 			return false
	// 		}

	// 	// locator value. Build from selected term section_tipo, section_id, and selected tag_id
	// 		const new_index_locator = {
	// 			section_id			: data.section_id, // thesaurus term section_id
	// 			section_tipo		: data.section_tipo, // thesaurus term section_tipo
	// 			tag_id				: tag_id, // user selected tag id
	// 			tag_component_tipo	: self.transcription_component.tipo, // (component_text_area tag source)
	// 			section_top_tipo	: self.top_locator.section_top_tipo, // the transcription_component section_tipo to the resource like oh1
	// 			section_top_id		: self.top_locator.section_top_id // the transcription_component section_id to the resource like 4
	// 		}

	// 	// add value to the indexing component
	// 		const result = await self.indexing_component.add_value(new_index_locator)

	// 	// re-filter indexing_component data according current selected tag_id
	// 		self.indexing_component.data.value = self.indexing_component.data.value.filter(el => el.tag_id===tag_id )

	// 	// force render indexing_component content again (as refresh)
	// 		self.indexing_component.render({render_level : 'content'})


	// 	return result
	// }// end create_indexation



/**
* ACTIVE_VALUE
* Set value as 'active'. That's mean current value is frequently updated by events
* @param string name
* @param function callback
* @return boolean
*/
tool_indexation.prototype.active_value = function(name, callback) {

	const self = this

	self.active_elements = self.active_elements || []

	// check already exists in list of active_elements
		const found = self.active_elements.find(el => {
			return el.name===name && el.callback===callback
		})
		if (found) {
			console.warn("Skip already added active value name:", name);
			return false
		}

	// add if not already exists
		self.active_elements.push({
			name		: name,
			callback	: callback
		})

	// debug
		if(SHOW_DEBUG===true) {
			console.warn("self.active_elements added new one:", name, self.active_elements);
		}

	return true
}//end active_value



/**
* UPDATE_ACTIVE_VALUES
* Update all values registered as 'active_value' on fire event
* calling attached callback function
* @param array values
* 	Array of objects as
* 	[
* 	  {
* 		name : 'tag_id',
* 		value : '3'
* 	  },
* 	  ..
* 	]
* @return bool
*/
tool_indexation.prototype.update_active_values = function(values) {

	const self = this

	const values_length = values.length
	for (let i = 0; i < values_length; i++) {

		const item = values[i]

		const founds = self.active_elements.filter(el => el.name===item.name)
		for (let j = 0; j < founds.length; j++) {

			const found = founds[j]
			if (found.callback) {
				found.callback(item.value)
			}
		}
	}

	// debug
		// console.log("Fired update_active_values self.active_elements list:", self.active_elements);


	return true
}//end update_active_values



/**
* DELETE_TAG
* Remove selected tag an all relations / indexes associated
* Delete / remove current tag in all component langs, all references (inverse) in all portals and index record (matrix descriptors)
* @param object button_obj
* @return promise
*/
tool_indexation.prototype.delete_tag = function(tag_id) {

	const self = this

	// Confirm action
		if( !confirm( `${self.get_tool_label('delete_tag') || 'Delete tag?'}\nID: ${tag_id}`) ) {
			return Promise.resolve(false)
		}
		if( !confirm(
			`${get_label.warning || 'Warning!'} !! ${self.get_tool_label('warning_delete_tag') || 'It will delete the selected tag in all languages and all the relationships and indexing associated with it'}`)
			) {
			return Promise.resolve(false)
		}

	// call to the API, fetch data and get response
	return new Promise(async function(resolve){

		// delete tag in all langs (component_text_area)
			const api_response_delete_tag = self.transcription_component.delete_tag(
				tag_id,
				'index'
			)
			.catch(error => {
				console.error('ERROR: delete_tag found errors')
				console.error(error.message)
			});
			// transcription_component response
			if (api_response_delete_tag.result===false) {
				// error case
				const msg = api_response_delete_tag.msg
					? api_response_delete_tag.msg.join('\n')
					: 'Unknown error'
				alert(
					(self.get_tool_label('error_delete_tag') || 'Error on delete tag') + '\n' + msg
				)
			}

		// delete_locator (component_portal)
			const api_response_delete_locator = self.indexing_component.delete_locator(
				// object locator
				{
					tag_id	: tag_id,
					type	: DD_TIPOS.DEDALO_RELATION_TYPE_INDEX_TIPO // dd96
				},
				// array ar_properties
				['tag_id','type']
			)
			.catch(error => {
				console.error('ERROR: delete_locator found errors')
				console.error(error.message)
			});
			// indexing_component response
			if (api_response_delete_locator.result===false) {
				// error case
				const msg = api_response_delete_locator.msg
					? api_response_delete_locator.msg.join('\n')
					: 'Unknown error'
				alert(
					(self.get_tool_label('error_delete_locator') || 'Error on delete locator') + '\n' + msg
				)
			}else{
				// indexing_component. Remember force clean full data and datum before refresh
				self.indexing_component.data	= null
				self.indexing_component.datum	= null
				self.indexing_component.refresh()
			}

		// response
			const response = {
				'delete_tag'		: api_response_delete_tag,
				'delete_locator'	: api_response_delete_locator
			}

		resolve(response)
	})
}//end delete_tag



// @license-end
