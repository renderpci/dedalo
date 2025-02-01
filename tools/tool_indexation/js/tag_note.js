// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, get_label, SHOW_DEBUG */
/* eslint no-undef: "error"*/



/**
* TAG NOTE FILE extends tool_indexation
*/



// imports
	import {get_instance} from '../../../core/common/js/instances.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {JSON_parse_safely} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {when_in_viewport} from '../../../core/common/js/events.js'



/**
* TAG_NOTE
* Manages the component's logic and appearance in client side
*/
export const tag_note = function() {

	return true
}//end tag_note



/**
* RENDER_INDEXATION_NOTE
* If tag contains valid note data (expected locator pseudo-stringified) renders
* components node. Else button new is rendered
* @param object tag
* @return HTMLElement|null tag_note_node
*/
tag_note.prototype.render_indexation_note = async function(tag) {

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

	// parse stringified locator
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
* @return HTMLElement empty_note_container
*/
tag_note.prototype.render_empty_note = function(tag) {

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
	button_new_note.addEventListener('click', function(e){
		e.stopPropagation()

		// user confirm
			if ( !confirm(get_label.sure || 'Sure?') ) {
				return false
			}

		const section_tipo = self.DEDALO_INDEXATION_SECTION_TIPO

		// create a new tag record
		new_tag_note(tag, section_tipo)  // return promise resolve: int|null
		.then(async function(new_section_id) {

			// check received value
				if(!new_section_id) {
					console.error('Failed to create note. tag, section_tipo, new_section_id:', tag, section_tipo, new_section_id);
					alert("Failed to create note");
					return
				}

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

			// save component_text_area to prevent loosing the connection with the tag
				const save = await self.transcription_component.save_editor()
				if (save===false) {
					console.log('Error. Failed to save transcription_component ');
					alert('Failed transcription save');
				}

			// container. Get and clean
				const container	= self.indexation_note
				while (container.lastChild) {
					container.removeChild(container.lastChild)
			}

			// render tag_note info into the container
				self.render_note({
					locator : {
						section_tipo	: section_tipo,
						section_id		: new_section_id
					}
				})
				.then(function(tag_note_node){
					container.appendChild(tag_note_node)

					when_in_viewport(
						self.title_instance.node,
						() => {
							// activate when in DOM
							ui.component.activate(self.title_instance)
						}
					)
				})
		})
	})//end event click


	return empty_note_container
}//end render_empty_note



/**
* RENDER_NOTE
* Render title and descriptions nodes after init and build the both instances
* @param object options
* @return HTMLElement fragment
*/
tag_note.prototype.render_note = async function(options) {

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
		// show_interface
		title_instance.show_interface.tools = false
		const title_node = await title_instance.render()
		// set instance
		self.title_instance = title_instance
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
		// show_interface
		description_instance.show_interface.tools = false
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
			action	: 'create',
			source	: {
				section_tipo : section_tipo
			}
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
			const error_text = api_response.errors?.length
				? api_response.errors.join(' | ')
				: 'Unknown error on create new_tag_note for tag ' + tag.tag_id
			alert(error_text);
			console.error('api_response.errors:', api_response.errors);
			return null;
		}

	// OK response
		const new_section_id = api_response.result // int


	return new_section_id
}//end new_tag_note



// @license-end
