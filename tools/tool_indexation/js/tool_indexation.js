/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {instances, get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_indexation, add_component} from './render_tool_indexation.js'
	import {event_manager} from '../../../core/common/js/event_manager.js'



/**
* TOOL_INDEXATION
* Tool to translate contents from one language to other in any text component
*/
export const tool_indexation = function () {
	
	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type

	this.source_lang
	this.target_lang
	this.langs
	this.caller // component text area base (user selects tool button from it)
	this.main_component // component text area where we are working into the tool
	this.related_sections_list // datum of related_sections_list (to obtaim list of top_section_tipo/id)


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
* 	caller: component_text_area {id: "component_text_area_rsc36_rsc167_1_edit_lg-eng_rsc167", …}
*	lang: "lg-eng"
*	mode: "edit"
*	model: "tool_indexation"
*	section_id: "1"
*	section_tipo: "rsc167"
*	tipo: "rsc36"
*	tool_object: {section_id: "2", section_tipo: "dd1324", name: "tool_indexation", label: "Tool Indexation", icon: "/v6/tools/tool_indexation/img/icon.svg", …}
* }
*/
tool_indexation.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url 	= DEDALO_CORE_URL + "/tools/tool_indexation/trigger.tool_indexation.php"
		self.lang 			= options.lang // from page_globals.dedalo_data_lang
		self.langs 			= page_globals.dedalo_projects_default_langs

	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// events
		// link_term. Observe thesaurus tree link index button click
			self.events_tokens.push(
				event_manager.subscribe('link_term', self.create_indexation.bind(self))
			)
		// click_tag_index. Observe user tag selection in text area
			self.events_tokens.push(
				event_manager.subscribe('click_tag_index' +'_'+ self.caller.id_base, click_tag_index)
			)
			function click_tag_index(options) {
				// dd_console(`click_tag_index ${options.tag.dataset.tag_id}`, 'DEBUG', options)

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
			}
		// create fragment. Observe text area user selection text text_selection' +'_'+ self.id,
			// self.events_tokens.push(
			// 	event_manager.subscribe('text_selection' +'_'+ self.caller.id, text_selection)
			// )
			// function text_selection(options) {
			// 	console.log("event text_selection options:",options);
			// }
		// change tag state selector
			self.events_tokens.push(
				event_manager.subscribe('change_tag_state_' + self.id, fn_change_tag_state)
			)
			function fn_change_tag_state(value) {
				console.warn("tag_state value:",value);
			}
		// delete tag
			self.events_tokens.push(
				event_manager.subscribe('delete_tag_' + self.id, fn_delete_tag)
			)
			function fn_delete_tag(options) {
				console.warn("fn_delete_tag options:",options);
			}
		// click_no_tag
			self.events_tokens.push(
				event_manager.subscribe('click_no_tag_' + self.id_base, fn_click_no_tag)
			)
			function fn_click_no_tag(options) {
				if (!self.info_container.classList.contains('hide')) {
					self.info_container.classList.add('hide')
				}
			}
			

	return common_init
};//end init



/**
* BUILD_CUSTOM
*/
tool_indexation.prototype.build = async function(autoload=false) {

	const self = this

	// config caller set tool
		self.caller.caller = self

	// load_indexing_component. Init and build the indexing_component (component_relation_index usually)
		await self.load_indexing_component()

	// load_related_sections_list. Get the relation list. This is used to build a select element to allow
		// user select the top_section_tipo and top_section_id of current indexation
		self.related_sections_list = await self.load_related_sections_list()

	// call generic common tool build
		const common_build = tool_common.prototype.build.call(self, autoload)


	return common_build
};//end build_custom



/**
* LOAD_INDEXING_COMPONENT
* @return promise bool true
*/
tool_indexation.prototype.load_indexing_component = async function() {

	const self = this	
	
	// indexing_component		
		const component						= self.caller
		const indexing_component_tipo		= component.context.properties.indexing_component

	// search the component instance in the global array of instances first
		const found_instance = instances.find(el => el.tipo===indexing_component_tipo 
												 && el.section_id===component.section_id
												 && el.section_tipo===component.section_tipo )
	
		if (found_instance) {

			// use existing instance
			
			self.indexing_component = found_instance
		
		}else{

			// create a new one
			
			const indexing_component_options = {
				model			: 'component_relation_index',
				tipo			: indexing_component_tipo,
				section_tipo	: component.section_tipo,
				section_id		: component.section_id,
				mode			: 'edit',
				lang			: 'lg-nolan', // The only different property from caller
				context			: {},
				id_variant		: 'tool_indexation'
			}

			// init and build instance
				self.indexing_component = await get_instance(indexing_component_options)
				await self.indexing_component.build(true)

			// store instances to remove on destroy
				self.ar_instances.push(self.indexing_component)
		}		

	return true
};//end load_indexing_component



/**
* GET_COMPONENT
* Load transcriptions component (text area) configured with the given lang
* @param string lang
* Create / recover and build a instance of current component in the desired lang
* @return object instance
*/
tool_indexation.prototype.get_component = async function(lang) {

	const self = this
	
	const component		= self.caller
	const context		= JSON.parse(JSON.stringify(component.context))
		  context.lang 	= lang

	const instance_options = {
		model			: component.model,
		tipo			: component.tipo,
		section_tipo	: component.section_tipo,
		section_id		: component.section_id,
		mode			: 'edit',
		lang			: lang, // The only different property from caller
		section_lang	: component.lang,
		context			: context,
		id_variant		: 'tool_indexation'
		// data			: {value:[]},
		// datum		: null
	}

	const instance = await get_instance(instance_options)

	// set tool as caller
	instance.caller = self

	// build instance
	await instance.build(true)

	// store instances to remove on destroy
	self.ar_instances.push(instance)

	self.main_component = instance


	return instance
};//end get_component



/**
* GET_THESAURUS
* Creates a instance of area_thesaurus ready to render
* @return instance
*/
tool_indexation.prototype.get_thesaurus = async function() {

	// short vars
		const tipo	= 'dd100';
		const model	= 'area_thesaurus';
		const lang	= self.lang || page_globals.dedalo_data_lang
		const mode	= 'list';


	// context
		const context = {
			type			: 'area',
			typo			: 'ddo',
			tipo			: tipo,
			section_tipo	: tipo,
			lang			: lang,
			mode			: mode,
			model			: 'section',
			parent			: tipo,
			// request_config	: request_config
		}

	// instance options
		const instance_options = {
			model			: model,
			tipo			: tipo,
			section_tipo	: tipo,
			mode			: mode,
			lang			: lang,
			context			: context,
			caller			: self
		}

	// init section instance
		const area_thesaurus = await get_instance(instance_options)

	// set instance in thesaurus mode 'relation'
		area_thesaurus.thesaurus_mode = "relation"

	// build instance
		await area_thesaurus.build()


	return area_thesaurus
};//end get_thesaurus



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
			event_manager.publish('active_component', self.main_component)
			return false
		}

	// locator value. Build from selected term section_tipo, section_id, and selected tag_id
		const new_index_locator = {
			section_id			: data.section_id, // thesaurus term section_id
			section_tipo		: data.section_tipo, // thesaurus term section_tipo
			tag_id				: tag_id, // user selected tag id
			tag_component_tipo	: self.caller.tipo, // (component_text_area tag source)
			section_top_tipo	: self.top_locator.section_top_tipo, // the caller section_tipo to the resource like oh1
			section_top_id		: self.top_locator.section_top_id // the caller section_id to the resource like 4
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

	console.warn("self.active_elements added one:", name, self.active_elements);


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
* LOAD_RELATED_SECTIONS_LIST
* Get the list of related sections with the actual resource
* @return boolean
*/
tool_indexation.prototype.load_related_sections_list = async function() {

	const self = this

	const source = {
		action			: 'related_search',
		model			: self.caller.model,
		tipo			: self.caller.tipo,
		section_tipo	: self.caller.section_tipo,
		section_id		: self.caller.section_id,
		mode			: 'related_list',
		lang			: self.caller.lang
	}

	const sqo = {
		section_tipo		: ['all'],
		mode				: 'related',
		limit				: 10,
		offset				: 0,
		full_count			: false,
		filter_by_locators	: [{
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id
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


