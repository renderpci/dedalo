/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_text_area} from '../../component_text_area/js/render_component_text_area.js'
	import {tr} from '../../component_text_area/js/tr.js'
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

		this.services = []

	return true
}//end component_text_area



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_text_area.prototype.init 	 		= component_common.prototype.init
	component_text_area.prototype.build 		= component_common.prototype.build
	component_text_area.prototype.render 		= common.prototype.render
	component_text_area.prototype.refresh 		= common.prototype.refresh
	component_text_area.prototype.destroy 		= common.prototype.destroy

	// change data
	component_text_area.prototype.save 	 			= component_common.prototype.save
	component_text_area.prototype.change_value 		= component_common.prototype.change_value
	component_text_area.prototype.update_data_value	= component_common.prototype.update_data_value
	component_text_area.prototype.update_datum 		= component_common.prototype.update_datum

	// render
	component_text_area.prototype.list 			= render_component_text_area.prototype.list
	component_text_area.prototype.edit 			= render_component_text_area.prototype.edit
	component_text_area.prototype.edit_in_list	= render_component_text_area.prototype.edit
	component_text_area.prototype.tm 			= render_component_text_area.prototype.edit // time machine render alias of edit
	component_text_area.prototype.search 		= render_component_text_area.prototype.search
	component_text_area.prototype.change_mode 	= component_common.prototype.change_mode



/**
* TAGS_TO_HTML
*/
component_text_area.prototype.tags_to_html = function(value) {

	const html = (value)
		? tr.add_tag_img_on_the_fly(value)
		: null

	return html
}// end


/**
* SET_VALUE
* Set individual value based on element key
* @param int key
*	defined in container dataset key
* @param string value
*	value from active text editor
*/
component_text_area.prototype.set_value = async function(value) {
	
	const self = this

	const changed_data =  Object.freeze({
		action	: 'update',
		key		: value.key,
		value	: value.value
	})
	self.change_value({
		changed_data : changed_data,
		refresh 	 : true
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
component_text_area.prototype.save_value = async function(key, value) {

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
	self.change_value({
		changed_data : changed_data,
		refresh 	 : false
	})
	.then((save_response)=>{
		// event to update the dom elements of the instance
		event_manager.publish('update_value_'+self.id, changed_data)
	})

	return true
}//end save_value



/**
* PREPROCESS_TEXT_TO_SAVE
* Replace <section> tags to internal Dédalo tags
* Unify text content format
* @return string
*/
component_text_area.prototype.preprocess_text_to_save = function(html_value) {

	const self = this

	const cloned_text = document.createElement('div')
	// cloned_text.innerHTML = html_value
	cloned_text.insertAdjacentHTML('afterbegin', html_value);

	//const start = new Date().getTime();

	// Clone to avoid affect existing DOM elements
	// const cloned_text = container.cloneNode(true)

	// SECTION TAGS (STRUCT)
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
				const tag_id 		= section_elements[i].dataset.tag_id
				const state 		= section_elements[i].dataset.state
				const label 		= section_elements[i].dataset.label
				const data 		= section_elements[i].dataset.data
				// Compose Dédalo tags
				const tag_in  	= self.build_data_tag('structIn', tag_id, state, label, data)
				const tag_out 	= self.build_data_tag('structOut', tag_id, state, label, data)
				const final_string= tag_in + section_elements[i].innerHTML + tag_out

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


	// REFERENCE TAGS
		// Iterate all reference elements
		const reference_elements = cloned_text.getElementsByTagName('reference')
		if (reference_elements) {
			//console.log(reference_elements)
			const reference_elements_len = reference_elements.length
			for (let i = reference_elements_len - 1; i >= 0; i--) {
				// Convert section tags to dedalo internal labels
				// <reference class="reference_struct text_unselectable" id="reference_2" data-state="n" data-label="" data-data="{'reference_tipo':'rsc370','reference_id':'3'}">..</reference>
				// [reference-a-1-1-data:{'reference_tipo':'rsc370','reference_id':'3'}:data]...[/reference-a-1-1-data:{'reference_tipo':'rsc370','reference_id':'3'}:data]
				const tag_id 		= reference_elements[i].dataset.tag_id
				const state 		= reference_elements[i].dataset.state
				const label 		= reference_elements[i].dataset.label
				const data 		= reference_elements[i].dataset.data
				// Compose Dédalo tags
				const tag_in  	= self.build_data_tag('referenceIn', tag_id, state, label, data)
				const tag_out 	= self.build_data_tag('referenceOut', tag_id, state, label, data)
				const final_string= tag_in + reference_elements[i].innerHTML + tag_out

				// Replaces tag content string with new created
				reference_elements[i].innerHTML = final_string

				// Unwrap section tag node (removes tags and leaves only contents)
				unwrap_element(reference_elements[i]);
			}//end for (var i = len - 1; i >= 0; i--) {
		}//end reference_elements

	// IMG TAGS (INDEX,TC,SVG,GEO,PERSON,ETC.)
		//const image_elements = cloned_text.getElementsByTagName('img')
		const image_elements = cloned_text.querySelectorAll('img') // ! use querySelectorAll to avoid loop problems on i++
		if (image_elements) {
			const ar_svg_used_tag_id = []
			const image_elements_len = image_elements.length

			//for (let i = image_elements_len - 1; i >= 0; i--) {
			for (let i = 0; i < image_elements_len; i++) {

				const current_element = image_elements[i]

				//console.log("image_elements[i]:",i,image_elements[i].dataset.tag_id,parseInt(image_elements[i].dataset.tag_id));
				let current_tag_id = current_element.dataset.tag_id

				// SVG . Keep current svg tag_id for renumerate on the fly
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

				// Build dedalo tag from node image dataset	info
				const final_string = self.build_data_tag(current_element.dataset.type, current_tag_id, current_element.dataset.state, current_element.dataset.label, current_element.dataset.data)

				if (final_string) {
					// Replaces tag content string with new created
					current_element.innerHTML = final_string
					// Unwrap section tag node (removes tags and leaves only contents)
					unwrap_element(current_element)
				}
			}
		}//end if (image_elements)


	let temp_elements = []

	// REMOVE TEMPORAL ELEMENTS
	temp_elements = cloned_text.getElementsByTagName('h2')
	const h2_len = temp_elements.length
		for (let i = h2_len - 1; i >= 0; i--) {
			temp_elements[i].remove()
		}

	// REMOVE TEMPORAL HEADER (TOC)
	temp_elements = cloned_text.getElementsByTagName('header')
	const header_len = temp_elements.length
		for (let i = header_len - 1; i >= 0; i--) {
			temp_elements[i].remove()
		}

	// REMOVE FAKE CARET
	temp_elements = cloned_text.getElementsByTagName('caret')
	const caret_len = temp_elements.length
		for (let i = caret_len - 1; i >= 0; i--) {
			temp_elements[i].remove()
		}

	// REMOVE <p> (And change </p> by <br>)
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
}//end preprocess_text_to_save



/**
* UNWRAP_ELEMENT
* @return
*/
const unwrap_element = function(el) {
	// get the element's parent node
	const parent = el.parentNode;

	// move all children out of the element
	while (el.firstChild) parent.insertBefore(el.firstChild, el);

	// remove the empty element
	parent.removeChild(el);
}//end unwrap_element



/**
* IS_TINY
* @return bool
*/
const is_tiny = function(ed) {

	const is_tiny = (ed===null || typeof ed!=='object' || ed.type!=='setupeditor')
		? false // USING DIV AS EDITOR (LIKE STRUCT)
		: true  // USING TINYMCE EDITOR

	return is_tiny
}//end is_tiny



/**
* UPDATE_TAG
* Edit selected tag and add or modify datasets
*/
component_text_area.prototype.update_tag = function(options) {

	const self = this


	if (typeof options == "undefined") {
		alert("Please select tag");
		console.error("[component_text_area.update_tag] ERROR. Stopped update_tag. Empty options:", options);
		console.trace();
		return false
	}

	const type 			= options.type
	const tag_id 		= options.tag_id
	const new_data_obj 	= options.dataset
	const save 			= options.save || false

	const wrapper 	= self.node[0]

	const textarea 	= wrapper.querySelector('textarea')

	const container = (textarea)
		? tinymce.get(textarea.id) // ED container
		: wrapper.getElementsByClassName('text_area_tool_structuration')[0] // Struct container

	// DOM Selection pattern
		const selection_pattern = (type.indexOf('In')!==-1 || type.indexOf('Out')!==-1)
			? '[data-type^="' + type.replace(/In|Out/, '') + '"][data-tag_id="'+tag_id+'"]'
			: '[data-type="'+type+'"][data-tag_id="'+tag_id+'"]'


	const ed_is_tiny = is_tiny(container)

	const update_tag_state = (current_elements, new_data_obj)=>{
		// Iterate and update tag state
		const len = current_elements.length
		for (let i = len - 1; i >= 0; i--) {
			// Set new state to dataset of each dataset
			for (let key in new_data_obj) {
				current_elements[i].dataset[key] = new_data_obj[key]
			}
		}
	}

	// Select current tag in dom
	if (ed_is_tiny===true) {
		// tinyMCE editor
		const ed = container
		const tiny_current_elements = ed.dom.select(selection_pattern)
		if (!tiny_current_elements.length) {
			alert("[component_text_area.update_tag] Error on dom select (tinymce) tag to update_tag tag_id:" +tag_id + " type:" + type)
			return false;
		}
		update_tag_state(tiny_current_elements, new_data_obj)

		ed.focus();
		// Force ed dirty state
		ed.setDirty(true);	 // Force dirty state

		if (typeof save!=="undefined" && save===true) {

			const key 	= 0 // fixed unique key 0
			const value = ed.getContent({format:'raw'})

			// Save modified content
			self.save_value(key, value)

		}
	}else{
		// Standard dom container content editable
		const current_elements = container.querySelectorAll(selection_pattern)
		if (!current_elements.length) {
			alert("[component_text_area.update_tag] Error on dom select (textpreview) tag to update_tag tag_id:" +tag_id + " type:" + type)
			return false;
		}
		update_tag_state(current_elements, new_data_obj)

		if (typeof save!=="undefined" && save===true) {

			return tool_structuration.save_structuration_text()
		}
	}

	return true
}//end update_tag



/**
* BUILD_DATA_TAG
* Unified way of create dedalo custom tags from javascript
* @return string tag
*/
component_text_area.prototype.build_data_tag = function(type, tag_id, state, label, data) {

	const self = this

	const valid_types = ["indexIn","indexOut","structIn","structOut","tc","tc2","svg","draw","geo","page","person","note","referenceIn","referenceOut"]
		if (valid_types.includes(type)===false) {
			console.log("[build_data_tag] Invalid tag type:",type);
			alert("[build_data_tag] Invalid tag type: " + type)
			return false
		}

	// Bracket_in is different for close tag
	const bracket_in = (type.indexOf("Out")!==-1) ? "[/" : "["

	// Removes sufixes 'In' and 'Out'
	const type_name = type.replace(/In|Out/, '')

	// Label truncate and replace - avoid future errors
	if (typeof label === "undefined") {
		label = ''
	}else{
		label = label.substring(0,22)
		label.replace(new RegExp('-', 'g'), '_');
	}

	let dedalo_tag = null
	switch(type) {
		case "tc":
			dedalo_tag = tag_id
			break;
		default:
			dedalo_tag = bracket_in + type_name + "-" + state + "-" + tag_id + "-" + label + "-" + "data:" + data + ":data]"
	}
	console.log("dedalo_tag:",dedalo_tag);
	return dedalo_tag
}//end build_data_tag



/**
* GET_LAST_TAG_ID
* @param ed
*	Text editor instance (tinyMCE)
* @param tag_type
*	Class name of image searched like 'geo'
*/
component_text_area.prototype.get_last_tag_id = function(container, tag_type) {

	var ar_id_final = [0];

	switch(tag_type) {

		case 'struct':
			// SECTION : Select all sections in text
			var ar_struct_tags = container.getElementsByTagName('section')
				//console.log(ar_struct_tags)

			// ITERATE TO FIND TIPO_TAG
			var i_len = ar_struct_tags.length
			for (let i = i_len - 1; i >= 0; i--) {

				// current tag like [svg-n-1]
				var current_tag = ar_struct_tags[i].id;
				var ar_parts 	= current_tag.split('_');
				var number 	 	= parseInt(ar_parts[1]);

				// Insert id formated as number in final array
				ar_id_final.push(number)
			}
			break;

		case 'reference':
			// REFERENCE : Select all reference in text
			var ar_tags = container.getElementsByTagName('reference')
				//console.log(ar_tags)

			// ITERATE TO FIND TIPO_TAG
			var i_len = ar_tags.length
			for (let i = i_len - 1; i >= 0; i--) {

				// current tag like [svg-n-1]
				var current_tag = ar_tags[i].id;
				var ar_parts 	= current_tag.split('_');
				var number 	 	= parseInt(ar_parts[1]);

				// Insert id formated as number in final array
				ar_id_final.push(number)
			}
			break;

		default:
			// like img as id: [index-n-1--label-data:**]
				const ar_img = container.querySelectorAll('img.'+tag_type)

			// iterate to find tipo_tag (filter by classname: svg,etc.)
			var i_len = ar_img.length
			for (let i = i_len - 1; i >= 0; i--) {

				var number 		= 0;
				var current_tag = ar_img[i].id;
				var ar_parts 	= current_tag.split('-');
				var number 	 	= parseInt(ar_parts[2]);

				// Insert id formated as number in final array
				ar_id_final.push(number)
			}
			break;
	}

	// last id
		const last_tag_id = Math.max.apply(null, ar_id_final);
		if(SHOW_DEBUG===true) {
			// console.log("[component_text_area.get_last_tag_id] last_tag_id of type: " + tag_type +" -> ", last_tag_id )
		}


	return parseInt(last_tag_id);
}//end get_last_tag_id
