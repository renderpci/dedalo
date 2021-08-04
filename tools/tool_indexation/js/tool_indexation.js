/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {instances, get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_indexation, add_component} from './render_tool_indexation.js'
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
	this.related_sections_list		= null // datum of related_sections_list (to obtaim list of top_section_tipo/id)


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_indexation.prototype.render 	= common.prototype.render
	tool_indexation.prototype.destroy 	= common.prototype.destroy
	tool_indexation.prototype.edit 		= render_tool_indexation.prototype.edit



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

	// set the self specific vars not defined by the generic init (in tool_common)
		self.lang	= options.lang // from page_globals.dedalo_data_lang
		self.langs	= page_globals.dedalo_projects_default_langs

	// id_base from transcription_component. Needed to set event subscriptions on init
		const transcription_component_ddo = options.tool_config.ddo_map.find(el => el.role==='transcription_component')
		const id_base = transcription_component_ddo.section_tipo +'_'+ transcription_component_ddo.section_id +'_'+ transcription_component_ddo.tipo

	// events
		// link_term. Observe thesaurus tree link index button click
			self.events_tokens.push(
				event_manager.subscribe('link_term', self.create_indexation.bind(self))
			)
		// change_tag_state_. change tag state selector
			self.events_tokens.push(
				event_manager.subscribe('change_tag_state_' + self.id, fn_change_tag_state)
			)
			function fn_change_tag_state(options) {
				console.warn("tag_state options:",options);

				// options
					const tag_id	= options.tag_id
					const value		= options.value

				// update_tag
					return self.transcription_component.update_tag({
						type	: 'indexIn',
						tag_id	: tag_id,
						dataset	: {
							state : value
						},
						save	: true
					})
			}
		// delete_tag_
			self.events_tokens.push(
				event_manager.subscribe('delete_tag_' + self.id, fn_delete_tag)
			)
			function fn_delete_tag(options) {

				// options
				const tag_id = options.tag_id

				self.delete_tag(tag_id)
				.then(function(response){
					if (response.result!==false) {
						// indexing_component. Remember force clean full data and datum before refresh
							self.indexing_component.data	= null
							self.indexing_component.datum	= null
							self.indexing_component.refresh()
						// transcription_component (text_area)
							self.transcription_component.refresh()
					}
				})
			}
		// click_no_tag_
			self.events_tokens.push(
				event_manager.subscribe('click_no_tag_' + id_base, fn_click_no_tag)
			)
			function fn_click_no_tag(options) {
				if (!self.info_container.classList.contains('hide')) {
					self.info_container.classList.add('hide')
				}
			}
		// click_tag_index_. Observe user tag selection in text area.
		// (!) Note subscribe uses 'id_base' instead 'self.id' to allow switch main component lang
			self.events_tokens.push(
				event_manager.subscribe('click_tag_index_'+ id_base, fn_click_tag_index)
			)
			function fn_click_tag_index(options) {
				dd_console(`click_tag_index '${options}'`, 'DEBUG', options)

				// options
					const tag_element	= options.tag // DOM node selected
					const caller		= options.caller // instance of component text area

				// fix selected tag
					self.active_tag_id = tag_element.dataset.tag_id

				// force to update registered active values
					self.update_active_values([{
						name	: "tag_id",
						value	: tag_element.dataset.tag_id
					},
					{
						name	: "state",
						value	: tag_element.dataset.state
					}])

				return true
			}//end fn_click_tag_index


	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);

	return common_init
};//end init



/**
* BUILD_CUSTOM
*/
tool_indexation.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(self, autoload)


	// transcription_component. fix transcription_component for convenience
		const transcription_component_ddo	= self.tool_config.ddo_map.find(el => el.role==="transcription_component")
		self.transcription_component		= self.ar_instances.find(el => el.tipo===transcription_component_ddo.tipo)

	// indexing_component. fix indexing_component for convenience
		const indexing_component_ddo	= self.tool_config.ddo_map.find(el => el.role==="indexing_component")
		self.indexing_component			= self.ar_instances.find(el => el.tipo===indexing_component_ddo.tipo)

	// area_thesaurus. fix area_thesaurus for convenience
		const area_thesaurus_ddo	= self.tool_config.ddo_map.find(el => el.role==="area_thesaurus")
		self.area_thesaurus			= self.ar_instances.find(el => el.tipo===area_thesaurus_ddo.tipo)
		// set instance in thesaurus mode 'relation'
		self.area_thesaurus.thesaurus_mode = "relation"

	// related_sections_list. load_related_sections_list. Get the relation list.
	// This is used to build a select element to allow
	// user select the top_section_tipo and top_section_id of current indexation
		self.related_sections_list = await self.load_related_sections_list()


	return common_build
};//end build_custom



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
	// };//end load_indexing_component



/**
* GET_COMPONENT
* Load transcriptions component (text area) configured with the given lang
* @param string lang
* Create / recover and build a instance of current component in the desired lang
* @return object instance
*/
tool_indexation.prototype.get_component = async function(lang) {

	const self = this

	const component		= self.transcription_component
	const section_id	= component.section_id
	const context		= JSON.parse(JSON.stringify(component.context))
		  context.lang 	= lang

	// destroy previous component instances
		const instance_index = self.ar_instances.findIndex( el => el.id===self.transcription_component.id)
		// remove from array of instances
		if (instance_index!==-1) {
			// destroy instance
			await self.transcription_component.destroy()
			self.ar_instances.splice(instance_index, 1)
		}else{
			console.error("Error on delete previous transcription_component instance")
		}

	// new instance options
		const instance_options = {
			model			: context.model,
			tipo			: context.tipo,
			section_tipo	: context.section_tipo,
			section_id		: section_id,
			mode			: 'edit',
			lang			: lang, // The only different property from self.transcription_component
			section_lang	: context.lang,
			context			: context,
			id_variant		: 'tool_indexation'
			// data			: {value:[]},
			// datum		: null
		}
	// dd_console(`instance_options`,'DEBUG', instance_options)

	const instance = await get_instance(instance_options)

	// set tool as caller of the component :-)
	instance.caller = self

	// build instance
	await instance.build(true)

	// store instances to remove on destroy
	self.ar_instances.push(instance)

	// fix instance
	self.transcription_component = instance

	// debug
		if(SHOW_DEBUG===true) {
			// dd_console('self.ar_instances','DEBUG',self.ar_instances)
		}


	return instance
};//end get_component



/**
* LOAD_RELATED_SECTIONS_LIST
* Get the list of related sections with the actual resource
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
		const current_data_manager	= new data_manager()
		const api_response			= await current_data_manager.request({body:rqo})

	const datum = api_response.result

	return datum
};//end load_related_sections_list



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
	// };//end get_thesaurus



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
	// };//end create_fragment



/**
* CREATE_INDEXATION
* Add a new locator value to the target indexing_component (component_relation_index usually)
* @param object data
* 	{ section_tipo, section_id, label } from thesaurus selected term
* @return boolean from portal.add_value method
*/
tool_indexation.prototype.create_indexation = async function ( data ) {

	const self = this

	// tag_id. Previously selected by user. Check if is already selected before continue
		const tag_id = self.active_tag_id || false
		if(!tag_id){
			console.warn("Needs to be selected a index tag in text to continue");
			alert("Please select a tag");
			// should activate the component (focus)
			event_manager.publish('active_component', self.transcription_component)
			return false
		}

	// locator value. Build from selected term section_tipo, section_id, and selected tag_id
		const new_index_locator = {
			section_id			: data.section_id, // thesaurus term section_id
			section_tipo		: data.section_tipo, // thesaurus term section_tipo
			tag_id				: tag_id, // user selected tag id
			tag_component_tipo	: self.transcription_component.tipo, // (component_text_area tag source)
			section_top_tipo	: self.top_locator.section_top_tipo, // the transcription_component section_tipo to the resource like oh1
			section_top_id		: self.top_locator.section_top_id // the transcription_component section_id to the resource like 4
		}

	// add value to the indexing component
		const result = await self.indexing_component.add_value(new_index_locator)

	// re-filter indexing_component data according current selected tag_id
		self.indexing_component.data.value = self.indexing_component.data.value.filter(el => el.tag_id===tag_id )
	
	// force render indexing_component content again (as refresh)
		self.indexing_component.render({render_level : 'content'})

	return result
}// end create_indexation



/**
* ACTIVE_VALUE
* Set value as 'active'. That's mean current value is frequently updated by events
* @return boolean
*/
tool_indexation.prototype.active_value = function(name, callback) {

	self.active_elements = self.active_elements || []

	// check already exists in list of active_elements
		const found = self.active_elements.find(el => el.name===name && el.callback===callback)
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
			console.warn("self.active_elements added one:", name, self.active_elements);
		}

	return true
};//end active_value




/**
* UPDATE_ACTIVE_VALUES
* Update all values registered as 'active_value' on fire event
* @return boolean
*/
tool_indexation.prototype.update_active_values = function(values) {

	for (let i = 0; i < values.length; i++) {

		const item = values[i]

		const founds = self.active_elements.filter(el => el.name===item.name)
		for (let j = 0; j < founds.length; j++) {

			const found = founds[j]
			if (found.callback) {
				found.callback(item.value)
			}
		}
	}
	// console.log("Fired update_active_values self.active_elements list:", self.active_elements);

	return true
};//end update_active_values



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
		if( !confirm( `${get_label.eliminar_etiqueta} \n ${tag_id} \n`) ) {
			return Promise.resolve(false);
		}
		if( !confirm( `${get_label.atencion} !! \n ${get_label.borrara_la_etiqueta_seleccionada} \n` ) )  {
			return Promise.resolve(false);
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'delete_tag'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'delete_tag')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_tipo					: self.transcription_component.section_tipo, // current component_text_area section_tipo
			section_id						: self.transcription_component.section_id, // component_text_area section_id
			transcription_component_tipo	: self.transcription_component.tipo, // component_text_area tipo
			transcription_component_lang	: self.transcription_component.lang, // component_text_area lang
			indexing_component_tipo			: self.indexing_component.tipo, // component_relation_xxx used to store indexation locators
			tag_id							: tag_id // current selected tag (passed as param)
		}

	// rqo		
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'tool_request',
			source	: source
		}
	
	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				console.warn("-> delete_tag API response:",response);
				resolve(response)
			})
		})
};//end delete_tag



/**
* CHANGE_TAG_STATE
* @return promise
*/
	// tool_indexation.prototype.change_tag_state = async function(tag_id, value) {

	// 	const self = this

	// 	// text area update tag


	// 	return

	// 	// // source. Note that second argument is the name of the function to manage the tool request like 'change_tag_state'
	// 	// // this generates a call as my_tool_name::my_function_name(arguments)
	// 	// 	const source = create_source(self, 'change_tag_state')
	// 	// 	// add the necessary arguments used in the given function
	// 	// 	source.arguments = {
	// 	// 		section_tipo			: self.transcription_component.section_tipo, // current component_text_area section_tipo
	// 	// 		section_id				: self.transcription_component.section_id, // component_text_area section_id
	// 	// 		transcription_component_tipo		: self.transcription_component.tipo, // component_text_area tipo
	// 	// 		transcription_component_lang		: self.transcription_component.lang, // component_text_area lang
	// 	// 		tag_id					: tag_id, // current selected tag (passed as param)
	// 	// 		state					: value // string like 'r'
	// 	// 	}

	// 	// // rqo
	// 	// 	const rqo = {
	// 	// 		dd_api	: 'dd_utils_api',
	// 	// 		action	: 'tool_request',
	// 	// 		source	: source
	// 	// 	}

	// 	// // call to the API, fetch data and get response
	// 	// 	return new Promise(function(resolve){

	// 	// 		const current_data_manager = new data_manager()
	// 	// 		current_data_manager.request({body : rqo})
	// 	// 		.then(function(response){
	// 	// 			console.warn("-> change_tag_state API response:",response);
	// 	// 			resolve(response)
	// 	// 		})
	// 	// 	})
	// };//end change_tag_state


