/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {clone,dd_console} from '../../common/js/utils/index.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_edit_component_text_area, build_node_tag} from '../../component_text_area/js/render_edit_component_text_area.js'
	import {render_list_component_text_area} from '../../component_text_area/js/render_list_component_text_area.js'
	import {render_mini_component_text_area} from '../../component_text_area/js/render_mini_component_text_area.js'
	import {tr} from '../../common/js/tr.js'
	import {ui} from '../../common/js/ui.js'
	//import '../../../prosemirror/dist/prosemirror.js';



export const component_text_area = function(){

	// element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.lang

		this.section_lang
		this.context
		this.data
		this.parent
		this.node
		this.id

		this.tag // user selected tag DOM element (set on event click_tag_index_)
		this.service = [] // array. current active service (service_tinymce) for current node
		this.events_tokens = []
		// this.services = []

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
	component_text_area.prototype.tm				= render_edit_component_text_area.prototype.edit // time machine render alias of edit
	component_text_area.prototype.search			= render_edit_component_text_area.prototype.search
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
					const service	= options.service

				// create the HTML fragment inside the editor adding in/out tags. Returns new created tag_index_id
					const tag_id = self.create_fragment(key, service)
					if (tag_id) {

						// save modified content
							const value = service.get_value()
							self.save_value(key, value)
							.then((response)=>{
								if (response) {
									// select the new tag image in DOM
									const image_node_selector	= `img.index[data-tag_id=${tag_id}]`
									const image_node			= service.dom_select(image_node_selector)[0]
									if (image_node) {
										image_node.click()
									}
								}
							})
					}else{
						console.error(`Error on create_fragment. tag_id is empty. key: ${key}, service:`,service);
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
					const service	= options.service

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
				const current_service		= self.service[key]
				const inputs_container		= self.node[key].querySelector('.inputs_container'); // (first ul)
				const component_container	= inputs_container.querySelector('li'); // li (first li)
				const button				= component_container.querySelector(".create_fragment") // could exists or not

				if (selection.length<1) {
					if (button) {
						button.remove()
					}
				}else{
					const last_tag_id	= self.get_last_tag_id(key, 'index', current_service)
					const label			= (get_label["create_fragment"] || "Create fragment") + ` ${last_tag_id+1} ` + (SHOW_DEBUG ? ` (chars:${selection.length})` : "")
					if (!button) {
						const create_button = function(selection) {
							const button_create_fragment = ui.create_dom_element({
								element_type	: 'button',
								class_name 		: 'warning compress create_fragment',
								inner_html 		: label,
								parent 			: component_container
							})
							// event create_fragment add publish on click
								button_create_fragment.addEventListener("click", () => {
									event_manager.publish('create_fragment_'+ self.id, {
										caller	: self,
										key		: key,
										service	: current_service
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
			};//end for (var i = len - 1; i >= 0; i--) {
		};//end section_elements
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
			};//end for (var i = len - 1; i >= 0; i--) {
		};//end reference_elements

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
		};//end if (image_elements)

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
				console.log("Elements to update_tag_state:", current_elements);
				console.log("new_data_obj:",new_data_obj);

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
			const image_tag_nodes = self.service[key].dom_select(selection_pattern)
			if (!image_tag_nodes.length) {
				alert("[component_text_area.update_tag] Error on DOM select (service) tag to update_tag tag_id:" +tag_id + " type:" + type)
				return false;
			}

		// update DOM nodes dataset
			update_tag_state(image_tag_nodes, new_data_obj)

		// save and refresh
			self.service[key].set_dirty(true) // Force dirty state
			if (save===true) {
				await self.service[key].save()
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
* Calculates all current service editor tags id of given type (ex. 'reference') and get last used id
* @param ed
*	Text editor instance (tinyMCE)
* @param tag_type
*	Class name of image searched like 'geo'
* 
* @return int tag_id
*/
component_text_area.prototype.get_last_tag_id = function(key, tag_type, service) {

	const self = this

	// default value zero
		const ar_id_final = [0];

	// service check
		if (!service) {
			console.error(`Error on get service. Empty service:`, service);
			return false
		}

	// container . editor_content_data is a DOM node <body> from editor
		const container = service.get_editor_content_data()
		if (!container) {
			console.error(`Error on get_last_tag_id. get_editor_content_data container not found:`, container);
			console.warn(`current service:`, service);
			console.warn(`current service.editor:`, service.editor);
			console.warn(`current service.editor.getBody():`, service.editor.getBody());
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
component_text_area.prototype.create_fragment = function(key, service) {

	const self = this

	// service check
		if (!service) {
			console.error("-> [component_text_area.create_fragment] service not received! key:", key);
			return false
		}

	// selection text
		const selection_raw = service.get_selection();
		if (!selection_raw || selection_raw.length<1) {
			console.warn("Ignored empty selection:", selection_raw, key);
			return false
		}

	// last_tag_id. Find last image of type index and returns id or 0
		const last_tag_index_id = self.get_last_tag_id(key, 'index', service)

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
			const range_clon = service.wrap_selection_with_tags(image_in, image_out)

	return (range_clon)
		? tag_id
		: false
};//end create_fragment


