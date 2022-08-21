/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_EDIT_COMPONENT_JSON
* Manage the components logic and appearance in client side
*/
export const render_edit_component_json = function() {

	return true
}; //end render_edit_component_json



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_json.prototype.edit = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// fix non value scenarios
		self.data.value = (!self.data.value || self.data.value.length<1)
			? [null]
			: self.data.value

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	const value = self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add('nowrap')

	// values (inputs)
		const inputs_value	= value
		const value_length	= inputs_value.length
		if (value_length>1) {
			console.warn("More than one value in component_json is not allowed at now. Ignored next values. N values: ",value_length);
		}
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
			break; // only one is used for the time being
		}


	return content_data
}//end get_content_data_edit



/**
* GET_content_value
* @return DOM node content_value
*/
const get_content_value = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// load_editor and init
		async function load_editor() {

			// validated. Changed to false on editor.onValidationError
			let validated = true

			// load editor files (js/css)
			self.load_editor_files()
			.then(()=>{

				// button_save
					const button_save = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'primary save button_save',
						inner_html		: get_label.salvar || 'Save',
						parent			: content_value
					})
					button_save.addEventListener('click', function(e) {
						e.stopPropagation()

						self.save_sequence(editor)
						.then(function(){

							on_change(self, editor)

							editor.frame.classList.remove('isDirty')
							button_save.classList.remove('warning')
						})
					})

				// editor_options
					const editor_options = {
						mode		: 'code',
						modes		: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
						// maxLines : 100, // Infinity,
						onError : function (err) {
							console.error('err:',err);
							alert(err.toString());
						},
						onValidationError : function() {
							validated = false
						},
						onChange : function(json) {
							if (editor) {
								on_change(self, editor)
							}else{
								console.error('Error. editor is not available!:');
							}
						},
						onValidate : function() {
							validated = true

					       //var json = editor.get();
					       // Update hidden text area value
					       //editor_text_area.value = editor.getText()

							// const json = editor.get();
							//      	console.log("json:",json);
							//      	//console.log("json editor.get():",editor.get());
							//      	console.log("text editor.getText():",editor.getText());

							// const changed_data = Object.freeze({
							// 	action	: 'update',
							// 	key		: 0,
							// 	value	: editor.get()
							// })
							// self.change_value({
							// 	changed_data : changed_data,
							// 	refresh 	 : false
							// })
							// .then((save_response)=>{
							// 	// event to update the dom elements of the instance
							// 	event_manager.publish('update_value_'+self.id, changed_data)
							// })
						},
						onBlur : function() {
						    // 	console.log('content changed:', this);
						    // 	alert("content changed");
						}
					}

				// create a new instace of the editor when DOM element is ready
					// event_manager.when_in_dom(li, function(){
					// 	console.log("container in DOM:",li);
					// })
					const editor = new JSONEditor(
						content_value,
						editor_options,
						current_value
					)
					self.editors.push(editor) // append current editor
			})

			// blur event
				// const ace_editor = editor.aceEditor
				// ace_editor.on("blur", function(e){
				// 	e.stopPropagation()
				//
				// 	const db_value 		= typeof self.data.value[0]!=="undefined" ? self.data.value[0] : null
				// 	const edited_value 	= editor.get()
				// 	const changed 		= JSON.stringify(db_value)!==JSON.stringify(edited_value)
				// 	if (!changed) {
				// 		return false
				// 	}
				//
				// 	if (confirm("Save json data changes?")) {
				// 		button_save.click()
				// 	}
				// })

			return true
		}//end load_editor

	// observe in viewport
		const observer = new IntersectionObserver(function(entries) {
			const entry = entries[1] || entries[0]
			if (entry.isIntersecting===true || entry.intersectionRatio > 0) {
				observer.disconnect();
				load_editor()
			}
		}, { threshold: [0] });
		observer.observe(content_value);


	return content_value
}; //end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// button_fullscreen
		const button_fullscreen = ui.create_dom_element({
			element_type : 'span',
			class_name	 : 'button full_screen',
			parent 		 : fragment
		})
		button_fullscreen.addEventListener("click", function() {
			// li.classList.toggle("fullscreen")
			self.node.classList.toggle("fullscreen")
		})

	// button_download . Force automatic download of component data value
		const button_download = ui.create_dom_element({
			element_type : 'span',
			class_name	 : 'button download',
			title 		 : "Download data",
			parent 		 : fragment
		})
		button_download.addEventListener("click", function() {
			const export_obj  = self.data.value[0]
			const export_name = self.id
			download_object_as_json(export_obj, export_name)
		})

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* ON_CHANGE
*/
export const on_change = function(self, editor) {

	const editor_wrapper	= editor.frame
	const button_save		= editor_wrapper.previousElementSibling
	const db_value			= typeof self.data.value[0]!=="undefined" ? self.data.value[0] : null

	button_save.classList.add("warning")
	editor_wrapper.classList.add("isDirty")

	try {
		const edited_value 	= editor.get()

		if (typeof edited_value!=="undefined") {

			const changed = JSON.stringify(db_value)!==JSON.stringify(edited_value)
			if (changed) {

				editor_wrapper.classList.add("isDirty")
				button_save.classList.add("warning")

				// set_before_unload (bool) add
					set_before_unload(true)
			}else{

				if (editor_wrapper.classList.contains("isDirty")) {
					editor_wrapper.classList.remove("isDirty")
					button_save.classList.remove("warning")
				}

				// set_before_unload (bool) remove
					set_before_unload(false)
			}
		}

	}catch(error){
		// console.log("error:",error);
		editor_wrapper.classList.add("isDirty")
	}


	return true
}//end on_change



/**
* DOWNLOAD_OBJECT_AS_JSON
* Force automatic download of component data value
*/
const download_object_as_json = function(export_obj, export_name){

    const data_str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(export_obj,undefined,2));

    const download_anchor_node = document.createElement('a');
    	  download_anchor_node.setAttribute("href",     data_str);
    	  download_anchor_node.setAttribute("download", export_name + ".json");

    document.body.appendChild(download_anchor_node); // required for firefox

    download_anchor_node.click();
    download_anchor_node.remove();

    return true
}//end download_object_as_json
