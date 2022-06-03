/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {keyboard_codes} from '../../../core/common/js/utils/keyboard.js'
	import {render_node_info} from '../../../core/common/js/utils/notifications.js'
	import {tr} from '../../../core/common/js/tr.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'


/**
* RENDER_TOOL_TRANSCRIPTION
* Manages the component's logic and apperance in client side
*/
export const render_tool_tr_print = function() {

	return true
};//end render_tool_tr_print



/**
* EDIT
* Render node
* @return DOM node
*/
render_tool_tr_print.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// render level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.tool.build_wrapper_edit(self, {
			content_data : content_data
		})

	// transcription_options are the buttons to get access to other tools (buttons in the header)
		const tanscription_options = await render_head_options(self, content_data)
		wrapper.tool_buttons_container.appendChild(tanscription_options)

	// render_activity_info are the information of the activity as "Save"
		const activity_info = render_activity_info(self)
		wrapper.activity_info_container.appendChild(activity_info)

	// render the text process options to interact with user
		const process_options = render_text_process_options(self, content_data)
		content_data.left_container.appendChild(process_options)


	return wrapper
};//end render_tool_tr_print



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// left_container
		const left_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'left_container',
			parent			: fragment
		})

	// right_container
		const right_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'right_container',
			parent 			: fragment
		})
			const right_container_text = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'right_container_text',
				parent 			: right_container
			})

		// value is a raw html without parse into nodes (txt format)
		const node_len 	= self.ar_raw_data.length
		for (var i = 0; i < node_len; i++) {
			const raw_data = self.ar_raw_data[i]
			const text_node = self.tags_to_html(raw_data)
			right_container_text.insertAdjacentHTML("beforeend", text_node);
			// right_container.appendChild(node)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type	: 'div'
		})
		content_data.appendChild(fragment)
		// save the pointers of the content_data nodes, to used by the buttons to access to the components
		content_data.left_container			= left_container
		content_data.right_container		= right_container
		content_data.right_container_text	= right_container_text

	return content_data
};//end get_content_data_edit



/**
* RENDER_HEAD_OPTIONS
* This is used to build a optional buttons inside the header
* @return DOM node fragment
*/
const render_head_options = async function(self, content_data) {

	const fragment = new DocumentFragment()

	return fragment
};//end render_head_options



/**
* RENDER_TEXT_PROCESS_OPTIONS
* This is used to build a optional buttons inside the header
* @return DOM node fragment
*/
const render_text_process_options = function(self, content_data) {

	const fragment = new DocumentFragment()

	// lang selector
		const lang_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'lang_selector',
			parent			: fragment
		})
		const lang_label = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'lang_label',
			inner_html 		: get_label.idioma || 'Language',
			parent 			: lang_container
		})
		// the lang selector use the content_data pointer .right_container to remove the transcription text_area and rebuild the new node
		const lang_selector = ui.build_select_lang({
			id			: "index_lang_selector",
			selected	: self.lang,
			class_name	: 'dd_input',
			action		: async function(e){
				// create new one
				self.transcription_component	= await self.get_component(e.target.value)
				self.lang						= e.target.value
				self.ar_raw_data				= self.transcription_component.data.value

				const node_len 	= self.ar_raw_data.length
				for (var i = 0; i < node_len; i++) {
					const raw_data = self.ar_raw_data[i]
					const text_node = self.tags_to_html(raw_data)
					// remove previous nodes
					while (content_data.right_container_text.lastChild) {//} && content_data.left_container.lastChild.id!==lang_selector.id) {
						content_data.right_container_text.removeChild(content_data.right_container_text.lastChild)
					}
					// add the new one
					content_data.right_container_text.insertAdjacentHTML("beforeend", text_node);
				}

			}
		})
		lang_container.appendChild(lang_selector)


	// OPTIONS
	// header_option_container
	const header_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const header_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'header_option',
			parent 			: header_option_container
		})
		const header_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'header_option_label',
			inner_html 		: get_label.cabecera || 'Header',
			parent 			: header_option_container
		})
	// timecodes_option_container
	const timecodes_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const timecodes_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'timecodes_option',
			parent 			: timecodes_option_container
		})
		const timecodes_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'timecodes_option_label',
			inner_html 		: get_label.timecodes || 'Time Codes',
			parent 			: timecodes_option_container
		})
	// persons_option_container
	const persons_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const persons_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'persons_option',
			parent 			: persons_option_container
		})
		const persons_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'persons_option_label',
			inner_html 		: get_label.personas || 'Persons',
			parent 			: persons_option_container
		})
	// indexations_option_container
	const indexations_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const indexations_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'indexations_option',
			parent 			: indexations_option_container
		})
		const indexations_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'indexations_option_label',
			inner_html 		: get_label.indexations || 'Indexations',
			parent 			: indexations_option_container
		})
	// indexations_info_option_container
	const indexations_info_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const indexations_info_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'indexations_info_option',
			parent 			: indexations_info_option_container
		})
		const indexations_info_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'indexations_info_option_label',
			inner_html 		: get_label.indexations_info || 'Indexations info',
			parent 			: indexations_info_option_container
		})
	// lines_option_container
	const lines_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const lines_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'lines_option',
			parent 			: lines_option_container
		})
		const lines_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'lines_option_label',
			inner_html 		: get_label.lines || 'Lines',
			parent 			: lines_option_container
		})
	// default_view_option_container
	const default_view_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const default_view_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'default_view_option',
			parent 			: default_view_option_container
		})
		const default_view_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'default_view_option_label',
			inner_html 		: get_label.default || 'Default',
			parent 			: default_view_option_container
		})
		default_view_option.addEventListener('change', function(event) {
			const ar_default_render = render_default(self)
			// remove previous nodes
				// while (content_data.right_container_text.lastChild) {//} && content_data.left_container.lastChild.id!==lang_selector.id) {
				// 	content_data.right_container_text.removeChild(content_data.right_container_text.lastChild)
				// }
			const ar_render_len = ar_default_render.length
			for (let i = 0; i < ar_render_len; i++) {
					// console.log("ar_default_render[i]:--------------",ar_default_render[i]);
				content_data.right_container_text.insertAdjacentHTML("beforeend", ar_default_render[i]);
			}
				// add the new one

		})
	// original_view_option_container
	const original_view_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const original_view_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'original_view_option',
			parent 			: original_view_option_container
		})
		const original_view_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'original_view_option_label',
			inner_html 		: get_label.original || 'Original',
			parent 			: original_view_option_container
		})
	// text_only_view_option_container
	const text_only_view_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const text_only_view_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'text_only_view_option',
			parent 			: text_only_view_option_container
		})
		const text_only_view_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'text_only_view_option_label',
			inner_html 		: get_label.text_only || 'Text only',
			parent 			: text_only_view_option_container
		})
	// source_view_option_container
	const source_view_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const source_view_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
			class_name 		: 'source_view_option',
			parent 			: source_view_option_container
		})
		const source_view_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'source_view_option_label',
			inner_html 		: get_label.source || 'Source',
			parent 			: source_view_option_container
		})



	return fragment
};//end render_text_process_options







const render_default = function(self) {

	const fragment = new DocumentFragment()
	const ar_default_render = []
	const node_len 	= self.ar_raw_data.length

	for (let i = 0; i < node_len; i++) {
		let raw_data = self.ar_raw_data[i]

		// BR
		// const pattern_br = tr.get_mark_pattern('br');
		// raw_data = raw_data.replace(pattern_br, `<p>`);

		// TC. [TC_00:00:25.091_TC]
			function get_tc(match, p1,p2, offset){

				// the tc is inside the p2 of the match
				const tc = p2

				const data_block = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'data_block',
					parent 			: fragment
				})
					const left_block = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'left_block',
						parent 			: data_block
					})
					const rigth_block = ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'rigth_block',
						parent 			: data_block
					})

				const tag_node	= '<span class="index in">'+tag_id+'{</span>'

				return tag_node
			}
			const pattern_tc = tr.get_mark_pattern('tc');
			raw_data = raw_data.replace(pattern_tc, get_tc);

			// const pattern_tc = tr.get_mark_pattern('tc');
			// raw_data = raw_data.replace(pattern_tc, `<span class="tc">$2</span>`);

		// INDEX IN

			function get_index_in(match, p1,p2,p3,p4,p5,p6,p7, offset){

				// the tag_id is inside the p4 of the match
				const tag_id = p4
				// get all indexation terms of the current tag with match tag_id inside the locator
				const tags_index = self.transcription_component.data.tags_index || []
				const ar_indexation = tags_index.filter(el =>
					el.data.tag_id	=== tag_id
				)
				const ar_indexation_len = ar_indexation.length

				for (let i = 0; i < ar_indexation_len; i++) {
					const current_index_node = ar_indexation[i].label

					ui.create_dom_element({
						element_type	: 'div',
						class_name 		: 'rigth_block',
						parent 			: left_block
					})
				}

				const tag_node	= '<span class="index in">'+tag_id+'{</span>'

				return tag_node
			}
			const pattern_index_in = tr.get_mark_pattern('indexIn');
			raw_data = raw_data.replace(pattern_index_in, get_index_in);
			// raw_data = raw_data.replace(pattern_lang, `<span class="lang">$6</span>`);
		// 	const pattern_indexIn = tr.get_mark_pattern('indexIn'); // id,state,label,data
		// 	raw_data = raw_data.replace(pattern_indexIn, `<img id="[$2-$3-$4-$6]" src="${tag_url}[$2-$3-$4-$6]" class="index" data-type="indexIn" data-tag_id="$4" data-state="$3" data-label="$6" data-data="$7">`);

		// INDEX OUT
			const pattern_indexOut = tr.get_mark_pattern('indexOut');
			raw_data = raw_data.replace(pattern_indexOut, `<span class="index out">}$4</span>`);

		// // REFERENCE IN
		// 	const pattern_referenceIn = tr.get_mark_pattern('referenceIn');
		// 	raw_data = raw_data.replace(pattern_referenceIn, `<reference id="reference_$4" class="reference" data-type="reference" data-tag_id="$4" data-state="$3" data-label="$6" data-data="$7">`);

		// // REFERENCE OUT
		// 	const pattern_referenceOut = tr.get_mark_pattern('referenceOut');
		// 	raw_data = raw_data.replace(pattern_referenceOut, "</reference>");


		// // SVG
		// 	const pattern_svg = tr.get_mark_pattern('svg');
		// 	raw_data = raw_data.replace(pattern_svg, `<img id="[$2-$3-$4-$6]" src="${tag_url}$7" class="svg" data-type="svg" data-tag_id="$4" data-state="$3" data-label="$6" data-data="$7">`);

		// // DRAW
		// 	const pattern_draw = tr.get_mark_pattern('draw');
		// 	raw_data = raw_data.replace(pattern_draw, `<img id="[$2-$3-$4-$6]" src="${tag_url}[$2-$3-$4-$6]" class="draw" data-type="draw" data-tag_id="$4" data-state="$3" data-label="$6" data-data="$7">`);

		// // GEO
		// 	const pattern_geo = tr.get_mark_pattern('geo');
		// 	raw_data = raw_data.replace(pattern_geo, `<img id="[$2-$3-$4-$6]" src="${tag_url}[$2-$3-$4-$6]" class="geo" data-type="geo" data-tag_id="$4" data-state="$3" data-label="$6" data-data="$7">`);

		// // PAGE
		// 	const pattern_page = tr.get_mark_pattern('page');
		// 	raw_data = raw_data.replace(pattern_page, `<img id="[$2-$3-$4-$5]" src="${tag_url}[$2-$3-$4-$5]" class="page" data-type="page" data-tag_id="$4" data-state="$3" data-label="$5" data-data="$7">`);

		// PERSON
			function get_person(match, p1,p2,p3,p4,p5,p6, offset){
				// the locator is inside the p6 of the match
				const data_string	= p6
				// rebuild the correct locator witht the " instead '
				const data			= data_string.replace(/\'/g, '"')
				// parse the string to object or create new one
				const locator		= JSON.parse(data) || {}
				// get the match of the locator with the tag_persons array inside the instance
				// console.log("self.data:",self.data);
				const tags_persons = self.transcription_component.data.tags_persons || []
				const person = tags_persons.find(el =>
					el.data.section_tipo	===locator.section_tipo &&
					el.data.section_id		== locator.section_id &&
					el.data.component_tipo	===locator.component_tipo
				)
				const tag_node	= person
					? '<span class="person">'+ person.full_name +': </span>'
					: ''
				return tag_node
			}
			const pattern_person = tr.get_mark_pattern('person');
			raw_data = raw_data.replace(pattern_person, get_person);

		// NOTE
			function get_note(match, p1,p2,p3,p4,p5,p6,p7, offset){
				// the locator is inside the p7 of the match
				const data_string	= p7
				// rebuild the correct locator witht the " instead '
				const data			= data_string.replace(/\'/g, '"')
				// parse the string to object or create new one
				const locator		= JSON.parse(data) || {}
				// get the match of the locator with the tag_persons array inside the instance
				// console.log("self.data:",self.data);
				const tags_notes = self.transcription_component.data.tags_notes || []
				const note = tags_notes.find(el =>
					el.data.section_tipo	===locator.section_tipo &&
					el.data.section_id		== locator.section_id &&
					el.data.component_tipo	===locator.component_tipo
				)

				const note_title = (note.title)
					? note.title.join(' | ')
					: null

				const note_text = (note.body && note_title)
					? note_title +'. '+ note.body
					: note.body

				const tag_node	= note
					? '<span class="footnote"> ['+note_text+'] </span>'
					: ''

				return tag_node
			}
			const pattern_note = tr.get_mark_pattern('note');
			raw_data = raw_data.replace(pattern_note, get_note);

		// LANG
			const pattern_lang = tr.get_mark_pattern('lang');
			raw_data = raw_data.replace(pattern_lang, `<span class="lang">$6:</span>`);

		ar_default_render.push(raw_data)
	}// end for

	return ar_default_render
}











/**
* RENDER_ACTIVITY_INFO
* This is used to build a optional buttons inside the header
* @return DOM node fragment
*/
const render_activity_info = function(self) {

	const fragment = new DocumentFragment()

	// activity alert
		const activity_info_body = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'activity_info_body',
			parent			: fragment
		})
		self.events_tokens.push(
			event_manager.subscribe('save', fn_saved)
		)
		function fn_saved(options){
			const node_info = render_node_info(options)
			activity_info_body.prepend(node_info)
		}

	return fragment
}