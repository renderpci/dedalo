/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_indexation, add_component} from './render_tool_indexation.js'



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
	this.caller


	return true
}//end page



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
*/
tool_indexation.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url 	= DEDALO_CORE_URL + "/tools/tool_indexation/trigger.tool_indexation.php"
		self.lang 			= options.lang // page_globals.dedalo_data_lang
		self.langs 			= page_globals.dedalo_projects_default_langs

	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD_CUSTOM
*/
tool_indexation.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(this, autoload);

	// specific actions..


	return common_build
}//end build_custom



/**
* GET_COMPONENT
* @param string lang
* Create / recover and build a instance of current component in the desired lang
* @return object instance
*/
tool_indexation.prototype.get_component = async function(lang) {

	const self = this

	const component = self.caller
	const context 	= JSON.parse(JSON.stringify(component.context))
		  context.lang = lang

	const instance_options = {
		model 			: component.model,
		tipo 			: component.tipo,
		section_tipo 	: component.section_tipo,
		section_id 		: component.section_id,
		mode 			: 'edit',
		lang 			: lang, // The only different property from caller
		section_lang 	: component.lang,
		context 		: context,
		id_variant 		: 'tool_indexation'
		// data 			: {value:[]},
		// datum 			: null
	}

	const instance = await get_instance(instance_options)

	// set tool as caller
	instance.caller = self

	// build instance
	await instance.build(true)

	// store instances to remove on destroy
	self.ar_instances.push(instance)


	return instance
}//end get_component



/**
* GET_THESAURUS
* @return instance
*/
tool_indexation.prototype.get_thesaurus = async function() {

	const tipo 	= 'dd100';
	const model = 'area_thesaurus';
	const lang 	= self.lang;
	const mode 	= 'list';

	const page_element_options = {
		tipo 	: tipo,
		model 	: model,
		lang 	: lang,
		mode 	: mode
	}

	const current_data_manager = new data_manager()
	const response 		= await current_data_manager.get_page_element(page_element_options)
	const page_element 	= response.result

	// set in thesaurus mode 'relation'
		page_element.thesaurus_mode = 'relation'

	const instance = await get_instance(page_element)

	// build instance
	await instance.build()


	return instance
}//end get_thesaurus



/**
* CREATE FRAGMENT
* Crea las imágenes (con los tag) al principio y final del texto seleccionado
* y salva los datos
*/
tool_indexation.prototype.create_fragment = function ( button_obj, event ) {	//, component_name
	event.preventDefault()
	event.stopPropagation()

	var identificador_unico	= button_obj.dataset.identificador_unico
	var parent				= button_obj.dataset.parent
	var tipo				= button_obj.dataset.tipo
	var section_tipo		= button_obj.dataset.section_tipo
	var lang				= button_obj.dataset.lang
	var component_id		= identificador_unico

	// Select current editor
	var ed = tinyMCE.get(component_id);
	//var ed = tinymce.activeEditor
		if ($(ed).length<1) { return alert("Editor " + component_id + " not found [1]!") }

	var current_text_area = document.getElementById(component_id);
		if (!current_text_area) {
			return alert("Editor " + component_id + " not found [2]!")
		}

	//var last_tag_index_id = parseInt(current_text_area.dataset.last_tag_index_id);
	var last_tag_index_id = parseInt( component_text_area.get_last_tag_id(ed, 'index') )
		//console.log(last_tag_index_id); return;

	var string_selected 	= ed.selection.getContent({format : 'raw'}); // Get the selected text in raw format
	var string_len 			= string_selected.length ;
		if(string_len<1) return alert("Please, select a text fragment before ! " +string_len);

	// New tag_id to use
	var tag_id = parseInt(last_tag_index_id+1);		//alert("new tag_id:"+last_tag_index_id + " "+component_id); return false;

	// State. Default is 'n' (normal)
	var state = 'n';

	// Final string to replace
	var image_in  = component_text_area.build_dom_element_from_data('indexIn', tag_id, state, "label in "+tag_id, '')
	var image_out = component_text_area.build_dom_element_from_data('indexOut', tag_id, state, "label out "+tag_id, '')

	// Get selection range
	var range 		    = ed.selection.getRng(0)
	var range_clon 	    = range.cloneRange()
	// Save start and end position
	var startOffset 	= range_clon.startOffset
	var startContainer 	= range_clon.startContainer
		range_clon.collapse(false)	// Go to end of range position

	// Insert end out image
	range_clon.insertNode(image_out)

	// Positioned to begin of range
	range_clon.setStart(startContainer, startOffset)
	// Insert note at begining of range
	range_clon.collapse(true) // Go to start of range position
	range_clon.insertNode(image_in)

	// Force dirty state
	ed.setDirty(true);

	// Update last_tag_index_id data on current text area
	//$(current_text_area).data('last_tag_index_id',tag_id);
	current_text_area.dataset.last_tag_index_id = tag_id

	// FORCE UPDATE REAL TEXT AREA CONTENT (and save is triggered when text area changes)
	//tinyMCE.triggerSave();	//console.log(tinyMCE)
	// TEXT EDITOR : Force save
	var evt = null;
	//var js_promise = text_editor.save_command(ed, evt, current_text_area);
	var js_promise = component_text_area.Save(current_text_area, null, ed)
		js_promise.then(function(response) {
			// fragment_info
			tool_indexation.fragment_info(image_in, tipo, parent, section_tipo, lang);	//tag_obj, tipo, parent, section_tipo, lang
		})

	// Hide "Create New Fragment" button
	//$(button_obj).hide()
	button_obj.style.display = 'none'

	return true
}//end create_fragment



