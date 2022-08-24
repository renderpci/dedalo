/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	// import {clone,dd_console} from '../../common/js/utils/index.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {tr} from '../../common/js/tr.js'
	import {ui} from '../../common/js/ui.js'
	import {render_edit_component_text_area} from '../../component_text_area/js/render_edit_component_text_area.js'
	import {render_list_component_text_area} from '../../component_text_area/js/render_list_component_text_area.js'
	import {render_mini_component_text_area} from '../../component_text_area/js/render_mini_component_text_area.js'
	import {render_search_component_text_area} from '../../component_text_area/js/render_search_component_text_area.js'
	//import '../../../prosemirror/dist/prosemirror.js';
	import {service_ckeditor} from '../../services/service_ckeditor/js/service_ckeditor.js'
	// import {service_tinymce} from '../../services/service_tinymce/js/service_tinymce.js'



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

		// service_text_editor. Name of desired service  to call (service_ckeditor|service_tinymce)
		this.service_text_editor			= null
		// service_text_editor_instance. array of created service instances based on input key (one is expected)
		this.service_text_editor_instance	= []
		// auto_init_editor. default is false. To activate, set Ontology property 'auto_init_editor' as true, or configure this component in run-time from tool (like tool_indexation do)
		this.auto_init_editor				= undefined


	return true
}//end component_text_area



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
	// component_text_area.prototype.save			= component_common.prototype.save
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
* 	Resolve bool
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
					const key			= options.key
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
				// console.log("///// fn_click_tag_index options:",options);

				// options
					// const caller			= options.caller // not used
					// const text_editor	= options.text_editor // not used
					const tag				= options.tag // DOM tag element

				// fix selected tag element
					self.tag = tag

				return true
			}//end fn_create_fragment

		// text_selection_
			self.events_tokens.push(
				event_manager.subscribe('text_selection_'+ self.id, fn_show_button_create_fragment)
			)
			function fn_show_button_create_fragment(options) {
				// dd_console('--> show_button_create_fragment options', 'DEBUG', options)

				// options
					const selection	= options.selection
					const caller	= options.caller

				// short vars
					const key						= 0; // key (only one editor is available but component could support multiple)
					const current_text_editor		= self.text_editor[key]
					const component_container		= self.node.content_data[key]
					const button					= component_container.querySelector(".create_fragment") // could exists or not
					// console.log("selection.length:",selection.length);

				if (selection.length<1) {
					if (button) {
						button.remove()
					}
				}else{
					const last_tag_id	= self.get_last_tag_id('index', current_text_editor)
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

		// create_note_tag_
			self.events_tokens.push(
				event_manager.subscribe('create_note_tag_'+ self.id_base, self.create_note_tag)
			)

		// create_geo_tag_
			self.events_tokens.push(
				event_manager.subscribe('create_geo_tag_'+ self.id_base, self.create_geo_tag)
			)

	// call the generic method
		const common_init = component_common.prototype.init.call(self, options);

	// service_text_editor
		// self.service_text_editor	= service_tinymce
		self.service_text_editor	= service_ckeditor


	return common_init
}//end init



/**
* BUILD
* @return promise bool
* 	Resolve bool
*/
component_text_area.prototype.build = async function(options) {

	const self = this

	// call the generic common method
		const common_build = component_common.prototype.build.call(self, options);

	// auto_init_editor
		self.auto_init_editor = self.auto_init_editor!==undefined
			? self.auto_init_editor
			: self.context.properties && self.context.properties.auto_init_editor!==undefined
				? self.context.properties.auto_init_editor
				: false


	return common_build
}//end build



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
}//end tags_to_html



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
}//end set_value



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
		value	: (new_data.length>0) ? new_data : null
	})
	const js_promise = self.change_value({
		changed_data	: changed_data,
		refresh			: false
	})
	.then((save_response)=>{
		// event to update the dom elements of the instance
		// event_manager.publish('update_value_'+self.id, changed_data)

		// reset is_data_changed state
		self.is_data_changed = false
	})


	return js_promise
}//end save_value



/**
* SAVE_EDITOR
* Order text_editor[key] to save (only if state is dirty)
* @return bool result
*/
component_text_area.prototype.save_editor = function(key=0) {

	const self = this

	const text_editor = self.service_text_editor_instance[key]
	if (!text_editor) {
		console.error('Error on get text_editor from self.service_text_editor_instance: '.self.service_text_editor_instance)
		return false
	}

	const result = text_editor.save() // return bool

	return result
}//end save_editor



/**
* SAVE
* 	Alias of component_common.prototype.save with component specific added actions
* @param object changed_data
* 	{
* 		action : "update",
* 		key : 0,
* 		value : "XXX"
* 	}
* @return promise save_promise
*/
component_text_area.prototype.save = async function(changed_data = undefined) {

	// change data could be sent by the caller, if not is sent use the change_value that will be set by the change event
	const safe_changed_data = changed_data
		? changed_data
		: self.change_value.changed_data

	// call the generic common tool init
		const save_promise = component_common.prototype.save.call(this, safe_changed_data);


	return save_promise
}//end save



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

			const ar_svg_used_tag_id = [] // for re-numerate on the fly

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

		// remove spacial bogus elements (<br data-mce-bogus="1">)
			const bogus_elements		= cloned_text.querySelectorAll('[data-mce-bogus="1"]')
			const bogus_elements_len	= bogus_elements.length
			for (let i = bogus_elements_len - 1; i >= 0; i--) {
				bogus_elements[i].remove()
			}

		//remove <br> and change for <p> </p>
			const string_text = cloned_text.innerHTML
			const reg_ex = /(<\/? ?br>)/gmi;
			const clean_text_value	= string_text.replace(reg_ex,'</p><p>')
			// const new_div			= document.createElement("div")
			// new_div.innerHTML		= clean_text_value

	if(SHOW_DEBUG===true) {
		//const end  	= new Date().getTime()
		//const time 	= end - start
		//console.log("[component_text_area.preprocess_text_to_save] exec in ms:",time);
		//console.log("[component_text_area.render_all_tags] time: " +time+ " ms")
	}

	return clean_text_value
}//end preprocess_text_to_save



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
}//end unwrap_element



/**
* UPDATE_TAG
* Edit selected tag adding or modifing the dataset and image url
* This method has been unified to allow to use different services in the same way
* @param object options
* @return promise
* 	resolve bool (Unified component_text_area change-tag method. This method has been unified to allow to use different services in the same way (service_ckeditor, service_tinymce))
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
		const new_data_obj	= options.new_data_obj
		const key			= options.key || 0
		// const save		= options.save || false  (Unified component_text_area change-tag method. This method has been unified to allow to use different services in the same way (service_ckeditor, service_tinymce))

	// ar_type. Could be one like ['tc'] or a pair like ['indeIn','indexOut']
		const ar_type = (type.indexOf('In')!==-1 || type.indexOf('Out')!==-1)
			? (()=>{
				const type_in = (type.indexOf('Out')!==-1)
					? type.replace('Out', 'In')
					: type
				const type_out = (type.indexOf('In')!==-1)
					? type.replace('In', 'Out')
					: type
				return [type_in, type_out]
			  })()
			: [type]

	// trigger service action
		const update_options = {
			type			: ar_type, // string|array
			tag_id			: tag_id, // int
			new_data_obj	: new_data_obj // object
		}
		// result is a promise resolve bool
		const result = self.service_text_editor_instance[key].update_tag(update_options)


	return result
}//end update_tag



/**
* BUILD_DATA_TAG
* Unified way of create Dedalo internal custom tags from javascript
* i.e. '[index-d-7--data::data][/index-d-7--data::data]'
* @return string tag
*/
component_text_area.prototype.build_data_tag = function(type, tag_id, state, label, data) {

	const self = this

	// check tag type
		const valid_types = ["indexIn","indexOut","tc","tc2","svg","draw","geo","page","person","note","lang","referenceIn","referenceOut"]
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

	// data
		const data_string = data
			? 'data:' + data + ':data'
			: 'data::data'

	// dedalo_tag
		const dedalo_tag = (type==="tc")
			? tag_id
			: bracket_in + type_name + "-" + state + "-" + tag_id + "-" + safe_label + "-" + data_string + ']'

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("[component_text_area.build_data_tag] dedalo_tag:", dedalo_tag)
		}


	return dedalo_tag
}//end build_data_tag




/**
* BUILD_VIEW_TAG_OBJ
* Create a view object from tag info (type, state, label, data, id)
* @param object data_tag
* @param int tag_id
* @return object view_tag_obj
*/
component_text_area.prototype.build_view_tag_obj = function(data_tag, tag_id) {

	const self = this

	const type			= data_tag.type
	const state			= data_tag.state
	const label			= data_tag.label
	// convert the data_tag to string to be used it in html
	// const data_string	= JSON.stringify(data_tag.data)
	// replace the " to ' to be compatible with the dataset of html5, the tag strore his data ref inside the data-data html
	// json use " but it's not compatible with the data-data storage in html5
	// const data			= data_string.replace(/"/g, '\'')
	const data = data_tag.data
		? self.tag_data_object_to_string(data_tag.data)
		: null

	const images_factory_url = "../component_text_area/tag/?id="

	// Bracket_in is different for close tag
	const bracket_in = (type.indexOf("Out")!==-1)
		? "[/"
		: "["

	// Removes sufixes 'In' and 'Out'
	const type_name = type.replace(/In|Out/, '');

	const src = (type==='tc')
		? images_factory_url  + "[TC_" + tag_id + "_TC]"
		: images_factory_url  + bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "]"

	const id = (type==='tc')
		? tag_id
		: bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "]"

	const class_name = (type==='tc')
		? type
		: type_name

	const view_tag_obj ={
		src			: src,
		id			: id,
		class_name	: class_name,
		// dataset
		type		: type,
		tag_id		: (type==='tc') ? "[TC_" + tag_id + "_TC]" : String(tag_id),
		state		: (type==='tc') ? 'n': state,
		label		: (type==='tc') ? tag_id : label,
		data		: (type==='tc') ? tag_id : data
	}

	return view_tag_obj
}//end build_view_tag_obj



/**
* TAG_DATA_OBJECT_TO_STRING
* @return string data_string
*/
component_text_area.prototype.tag_data_object_to_string = function(data) {

	// check valid object
		if (typeof data!=='object') {
			console.log('Error. data must be type object. Current type:', typeof data);
			return null
		}

	// convert the data_tag to string to be used it in html
	// replace the " to ' to be compatible with the dataset of html5, the tag strore his data ref inside the data-data html
	// json use " but it's not compatible with the data-data storage in html5
		const data_string = JSON.stringify(data).replace(/"/g, '\'')


	return data_string
}//end tag_data_object_to_string



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
component_text_area.prototype.get_last_tag_id = function(tag_type, text_editor) {

	const self = this

	const last_tag_id = text_editor.get_last_tag_id({tag_type:tag_type})

	return last_tag_id
}//end get_last_tag_id



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
		const last_tag_index_id = self.get_last_tag_id('index', text_editor)

	// create new string wrapping selection with new tags
		// tag state. Default is 'n' (normal)
			const tag_state = 'n';

		// tag_id. Last id plus one
			const tag_id = parseInt(last_tag_index_id) + 1

		// tag images
			const image_in  = self.build_view_tag_obj({
				type	: "indexIn",
				state	: tag_state,
				label	: "label in " + tag_id,
				data	: ""
			}, tag_id)
			const image_out  = self.build_view_tag_obj({
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
}//end create_fragment



/**
* DELETE_TAG
* @param string tag_id
* 	e.g. '2'
* @param string type
* 	e.g. 'index'
* @return promise
* 	resolve object response
*/
component_text_area.prototype.delete_tag = function(tag_id, type, key=0) {

	const self = this

	return new Promise(function(resolve){

		data_manager.request({
			body : {
				action	: "delete_tag",
				dd_api	: 'dd_'+self.model+'_api', // component_text_area
				source	: {
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					tipo			: self.tipo,
					lang			: self.lang,
					tag_id			: tag_id, // string current selected tag (passed as param)
					type			: type // string current selected tag type (passed as param)
				}
			}
		})
		.then(async function(api_response){

			if (api_response.result!==false) {

				// delete editor tags
				await self.text_editor[key].delete_tag({
					type	: type==='index' ? ['indexIn','indexOut']: type,
					tag_id	: tag_id
				})
			}

			resolve(api_response)
		})
	})
}//end delete_tag



/*	Persons
----------------------------------------------------------------------------------------- */



/*	Notes
----------------------------------------------------------------------------------------- */

	/**
	* CREATE_NEW_NOTE
	* Build a new annotation when user clicks on text editor button
	* @param object options
	* @return string|null note_section_id
	*/
	component_text_area.prototype.create_note_tag = async function(options) {

		const self = this

		// options
			const text_editor = options.text_editor // get the text_editor sent by the event (button_note event)

		// short vars
			const notes_section_tipo = self.context.notes_section_tipo

		// Create the new note in the server, it will send the section_id created in the database
			const rqo = {
				action	: 'create',
				source	: {
					section_tipo : notes_section_tipo
				}
			}
			const api_response = await data_manager.request({
				body:rqo
			})
			const note_section_id = api_response.result || null;


		return note_section_id;
	}//end create_new_note




/*	Geo location
----------------------------------------------------------------------------------------- */

	/**
	* CREATE_GEO_TAG
	* Build a new annotation when user clicks on text editor button
	*
	* @return
	*/
	component_text_area.prototype.create_geo_tag = function(options) {

		const self = options.caller
		// get the text_editor sent by the event (button_note event)
		const text_editor = options.text_editor

		// last_tag_id. Find last geo and returns id or 0
		const last_tag_index_id = self.get_last_tag_id('geo', text_editor)

		// tag_id. Last id plus one
			const tag_id = parseInt(last_tag_index_id) + 1

		// create new string wrapping selection with new tags
		// tag state. Default is 'n' (normal)
			const tag_state = 'n';

		// tag images
			const geo_view_tag  = self.build_view_tag_obj({
				type	: "geo",
				state	: tag_state,
				label	: tag_id,
				data	: ""
			}, tag_id)

		// const tag = self.build_view_tag_obj(geo_view_tag, tag_id)
		// insert the new note tag in the caret position of the text_editor
		const inserted_tag = text_editor.set_content(geo_view_tag)

	}
