// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../../core/common/js/event_manager.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {tr} from '../../../core/common/js/tr.js'
	// import {keyboard_codes} from '../../../core/common/js/utils/keyboard.js'
	// import {render_node_info} from '../../../core/common/js/utils/notifications.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'



/**
* RENDER_TOOL_TRANSCRIPTION
* Manages the component's logic and appearance in client side
*/
export const render_tool_tr_print = function() {

	return true
}//end render_tool_tr_print



/**
* EDIT
* Render node
* @param object options
* 	sample {render_level:'full'}
* @return HTMLElement wrapper
*/
render_tool_tr_print.prototype.edit = async function(options) {

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

	// render the text process options to interact with user
		const process_options = render_text_process_options(self, content_data)
		content_data.left_container.appendChild(process_options)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// DocumentFragment
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
			class_name		: 'right_container',
			parent			: fragment
		})
		// right_container_head
		const right_container_head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_container_head',
			parent			: right_container
		})
		const header_node = render_header(self)
		if(header_node){
			right_container_head.appendChild(header_node)
		}
		// right_container_text
		const right_container_text = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'right_container_text',
			parent			: right_container
		})

		// value is a raw html without parse into nodes (txt format)
		const node_len 	= self.ar_raw_data.length
		for (let i = 0; i < node_len; i++) {
			const raw_data	= self.ar_raw_data[i]
			const text_node	= self.tags_to_html(raw_data)
			right_container_text.insertAdjacentHTML('beforeend', text_node);
			// right_container.appendChild(node)
		}

	// content_data
		const content_data = ui.tool.build_content_data(self)
		content_data.appendChild(fragment)

		// save the pointers of the content_data nodes, to be used by the buttons to access to the components
		content_data.left_container			= left_container
		content_data.right_container		= right_container
		content_data.right_container_text	= right_container_text


	return content_data
}//end get_content_data_edit



/**
* RENDER_HEAD_OPTIONS
* This is used to build a optional buttons inside the header
* @return DOM DocumentFragment
*/
const render_head_options = async function(self, content_data) {

	const fragment = new DocumentFragment()

	return fragment
}//end render_head_options



/**
* RENDER_TEXT_PROCESS_OPTIONS
* This is used to build a optional buttons inside the header
* @return DOM DocumentFragment
*/
const render_text_process_options = function(self, content_data) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// lang selector
		const lang_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'lang_container',
			parent			: fragment
		})
		// lang_label
			ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'lang_label',
				inner_html 		: get_label.language || 'Language',
				parent 			: lang_container
			})
		// the lang selector use the content_data pointer .right_container to remove the transcription text_area and rebuild the new node
			const lang_selector = ui.build_select_lang({
				selected	: self.lang,
				class_name	: 'dd_input selector',
				action		: async function(e){

					// user selected lang
						self.lang = e.target.value

					// loading
						content_data.right_container_text.classList.add('loading')

					// change lang and refresh the component
						self.transcription_component.lang = self.lang
						// note that this component do not render in this tool, therefore, force render to allow refresh()
						await self.transcription_component.render()
						await self.transcription_component.refresh({
							build_autoload : true
						})

					// fix vars
						self.ar_raw_data = self.transcription_component.data.value

					// remove previous nodes
						while (content_data.right_container_text.lastChild) {//} && content_data.left_container.lastChild.id!==lang_selector.id) {
							content_data.right_container_text.removeChild(content_data.right_container_text.lastChild)
						}

					// re-create nodes
						const node_len 	= self.ar_raw_data.length
						for (let i = 0; i < node_len; i++) {
							const raw_data	= self.ar_raw_data[i]
							const text_node	= self.tags_to_html(raw_data)
							// add the new one
							content_data.right_container_text.insertAdjacentHTML('beforeend', text_node);
						}

					// loading
						content_data.right_container_text.classList.remove('loading')
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
		// header option
		const header_option = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})
		header_option.checked = true // default checked
		header_option.addEventListener('change', async function(){
			const header_elements = content_data.querySelector('.right_container_head')
			if(!header_elements){
				return
			}
			header_elements.style.display = header_option.checked===true
				? ''
				: 'none'
		})
		const header_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'option_label header_option_label',
			inner_html		: get_label.head || 'Header',
			parent			: header_option_container
		})
		header_option_label.insertAdjacentElement('afterbegin', header_option)

	// timecodes_option_container
		const timecodes_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		// timecodes_option
		const timecodes_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox'
		})
		timecodes_option.checked = true // default checked
		timecodes_option_container.addEventListener('change',function(){
			const tc_elements = content_data.querySelectorAll('.tc')
			const len = tc_elements.length
			if (timecodes_option.checked===true) {
				for (let i = len - 1; i >= 0; i--) {
					tc_elements[i].style.display = ''
				}
			}else{
				for (let i = len - 1; i >= 0; i--) {
					tc_elements[i].style.display = 'none'
				}
			}
		})
		const timecodes_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'option_label timecodes_option_label',
			inner_html 		: get_label.timecodes || 'Time Codes',
			parent 			: timecodes_option_container
		})
		timecodes_option_label.insertAdjacentElement('afterbegin', timecodes_option)

	// persons_option_container
		const persons_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		// persons_option
		const persons_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox'
		})
		persons_option.checked = true // default checked
		persons_option.addEventListener('change',function(){
			const person_elements = content_data.querySelectorAll('.person')
			const len = person_elements.length
			//console.log(tc_elements);

			if (persons_option.checked===true) {
				for (let i = len - 1; i >= 0; i--) {
					person_elements[i].style.display = ''
				}
			}else{
				for (let i = len - 1; i >= 0; i--) {
					person_elements[i].style.display = 'none'
				}
			}
		})
		const persons_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'persons_option_label',
			inner_html 		: get_label.persons || 'Persons',
			parent 			: persons_option_container
		})
		persons_option_label.insertAdjacentElement('afterbegin', persons_option)

	// indexations_option_container
		const indexations_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		// indexations_option
		const indexations_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox'
		})
		indexations_option.checked = true // default checked
		indexations_option.addEventListener('change',function(){
			const index_elements = content_data.querySelectorAll('.index')
			const len = index_elements.length
			//console.log(tc_elements);

			if (indexations_option.checked===true) {
				for (let i = len - 1; i >= 0; i--) {
					index_elements[i].style.display = ''
				}
			}else{
				for (let i = len - 1; i >= 0; i--) {
					index_elements[i].style.display = 'none'
				}
			}
		})
		const indexations_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'indexations_option_label',
			inner_html 		: get_label.indexations || 'Indexations',
			parent 			: indexations_option_container
		})
		indexations_option_label.insertAdjacentElement('afterbegin', indexations_option)


	// indexations_info_option_container
		const indexations_info_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		// indexations_info_option
		const indexations_info_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox',
		})
		indexations_info_option.checked = true // default checked
		indexations_info_option.addEventListener('change',function(){

			const data_block = content_data.querySelector('.data_block')
			if (!data_block){
				return
			}
			if (indexations_info_option.checked===true) {
				data_block.classList.remove('hidden_column_index')
			}else{
				data_block.classList.add('hidden_column_index')
			}

			const indexations_block = content_data.querySelectorAll('.left_block')
			const len = indexations_block.length

			if (!indexations_block){
				return
			}
			if (indexations_info_option.checked===true) {
				for (let i = len - 1; i >= 0; i--) {
					indexations_block[i].style.display = ''
				}
			}else{
				for (let i = len - 1; i >= 0; i--) {
					indexations_block[i].style.display = 'none'
				}
			}
		})
		const indexations_info_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'indexations_info_option_label',
			inner_html 		: get_label.indexations_info || 'Indexations info',
			parent 			: indexations_info_option_container
		})
		indexations_info_option_label.insertAdjacentElement('afterbegin', indexations_info_option)


	// annotations_option_container
		const annotations_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		// annotations_option
		const annotations_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox'
		})
		annotations_option.checked = true // default checked
		annotations_option_container.addEventListener('change', function(){

			const note_elements = content_data.querySelectorAll('.note')
			const len = note_elements.length
			//console.log(tc_elements);

			if (annotations_option.checked===true) {
				for (let i = len - 1; i >= 0; i--) {
					note_elements[i].style.display = ''
				}
			}else{
				for (let i = len - 1; i >= 0; i--) {
					note_elements[i].style.display = 'none'
				}
			}
		})
		const annotations_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'annotations_option_label',
			inner_html 		: get_label.annotations || 'Annotations',
			parent 			: annotations_option_container
		})
		annotations_option_label.insertAdjacentElement('afterbegin', annotations_option)


	// Lang_option_container
		const lang_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const lang_option = ui.create_dom_element({
			element_type	: 'input',
			type 			: 'checkbox'
		})
		lang_option.checked = true // default checked
		lang_option.addEventListener('change',function(){

			const lang_elements	= content_data.querySelectorAll('.lang')
			const len			= lang_elements.length

			if (lang_option.checked===true) {
				for (let i = len - 1; i >= 0; i--) {
					lang_elements[i].style.display = ''
				}
			}else{
				for (let i = len - 1; i >= 0; i--) {
					lang_elements[i].style.display = 'none'
				}
			}
		})
		const lang_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'lang_option_label',
			inner_html 		: get_label.languages || 'Languages',
			parent 			: lang_option_container
		})
		lang_option_label.insertAdjacentElement('afterbegin', lang_option)


	// lines_option_container
		const lines_option_container = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'option_container',
			parent			: fragment
		})
		const lines_option = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox'
		})
		lines_option.checked = false // default non checked
		lines_option.addEventListener('change', function(){

			function get_parent_block(current_node) {
				if(current_node.classList.contains('right_container_text')){
					return null
				}
				if(current_node.classList.contains('right_block')){
					return current_node
				}
				return get_parent_block(current_node.parentNode)
			}

			const fragment_elements = content_data.querySelectorAll('.tc')
			const len = fragment_elements.length

			if(!fragment_elements){
				return
			}

			if (lines_option.checked===true) {
				for (let i = len - 1; i >= 0; i--) {
					const right_block = get_parent_block(fragment_elements[i].parentNode)
					if(right_block && i > 0){
						right_block.classList.add('border_top')}
					}
			}else{
				for (let i = len - 1; i >= 0; i--) {
					const right_block = get_parent_block(fragment_elements[i].parentNode)
					if(right_block){
						right_block.classList.remove('border_top')
					}
				}
			}
		})
		const lines_option_label = ui.create_dom_element({
			element_type	: 'label',
			class_name 		: 'lines_option_label',
			inner_html 		: get_label.lines || 'Lines',
			parent 			: lines_option_container
		})
		lines_option_label.insertAdjacentElement('afterbegin', lines_option)

	// text options container
		const text_selector = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'text_selector',
			parent			: fragment
		})
		const default_view_option = ui.create_dom_element({
			element_type	: 'option',
			inner_html		: get_label.default || 'Default',
			parent			: text_selector
		})
		const original_view_option = ui.create_dom_element({
			element_type	: 'option',
			inner_html		: get_label.original || 'Original',
			parent			: text_selector
		})
		// default checked
		original_view_option.selected = true
		const source_view_option = ui.create_dom_element({
			element_type	: 'option',
			inner_html 		: get_label.source || 'Source',
			parent 			: text_selector
		})
		// change event
		text_selector.addEventListener('change', function(event) {
			// reset all options to default
				header_option.checked			= true
				timecodes_option.checked		= true
				persons_option.checked			= true
				indexations_option.checked		= true
				indexations_info_option.checked	= true
				annotations_option.checked		= true
				lang_option.checked				= true
				lines_option.checked			= false

			if (default_view_option.selected===true) {
				const ar_default_render = render_default(self)
				// remove previous nodes
					while (content_data.right_container_text.lastChild) {//} && content_data.left_container.lastChild.id!==lang_selector.id) {
						content_data.right_container_text.removeChild(content_data.right_container_text.lastChild)
					}
				const ar_render_len = ar_default_render.length
				for (let i = 0; i < ar_render_len; i++) {
					content_data.right_container_text.appendChild(ar_default_render[i]);
				}
			}

			if (original_view_option.selected===true) {

				// remove previous nodes
					while (content_data.right_container_text.lastChild) {//} && content_data.left_container.lastChild.id!==lang_selector.id) {
						content_data.right_container_text.removeChild(content_data.right_container_text.lastChild)
					}

				const node_len 	= self.ar_raw_data.length
				for (let i = 0; i < node_len; i++) {
					const raw_data = self.ar_raw_data[i]
					const text_node = self.tags_to_html(raw_data)
					// add the new one
					content_data.right_container_text.insertAdjacentHTML("beforeend", text_node);
				}
			}

			if (source_view_option.selected===true) {

				// remove previous nodes
					while (content_data.right_container_text.lastChild) {//} && content_data.left_container.lastChild.id!==lang_selector.id) {
						content_data.right_container_text.removeChild(content_data.right_container_text.lastChild)
					}

				const node_len 	= self.ar_raw_data.length
				for (let i = 0; i < node_len; i++) {
					const raw_data = self.ar_raw_data[i]
					// const text_node = self.tags_to_html(raw_data)
					// add the new one
					content_data.right_container_text.innerText =raw_data;
				}
			}
		})


	return fragment
}//end render_text_process_options



/**
* RENDER_DEFAULT
* Process the raw_data as simple html to be printed
* @param object self
* @return array ar_default_render
*/
const render_default = function(self) {

	const fragment = new DocumentFragment()

	const node_len			= self.ar_raw_data.length
	const ar_default_render	= []

	for (let i = 0; i < node_len; i++) {

		const raw_data = self.ar_raw_data[i]

		// BR
		// break into fragments with br tag
		const pattern_br = tr.get_mark_pattern('p');
		const ar_fragment_data = raw_data.split(pattern_br);
		const ar_fragment_data_len = ar_fragment_data.length

		// create the data block for as global container
		const data_block = ui.create_dom_element({
			element_type	: 'table',
			class_name		: 'data_block',
			parent			: fragment
		})

		function get_new_text_node() {

			return ui.create_dom_element({
				element_type	: 'td',
				class_name		: 'right_block',
				parent			: data_block
			})
		}
		let right_block =  get_new_text_node()
		let left_block = ''
		let row = 1
		for (let j = 0; j < ar_fragment_data_len; j++) {
			let current_fragment = ar_fragment_data[j]
			// TC
				function get_tc(match, p1,p2, offset) {

					// the tc is inside the p2 of the match
					const tc = p2

					const tag_node	= '<span class="tc">'+p2+'</span>'

					return tag_node
				}
				const pattern_tc = tr.get_mark_pattern('tc');
				current_fragment = current_fragment.replace(pattern_tc, get_tc);

			// INDEX IN
				function get_index_in(match, p1,p2,p3,p4,p5,p6,p7, offset){

					// the tag_id is inside the p4 of the match
					const tag_id = p4
					// get all indexation terms of the current tag with match tag_id inside the locator
					// const tags_index	= self.transcription_component.data.tags_index || []
					const tags_index	= self.tags_info.tags_index || []

					const ar_indexation	= tags_index.filter(el =>
						el.data.tag_id	=== tag_id
					)
					const ar_indexation_len = ar_indexation.length

					if(ar_indexation_len>0){

						const indexations = ui.create_dom_element({
								id 				: 'index_'+tag_id,
								element_type	: 'div',
								class_name 		: 'indexations',
								parent 			: left_block
							})
							const indexations_tag = ui.create_dom_element({
								element_type	: 'span',
								class_name 		: 'index tag',
								text_content	: tag_id,
								parent 			: indexations
							})

						const ar_labels = []
						for (let i = 0; i < ar_indexation_len; i++) {
							ar_labels.push(ar_indexation[i].label)
						}
						ui.create_dom_element({
								element_type	: 'a',
								class_name 		: 'index terms',
								href 			: '#tagindex_'+tag_id,
								text_content	: ar_labels.join(', '),
								parent 			: indexations
							})
					}

					const tag_node	= '<a id="tagindex_'+tag_id+'" href="#index_'+tag_id+'" class="index in">'+tag_id+'{</a>'

					return tag_node
				}
				const pattern_index_in = tr.get_mark_pattern('indexIn');
				const find_indexing = current_fragment.search(pattern_index_in)

				if(find_indexing !== -1){
						right_block = get_new_text_node()
						row++

						left_block = ui.create_dom_element({
							element_type	: 'td',
							class_name		: 'left_block',
							parent			: data_block
						})
						left_block.style = `grid-row: ${row}`
				}
				current_fragment = current_fragment.replace(pattern_index_in, get_index_in);

			// INDEX OUT
				function get_index_out(match, p1,p2,p3,p4,p5,p6,p7, offset){
					// the tag_id is inside the p4 of the match
					const tag_id	= p4
					const tag_node	= '<a id="out_tagindex_'+tag_id+'" href="#index_'+tag_id+'" class="index out">}'+tag_id+'</a>'
					return tag_node
				}
				const pattern_indexOut = tr.get_mark_pattern('indexOut');
				current_fragment = current_fragment.replace(pattern_indexOut, get_index_out);
				// current_fragment = current_fragment.replace(pattern_indexOut, `<a href=#index_'+tag_id+' class="index out">}$4</a>`);

			// REFERENCE
				function get_reference(match, p1,p2,p3,p4,p5,p6, offset){
					// reference are removed from the text, links are not useful in print
					const tag_node = ''

					return tag_node
				}
				const pattern_reference = tr.get_mark_pattern('reference');
				current_fragment = current_fragment.replace(pattern_reference, get_reference);

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
						el.data.section_tipo			=== locator.section_tipo &&
						parseInt(el.data.section_id)	=== parseInt(locator.section_id) &&
						el.data.component_tipo			=== locator.component_tipo
					)
					const tag_node	= person
						? '<div class="person">'+ person.full_name +': </div>'
						: ''
					return tag_node
				}
				const pattern_person = tr.get_mark_pattern('person');
				current_fragment = current_fragment.replace(pattern_person, get_person);

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
					// const tags_notes = self.transcription_component.data.tags_notes || []
					const tags_notes	= self.tags_info.tags_notes || []

					const note = tags_notes.find(el =>
						el.data.section_tipo			===locator.section_tipo &&
						parseInt(el.data.section_id)	=== parseInt(locator.section_id) &&
						el.data.component_tipo			===locator.component_tipo
					)

					const note_title = (note.title)
						? note.title.join(' | ')
						: null

					const note_text = (note.body && note_title)
						? note_title +'. '+ note.body
						: note.body

					const tag_node	= note
						? '<span class="note"> ['+note_text+'] </span>'
						: ''

					return tag_node
				}
				const pattern_note = tr.get_mark_pattern('note');
				current_fragment = current_fragment.replace(pattern_note, get_note);

			// LANG
				const pattern_lang = tr.get_mark_pattern('lang');
				current_fragment = current_fragment.replace(pattern_lang, `<span class="lang">$6: </span>`);

				right_block.insertAdjacentHTML("beforeend", current_fragment)
		}
		ar_default_render.push(data_block)
	}// end for (let i = 0; i < node_len; i++)


	return ar_default_render
}//end render_default



/**
* RENDER_HEADER
* Process the raw_data as simple html to be printed
* @param object self
* @return DOM DocumentFragment
*/
const render_header = function(self) {

	const transcription_component	= self.transcription_component
	const related_sections			= transcription_component.data.related_sections || null
	const ar_persons				= transcription_component.data.tags_persons || null

	const fragment = new DocumentFragment()

	const datum		= related_sections || {}
	const context	= datum.context
	const data		= datum.data
	const sections	= data.find(el => el.typo==='sections')
	if(!sections){
		return null
	}

	// get the value of related sections (the locator of his data)
	const value_ref_sections = sections.value
	// add the self section, the section of the compnent_text_area, to be processed as common section (for interviewed, camera, etc.)
	const self_transcription_component_section = [{
		section_tipo	: transcription_component.section_tipo,
		section_id		: transcription_component.section_id
	}]
	// create unique array with all locators
	const value			= [...value_ref_sections, ...self_transcription_component_section]
	const value_length	= value.length
	for (let i = 0; i < value_length; i++) {

		const head = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'head',
			parent			: fragment
		})

		const current_locator = {
			section_tipo	: value[i].section_tipo,
			section_id		: value[i].section_id
		}
		if(current_locator.section_tipo !== transcription_component.section_tipo){
			const section_label			= context.find(el => el.model === 'section' && el.section_tipo===current_locator.section_tipo).label
			const ar_component_context	= context.filter(el => el.model !== 'section' && el.section_tipo===current_locator.section_tipo)

			// section label DOM element
			const section_label_node = ui.create_dom_element({
				element_type	: 'div',
				class_name		: 'section_label',
				inner_html		: section_label,
				parent			: head
			})

			const components = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'components',
				parent			: head
			})

			// section_id
				const section_id_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'component_container',
					parent			: components
				})
					ui.create_dom_element({
						element_type	: 'span',
						class_name 		: 'component_label',
						inner_html		: 'Id: ',
						parent			: section_id_container
					})
					ui.create_dom_element({
						element_type	: 'span',
						class_name 		: 'component_value',
						inner_html		: value[i].section_id || '',
						parent			: section_id_container
					})

			for (let j = 0; j < ar_component_context.length; j++) {

				const current_component			= ar_component_context[j] // toString(ar_component_data[j].value)
				const label						= current_component.label
				const current_component_data	= data.find(el =>
					el.model!=='section' &&
					el.tipo===current_component.tipo &&
					el.section_tipo===current_locator.section_tipo &&
					parseInt(el.section_id)===parseInt(current_locator.section_id)
				)
				const current_component_value = current_component_data && current_component_data.value
					? current_component_data.value.join(' | ')
					: ''

				const component_container = ui.create_dom_element({
					element_type	: 'div',
					class_name 		: 'component_container',
					parent			: components
				})
				ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'component_label',
					inner_html		: label + ': ',
					parent			: component_container
				})
				ui.create_dom_element({
					element_type	: 'span',
					class_name 		: 'component_value',
					inner_html		: current_component_value,
					parent			: component_container
				})
			}
		}
		const ar_persons_for_this_section = ar_persons.filter(el =>
			el.section_tipo===current_locator.section_tipo &&
			parseInt(el.section_id)===parseInt(current_locator.section_id)
		)
		for (let j = 0; j < ar_persons_for_this_section.length; j++) {

			const current_person = ar_persons_for_this_section[j] // toString(ar_component_data[j].value)

			const person_container = ui.create_dom_element({
				element_type	: 'div',
				class_name 		: 'components person_container',
				parent			: head
			})
				const person_role = ui.create_dom_element({
					element_type	: 'span',
					text_node		: current_person.role + ': ',
					class_name 		: 'label person_role',
					parent			: person_container
				})
				const person_name = ui.create_dom_element({
					element_type	: 'span',
					text_node		: current_person.full_name || '',
					class_name 		: 'label person_name',
					parent			: person_container
				})
		}//end for (let j = 0; j < ar_persons_for_this_section.length; j++)
	}//end for (let i = 0; i < value_length; i++)


	return fragment
}//end render_header



// @license-end
