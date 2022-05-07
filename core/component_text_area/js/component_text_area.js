/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {tr} from '../../common/js/tr.js'
	import {ui} from '../../common/js/ui.js'
	import {render_edit_component_text_area, build_node_tag} from '../../component_text_area/js/render_edit_component_text_area.js'
	import {render_list_component_text_area} from '../../component_text_area/js/render_list_component_text_area.js'
	import {render_mini_component_text_area} from '../../component_text_area/js/render_mini_component_text_area.js'
	import {render_search_component_text_area} from '../../component_text_area/js/render_search_component_text_area.js'
	//import '../../../prosemirror/dist/prosemirror.js';



export const component_text_area = function(){

	// element properties declare
		this.model			= null
		this.tipo			= null
		this.section_tipo	= null
		this.section_id		= null
		this.mode			= null
		this.lang			= null

		this.section_lang	= null
		this.context		= null
		this.data			= null
		this.parent			= null
		this.node			= null
		this.id				= null

		this.tag			= null // user selected tag DOM element (set on event click_tag_index_)
		this.text_editor	= [] // array. current active text_editor (service_tinymce) for current node
		this.events_tokens	= []
		// this.services	= []

		this.custom_toolbar = '' // add buttons to the text_area toolbar, options: button_person button_note button_geo button_reference

	return true
};//end component_text_area



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	// component_text_area.prototype.init			= component_common.prototype.init
	component_text_area.prototype.build				= component_common.prototype.build
	component_text_area.prototype.render			= common.prototype.render
	component_text_area.prototype.refresh			= common.prototype.refresh
	component_text_area.prototype.destroy			= common.prototype.destroy

	// change data
	component_text_area.prototype.save				= component_common.prototype.save
	component_text_area.prototype.change_value		= component_common.prototype.change_value
	component_text_area.prototype.update_data_value	= component_common.prototype.update_data_value
	component_text_area.prototype.update_datum		= component_common.prototype.update_datum
	component_text_area.prototype.build_rqo			= common.prototype.build_rqo

	// render
	component_text_area.prototype.mini				= render_mini_component_text_area.prototype.mini
	component_text_area.prototype.list				= render_list_component_text_area.prototype.list
	component_text_area.prototype.edit				= render_edit_component_text_area.prototype.edit
	component_text_area.prototype.edit_in_list		= render_edit_component_text_area.prototype.edit
	component_text_area.prototype.search			= render_search_component_text_area.prototype.search
	component_text_area.prototype.change_mode		= component_common.prototype.change_mode



/**
* INIT
* @return promise bool
*/
component_text_area.prototype.init = async function(options) {
	
	const self = this

	// events subscribe
		// create_fragment_ . User click over button 'create_fragment'
			self.events_tokens.push(
				event_manager.subscribe('create_fragment_' + self.id, fn_create_fragment)
			)
			function fn_create_fragment(options) {

				// options
					const key		= options.key
					const text_editor	= options.text_editor

				// create the HTML fragment inside the editor adding in/out tags. Returns new created tag_index_id
					const tag_id = self.create_fragment(key, text_editor)
					if (tag_id) {

						// save modified content
							const value = text_editor.get_value()
							self.save_value(key, value)
							.then((response)=>{
								if (response) {
									// select the new tag image in DOM
									const image_node_selector	= `img.index[data-tag_id=${tag_id}]`
									const image_node			= text_editor.dom_select(image_node_selector)[0]
									if (image_node) {
										image_node.click()
									}
								}
							})
					}else{
						console.error(`Error on create_fragment. tag_id is empty. key: ${key}, text_editor:`,text_editor);
					}//end if (created!==false)

				return true
			}//end fn_create_fragment
		// click_tag_index_. User click over image index tag
			self.events_tokens.push(
				event_manager.subscribe('click_tag_index_' + self.id_base, fn_click_tag_index)
			)
			function fn_click_tag_index(options) {

				// options
					const tag		= options.tag // DOM tag element
					const text_editor	= options.text_editor

				// fix selected tag element
					self.tag = tag

				return true
			}//end fn_create_fragment
		// text_selection
			self.events_tokens.push(
				event_manager.subscribe('text_selection_'+ self.id, fn_show_button_create_fragment)
			)
			function fn_show_button_create_fragment(options) {
				// dd_console('--> show_button_create_fragment options', 'DEBUG', options)

				// options
					const selection	= options.selection
					const caller	= options.caller

				const key					= 0; // key (only one editor is available but component could support multiple)
				const current_text_editor		= self.text_editor[key]
				const inputs_container		= self.node[key].querySelector('.inputs_container'); // (first ul)
				const component_container	= inputs_container.querySelector('li'); // li (first li)
				const button				= component_container.querySelector(".create_fragment") // could exists or not

				if (selection.length<1) {
					if (button) {
						button.remove()
					}
				}else{
					const last_tag_id	= self.get_last_tag_id(key, 'index', current_text_editor)
					const label			= (get_label.create_fragment || "Create fragment") + ` ${last_tag_id+1} ` + (SHOW_DEBUG ? ` (chars:${selection.length})` : "")
					if (!button) {
						const create_button = function(selection) {
							const button_create_fragment = ui.create_dom_element({
								element_type	: 'button',
								class_name		: 'warning compress create_fragment',
								inner_html		: label,
								parent			: component_container
							})
							// event create_fragment add publish on click
								button_create_fragment.addEventListener("click", () => {
									event_manager.publish('create_fragment_'+ self.id, {
										caller	: self,
										key		: key,
										text_editor	: current_text_editor
									})
								})

							return button_create_fragment
						}//end fn create_button
						create_button(selection)
					}else{
						button.innerHTML = label
					}
				}

				return true
			}//end fn_show_button_create_fragment

	// call the generic common tool init
		const common_init = component_common.prototype.init.call(self, options);
	console.log("self------//////////-----*************:",self);
	return common_init
};//end  init



/**
* TAGS_TO_HTML
* Parses Dédalo server side tags to html tags
* i.e. '[TC_00:15:12:01.000]' => '<img id="[TC_00:00:25.684_TC]" class="tc" src="" ... />'
*/
component_text_area.prototype.tags_to_html = function(value) {

	const html = (value)
		? tr.add_tag_img_on_the_fly(value)
		: null

	return html
};//end tags_to_html



/**
* SET_VALUE
* Set individual value based on element key
* @param int key
*	defined in container dataset key
* @param string value
*	value from active text editor
* @return promise
*/
component_text_area.prototype.set_value = function(value) {

	const self = this

	const changed_data = Object.freeze({
		action	: 'update',
		key		: value.key,
		value	: value.value
	})
	return self.change_value({
		changed_data	: changed_data,
		refresh			: true
	})
};//end set_value



/**
* SAVE_VALUE
* Saves individual value based on element key
* @param int key
*	defined in container dataset key
* @param string value
*	value from active text editor
*/
component_text_area.prototype.save_value = function(key, value) {

	const self = this

	const new_data = self.preprocess_text_to_save(value)

	// const string_value = value.innerHTML
	// const old_data = self.data.value[key]
	// if(string_value === old_data) return false

	const changed_data = Object.freeze({
		action	: 'update',
		key		: key,
		value	: (new_data.length>0) ? new_data : null,
	})
	const js_promise = self.change_value({
		changed_data	: changed_data,
		refresh			: false
	})
	.then((save_response)=>{
		// event to update the dom elements of the instance
		event_manager.publish('update_value_'+self.id, changed_data)
	})

	return js_promise
};//end save_value



/**
* PREPROCESS_TEXT_TO_SAVE
* Replace <section> tags to internal Dédalo tags
* Unify text content format
* @return string
*/
component_text_area.prototype.preprocess_text_to_save = function(html_value) {

	const self = this

	// clone text. Avoid interactions between html nodes
		const cloned_text = document.createElement('div')
			  cloned_text.insertAdjacentHTML('afterbegin', html_value);

	// section tags (struct)
		// Iterate all section elements
		const section_elements 			= cloned_text.getElementsByTagName('section')
		const ar_section_id 			= []
		const ar_section_id_duplicates 	= []
		if (section_elements) {
			//console.log(section_elements)
			const section_elements_len = section_elements.length
			for (let i = section_elements_len - 1; i >= 0; i--) {
				// Convert section tags to dedalo internal labels
				// <section class="section_struct text_unselectable" id="section_2" data-state="n" data-label="" data-data="{'section_tipo':'rsc370','section_id':'3'}">..</section>
				// [struct-a-1-1-data:{'section_tipo':'rsc370','section_id':'3'}:data]...[/struct-a-1-1-data:{'section_tipo':'rsc370','section_id':'3'}:data]
				const tag_id		= section_elements[i].dataset.tag_id
				const state			= section_elements[i].dataset.state
				const label			= section_elements[i].dataset.label
				const data			= section_elements[i].dataset.data
				// Compose Dédalo tags
				const tag_in		= self.build_data_tag('structIn', tag_id, state, label, data)
				const tag_out		= self.build_data_tag('structOut', tag_id, state, label, data)
				const final_string	= tag_in + section_elements[i].innerHTML + tag_out

				// Replaces tag content string with new created
				section_elements[i].innerHTML = final_string

				// Unwrap section tag node (removes tags and leaves only contents)
				unwrap_element(section_elements[i]);

				// Check if current tag already exists (duplicates)
				if(ar_section_id.indexOf(tag_id) !== -1) {
					// Duplication detected!
					ar_section_id_duplicates.push(tag_id)
				}

				ar_section_id.push(tag_id)
			}//end for (var i = len - 1; i >= 0; i--) {
		}//end section_elements
		//console.log("ar_section_id",ar_section_id);
		if (ar_section_id_duplicates.length>0) {
			if(SHOW_DEBUG===true) {
			console.log("DEBUG Warning: Duplicate structuration tags found! \nDuplicates: ",ar_section_id_duplicates)	//.join(',')+" \nThis may be because you have inadvertently copied labels more than once from the source text. Please contact your administrator to fix this inconsistency");
			}
		}

	// reference tags
		// Iterate all reference elements
		const reference_elements = cloned_text.getElementsByTagName('reference')
		if (reference_elements) {
			//console.log(reference_elements)
			const reference_elements_len = reference_elements.length
			for (let i = reference_elements_len - 1; i >= 0; i--) {
				// Convert section tags to dedalo internal labels
				// <reference class="reference_struct text_unselectable" id="reference_2" data-state="n" data-label="" data-data="{'reference_tipo':'rsc370','reference_id':'3'}">..</reference>
				// [reference-a-1-1-data:{'reference_tipo':'rsc370','reference_id':'3'}:data]...[/reference-a-1-1-data:{'reference_tipo':'rsc370','reference_id':'3'}:data]
				const tag_id		= reference_elements[i].dataset.tag_id
				const state			= reference_elements[i].dataset.state
				const label			= reference_elements[i].dataset.label
				const data			= reference_elements[i].dataset.data
				// Compose Dédalo tags
				const tag_in		= self.build_data_tag('referenceIn', tag_id, state, label, data)
				const tag_out		= self.build_data_tag('referenceOut', tag_id, state, label, data)
				const final_string	= tag_in + reference_elements[i].innerHTML + tag_out

				// Replaces tag content string with new created
				reference_elements[i].innerHTML = final_string

				// Unwrap section tag node (removes tags and leaves only contents)
				unwrap_element(reference_elements[i]);
			}//end for (var i = len - 1; i >= 0; i--) {
		}//end reference_elements

	// img tags (index, tc, svg, geo, person, etc.)
		const image_elements = cloned_text.querySelectorAll('img') // ! use querySelectorAll to avoid loop problems on i++
		if (image_elements) {

			const ar_svg_used_tag_id = [] // for renumerate on the fly

			const image_elements_len = image_elements.length
			for (let i = 0; i < image_elements_len; i++) {

				const current_element = image_elements[i]

				let current_tag_id = current_element.dataset.tag_id

				// svg case. Keep current svg tag_id for renumerate on the fly
					if (current_element.dataset.type==="svg") {

						current_tag_id = parseInt(current_tag_id)
						if(current_tag_id<1) current_tag_id = 1

						// console.log("ar_svg_used_tag_id.indexOf(current_tag_id):",ar_svg_used_tag_id.indexOf(current_tag_id), ar_svg_used_tag_id, current_tag_id);
						// If is zero or already exits, renumerate
						if(ar_svg_used_tag_id.indexOf( current_tag_id ) > -1) {
							// Renumerate
							current_tag_id = Math.max.apply(Math, ar_svg_used_tag_id) + 1
						}
						ar_svg_used_tag_id.push( current_tag_id )
					}

				// build_data_tag. Build dedalo tag from node image dataset	info
				const final_string = self.build_data_tag(current_element.dataset.type,
														 current_tag_id,
														 current_element.dataset.state,
														 current_element.dataset.label,
														 current_element.dataset.data)
				if (final_string) {
					// Replaces tag content string with new created
					current_element.innerHTML = final_string
					// Unwrap section tag node (removes tags and leaves only contents)
					unwrap_element(current_element)
				}
			}
		}//end if (image_elements)

	// temporal elements. Remove after use
		let temp_elements = []

		// remove temporal elements (h2)
			temp_elements = cloned_text.getElementsByTagName('h2')
			const h2_len = temp_elements.length
			for (let i = h2_len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}

		// remove temporal header (toc)
			temp_elements = cloned_text.getElementsByTagName('header')
			const header_len = temp_elements.length
			for (let i = header_len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}

		// remove fake caret
			temp_elements = cloned_text.getElementsByTagName('caret')
			const caret_len = temp_elements.length
			for (let i = caret_len - 1; i >= 0; i--) {
				temp_elements[i].remove()
			}

		// remove <p> (and change </p> by <br>)
			temp_elements = cloned_text.getElementsByTagName("p")
			const p_len = temp_elements.length
			for (let i = p_len - 1; i >= 0; i--) {
				// Add tag <br> after </p>
				let new_element = document.createElement("br")
				temp_elements[i].parentNode.insertBefore(new_element, temp_elements[i].nextSibling);
				// Unwrap tag p content (removes tags and leaves only contents)
				unwrap_element(temp_elements[i]);
			}


	if(SHOW_DEBUG===true) {
		//const end  	= new Date().getTime()
		//const time 	= end - start
		//console.log("[component_text_area.preprocess_text_to_save] exec in ms:",time);
		//console.log("[component_text_area.render_all_tags] time: " +time+ " ms")
	}

	return cloned_text.innerHTML
};//end preprocess_text_to_save



/**
* UNWRAP_ELEMENT
* @return bool
*/
const unwrap_element = function(el) {

	// get the element's parent node
	const parent = el.parentNode;

	// move all children out of the element
	while (el.firstChild) parent.insertBefore(el.firstChild, el);

	// remove the empty element
	parent.removeChild(el);

	return true
};//end unwrap_element



/**
* IS_TINY
* @return bool
*/
	// const is_tiny = function(ed) {

	// 	const is_tiny = (ed===null || typeof ed!=='object' || ed.type!=='setupeditor')
	// 		? false // USING DIV AS EDITOR (LIKE STRUCT)
	// 		: true  // USING TINYMCE EDITOR

	// 	return is_tiny
	// };//end is_tiny



/**
* UPDATE_TAG
* Edit selected tag and add or modify datasets
*/
component_text_area.prototype.update_tag = async function(options) {

	const self = this

	// check options value
		if (typeof options==="undefined") {
			alert("Please select tag");
			console.error("[component_text_area.update_tag] ERROR. Stopped update_tag. Empty options:", options);
			console.trace();
			return false
		}

	// options
		const type			= options.type
		const tag_id		= options.tag_id
		const new_data_obj	= options.dataset
		const save			= options.save || false

	// DOM elements
		const wrapper	= self.node[0]
		const textarea	= wrapper.querySelector('textarea')
		const container	= (textarea)
			? tinymce.get(textarea.id) // ED container
			: wrapper.getElementsByClassName('text_area_tool_structuration')[0] // Struct container

	// DOM Selection pattern
		const selection_pattern = (type.indexOf('In')!==-1 || type.indexOf('Out')!==-1)
			? '[data-type^="' + type.replace(/In|Out/, '') + '"][data-tag_id="'+tag_id+'"]'
			: '[data-type="'+type+'"][data-tag_id="'+tag_id+'"]'

	// update_tag_state function
		const update_tag_state = (current_elements, new_data_obj)=>{

			// debug
				// console.log("Elements to update_tag_state:", current_elements);
				// console.log("new_data_obj:",new_data_obj);

			// Iterate and update tag state
			const len = current_elements.length
			for (let i = len - 1; i >= 0; i--) {
				// Set new state to dataset of each dataset
				for (let key in new_data_obj) {
					current_elements[i].dataset[key] = new_data_obj[key]
				}
			}
		}

	// editor
		// image tags selection from DOM
			const key = 0
			const image_tag_nodes = self.text_editor[key].dom_select(selection_pattern)
			if (!image_tag_nodes.length) {
				alert("[component_text_area.update_tag] Error on DOM select (text_editor) tag to update_tag tag_id:" +tag_id + " type:" + type)
				return false;
			}

		// update DOM nodes dataset
			update_tag_state(image_tag_nodes, new_data_obj)

		// save and refresh
			self.text_editor[key].set_dirty(true) // Force dirty state
			if (save===true) {
				await self.text_editor[key].save()
				self.refresh()
			}

	return true
};//end update_tag



/**
* BUILD_DATA_TAG
* Unified way of create Dedalo internal custom tags from javascript
* i.e. '[index-d-7--data::data][/index-d-7--data::data]'
* @return string tag
*/
component_text_area.prototype.build_data_tag = function(type, tag_id, state, label, data) {

	const self = this

	// check tag type
		const valid_types = ["indexIn","indexOut","structIn","structOut","tc","tc2","svg","draw","geo","page","person","note","referenceIn","referenceOut"]
		if (valid_types.includes(type)===false) {
			console.warn("[component_text_area.build_data_tag] Invalid tag type:", type);
			alert("[component_text_area.build_data_tag] Invalid tag type: " + type)
			return false
		}

	// bracket_in. Is different for close tag
		const bracket_in = (type.indexOf("Out")!==-1)
			? "[/"
			: "["

	// type_name. Removes suffixes 'In' and 'Out'
		const type_name = type.replace(/In|Out/, '')

	// label. Truncate and replace - avoid future errors
		const safe_label = (typeof label==="undefined")
			? ''
			: (label.substring(0,22)).replace(new RegExp('-', 'g'), '_');

	// dedalo_tag
		const dedalo_tag = (type==="tc")
			? tag_id
			: bracket_in + type_name + "-" + state + "-" + tag_id + "-" + safe_label + "-" + "data:" + data + ":data]"

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("[component_text_area.build_data_tag] dedalo_tag:", dedalo_tag)
		}


	return dedalo_tag
};//end build_data_tag



/**
* GET_LAST_TAG_ID
* Calculates all current text_editor editor tags id of given type (ex. 'reference') and get last used id
* @param ed
*	Text editor instance (tinyMCE)
* @param tag_type
*	Class name of image searched like 'geo'
* 
* @return int tag_id
*/
component_text_area.prototype.get_last_tag_id = function(key, tag_type, text_editor) {

	const self = this

	// default value zero
		const ar_id_final = [0];

	// text_editor check
		if (!text_editor) {
			console.error(`Error on get text_editor. Empty text_editor:`, text_editor);
			return false
		}

	// container . editor_content_data is a DOM node <body> from editor
		const container = text_editor.get_editor_content_data()
		if (!container) {
			console.error(`Error on get_last_tag_id. get_editor_content_data container not found:`, container);
			console.warn(`current text_editor:`, text_editor);
			console.warn(`current text_editor.editor:`, text_editor.editor);
			console.warn(`current text_editor.editor.getBody():`, text_editor.editor.getBody());
			return false
		}

	// get all tags of type
		switch(tag_type) {

			case 'struct':
				// section : Select all sections in text
				const ar_struct_tags = container.getElementsByTagName('section')

				// iterate to find tipo_tag
				const ar_struct_tags_length = ar_struct_tags.length
				for (let i = ar_struct_tags_length - 1; i >= 0; i--) {

					// current tag like [svg-n-1]
					const current_tag	= ar_struct_tags[i].id;
					const ar_parts		= current_tag.split('_');

					const number = (typeof ar_parts[1]!=="undefined")
						? parseInt(ar_parts[1])
						: 0

					// Insert id formated as number in final array
					ar_id_final.push(number)
				}
				break;

			case 'reference':
				// reference : Select all reference in text
				const ar_tags = container.getElementsByTagName('reference')

				// iterate to find tipo_tag
				const ar_tags_length = ar_tags.length
				for (let i = ar_tags_length - 1; i >= 0; i--) {

					// current tag like [svg-n-1]
					const current_tag	= ar_tags[i].id;
					const ar_parts		= current_tag.split('_');

					const number = (typeof ar_parts[1]!=="undefined")
						? parseInt(ar_parts[1])
						: 0

					// Insert id formated as number in final array
					ar_id_final.push(number)
				}
				break;

			default:
				// like img as id: [index-n-1--label-data:**]
				const ar_img = container.querySelectorAll('img.'+tag_type)

				// iterate to find tipo_tag (filter by classname: index, etc.)
				const ar_img_length = ar_img.length
				for (let i = ar_img_length - 1; i >= 0; i--) {

					const current_tag	= ar_img[i].id;
					const ar_parts		= current_tag.split('-');

					const number = (typeof ar_parts[2]!=="undefined")
						? parseInt(ar_parts[2])
						: 0

					// Insert id formatted as number in final array
						ar_id_final.push(number)
				}
				break;
		}

	// last id
		const last_tag_id = parseInt( Math.max.apply(null, ar_id_final) );

	// debug
		if(SHOW_DEBUG===true) {
			console.log("[component_text_area.get_last_tag_id] last_tag_id of type: " + tag_type +" -> ", last_tag_id )
		}


	return last_tag_id
};//end get_last_tag_id



/**
* CREATE FRAGMENT (using index tags)
* Create the images (with the tags) at the beginning and end of the selected text
* @return bool false | int tag_id
*/
component_text_area.prototype.create_fragment = function(key, text_editor) {

	const self = this

	// text_editor check
		if (!text_editor) {
			console.error("-> [component_text_area.create_fragment] text_editor not received! key:", key);
			return false
		}

	// selection text
		const selection_raw = text_editor.get_selection();
		if (!selection_raw || selection_raw.length<1) {
			console.warn("Ignored empty selection:", selection_raw, key);
			return false
		}

	// last_tag_id. Find last image of type index and returns id or 0
		const last_tag_index_id = self.get_last_tag_id(key, 'index', text_editor)

	// create new string wrapping selection with new tags
		// tag state. Default is 'n' (normal)
			const tag_state = 'n';

		// tag_id. Last id plus one
			const tag_id = parseInt(last_tag_index_id) + 1

		// tag images
			const image_in  = build_node_tag({
				type	: "indexIn",
				state	: tag_state,
				label	: "label in " + tag_id,
				data	: ""
			}, tag_id)
			const image_out  = build_node_tag({
				type	: "indexOut",
				state	: tag_state,
				label	: "label in " + tag_id,
				data	: ""
			}, tag_id)

		// wrap_selection_with_tags. Prepend and apped tag image node to current editor text selection
			const range_clon = text_editor.wrap_selection_with_tags(image_in, image_out)

	return (range_clon)
		? tag_id
		: false
};//end create_fragment





/*	NOTES
----------------------------------------------------------------------------------------- */



	/**
	* CREATE_NEW_NOTE
	* Build a new annotation when user clicks on text editor button
	*
	* @return
	*/
	component_text_area.prototype.create_new_note = function(key, text_editor) {

		const self = this

		// Select text editor
		//var ed 		 	= tinyMCE.activeEditor
		const tag_type 	= 'note'
		const last_tag_id = self.get_last_tag_id(key, tag_type, text_editor)
		const note_number = parseInt(last_tag_id) + 1

		const trigger_vars = {
			mode 		 	: 'create_new_note',
			note_number		: note_number,
		}
		//console.log(trigger_vars); return;

		let js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.create_new_note] response", response);
			}

			if (response===null) {
				alert("Error on create annotation tag")
			}else{

				let label = note_number
				let state = 'a'
				let data  = JSON.stringify(response.result)
					data  = replaceAll('"', '\'', data); // Format data Important !!

				// IMG : Create and insert image in text
				//var img_html = component_text_area.build_note_img(label, state, data)
				let img = component_text_area.build_dom_element_from_data(tag_type, note_number, state, label, data)

				if (component_text_area.is_tiny(ed)===false) {
					// Insert html on editor
					let selection = document.getSelection()
						//console.log(selection)
					let rg = selection.getRangeAt( 0 )
						//console.log(rg)
						// Set collapse false to go to end of range
						rg.collapse(false);
						// Insert node
						rg.insertNode(img)

					tool_structuration.update_titles_on_save=false

					component_text_area.set_reload_on_save(false)
					component_text_area.set_content_is_changed(true)

					var component_obj = ed

				}else{
					let img_html 	= img.outerHTML

					ed.selection.collapse()

					// Insert html on editor
					ed.selection.setContent( img_html, {format:'raw'} )

					// Set editor as modified and save
					ed.setDirty(true)
					ed.save(); // updates this instance's textarea

					var component_obj = text_area_component
				}

				let text_area_wrapper = component_common.get_wrapper_from_element(component_obj)

				// Fix data in global class
				// Fix selected_tag_data
				component_text_area.selected_tag_data = {
					type 			: tag_type,
					tag_id 			: note_number,
					component_tipo 	: text_area_wrapper.dataset.tipo,
					lang 			: text_area_wrapper.dataset.lang
				}
				if(SHOW_DEBUG===true) {
					console.log("[component_text_area.create_new_note] Fixed class var selected_tag_data:",component_text_area.selected_tag_data);
				}


				// Save text area
				var js_promise_save = component_text_area.Save( component_obj, null, ed )
				if (js_promise_save) {
					js_promise_save.then(function(response){

						setTimeout(function(){
							// On finish save, select created tag (the last) and trigger click action
							if (component_text_area.is_tiny(ed)===false) {
								var last_tag_obj = component_text_area.get_last_element(ed, 'note')
								if (last_tag_obj) {

									// Fix var
									component_text_area.tag_obj = last_tag_obj

									// Click event of section tag
									img.addEventListener("click", function(evt_click){
										// Show note info
										component_text_area.show_note_info( ed, evt_click, component_obj )
									},false)

									img.click()
								}
							}else{
								var last_tag_obj = component_text_area.get_last_element(ed, 'note')
								if (last_tag_obj) {
									// Select image in text editor
									ed.selection.select(last_tag_obj).click(); //select the inserted element // .scrollIntoView(false)
									// Trigger exec click on selected tag
									//last_tag_obj.click();
								}
							}
						},150)
					});
				}
			}
		})

		return js_promise
	}//end create_new_note



	/**
	* SHOW_NOTE_INFO
	* @return promise js_promise
	*/
	component_text_area.prototype.show_note_info = function( ed, evt, text_area_component ) {

		//console.log("[component_text_area.show_note_info] ed, evt, text_area_component", ed, evt, text_area_component);

		let tag_obj 	 = evt.target
		let tag 		 = evt.target.id
		let locator 	 = component_text_area.get_data_locator_from_tag( tag_obj )
		let section_tipo = locator.section_tipo
		let section_id 	 = locator.section_id
		let tag_id 		 = tag_obj.dataset.tag_id


		if(SHOW_DEBUG===true) {
			//console.log("[component_text_area.show_note_info] selected_tag_editor", component_text_area.selected_tag_editor);
			//console.log("component_text_area.tag_obj",component_text_area.tag_obj);
			//console.warn("[component_text_area.show_note_info]component_text_area.selected_tag_data",component_text_area.selected_tag_data);
		}

		const trigger_vars = {
				mode			: 'show_note_info',
				section_tipo	: section_tipo,
				section_id		: section_id,
				lang			: text_area_component.dataset.lang
			}
			//console.log("[component_text_area.show_note_info] trigger_vars ",trigger_vars); //return

		let js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) {
				console.log("[component_text_area.show_note_info] response", response);
			}

			if (response===null) {
				alert("Error on show_note_info. See server log for details")
			}else{

				//$('#div_note_wrapper').remove()

				// Build note_dialog
				let note_dialog = component_text_area.build_note_dialog({
						wrapper_id 		 	: "div_note_wrapper",
						evt 	  			: evt,
						response  		 	: response,
						tag_id 				: tag_id,
						ed 				 	: ed,
						text_area_component : text_area_component
				})
				document.body.appendChild(note_dialog)
				exec_scripts_inside(note_dialog)


				// Open dialog Bootstrap modal
				$(note_dialog).modal({
					show 	  : true,
					keyboard  : true,
					cssClass  : 'modal'
				}).on('shown.bs.modal', function (e) {
					// Focus text area field
					if (component_text_area.is_tiny(ed)===true) {
						tinymce.execCommand('mceFocus',false,ed.id);
					}else{
						if(SHOW_DEBUG===true) {
							console.log("[component_text_area.show_note_info] not is tiny");
						}
					}

					/*
					// UID for init object tracking (not add lang never here!)
					var div_note_wrapper  		= document.getElementById('div_note_wrapper')
					var text_area_note_wrapper 	= div_note_wrapper.querySelector('.css_wrap_text_area')
						init_uid = text_area_note_wrapper.dataset.section_tipo +"_"+ text_area_note_wrapper.dataset.parent +"_"+ text_area_note_wrapper.dataset.tipo
						*/
				}).on('hidden.bs.modal', function (e) {

					// Update lock_components state (BLUR)
					if(typeof lock_components!='undefined') {
						// Unlock all components of current section on close note dialog
						lock_components.delete_user_section_locks({
							section_id   : section_id,
							section_tipo : section_tipo
						})
					}

					// Removes modal element from DOM on close
					$(this).remove()
					/*
					// Delete init property to force reinit on new click over note
					delete component_text_area.inited[init_uid]
					if(SHOW_DEBUG===true) {
						console.log("[component_text_area.show_note_info] Deleted property inited:", init_uid);
					}*/
				})
			}
		})

		return js_promise
	}//end show_note_info



	/**
	* BUILD_NOTE_DIALOG
	* @return DOM object
	*/
	component_text_area.prototype.build_note_dialog = function( options ) {

		let wrapper_id = options.wrapper_id
		let older_div_note_wrapper = document.getElementById(wrapper_id)
			if (older_div_note_wrapper) {
				older_div_note_wrapper.parentNode.removeChild(older_div_note_wrapper)
			}
		// note wrapper
		let div_note_wrapper = document.createElement("div")
			div_note_wrapper.id = wrapper_id


		let header = document.createElement("div")
			// h4 <h4 class="modal-title">Modal title</h4>
			let h4 = document.createElement("h4")
				h4.classList.add('modal-title')
				// Add
				h4.appendChild( document.createTextNode("Note " + options.tag_id + " - Created by user "+options.response.created_by_user_name) )
				header.appendChild(h4)


		let body = document.createElement("div")
			// component_text element
			let component_text = document.createElement("div")
				component_text.innerHTML = options.response.component_text_html
				body = component_text
				//exec_scripts_inside(component_text)

		let footer = document.createElement("div")

			// Button delete <button type="button" class="btn btn-warning">Warning</button>
			let button_delete = document.createElement("button")
				button_delete.classList.add("btn","btn-warning","btn-sm","button_delete_note")
				button_delete.dataset.dismiss = "modal"
				button_delete.addEventListener('click', function(e) {

					if (!options.evt.target) {
						// New tag case. Select last tag
						var current_tag_obj = component_text_area.get_last_element(options.ed, 'note')
					}else{
						// Normal selection case
						var current_tag_obj = options.evt.target
					}

					// Fix current tag_obj
					component_text_area.tag_obj = current_tag_obj

					// Inject options tag_obj
					options.tag_obj = current_tag_obj

					component_text_area.delete_note(this, options)
				})
				button_delete.appendChild( document.createTextNode(get_label.borrar) )
				// Add
				footer.appendChild(button_delete)

			// created_date
			let created_date = document.createElement("div")
				created_date.classList.add('created_date')
				created_date.appendChild( document.createTextNode("Created date "+options.response.created_date) )
				// Add
				footer.appendChild(created_date)

			// Button ok <button type="button" class="btn btn-warning">OK</button>
			let button_ok = document.createElement("button")
				button_ok.classList.add("btn","btn-success","btn-sm","button_ok_note")
				button_ok.dataset.dismiss = "modal"
				button_ok.addEventListener('click', function(e) {
					//let ed = tinyMCE.activeEditor
					let ed = options.ed
					if (component_text_area.is_tiny(ed)) {
						ed.save()
					}
				})
				button_ok.appendChild( document.createTextNode("  OK  ") )
				// Add
				footer.appendChild(button_ok)


		// modal dialog
		let modal_dialog = common.build_modal_dialog({
			id 		: wrapper_id,
			header 	: header,
			footer  : footer,
			body 	: body
		})

		div_note_wrapper.appendChild(modal_dialog)


		return modal_dialog
	}//end build_note_dialog



	/**
	* DELETE_NOTE
	* @return
	*/
	component_text_area.prototype.delete_note = function( button_obj, options ) {

		if (!confirm(get_label.borrar + " " +get_label.etiqueta+ " " +options.tag_id+" ?")) {
			return false;
		}
		if(SHOW_DEBUG===true) {
			//console.log(options); return;
		}

		// Editor where is the note tag (note is NOT the current tinymce.activeEditor)
		var ed 			 = options.ed
		var text_area_obj= options.text_area_component
		var tag_obj 	 = options.tag_obj
		var locator		 = component_text_area.get_data_locator_from_tag( tag_obj )

		var trigger_vars = {
			mode			: 'delete_note',
			section_tipo	: locator.section_tipo,
			section_id		: locator.section_id,
			lang			: this.lang,
		}
		//console.log(trigger_vars); return;
		//console.log(tag_obj); return;

		var js_promise 	 = common.get_json_data(component_text_area.url_trigger, trigger_vars).then(function(response) {
			if(SHOW_DEBUG===true) console.log("[component_text_area.delete_note] response:", response);

			if (response===null) {
				alert("Error on delete_note")
			}else{

				if (component_text_area.is_tiny(ed)===true) {
					// CASE TINYMCE

					// Remove image in editor
					var image_note = ed.selection.getNode()
					if (image_note && image_note.nodeName==='IMG') {
						// Image is already selected
					}else{
						// Image is created and deleted. Locate last image note
						image_note = component_text_area.get_last_element(ed,'note');
					}

					if (image_note && image_note.nodeName==='IMG') {
						// Remove img
						ed.dom.remove(image_note)

						// Set editor as modified and save
						ed.setDirty(true)
						ed.save(); // updates this instance's textarea
						component_text_area.Save( text_area_obj, null, ed )
					}
				}else{
					// CASE PREVIEW TEXT EDITOR (STRUCTURATION)

					// Remove tag from DOM
					tag_obj.remove()

					// Config save to avoid update toc titles
					tool_structuration.update_titles_on_save=false

					// Save
					tool_structuration.save_structuration_text()
				}//end if (component_text_area.is_tiny(ed)===true)
			}
		})

		return js_promise
	}//end delete_note



