/*global page_globals, get_label, SHOW_DEBUG */
/* eslint no-undef: "error"*/



/**
* TAG NOTE FILE extends tool_indexation
*/



import {tool_indexation} from './tool_indexation.js'
import {get_instance} from '../../../core/common/js/instances.js'
import {ui} from '../../../core/common/js/ui.js'
import {JSON_parse_safely} from '../../../core/common/js/utils/index.js'
import {data_manager} from '../../../core/common/js/data_manager.js'
// import {event_manager} from '../../../core/common/js/event_manager.js'



/**
* RENDER_INDEXATION_NOTE
* If tag contains valid note data (expected locator pseudostringified) renders
* components node. Else button new is rendered
* @param object tag
* @return DOM node|null tag_note_node
*/
tool_indexation.prototype.render_indexation_note = async function(tag) {

	const self = this

	// short vars
		const data = tag.data || null

	// debug
		if(SHOW_DEBUG===true) {
			// console.log('tag_note render_indexation_note received tag data:', data);
		}

	// check data is valid
		if (!data || data.length<5) {
			// console.log("Ignored empty data on get_indexation_note_context")
			const tag_note_node = self.render_empty_note(tag)

			return tag_note_node
		}

	// safe_data. replace non standard JSON quotes used to store data into dataset
		const safe_data = data.replaceAll('\'', '"')

	// parse stringinfied locator
		const locator = JSON_parse_safely(
			safe_data,
			'Error on parse indexation note'
		)

	// check valid locator
		if (!locator.section_tipo || !locator.section_id) {
			console.warn("Error on parse tag data:", data, locator)

			return null
		}

	// render
		const tag_note_node = await self.render_note({
			locator : locator
		})


	return tag_note_node
}//end render_indexation_note



/**
* RENDER_EMPTY_NOTE
* When tag have no data, a empty container with a new button is created
* @param object tag
* @return DOM node empty_note_container
*/
tool_indexation.prototype.render_empty_note = function(tag) {

	const self = this

	const empty_note_container = ui.create_dom_element({
		element_type	: 'div',
		class_name		: 'empty_note'
	})

	const label = self.get_tool_label('create_tag_info_note') || 'Create tag info note'
	const button_new_note = ui.create_dom_element({
		element_type	: 'button',
		class_name		: 'warning new',
		inner_html		: label,
		parent			: empty_note_container
	})
	button_new_note.addEventListener('click', function(){
		if ( confirm(get_label.seguro || 'Sure?') ) {

			const section_tipo = self.DEDALO_INDEXATION_SECTION_TIPO

			new_tag_note(tag, section_tipo)  // return promise resolve: int|null
			.then(function(new_section_id){
			 	if (new_section_id) {

					// Created new_section_id. Update tag data into component_text_area

					// new_data_obj
						const new_data_obj = {
							state : tag.state,
							label : tag.label,
							data : {
								section_tipo	: section_tipo,
								section_id		: new_section_id
							}
						}

					// update_tag
						self.transcription_component.update_tag({
							type			: 'indexIn',
							tag_id			: tag.tag_id,
							new_data_obj	: new_data_obj,
							key				: 0
						})
						.then(function(response){
							console.log('update_tag response:', response);
						})

					// save component_text_area to prevent loose the conexion with the tag
						const save = self.transcription_component.save_editor()
						if (save===false) {
							console.log('Error. transcription_component save fail');
							alert("Failed transcription save");
						}

					// load tag_note info
						// container. Get and clean
						const container	= self.indexation_note
						while (container.lastChild) {
							container.removeChild(container.lastChild)
						}
						self.render_note({
							locator : {
								section_tipo	: section_tipo,
								section_id		: new_section_id
							}
						})
						.then(function(tag_note_node){
							container.appendChild(tag_note_node)
						})
				}
			})
		}
	})


	return empty_note_container
}//end render_empty_note



/**
* RENDER_NOTE
* Render title and descriptions nodes after init and build the both instances
* @param object options
* @return DOM node fragment
*/
tool_indexation.prototype.render_note = async function(options) {

	const self = this

	// options
		const locator = options.locator

	// short vars
		const section_id	= locator.section_id
		const section_tipo	= locator.section_tipo

	const fragment = new DocumentFragment()

	// title
		const title_instance = await get_instance({
			tipo			: self.DEDALO_INDEXATION_TITLE_TIPO,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: 'edit',
			lang			: page_globals.dedalo_data_lang,
			model			: 'component_input_text'
		})
		await title_instance.build(true)
		const title_node = await title_instance.render()
		fragment.appendChild(title_node)

	// description
		const description_instance = await get_instance({
			tipo			: self.DEDALO_INDEXATION_DESCRIPTION_TIPO,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: 'edit',
			lang			: page_globals.dedalo_data_lang,
			model			: 'component_text_area'
		})
		await description_instance.build(true)
		const description_node = await description_instance.render()
		fragment.appendChild(description_node)


	return fragment
}//end render_note



/**
* NEW_TAG_NOTE
* Creates a new section record and returns the new section_id
* @param object tag
* @param string section_tipo
* @return promise
* 	resolve int|null new_section_id
*/
const new_tag_note = async function(tag, section_tipo) {

	// create record
		const rqo = {
			action			: 'create',
			section_tipo	: section_tipo
		}
		const api_response = await data_manager.request({
			body : rqo
		})
		if(SHOW_DEBUG===true) {
			console.log("api_response for tag:", tag);
			console.log("api_response:", api_response);
		}

	// error manage
		if (!api_response.result || api_response.result<1) {

			// something wrong happens
			alert(api_response.error || 'Unknown error on create new_tag_note for tag '+tag.tag_id);
			console.error('api_response.error:', api_response.error);
			return null;
		}

	// OK response
		const new_section_id = api_response.result // int


	return new_section_id
}//end new_tag_note

