// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, JSONEditor */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {change_handler} from './component_json.js'



/**
* VIEW_DEFAULT_EDIT_JSON
* Manage the components logic and appearance in client side
*/
export const view_default_edit_json = function() {

	return true
}//end view_default_edit_json



/**
* RENDER
* Render node for use in edit
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_json.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper_options = {
			content_data	: content_data,
			buttons			: buttons
		}
		if (self.view==='line') {
			wrapper_options.label = null // prevent to create label
		}
		const wrapper = ui.component.build_wrapper_edit(self, wrapper_options)
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const value = self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value || []
		const value_length	= inputs_value.length || 1
		if (value_length>1) {
			console.warn('More than one value in component_json is not allowed at now. Ignored next values. N values: ', value_length);
		}
		for (let i = 0; i < value_length; i++) {
			const content_value_node = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value_node)
			// set pointers
			content_data[i] = content_value_node
			break; // only one is used for the time being
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Render JSON editor for current value
* @param int key
* @param mixed current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (key, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// load_editor and init
		async function load_editor() {

			// load editor files (JS/CSS)
			self.load_editor_files()
			.then(()=>{

				// button_save
					const button_save = ui.create_dom_element({
						element_type	: 'button',
						class_name		: 'warning save button_save',
						inner_html		: get_label.save || 'Save',
						parent			: content_value
					})
					button_save.addEventListener('click', fn_save)
					function fn_save(e) {
						e.stopPropagation()

						self.save_sequence(editor)
						.then(function(){
							editor.frame.classList.remove('isDirty')
						})
					}//end fn_save

				// validated. Changed to false after init parse
				let is_first_validation = true

				// editor_options
					const editor_options = {
						mode		: 'code',
						modes		: ['code', 'form', 'text', 'tree', 'view'], // allowed modes
						// maxLines : 100, // Infinity,
						onError : function (err) {
							console.error('JSON editor error:', err);
							alert(err.toString());
						},
						onValidate : function(json) {

							// ignore first validation (when editor value is parsed on init)
							if (is_first_validation===true) {
								// next event will be already useful
								is_first_validation = false
								return
							}

							change_handler(self, json, key)
						}
					}

				// create a new instance of the editor when DOM element is ready
					const editor = new JSONEditor(
						content_value,
						editor_options,
						current_value
					)
					self.editors.push(editor) // append current editor

					// add resize content_value event to allow user to resize the map
						new ResizeObserver( function(){
							setTimeout(function(){
								editor.resize();
							}, 3)
						})
						.observe( content_value )
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
}//end get_content_value



/**
* GET_CONTENT_VALUE_read
* Render JSON editor for current value
* @param int key
* @param mixed current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value_read = (key, current_value, self) => {

	const parsed_value = current_value
		? JSON.stringify(current_value, null, 2)
		: ''

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value read_only'
		})

	// value
		ui.create_dom_element({
			element_type	: 'pre',
			class_name		: 'value',
			inner_html		: parsed_value,
			parent			: content_value
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_download . Force automatic download of component data value
		const button_download = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button download',
			title			: get_label.download || 'Download data',
			parent			: fragment
		})
		button_download.addEventListener('click', function(e) {
			e.stopPropagation()
			const export_obj  = self.data.value[0]
			const export_name = self.id
			download_object_as_json(export_obj, export_name)
		})

	// button sample data
		if (self.context?.properties?.sample_data) {
			const button_sample_data = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button code',
				title			: get_label.add_sample_data || 'Add sample data',
				parent			: fragment
			})
			button_sample_data.addEventListener('click', function(e) {
				e.stopPropagation()
				// const export_obj  = self.data.value[0]
				if (self.data.value && self.data.value[0] && self.data.value[0].length) {
					if(!confirm("Current value is not empty. \nOverwrite actual value?")) {
						return
					}
				}
				const key = 0
				const sample_data = self.context.properties.sample_data
				self.editors[key].set(sample_data);
				console.log('self:', self);
			})
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){

			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			button_fullscreen.addEventListener('click', function(e) {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			})
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

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
* DOWNLOAD_OBJECT_AS_JSON
* Force automatic download of component data value
* @param object export_obj
* @param string export_name
* @return void
*/
const download_object_as_json = function(export_obj, export_name) {

    const data_str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(export_obj,undefined,2));

    const download_anchor_node = document.createElement('a');
    	  download_anchor_node.setAttribute("href",     data_str);
    	  download_anchor_node.setAttribute("download", export_name + ".json");

    document.body.appendChild(download_anchor_node); // required for firefox

    download_anchor_node.click();
    download_anchor_node.remove();
}//end download_object_as_json



// @license-end
